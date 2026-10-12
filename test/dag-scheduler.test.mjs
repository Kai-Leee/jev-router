import test from 'node:test';
import assert from 'node:assert/strict';
import {runDag} from '../src/orchestration/dag-scheduler.mjs';

function planFor(specs, maxConcurrency = 2) {
  const requirements = specs.filter(spec => spec.kind !== 'verification').map(spec => `req-${spec.id}`);
  const tasks = specs.map((spec, index) => ({
    id: spec.id, kind: spec.kind ?? 'implementation', parent_id: null,
    requirement_ids: spec.kind === 'verification' ? [...requirements] : [`req-${spec.id}`],
    input_artifact_ids: (spec.after ?? []).map(id => `artifact-${id}`),
    output_artifact_ids: spec.kind === 'verification' ? [] : [`artifact-${spec.id}`],
    check_ids: [`check-${spec.id}`], worker_id: spec.kind === 'verification' ? null : (spec.worker ?? `worker-${index}`),
    read_scope: spec.read ?? [], write_scope: spec.write ?? [`output/${spec.id}`],
    duration: {basis: spec.duration === undefined ? 'unknown' : 'estimate', estimate_ms: spec.duration ?? null,
      sample_count: 0, source_refs: []},
  }));
  const workerIds = [...new Set(tasks.map(task => task.worker_id).filter(id => id !== null))];
  return {
    schema_version: 'artifact-dag/v1', goal_revision: 'goal-v1', graph_revision: 'graph-v1',
    requirement_ids: requirements, worker_limit: 30, max_concurrency: maxConcurrency,
    workers: workerIds.map(id => ({id, profile_id: 'fixture-local'})), tasks,
    artifacts: tasks.flatMap(task => task.output_artifact_ids.map(id => ({id, producer_task_id: task.id}))),
    checks: tasks.map(task => ({id: task.check_ids[0], version: '1', phase: task.kind === 'verification' ? 'integration' : 'local',
      artifact_ids: [...task.input_artifact_ids, ...task.output_artifact_ids], requirement_ids: [...task.requirement_ids],
      runner_ref: 'fixture-assert', argv: ['node', 'fixture-check.mjs'], cwd: 'test',
      environment_ref: 'fixture-node', source_ref: 'test/dag-scheduler.test.mjs'})), unknown_relationships: [],
  };
}

const tick = () => new Promise(resolve => setImmediate(resolve));
function controlled() {
  const calls = [], work = new Map(), events = [];
  let time = 0;
  return {
    calls, events, clock: () => time, setTime: value => { time = value; },
    record: event => { events.push(event); },
    execute: (task, context) => {
      calls.push({id: task.id, at_ms: time, context});
      return new Promise((resolve, reject) => work.set(task.id, {resolve, reject}));
    },
    complete: (id, value = {status: 'completed'}) => work.get(id).resolve(value),
    reject: (id, error) => work.get(id).reject(error),
  };
}

test('short branch releases its successor while a longer independent task still runs', async () => {
  const plan = planFor([{id: 'long', duration: 50}, {id: 'short', duration: 2},
    {id: 'successor', after: ['short'], duration: 1, worker: 'worker-1'}]);
  const h = controlled();
  const result = runDag({plan, ...h});
  await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['long', 'short']);
  h.setTime(2); h.complete('short'); await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['long', 'short', 'successor']);
  assert.equal(h.calls[2].at_ms, 2);
  h.setTime(3); h.complete('successor'); await tick();
  h.setTime(50); h.complete('long');
  const outcome = await result;
  assert.equal(outcome.status, 'completed');
  assert.deepEqual(outcome.completed_ids, ['short', 'successor', 'long']);
  assert.ok(h.events.every((event, index) => !index || event.at_ms >= h.events[index - 1].at_ms));
});

test('ancestor read/write scopes lock but neighboring prefixes and independent work can overlap', async () => {
  const plan = planFor([{id: 'reader', read: ['src'], write: []}, {id: 'writer', write: ['src/file.js']},
    {id: 'independent', read: ['elsewhere'], write: []}, {id: 'prefix', write: ['src2/file.js']}], 3);
  const h = controlled(); const result = runDag({plan, ...h}); await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['reader', 'independent', 'prefix']);
  assert.ok(h.events.some(event => event.task_id === 'writer' && event.reason === 'resource' && event.resource_kind === 'scope'));
  h.complete('independent'); await tick();
  assert.equal(h.calls.length, 3);
  h.complete('reader'); await tick();
  assert.equal(h.calls[3].id, 'writer');
  h.complete('writer'); h.complete('prefix');
  assert.equal((await result).status, 'completed');
});

test('read/read overlap does not require an exclusive lock', async () => {
  const plan = planFor([{id: 'a', read: ['shared'], write: []}, {id: 'b', read: ['shared/file'], write: []}]);
  const h = controlled(); const result = runDag({plan, ...h}); await tick();
  assert.equal(h.calls.length, 2);
  h.complete('a'); h.complete('b');
  assert.equal((await result).status, 'completed');
});

