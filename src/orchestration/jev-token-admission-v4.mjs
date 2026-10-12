import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {assessJevTokenAdmission as assessV1} from './jev-token-admission.mjs';
import {jevTokenAdmissionPolicy as v3Policy} from './jev-token-admission-v3.mjs';

const CONTRACT_PATH='docs/orchestration/contracts/jev-token-admission.v4.json';
const contractBytes=readFileSync(new URL(`../../${CONTRACT_PATH}`,import.meta.url));
const contract=JSON.parse(contractBytes), inheritedPolicy=v3Policy();
const sha=value=>createHash('sha256').update(value).digest('hex');
const policyHash=sha(contractBytes);
const hashValue=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const inheritedModulePath='src/orchestration/jev-token-admission-v3.mjs';
const inheritedModuleHash=sha(readFileSync(new URL('./jev-token-admission-v3.mjs',import.meta.url)));
const LOCAL_ESTIMATE_CODES=new Set(['JEV_TOKEN_ADMISSION_ESTIMATED_REQUEST_LIMIT','JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT']);

if(contract.schema_version!=='jev-token-admission-contract/v4'
  ||contract.inherits.contract_path!==inheritedPolicy.source.path
  ||contract.inherits.contract_sha256!==inheritedPolicy.source.sha256
  ||contract.inherits.module_path!==inheritedModulePath||contract.inherits.module_sha256!==inheritedModuleHash
  ||JSON.stringify(contract.stages)!==JSON.stringify(['split','relations','repair','profiles','repair_owners'])
  ||JSON.stringify(contract.local_caps)!==JSON.stringify({request_tokens:null,state_plus_longest_question_tokens:null,repair_wire_bytes:null,profile_wire_bytes:null})
  ||contract.reference_thresholds.enforced!==false
  ||contract.reference_thresholds.request_tokens_estimate!==inheritedPolicy.local_limit_interpretation.request_tokens
  ||contract.reference_thresholds.state_plus_longest_question_tokens_estimate!==inheritedPolicy.local_limit_interpretation.state_plus_longest_question_tokens
  ||contract.reference_thresholds.repair_wire_bytes!==inheritedPolicy.repair_operating_limit.max_wire_bytes
  ||JSON.stringify(contract.reference_thresholds.repair_observation_stages)!==JSON.stringify(['repair','repair_owners'])
  ||contract.official_validation.validator!=='prepareDecision'||contract.official_validation.max_body_utf8_bytes!==256000
  ||contract.official_validation.enforced!==true||contract.automatic_retries!==0
  ||contract.proven_token_upper_bound!==false||contract.provider_acceptance_guaranteed!==false) {
  throw new Error('JEV_TOKEN_ADMISSION_POLICY_INVALID');
}

const localLimits=()=>({request_tokens:null,state_plus_longest_question_tokens:null,
  basis:'D073 explicit v4 policy: local token estimates are observations only; no local token caps.'});
const wireObservation=(stage,wireBytes)=>({stage:'repair',kind:'observation_only',max_wire_bytes:null,applied:false,passed:null,
  measured_wire_bytes:wireBytes,reference_max_wire_bytes:contract.reference_thresholds.repair_wire_bytes,
  reference_applies:contract.reference_thresholds.repair_observation_stages.includes(stage),
  exceeded_reference:wireBytes!==null&&contract.reference_thresholds.repair_observation_stages.includes(stage)
    ?wireBytes>contract.reference_thresholds.repair_wire_bytes:null,
  enforced:false,proven_token_upper_bound:false,provider_acceptance_guaranteed:false});

/** Return explicit null caps, immutable historical references and the pinned v4 source. */
export function jevTokenAdmissionPolicy() {
  const inherited=structuredClone(inheritedPolicy);
  for(const key of ['repair_operating_override','repair_limit_inheritance','inherited_repair_operating_limit'])delete inherited[key];
  return {...inherited,...structuredClone(contract),
    inherited_policy_source:structuredClone(inheritedPolicy.source),
    historical_reference_policy:{source:structuredClone(inheritedPolicy.source),
      local_limit_interpretation:structuredClone(inheritedPolicy.local_limit_interpretation),
      repair_operating_limit:structuredClone(inheritedPolicy.repair_operating_limit)},
    local_limit_interpretation:localLimits(),
    repair_operating_limit:wireObservation(null,null),
    source:{path:CONTRACT_PATH,sha256:policyHash}};
}

/** No inference/reservation/retry. Only local sizing failures become non-blocking observations. */
export function assessJevTokenAdmission(request,{stage=null,observedModel=null,
  expectedRequestSha256=null,expectedPolicySha256=null}={}) {
  const result=assessV1(request,{observedModel,expectedRequestSha256});
  const estimateWarnings=result.reason_codes.filter(code=>LOCAL_ESTIMATE_CODES.has(code));
  result.reason_codes=result.reason_codes.filter(code=>!LOCAL_ESTIMATE_CODES.has(code));
  result.schema_version='jev-token-admission-result/v4';
  result.policy_id=contract.policy_id;result.policy_source={path:CONTRACT_PATH,sha256:policyHash};
  result.inherited_policy_source=structuredClone(inheritedPolicy.source);
  result.stage=stage;result.limits=localLimits();result.local_caps=structuredClone(contract.local_caps);
  result.reference_thresholds=structuredClone(contract.reference_thresholds);
  result.official_validation=structuredClone(contract.official_validation);
  result.operating_limit=wireObservation(stage,result.measurements?.wire_bytes??null);
  result.warning_codes=[...estimateWarnings];
  if(result.operating_limit.exceeded_reference===true)result.warning_codes.push('JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT');
  result.warnings=result.warning_codes.map(code=>{
    const request=code==='JEV_TOKEN_ADMISSION_ESTIMATED_REQUEST_LIMIT';
    const question=code==='JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT';
    return {code,enforced:false,kind:request||question?'heuristic_token_observation':'engineering_byte_observation',
      measured_value:request?result.estimates.request_tokens:question?result.estimates.state_plus_longest_question_tokens:result.measurements.wire_bytes,
      reference_limit:request?contract.reference_thresholds.request_tokens_estimate:question?contract.reference_thresholds.state_plus_longest_question_tokens_estimate:contract.reference_thresholds.repair_wire_bytes};
  });
  if(!contract.stages.includes(stage))result.reason_codes.push('JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED');
  if(expectedPolicySha256!==null&&(!hashValue(expectedPolicySha256)||expectedPolicySha256!==policyHash))result.reason_codes.push('JEV_TOKEN_ADMISSION_POLICY_CHANGED');
  result.inference_allowed=result.reason_codes.length===0;
  result.admission=result.inference_allowed?'admit_observed':'blocked';
  return result;
}
