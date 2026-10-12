import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeDag} from '../src/orchestration/artifact-dag.mjs';

function planFor(specs) {
  const requirements = specs.filter(spec => spec.kind !== 'verification').map(spec => `req-${spec.id}`);
  const tasks = specs.map((spec, index) => ({
    id: spec.id, kind: spec.kind ?? 'implementation', parent_id: spec.parent_id ?? null,
    requirement_ids: spec.kind === 'verification' ? [...requirements] : [`req-${spec.id}`],
    input_artifact_ids: (spec.after ?? []).map(id => `artifact-${id}`),
    output_artifact_ids: spec.kind === 'verification' ? [] : [`artifact-${spec.id}`],
    check_ids: [`check-${spec.id}`], worker_id: spec.kind === 'verification' ? null : `worker-${index % 2}`,
    read_scope: spec.read_scope ?? [], write_scope: spec.write_scope ?? [`output/${spec.id}.json`],
    duration: {basis: spec.duration === null ? 'unknown' : 'estimate', estimate_ms: spec.duration ?? null,
      sample_count: 0, source_refs: []},
  }));
  return {
    schema_version: 'artifact-dag/v1', goal_revision: 'goal-v1', graph_revision: 'graph-v1',
    requirement_ids: requirements, worker_limit: 30, max_concurrency: 2,
    workers: [0, 1].map(index => ({id: `worker-${index}`, profile_id: 'fixture-local'})), tasks,
    artifacts: tasks.flatMap(task => task.output_artifact_ids.map(id => ({id, producer_task_id: task.id}))),
    checks: tasks.map(task => ({id: task.check_ids[0], version: '1',
      phase: task.kind === 'verification' ? 'integration' : 'local',
      artifact_ids: [...task.input_artifact_ids, ...task.output_artifact_ids], requirement_ids: [...task.requirement_ids],
      runner_ref: 'fixture-assert', argv: ['node', 'fixture-check.mjs'], cwd: 'test',
      environment_ref: 'fixture-node', source_ref: 'test/artifact-dag.test.mjs'})), unknown_relationships: [],
  };
}

test('hand-computed critical path is 9 including integration verification exactly once', () => {
  const plan = planFor([
    {id: 'a', duration: 2}, {id: 'b', duration: 3}, {id: 'c', after: ['a'], duration: 3},
    {id: 'verify', kind: 'verification', after: ['b', 'c'], duration: 4},
  ]);
  const analysis = analyzeDag(plan);
  assert.equal(analysis.critical_path_ms, 9);
  assert.deepEqual(analysis.earliest_start_ms, {a: 0, b: 0, c: 2, verify: 5});
  assert.deepEqual(analysis.earliest_finish_ms, {a: 2, b: 3, c: 5, verify: 9});
  assert.deepEqual(analysis.remaining_path_ms, {a: 9, b: 7, c: 7, verify: 4});
  assert.deepEqual(analysis.priority_order, ['a', 'b', 'c', 'verify']);
  assert.deepEqual(analysis.predecessors, {a: [], b: [], c: ['a'], verify: ['b', 'c']});
  assert.deepEqual(analysis.successors, {a: ['c'], b: ['verify'], c: ['verify'], verify: []});
});

test('unknown duration propagates null through affected paths and selects global FIFO', () => {
  const plan = planFor([{id: 'short', duration: 1}, {id: 'unknown', duration: null},
    {id: 'long', duration: 100}, {id: 'consumer', after: ['unknown'], duration: 3}]);
  const analysis = analyzeDag(plan);
  assert.equal(analysis.critical_path_ms, null);
  assert.deepEqual(analysis.unknown_duration_ids, ['unknown']);
  assert.deepEqual(analysis.priority_order, ['short', 'unknown', 'long', 'consumer']);
  assert.equal(analysis.earliest_finish_ms.unknown, null);
  assert.equal(analysis.earliest_start_ms.consumer, null);
  assert.equal(analysis.earliest_finish_ms.consumer, null);
  assert.equal(analysis.remaining_path_ms.unknown, null);
  assert.equal(analysis.earliest_finish_ms.long, 100);
  assert.equal(analysis.remaining_path_ms.consumer, 3);
});

test('duration estimates and observations are read without inventing an unknown estimate', () => {
  const plan = planFor([{id: 'observed', duration: 7}, {id: 'estimated', duration: 2}]);
  plan.tasks[0].duration = {basis: 'observed', estimate_ms: 7, sample_count: 3, source_refs: ['fixture-samples']};
  assert.equal(analyzeDag(plan).critical_path_ms, 7);
  plan.tasks[0].duration = {basis: 'unknown', estimate_ms: null, sample_count: 0, source_refs: []};
  assert.equal(analyzeDag(plan).critical_path_ms, null);
});

