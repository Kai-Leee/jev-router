import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTokenBudget, migrateTokenBudget, readTokenBudgetSnapshot, validateBudgetConfig } from '../src/benchmark/budget.mjs';
import { acquireTokenBudget } from '../src/benchmark/budget-acquire.mjs';

const sourceFor = ledger_path => ({ schema_version: 'jev-token-budget/v2', ledger_path, max_input_tokens: 10000000, reserve_input_tokens: 65536 });
const targetFor = ledger_path => ({ schema_version: 'jev-token-budget/v3', ledger_path, max_input_tokens: null, reserve_input_tokens: 65536 });
const ids = { request_id: 'request', run_id: 'run', attempt_id: 'attempt', group_id: 'group' };
const balances = { paidInputTokensRemaining: 60000000, tokensReserved: 0, tokenDebt: 0, spending_frozen: false };
const response = tokens => ({ model: 'jev-1.13.0', usage: { input_tokens: tokens, output_tokens: 1 },
  billing: { mode: 'tokens', modelMultiplier: '1', creditsCharged: '0', paidInputTokensUsed: String(tokens), runId: 'provider-1' },
  receipt: { method: 'POST', destination: 'https://jev-ai.pro/api/v1/systemone', status: 200, automaticRetries: 0, durationMs: 1 } });
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jev-budget-v3-'));
  const path = join(dir, 'ledger.json');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, path, source: sourceFor(path), target: targetFor(path),
    read: () => JSON.parse(readFileSync(path, 'utf8')),
    write: ledger => writeFileSync(path, JSON.stringify(ledger) + '\n', { mode: 0o600 }) };
}

test('v3 requires explicit null, preserving fixed reservation and rejecting fake unlimited numbers', () => {
  const config = targetFor('/tmp/example-budget-v3');
  assert.equal(validateBudgetConfig(config).max_input_tokens, null);
  for (const value of [{ ...config, max_input_tokens: undefined }, { ...config, max_input_tokens: 0 },
    { ...config, max_input_tokens: Infinity }, { ...config, max_input_tokens: 10000000 },
    { ...config, reserve_input_tokens: 1 }, { ...config, max_usd: 1 }]) {
    assert.throws(() => validateBudgetConfig(value), { code: 'INVALID_BUDGET_CONFIG' });
  }
});

test('v2 to v3 migration preserves history and continues past the old 10M boundary', t => {
  const f = fixture(t); createTokenBudget(f.source).close();
  const initial = f.read();
  // Synthetic settled history: 152 full reservations plus the remaining 38,528.
  f.write({ ...initial, charged_input_tokens: 10000000, settled_requests: 153,
    last_settlement: { reservation_id: `${initial.budget_id}:r153`, charged_input_tokens: 38528,
      input_tokens: 38528, billing_run_id: 'provider-153' } });
  const capped = createTokenBudget(f.source);
  assert.throws(() => capped.reserve(ids, balances), { code: 'BUDGET_EXHAUSTED' }); capped.close();
  const before = f.read();
  const migrated = migrateTokenBudget(f.source, f.target); const after = f.read();
  for (const key of ['budget_id', 'charged_input_tokens', 'settled_requests', 'last_settlement', 'pending', 'blocked_code']) {
    assert.deepEqual(after[key], before[key], key);
  }
  assert.equal(after.schema_version, 'jev-token-budget-ledger/v3');
  assert.equal(after.max_input_tokens, null);
  for (const key of ['token_limit', 'remaining_input_tokens', 'remaining_usd', 'limit_usd']) assert.equal(migrated[key], null, key);
  assert.equal(migrated.unlimited, true);
  assert.equal(migrated.schema_version, 'jev-token-budget-snapshot/v3');
  assert.throws(() => createTokenBudget(f.source), { code: 'BUDGET_LEDGER_INVALID' });
  const budget = createTokenBudget(f.target, { requireExisting: true });
  const reservation = budget.reserve(ids, balances);
  assert.equal(reservation, `${before.budget_id}:r154`);
  assert.equal(budget.snapshot().reserved_input_tokens, 65536);
  assert.equal(readTokenBudgetSnapshot(f.target).remaining_input_tokens, null);
  budget.settle(reservation, response(321)); budget.close();
  const final = readTokenBudgetSnapshot(f.target);
  assert.equal(final.charged_input_tokens, 10000321);
  assert.equal(final.settled_requests, 154);
  assert.equal(final.estimated_spent_usd, 6.0001926);
  assert.equal(final.remaining_usd, null);
});

