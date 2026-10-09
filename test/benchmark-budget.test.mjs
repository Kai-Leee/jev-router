import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { BUDGET_ERROR_CODES, createTokenBudget, validateBudgetConfig } from '../src/benchmark/budget.mjs';

const policy = path => ({ schema_version: 'jev-token-budget/v1', ledger_path: path, max_usd: 1, usd_per_million_input_tokens: 0.6, reserve_input_tokens: 65536 });
const linkage = index => ({ request_id: `request-${index}`, run_id: 'run-e2e', attempt_id: 'attempt-1', group_id: 'group-paired' });
const balances = () => ({ paidInputTokensRemaining: 60_000_000, tokensReserved: 0, tokenDebt: 0, spending_frozen: false });
const response = (tokens = 100) => ({
  model: 'jev-1.13.0', usage: { input_tokens: tokens, output_tokens: 10 },
  billing: { mode: 'tokens', modelMultiplier: '1', creditsCharged: '0', paidInputTokensUsed: String(tokens), runId: 'provider-run-1' },
  receipt: { method: 'POST', destination: 'https://jev-ai.pro/api/v1/systemone', status: 200, automaticRetries: 0, durationMs: 123 },
});
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'jev-token-budget-'));
  const path = join(directory, 'shared-budget.json');
  const config = policy(path);
  const objects = [];
  const open = () => { const budget = createTokenBudget(config); objects.push(budget); return budget; };
  t.after(() => {
    chmodSync(directory, 0o700);
    for (const budget of objects) { try { budget.close(); } catch {} }
    rmSync(directory, { recursive: true, force: true });
  });
  return { directory, path, config, open, read: () => JSON.parse(readFileSync(path, 'utf8')) };
}

test('budget configuration fixes valuation policy and resolves its path without extra settings', () => {
  assert.equal(validateBudgetConfig(policy('budget.json'), '/private/tmp/jev-test').ledger_path, '/private/tmp/jev-test/budget.json');
  const bad = [null, {}, { ...policy('budget.json'), max_usd: 2 }, { ...policy('budget.json'), usd_per_million_input_tokens: 0.5 },
    { ...policy('budget.json'), reserve_input_tokens: 100 }, { ...policy('budget.json'), unknown: true },
    { ...policy('budget.json'), ledger_path: '' }, { ...policy('budget.json'), max_usd: '1' }];
  for (const value of bad) assert.throws(() => validateBudgetConfig(value), { code: 'INVALID_BUDGET_CONFIG' });
  assert.ok(Array.isArray(BUDGET_ERROR_CODES));
  for (const code of ['BUDGET_MODEL_UNSUPPORTED', 'BUDGET_PREFLIGHT_FAILED', 'BUDGET_SETTLEMENT_FAILED', 'JEV_BUDGET_REQUIRED']) assert.ok(BUDGET_ERROR_CODES.includes(code));
});

test('reserve persists full intent synchronously and settlement charges exact observed tokens', t => {
  const fx = fixture(t); const budget = fx.open();
  const before = budget.snapshot();
  assert.equal(before.token_limit, 1666666); assert.equal(before.actual_billed_usd, null);
  const reservation = budget.reserve({ ...linkage(1), decision_id: 4, agent_role: 'implementation', prompt: 'SECRET_PROMPT', api_key: 'SECRET_KEY' }, balances());
  assert.equal(fx.read().pending.reservation_id, reservation);
  assert.equal(budget.snapshot().reserved_input_tokens, 65536);
  assert.equal(budget.snapshot().estimated_reserved_usd, 0.0393216);
  const contents = readFileSync(fx.path, 'utf8');
  for (const excluded of ['SECRET_PROMPT', 'SECRET_KEY', 'paidInputTokensRemaining', 'spending_frozen']) assert.equal(contents.includes(excluded), false);
  const settled = budget.settle(reservation, response(379));
  assert.equal(settled.charged_input_tokens, 379); assert.equal(settled.reserved_input_tokens, 0);
  assert.equal(settled.estimated_spent_usd, 379 * 3 / 5_000_000); assert.equal(settled.actual_billed_usd, null);
  assert.equal(fx.read().last_settlement.input_tokens, 379);
  assert.equal(fx.read().last_settlement.charged_input_tokens, 379);
});

