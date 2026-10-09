import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeRun } from '../src/dashboard/metrics.mjs';

const manifest = { mode: 'jev', evidence_kind: 'synthetic', workload: 'e2e-swe', max_decisions: 5,
  wall_timeout_seconds: 30, claude_max_budget_usd: 1, started_at: '2026-10-09T01:00:00Z' };
const provider = (run, name) => run.providers.find(row => row.provider === name);
const start = id => ({ event: 'inference_started', provider: 'jev', request_id: id });
const finish = (id, overrides = {}) => ({ event: 'inference_finished', provider: 'jev', request_id: id,
  status: 'completed', model: 'jev-latest', usage: { input_tokens: 100, output_tokens: 2, cost: 99 },
  billing: { paidInputTokensUsed: '120', creditsCharged: '0' }, ...overrides });
const fullUsage = (input, output, read = 0, write = 0) => ({ inputTokens: input, outputTokens: output,
  cacheReadInputTokens: read, cacheCreationInputTokens: write });

test('shared budget projection separates conservative estimate from actual billing and filters arbitrary fields', () => {
  const configured = {...manifest,jev_budget:{schema_version:'jev-token-budget/v1',max_usd:1,usd_per_million_input_tokens:0.6,reserve_input_tokens:65536,ledger_path:'/private/hidden.json'}};
  const data = {budget_id:'budget-test',limit_usd:1,rate_usd_per_million:0.6,charged_input_tokens:1000,reserved_input_tokens:65536,estimated_spent_usd:9000,secret:'hidden'};
  const run=summarizeRun({id:'budget-run',manifest:configured,decisions:[{event:'budget_reserved',budget:data}]});
  assert.equal(run.jev_budget.estimated_spent_usd,0.0006);
  assert.equal(run.jev_budget.estimated_reserved_usd,0.0393216);
  assert.equal(run.jev_budget.actual_billed_usd,null);
  assert.equal(JSON.stringify(run).includes('hidden'),false);
  const waiting=summarizeRun({id:'waiting',manifest:configured});
  assert.equal(waiting.jev_budget.estimated_spent_usd,null);
  const invalid=summarizeRun({id:'invalid',manifest:configured,decisions:[{event:'budget_settled',budget:{...data,charged_input_tokens:2000000}}]});
  assert.equal(invalid.jev_budget.estimated_spent_usd,null);
});

test('budget rejection before POST is a visible incident with zero current-run inference attempts', () => {
  const run=summarizeRun({id:'budget-stop',manifest,decisions:[{event:'input',mode:'jev'},
    {event:'budget_blocked',provider:'jev',code:'BUDGET_PAID_BALANCE_LOW',outcome_uncertain:false}]});
  assert.equal(provider(run,'jev').calls.attempted,0);
  assert.ok(run.incidents.some(event=>event.code==='BUDGET_PAID_BALANCE_LOW'));
});
const claudeFinal = overrides => ({ type: 'result', is_error: false, total_cost_usd: 0.03,
  modelUsage: { 'claude-opus-5-5': { ...fullUsage(10, 20, 30, 40), costUSD: 0.03 } }, ...overrides });
const assistant = (id, input, output = 999) => ({ type: 'assistant', message: { id, model: 'claude-opus-5-5',
  usage: { input_tokens: input, output_tokens: output, cache_read_input_tokens: 5, cache_creation_input_tokens: 7 },
  content: [{ type: 'text', text: 'PRIVATE PROMPT' }] } });

test('empty records preserve unknown instead of claiming free zero usage', () => {
  const run = summarizeRun({ id: 'empty' });
  assert.equal(run.status, 'unknown');
  assert.equal(run.kind, 'unknown');
  for (const row of run.providers) {
    assert.equal(row.calls.attempted, null);
    assert.deepEqual(row.tokens.total, { value: null, observed: null, known: 0, expected: null });
    assert.equal(row.costs.billed_usd.value, null);
  }
});

test('explicit no-model control has measured zero, while completed grading is separate', () => {
  const run = summarizeRun({ id: 'oracle', result: { model_calls: 0, evidence_kind: 'control', adapter: 'jev-router-standalone-docker-v1',
    grading_status: 'completed', resolved: true, reward: 1, summary: { tests: 30, passed: 30 } } });
  assert.equal(run.kind, 'control');
  assert.equal(run.evaluation.status, 'passed');
  assert.equal(run.evaluation.total, 30);
  assert.equal(provider(run, 'jev').tokens.total.value, 0);
  assert.equal(provider(run, 'claude').calls.process_runs, 0);
});

