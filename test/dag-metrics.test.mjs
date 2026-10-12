import test from 'node:test';
import assert from 'node:assert/strict';
import { projectDagEvents } from '../src/dashboard/dag-metrics.mjs';
import { renderDagView } from '../src/dashboard/dag-view.mjs';

function analysis(ids = ['build', 'verify'], { unknown = false } = {}) {
  return {
    topological_order: ids, priority_order: [...ids],
    predecessors: Object.fromEntries(ids.map((id, index) => [id, index ? [ids[index - 1]] : []])),
    successors: Object.fromEntries(ids.map((id, index) => [id, index + 1 < ids.length ? [ids[index + 1]] : []])),
    critical_path_ms: unknown ? null : ids.length * 20,
    earliest_start_ms: Object.fromEntries(ids.map((id, index) => [id, unknown ? null : index * 20])),
    earliest_finish_ms: Object.fromEntries(ids.map((id, index) => [id, unknown ? null : (index + 1) * 20])),
    remaining_path_ms: Object.fromEntries(ids.map((id, index) => [id, unknown ? null : (ids.length - index) * 20])),
    unknown_duration_ids: unknown ? [...ids] : [],
  };
}

function event(eventId, at, type, payload = {}, group = {}) {
  return { run_id: 'run-a', graph_revision: 'graph-1', event_id: eventId, at_ms: at, event: type, ...payload, ...group };
}

function task(eventId, at, type, taskId = 'build', payload = {}, group = {}) {
  return event(eventId, at, type, { task_id: taskId, attempt_id: `attempt-${taskId}`, ...payload }, group);
}

function check(eventId, at, type, payload = {}) {
  return task(eventId, at, type, 'build', {
    check_id: 'build-local', check_version: 'v1', phase: 'local', environment_ref: 'fixture-node', artifact_revisions: { source: 'hash-1' }, ...payload,
  });
}

function completedEvents() {
  return [
    event('plan', 100, 'dag_plan_analyzed', { analysis: analysis() }),
    event('wait-dependency', 101, 'dag_task_blocked', { task_id: 'verify', reason: 'dependency', blocking_task_ids: ['build'] }),
    task('build-start', 102, 'dag_task_started'),
    check('check-start', 110, 'dag_check_started'),
    check('check-end', 125, 'dag_check_completed', { status: 'passed', outcome_uncertain: false, assertions: 3, skipped: 0 }),
    task('build-end', 130, 'dag_task_completed', 'build', { status: 'completed' }),
    task('verify-start', 130, 'dag_task_started', 'verify', { kind: 'verification', worker_id: null }),
    task('verify-end', 160, 'dag_task_completed', 'verify', { status: 'completed' }),
    event('run-end', 165, 'dag_run_completed', { status: 'completed', completed_ids: ['build', 'verify'], undispatched_ids: [] }),
  ];
}

const throwsCode = (callback, code) => assert.throws(callback, (error) => error.code === code);

test('empty projection invents no run, usage, or successful duration', () => {
  assert.deepEqual(projectDagEvents([]), { schema_version: 'dag-event-projection/v1', event_count: 0, duplicate_count: 0, runs: [] });
  assert.match(renderDagView(projectDagEvents([])), /Completion, duration, usage, and cost are unknown/);
});

test('measured completion, estimate, task span and verification wait have separate boundaries', () => {
  const events = completedEvents();
  const original = structuredClone(events);
  const projection = projectDagEvents(events);
  assert.deepEqual(events, original);
  const run = projection.runs[0];
  assert.equal(run.status, 'completed');
  assert.equal(run.estimated_critical_path_ms, 40);
  assert.equal(run.measured_completion_ms, 65);
  assert.equal(run.observed_span_ms, 65);
  assert.equal(run.preparation_observed, false);
  assert.equal(run.completion_boundary, 'dag_plan_analyzed_to_dag_run_completed');
  assert.equal(run.peak_concurrency, 1);
  assert.equal(run.tasks[0].attempts[0].duration_ms, 28);
  assert.equal(run.tasks[1].attempts[0].duration_ms, 30);
  assert.equal(run.wait_times.check.observed_ms, 15);
  assert.equal(run.wait_times.dependency.observed_ms, 29);
  assert.deepEqual(run.usage, { input_tokens: null, output_tokens: null, total_tokens: null, cost_usd: null, source: 'not_observed' });
  assert.deepEqual(run.counts, { pending: 0, blocked: 0, running: 0, completed: 2, failed: 0 });
  // Returned analysis-derived collections are not aliases of caller-owned objects.
  run.tasks[1].predecessors.push('changed');
  assert.deepEqual(events, original);
});

