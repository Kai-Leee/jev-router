import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assessJevTokenAdmission as assessV4, jevTokenAdmissionPolicy as policyV4} from './jev-token-admission-v4.mjs';
import {jevModelRegistry, assertJevModelRegistrySource, isJevRequestedModel, resolveJevObservedModel} from '../jev-model-registry.mjs';
const path = 'docs/orchestration/contracts/jev-token-admission.v5.json';
const raw = readFileSync(new URL(`../../${path}`, import.meta.url));
const contract = JSON.parse(raw), inherited = policyV4(), registry = jevModelRegistry();
const sha = value => createHash('sha256').update(value).digest('hex');
const source = {path, sha256: sha(raw)};
const inheritedModule = 'src/orchestration/jev-token-admission-v4.mjs';
if (contract.schema_version !== 'jev-token-admission-contract/v5' || contract.inherits.contract_path !== inherited.source.path
  || contract.inherits.contract_sha256 !== inherited.source.sha256 || contract.inherits.module_path !== inheritedModule
  || contract.inherits.module_sha256 !== sha(readFileSync(new URL('./jev-token-admission-v4.mjs', import.meta.url)))
  || contract.model_registry.contract !== registry.source.path || contract.model_registry.sha256 !== registry.source.sha256
  || contract.model_registry.module !== registry.module_source.path || contract.model_registry.module_sha256 !== registry.module_source.sha256
  || JSON.stringify(contract.stages) !== JSON.stringify(inherited.stages) || contract.model_policy !== 'registry-replaces-inherited-model-gate'
  || contract.automatic_retries !== 0 || contract.provider_acceptance_guaranteed !== false || contract.proven_token_upper_bound !== false)
  throw new Error('JEV_TOKEN_ADMISSION_POLICY_INVALID');

export function jevTokenAdmissionPolicy() {
  return {...structuredClone(inherited), ...structuredClone(contract), source: {...source},
    inherited_policy_source: structuredClone(inherited.source), model_registry_source: {...registry.source},
    applies_to_requested_models: [...registry.request_models], accepted_observed_model_labels: registry.observed_models.map(row => row.label),
    model_context_assumption: null};
}

/** v4 measurements and wire rules, with one shared exact-label model authority for admission and billing. */
export function assessJevTokenAdmission(request, {stage = null, observedModel = null,
  expectedRequestSha256 = null, expectedPolicySha256 = null, expectedModelRegistrySha256 = null} = {}) {
  const result = assessV4(request, {stage, observedModel, expectedRequestSha256});
  result.schema_version = 'jev-token-admission-result/v5'; result.policy_id = contract.policy_id;
  result.policy_source = {...source}; result.inherited_policy_source = structuredClone(inherited.source);
  result.model_registry_source = {...registry.source}; result.model_context_assumption = resolveJevObservedModel(observedModel)?.version ?? null;
  // Replace only the inherited model allowlist; all wire, SHA, stage and request errors remain untouched.
  result.reason_codes = result.reason_codes.filter(code => code !== 'JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED');
  if (result.requested_model !== null && (!isJevRequestedModel(result.requested_model)
    || observedModel !== null && !resolveJevObservedModel(observedModel)?.preflight_allowed))
    result.reason_codes.push('JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED');
  try { assertJevModelRegistrySource(expectedModelRegistrySha256); }
  catch { result.reason_codes.push('JEV_TOKEN_ADMISSION_MODEL_REGISTRY_CHANGED'); }
  if (expectedPolicySha256 !== null && expectedPolicySha256 !== source.sha256)
    result.reason_codes.push('JEV_TOKEN_ADMISSION_POLICY_CHANGED');
  result.inference_allowed = result.reason_codes.length === 0;
  result.admission = result.inference_allowed ? 'admit_observed' : 'blocked';
  return result;
}
