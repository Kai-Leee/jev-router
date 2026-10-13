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
