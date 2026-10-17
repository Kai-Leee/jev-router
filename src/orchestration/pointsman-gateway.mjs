import {readFileSync, realpathSync} from 'node:fs';
import {resolve, relative, isAbsolute, sep} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareDecision} from '../client.mjs';
import {validateJevInput} from '../../scripts/validate-jev-input.mjs';
import {assessJevTokenAdmission as assessJevTokenAdmissionV5} from './jev-token-admission-v5.mjs';
import {validateOwnerPayloadEncoding} from './adaptive-owner-payload-projection.mjs';
import {validateCodexWorkerProfileRequest} from '../benchmark/codex-worker-profiles.mjs';
import {validateCodexWorkerProfileRequest as validateCodexWorkerProfileRequestV2} from '../benchmark/codex-worker-profiles-v2.mjs';
import {loadCodexWorkerHistory,CODEX_WORKER_HISTORY_BINDING} from '../benchmark/codex-worker-history-binding.mjs';
import {validateWorkerProfileRequest} from '../benchmark/worker-profiles-v3.mjs';
import {validateWorkerProfileRequest as validateWorkerProfileRequestV4} from '../benchmark/worker-profiles-v4.mjs';

export const POINTSMAN_ROUTING_CONTRACT = 'docs/orchestration/contracts/pointsman-routing.v1.json';
export const POINTSMAN_REPAIR_ROUTING_CONTRACT = 'docs/orchestration/contracts/pointsman-routing.v2.json';
export const POINTSMAN_D087_ROUTING_CONTRACT = 'docs/orchestration/contracts/pointsman-routing.v3.json';
export const POINTSMAN_D088_ROUTING_CONTRACT = 'docs/orchestration/contracts/pointsman-routing.v4.json';
export const POINTSMAN_D089_ROUTING_CONTRACT = 'docs/orchestration/contracts/pointsman-routing.v5.json';
export const POINTSMAN_D090_ROUTING_CONTRACT = 'docs/orchestration/contracts/pointsman-routing.v6.json';
export const POINTSMAN_D091_ROUTING_CONTRACT = 'docs/orchestration/contracts/pointsman-routing.v7.json';
export const POINTSMAN_D091_ADAPTIVE_ROUTING_CONTRACT = 'docs/orchestration/contracts/pointsman-routing.v8.json';
export const POINTSMAN_D092_ROUTING_CONTRACT = 'docs/orchestration/contracts/pointsman-routing.v9.json';
export const POINTSMAN_D093_CODEX_ROUTING_CONTRACT='docs/orchestration/contracts/pointsman-routing.v10.json';
export const POINTSMAN_D093_CLAUDE_ROUTING_CONTRACT='docs/orchestration/contracts/pointsman-routing.v11.json';
export const POINTSMAN_D093_CLAUDE_RECOVERY_ROUTING_CONTRACT='docs/orchestration/contracts/pointsman-routing.v12.json';
export const POINTSMAN_D093_CLAUDE_CLASSIFIER_ROUTING_CONTRACT='docs/orchestration/contracts/pointsman-routing.v13.json';
export const POINTSMAN_D095_RUNTIME_ROUTING_CONTRACT='docs/orchestration/contracts/pointsman-routing.v16.json';
export const POINTSMAN_D095_CLAUDE_ROUTING_CONTRACT='docs/orchestration/contracts/pointsman-routing.v15.json';
export const POINTSMAN_D094_CLAUDE_ROUTING_CONTRACT='docs/orchestration/contracts/pointsman-routing.v14.json';
export const D090_CODEX_EXECUTION = Object.freeze({environment:'app-bundled-v1',
  environment_contract:'docs/orchestration/contracts/codex-app-binary.v1.json',
  pricing_contract:'docs/orchestration/contracts/codex-pricing.v1.json',model:'gpt-6.1-sol',effort:'high'});
export const D090_CODEX_SOURCES = Object.freeze(['src/benchmark/codex-environment.mjs',
  'src/benchmark/codex-pricing.mjs',D090_CODEX_EXECUTION.environment_contract,D090_CODEX_EXECUTION.pricing_contract,
  'src/benchmark/codex-provider.mjs','src/benchmark/codex-e2e-decisions.mjs','src/benchmark/codex-e2e-checks.mjs',
  'src/benchmark/codex-e2e-runner.mjs','bin/codex-e2e.mjs']);
export const D089_REPAIR_EFFICIENCY = Object.freeze({dispatch_policy:'verified-context-v1',
  worker_input_projection:'dependency-closed-v1', public_guidance:'google-docstring-v1'});
