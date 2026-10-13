import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildUnitRelationRequests, layeredClusters, planLayeredDag} from '../src/orchestration/adaptive-layered-decomposition.mjs';

const limits = {max_units: 30, max_artifacts: 60, max_files: 60, max_leaves: 30, max_depth: 3,
  max_nodes: 59, max_relation_pairs: 435, max_decisions: 128, relation_batch_size: 32, max_request_bytes: 240000};
function fixture(count) {
  const quotes = Array.from({length: count}, (_, i) => `Public clause ${i}: provide interface value_${i}.`);
  const source = quotes.join('\n'), requirement_ids = quotes.map((_, i) => `R${i}`);
  const catalog = {schema_version: 'adaptive-catalog/v1', source_sha256: createHash('sha256').update(source).digest('hex'),
    evidence: quotes.map((quote, i) => ({id: `e${i}`, quote})),
    units: quotes.map((_, i) => ({id: `u${i}`, title: `Component ${i}`, requirement_ids: [`R${i}`], artifact_ids: [`a${i}`],
      interface: `Exports value_${i}.`, evidence_ids: [`e${i}`]})),
    artifacts: quotes.map((_, i) => ({id: `a${i}`, paths: [`src/c${i}.txt`], description: `Component ${i}.`, evidence_ids: [`e${i}`]}))};
  const check = (id, phase, artifact_ids, requirement_ids) => ({id, version: 'v1', phase, artifact_ids, requirement_ids,
    runner_ref: 'fixture', argv: ['fixture', id], cwd: 'src', environment_ref: 'fixture-env', source_ref: 'test'});
  return {catalog, source, requirement_ids,
    requirement_descriptions: requirement_ids.map((id, i) => ({id, text: quotes[i], source_refs: [`public:${i}`]})),
    checks: [...quotes.map((_, i) => check(`local${i}`, 'local', [`a${i}`], [`R${i}`])),
      check('public-all', 'integration', quotes.map((_, i) => `a${i}`), requirement_ids)],
    profile_id: 'fixture-profile', goal_revision: 'fixture-v1', limits: {...limits}};
}
const relation = (a, b, choice, coupling = choice === 'no_dependency' ? 0 : 1) => ({a, b, choice, coupling,
  edge: choice === 'a_requires_b' ? [a, b] : choice === 'b_requires_a' ? [b, a] : null, together: choice === 'unknown'});
const pairsOf = ids => ids.flatMap((a, i) => ids.slice(i + 1).map(b => [a, b]));

test('a four-level unit chain is repaired to the target depth by merging along the longest path', () => {
  const ids = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'];
  const chain = new Set(['u1|u0', 'u2|u1', 'u3|u2']); // consumer|producer: u3 -> u2 -> u1 -> u0
  const relations = pairsOf(ids).map(([a, b]) => chain.has(`${a}|${b}`) ? relation(a, b, 'a_requires_b')
    : chain.has(`${b}|${a}`) ? relation(a, b, 'b_requires_a') : relation(a, b, 'no_dependency'));
  const base = {unit_ids: ids, relations, threshold: 0.5, targetCount: 4, targetDepth: 2, maxLeaves: 30, maxRelationPairs: 435};
  const free = layeredClusters({...base, overload: () => []});
  assert.equal(free.depth_target_met, true); assert.ok(free.depth <= 2);
  const capped = layeredClusters({...base, overload: units => units.length > 2 ? ['units'] : []});
  assert.ok(capped.depth <= 2, JSON.stringify(capped.clusters));
  assert.ok(capped.clusters.every(units => units.length <= 2));
  assert.ok(capped.merges.some(merge => merge.reason === 'depth'));
});

