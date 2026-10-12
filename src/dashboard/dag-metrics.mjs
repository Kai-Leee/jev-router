const EVENTS = new Set([
  'dag_plan_analyzed', 'dag_task_started', 'dag_task_completed', 'dag_task_failed',
  'dag_task_blocked', 'dag_check_started', 'dag_check_completed', 'dag_run_completed',
]);
const BLOCK_REASONS = ['unknown_relation', 'dependency', 'resource', 'slot', 'run_failed'];
const PHASES = new Set(['contract', 'local', 'integration']);
const CHECK_STATUSES = new Set(['passed', 'failed', 'uncertain']);

function fail(code, message) {
  throw Object.assign(new Error(message), { code });
}

function assert(condition, code, message) {
  if (!condition) fail(code, message);
}

function identifier(value, label) {
  assert(typeof value === 'string' && value.length > 0 && value.trim() === value
    && !/[\u0000-\u001f\u007f]/u.test(value), 'DAG_EVENT_INVALID', `${label} must be a nonempty identifier`);
}

function time(value, label, nullable = false) {
  assert((nullable && value === null) || (typeof value === 'number' && Number.isFinite(value)
    && value >= 0 && value <= Number.MAX_SAFE_INTEGER), 'DAG_EVENT_INVALID', `${label} must be finite nonnegative milliseconds`);
}

function identifiers(values, label) {
  assert(Array.isArray(values), 'DAG_EVENT_INVALID', `${label} must be an array`);
  values.forEach((value) => identifier(value, label));
  assert(new Set(values).size === values.length, 'DAG_EVENT_INVALID', `${label} must not contain duplicates`);
}

function record(value, label) {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value)), 'DAG_EVENT_INVALID', `${label} must be an object`);
}

