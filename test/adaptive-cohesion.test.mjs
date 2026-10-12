import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildCohesionRequests, clusterUnits, planCohesionDag} from '../src/orchestration/adaptive-cohesion.mjs';

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

test('clusterUnits merges cohesive pairs, respects capacity and hard leaf limits', () => {
  const ids = ['u0', 'u1', 'u2', 'u3', 'u4', 'u5'];
  const high = new Set(['u0|u1', 'u2|u3', 'u3|u4']);
  const affinity = (a, b) => high.has([a, b].sort().join('|')) ? 0.9 : 0.1;
  const base = {unit_ids: ids, affinity, threshold: 0.5, maxRelationPairs: 435};
  const free = clusterUnits({...base, overload: () => [], maxLeaves: 30});
  assert.deepEqual(free.clusters, [['u0', 'u1'], ['u2', 'u3', 'u4'], ['u5']]);
  const capped = clusterUnits({...base, overload: units => units.length > 2 ? ['units'] : [], maxLeaves: 30});
  assert.deepEqual(capped.clusters, [['u0', 'u1'], ['u2', 'u3'], ['u4'], ['u5']]);
  const forced = clusterUnits({...base, overload: () => [], maxLeaves: 2});
  assert.equal(forced.clusters.length, 2);
  assert.ok(forced.merges.some(merge => merge.reason === 'hard_limit'));
  assert.throws(() => clusterUnits({...base, affinity: () => 0.9, overload: () => [], maxLeaves: 30}), /ADAPTIVE_COHESION_SINGLE_CLUSTER/);
});

test('cohesion requests cover every pair once with noul questions under the 64-question limit', () => {
  const input = fixture(12);
  const built = buildCohesionRequests({catalog: input.catalog, requirement_descriptions: input.requirement_descriptions,
    max_concurrency: 2, limits});
  const ids = built.flatMap(batch => Object.keys(batch.request.questions));
  assert.equal(ids.length, 66); assert.equal(new Set(ids).size, 66);
  assert.ok(built.every(batch => Object.keys(batch.request.questions).length <= 64));
  assert.ok(built.every(batch => Object.values(batch.request.questions).every(question => question.type === 'noul'
    && question.criteria === undefined && question.instructions.includes('`cohesion_question.statement`'))));
  assert.equal(built[0].request.state.cohesion_question.statement.length > 0, true);
});

test('planCohesionDag sends only cohesion and relation questions and plans one leaf per cluster', async () => {
  const input = fixture(5), stages = [];
  const planned = await planCohesionDag({...input, decompositionPolicy: 'balanced-v2', decide: async (request, meta) => {
    stages.push(meta.stage);
    return {answers: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => [id,
      question.type === 'noul' ? {type: 'noul', noul: /\.u0\.u1$|\.u2\.u3$/.test(id) ? 0.9 : 0.1}
        : {type: 'choice', choice: 'no_dependency'}]))};
  }});
  assert.equal(planned.status, 'planned');
  assert.deepEqual(planned.leaves.map(leaf => leaf.unit_ids), [['u0', 'u1'], ['u2', 'u3'], ['u4']]);
  assert.deepEqual(stages, ['split', 'relations']);
  assert.equal(planned.cohesion.pair_count, 10);
  assert.equal(planned.relations.length, 3);
});