export const D091_REPAIR_EFFICIENCY = Object.freeze({...D089_REPAIR_EFFICIENCY,
  worker_input_projection:'artifact-family-closed-v2',owner_input_projection:'lossless-owner-v1'});
export const D091_CODEX_EXECUTION = Object.freeze({...D090_CODEX_EXECUTION,
  pricing_contract:'docs/orchestration/contracts/codex-pricing.v2.json',
  worker_profile_contract:'docs/orchestration/contracts/codex-worker-profiles.v1.json',worker_routing:'fixed-profile-v1'});
export const D091_ADAPTIVE_CODEX_EXECUTION = Object.freeze({...D091_CODEX_EXECUTION,worker_routing:'jev-model-size-v1'});
export const D092_CODEX_EXECUTION = Object.freeze({...D091_CODEX_EXECUTION,
  worker_profile_contract:'docs/orchestration/contracts/codex-worker-profiles.v2.json',
  worker_routing:'jev-model-effort-history-v2',worker_outcomes_binding:CODEX_WORKER_HISTORY_BINDING});
export const D093_CODEX_EXECUTION=Object.freeze({...D092_CODEX_EXECUTION,
  worker_routing:'joint-model-effort-history-v3',worker_profile_contract:'docs/orchestration/contracts/worker-profiles.v3.json',worker_family:'codex'});
export const D093_CLAUDE_EXECUTION=Object.freeze({...D093_CODEX_EXECUTION,
  environment:'claude-bundled-v1',environment_contract:'docs/orchestration/contracts/claude-app-binary.v1.json',
  pricing_contract:'docs/orchestration/contracts/claude-pricing.v1.json',model:'claude-opus-5-5',effort:'medium',worker_family:'claude'});
export const D091_SOURCES = Object.freeze([...D090_CODEX_SOURCES,
  'docs/orchestration/contracts/codex-pricing.v2.json','docs/orchestration/contracts/codex-worker-profiles.v1.json',
  'src/benchmark/codex-worker-profiles.mjs','src/orchestration/adaptive-owner-payload-projection.mjs',
  'src/benchmark/codex-worker-input-projection-v2.mjs','src/benchmark/codex-worker-source-analysis.py',
  'docs/orchestration/contracts/adaptive-owner-payload.v1.json','docs/orchestration/contracts/codex-worker-input-projection.v2.json']);
export const D089_REPAIR_POLICY_SOURCES = Object.freeze([
  'src/benchmark/codex-artifact-worker.mjs', 'src/benchmark/codex-e2e-runner.mjs',
  'src/benchmark/codex-worker-input-projection.mjs',
  'src/orchestration/adaptive-verified-repair-context.mjs', 'src/orchestration/public-docstring-guidance.mjs',
  'docs/orchestration/contracts/codex-worker-input-projection.v1.json',
  'docs/orchestration/contracts/adaptive-verified-repair-context.v1.json',
  'docs/orchestration/contracts/public-docstring-guidance.v1.json',
]);
const d091Contracts = [POINTSMAN_D091_ROUTING_CONTRACT,POINTSMAN_D091_ADAPTIVE_ROUTING_CONTRACT];
const d093Contracts=[POINTSMAN_D095_RUNTIME_ROUTING_CONTRACT,POINTSMAN_D095_CLAUDE_ROUTING_CONTRACT,POINTSMAN_D094_CLAUDE_ROUTING_CONTRACT,POINTSMAN_D093_CLAUDE_CLASSIFIER_ROUTING_CONTRACT,POINTSMAN_D093_CODEX_ROUTING_CONTRACT,POINTSMAN_D093_CLAUDE_ROUTING_CONTRACT,POINTSMAN_D093_CLAUDE_RECOVERY_ROUTING_CONTRACT];
const modernContracts=[...d091Contracts,POINTSMAN_D092_ROUTING_CONTRACT,...d093Contracts];
export const D092_SOURCES=Object.freeze([...D091_SOURCES,
  'src/benchmark/codex-worker-profiles-v2.mjs','src/benchmark/codex-worker-outcomes.mjs',
  'src/benchmark/codex-worker-history-binding.mjs','scripts/build-codex-worker-outcomes.mjs',
  'docs/orchestration/contracts/codex-worker-profiles.v2.json',CODEX_WORKER_HISTORY_BINDING]);
export const D093_SOURCES=Object.freeze([...D092_SOURCES,'src/benchmark/worker-profiles-v3.mjs',
  'docs/orchestration/contracts/worker-profiles.v3.json','src/benchmark/claude-provider.mjs','src/benchmark/claude-environment.mjs',
  'src/benchmark/claude-pricing.mjs','docs/orchestration/contracts/claude-pricing.v1.json',
  'docs/orchestration/contracts/claude-app-binary.v1.json','bin/provider-cohort.mjs',
  'benchmark-runs/d093-full-provider-20261017-01/claude-cli-preflight.json',
  'benchmark-runs/d093-full-provider-20261017-01/claude-account-models.json']);
