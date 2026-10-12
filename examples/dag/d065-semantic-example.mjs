import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createDagSemanticState, createDagSemanticController} from '../../src/orchestration/dag-semantic-handlers.mjs';

// Preparation is deterministic fixture composition, not a model-generated plan.
// The live runner instead provides public atoms and actual owner-choice receipts.
export function semanticExample() {
  const start = performance.now();
  const partition = JSON.parse(readFileSync(new URL('./contract-fixture.json', import.meta.url), 'utf8'));
  const atoms = partition.tasks.filter(task => task.kind === 'implementation');
  const merged = key => [...new Set(atoms.flatMap(task => task[key]))];
  const root = {...structuredClone(atoms[0]), id: 'root-implementation', requirement_ids: merged('requirement_ids'),
    input_artifact_ids: merged('input_artifact_ids'), output_artifact_ids: merged('output_artifact_ids'),
    check_ids: merged('check_ids'), read_scope: merged('read_scope'), write_scope: merged('write_scope')};
  root.duration = {basis: 'unknown', estimate_ms: null, sample_count: 0, source_refs: []};
  const plan = {...structuredClone(partition), tasks: [root, ...structuredClone(partition.tasks.filter(task => task.kind === 'verification'))],
    workers: [structuredClone(partition.workers[0])], artifacts: partition.artifacts.map(artifact => ({...artifact, producer_task_id: root.id}))};
  const payload = {expected_graph_revision: plan.graph_revision, scope: 'root', target_task_ids: [root.id],
    candidates: [{id: 'allocated', plan: partition, evidence_refs: ['fixture:public-core-ui-boundaries']}],
    available_workers: partition.workers,
    preparation: {method: 'deterministic_fixture_atom_partition', source_refs: ['examples/dag/contract-fixture.json'],
      wall_ms: performance.now() - start, usage: null, cost: null}};
  return {state: createDagSemanticState({plan}), payload};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const {state, payload} = semanticExample();
  const controller = createDagSemanticController({state});
  const result = await controller.apply({decision: {kind: 'split', type: 'choice', choice: 'candidate_allocated'}, payload});
  console.log(JSON.stringify({status: result.status, graph_revision: result.state.plan.graph_revision,
    worker_count: result.action.worker_count, tasks: result.state.plan.tasks.map(task => task.id),
    selection_method: result.selection_method, model_calls: 0}, null, 2));
}
