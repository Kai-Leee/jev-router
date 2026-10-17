#!/usr/bin/env node
// Publish selected measurements, never raw prompts, provider streams or secrets.
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const target = 'docs/research/evidence/d095/summary.json';
const base = 'benchmark-runs/d095-public-boundaries-runtime-20261017-02';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const pick = (row, keys) => Object.fromEntries(keys.map(key => {
  assert(Object.hasOwn(row, key), `Missing measurement: ${key}`);
  return [key, row[key]];
}));
const sum = (rows, key) => rows.reduce((total, row) => total + row[key], 0);
const near = (a, b) => assert(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

function build() {
  const sources = [];
  const read = name => {
    const path = `${base}/${name}`, bytes = readFileSync(resolve(root, path));
    sources.push({path, sha256: sha(bytes), availability: 'preserved_local_only'});
    return JSON.parse(bytes);
  };
  const comparison = read('comparison.json'), native = read('native-audit.json');
  const timing = read('component-times.json'), rounds = read('round-summary.json');
  const gateway = read('gateway-audit.json'), verification = read('final-verification.json');
  return {
    schema_version: 'd095-public-research-summary/v1',
    research_branch: 'research-d095-final-20261017',
    scope: 'Selected audited measurements from preserved local runs; not raw evidence or a standalone reproduction of paid runs.',
    conditions: comparison.rows,
    comparisons: comparison.comparisons,
    failed_controller_phase: comparison.controller_failed_phase,
    physical_two_phase_totals: comparison.physical_two_phase_totals,
    latest_usage: {
      ...pick(native, ['input_tokens', 'output_tokens', 'total_tokens', 'cache_read', 'cache_creation',
        'jev_calls', 'claude_cli_calls', 'initial_worker_calls', 'repair_worker_calls', 'repair_rounds', 'reference_cost']),
      claude_terminal_aggregates: native.raw_native.map(row => pick(row, [
        'id', 'sha256', 'input', 'ordinary_input', 'cache_read', 'cache_creation', 'output',
        'thinking_subset', 'reference_short_usd'])),
      accounting: 'Input includes ordinary, cache read and cache creation. Thinking is an output subset, not added again. Prices are estimates, not subscription invoices.',
    },
    rounds: rounds.rows.map(row => pick(row, ['round', 'status', 'public', 'worker_calls', 'worker_tokens', 'noop_workers'])),
    component_times: pick(timing, ['arm_wall_ms', 'rows', 'boundaries']),
    gates: pick(gateway, ['actual_jev_posts', 'guard_receipts', 'missing_or_mismatched']),
    verification_at_run_end: verification,
    limitations: [...comparison.limitations,
      'Original benchmark-runs, raw requests, streams, candidates and history snapshots remain local and are excluded by .gitignore.',
      'Some historical integration tests need local evidence or original source snapshots; a fresh clone is not the measured host.',
      'The default npm test includes historical source pins and is not claimed to pass in this combined research snapshot.',
      'The separate origin/research D085 changes were not merged; this branch preserves D095 source pins.'],
    sources,
  };
}

function check(data) {
  assert.equal(data.schema_version, 'd095-public-research-summary/v1');
  const latest = data.conditions.at(-1), u = data.latest_usage;
  assert.equal(u.input_tokens + u.output_tokens, u.total_tokens);
  assert.equal(u.total_tokens, latest.tokens);
  assert.equal(u.claude_terminal_aggregates.length, u.claude_cli_calls);
  for (const row of u.claude_terminal_aggregates) {
    assert.equal(row.ordinary_input + row.cache_read + row.cache_creation, row.input);
    assert(row.thinking_subset <= row.output);
  }
  assert.equal(sum(u.claude_terminal_aggregates, 'cache_read'), u.cache_read);
  assert.equal(sum(u.claude_terminal_aggregates, 'cache_creation'), u.cache_creation);
  const components = data.component_times.rows;
  assert.equal(sum(components, 'input_tokens'), u.input_tokens);
  assert.equal(sum(components, 'output_tokens'), u.output_tokens);
  assert.equal(sum(data.rounds, 'worker_tokens'),
    sum(u.claude_terminal_aggregates, 'input') + sum(u.claude_terminal_aggregates, 'output'));
  assert.equal(sum(data.rounds, 'worker_calls'), u.claude_cli_calls);
  for (const row of data.rounds) assert.equal(row.public.passed + row.public.failed + row.public.unexecuted, row.public.total);
  assert.equal(data.gates.actual_jev_posts, u.jev_calls);
  assert.equal(data.gates.guard_receipts, u.jev_calls * 3);
  assert.equal(data.gates.missing_or_mismatched, 0);
  near(sum(u.claude_terminal_aggregates, 'reference_short_usd'), u.reference_cost.claude_short_usd);
  near(u.reference_cost.claude_short_usd + u.reference_cost.jev_historical_input_pack_usd, latest.reference_usd);
  assert.equal(u.reference_cost.actual_invoice_usd, null);
  for (const row of data.comparisons) {
    const baseline = data.conditions.find(condition => condition.id === row.baseline);
    near((latest.wall_ms / baseline.wall_ms - 1) * 100, row.wall_change_percent);
    near((latest.tokens / baseline.tokens - 1) * 100, row.token_change_percent);
    near((latest.reference_usd / baseline.reference_usd - 1) * 100, row.reference_change_percent);
  }
  assert.equal(data.physical_two_phase_totals.total_tokens, latest.tokens + data.failed_controller_phase.tokens);
  near(data.physical_two_phase_totals.combined_reference_usd, latest.reference_usd + data.failed_controller_phase.reference_usd);
  assert.equal(data.verification_at_run_end.source_changes.length, 0);
  assert.equal(data.verification_at_run_end.preservation_changes.length, 0);
  assert(!JSON.stringify(data).includes('/Users/'), 'No local home paths in the published projection');
}

const mode = process.argv[2] ?? '--check';
assert(['--write', '--check', '--verify-local'].includes(mode), 'Use --write, --check or --verify-local');
const data = mode === '--write' ? build() : JSON.parse(readFileSync(resolve(root, target)));
check(data);
if (mode === '--write') {
  mkdirSync(dirname(resolve(root, target)), {recursive: true});
  writeFileSync(resolve(root, target), JSON.stringify(data, null, 2) + '\n', {flag: 'wx'});
}
if (mode === '--verify-local') assert.deepEqual(data, build());
console.log(JSON.stringify({status: 'passed', mode, target, conditions: data.conditions.length,
  sources: data.sources.length, latest_tokens: data.latest_usage.total_tokens, provider_calls: 0}));
