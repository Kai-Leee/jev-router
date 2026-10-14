import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, lstatSync, existsSync,
  openSync, closeSync, fsyncSync, rmSync} from 'node:fs';
import {resolve, join, relative, basename, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash, randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {prepareDecision, createJevClient} from '../client.mjs';
import {loadConfig} from '../config.mjs';
import {processResult} from './docker.mjs';
import {providerOutcome, writePrivateJson} from './runner.mjs';
import {claudeEnvironment} from './claude-env.mjs';
import {createMeasuredDecider, JEV_GET_RETRY_V1} from './telemetry.mjs';
import {createTokenBudget, validateBudgetConfig, readTokenBudgetSnapshot} from './budget.mjs';
import {acquireTokenBudget, createConcurrentTokenBudget} from './budget-acquire.mjs';
import {preflightDagRun, runDagDockerCheck, validateDagPublicReport} from './dag-runner.mjs';
import {loadPublicAuditInputs, publicSourceHashes} from '../../scripts/audit-dag-public-checks.mjs';
import {prepareAdaptiveCatalog} from '../orchestration/adaptive-dag-planner.mjs';
import {adaptiveOutcomeUncertain, adaptiveTerminalCause} from '../orchestration/adaptive-failure.mjs';
import {assessJevTokenAdmission} from '../orchestration/jev-token-admission.mjs';
import {assessJevTokenAdmission as assessJevTokenAdmissionV2} from '../orchestration/jev-token-admission-v2.mjs';
import {assessJevTokenAdmission as assessJevTokenAdmissionV3} from '../orchestration/jev-token-admission-v3.mjs';
import {assessJevTokenAdmission as assessJevTokenAdmissionV4} from '../orchestration/jev-token-admission-v4.mjs';
import {loadAdaptiveProfileContract, resolveAdaptiveProfile, selectAdaptiveProfiles,
  applyAdaptiveProfileSelections} from '../orchestration/adaptive-profile-selection.mjs';
import {assessJevTransmission, validateJevTransmissionBinding, validateJevRecoveryProof,
  JEV_TRANSMISSION_SOURCE_PATHS} from '../orchestration/jev-transmission-preflight.mjs';
import {isQuestionFormManifest, validateQuestionFormManifest, createQuestionFormHooks,
  QUESTION_FORM_SOURCES} from './adaptive-question-forms.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };
const sha = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = values => [...new Set(values)];
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const uncertain = value => value?.outcome_uncertain === true || value?.outcomeUncertain === true || value?.uncertain === true || ['unknown', 'uncertain'].includes(value?.status);
const codeOf = error => /^[A-Z0-9_]{1,100}$/.test(error?.code ?? error?.message ?? '') ? error.code ?? error.message : 'ADAPTIVE_RUN_FAILED';
const relativePath = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value) && !value.split('/').some(part => ['.', '..'].includes(part));
const speedManifest = manifest => manifest.schema_version === 'adaptive-dag-comparison/v11';
const transmissionManifest = manifest => speedManifest(manifest) || manifest.schema_version === 'adaptive-dag-comparison/v10';
const RUNTIME_SPEED_KEYS = ['budget_lock', 'model_lookup', 'public_check_concurrency', 'readiness_batch'];
/** v11 runtime speed options; every other manifest keeps the historical serial/per-call behavior. */
export const adaptiveRuntimeSpeed = manifest => speedManifest(manifest) || isQuestionFormManifest(manifest) ? {...manifest.runtime_speed}
  : {model_lookup: 'per_call', budget_lock: 'call', public_check_concurrency: 1, readiness_batch: false};
export const adaptiveSpeedSessionOptions = manifest => {
  const speed = adaptiveRuntimeSpeed(manifest);
  // v11/v12 sessions retry the inference-free GETs on a confirmed 429/5xx; older manifests keep a single attempt.
  return {modelLookup: speed.model_lookup, budgetLock: speed.budget_lock,
    ...(speedManifest(manifest) || isQuestionFormManifest(manifest) ? {getRetry: JEV_GET_RETRY_V1} : {})};
};
const REPAIR_BUDGET_CONTRACTS = {'repair-budget-v1': 'docs/orchestration/contracts/adaptive-repair-budget.v1.json',
  'repair-budget-v2': 'docs/orchestration/contracts/adaptive-repair-budget.v2.json',
  'repair-budget-v3': 'docs/orchestration/contracts/adaptive-repair-budget.v3.json'};
/** D076 opt-in owner-request budget (v11/v12 manifests with repair_budget only). */
export const adaptiveRepairBudgetOption = manifest => manifest.repair_budget ? {repairBudget: {policy: manifest.repair_budget.policy}} : {};
const REPAIR_FEEDBACK_VALUES = {read_scope: 'candidate-v1', worker_diagnostics: 'report-v1', scope_expansion: 'worker-mentioned-v1',
  owner_alternatives: 'owner-probability-v1', check_error_repair: 'generation-direct-v1'};
const CHECK_ERROR_DIAGNOSIS_SCRIPT = 'scripts/diagnose-check-error.py';
/** D076 opt-in repair feedback (v11/v12 manifests with repair_feedback only). */
export const adaptiveRepairFeedbackOption = manifest => manifest.repair_feedback ? {repairFeedback: {...manifest.repair_feedback}} : {};

/** Denied artifact reads and the final text of one worker stream; the text is the worker's unverified statement. */
export function adaptiveWorkerReport(streamText, completion) {
  const reads = new Map(), denied = new Set();
  for (const line of streamText.split('\n')) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const content = Array.isArray(event?.message?.content) ? event.message.content : [];
    for (const item of content) {
      if (item?.type === 'tool_use' && item.name === 'mcp__artifact_worker__read_file' && typeof item.input?.path === 'string') reads.set(item.id, item.input.path);
      if (item?.type === 'tool_result' && item.is_error && reads.has(item.tool_use_id)
        && JSON.stringify(item.content ?? '').includes('ARTIFACT_READ_NOT_ALLOWED')) denied.add(reads.get(item.tool_use_id));
    }
  }
  const text = typeof completion?.result === 'string' ? completion.result : '';
  return {denied_read_paths: [...denied].sort(), final_response: text.slice(0, 4000)};
}
const focusedOwnerManifest = manifest => transmissionManifest(manifest) || isQuestionFormManifest(manifest) || manifest.schema_version === 'adaptive-dag-comparison/v9';
const inferredManifest = manifest => focusedOwnerManifest(manifest) || manifest.schema_version === 'adaptive-dag-comparison/v8';
const OWNER_INFERENCE_V3 = 'docs/orchestration/contracts/adaptive-inferred-repair.v3.json';
// D081: a v12 manifest may opt into check-level error owner questions by binding the v3 owner contract.
const ownerV3Manifest = manifest => isQuestionFormManifest(manifest) && manifest.repair_policy?.owner_inference_contract === OWNER_INFERENCE_V3;
const inferredPolicy = manifest => ownerV3Manifest(manifest) ? 'inferred-v3' : focusedOwnerManifest(manifest) ? 'inferred-v2' : 'inferred-v1';
const causalManifest = manifest => inferredManifest(manifest) || manifest.schema_version === 'adaptive-dag-comparison/v7';
const profileOptions = manifest => ({...manifest.profile_policy,
  profilePolicy: inferredManifest(manifest) ? 'provider-limits-v2' : 'bounded-v1'});
const balancedManifest = manifest => causalManifest(manifest) || manifest.schema_version === 'adaptive-dag-comparison/v6';
const compactRepairManifest = manifest => causalManifest(manifest) || ['adaptive-dag-comparison/v5', 'adaptive-dag-comparison/v6'].includes(manifest.schema_version);
const artifactRepairManifest = manifest => causalManifest(manifest) || ['adaptive-dag-comparison/v4', 'adaptive-dag-comparison/v5', 'adaptive-dag-comparison/v6'].includes(manifest.schema_version);
const repairManifest = manifest => causalManifest(manifest) || ['adaptive-dag-comparison/v3', 'adaptive-dag-comparison/v4', 'adaptive-dag-comparison/v5', 'adaptive-dag-comparison/v6'].includes(manifest.schema_version);
const parallelManifest = manifest => causalManifest(manifest) || ['adaptive-dag-comparison/v2', 'adaptive-dag-comparison/v3', 'adaptive-dag-comparison/v4', 'adaptive-dag-comparison/v5', 'adaptive-dag-comparison/v6'].includes(manifest.schema_version);
const CATALOG_SYSTEM = 'Prepare the requested source-backed implementation catalog from the supplied public specification and requirement mapping. Output exactly the JSON schema. Do not use tools, prior implementations, hidden tests, worker groups or a task graph.';
const CATALOG_REUSE_MUTABLE_SOURCES = Object.freeze(['src/benchmark/adaptive-dag-runner.mjs', 'scripts/adaptive-dag-comparison.mjs',
  'src/benchmark/budget.mjs', 'src/benchmark/budget-acquire.mjs', 'src/benchmark/dag-runner.mjs']);
const REPAIR_REUSE_MUTABLE_SOURCES = Object.freeze([...CATALOG_REUSE_MUTABLE_SOURCES,
  'src/orchestration/adaptive-dag-planner.mjs', 'src/orchestration/adaptive-dag-execution.mjs']);
const ARTIFACT_REUSE_MUTABLE_SOURCES = Object.freeze([...REPAIR_REUSE_MUTABLE_SOURCES,
  'scripts/audit-dag-public-checks.mjs', 'benchmarks/e2e-swe/public-checks/run_public_checks.py',
  'benchmarks/e2e-swe/public-checks/extensions/cli_config.py']);
const CAUSAL_REUSE_MUTABLE_SOURCES = Object.freeze([...ARTIFACT_REUSE_MUTABLE_SOURCES,
  'src/orchestration/artifact-transport.mjs', 'src/orchestration/adaptive-failure.mjs']);
// v11 also changed telemetry.mjs (session model cache, async ledger operations); earlier manifests keep their lists.
const SPEED_REUSE_MUTABLE_SOURCES = Object.freeze([...CAUSAL_REUSE_MUTABLE_SOURCES, 'src/benchmark/telemetry.mjs']);
const reuseMutableSources = manifest => speedManifest(manifest) || isQuestionFormManifest(manifest) ? SPEED_REUSE_MUTABLE_SOURCES
  : causalManifest(manifest) ? CAUSAL_REUSE_MUTABLE_SOURCES : artifactRepairManifest(manifest) ? ARTIFACT_REUSE_MUTABLE_SOURCES
  : repairManifest(manifest) ? REPAIR_REUSE_MUTABLE_SOURCES : CATALOG_REUSE_MUTABLE_SOURCES;
const REPAIR_SOURCE_PATHS = Object.freeze(['src/orchestration/adaptive-repair-projection.mjs',
  'src/orchestration/adaptive-repair-scope.mjs', 'docs/orchestration/contracts/adaptive-repair-projection.v1.json']);
export const ADAPTIVE_ARMS = Object.freeze({claude_all: {split: 'claude', relations: 'claude', repair: 'claude'},
  jev_split: {split: 'jev', relations: 'claude', repair: 'claude'},
  jev_split_relations: {split: 'jev', relations: 'jev', repair: 'claude'}, jev_all: {split: 'jev', relations: 'jev', repair: 'jev'},
  jev_profile: {split: 'jev', relations: 'jev', repair: 'jev', profiles: 'jev'}});

