import test from 'node:test';
import assert from 'node:assert/strict';
import { createDecisionGate } from '../src/benchmark/decision-gate.mjs';
import { prepareDecision } from '../src/client.mjs';

const input = () => ({
  purpose: 'Choose the next verification action.',
  state: { goal: 'Implement the requested service.', evidence: ['The source has been written.'] },
  candidates: [
    { id: 'unit-test', description: 'Run the unit tests.', command: 'npm test' },
    { id: 'inspect', description: 'Inspect the source files.', command: 'ls src' },
  ],
});
const finishInput = () => ({ purpose: 'Decide whether the implementation is ready for independent evaluation.', state: 'Unit tests passed.' });
function response(request, choice = 'inspect') {
  const kind = Object.keys(request.questions)[0];
  const ids = Object.keys(request.questions[kind].criteria);
  return {
    model: 'jev-fixture',
    answers: { [kind]: { type: 'choice', choice, probabilities: Object.fromEntries(ids.map((id) => [id, id === choice ? 1 : 0])), confidence: 1 } },
    usage: { input_tokens: 100, output_tokens: 10 },
    billing: { runId: 'fixture-run', mode: 'tokens', paidInputTokensUsed: '100' },
    receipt: { method: 'POST', destination: 'https://jev-ai.pro/api/v1/systemone', status: 200, durationMs: 10, automaticRetries: 0 },
  };
}
function fixture(overrides = {}) {
  const records = [];
  const requests = [];
  const commands = [];
  const gate = createDecisionGate({
    mode: 'jev', maxDecisions: 10,
    decide: async (request) => { requests.push(request); return response(request); },
    execute: async (command) => { commands.push(command); return { exit_code: 0, stdout: 'done', stderr: '' }; },
    record: async (event) => { records.push(event); },
    ...overrides,
  });
  return { gate, records, requests, commands };
}

test('selected command is bound to the decision and its receipt is persisted before execution', async () => {
  const events = [];
  const fx = fixture({
    record: async (event) => events.push(event),
    execute: async (command) => {
      assert.deepEqual(events.map(({ event }) => event), ['input', 'decision', 'action_started']);
      assert.equal(command, 'ls src');
      assert.equal(events[1].decision.billing.runId, 'fixture-run');
      assert.equal(events[1].decision.usage.cost, null);
      assert.equal(events[1].decision.receipt.status, 200);
      return { exit_code: 0, stdout: 'file.mjs' };
    },
  });
  const result = await fx.gate.act(input());
  assert.deepEqual(result.action, { id: 'inspect', command: 'ls src' });
  assert.equal(result.choice, 'inspect');
  assert.equal(result.decision_id, 1);
  assert.equal(result.evaluator_success, null);
  assert.equal(fx.requests.length, 1);
  const request = fx.requests[0];
  assert.equal(prepareDecision(request).body.model, 'jev-latest');
  assert.match(request.questions.action.criteria.inspect, /Inspect the source files/);
  assert.match(request.questions.action.criteria.inspect, /ls src/);
  assert.ok(request.questions.action.criteria.abstain);
  assert.equal(events[3].event, 'outcome');
});

test('abstain executes no command and is not evaluator success', async () => {
  const fx = fixture({ decide: async (request) => response(request, 'abstain') });
  const result = await fx.gate.act(input());
  assert.equal(result.choice, 'abstain');
  assert.equal(result.action, null);
  assert.equal(result.outcome, null);
  assert.equal(result.completion_claimed, false);
  assert.deepEqual(fx.commands, []);
  assert.equal(fx.gate.status().state, 'ready');
});

for (const [label, corrupt] of [
  ['missing abstain', (answer) => { delete answer.probabilities.abstain; }],
  ['unknown probability key', (answer) => { delete answer.probabilities.abstain; answer.probabilities.unknown = 0; }],
  ['out of range', (answer) => { answer.probabilities.inspect = 1.1; }],
  ['wrong sum', (answer) => { answer.probabilities.inspect = 0.7; }],
  ['nonfinite probability', (answer) => { answer.probabilities.inspect = NaN; }],
  ['unoffered choice', (answer) => { answer.choice = 'malicious'; }],
]) {
  test(`invalid decision (${label}) stops before execution and no later request is sent`, async () => {
    let calls = 0;
    const fx = fixture({ decide: async (request) => {
      calls++;
      const result = response(request);
      corrupt(result.answers.action);
      return result;
    } });
    await assert.rejects(fx.gate.act(input()), { code: 'INVALID_DECISION' });
    await assert.rejects(fx.gate.act(input()), { code: 'GATE_STOPPED' });
    assert.equal(calls, 1);
    assert.deepEqual(fx.commands, []);
    assert.equal(fx.gate.status().decisions_used, 1);
    assert.equal(fx.records.at(-2).event, 'stopped');
    assert.equal(fx.records.at(-1).event, 'rejected');
  });
}

