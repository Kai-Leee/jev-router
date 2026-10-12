import {createHash} from 'node:crypto';
import {chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, relative, resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {isDeepStrictEqual} from 'node:util';
import {validateDagPlan} from '../orchestration/dag-contracts.mjs';
import {runAdaptiveDagExecution} from '../orchestration/adaptive-dag-execution.mjs';
import {buildArtifactRepairDecisionContext} from '../orchestration/adaptive-artifact-repair-v2.mjs';
import {buildCausalRepairDecisionContext} from '../orchestration/adaptive-causal-repair.mjs';
import {applyAdaptiveProfileSelections} from '../orchestration/adaptive-profile-selection.mjs';
import {chooseAdaptiveRepair, validateAdaptiveCatalog} from '../orchestration/adaptive-dag-planner.mjs';
import {adaptiveOutcomeUncertain, adaptiveTerminalCause} from '../orchestration/adaptive-failure.mjs';
import {adaptiveRepairBudgetOption, adaptiveRepairFeedbackOption, adaptiveRuntimeSpeed, adaptiveSpeedSessionOptions, adaptiveUsageSummary, assertAdaptiveCohortCapacity, buildAdaptiveChecks,
  createAdaptiveProviderSession, createAdaptiveRunContext, createAdaptiveWorkerAndChecks, loadAdaptivePublicInput, loadAdaptiveRunManifest,
  loadAdaptiveTestRequirements, preflightAdaptiveRun, withAdaptiveSettledBudget} from './adaptive-dag-runner.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
const DEFAULT_MANIFEST = 'benchmarks/e2e-swe/manifests/d076-preserved-repair.json';
const speedManifest = manifest => manifest.schema_version === 'adaptive-dag-comparison/v11';
const recoveryManifest = manifest => speedManifest(manifest) || manifest.schema_version === 'adaptive-dag-comparison/v10';
const causalManifest = manifest => manifest.schema_version === 'adaptive-dag-comparison/v7';
const compactInferredManifest = manifest => recoveryManifest(manifest) || manifest.schema_version === 'adaptive-dag-comparison/v9';
const inferredManifest = manifest => compactInferredManifest(manifest) || manifest.schema_version === 'adaptive-dag-comparison/v8';
const DESCRIPTION_PROTOCOL = 'benchmarks/e2e-swe/public-checks/description-provenance.v1.json';
const clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };
const read = path => JSON.parse(readFileSync(path));
const inside = (parent, child) => { const path = relative(parent, child); return path === '' || (!path.startsWith('..') && !isAbsolute(path)); };
const safePath = path => typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !/[\\\x00-\x1f:]/.test(path)
  && path.split('/').every(part => part && part !== '.' && part !== '..');
const same = (actual, expected, code) => { if (!isDeepStrictEqual(actual, expected)) fail(code); };
const failedCases = evidence => (evidence ?? []).flatMap(item => (item.evidence?.cases ?? []).filter(test => test.status === 'failed')
  .map(test => ({check_id: item.check_id, test_id: test.test_id ?? test.id, error_type: test.error_type ?? null, message: test.message ?? null})))
  .sort((a, b) => `${a.check_id}/${a.test_id}`.localeCompare(`${b.check_id}/${b.test_id}`));

/** A starting condition is explicit and hash-bound; an incremental candidate cannot enter the primary comparison. */
export function verifyPreservedSourceCondition({rootDir, directory, manifest, result, resultSha256}) {
  if (!recoveryManifest(manifest)) return null;
  const condition = manifest.preserved_source, terminal = condition?.mode === 'terminal_preserved_failure';
  if (!condition || !['initial_profile_failure', 'terminal_preserved_failure'].includes(condition.mode)
    || !safePath(condition.directory) || resolve(rootDir, condition.directory) !== directory
    || !/^[a-f0-9]{64}$/.test(condition.result_sha256 ?? '') || condition.result_sha256 !== resultSha256
    || condition.comparison !== (terminal ? 'incremental_only' : 'same_start_as_d073_focused_new_02')
    || !Number.isSafeInteger(condition.expected_public_failed_count) || condition.expected_public_failed_count < 1
    || failedCases(result.prior_public_failure?.public_evidence).length !== condition.expected_public_failed_count
    || (result.kind === 'preserved_artifact_repair') !== terminal) fail('PRESERVED_START_CONDITION_MISMATCH');
  return {...clone(condition), source_result_sha256: resultSha256,
    boundary: terminal ? 'Incremental repair from a previously repaired candidate; not the primary same-start comparison.'
      : 'Same original candidate as the named previous preserved run; new bootstrap and repair costs only.'};
}

/** Pure filesystem inspection: full immutable exported files only, never a grader or provider. */
export function preservedCandidateSnapshot(directory) {
  const root = resolve(directory);
  if (realpathSync(root) !== root || !lstatSync(root).isDirectory()) fail('PRESERVED_CANDIDATE_ALIAS');
  const files = [], seen = new Set();
  function visit(path) {
    const target = join(root, path), stat = lstatSync(target);
    if (stat.isSymbolicLink() || realpathSync(target) !== target || seen.has(path.toLowerCase())) fail('PRESERVED_CANDIDATE_ALIAS');
    seen.add(path.toLowerCase());
    if (stat.isDirectory()) for (const child of readdirSync(target).sort()) visit(path ? `${path}/${child}` : child);
    else if (stat.isFile() && stat.nlink === 1) {
      if (!safePath(path)) fail('PRESERVED_CANDIDATE_PATH_INVALID');
      const mode = stat.mode & 0o7777;
      if (![0o444, 0o555].includes(mode)) fail('PRESERVED_CANDIDATE_MODE', {path, mode});
      const bytes = readFileSync(target);
      files.push({path, bytes: bytes.length, mode, sha256: hash(bytes)});
    } else fail('PRESERVED_CANDIDATE_ALIAS');
  }
  visit('');
  return {schema_version: 'preserved-candidate-snapshot/v1', directory: root,
    files: files.sort((a, b) => a.path.localeCompare(b.path))};
}

export function preservedArtifactRevisions(snapshot, artifactBindings) {
  const files = new Map(snapshot.files.map(file => [file.path, file]));
  return Object.fromEntries(Object.entries(artifactBindings).map(([id, binding]) => {
    if (!Array.isArray(binding.paths) || !binding.paths.length || binding.paths.some(path => !safePath(path) || !files.has(path))) fail('PRESERVED_ARTIFACT_PATH_INVALID');
    const manifest = {files: binding.paths.map(path => files.get(path)).map(file => ({path: file.path, size: file.bytes,
      sha256: file.sha256, executable: !!(file.mode & 0o111)})).sort((a, b) => a.path.localeCompare(b.path)), directories: []};
    return [id, digest(manifest)];
  }));
}

function validateOwnership(planning, snapshot) {
  const plan = validateDagPlan(planning.plan), bindings = planning.artifactBindings;
  if (!bindings || Object.keys(bindings).length !== plan.artifacts.length) fail('PRESERVED_ARTIFACT_COVERAGE');
  const owners = new Map(), artifactOwners = new Map(plan.artifacts.map(artifact => [artifact.id, artifact.producer_task_id]));
  for (const task of plan.tasks.filter(task => task.kind === 'implementation')) {
    const paths = task.output_artifact_ids.flatMap(id => {
      if (artifactOwners.get(id) !== task.id || !Array.isArray(bindings[id]?.paths)) fail('PRESERVED_OWNER_MISMATCH');
      return bindings[id].paths;
    });
    same([...paths].sort(), [...task.write_scope].sort(), 'PRESERVED_OWNER_PATH_MISMATCH');
    for (const path of paths) {
      if (!safePath(path) || owners.has(path.toLowerCase())) fail('PRESERVED_OWNER_PATH_MISMATCH');
      owners.set(path.toLowerCase(), task.id);
    }
  }
  same([...owners.keys()].sort(), snapshot.files.map(file => file.path.toLowerCase()).sort(), 'PRESERVED_CANDIDATE_COVERAGE');
  return plan;
}