export function loadAdaptiveRunManifest(path = join(ROOT, 'benchmarks/e2e-swe/manifests/d066-adaptive.json'), rootDir = ROOT) {
  const value = read(path), limits = value.limits;
  const v8 = inferredManifest(value), v9 = focusedOwnerManifest(value), v10 = transmissionManifest(value), v11 = speedManifest(value),
    v12 = isQuestionFormManifest(value);
  const fixed = {max_units: 30, max_artifacts: 60, max_files: 60, max_leaves: 30, max_depth: 3, max_nodes: 59,
    max_relation_pairs: 435, max_decisions: 128, relation_batch_size: 32, max_request_bytes: v8 ? 256000 : 240000,
    max_concurrency: 2, maximum_workers: 30, minimum_workers: 2, wall_timeout_seconds: 14400};
  const v2 = parallelManifest(value), v3 = repairManifest(value), v4 = artifactRepairManifest(value), v5 = compactRepairManifest(value), v6 = balancedManifest(value), v7 = causalManifest(value), reuse = value.catalog_reuse;
  if (!['adaptive-dag-comparison/v1', 'adaptive-dag-comparison/v2', 'adaptive-dag-comparison/v3', 'adaptive-dag-comparison/v4', 'adaptive-dag-comparison/v5', 'adaptive-dag-comparison/v6', 'adaptive-dag-comparison/v7', 'adaptive-dag-comparison/v8', 'adaptive-dag-comparison/v9', 'adaptive-dag-comparison/v10', 'adaptive-dag-comparison/v11', 'adaptive-dag-comparison/v12'].includes(value.schema_version)
      || !equal(value.arms, v8 ? ['jev_profile'] : v7 ? ['claude_all', 'jev_all', 'jev_profile'] : v3 ? ['jev_all'] : Object.keys(ADAPTIVE_ARMS).filter(arm => arm !== 'jev_profile'))
      || value.worker_profile?.model !== 'claude-opus-5-5' || value.worker_profile?.effort !== 'medium'
      || Object.entries(fixed).some(([key, expected]) => limits?.[key] !== expected)
      || limits?.planning_input_tokens !== (v2 ? null : 700000)
      || (v2 && (value.cohort_concurrency !== (v8 ? 1 : v7 ? 3 : v3 ? 1 : 4) || value.jev_budget?.schema_version !== (v11 || v12 ? 'jev-token-budget/v4' : 'jev-token-budget/v3')
        || value.jev_budget.max_input_tokens !== null || reuse?.schema_version !== (v7 ? 'adaptive-catalog-reuse/v4' : v4 ? 'adaptive-catalog-reuse/v3' : v3 ? 'adaptive-catalog-reuse/v2' : 'adaptive-catalog-reuse/v1')
        || !relativePath(reuse.preparation_directory) || !relativePath(reuse.original_manifest)
        || !['result_sha256', 'catalog_file_sha256', 'source_pins_sha256', 'prepared_request_sha256', 'provider_request_sha256', 'original_manifest_sha256']
          .every(key => /^[a-f0-9]{64}$/.test(reuse[key] ?? ''))
        || !equal(reuse.allowed_changed_source_paths, reuseMutableSources(value))))
      || (v3 && !v4 && !equal(value.repair_policy, {projection_contract: 'docs/orchestration/contracts/adaptive-repair-projection.v1.json',
        failure_contract: 'adaptive-terminal-cause/v1', scope_contract: 'observed-failure-and-bound-blocker/v1'}))
      || (v4 && !v7 && !equal(value.repair_policy, {artifact_contract: `docs/orchestration/contracts/adaptive-artifact-repair.${v5 ? 'v2' : 'v1'}.json`,
        assertion_contract: 'benchmarks/e2e-swe/public-checks/assertions.json',
        failure_contract: 'adaptive-terminal-cause/v1', scope_contract: 'assertion-artifact-v1',
        token_admission_contract: `docs/orchestration/contracts/jev-token-admission.${v5 ? 'v2' : 'v1'}.json`}))
      || (v7 && (!equal(value.repair_policy, {artifact_contract: 'docs/orchestration/contracts/adaptive-causal-repair.v1.json',
        assertion_contract: 'benchmarks/e2e-swe/public-checks/assertions.v2.json', failure_contract: 'adaptive-terminal-cause/v1',
        scope_contract: ownerV3Manifest(value) ? 'public-inferred-owner-v3' : v9 ? 'public-inferred-owner-v2' : v8 ? 'public-inferred-owner-v1' : 'public-causal-v1',
        token_admission_contract: `docs/orchestration/contracts/jev-token-admission.${v8 ? 'v4' : 'v3'}.json`,
        ...(v8 ? {owner_inference_contract: ownerV3Manifest(value) ? OWNER_INFERENCE_V3 : `docs/orchestration/contracts/adaptive-inferred-repair.${v9 ? 'v2' : 'v1'}.json`} : {})})
        || value.public_registry !== 'benchmarks/e2e-swe/public-checks/registry.v4.json'
        || value.public_runner !== 'benchmarks/e2e-swe/public-checks/run_public_checks_v4.py'
        || !relativePath(value.public_controls_evidence)
        || value.profile_policy?.contract !== `docs/orchestration/contracts/adaptive-profile-selection.${v8 ? 'v2' : 'v1'}.json`
        || value.profile_policy?.candidate_contract !== 'docs/orchestration/contracts/adaptive-profiles.v1.json'
        || value.profile_policy?.phase_policy !== 'initial_and_selected_repairs'
        || !relativePath(value.profile_policy?.account_probe)
        || !/^[a-f0-9]{64}$/.test(value.profile_policy?.account_probe_sha256 ?? '')))
      || (v12 ? false : v6 ? !equal(value.decomposition_policy, {id: 'balanced-v2', contract: 'docs/orchestration/contracts/adaptive-decomposition.v2.json'})
        : value.decomposition_policy !== undefined)
      || value.max_repair_rounds !== 2 || value.automatic_retries !== 0
      || ![value.input, value.public_registry, value.public_checker_root, value.image_lock].every(relativePath)
      || !['max_file_bytes', 'max_total_bytes'].every(key => Number.isSafeInteger(limits[key]) && limits[key] > 0)) fail('ADAPTIVE_MANIFEST_INVALID');
  validateBudgetConfig(value.jev_budget, rootDir);
  if (v12) validateQuestionFormManifest(value, rootDir);
  if (value.repair_budget !== undefined) {
    const budget = value.repair_budget;
    if (!(v11 || v12) || !object(budget) || !equal(Object.keys(budget).sort(), ['contract', 'policy', 'sha256'])
      || !Object.hasOwn(REPAIR_BUDGET_CONTRACTS, budget.policy) || budget.contract !== REPAIR_BUDGET_CONTRACTS[budget.policy]
      || sha(readFileSync(join(rootDir, budget.contract))) !== budget.sha256) fail('ADAPTIVE_REPAIR_BUDGET_BINDING');
  }
  if (value.repair_feedback !== undefined && ((!v11 && !v12) || !object(value.repair_feedback) || !Object.keys(value.repair_feedback).length
    || Object.entries(value.repair_feedback).some(([key, item]) => REPAIR_FEEDBACK_VALUES[key] !== item)
    || (value.repair_feedback.scope_expansion && !value.repair_feedback.worker_diagnostics))) fail('ADAPTIVE_REPAIR_FEEDBACK_BINDING');
  if (v10) {
    const gate = validateJevTransmissionBinding(value.transmission_preflight);
    // v10 keeps policy v1; v11 binds a later frozen policy (v2+).
    const gateVersion = Number(/\.v(\d+)\.json$/.exec(gate.contract)?.[1]);
    if (v11 ? !(gateVersion >= 2) : gateVersion !== 1) fail('JEV_TRANSMISSION_BINDING_INVALID');
    const speed = value.runtime_speed;
    if (v11 ? (!object(speed) || !equal(Object.keys(speed).sort(), RUNTIME_SPEED_KEYS)
        // The v4 ledger requires per-operation locking (reservations carry leases).
        || !['per_call', 'per_session'].includes(speed.model_lookup) || speed.budget_lock !== 'ledger_op'
        || !Number.isSafeInteger(speed.public_check_concurrency) || speed.public_check_concurrency < 1 || speed.public_check_concurrency > 8
        || typeof speed.readiness_batch !== 'boolean') : speed !== undefined) fail('ADAPTIVE_RUNTIME_SPEED_INVALID');
    const recovery = value.failure_recovery, preserved = value.preserved_source;
    if (!equal(recovery, {mode:'required', policy:'evidence-loop-v1',
      contract:'docs/orchestration/contracts/adaptive-failure-recovery.v1.json', sha256:recovery?.sha256})
      || !/^[a-f0-9]{64}$/.test(recovery.sha256 ?? '')
      || sha(readFileSync(join(rootDir, recovery.contract))) !== recovery.sha256) fail('ADAPTIVE_RECOVERY_POLICY_BINDING');
    if (!object(preserved) || !['initial_profile_failure','terminal_preserved_failure'].includes(preserved.mode)
      || !relativePath(preserved.directory) || !/^[a-f0-9]{64}$/.test(preserved.result_sha256 ?? '')
      || !Number.isSafeInteger(preserved.expected_public_failed_count) || preserved.expected_public_failed_count < 1
      || preserved.comparison !== (preserved.mode === 'initial_profile_failure'
        ? 'same_start_as_d073_focused_new_02' : 'incremental_only')) fail('ADAPTIVE_PRESERVED_SOURCE_BINDING');
  }
  if (v7) {
    const policy = value.profile_policy, bytes = readFileSync(join(rootDir, policy.account_probe)), probe = JSON.parse(bytes);
    if (sha(bytes) !== policy.account_probe_sha256 || probe.schema_version !== 'd071-model-account-probes/v1'
        || probe.cli_version !== policy.cli_version || !Array.isArray(probe.receipts)
        || !Array.isArray(policy.allowed_profile_ids) || !policy.allowed_profile_ids.length
        || unique(policy.allowed_profile_ids).length !== policy.allowed_profile_ids.length) fail('ADAPTIVE_PROFILE_ACCOUNT_BINDING');
    for (const id of policy.allowed_profile_ids) {
      const profile = resolveAdaptiveProfile(id, profileOptions(value));
      if (!probe.receipts.some(row => row.requested_model === profile.model && row.status === 'completed'
          && row.model_identity_verified === true)) fail('ADAPTIVE_PROFILE_ACCOUNT_UNVERIFIED');
    }
  }
  return {...value, manifest_path: relative(rootDir, resolve(path)), manifest_sha256: sha(readFileSync(path))};
}

/** Whitelist public requirement content; historical file ownership and interfaces never leave this boundary. */
export function adaptivePublicInput(input) {
  if (!object(input?.source) || typeof input.source.text !== 'string' || sha(input.source.text) !== input.source.sha256
      || !Array.isArray(input.obligations)) fail('ADAPTIVE_PUBLIC_INPUT_INVALID');
  return {source: input.source.text, source_ref: {path: input.source.path, sha256: input.source.sha256},
    requirement_ids: input.obligations.map(item => item.id),
    requirement_descriptions: input.obligations.map(item => ({id: item.id, text: item.text,
      source_refs: [`${item.source_ref.path}#L${item.source_ref.start_line}-L${item.source_ref.end_line}`]}))};
}

/** D066 extends D065 only for observed, completely accounted known setup/prefix failures. */
export function validateAdaptivePublicReport({check, registeredCheck, raw, report}) {
  if (uncertain(raw) || uncertain(report)) fail('ADAPTIVE_CHECK_UNCERTAIN', {outcome_uncertain: true});
  if (report?.binding_kind !== 'candidate') fail('ADAPTIVE_PUBLIC_EVIDENCE_INVALID');
  if (report?.error === null) return validateDagPublicReport({check, registeredCheck, raw, report});
  const ids = registeredCheck?.test_ids, error = report?.error;
  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length
      || report?.schema_version !== 'dag-public-check-evidence/v1' || report.scope !== 'complete_suite'
      || report.product_certified !== false || report.artifact_revisions !== null
      || report.check_id !== check.id || report.check_version !== check.version || report.environment_ref !== check.environment_ref
      || !equal(report.test_ids, ids) || report.status !== 'failed' || raw?.exit_code !== 1 || report.exit_code !== 1
      || raw.outcome_uncertain !== false || report.outcome_uncertain !== false || typeof report.executed !== 'boolean'
      || !object(error) || typeof error.code !== 'string' || !error.code.trim() || typeof error.message !== 'string' || !error.message.trim()
      || !Array.isArray(report.cases) || report.cases.length >= ids.length
      || (!report.executed && (report.cases.length !== 0 || report.setup_evidence !== null))
      || report.cases.some((item, index) => !object(item) || item.test_id !== ids[index] || !['passed', 'failed'].includes(item.status)
        || !Number.isSafeInteger(item.assertions) || item.assertions < 0 || (item.status === 'passed' && item.assertions < 1))
      || !Number.isSafeInteger(report.assertions) || report.assertions !== report.cases.reduce((sum, item) => sum + item.assertions, 0)
      || report.skipped !== ids.length - report.cases.length || !equal(report.unexecuted_test_ids, ids.slice(report.cases.length))) fail('ADAPTIVE_PUBLIC_EVIDENCE_INVALID');
  return report;
}

export function adaptiveDecisionSchema(request) {
  const {body} = prepareDecision(request), properties = {};
  for (const [id, question] of Object.entries(body.questions)) {
    const field = question.type === 'choice' ? 'choice' : question.type === 'score' ? 'score' : 'noul';
    const value = field === 'choice' ? {type: 'string', enum: Object.keys(question.criteria)}
      : field === 'score' ? {type: 'integer', minimum: 0, maximum: question.criteria.length - 1} : {type: 'number', minimum: 0, maximum: 1};
    properties[id] = {type: 'object', additionalProperties: false, required: ['type', field], properties: {type: {const: question.type}, [field]: value}};
  }
  return {type: 'object', additionalProperties: false, required: ['answers'], properties: {answers: {type: 'object', additionalProperties: false,
    required: Object.keys(properties), properties}}};
}

