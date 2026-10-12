import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assessJevTokenAdmission as assessV1} from './jev-token-admission.mjs';
import {jevTokenAdmissionPolicy as v2Policy} from './jev-token-admission-v2.mjs';

const CONTRACT_PATH = 'docs/orchestration/contracts/jev-token-admission.v3.json';
const contractBytes = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url));
const contract = JSON.parse(contractBytes);
const sha = value => createHash('sha256').update(value).digest('hex');
const policyHash = sha(contractBytes), inheritedPolicy = v2Policy();
const hashValue = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const inheritedModulePath = 'src/orchestration/jev-token-admission-v2.mjs';
const inheritedModuleHash = sha(readFileSync(new URL('./jev-token-admission-v2.mjs', import.meta.url)));
const inheritedRepairLimit = inheritedPolicy.repair_operating_limit;
const repairOverride = contract.repair_operating_override;
const repairLimit = {...inheritedRepairLimit, ...repairOverride};

if (contract.schema_version !== 'jev-token-admission-contract/v3'
    || contract.inherits.contract_path !== inheritedPolicy.source.path
    || contract.inherits.contract_sha256 !== inheritedPolicy.source.sha256
    || contract.inherits.module_path !== inheritedModulePath
    || contract.inherits.module_sha256 !== inheritedModuleHash
    || JSON.stringify(contract.stages) !== JSON.stringify(['split', 'relations', 'repair', 'profiles'])
    || contract.repair_limit_inheritance.unchanged !== true
    || contract.repair_limit_inheritance.expected_max_wire_bytes !== 24000
    || inheritedRepairLimit.max_wire_bytes !== contract.repair_limit_inheritance.expected_max_wire_bytes
    || repairOverride.max_wire_bytes !== 48000
    || repairOverride.overrides_max_wire_bytes !== inheritedRepairLimit.max_wire_bytes
    || repairOverride.proven_token_upper_bound !== false
    || repairOverride.provider_acceptance_guaranteed !== false
    || repairOverride.prospective_acceptance_measured !== false
    || repairLimit.stage !== 'repair'
    || repairLimit.kind !== 'engineering_wire_byte_limit'
    || repairLimit.proven_token_upper_bound !== false
    || repairLimit.provider_acceptance_guaranteed !== false) {
  throw new Error('JEV_TOKEN_ADMISSION_POLICY_INVALID');
}

/** Pin inherited sources and distinguish the explicit v3 operating override. */
export function jevTokenAdmissionPolicy() {
  return {...structuredClone(inheritedPolicy), ...structuredClone(contract),
    inherited_repair_operating_limit: structuredClone(inheritedRepairLimit),
    repair_operating_limit: structuredClone(repairLimit),
    source: {path: CONTRACT_PATH, sha256: policyHash}};
}

/** Pure local assessment. Trusted stage is supplied by the controller, not the request. */
export function assessJevTokenAdmission(request, {stage = null, observedModel = null,
  expectedRequestSha256 = null, expectedPolicySha256 = null} = {}) {
  const result = assessV1(request, {observedModel, expectedRequestSha256});
  result.schema_version = 'jev-token-admission-result/v3';
  result.policy_id = contract.policy_id;
  result.policy_source = {path: CONTRACT_PATH, sha256: policyHash};
  result.inherited_policy_source = structuredClone(inheritedPolicy.source);
  result.inherited_repair_operating_limit = structuredClone(inheritedRepairLimit);
  result.stage = stage;
  const validStage = contract.stages.includes(stage), repair = stage === 'repair';
  const wireBytes = result.measurements?.wire_bytes ?? null;
  result.operating_limit = {...structuredClone(repairLimit), applied: repair,
    measured_wire_bytes: wireBytes, passed: repair && wireBytes !== null ? wireBytes <= repairLimit.max_wire_bytes : null};
  if (!validStage) result.reason_codes.push('JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED');
  if (expectedPolicySha256 !== null && (!hashValue(expectedPolicySha256) || expectedPolicySha256 !== policyHash)) {
    result.reason_codes.push('JEV_TOKEN_ADMISSION_POLICY_CHANGED');
  }
  if (repair && result.operating_limit.passed === false) result.reason_codes.push(repairLimit.reason_code);
  result.inference_allowed = result.reason_codes.length === 0;
  result.admission = result.inference_allowed ? 'admit_estimated' : 'blocked';
  return result;
}