test('v3 migration cannot clear held locks, unresolved calls or blocked history', t => {
  const f = fixture(t); const budget = createTokenBudget(f.source);
  const beforeLock = readFileSync(f.path, 'utf8');
  assert.throws(() => migrateTokenBudget(f.source, f.target), { code: 'BUDGET_LOCKED' });
  assert.equal(readFileSync(f.path, 'utf8'), beforeLock);
  const reservation = budget.reserve(ids, balances); budget.close();
  const pending = readFileSync(f.path, 'utf8');
  assert.throws(() => migrateTokenBudget(f.source, f.target), { code: 'BUDGET_OUTSTANDING' });
  assert.equal(readFileSync(f.path, 'utf8'), pending);
  const resumed = createTokenBudget(f.source);
  assert.throws(() => resumed.settle(reservation, { ...response(1), model: 'unknown' }), { code: 'BUDGET_MODEL_UNSUPPORTED' });
  resumed.close();
  const blocked = readFileSync(f.path, 'utf8');
  assert.throws(() => migrateTokenBudget(f.source, f.target), { code: 'BUDGET_MODEL_UNSUPPORTED' });
  assert.equal(readFileSync(f.path, 'utf8'), blocked);
});

test('explicit unlimited migration CLI preserves confirmed-refund history and rejects replay or path changes', t => {
  const f = fixture(t); createTokenBudget(f.source).close();
  const ledger = f.read();
  f.write({ ...ledger, settled_requests: 1, last_settlement: {
    reservation_id: `${ledger.budget_id}:r1`, charged_input_tokens: 0, input_tokens: null,
    billing_run_id: null, kind: 'confirmed_refund', actual_billed_usd: 0,
    evidence_sha256: 'a'.repeat(64), account_sha256: 'b'.repeat(64), prior_ledger_sha256: 'c'.repeat(64),
  } });
  const before = f.read();
  const sourcePath = join(f.dir, 'source.json'); const targetPath = join(f.dir, 'target.json');
  writeFileSync(sourcePath, JSON.stringify({ jev_budget: { ...f.source, ledger_path: './ledger.json' } }));
  writeFileSync(targetPath, JSON.stringify({ ...f.target, ledger_path: './ledger.json' }));
  const cli = new URL('../scripts/migrate-unlimited-token-budget.mjs', import.meta.url);
  const invoke = () => spawnSync(process.execPath, [cli.pathname, sourcePath, targetPath], { encoding: 'utf8' });
  const result = invoke();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).provider_calls, 0);
  assert.deepEqual(f.read().last_settlement, before.last_settlement);
  assert.equal(f.read().budget_id, before.budget_id);
  const migratedText = readFileSync(f.path, 'utf8');
  const replay = invoke();
  assert.equal(replay.status, 1);
  assert.equal(JSON.parse(replay.stderr).code, 'BUDGET_LEDGER_INVALID');
  assert.equal(readFileSync(f.path, 'utf8'), migratedText);
  assert.throws(() => migrateTokenBudget(f.target, f.source), { code: 'BUDGET_MIGRATION_NOT_ALLOWED' });
  assert.throws(() => migrateTokenBudget(f.source, targetFor(join(f.dir, 'other.json'))), { code: 'BUDGET_MIGRATION_NOT_ALLOWED' });
  assert.throws(() => migrateTokenBudget(sourceFor(join(f.dir, 'missing.json')), targetFor(join(f.dir, 'missing.json'))), { code: 'BUDGET_IO_FAILED' });
  assert.equal(existsSync(join(f.dir, 'missing.json')), false);
});