/** evidence (v12 Jev only): keep confidence/probabilities and accept Jev's fractional score. */
export function normalizeAdaptiveAnswers(request, response, {evidence = false} = {}) {
  if (uncertain(response)) fail('ADAPTIVE_DECISION_UNCERTAIN', {outcome_uncertain: true});
  if (!object(response) || response.ok === false || response.error != null
      || (response.status !== undefined && !['completed', 'success', 'succeeded'].includes(response.status))
      || !object(response.answers) || !equal(Object.keys(response.answers).sort(), Object.keys(request.questions).sort())) fail('ADAPTIVE_DECISION_INVALID');
  const answers = {};
  for (const [id, question] of Object.entries(request.questions)) {
    const answer = response.answers[id], field = question.type === 'choice' ? 'choice' : question.type === 'score' ? 'score' : 'noul';
    const value = answer?.[field];
    if (!object(answer) || answer.type !== question.type || (field === 'choice' ? typeof value !== 'string' || !Object.hasOwn(question.criteria, value)
      : field === 'score' ? !(evidence ? Number.isFinite(value) : Number.isSafeInteger(value)) || value < 0 || value > question.criteria.length - 1
        : typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) fail('ADAPTIVE_DECISION_INVALID');
    answers[id] = {type: question.type, [field]: value};
    if (evidence) for (const key of ['confidence', 'probabilities']) if (answer[key] !== undefined) answers[id][key] = answer[key];
  }
  return {answers};
}

export function adaptiveUsageSummary(receipts) {
  return Object.fromEntries(['claude', 'jev'].map(provider => {
    const rows = receipts.filter(row => row.provider === provider), known = rows.filter(row => Number.isFinite(row.api_equivalent_usd));
    return [provider, {calls: rows.length, invocation_started_calls: rows.filter(row => row.inference_started === true).length,
      usage_complete: rows.every(row => ['input_tokens', 'output_tokens'].every(key => Number.isSafeInteger(row.usage?.[key]) && row.usage[key] >= 0)),
      cache_usage_complete: provider === 'claude' ? rows.every(row => ['cache_creation_input_tokens', 'cache_read_input_tokens']
        .every(key => Number.isSafeInteger(row.usage?.[key]) && row.usage[key] >= 0)) : null,
      ...Object.fromEntries(['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'].map(key =>
        [`${key}_known_subtotal`, rows.reduce((sum, row) => sum + (row.usage?.[key] ?? 0), 0)])),
      api_equivalent_known_subtotal_usd: known.reduce((sum, row) => sum + row.api_equivalent_usd, 0),
      api_equivalent_usd: known.length === rows.length ? known.reduce((sum, row) => sum + row.api_equivalent_usd, 0) : null,
      actual_billed_usd: null}];
  }));
}

function combinedUsage(summaries) {
  if (summaries.some(value => !value)) return null;
  return Object.fromEntries(['claude', 'jev'].map(provider => {
    const rows = summaries.map(value => value[provider]);
    const fields = ['calls', 'invocation_started_calls', 'input_tokens_known_subtotal', 'output_tokens_known_subtotal',
      'cache_creation_input_tokens_known_subtotal', 'cache_read_input_tokens_known_subtotal', 'api_equivalent_known_subtotal_usd'];
    return [provider, {...Object.fromEntries(fields.map(key => [key, rows.reduce((sum, row) => sum + row[key], 0)])),
      usage_complete: rows.every(row => row.usage_complete), cache_usage_complete: provider === 'claude' ? rows.every(row => row.cache_usage_complete) : null,
      api_equivalent_usd: rows.every(row => Number.isFinite(row.api_equivalent_usd)) ? rows.reduce((sum, row) => sum + row.api_equivalent_usd, 0) : null,
      actual_billed_usd: null}];
  }));
}

/** Controller-owned receipt/session transport. No provider retry or implicit catalog/worker reuse.
 * Opt-in speed options (defaults reproduce the historical per-call sequence):
 * modelLookup 'per_session' reuses one model GET until a non-completed call or unaccepted model;
 * budgetLock 'ledger_op' (v4 ledger only) holds the ledger lock per mutation, not across provider I/O. */
export function createAdaptiveProviderSession({rootDir = ROOT, run_id, runDirectory, manifest, remaining,
  record = async () => {}, abortSignal, adapters = {}, modelLookup = 'per_call', budgetLock = 'call', getRetry = null}) {
  const runCommand = adapters.runCommand ?? processResult, receipts = [];
  const config = adapters.jevConfig ?? loadConfig(), secret = config.apiKey ?? '';
  const save = (name, value) => writePrivateJson(join(runDirectory, name), JSON.parse(JSON.stringify(value).replaceAll(secret || '\u0000', secret ? '[REDACTED]' : '\u0000')));
  const budgetConfig = validateBudgetConfig(manifest.jev_budget, rootDir);
  if (!['per_call', 'per_session'].includes(modelLookup) || !['call', 'ledger_op'].includes(budgetLock)
      || (budgetLock === 'ledger_op' && budgetConfig.schema_version !== 'jev-token-budget/v4')) fail('ADAPTIVE_SESSION_OPTION_INVALID');
  const modelLookupCache = modelLookup === 'per_session' ? {models_checked: false} : null, narrowLock = budgetLock === 'ledger_op';
  const transmission = transmissionManifest(manifest) ? validateJevTransmissionBinding(manifest.transmission_preflight) : null;
  let sequence = 0, decisions = 0, stopped = false, observedJevModel = null, lastJevFailure = null;
  const checkpoint = async value => { receipts.push(value); save(`receipts/${value.id}.json`, value); await record({event: 'adaptive_provider_finished', ...value}); };
  const nextId = provider => `${provider}-${String(++sequence).padStart(4, '0')}`;
  const claude = async ({purpose, prompt, system, schema, attempt_id, task_id, mcp, profile, context = {}}) => {
    if (stopped) fail('ADAPTIVE_PROVIDER_STOPPED');
    remaining();
    let requestedProfile = manifest.worker_profile;
    if (profile !== undefined) {
      if (!causalManifest(manifest) || purpose !== 'worker') fail('ADAPTIVE_PROFILE_OVERRIDE_INVALID');
      const allowed = resolveAdaptiveProfile(profile.id, profileOptions(manifest));
      if (profile.model !== allowed.model || profile.effort !== allowed.effort) fail('ADAPTIVE_PROFILE_DISPATCH_MISMATCH');
      requestedProfile = {id: allowed.id, model: allowed.model, effort: allowed.effort};
    }
    const profileEvidence = {requested_profile: requestedProfile, requested_model: requestedProfile.model,
      requested_effort: requestedProfile.effort, executed_model_arg: requestedProfile.model,
      executed_effort_arg: requestedProfile.effort, effective_effort_verified: null};
    const id = nextId('claude'), began = performance.now(), attempt = attempt_id ?? `${run_id}-${id}`;
    const cwd = mkdtempSync(join(tmpdir(), parallelManifest(manifest) ? 'jev-d067-session-' : 'jev-d066-session-'));
    let submitted = false, raw = null, outcome = null, streamFd;
    try {
      save(`calls/${id}.request.json`, {purpose, prompt, system, schema: schema ?? null, attempt_id: attempt, ...context, ...profileEvidence});
      save(`calls/${id}.mcp.json`, mcp ?? {mcpServers: {}});
      const args = ['--print', '--restricted', '--model', requestedProfile.model, '--effort', requestedProfile.effort,
        '--tools', '', '--strict-mcp-config', '--mcp-config', join(runDirectory, 'calls', `${id}.mcp.json`), '--setting-sources', '',
        '--disable-slash-commands', '--no-chrome', '--permission-mode', 'dontAsk', '--permission-prompts', 'none', '--no-session-persistence',
        '--output-format', 'stream-json', '--verbose', '--system-prompt', system];
      if (schema) args.push('--json-schema', JSON.stringify(schema));
      if (mcp) args.push('--allowedTools', 'mcp__artifact_worker__write_file,mcp__artifact_worker__read_file,mcp__artifact_worker__status');
      streamFd = openSync(join(runDirectory, 'calls', `${id}.stream.jsonl`), 'wx', 0o600);
      await record({event: 'adaptive_provider_started', id, provider: 'claude', purpose, attempt_id: attempt, ...(task_id ? {task_id} : {}), ...context});
      submitted = true;
      raw = await runCommand('claude', args, {cwd, env: claudeEnvironment(process.env), input: typeof prompt === 'string' ? prompt : JSON.stringify(prompt),
        timeoutMs: remaining(), maxBytes: 32 * 1024 * 1024, killProcessTree: true, abortSignal,
        onStdout: chunk => { writeFileSync(streamFd, chunk); fsyncSync(streamFd); }});
      save(`calls/${id}.process.json`, raw);
      outcome = providerOutcome(raw, requestedProfile.model);
      await checkpoint({id, provider: 'claude', purpose, attempt_id: attempt, ...(task_id ? {task_id} : {}), ...context,
        status: outcome.status, code: outcome.code, wall_ms: performance.now() - began, inference_started: submitted, usage: outcome.completion?.usage ?? null,
        ...profileEvidence, observed_models: outcome.models, model_identity_verified: outcome.identity,
        api_equivalent_usd: outcome.completion?.total_cost_usd ?? null, actual_billed_usd: null, outcome_uncertain: outcome.status === 'uncertain',
        ...(outcome.status !== 'completed' ? {terminal_cause: adaptiveTerminalCause(outcome,
          {stage: context.stage ?? (purpose === 'worker' ? 'worker' : 'catalog'), outcome_uncertain: outcome.status === 'uncertain'})} : {})});
      if (outcome.status !== 'completed') fail(outcome.code ?? 'ADAPTIVE_CLAUDE_FAILED', {outcome_uncertain: outcome.status === 'uncertain'});
      return {id, completion: outcome.completion, raw};
    } catch (error) {
      const unknown = adaptiveOutcomeUncertain(error, {fallback: submitted && !raw});
      const terminal_cause = adaptiveTerminalCause(error,
        {stage: context.stage ?? (purpose === 'worker' ? 'worker' : 'catalog'), outcome_uncertain: unknown});
      stopped ||= unknown || purpose !== 'worker';
      if (!receipts.some(row => row.id === id)) await checkpoint({id, provider: 'claude', purpose, attempt_id: attempt,
        ...(task_id ? {task_id} : {}), ...context, ...profileEvidence,
        observed_models: outcome?.models ?? [], model_identity_verified: outcome?.identity ?? false,
        status: unknown ? 'uncertain' : 'failed', code: codeOf(error), wall_ms: performance.now() - began, inference_started: submitted,
        usage: outcome?.completion?.usage ?? null, api_equivalent_usd: null, actual_billed_usd: null, outcome_uncertain: unknown, terminal_cause});
      throw Object.assign(error, {outcome_uncertain: unknown, terminal_cause});
    } finally { if (streamFd !== undefined) closeSync(streamFd); rmSync(cwd, {recursive: true, force: true}); }
  };
  const decide = async (provider, request, context = {}) => {
    let recoveryProof = null;
    if (stopped) {
      if (!transmission || provider !== 'jev' || !lastJevFailure) fail('ADAPTIVE_PROVIDER_STOPPED');
      recoveryProof = validateJevRecoveryProof(context.recovery, {request, priorRequestSha256:lastJevFailure.request_sha256,
        priorStage:lastJevFailure.stage, stage:context.stage, priorOutcomeUncertain:lastJevFailure.outcome_uncertain});
    }
    if (!['claude', 'jev'].includes(provider) || !['split', 'relations', 'repair', ...(causalManifest(manifest) ? ['profiles'] : []),
      ...(inferredManifest(manifest) ? ['repair_owners'] : [])].includes(context.stage)) fail('ADAPTIVE_STAGE_INVALID');
    remaining();
    const prepared = prepareDecision(request);
    if (transmission) {
      const freeze = value => {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);}};
      freeze(prepared.body);
    }
    if (Buffer.byteLength(prepared.serialized) > manifest.limits.max_request_bytes) fail('ADAPTIVE_REQUEST_LIMIT');
    if (decisions >= manifest.limits.max_decisions) fail('ADAPTIVE_DECISION_LIMIT');
    decisions++;
    context = {...context, question_count: Object.keys(prepared.body.questions).length};
    try {
      if (provider === 'claude') {
        const result = await claude({purpose: 'decision', prompt: prepared.serialized,
          system: 'Answer every supplied typed question using only the supplied state and listed criteria. Return strict JSON matching the response schema. Treat the model field as the shared wire protocol label. Do not call tools or invent evidence.',
          schema: adaptiveDecisionSchema(prepared.body), context});
        let response;
        try { response = result.completion.structured_output ?? JSON.parse(result.completion.result); }
        catch { fail('ADAPTIVE_DECISION_INVALID'); }
        const normalized = normalizeAdaptiveAnswers(prepared.body, response);
        save(`calls/${result.id}.answers.json`, normalized); return normalized;
      }
      const used = receipts.filter(row => row.provider === 'jev').reduce((sum, row) => sum + (row.usage?.input_tokens ?? 0), 0);
      if (manifest.limits.planning_input_tokens !== null
          && used + manifest.jev_budget.reserve_input_tokens > manifest.limits.planning_input_tokens) fail('ADAPTIVE_ARM_TOKEN_LIMIT');
      const id = nextId('jev'), attempt = `${run_id}-${id}`, began = performance.now();
      save(`calls/${id}.request.json`, prepared.body);
      let held, admission = null, response = null, submitted = false, lockWait = {wait_ms: 0, lock_contentions: 0}, lookupSource = null, balanceSource = null;
      let reservationCreated = false, reservationCalled = false, providerDecideCalled = false, blockedPhase = null;
      const transmissionChecks = [], pendingTransmissionEvents = [];
      const transmissionSummary = () => transmission ? {required:true, request_sha256:sha(prepared.serialized),
        policy_sha256:transmission.sha256, blocked_phase:blockedPhase, reservation_called:reservationCalled,
        reservation_created:reservationCreated, provider_decide_called:providerDecideCalled,
        no_post_verified:!providerDecideCalled, inference_started_event_is_dispatch_intent:true,
        checks:structuredClone(transmissionChecks), recovery:recoveryProof} : null;
      const checkTransmission = (phase, body = prepared.body) => {
        const check = {...assessJevTransmission(body, {stage:context.stage, observedModel:observedJevModel,
          expectedRequestSha256:sha(prepared.serialized), expectedPolicySha256:transmission.sha256, rootDir,
          policyPath:transmission.contract}),
          phase, reservation_created:reservationCreated, provider_decide_called:providerDecideCalled,
          checked_at:new Date().toISOString(), no_post_at_check:!providerDecideCalled};
        const reportPath = `calls/${id}.transmission-preflight.${phase}.json`;
        save(reportPath, check);
        transmissionChecks.push({phase, passed:check.passed, report_path:reportPath,
          request_sha256:check.request_sha256, policy_sha256:check.policy_source.sha256, reason_codes:check.reason_codes});
        pendingTransmissionEvents.push({event:'adaptive_transmission_preflight_checked', id, attempt_id:attempt,
          stage:context.stage, phase, passed:check.passed, reason_codes:check.reason_codes,
          request_sha256:check.request_sha256, policy_source:check.policy_source, report_path:reportPath,
          validation_scope:check.validation_scope, checked_at:check.checked_at,
          report_saved_before_action:true, event_recording_delayed:phase !== 'initial',
          reservation_created:reservationCreated, provider_decide_called:providerDecideCalled});
        if (!check.passed) {blockedPhase = phase; fail('ADAPTIVE_TRANSMISSION_PREFLIGHT_BLOCKED');}
      };
      const drainTransmissionEvents = async () => {while (pendingTransmissionEvents.length) await record(pendingTransmissionEvents.shift());};
      const speedEvidence = () => ({...(modelLookupCache ? {model_lookup_source: lookupSource, balance_source: balanceSource} : {}),
        ...(narrowLock ? {budget_lock_mode: 'ledger_op', budget_lock_wait_ms: lockWait.wait_ms, budget_lock_contentions: lockWait.lock_contentions} : {})});
      try {
        if (transmission) {checkTransmission('initial'); await drainTransmissionEvents();}
        if (artifactRepairManifest(manifest)) {
          const assess = inferredManifest(manifest) ? assessJevTokenAdmissionV4 : causalManifest(manifest) ? assessJevTokenAdmissionV3 : compactRepairManifest(manifest) ? assessJevTokenAdmissionV2 : assessJevTokenAdmission;
          admission = assess(prepared.body, {stage: context.stage, observedModel: observedJevModel,
            expectedRequestSha256: sha(prepared.serialized),
            expectedPolicySha256: sha(readFileSync(join(rootDir, manifest.repair_policy.token_admission_contract)))});
          save(`calls/${id}.token-admission.json`, admission);
          await record({event: 'adaptive_token_admission_checked', id, ...context, admission});
          if (admission.request_sha256 !== sha(prepareDecision(prepared.body).serialized)) fail('ADAPTIVE_TOKEN_REQUEST_DRIFT');
          if (!admission.inference_allowed) fail('ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED', {token_admission: admission});
        }
        const openBudget = adapters.openBudget ?? (cfg => createTokenBudget(cfg, {requireExisting: true}));
        // ponytail: lease = wall remaining + 60s settle margin; a crashed owner blocks others only after that deadline.
        held = narrowLock ? createConcurrentTokenBudget(budgetConfig, {open: openBudget, leaseMs: Math.ceil(remaining()) + 60000,
          onAcquired: value => { lockWait = {wait_ms: lockWait.wait_ms + value.wait_ms, lock_contentions: lockWait.lock_contentions + value.lock_contentions}; }})
          : await acquireTokenBudget(budgetConfig, {open: openBudget,
            ...(parallelManifest(manifest) ? {signal: abortSignal, timeoutMs: remaining(), onAcquired: value => { lockWait = value; }} : {})});
        if (recoveryProof) {
          const settled = held.snapshot();
          if (settled.reservations_pending !== 0 || settled.blocked_code !== null) fail('JEV_TRANSMISSION_RECOVERY_UNSETTLED');
          stopped = false;
        }
        if (parallelManifest(manifest) && !narrowLock) await record({event: 'adaptive_budget_lock_acquired', id, attempt_id: attempt,
          ...context, ...lockWait, basis: 'local_lock_acquisition_before_provider_call'});
        const client = adapters.jevClientFactory ? adapters.jevClientFactory() : createJevClient({...config, timeoutMs: remaining(),
          fetchImpl: (url, options) => globalThis.fetch(url, {...options, signal: abortSignal ? AbortSignal.any([options.signal, abortSignal]) : options.signal})});
        // Keep the historic telemetry/client unchanged. Synchronous guards run
        // inside the reserve and decide boundaries, with no awaited gap before either action.
        const measuredBudget = transmission ? {...held, reserve:(...args) => {
          checkTransmission('before_reservation'); reservationCalled = true; reservationCreated = null;
          const reservation = held.reserve(...args);
          if (typeof reservation?.then === 'function') return reservation.then(value => { reservationCreated = true; return value; });
          reservationCreated = true; return reservation;
        }} : held;
        const measuredClient = transmission ? {listModels:(...args) => client.listModels(...args),
          listCredits:(...args) => client.listCredits(...args), decide:body => {
            checkTransmission('before_post', body); providerDecideCalled = true; return client.decide(body);
          }} : client;
        const measured = createMeasuredDecider({client:measuredClient, budget:measuredBudget, modelLookupCache, getRetry,
          ...(adapters.sleep ? {sleep: adapters.sleep} : {}), record: async event => {
          if (event.event === 'inference_started') submitted = true;
          lookupSource = event.model_lookup_source ?? lookupSource; balanceSource = event.balance_source ?? balanceSource;
          if (transmission) await drainTransmissionEvents();
          await record({...event, ...context});
        }, identifiers: {run_id, attempt_id: attempt, group_id: transmission ? 'd075-decisions' : inferredManifest(manifest) ? 'd073-decisions' : causalManifest(manifest) ? 'd071-decisions' : artifactRepairManifest(manifest) ? 'd069-decisions' : repairManifest(manifest) ? 'd068-decisions' : parallelManifest(manifest) ? 'd067-decisions' : 'd066-decisions', agent_role: 'implementation'}});
        if (admission && admission.request_sha256 !== sha(prepareDecision(prepared.body).serialized)) fail('ADAPTIVE_TOKEN_REQUEST_DRIFT');
        response = await measured(prepared.body, {decision_id: decisions});
        lastJevFailure = null;
        observedJevModel = response.model ?? null;
        save(`calls/${id}.response.json`, response);
        await checkpoint({id, provider: 'jev', purpose: 'decision', ...context, attempt_id: attempt, status: 'completed',
          wall_ms: performance.now() - began, inference_started: transmission ? providerDecideCalled : submitted, usage: response.usage, model: response.model,
          api_equivalent_usd: response.usage.input_tokens * manifest.valuation.usd_per_million_input_tokens / 1000000,
          actual_billed_usd: null, outcome_uncertain: false,
          ...(transmission ? {transmission_preflight:transmissionSummary()} : {}), ...speedEvidence(),
          ...(parallelManifest(manifest) ? {budget_lock_wait_ms: lockWait.wait_ms, budget_lock_contentions: lockWait.lock_contentions} : {})});
        return normalizeAdaptiveAnswers(prepared.body, response, {evidence: isQuestionFormManifest(manifest)});
      } catch (error) {
        if (transmission) await drainTransmissionEvents();
        if (blockedPhase) error = Object.assign(new Error('ADAPTIVE_TRANSMISSION_PREFLIGHT_BLOCKED'),
          {code:'ADAPTIVE_TRANSMISSION_PREFLIGHT_BLOCKED', outcome_uncertain:false, outcomeUncertain:false});
        const unknown = adaptiveOutcomeUncertain(error, {fallback: (transmission ? providerDecideCalled : submitted) && response === null});
        if (!recoveryProof || providerDecideCalled) lastJevFailure = {
          request_sha256:sha(prepared.serialized), stage:context.stage, outcome_uncertain:unknown};
        const terminal_cause = adaptiveTerminalCause(error, {stage: context.stage, outcome_uncertain: unknown});
        if (!receipts.some(row => row.id === id)) await checkpoint({id, provider: 'jev', purpose: 'decision', ...context,
          attempt_id: attempt, status: unknown ? 'uncertain' : 'failed', code: codeOf(error), wall_ms: performance.now() - began,
          inference_started: transmission ? providerDecideCalled : submitted, usage: response?.usage ?? null, api_equivalent_usd: null, actual_billed_usd: null, outcome_uncertain: unknown, terminal_cause,
          ...(transmission ? {transmission_preflight:transmissionSummary()} : {}), ...speedEvidence(),
          ...(parallelManifest(manifest) ? {budget_lock_wait_ms: held ? lockWait.wait_ms : null, budget_lock_contentions: held ? lockWait.lock_contentions : null} : {})});
        throw Object.assign(error, {outcome_uncertain: unknown, terminal_cause,
          ...(transmission ? {request_sha256:sha(prepared.serialized), transmission_preflight:transmissionSummary()} : {})});
      } finally { held?.close(); }
    } catch (error) { stopped = true; throw error; }
  };
  return {claude, decide, save, receipts: () => structuredClone(receipts), decision_count: () => decisions};
}

