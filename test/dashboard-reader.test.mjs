import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSnapshot } from '../src/dashboard/reader.mjs';

const ids = { run_id: 'run-one', attempt_id: 'attempt-one', group_id: 'pair-one', agent_role: 'implementation' };
const now = () => '2026-10-09T01:00:10Z';
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'jev-dashboard-reader-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
const write = (dir, name, data) => writeFileSync(join(dir, name), JSON.stringify(data));
const rows = (dir, name, data) => writeFileSync(join(dir, name), data.map(row => JSON.stringify(row)).join('\n') + '\n');

test('runner-only early preflight failure is discovered with paired identity and safe reason', t => {
  const root = fixture(t);
  rows(root, 'runner.jsonl', [
    { ...ids, event: 'runner_started', phase: 'initializing', status: 'running', recorded_at: '2026-10-09T01:00:00Z' },
    { ...ids, event: 'preflight_failed', phase: 'preflight', status: 'failed', code: 'CLAUDE_AUTH_REQUIRED' },
    { ...ids, event: 'runner_terminal', phase: 'terminal', status: 'failed', code: 'CLAUDE_AUTH_REQUIRED' },
  ]);
  const snapshot = readSnapshot([root], { now });
  assert.equal(snapshot.runs.length, 1);
  const run = snapshot.runs[0];
  assert.equal(run.group_id, 'pair-one');
  assert.equal(run.status, 'failed');
  assert.ok(run.incidents.some(item => item.code === 'CLAUDE_AUTH_REQUIRED'));
  assert.equal(run.providers.find(item => item.provider === 'claude').calls.process_runs, 0);
});

test('gate fallback alone is discovered when primary journal could not be written', t => {
  const root = fixture(t);
  write(root, 'gate-state.json', { schema_version: 'jev-benchmark-gate-state/v1', ...ids, state: 'stopped',
    stop_code: 'RECORD_FAILED', journal_healthy: false, last_decision_id: 3,
    recorded_at: '2026-10-09T01:00:05Z', raw_request: 'SECRET_SENTINEL' });
  const run = readSnapshot([root], { now }).runs[0];
  assert.equal(run.attempt_id, 'attempt-one');
  assert.equal(run.execution.gate_status, 'stopped');
  assert.equal(run.status, 'uncertain');
  assert.ok(run.incidents.some(item => item.decision_id === 3 && item.code === 'RECORD_FAILED'));
  assert.ok(!JSON.stringify(run).includes('SECRET_SENTINEL'));
});

test('heartbeat-only discovery projects activity without exposing PID or claiming useful progress', t => {
  const root = fixture(t);
  write(root, 'runner-heartbeat.json', { ...ids, pid: 777777, recorded_at: '2026-10-09T01:00:09Z', phase: 'provider' });
  const run = readSnapshot([root], { now }).runs[0];
  assert.equal(run.status, 'running');
  assert.equal(run.execution.heartbeat.state, 'fresh');
  assert.equal(run.execution.heartbeat.age_ms, 1000);
  assert.equal(run.execution.last_event_at, null);
  assert.ok(!JSON.stringify(run).includes('777777'));
});

test('same group preserves implementation and monitor identities without aggregating their costs', t => {
  const root = fixture(t);
  for (const role of ['implementation', 'monitor']) {
    const dir = join(root, role); mkdirSync(dir);
    write(dir, 'manifest.json', { ...ids, run_id: `run-${role}`, attempt_id: `attempt-${role}`, agent_role: role,
      evidence_kind: 'synthetic', mode: role === 'monitor' ? 'monitor' : 'jev', max_decisions: null });
  }
  const snapshot = readSnapshot([root], { now });
  assert.equal(snapshot.runs.length, 2);
  assert.equal(new Set(snapshot.runs.map(run => run.group_id)).size, 1);
  assert.deepEqual(snapshot.runs.map(run => run.agent_role).sort(), ['implementation', 'monitor']);
  assert.equal(snapshot.runs.find(run => run.agent_role === 'monitor').providers.find(row => row.provider === 'jev').calls.attempted, 0);
});

