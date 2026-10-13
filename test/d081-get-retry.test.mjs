import test from 'node:test';
import assert from 'node:assert/strict';
import {join, resolve} from 'node:path';
import {createMeasuredDecider, JEV_GET_RETRY_V1} from '../src/benchmark/telemetry.mjs';
import {adaptiveSpeedSessionOptions, loadAdaptiveRunManifest} from '../src/benchmark/adaptive-dag-runner.mjs';

const root = resolve(import.meta.dirname, '..');
const request = () => ({model: 'jev-latest', state: 'Choose.', questions: {next: {type: 'choice', instructions: 'Choose.', criteria: {a: 'A', b: 'B'}}}});
const response = () => ({model: 'jev-1.13.0', answers: {next: {type: 'choice', choice: 'a'}}, usage: {input_tokens: 10, output_tokens: 1},
  billing: {mode: 'tokens', modelMultiplier: '1', creditsCharged: '0', paidInputTokensUsed: '10', runId: 'provider-10'},
  receipt: {method: 'POST', destination: 'https://jev-ai.pro/api/v1/systemone', status: 200, automaticRetries: 0, durationMs: 1}});
const http = (status, extra = {}) => Object.assign(new Error('HTTP_ERROR'), {code: 'HTTP_ERROR', status, outcomeUncertain: false, ...extra});
const balances = {paidInputTokensRemaining: 60000000, tokensReserved: 0, tokenDebt: 0, spending_frozen: false};

function harness(creditsFailures, {getRetry = JEV_GET_RETRY_V1} = {}) {
  const counts = {credits: 0, posts: 0, reserves: 0}, events = [], waits = [];
  const client = {listModels: async () => ({models: [{name: 'jev-latest'}]}),
    listCredits: async () => { counts.credits++; if (creditsFailures.length) throw creditsFailures.shift(); return balances; },
    decide: async () => { counts.posts++; return response(); }};
  const budget = {reserve: () => { counts.reserves++; return 'r'; }, settle: () => ({}), snapshot: () => ({}), markUnresolved: async () => {}};
  const run = createMeasuredDecider({client, budget, getRetry, record: async event => events.push(event), sleep: async ms => { waits.push(ms); }});
  return {run, counts, events, waits};
}

test('a confirmed 502 on the credits GET is retried with bounded waits before one reservation and one POST', async () => {
  const {run, counts, events, waits} = harness([http(502), http(503, {retryAfterMs: 30000})]);
  await run(request());
  assert.deepEqual(counts, {credits: 3, posts: 1, reserves: 1});
  assert.deepEqual(waits, [5000, 30000]);
  assert.deepEqual(events.filter(e => e.event === 'provider_get_retry').map(e => [e.call, e.attempt, e.http_status, e.wait_ms]),
    [['credits', 1, 502, 5000], ['credits', 2, 503, 30000]]);
});

test('retries stop after the policy, never apply to other statuses, and stay off without the policy', async () => {
  const exhausted = harness([http(502), http(502), http(502)]);
  await assert.rejects(exhausted.run(request()), {code: 'HTTP_ERROR', http_status: 502});
  assert.deepEqual(exhausted.counts, {credits: 3, posts: 0, reserves: 0});
  const unauthorized = harness([http(401)]);
  await assert.rejects(unauthorized.run(request()), {code: 'HTTP_ERROR', http_status: 401});
  assert.equal(unauthorized.counts.credits, 1); assert.deepEqual(unauthorized.waits, []);
  const off = harness([http(502)], {getRetry: null});
  await assert.rejects(off.run(request()), {code: 'HTTP_ERROR'});
  assert.equal(off.counts.credits, 1);
  assert.throws(() => createMeasuredDecider({client: {}, record: async () => {}, getRetry: {policy: 'other'}}), {code: 'INVALID_GET_RETRY'});
});

test('only v11 and v12 sessions opt into the GET retry policy', () => {
  const options = path => adaptiveSpeedSessionOptions(loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests', path), root));
  assert.deepEqual(options('d076-preserved-repair.json').getRetry, JEV_GET_RETRY_V1);
  assert.deepEqual(options('d081-defaults.json').getRetry, JEV_GET_RETRY_V1);
  assert.equal(options('d075-preserved-repair.json').getRetry, undefined);
});
