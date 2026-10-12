import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assessJevTokenAdmission as assessV1, jevTokenAdmissionPolicy as v1Policy} from './jev-token-admission.mjs';

const CONTRACT_PATH = 'docs/orchestration/contracts/jev-token-admission.v2.json';
const contractBytes = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url));
const contract = JSON.parse(contractBytes);
const sha = value => createHash('sha256').update(value).digest('hex');
const policyHash = sha(contractBytes), inheritedPolicy = v1Policy();
const hashValue = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const inheritedModulePath = 'src/orchestration/jev-token-admission.mjs';
const inheritedModuleHash = sha(readFileSync(new URL('./jev-token-admission.mjs', import.meta.url)));

if (contract.schema_version !== 'jev-token-admission-contract/v2'
    || contract.inherits.contract_path !== inheritedPolicy.source.path
    || contract.inherits.contract_sha256 !== inheritedPolicy.source.sha256
    || contract.inherits.module_path !== inheritedModulePath
    || contract.inherits.module_sha256 !== inheritedModuleHash
    || JSON.stringify(contract.stages) !== JSON.stringify(['split', 'relations', 'repair'])
    || contract.repair_operating_limit.stage !== 'repair'
    || contract.repair_operating_limit.kind !== 'engineering_wire_byte_limit'
    || !Number.isSafeInteger(contract.repair_operating_limit.max_wire_bytes)
    || contract.repair_operating_limit.max_wire_bytes <= 0
    || contract.repair_operating_limit.proven_token_upper_bound !== false
    || contract.repair_operating_limit.provider_acceptance_guaranteed !== false) {
  throw new Error('JEV_TOKEN_ADMISSION_POLICY_INVALID');
}

/** The v2 source hash transitively binds the unchanged v1 measurements/estimator. */
export function jevTokenAdmissionPolicy() {
  return {...structuredClone(inheritedPolicy), ...structuredClone(contract),
    source: {path: CONTRACT_PATH, sha256: policyHash}};
}

/** Stage comes from trusted orchestration context, never a provider or question ID. */
export function assessJevTokenAdmission(request, {stage = null, observedModel = null,
  expectedRequestSha256 = null, expectedPolicySha256 = null} = {}) {
  const result = assessV1(request, {observedModel, expectedRequestSha256});
  result.schema_version = 'jev-token-admission-result/v2';
  result.policy_id = contract.policy_id;
  result.policy_source = {path: CONTRACT_PATH, sha256: policyHash};
  result.inherited_policy_source = structuredClone(inheritedPolicy.source);
  result.stage = stage;
  const validStage = contract.stages.includes(stage), repair = stage === 'repair';
  const wireBytes = result.measurements?.wire_bytes ?? null;
  result.operating_limit = {...structuredClone(contract.repair_operating_limit), applied: repair,
    measured_wire_bytes: wireBytes, passed: repair && wireBytes !== null ? wireBytes <= contract.repair_operating_limit.max_wire_bytes : null};
  if (!validStage) result.reason_codes.push('JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED');
  if (expectedPolicySha256 !== null && (!hashValue(expectedPolicySha256) || expectedPolicySha256 !== policyHash)) {
    result.reason_codes.push('JEV_TOKEN_ADMISSION_POLICY_CHANGED');
  }
  if (repair && result.operating_limit.passed === false) result.reason_codes.push(contract.repair_operating_limit.reason_code);
  result.inference_allowed = result.reason_codes.length === 0;
  result.admission = result.inference_allowed ? 'admit_estimated' : 'blocked';
  return result;
}
