import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createTokenBudget, validateBudgetConfig} from '../src/benchmark/budget.mjs';
import {loadAdaptiveRunManifest, preflightAdaptiveRun} from '../src/benchmark/adaptive-dag-runner.mjs';

const root = resolve(import.meta.dirname, '..');

function setup(t, budgetLock) {
  const directory = mkdtempSync(join(tmpdir(), 'd079-preflight-lock-'));
  t.after(() => rmSync(directory, {recursive: true, force: true}));
  const base = loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d076-preserved-repair.json'), root);
  const manifest = {...base, jev_budget: {...base.jev_budget, ledger_path: join(directory, 'ledger.json')},
    runtime_speed: {...base.runtime_speed, budget_lock: budgetLock}};
  const config = validateBudgetConfig(manifest.jev_budget, root);
  createTokenBudget(config).close();
  // What a concurrent cohort's ledger_op reserve does: open the ledger under its lock.
  const ledgerLockFree = () => {
    try { createTokenBudget(config, {requireExisting: true}).close(); return true; }
    catch (error) { if (error.code === 'BUDGET_LOCKED') return false; throw error; }
  };
  return {manifest, ledgerLockFree};
}

test('D079 regression: ledger_op cohort preflight checks capacity under the lock and runs the Docker preflight without it', async t => {
  const {manifest, ledgerLockFree} = setup(t, 'ledger_op');
  let freeDuringPreflight = null;
  const result = await preflightAdaptiveRun({rootDir: root, manifest, probe: true, record: async () => {},
    adapters: {preflight: async () => { freeDuringPreflight = ledgerLockFree(); return {schema_version: 'fixture-preflight'}; }}});
  assert.equal(freeDuringPreflight, true);
  assert.equal(result.cohort_capacity.token_capacity_unlimited, true);
  assert.equal(ledgerLockFree(), true);
});

test('call-lock manifests keep the historical whole-preflight ledger hold', async t => {
  const {manifest, ledgerLockFree} = setup(t, 'call');
  let freeDuringPreflight = null;
  await preflightAdaptiveRun({rootDir: root, manifest, probe: true, record: async () => {},
    adapters: {preflight: async () => { freeDuringPreflight = ledgerLockFree(); return {schema_version: 'fixture-preflight'}; }}});
  assert.equal(freeDuringPreflight, false);
  assert.equal(ledgerLockFree(), true);
});

const ids = request_id => ({request_id, run_id: 'other-cohort', attempt_id: 'attempt', group_id: 'group'});
const balances = {paidInputTokensRemaining: 60000000, tokensReserved: 0, tokenDebt: 0, spending_frozen: false};

test('D080 regression: a ledger_op start admits another cohort\'s live reservation but not a blocked one', async t => {
  const {manifest} = setup(t, 'ledger_op'), config = validateBudgetConfig(manifest.jev_budget, root);
  const other = createTokenBudget(config, {requireExisting: true});
  const live = other.reserve(ids('live'), balances, {leaseMs: 600000}); other.close();
  const preflight = () => preflightAdaptiveRun({rootDir: root, manifest, probe: true, record: async () => {},
    adapters: {preflight: async () => ({schema_version: 'fixture-preflight'})}});
  assert.equal((await preflight()).cohort_capacity.snapshot.reservations_in_flight, 1);
  const call = setup(t, 'call'), callConfig = validateBudgetConfig(call.manifest.jev_budget, root);
  const callOther = createTokenBudget(callConfig, {requireExisting: true});
  callOther.reserve(ids('live'), balances, {leaseMs: 600000}); callOther.close();
  await assert.rejects(preflightAdaptiveRun({rootDir: root, manifest: call.manifest, probe: true, record: async () => {},
    adapters: {preflight: async () => ({schema_version: 'fixture-preflight'})}}), {code: 'BUDGET_OUTSTANDING'});
  const reopened = createTokenBudget(config, {requireExisting: true}); reopened.markUnresolved(live); reopened.close();
  await assert.rejects(preflight(), {code: 'BUDGET_OUTSTANDING'});
});