test('integer pre-dispatch boundary allows exact final reservation and blocks the next', t => {
  const fx = fixture(t); const budget = fx.open();
  for (let index = 0; index < 24; index++) budget.settle(budget.reserve(linkage(index), balances()), response(65536));
  budget.settle(budget.reserve(linkage(24), balances()), response(28266));
  assert.equal(budget.snapshot().charged_input_tokens, 1666666 - 65536);
  const final = budget.reserve(linkage(25), balances());
  assert.equal(budget.snapshot().remaining_usd, 0);
  budget.settle(final, response(65536));
  assert.equal(budget.snapshot().charged_input_tokens, 1666666);
  assert.equal(budget.snapshot().estimated_spent_usd, 0.9999996);
  assert.throws(() => budget.reserve(linkage(26), balances()), { code: 'BUDGET_EXHAUSTED' });
  assert.equal(fx.read().pending, null);
});

test('small settled usage permits more than arbitrary 20 or 60 call ceilings', t => {
  const budget = fixture(t).open();
  for (let index = 0; index < 65; index++) budget.settle(budget.reserve(linkage(index), balances()), response(1));
  assert.equal(budget.snapshot().charged_input_tokens, 65);
  assert.equal(budget.snapshot().blocked_code, null);
});

test('two instances and a competing process cannot own the same budget concurrently', t => {
  const fx = fixture(t); const budget = fx.open();
  assert.throws(() => fx.open(), { code: 'BUDGET_LOCKED' });
  const moduleUrl = new URL('../src/benchmark/budget.mjs', import.meta.url).href;
  const script = `import {createTokenBudget} from ${JSON.stringify(moduleUrl)};try{createTokenBudget(JSON.parse(process.argv[1]));process.exitCode=9;}catch(e){process.stdout.write(e.code);process.exitCode=3;}`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(fx.config)], { encoding: 'utf8' });
  assert.equal(child.status, 3); assert.equal(child.stdout, 'BUDGET_LOCKED');
  assert.equal(budget.snapshot().charged_input_tokens, 0);
});

test('shared spend survives sequential E2E and Personal OS runs without reset', t => {
  const fx = fixture(t); const e2e = fx.open();
  e2e.settle(e2e.reserve(linkage(1), balances()), response(123));
  const id = e2e.snapshot().budget_id; e2e.close();
  const personal = fx.open();
  assert.equal(personal.snapshot().budget_id, id); assert.equal(personal.snapshot().charged_input_tokens, 123);
  personal.settle(personal.reserve({ ...linkage(1), run_id: 'run-personal-os' }, balances()), response(321));
  assert.equal(personal.snapshot().charged_input_tokens, 444);
});

test('unknown POST remains fully reserved across close and restart, with no automatic refund', t => {
  const fx = fixture(t); const first = fx.open();
  const reservation = first.reserve(linkage(1), balances());
  assert.throws(() => first.reserve(linkage(2), balances()), { code: 'BUDGET_OUTSTANDING' });
  first.close();
  const next = fx.open();
  assert.equal(next.snapshot().reserved_input_tokens, 65536);
  assert.equal(next.snapshot().pending_reservation_id, reservation);
  assert.equal(next.snapshot().blocked_code, 'BUDGET_OUTSTANDING');
  assert.throws(() => next.reserve({ ...linkage(2), run_id: 'another-workload' }, balances()), { code: 'BUDGET_OUTSTANDING' });
});

