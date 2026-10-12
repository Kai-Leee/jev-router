import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { setImmediate } from 'node:timers/promises';
import { createTokenBudget, migrateTokenBudget, readTokenBudgetSnapshot, validateBudgetConfig } from '../src/benchmark/budget.mjs';
const sourceFor = ledger_path => ({ schema_version: 'jev-token-budget/v1', ledger_path, max_usd: 1, usd_per_million_input_tokens: 0.6, reserve_input_tokens: 65536 });
const targetFor = ledger_path => ({ schema_version: 'jev-token-budget/v2', ledger_path, max_input_tokens: 10000000, reserve_input_tokens: 65536 });
const ids = { request_id: 'r', run_id: 'run', attempt_id: 'a', group_id: 'g' };
const balances = { paidInputTokensRemaining: 60000000, tokensReserved: 0, tokenDebt: 0, spending_frozen: false };
const response = tokens => ({ model: 'jev-1.13.0', usage: { input_tokens: tokens, output_tokens: 1 }, billing: { mode: 'tokens', modelMultiplier: '1', creditsCharged: '0', paidInputTokensUsed: String(tokens), runId: 'provider-1' }, receipt: { method: 'POST', destination: 'https://jev-ai.pro/api/v1/systemone', status: 200, automaticRetries: 0, durationMs: 1 } });
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jev-budget-v2-'));
  const path = join(dir, 'ledger.json');
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, path, source: sourceFor(path), target: targetFor(path), read: () => JSON.parse(readFileSync(path, 'utf8')) };
}

test('v2 config is token-native and rejects extra USD caps or arbitrary limits', () => {
  const valid = targetFor('/tmp/example-budget');
  assert.equal(validateBudgetConfig(valid).max_input_tokens, 10000000);
  for (const value of [{ ...valid, max_input_tokens: 10000001 }, { ...valid, max_usd: 1 }, { ...valid, reserve_input_tokens: 1 }]) {
    assert.throws(() => validateBudgetConfig(value), { code: 'INVALID_BUDGET_CONFIG' });
  }
});

test('migration preserves identity, charged history and reservation sequence', t => {
  const f = fixture(t); const old = createTokenBudget(f.source);
  for (let n = 0; n < 3; n++) old.settle(old.reserve(ids, balances), response(123));
  old.close(); const before = f.read();
  const snapshot = migrateTokenBudget(f.source, f.target); const after = f.read();
  for (const field of ['budget_id', 'charged_input_tokens', 'settled_requests', 'last_settlement', 'pending', 'blocked_code']) assert.deepEqual(after[field], before[field]);
  assert.equal(snapshot.limit_usd, null); assert.equal(snapshot.token_limit, 10000000);
  assert.equal(snapshot.remaining_input_tokens, 10000000 - 369);
  assert.throws(() => createTokenBudget(f.source), { code: 'BUDGET_LEDGER_INVALID' });
  const budget = createTokenBudget(f.target);
  assert.equal(budget.reserve(ids, balances), `${before.budget_id}:r4`);
  budget.settle(`${before.budget_id}:r4`, response(100)); budget.close();
  assert.equal(readTokenBudgetSnapshot(f.target).charged_input_tokens, 469);
});

test('migration rejects held lock, unresolved calls, invalid settlement and corrupt history without reset', t => {
  const f = fixture(t); const old = createTokenBudget(f.source);
  assert.throws(() => migrateTokenBudget(f.source, f.target), { code: 'BUDGET_LOCKED' });
  const reservation = old.reserve(ids, balances); old.close();
  const unresolved = readFileSync(f.path, 'utf8');
  assert.throws(() => migrateTokenBudget(f.source, f.target), { code: 'BUDGET_OUTSTANDING' });
  assert.equal(readFileSync(f.path, 'utf8'), unresolved);
  const resumed = createTokenBudget(f.source);
  assert.throws(() => resumed.settle(reservation, { ...response(1), model: 'unknown' }), { code: 'BUDGET_MODEL_UNSUPPORTED' });
  resumed.close(); const blocked = readFileSync(f.path, 'utf8');
  assert.throws(() => migrateTokenBudget(f.source, f.target), { code: 'BUDGET_MODEL_UNSUPPORTED' });
  assert.equal(readFileSync(f.path, 'utf8'), blocked);
  writeFileSync(f.path, '{', { mode: 0o600 });
  assert.throws(() => migrateTokenBudget(f.source, f.target), { code: 'BUDGET_LEDGER_INVALID' });
  assert.equal(readFileSync(f.path, 'utf8'), '{');
});