test('unlimited accounting still enforces paid account state and uncertain settlements', t => {
  const f = fixture(t); const budget = createTokenBudget(f.target);
  for (const [account, code] of [
    [{ ...balances, paidInputTokensRemaining: 65535 }, 'BUDGET_PAID_BALANCE_LOW'],
    [{ ...balances, tokensReserved: balances.paidInputTokensRemaining }, 'BUDGET_PAID_BALANCE_LOW'],
    [{ ...balances, tokenDebt: 1 }, 'BUDGET_ACCOUNT_BLOCKED'],
    [{ ...balances, spending_frozen: true }, 'BUDGET_ACCOUNT_BLOCKED'],
  ]) assert.throws(() => budget.reserve(ids, account), { code });
  const reservation = budget.reserve(ids, balances);
  assert.throws(() => budget.settle(reservation, { ...response(100), outcomeUncertain: true }), { code: 'BUDGET_INVALID_SETTLEMENT' });
  budget.close();
  const reopened = createTokenBudget(f.target);
  assert.equal(reopened.snapshot().reservations_pending, 1);
  assert.equal(reopened.snapshot().reserved_input_tokens, 65536);
  assert.equal(reopened.snapshot().charged_input_tokens, 0);
  assert.equal(reopened.snapshot().remaining_input_tokens, null);
  assert.throws(() => reopened.reserve(ids, balances), { code: 'BUDGET_INVALID_SETTLEMENT' });
  reopened.close();
});

test('four local contenders settle one ledger without lost accounting or duplicate reservation IDs', async t => {
  const f = fixture(t); const first = createTokenBudget(f.target);
  const start = first.reserve(ids, balances);
  const metrics = [];
  const calls = [101, 202, 303].map((tokens, i) => acquireTokenBudget(f.target, {
    intervalMs: 1, timeoutMs: 5000, onAcquired: observed => metrics.push(observed),
  }).then(budget => {
    try {
      const reservation = budget.reserve({ ...ids, request_id: `r${i}` }, balances);
      budget.settle(reservation, response(tokens));
      return reservation;
    } finally { budget.close(); }
  }));
  const before = readTokenBudgetSnapshot(f.target);
  assert.equal(before.pending_reservation_id, start);
  assert.equal(before.remaining_input_tokens, null);
  first.settle(start, response(99)); first.close();
  const reservations = [start, ...await Promise.all(calls)];
  assert.equal(new Set(reservations).size, 4);
  assert.deepEqual(reservations.map(id => Number(id.split(':r')[1])).sort((a, b) => a - b), [1, 2, 3, 4]);
  assert.ok(metrics.every(item => item.lock_contentions >= 1 && item.wait_ms >= 0));
  const final = readTokenBudgetSnapshot(f.target);
  assert.equal(final.charged_input_tokens, 705);
  assert.equal(final.settled_requests, 4);
  assert.equal(final.reservations_pending, 0);
  assert.equal(existsSync(`${f.path}.lock`), false);
});

test('unlimited ledger fails closed before integer accounting would lose precision', t => {
  const f = fixture(t); createTokenBudget(f.target).close();
  const ledger = f.read();
  f.write({ ...ledger, charged_input_tokens: Number.MAX_SAFE_INTEGER - 1, settled_requests: 200000000000,
    last_settlement: { reservation_id: `${ledger.budget_id}:r200000000000`, charged_input_tokens: 1,
      input_tokens: 1, billing_run_id: 'last-receipt' } });
  const budget = createTokenBudget(f.target);
  assert.throws(() => budget.reserve(ids, balances), { code: 'BUDGET_ACCOUNTING_OVERFLOW' });
  assert.equal(budget.snapshot().reserved_input_tokens, 0); budget.close();
});
