import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {assessJevTokenAdmission, jevTokenAdmissionPolicy} from '../src/orchestration/jev-token-admission.mjs';

const request = () => ({model: 'jev-latest', state: {ticket: '결제 문제 🙂', paths: ['src/output.py']}, questions: {
  short: {type: 'noul', instructions: 'Does the output need repair?'},
  detailed: {type: 'choice', instructions: 'Select the affected artifact.', criteria: {output: 'Output generation must reject existing directories.', other: null}},
}});

test('admission measures exact wire bytes and every question field but never labels estimates as exact model counts', () => {
  const input = request(), original = structuredClone(input), prepared = prepareDecision(input);
  const result = assessJevTokenAdmission(input);
  assert.equal(result.admission, 'admit_estimated'); assert.equal(result.inference_allowed, true);
  assert.equal(result.request_sha256, createHash('sha256').update(prepared.serialized).digest('hex'));
  assert.equal(result.measurements.wire_bytes, Buffer.byteLength(prepared.serialized, 'utf8'));
  assert.equal(result.measurements.longest_question_id, 'detailed');
  assert.equal(result.measurements.state_plus_longest_question_json_bytes,
    Buffer.byteLength(JSON.stringify(input.state)) + Buffer.byteLength(JSON.stringify(input.questions.detailed)));
  assert.ok(result.measurements.wire_bytes > prepared.serialized.length);
  assert.equal(result.estimates.state_plus_longest_question_tokens,
    Math.ceil(result.measurements.state_plus_longest_question_json_bytes * 2 / 5) + 512);
  assert.deepEqual(result.exact_model_tokens, {request: null, state_plus_longest_question: null});
  assert.equal(result.provider_acceptance_guaranteed, false); assert.equal(result.proven_token_upper_bound, false);
  assert.equal(result.actual_usage, null); assert.equal(result.inference_started, false); assert.deepEqual(input, original);
});

test('separate per-question and aggregate estimates reject different oversized requests before inference', () => {
  const single = request(); single.state = {failure: 'x'.repeat(96000)};
  const rejectedSingle = assessJevTokenAdmission(single);
  assert.equal(rejectedSingle.inference_allowed, false);
  assert.deepEqual(rejectedSingle.reason_codes, ['JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT']);
  assert.ok(rejectedSingle.estimates.request_tokens < 64000);
  const combined = request(); combined.questions = Object.fromEntries(Array.from({length: 32}, (_, i) => [`q${i}`,
    {type: 'noul', instructions: 'x'.repeat(5100)}]));
  const rejectedCombined = assessJevTokenAdmission(combined);
  assert.equal(rejectedCombined.inference_allowed, false);
  assert.deepEqual(rejectedCombined.reason_codes, ['JEV_TOKEN_ADMISSION_ESTIMATED_REQUEST_LIMIT']);
  assert.ok(rejectedCombined.estimates.state_plus_longest_question_tokens < 32000);
  for (const result of [rejectedSingle, rejectedCombined]) {
    assert.equal(result.inference_started, false); assert.equal(result.actual_usage, null); assert.equal(result.automatic_retries, 0);
  }
});

test('a changed request, policy binding or observed resolved model cannot reuse an earlier local admission', () => {
  const input = request(), initial = assessJevTokenAdmission(input), options = {
    expectedRequestSha256: initial.request_sha256, expectedPolicySha256: initial.policy_source.sha256, observedModel: 'jev-1.13.0'};
  assert.equal(assessJevTokenAdmission(input, options).inference_allowed, true);
  input.questions.detailed.criteria.output += ' New obligation.';
  assert.deepEqual(assessJevTokenAdmission(input, options).reason_codes, ['JEV_TOKEN_ADMISSION_REQUEST_CHANGED']);
  assert.deepEqual(assessJevTokenAdmission(request(), {...options, expectedPolicySha256: '0'.repeat(64)}).reason_codes,
    ['JEV_TOKEN_ADMISSION_POLICY_CHANGED']);
  assert.deepEqual(assessJevTokenAdmission(request(), {...options, observedModel: 'jev-1.14.0'}).reason_codes,
    ['JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED']);
  for (const observedModel of ['jev-1.13.0', 'typesafe-ai/jev', 'typesafe/jev-1.13-20260917']) {
    assert.equal(assessJevTokenAdmission(request(), {...options, observedModel}).inference_allowed, true);
  }
  assert.deepEqual(assessJevTokenAdmission({...request(), model: 'unverified-model'}).reason_codes,
    ['JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED']);
});

test('invalid requests stay unmeasured and policy metadata cannot be mutated into permissive admission', () => {
  const input = request(); input.questions.detailed.criteria.output = {unsupported: true};
  const invalid = assessJevTokenAdmission(input);
  assert.equal(invalid.inference_allowed, false); assert.equal(invalid.measurements, null);
  assert.deepEqual(invalid.reason_codes, ['JEV_TOKEN_ADMISSION_INVALID_REQUEST']);
  const policy = jevTokenAdmissionPolicy(); policy.local_limit_interpretation.state_plus_longest_question_tokens = 1e9;
  policy.estimator.tokens_per_utf8_byte_numerator = 0;
  const oversized = request(); oversized.state = 'x'.repeat(96000);
  assert.equal(assessJevTokenAdmission(oversized).inference_allowed, false);
  assert.equal(jevTokenAdmissionPolicy().estimator.tokens_per_utf8_byte_numerator, 2);
});