test('exact duplicates deduplicate by run and event ID, regardless of property insertion order', () => {
  const events = completedEvents();
  const duplicate = Object.fromEntries(Object.entries(events[0]).reverse());
  const projection = projectDagEvents([...events, duplicate, events.at(-1)]);
  assert.equal(projection.event_count, events.length);
  assert.equal(projection.duplicate_count, 2);
  assert.equal(projection.runs[0].duplicate_count, 2);
  assert.equal(projection.runs[0].measured_completion_ms, 65);
});

test('conflicting duplicate event content or graph revision is rejected', () => {
  const first = task('one', 10, 'dag_task_started');
  for (const changed of [{ at_ms: 11 }, { graph_revision: 'graph-2' }, { task_id: 'verify' }]) {
    throwsCode(() => projectDagEvents([first, { ...first, ...changed }]), 'DAG_EVENT_DUPLICATE_CONFLICT');
  }
});

test('same event and attempt IDs in separate runs are independent and deterministic', () => {
  const a = [task('start', 100, 'dag_task_started'), task('end', 120, 'dag_task_completed')];
  const b = a.map((row) => ({ ...row, run_id: 'run-b', at_ms: row.at_ms - 100 }));
  const one = projectDagEvents([a[0], b[0], b[1], a[1]]);
  const two = projectDagEvents([...b, ...a]);
  assert.deepEqual(one, two);
  assert.equal(one.runs.length, 2);
  assert.equal(one.runs[0].tasks[0].attempts[0].duration_ms, 20);
  assert.equal(one.runs[1].tasks[0].attempts[0].duration_ms, 20);
  assert.equal(one.runs[0].measured_completion_ms, null);
});

test('revisions within a run are segregated without sharing task state', () => {
  const first = task('g1-start', 100, 'dag_task_started');
  const second = task('g2-start', 1, 'dag_task_started', 'build', {}, { graph_revision: 'graph-2' });
  const projection = projectDagEvents([first, second]);
  assert.equal(projection.runs.length, 2);
  assert.equal(projection.runs[0].tasks[0].attempts[0].started_at_ms, 100);
  assert.equal(projection.runs[1].tasks[0].attempts[0].started_at_ms, 1);
});

test('cross-run and cross-revision completion cannot consume another start', () => {
  const start = task('start', 10, 'dag_task_started');
  for (const group of [{ run_id: 'run-b' }, { graph_revision: 'graph-2' }]) {
    const end = task('end', 20, 'dag_task_completed', 'build', {}, group);
    throwsCode(() => projectDagEvents([start, end]), 'DAG_EVENT_ORDER');
  }
});

test('invalid envelope identifiers, event names, times, and non-JSON payloads fail closed', () => {
  for (const patch of [{ run_id: '' }, { graph_revision: null }, { event_id: 1 }, { task_id: ' ' },
    { attempt_id: null }, { at_ms: NaN }, { at_ms: -1 }, { at_ms: '1' }, { at_ms: Infinity },
    { event: 'inference_finished' }, { metadata: undefined }, { metadata: new Date() }]) {
    throwsCode(() => projectDagEvents([{ ...task('start', 0, 'dag_task_started'), ...patch }]), 'DAG_EVENT_INVALID');
  }
  throwsCode(() => projectDagEvents(null), 'DAG_EVENT_INVALID');
});

test('chronology and lifecycle order are checked instead of silently sorting the trace', () => {
  const start = task('start', 10, 'dag_task_started');
  const end = task('end', 20, 'dag_task_completed');
  for (const rows of [[end, start], [start, { ...end, at_ms: 9 }], [start, { ...end, attempt_id: 'other' }],
    [start, { ...start, event_id: 'start-again' }], [start, end, { ...end, event_id: 'end-again' }]]) {
    throwsCode(() => projectDagEvents(rows), 'DAG_EVENT_ORDER');
  }
  const terminal = event('run-end', 21, 'dag_run_completed', { status: 'completed' });
  throwsCode(() => projectDagEvents([start, end, terminal, event('later', 22, 'dag_task_blocked', { task_id: 'other', reason: 'slot' })]), 'DAG_EVENT_ORDER');
});