test('Jev counts POST boundary once per request, not questions, GET or repeated receipt', () => {
  const receipt = finish('jev-1');
  const run = summarizeRun({ id: 'jev', manifest, decisions: [
    { event: 'models_get', provider: 'jev' }, { event: 'input', questions: { a: {}, b: {} } },
    start('jev-1'), start('jev-1'), receipt, receipt, start('jev-2'),
    finish('jev-2', { usage: { input_tokens: 50, output_tokens: 3 }, billing: { paidInputTokensUsed: '0', creditsCharged: '0.5' } }),
  ] });
  const jev = provider(run, 'jev');
  assert.equal(jev.calls.attempted, 2);
  assert.equal(jev.calls.completed, 2);
  assert.deepEqual(jev.tokens.total, { value: 155, observed: 155, known: 2, expected: 2 });
  assert.equal(jev.costs.credits.value, 0.5);
  assert.equal(jev.costs.paid_input_tokens.value, 120);
  assert.equal(jev.costs.reported_usd.value, null);
  assert.equal(jev.costs.billed_usd.value, null);
});

test('failed, uncertain and successful requests remain in token coverage denominator', () => {
  const run = summarizeRun({ id: 'mixed', manifest, result: { process_exit: 1 }, decisions: [
    start('jev-1'), finish('jev-1'), start('jev-2'), finish('jev-2', { status: 'failed' }), start('jev-3'),
  ] });
  const jev = provider(run, 'jev');
  assert.equal(jev.calls.attempted, 3);
  assert.equal(jev.calls.completed, 1);
  assert.equal(jev.calls.failed, 1);
  assert.equal(jev.calls.uncertain, 1);
  assert.deepEqual(jev.tokens.input, { value: null, observed: 100, known: 1, expected: 3 });
  assert.deepEqual(jev.costs.credits, { value: null, observed: 0, known: 1, expected: 3 });
});

test('live pending request is not prematurely labelled a failed or uncertain result', () => {
  const run = summarizeRun({ id: 'pending', manifest, decisions: [start('jev-1')], observedAt: '2026-10-09T01:00:10Z' });
  const jev = provider(run, 'jev');
  assert.equal(run.status, 'running');
  assert.equal(jev.calls.attempted, 1);
  assert.equal(jev.calls.uncertain, 0);
  assert.equal(jev.tokens.total.value, null);
});

test('legacy decision records provide subtotals but gate inputs never become POST count', () => {
  const run = summarizeRun({ id: 'legacy', manifest, decisions: [
    { event: 'input', mode: 'jev', decision_id: 1 },
    { event: 'decision', decision_id: 1, decision: finish('jev-1') },
    { event: 'input', mode: 'jev', decision_id: 2 },
  ] });
  const jev = provider(run, 'jev');
  assert.equal(jev.calls.attempted, null);
  assert.equal(jev.calls.completed, 1);
  assert.deepEqual(jev.tokens.input, { value: null, observed: 100, known: 1, expected: null });
});

test('conflicting duplicate Jev response cannot inflate or silently select totals', () => {
  const run = summarizeRun({ manifest, result: { process_exit: 0 }, decisions: [start('jev-1'), finish('jev-1'),
    finish('jev-1', { usage: { input_tokens: 200, output_tokens: 2 } })] });
  const jev = provider(run, 'jev');
  assert.equal(jev.calls.attempted, 1);
  assert.equal(jev.calls.completed, 0);
  assert.equal(jev.calls.uncertain, 1);
  assert.equal(jev.tokens.input.observed, null);
});

test('orphaned Jev receipt retains subtotal but cannot claim complete attempt count', () => {
  const jev = provider(summarizeRun({ manifest, decisions: [finish('jev-1')] }), 'jev');
  assert.equal(jev.calls.attempted, null);
  assert.equal(jev.tokens.input.observed, 100);
  assert.equal(jev.tokens.input.value, null);
});

test('empty, nonfinite, negative and boolean billing values stay unknown, zero stays zero', () => {
  for (const value of ['', ' ', '-1', 'NaN', 'Infinity', true, null, -1, Infinity, '1e3']) {
    const jev = provider(summarizeRun({ manifest, decisions: [start('jev-1'), finish('jev-1', {
      billing: { paidInputTokensUsed: value, creditsCharged: value },
    })] }), 'jev');
    assert.equal(jev.costs.credits.observed, null, String(value));
    assert.equal(jev.costs.paid_input_tokens.value, null, String(value));
  }
});