test('unresolved relationships cannot claim a complete critical path estimate', () => {
  const plan = planFor([{id: 'a', duration: 2}, {id: 'b', duration: 3}]);
  plan.unknown_relationships.push({task_ids: ['a', 'b'], reason: 'No dependency evidence', evidence_refs: []});
  const analysis = analyzeDag(plan);
  assert.equal(analysis.critical_path_ms, null);
  assert.equal(analysis.dependency_model_complete, false);
  assert.equal(analysis.critical_path_basis, 'known_artifact_edges_only');
  assert.deepEqual(analysis.earliest_finish_ms, {a: 2, b: 3});
});

test('equal remaining paths keep input order deterministically', () => {
  const plan = planFor([{id: 'z', duration: 2}, {id: 'a', duration: 2}, {id: 'm', duration: 2}]);
  assert.deepEqual(analyzeDag(plan).priority_order, ['z', 'a', 'm']);
  assert.deepEqual(analyzeDag(plan), analyzeDag(structuredClone(plan)));
});

test('shared paths cannot create a false cycle against an artifact dependency', () => {
  const plan = planFor([{id: 'consumer', after: ['producer'], duration: 2, write_scope: ['shared/file']},
    {id: 'producer', duration: 4, write_scope: ['shared/file']}]);
  const analysis = analyzeDag(plan);
  assert.deepEqual(analysis.topological_order, ['producer', 'consumer']);
  assert.equal(analysis.critical_path_ms, 6);
  assert.deepEqual(analysis.predecessors.producer, []);
});

test('parent tree does not create semantic edges', () => {
  const plan = planFor([{id: 'child', parent_id: 'parent', duration: 1}, {id: 'parent', duration: 9}]);
  assert.deepEqual(analyzeDag(plan).predecessors, {child: [], parent: []});
  assert.equal(analyzeDag(plan).critical_path_ms, 9);
});

test('multiple consumed artifacts from one producer create one edge', () => {
  const plan = planFor([{id: 'a', duration: 2}, {id: 'b', after: ['a'], duration: 1}]);
  plan.artifacts.push({id: 'artifact-extra', producer_task_id: 'a'});
  plan.tasks[0].output_artifact_ids.push('artifact-extra');
  plan.checks[0].artifact_ids.push('artifact-extra');
  plan.tasks[1].input_artifact_ids.push('artifact-extra');
  const analysis = analyzeDag(plan);
  assert.deepEqual(analysis.predecessors.b, ['a']);
  assert.equal(analysis.critical_path_ms, 3);
});

test('real artifact cycle is rejected before scheduling', () => {
  const plan = planFor([{id: 'a', after: ['b'], duration: 1}, {id: 'b', after: ['a'], duration: 2}]);
  assert.throws(() => analyzeDag(plan), {code: 'DAG_CYCLE', task_ids: ['a', 'b']});
});

test('dangling artifact is rejected by the common contract', () => {
  const plan = planFor([{id: 'a', duration: 1}]);
  plan.tasks[0].input_artifact_ids.push('artifact-absent');
  assert.throws(() => analyzeDag(plan), {code: 'DAG_UNKNOWN_REFERENCE'});
});

test('worker cap does not cap the number of tasks or graph roots', () => {
  const plan = planFor(Array.from({length: 37}, (_, index) => ({id: `task-${index}`, duration: 1})));
  plan.worker_limit = 2;
  assert.equal(analyzeDag(plan).topological_order.length, 37);
  assert.equal(analyzeDag(plan).critical_path_ms, 1);
});

test('analysis does not mutate caller state or leave mutable references to it', () => {
  const plan = planFor([{id: 'a', duration: 1}, {id: 'b', after: ['a'], duration: 2}]);
  const original = structuredClone(plan);
  const analysis = analyzeDag(plan);
  analysis.predecessors.b.push('changed');
  assert.deepEqual(plan, original);
});

test('finite individual durations cannot overflow into an infinite path', () => {
  const plan = planFor([{id: 'a', duration: Number.MAX_VALUE}, {id: 'b', after: ['a'], duration: Number.MAX_VALUE}]);
  assert.throws(() => analyzeDag(plan), {code: 'DAG_DURATION_OVERFLOW'});
});

test('shared contract fixture has critical path 40', () => {
  const plan = JSON.parse(readFileSync(new URL('../examples/dag/contract-fixture.json', import.meta.url), 'utf8'));
  assert.equal(analyzeDag(plan).critical_path_ms, 40);
});