/** Explicit public-gate upgrade only. The historical plan is never rewritten. */
export function upgradePreservedPublicGate({planning, historicalRegistry, historicalChecks, registry, checks, protocol, assertionContract}) {
  const legacyIds = historicalRegistry.flatMap(check => check.test_ids ?? []), extra = registry.at(-1);
  if (protocol?.schema_version !== 'public-description-provenance-protocol/v1'
    || protocol.legacy_test_count !== 85 || protocol.additional_test_count !== 8 || protocol.total_test_count !== 93
    || historicalRegistry.length !== 7 || legacyIds.length !== 85 || new Set(legacyIds).size !== 85 || registry.length !== 8
    || protocol.tests?.length !== 8 || extra?.id !== protocol.check_id || protocol.check_version !== '4'
    || assertionContract?.contract?.version !== '2' || hash(assertionContract.source_text) !== assertionContract.sha256
    || !isDeepStrictEqual(JSON.parse(assertionContract.source_text), assertionContract.contract)) fail('PRESERVED_GATE_UPGRADE_INVALID');
  same(planning.plan.checks, historicalChecks, 'PRESERVED_HISTORICAL_CHECK_DEFINITION_MISMATCH');
  const normalized = check => Object.fromEntries(Object.entries(check).filter(([key]) => !['version', 'runner_ref', 'argv'].includes(key)));
  for (let index = 0; index < historicalRegistry.length; index++) {
    same(normalized(registry[index]), normalized(historicalRegistry[index]), 'PRESERVED_LEGACY_GATE_MEANING_CHANGED');
    if (historicalRegistry[index].version !== '3' || registry[index].version !== '4') fail('PRESERVED_GATE_UPGRADE_INVALID');
  }
  const additionalIds = protocol.tests.map(test => test.id);
  same(extra.test_ids, additionalIds, 'PRESERVED_ADDITIONAL_GATE_MISMATCH');
  if (new Set([...legacyIds, ...additionalIds]).size !== 93 || extra.version !== '4'
    || !isDeepStrictEqual(extra.requirement_ids, ['R10.02'])) fail('PRESERVED_ADDITIONAL_GATE_MISMATCH');
  const expected = protocol.tests.map(test => {
    const definitions = assertionContract.contract.assertions.filter(row => row.test_id === test.id && row.check_id === extra.id);
    if (!isDeepStrictEqual(test.requirement_refs, ['R10.02']) || definitions.length !== 1
      || definitions[0].id !== test.assertion_id || !isDeepStrictEqual(definitions[0].requirement_ids, ['R10.02'])) fail('PRESERVED_ADDITIONAL_GATE_MISMATCH');
    return {check_id: extra.id, test_id: test.id, assertion_id: test.assertion_id, scenario: test.scenario, function: test.function};
  });
  same(historicalChecks.filter(check => check.phase !== 'integration'), checks.filter(check => check.phase !== 'integration'),
    'PRESERVED_READINESS_DEFINITION_CHANGED');
  same(checks.filter(check => check.phase === 'integration').map(check => check.id), registry.map(check => check.id), 'PRESERVED_ADDITIONAL_GATE_MISMATCH');
  const next = clone(planning), verification = next.plan.tasks.filter(task => task.kind === 'verification');
  if (verification.length !== 1) fail('PRESERVED_GATE_UPGRADE_INVALID');
  next.plan.checks = clone(checks);
  verification[0].check_ids = registry.map(check => check.id);
  // The generated ownership/DAG is reused, but this runtime plan has new gate semantics.
  next.plan.graph_revision = digest({historical_graph_revision: planning.plan.graph_revision, public_checks: checks});
  next.plan = validateDagPlan(next.plan);
  const upgrade = {schema_version: 'preserved-public-gate-upgrade/v1', historical_graph_revision: planning.plan.graph_revision,
    runtime_graph_revision: next.plan.graph_revision, historical_plan_sha256: digest(planning.plan), runtime_plan_sha256: digest(next.plan),
    historical_check_count: historicalRegistry.length, historical_test_count: 85, current_check_count: registry.length, current_test_count: 93,
    historical_checks_sha256: digest(historicalChecks), current_checks_sha256: digest(checks),
    legacy_check_ids: historicalRegistry.map(check => check.id), additional_check_id: extra.id, expected_failures: expected,
    assertion_contract_sha256: assertionContract.sha256,
    allowed_changes: ['plan.checks', 'verification.check_ids', 'plan.graph_revision'],
    boundary: 'New public gate on an exact historical candidate copy; no historical result or source is regraded in place.'};
  return {planning: next, gate_upgrade: upgrade};
}

function historicalRoundPlan(input, roundIndex) {
  const plan = clone(input), verificationTasks = plan.tasks.filter(task => task.kind === 'verification');
  if (verificationTasks.length !== 1) fail('PRESERVED_PROFILE_PLAN_MISMATCH');
  const verificationTask = verificationTasks[0], publicChecks = verificationTask.check_ids.map(id => plan.checks.find(check => check.id === id));
  if (!publicChecks.length || publicChecks.some(check => check?.phase !== 'integration')) fail('PRESERVED_PROFILE_PLAN_MISMATCH');
  const aggregate = {id: `adaptive-public-aggregate-${digest(publicChecks).slice(0, 16)}`, version: digest(publicChecks), phase: 'integration',
    artifact_ids: plan.artifacts.map(artifact => artifact.id), requirement_ids: clone(verificationTask.requirement_ids),
    runner_ref: 'src/orchestration/adaptive-dag-execution.mjs', argv: ['controller:collect-all-public-checks'],
    cwd: publicChecks[0].cwd, environment_ref: publicChecks[0].environment_ref, source_ref: 'src/orchestration/adaptive-dag-execution.mjs'};
  plan.checks.push(aggregate); verificationTask.check_ids.unshift(aggregate.id);
  plan.graph_revision = `${input.graph_revision}:adaptive-round-${roundIndex}`;
  return plan;
}

/** Verify historical profile dispatch without treating it as a new selection or new spend. */
export function verifyPreservedProfileHistory({historicalPlanning, profiledPlanning, finalRound, selection, commit, applied, receipts,
  profilePolicy = 'bounded-v1'}) {
  if (selection?.status !== 'selected' || selection.dispatch_allowed !== true || selection.phase !== 'initial'
    || selection.round_index !== 0 || commit?.dispatch_allowed !== false || applied?.dispatch_allowed !== true
    || finalRound?.round_index !== 0 || profiledPlanning?.execution_context?.profile_policy !== 'per_task_jev_selection'
    || profiledPlanning.execution_context.profile_id !== null) fail('PRESERVED_PROFILE_HISTORY_INVALID');
  same({...selection, dispatch_allowed: false}, commit, 'PRESERVED_PROFILE_COMMIT_MISMATCH');
  const verified = applyAdaptiveProfileSelections({plan: historicalPlanning.plan, selection, profilePolicy});
  same(verified, applied, 'PRESERVED_PROFILE_APPLICATION_MISMATCH');
  same(profiledPlanning.plan, applied.plan, 'PRESERVED_PROFILE_PLAN_MISMATCH');
  // The executor adds one controller aggregate and a round suffix; no worker authority changes.
  if (!Array.isArray(finalRound.operations)) fail('PRESERVED_PROFILE_PLAN_MISMATCH');
  const expectedRoundPlan = historicalRoundPlan(applied.plan, 0);
  same(finalRound.plan, expectedRoundPlan, 'PRESERVED_PROFILE_PLAN_MISMATCH');
  same({...profiledPlanning, plan: historicalPlanning.plan, execution_context: historicalPlanning.execution_context},
    historicalPlanning, 'PRESERVED_PROFILE_PLAN_AUTHORITY_CHANGED');
  same(profiledPlanning.execution_context.worker_profiles, applied.plan.workers, 'PRESERVED_PROFILE_PLAN_MISMATCH');
  if (selection.catalog_sha256 !== hash(JSON.stringify(historicalPlanning.catalog))) fail('PRESERVED_PROFILE_CATALOG_MISMATCH');
  const tasks = applied.plan.tasks.filter(task => task.kind === 'implementation');
  same(selection.selections.map(row => row.task_id).sort(), tasks.map(task => task.id).sort(), 'PRESERVED_PROFILE_COVERAGE');
  if (!Array.isArray(receipts) || receipts.length !== tasks.length
    || new Set(receipts.map(row => row.receipt?.task_id)).size !== tasks.length
    || new Set(receipts.map(row => row.receipt?.attempt_id)).size !== tasks.length) fail('PRESERVED_PROFILE_RECEIPT_COVERAGE');
  const workers = tasks.map(task => {
    const chosen = selection.selections.find(row => row.task_id === task.id);
    const observed = receipts.find(row => row.receipt?.task_id === task.id), receipt = observed?.receipt;
    const operation = finalRound.operations.filter(row => row.task_id === task.id);
    if (operation.length !== 1 || operation[0].operation !== 'implementation'
      || receipt?.purpose !== 'worker' || receipt.provider !== 'claude' || receipt.status !== 'completed'
      || receipt.outcome_uncertain !== false || receipt.inference_started !== true
      || receipt.round_index !== 0 || receipt.operation !== 'implementation' || receipt.attempt_id !== operation[0].attempt_id
      || receipt.requested_profile?.id !== chosen.profile_id || receipt.requested_profile.model !== chosen.model
      || receipt.requested_profile.effort !== chosen.effort || receipt.requested_model !== chosen.model
      || receipt.executed_model_arg !== chosen.model || receipt.requested_effort !== chosen.effort
      || receipt.executed_effort_arg !== chosen.effort || receipt.model_identity_verified !== true
      || !Array.isArray(receipt.observed_models) || receipt.observed_models.length !== 1
      || receipt.observed_models[0] !== chosen.model || !safePath(observed.source_path)) fail('PRESERVED_PROFILE_IDENTITY_MISMATCH');
    return {task_id: task.id, worker_id: task.worker_id, profile_id: chosen.profile_id, model: chosen.model, effort: chosen.effort,
      decision_id: chosen.decision_id, attempt_id: receipt.attempt_id, receipt_ref: observed.source_path,
      model_identity_verified: true, effective_effort_verified: receipt.effective_effort_verified ?? null};
  });
  return {schema_version: 'preserved-profile-history/v1', phase: 'historical_initial_implementation',
    worker_count: workers.length, initial_selection_id: selection.selection_id, profile_revision: applied.profile_revision,
    original_plan_sha256: applied.source_plan_sha256, profiled_plan_sha256: applied.applied_plan_sha256,
    workers, current_run_provider_calls: 0,
    ...(profilePolicy === 'provider-limits-v2' ? {historical_profile_policy: profilePolicy} : {}),
    boundary: 'Historical selected models and recorded CLI identity only; not new profile selection, current spend or provider-internal effort acknowledgement.'};
}