export const D093_RECOVERY_SOURCES=Object.freeze([...D093_SOURCES,'bin/claude-cohort.mjs','docs/agents/D093_CLAUDE_RECOVERY.md']);
export const D093_CLASSIFIER_SOURCES=Object.freeze([...D093_RECOVERY_SOURCES,'bin/claude-classifier-cohort.mjs','docs/agents/D093_CLAUDE_CLASSIFIER_RECOVERY.md']);
export const D094_SOURCES=Object.freeze([...D093_CLASSIFIER_SOURCES,'src/benchmark/worker-profiles-v4.mjs','docs/orchestration/contracts/worker-profiles.v4.json','src/orchestration/dag-filesystem-runtime.mjs','src/orchestration/dag-scheduler.mjs','src/orchestration/artifact-verification-gate.mjs','src/orchestration/dag-workflow.mjs','src/orchestration/adaptive-dag-execution.mjs','bin/claude-provisional-cohort.mjs','docs/agents/D094_CLAUDE_PROVISIONAL.md']);
export const D095_SOURCES=Object.freeze([...D094_SOURCES,'src/orchestration/public-audit-v5.mjs','src/orchestration/adaptive-public-owner-evidence.mjs','bin/claude-boundary-cohort.mjs','docs/agents/D095_PUBLIC_BOUNDARIES.md']);
export const D095_RUNTIME_SOURCES=Object.freeze([...D095_SOURCES,'bin/claude-boundary-runtime-cohort.mjs','docs/agents/D095_RUNTIME_BINDING_RECOVERY.md']);
export const D094_CLAUDE_EXECUTION=Object.freeze({...D093_CLAUDE_EXECUTION,worker_routing:'joint-model-effort-cold-start-v4',worker_profile_contract:'docs/orchestration/contracts/worker-profiles.v4.json'});
const canonicalContracts = [POINTSMAN_D088_ROUTING_CONTRACT,POINTSMAN_D089_ROUTING_CONTRACT,POINTSMAN_D090_ROUTING_CONTRACT,...modernContracts];
const efficiencyContracts = [POINTSMAN_D089_ROUTING_CONTRACT,POINTSMAN_D090_ROUTING_CONTRACT,...modernContracts];
const appContracts = [POINTSMAN_D090_ROUTING_CONTRACT,...modernContracts];
const executionPolicy = path => [POINTSMAN_D094_CLAUDE_ROUTING_CONTRACT,POINTSMAN_D095_CLAUDE_ROUTING_CONTRACT,POINTSMAN_D095_RUNTIME_ROUTING_CONTRACT].includes(path)?D094_CLAUDE_EXECUTION: path===POINTSMAN_D093_CODEX_ROUTING_CONTRACT?D093_CODEX_EXECUTION:[POINTSMAN_D093_CLAUDE_CLASSIFIER_ROUTING_CONTRACT,POINTSMAN_D093_CLAUDE_ROUTING_CONTRACT,POINTSMAN_D093_CLAUDE_RECOVERY_ROUTING_CONTRACT].includes(path)?D093_CLAUDE_EXECUTION:path===POINTSMAN_D092_ROUTING_CONTRACT?D092_CODEX_EXECUTION:path===POINTSMAN_D091_ADAPTIVE_ROUTING_CONTRACT?D091_ADAPTIVE_CODEX_EXECUTION:d091Contracts.includes(path)?D091_CODEX_EXECUTION:D090_CODEX_EXECUTION;
const efficiencyPolicy = path => modernContracts.includes(path)?D091_REPAIR_EFFICIENCY:D089_REPAIR_EFFICIENCY;
const reuseContracts = [POINTSMAN_D087_ROUTING_CONTRACT,...canonicalContracts];
const D088_ADMISSION = 'docs/orchestration/contracts/jev-token-admission.v5.json';
const D088_MODEL_REGISTRY = 'docs/orchestration/contracts/jev-models.v1.json';
export const POINTSMAN_D087_REUSE = Object.freeze({policy: 'd087-same-file-v1',
  shared_ledger_path: '/Users/lee/workspace/plugins/jev-router/benchmark-runs/jev-usd1-budget.json',
  catalog_directory: '/Users/lee/workspace/plugins/jev-router/benchmark-runs/d066-catalog-01'});
