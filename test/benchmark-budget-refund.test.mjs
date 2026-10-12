import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTokenBudget, readTokenBudgetSnapshot } from '../src/benchmark/budget.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const ids = { request_id: 'jev-1', run_id: 'old-config-run', attempt_id: 'old-config-run', group_id: 'pair' };
const balances = { paidInputTokensRemaining: 1000000, tokensReserved: 0, tokenDebt: 0, spending_frozen: false };
const response = { model: 'jev-1.13.0', usage: { input_tokens: 123, output_tokens: 8 }, billing: { mode: 'tokens', modelMultiplier: '1', creditsCharged: '0', paidInputTokensUsed: '123', runId: 'provider-1' }, receipt: { method: 'POST', destination: 'https://jev-ai.pro/api/v1/systemone', status: 200, automaticRetries: 0, durationMs: 1 } };
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jev-refund-'));
  const path = join(dir, 'ledger.json');
  const config = { schema_version: 'jev-token-budget/v2', ledger_path: path, max_input_tokens: 10000000, reserve_input_tokens: 65536 };
  const objects = [];
  const open = () => { const budget = createTokenBudget(config); objects.push(budget); return budget; };
  const budget = open();
  budget.settle(budget.reserve(ids, balances), response);
  const reservation = budget.reserve(ids, balances);
  const evidence = { source: 'https://jev-ai.pro/jev-api', method: 'Authenticated visible usage row, operator reviewed', observed_date: '2026-10-10', reservation_id: reservation, ledger_linkage: ids, linked_run: 'new-output-run', linked_invocation: '005-decision', matching_basis: 'New output run reused old-config-run IDs; unique failure follows exact success token counts.', status: 'failed', billing: 'Refunded · no charge', charged_input_tokens: 0, actual_billed_usd: 0, inference_input_tokens: null, paid_input_tokens_remaining: 1000000 };
  const account = { checked_at: '2026-10-10T04:10:08.255Z', credits: { ...balances, receipt: { method: 'GET', destination: 'https://jev-ai.pro/api/v1/credits', status: 200, automaticRetries: 0 } } };
  const input = { evidence_path: join(dir, 'evidence.json'), account_path: join(dir, 'account.json'), evidence_sha256: '', account_sha256: '', ledger_sha256: hash(readFileSync(path)) };
  const save = () => {
    writeFileSync(input.evidence_path, JSON.stringify(evidence)); writeFileSync(input.account_path, JSON.stringify(account));
    input.evidence_sha256 = hash(readFileSync(input.evidence_path)); input.account_sha256 = hash(readFileSync(input.account_path));
  };
  save();
  t.after(() => { chmodSync(dir, 0o700); for (const object of objects) { try { object.close(); } catch {} } rmSync(dir, { recursive: true, force: true }); });
  return { dir, path, config, budget, reservation, evidence, account, input, save, open, read: () => JSON.parse(readFileSync(path, 'utf8')) };
}

test('explicit confirmed refund preserves history, consumes sequence once, and leaves inference usage unknown', t => {
  const f = fixture(t); const before = f.read();
  const after = f.budget.reconcileConfirmedRefund(f.reservation, f.input);
  assert.equal(after.budget_id, before.budget_id); assert.equal(after.charged_input_tokens, 123);
  assert.equal(after.settled_requests, 2); assert.equal(after.reserved_input_tokens, 0);
  const last = f.read().last_settlement;
  assert.equal(last.kind, 'confirmed_refund'); assert.equal(last.reservation_id, f.reservation);
  assert.equal(last.input_tokens, null); assert.equal(last.billing_run_id, null);
  assert.equal(last.charged_input_tokens, 0); assert.equal(last.actual_billed_usd, 0);
  assert.equal(last.prior_ledger_sha256, f.input.ledger_sha256); assert.equal(last.evidence_sha256, f.input.evidence_sha256);
  assert.throws(() => f.budget.reconcileConfirmedRefund(f.reservation, f.input), { code: 'BUDGET_REFUND_NOT_ALLOWED' });
  f.budget.close(); const reopened = f.open();
  assert.equal(readTokenBudgetSnapshot(f.config).charged_input_tokens, 123);
  const next = reopened.reserve(ids, balances); assert.equal(next, `${before.budget_id}:r3`);
  assert.throws(() => reopened.reconcileConfirmedRefund(f.reservation, f.input), { code: 'BUDGET_INVALID_RESERVATION' });
  reopened.settle(next, response); assert.equal(reopened.snapshot().charged_input_tokens, 246);
});