test('same worker cannot run two independent tasks simultaneously', async () => {
  const plan = planFor([{id: 'a', worker: 'worker-shared'}, {id: 'b', worker: 'worker-shared'}, {id: 'c'}]);
  const h = controlled(); const result = runDag({plan, ...h}); await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['a', 'c']);
  assert.ok(h.events.some(event => event.task_id === 'b' && event.resource_kind === 'worker'));
  h.complete('a'); await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['a', 'c', 'b']);
  h.complete('b'); h.complete('c');
  assert.equal((await result).status, 'completed');
});

test('same write scopes serialize without introducing a semantic cycle', async () => {
  const plan = planFor([{id: 'consumer', after: ['producer'], write: ['shared/file']},
    {id: 'producer', write: ['shared/file']}, {id: 'other', write: ['shared']}]);
  const h = controlled(); const result = runDag({plan, ...h}); await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['producer']);
  h.complete('producer'); await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['producer', 'consumer']);
  h.complete('consumer'); await tick();
  assert.equal(h.calls[2].id, 'other');
  h.complete('other');
  assert.equal((await result).status, 'completed');
});

test('unknown relation blocks only involved tasks and their artifact dependents', async () => {
  const plan = planFor([{id: 'unknown-a'}, {id: 'unknown-b'}, {id: 'unknown-dependent', after: ['unknown-a']},
    {id: 'independent'}, {id: 'next', after: ['independent']}]);
  plan.unknown_relationships = [{task_ids: ['unknown-a', 'unknown-b'], reason: 'No dependency evidence', evidence_refs: []}];
  const h = controlled(); const result = runDag({plan, ...h}); await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['independent']);
  h.complete('independent'); await tick();
  assert.equal(h.calls[1].id, 'next'); h.complete('next');
  const outcome = await result;
  assert.equal(outcome.status, 'blocked');
  assert.deepEqual(outcome.completed_ids, ['independent', 'next']);
  assert.deepEqual(outcome.undispatched_ids, ['unknown-a', 'unknown-b', 'unknown-dependent']);
  assert.equal(h.events.filter(event => event.reason === 'unknown_relation').length, 2);
  assert.ok(h.events.some(event => event.task_id === 'unknown-dependent' && event.reason === 'dependency'));
});

test('failure stops dispatch and drains already running work without a retry', async () => {
  const plan = planFor([{id: 'a'}, {id: 'b'}, {id: 'next', after: ['b']}]);
  const h = controlled(); let settled = false;
  const result = runDag({plan, ...h}).then(value => { settled = true; return value; });
  await tick();
  h.reject('a', Object.assign(new Error('controlled failure'), {code: 'CONTROLLED_FAILURE'}));
  await tick();
  assert.equal(settled, false);
  assert.deepEqual(h.calls.map(call => call.id), ['a', 'b']);
  h.complete('b');
  const outcome = await result;
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.failure.code, 'CONTROLLED_FAILURE');
  assert.deepEqual(outcome.completed_ids, ['b']);
  assert.deepEqual(outcome.undispatched_ids, ['next']);
  assert.equal(h.calls.length, 2);
});

test('a settled failure cannot be overtaken by dispatch after another success', async () => {
  const plan = planFor([{id: 'a'}, {id: 'b'}, {id: 'next', after: ['a']}]);
  const called = [];
  const result = await runDag({plan, execute: async task => {
    called.push(task.id);
    if (task.id === 'b') throw Object.assign(new Error('failure'), {code: 'CONTROLLED_FAILURE'});
    return {status: 'completed'};
  }});
  assert.equal(result.status, 'failed');
  assert.deepEqual(called, ['a', 'b']);
  assert.deepEqual(result.undispatched_ids, ['next']);
});

test('resolved objects without explicit completed status do not release successors', async () => {
  const plan = planFor([{id: 'a'}, {id: 'next', after: ['a']}]);
  const called = [];
  const result = await runDag({plan, execute: async task => { called.push(task.id); return {passed: true}; }});
  assert.equal(result.status, 'failed');
  assert.equal(result.results.a.code, 'DAG_TASK_NOT_COMPLETED');
  assert.deepEqual(called, ['a']);
  assert.deepEqual(result.undispatched_ids, ['next']);
});

test('uncertain external outcome is failed, retained, and never retried in a run', async () => {
  const plan = planFor([{id: 'a'}, {id: 'next', after: ['a']}]);
  let calls = 0;
  const result = await runDag({plan, execute: async () => {
    calls++; return {status: 'completed', outcome_uncertain: true, code: 'EXTERNAL_UNCERTAIN'};
  }});
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.outcome_uncertain, true);
  assert.equal(result.failure.code, 'EXTERNAL_UNCERTAIN');
  assert.equal(calls, 1);
  assert.deepEqual(result.completed_ids, []);
});