test('partial UTF-8 runner row preserves earlier durable failure and reports observation gap', t => {
  const root = fixture(t);
  const complete = JSON.stringify({ ...ids, event: 'preflight_failed', phase: 'preflight', status: 'failed', code: 'CLAUDE_AUTH_REQUIRED' }) + '\n';
  const tail = Buffer.concat([Buffer.from('{"private":"'), Buffer.from('한').subarray(0, 2)]);
  writeFileSync(join(root, 'runner.jsonl'), Buffer.concat([Buffer.from(complete), tail]));
  const run = readSnapshot([root], { now }).runs[0];
  assert.ok(run.incidents.some(item => item.code === 'CLAUDE_AUTH_REQUIRED'));
  assert.ok(run.incidents.some(item => item.code === 'RECORDS_INCOMPLETE'));
  assert.ok(run.warnings.length > 0);
});

test('new allowlisted inputs obey symlink rejection and do not reveal targets', t => {
  const root = fixture(t);
  write(root, 'manifest.json', { ...ids, evidence_kind: 'synthetic' });
  write(root, 'private.json', { recorded_at: '2026-10-09T01:00:09Z', private: 'SECRET_SENTINEL' });
  for (const name of ['runner-heartbeat.json', 'gate-state.json', 'monitor-report.json']) symlinkSync(join(root, 'private.json'), join(root, name));
  const run = readSnapshot([root], { now }).runs[0];
  assert.ok(run.incidents.some(item => item.code === 'RECORDS_INCOMPLETE'));
  assert.equal(run.execution.heartbeat.state, 'unknown');
  assert.ok(!JSON.stringify(run).includes('SECRET_SENTINEL'));
});

test('monitor report is readable only for monitor role and projects bounded expected fields', t => {
  const root = fixture(t);
  write(root, 'manifest.json', { ...ids, agent_role: 'monitor', mode: 'monitor', workload: 'monitoring' });
  write(root, 'monitor-report.json', { assessment: 'attention', evidence: ['Tool exit code 7 was observed.'],
    next_action: 'Inspect the next recorded tool outcome.', limitations: ['No native UI verification.'], raw_prompt: 'SECRET_SENTINEL' });
  const run = readSnapshot([root], { now }).runs[0];
  assert.equal(run.monitor_report.assessment, 'attention');
  assert.equal(run.monitor_report.evidence.length, 1);
  assert.equal(run.evaluation.status, 'not_run');
  assert.ok(!JSON.stringify(run).includes('SECRET_SENTINEL'));
  write(root, 'manifest.json', { ...ids, agent_role: 'implementation' });
  assert.equal(readSnapshot([root], { now }).runs[0].monitor_report, null);
});

test('monitor credential/private path fields are omitted rather than relayed to browser', t => {
  const root = fixture(t);
  write(root, 'manifest.json', { ...ids, agent_role: 'monitor' });
  write(root, 'monitor-report.json', { assessment: 'uncertain', evidence: ['Bearer SECRET_SENTINEL', '/Users/private/file', 'Safe observation.'],
    next_action: 'A'.repeat(1201), limitations: ['No provider bill available.'] });
  const run = readSnapshot([root], { now }).runs[0];
  assert.deepEqual(run.monitor_report.evidence, ['Safe observation.']);
  assert.equal(run.monitor_report.next_action, null);
  assert.ok(!JSON.stringify(run).includes('SECRET_SENTINEL'));
  assert.ok(!JSON.stringify(run).includes('/Users/'));
  assert.ok(run.warnings.some(warning => warning.includes('모니터 보고서')));
});

test('invalid runner heartbeat does not erase authoritative model usage totals', t => {
  const root = fixture(t);
  write(root, 'manifest.json', { ...ids, mode: 'jev' });
  writeFileSync(join(root, 'runner-heartbeat.json'), '{invalid');
  rows(root, 'claude.stream.jsonl', [{ type: 'result', is_error: false, modelUsage: { 'claude-opus-5-5': {
    inputTokens: 2, outputTokens: 3, cacheReadInputTokens: 4, cacheCreationInputTokens: 5 } } }]);
  const run = readSnapshot([root], { now }).runs[0];
  assert.equal(run.providers.find(row => row.provider === 'claude').tokens.total.value, 14);
  assert.ok(run.incidents.some(item => item.code === 'RECORDS_INCOMPLETE'));
});
