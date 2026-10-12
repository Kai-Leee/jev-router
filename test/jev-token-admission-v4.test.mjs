import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {assessJevTokenAdmission as assessV3,jevTokenAdmissionPolicy as policyV3} from '../src/orchestration/jev-token-admission-v3.mjs';
import {assessJevTokenAdmission,jevTokenAdmissionPolicy} from '../src/orchestration/jev-token-admission-v4.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
function sized(size) {
  const request={model:'jev-latest',state:'x',questions:{choose:{type:'choice',instructions:'Choose the existing owner.',
    criteria:{renderer:'Existing renderer owner.',producer:'Existing producer owner.'}}}};
  request.state+='x'.repeat(size-Buffer.byteLength(prepareDecision(request).serialized));return request;
}

test('v4 admits large valid inputs while preserving every measured byte and recording non-blocking local warnings',()=>{
  for(const size of [70510,86809,160000,245000,256000])for(const stage of ['split','relations','repair','profiles','repair_owners']) {
    const request=sized(size),before=structuredClone(request),result=assessJevTokenAdmission(request,{stage});
    assert.equal(result.inference_allowed,true,`${stage} ${size}`);assert.equal(result.admission,'admit_observed');
    assert.deepEqual(result.reason_codes,[]);assert.equal(result.measurements.wire_bytes,size);
    assert.deepEqual(result.local_caps,{request_tokens:null,state_plus_longest_question_tokens:null,repair_wire_bytes:null,profile_wire_bytes:null});
    assert.equal(result.limits.request_tokens,null);assert.equal(result.limits.state_plus_longest_question_tokens,null);
    assert.equal(result.operating_limit.max_wire_bytes,null);assert.equal(result.operating_limit.applied,false);
    assert.deepEqual(result.measurements,assessV3(request,{stage:stage==='repair_owners'?'repair':stage}).measurements);
    assert.equal(result.exact_model_tokens.request,null);assert.equal(result.exact_model_tokens.state_plus_longest_question,null);
    assert.equal(result.provider_acceptance_guaranteed,false);assert.equal(result.proven_token_upper_bound,false);
    assert.equal(result.inference_started,false);assert.equal(result.actual_usage,null);assert.equal(result.automatic_retries,0);
    assert.ok(result.warnings.every(warning=>warning.enforced===false));assert.deepEqual(request,before);
  }
  const historicalShape=assessJevTokenAdmission(sized(70510),{stage:'repair'});
  assert.deepEqual(historicalShape.warning_codes,['JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
  const large=assessJevTokenAdmission(sized(86809),{stage:'repair_owners'});
  assert.deepEqual(large.warning_codes,['JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT','JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
  assert.ok(assessJevTokenAdmission(sized(245000),{stage:'profiles'}).warning_codes.includes('JEV_TOKEN_ADMISSION_ESTIMATED_REQUEST_LIMIT'));
});

test('official body boundary and request schema remain hard failures independently of null local caps',()=>{
  const accepted=sized(256000);assert.equal(assessJevTokenAdmission(accepted,{stage:'repair'}).inference_allowed,true);
  accepted.state+='x';const tooLarge=assessJevTokenAdmission(accepted,{stage:'repair'});
  assert.deepEqual(tooLarge.reason_codes,['JEV_TOKEN_ADMISSION_INVALID_REQUEST']);assert.equal(tooLarge.inference_allowed,false);
  assert.equal(tooLarge.measurements,null);assert.deepEqual(tooLarge.warning_codes,[]);
  for(const state of [null,42,'',[],{}]) {
    assert.deepEqual(assessJevTokenAdmission({...sized(500),state},{stage:'repair_owners'}).reason_codes,['JEV_TOKEN_ADMISSION_INVALID_REQUEST']);
  }
  const bad=sized(500);bad.questions.choose.criteria={only:'Not a legal choice request.'};
  assert.deepEqual(assessJevTokenAdmission(bad,{stage:'repair_owners'}).reason_codes,['JEV_TOKEN_ADMISSION_INVALID_REQUEST']);
});

test('trusted stage, model and hash checks cannot be weakened by sizing warnings or caller policy mutations',()=>{
  const request=sized(86809),policy=jevTokenAdmissionPolicy(),options={stage:'repair_owners',
    expectedRequestSha256:sha(prepareDecision(request).serialized),expectedPolicySha256:policy.source.sha256};
  assert.equal(assessJevTokenAdmission(request,options).inference_allowed,true);
  for(const stage of [undefined,null,'owner','unknown']) {
    const result=assessJevTokenAdmission(request,{...options,stage});
    assert.deepEqual(result.reason_codes,['JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED']);assert.equal(result.inference_allowed,false);
  }
  assert.deepEqual(assessJevTokenAdmission({...request,model:'unknown-model'},{stage:'repair_owners'}).reason_codes,
    ['JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED']);
  assert.deepEqual(assessJevTokenAdmission(request,{...options,observedModel:'unknown-model'}).reason_codes,
    ['JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED']);
  assert.deepEqual(assessJevTokenAdmission(request,{...options,expectedRequestSha256:'0'.repeat(64)}).reason_codes,
    ['JEV_TOKEN_ADMISSION_REQUEST_CHANGED']);
  for(const oldHash of [policyV3().source.sha256,'invalid'])assert.deepEqual(
    assessJevTokenAdmission(request,{...options,expectedPolicySha256:oldHash}).reason_codes,['JEV_TOKEN_ADMISSION_POLICY_CHANGED']);
  policy.local_caps.request_tokens=1;policy.local_limit_interpretation.request_tokens=1;policy.stages.push('unknown');
  assert.equal(assessJevTokenAdmission(request,options).inference_allowed,true);
  assert.equal(assessJevTokenAdmission(request,{stage:'unknown'}).inference_allowed,false);
  assert.equal(assessJevTokenAdmission({...request,state:{stage:'repair_owners',content:request.state}}).inference_allowed,false);
});

test('v4 records inherited references without exposing historical limits as active caps; v3 remains unchanged',()=>{
  const policy=jevTokenAdmissionPolicy();
  assert.equal(policy.schema_version,'jev-token-admission-contract/v4');
  assert.equal(policy.inherited_policy_source.sha256,policyV3().source.sha256);
  assert.deepEqual(policy.local_caps,{request_tokens:null,state_plus_longest_question_tokens:null,repair_wire_bytes:null,profile_wire_bytes:null});
  assert.equal(policy.repair_operating_limit.max_wire_bytes,null);assert.equal(policy.repair_operating_override,undefined);
  assert.equal(policy.historical_reference_policy.repair_operating_limit.max_wire_bytes,48000);
  assert.equal(policy.reference_thresholds.enforced,false);
  assert.equal(policy.official_validation.max_body_utf8_bytes,256000);assert.equal(policy.official_validation.enforced,true);
  assert.equal(assessV3(sized(86809),{stage:'repair'}).inference_allowed,false);
  assert.ok(assessV3(sized(500),{stage:'repair_owners'}).reason_codes.includes('JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED'));
});
