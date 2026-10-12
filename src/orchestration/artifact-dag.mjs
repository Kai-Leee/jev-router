import {validateDagPlan} from './dag-contracts.mjs';

const fail = (code, details = {}) => {
  throw Object.assign(new Error(code), {code, ...details});
};

const sumDuration = (left, right) => {
  const value = left + right;
  if (!Number.isFinite(value)) fail('DAG_DURATION_OVERFLOW');
  return value;
};

// Parentage organizes work. Only consuming another task's artifact creates an edge.
export function analyzeDag(input) {
  const plan = validateDagPlan(input);
  const ids = plan.tasks.map(task => task.id);
  const position = new Map(ids.map((id, index) => [id, index]));
  const compare = (left, right) => position.get(left) - position.get(right)
    || (left < right ? -1 : left > right ? 1 : 0);
  const producers = new Map(plan.artifacts.map(artifact => [artifact.id, artifact.producer_task_id]));
  const predecessors = new Map(ids.map(id => [id, new Set()]));
  const successors = new Map(ids.map(id => [id, new Set()]));
  for (const task of plan.tasks) {
    for (const artifactId of task.input_artifact_ids) {
      const producer = producers.get(artifactId);
      predecessors.get(task.id).add(producer);
      successors.get(producer).add(task.id);
    }
  }

  const indegree = new Map(ids.map(id => [id, predecessors.get(id).size]));
  const ready = ids.filter(id => indegree.get(id) === 0);
  const topological = [];
  while (ready.length) {
    ready.sort(compare);
    const id = ready.shift();
    topological.push(id);
    for (const next of successors.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) ready.push(next);
    }
  }
  if (topological.length !== ids.length) {
    fail('DAG_CYCLE', {task_ids: ids.filter(id => indegree.get(id) > 0)});
  }

  const durations = new Map(plan.tasks.map(task => [task.id,
    task.duration.basis === 'unknown' ? null : task.duration.estimate_ms]));
  const unknown = ids.filter(id => durations.get(id) === null);
  const earliestStart = new Map();
  const earliestFinish = new Map();
  const remaining = new Map();
  for (const id of topological) {
    const priorFinishes = [...predecessors.get(id)].map(prior => earliestFinish.get(prior));
    const start = priorFinishes.includes(null) ? null : Math.max(0, ...priorFinishes);
    const duration = durations.get(id);
    earliestStart.set(id, start);
    earliestFinish.set(id, start === null || duration === null ? null : sumDuration(start, duration));
  }
  for (const id of [...topological].reverse()) {
    const nextPaths = [...successors.get(id)].map(next => remaining.get(next));
    const duration = durations.get(id);
    remaining.set(id, duration === null || nextPaths.includes(null)
      ? null : sumDuration(duration, Math.max(0, ...nextPaths)));
  }

  const objectOf = values => Object.fromEntries(ids.map(id => [id, values.get(id)]));
  return {
    topological_order: topological,
    predecessors: Object.fromEntries(ids.map(id => [id, [...predecessors.get(id)].sort(compare)])),
    successors: Object.fromEntries(ids.map(id => [id, [...successors.get(id)].sort(compare)])),
    critical_path_ms: unknown.length || plan.unknown_relationships.length ? null : Math.max(0, ...earliestFinish.values()),
    dependency_model_complete: plan.unknown_relationships.length === 0,
    critical_path_basis: plan.unknown_relationships.length ? 'known_artifact_edges_only' : 'declared_artifact_edges',
    earliest_start_ms: objectOf(earliestStart),
    earliest_finish_ms: objectOf(earliestFinish),
    remaining_path_ms: objectOf(remaining),
    // No rank may silently turn an unknown duration into a zero-length task.
    priority_order: unknown.length ? [...ids] : [...ids].sort((left, right) =>
      remaining.get(right) - remaining.get(left) || compare(left, right)),
    unknown_duration_ids: unknown,
  };
}