test('Claude final modelUsage includes all model rows and replaces per-message/result usage', () => {
  const run = summarizeRun({ manifest, claudeEvents: [assistant('msg-1', 100), assistant('msg-1', 100), claudeFinal({
    usage: { input_tokens: 99999, output_tokens: 99999 }, total_cost_usd: 0.07,
    modelUsage: { 'claude-opus-5-5': { ...fullUsage(10, 20, 30, 40), costUSD: 0.03 },
      'claude-haiku-4-5': { ...fullUsage(2, 3, 4, 5), costUSD: 0.04 } },
  })] });
  const claude = provider(run, 'claude');
  assert.equal(claude.calls.observed_model_turns, 1);
  assert.equal(claude.calls.attempted, null);
  assert.equal(claude.calls.process_runs, 1);
  assert.equal(claude.tokens.input.value, 12);
  assert.equal(claude.tokens.output.value, 23);
  assert.equal(claude.tokens.cache_read.value, 34);
  assert.equal(claude.tokens.cache_creation.value, 45);
  assert.deepEqual(claude.tokens.total, { value: 114, observed: 114, known: 2, expected: 2 });
  assert.equal(claude.costs.reported_usd.value, 0.07);
  assert.equal(claude.costs.billed_usd.value, null);
});

test('Claude live assistant repeats merge without summing output placeholders', () => {
  const claude = provider(summarizeRun({ manifest, claudeEvents: [assistant('msg-1', 100), assistant('msg-1', 100, 0), assistant('msg-2', 50)] }), 'claude');
  assert.equal(claude.calls.observed_model_turns, 2);
  assert.deepEqual(claude.tokens.input, { value: null, observed: 150, known: 2, expected: null });
  assert.equal(claude.tokens.output.observed, null);
  assert.equal(claude.tokens.total.observed, null);
  assert.equal(claude.tokens.cache_read.observed, 10);
});

test('Claude error-zero result does not erase earlier token observations', () => {
  const claude = provider(summarizeRun({ manifest, claudeEvents: [assistant('msg-1', 100),
    { type: 'result', is_error: true, total_cost_usd: 0, modelUsage: {}, usage: { input_tokens: 0, output_tokens: 0 } }] }), 'claude');
  assert.equal(claude.calls.failed, 1);
  assert.equal(claude.tokens.input.observed, 100);
  assert.equal(claude.tokens.input.value, null);
  assert.equal(claude.costs.reported_usd.value, null);
});

test('Claude missing model/cache field gives honest per-model incomplete total', () => {
  const claude = provider(summarizeRun({ claudeEvents: [claudeFinal({ modelUsage: {
    'claude-opus-5-5': fullUsage(10, 20, 30, 40), 'claude-haiku-4-5': { inputTokens: 5, outputTokens: 6 },
  } })] }), 'claude');
  assert.equal(claude.tokens.input.value, 15);
  assert.deepEqual(claude.tokens.total, { value: null, observed: 100, known: 1, expected: 2 });
});

test('Claude legacy final usage fallback is explicitly main-loop scoped', () => {
  const run = summarizeRun({ result: { process_exit: 0, claude_usage: {
    input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 }, claude_reported_cost_usd: 0.01 } });
  assert.equal(provider(run, 'claude').tokens.total.value, 10);
  assert.ok(run.warnings.some(value => value.includes('메인 루프')));
});

test('loader issue never becomes a raw warning or a falsely complete provider subtotal', () => {
  const run = summarizeRun({ manifest, issues: ['decisions_malformed'], decisions: [start('jev-1'), finish('jev-1')], claudeEvents: [claudeFinal()] });
  assert.equal(provider(run, 'jev').tokens.input.value, null);
  assert.equal(provider(run, 'jev').tokens.input.observed, 100);
  assert.equal(provider(run, 'claude').tokens.total.value, 100);
  assert.ok(!JSON.stringify(run).includes('decisions_malformed'));
});

test('malicious metadata, raw prompt, command, tool output and private path never reach projection', () => {
  const secret = '<script>alert("SECRET")</script>/Users/private';
  const run = summarizeRun({ id: secret, manifest: { ...manifest, title: secret, auth: secret, instructions: [secret] },
    result: { session_directory: secret, cleanup: { container_id: secret } }, issues: [secret],
    decisions: [{ ...finish('jev-1'), model: secret, error: secret, command: secret, output: secret, status: secret }],
    claudeEvents: [{ ...assistant('msg-1', 10), message: { id: 'msg-1', model: secret, content: [{ text: secret }] } }] });
  assert.equal(run.id, 'unknown-run');
  assert.ok(!JSON.stringify(run).includes('SECRET'));
  assert.ok(!JSON.stringify(run).includes('/Users/'));
});