function verifyHistoricalGateSources({rootDir, manifest, directory, protocol, pins, sources}) {
  if (!Array.isArray(pins)) fail('PRESERVED_HISTORICAL_GATE_SOURCE_DRIFT');
  same(protocol.manifest.public_checker_root, manifest.public_checker_root, 'PRESERVED_HISTORICAL_GATE_SOURCE_DRIFT');
  const required = [manifest.public_registry, manifest.public_runner, manifest.repair_policy.assertion_contract];
  same([protocol.manifest.public_registry, protocol.manifest.public_runner, protocol.manifest.repair_policy.assertion_contract],
    required, 'PRESERVED_HISTORICAL_GATE_SOURCE_DRIFT');
  const profilePaths = compactInferredManifest(manifest)
    ? [protocol.manifest.profile_policy.contract, protocol.manifest.profile_policy.candidate_contract] : [];
  for (const path of new Set([...required, ...profilePaths,
    ...pins.filter(row => row.path.startsWith(`${manifest.public_checker_root}/`)).map(row => row.path)])) {
    const pin = pins.filter(row => row.path === path);
    if (!safePath(path) || pin.length !== 1 || !safePath(pin[0].snapshot) || !pin[0].snapshot.startsWith('sources/')
      || hash(readFileSync(join(rootDir, path))) !== pin[0].sha256) fail('PRESERVED_HISTORICAL_GATE_SOURCE_DRIFT');
    const snapshotPath = join(directory, pin[0].snapshot), stat = lstatSync(snapshotPath);
    if (!stat.isFile() || stat.isSymbolicLink() || realpathSync(snapshotPath) !== snapshotPath) fail('PRESERVED_SOURCE_FILE_ALIAS');
    const bytes = readFileSync(snapshotPath); sources[relative(rootDir, snapshotPath)] = hash(bytes);
    if (hash(bytes) !== pin[0].sha256) fail('PRESERVED_HISTORICAL_GATE_SOURCE_DRIFT');
  }
}