test('missing balances, debt, freeze and insufficient paid balance fail before reservation', t => {
  const fx = fixture(t); const budget = fx.open();
  for (const [value, code] of [
    [null, 'BUDGET_INVALID_BALANCES'], [{ paidInputTokensRemaining: 999999 }, 'BUDGET_INVALID_BALANCES'],
    [{ ...balances(), tokenDebt: 1 }, 'BUDGET_ACCOUNT_BLOCKED'], [{ ...balances(), spending_frozen: true }, 'BUDGET_ACCOUNT_BLOCKED'],
    [{ ...balances(), paidInputTokensRemaining: 65535 }, 'BUDGET_PAID_BALANCE_LOW'],
    [{ ...balances(), paidInputTokensRemaining: 65536, tokensReserved: 1 }, 'BUDGET_PAID_BALANCE_LOW'],
    [{ ...balances(), tokenDebt: '0' }, 'BUDGET_INVALID_BALANCES'], [{ ...balances(), tokensReserved: -1 }, 'BUDGET_INVALID_BALANCES'],
  ]) assert.throws(() => budget.reserve(linkage(1), value), { code });
  assert.equal(fx.read().pending, null);
  assert.equal(fx.read().charged_input_tokens, 0);
  assert.throws(() => budget.reserve({ ...linkage(1), run_id: '../private' }, balances()), { code: 'BUDGET_INVALID_LINKAGE' });
});

// Official documented literals: https://jev-ai.pro/jev-api (Balance row), checked
// 2026-10-09. Only `tokens` meets this fixed policy; neither fallback is accepted.
for (const [label, corrupt, code = 'BUDGET_INVALID_SETTLEMENT'] of [
  ['credits', value => { value.billing.mode = 'credits'; }],
  ['credit fallback', value => { value.billing.mode = 'credits-fallback'; }],
  ['token fallback', value => { value.billing.mode = 'tokens-fallback'; }],
  ['undocumented paid_tokens spelling', value => { value.billing.mode = 'paid_tokens'; }],
  ['missing multiplier', value => { delete value.billing.modelMultiplier; }],
  ['different multiplier', value => { value.billing.modelMultiplier = '2'; }],
  ['credit charge', value => { value.billing.creditsCharged = '1'; }],
  ['missing zero credit field', value => { delete value.billing.creditsCharged; }],
  ['missing charge', value => { delete value.billing.paidInputTokensUsed; }],
  ['wrong charge type', value => { value.billing.paidInputTokensUsed = 100; }],
  ['charge/raw disagreement', value => { value.billing.paidInputTokensUsed = '101'; }],
  ['over-reservation charge', value => { value.billing.paidInputTokensUsed = '65537'; value.usage.input_tokens = 65537; }],
  ['missing usage', value => { delete value.usage.input_tokens; }],
  ['missing receipt', value => { delete value.receipt; }],
  ['wrong destination', value => { value.receipt.destination = 'https://other.invalid/api/v1/systemone'; }],
  ['retry receipt', value => { value.receipt.automaticRetries = 1; }],
  ['missing provider run ID', value => { delete value.billing.runId; }],
  ['uncertain response', value => { value.outcomeUncertain = true; }],
  ['uncertain receipt', value => { value.receipt.outcome_uncertain = true; }],
  ['unresolved model alias', value => { value.model = 'jev-latest'; }, 'BUDGET_MODEL_UNSUPPORTED'],
  ['changed model', value => { value.model = 'jev-1.14.0'; }, 'BUDGET_MODEL_UNSUPPORTED'],
]) {
  test(`invalid settlement (${label}) retains reservation and blocks across restart`, t => {
    const fx = fixture(t); const budget = fx.open();
    const reservation = budget.reserve(linkage(1), balances());
    const result = response(); corrupt(result);
    assert.throws(() => budget.settle(reservation, result), { code });
    assert.equal(budget.snapshot().reserved_input_tokens, 65536); assert.equal(budget.snapshot().charged_input_tokens, 0);
    assert.equal(fx.read().blocked_code, code);
    budget.close(); const resumed = fx.open();
    assert.throws(() => resumed.reserve(linkage(2), balances()), { code });
    assert.throws(() => resumed.settle(reservation, response()), { code });
    assert.equal(resumed.snapshot().reserved_input_tokens, 65536);
  });
}

