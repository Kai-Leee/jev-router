import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {assessJevTokenAdmission as assessV1, jevTokenAdmissionPolicy as v1Policy} from '../src/orchestration/jev-token-admission.mjs';
import {assessJevTokenAdmission as assessV2, jevTokenAdmissionPolicy as v2Policy} from '../src/orchestration/jev-token-admission-v2.mjs';
import {assessJevTokenAdmission, jevTokenAdmissionPolicy} from '../src/orchestration/jev-token-admission-v3.mjs';

function requestWithWireBytes(size, questionId = 'decision') {
  const body = {model: 'jev-latest', state: 'x', questions: {[questionId]: {type: 'noul', instructions: 'Is the provided change appropriate?'}}};
  const baseBytes = Buffer.byteLength(prepareDecision(body).serialized);
  body.state += 'x'.repeat(size - baseBytes);
  return body;
}

test('v3 preserves v2 measurements and global estimates while applying only the explicit repair override', () => {
  for (const size of [24000, 24001, 70510, 112528]) for (const stage of ['split', 'relations', 'repair']) {
    const request = requestWithWireBytes(size), before = assessV2(request, {stage}), result = assessJevTokenAdmission(request, {stage});
    for (const field of ['measurements', 'estimates', 'limits', 'request_sha256']) {
      assert.deepEqual(result[field], before[field], `${stage} ${size} ${field}`);
    }
    if(stage!=='repair') {
      assert.deepEqual(result.reason_codes,before.reason_codes);
      assert.equal(result.inference_allowed,before.inference_allowed);
    }
    assert.deepEqual(result.inherited_repair_operating_limit,v2Policy().repair_operating_limit);
    assert.equal(result.operating_limit.max_wire_bytes,48000);
    assert.equal(result.operating_limit.overrides_max_wire_bytes,24000);
  }
  assert.equal(assessV2(requestWithWireBytes(24001),{stage:'repair'}).inference_allowed,false);
  assert.equal(assessJevTokenAdmission(requestWithWireBytes(24001),{stage:'repair'}).inference_allowed,true);
  for(const size of [47999,48000])assert.equal(assessJevTokenAdmission(requestWithWireBytes(size),{stage:'repair'}).inference_allowed,true);
  for(const size of [48001,70510])assert.deepEqual(assessJevTokenAdmission(requestWithWireBytes(size),{stage:'repair'}).reason_codes,
    ['JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
  const overTokenLimit=assessJevTokenAdmission(requestWithWireBytes(112528),{stage:'repair'});
  assert.deepEqual(overTokenLimit.reason_codes,['JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT','JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
  assert.equal(overTokenLimit.provider_acceptance_guaranteed,false);assert.equal(overTokenLimit.exact_model_tokens.request,null);
});

test('profiles is a trusted additional stage; global estimates still block oversized state or aggregate', () => {
  for (const size of [24001, 70510, 112528]) {
    const request = requestWithWireBytes(size), original = structuredClone(request), before = assessV1(request);
    const result = assessJevTokenAdmission(request, {stage:'profiles'});
    assert.deepEqual(result.measurements,before.measurements);assert.deepEqual(result.estimates,before.estimates);
    assert.deepEqual(result.reason_codes,before.reason_codes);assert.equal(result.inference_allowed,before.inference_allowed);
    assert.equal(result.operating_limit.applied,false);assert.equal(result.operating_limit.passed,null);
    assert.equal(result.exact_model_tokens.request,null);assert.equal(result.actual_usage,null);
    assert.equal(result.provider_acceptance_guaranteed,false);assert.equal(result.inference_started,false);assert.equal(result.automatic_retries,0);
    assert.deepEqual(request,original);
  }
  const request = {model:'jev-latest',state:'tiny',questions:Object.fromEntries(Array.from({length:50},(_,i)=>[
    `profile${i}`,{type:'choice',instructions:'Choose a profile.',criteria:{opus:'Opus '+ 'a'.repeat(1700),sonnet:'Sonnet '+ 'b'.repeat(1700)}}]))};
  const result = assessJevTokenAdmission(request,{stage:'profiles'});
  assert.deepEqual(result.reason_codes,['JEV_TOKEN_ADMISSION_ESTIMATED_REQUEST_LIMIT']);
  assert.ok(result.estimates.state_plus_longest_question_tokens < 32000);
  assert.deepEqual(assessJevTokenAdmission(request,{stage:'repair'}).reason_codes,
    ['JEV_TOKEN_ADMISSION_ESTIMATED_REQUEST_LIMIT','JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
});

test('untrusted question IDs or state cannot supply a missing runtime stage', () => {
  const request = requestWithWireBytes(48001,'profiles');request.state={stage:'profiles',phase:'initial',body:request.state};
  for (const options of [undefined,{stage:'profile'},{stage:'unknown'}]) {
    assert.deepEqual(assessJevTokenAdmission(request,options).reason_codes,['JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED']);
  }
  assert.deepEqual(assessJevTokenAdmission(request,{stage:'repair'}).reason_codes,['JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
});

test('v3 requires current policy and request SHA when supplied, and preserves observed-model rejection', () => {
  const request = requestWithWireBytes(24000), policy = jevTokenAdmissionPolicy();
  const expectedRequestSha256 = createHash('sha256').update(prepareDecision(request).serialized).digest('hex');
  const options = {stage:'profiles',expectedRequestSha256,expectedPolicySha256:policy.source.sha256};
  const result = assessJevTokenAdmission(request,options);
  assert.equal(result.inference_allowed,true);assert.equal(result.inherited_policy_source.sha256,v2Policy().source.sha256);
  const previousV3PolicyHash='a8599f7650c1c1357758bba63ec5dc16ae365c241da40406eb067d25466ce9f6';
  for (const oldHash of [v1Policy().source.sha256,v2Policy().source.sha256,previousV3PolicyHash,'invalid']) {
    assert.deepEqual(assessJevTokenAdmission(request,{...options,expectedPolicySha256:oldHash}).reason_codes,['JEV_TOKEN_ADMISSION_POLICY_CHANGED']);
  }
  assert.deepEqual(assessJevTokenAdmission(request,{...options,observedModel:'unknown-model'}).reason_codes,['JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED']);
  request.state=request.state.slice(1);
  assert.deepEqual(assessJevTokenAdmission(request,options).reason_codes,['JEV_TOKEN_ADMISSION_REQUEST_CHANGED']);
  policy.repair_operating_limit.max_wire_bytes=1e9;policy.local_limit_interpretation.request_tokens=1e9;
  policy.stages.push('unknown');
  policy.inherited_repair_operating_limit.max_wire_bytes=1e9;policy.repair_operating_override.max_wire_bytes=1e9;
  assert.equal(assessJevTokenAdmission(requestWithWireBytes(48001),{stage:'repair'}).inference_allowed,false);
  assert.equal(assessJevTokenAdmission(request,{stage:'unknown'}).inference_allowed,false);
});