test('reading and reopening an unresolved ledger never releases its reservation automatically', t => {
  const f = fixture(t); f.budget.close();
  assert.equal(readTokenBudgetSnapshot(f.config).pending_reservation_id, f.reservation);
  const reopened = f.open(); assert.equal(reopened.snapshot().reserved_input_tokens, 65536);
  assert.equal(f.read().settled_requests, 1);
});

for (const field of ['evidence_sha256', 'account_sha256', 'ledger_sha256']) {
  test(`refund rejects wrong pinned ${field} without changing ledger`, t => {
    const f = fixture(t); const before = readFileSync(f.path, 'utf8');
    assert.throws(() => f.budget.reconcileConfirmedRefund(f.reservation, { ...f.input, [field]: '0'.repeat(64) }), { code: 'BUDGET_REFUND_EVIDENCE_INVALID' });
    assert.equal(readFileSync(f.path, 'utf8'), before);
  });
}

for (const [label, change] of [
  ['reservation mismatch', f => { f.evidence.reservation_id += '9'; }],
  ['stored run mismatch', f => { f.evidence.ledger_linkage = { ...ids, run_id: 'new-output-run' }; }],
  ['nonzero net charge', f => { f.evidence.charged_input_tokens = 1; }],
  ['invented zero inference usage', f => { f.evidence.inference_input_tokens = 0; }],
  ['missing provenance', f => { f.evidence.matching_basis = ''; }],
  ['nonrefund failure', f => { f.evidence.billing = 'pending'; }],
  ['reserved account tokens', f => { f.account.credits.tokensReserved = 65536; }],
  ['different account balance', f => { f.account.credits.paidInputTokensRemaining = 999999; }],
  ['wrong account receipt', f => { f.account.credits.receipt.destination = 'https://other.invalid/credits'; }],
]) {
  test(`refund rejects hashed but invalid evidence: ${label}`, t => {
    const f = fixture(t); const before = readFileSync(f.path, 'utf8'); change(f); f.save();
    assert.throws(() => f.budget.reconcileConfirmedRefund(f.reservation, f.input), { code: 'BUDGET_REFUND_EVIDENCE_INVALID' });
    assert.equal(readFileSync(f.path, 'utf8'), before);
  });
}

test('refund cannot clear a blocked invalid settlement', t => {
  const f = fixture(t);
  assert.throws(() => f.budget.settle(f.reservation, { ...response, model: 'unknown' }), { code: 'BUDGET_MODEL_UNSUPPORTED' });
  const before = readFileSync(f.path, 'utf8');
  assert.throws(() => f.budget.reconcileConfirmedRefund(f.reservation, f.input), { code: 'BUDGET_REFUND_NOT_ALLOWED' });
  assert.equal(readFileSync(f.path, 'utf8'), before);
});

test('refund persistence failure retains charged history and unresolved reservation', t => {
  const f = fixture(t); chmodSync(f.dir, 0o500);
  assert.throws(() => f.budget.reconcileConfirmedRefund(f.reservation, f.input), { code: 'BUDGET_IO_FAILED' });
  chmodSync(f.dir, 0o700);
  assert.equal(f.read().pending.reservation_id, f.reservation);
  assert.equal(f.read().charged_input_tokens, 123); assert.equal(f.read().settled_requests, 1);
  assert.equal(f.budget.snapshot().reserved_input_tokens, 65536);
});
