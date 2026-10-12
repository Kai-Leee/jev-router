import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {planAdaptiveDag} from '../src/orchestration/adaptive-dag-planner.mjs';
import {createAdaptiveDecompositionBalancer, projectBalancedRelationState} from '../src/orchestration/adaptive-decomposition-balancing.mjs';

function fixture() {
  const requirements = Array.from({length: 11}, (_, i) => ({id: `R${i}`, text: `Public requirement ${i}: preserve component behavior.`, source_refs: ['public-spec']}));
  const source = requirements.map(r => r.text).join('\n');
  const catalog = {schema_version: 'adaptive-catalog/v1', source_sha256: createHash('sha256').update(source).digest('hex'),
    evidence: requirements.map(r => ({id: `E${r.id}`, quote: r.text})),
    units: Array.from({length: 8}, (_, i) => ({id: `U${i}`, title: `Component ${i}`,
      requirement_ids: i === 0 ? requirements.slice(0, 4).map(r => r.id) : [requirements[i + 3].id],
      artifact_ids: [`A${i}`], interface: i === 0 ? 'src.comp1.call returns stable data; module src.comp10 is unrelated.' : `src.comp${i}.call() returns stable data.`,
      evidence_ids: [`E${requirements[i === 0 ? 0 : i + 3].id}`]})),
    artifacts: Array.from({length: 8}, (_, i) => ({id: `A${i}`, paths: i === 0 ? ['src/comp0.py', 'src/extra.py', 'src/extra2.py'] : [`src/comp${i}.py`],
      description: `component ${i}`, evidence_ids: [`E${requirements[i === 0 ? 0 : i + 3].id}`]}))};
  const check = (name, phase, artifacts, reqs) => ({id: name, version: 'fixture-v1', phase, artifact_ids: artifacts, requirement_ids: reqs,
    runner_ref: 'fixture-public-check', argv: ['fixture', name], cwd: 'src', environment_ref: 'fixture-env', source_ref: 'test/adaptive-decomposition-balancing.test.mjs'});
  return {catalog, source, requirement_ids: requirements.map(r => r.id), requirement_descriptions: requirements,
    checks: [...catalog.units.map((u, i) => check(`local${i}`, 'local', u.artifact_ids, u.requirement_ids)),
      check('public', 'integration', catalog.artifacts.map(a => a.id), requirements.map(r => r.id))],
    profile_id: 'fixture-opus-medium', goal_revision: 'fixture-goal', max_concurrency: 2,
    limits: {max_units: 30, max_artifacts: 60, max_files: 60, max_leaves: 30, max_depth: 1,
      max_nodes: 59, max_relation_pairs: 435, max_decisions: 128, relation_batch_size: 32, max_request_bytes: 240000}};
}
const firstLegal = request => ({answers: Object.fromEntries(Object.entries(request.questions).map(([id, q]) => [id,
  {type: 'choice', choice: id.startsWith('adaptive.relation') ? 'no_dependency'
    : id.startsWith('adaptive.split_count') ? (Object.hasOwn(q.criteria, 'keep') ? 'keep' : Object.keys(q.criteria)[0])
      : Object.keys(q.criteria)[0]}]))});

