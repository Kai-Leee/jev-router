import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {validateDagPlan} from './dag-contracts.mjs';
import {analyzeDag} from './artifact-dag.mjs';

const fail = code => { throw Object.assign(new Error(code), {code}); };
const overlaps = (left, right) => left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
const scopesConflict = (left, right) => left.write_scope.some(path =>
  [...right.read_scope, ...right.write_scope].some(other => overlaps(path, other)))
  || left.read_scope.some(path => right.write_scope.some(other => overlaps(path, other)));
const uncertain = value => value?.outcome_uncertain === true || value?.outcomeUncertain === true
  || value?.uncertain === true || value?.status === 'unknown' || value?.status === 'uncertain';
const errorCode = (error, fallback) => typeof error?.code === 'string' && error.code ? error.code : fallback;

// execute must include the controller's verification gate. A completed callback alone
// is a scheduling signal, not independent evidence that artifacts passed their checks.
export async function runDag({plan: input, execute, record = async () => {},
  clock = () => performance.now(), maxConcurrency} = {}) {
  const plan = validateDagPlan(input);
  const analysis = analyzeDag(plan);
  const concurrency = maxConcurrency ?? plan.max_concurrency;
  if (typeof execute !== 'function' || typeof record !== 'function'
      || !Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > plan.worker_limit) {
    fail('DAG_INVALID_SCHEDULER');
  }
  const now = typeof clock === 'function' ? clock : typeof clock?.now === 'function' ? () => clock.now() : null;
  if (!now) fail('DAG_INVALID_CLOCK');
  let lastAt = -Infinity;
  const readTime = () => {
    const value = now();
    if (!Number.isFinite(value) || value < 0) fail('DAG_INVALID_CLOCK');
    if (value < lastAt) fail('DAG_CLOCK_NOT_MONOTONIC');
    lastAt = value;
    return value;
  };
  // Reject a bad clock before any worker starts, even if every task is blocked.
  readTime();
  const tasks = new Map(plan.tasks.map(task => [task.id, task]));
  const pending = new Set(plan.tasks.map(task => task.id));
  const completed = new Set();
  const running = new Map();
  const results = new Map();
  const waitReasons = new Map();
  const unknownTasks = new Set(plan.unknown_relationships.flatMap(relation => relation.task_ids));
  let failure = null;
  let recordingFailure = null;

  const emit = async payload => {
    if (recordingFailure) throw recordingFailure;
    try {
      await record(structuredClone({...payload, at_ms: readTime()}));
    } catch (error) {
      recordingFailure = Object.assign(new Error(errorCode(error, 'DAG_RECORD_FAILED')), {
        code: errorCode(error, 'DAG_RECORD_FAILED'), outcome_uncertain: uncertain(error),
      });
      throw recordingFailure;
    }
  };
  const failed = (taskId, attemptId, error, fallback) => ({
    task_id: taskId, attempt_id: attemptId, status: error?.code === 'WORKER_PROFILE_BLOCKED'
      && error.status === 'blocked' && error.dispatch_started === false && error.outcome_uncertain === false ? 'blocked' : 'failed',
    code: errorCode(error, fallback), outcome_uncertain: uncertain(error),
  });
  const launch = task => {
    pending.delete(task.id);
    waitReasons.delete(task.id);
    const attemptId = `dag-attempt-${randomUUID()}`;
    const identity = {task_id: task.id, attempt_id: attemptId, worker_id: task.worker_id, kind: task.kind};
    const promise = (async () => {
      let outcome;
      try {
        await emit({event: 'dag_task_started', ...identity});
        const value = await execute(structuredClone(task), {plan: structuredClone(plan), attempt_id: attemptId});
        outcome = value?.status === 'completed' && !uncertain(value)
          ? {...identity, status: 'completed', value: structuredClone(value)}
          : failed(task.id, attemptId, value, 'DAG_TASK_NOT_COMPLETED');
      } catch (error) {
        outcome = failed(task.id, attemptId, error, 'DAG_TASK_FAILED');
      }
      // Stop admission as soon as any callback fails, including while a different
      // completed callback is still being removed from the active set.
      if (outcome.status !== 'completed') failure ??= outcome;
      try {
        await emit(outcome.status === 'completed'
          ? {event: 'dag_task_completed', ...identity, status: 'completed'}
          : {event: 'dag_task_failed', ...identity, status: outcome.status,
            code: outcome.code, outcome_uncertain: outcome.outcome_uncertain});
      } catch (error) {
        outcome = failed(task.id, attemptId, error, 'DAG_RECORD_FAILED');
        failure ??= outcome;
      }
      return outcome;
    })();
    running.set(task.id, {task, promise});
  };

  const blocked = task => {
    if (failure) return {reason: failure.status==='blocked'?'run_blocked':'run_failed', blocking_task_ids: failure.task_id ? [failure.task_id] : []};
    if (unknownTasks.has(task.id)) {
      return {reason: 'unknown_relation', blocking_task_ids: [...new Set(plan.unknown_relationships
        .filter(relation => relation.task_ids.includes(task.id)).flatMap(relation => relation.task_ids))]
        .filter(id => id !== task.id)};
    }
    const dependencies = analysis.predecessors[task.id].filter(id => !completed.has(id));
    if (dependencies.length) return {reason: 'dependency', blocking_task_ids: dependencies};
    const sameWorker = [...running.values()].filter(active => task.worker_id !== null && active.task.worker_id === task.worker_id);
    if (sameWorker.length) return {reason: 'resource', resource_kind: 'worker', blocking_task_ids: sameWorker.map(active => active.task.id)};
    const conflicts = [...running.values()].filter(active => scopesConflict(task, active.task));
    if (conflicts.length) return {reason: 'resource', resource_kind: 'scope', blocking_task_ids: conflicts.map(active => active.task.id)};
    if (running.size >= concurrency) return {reason: 'slot', blocking_task_ids: [...running.keys()]};
    return null;
  };
  const reportWaits = async () => {
    for (const id of pending) {
      const reason = blocked(tasks.get(id));
      const key = reason && `${reason.reason}:${reason.resource_kind ?? ''}`;
      if (reason && waitReasons.get(id) !== key) {
        waitReasons.set(id, key);
        try {
          await emit({event: 'dag_task_blocked', task_id: id, ...reason});
        } catch (error) {
          failure ??= {status: 'failed', code: errorCode(error, 'DAG_RECORD_FAILED'), outcome_uncertain: uncertain(error)};
        }
      }
    }
  };

  while (pending.size || running.size) {
    if (!failure) {
      for (const id of analysis.priority_order) {
        if (!pending.has(id)) continue;
        const task = tasks.get(id);
        if (!blocked(task)) launch(task);
      }
    }
    await reportWaits();
    if (!running.size) break;
    const outcome = await Promise.race([...running.values()].map(active => active.promise));
    running.delete(outcome.task_id);
    results.set(outcome.task_id, outcome);
    if (outcome.status === 'completed') completed.add(outcome.task_id);
  }

  return {
    status: failure ? failure.status === 'blocked' ? 'blocked' : 'failed' : pending.size ? 'blocked' : 'completed',
    results: Object.fromEntries(results),
    completed_ids: [...completed],
    undispatched_ids: plan.tasks.filter(task => pending.has(task.id)).map(task => task.id),
    failure: failure ? structuredClone(failure) : null,
  };
}