export function createAdaptiveDecisionProvider({provider, session}) {
  if (!['claude', 'jev'].includes(provider)) fail('ADAPTIVE_PROVIDER_INVALID');
  return (request, context) => session.decide(provider, request, context);
}

function filesUnder(directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name), stat = lstatSync(path);
    if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) fail('ADAPTIVE_UNSAFE_SOURCE');
    if (stat.isDirectory()) return filesUnder(path);
    if (!stat.isFile()) fail('ADAPTIVE_UNSAFE_SOURCE');
    return [path];
  });
}

function freshRun(rootDir, runDir) {
  const target = typeof runDir === 'string' ? resolve(runDir) : '';
  if (!target.startsWith(join(resolve(rootDir), 'benchmark-runs') + '/') || existsSync(target)
      || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,60}$/.test(basename(target))) fail('ADAPTIVE_FRESH_DIRECTORY_REQUIRED');
  mkdirSync(target, {mode: 0o700});
  for (const name of ['calls', 'receipts', 'sources', 'check-bindings']) mkdirSync(join(target, name), {mode: 0o700});
  return target;
}

function createRunContext({rootDir, runDir, manifest, abortSignal}) {
  const directory = freshRun(rootDir, runDir), run_id = `${basename(directory).slice(0, 38)}-${randomUUID()}`,
    started = performance.now(), started_at = new Date().toISOString();
  const fd = openSync(join(directory, 'events.jsonl'), 'wx', 0o600), controller = new AbortController();
  const deadline = setTimeout(() => controller.abort('ADAPTIVE_DEADLINE'), manifest.limits.wall_timeout_seconds * 1000);
  deadline.unref();
  const onSignal = () => controller.abort('ADAPTIVE_CANCELLED');
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);
  if (abortSignal) { if (abortSignal.aborted) onSignal(); else abortSignal.addEventListener('abort', onSignal, {once: true}); }
  let pins = [], closed = false;
  const changes = () => pins.filter(pin => { try { return sha(readFileSync(join(rootDir, pin.path))) !== pin.sha256; } catch { return true; } }).map(pin => pin.path);
  const remaining = () => {
    if (controller.signal.aborted) fail('ADAPTIVE_CANCELLED', {outcome_uncertain: true});
    const ms = Math.floor(manifest.limits.wall_timeout_seconds * 1000 - (performance.now() - started));
    if (ms <= 0) fail('ADAPTIVE_DEADLINE');
    if (changes().length) fail('ADAPTIVE_SOURCE_DRIFT');
    return ms;
  };
  const save = (name, value) => writePrivateJson(join(directory, name), value);
  const record = async event => {
    try { writeFileSync(fd, JSON.stringify({run_id, recorded_at: new Date().toISOString(), elapsed_ms: performance.now() - started, ...event}) + '\n'); fsyncSync(fd); }
    catch { controller.abort('ADAPTIVE_RECORD_FAILED'); fail('ADAPTIVE_RECORD_FAILED', {outcome_uncertain: true}); }
  };
  const pinSources = (input, extra = []) => {
    const paths = unique(['src/benchmark/adaptive-dag-runner.mjs', 'scripts/adaptive-dag-comparison.mjs',
      'src/orchestration/adaptive-dag-planner.mjs', 'src/orchestration/adaptive-decomposition-balancing.mjs', 'src/orchestration/adaptive-dag-execution.mjs',
      'src/orchestration/adaptive-failure.mjs', ...(repairManifest(manifest) ? REPAIR_SOURCE_PATHS : []),
      ...(artifactRepairManifest(manifest) ? ['src/orchestration/adaptive-artifact-repair.mjs', 'src/orchestration/jev-token-admission.mjs',
        manifest.repair_policy.artifact_contract, manifest.repair_policy.assertion_contract, manifest.repair_policy.token_admission_contract] : []),
      ...(compactRepairManifest(manifest) ? ['src/orchestration/adaptive-artifact-repair-v2.mjs', 'src/orchestration/jev-token-admission-v2.mjs',
        'docs/orchestration/contracts/adaptive-artifact-repair.v1.json', 'docs/orchestration/contracts/jev-token-admission.v1.json'] : []),
      ...(balancedManifest(manifest) ? [manifest.decomposition_policy.contract] : []),
      ...(causalManifest(manifest) ? ['src/orchestration/adaptive-causal-repair.mjs',
        'src/orchestration/adaptive-causal-packet-encoding.mjs', 'src/orchestration/jev-token-admission-v3.mjs',
        'src/orchestration/adaptive-profile-selection.mjs', manifest.profile_policy.contract,
        manifest.profile_policy.candidate_contract, manifest.profile_policy.account_probe,
        manifest.public_controls_evidence, 'docs/orchestration/contracts/models.v2.json',
        'src/dashboard/pricing.mjs', 'docs/orchestration/contracts/adaptive-artifact-repair.v2.json',
        'docs/orchestration/contracts/jev-token-admission.v2.json'] : []),
      ...(inferredManifest(manifest) ? ['src/orchestration/adaptive-inferred-repair.mjs',
        'src/orchestration/adaptive-inferred-repair-projection.mjs',
        'src/orchestration/jev-token-admission-v4.mjs', manifest.repair_policy.owner_inference_contract,
        'docs/orchestration/contracts/adaptive-inferred-repair.v1.json',
        'docs/orchestration/contracts/adaptive-inferred-repair.v2.json',
        'docs/orchestration/contracts/adaptive-profile-selection.v1.json',
        'docs/orchestration/contracts/jev-token-admission.v3.json'] : []),
      ...(isQuestionFormManifest(manifest) ? QUESTION_FORM_SOURCES : []),
      ...(transmissionManifest(manifest) ? [...JEV_TRANSMISSION_SOURCE_PATHS,
        manifest.transmission_preflight.contract, manifest.failure_recovery.contract,
        'src/orchestration/adaptive-failure-recovery.mjs'] : []),
      'docs/orchestration/contracts/adaptive-dag.v1.json', 'src/benchmark/dag-runner.mjs', 'src/benchmark/docker.mjs',
      'src/benchmark/runner.mjs', 'src/benchmark/claude-env.mjs', 'src/client.mjs', 'src/config.mjs', 'src/benchmark/telemetry.mjs',
      'src/benchmark/budget.mjs', 'src/benchmark/budget-acquire.mjs', 'bin/artifact-worker-mcp.mjs',
      'src/orchestration/artifact-transport.mjs', 'src/orchestration/dag-filesystem-runtime.mjs', 'src/orchestration/dag-contracts.mjs',
      'src/orchestration/artifact-dag.mjs', 'src/orchestration/dag-workflow.mjs', 'src/orchestration/dag-scheduler.mjs',
      'src/orchestration/artifact-verification-gate.mjs', 'scripts/audit-dag-public-checks.mjs',
      manifest.manifest_path, manifest.input, input.source_ref.path, manifest.image_lock, ...publicSourceHashes(rootDir).map(pin => pin.path), ...extra]);
    pins = paths.map((path, index) => {
      if (!relativePath(path)) fail('ADAPTIVE_SOURCE_PATH_INVALID');
      const bytes = readFileSync(join(rootDir, path)), snapshot = `sources/${String(index + 1).padStart(3, '0')}-${basename(path)}`;
      writeFileSync(join(directory, snapshot), bytes, {mode: 0o600, flag: 'wx'});
      return {path, sha256: sha(bytes), snapshot};
    });
    save('source-pins.json', pins); return pins;
  };
  return {directory, run_id, started_at, elapsed: () => performance.now() - started, remaining, record, save, pinSources,
    changes, signal: controller.signal, close: () => { if (closed) return; closed = true; clearTimeout(deadline); closeSync(fd);
      process.removeListener('SIGINT', onSignal); process.removeListener('SIGTERM', onSignal); abortSignal?.removeEventListener('abort', onSignal); }};
}

function loadPublicInput(rootDir, manifest) {
  const input = adaptivePublicInput(read(join(rootDir, manifest.input)));
  if (sha(readFileSync(join(rootDir, input.source_ref.path))) !== input.source_ref.sha256) fail('ADAPTIVE_PUBLIC_SOURCE_DRIFT');
  return input;
}

// ledger_op (v4): a live, leased reservation of another cohort is admitted exactly as reserve() admits it;
// blocked or lease-expired entries surface as blocked_code and still stop the start (D080-defaults-02).
const unsettledReservations = (manifest, snapshot) => snapshot.reservations_pending > 0
  && !(adaptiveRuntimeSpeed(manifest).budget_lock === 'ledger_op' && snapshot.reservations_in_flight === snapshot.reservations_pending);