test('failed and blocked runs preserve stop spans but never successful completion', () => {
  const rows = [event('plan', 0, 'dag_plan_analyzed', { analysis: analysis(['build']) }),
    task('start', 10, 'dag_task_started'), task('failure', 50, 'dag_task_failed', 'build', { status: 'failed', outcome_uncertain: true }),
    event('end', 55, 'dag_run_completed', { status: 'failed', completed_ids: [], undispatched_ids: [] })];
  const run = projectDagEvents(rows).runs[0];
  assert.equal(run.status, 'failed');
  assert.equal(run.measured_completion_ms, null);
  assert.equal(run.observed_span_ms, 55);
  assert.equal(run.tasks[0].attempts[0].duration_ms, 40);
  assert.equal(run.tasks[0].attempts[0].outcome_uncertain, true);
  throwsCode(() => projectDagEvents([...rows.slice(0, -1), { ...rows.at(-1), status: 'completed' }]), 'DAG_EVENT_ORDER');
  const blocked = projectDagEvents([event('blocked', 10, 'dag_task_blocked', { task_id: 'build', reason: 'unknown_relation' }),
    event('end', 15, 'dag_run_completed', { status: 'blocked', completed_ids: [], undispatched_ids: ['build'] })]).runs[0];
  assert.equal(blocked.measured_completion_ms, null);
  assert.equal(blocked.wait_times.unknown_relation.censored_intervals, 1);
});

test('terminal task lists cannot claim unobserved completion or erase an undispatched task', () => {
  const rows = completedEvents();
  throwsCode(() => projectDagEvents([...rows.slice(0, -1), { ...rows.at(-1), completed_ids: ['build'] }]), 'DAG_EVENT_ORDER');
  throwsCode(() => projectDagEvents([...rows.slice(0, -1), { ...rows.at(-1), undispatched_ids: ['verify'] }]), 'DAG_EVENT_ORDER');
  throwsCode(() => projectDagEvents([rows[0], event('end', 101, 'dag_run_completed', { status: 'completed' })]), 'DAG_EVENT_ORDER');
});

test('check lifecycle retains uncertainty and cannot be used to claim a completed task', () => {
  const started = [task('start', 1, 'dag_task_started'), check('check-start', 2, 'dag_check_started')];
  const open = projectDagEvents(started).runs[0];
  assert.equal(open.tasks[0].attempts[0].duration_ms, null);
  assert.equal(open.tasks[0].attempts[0].checks[0].duration_ms, null);
  assert.equal(open.wait_times.check.open_intervals, 1);
  assert.equal(open.measured_completion_ms, null);
  throwsCode(() => projectDagEvents([...started, task('end', 10, 'dag_task_completed')]), 'DAG_EVENT_ORDER');
  const uncertain = [...started, check('check-end', 9, 'dag_check_completed', { status: 'uncertain', outcome_uncertain: true, assertions: null, skipped: null })];
  throwsCode(() => projectDagEvents([...uncertain, task('end', 10, 'dag_task_completed')]), 'DAG_EVENT_ORDER');
  const failed = projectDagEvents([...uncertain, task('end', 10, 'dag_task_failed')]).runs[0];
  assert.equal(failed.wait_times.check.observed_ms, 7);
  assert.equal(failed.measured_completion_ms, null);
});

test('checks are scoped to attempt and exact version, environment, and artifact vector', () => {
  const started = [task('start', 1, 'dag_task_started'), check('check-start', 2, 'dag_check_started')];
  const end = check('check-end', 3, 'dag_check_completed', { status: 'passed', outcome_uncertain: false, assertions: 1, skipped: 0 });
  for (const patch of [{ check_version: 'v2' }, { environment_ref: 'different-env' }, { phase: 'integration' }, { artifact_revisions: { source: 'changed' } }]) {
    throwsCode(() => projectDagEvents([...started, { ...end, ...patch }]), 'DAG_EVENT_CHECK_IDENTITY');
  }
  throwsCode(() => projectDagEvents([end]), 'DAG_EVENT_ORDER');
  throwsCode(() => projectDagEvents([...started, { ...end, attempt_id: 'other' }]), 'DAG_EVENT_ORDER');
});

test('exclusive block transitions and open waits preserve measured observation only', () => {
  const rows = [
    event('dependency', 0, 'dag_task_blocked', { task_id: 'build', reason: 'dependency' }),
    event('resource', 5, 'dag_task_blocked', { task_id: 'build', reason: 'resource', resource_kind: 'scope' }),
    event('slot', 12, 'dag_task_blocked', { task_id: 'build', reason: 'slot' }),
    task('other-start', 20, 'dag_task_started', 'other'),
  ];
  const run = projectDagEvents(rows).runs[0];
  assert.equal(run.wait_times.dependency.observed_ms, 5);
  assert.equal(run.wait_times.resource.observed_ms, 7);
  assert.equal(run.wait_times.slot.observed_ms, 8);
  assert.equal(run.wait_times.slot.open_intervals, 1);
  assert.equal(run.tasks[0].waits.at(-1).duration_ms, null);
  assert.equal(run.wait_aggregation, 'sum_of_task_intervals_not_run_wall_time');
});