test('wrong reservation cannot settle another attempt or release its charge', t => {
  const fx = fixture(t); const budget = fx.open();
  budget.reserve(linkage(1), balances());
  assert.throws(() => budget.settle('unrelated-reservation', response()), { code: 'BUDGET_INVALID_RESERVATION' });
  assert.equal(budget.snapshot().reserved_input_tokens, 65536);
  assert.equal(fx.read().blocked_code, 'BUDGET_INVALID_RESERVATION');
});

test('closed budgets reject mutations and snapshots are detached', t => {
  const budget = fixture(t).open(); const state = budget.snapshot(); state.charged_input_tokens = -1;
  assert.equal(budget.snapshot().charged_input_tokens, 0);
  budget.close(); budget.close();
  assert.equal(budget.snapshot().closed, true);
  assert.throws(() => budget.reserve(linkage(1), balances()), { code: 'BUDGET_CLOSED' });
});

test('pre-existing lock never gets removed even when its ledger is missing', t => {
  const fx = fixture(t); writeFileSync(`${fx.path}.lock`, 'stale-or-owned', { mode: 0o600 });
  assert.throws(() => fx.open(), { code: 'BUDGET_LOCKED' });
  assert.equal(readFileSync(`${fx.path}.lock`, 'utf8'), 'stale-or-owned'); assert.equal(existsSync(fx.path), false);
});

test('corrupt and malformed UTF-8 ledgers never reset to a fresh budget', t => {
  const fx = fixture(t); const budget = fx.open(); budget.close();
  for (const content of ['{invalid-json', Buffer.from([0xff, 0xfe])]) {
    writeFileSync(fx.path, content);
    assert.throws(() => fx.open(), { code: 'BUDGET_LEDGER_INVALID' });
    assert.deepEqual(readFileSync(fx.path), Buffer.from(content));
  }
});

test('structurally corrupt integer spend or policy is rejected without replacement', t => {
  const fx = fixture(t); const budget = fx.open(); budget.close(); const initial = fx.read();
  for (const corrupt of [value => { value.charged_input_tokens = -1; }, value => { value.max_usd = 2; },
    value => { value.extra = 'not-allowed'; }, value => { value.settled_requests = 2; }, value => { value.charged_input_tokens = 2000000; }]) {
    const value = structuredClone(initial); corrupt(value); const text = JSON.stringify(value); writeFileSync(fx.path, text);
    assert.throws(() => fx.open(), { code: 'BUDGET_LEDGER_INVALID' }); assert.equal(readFileSync(fx.path, 'utf8'), text);
  }
});

test('ledger symlinks are rejected without touching their target', t => {
  const fx = fixture(t); const target = join(fx.directory, 'unrelated.json'); writeFileSync(target, 'preserve', { mode: 0o600 }); symlinkSync(target, fx.path);
  assert.throws(() => fx.open(), { code: 'BUDGET_LEDGER_INVALID' }); assert.equal(readFileSync(target, 'utf8'), 'preserve');
});

test('external ledger removal cannot reset spend inside a held budget', t => {
  const fx = fixture(t); const budget = fx.open(); unlinkSync(fx.path);
  assert.throws(() => budget.reserve(linkage(1), balances()), { code: 'BUDGET_LEDGER_CHANGED' });
  budget.close(); assert.equal(existsSync(`${fx.path}.lock`), true);
  assert.throws(() => fx.open(), { code: 'BUDGET_LOCKED' });
});

test('replacement lock is never deleted by the former owner', t => {
  const fx = fixture(t); const budget = fx.open(); unlinkSync(`${fx.path}.lock`); writeFileSync(`${fx.path}.lock`, 'other-owner', { mode: 0o600 });
  assert.throws(() => budget.close(), { code: 'BUDGET_LOCK_LOST' });
  assert.equal(readFileSync(`${fx.path}.lock`, 'utf8'), 'other-owner');
});

test('close cannot erase lock evidence after external ledger deletion', t => {
  const fx = fixture(t); const budget = fx.open();
  budget.settle(budget.reserve(linkage(1), balances()), response(500));
  unlinkSync(fx.path);
  assert.throws(() => budget.close(), { code: 'BUDGET_LEDGER_CHANGED' });
  assert.equal(existsSync(`${fx.path}.lock`), true);
  assert.throws(() => fx.open(), { code: 'BUDGET_LOCKED' });
});