export function assertAdaptiveCohortCapacity({manifest, rootDir = ROOT, armIndex = 0, snapshot}) {
  const state = snapshot ?? readTokenBudgetSnapshot(validateBudgetConfig(manifest.jev_budget, rootDir));
  const remainingArms = manifest.arms.slice(armIndex).filter(arm => Object.values(ADAPTIVE_ARMS[arm]).includes('jev')).length;
  if (parallelManifest(manifest)) {
    if (manifest.limits.planning_input_tokens !== null || manifest.jev_budget.max_input_tokens !== null
        || !['jev-token-budget-snapshot/v3', 'jev-token-budget-snapshot/v4'].includes(state.schema_version)
        || state.schema_version !== manifest.jev_budget.schema_version.replace('jev-token-budget/', 'jev-token-budget-snapshot/')
        || state.unlimited !== true
        || state.token_limit !== null || state.remaining_input_tokens !== null || state.blocked_code || unsettledReservations(manifest, state)) {
      fail('ADAPTIVE_COHORT_BUDGET_INSUFFICIENT');
    }
    return {snapshot: state, remaining_jev_arms: remainingArms, required_input_tokens: null, token_capacity_unlimited: true};
  }
  const required = remainingArms * manifest.limits.planning_input_tokens + (remainingArms ? manifest.jev_budget.reserve_input_tokens : 0);
  if (state.blocked_code || state.reservations_pending || state.remaining_input_tokens < required) fail('ADAPTIVE_COHORT_BUDGET_INSUFFICIENT');
  return {snapshot: state, remaining_jev_arms: remainingArms, required_input_tokens: required};
}

/** A settled snapshot must be read while owning the lock; a sibling's pending call is normal contention. */
async function withAdaptiveSettledBudget({rootDir, manifest, remaining = () => manifest.limits.wall_timeout_seconds * 1000,
  record = async () => {}, abortSignal, adapters = {}, purpose, allowBlockedSnapshot = false}, action) {
  const config = validateBudgetConfig(manifest.jev_budget, rootDir);
  if (!parallelManifest(manifest)) return action(readTokenBudgetSnapshot(config));
  let held, lockWait;
  try {
    held = await acquireTokenBudget(config, {open: adapters.openBudget ?? (cfg => createTokenBudget(cfg, {requireExisting: true})),
      signal: abortSignal, timeoutMs: remaining(), onAcquired: value => { lockWait = value; }});
    const snapshot = held.snapshot();
    if (!allowBlockedSnapshot && (snapshot.blocked_code || unsettledReservations(manifest, snapshot))) fail(snapshot.blocked_code ?? 'BUDGET_OUTSTANDING');
    await record({event: 'adaptive_budget_lock_acquired', purpose, ...lockWait, basis: 'local_lock_acquisition_before_settled_snapshot'});
    return await action(snapshot);
  } finally { held?.close(); }
}

async function adaptivePreflight({rootDir, manifest, probe, adapters = {}, record, remaining, abortSignal}) {
  const budget = {rootDir, manifest, adapters, record, remaining, abortSignal, purpose: 'preflight'};
  const dockerPreflight = () => (adapters.preflight ?? preflightDagRun)({rootDir, manifest, probe, runCommand: adapters.runCommand, record, abortSignal});
  // ledger_op reserves wait at most 30 s for the lock, so only the settled snapshot and
  // capacity check hold it; a Docker preflight under the lock failed concurrent cohorts (D079).
  if (adaptiveRuntimeSpeed(manifest).budget_lock === 'ledger_op') {
    const capacity = await withAdaptiveSettledBudget(budget, async snapshot => assertAdaptiveCohortCapacity({manifest, rootDir, snapshot}));
    return {...await dockerPreflight(), cohort_capacity: capacity};
  }
  return withAdaptiveSettledBudget(budget, async snapshot => {
    const capacity = assertAdaptiveCohortCapacity({manifest, rootDir, snapshot});
    return {...await dockerPreflight(), cohort_capacity: capacity};
  });
}

const READINESS = `import ast,json,pathlib,subprocess,sys
assertions=0
error=None
try:
 for name in json.loads(sys.argv[1]):
  p=pathlib.Path(name)
  assert p.is_file() and not p.is_symlink()
  assertions+=1
  text=p.read_text()
  if p.suffix=='.py': ast.parse(text); assertions+=1
  elif p.suffix=='.toml':
   import tomllib
   tomllib.loads(text); assertions+=1
  elif p.suffix=='.sh':
   assert subprocess.run(['bash','-n',str(p)],capture_output=True).returncode==0
   assertions+=1
except Exception as exc: error={'code':type(exc).__name__,'message':str(exc)}
print(json.dumps({'status':'passed' if error is None else 'failed','executed':True,'exit_code':0 if error is None else 1,'assertions':assertions,'skipped':0,'outcome_uncertain':False,'error':error}))
sys.exit(0 if error is None else 1)`;
const READINESS_CODE = `exec(${JSON.stringify(READINESS)})`;
// Opt-in batch: run the exact `python3 -c READINESS_CODE <paths>` program once per
// check inside one interpreter, capturing each program's own report and exit code.
const READINESS_BATCH = `import contextlib,io,json,sys
code=sys.argv[1]
results=[]
for check_id,arg in json.loads(sys.argv[2]):
 out=io.StringIO()
 sys.argv=['-c',arg]
 exit_code=None
 try:
  with contextlib.redirect_stdout(out): exec(code,{'__name__':'__main__'})
 except SystemExit as exc: exit_code=exc.code
 results.append({'check_id':check_id,'exit_code':exit_code,'report':json.loads(out.getvalue())})
print(json.dumps({'status':'completed','outcome_uncertain':False,'results':results}))`;
const readinessArgument = check => check.phase === 'contract' && check.cwd === 'candidate' && check.argv?.length === 4
  && check.argv[0] === 'python3' && check.argv[1] === '-c' && check.argv[2] === READINESS_CODE ? check.argv[3] : null;
const localReportInvalid = (raw, report) => uncertain(report) || raw.outcome_uncertain !== false || report.outcome_uncertain !== false
  || report.executed !== true || report.exit_code !== raw.exit_code || !['passed', 'failed'].includes(report.status)
  || !Number.isSafeInteger(report.assertions) || report.assertions < 0 || report.skipped !== 0
  || (report.status === 'passed' ? raw.exit_code !== 0 || report.assertions < 1 || report.error !== null : raw.exit_code !== 1 || !object(report.error));

export function buildAdaptiveChecks({catalog, registry, manifest, source_ref}) {
  const ids = catalog.artifacts.map(artifact => artifact.id);
  const local = catalog.artifacts.map((artifact, index) => ({id: `adaptive.readiness.${index + 1}`, version: '1', phase: 'contract',
    artifact_ids: [artifact.id], requirement_ids: catalog.units.filter(unit => unit.artifact_ids.includes(artifact.id)).flatMap(unit => unit.requirement_ids),
    runner_ref: 'src/benchmark/adaptive-dag-runner.mjs', argv: ['python3', '-c', READINESS_CODE, JSON.stringify(artifact.paths)],
    cwd: 'candidate', environment_ref: manifest.public_environment_ref, source_ref: source_ref.path}));
  const integration = registry.map(check => {
    const suite = check.argv[check.argv.indexOf('--suite') + 1];
    if (!/^[a-z0-9-]+$/.test(suite ?? '') || check.environment_ref !== manifest.public_environment_ref) fail('ADAPTIVE_PUBLIC_SUITE_INVALID');
    return {id: check.id, version: check.version, phase: 'integration', artifact_ids: [...ids], requirement_ids: [...check.requirement_ids],
      runner_ref: check.runner_ref, argv: ['python3', `/checker/${manifest.public_runner ?? `${manifest.public_checker_root}/run_public_checks.py`}`, '--suite', suite, '--binding', '/run/binding.json'],
      cwd: 'candidate', environment_ref: check.environment_ref, source_ref: check.source_ref};
  });
  return [...local, ...integration];
}

/** One source-only call; invalid output is terminal and its raw response remains retained. */
export async function prepareAdaptiveSharedCatalog({rootDir = ROOT, manifest = loadAdaptiveRunManifest(), runDir, spend = false, adapters = {}}) {
  if (!spend) fail('EXPLICIT_SPEND_REQUIRED');
  const context = createRunContext({rootDir, runDir, manifest, abortSignal: adapters.abortSignal});
  let session, catalog = null, stopCode = null, unknown = false, preflight = null, budgetBefore = null;
  try {
    budgetBefore = assertAdaptiveCohortCapacity({manifest, rootDir}).snapshot; context.save('budget-before.json', budgetBefore);
    const input = loadPublicInput(rootDir, manifest);
    context.pinSources(input); context.save('public-input.json', input);
    preflight = await (adapters.preflight ?? preflightDagRun)({rootDir, manifest, probe: true, runCommand: adapters.runCommand,
      record: context.record, abortSignal: context.signal});
    context.save('preflight.json', preflight);
    if (!preflight.live_ready) fail('ADAPTIVE_PREFLIGHT_BLOCKED');
    const planner = await import('../orchestration/adaptive-dag-planner.mjs');
    const prepared = planner.prepareAdaptiveCatalog({...input, limits: manifest.limits});
    context.save('catalog-preparation.json', prepared);
    session = createAdaptiveProviderSession({rootDir, run_id: context.run_id, runDirectory: context.directory, manifest,
      remaining: context.remaining, record: context.record, abortSignal: context.signal, adapters, ...adaptiveSpeedSessionOptions(manifest)});
    const response = await session.claude({purpose: 'catalog', prompt: prepared.prompt, schema: prepared.schema, system: CATALOG_SYSTEM});
    try { catalog = response.completion.structured_output ?? JSON.parse(response.completion.result); }
    catch { fail('ADAPTIVE_CATALOG_JSON_INVALID'); }
    context.save('catalog-response.json', catalog);
    planner.validateAdaptiveCatalog({...input, catalog, limits: manifest.limits});
    context.save('catalog.json', catalog);
    context.remaining();
  } catch (error) { stopCode = codeOf(error); unknown = uncertain(error); }
  const receipts = session?.receipts() ?? [];
  const result = {schema_version: 'adaptive-catalog-preparation/v1', run_id: context.run_id,
    status: unknown ? 'uncertain' : stopCode ? 'failed' : 'prepared', stop_code: stopCode, outcome_uncertain: unknown,
    started_at: context.started_at, finished_at: new Date().toISOString(), wall_ms: context.elapsed(),
    catalog_path: !stopCode ? join(context.directory, 'catalog.json') : null,
    catalog_file_sha256: !stopCode ? sha(readFileSync(join(context.directory, 'catalog.json'))) : null,
    catalog_sha256: !stopCode ? sha(catalog) : null, manifest_sha256: manifest.manifest_sha256,
    usage: adaptiveUsageSummary(receipts), receipts, budget_before: budgetBefore,
    budget_after: readTokenBudgetSnapshot(validateBudgetConfig(manifest.jev_budget, rootDir)),
    automatic_retries: 0, product_success: null, accounting: manifest.preparation_accounting};
  try { context.save('result.json', result); await context.record({event: 'adaptive_catalog_terminal', status: result.status, outcome_uncertain: unknown}); }
  finally { context.close(); }
  return result;
}

export function loadAdaptiveSharedPreparation({rootDir = ROOT, manifest, preparationDirectory, input}) {
  const directory = resolve(preparationDirectory), result = read(join(directory, 'result.json'));
  const catalogPath = join(directory, 'catalog.json'), bytes = readFileSync(catalogPath), catalog = JSON.parse(bytes);
  const reused = parallelManifest(manifest), reuse = manifest.catalog_reuse;
  if (result.schema_version !== 'adaptive-catalog-preparation/v1' || result.status !== 'prepared' || result.outcome_uncertain !== false
      || (!reused && result.manifest_sha256 !== manifest.manifest_sha256) || result.catalog_path !== catalogPath || result.catalog_file_sha256 !== sha(bytes)
      || result.catalog_sha256 !== sha(catalog) || result.receipts?.length !== 1 || result.receipts[0].provider !== 'claude'
      || result.receipts[0].purpose !== 'catalog' || result.receipts[0].status !== 'completed' || !result.receipts[0].model_identity_verified
      || catalog.source_sha256 !== input.source_ref.sha256) fail('ADAPTIVE_PREPARATION_INVALID');
  const pins = read(join(directory, 'source-pins.json'));
  if (!Array.isArray(pins) || !pins.length || new Set(pins.map(pin => pin.path)).size !== pins.length
      || pins.some(pin => !relativePath(pin.path) || !relativePath(pin.snapshot)
        || sha(readFileSync(join(directory, pin.snapshot))) !== pin.sha256)) fail('ADAPTIVE_PREPARATION_SOURCE_DRIFT');
  const changed = pins.filter(pin => sha(readFileSync(join(rootDir, pin.path))) !== pin.sha256).map(pin => pin.path);
  let compatibility = null;
  if (!reused) {
    if (changed.length) fail('ADAPTIVE_PREPARATION_SOURCE_DRIFT');
  } else {
    if (!reuse || directory !== resolve(rootDir, reuse.preparation_directory)
        || sha(readFileSync(join(directory, 'result.json'))) !== reuse.result_sha256
        || sha(bytes) !== reuse.catalog_file_sha256
        || sha(readFileSync(join(directory, 'source-pins.json'))) !== reuse.source_pins_sha256
        || sha(readFileSync(join(directory, 'catalog-preparation.json'))) !== reuse.prepared_request_sha256
        || sha(readFileSync(join(directory, 'calls', `${result.receipts[0].id}.request.json`))) !== reuse.provider_request_sha256
        || result.manifest_sha256 !== reuse.original_manifest_sha256
        || !equal(result.receipts[0].requested_profile, manifest.worker_profile)
        || !equal(reuse.allowed_changed_source_paths, reuseMutableSources(manifest))
        || changed.some(path => !reuseMutableSources(manifest).includes(path))) fail('ADAPTIVE_PREPARATION_REUSE_INVALID');
    const originalManifest = read(join(rootDir, reuse.original_manifest));
    if (sha(readFileSync(join(rootDir, reuse.original_manifest))) !== reuse.original_manifest_sha256
        || !pins.some(pin => pin.path === reuse.original_manifest && pin.sha256 === reuse.original_manifest_sha256)
        || !equal(originalManifest.worker_profile, manifest.worker_profile)
        || ['input', ...(!causalManifest(manifest) ? ['public_registry'] : []), 'public_checker_root', 'public_environment_ref', 'image_lock'].some(key => originalManifest[key] !== manifest[key])
        || Object.entries(originalManifest.limits).some(([key, value]) => !['planning_input_tokens',
          ...(inferredManifest(manifest) ? ['max_request_bytes'] : [])].includes(key) && manifest.limits[key] !== value)) {
      fail('ADAPTIVE_PREPARATION_REUSE_INVALID');
    }
    const current = prepareAdaptiveCatalog({...input, limits: manifest.limits}), previous = read(join(directory, 'catalog-preparation.json')),
      request = read(join(directory, 'calls', `${result.receipts[0].id}.request.json`));
    if (!equal(current, previous) || request.purpose !== 'catalog' || request.prompt !== current.prompt
        || !equal(request.schema, current.schema) || request.system !== CATALOG_SYSTEM) fail('ADAPTIVE_PREPARATION_REUSE_INPUT_DRIFT');
    compatibility = {policy: reuse.schema_version, original_manifest_sha256: reuse.original_manifest_sha256,
      catalog_file_sha256: sha(bytes), generation_request_exact_match: true, historical_snapshot_count: pins.length,
      changed_harness_sources: changed, unchanged_generation_sources: changed.every(path => path !== 'src/orchestration/adaptive-dag-planner.mjs'),
      generation_prompt_schema_exact_match: true, new_catalog_inference_calls: 0,
      ...(inferredManifest(manifest) ? {local_request_limit_change: {previous_bytes: originalManifest.limits.max_request_bytes,
        current_bytes: manifest.limits.max_request_bytes, catalog_generation_content_unchanged: true}} : {}),
      ...(causalManifest(manifest) ? {public_gate_upgrade: {previous_registry: originalManifest.public_registry,
        current_registry: manifest.public_registry, original_test_count: 85, current_test_count: 93,
        generation_input_unchanged: true}} : {}),
      accounting: 'Historical preparation is retained for full-preparation reference quantities; it is not a new invocation or current-cohort spend.'};
  }
  return {catalog, result, directory, catalog_path: catalogPath, reused, compatibility};
}