test('migration requires existing history and cannot move paths', t => {
  const f = fixture(t);
  assert.throws(() => migrateTokenBudget(f.source, f.target), { code: 'BUDGET_IO_FAILED' });
  assert.throws(() => migrateTokenBudget(f.source, targetFor(join(f.dir, 'other.json'))), { code: 'BUDGET_MIGRATION_NOT_ALLOWED' });
});

test('readonly snapshot works in another process while writer owns lock and never mutates files', t => {
  const f = fixture(t); const budget = createTokenBudget(f.target);
  const reservation = budget.reserve(ids, balances);
  const before = readFileSync(f.path, 'utf8');
  const url = new URL('../src/benchmark/budget.mjs', import.meta.url).href;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', `import {readTokenBudgetSnapshot} from ${JSON.stringify(url)};console.log(JSON.stringify(readTokenBudgetSnapshot(JSON.parse(process.argv[1]))));`, JSON.stringify(f.target)], { encoding: 'utf8' });
  assert.equal(child.status, 0); assert.equal(JSON.parse(child.stdout).pending_reservation_id, reservation);
  assert.equal(readFileSync(f.path, 'utf8'), before);
  assert.throws(() => readTokenBudgetSnapshot(f.source), { code: 'BUDGET_LEDGER_INVALID' });
  budget.settle(reservation, response(21));
  assert.equal(readTokenBudgetSnapshot(f.target).charged_input_tokens, 21); budget.close();
});

test('v2 exact exhaustion honors 10M inclusive of historical spend', t => {
  const f = fixture(t); const budget = createTokenBudget(f.target);
  let remaining = 10000000;
  while (remaining > 65536) {
    const charged = Math.min(65536, remaining - 65536);
    budget.settle(budget.reserve(ids, balances), response(charged)); remaining -= charged;
  }
  const last = budget.reserve(ids, balances);
  assert.equal(budget.snapshot().remaining_input_tokens, 0);
  budget.settle(last, response(65536));
  assert.equal(budget.snapshot().charged_input_tokens, 10000000);
  assert.throws(() => budget.reserve(ids, balances), { code: 'BUDGET_EXHAUSTED' }); budget.close();
});


test('readonly snapshots stay valid throughout concurrent atomic reserve and settlement writes', async t => {
  const f = fixture(t); createTokenBudget(f.target).close();
  const url = new URL('../src/benchmark/budget.mjs', import.meta.url).href;
  const code = `import {createTokenBudget} from ${JSON.stringify(url)};
const budget=createTokenBudget(JSON.parse(process.argv[1]));
process.stdout.write('ready');
for(let n=0;n<40;n++) budget.settle(budget.reserve(${JSON.stringify(ids)},${JSON.stringify(balances)}),${JSON.stringify(response(100))});
budget.close();`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code, JSON.stringify(f.target)], { stdio: ['ignore', 'pipe', 'pipe'] });
  let done = false; let errors = '';
  child.stderr.on('data', bytes => { errors += bytes; });
  const exited = once(child, 'exit');
  child.once('exit', () => { done = true; });
  await once(child.stdout, 'data');
  let reads = 0;
  while (!done) {
    const snapshot = readTokenBudgetSnapshot(f.target);
    assert.equal(snapshot.charged_input_tokens, snapshot.settled_requests * 100);
    assert.ok([0, 65536].includes(snapshot.reserved_input_tokens));
    reads++;
    await setImmediate();
  }
  assert.equal((await exited)[0], 0, errors);
  assert.ok(reads > 1);
  assert.equal(readTokenBudgetSnapshot(f.target).settled_requests, 40);
});
