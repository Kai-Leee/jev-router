import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {validateJevInput, auditJevInputs} from '../scripts/validate-jev-input.mjs';
import {createJevClient, prepareDecision} from '../src/client.mjs';

const small = () => ({state: 'The worker owns one independent file.', questions: {next: {
  type: 'choice', instructions: 'Choose the next action from the evidence.', criteria: {execute: 'Dependencies are met.', wait: 'An input is missing.'},
}}});
const sized = size => {
  const request = small();
  request.state += 'x'.repeat(size - Buffer.byteLength(prepareDecision(request).serialized));
  return request;
};
const temporary = fn => {
  const dir = mkdtempSync(join(tmpdir(), 'jev-input-test-'));
  try { return fn(dir); } finally { rmSync(dir, {recursive: true, force: true}); }
};
const cli = args => spawnSync(process.execPath, ['scripts/validate-jev-input.mjs', ...args], {encoding: 'utf8'});

test('offline validation preserves input, hides content, and never mistakes an estimate for exact model fit', () => {
  const request = small(), before = structuredClone(request);
  const result = validateJevInput(request, {stage: 'split'});
  assert.equal(result.input_ready_under_current_policy, true);
  assert.equal(result.exact_context_fit, 'unknown');
  assert.equal(result.semantic_sufficiency, 'not_checked');
  assert.deepEqual(result.admission.exact_model_tokens, {request: null, state_plus_longest_question: null});
  assert.equal(result.admission.provider_acceptance_guaranteed, false);
  assert.equal(JSON.stringify(result).includes(request.state), false);
  assert.deepEqual(request, before);
  for (const invalid of [{...request, state: ''}, {...request, questions: {bad: {type: 'choice', instructions: 'Choose.', criteria: {only: 'one'}}}}]) {
    assert.equal(validateJevInput(invalid, {stage: 'split'}).adapter_validation.passed, false);
  }
  assert.equal(validateJevInput({...request, model: 'unknown-model'}, {stage: 'split'}).input_ready_under_current_policy, false);
  assert.equal(validateJevInput(request).input_ready_under_current_policy, false);
});

test('official byte cap, model estimate, and engineering repair ceiling remain distinct', () => {
  const guarded = validateJevInput(sized(48001), {stage: 'repair'});
  assert.equal(guarded.adapter_validation.passed, true);
  assert.equal(guarded.official_body_limit.passed, true);
  assert.deepEqual(guarded.admission.reason_codes, ['JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
  assert.equal(validateJevInput(sized(48001), {stage: 'split'}).input_ready_under_current_policy, true);
  const large = validateJevInput(sized(86809), {stage: 'repair'});
  assert.equal(large.official_body_limit.passed, true);
  assert.deepEqual(large.admission.reason_codes, ['JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT', 'JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT']);
  const invalid = validateJevInput(sized(256001), {stage: 'repair'});
  assert.equal(invalid.official_body_limit.passed, false);
  assert.equal(invalid.adapter_validation.passed, false);
  assert.equal(invalid.input_ready_under_current_policy, false);
});

test('run audit binds controller stage, admission/request hashes and actual historical destination', () => temporary(dir => {
  mkdirSync(join(dir, 'calls')); mkdirSync(join(dir, 'receipts'));
  const request = small(), admission = validateJevInput(request, {stage: 'split', observedModel: 'typesafe-ai/jev'}).admission;
  const write = (path, value) => writeFileSync(join(dir, path), JSON.stringify(value));
  write('calls/jev-0001.request.json', request);
  write('calls/jev-0001.token-admission.json', admission);
  write('receipts/jev-0001.json', {id: 'jev-0001', provider: 'jev', stage: 'split', inference_started: true, status: 'completed', model: 'jev-1.13.0'});
  write('calls/jev-0001.response.json', {model: 'jev-1.13.0', receipt: {method: 'POST', destination: 'https://jev-ai.pro/api/v1/systemone', status: 200, automaticRetries: 0}});
  const good = auditJevInputs({runs: [dir]});
  assert.equal(good.audit_complete, true); assert.equal(good.summary.historical_post_200, 1);
  assert.notEqual(good.requests[0].historical.preflight_observed_model, good.requests[0].historical.response_model);
  assert.deepEqual(good.performed_calls, {GET: 0, POST: 0}); assert.equal(good.summary.changed_input_files, 0);
  write('calls/jev-0001.request.json', {...request, state: 'Changed after admission.'});
  assert.equal(auditJevInputs({runs: [dir]}).audit_complete, false);
  write('calls/jev-0001.request.json', request);
  write('calls/jev-0001.response.json', {model: 'jev-1.13.0', receipt: {method: 'POST', destination: 'https://wrong.invalid', status: 200, automaticRetries: 0}});
  assert.equal(auditJevInputs({runs: [dir]}).audit_complete, false);
  write('receipts/jev-0001.json', {id: 'jev-0001', provider: 'jev', stage: 'split', inference_started: true, status: 'completed', model: 'unknown-model'});
  assert.ok(auditJevInputs({runs: [dir]}).issues.some(issue => issue.code === 'RESPONSE_MODEL_UNVERIFIED'));
}));

test('CLI fails closed for blocked input, empty audit, malformed JSON, and an existing output', () => temporary(dir => {
  const request = join(dir, 'request.json'), report = join(dir, 'report.json');
  writeFileSync(request, JSON.stringify(sized(86809)));
  assert.equal(cli(['--request', request, '--stage', 'repair', '--out', report]).status, 2);
  const before = readFileSync(report);
  assert.equal(JSON.parse(before).summary.blocked, 1);
  assert.equal(cli(['--request', request, '--stage', 'repair', '--out', report]).status, 1);
  assert.deepEqual(readFileSync(report), before);
  assert.equal(cli(['--request', request]).status, 1);
  mkdirSync(join(dir, 'calls')); mkdirSync(join(dir, 'receipts'));
  assert.equal(cli(['--run', dir]).status, 1);
  assert.equal(cli(['--run', dir, '--out', join(dir, 'new.json')]).status, 1);
  writeFileSync(request, '{"state":"DO_NOT_ECHO_SECRET');
  const invalid = cli(['--request', request, '--stage', 'repair']);
  assert.equal(invalid.status, 1);
  assert.equal((invalid.stdout + invalid.stderr).includes('DO_NOT_ECHO_SECRET'), false);
}));

test('adapter destination is tested with an injected transport and a synthetic key; no network', async () => {
  const seen = [], client = createJevClient({apiKey: 'synthetic-offline-key', fetchImpl: async (url, options) => {
    seen.push({url, method: options.method, redirect: options.redirect});
    assert.equal(options.headers.Authorization, 'Bearer synthetic-offline-key');
    return new Response(JSON.stringify({model: 'jev-1.13.0', answers: {ready: {type: 'noul', noul: 1}}, usage: {input_tokens: 1, output_tokens: 1}}), {status: 200});
  }});
  await client.decide({state: 'Synthetic transport check.', questions: {ready: {type: 'noul', instructions: 'Is this a check?'}}});
  assert.deepEqual(seen, [{url: 'https://jev-ai.pro/api/v1/systemone', method: 'POST', redirect: 'error'}]);
});