export function loadAdaptiveTestRequirements(rootDir, manifest) {
  const mapping = Object.fromEntries(read(join(rootDir, manifest.input)).tests.map(test => [test.id, test.requirement_refs]));
  if (causalManifest(manifest)) {
    const {registry} = loadPublicAuditInputs(rootDir, {registryPath: manifest.public_registry, runnerPath: manifest.public_runner});
    for (const check of registry) for (const id of check.test_ids) if (!mapping[id]) mapping[id] = [...check.requirement_ids];
    if (Object.keys(mapping).length !== 93) fail('ADAPTIVE_PUBLIC_REQUIREMENT_MAPPING');
  }
  return mapping;
}

function createWorkerAndChecks({rootDir, manifest, context, session, input, catalog, registry, preflight, adapters,
  arm = 'jev_all', profileSelections = new Map(), readinessBatch = false}) {
  const runCommand = adapters.runCommand ?? processResult, image = read(join(rootDir, manifest.image_lock));
  const executeTask = async (task, worker) => {
    context.remaining();
    const transportId = `worker-${randomUUID()}`, transportPath = join(context.directory, 'calls', `${transportId}.transport.json`);
    const readSources = worker.additional_read_sources ?? [], overlayPaths = new Set(readSources.map(source => source.path));
    if (readSources.length && !causalManifest(manifest)) fail('ADAPTIVE_CAUSAL_READ_UNSUPPORTED');
    const transport = {root: worker.stageDirectory, allowedPaths: task.write_scope,
      readablePaths: unique([...task.read_scope, ...task.write_scope]).filter(path => !overlayPaths.has(path)),
      ...(readSources.length ? {readSources} : {}), journalPath: join(context.directory, 'calls', `${transportId}.artifacts.jsonl`),
      maxFileBytes: manifest.limits.max_file_bytes, maxTotalBytes: manifest.limits.max_total_bytes};
    writePrivateJson(transportPath, transport);
    const mcp = {mcpServers: {artifact_worker: {command: process.execPath, args: [join(rootDir, 'bin/artifact-worker-mcp.mjs'), '--config', transportPath]}}};
    const artifactRepair = artifactRepairManifest(manifest) && worker.operation === 'repair' ? worker.repair_context?.artifact_repair : null;
    if (artifactRepairManifest(manifest) && worker.operation === 'repair' && !artifactRepair) fail('ADAPTIVE_ARTIFACT_REPAIR_PACKET_REQUIRED');
    const system = artifactRepair
      ? 'Repair only the selected artifact paths using the supplied public assertion evidence, source-backed requirements and interface contracts. Read available predecessor and previous own files through artifact_worker. Persist complete files individually with write_file. Other prior files are inherited unchanged and read-only. The public-interface repair attribution is a candidate, not proof of the fault location. If required changes are outside allowed writes, explain the unmet dependency without claiming success. No shell, network, installation or delegation tools are available. Never weaken checks or claim tests ran: the controller reruns all original local and public checks. Final response is a concise factual summary, never source bodies.'
      : 'Implement the complete public specification within this leaf task\'s exact file ownership. Read available predecessor files and previous own files through artifact_worker. Persist complete files individually with write_file. Only declared paths are writable. Preserve the shared source-backed interface catalog. Public requirements are accountability assignments; all substantive behavior is checked on the assembled candidate. For repair, use only the provided public failure evidence and previous revision context. No shell, network, installation or delegation tools are available. Never weaken check expectations or claim tests were executed; the controller runs pinned checks. Final response is a concise factual summary, never source bodies.';
    const selected = profileSelections.get(task.id);
    if (arm === 'jev_profile' && (!causalManifest(manifest) || !selected)) fail('ADAPTIVE_PROFILE_REQUIRED');
    const profile = selected ? resolveAdaptiveProfile(selected.profile_id, profileOptions(manifest)) : undefined;
    const execution_model = {profile: profile ? {id: profile.id, model: profile.model, effort: profile.effort} : manifest.worker_profile,
      execution_slots: 2, session_scope: 'fresh_per_leaf_attempt', conversation_reuse: false};
    const prompt = artifactRepair ? {source_ref: input.source_ref, task, artifact_repair: artifactRepair,
      input_artifact_revisions: worker.input_artifact_revisions, operation: worker.operation, round_index: worker.round_index,
      original_task_id: worker.original_task_id, execution_model,
      ...(manifest.repair_feedback?.read_scope ? {read_only_reference_paths: [...overlayPaths].sort()} : {})}
      : {public_source: input.source, source_ref: input.source_ref, task,
      requirements: input.requirement_descriptions.filter(requirement => task.requirement_ids.includes(requirement.id)),
      shared_catalog: catalog, input_artifact_revisions: worker.input_artifact_revisions,
      operation: worker.operation, round_index: worker.round_index, original_task_id: worker.original_task_id,
      repair_context: worker.repair_context, execution_model};
    let call;
    try {
      call = await session.claude({purpose: 'worker', prompt, system, mcp, profile, attempt_id: worker.attempt_id, task_id: task.id,
        context: {operation: worker.operation, round_index: worker.round_index, original_task_id: worker.original_task_id,
          ...(selected ? {profile_selection: {decision_id: selected.decision_id, choice_id: selected.choice_id, profile_id: selected.profile_id}} : {}),
          transport_ref: relative(context.directory, transportPath)}});
    } catch (error) {
      if (uncertain(error)) throw error;
      return {status: 'failed', code: codeOf(error), outcome_uncertain: false};
    }
    if (!artifactRepair || !manifest.repair_feedback?.worker_diagnostics) return {status: 'completed', outcome_uncertain: false};
    // A missing stream only drops the optional diagnostic; it never changes the completed worker outcome.
    let streamText = '';
    try { streamText = readFileSync(join(context.directory, 'calls', `${call.id}.stream.jsonl`), 'utf8'); } catch { /* optional */ }
    return {status: 'completed', outcome_uncertain: false, worker_report: adaptiveWorkerReport(streamText, call.completion)};
  };
  const checkTask = async (check, checkContext) => {
    context.remaining();
    const id = `check-${randomUUID()}`, bindingDirectory = join(context.directory, 'check-bindings', id);
    mkdirSync(bindingDirectory, {mode: 0o700});
    const processRef = `calls/${id}.process.json`, reportRef = `receipts/${id}.json`;
    const {raw, report, container_removed} = await runDagDockerCheck({image, check, candidateDirectory: checkContext.candidateDirectory,
      pinnedDirectory: checkContext.pinnedDirectory, bindingDirectory, runCommand, remaining: context.remaining, record: context.record,
      attemptId: checkContext.attempt_id, abortSignal: context.signal, saveProcess: async raw => context.save(processRef, raw)});
    if (check.phase === 'integration') validateAdaptivePublicReport({check, registeredCheck: registry.find(item => item.id === check.id), raw, report});
    else if (localReportInvalid(raw, report)) fail('ADAPTIVE_LOCAL_EVIDENCE_INVALID', {outcome_uncertain: uncertain(raw) || uncertain(report)});
    const envelope = {check_id: check.id, check_version: check.version, environment_ref: check.environment_ref,
      status: report.status, executed: report.executed, exit_code: raw.exit_code, assertions: report.assertions, skipped: report.skipped,
      outcome_uncertain: false, evidence: {...report, report_ref: reportRef, process_ref: processRef, container_removed}};
    context.save(reportRef, {attempt_id: checkContext.attempt_id, round_index: checkContext.round_index,
      artifact_revisions: checkContext.artifact_revisions, envelope});
    return envelope;
  };
  // One container for every readiness check in the request; other checks are
  // omitted so the controller runs them singly. Any invalid row fails the batch.
  const batchChecks = async (checks, batchContext) => {
    context.remaining();
    const groups = checks.map(check => [check, readinessArgument(check)]).filter(([, argument]) => argument !== null);
    if (!groups.length) return {results: {}};
    const id = `check-${randomUUID()}`, bindingDirectory = join(context.directory, 'check-bindings', id);
    mkdirSync(bindingDirectory, {mode: 0o700});
    const processRef = `calls/${id}.process.json`, reportRef = `receipts/${id}.json`;
    const check = {id: 'adaptive.readiness.batch', version: '1', environment_ref: groups[0][0].environment_ref,
      argv: ['python3', '-c', `exec(${JSON.stringify(READINESS_BATCH)})`, READINESS_CODE,
        JSON.stringify(groups.map(([item, argument]) => [item.id, argument]))]};
    const {raw, report, container_removed} = await runDagDockerCheck({image, check, candidateDirectory: batchContext.candidateDirectory,
      pinnedDirectory: batchContext.pinnedDirectory, bindingDirectory, runCommand, remaining: context.remaining, record: context.record,
      attemptId: batchContext.batch_id, abortSignal: context.signal, saveProcess: async raw => context.save(processRef, raw)});
    if (raw.exit_code !== 0 || report.status !== 'completed' || report.results?.length !== groups.length) fail('ADAPTIVE_READINESS_BATCH_INVALID');
    const results = {};
    for (const [index, [item]] of groups.entries()) {
      const row = report.results[index];
      if (row?.check_id !== item.id || !Number.isSafeInteger(row.exit_code) || !object(row.report)
        || localReportInvalid({exit_code: row.exit_code, outcome_uncertain: raw.outcome_uncertain}, row.report)) fail('ADAPTIVE_READINESS_BATCH_INVALID');
      results[item.id] = {check_id: item.id, check_version: item.version, environment_ref: item.environment_ref,
        status: row.report.status, executed: row.report.executed, exit_code: row.exit_code, assertions: row.report.assertions,
        skipped: row.report.skipped, outcome_uncertain: false, evidence: {...row.report, report_ref: reportRef, process_ref: processRef,
          container_removed, batch: {id: batchContext.batch_id, mode: batchContext.mode, size: groups.length,
            artifact_revisions: Object.fromEntries(item.artifact_ids.map(artifact => [artifact, batchContext.artifact_revisions[artifact]]))}}};
    }
    context.save(reportRef, {batch_id: batchContext.batch_id, mode: batchContext.mode, round_index: batchContext.round_index,
      artifact_revisions: batchContext.artifact_revisions, envelopes: results});
    return {results};
  };
  const probeEnvironment = async () => {
    const raw = await runCommand('docker', ['image', 'inspect', image.image_id], {timeoutMs: Math.min(context.remaining(), 15000),
      maxBytes: 1024 * 1024, killProcessTree: true, abortSignal: context.signal});
    if (raw.outcome_uncertain) fail('ADAPTIVE_ENVIRONMENT_UNCERTAIN', {outcome_uncertain: true});
    if (raw.exit_code !== 0 || JSON.parse(raw.stdout)[0]?.Id !== image.image_id) fail('ADAPTIVE_IMAGE_PIN_MISMATCH');
    await context.record({event: 'adaptive_environment_identity_checked', image_id: image.image_id});
    return {...preflight.environment, image_id: image.image_id, dependency_versions_basis: 'preflight_probe_of_identical_immutable_image'};
  };
  // D085 check_error_repair: rerun one blocked public suite on the same candidate and pinned runner to capture the
  // generated files its import/syntax error names. A diagnosis, not a check; the controller never uses it as evidence.
  const diagnoseCheckError = async ({check, candidate_directory, pinned_directory, round_index}) => {
    context.remaining();
    const suite = check?.argv?.[check.argv.indexOf('--suite') + 1];
    if (!candidate_directory || !pinned_directory || check?.phase !== 'integration' || !/^[a-z0-9-]+$/.test(suite ?? '')) fail('ADAPTIVE_CHECK_ERROR_DIAGNOSIS_INPUT');
    const id = `diagnosis-${randomUUID()}`, bindingDirectory = join(context.directory, 'check-bindings', id);
    mkdirSync(bindingDirectory, {mode: 0o700});
    const script = readFileSync(join(rootDir, CHECK_ERROR_DIAGNOSIS_SCRIPT));
    writeFileSync(join(bindingDirectory, 'diagnose_check_error.py'), script, {mode: 0o600, flag: 'wx'});
    const processRef = `calls/${id}.process.json`, reportRef = `receipts/${id}.json`;
    const {raw, report} = await runDagDockerCheck({image, check: {...check, argv: ['python3', '/run/diagnose_check_error.py',
      '--runner', check.argv[1], '--suite', suite, '--binding', '/run/binding.json']}, candidateDirectory: candidate_directory,
    pinnedDirectory: pinned_directory, bindingDirectory, runCommand, remaining: context.remaining, record: context.record,
    attemptId: id, abortSignal: context.signal, saveProcess: async value => context.save(processRef, value)});
    if (raw.exit_code !== 0 || report?.schema_version !== 'adaptive-check-error-diagnosis/v1') fail('ADAPTIVE_CHECK_ERROR_DIAGNOSIS_INVALID');
    const diagnosis = {...report, status: 'completed', report_ref: reportRef, process_ref: processRef,
      script: {path: CHECK_ERROR_DIAGNOSIS_SCRIPT, sha256: sha(script)}};
    context.save(reportRef, {round_index, check_id: check.id, diagnosis});
    return diagnosis;
  };
  return {executeTask, checkTask, probeEnvironment, ...(readinessBatch ? {batchChecks} : {}),
    ...(manifest.repair_feedback?.check_error_repair ? {diagnoseCheckError} : {})};
}