/** Historical profile answers are audited for v8; no past repair answer is reused. */
export function inspectPreservedRepairSource({rootDir = ROOT, sourceRunDirectory, manifest = loadAdaptiveRunManifest(join(rootDir, DEFAULT_MANIFEST), rootDir)}) {
  if (typeof sourceRunDirectory !== 'string') fail('PRESERVED_SOURCE_RUN_REQUIRED');
  const directory = resolve(sourceRunDirectory), benchmarkRoot = join(resolve(rootDir), 'benchmark-runs');
  if (!inside(benchmarkRoot, directory) || directory === benchmarkRoot || realpathSync(directory) !== directory) fail('PRESERVED_SOURCE_RUN_PATH');
  const sources = {};
  function source(name) {
    const path = join(directory, name), stat = lstatSync(path);
    if (!safePath(name) || !inside(directory, path) || !stat.isFile() || stat.isSymbolicLink() || realpathSync(path) !== path) fail('PRESERVED_SOURCE_FILE_ALIAS');
    const bytes = readFileSync(path); sources[relative(rootDir, path)] = hash(bytes); return JSON.parse(bytes);
  }
  const result = source('result.json'), historicalPlanning = source('planning.json'), input = source('public-input.json'), catalog = source('catalog.json');
  const condition = verifyPreservedSourceCondition({rootDir, directory, manifest, result,
    resultSha256: sources[relative(rootDir, join(directory, 'result.json'))]});
  // The initial-implementation audit below cannot authenticate a later repair's
  // profile applications or carry history. Do not reset a no-progress history by
  // treating a terminal preserved run as a fresh implementation source.
  if (condition?.mode === 'terminal_preserved_failure') fail('PRESERVED_TERMINAL_REPAIR_HISTORY_REQUIRED');
  let planning = historicalPlanning, gateUpgrade = null, profileHistory = null;
  const causal = causalManifest(manifest), inferred = inferredManifest(manifest);
  if (result.schema_version !== 'adaptive-arm-result/v1' || planning.status !== 'planned' || planning.dispatch_allowed !== true
    || (causal ? result.public_status !== 'passed' || result.status !== 'completed' || result.outcome_uncertain !== false
      : result.public_status === 'passed' || !['failed', 'uncertain', 'stopped'].includes(result.status))) fail(causal ? 'PRESERVED_PASSED_LEGACY_SOURCE_REQUIRED' : 'PRESERVED_FAILED_SOURCE_REQUIRED');
  if (inferred) {
    if (result.arm !== 'jev_profile' || result.status !== 'failed' || result.outcome_uncertain !== false) fail('PRESERVED_PROFILE_FAILED_SOURCE_REQUIRED');
    const priorExecution = source('execution.json'), finalRound = priorExecution.rounds?.at(-1), protocol = source('protocol.json');
    const sourceSchema = protocol.manifest?.schema_version;
    const allowedSourceSchemas = compactInferredManifest(manifest) ? ['adaptive-dag-comparison/v7', 'adaptive-dag-comparison/v8'] : ['adaptive-dag-comparison/v7'];
    if (!allowedSourceSchemas.includes(sourceSchema) || protocol.arm !== 'jev_profile'
      || priorExecution.rounds.length !== 1 || priorExecution.status !== 'failed' || priorExecution.outcome_uncertain !== false
      || finalRound?.status !== 'failed' || finalRound.outcome_uncertain !== false) fail('PRESERVED_PROFILE_FAILED_SOURCE_REQUIRED');
    const profilePolicy = sourceSchema === 'adaptive-dag-comparison/v8' ? 'provider-limits-v2' : 'bounded-v1';
    if (protocol.manifest.profile_policy?.contract !== `docs/orchestration/contracts/adaptive-profile-selection.${profilePolicy === 'provider-limits-v2' ? 'v2' : 'v1'}.json`) {
      fail('PRESERVED_PROFILE_HISTORY_INVALID');
    }
    planning = source('profiled-planning.json');
    const receipts = readdirSync(join(directory, 'receipts')).filter(name => /^claude-[0-9]+\.json$/.test(name))
      .map(name => ({source_path: `receipts/${name}`, receipt: source(`receipts/${name}`)})).filter(row => row.receipt.purpose === 'worker');
    profileHistory = verifyPreservedProfileHistory({historicalPlanning, profiledPlanning: planning, finalRound,
      selection: source('profiles/initial-0.result.json'), commit: source('profiles/initial-0.commit.json'),
      applied: source('profiles/initial-0.applied.json'), receipts, profilePolicy});
    same(priorExecution.prior_public_failure, result.prior_public_failure, 'PRESERVED_HISTORICAL_FAILURE_MISMATCH');
    same(finalRound.public_evidence, result.prior_public_failure?.public_evidence, 'PRESERVED_HISTORICAL_FAILURE_MISMATCH');
    same(priorExecution.artifact_revisions, result.artifact_revisions, 'PRESERVED_SOURCE_REVISION_MISMATCH');
    same(finalRound.exported?.artifact_revisions, result.artifact_revisions, 'PRESERVED_SOURCE_REVISION_MISMATCH');
    if (priorExecution.candidate_path !== result.candidate_path || finalRound.exported?.candidateDirectory !== result.candidate_path
      || result.prior_public_failure?.failed_task_ids?.length !== 0) fail('PRESERVED_HISTORICAL_PUBLIC_FAILURE_UNVERIFIED');
    verifyHistoricalGateSources({rootDir, manifest, directory, protocol, pins: source('source-pins.json'), sources});
  }
  const candidateDirectory = typeof result.candidate_path === 'string' ? resolve(result.candidate_path) : '';
  if (!inside(join(directory, 'adaptive-execution'), candidateDirectory) || !candidateDirectory.endsWith('/runtime/candidate')) fail('PRESERVED_CANDIDATE_LOCATION');
  const currentInput = loadAdaptivePublicInput(rootDir, manifest);
  same(input, currentInput, 'PRESERVED_PUBLIC_SOURCE_MISMATCH');
  same(catalog, planning.catalog, 'PRESERVED_CATALOG_MISMATCH');
  if (planning.catalog_sha256 !== hash(JSON.stringify(catalog)) || planning.source_sha256 !== input.source_ref.sha256
      || planning.plan.goal_revision !== input.source_ref.sha256) fail('PRESERVED_PLAN_SOURCE_MISMATCH');
  validateAdaptiveCatalog({...currentInput, catalog, limits: manifest.limits});
  const snapshot = preservedCandidateSnapshot(candidateDirectory), plan = validateOwnership(planning, snapshot);
  const revisions = preservedArtifactRevisions(snapshot, planning.artifactBindings);
  same(revisions, result.artifact_revisions, 'PRESERVED_SOURCE_REVISION_MISMATCH');
  const registry = read(join(rootDir, manifest.public_registry));
  if (inferred && (!completePublicEvidence(result.prior_public_failure.public_evidence, registry)
    || registry.flatMap(check => check.test_ids).length !== 93)) fail('PRESERVED_HISTORICAL_PUBLIC_FAILURE_UNVERIFIED');
  if (inferred) for (const evidence of result.prior_public_failure.public_evidence) same(evidence.artifact_revisions, revisions, 'PRESERVED_HISTORICAL_PUBLIC_REVISION_MISMATCH');
  const currentChecks = buildAdaptiveChecks({catalog, registry, manifest, source_ref: input.source_ref});
  let expectedFailure = failedCases(result.prior_public_failure?.public_evidence);
  if (causal) {
    const protocol = source('protocol.json'), pins = source('source-pins.json'), priorExecution = source('execution.json');
    if (!Array.isArray(pins) || protocol.manifest?.schema_version !== 'adaptive-dag-comparison/v6') fail('PRESERVED_HISTORICAL_GATE_SOURCE_REQUIRED');
    const pin = pins.filter(row => row.path === protocol.manifest.public_registry);
    if (pin.length !== 1 || !safePath(pin[0].snapshot) || !pin[0].snapshot.startsWith('sources/')
      || !/^[a-f0-9]{64}$/.test(pin[0].sha256)) fail('PRESERVED_HISTORICAL_GATE_SOURCE_REQUIRED');
    const historicalRegistry = source(pin[0].snapshot);
    if (sources[relative(rootDir, join(directory, pin[0].snapshot))] !== pin[0].sha256) fail('PRESERVED_HISTORICAL_GATE_SOURCE_DRIFT');
    const finalRound = priorExecution.rounds?.at(-1);
    if (priorExecution.status !== 'completed' || finalRound?.status !== 'completed'
      || priorExecution.candidate_path !== candidateDirectory || finalRound.exported?.candidateDirectory !== candidateDirectory
      || !completePublicEvidence(finalRound.public_evidence, historicalRegistry)
      || finalRound.public_evidence.some(item => item.status !== 'passed' || item.evidence.cases.some(test => test.status !== 'passed'))) {
      fail('PRESERVED_HISTORICAL_PUBLIC_PASS_UNVERIFIED');
    }
    same(priorExecution.artifact_revisions, revisions, 'PRESERVED_SOURCE_REVISION_MISMATCH');
    same(finalRound.exported.artifact_revisions, revisions, 'PRESERVED_SOURCE_REVISION_MISMATCH');
    for (const evidence of finalRound.public_evidence) same(evidence.artifact_revisions, revisions, 'PRESERVED_HISTORICAL_PUBLIC_REVISION_MISMATCH');
    const descriptionPath = join(rootDir, DESCRIPTION_PROTOCOL), assertionPath = join(rootDir, manifest.repair_policy.assertion_contract);
    const descriptionBytes = readFileSync(descriptionPath), assertionText = readFileSync(assertionPath, 'utf8');
    sources[DESCRIPTION_PROTOCOL] = hash(descriptionBytes); sources[manifest.repair_policy.assertion_contract] = hash(assertionText);
    const descriptionProtocol = JSON.parse(descriptionBytes);
    if (descriptionProtocol.public_source?.sha256 !== input.source_ref.sha256
      || descriptionProtocol.public_source?.path !== input.source_ref.path) fail('PRESERVED_PUBLIC_SOURCE_MISMATCH');
    const upgrade = upgradePreservedPublicGate({planning, historicalRegistry,
      historicalChecks: buildAdaptiveChecks({catalog, registry: historicalRegistry, manifest: protocol.manifest, source_ref: input.source_ref}),
      registry, checks: currentChecks, protocol: descriptionProtocol,
      assertionContract: {contract: JSON.parse(assertionText), source_text: assertionText, sha256: hash(assertionText)}});
    planning = upgrade.planning; gateUpgrade = upgrade.gate_upgrade; expectedFailure = null;
  } else {
    // Historical v5 requires exact original checks and exact observed failure text.
    same(plan.checks, currentChecks, 'PRESERVED_CHECK_DEFINITION_MISMATCH');
    if (!expectedFailure.length || expectedFailure.some(item => !item.test_id)) fail('PRESERVED_PUBLIC_FAILURE_REQUIRED');
  }
  return {schema_version: 'preserved-repair-source/v1', directory, candidateDirectory, planning, input, registry,
    snapshot, artifact_revisions: revisions, expected_failed_cases: expectedFailure, sources,
    ...(causal ? {historical_planning: historicalPlanning, gate_upgrade: gateUpgrade} : {}),
    ...(inferred ? {historical_planning: historicalPlanning, source_profile_history: profileHistory,
      inferred_repair_required: true, expected_failed_count: expectedFailure.length} : {}),
    ...(condition ? {comparison_condition: condition} : {}),
    historical_status: result.status, historical_run_id: result.run_id, historical_wall_ms: result.wall_ms,
    candidate_snapshot_sha256: digest(snapshot.files), public_specification_unchanged: true, check_definitions_unchanged: !causal};
}

function verifySource(source) {
  const observed = preservedCandidateSnapshot(source.candidateDirectory);
  same(observed.files, source.snapshot.files, 'PRESERVED_SOURCE_CANDIDATE_DRIFT');
  same(preservedArtifactRevisions(observed, source.planning.artifactBindings), source.artifact_revisions, 'PRESERVED_SOURCE_REVISION_DRIFT');
  validateOwnership(source.planning, observed);
  return observed;
}