test('request failure consumes budget, stops queued work, and never leaks callback errors', async () => {
  const secret = 'unit-test-secret-must-not-be-logged';
  let calls = 0;
  const fx = fixture({ decide: async () => { calls++; throw new Error(secret); } });
  const attempts = await Promise.allSettled([fx.gate.act(input()), fx.gate.act(input()), fx.gate.finish(finishInput())]);
  assert.deepEqual(attempts.map(({ reason }) => reason.code), ['DECISION_FAILED', 'GATE_STOPPED', 'GATE_STOPPED']);
  assert.equal(calls, 1);
  assert.equal(fx.gate.status().decisions_used, 1);
  for (const { reason } of attempts) assert.equal(String(reason.stack).includes(secret), false);
  assert.equal(JSON.stringify(fx.records).includes(secret), false);
  assert.equal(JSON.stringify(fx.gate.status()).includes(secret), false);
});

test('explicitly uncertain paid response and unexpected replay receipts never execute', async () => {
  for (const corrupt of [
    (result) => { result.outcomeUncertain = true; },
    (result) => { result.receipt.outcome_uncertain = true; },
    (result) => { result.receipt.automaticRetries = 1; },
  ]) {
    const fx = fixture({ decide: async (request) => {
      const result = response(request);
      corrupt(result);
      return result;
    } });
    await assert.rejects(fx.gate.act(input()), { code: 'INVALID_DECISION' });
    assert.deepEqual(fx.commands, []);
  }
});

test('observed cost is preserved and absent provider metadata stays absent', async () => {
  const fx = fixture({ decide: async (request) => {
    const result = response(request);
    result.usage.cost = 0.003;
    delete result.billing;
    delete result.receipt;
    return result;
  } });
  await fx.gate.act(input());
  const { decision } = fx.records.find(({ event }) => event === 'decision');
  assert.equal(decision.usage.cost, 0.003);
  assert.equal(decision.billing, null);
  assert.equal(decision.receipt, null);
});

test('simultaneous requests serialize callbacks and cannot exceed the decision budget', async () => {
  let active = 0;
  let maximumActive = 0;
  let paidCalls = 0;
  const fx = fixture({ maxDecisions: 2, decide: async (request) => {
    active++;
    maximumActive = Math.max(maximumActive, active);
    paidCalls++;
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    return response(request);
  } });
  const results = await Promise.allSettled([fx.gate.act(input()), fx.gate.act(input()), fx.gate.act(input()), fx.gate.act(input())]);
  assert.equal(maximumActive, 1);
  assert.equal(paidCalls, 2);
  assert.deepEqual(results.slice(0, 2).map(({ value }) => value.decision_id), [1, 2]);
  assert.equal(results[2].reason.code, 'BUDGET_EXHAUSTED');
  assert.equal(results[3].reason.code, 'GATE_STOPPED');
  assert.equal(fx.gate.status().decisions_remaining, 0);
  assert.equal(fx.commands.length, 2);
});

for (const stage of ['input', 'decision', 'action_started', 'outcome']) {
  test(`record failure at ${stage} prevents further work`, async () => {
    let paidCalls = 0;
    let executions = 0;
    const fx = fixture({
      decide: async (request) => { paidCalls++; return response(request); },
      execute: async () => { executions++; return { exit_code: 0 }; },
      record: async ({ event }) => { if (event === stage) throw new Error('secret record failure'); },
    });
    await assert.rejects(fx.gate.act(input()), { code: 'RECORD_FAILED' });
    await assert.rejects(fx.gate.act(input()), { code: 'GATE_STOPPED' });
    assert.equal(paidCalls, stage === 'input' ? 0 : 1);
    assert.equal(executions, stage === 'outcome' ? 1 : 0);
    assert.equal(fx.gate.status().stop_code, 'RECORD_FAILED');
    assert.equal(fx.gate.status().decisions_used, 1);
  });
}