test('agent completion claim and zero collected tests are not successful evaluation', () => {
  assert.equal(summarizeRun({ result: { evaluator_success: true, completion_claimed: true, process_exit: 0 } }).evaluation.status, 'not_run');
  const run = summarizeRun({ result: { grading_status: 'completed', resolved: false, reward: 0, summary: { tests: 0, passed: 0 } } });
  assert.equal(run.evaluation.status, 'failed');
  assert.equal(run.evaluation.total, 0);
});

test('unsafe sums and fractional token counts never become numeric totals', () => {
  const jev = provider(summarizeRun({ manifest, decisions: [start('jev-1'), finish('jev-1', {
    usage: { input_tokens: Number.MAX_SAFE_INTEGER, output_tokens: 1 } }), start('jev-2'), finish('jev-2', {
    usage: { input_tokens: 1.5, output_tokens: 1 } })] }), 'jev');
  assert.equal(jev.tokens.total.value, null);
  assert.equal(jev.tokens.total.observed, null);
  assert.equal(jev.tokens.input.known, 1);
});

test('Claude error modelUsage zero placeholders preserve earlier stream input observations', () => {
  const claude = provider(summarizeRun({ manifest, claudeEvents: [assistant('msg-1', 100),
    claudeFinal({ is_error: true, total_cost_usd: 0, modelUsage: { 'claude-opus-5-5': { ...fullUsage(0, 0), costUSD: 0 } } })] }), 'claude');
  assert.equal(claude.tokens.input.observed, 100);
  assert.equal(claude.tokens.input.value, null);
  assert.equal(claude.costs.reported_usd.observed, null);
});

test('non-object JSONL rows do not silently disappear into complete totals', () => {
  const run = summarizeRun({ manifest, decisions: [start('jev-1'), finish('jev-1'), null], claudeEvents: [claudeFinal(), 7] });
  assert.equal(provider(run, 'jev').tokens.input.value, null);
  assert.equal(provider(run, 'jev').tokens.input.observed, 100);
  assert.equal(provider(run, 'claude').tokens.input.value, null);
  assert.equal(provider(run, 'claude').tokens.input.observed, 10);
});

test('conflicting legacy duplicate decision retains no arbitrary last receipt', () => {
  const jev = provider(summarizeRun({ manifest, decisions: [
    { event: 'decision', decision_id: 1, decision: finish('jev-1') },
    { event: 'decision', decision_id: 1, decision: finish('jev-1', { usage: { input_tokens: 999, output_tokens: 1 } }) },
  ] }), 'jev');
  assert.equal(jev.calls.completed, 0);
  assert.equal(jev.calls.uncertain, 1);
  assert.equal(jev.tokens.input.observed, null);
});

test('Personal OS incomplete native/browser criteria cannot become full product success', () => {
  const run = summarizeRun({ result: { version: 'personal-os-evaluator-v1-experimental', full_product_verified: true,
    overall_status: 'pass', criteria: [{ required: true, status: 'pass' }, { required: true, status: 'not_run' }] } });
  assert.equal(run.evaluation.status, 'unknown');
  assert.equal(run.evaluation.passed, 1);
  assert.equal(run.evaluation.total, 2);
});

test('token and cost measurements accept real zero from final successful receipt', () => {
  const claude = provider(summarizeRun({ claudeEvents: [claudeFinal({ total_cost_usd: 0,
    modelUsage: { 'claude-opus-5-5': { ...fullUsage(0, 0), costUSD: 0 } } })] }), 'claude');
  assert.deepEqual(claude.tokens.total, { value: 0, observed: 0, known: 1, expected: 1 });
  assert.equal(claude.costs.reported_usd.value, 0);
  assert.equal(claude.costs.billed_usd.value, null);
});

test('positive Claude usage on error without modelUsage remains a partial observation', () => {
  const claude = provider(summarizeRun({ claudeEvents: [{ type: 'result', is_error: true,
    usage: { input_tokens: 11, output_tokens: 7, cache_read_input_tokens: 2, cache_creation_input_tokens: 3 } }] }), 'claude');
  assert.equal(claude.calls.failed, 1);
  assert.deepEqual(claude.tokens.input, { value: null, observed: 11, known: 1, expected: null });
  assert.deepEqual(claude.tokens.output, { value: null, observed: 7, known: 1, expected: null });
  assert.deepEqual(claude.tokens.total, { value: null, observed: 23, known: 1, expected: null });
});