/** Shared profile decision/commit path for fresh development and preserved-candidate repair. */
export function createAdaptiveProfilePreparer({rootDir = ROOT, manifest, context, session, input, catalog, profileSelections, decide}) {
  return async ({plan, round_index = 0, selected_task_ids, selected_action, failure, repair_history}) => {
      mkdirSync(join(context.directory, 'profiles'), {recursive: true, mode: 0o700});
      const phase = round_index === 0 ? 'initial' : 'repair';
      const selected = await selectAdaptiveProfiles({plan, catalog,
        requirement_descriptions: input.requirement_descriptions, phase, round_index,
        ...(selected_task_ids?.length ? {task_ids: selected_task_ids} : {}),
        ...(failure ? {failure} : {}), ...(selected_action ? {selected_action} : {}),
        prior_usage: session.receipts().filter(row => row.purpose === 'worker'),
        limits: manifest.limits, cli_version: manifest.profile_policy.cli_version,
        allowed_profile_ids: manifest.profile_policy.allowed_profile_ids,
        profilePolicy: profileOptions(manifest).profilePolicy,
        admitBatch: (request, metadata) => {
          const assess = inferredManifest(manifest) ? assessJevTokenAdmissionV4 : assessJevTokenAdmissionV3;
          const admission = assess(request, {stage: 'profiles',
            expectedRequestSha256: sha(prepareDecision(request).serialized),
            expectedPolicySha256: sha(readFileSync(join(rootDir, manifest.repair_policy.token_admission_contract)))});
          context.save(`profiles/${phase}-${round_index}-${metadata.batch_index ?? metadata.batch_id ?? sha(prepareDecision(request).serialized).slice(0, 12)}.admission.json`, admission);
          return admission;
        }, decide: decide ?? ((request, metadata) => session.decide('jev', request, metadata)), record: context.record,
        commit: async snapshot => context.save(`profiles/${phase}-${round_index}.commit.json`, snapshot)});
      context.save(`profiles/${phase}-${round_index}.result.json`, selected);
      if (selected.status !== 'selected' || selected.dispatch_allowed !== true) fail(selected.reason ?? 'ADAPTIVE_PROFILE_BLOCKED',
        {outcome_uncertain: uncertain(selected), terminal_cause: selected.terminal_cause});
      const applied = applyAdaptiveProfileSelections({plan, selection: selected, profilePolicy: profileOptions(manifest).profilePolicy});
      if (applied.dispatch_allowed !== true) fail('ADAPTIVE_PROFILE_NOT_COMMITTED');
      context.save(`profiles/${phase}-${round_index}.applied.json`, applied);
      for (const selection of applied.selections) profileSelections.set(selection.task_id, selection);
      return {plan: applied.plan};
    };
}

export async function runAdaptiveArm({rootDir = ROOT, manifest = loadAdaptiveRunManifest(), runDir, arm, preparationDirectory,
  spend = false, adapters = {}}) {
  if (!spend) fail('EXPLICIT_SPEND_REQUIRED');
  if (!Object.hasOwn(ADAPTIVE_ARMS, arm) || !manifest.arms.includes(arm)) fail('ADAPTIVE_ARM_INVALID');
  const context = createRunContext({rootDir, runDir, manifest, abortSignal: adapters.abortSignal});
  let session, execution = null, planning = null, prepared = null, stopCode = null, unknown = false, budgetBefore = null, budgetAfter = null,
    terminalCause = null, budgetObservationError = null, specReview = null;
  try {
    budgetBefore = await withAdaptiveSettledBudget({rootDir, manifest, remaining: context.remaining, record: context.record,
      abortSignal: context.signal, adapters, purpose: 'arm_start'}, snapshot =>
      assertAdaptiveCohortCapacity({manifest, rootDir, armIndex: manifest.arms.indexOf(arm), snapshot}).snapshot);
    context.save('budget-before.json', budgetBefore);
    const input = loadPublicInput(rootDir, manifest);
    prepared = loadAdaptiveSharedPreparation({rootDir, manifest, preparationDirectory, input});
    const planner = await import('../orchestration/adaptive-dag-planner.mjs');
    planner.validateAdaptiveCatalog({...input, catalog: prepared.catalog, limits: manifest.limits});
    context.pinSources(input, [relative(rootDir, prepared.catalog_path), relative(rootDir, join(prepared.directory, 'result.json'))]);
    context.save('catalog.json', prepared.catalog); context.save('public-input.json', input);
    context.save('protocol.json', {manifest, arm, stage_providers: {...ADAPTIVE_ARMS[arm],
      ...(inferredManifest(manifest) ? {repair_owners: 'jev'} : {})}, shared_preparation: prepared.result,
      catalog_file_sha256: prepared.result.catalog_file_sha256,
      ...(prepared.reused ? {preparation_reused: true, preparation_compatibility: prepared.compatibility} : {}),
      independent_grade: 'not_run_root_owned', automatic_retries: 0});
    const preflight = parallelManifest(manifest)
      ? adapters.cohortPreflight ?? await adaptivePreflight({rootDir, manifest, probe: true, adapters, remaining: context.remaining,
        record: context.record, abortSignal: context.signal})
      : await (adapters.preflight ?? preflightDagRun)({rootDir, manifest, probe: true, runCommand: adapters.runCommand,
        record: context.record, abortSignal: context.signal});
    if (parallelManifest(manifest) && adapters.cohortPreflight) await context.record({event: 'adaptive_cohort_preflight_reused',
      status: preflight.status, basis: 'common_preflight_completed_before_any_arm_dispatch'});
    context.save('preflight.json', preflight);
    if (!preflight.live_ready) fail('ADAPTIVE_PREFLIGHT_BLOCKED');
    const registry = loadPublicAuditInputs(rootDir, {registryPath: manifest.public_registry, runnerPath: manifest.public_runner}).registry;
    const checks = buildAdaptiveChecks({catalog: prepared.catalog, registry, manifest, source_ref: input.source_ref});
    session = createAdaptiveProviderSession({rootDir, manifest, run_id: context.run_id, runDirectory: context.directory,
      remaining: context.remaining, record: context.record, abortSignal: context.signal, adapters, ...adaptiveSpeedSessionOptions(manifest)});
    const decide = (request, decisionContext) => session.decide(ADAPTIVE_ARMS[arm][decisionContext.stage], request, decisionContext);
    const forms = isQuestionFormManifest(manifest) ? createQuestionFormHooks({session, record: context.record, manifest}) : null;
    const planningStarted = context.elapsed();
    planning = await (forms ? forms.plan : planner.planAdaptiveDag)({...input, catalog: prepared.catalog, checks, profile_id: manifest.worker_profile.id,
      goal_revision: input.source_ref.sha256, limits: manifest.limits, max_concurrency: manifest.limits.max_concurrency, decide,
      ...(balancedManifest(manifest) ? {decompositionPolicy: manifest.decomposition_policy.id} : {}),
      record: context.record, commit: async snapshot => context.save('plan-commit.json', snapshot)});
    context.save('planning.json', planning);
    if (planning.status !== 'planned' || planning.dispatch_allowed !== true) fail(planning.reason ?? 'ADAPTIVE_PLANNING_BLOCKED',
      {outcome_uncertain: uncertain(planning), terminal_cause: planning.terminal_cause});
    const profileSelections = new Map();
    const selectProfiles = createAdaptiveProfilePreparer({rootDir, manifest, context, session, input, catalog: prepared.catalog, profileSelections,
      decide: forms?.decideProfiles});
    if (arm === 'jev_profile') {
      const profiled = await selectProfiles({plan: planning.plan});
      planning = {...planning, plan: profiled.plan,
        execution_context: {...planning.execution_context, profile_id: null,
          initial_planning_profile_assumption: manifest.worker_profile.id,
          profile_policy: 'per_task_jev_selection', worker_profiles: profiled.plan.workers.map(row => ({...row})),
          profile_evidence_basis: 'Current dispatch profile IDs; actual model identity is verified in per-invocation receipts.'}};
      context.save('profiled-planning.json', planning);
    }
    await context.record({event: 'adaptive_planning_completed', started_at_ms: planningStarted, finished_at_ms: context.elapsed(),
      planning_stats: planning.stats ?? null, provider_decisions: session.decision_count()});
    const callbacks = createWorkerAndChecks({rootDir, manifest, context, session, input, catalog: prepared.catalog, registry, preflight, adapters,
      arm, profileSelections, readinessBatch: adaptiveRuntimeSpeed(manifest).readiness_batch});
    const {runAdaptiveDagExecution} = await import('../orchestration/adaptive-dag-execution.mjs');
    const repairProjection = repairManifest(manifest) ? await import('../orchestration/adaptive-repair-projection.mjs') : null;
    const artifactRepair = inferredManifest(manifest) ? await import('../orchestration/adaptive-inferred-repair.mjs')
      : causalManifest(manifest) ? await import('../orchestration/adaptive-causal-repair.mjs') : artifactRepairManifest(manifest) ? compactRepairManifest(manifest)
      ? await import('../orchestration/adaptive-artifact-repair-v2.mjs') : await import('../orchestration/adaptive-artifact-repair.mjs') : null;
    const assertionText = artifactRepair ? readFileSync(join(rootDir, manifest.repair_policy.assertion_contract), 'utf8') : null;
    const assertionContract = assertionText === null ? null : {contract: JSON.parse(assertionText), source_text: assertionText,
      sha256: sha(assertionText), source_path: manifest.repair_policy.assertion_contract};
    const testRequirements = loadAdaptiveTestRequirements(rootDir, manifest);
    execution = await runAdaptiveDagExecution({plan: planning.plan, artifactBindings: planning.artifactBindings, planning,
      run_id: context.run_id, runDirectory: context.directory, checkerRoot: rootDir,
      checkerFiles: [join(rootDir, 'src/benchmark/adaptive-dag-runner.mjs'), join(rootDir, 'src/orchestration/adaptive-dag-execution.mjs'),
        ...filesUnder(join(rootDir, manifest.public_checker_root))], environment: {id: manifest.public_environment_ref},
      ...callbacks, testRequirements, maxRepairRounds: manifest.max_repair_rounds, record: context.record,
      publicCheckConcurrency: adaptiveRuntimeSpeed(manifest).public_check_concurrency, ...adaptiveRepairBudgetOption(manifest), ...adaptiveRepairFeedbackOption(manifest),
      ...(arm === 'jev_profile' ? {prepareRoundPlan: selectProfiles} : {}),
      ...(inferredManifest(manifest) ? {decideRepairOwners: forms?.decideRepairOwners ?? ((request, metadata) => session.decide('jev', request, metadata))} : {}),
      ...(repairManifest(manifest) ? {repairScopePolicy: inferredManifest(manifest) ? `public-inferred-owner-${inferredPolicy(manifest).slice(-2)}` : causalManifest(manifest) ? 'public-causal-v1' : 'minimal-public-v1', projectRepairFailure: repairProjection.projectAdaptiveRepairFailure} : {}),
      ...(artifactRepair ? {artifactRepairPolicy: inferredManifest(manifest) ? inferredPolicy(manifest) : causalManifest(manifest) ? 'causal-v1' : compactRepairManifest(manifest) ? 'artifact-v2' : 'artifact-v1', assertionContract} : {}),
      decideRepair: forms?.decideRepair ?? (request => planner.chooseAdaptiveRepair({source: input.source, ...request,
        limits: {...manifest.limits, ...request.limits}, decide,
        ...(artifactRepair ? {buildRepairState: inferredManifest(manifest) ? artifactRepair.buildInferredRepairDecisionContext : causalManifest(manifest) ? artifactRepair.buildCausalRepairDecisionContext : artifactRepair.buildArtifactRepairDecisionContext,
          ...(causalManifest(manifest) ? {repairPolicy: inferredManifest(manifest) ? inferredPolicy(manifest) : 'causal-v1'} : {}),
          artifactBindings: planning.artifactBindings} : {projectRepairState: repairProjection?.projectAdaptiveRepairState}), record: context.record}))});
    context.save('execution.json', execution);
    unknown = uncertain(execution) || execution.rounds?.some(round => ['uncertain', 'invalid'].includes(round.journal?.status));
    terminalCause = execution.terminal_cause ? adaptiveTerminalCause(execution, {stage: 'execution'}) : null;
    if (execution.status !== 'completed') stopCode = execution.stop_code ?? execution.code ?? execution.rounds?.at(-1)?.fatal?.code
      ?? execution.rounds?.at(-1)?.workflow?.execution?.failure?.code ?? 'ADAPTIVE_EXECUTION_INCOMPLETE';
    if (execution.status === 'completed') context.remaining();
    // v12 spec review after a passed public gate; it never fails the run (adaptive-spec-review.mjs).
    if (forms?.afterPublicGate && execution.status === 'completed') {
      specReview = await forms.afterPublicGate({rootDir, runDirectory: context.directory, execution, input, catalog: prepared.catalog,
        runCommand: adapters.runCommand, remaining: context.remaining});
      if (specReview) context.save('spec-review-result.json', specReview);
    }
  } catch (error) {
    stopCode = codeOf(error); unknown ||= adaptiveOutcomeUncertain(error);
    terminalCause = adaptiveTerminalCause(error, {stage: 'execution', outcome_uncertain: unknown});
  }
  finally {
    try { budgetAfter = await withAdaptiveSettledBudget({rootDir, manifest, remaining: () => Math.max(1, manifest.limits.wall_timeout_seconds * 1000 - context.elapsed()),
      record: context.record, adapters, purpose: 'arm_end', allowBlockedSnapshot: true}, snapshot => snapshot); context.save('budget-after.json', budgetAfter); }
    catch (error) {
      budgetObservationError = adaptiveTerminalCause(error, {stage: 'budget', outcome_uncertain: true});
      // Accounting observation failure blocks follow-up, but does not rewrite a known provider rejection.
      if (!stopCode) { stopCode = codeOf(error); unknown = true; terminalCause = budgetObservationError; }
    }
  }
  const receipts = session?.receipts() ?? [], armWall = context.elapsed(), prepWall = prepared?.result.wall_ms ?? null;
  const changes = context.changes();
  if (changes.length) stopCode ??= 'ADAPTIVE_SOURCE_DRIFT';
  const result = {schema_version: 'adaptive-arm-result/v1', run_id: context.run_id, arm,
    status: unknown ? 'uncertain' : stopCode ? 'failed' : 'completed', stop_code: stopCode, outcome_uncertain: unknown,
    terminal_cause: terminalCause ?? (stopCode ? adaptiveTerminalCause({code: stopCode}, {stage: 'execution', outcome_uncertain: unknown}) : null),
    prior_public_failure: execution?.prior_public_failure ?? null,
    settlement_status: {status: budgetObservationError || !budgetAfter ? 'unavailable'
      : budgetAfter.reservations_pending ? 'pending' : budgetAfter.blocked_code ? 'blocked' : 'settled',
      reservations_pending: budgetAfter?.reservations_pending ?? null, blocked_code: budgetAfter?.blocked_code ?? null,
      observation_error: budgetObservationError},
    started_at: context.started_at, finished_at: new Date().toISOString(), wall_ms: armWall,
    shared_preparation_wall_ms: prepWall, full_preparation_inclusive_wall_ms: prepWall === null ? null : armWall + prepWall,
    amortized_preparation_inclusive_wall_ms: prepWall === null ? null : armWall + prepWall / manifest.arms.length,
    completion_wall_ms: null, product_success: null, independent_grade: 'not_run_root_owned',
    candidate_path: specReview?.adopted ? specReview.candidate_path : execution?.candidate_path ?? null, artifact_revisions: execution?.artifact_revisions ?? null,
    // artifact_revisions describe the gated candidate; an adopted review copy is identified by spec_review.files_after_sha256.
    ...(specReview ? {spec_review: specReview, artifact_revisions_basis: specReview.adopted ? 'pre_spec_review' : 'final_candidate',
      usage_including_spec_review: specReview.review_usage ? combinedUsage([adaptiveUsageSummary(receipts), adaptiveUsageSummary([{provider: 'claude',
        inference_started: true, usage: specReview.review_usage, api_equivalent_usd: specReview.review_api_equivalent_usd}])]) : null} : {}),
    public_status: execution?.status === 'completed' && !stopCode && !unknown ? 'passed' : 'not_passed',
    planning_stats: planning?.stats ?? null, decision_callbacks: session?.decision_count() ?? 0,
    operations: execution?.operations ?? null, repair_rounds_used: execution?.repair_rounds_used ?? 0,
    usage: adaptiveUsageSummary(receipts), shared_preparation_usage_full: prepared?.result.usage ?? null,
    usage_including_full_preparation: prepared ? combinedUsage([adaptiveUsageSummary(receipts), prepared.result.usage]) : null,
    decision_provider_questions: receipts.filter(row => row.purpose === 'decision').reduce((sum, row) => sum + (row.question_count ?? 0), 0),
    repair_decision_stats: execution?.repair_actions?.map(action => action.stats ?? null) ?? [],
    shared_preparation_usage_amortization_divisor: manifest.arms.length,
    shared_catalog_file_sha256: prepared?.result.catalog_file_sha256 ?? null, budget_before: budgetBefore, budget_after: budgetAfter,
    source_changes_during_run: changes, automatic_retries: 0, replay_allowed: false,
    ...(parallelManifest(manifest) ? {preparation_reused: prepared?.reused ?? null,
      preparation_compatibility: prepared?.compatibility ?? null,
      current_run_preparation_calls: 0, current_run_preparation_wall_ms: 0,
      preparation_cost_basis: 'Historical D066 preparation only; current arm usage excludes any repeated preparation charge.',
      budget_lock_wait_ms: receipts.filter(row => row.provider === 'jev').reduce((sum, row) => sum + (row.budget_lock_wait_ms ?? 0), 0),
      budget_lock_wait_basis: 'Provider receipt lock waits; begin/end/preflight snapshot waits are recorded separately in events. All waits are included in arm wall time.'} : {})};
  try { context.save('result.json', result); await context.record({event: 'adaptive_arm_terminal', status: result.status, outcome_uncertain: unknown}); }
  finally { context.close(); }
  return result;
}