test('blocked events record exclusive dependency then resource waits before dispatch', async () => {
  const plan = planFor([{id: 'a'}, {id: 'holder', write: ['shared']},
    {id: 'next', after: ['a'], read: ['shared/file']}]);
  const h = controlled(); const result = runDag({plan, ...h}); await tick();
  h.setTime(1); h.complete('a'); await tick();
  assert.deepEqual(h.events.filter(event => event.task_id === 'next' && event.event === 'dag_task_blocked')
    .map(event => event.reason), ['dependency', 'resource']);
  h.setTime(2); h.complete('holder'); await tick();
  h.setTime(3); h.complete('next');
  assert.equal((await result).status, 'completed');
});

test('verification tasks consume slots while requiring no worker', async () => {
  const plan = planFor([{id: 'a'}, {id: 'verify', kind: 'verification', after: ['a']}, {id: 'b'}, {id: 'c'}], 1);
  const h = controlled(); const result = runDag({plan, ...h}); await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['a']);
  h.complete('a'); await tick();
  assert.deepEqual(h.calls.map(call => call.id), ['a', 'verify']);
  assert.equal(h.calls[1].context.plan.tasks[1].worker_id, null);
  assert.ok(h.events.some(event => event.task_id === 'b' && event.reason === 'slot'));
  h.complete('verify'); await tick(); h.complete('b'); await tick(); h.complete('c');
  assert.equal((await result).status, 'completed');
});

test('more than 30 task roots use a bounded worker pool and scheduling slots', async () => {
  const plan = planFor(Array.from({length: 37}, (_, index) => ({id: `task-${index}`, worker: `worker-${index % 2}`})));
  plan.worker_limit = 2;
  let active = 0, peak = 0;
  const result = await runDag({plan, execute: async () => {
    active++; peak = Math.max(peak, active);
    await tick(); active--; return {status: 'completed'};
  }});
  assert.equal(result.status, 'completed');
  assert.equal(result.completed_ids.length, 37);
  assert.equal(peak, 2);
});

test('non-monotonic clock stops admission and drains without emitting backward timestamps', async () => {
  const plan = planFor([{id: 'a'}, {id: 'b'}, {id: 'next', after: ['b']}]);
  const h = controlled(); h.setTime(10);
  const result = runDag({plan, ...h}); await tick();
  h.setTime(9); h.complete('a'); await tick();
  h.setTime(11); h.complete('b');
  const outcome = await result;
  assert.equal(outcome.status, 'failed');
  assert.equal(outcome.failure.code, 'DAG_CLOCK_NOT_MONOTONIC');
  assert.equal(h.calls.length, 2);
  assert.ok(h.events.every((event, index) => !index || event.at_ms >= h.events[index - 1].at_ms));
});

test('invalid configuration and cyclic plans fail before execution', async () => {
  const plan = planFor([{id: 'a'}]); let calls = 0;
  const execute = async () => { calls++; return {status: 'completed'}; };
  await assert.rejects(runDag({plan, execute, maxConcurrency: 0}), {code: 'DAG_INVALID_SCHEDULER'});
  await assert.rejects(runDag({plan, execute, maxConcurrency: 31}), {code: 'DAG_INVALID_SCHEDULER'});
  await assert.rejects(runDag({plan, execute, clock: () => NaN}), {code: 'DAG_INVALID_CLOCK'});
  await assert.rejects(runDag({plan: planFor([{id: 'a', after: ['b']}, {id: 'b', after: ['a']}]), execute}), {code: 'DAG_CYCLE'});
  assert.equal(calls, 0);
});

test('callback mutation cannot alter scheduler plan, caller state, or later task inputs', async () => {
  const plan = planFor([{id: 'a'}, {id: 'next', after: ['a']}]);
  const before = structuredClone(plan), contexts = [];
  const result = await runDag({plan, clock: {now: () => 0}, execute: async (task, context) => {
    contexts.push(structuredClone(context));
    task.id = 'changed'; context.plan.tasks.length = 0;
    return {status: 'completed'};
  }});
  assert.deepEqual(plan, before);
  assert.equal(contexts[1].plan.tasks.length, 2);
  assert.equal(result.status, 'completed');
  const attempts = Object.values(result.results).map(value => value.attempt_id);
  assert.equal(new Set(attempts).size, 2);
  assert.ok(attempts.every(id => !plan.tasks.some(task => task.id === id || task.worker_id === id)));
  assert.ok(attempts.every((id, index) => id === contexts[index].attempt_id));
});

test('record failure before dispatch never executes the affected callback', async () => {
  const plan = planFor([{id: 'a'}]); let calls = 0;
  const result = await runDag({plan, record: async () => { throw new Error('journal unavailable'); },
    execute: async () => { calls++; return {status: 'completed'}; }});
  assert.equal(calls, 0);
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.code, 'DAG_RECORD_FAILED');
});