const stages = ['split', 'relations', 'profiles', 'repair_owners', 'repair'];
const sha = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = (code, extra = {}) => {throw Object.assign(new Error(code), {code, outcome_uncertain:false, outcomeUncertain:extra.outcome_uncertain === true, ...extra});};
const freeze = value => {if (value && typeof value === 'object') {Object.values(value).forEach(freeze); Object.freeze(value);} return value;};
const clone = value => JSON.parse(JSON.stringify(value));
const safeCode = error => /^[A-Z][A-Z0-9_]{0,100}$/.test(error?.code) ? error.code : 'POINTSMAN_OPERATION_FAILED';
function file(rootDir, path) {
  if (typeof path !== 'string' || isAbsolute(path) || path.split(/[\\/]/).some(part => !part || part === '.' || part === '..')) fail('POINTSMAN_SOURCE_PATH_INVALID');
  const root = realpathSync(rootDir), full = realpathSync(resolve(root, path)), rel = relative(root, full);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) fail('POINTSMAN_SOURCE_PATH_INVALID');
  return readFileSync(full);
}

/** Binding is created once by the manifest/bundle; rechecked at every external boundary. */
export function validatePointsmanBinding(binding, {rootDir} = {}) {
  if (!object(binding) || binding.mode !== 'required' || ![POINTSMAN_ROUTING_CONTRACT,POINTSMAN_REPAIR_ROUTING_CONTRACT,...reuseContracts].includes(binding.contract)
      || !/^[a-f0-9]{64}$/.test(binding.sha256)) fail('POINTSMAN_BINDING_INVALID');
  const bytes = file(rootDir, binding.contract);
  if (sha(bytes) !== binding.sha256) fail('POINTSMAN_CONTRACT_CHANGED');
  const contract = JSON.parse(bytes);
  if (contract.schema_version !== (binding.contract===POINTSMAN_D095_RUNTIME_ROUTING_CONTRACT?'pointsman-routing/v16':binding.contract===POINTSMAN_D095_CLAUDE_ROUTING_CONTRACT?'pointsman-routing/v15':binding.contract===POINTSMAN_D094_CLAUDE_ROUTING_CONTRACT?'pointsman-routing/v14':binding.contract===POINTSMAN_D093_CLAUDE_CLASSIFIER_ROUTING_CONTRACT?'pointsman-routing/v13':binding.contract===POINTSMAN_D093_CLAUDE_RECOVERY_ROUTING_CONTRACT?'pointsman-routing/v12':binding.contract===POINTSMAN_D093_CLAUDE_ROUTING_CONTRACT?'pointsman-routing/v11':binding.contract===POINTSMAN_D093_CODEX_ROUTING_CONTRACT?'pointsman-routing/v10':binding.contract===POINTSMAN_D092_ROUTING_CONTRACT?'pointsman-routing/v9':binding.contract===POINTSMAN_D091_ADAPTIVE_ROUTING_CONTRACT?'pointsman-routing/v8':binding.contract===POINTSMAN_D091_ROUTING_CONTRACT?'pointsman-routing/v7':binding.contract===POINTSMAN_D090_ROUTING_CONTRACT?'pointsman-routing/v6':binding.contract===POINTSMAN_D089_ROUTING_CONTRACT?'pointsman-routing/v5':binding.contract===POINTSMAN_D088_ROUTING_CONTRACT?'pointsman-routing/v4':binding.contract===POINTSMAN_D087_ROUTING_CONTRACT?'pointsman-routing/v3':binding.contract===POINTSMAN_REPAIR_ROUTING_CONTRACT?'pointsman-routing/v2':'pointsman-routing/v1') || contract.input_policy !== (canonicalContracts.includes(binding.contract) ? 'v5' : 'v4')
      || JSON.stringify(Object.keys(contract.stages ?? {})) !== JSON.stringify(stages)
      || !Array.isArray(contract.source_pins) || !contract.source_pins.length) fail('POINTSMAN_CONTRACT_INVALID');
  if (reuseContracts.includes(binding.contract) && !isDeepStrictEqual(contract.workspace_reuse, POINTSMAN_D087_REUSE)) fail('POINTSMAN_WORKSPACE_REUSE_INVALID');
  const seen = new Set();
  for (const pin of contract.source_pins) {
    if (seen.has(pin.path) || !/^[a-f0-9]{64}$/.test(pin.sha256)) fail('POINTSMAN_SOURCE_PIN_INVALID');
    seen.add(pin.path);
    if (sha(file(rootDir, pin.path)) !== pin.sha256) fail('POINTSMAN_SOURCE_CHANGED', {source_path: pin.path});
  }
  if (canonicalContracts.includes(binding.contract) && (!object(contract.model_registry)
    || !isDeepStrictEqual(Object.keys(contract.model_registry).sort(), ['contract','sha256'])
    || contract.model_registry.contract !== D088_MODEL_REGISTRY
    || contract.model_registry.sha256 !== sha(file(rootDir, D088_MODEL_REGISTRY))
    || ![D088_MODEL_REGISTRY,D088_ADMISSION,'src/jev-model-registry.mjs','src/orchestration/jev-token-admission-v5.mjs','src/benchmark/budget.mjs'].every(path => seen.has(path)))) fail('POINTSMAN_MODEL_REGISTRY_BINDING_INVALID');
  if (efficiencyContracts.includes(binding.contract) && (!isDeepStrictEqual(contract.execution_policy,efficiencyPolicy(binding.contract))
    || !D089_REPAIR_POLICY_SOURCES.every(path=>seen.has(path))))
    fail('POINTSMAN_REPAIR_EFFICIENCY_BINDING_INVALID');
  if (appContracts.includes(binding.contract) && (!isDeepStrictEqual(contract.codex_execution,executionPolicy(binding.contract))
    || !D090_CODEX_SOURCES.every(path=>seen.has(path)))) fail('POINTSMAN_CODEX_EXECUTION_BINDING_INVALID');
  if (d091Contracts.includes(binding.contract)&&!D091_SOURCES.every(path=>seen.has(path)))fail('POINTSMAN_D091_SOURCE_BINDING_INVALID');
  if(binding.contract===POINTSMAN_D092_ROUTING_CONTRACT||d093Contracts.includes(binding.contract)){
    if(!(binding.contract===POINTSMAN_D095_RUNTIME_ROUTING_CONTRACT?D095_RUNTIME_SOURCES:binding.contract===POINTSMAN_D095_CLAUDE_ROUTING_CONTRACT?D095_SOURCES:binding.contract===POINTSMAN_D094_CLAUDE_ROUTING_CONTRACT?D094_SOURCES:binding.contract===POINTSMAN_D093_CLAUDE_CLASSIFIER_ROUTING_CONTRACT?D093_CLASSIFIER_SOURCES:binding.contract===POINTSMAN_D093_CLAUDE_RECOVERY_ROUTING_CONTRACT?D093_RECOVERY_SOURCES:d093Contracts.includes(binding.contract)?D093_SOURCES:D092_SOURCES).every(path=>seen.has(path)))fail('POINTSMAN_D092_SOURCE_BINDING_INVALID');
    const history=loadCodexWorkerHistory({rootDir});
    if(!seen.has(history.snapshot_source.path))fail('POINTSMAN_D092_HISTORY_NOT_PINNED');
  }
  for (const stage of stages) if (contract.stages[stage].handler !== `adaptive.${stage}`
      || !Array.isArray(contract.stages[stage].contracts)
      || contract.stages[stage].contracts.some(path => !seen.has(path))) fail('POINTSMAN_HANDLER_INVALID');
  if (!seen.has(contract.skill) || !seen.has('src/orchestration/pointsman-gateway.mjs')
      || !seen.has('scripts/validate-jev-input.mjs') || !seen.has('src/client.mjs')) fail('POINTSMAN_SOURCE_PIN_INVALID');
  return freeze({...clone(binding), policy:contract});
}