test('unknown duration preserves null CP even when the observed run completes', () => {
  const rows = completedEvents();
  rows[0].analysis = analysis(['build', 'verify'], { unknown: true });
  const run = projectDagEvents(rows).runs[0];
  assert.equal(run.estimated_critical_path_ms, null);
  assert.equal(run.measured_completion_ms, 65);
  assert.deepEqual(run.unknown_duration_ids, ['build', 'verify']);
  rows[0].analysis.critical_path_ms = 0;
  throwsCode(() => projectDagEvents(rows), 'DAG_EVENT_INVALID');
});

test('unresolved dependencies keep critical path unknown and label the partial dependency model', () => {
  const metadata = { ...analysis(['build']), critical_path_ms: null, dependency_model_complete: false, critical_path_basis: 'known_artifact_edges_only' };
  const row = event('plan', 0, 'dag_plan_analyzed', { analysis: metadata });
  const run = projectDagEvents([row]).runs[0];
  assert.equal(run.estimated_critical_path_ms, null);
  assert.equal(run.dependency_model_complete, false);
  assert.equal(run.critical_path_basis, 'known_artifact_edges_only');
  metadata.critical_path_ms = 20;
  throwsCode(() => projectDagEvents([row]), 'DAG_EVENT_INVALID');
});

test('task identity and unknown graph task references cannot change inside telemetry', () => {
  const rows = [event('plan', 0, 'dag_plan_analyzed', { analysis: analysis(['build']) }),
    task('start', 1, 'dag_task_started', 'build', { worker_id: 'worker-a', kind: 'implementation' })];
  for (const patch of [{ worker_id: 'worker-b' }, { kind: 'verification' }]) {
    throwsCode(() => projectDagEvents([...rows, task('end', 2, 'dag_task_completed', 'build', patch)]), 'DAG_EVENT_ORDER');
  }
  throwsCode(() => projectDagEvents([rows[0], task('other', 2, 'dag_task_started', 'other')]), 'DAG_EVENT_UNKNOWN_TASK');
  throwsCode(() => projectDagEvents([rows[0], event('wait', 2, 'dag_task_blocked', { task_id: 'build', reason: 'dependency', blocking_task_ids: ['other'] })]), 'DAG_EVENT_UNKNOWN_TASK');
});

test('peak task concurrency is observed separately from critical path or wait totals', () => {
  const run = projectDagEvents([task('a-start', 0, 'dag_task_started', 'a'), task('b-start', 5, 'dag_task_started', 'b'),
    task('a-end', 10, 'dag_task_completed', 'a'), task('b-end', 20, 'dag_task_completed', 'b')]).runs[0];
  assert.equal(run.peak_concurrency, 2);
  assert.equal(run.observed_span_ms, 20);
  assert.equal(run.measured_completion_ms, null);
});

test('explicit new attempt is observed, while reusing a failed attempt ID is rejected', () => {
  const rows = [task('start', 1, 'dag_task_started'), task('failed', 2, 'dag_task_failed')];
  throwsCode(() => projectDagEvents([...rows, task('again', 3, 'dag_task_started')]), 'DAG_EVENT_ORDER');
  const run = projectDagEvents([...rows,
    task('new-start', 3, 'dag_task_started', 'build', { attempt_id: 'attempt-2' }),
    task('new-end', 5, 'dag_task_completed', 'build', { attempt_id: 'attempt-2' })]).runs[0];
  assert.equal(run.tasks[0].attempts.length, 2);
  assert.equal(run.tasks[0].status, 'completed');
  assert.equal(run.measured_completion_ms, null);
});

test('renderer escapes every journal-derived label and never embeds raw JSON or executable scripts', () => {
  const projection = projectDagEvents(completedEvents());
  const attack = '<script>alert("x")</script><img src=x onerror=alert(1)>';
  const run = projection.runs[0];
  run.run_id = attack;
  run.graph_revision = attack;
  run.status = attack;
  run.tasks[0].task_id = attack;
  run.tasks[0].worker_id = attack;
  run.tasks[0].kind = attack;
  run.tasks[0].attempts[0].attempt_id = attack;
  run.tasks[0].attempts[0].checks[0].check_id = attack;
  run.tasks[1].predecessors = [attack];
  run.tasks[1].waits[0].reason = attack;
  const html = renderDagView(projection);
  assert.ok(!html.includes(attack));
  assert.ok(!html.includes('<script'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.match(html, /Estimated dependency critical path/);
  assert.match(html, /Measured successful completion/);
  assert.match(html, /Preparation before analysis is unobserved/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /unknown \/ unknown/);
  throwsCode(() => renderDagView({ runs: [] }), 'DAG_VIEW_INVALID');
});
