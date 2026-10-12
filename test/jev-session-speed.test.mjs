import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createTokenBudget, migrateTokenBudget, readTokenBudgetSnapshot} from '../src/benchmark/budget.mjs';
import {createConcurrentTokenBudget} from '../src/benchmark/budget-acquire.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {createAdaptiveProviderSession, loadAdaptiveRunManifest} from '../src/benchmark/adaptive-dag-runner.mjs';

const v3For = ledger_path => ({schema_version: 'jev-token-budget/v3', ledger_path, max_input_tokens: null, reserve_input_tokens: 65536});
const v4For = ledger_path => ({schema_version: 'jev-token-budget/v4', ledger_path, max_input_tokens: null, reserve_input_tokens: 65536});
const ids = request_id => ({request_id, run_id: 'run', attempt_id: 'attempt', group_id: 'group'});
const balances = {paidInputTokensRemaining: 60000000, tokensReserved: 0, tokenDebt: 0, spending_frozen: false};
const lease = {leaseMs: 60000};
const billed = (tokens, model = 'jev-1.13.0') => ({model, usage: {input_tokens: tokens, output_tokens: 1},
  billing: {mode: 'tokens', modelMultiplier: '1', creditsCharged: '0', paidInputTokensUsed: String(tokens), runId: `provider-${tokens}`},
  receipt: {method: 'POST', destination: 'https://jev-ai.pro/api/v1/systemone', status: 200, automaticRetries: 0, durationMs: 1}});
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jev-speed-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, 'ledger.json');
  return {dir, path, v3: v3For(path), v4: v4For(path), read: () => JSON.parse(readFileSync(path, 'utf8'))};
}

test('v4 ledger keeps several in-flight reservations and counts every one against paid capacity', t => {
  const f = fixture(t), budget = createTokenBudget(f.v4);
  const first = budget.reserve(ids('a'), balances, lease), second = budget.reserve(ids('b'), balances, lease);
  assert.notEqual(first, second);
  const live = budget.snapshot();
  assert.equal(live.schema_version, 'jev-token-budget-snapshot/v4'); assert.equal(live.reservations_pending, 2);
  assert.equal(live.reservations_in_flight, 2); assert.equal(live.reserved_input_tokens, 131072); assert.equal(live.blocked_code, null);
  assert.throws(() => budget.reserve(ids('c'), {...balances, paidInputTokensRemaining: 65536 * 3 - 1}, lease), {code: 'BUDGET_PAID_BALANCE_LOW'});
  assert.throws(() => budget.reserve(ids('c'), {...balances, tokensReserved: 60000000 - 65536 * 2}, lease), {code: 'BUDGET_PAID_BALANCE_LOW'});
  assert.throws(() => budget.reserve(ids('c'), balances), {code: 'INVALID_BUDGET_CONFIG'});
  const third = budget.reserve(ids('c'), {...balances, paidInputTokensRemaining: 65536 * 3}, lease);
  budget.settle(second, billed(200)); budget.settle(first, billed(100));
  const fourth = budget.reserve(ids('d'), balances, lease);
  assert.equal(new Set([first, second, third, fourth]).size, 4);
  budget.settle(fourth, billed(400)); budget.settle(third, billed(300)); budget.close();
  const final = readTokenBudgetSnapshot(f.v4);
  assert.equal(final.charged_input_tokens, 1000); assert.equal(final.settled_requests, 4);
  assert.equal(final.reservations_pending, 0); assert.equal(f.read().last_settlement.reservation_id, third);
});