function copyTask(source, task, stageDirectory) {
  const original = source.planning.plan.tasks.find(item => item.id === task.id);
  if (!original || !isDeepStrictEqual(task.write_scope, original.write_scope)
    || !isDeepStrictEqual(task.output_artifact_ids, original.output_artifact_ids)) fail('PRESERVED_BOOTSTRAP_OWNER_DRIFT');
  for (const path of task.write_scope) {
    const expected = source.snapshot.files.find(file => file.path === path);
    if (!expected || !safePath(path)) fail('PRESERVED_BOOTSTRAP_PATH');
    const sourcePath = join(source.candidateDirectory, path), stat = lstatSync(sourcePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || realpathSync(sourcePath) !== sourcePath
      || (stat.mode & 0o7777) !== expected.mode || hash(readFileSync(sourcePath)) !== expected.sha256) fail('PRESERVED_SOURCE_CANDIDATE_DRIFT');
    const destination = join(stageDirectory, path);
    if (!inside(stageDirectory, destination) || existsSync(destination)) fail('PRESERVED_BOOTSTRAP_DESTINATION');
    mkdirSync(dirname(destination), {recursive: true, mode: 0o700});
    if (realpathSync(dirname(destination)) !== dirname(destination)) fail('PRESERVED_BOOTSTRAP_DESTINATION');
    copyFileSync(sourcePath, destination); chmodSync(destination, expected.mode | 0o200);
    if (hash(readFileSync(destination)) !== expected.sha256) fail('PRESERVED_BOOTSTRAP_COPY_DRIFT');
  }
}

function completePublicEvidence(evidence, registry) {
  if (!Array.isArray(evidence) || evidence.length !== registry.length) return false;
  const ids = new Set();
  return registry.every(definition => {
    const item = evidence.find(row => row.check_id === definition.id), report = item?.evidence;
    if (!item || ids.has(item.check_id) || item.outcome_uncertain !== false || item.executed !== true
      || !['passed', 'failed'].includes(item.status) || item.skipped !== 0 || !Array.isArray(report?.cases)
      || !Array.isArray(report.unexecuted_test_ids) || report.unexecuted_test_ids.length) return false;
    ids.add(item.check_id);
    if (definition.version !== undefined && (item.check_version !== definition.version || report.check_version !== definition.version)) return false;
    return isDeepStrictEqual(report.cases.map(test => test.test_id ?? test.id), definition.test_ids)
      && report.cases.every(test => ['passed', 'failed'].includes(test.status));
  });
}

/** No provider authorization from an old pass or diagnostic alone: rerun the new gate. */
export function verifyPreservedFailureRecheck(source, failure) {
  if (!completePublicEvidence(failure?.public_evidence, source.registry)
    || failure.failed_task_ids?.length !== 0 || failure.outcome_uncertain !== false) fail('PRESERVED_PUBLIC_RECHECK_INCOMPLETE');
  if (!source.gate_upgrade) {
    same(failedCases(failure.public_evidence), source.expected_failed_cases, 'PRESERVED_FAILURE_CHANGED');
    return {kind: 'exact_historical_public_failure', failed_cases: failedCases(failure.public_evidence)};
  }
  const gate = source.gate_upgrade, legacy = failure.public_evidence.filter(item => gate.legacy_check_ids.includes(item.check_id));
  if (legacy.length !== gate.legacy_check_ids.length || legacy.some(item => item.status !== 'passed'
    || item.evidence.cases.some(test => test.status !== 'passed')) || legacy.reduce((n, item) => n + item.evidence.cases.length, 0) !== 85) {
    fail('PRESERVED_LEGACY_GATE_REGRESSION');
  }
  const extra = failure.public_evidence.find(item => item.check_id === gate.additional_check_id);
  if (extra?.status !== 'failed' || extra.evidence.assertion_contract_sha256 !== gate.assertion_contract_sha256
    || extra.evidence.cases.length !== 8 || gate.expected_failures.length !== 8) fail('PRESERVED_ADDITIONAL_FAILURE_NOT_REPRODUCED');
  for (const expected of gate.expected_failures) {
    const testcase = extra.evidence.cases.find(test => test.test_id === expected.test_id), observed = testcase?.description_provenance;
    if (testcase?.status !== 'failed' || testcase.error_type !== 'AssertionError' || testcase.failed_assertion_id !== expected.assertion_id
      || !isDeepStrictEqual(testcase.assertion_results, [{assertion_id: expected.assertion_id, status: 'failed'}])
      || observed?.schema_version !== 'public-description-provenance/v1' || observed.scenario !== expected.scenario
      || observed.function !== expected.function) fail('PRESERVED_ADDITIONAL_FAILURE_NOT_REPRODUCED');
  }
  return {kind: 'explicit_new_public_gate_failure', historical_test_count: 85, historical_passed: 85,
    additional_test_count: 8, additional_failed: 8, assertion_contract_sha256: gate.assertion_contract_sha256,
    failed_cases: failedCases(failure.public_evidence)};
}

function inheritanceProof(source, execution) {
  const proofs = [], incomplete = [];
  for (let index = 1; index < execution.rounds.length; index++) {
    const before = execution.rounds[index - 1], after = execution.rounds[index];
    if (!before.exported?.candidateDirectory || !after.exported?.candidateDirectory) continue;
    const selected = execution.repair_actions.find(action => action.round_index === index - 1)?.candidate?.artifact_ids;
    if (!Array.isArray(selected)) fail('PRESERVED_REPAIR_ACTION_MISSING');
    const left = preservedCandidateSnapshot(before.exported.candidateDirectory), right = preservedCandidateSnapshot(after.exported.candidateDirectory);
    const missing = source.snapshot.files.filter(file => !right.files.some(item => item.path === file.path)).map(file => file.path);
    if (missing.length && execution.status !== 'completed') {
      incomplete.push({from_round: index - 1, to_round: index, selected_artifact_ids: [...selected],
        status: 'not_verified', reason: 'Failed round exported an incomplete candidate; no inheritance success is claimed.',
        missing_paths: missing, observed_files: right.files, exported_artifact_revisions: after.exported.artifact_revisions});
      continue;
    }
    validateOwnership(source.planning, left); validateOwnership(source.planning, right);
    same(preservedArtifactRevisions(left, source.planning.artifactBindings), before.exported.artifact_revisions, 'PRESERVED_EXPORT_REVISION_DRIFT');
    same(preservedArtifactRevisions(right, source.planning.artifactBindings), after.exported.artifact_revisions, 'PRESERVED_EXPORT_REVISION_DRIFT');
    const inherited = [];
    for (const artifact of source.planning.plan.artifacts.filter(artifact => !selected.includes(artifact.id))) {
      const paths = source.planning.artifactBindings[artifact.id].paths;
      const files = left.files.filter(file => paths.includes(file.path));
      same(files, right.files.filter(file => paths.includes(file.path)), 'PRESERVED_NONSELECTED_EXPORT_DRIFT');
      same(before.exported.artifact_revisions[artifact.id], after.exported.artifact_revisions[artifact.id], 'PRESERVED_NONSELECTED_REVISION_DRIFT');
      inherited.push({artifact_id: artifact.id, revision: after.exported.artifact_revisions[artifact.id], files});
    }
    proofs.push({from_round: index - 1, to_round: index, selected_artifact_ids: [...selected],
      inherited_artifacts: inherited, exact_bytes_modes_and_revisions: true});
  }
  return {proofs, incomplete};
}

/** Final observations must not replace a known provider rejection with a later deadline. */
export function preservedRepairTerminalState(execution, remaining) {
  if (execution.status === 'completed') {
    remaining();
    return {stopCode: null, unknown: false, terminalCause: null};
  }
  const stopCode = execution.stop_code ?? 'PRESERVED_REPAIR_INCOMPLETE', unknown = adaptiveOutcomeUncertain(execution);
  return {stopCode, unknown, terminalCause: execution.terminal_cause
    ?? adaptiveTerminalCause({code: stopCode}, {stage: 'repair', outcome_uncertain: unknown})};
}