test('finish continue/abstain do not complete; finish blocks already-queued actions', async () => {
  const choices = ['continue', 'abstain', 'finish'];
  const fx = fixture({ decide: async (request) => response(request, choices.shift()) });
  const continued = await fx.gate.finish(finishInput());
  assert.equal(continued.completion_claimed, false);
  assert.equal(fx.gate.status().state, 'ready');
  const abstained = await fx.gate.finish(finishInput());
  assert.equal(abstained.choice, 'abstain');
  assert.equal(abstained.completion_claimed, false);
  const [finished, blocked] = await Promise.allSettled([fx.gate.finish(finishInput()), fx.gate.act(input())]);
  assert.equal(finished.value.completion_claimed, true);
  assert.equal(finished.value.evaluator_success, null);
  assert.equal(blocked.reason.code, 'GATE_COMPLETED');
  assert.deepEqual(fx.commands, []);
  assert.equal(fx.gate.status().state, 'completed');
  assert.equal(fx.gate.status().decisions_used, 3);
});

test('baseline binds selected_id, never invokes paid decision, and records an unverified completion', async () => {
  let calls = 0;
  const fx = fixture({ mode: 'baseline', decide: async () => { calls++; throw new Error('must not call'); } });
  await assert.rejects(fx.gate.act(input()), { code: 'INVALID_INPUT' });
  await assert.rejects(fx.gate.act({ ...input(), selected_id: 'absent' }), { code: 'INVALID_INPUT' });
  const action = await fx.gate.act({ ...input(), selected_id: 'unit-test' });
  const finish = await fx.gate.finish(finishInput());
  assert.equal(action.action.command, 'npm test');
  assert.deepEqual(fx.commands, ['npm test']);
  assert.equal(calls, 0);
  assert.equal(fx.records.find(({ event }) => event === 'decision').decision, null);
  assert.equal(finish.completion_claimed, true);
  assert.equal(finish.evaluator_success, null);
  await assert.rejects(fx.gate.finish(finishInput()), { code: 'GATE_COMPLETED' });
});

test('invalid inputs record safe rejection without consuming decisions or invoking providers', async () => {
  const fx = fixture();
  const duplicate = input(); duplicate.candidates[1].id = duplicate.candidates[0].id;
  const reserved = input(); reserved.candidates[1].id = 'abstain';
  const malicious = input(); malicious.candidates[1].id = '__proto__';
  const empty = input(); empty.candidates[1].command = '   ';
  const long = input(); long.candidates[1].command = 'x'.repeat(16385);
  const invalids = [null, {}, { ...input(), purpose: '다음 행동 결정' }, { ...input(), state: '' },
    { ...input(), purpose: '123' }, { ...input(), selected_id: 'inspect' }, duplicate, reserved, malicious, empty, long,
    { ...input(), candidates: [input().candidates[0]] }, { ...input(), state: { value: undefined } },
    { ...input(), state: { privateKey: () => 'no' } }, { ...input(), state: 'x'.repeat(65537) }];
  for (const value of invalids) await assert.rejects(fx.gate.act(value), { code: 'INVALID_INPUT' });
  assert.equal(fx.gate.status().decisions_used, 0);
  assert.deepEqual(fx.commands, []);
  assert.deepEqual(fx.requests, []);
  assert.equal(fx.records.length, invalids.length);
  assert.ok(fx.records.every(event => event.event === 'rejected' && event.code === 'INVALID_INPUT'
    && event.decision_id === null && event.recovery_allowed === true && !Object.hasOwn(event, 'input')));
  assert.equal(fx.gate.status().rejections, invalids.length);
});

test('input and recording callback mutations cannot alter the bound command', async () => {
  const value = input();
  const fx = fixture({ record: async (event) => {
    if (event.input) event.input.candidates[1].command = 'bad-from-record';
    if (event.action) event.action.command = 'bad-from-record';
    if (event.request) event.request.questions.action.criteria.inspect = 'bad-from-record';
  } });
  const pending = fx.gate.act(value);
  value.candidates[1].command = 'bad-from-caller';
  const result = await pending;
  assert.equal(result.action.command, 'ls src');
  assert.deepEqual(fx.commands, ['ls src']);
  assert.match(fx.requests[0].questions.action.criteria.inspect, /ls src/);
});