test('positive legacy Claude error usage is retained and incomplete fields remain unknown', () => {
  const claude = provider(summarizeRun({ result: { process_exit: 1, claude_is_error: true,
    claude_usage: { input_tokens: 11, output_tokens: 7 } } }), 'claude');
  assert.equal(claude.tokens.input.observed, 11);
  assert.equal(claude.tokens.output.observed, 7);
  assert.equal(claude.tokens.total.observed, null);
  assert.equal(claude.tokens.input.value, null);
});

test('expired deadline without terminal receipt is uncertain, including unresolved Jev and Claude', () => {
  const run = summarizeRun({ manifest, decisions: [start('jev-1')], claudeEvents: [assistant('msg-1', 10)],
    observedAt: '2026-10-09T01:01:00.001Z' });
  assert.equal(run.status, 'uncertain');
  assert.equal(provider(run, 'jev').calls.uncertain, 1);
  assert.equal(provider(run, 'claude').calls.uncertain, 1);
  assert.equal(provider(run, 'claude').tokens.input.observed, 10);
  assert.equal(provider(run, 'claude').tokens.input.value, null);
  assert.ok(run.warnings.some(value => value.includes('30초 유예')));
});

test('deadline grace includes exact boundary and does not override completed synthetic result', () => {
  const pending = summarizeRun({ manifest, decisions: [start('jev-1')], observedAt: '2026-10-09T01:01:00Z' });
  assert.equal(pending.status, 'running');
  assert.equal(provider(pending, 'jev').calls.uncertain, 0);
  const complete = summarizeRun({ manifest, decisions: [start('jev-1'), finish('jev-1')], claudeEvents: [claudeFinal()],
    result: { process_exit: 0, cleanup: { stopped: true } }, observedAt: '2026-10-10T01:00:00Z' });
  assert.equal(complete.status, 'completed');
  assert.equal(complete.kind, 'synthetic');
  assert.equal(provider(complete, 'jev').calls.uncertain, 0);
});

test('missing or contradictory clock/deadline evidence cannot claim current liveness', () => {
  const cases = [
    { manifest },
    { manifest: { ...manifest, wall_timeout_seconds: null }, observedAt: '2026-10-09T01:00:10Z' },
    { manifest: { ...manifest, wall_timeout_seconds: 0 }, observedAt: '2026-10-09T01:00:10Z' },
    { manifest, observedAt: 'not-a-date' },
    { manifest, observedAt: '2026-10-08T01:00:10Z' },
  ];
  for (const input of cases) assert.equal(summarizeRun({ ...input, decisions: [start('jev-1')] }).status, 'unknown');
  assert.equal(summarizeRun({ manifest: { mode: 'jev' } }).status, 'prepared');
});

test('failed container freeze makes the run uncertain without discarding successful Claude usage', () => {
  const run = summarizeRun({ manifest, result: { process_exit: 0, outcome_uncertain: false, claude_is_error: false,
    cleanup: { stopped: false }, claude_usage: { input_tokens: 11, output_tokens: 7,
      cache_read_input_tokens: 2, cache_creation_input_tokens: 3 }, claude_reported_cost_usd: 0.02 } });
  assert.equal(run.status, 'uncertain');
  assert.ok(run.warnings.some(value => value.includes('작업 컨테이너 정지')));
  const claude = provider(run, 'claude');
  assert.equal(claude.calls.completed, 1);
  assert.equal(claude.calls.uncertain, 0);
  assert.equal(claude.tokens.total.value, 23);
  assert.equal(claude.costs.reported_usd.value, 0.02);
});

test('confirmed legacy cleanup completes; absent cleanup remains unconfirmed without fabricated failure', () => {
  for (const cleanup of [undefined, { stopped: true }]) {
    const run = summarizeRun({ result: { process_exit: 0, cleanup }, claudeEvents: [claudeFinal()] });
    assert.equal(run.status, cleanup ? 'completed' : 'uncertain');
    assert.ok(!run.warnings.some(value => value.includes('작업 컨테이너 정지')));
  }
});

test('error zero modelUsage cannot erase positive final main-loop usage without assistant events', () => {
  const run = summarizeRun({ claudeEvents: [claudeFinal({ is_error: true, total_cost_usd: 0,
    modelUsage: { 'claude-opus-5-5': { ...fullUsage(0, 0), costUSD: 0 } },
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })] });
  const claude = provider(run, 'claude');
  assert.equal(claude.calls.failed, 1);
  assert.deepEqual(claude.tokens.input, { value: null, observed: 100, known: 1, expected: null });
  assert.deepEqual(claude.tokens.output, { value: null, observed: 20, known: 1, expected: null });
  assert.deepEqual(claude.tokens.total, { value: null, observed: 120, known: 1, expected: null });
  assert.equal(claude.costs.reported_usd.observed, null);
  assert.ok(run.warnings.some(value => value.includes('메인 루프')));
});