/** Keep this opt-in bound to D083; a changed workflow needs a reviewed new registry. */
export function validatePointsmanManifest(manifest, {rootDir} = {}) {
  if (manifest?.schema_version !== 'adaptive-dag-comparison/v13') fail('POINTSMAN_GATEWAY_SCHEMA_REQUIRED');
  const binding = validatePointsmanBinding(manifest.skill_gateway, {rootDir});
  const original = JSON.parse(file(rootDir, 'benchmarks/e2e-swe/manifests/d083-repair-fixes.json'));
  const normalize = value => {const copy = clone(value); for (const key of ['schema_version', 'session_semantics', 'skill_gateway']) delete copy[key]; return copy;};
  let candidate = manifest;
  if (reuseContracts.includes(binding.contract)) {
    if (manifest.jev_budget?.ledger_path !== POINTSMAN_D087_REUSE.shared_ledger_path) fail('POINTSMAN_SHARED_LEDGER_CHANGED');
    candidate = clone(manifest);
    if([POINTSMAN_D094_CLAUDE_ROUTING_CONTRACT,POINTSMAN_D095_CLAUDE_ROUTING_CONTRACT,POINTSMAN_D095_RUNTIME_ROUTING_CONTRACT].includes(binding.contract)){
      const expected=[...original.catalog_reuse.allowed_changed_source_paths,'src/orchestration/dag-filesystem-runtime.mjs','src/orchestration/dag-scheduler.mjs'];
      if(!isDeepStrictEqual(candidate.catalog_reuse.allowed_changed_source_paths,expected))fail('POINTSMAN_D094_CATALOG_REUSE_CHANGED');
      candidate.catalog_reuse.allowed_changed_source_paths=clone(original.catalog_reuse.allowed_changed_source_paths);
    }
    if([POINTSMAN_D095_CLAUDE_ROUTING_CONTRACT,POINTSMAN_D095_RUNTIME_ROUTING_CONTRACT].includes(binding.contract)){
      if(candidate.public_registry!=='benchmarks/e2e-swe/public-checks/registry.v5.json'||candidate.public_runner!=='benchmarks/e2e-swe/public-checks/run_public_checks_v5.py'||candidate.repair_policy.assertion_contract!=='benchmarks/e2e-swe/public-checks/assertions.v3.json'||candidate.public_controls_evidence!=='benchmark-runs/d095-public-boundaries-20261017-01/public-controls-v5.json')fail('POINTSMAN_D095_PUBLIC_GATE_CHANGED');
      candidate.public_registry=original.public_registry;candidate.public_runner=original.public_runner;candidate.repair_policy.assertion_contract=original.repair_policy.assertion_contract;candidate.public_controls_evidence=original.public_controls_evidence;
    }
    candidate.jev_budget.ledger_path = original.jev_budget.ledger_path;
    if (canonicalContracts.includes(binding.contract)) {
      if (candidate.repair_policy?.token_admission_contract !== D088_ADMISSION) fail('POINTSMAN_MODEL_POLICY_CHANGED');
      candidate.repair_policy.token_admission_contract = original.repair_policy.token_admission_contract;
    }
    if (efficiencyContracts.includes(binding.contract)) {
      if (!isDeepStrictEqual(candidate.repair_efficiency,efficiencyPolicy(binding.contract))) fail('POINTSMAN_REPAIR_EFFICIENCY_CHANGED');
      delete candidate.repair_efficiency;
    }
    if(appContracts.includes(binding.contract)){
      if(!isDeepStrictEqual(candidate.codex_execution,executionPolicy(binding.contract)))fail('POINTSMAN_CODEX_EXECUTION_CHANGED');
      delete candidate.codex_execution;
    }
  }
  if (!isDeepStrictEqual(normalize(original), normalize(candidate))) fail('POINTSMAN_WORKFLOW_CHANGED');
  return binding;
}