for (const [label, execute] of [
  ['throw', async () => { throw new Error('secret process information'); }],
  ['explicit uncertainty', async () => ({ exit_code: 0, outcome_uncertain: true })],
  ['timeout', async () => ({ exit_code: 124, timed_out: true })],
  ['signal', async () => ({ exit_code: 137, signal: 'SIGKILL' })],
  ['missing exit observation', async () => ({ stdout: 'possibly done' })],
]) {
  test(`uncertain command ${label} stops without replay`, async () => {
    let calls = 0;
    const fx = fixture({ execute: async (...args) => { calls++; return execute(...args); } });
    await assert.rejects(fx.gate.act(input()), { code: 'EXECUTION_UNCERTAIN' });
    await assert.rejects(fx.gate.act(input()), { code: 'GATE_STOPPED' });
    assert.equal(calls, 1);
    assert.equal(fx.requests.length, 1);
    assert.equal(JSON.stringify(fx.records).includes('secret process information'), false);
  });
}

test('an observed nonzero exit remains recorded and permits another bounded action', async () => {
  const fx = fixture({ execute: async () => ({ exit_code: 1, stderr: 'Test failed.' }) });
  assert.equal((await fx.gate.act(input())).outcome.exit_code, 1);
  assert.equal((await fx.gate.act(input())).decision_id, 2);
  assert.equal(fx.gate.status().actions_executed, 2);
});

test('status contains only bounded control values and is detached from internal state', async () => {
  const fx = fixture();
  await fx.gate.act(input());
  const current = fx.gate.status();
  assert.deepEqual(current, {
    mode: 'jev', state: 'ready', max_decisions: 10, decisions_used: 1, decisions_remaining: 9,
    actions_executed: 1, stop_code: null, completion_claimed: false, evaluator_success: null,
    last_event: 'outcome', last_code: null, last_decision_id: 1, last_exit_code: 0,
    rejections: 0, journal_healthy: true, state_recording_failed: false, outcome_uncertain: false, recovery_allowed: true,
  });
  current.decisions_used = -1;
  assert.equal(fx.gate.status().decisions_used, 1);
  assert.equal(JSON.stringify(current).includes('ls src'), false);
});

test('explicit null removes the count ceiling while missing limits still reject', async () => {
  const fx = fixture({ mode: 'baseline', maxDecisions: null });
  for (let index = 0; index < 12; index++) await fx.gate.act({ ...input(), selected_id: 'inspect' });
  assert.equal(fx.gate.status().max_decisions, null);
  assert.equal(fx.gate.status().decisions_remaining, null);
  assert.equal(fx.gate.status().decisions_used, 12);
  assert.equal(fx.gate.status().state, 'ready');
  assert.throws(() => fixture({ maxDecisions: undefined }), { code: 'INVALID_CONFIG' });
});

test('budget exhaustion has a durable stop record and later rejection retains the root cause', async () => {
  const states = [];
  const fx = fixture({ maxDecisions: 1, recordState: async state => states.push(state) });
  await fx.gate.act(input());
  await assert.rejects(fx.gate.act(input()), { code: 'BUDGET_EXHAUSTED' });
  assert.equal(fx.records.at(-1).event, 'stopped');
  assert.equal(fx.records.at(-1).code, 'BUDGET_EXHAUSTED');
  assert.equal(fx.records.at(-1).decision_id, null);
  assert.equal(fx.records.at(-1).last_decision_id, 1);
  assert.equal(states.at(-1).state, 'stopped');
  assert.equal(states.at(-1).outcome_uncertain, false);
  await assert.rejects(fx.gate.act(input()), { code: 'GATE_STOPPED' });
  assert.equal(states.at(-1).stop_code, 'BUDGET_EXHAUSTED');
  assert.equal(states.at(-1).last_code, 'GATE_STOPPED');
});