test('unknown pairs share a leaf and an impossible forced merge stops planning', () => {
  const ids = ['u0', 'u1', 'u2'];
  const relations = [relation('u0', 'u1', 'unknown'), relation('u0', 'u2', 'no_dependency'), relation('u1', 'u2', 'no_dependency')];
  const base = {unit_ids: ids, relations, threshold: 0.5, targetCount: 4, targetDepth: 2, maxLeaves: 30, maxRelationPairs: 435};
  assert.deepEqual(layeredClusters({...base, overload: () => []}).clusters, [['u0', 'u1'], ['u2']]);
  assert.throws(() => layeredClusters({...base, overload: units => units.length > 1 ? ['units'] : []}), /ADAPTIVE_LAYERED_FORCED_MERGE_CAPACITY/);
});

test('unit relation requests carry four labelled options per pair within 64 questions', () => {
  const input = fixture(12);
  const built = buildUnitRelationRequests({catalog: input.catalog, requirement_descriptions: input.requirement_descriptions, max_concurrency: 2, limits});
  const questions = built.flatMap(batch => Object.entries(batch.request.questions));
  assert.equal(questions.length, 66);
  assert.ok(built.every(batch => Object.keys(batch.request.questions).length <= 64));
  const [, first] = questions[0];
  assert.deepEqual(Object.keys(first.criteria), ['a_requires_b', 'b_requires_a', 'no_dependency', 'unknown']);
  assert.match(first.criteria.a_requires_b, /^u0 requires u1: u1 must produce \[src\/c1\.txt\]/);
});

test('planLayeredDag sends only unit relation questions and derives leaf relations from them', async () => {
  const input = fixture(6), stages = [];
  const edges = new Set(['u1|u0', 'u2|u1', 'u3|u2', 'u5|u4']);
  const planned = await planLayeredDag({...input, decide: async (request, meta) => {
    stages.push(meta.stage);
    return {answers: Object.fromEntries(Object.keys(request.questions).map(id => {
      const [a, b] = id.split('.').slice(-2);
      const choice = edges.has(`${a}|${b}`) ? 'a_requires_b' : edges.has(`${b}|${a}`) ? 'b_requires_a' : 'no_dependency';
      return [id, {type: 'choice', choice, confidence: 0.9}];
    }))};
  }});
  assert.equal(planned.status, 'planned');
  assert.deepEqual(stages, ['split']);
  assert.equal(planned.layered.depth_target_met, true);
  const consumers = planned.plan.tasks.filter(task => task.kind === 'implementation' && task.input_artifact_ids.length);
  assert.ok(consumers.every(task => planned.plan.tasks.filter(t => task.input_artifact_ids.some(id => t.output_artifact_ids.includes(id)))
    .every(producer => producer.input_artifact_ids.length === 0)), 'leaf DAG depth must be at most 2');
});

test('v2 orders leaves only for needs-files answers; interface-specified use groups without ordering', async () => {
  const {loadLayeredContract, LAYERED_CONTRACTS} = await import('../src/orchestration/adaptive-layered-decomposition.mjs');
  const contract = loadLayeredContract(LAYERED_CONTRACTS.v2), input = fixture(4), stages = [];
  const planned = await planLayeredDag({...input, contractPath: LAYERED_CONTRACTS.v2, decide: async (request, meta) => {
    stages.push(meta.stage);
    assert.deepEqual(Object.keys(Object.values(request.questions)[0].criteria), contract.choices);
    return {answers: Object.fromEntries(Object.keys(request.questions).map(id => {
      const [a, b] = id.split('.').slice(-2);
      const choice = a === 'u0' && b === 'u1' ? 'a_uses_b_interface' : a === 'u2' && b === 'u3' ? 'a_needs_b_files' : 'no_dependency';
      return [id, {type: 'choice', choice, confidence: 0.9}];
    }))};
  }});
  assert.deepEqual(stages, ['split']);
  assert.deepEqual(planned.layered.edges, [['u2', 'u3']]);
  const leafOf = unit => planned.plan.tasks.find(task => task.output_artifact_ids.includes(`a${unit.slice(1)}`));
  assert.deepEqual(leafOf('u0').input_artifact_ids, []);
});