test('an unsettled v4 reservation blocks every new reservation until explicit per-ID refund reconciliation', t => {
  const f = fixture(t), budget = createTokenBudget(f.v4);
  const failed = budget.reserve(ids('failed'), balances, lease), live = budget.reserve(ids('live'), balances, lease);
  budget.markUnresolved(failed);
  assert.throws(() => budget.reserve(ids('next'), balances, lease), {code: 'BUDGET_OUTSTANDING'});
  budget.settle(live, billed(10));
  assert.throws(() => budget.reserve(ids('next'), balances, lease), {code: 'BUDGET_OUTSTANDING'});
  assert.throws(() => budget.settle(failed, billed(10)), {code: 'BUDGET_OUTSTANDING'});
  budget.close();
  const reopened = createTokenBudget(f.v4);
  assert.equal(reopened.snapshot().blocked_code, 'BUDGET_OUTSTANDING');
  assert.throws(() => reopened.reserve(ids('next'), balances, lease), {code: 'BUDGET_OUTSTANDING'});
  const evidence = {source: 'https://jev-ai.pro/jev-api', method: 'operator reviewed usage row', observed_date: '2026-10-12',
    reservation_id: failed, ledger_linkage: ids('failed'), linked_run: 'run', linked_invocation: 'call-1', matching_basis: 'fixture',
    status: 'failed', billing: 'Refunded · no charge', charged_input_tokens: 0, actual_billed_usd: 0, inference_input_tokens: null,
    paid_input_tokens_remaining: 60000000};
  const account = {checked_at: '2026-10-12T00:00:00.000Z', credits: {...balances,
    receipt: {method: 'GET', destination: 'https://jev-ai.pro/api/v1/credits', status: 200, automaticRetries: 0}}};
  const input = {evidence_path: join(f.dir, 'evidence.json'), account_path: join(f.dir, 'account.json')};
  writeFileSync(input.evidence_path, JSON.stringify(evidence)); writeFileSync(input.account_path, JSON.stringify(account));
  Object.assign(input, {evidence_sha256: hash(readFileSync(input.evidence_path)), account_sha256: hash(readFileSync(input.account_path)),
    ledger_sha256: hash(readFileSync(f.path))});
  assert.throws(() => reopened.reconcileConfirmedRefund(live, input), {code: 'BUDGET_INVALID_RESERVATION'});
  const after = reopened.reconcileConfirmedRefund(failed, input);
  assert.equal(after.charged_input_tokens, 10); assert.equal(after.settled_requests, 2); assert.equal(after.reservations_pending, 0);
  assert.equal(f.read().last_settlement.kind, 'confirmed_refund');
  const next = reopened.reserve(ids('next'), balances, lease); reopened.settle(next, billed(1)); reopened.close();
  assert.equal(readTokenBudgetSnapshot(f.v4).charged_input_tokens, 11);
});

test('a crashed owner blocks at its lease; settlement failures block per entry and reconcile per ID', t => {
  const f = fixture(t); let clock = 1000;
  const budget = createTokenBudget(f.v4, {now: () => clock});
  const crashed = budget.reserve(ids('crashed'), balances, {leaseMs: 100});
  clock = 1050; const other = budget.reserve(ids('other'), balances, {leaseMs: 1000});
  clock = 1100;
  assert.throws(() => budget.reserve(ids('next'), balances, lease), {code: 'BUDGET_OUTSTANDING'});
  assert.equal(readTokenBudgetSnapshot(f.v4, {now: () => clock}).blocked_code, 'BUDGET_OUTSTANDING');
  assert.equal(readTokenBudgetSnapshot(f.v4, {now: () => 1099}).blocked_code, null);
  assert.throws(() => budget.settle(other, billed(5, 'unlisted-model')), {code: 'BUDGET_MODEL_UNSUPPORTED'});
  assert.equal(f.read().pending.find(entry => entry.reservation_id === other).blocked_code, 'BUDGET_MODEL_UNSUPPORTED');
  assert.throws(() => budget.reconcile(crashed, billed(5)), {code: 'BUDGET_RECONCILIATION_NOT_ALLOWED'});
  assert.equal(budget.reconcile(other, billed(5)).charged_input_tokens, 5);
  budget.settle(crashed, billed(7));
  const next = budget.reserve(ids('next'), balances, lease); budget.settle(next, billed(1)); budget.close();
  assert.deepEqual([readTokenBudgetSnapshot(f.v4).charged_input_tokens, readTokenBudgetSnapshot(f.v4).settled_requests], [13, 3]);
});