test('positive error final usage replaces contradictory zero modelUsage without adding stream input', () => {
  const claude = provider(summarizeRun({ claudeEvents: [assistant('msg-1', 80), claudeFinal({
    is_error: true, total_cost_usd: 0, modelUsage: { 'claude-opus-5-5': { ...fullUsage(0, 0), costUSD: 0 } },
    usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  })] }), 'claude');
  assert.equal(claude.tokens.input.observed, 100);
  assert.equal(claude.tokens.total.observed, 120);
  assert.equal(claude.tokens.total.value, null);
});

const ids = { run_id: 'run-a', attempt_id: 'attempt-1', group_id: 'pair-1', agent_role: 'implementation' };
const paired = { ...manifest, ...ids, max_decisions: null, claude_max_budget_usd: null };
const runnerEvent = (event, phase, status, extra = {}) => ({ event, phase, status, ...ids,
  recorded_at: '2026-10-09T01:00:05Z', ...extra });

test('explicit null limits are unlimited while missing, zero and invalid limits stay unknown', () => {
  const unlimited = summarizeRun({ manifest: paired });
  assert.equal(unlimited.limits.jev_call_limit, 'unlimited');
  assert.equal(unlimited.limits.claude_budget_limit, 'unlimited');
  assert.equal(unlimited.group_id, 'pair-1');
  assert.equal(unlimited.agent_role, 'implementation');
  for (const value of [undefined, 0, -1, 1.5, 'unlimited']) {
    assert.equal(summarizeRun({ manifest: { max_decisions: value } }).limits.jev_call_limit, 'unknown');
  }
});

test('tool exit 7 creates recoverable incident while ready gate and runner can continue', () => {
  const run = summarizeRun({ manifest: paired, observedAt: '2026-10-09T01:00:10Z', decisions: [
    { event: 'outcome', decision_id: 1, outcome: { exit_code: 7, duration_ms: 15 }, completion_claimed: false },
    { event: 'outcome', decision_id: 2, outcome: { exit_code: 0, duration_ms: 10 }, completion_claimed: false },
  ] });
  assert.equal(run.status, 'running');
  assert.equal(run.execution.gate_status, 'ready');
  assert.equal(run.incidents.length, 1);
  assert.deepEqual(run.incidents[0], { at: null, source: 'tool', code: 'TOOL_EXIT_NONZERO', decision_id: 1, exit_code: 7, recovery_allowed: true });
  assert.equal(run.activity[0].status, 'failed');
  assert.equal(run.activity[0].duration_ms, 15);
});

test('budget gate stop is visible without pretending the writer process died', () => {
  const run = summarizeRun({ manifest: paired, observedAt: '2026-10-09T01:00:10Z', decisions: [
    { event: 'stopped', decision_id: 1, code: 'BUDGET_EXHAUSTED' },
  ], heartbeat: { ...ids, recorded_at: '2026-10-09T01:00:09Z', phase: 'provider', pid: 99 } });
  assert.equal(run.status, 'failed');
  assert.equal(run.execution.runner_status, 'running');
  assert.equal(run.execution.gate_status, 'stopped');
  assert.equal(run.execution.gate_stop_code, 'BUDGET_EXHAUSTED');
  assert.equal(run.execution.heartbeat.state, 'fresh');
  assert.ok(run.incidents.some(incident => incident.code === 'BUDGET_EXHAUSTED' && incident.recovery_allowed === false));
});

test('independent gate-state makes failed journal visible with no raw input', () => {
  const run = summarizeRun({ manifest: paired, gateState: { schema_version: 'jev-benchmark-gate-state/v1', ...ids,
    recorded_at: '2026-10-09T01:00:09Z', state: 'stopped', stop_code: 'RECORD_FAILED',
    journal_healthy: false, last_decision_id: 2, last_event: 'action_started', private: 'SECRET' },
  observedAt: '2026-10-09T01:00:10Z' });
  assert.equal(run.status, 'uncertain');
  assert.equal(run.execution.gate_status, 'stopped');
  assert.ok(run.incidents.some(incident => incident.source === 'observer' && incident.code === 'RECORD_FAILED'));
  assert.ok(!JSON.stringify(run).includes('SECRET'));
});

test('rejected input is an incident but not a billable model attempt or terminal failure', () => {
  const run = summarizeRun({ manifest: paired, observedAt: '2026-10-09T01:00:10Z', decisions: [
    { event: 'rejected', decision_id: null, code: 'INVALID_INPUT', recovery_allowed: true },
  ] });
  assert.equal(run.status, 'running');
  assert.equal(provider(run, 'jev').calls.attempted, null);
  assert.equal(run.incidents[0].code, 'INVALID_INPUT');
  assert.equal(run.incidents[0].decision_id, null);
});