/** v1 preserves sequential stopping. v2 dispatches all fresh arms and awaits every terminal outcome. */
export async function runAdaptiveComparison({rootDir = ROOT, manifest = loadAdaptiveRunManifest(), runDir, preparationDirectory,
  spend = false, adapters = {}}) {
  if (!spend) fail('EXPLICIT_SPEND_REQUIRED');
  const directory = freshRun(rootDir, runDir), started = performance.now(), startedAt = new Date().toISOString(), results = [],
    parallel = parallelManifest(manifest), intervals = [], active = new Set();
  writePrivateJson(join(directory, 'protocol.json'), {manifest, preparation_directory: resolve(preparationDirectory), arms: manifest.arms,
    sequential: !parallel, ...(parallel ? {cohort_concurrency: manifest.cohort_concurrency} : {}),
    independent_grade: 'not_run_root_owned', automatic_retries: 0});
  let preflightWall = null, maximumActive = 0;
  if (parallel) {
    const eventsFd = openSync(join(directory, 'events.jsonl'), 'wx', 0o600);
    const record = async event => { writeFileSync(eventsFd, JSON.stringify({recorded_at: new Date().toISOString(),
      elapsed_ms: performance.now() - started, ...event}) + '\n'); fsyncSync(eventsFd); };
    try {
      const preflight = await adaptivePreflight({rootDir, manifest, probe: true, adapters, record, abortSignal: adapters.abortSignal});
      preflightWall = performance.now() - started;
      writePrivateJson(join(directory, 'preflight.json'), preflight);
      if (!preflight.live_ready) fail('ADAPTIVE_PREFLIGHT_BLOCKED');
      const finished = new Map();
      const progress = () => writePrivateJson(join(directory, 'progress.json'), {active_arms: [...active],
        finished_arms: manifest.arms.filter(arm => finished.has(arm)), results: manifest.arms.filter(arm => finished.has(arm)).map(arm => finished.get(arm))}, {atomic: true});
      const settled = await Promise.allSettled(manifest.arms.map(async arm => {
        const interval = {arm, started_at: new Date().toISOString(), start_offset_ms: performance.now() - started};
        intervals.push(interval); active.add(arm); maximumActive = Math.max(maximumActive, active.size);
        let result;
        try {
          await record({event: 'adaptive_cohort_arm_started', arm, active_arm_count: active.size}); progress();
          result = await (adapters.runArm ?? runAdaptiveArm)({rootDir, manifest, arm, preparationDirectory,
            runDir: join(directory, arm), spend: true, adapters: {...adapters, cohortPreflight: preflight}});
        } catch (error) {
          result = {schema_version: 'adaptive-arm-dispatch-failure/v1', arm, status: uncertain(error) ? 'uncertain' : 'failed',
            stop_code: codeOf(error), outcome_uncertain: uncertain(error), usage: null, product_success: null,
            candidate_path: null, completion_wall_ms: null, started_at: interval.started_at, finished_at: new Date().toISOString(),
            wall_ms: performance.now() - started - interval.start_offset_ms, error_boundary: 'cohort_dispatch_or_terminal_collection', replay_allowed: false};
        } finally {
          interval.finished_at = new Date().toISOString(); interval.finish_offset_ms = performance.now() - started;
          interval.wall_ms = interval.finish_offset_ms - interval.start_offset_ms; active.delete(arm);
        }
        finished.set(arm, result); progress();
        await record({event: 'adaptive_cohort_arm_terminal', arm, status: result.status, outcome_uncertain: result.outcome_uncertain,
          active_arm_count: active.size});
        return result;
      }));
      results.push(...settled.map((item, index) => item.status === 'fulfilled' ? item.value : {
        schema_version: 'adaptive-arm-dispatch-failure/v1', arm: manifest.arms[index], status: 'uncertain',
        stop_code: codeOf(item.reason), outcome_uncertain: true, usage: null, product_success: null, candidate_path: null,
        completion_wall_ms: null, error_boundary: 'cohort_terminal_recording', replay_allowed: false}));
    } finally { closeSync(eventsFd); }
  } else {
    for (const arm of manifest.arms) {
      const result = await (adapters.runArm ?? runAdaptiveArm)({rootDir, manifest, arm, preparationDirectory,
        runDir: join(directory, arm), spend: true, adapters});
      results.push(result);
      writePrivateJson(join(directory, 'progress.json'), {finished_arms: results.map(item => item.arm), results}, {atomic: true});
      if (result.outcome_uncertain || result.stop_code?.includes('BUDGET') || result.stop_code?.includes('SOURCE_DRIFT')
        || result.stop_code?.includes('PREPARATION') || result.stop_code === 'ADAPTIVE_PREFLIGHT_BLOCKED') break;
    }
  }
  const prepUsage = results.find(item => item.shared_preparation_usage_full)?.shared_preparation_usage_full ?? null;
  const prepWall = results.find(item => item.shared_preparation_wall_ms != null)?.shared_preparation_wall_ms ?? null;
  const elapsed = performance.now() - started;
  const result = {schema_version: 'adaptive-comparison-result/v1', status: results.some(item => item.outcome_uncertain) ? 'uncertain'
    : results.length !== manifest.arms.length ? 'stopped' : results.some(item => item.status !== 'completed') ? 'failed' : 'completed',
    outcome_uncertain: results.some(item => item.outcome_uncertain), started_at: startedAt, finished_at: new Date().toISOString(),
    wall_ms: elapsed, shared_preparation_wall_ms_actual_once: prepWall,
    preparation_inclusive_cohort_wall_ms: prepWall === null ? null : elapsed + prepWall,
    usage_actual_once: parallel ? combinedUsage(results.map(item => item.usage))
      : prepUsage ? combinedUsage([prepUsage, ...results.map(item => item.usage)]) : null,
    results, completed_arms: results.length, planned_arms: manifest.arms.length,
    terminal_collection_complete: results.length === manifest.arms.length,
    failed_arm_count: results.filter(item => item.status === 'failed').length,
    product_success: null, successful_completion_comparison: null, independent_grade: 'not_run_root_owned',
    accounting: manifest.preparation_accounting, automatic_retries: 0, replay_allowed: false,
    ...(parallel ? {schema_version: 'adaptive-comparison-result/v2', cohort_concurrency: manifest.cohort_concurrency,
      maximum_simultaneously_active_arms: maximumActive, shared_preflight_wall_ms: preflightWall,
      arm_intervals: intervals, overlap: adaptiveArmOverlap(intervals), all_started_arms_terminal: results.length === manifest.arms.length,
      preparation_reused: true, current_run_preparation_calls: 0, current_run_preparation_wall_ms: 0,
      current_cohort_wall_ms: elapsed, historical_preparation_usage_reference: prepUsage,
      historical_preparation_inclusive_usage_reference: prepUsage ? combinedUsage([prepUsage, ...results.map(item => item.usage)]) : null,
      budget_lock_wait_basis: 'Arms overlap, while the shared ledger serializes Jev reservation through settlement. Arm wall time includes lock waits.'} : {})};
  writePrivateJson(join(directory, 'result.json'), result); return result;
}

function adaptiveArmOverlap(intervals) {
  const events = intervals.flatMap(interval => [{at: interval.start_offset_ms, delta: 1}, {at: interval.finish_offset_ms, delta: -1}])
    .sort((left, right) => left.at - right.at || left.delta - right.delta);
  const durationByCount = {}; let previous = 0, count = 0;
  for (const event of events) {
    durationByCount[count] = (durationByCount[count] ?? 0) + event.at - previous;
    count += event.delta; previous = event.at;
  }
  return {basis: 'Arm dispatch-to-terminal collection intervals, including startup, checks and budget waits; not simultaneous provider HTTP requests.',
    duration_by_active_arm_count_ms: durationByCount,
    two_or_more_active_arms_wall_ms: Object.entries(durationByCount).filter(([activeCount]) => Number(activeCount) >= 2)
      .reduce((sum, [, duration]) => sum + duration, 0)};
}

export async function preflightAdaptiveComparison({rootDir = ROOT, manifest = loadAdaptiveRunManifest(), probe = false, ...options} = {}) {
  if (parallelManifest(manifest)) return {...await adaptivePreflight({rootDir, manifest, probe, ...options,
    adapters: {...options.adapters, ...(options.runCommand ? {runCommand: options.runCommand} : {})}}),
    schema_version: 'adaptive-preflight/v2', arms: manifest.arms, protocol: manifest, paid_calls: 0};
  const capacity = assertAdaptiveCohortCapacity({manifest, rootDir});
  return {...await preflightDagRun({rootDir, manifest, probe, ...options}), schema_version: 'adaptive-preflight/v1',
    cohort_capacity: capacity, arms: manifest.arms, protocol: manifest, paid_calls: 0};
}

// Preserve the same source pinning, provider boundary and check transport for repair-only runs.
export {createRunContext as createAdaptiveRunContext, loadPublicInput as loadAdaptivePublicInput,
  createWorkerAndChecks as createAdaptiveWorkerAndChecks, adaptivePreflight as preflightAdaptiveRun,
  withAdaptiveSettledBudget};