test('v3 to v4 migration preserves history; v3 keeps its single-slot rule and cannot be reopened after migration', t => {
  const f = fixture(t), old = createTokenBudget(f.v3);
  const first = old.reserve(ids('x'), balances);
  assert.throws(() => old.reserve(ids('y'), balances), {code: 'BUDGET_OUTSTANDING'});
  old.settle(first, billed(321)); old.close();
  createTokenBudget(f.v3).reserve(ids('pending'), balances);
  assert.throws(() => migrateTokenBudget(f.v3, f.v4), {code: 'BUDGET_LOCKED'});
  rmSync(`${f.path}.lock`);
  assert.throws(() => migrateTokenBudget(f.v3, f.v4), {code: 'BUDGET_OUTSTANDING'});
  const resumed = createTokenBudget(f.v3); resumed.settle(f.read().pending.reservation_id, billed(9)); resumed.close();
  const before = f.read(), migrated = migrateTokenBudget(f.v3, f.v4), after = f.read();
  for (const key of ['budget_id', 'charged_input_tokens', 'settled_requests', 'last_settlement']) assert.deepEqual(after[key], before[key], key);
  assert.equal(after.schema_version, 'jev-token-budget-ledger/v4'); assert.deepEqual(after.pending, []);
  assert.equal(migrated.schema_version, 'jev-token-budget-snapshot/v4'); assert.equal(migrated.unlimited, true);
  assert.throws(() => createTokenBudget(f.v3), {code: 'BUDGET_LEDGER_INVALID'});
  assert.throws(() => migrateTokenBudget(f.v4, f.v3), {code: 'BUDGET_MIGRATION_NOT_ALLOWED'});
  const budget = createTokenBudget(f.v4, {requireExisting: true});
  assert.equal(budget.reserve(ids('z'), balances, lease), `${before.budget_id}:r3`); budget.close();
});

test('narrow lock is free during provider I/O and separate handles hold concurrent reservations', async t => {
  const f = fixture(t); createTokenBudget(f.v4).close();
  assert.throws(() => createConcurrentTokenBudget(f.v3, lease), {code: 'INVALID_BUDGET_CONFIG'});
  assert.throws(() => createConcurrentTokenBudget(f.v4), {code: 'INVALID_BUDGET_CONFIG'});
  const left = createConcurrentTokenBudget(f.v4, lease), right = createConcurrentTokenBudget(f.v4, lease);
  const a = await left.reserve(ids('a'), balances);
  assert.equal(existsSync(`${f.path}.lock`), false);
  const b = await right.reserve(ids('b'), balances);
  assert.equal(readTokenBudgetSnapshot(f.v4).reservations_pending, 2);
  await right.settle(b, billed(2)); await left.settle(a, billed(1));
  assert.equal(left.snapshot().charged_input_tokens, 3); assert.equal(existsSync(`${f.path}.lock`), false);
  await assert.rejects(left.settle(a, billed(1)), {code: 'BUDGET_INVALID_RESERVATION'});
});