test('Claude final alone is finalizing until runner terminal and becomes uncertain after deadline', () => {
  const pending = summarizeRun({ manifest: paired, claudeEvents: [claudeFinal()], observedAt: '2026-10-09T01:00:10Z' });
  assert.equal(pending.status, 'running');
  assert.equal(pending.execution.runner_status, 'finalizing');
  assert.equal(pending.execution.phase, 'finalizing');
  assert.equal(provider(pending, 'claude').calls.completed, 1);
  const abandoned = summarizeRun({ manifest: paired, claudeEvents: [claudeFinal()], observedAt: '2026-10-09T01:02:00Z' });
  assert.equal(abandoned.status, 'uncertain');
  assert.equal(provider(abandoned, 'claude').calls.completed, 1);
  assert.equal(provider(abandoned, 'claude').tokens.total.value, 100);
});

test('CLI exit zero without valid final cannot become overall completed', () => {
  const run = summarizeRun({ manifest: paired, result: { process_exit: 0, cleanup: { stopped: true } } });
  assert.equal(run.status, 'uncertain');
  assert.ok(run.incidents.some(incident => incident.code === 'PROVIDER_FINAL_MISSING'));
});

test('runner completion requires successful provider plus CLI exit and confirmed artifact freeze', () => {
  const result = { ...ids, runner_status: 'completed', process_exit: 0, claude_is_error: false,
    artifact_frozen: true, finished_at: '2026-10-09T01:00:10Z' };
  const run = summarizeRun({ manifest: paired, result, claudeEvents: [claudeFinal()] });
  assert.equal(run.status, 'completed');
  assert.equal(run.execution.runner_status, 'completed');
  assert.equal(run.execution.phase, 'terminal');
  assert.equal(run.evaluation.status, 'not_run');
  const unsupported = summarizeRun({ manifest: paired, result: { runner_status: 'completed' } });
  assert.equal(unsupported.status, 'uncertain');
  assert.ok(unsupported.incidents.some(incident => incident.code === 'TERMINAL_EVIDENCE_INCOMPLETE'));
});

test('early preflight failure is listed and establishes zero model calls before provider start', () => {
  const run = summarizeRun({ manifest: paired, runnerEvents: [runnerEvent('runner_started', 'initializing', 'running'),
    runnerEvent('preflight_started', 'preflight', 'running'),
    runnerEvent('preflight_failed', 'preflight', 'failed', { code: 'CLAUDE_AUTH_REQUIRED' }),
    runnerEvent('runner_terminal', 'terminal', 'failed', { code: 'CLAUDE_AUTH_REQUIRED' })] });
  assert.equal(run.status, 'failed');
  assert.equal(provider(run, 'jev').calls.attempted, 0);
  assert.equal(provider(run, 'claude').calls.process_runs, 0);
  assert.ok(run.incidents.some(incident => incident.code === 'CLAUDE_AUTH_REQUIRED'));
});

test('stale heartbeat is writer uncertainty, not a claim of process death or goal failure', () => {
  const run = summarizeRun({ manifest: { ...paired, wall_timeout_seconds: 600 },
    heartbeat: { ...ids, recorded_at: '2026-10-09T01:00:00Z', phase: 'provider', pid: 333 },
    observedAt: '2026-10-09T01:00:16Z' });
  assert.equal(run.status, 'uncertain');
  assert.equal(run.execution.heartbeat.state, 'stale');
  assert.equal(run.execution.heartbeat.age_ms, 16000);
  assert.ok(run.incidents.some(incident => incident.code === 'RUNNER_HEARTBEAT_STALE'));
  assert.equal(run.evaluation.status, 'not_run');
  // An unrelated official rate can contain decimal digits 333. Inspect keys,
  // not arbitrary substrings, to verify the private process ID is omitted.
  function containsPid(value) {
    if (!value || typeof value !== 'object') return false;
    return Object.entries(value).some(([key, child]) => key === 'pid' || containsPid(child));
  }
  assert.equal(containsPid(run), false);
});

test('evaluator zero calls never establish candidate control provenance', () => {
  const run = summarizeRun({ result: { model_calls: 0, grading_status: 'completed', resolved: true, reward: 1,
    summary: { tests: 30, passed: 30 }, evaluates_run_id: 'run-generated', artifact_sha256: 'a'.repeat(64) } });
  assert.equal(run.kind, 'unknown');
  assert.equal(run.condition, 'unknown');
  assert.equal(run.evaluation.status, 'passed');
  assert.equal(run.evaluation.evaluates_run_id, 'run-generated');
  assert.equal(run.evaluation.artifact_sha256, 'a'.repeat(64));
});

