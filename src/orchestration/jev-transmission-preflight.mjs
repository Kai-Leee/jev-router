import {readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
import {prepareDecision} from '../client.mjs';
import {BASE_URL, DECISION_URL, MODELS_URL} from '../config.mjs';
import {validateJevInput} from '../../scripts/validate-jev-input.mjs';
import {jevTokenAdmissionPolicy} from './jev-token-admission-v4.mjs';
import {validateJevPrompt, jevPromptPolicy} from './jev-prompt-preflight.mjs';
import {validateRepairInputState} from './adaptive-repair-input.mjs';

const ROOT = resolve(import.meta.dirname, '../..');
// Policies are frozen as new files (vN never rewritten); each is verified by its own file hash and source pins.
// v1 holds the D075 pins (reproduce at 5f78c6c), v2 the first D076 pins; the default is the newest frozen policy.
const POLICY_FILE = /^docs\/orchestration\/contracts\/jev-transmission-preflight\.v([1-9]\d*)\.json$/;
export const jevTransmissionPolicySchema = path => {
  const match = typeof path === 'string' ? POLICY_FILE.exec(path) : null;
  return match ? `jev-transmission-preflight-policy/v${match[1]}` : null;
};
export const JEV_TRANSMISSION_POLICY_PATH = 'docs/orchestration/contracts/jev-transmission-preflight.v11.json';
const BASE_SOURCE_PATHS = Object.freeze([
  'src/orchestration/jev-transmission-preflight.mjs', 'src/benchmark/adaptive-dag-runner.mjs',
  'src/benchmark/telemetry.mjs', 'src/orchestration/jev-prompt-preflight.mjs',
  'docs/orchestration/contracts/jev-prompt-policy.v2.json',
  'docs/orchestration/contracts/adaptive-inferred-repair.v2.json', 'src/orchestration/adaptive-inferred-repair.mjs',
  'src/orchestration/adaptive-inferred-repair-projection.mjs', 'src/client.mjs', 'src/config.mjs',
  'scripts/validate-jev-input.mjs', 'src/orchestration/jev-token-admission-v4.mjs',
  'docs/orchestration/contracts/jev-token-admission.v4.json', 'src/orchestration/adaptive-repair-input.mjs',
  'docs/orchestration/contracts/adaptive-repair-input.v1.json', 'src/orchestration/adaptive-dag-planner.mjs'
]);
const PROMPT_POLICY_PATHS = Object.freeze({v2:'docs/orchestration/contracts/jev-prompt-policy.v2.json',
  v3:'docs/orchestration/contracts/jev-prompt-policy.v3.json'});
// Policies v1-v7 bind prompt policy v2; v8+ bind prompt policy v3 and also pin the v3 owner contract (D081).
const sourcePathsFor = promptVersion => promptVersion === 'v3'
  ? [...BASE_SOURCE_PATHS.map(path => path === PROMPT_POLICY_PATHS.v2 ? PROMPT_POLICY_PATHS.v3 : path),
    'docs/orchestration/contracts/adaptive-inferred-repair.v3.json'] : [...BASE_SOURCE_PATHS];
export const JEV_TRANSMISSION_SOURCE_PATHS = Object.freeze(sourcePathsFor('v3'));
const STAGES = ['split', 'relations', 'repair', 'profiles', 'repair_owners'];
const sha = value => createHash('sha256').update(value).digest('hex');
const hashValue = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const cachedPolicies = new Map();
const fail = code => {throw Object.assign(new Error(code), {code, outcome_uncertain:false, outcomeUncertain:false});};
const loadPolicy = (path = JEV_TRANSMISSION_POLICY_PATH) => {
  if (!jevTransmissionPolicySchema(path)) fail('JEV_TRANSMISSION_BINDING_INVALID');
  if (!cachedPolicies.has(path)) {
    const bytes = readFileSync(join(ROOT, path));
    cachedPolicies.set(path, {policy:JSON.parse(bytes), policyHash:sha(bytes)});
  }
  return cachedPolicies.get(path);
};

export function jevTransmissionPolicy(path = JEV_TRANSMISSION_POLICY_PATH) {
  const {policy, policyHash} = loadPolicy(path);
  return {...structuredClone(policy), source:{path, sha256:policyHash}};
}

export function validateJevTransmissionBinding(binding) {
  if (!binding || !same(Object.keys(binding).sort(), ['contract','mode','sha256']) || binding.mode !== 'required'
    || !jevTransmissionPolicySchema(binding.contract) || !hashValue(binding.sha256)) fail('JEV_TRANSMISSION_BINDING_INVALID');
  if (binding.sha256 !== loadPolicy(binding.contract).policyHash) fail('JEV_TRANSMISSION_POLICY_CHANGED');
  return {contract:binding.contract, sha256:binding.sha256, mode:binding.mode};
}

function sourceIntegrity(rootDir, path) {
  const {policy, policyHash} = loadPolicy(path);
  const valid = policy.schema_version === jevTransmissionPolicySchema(path) && policy.enforcement === 'required'
    && policy.input_policy === 'v4' && Object.hasOwn(PROMPT_POLICY_PATHS, policy.prompt_policy?.version)
    && policy.prompt_policy.contract === PROMPT_POLICY_PATHS[policy.prompt_policy.version]
    && same(policy.stages, STAGES) && same(policy.source_pins?.map(row => row.path), sourcePathsFor(policy.prompt_policy.version))
    && same(policy.local_caps, {request_tokens:null, state_plus_longest_question_tokens:null, repair_wire_bytes:null})
    && policy.connection?.base_url === BASE_URL && policy.connection.decision_url === DECISION_URL
    && policy.connection.models_url === MODELS_URL && policy.connection.automatic_retries === 0
    && policy.connection.redirect === 'error';
  if (!valid) return {passed:false, reason_code:'JEV_TRANSMISSION_POLICY_INVALID', sources:[]};
  const sources = policy.source_pins.map(row => {
    let current = null; try {current = sha(readFileSync(join(rootDir, row.path)));} catch { /* Fixed public source paths only. */ }
    return {...row, current_sha256:current, unchanged:hashValue(row.sha256) && current === row.sha256};
  });
  let currentPolicy = null; try {currentPolicy = sha(readFileSync(join(rootDir, path)));} catch {}
  const passed = sources.every(row => row.unchanged) && currentPolicy === policyHash;
  return {passed, reason_code:passed ? null : 'JEV_TRANSMISSION_SOURCE_DRIFT', sources,
    policy_file_unchanged:currentPolicy === policyHash};
}

/** Pure local gate. No key lookup, model request, reservation, handler or retry. */
export function assessJevTransmission(request, {stage=null, observedModel=null, expectedRequestSha256=null,
  expectedPolicySha256=null, rootDir=ROOT, policyPath=JEV_TRANSMISSION_POLICY_PATH} = {}) {
  const {policy, policyHash} = loadPolicy(policyPath);
  const integrity = sourceIntegrity(rootDir, policyPath), reasons = [];
  if (!integrity.passed) reasons.push(integrity.reason_code);
  if (!hashValue(expectedPolicySha256) || expectedPolicySha256 !== policyHash) reasons.push('JEV_TRANSMISSION_POLICY_CHANGED');
  if (!hashValue(expectedRequestSha256)) reasons.push('JEV_TRANSMISSION_REQUEST_UNBOUND');
  if (!STAGES.includes(stage)) reasons.push('JEV_TRANSMISSION_STAGE_UNSUPPORTED');
  const schemaStage = {'adaptive-inferred-owner-input/v2':'repair_owners',
    'adaptive-inferred-repair-owners/v1':'repair_owners', 'adaptive-profile-state/v1':'profiles'}[request?.state?.schema_version];
  if (schemaStage && schemaStage !== stage) reasons.push('JEV_TRANSMISSION_STAGE_MISMATCH');
  const input = validateJevInput(request, {policy:'v4', stage, observedModel, expectedRequestSha256,
    expectedPolicySha256:jevTokenAdmissionPolicy().source.sha256});
  if (!input.input_ready_under_current_policy) reasons.push(...input.admission.reason_codes);
  if (hashValue(expectedRequestSha256) && input.canonical_request_sha256 !== expectedRequestSha256) reasons.push('JEV_TRANSMISSION_REQUEST_CHANGED');
  let prompt = null, repairInput = null;
  const hasRepairInput = request?.state && typeof request.state === 'object'
    && ['repair_input','repair_input_shared_evidence','recovery_source_evidence'].some(key => Object.hasOwn(request.state, key));
  if (hasRepairInput && input.adapter_validation.passed && integrity.passed) {
    if (!['repair','repair_owners'].includes(stage)) reasons.push('JEV_TRANSMISSION_STAGE_MISMATCH');
    try {repairInput = validateRepairInputState(request.state);}
    catch {reasons.push('JEV_TRANSMISSION_REPAIR_INPUT_INVALID');}
  }
  const fixed = stage === 'repair_owners';
  if (fixed && input.adapter_validation.passed && integrity.passed) {
    const promptPolicy = jevPromptPolicy({policy:policy.prompt_policy.version});
    if (policy.prompt_policy.sha256 !== promptPolicy.source.sha256) reasons.push('JEV_TRANSMISSION_PROMPT_POLICY_CHANGED');
    prompt = validateJevPrompt(request, {policy:policy.prompt_policy.version, stage, template:'inferred-v2', observedModel,
      expectedRequestSha256, expectedPolicySha256:policy.prompt_policy.sha256});
    if (!prompt.passed) reasons.push(...prompt.reason_codes);
  }
  return {schema_version:'jev-transmission-preflight/v1', mode:'offline_pre_send', stage,
    passed:reasons.length === 0, reason_codes:[...new Set(reasons)],
    request_sha256:input.canonical_request_sha256, policy_source:{path:policyPath, sha256:policyHash},
    source_integrity:integrity, validation_scope:{adapter:'current_subset', admission_policy:'v4',
      fixed_prompt:fixed ? 'projected_inferred_v2_only' : 'unsupported_for_stage',
      fixed_prompt_checked:prompt !== null, fixed_prompt_passed:prompt?.passed ?? null,
      handler_executed:false, runtime_revision_authorization:'existing_controller_only'},
    prompt_policy_source:fixed ? {path:policy.prompt_policy.contract, sha256:policy.prompt_policy.sha256} : null,
    prompt_reason_codes:prompt?.reason_codes ?? [], structural_links:prompt?.structural_links ?? null,
    repair_input_validation:repairInput,
    official_adapter:{passed:input.adapter_validation.passed, subset:true, official_body_limit:input.official_body_limit},
    admission:{inference_allowed:input.admission.inference_allowed, reason_codes:input.admission.reason_codes,
      warning_codes:input.admission.warning_codes, local_caps:input.admission.local_caps,
      wire_bytes:input.admission.measurements?.wire_bytes ?? null},
    exact_context_fit:'unknown', question_meaning:'not_checked', evidence_truth:'not_checked',
    live_authentication:'not_checked', provider_acceptance:'not_guaranteed', automatic_retries:0,
    performed_calls:{GET:0, POST:0}, reservation_created:false};
}

/** Changed request identity is necessary; the recovery controller owns semantic preservation. */
export function validateJevRecoveryProof(proof, {request, priorRequestSha256, priorStage, stage, priorOutcomeUncertain}) {
  if (priorOutcomeUncertain !== false || priorStage !== stage || !proof
    || proof.schema_version !== 'jev-transmission-recovery/v1' || proof.action !== 'rebuild_relevant_input'
    || !hashValue(priorRequestSha256) || proof.prior_request_sha256 !== priorRequestSha256
    || !['request_sha256','evidence_sha256','source_coverage_sha256'].every(key => hashValue(proof[key]))) fail('JEV_TRANSMISSION_RECOVERY_INVALID');
  const prepared = prepareDecision(request), actual = sha(prepared.serialized);
  if (actual === priorRequestSha256 || proof.request_sha256 !== actual
    || proof.evidence_sha256 !== sha(JSON.stringify(prepared.body.state))) fail('JEV_TRANSMISSION_RECOVERY_UNCHANGED');
  return {schema_version:proof.schema_version, action:proof.action, prior_request_sha256:priorRequestSha256,
    request_sha256:actual, evidence_sha256:proof.evidence_sha256, source_coverage_sha256:proof.source_coverage_sha256,
    source_coverage_semantics:'validated_by_recovery_controller_not_this_gate'};
}
