import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createJevClient, prepareDecision, retryAfterMs } from '../src/client.mjs';
import { loadConfig, describeConfig } from '../src/config.mjs';

const KEY = 'fake-unit-test-key';
const example = JSON.parse(readFileSync(new URL('../examples/decision.json', import.meta.url), 'utf8'));
const validResult = () => ({
  model: 'jev-1.13.0',
  answers: { work_type: { type: 'choice', choice: 'coding', probabilities: { coding: 0.9, research: 0.1 }, confidence: 0.8 } },
  usage: { input_tokens: 100, output_tokens: 10 },
});
const response = (data, init = {}) => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' }, ...init });

test('GET uses only the Jev AI models endpoint and Bearer key, without inference', async () => {
  const calls = [];
  const client = createJevClient({ apiKey: KEY, fetchImpl: async (url, init) => {
    calls.push({ url, init });
    return response({ models: [{ name: 'jev-latest', description: 'Stable alias' }] });
  } });
  const result = await client.listModels();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://jev-ai.pro/api/v1/models');
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.body, undefined);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${KEY}`);
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(result.models[0].name, 'jev-latest');
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test('credits GET validates complete balance evidence and keeps secrets and unknown fields out', async () => {
  const good = {paidInputTokensRemaining:60000000,creditsRemaining:2,tokensReserved:0,tokenDebt:0,spending_frozen:false};
  let calls = 0;
  const client = createJevClient({apiKey:KEY,fetchImpl:async (url, init) => {
    calls++; assert.equal(url,'https://jev-ai.pro/api/v1/credits'); assert.equal(init.method,'GET');
    return response({...good,private_data:'do not return'});
  }});
  const result=await client.listCredits();assert.equal(calls,1);assert.equal(result.tokenDebt,0);
  assert.equal(Object.hasOwn(result,'private_data'),false);assert.equal(JSON.stringify(result).includes(KEY),false);
  for (const broken of [{...good,tokenDebt:undefined},{...good,tokensReserved:'0'},{...good,spending_frozen:0}]) {
    await assert.rejects(createJevClient({apiKey:KEY,fetchImpl:async()=>response(broken)}).listCredits(),{code:'INVALID_RESPONSE'});
  }
});

test('POST targets the exact systemone path; preserves resolved model, probability and billing units', async () => {
  let calls = 0;
  const client = createJevClient({ apiKey: KEY, fetchImpl: async (url, init) => {
    calls++;
    assert.equal(url, 'https://jev-ai.pro/api/v1/systemone');
    assert.equal(init.method, 'POST');
    assert.equal(init.redirect, 'error');
    assert.equal(init.headers.Authorization, `Bearer ${KEY}`);
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.equal(JSON.parse(init.body).model, 'jev-latest');
    assert.ok(init.signal instanceof AbortSignal);
    return response(validResult(), { headers: {
      'x-jev-run-id': 'fixture-run', 'x-jev-billing': 'tokens',
      'x-jev-paid-input-tokens-used': '100', 'x-jev-credits-charged': '0',
      'x-jev-model-multiplier': '1', 'x-jev-tokens-remaining': '900',
    } });
  } });
  const { model: _model, ...withoutModel } = example;
  const result = await client.decide(withoutModel);
  assert.equal(calls, 1);
  assert.equal(result.model, 'jev-1.13.0');
  assert.equal(result.answers.work_type.choice, 'coding');
  assert.equal(result.answers.work_type.confidence, 0.8);
  assert.equal(result.answers.work_type.probabilities.coding, 0.9);
  assert.equal(result.usage.cost, null);
  assert.equal(result.billing.paidInputTokensUsed, '100');
  assert.equal(result.billing.creditsCharged, '0');
  assert.equal(result.billing.creditsRemaining, null);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test('noul and score answers retain their separate semantics', async () => {
  const input = { state: 'Test', questions: {
    yes: { type: 'noul', instructions: 'Is it relevant?' },
    priority: { type: 'score', instructions: 'How urgent?', criteria: ['low', 'high'] },
  } };
  const client = createJevClient({ apiKey: KEY, fetchImpl: async () => response({
    model: 'jev-1.13.0',
    answers: { yes: { type: 'noul', noul: 0.8 }, priority: { type: 'score', score: 0.7, probabilities: { 0: 0.3, 1: 0.7 }, confidence: 0.6 } },
    usage: { input_tokens: 1, output_tokens: 0 },
  }) });
  const result = await client.decide(input);
  assert.equal(result.answers.yes.noul, 0.8);
  assert.equal(result.answers.priority.score, 0.7);
  assert.deepEqual(result.answers.priority.legend, { 0: 'low', 1: 'high' });
});

for (const status of [401, 402, 404, 409, 422, 429, 502, 503, 504]) {
  test(`HTTP ${status} never replays the POST or includes upstream error text`, async () => {
    let calls = 0;
    const client = createJevClient({ apiKey: KEY, fetchImpl: async () => {
      calls++;
      return response({ error: { code: status, message: `Authorization: Bearer ${KEY}` } }, { status, headers: { 'retry-after': '3' } });
    } });
    await assert.rejects(client.decide(example), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.retryAfterMs, 3000);
      assert.equal(error.outcomeUncertain, status >= 500);
      assert.equal(error.automaticRetries, 0);
      assert.equal(String(error).includes(KEY), false);
      return true;
    });
    assert.equal(calls, 1);
  });
}

test('network failure has uncertain outcome and never retries or exposes transport details', async () => {
  let calls = 0;
  const client = createJevClient({ apiKey: KEY, fetchImpl: async () => {
    calls++;
    throw new Error(`Transport leaked ${KEY}`);
  } });
  await assert.rejects(client.decide(example), (error) => {
    assert.equal(error.code, 'TRANSPORT_ERROR');
    assert.equal(error.outcomeUncertain, true);
    assert.equal(error.cause, undefined);
    assert.equal(error.stack.includes(KEY), false);
    return true;
  });
  assert.equal(calls, 1);
});

test('mismatched destination is rejected', async () => {
  const client = createJevClient({ apiKey: KEY, fetchImpl: async () => {
    const result = response(validResult());
    Object.defineProperty(result, 'url', { value: 'https://api.typesafe.ai/v1/systemone' });
    return result;
  } });
  await assert.rejects(client.decide(example), { code: 'DESTINATION_MISMATCH' });
});

test('invalid decision JSON or an unrequested answer is not reported as success', async () => {
  for (const makeResponse of [
    () => new Response('not-json'),
    () => response({ ...validResult(), answers: {} }),
    () => { const result = validResult(); result.answers.work_type.choice = 'unrequested'; return response(result); },
    () => { const result = validResult(); result.answers.work_type.probabilities.coding = 2; return response(result); },
    () => { const result = validResult(); result.usage.input_tokens = -1; return response(result); },
  ]) {
    let calls = 0;
    const client = createJevClient({ apiKey: KEY, fetchImpl: async () => { calls++; return makeResponse(); } });
    await assert.rejects(client.decide(example), { code: 'INVALID_RESPONSE', outcomeUncertain: true });
    assert.equal(calls, 1);
  }
});

test('request limits and UTF-8 byte size fail before a network request', async () => {
  let calls = 0;
  const client = createJevClient({ apiKey: KEY, fetchImpl: async () => { calls++; return response(validResult()); } });
  const question = { type: 'noul', instructions: 'Relevant?' };
  const invalidInputs = [
    { ...example, provider: { order: ['other'] } },
    { ...example, state: '' },
    { ...example, questions: {} },
    { ...example, questions: Object.fromEntries(Array.from({ length: 65 }, (_, i) => [`q${i}`, question])) },
    { ...example, questions: { ['q'.repeat(65)]: question } },
    { ...example, questions: { q: { type: 'choice', instructions: 'Pick', criteria: { only: null } } } },
    { ...example, questions: { q: { type: 'score', instructions: 'Rate', criteria: ['one'] } } },
    { ...example, state: '가'.repeat(90000) },
  ];
  for (const input of invalidInputs) await assert.rejects(client.decide(input), { code: 'INVALID_REQUEST' });
  assert.equal(calls, 0);
  assert.equal(prepareDecision(example).body.model, 'jev-latest');
});

test('Retry-After handles both seconds and HTTP dates without initiating retries', () => {
  assert.equal(retryAfterMs('2.5'), 2500);
  assert.equal(retryAfterMs('Wed, 07 Oct 2026 00:00:05 GMT', Date.parse('2026-10-07T00:00:00Z')), 5000);
  assert.equal(retryAfterMs('not-a-date'), null);
  assert.equal(retryAfterMs(null), null);
});

test('env file loads only the Jev key; deployment environment wins; diagnostics omit key', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jev-config-test-'));
  try {
    const envFile = join(directory, '.env');
    writeFileSync(envFile, `JEV_AI_API_KEY=${KEY}\nUNRELATED_SECRET=ignored\nJEV_AI_BASE_URL=https://wrong.invalid\n`, { mode: 0o600 });
    const local = loadConfig({ env: {}, envFile });
    assert.equal(local.apiKey, KEY);
    assert.equal(local.keySource, 'env-file');
    assert.equal(local.UNRELATED_SECRET, undefined);
    const diagnostic = describeConfig(local);
    assert.equal(diagnostic.baseURL, 'https://jev-ai.pro/api');
    assert.equal(JSON.stringify(diagnostic).includes(KEY), false);
    const deployment = loadConfig({ env: { JEV_AI_API_KEY: 'deployment-test-key' }, envFile });
    assert.equal(deployment.apiKey, 'deployment-test-key');
    assert.equal(deployment.keySource, 'environment');
    assert.equal(loadConfig({ env: {}, envFile: join(directory, 'absent') }).keySource, 'missing');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('CLI diagnoses missing key and requires explicit spend flag without making requests', () => {
  const directory = mkdtempSync(join(tmpdir(), 'jev-cli-test-'));
  try {
    const cli = fileURLToPath(new URL('../bin/jev.mjs', import.meta.url));
    const env = { JEV_AI_ENV_FILE: join(directory, 'absent'), JEV_AI_API_KEY: '' };
    const run = (...args) => spawnSync(process.execPath, [cli, ...args], { env, encoding: 'utf8' });
    const config = run('config');
    assert.equal(config.status, 0);
    assert.equal(JSON.parse(config.stdout).keyConfigured, false);
    const models = run('models');
    assert.equal(models.status, 1);
    assert.equal(JSON.parse(models.stderr).error, 'MISSING_KEY');
    const demo = run('demo');
    assert.equal(demo.status, 1);
    assert.equal(JSON.parse(demo.stderr).error, 'SPEND_FLAG_REQUIRED');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