// Canonical JSON is used only for receipt identity. It does not alter event order.
function canonical(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  assert(typeof value === 'object' && value !== null && !ancestors.has(value), 'DAG_EVENT_INVALID', 'Events must contain finite, acyclic JSON values');
  ancestors.add(value);
  let result;
  if (Array.isArray(value)) {
    assert(Object.keys(value).length === value.length, 'DAG_EVENT_INVALID', 'Event arrays must not contain holes or extra properties');
    result = `[${value.map((item) => canonical(item, ancestors)).join(',')}]`;
  } else {
    record(value, 'Event data');
    result = `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key], ancestors)}`).join(',')}}`;
  }
  ancestors.delete(value);
  return result;
}

function validateAnalysis(analysis) {
  record(analysis, 'analysis');
  identifiers(analysis.topological_order, 'analysis.topological_order');
  identifiers(analysis.priority_order, 'analysis.priority_order');
  identifiers(analysis.unknown_duration_ids, 'analysis.unknown_duration_ids');
  time(analysis.critical_path_ms, 'analysis.critical_path_ms', true);
  const ids = new Set(analysis.topological_order);
  assert(analysis.priority_order.length === ids.size && analysis.priority_order.every((id) => ids.has(id))
    && analysis.unknown_duration_ids.every((id) => ids.has(id)), 'DAG_EVENT_INVALID', 'Analysis task sets differ');
  assert(analysis.unknown_duration_ids.length === 0 || analysis.critical_path_ms === null,
    'DAG_EVENT_INVALID', 'Unknown durations cannot produce a complete critical-path estimate');
  if (Object.hasOwn(analysis, 'dependency_model_complete')) {
    assert(typeof analysis.dependency_model_complete === 'boolean', 'DAG_EVENT_INVALID', 'dependency_model_complete must be boolean');
    assert(analysis.dependency_model_complete || analysis.critical_path_ms === null,
      'DAG_EVENT_INVALID', 'Unresolved dependency relationships cannot produce a complete critical-path estimate');
  }
  if (Object.hasOwn(analysis, 'critical_path_basis')) identifier(analysis.critical_path_basis, 'analysis.critical_path_basis');
  for (const name of ['predecessors', 'successors', 'earliest_start_ms', 'earliest_finish_ms', 'remaining_path_ms']) {
    record(analysis[name], `analysis.${name}`);
    assert(Object.keys(analysis[name]).length === ids.size && Object.keys(analysis[name]).every((id) => ids.has(id)),
      'DAG_EVENT_INVALID', `analysis.${name} must cover the exact task set`);
    for (const [id, value] of Object.entries(analysis[name])) {
      if (name === 'predecessors' || name === 'successors') {
        identifiers(value, `analysis.${name}.${id}`);
        assert(value.every((other) => ids.has(other) && other !== id), 'DAG_EVENT_INVALID', 'Invalid analysis relationship');
      } else time(value, `analysis.${name}.${id}`, true);
    }
  }
}

function validateEvent(event) {
  record(event, 'Event');
  for (const name of ['run_id', 'graph_revision', 'event_id']) identifier(event[name], name);
  time(event.at_ms, 'at_ms');
  assert(EVENTS.has(event.event), 'DAG_EVENT_INVALID', `Unsupported DAG event ${String(event.event)}`);
  for (const name of ['task_id', 'attempt_id', 'check_id', 'check_version', 'environment_ref']) {
    if (Object.hasOwn(event, name)) identifier(event[name], name);
  }
  if (event.event.startsWith('dag_task_') || event.event.startsWith('dag_check_')) identifier(event.task_id, 'task_id');
  if (event.event !== 'dag_task_blocked' && (event.event.startsWith('dag_task_') || event.event.startsWith('dag_check_'))) identifier(event.attempt_id, 'attempt_id');
  if (event.event === 'dag_plan_analyzed' || event.event === 'dag_run_completed') {
    assert(!Object.hasOwn(event, 'task_id') && !Object.hasOwn(event, 'attempt_id'), 'DAG_EVENT_INVALID', 'Run events cannot identify a task attempt');
  }
  if (Object.hasOwn(event, 'worker_id') && event.worker_id !== null) identifier(event.worker_id, 'worker_id');
  if (Object.hasOwn(event, 'kind')) assert(['implementation', 'verification'].includes(event.kind), 'DAG_EVENT_INVALID', 'Invalid task kind');
  if (Object.hasOwn(event, 'outcome_uncertain')) assert(typeof event.outcome_uncertain === 'boolean', 'DAG_EVENT_INVALID', 'outcome_uncertain must be boolean');
  if (event.event === 'dag_plan_analyzed') validateAnalysis(event.analysis);
  if (event.event === 'dag_task_blocked') {
    assert(BLOCK_REASONS.includes(event.reason), 'DAG_EVENT_INVALID', 'Invalid blocking reason');
    assert(!Object.hasOwn(event, 'attempt_id'), 'DAG_EVENT_INVALID', 'Pre-dispatch blocked events cannot identify an attempt');
    if (Object.hasOwn(event, 'blocking_task_ids')) identifiers(event.blocking_task_ids, 'blocking_task_ids');
    if (Object.hasOwn(event, 'resource_kind')) assert(event.reason === 'resource' && ['worker', 'scope'].includes(event.resource_kind), 'DAG_EVENT_INVALID', 'Invalid resource_kind');
  }
  if (event.event === 'dag_task_completed') {
    if (Object.hasOwn(event, 'status')) assert(event.status === 'completed', 'DAG_EVENT_INVALID', 'Task completion has contradictory status');
    assert(event.outcome_uncertain !== true, 'DAG_EVENT_INVALID', 'An uncertain task cannot be completed');
  }
  if (event.event === 'dag_task_failed' && Object.hasOwn(event, 'status')) assert(event.status === 'failed', 'DAG_EVENT_INVALID', 'Task failure has contradictory status');
  if (event.event.startsWith('dag_check_')) {
    for (const name of ['check_id', 'check_version', 'environment_ref']) identifier(event[name], name);
    assert(PHASES.has(event.phase), 'DAG_EVENT_INVALID', 'Invalid check phase');
    record(event.artifact_revisions, 'artifact_revisions');
    for (const [id, revision] of Object.entries(event.artifact_revisions)) {
      identifier(id, 'artifact_id');
      identifier(revision, 'artifact revision');
    }
    if (event.event === 'dag_check_completed') {
      assert(CHECK_STATUSES.has(event.status) && typeof event.outcome_uncertain === 'boolean', 'DAG_EVENT_INVALID', 'Check completion requires a status and uncertainty flag');
      assert(event.status !== 'passed' || event.outcome_uncertain === false, 'DAG_EVENT_INVALID', 'An uncertain check cannot pass');
      assert(event.status !== 'uncertain' || event.outcome_uncertain === true, 'DAG_EVENT_INVALID', 'Uncertain status requires an uncertainty flag');
      for (const name of ['assertions', 'skipped']) {
        assert(event[name] === null || (Number.isSafeInteger(event[name]) && event[name] >= 0), 'DAG_EVENT_INVALID', `${name} must be a count or null`);
      }
    }
  }
  if (event.event === 'dag_run_completed') {
    assert(['completed', 'failed', 'blocked'].includes(event.status), 'DAG_EVENT_INVALID', 'Run terminal status must be explicit');
    for (const name of ['completed_ids', 'undispatched_ids']) if (Object.hasOwn(event, name)) identifiers(event[name], name);
  }
  return canonical(event);
}

function taskFor(run, id) {
  if (run.analysis) assert(run.analysis.topological_order.includes(id), 'DAG_EVENT_UNKNOWN_TASK', `Task ${id} is absent from this graph revision`);
  if (!run.tasks.has(id)) run.tasks.set(id, { task_id: id, status: 'pending', worker_id: null, kind: null, attempts: [], waits: [], activeWait: null });
  return run.tasks.get(id);
}

function finishWait(task, at, endedBy, resolved = true) {
  if (!task.activeWait) return;
  Object.assign(task.activeWait, { ended_at_ms: at, ended_by: endedBy, resolved });
  task.activeWait = null;
}

function activeAttempt(task, event) {
  const attempt = task.attempts.at(-1);
  assert(attempt && attempt.status === 'running' && attempt.attempt_id === event.attempt_id,
    'DAG_EVENT_ORDER', `${event.event} requires a matching running task attempt`);
  return attempt;
}

function checkIdentity(event) {
  return { check_version: event.check_version, phase: event.phase, environment_ref: event.environment_ref, artifact_revisions: event.artifact_revisions };
}

function applyEvent(run, event) {
  assert(!run.terminal, 'DAG_EVENT_ORDER', 'An event follows this run revision terminal');
  assert(run.last_event_at_ms === null || event.at_ms >= run.last_event_at_ms, 'DAG_EVENT_ORDER', 'DAG events must be chronological within a run and graph revision');
  run.first_event_at_ms ??= event.at_ms;
  run.last_event_at_ms = event.at_ms;
  run.event_count += 1;
  if (event.event === 'dag_plan_analyzed') {
    assert(run.event_count === 1 && run.analysis === null, 'DAG_EVENT_ORDER', 'Plan analysis must precede execution events');
    run.analysis = event.analysis;
    run.analysis_at_ms = event.at_ms;
    for (const id of event.analysis.topological_order) taskFor(run, id);
    return;
  }
  if (event.event === 'dag_run_completed') {
    const tasks = [...run.tasks.values()];
    assert(tasks.every((task) => task.status !== 'running'), 'DAG_EVENT_ORDER', 'Run terminal must follow all dispatched attempts');
    assert(event.status !== 'completed' || tasks.every((task) => task.status === 'completed'),
      'DAG_EVENT_ORDER', 'Failed, blocked or pending tasks cannot be counted as run completion');
    if (Object.hasOwn(event, 'completed_ids')) {
      const actual = tasks.filter((task) => task.status === 'completed').map((task) => task.task_id).sort();
      assert(canonical([...event.completed_ids].sort()) === canonical(actual), 'DAG_EVENT_ORDER', 'Run completed_ids differ from observed completions');
    }
    if (Object.hasOwn(event, 'undispatched_ids')) {
      const actual = tasks.filter((task) => task.attempts.length === 0).map((task) => task.task_id).sort();
      assert(canonical([...event.undispatched_ids].sort()) === canonical(actual), 'DAG_EVENT_ORDER', 'Run undispatched_ids differ from observed dispatches');
    }
    for (const task of tasks) finishWait(task, event.at_ms, 'run_ended', false);
    run.terminal = { status: event.status, at_ms: event.at_ms };
    return;
  }
  const task = taskFor(run, event.task_id);
  if (event.event === 'dag_task_blocked') {
    assert(['pending', 'blocked'].includes(task.status), 'DAG_EVENT_ORDER', 'A dispatched task cannot acquire a pre-dispatch wait');
    if (run.analysis) assert((event.blocking_task_ids ?? []).every((id) => run.tasks.has(id)), 'DAG_EVENT_UNKNOWN_TASK', 'Wait blockers must belong to this graph revision');
    finishWait(task, event.at_ms, 'reason_changed');
    const wait = { reason: event.reason, resource_kind: event.resource_kind ?? null, blocking_task_ids: event.blocking_task_ids ?? [], started_at_ms: event.at_ms, ended_at_ms: null, ended_by: null, resolved: false };
    task.waits.push(wait);
    task.activeWait = wait;
    task.status = 'blocked';
    return;
  }
  if (event.event === 'dag_task_started') {
    assert(['pending', 'blocked', 'failed'].includes(task.status), 'DAG_EVENT_ORDER', 'Task is already running or completed');
    assert(!task.attempts.some((attempt) => attempt.attempt_id === event.attempt_id), 'DAG_EVENT_ORDER', 'Task attempt IDs cannot be reused');
    finishWait(task, event.at_ms, 'task_started');
    task.status = 'running';
    task.worker_id = event.worker_id ?? null;
    task.kind = event.kind ?? null;
    task.attempts.push({ attempt_id: event.attempt_id, status: 'running', started_at_ms: event.at_ms, ended_at_ms: null, outcome_uncertain: null, checks: new Map() });
    run.active_count += 1;
    run.peak_concurrency = Math.max(run.peak_concurrency, run.active_count);
    return;
  }
  const attempt = activeAttempt(task, event);
  if (Object.hasOwn(event, 'worker_id')) assert(event.worker_id === task.worker_id, 'DAG_EVENT_ORDER', 'Task worker changed within an attempt');
  if (Object.hasOwn(event, 'kind')) assert(event.kind === task.kind, 'DAG_EVENT_ORDER', 'Task kind changed within an attempt');
  if (event.event.startsWith('dag_check_')) {
    const check = attempt.checks.get(event.check_id);
    if (event.event === 'dag_check_started') {
      assert(!check, 'DAG_EVENT_ORDER', 'A check can start once per task attempt');
      attempt.checks.set(event.check_id, { check_id: event.check_id, ...checkIdentity(event), status: 'running', started_at_ms: event.at_ms, ended_at_ms: null, outcome_uncertain: null, assertions: null, skipped: null });
    } else {
      assert(check?.status === 'running', 'DAG_EVENT_ORDER', 'Check completion requires its start in the same task attempt');
      assert(canonical(checkIdentity(check)) === canonical(checkIdentity(event)), 'DAG_EVENT_CHECK_IDENTITY', 'Check metadata or artifact revisions changed during the span');
      Object.assign(check, { status: event.status, ended_at_ms: event.at_ms, outcome_uncertain: event.outcome_uncertain, assertions: event.assertions, skipped: event.skipped });
    }
    return;
  }
  if (event.event === 'dag_task_completed') {
    assert([...attempt.checks.values()].every((check) => check.status === 'passed'), 'DAG_EVENT_ORDER', 'An unfinished or nonpassing check cannot lead to task completion');
  }
  attempt.status = event.event === 'dag_task_completed' ? 'completed' : 'failed';
  attempt.ended_at_ms = event.at_ms;
  attempt.outcome_uncertain = event.event === 'dag_task_failed' ? (event.outcome_uncertain ?? null) : false;
  task.status = attempt.status;
  run.active_count -= 1;
}

function span(item, observedUntil) {
  const end = item.ended_at_ms ?? observedUntil;
  return { ...item, duration_ms: item.ended_at_ms === null ? null : item.ended_at_ms - item.started_at_ms,
    observed_ms: end - item.started_at_ms, observed_until_ms: end };
}

function summarizeRun(run) {
  const waitTimes = Object.fromEntries([...BLOCK_REASONS, 'check'].map((reason) => [reason, { observed_ms: 0, resolved_ms: 0, open_intervals: 0, censored_intervals: 0 }]));
  const tasks = [...run.tasks.values()].sort((a, b) => a.task_id.localeCompare(b.task_id, 'en')).map((task) => {
    const waits = task.waits.map((wait) => {
      const interval = span(wait, run.last_event_at_ms);
      const bucket = waitTimes[wait.reason];
      bucket.observed_ms += interval.observed_ms;
      if (wait.resolved) bucket.resolved_ms += interval.duration_ms;
      else if (wait.ended_at_ms === null) bucket.open_intervals += 1;
      else bucket.censored_intervals += 1;
      return interval;
    });
    const attempts = task.attempts.map((attempt) => {
      const until = attempt.ended_at_ms ?? run.last_event_at_ms;
      const checks = [...attempt.checks.values()].map((check) => {
        const interval = span(check, until);
        waitTimes.check.observed_ms += interval.observed_ms;
        if (check.ended_at_ms !== null) waitTimes.check.resolved_ms += interval.duration_ms;
        else if (attempt.ended_at_ms === null) waitTimes.check.open_intervals += 1;
        else waitTimes.check.censored_intervals += 1;
        return interval;
      });
      return { ...span(attempt, run.last_event_at_ms), checks };
    });
    return { task_id: task.task_id, status: task.status, worker_id: task.worker_id, kind: task.kind,
      predecessors: run.analysis?.predecessors[task.task_id] ?? null, waits, attempts };
  });
  const status = run.terminal?.status ?? (tasks.some((task) => task.status === 'failed') ? 'failed' : 'running');
  return {
    run_id: run.run_id, graph_revision: run.graph_revision, status,
    event_count: run.event_count, duplicate_count: run.duplicate_count,
    first_event_at_ms: run.first_event_at_ms, last_event_at_ms: run.last_event_at_ms,
    analysis_at_ms: run.analysis_at_ms, terminal_at_ms: run.terminal?.at_ms ?? null,
    observed_span_ms: run.last_event_at_ms - run.first_event_at_ms,
    estimated_critical_path_ms: run.analysis?.critical_path_ms ?? null,
    critical_path_basis: run.analysis?.critical_path_basis ?? 'dependency_duration_model',
    dependency_model_complete: run.analysis?.dependency_model_complete ?? null,
    unknown_duration_ids: run.analysis?.unknown_duration_ids ?? null,
    measured_completion_ms: status === 'completed' && run.analysis_at_ms !== null ? run.terminal.at_ms - run.analysis_at_ms : null,
    completion_boundary: 'dag_plan_analyzed_to_dag_run_completed', preparation_observed: false,
    peak_concurrency: run.peak_concurrency,
    wait_times: waitTimes, wait_aggregation: 'sum_of_task_intervals_not_run_wall_time',
    usage: { input_tokens: null, output_tokens: null, total_tokens: null, cost_usd: null, source: 'not_observed' },
    counts: Object.fromEntries(['pending', 'blocked', 'running', 'completed', 'failed'].map((value) => [value, tasks.filter((task) => task.status === value).length])),
    tasks,
  };
}

/** Pure projection of a chronological event journal; this does not dispatch work or certify checks. */
export function projectDagEvents(events) {
  assert(Array.isArray(events), 'DAG_EVENT_INVALID', 'events must be an array');
  const receipts = new Map();
  const groups = new Map();
  let duplicateCount = 0;
  for (const input of events) {
    const signature = validateEvent(input);
    const key = JSON.stringify([input.run_id, input.event_id]);
    const groupKey = JSON.stringify([input.run_id, input.graph_revision]);
    if (receipts.has(key)) {
      assert(receipts.get(key) === signature, 'DAG_EVENT_DUPLICATE_CONFLICT', 'The same run and event ID has conflicting content');
      duplicateCount += 1;
      groups.get(groupKey).duplicate_count += 1;
      continue;
    }
    receipts.set(key, signature);
    const event = JSON.parse(signature);
    if (!groups.has(groupKey)) groups.set(groupKey, { run_id: event.run_id, graph_revision: event.graph_revision,
      event_count: 0, duplicate_count: 0, first_event_at_ms: null, last_event_at_ms: null,
      analysis_at_ms: null, analysis: null, terminal: null, tasks: new Map(), active_count: 0, peak_concurrency: 0 });
    applyEvent(groups.get(groupKey), event);
  }
  const runs = [...groups.values()].sort((a, b) => a.run_id.localeCompare(b.run_id, 'en') || a.graph_revision.localeCompare(b.graph_revision, 'en')).map(summarizeRun);
  return { schema_version: 'dag-event-projection/v1', event_count: receipts.size, duplicate_count: duplicateCount, runs };
}