const request = () => ({model: 'jev-latest', state: 'Choose.', questions: {next: {type: 'choice', instructions: 'Choose.', criteria: {a: 'A', b: 'B'}}}});
test('session model cache issues one model GET, re-checks after a failed call or unaccepted model, and always fetches credits', async () => {
  const cache = {models_checked: false}, events = [], marked = [], counts = {models: 0, credits: 0, posts: 0};
  let next = () => billed(10);
  const client = {listModels: async () => { counts.models++; return {models: [{name: 'jev-latest'}]}; },
    listCredits: async () => { counts.credits++; return balances; }, decide: async () => { counts.posts++; return next(); }};
  const budget = {reserve: () => 'r', settle: () => ({}), snapshot: () => ({}), markUnresolved: async id => { marked.push(id); }};
  const run = () => createMeasuredDecider({client, budget, record: async event => events.push(event), modelLookupCache: cache})(request());
  await run(); await run();
  assert.deepEqual(counts, {models: 1, credits: 2, posts: 2});
  assert.deepEqual(events.filter(e => e.event === 'inference_started').map(e => e.model_lookup_source), ['get', 'session_cache']);
  assert.deepEqual(events.filter(e => e.event === 'budget_reserved').map(e => e.balance_source), ['credits_get', 'credits_get']);
  next = () => { throw Object.assign(new Error('TRANSPORT_ERROR'), {code: 'TRANSPORT_ERROR', outcomeUncertain: true}); };
  await assert.rejects(run(), {code: 'TRANSPORT_ERROR'});
  assert.deepEqual(marked, ['r']); assert.equal(events.at(-1).reservation_marked_unresolved, true);
  next = () => billed(10, 'jev-unlisted');
  await run(); assert.equal(counts.models, 2);
  next = () => billed(10);
  await run(); assert.equal(counts.models, 3);
  await run(); assert.equal(counts.models, 3); assert.equal(counts.credits, 6);
});

test('default telemetry keeps the per-decider lookup and adds no source or unresolved fields', async () => {
  const events = []; let models = 0;
  const client = {listModels: async () => { models++; return {models: [{name: 'jev-latest'}]}; }, listCredits: async () => balances,
    decide: async () => { throw Object.assign(new Error('x'), {code: 'TRANSPORT_ERROR', outcomeUncertain: true}); }};
  const run = () => createMeasuredDecider({client, budget: {reserve: () => 'r', snapshot: () => ({})}, record: async event => events.push(event)})(request());
  await assert.rejects(run()); await assert.rejects(run()); assert.equal(models, 2);
  for (const key of ['model_lookup_source', 'balance_source', 'reservation_marked_unresolved']) assert.equal(events.some(e => key in e), false, key);
});

const root = resolve(import.meta.dirname, '..'), manifest = loadAdaptiveRunManifest();
const answer = {next: {type: 'choice', choice: 'a', probabilities: {a: 1, b: 0}}};
function sessionFor(t, f, name, client, options = {}, extra = {}) {
  const directory = join(f.dir, name); mkdirSync(join(directory, 'calls'), {recursive: true}); mkdirSync(join(directory, 'receipts'));
  return createAdaptiveProviderSession({rootDir: root, manifest: {...manifest, jev_budget: options.budgetLock === 'ledger_op' ? f.v4 : f.v3},
    run_id: name, runDirectory: directory, remaining: () => 30000, ...options,
    adapters: {jevConfig: {}, jevClientFactory: () => client, ...extra}});
}