test('first-child concentration is bounded, oversized soft-depth leaves split, and all original units/checks survive', async () => {
  const input = fixture(), before = structuredClone(input), events = [], requests = [];
  const legacy = await planAdaptiveDag({...input, decide: async request => firstLegal(request)});
  assert.deepEqual(legacy.leaves.map(leaf => leaf.unit_ids.length), [7, 1]);
  assert.equal(legacy.decomposition_policy, undefined);
  const result = await planAdaptiveDag({...input, decompositionPolicy: 'balanced-v2',
    decide: async request => { requests.push(request); return firstLegal(request); }, record: async event => events.push(event)});
  assert.equal(result.status, 'planned');
  assert.ok(Math.max(...result.tree.map(node => node.depth)) > input.limits.max_depth);
  assert.deepEqual(result.plan.checks, input.checks);
  assert.deepEqual([...result.leaves.flatMap(leaf => leaf.unit_ids)].sort(), input.catalog.units.map(unit => unit.id).sort());
  assert.deepEqual([...result.leaves.flatMap(leaf => leaf.requirement_ids)].sort(), [...input.requirement_ids].sort());
  const balancer = createAdaptiveDecompositionBalancer(input);
  assert.deepEqual(balancer.policy.leaf_capacity, {units: 2, requirements: 4, artifacts: 2, paths: 3});
  assert.ok(result.leaves.every(leaf => !balancer.overload(leaf.unit_ids).length));
  assert.ok(events.some(event => event.balancing?.depth?.capacity_escape));
  assert.ok(events.some(event => event.event === 'adaptive_balancing_options_prepared' && !event.balancing.model_decides));
  assert.ok(requests.some(request => Object.keys(request.questions)[0] === 'adaptive.membership.v2'));
  const firstSplit = requests.find(request => request.state.scope === 'root');
  assert.equal(firstSplit.state.execution_context.max_concurrency, 2);
  assert.ok(firstSplit.state.balancing.literal_interface_references.some(ref => ref.from_unit_id === 'U0' && ref.to_unit_id === 'U1'));
  assert.ok(firstSplit.state.balancing.literal_interface_references.every(ref => ref.dependency_status === 'unconfirmed'));
  assert.ok(result.relations.every(relation => relation.choice === 'no_dependency'));
  for (const event of events.filter(event => event.event === 'adaptive_scope_split')) {
    const parent = result.tree.find(node => node.id === event.node_id);
    assert.ok(event.children.every(child => child.unit_ids.length > 0 && child.unit_ids.length <= Math.ceil(parent.unit_ids.length / event.children.length)));
  }
  assert.deepEqual(input, before);
});

test('hard structural exhaustion blocks instead of silently committing an oversized leaf; unsupported policy never calls', async () => {
  const input = fixture(); let commits = 0;
  const result = await planAdaptiveDag({...input, decompositionPolicy: 'balanced-v2', limits: {...input.limits, max_nodes: 3},
    decide: async request => firstLegal(request), commit: async () => { commits++; }});
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'ADAPTIVE_BALANCE_CAPACITY_INFEASIBLE');
  assert.equal(result.outcome_uncertain, false);
  assert.equal(result.dispatch_allowed, false);
  assert.equal(result.plan, null);
  assert.equal(commits, 0);
  let calls = 0;
  await assert.rejects(() => planAdaptiveDag({...input, decompositionPolicy: 'unknown-policy', decide: async () => { calls++; }}),
    {code: 'ADAPTIVE_DECOMPOSITION_POLICY_INVALID'});
  assert.equal(calls, 0);
});

test('relation projection keeps exact inline interfaces and rejects missing, conflicting or colliding references', () => {
  const units = fixture().catalog.units.slice(0, 2);
  const leaf = {id: 'leaf', unit_ids: units.map(unit => unit.id), interfaces: units.map(unit => ({unit_id: unit.id, title: unit.title, interface: unit.interface})),
    paths: ['unchanged.py'], unknown_metadata: {preserved: true}};
  const raw = {units, leaves: [leaf], requirement_descriptions: [{id: 'R', text: 'Do not shorten this exact requirement.'}],
    evidence: [{id: 'e', quote: 'Complete original source quote.'}], accepted_relations: [{choice: 'no_dependency'}]};
  const before = structuredClone(raw), result = projectBalancedRelationState(raw);
  assert.deepEqual(raw, before);
  assert.deepEqual(result.state.units, raw.units);
  assert.deepEqual(result.state.requirement_descriptions, raw.requirement_descriptions);
  assert.deepEqual(result.state.evidence, raw.evidence);
  assert.deepEqual(result.state.leaves[0].unknown_metadata, leaf.unknown_metadata);
  const reconstructed = result.state.units.filter(unit => result.state.leaves[0].unit_ids.includes(unit.id))
    .map(unit => ({unit_id: unit.id, title: unit.title, interface: unit.interface}));
  assert.deepEqual(reconstructed, leaf.interfaces);
  for (const change of [
    value => { value.units.pop(); },
    value => { value.leaves[0].interfaces[0].interface = 'different contract'; },
    value => { value.leaf_interface_resolution = 'existing unknown semantics'; },
  ]) {
    const invalid = structuredClone(raw); change(invalid);
    assert.throws(() => projectBalancedRelationState(invalid), {code: 'ADAPTIVE_BALANCE_RELATION_PROJECTION_INVALID'});
  }
});