/** Callback-only loop for offline tests and the real session below. Round0 is a copy, never an implementation model call. */
export async function executePreservedArtifactRepair({source, run_id, runDirectory, checkerRoot, checkerFiles,
  environment, probeEnvironment, checkTask, executeRepairTask, decideRepair, assertionContract,
  decideRepairOwners, prepareRoundPlan, maxRepairRounds = 2, testRequirements = {},
  failureRecoveryPolicy, recoverFailure, repairInputPolicy, batchChecks, publicCheckConcurrency, repairBudget, repairFeedback,
  repairScopePolicy = 'minimal-public-v1', artifactRepairPolicy = 'artifact-v2', record = async () => {}}) {
  if (![executeRepairTask, decideRepair, checkTask, probeEnvironment].every(value => typeof value === 'function')) fail('PRESERVED_CALLBACKS_REQUIRED');
  if (!Number.isSafeInteger(maxRepairRounds) || maxRepairRounds < 1 || maxRepairRounds > 2) fail('PRESERVED_REPAIR_LIMIT');
  const causal = repairScopePolicy === 'public-causal-v1' && artifactRepairPolicy === 'causal-v1';
  const inferred = (repairScopePolicy === 'public-inferred-owner-v1' && artifactRepairPolicy === 'inferred-v1')
    || (repairScopePolicy === 'public-inferred-owner-v2' && artifactRepairPolicy === 'inferred-v2');
  if ((!causal && !inferred && (repairScopePolicy !== 'minimal-public-v1' || artifactRepairPolicy !== 'artifact-v2'))
    || Boolean(source.gate_upgrade) !== causal || Boolean(source.inferred_repair_required) !== inferred
    || (inferred && (typeof decideRepairOwners !== 'function' || typeof prepareRoundPlan !== 'function'))) fail('PRESERVED_REPAIR_POLICY_MISMATCH');
  const recovering = failureRecoveryPolicy === 'evidence-loop-v1';
  if ((failureRecoveryPolicy !== undefined && !recovering)
    || (recovering && (!inferred || artifactRepairPolicy !== 'inferred-v2' || typeof recoverFailure !== 'function' || repairInputPolicy !== 'evidence-v1'))
    || (!recovering && (recoverFailure !== undefined || repairInputPolicy !== undefined || source.historical_repair_history))) {
    fail('PRESERVED_RECOVERY_POLICY_MISMATCH');
  }
  verifySource(source);
  const started = performance.now(), elapsed = () => performance.now() - started;
  const metrics = {bootstrap_copy_tasks: 0, bootstrap_copy_worker_provider_calls: 0, bootstrap_copy_task_wall_ms_sum: 0,
    bootstrap_public_recheck_wall_ms: null, bootstrap_round_wall_ms: null, repair_phase_wall_ms: null,
    new_repair_decision_callbacks: 0, new_owner_decision_callbacks: 0, repair_profile_preparation_callbacks: 0,
    repair_worker_callbacks: 0, initial_failure_reproduced: false,
    initial_failure_basis: causal ? 'new_public_gate_on_preserved_legacy_passed_candidate'
      : inferred ? 'historical_profile_public_failure' : 'historical_public_failure'};
  if (recovering) metrics.recovery_callbacks = 0;
  const rounds = new Map(); let publicStarted = null, bootstrapEnded = null, bootstrapProof = null;
  const forward = async event => {
    if (event.event === 'adaptive_public_check_started' && event.round_index === 0 && publicStarted === null) publicStarted = elapsed();
    if (event.event === 'adaptive_round_completed') {
      rounds.set(event.round_index, clone(event));
      if (event.round_index === 0) {
        bootstrapEnded = elapsed(); metrics.bootstrap_round_wall_ms = bootstrapEnded;
        metrics.bootstrap_public_recheck_wall_ms = publicStarted === null ? null : bootstrapEnded - publicStarted;
      }
    }
    await record(event);
  };
  const verifyBeforeDecision = async (request, context) => {
    verifySource(source);
    if (context.round_index === 0 && !metrics.initial_failure_reproduced) {
      const exported = rounds.get(0)?.candidate_path;
      if (!exported || !completePublicEvidence(request.failure.public_evidence, source.registry)) fail('PRESERVED_PUBLIC_RECHECK_INCOMPLETE');
      const snapshot = preservedCandidateSnapshot(exported);
      same(snapshot.files, source.snapshot.files, 'PRESERVED_BOOTSTRAP_EXPORT_DRIFT');
      same(preservedArtifactRevisions(snapshot, source.planning.artifactBindings), source.artifact_revisions, 'PRESERVED_BOOTSTRAP_REVISION_DRIFT');
      same(request.failure.artifact_revisions, source.artifact_revisions, 'PRESERVED_RECHECK_REVISION_DRIFT');
      const recheck = verifyPreservedFailureRecheck(source, request.failure);
      metrics.initial_failure_reproduced = true;
      bootstrapProof = {candidate_path: exported, file_count: snapshot.files.length,
        snapshot_sha256: digest(snapshot.files), artifact_revisions: clone(request.failure.artifact_revisions),
        initial_failed_cases: failedCases(request.failure.public_evidence), exact_original_bytes_modes_and_revisions: true,
        binding_digest: request.failure.binding_digest, environment: clone(request.failure.environment), recheck};
      await record({event: 'preserved_public_failure_reproduced', ...bootstrapProof, provider_calls_during_bootstrap: 0});
    }
    if (!metrics.initial_failure_reproduced) fail('PRESERVED_FAILURE_NOT_REPRODUCED');
  };
  let execution = await runAdaptiveDagExecution({plan: source.planning.plan, planning: source.planning,
    artifactBindings: source.planning.artifactBindings, run_id, runDirectory, checkerRoot, checkerFiles, environment,
    probeEnvironment, checkTask, assertionContract, testRequirements, maxRepairRounds,
    repairScopePolicy, artifactRepairPolicy, record: forward,
    ...(batchChecks !== undefined ? {batchChecks} : {}),
    ...(publicCheckConcurrency !== undefined ? {publicCheckConcurrency} : {}),
    ...(repairBudget !== undefined ? {repairBudget} : {}),
    ...(repairFeedback !== undefined ? {repairFeedback} : {}),
    ...(recovering ? {failureRecoveryPolicy, repairInputPolicy,
      historicalRepairHistory: source.historical_repair_history ?? null,
      recoverFailure: async (request, context) => {
        await verifyBeforeDecision(request, context);
        metrics.recovery_callbacks++;
        return recoverFailure(request, context);
      }} : {}),
    ...(inferred ? {
      beforeRepairDecision: verifyBeforeDecision,
      decideRepairOwners: async (request, metadata) => {
        if (!metrics.initial_failure_reproduced) fail('PRESERVED_FAILURE_NOT_REPRODUCED');
        verifySource(source); metrics.new_owner_decision_callbacks++;
        return decideRepairOwners(request, metadata);
      },
      prepareRoundPlan: async request => {
        if (!metrics.initial_failure_reproduced || request.round_index < 1) fail('PRESERVED_PROFILE_BEFORE_RECHECK');
        verifySource(source); metrics.repair_profile_preparation_callbacks++;
        return prepareRoundPlan(request);
      },
    } : {}),
    executeTask: async (task, context) => {
      verifySource(source);
      if (context.round_index === 0) {
        if (context.operation !== 'implementation') fail('PRESERVED_BOOTSTRAP_OPERATION');
        const began = performance.now(); copyTask(source, task, context.stageDirectory);
        metrics.bootstrap_copy_tasks++;
        const wall = performance.now() - began; metrics.bootstrap_copy_task_wall_ms_sum += wall;
        await record({event: 'preserved_candidate_seed_copied', task_id: task.id, attempt_id: context.attempt_id,
          round_index: 0, file_count: task.write_scope.length, wall_ms: wall, provider_calls: 0,
          interpretation: 'Existing executor implementation operation is deterministic copy, not model generation.'});
        return {status: 'completed', outcome_uncertain: false};
      }
      if (!metrics.initial_failure_reproduced || context.operation !== 'repair' || !context.repair_context?.artifact_repair) fail('PRESERVED_UNSELECTED_WORKER_DISPATCH');
      metrics.repair_worker_callbacks++;
      return executeRepairTask(task, context);
    },
    decideRepair: async (request, context) => {
      await verifyBeforeDecision(request, context);
      metrics.new_repair_decision_callbacks++;
      return decideRepair(request, context);
    }});
  verifySource(source);
  if (bootstrapEnded !== null) metrics.repair_phase_wall_ms = elapsed() - bootstrapEnded;
  const inherited = inheritanceProof(source, execution);
  for (const proof of inherited.proofs) await record({event: 'preserved_export_inheritance_verified', ...proof});
  for (const proof of inherited.incomplete) await record({event: 'preserved_export_inheritance_unverified', ...proof});
  // A candidate already passing in round0 is not evidence that a repair was executed.
  if (!metrics.initial_failure_reproduced && execution.status === 'completed') execution = {...execution,
    status: 'failed', stop_code: 'PRESERVED_FAILURE_NOT_REPRODUCED', outcome_uncertain: false,
    terminal_cause: {stage: 'repair', code: 'PRESERVED_FAILURE_NOT_REPRODUCED', http_status: null, category: null, outcome_uncertain: false}};
  return {execution, metrics, bootstrap_proof: bootstrapProof, inherited_export_proofs: inherited.proofs,
    incomplete_export_proofs: inherited.incomplete,
    original_candidate_unchanged: true, original_candidate_snapshot_sha256: source.candidate_snapshot_sha256 ?? digest(source.snapshot.files)};
}