test('journal failure persists an independent safe state and never retries the journal', async () => {
  const states = [];
  let writes = 0;
  const fx = fixture({ record: async () => { writes++; throw new Error('SECRET_DISK_DETAIL'); },
    recordState: async state => states.push(state) });
  await assert.rejects(fx.gate.act(input()), { code: 'RECORD_FAILED' });
  assert.equal(states.at(-1).stop_code, 'RECORD_FAILED');
  assert.equal(states.at(-1).journal_healthy, false);
  assert.equal(states.at(-1).outcome_uncertain, true);
  assert.equal(JSON.stringify(states).includes('SECRET_DISK_DETAIL'), false);
  assert.equal(JSON.stringify(states).includes('npm test'), false);
  await assert.rejects(fx.gate.act(input()), { code: 'GATE_STOPPED' });
  assert.equal(writes, 1);
  assert.equal(fx.commands.length, 0);
  assert.equal(fx.requests.length, 0);
});

test('fallback state writer failure stops before execution and is recorded in the healthy journal', async () => {
  const fx = fixture({ recordState: async () => { throw new Error('SECRET_STATE_WRITER'); } });
  await assert.rejects(fx.gate.act(input()), { code: 'STATE_RECORD_FAILED' });
  assert.equal(fx.gate.status().state_recording_failed, true);
  assert.equal(fx.records.at(-1).code, 'STATE_RECORD_FAILED');
  assert.equal(fx.gate.status().state, 'stopped');
  assert.deepEqual(fx.commands, []);
  assert.deepEqual(fx.requests, []);
  assert.equal(JSON.stringify(fx.records).includes('SECRET_STATE_WRITER'), false);
});

test('both writer failures remain observable in memory and never allow new work', async () => {
  const fx = fixture({ record: async () => { throw new Error('primary'); }, recordState: async () => { throw new Error('secondary'); } });
  await assert.rejects(fx.gate.act(input()), { code: 'RECORD_FAILED' });
  assert.equal(fx.gate.status().journal_healthy, false);
  assert.equal(fx.gate.status().state_recording_failed, true);
  assert.equal(fx.gate.status().stop_code, 'RECORD_FAILED');
  await assert.rejects(fx.gate.act(input()));
  assert.deepEqual(fx.commands, []);
  assert.deepEqual(fx.requests, []);
});

test('gate supplies stable run IDs and decision ID without leaking raw input into state', async () => {
  const identifiers = { run_id: 'run-1', attempt_id: 'attempt-1', group_id: 'pair-1', agent_role: 'implementation' };
  const contexts = [];
  const states = [];
  const fx = fixture({ identifiers, recordState: async state => states.push(state),
    decide: async (request, context) => { contexts.push(context); return response(request); } });
  await fx.gate.act(input());
  assert.deepEqual(contexts[0], { ...identifiers, mode: 'jev', kind: 'action', decision_id: 1 });
  assert.ok(fx.records.every(event => event.run_id === identifiers.run_id && event.attempt_id === identifiers.attempt_id));
  assert.equal(states.at(-1).group_id, 'pair-1');
  assert.equal(states.at(-1).last_decision_id, 1);
  assert.equal(states.at(-1).last_exit_code, 0);
  assert.equal(states.at(-1).recovery_allowed, true);
  assert.equal(JSON.stringify(states).includes('ls src'), false);
});

test('observed tool failure exposes recovery and exact exit without stopping the gate', async () => {
  const fx = fixture({ execute: async () => ({ exit_code: 7 }) });
  await fx.gate.act(input());
  assert.equal(fx.records.at(-1).status, 'failed');
  assert.equal(fx.records.at(-1).exit_code, 7);
  assert.equal(fx.records.at(-1).recovery_allowed, true);
  assert.equal(fx.gate.status().state, 'ready');
  assert.equal(fx.gate.status().last_exit_code, 7);
});

test('invalid configuration uses a non-secret stable code', () => {
  for (const config of [null, [], {}, { mode: 'other' }, { mode: 'jev', maxDecisions: 0 }, { mode: 'jev', maxDecisions: Infinity },
    { mode: 'jev', maxDecisions: 10001 }, { mode: 'jev', maxDecisions: 1, execute() {}, record() {} }]) {
    assert.throws(() => createDecisionGate(config), { code: 'INVALID_CONFIG' });
  }
});
