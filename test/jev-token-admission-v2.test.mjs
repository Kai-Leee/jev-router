import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {assessJevTokenAdmission as assessV1, jevTokenAdmissionPolicy as v1Policy} from '../src/orchestration/jev-token-admission.mjs';
import {assessJevTokenAdmission, jevTokenAdmissionPolicy} from '../src/orchestration/jev-token-admission-v2.mjs';

function requestWithWireBytes(size, questionId = 'decision') {
  const body = {model: 'jev-latest', state: 'x', questions: {[questionId]: {type: 'noul', instructions: 'Is the provided change appropriate?'}}};
  const baseBytes = Buffer.byteLength(prepareDecision(body).serialized);
  body.state += 'x'.repeat(size - baseBytes);
  return body;
}

test('repair wire ceiling blocks a v1-sized false-admit shape independently of token estimates and question IDs', () => {
  const request = requestWithWireBytes(70510, 'unrelated_question_id');
  assert.equal(assessV1(request).inference_allowed, true);
  const result = assessJevTokenAdmission(request, {stage: 'repair'});
  assert.equal(result.inference_allowed, false);
  assert.deepEqual(result.reason_codes, ['JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
  assert.equal(result.measurements.wire_bytes, 70510);
  assert.equal(result.estimates.request_tokens, 28716);
  assert.equal(result.operating_limit.kind, 'engineering_wire_byte_limit');
  assert.equal(result.operating_limit.passed, false);
  assert.equal(result.provider_acceptance_guaranteed, false);
  assert.equal(result.proven_token_upper_bound, false);
  assert.equal(result.actual_usage, null);
  assert.equal(result.exact_model_tokens.request, null);
  assert.equal(result.inference_started, false);
  assert.equal(result.automatic_retries, 0);
  const boundary = requestWithWireBytes(24000);
  assert.equal(assessJevTokenAdmission(boundary, {stage: 'repair'}).inference_allowed, true);
  boundary.state += 'x';
  assert.deepEqual(assessJevTokenAdmission(boundary, {stage: 'repair'}).reason_codes, ['JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
});

test('explicit planning stages preserve inherited estimates while absent or unknown stages cannot bypass repair checks', () => {
  const request = requestWithWireBytes(70510), original = structuredClone(request), before = assessV1(request);
  for (const stage of ['split', 'relations']) {
    const result = assessJevTokenAdmission(request, {stage});
    assert.equal(result.inference_allowed, true);
    assert.equal(result.operating_limit.applied, false);
    assert.equal(result.operating_limit.passed, null);
    assert.deepEqual(result.measurements, before.measurements);
    assert.deepEqual(result.estimates, before.estimates);
    assert.equal(result.request_sha256, before.request_sha256);
  }
  for (const options of [undefined, {stage: 'unknown'}]) {
    assert.deepEqual(assessJevTokenAdmission(request, options).reason_codes, ['JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED']);
  }
  assert.deepEqual(request, original);
});

test('v2 policy and request bindings reject v1 reuse or mutation, and callers cannot weaken the wire ceiling', () => {
  const request = requestWithWireBytes(24000), prepared = prepareDecision(request), policy = jevTokenAdmissionPolicy();
  const expectedRequestSha256 = createHash('sha256').update(prepared.serialized).digest('hex');
  const options = {stage: 'repair', expectedRequestSha256, expectedPolicySha256: policy.source.sha256};
  const result = assessJevTokenAdmission(request, options);
  assert.equal(result.inference_allowed, true);
  assert.equal(result.inherited_policy_source.sha256, v1Policy().source.sha256);
  assert.notEqual(policy.source.sha256, v1Policy().source.sha256);
  assert.deepEqual(assessJevTokenAdmission(request, {...options, expectedPolicySha256: v1Policy().source.sha256}).reason_codes,
    ['JEV_TOKEN_ADMISSION_POLICY_CHANGED']);
  request.state = request.state.slice(1);
  assert.deepEqual(assessJevTokenAdmission(request, options).reason_codes, ['JEV_TOKEN_ADMISSION_REQUEST_CHANGED']);
  policy.repair_operating_limit.max_wire_bytes = 1e9;
  assert.equal(assessJevTokenAdmission(requestWithWireBytes(24001), {stage: 'repair'}).inference_allowed, false);
});