test('two sessions with opt-in options post concurrently without the ledger lock, one model GET per session', async t => {
  const f = fixture(t); createTokenBudget(f.v4).close();
  const counts = {models: 0, credits: 0, posts: 0}, lockDuringPost = []; let release;
  const together = new Promise(resolve => { release = resolve; });
  const client = {listModels: async () => { counts.models++; return {models: [{name: 'jev-latest'}]}; },
    listCredits: async () => { counts.credits++; return balances; },
    decide: async () => {
      lockDuringPost.push(existsSync(`${f.path}.lock`)); if (++counts.posts === 2) release();
      await Promise.race([together, new Promise((_, reject) => setTimeout(() => reject(new Error('NOT_CONCURRENT')), 5000).unref())]);
      return {...billed(10), answers: answer};
    }};
  const options = {modelLookup: 'per_session', budgetLock: 'ledger_op'};
  const left = sessionFor(t, f, 'left', client, options), right = sessionFor(t, f, 'right', client, options);
  await Promise.all([left.decide('jev', request(), {stage: 'split'}), right.decide('jev', request(), {stage: 'split'})]);
  assert.equal(readTokenBudgetSnapshot(f.v4).settled_requests, 2);
  await left.decide('jev', request(), {stage: 'relations'}); await right.decide('jev', request(), {stage: 'relations'});
  assert.deepEqual(counts, {models: 2, credits: 4, posts: 4}); assert.deepEqual(lockDuringPost, [false, false, false, false]);
  const receipts = left.receipts();
  assert.deepEqual(receipts.map(row => row.model_lookup_source), ['get', 'session_cache']);
  assert.deepEqual(receipts.map(row => [row.balance_source, row.budget_lock_mode]), [['credits_get', 'ledger_op'], ['credits_get', 'ledger_op']]);
  const final = readTokenBudgetSnapshot(f.v4);
  assert.deepEqual([final.charged_input_tokens, final.settled_requests, final.reservations_pending], [40, 4, 0]);
  assert.throws(() => sessionFor(t, f, 'invalid', client, {budgetLock: 'ledger_op', modelLookup: 'sometimes'}), {code: 'ADAPTIVE_SESSION_OPTION_INVALID'});
  assert.throws(() => createAdaptiveProviderSession({rootDir: root, manifest: {...manifest, jev_budget: f.v3}, run_id: 'v3',
    runDirectory: f.dir, remaining: () => 1, budgetLock: 'ledger_op', adapters: {jevConfig: {}}}), {code: 'ADAPTIVE_SESSION_OPTION_INVALID'});
});

test('an uncertain narrow-lock POST blocks another session before its POST until reconciliation', async t => {
  const f = fixture(t); createTokenBudget(f.v4).close(); let posts = 0;
  const failing = {listModels: async () => ({models: [{name: 'jev-latest'}]}), listCredits: async () => balances,
    decide: async () => { posts++; throw Object.assign(new Error('TRANSPORT_ERROR'), {code: 'TRANSPORT_ERROR', outcomeUncertain: true}); }};
  const healthy = {...failing, decide: async () => { posts++; return {...billed(10), answers: answer}; }};
  const options = {modelLookup: 'per_session', budgetLock: 'ledger_op'};
  await assert.rejects(sessionFor(t, f, 'failing', failing, options).decide('jev', request(), {stage: 'split'}), {outcome_uncertain: true});
  const ledger = f.read();
  assert.equal(ledger.pending.length, 1); assert.equal(ledger.pending[0].blocked_code, 'BUDGET_OUTSTANDING');
  await assert.rejects(sessionFor(t, f, 'healthy', healthy, options).decide('jev', request(), {stage: 'split'}), {code: 'BUDGET_OUTSTANDING'});
  assert.equal(posts, 1); assert.equal(f.read().settled_requests, 0); assert.equal(existsSync(`${f.path}.lock`), false);
});

test('default session options reproduce the historical per-call lock, model GET and credits GET sequence', async t => {
  const f = fixture(t), order = [];
  const client = {listModels: async () => { order.push('models'); return {models: [{name: 'jev-latest'}]}; },
    listCredits: async () => { order.push('credits'); return {}; },
    decide: async () => { order.push('post'); return {...billed(10), answers: answer}; }};
  const session = sessionFor(t, f, 'default', client, {}, {openBudget: () => { order.push('lock');
    return {reserve: () => { order.push('reserve'); return 'fixture'; }, settle: () => { order.push('settle'); }, snapshot: () => ({}),
      close: () => { order.push('unlock'); }}; }});
  await session.decide('jev', request(), {stage: 'split'}); await session.decide('jev', request(), {stage: 'relations'});
  const call = ['lock', 'models', 'credits', 'reserve', 'post', 'settle', 'unlock'];
  assert.deepEqual(order, [...call, ...call]);
  for (const key of ['model_lookup_source', 'balance_source', 'budget_lock_mode']) assert.equal(session.receipts().some(row => key in row), false, key);
});