// Template slots are data. Fixed surrounding wording remains byte exact; evidence sufficiency
// and candidate correctness still belong to the D083 builders and runtime validators.
const matchTemplate = (template, actual) => {
  if (typeof template !== 'string' || typeof actual !== 'string') return false;
  const chunks = template.split(/(\{\{\w+\}\}|\{\w+\})/);
  return new RegExp('^' + chunks.map(part => /^\{/.test(part) ? '[\\s\\S]+?' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$').test(actual);
};
function wording(request, stage, contract, rootDir, workerEnvironmentEvidence) {
  const load = name => JSON.parse(file(rootDir, `docs/orchestration/contracts/${name}.json`));
  const dag = load('adaptive-dag.v1'), layered = load('adaptive-layered-decomposition.v2');
  const profile = load('adaptive-profile-selection.v2'), owners = load('adaptive-inferred-repair.v3');
  const qs = Object.values(request.questions), state = request.state;
  const every = fn => qs.every(q => q.type === 'choice' && fn(q.instructions));
  let valid = false;
  if (stage === 'split') valid = every(text => matchTemplate(layered.question.call_template, text))
    && state?.unit_relation_question === layered.question.instructions;
  if (stage === 'relations') valid = every(text => text === dag.questions.relation.instructions);
  if (stage === 'profiles') valid = every(text => matchTemplate(profile.question.target_template + profile.question.instructions, text));
  if (stage === 'profiles'&&contract.codex_execution?.worker_routing==='jev-model-size-v1') {
    validateCodexWorkerProfileRequest(request);
    valid=true;
  }
  if(stage==='profiles'&&contract.codex_execution?.worker_routing==='jev-model-effort-history-v2'){
    const history=loadCodexWorkerHistory({rootDir});
    validateCodexWorkerProfileRequestV2(request,{empiricalEvidence:history.snapshot,expectedEmpiricalSha256:history.binding.snapshot_sha256});
    valid=true;
  }
  if(stage==='profiles'&&contract.codex_execution?.worker_routing==='joint-model-effort-history-v3'){
    const history=loadCodexWorkerHistory({rootDir});
    if(!workerEnvironmentEvidence)fail('WORKER_PROFILE_V3_TRUSTED_ENVIRONMENT_REQUIRED');
    validateWorkerProfileRequest(request,{empiricalEvidence:history.snapshot,expectedEmpiricalSha256:history.binding.snapshot_sha256,
      expectedWorkerFamily:contract.codex_execution.worker_family,expectedEnvironmentEvidence:workerEnvironmentEvidence});valid=true;
  }
  if(stage==='profiles'&&contract.codex_execution?.worker_routing==='joint-model-effort-cold-start-v4'){
    const history=loadCodexWorkerHistory({rootDir});
    if(!workerEnvironmentEvidence)fail('WORKER_PROFILE_V4_TRUSTED_ENVIRONMENT_REQUIRED');
    validateWorkerProfileRequestV4(request,{empiricalEvidence:history.snapshot,expectedEmpiricalSha256:history.binding.snapshot_sha256,expectedWorkerFamily:contract.codex_execution.worker_family,expectedEnvironmentEvidence:workerEnvironmentEvidence});valid=true;
  }
  if (stage === 'repair_owners') {
    if(state?.owner_payload_encoding){
      if(contract.execution_policy?.owner_input_projection!=='lossless-owner-v1')fail('POINTSMAN_OWNER_ENCODING_NOT_ENABLED');
      validateOwnerPayloadEncoding(request);
    }
    const projected = every(text => matchTemplate(owners.owner_input.target_template, text))
      && state?.instructions === owners.owner_input.instructions;
    const raw = every(text => matchTemplate(owners.question.target_template + owners.question.call_instructions, text)
      || matchTemplate(owners.question.check_error_template + owners.question.check_error_call_instructions, text))
      && state?.instructions === `${owners.state_instructions}\n\n${owners.question.instructions}`;
    valid = projected || raw;
  }
  if (stage === 'repair') valid = every(text => text === owners.decision_call_instructions)
    && state?.instructions === owners.decision_instructions;
  if (!valid) fail('POINTSMAN_FIXED_QUESTION_MISMATCH');
  return {fixed_wording:true, candidate_and_evidence_semantics:'validated_by_stage_builder_not_inferred_by_gateway', handler:contract.stages[stage].handler};
}
function validateResponse(request, response) {
  const bad = () => fail('POINTSMAN_RESPONSE_INVALID', {outcome_uncertain:true});
  if (!object(response) || typeof response.model !== 'string' || !response.model.trim() || !object(response.usage)
      || ['input_tokens','output_tokens'].some(key => !Number.isSafeInteger(response.usage[key]) || response.usage[key] < 0)
      || response.ok === false || response.error != null || response.outcome_uncertain === true || response.outcomeUncertain === true || response.uncertain === true
      || (response.status != null && !['completed','success','succeeded'].includes(response.status))
      || (response.receipt?.status != null && response.receipt.status !== 200)
      || !object(response.answers) || Object.keys(response.answers).length !== Object.keys(request.questions).length) bad();
  for (const [id, q] of Object.entries(request.questions)) {
    const a = response.answers[id];
    if (!object(a) || a.type !== q.type || typeof a.choice !== 'string' || !Object.hasOwn(q.criteria, a.choice)) bad();
    if (a.probabilities !== undefined) {
      const keys = Object.keys(q.criteria);
      if (!object(a.probabilities) || Object.keys(a.probabilities).length !== keys.length
        || keys.some(key => !Object.hasOwn(a.probabilities,key) || !Number.isFinite(a.probabilities[key]) || a.probabilities[key] < 0 || a.probabilities[key] > 1)) bad();
    }
  }
}

/** save(path, value) MUST complete synchronous durable persistence or throw. No async-save fallback.
 * record(event) may be async. Boundary receipts saved synchronously, events awaited on begin/accept/failure.
 * This guard cannot sandbox arbitrary external programs; callers must wrap every provider boundary. */
export function createPointsmanGateway({rootDir, binding, record, save, workerEnvironmentEvidence}) {
  if (typeof record !== 'function' || typeof save !== 'function') fail('POINTSMAN_RECORDER_REQUIRED');
  const original = validatePointsmanBinding(binding, {rootDir}), used = new Set();
  workerEnvironmentEvidence=workerEnvironmentEvidence?freeze(clone(workerEnvironmentEvidence)):null;
  const persist = (path,value) => {
    const result = save(path, clone(value));
    if (result && typeof result.then === 'function') {result.catch(() => {}); fail('POINTSMAN_SYNC_SAVE_REQUIRED');}
  };
  return Object.freeze({async begin(input, {stage, decisionId, observedModel = null} = {}) {
    if (!/^[A-Za-z0-9_.-]{1,100}$/.test(decisionId ?? '') || used.has(decisionId)) fail('POINTSMAN_DECISION_ID_INVALID');
    used.add(decisionId);
    let prepared;
    try {
      if (!stages.includes(stage)) fail('POINTSMAN_STAGE_INVALID');
      prepared = prepareDecision(input);
    } catch (error) {
      const rejection = {schema_version:'pointsman-gateway-receipt/v1', decision_id:decisionId,
        stage:stages.includes(stage) ? stage : null, event:'pointsman_gateway_rejected', code:safeCode(error),
        contract_sha256:original.sha256, request_recorded:false, inference_started:false};
      persist(`gateway/${decisionId}.rejected.json`, rejection); await record(rejection); throw error;
    }
    const request = freeze(prepared.body), requestSha = sha(prepared.serialized);
    let terminal = false, lastPhase = null;
    const phases = ['initial','before_reservation','before_post'];
    const base = {schema_version:'pointsman-gateway-receipt/v1', decision_id:decisionId, stage,
      request_sha256:requestSha, contract_sha256:original.sha256, skill:original.policy.skill,
      skill_sha256:original.policy.source_pins.find(p => p.path === original.policy.skill).sha256,
      handler:original.policy.stages[stage].handler};
    const assertBefore = (phase, body = request) => {
      if (terminal || phases.indexOf(phase) !== (lastPhase === null ? 0 : phases.indexOf(lastPhase) + 1)) fail('POINTSMAN_PHASE_INVALID');
      const report = {...base, phase, checked_at:new Date().toISOString(), passed:false};
      try {
        validatePointsmanBinding(original, {rootDir});
        const candidate = prepareDecision(body);
        if (candidate.serialized !== prepared.serialized) fail('POINTSMAN_REQUEST_CHANGED');
        report.input = canonicalContracts.includes(original.contract) ? (() => {
          const admission = assessJevTokenAdmissionV5(candidate.body, {stage, observedModel, expectedRequestSha256: requestSha,
            expectedPolicySha256: original.policy.source_pins.find(pin => pin.path === D088_ADMISSION).sha256,
            expectedModelRegistrySha256: original.policy.model_registry.sha256});
          return {policy_version: 'v5', input_ready_under_current_policy: admission.inference_allowed, admission};
        })() : validateJevInput(candidate.body, {policy:'v4',stage,expectedRequestSha256:requestSha});
        if (!report.input.input_ready_under_current_policy) fail('POINTSMAN_INPUT_BLOCKED');
        report.wording = wording(candidate.body,stage,original.policy,rootDir,workerEnvironmentEvidence);
        report.passed = true;
      } catch (error) {terminal = true; report.code = safeCode(error); persist(`gateway/${decisionId}.${phase}.json`,report); throw error;}
      try {persist(`gateway/${decisionId}.${phase}.json`,report);} catch (error) {terminal = true; throw error;}
      lastPhase = phase;
      return freeze(clone(report));
    };
    assertBefore('initial');
    persist(`gateway/${decisionId}.request.json`, request);
    await record({...base,event:'pointsman_gateway_prepared',report_path:`gateway/${decisionId}.initial.json`});
    return Object.freeze({request, serialized:prepared.serialized, request_sha256:requestSha, assertBefore,
      async accept(response) {
        if (terminal || lastPhase !== 'before_post') fail('POINTSMAN_PHASE_INVALID');
        try {validatePointsmanBinding(original, {rootDir}); validateResponse(request,response);}
        catch (error) {terminal = true; persist(`gateway/${decisionId}.rejected.json`,{...base,code:safeCode(error)}); throw error;}
        terminal = true;
        const output = freeze(clone(response));
        persist(`gateway/${decisionId}.response.json`,output);
        const receipt = {...base,event:'pointsman_gateway_accepted',response_sha256:sha(JSON.stringify(output)),
          selections:Object.fromEntries(Object.entries(output.answers).map(([id,a]) => [id,a.choice]))};
        persist(`gateway/${decisionId}.accepted.json`,receipt);
        terminal = true; await record(receipt); return output;
      },
      async failure(error) {
        terminal = true;
        const receipt = {...base,event:'pointsman_gateway_failed',code:safeCode(error),last_phase:lastPhase,
          outcome_uncertain:error?.outcome_uncertain === true || error?.outcomeUncertain === true};
        persist(`gateway/${decisionId}.failed.json`,receipt); await record(receipt);
      }});
  }});
}