test('failed reservation disk write prevents dispatch and preserves a conservative lock', t => {
  if (process.getuid?.() === 0) { t.skip('Root bypasses directory write permissions.'); return; }
  const fx = fixture(t); const budget = fx.open(); chmodSync(fx.directory, 0o500);
  assert.throws(() => budget.reserve(linkage(1), balances()), { code: 'BUDGET_IO_FAILED' });
  assert.equal(budget.snapshot().reserved_input_tokens, 65536);
  assert.equal(budget.snapshot().blocked_code, 'BUDGET_IO_FAILED'); budget.close(); chmodSync(fx.directory, 0o700);
  assert.equal(existsSync(`${fx.path}.lock`), true); assert.throws(() => fx.open(), { code: 'BUDGET_LOCKED' });
});

test('failed settlement disk write retains the entire unresolved reservation', t => {
  if (process.getuid?.() === 0) { t.skip('Root bypasses directory write permissions.'); return; }
  const fx = fixture(t); const budget = fx.open(); const reservation = budget.reserve(linkage(1), balances()); chmodSync(fx.directory, 0o500);
  assert.throws(() => budget.settle(reservation, response(100)), { code: 'BUDGET_IO_FAILED' });
  assert.equal(budget.snapshot().reserved_input_tokens, 65536); assert.equal(budget.snapshot().charged_input_tokens, 0);
  chmodSync(fx.directory, 0o700); assert.equal(fx.read().pending.reservation_id, reservation); budget.close();
  assert.equal(existsSync(`${fx.path}.lock`), true);
});

test('only the documented exact dated model is added to ordinary settlement', t => {
  const budget = fixture(t).open();
  const reservation = budget.reserve(linkage(1), balances());
  const observed = response(348); observed.model = 'typesafe/jev-1.13-20260917'; observed.usage.output_tokens = 41;
  budget.settle(reservation, observed);
  assert.equal(budget.snapshot().charged_input_tokens, 348);
  assert.equal(budget.snapshot().reserved_input_tokens, 0);
  assert.equal(budget.snapshot().estimated_spent_usd, 0.0002088);
});

test('future dates, undated names and prefix matches still fail closed', t => {
  for (const model of ['typesafe/jev-1.13-20261001', 'typesafe/jev-1.13', 'typesafe/jev-1.13-20260917-extra', 'jev-latest']) {
    const budget = fixture(t).open(); const reservation = budget.reserve(linkage(1), balances());
    assert.throws(() => budget.settle(reservation, { ...response(), model }), { code: 'BUDGET_MODEL_UNSUPPORTED' });
    assert.equal(budget.snapshot().reserved_input_tokens, 65536);
  }
});

function preservedModelMismatch(fx, priorTokens = 1000) {
  const budget = fx.open();
  budget.settle(budget.reserve(linkage(1), balances()), response(priorTokens));
  const reservation = budget.reserve(linkage(2), balances());
  // Create the same durable blocked state produced before the exact dated model
  // was documented; actual live ledgers and receipts are never opened by tests.
  assert.throws(() => budget.settle(reservation, { ...response(348), model: 'unrecognized-build' }), { code: 'BUDGET_MODEL_UNSUPPORTED' });
  budget.close();
  return { budget: fx.open(), reservation };
}

test('explicit offline reconciliation preserves prior spend across restart and settles once', t => {
  const fx = fixture(t); const { budget, reservation } = preservedModelMismatch(fx);
  const budgetId = budget.snapshot().budget_id;
  const observed = { ...response(348), model: 'typesafe/jev-1.13-20260917' };
  const reconciled = budget.reconcile(reservation, observed);
  assert.equal(reconciled.budget_id, budgetId);
  assert.equal(reconciled.charged_input_tokens, 1348);
  assert.equal(reconciled.reserved_input_tokens, 0);
  assert.equal(reconciled.blocked_code, null);
  assert.equal(fx.read().settled_requests, 2);
  const persisted = readFileSync(fx.path, 'utf8');
  assert.throws(() => budget.reconcile(reservation, observed), { code: 'BUDGET_RECONCILIATION_NOT_ALLOWED' });
  assert.equal(readFileSync(fx.path, 'utf8'), persisted);
  assert.equal(budget.snapshot().charged_input_tokens, 1348);
  budget.close(); const reopened = fx.open();
  assert.equal(reopened.snapshot().charged_input_tokens, 1348);
  assert.equal(reopened.snapshot().blocked_code, null);
});