test('paired monitor identifies its role and records no Jev inference without hiding Claude usage', () => {
  const run = summarizeRun({ manifest: { ...paired, mode: 'monitor', workload: 'monitoring', agent_role: 'monitor' },
    claudeEvents: [claudeFinal()] });
  assert.equal(run.group_id, 'pair-1');
  assert.equal(run.agent_role, 'monitor');
  assert.equal(run.condition, 'monitor');
  assert.equal(run.workload, 'monitoring');
  assert.equal(provider(run, 'jev').calls.attempted, 0);
  assert.equal(provider(run, 'claude').tokens.total.value, 100);
});

test('mismatched run-attempt records cannot contaminate usage or writer heartbeat', () => {
  const foreign = { ...ids, attempt_id: 'other-attempt' };
  const run = summarizeRun({ manifest: paired, decisions: [{ ...start('jev-1'), ...foreign }, { ...finish('jev-1'), ...foreign }],
    heartbeat: { ...foreign, recorded_at: '2026-10-09T01:00:09Z' }, observedAt: '2026-10-09T01:00:10Z' });
  assert.equal(provider(run, 'jev').calls.completed, 0);
  assert.equal(provider(run, 'jev').tokens.input.observed, null);
  assert.equal(run.execution.heartbeat.state, 'unknown');
  assert.ok(run.warnings.some(warning => warning.includes('다른 실행 식별자')));
});

test('incident codes are allowlisted and arbitrary raw uppercase text is not exposed', () => {
  const run = summarizeRun({ manifest: paired, decisions: [{ event: 'stopped', code: 'SECRET_TOKEN_SENTINEL' }],
    runnerEvents: [runnerEvent('preflight_failed', 'SECRET_TOKEN_SENTINEL', 'failed', { code: 'SECRET_TOKEN_SENTINEL', message: 'SECRET_TOKEN_SENTINEL' })] });
  assert.ok(!JSON.stringify(run).includes('SECRET_TOKEN_SENTINEL'));
  assert.equal(run.execution.gate_stop_code, 'UNKNOWN_FAILURE');
});

test('D-019 wrapper freeze uncertainty preserves journal-confirmed provider completion and totals', () => {
  const run = summarizeRun({ manifest: paired, result: { ...ids, runner_status: 'uncertain', runner_error_code: 'ARTIFACT_FREEZE_FAILED',
    process_exit: 0, outcome_uncertain: true, claude_is_error: false, artifact_frozen: false, cleanup: { stopped: false } },
  runnerEvents: [runnerEvent('provider_finished', 'provider', 'completed')], claudeEvents: [claudeFinal()] });
  assert.equal(run.status, 'uncertain');
  const claude = provider(run, 'claude');
  assert.equal(claude.calls.completed, 1);
  assert.equal(claude.calls.uncertain, 0);
  assert.equal(claude.tokens.total.value, 100);
});

test('explicit pre-dispatch Jev model lookup failure is zero POST attempts with provider incident', () => {
  const run = summarizeRun({ manifest: paired, decisions: [
    { event: 'input', mode: 'jev', decision_id: 1 },
    { event: 'model_lookup_failed', provider: 'jev', decision_id: 1, code: 'MODEL_LOOKUP_FAILED', status: 'failed' },
    { event: 'stopped', decision_id: 1, code: 'DECISION_FAILED', outcome_uncertain: false },
  ] });
  assert.equal(run.status, 'failed');
  assert.equal(provider(run, 'jev').calls.attempted, 0);
  assert.equal(provider(run, 'jev').calls.failed, 0);
  assert.ok(run.incidents.some(item => item.source === 'provider' && item.code === 'MODEL_LOOKUP_FAILED'));
});

test('recorded provider failure remains failed rather than inferred uncertainty from missing final JSON', () => {
  const run = summarizeRun({ manifest: paired, result: { ...ids, process_exit: 1, runner_status: 'failed',
    runner_error_code: 'PROVIDER_FAILED' }, runnerEvents: [runnerEvent('provider_started', 'provider', 'running'),
    runnerEvent('provider_finished', 'provider', 'failed', { code: 'PROVIDER_FAILED' })] });
  assert.equal(provider(run, 'claude').calls.failed, 1);
  assert.equal(provider(run, 'claude').calls.uncertain, 0);
  assert.equal(provider(run, 'claude').tokens.input.value, null);
});