function filesUnder(directory) {
  return readdirSync(directory).sort().flatMap(name => {
    const path = join(directory, name), stat = lstatSync(path);
    if (stat.isSymbolicLink()) fail('PRESERVED_CHECKER_SYMLINK');
    return stat.isDirectory() ? filesUnder(path) : [path];
  });
}

export async function runPreservedArtifactRepair({rootDir = ROOT,
  manifest = loadAdaptiveRunManifest(join(rootDir, DEFAULT_MANIFEST), rootDir), sourceRunDirectory, runDir, spend = false, adapters = {}}) {
  if (!spend) fail('EXPLICIT_SPEND_REQUIRED');
  const causal = causalManifest(manifest), inferred = inferredManifest(manifest), arm = inferred ? 'jev_profile' : 'jev_all';
  const recovering = recoveryManifest(manifest);
  const inferredVersion = compactInferredManifest(manifest) ? 'v2' : 'v1';
  const profileSelection = inferred ? 'jev_selected_repair_tasks_only_historical_initial_profiles_preserved' : 'fixed_opus_medium_no_profile_decision';
  if ((!causal && !inferred && manifest.schema_version !== 'adaptive-dag-comparison/v5')
    || manifest.worker_profile?.model !== 'claude-opus-5-5' || manifest.worker_profile?.effort !== 'medium'
    || manifest.repair_policy?.artifact_contract !== (causal || inferred ? 'docs/orchestration/contracts/adaptive-causal-repair.v1.json' : 'docs/orchestration/contracts/adaptive-artifact-repair.v2.json')
    || manifest.repair_policy?.token_admission_contract !== `docs/orchestration/contracts/jev-token-admission.${inferred ? 'v4' : causal ? 'v3' : 'v2'}.json`
    || (causal && manifest.repair_policy?.scope_contract !== 'public-causal-v1')
    || (inferred && (manifest.repair_policy?.scope_contract !== `public-inferred-owner-${inferredVersion}`
      || manifest.repair_policy?.owner_inference_contract !== `docs/orchestration/contracts/adaptive-inferred-repair.${inferredVersion}.json`))) fail('PRESERVED_V2_OR_CAUSAL_MANIFEST_REQUIRED');
  if (recovering) {
    const gate = manifest.transmission_preflight, recovery = manifest.failure_recovery;
    const gateVersion = Number(/^docs\/orchestration\/contracts\/jev-transmission-preflight\.v(\d+)\.json$/.exec(gate?.contract ?? '')?.[1]);
    if (gate?.mode !== 'required' || (speedManifest(manifest) ? !(gateVersion >= 2) : gateVersion !== 1)
      || recovery?.mode !== 'required' || recovery.policy !== 'evidence-loop-v1'
      || recovery.contract !== 'docs/orchestration/contracts/adaptive-failure-recovery.v1.json'
      || [gate, recovery].some(policy => !/^[a-f0-9]{64}$/.test(policy.sha256 ?? '')
        || hash(readFileSync(join(rootDir, policy.contract))) !== policy.sha256)) fail('PRESERVED_RECOVERY_MANIFEST_REQUIRED');
  }
  const target = typeof runDir === 'string' ? resolve(runDir) : '';
  const speed = speedManifest(manifest);
  if (dirname(target) !== join(resolve(rootDir), 'benchmark-runs') || !(speed ? /^d076-[A-Za-z0-9_.-]+$/ : recovering ? /^d075-[A-Za-z0-9_.-]+$/ : inferred ? /^d073-[A-Za-z0-9_.-]+$/ : causal ? /^d071-[A-Za-z0-9_.-]+$/ : /^d070-[A-Za-z0-9_.-]+$/).test(basename(target))) {
    fail(speed ? 'PRESERVED_FRESH_D076_RUN_REQUIRED' : recovering ? 'PRESERVED_FRESH_D075_RUN_REQUIRED' : inferred ? 'PRESERVED_FRESH_D073_RUN_REQUIRED' : causal ? 'PRESERVED_FRESH_D071_RUN_REQUIRED' : 'PRESERVED_FRESH_D070_RUN_REQUIRED');
  }
  if (typeof sourceRunDirectory !== 'string' || inside(resolve(sourceRunDirectory), target)) fail('PRESERVED_SOURCE_DESTINATION_OVERLAP');
  const context = createAdaptiveRunContext({rootDir, manifest, runDir: target, abortSignal: adapters.abortSignal});
  let session, source = null, outcome = null, stopCode = null, unknown = false, terminalCause = null,
    budgetBefore = null, budgetAfter = null, budgetObservationError = null;
  try {
    source = inspectPreservedRepairSource({rootDir, sourceRunDirectory, manifest});
    context.pinSources(source.input, ['src/benchmark/preserved-artifact-repair-runner.mjs', 'scripts/preserved-artifact-repair.mjs',
      ...(recovering ? ['src/orchestration/adaptive-repair-input.mjs', 'docs/orchestration/contracts/adaptive-repair-input.v1.json',
        'src/orchestration/adaptive-failure-recovery.mjs', manifest.failure_recovery.contract,
        'src/orchestration/jev-transmission-preflight.mjs', manifest.transmission_preflight.contract] : []), ...Object.keys(source.sources)]);
    context.save('preserved-source.json', {schema_version: source.schema_version, directory: source.directory,
      candidateDirectory: source.candidateDirectory, sources: source.sources, snapshot: source.snapshot,
      artifact_revisions: source.artifact_revisions, expected_failed_cases: source.expected_failed_cases,
      check_definitions_unchanged: source.check_definitions_unchanged, gate_upgrade: source.gate_upgrade ?? null,
      source_profile_history: source.source_profile_history ?? null, inferred_repair_required: inferred,
      ...(recovering ? {comparison_condition: source.comparison_condition} : {})});
    context.save('planning.json', source.planning); context.save('catalog.json', source.planning.catalog); context.save('public-input.json', source.input);
    if (source.historical_planning) context.save('historical-planning.json', source.historical_planning);
    if (source.source_profile_history) context.save('historical-profile-evidence.json', source.source_profile_history);
    if (source.gate_upgrade) {
      context.save('public-gate-upgrade.json', source.gate_upgrade);
    }
    context.save('protocol.json', {manifest, kind: 'preserved_artifact_repair', source_run: source.directory,
      source_snapshot_sha256: source.candidate_snapshot_sha256,
      stage_providers: {...(inferred ? {repair_owners: 'jev', profiles: 'jev'} : {}), repair: 'jev', worker: 'claude'},
      bootstrap: 'deterministic source copy and current complete public recheck; no model implementation',
      public_gate_upgrade: source.gate_upgrade ?? null, worker_profile_selection: profileSelection,
      source_profile_history: source.source_profile_history ?? null,
      ...(recovering ? {comparison_condition: source.comparison_condition,
        failure_recovery: manifest.failure_recovery, repair_input_policy: 'evidence-v1',
        transmission_preflight: manifest.transmission_preflight} : {}),
      new_repair_decision_required: true, prior_diagnostic_answer_reused: false, automatic_retries: 0, independent_grade: 'not_run_root_owned'});
    budgetBefore = await withAdaptiveSettledBudget({rootDir, manifest, remaining: context.remaining, record: context.record,
      abortSignal: context.signal, adapters, purpose: 'preserved_repair_start'}, snapshot => assertAdaptiveCohortCapacity({rootDir, manifest, snapshot}).snapshot);
    context.save('budget-before.json', budgetBefore);
    const preflight = await preflightAdaptiveRun({rootDir, manifest, probe: true, adapters, record: context.record,
      remaining: context.remaining, abortSignal: context.signal});
    context.save('preflight.json', preflight);
    if (!preflight.live_ready) fail('ADAPTIVE_PREFLIGHT_BLOCKED');
    session = createAdaptiveProviderSession({rootDir, manifest, run_id: context.run_id, runDirectory: context.directory,
      remaining: context.remaining, record: context.record, abortSignal: context.signal, adapters, ...adaptiveSpeedSessionOptions(manifest)});
    const profileSelections = new Map(), runtimeSpeed = adaptiveRuntimeSpeed(manifest);
    const callbacks = createAdaptiveWorkerAndChecks({rootDir, manifest, context, session, input: source.input,
      catalog: source.planning.catalog, registry: source.registry, preflight, adapters, arm, profileSelections,
      readinessBatch: runtimeSpeed.readiness_batch});
    const inferredRepair = inferred ? await import('../orchestration/adaptive-inferred-repair.mjs') : null;
    const recoverFailure = recovering ? (await import('../orchestration/adaptive-repair-input.mjs')).createRepairInputRecovery() : null;
    const buildInferredState = inferred ? (compactInferredManifest(manifest)
      ? request => inferredRepair.buildInferredRepairDecisionContext({...request, ownerInputPolicy: 'inferred-v2',
        ...(recovering ? {repairInputPolicy: 'evidence-v1'} : {})})
      : inferredRepair.buildInferredRepairDecisionContext) : null;
    const prepareRoundPlan = inferred ? (await import('./adaptive-dag-runner.mjs')).createAdaptiveProfilePreparer({
      rootDir, manifest, context, session, input: source.input, catalog: source.planning.catalog, profileSelections}) : null;
    const sourceText = readFileSync(join(rootDir, manifest.repair_policy.assertion_contract), 'utf8');
    const assertionContract = {source_text: sourceText, contract: JSON.parse(sourceText), sha256: hash(sourceText), source_path: manifest.repair_policy.assertion_contract};
    const testRequirements = loadAdaptiveTestRequirements(rootDir, manifest);
    outcome = await executePreservedArtifactRepair({source, run_id: context.run_id, runDirectory: context.directory,
      checkerRoot: rootDir, checkerFiles: [join(rootDir, 'src/benchmark/adaptive-dag-runner.mjs'), join(rootDir, 'src/orchestration/adaptive-dag-execution.mjs'),
        ...filesUnder(join(rootDir, manifest.public_checker_root))], environment: {id: manifest.public_environment_ref},
      probeEnvironment: callbacks.probeEnvironment, checkTask: callbacks.checkTask, executeRepairTask: callbacks.executeTask,
      assertionContract, maxRepairRounds: manifest.max_repair_rounds, testRequirements, record: context.record,
      batchChecks: callbacks.batchChecks, publicCheckConcurrency: runtimeSpeed.public_check_concurrency,
      ...adaptiveRepairBudgetOption(manifest), ...adaptiveRepairFeedbackOption(manifest),
      ...(recovering ? {failureRecoveryPolicy: manifest.failure_recovery.policy, repairInputPolicy: 'evidence-v1', recoverFailure} : {}),
      ...(inferred ? {repairScopePolicy: `public-inferred-owner-${inferredVersion}`, artifactRepairPolicy: `inferred-${inferredVersion}`, prepareRoundPlan,
        decideRepairOwners: (body, decisionContext) => session.decide('jev', body, decisionContext)}
        : causal ? {repairScopePolicy: 'public-causal-v1', artifactRepairPolicy: 'causal-v1'} : {}),
      decideRepair: (request, metadata = {}) => chooseAdaptiveRepair({source: source.input.source, ...request, limits: {...manifest.limits, ...request.limits},
        artifactBindings: source.planning.artifactBindings,
        ...(recovering ? {requestOverride: metadata.request_override, recovery: metadata.recovery, onRequest: metadata.on_request} : {}),
        ...(inferred ? {repairPolicy: `inferred-${inferredVersion}`, buildRepairState: buildInferredState}
          : causal ? {repairPolicy: 'causal-v1', buildRepairState: buildCausalRepairDecisionContext}
          : {buildRepairState: buildArtifactRepairDecisionContext}),
        decide: (body, decisionContext) => session.decide('jev', body, decisionContext), record: context.record})});
    context.save('execution.json', outcome.execution); context.save('preservation.json', {...outcome, execution: undefined});
    ({stopCode, unknown, terminalCause} = preservedRepairTerminalState(outcome.execution, context.remaining));
  } catch (error) {
    stopCode = /^[A-Z0-9_]+$/.test(error?.code ?? '') ? error.code : 'PRESERVED_REPAIR_FAILED';
    unknown ||= adaptiveOutcomeUncertain(error); terminalCause = adaptiveTerminalCause(error, {stage: 'repair', outcome_uncertain: unknown});
  } finally {
    if (source) {
      try { const final = verifySource(source); context.save('historical-candidate-after.json', final); }
      catch (error) { stopCode = error.code ?? 'PRESERVED_SOURCE_CANDIDATE_DRIFT'; terminalCause = adaptiveTerminalCause(error, {stage: 'repair', outcome_uncertain: unknown}); }
    }
    if (budgetBefore) try {
      budgetAfter = await withAdaptiveSettledBudget({rootDir, manifest, remaining: () => Math.max(1, Math.floor(manifest.limits.wall_timeout_seconds * 1000 - context.elapsed())),
        record: context.record, adapters, purpose: 'preserved_repair_end', allowBlockedSnapshot: true}, snapshot => snapshot);
      context.save('budget-after.json', budgetAfter);
    } catch (error) {
      budgetObservationError = adaptiveTerminalCause(error, {stage: 'budget', outcome_uncertain: true});
      if (!stopCode) { stopCode = error.code ?? 'PRESERVED_BUDGET_OBSERVATION'; unknown = true; terminalCause = budgetObservationError; }
    }
  }
  const changes = context.changes();
  if (changes.length && !stopCode) {
    stopCode = 'ADAPTIVE_SOURCE_DRIFT'; terminalCause = adaptiveTerminalCause({code: stopCode}, {stage: 'repair', outcome_uncertain: unknown});
  }
  const receipts = session?.receipts() ?? [], execution = outcome?.execution;
  const result = {schema_version: 'adaptive-arm-result/v1', kind: 'preserved_artifact_repair', run_id: context.run_id, arm,
    status: unknown ? 'uncertain' : stopCode ? 'failed' : 'completed', stop_code: stopCode, outcome_uncertain: unknown, terminal_cause: terminalCause,
    started_at: context.started_at, finished_at: new Date().toISOString(), wall_ms: context.elapsed(),
    public_status: !stopCode && !unknown && execution?.status === 'completed' ? 'passed' : 'not_passed',
    candidate_path: execution?.candidate_path ?? null, artifact_revisions: execution?.artifact_revisions ?? null,
    prior_public_failure: execution?.prior_public_failure ?? null, source_run: source?.directory ?? sourceRunDirectory,
    public_gate_upgrade: source?.gate_upgrade ?? null, worker_profile_selection: profileSelection,
    source_profile_history: source?.source_profile_history ?? null,
    ...(recovering ? {comparison_condition: source?.comparison_condition ?? null,
      failure_recovery_policy: manifest.failure_recovery.policy, repair_input_policy: 'evidence-v1',
      transmission_preflight: manifest.transmission_preflight} : {}),
    source_candidate_snapshot_sha256: source?.candidate_snapshot_sha256 ?? null,
    original_candidate_unchanged: Boolean(source && existsSync(join(context.directory, 'historical-candidate-after.json'))),
    metrics: outcome?.metrics ?? null, inherited_export_proofs: outcome?.inherited_export_proofs ?? null,
    incomplete_export_proofs: outcome?.incomplete_export_proofs ?? null,
    bootstrap_proof: outcome?.bootstrap_proof ?? null,
    operations: execution?.operations ?? null, repair_rounds_used: execution?.repair_rounds_used ?? 0,
    decision_callbacks: session?.decision_count() ?? 0,
    decision_provider_questions: receipts.filter(row => row.purpose === 'decision').reduce((sum, row) => sum + (row.question_count ?? 0), 0),
    usage: adaptiveUsageSummary(receipts), bootstrap_copy_worker_provider_calls: 0, current_run_preparation_calls: 0,
    completion_wall_ms: null, product_success: null, independent_grade: 'not_run_root_owned',
    source_changes_during_run: changes, budget_before: budgetBefore, budget_after: budgetAfter,
    settlement_status: {status: budgetObservationError || !budgetAfter ? 'unavailable' : budgetAfter.reservations_pending ? 'pending' : budgetAfter.blocked_code ? 'blocked' : 'settled',
      reservations_pending: budgetAfter?.reservations_pending ?? null, blocked_code: budgetAfter?.blocked_code ?? null, observation_error: budgetObservationError},
    automatic_retries: 0, replay_allowed: false,
    comparison_boundary: 'A separate preserved-candidate repair including deterministic bootstrap/public recheck. Not a from-scratch development time or catalog/planning invocation.'};
  try { context.save('result.json', result); await context.record({event: 'preserved_repair_terminal', status: result.status, outcome_uncertain: unknown}); }
  finally { context.close(); }
  return result;
}