test('invalid reconciliation evidence leaves the original block, reservation and prior spend intact', t => {
  const fx = fixture(t); const { budget, reservation } = preservedModelMismatch(fx);
  const persisted = readFileSync(fx.path, 'utf8');
  for (const corrupt of [
    value => { value.model = 'typesafe/jev-1.13-20990101'; },
    value => { value.billing.mode = 'credits-fallback'; },
    value => { value.billing.paidInputTokensUsed = '349'; },
    value => { delete value.receipt; },
    value => { value.receipt.outcome_uncertain = true; },
  ]) {
    const observed = { ...response(348), model: 'typesafe/jev-1.13-20260917' }; corrupt(observed);
    assert.throws(() => budget.reconcile(reservation, observed));
    assert.equal(readFileSync(fx.path, 'utf8'), persisted);
    assert.equal(budget.snapshot().blocked_code, 'BUDGET_MODEL_UNSUPPORTED');
    assert.equal(budget.snapshot().charged_input_tokens, 1000);
    assert.equal(budget.snapshot().reserved_input_tokens, 65536);
  }
  assert.throws(() => budget.reconcile('wrong-reservation', response(348)), { code: 'BUDGET_INVALID_RESERVATION' });
  assert.equal(readFileSync(fx.path, 'utf8'), persisted);
});

test('reconciliation cannot clear an ordinary unresolved or differently blocked reservation', t => {
  const fx = fixture(t); const budget = fx.open();
  assert.throws(() => budget.reconcile('absent', response()), { code: 'BUDGET_RECONCILIATION_NOT_ALLOWED' });
  const reservation = budget.reserve(linkage(1), balances());
  assert.throws(() => budget.reconcile(reservation, response()), { code: 'BUDGET_RECONCILIATION_NOT_ALLOWED' });
  assert.throws(() => budget.settle(reservation, { ...response(), billing: { ...response().billing, creditsCharged: '1' } }), { code: 'BUDGET_INVALID_SETTLEMENT' });
  const persisted = readFileSync(fx.path, 'utf8');
  assert.throws(() => budget.reconcile(reservation, response()), { code: 'BUDGET_RECONCILIATION_NOT_ALLOWED' });
  assert.equal(readFileSync(fx.path, 'utf8'), persisted);
  assert.equal(budget.snapshot().reserved_input_tokens, 65536);
});

test('reconciliation disk failure retains prior charge and the full pending reservation', t => {
  if (process.getuid?.() === 0) { t.skip('Root bypasses directory write permissions.'); return; }
  const fx = fixture(t); const { budget, reservation } = preservedModelMismatch(fx);
  chmodSync(fx.directory, 0o500);
  assert.throws(() => budget.reconcile(reservation, { ...response(348), model: 'typesafe/jev-1.13-20260917' }), { code: 'BUDGET_IO_FAILED' });
  assert.equal(budget.snapshot().charged_input_tokens, 1000);
  assert.equal(budget.snapshot().reserved_input_tokens, 65536);
  chmodSync(fx.directory, 0o700);
  assert.equal(fx.read().blocked_code, 'BUDGET_MODEL_UNSUPPORTED');
  assert.equal(fx.read().pending.reservation_id, reservation);
});
test('documented Vercel Jev provider alias settles without pretending to be a dated revision', t => {
  const budget = fixture(t).open();
  const reservation = budget.reserve(linkage(1), balances());
  const observed = response(1735); observed.model = 'typesafe-ai/jev';
  assert.equal(budget.settle(reservation, observed).charged_input_tokens, 1735);
});
