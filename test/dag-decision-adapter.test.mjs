import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {loadDagRoutingContract, makeDagDecision, allocateDagOwners} from '../src/orchestration/dag-decision-adapter.mjs';

const owner = (id, capacity, minimum = 0) => ({id, capacity, minimum});
const bundle = (id, size, eligible_owner_ids) => ({id,
  obligation_ids: Array.from({length: size}, (_, i) => `${id}.obligation${i}`), eligible_owner_ids,
  evidence_refs: [`public:${id}`]});
const typed = (request, choice = Object.keys(Object.values(request.questions)[0].criteria)[0]) =>
  ({answers: {[Object.keys(request.questions)[0]]: {type: 'choice', choice}}});
const allocate = (sizes, owners, extra = {}) => allocateDagOwners({
  bundles: sizes.map((size, i) => bundle(`b${i}`, size, owners.map(item => item.id))), owners,
  decide: async request => typed(request), ...extra});

function assertWitness(witness, bundles, owners, initialLoads = owners.map(() => 0)) {
  assert.equal(witness.assignments.length, bundles.length);
  assert.equal(new Set(witness.assignments.map(item => item.bundle_id)).size, bundles.length);
  const loads = [...initialLoads];
  for (const assignment of witness.assignments) {
    const item = bundles.find(candidate => candidate.id === assignment.bundle_id);
    const i = owners.findIndex(candidate => candidate.id === assignment.owner_id);
    assert(item);
    assert(i >= 0);
    assert(item.eligible_owner_ids.includes(assignment.owner_id));
    loads[i] += item.obligation_ids.length;
  }
  owners.forEach((item, i) => assert(loads[i] >= item.minimum && loads[i] <= item.capacity));
  assert.deepEqual(witness.final_loads, owners.map((item, i) => ({owner_id: item.id, load: loads[i]})));
}

test('DAG contract preserves every fixed English question and identifies the actual JSON source', () => {
  const contract = loadDagRoutingContract();
  const architecture = readFileSync(new URL('../docs/orchestration/jev-dag-design/ARCHITECTURE.md', import.meta.url), 'utf8');
  for (const question of Object.values(contract.kinds)) assert(architecture.includes(`> ${question.instructions}`));
  assert.equal(contract.source.sha256, createHash('sha256').update(readFileSync(contract.source.path)).digest('hex'));
  assert.equal(contract.policy.maximum_owners, 30);
  assert.equal(contract.policy.automatic_retries, 0);
  contract.kinds.owner.instructions = 'caller mutation';
  assert.notEqual(loadDagRoutingContract().kinds.owner.instructions, 'caller mutation');
});

test('generic semantic choices return registered proposed handlers only', async () => {
  const cases = [
    ['split', 'candidate_two', 'validateAndExpandNode'],
    ['split', 'need_candidate_revision', 'requestCandidateRevision'],
    ['relation', 'a_requires_b', 'proposeArtifactEdge'],
    ['relation', 'b_requires_a', 'proposeArtifactEdge'],
    ['relation', 'no_artifact_dependency', 'recordRelationNoEdge'],
    ['relation', 'both_require_each_other', 'requestBoundaryRevision'],
    ['relation', 'unknown', 'requestDependencyEvidence'],
    ['owner', 'owner_a', 'reserveAndAssign'],
    ['owner', 'revise_boundary', 'requestCandidateRevision'],
    ['profile', 'profile_fixture', 'bindProfile'],
    ['profile', 'need_profile_evidence', 'requestProfileEvidence'],
    ['failure', 'repair_local', 'repairLocal'],
    ['failure', 'repair_contract', 'repairContract'],
    ['failure', 'revise_dependency', 'reviseDependency'],
    ['failure', 'repair_verifier', 'repairVerifier'],
    ['failure', 'need_evidence', 'requestFailureEvidence'],
  ];
  for (const [kind, choice, handler] of cases) {
    const result = await makeDagDecision({kind, state: {evidence: ['public fixture']}, criteria: {[choice]: 'Fixture choice'},
      decide: () => assert.fail('A singleton must not call a model')});
    assert.equal(result.status, 'proposed');
    assert.equal(result.handler.id, handler);
    assert.equal(result.handler.status, 'proposed');
    assert.equal(result.handler.executable, false);
    assert.equal(result.selection_method, 'local_singleton');
    assert.equal(result.request, null);
    assert.equal(result.response, null);
  }
});

test('keep_scope requires an explicit leaf policy and cannot restore root count1', async () => {
  const base = {kind: 'split', criteria: {keep_scope: 'Keep this scope'}};
  for (const state of [{}, {split_policy: {scope: 'root', allow_keep_scope: true}}, {split_policy: {scope: 'leaf'}}]) {
    await assert.rejects(makeDagDecision({...base, state}), {code: 'DAG_KEEP_SCOPE_POLICY_REQUIRED'});
  }
  const result = await makeDagDecision({...base, state: {split_policy: {scope: 'leaf', allow_keep_scope: true}}});
  assert.equal(result.handler.id, 'markLeafCandidate');
  assert.equal(result.status, 'proposed');
});

test('generic wire requests use prepareDecision and exact questions without mutating caller state', async () => {
  const state = {goal: 'Preserve all source text', nested: {refs: ['a', 'b']}}, original = structuredClone(state);
  const criteria = {a_requires_b: 'A consumes B', unknown: 'Evidence insufficient'};
  const events = [];
  const result = await makeDagDecision({kind: 'dag.relation.v1', state, criteria,
    record: async event => { events.push(structuredClone(event)); event.kind = 'mutated'; },
    decide: async request => {
      assert.deepEqual(prepareDecision(request).body, request);
      assert.deepEqual(request.state.input, original);
      assert.equal(request.questions['dag.relation.v1'].instructions, loadDagRoutingContract().kinds.relation.instructions);
      request.state.input.goal = 'malicious callback mutation';
      return typed(request, 'unknown');
    }});
  assert.equal(result.kind, 'relation');
  assert.equal(result.handler.id, 'requestDependencyEvidence');
  assert.equal(result.selection_method, 'typed_choice');
  assert.deepEqual(result.request.state.input, original);
  assert.deepEqual(state, original);
  assert.deepEqual(events.map(event => event.event), ['dag_decision_requested', 'dag_decision_responded', 'dag_decision_proposed']);
});

test('zero candidates block without padding and unknown handler keys fail before dispatch', async () => {
  let calls = 0;
  const base = {kind: 'owner', state: {}, decide: async () => { calls++; }};
  const empty = await makeDagDecision({...base, criteria: {}});
  assert.equal(empty.status, 'blocked');
  assert.equal(empty.reason, 'no_candidates');
  for (const criteria of [{runArbitraryCode: 'No'}, {owner_: 'Empty ID'}, {owner_a: {function: 'no'}}]) {
    await assert.rejects(makeDagDecision({...base, criteria}));
  }
  await assert.rejects(makeDagDecision({...base, kind: 'not_registered', criteria: {}}), {code: 'UNKNOWN_DAG_DECISION_KIND'});
  assert.equal(calls, 0);
});

test('unserializable input and oversized wire payload fail before any callback; no silent trimming', async () => {
  let calls = 0;
  const base = {kind: 'relation', criteria: {a_requires_b: 'A', unknown: 'Unknown'}, decide: () => { calls++; }};
  for (const state of [{x: undefined}, {x: NaN}, {x: new Date()}, {x: () => {}}]) {
    await assert.rejects(makeDagDecision({...base, state}), {code: 'INVALID_DAG_DECISION_INPUT'});
  }
  await assert.rejects(makeDagDecision({...base, state: {source: 's'.repeat(256001)}}), {code: 'INVALID_REQUEST'});
  assert.equal(calls, 0);
});

test('failed or uncertain responses cannot be accepted even with a valid typed choice', async () => {
  const cases = [
    [{status: 'failed'}, 'DAG_DECISION_FAILED'],
    [{status: 'pending'}, 'DAG_DECISION_FAILED'],
    [{ok: false}, 'DAG_DECISION_FAILED'],
    [{error: {code: 'REJECTED'}}, 'DAG_DECISION_FAILED'],
    [{outcome_uncertain: true}, 'DAG_DECISION_UNCERTAIN'],
    [{outcomeUncertain: true}, 'DAG_DECISION_UNCERTAIN'],
  ];
  for (const [extra, code] of cases) {
    let calls = 0;
    const events = [];
    await assert.rejects(makeDagDecision({kind: 'failure', state: {}, criteria: {repair_local: 'Repair', need_evidence: 'Wait'},
      record: event => events.push(event), decide: async request => { calls++; return {...typed(request), ...extra}; }}), error => {
      assert.equal(error.code, code);
      assert.equal(error.automatic_retries, 0);
      assert.deepEqual(error.response, {...typed(error.request), ...extra});
      return true;
    });
    assert.equal(calls, 1);
    assert.equal(events.filter(event => event.event === 'dag_decision_rejected').length, 1);
  }
});

test('missing, extra, untyped, unknown, or injected answer choices reject without a second call', async () => {
  const replies = [null, {}, {answers: {}}, {answers: {wrong: {type: 'choice', choice: 'unknown'}}},
    {answers: {'dag.relation.v1': {type: 'noul', choice: 'unknown'}}},
    {answers: {'dag.relation.v1': {type: 'choice', choice: 'invented'}}},
    {answers: {'dag.relation.v1': {type: 'choice', choice: 'unknown', handler: 'execute'}}},
    {answers: {'dag.relation.v1': {type: 'choice', choice: 'unknown'}, extra: {type: 'choice', choice: 'unknown'}}},
    {answers: {'dag.relation.v1': {type: 'choice', choice: 'unknown', probabilities: {unknown: 1}}}},
    {answers: {'dag.relation.v1': {type: 'choice', choice: 'unknown', confidence: 2}}}];
  for (const response of replies) {
    let calls = 0;
    await assert.rejects(makeDagDecision({kind: 'relation', state: {}, criteria: {unknown: 'Unknown', a_requires_b: 'A'},
      decide: async () => { calls++; return response; }}), {code: 'INVALID_DAG_DECISION_ANSWER'});
    assert.equal(calls, 1);
  }
});

test('provider exceptions preserve uncertain status and partial reservations without replay', async () => {
  let calls = 0;
  await assert.rejects(allocate([1, 1, 1], [owner('a', 3), owner('b', 3)], {
    decide: async request => {
      calls++;
      if (calls === 1) return typed(request, 'owner_a');
      throw Object.assign(new Error('Private provider detail'), {code: 'TRANSPORT_ERROR', outcomeUncertain: true});
    }}), error => {
    assert.equal(error.code, 'DAG_DECISION_CALL_FAILED');
    assert.equal(error.cause_code, 'TRANSPORT_ERROR');
    assert.equal(error.outcome_uncertain, true);
    assert.equal(error.automatic_retries, 0);
    assert.equal(error.partial_allocation.assignments.length, 1);
    assert.deepEqual(error.partial_allocation.remaining_bundle_ids, ['b1', 'b2']);
    return true;
  });
  assert.equal(calls, 2);
});

test('unclassified callback errors default to uncertain while explicitly known non-submission stays distinct', async () => {
  for (const [extra, expected] of [[{}, true], [{outcome_uncertain: false}, false], [{outcomeUncertain: false}, false]]) {
    let calls = 0;
    await assert.rejects(allocate([1], [owner('a', 1), owner('b', 1)], {
      decide: async () => { calls++; throw Object.assign(new Error('Callback failed'), extra); }}), error => {
      assert.equal(error.code, 'DAG_DECISION_CALL_FAILED');
      assert.equal(error.outcome_uncertain, expected);
      assert.equal(error.response_received, false);
      assert.equal(error.automatic_retries, 0);
      return true;
    });
    assert.equal(calls, 1);
  }
  await assert.rejects(allocate([1], [owner('a', 1), owner('b', 1)], {decide: async () => undefined}), error => {
    assert.equal(error.code, 'INVALID_DAG_DECISION_ANSWER');
    assert.equal(error.outcome_uncertain, true);
    assert.equal(error.response_received, true);
    return true;
  });
});

test('packing counterexample capacities [3,3] and indivisible [2,2,2] blocks before a model call', async () => {
  const result = await allocate([2, 2, 2], [owner('a', 3), owner('b', 3)], {
    decide: () => assert.fail('Total capacity is not a packing witness')});
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'no_feasible_owner');
  assert.deepEqual(result.assignments, []);
  assert.deepEqual(result.remaining_bundle_ids, ['b0', 'b1', 'b2']);
  assert(result.feasibility.candidates.every(item => item.status === 'infeasible' && item.witness === null));
});

test('residual packing removes a locally fitting but globally impossible owner; singleton never calls', async () => {
  const owners = [owner('a', 3), owner('b', 4)];
  const result = await allocate([2, 3, 2], owners, {decide: () => assert.fail('All choices are proven singletons')});
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.assignments.map(item => item.owner_id), ['b', 'a', 'b']);
  assert(result.assignments.every(item => item.selection_method === 'local_singleton'));
  assert.equal(result.decisions[0].feasibility.candidates[0].status, 'infeasible');
  assert.equal(result.decisions[0].feasibility.candidates[1].status, 'feasible');
  assert.deepEqual(result.decisions[0].feasibility.candidates[1].witness.assignments,
    [{bundle_id: 'b1', owner_id: 'a'}, {bundle_id: 'b2', owner_id: 'b'}]);
  assertWitness(result.feasibility.witness, [2, 3, 2].map((size, i) => bundle(`b${i}`, size, ['a', 'b'])), owners);
});

test('minimum final loads and eligibility are part of the exact witness', async () => {
  const owners = [owner('a', 3), owner('b', 3, 2)];
  const bundles = [bundle('large', 2, ['a', 'b']), bundle('restricted', 1, ['a'])];
  const result = await allocateDagOwners({bundles, owners, decide: () => assert.fail('Eligibility makes both choices forced')});
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.assignments.map(item => item.owner_id), ['b', 'a']);
  assertWitness(result.feasibility.witness, bundles, owners);
  const empty = await allocateDagOwners({bundles: [], owners: [owner('a', 2, 1)]});
  assert.equal(empty.status, 'blocked');
  assert.equal(empty.reason, 'minimum_load_unsatisfied');
  const zero = await allocateDagOwners({bundles: [], owners: []});
  assert.equal(zero.status, 'completed');
});

test('each request observes all earlier reservations, and callbacks cannot mutate the allocation', async () => {
  const owners = [owner('a', 2, 1), owner('b', 2, 1)];
  const bundles = [0, 1, 2].map(i => bundle(`b${i}`, 1, ['a', 'b']));
  const original = structuredClone({owners, bundles}), requests = [], events = [];
  const result = await allocateDagOwners({bundles, owners, record: event => { events.push(structuredClone(event)); event.owner_load = -100; },
    decide: async request => {
      requests.push(structuredClone(request));
      assert.deepEqual(prepareDecision(request).body, request);
      request.state.input.owners[0].capacity = 10000;
      return typed(request, 'owner_a');
    }});
  assert.equal(requests.length, 2);
  assert.deepEqual(requests.map(request => request.state.input.reservation_revision), [0, 1]);
  assert.deepEqual(requests[1].state.input.assignments, [{bundle_id: 'b0', owner_id: 'a'}]);
  assert.deepEqual(requests[1].state.input.owners.map(item => item.load), [1, 0]);
  assert.deepEqual(result.owners.map(item => item.load), [2, 1]);
  assert.deepEqual({owners, bundles}, original);
  const reserved = events.filter(event => event.event === 'dag_owner_reserved');
  assert.deepEqual(reserved.map(event => event.reservation_revision), [1, 2, 3]);
  assert(reserved.every(event => event.handler.worker_dispatched === false));
  assert(events.indexOf(reserved[0]) < events.findIndex(event => event.event === 'dag_decision_requested' && event.request.state.input.reservation_revision === 1));
});

test('search exhaustion remains unknown, is never offered, and never produces a packing witness', async () => {
  const result = await allocate([1, 1, 1], [owner('a', 3), owner('b', 3)], {maxSearchNodes: 1,
    decide: () => assert.fail('Unproven choices must not be offered')});
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason, 'feasibility_unknown');
  assert.equal(result.feasibility.excluded_unknown_count, 2);
  assert(result.feasibility.candidates.every(item => item.status === 'feasibility_unknown' && item.nodes_visited === 1 && item.witness === null));
  assert.deepEqual(result.assignments, []);
});

test('empty eligibility blocks and malformed bounds, references, or duplicate obligations reject before decisions', async () => {
  const owners = [owner('a', 3), owner('b', 3)];
  const blocked = await allocateDagOwners({owners, bundles: [bundle('x', 1, [])]});
  assert.equal(blocked.reason, 'no_feasible_owner');
  let calls = 0;
  const decide = () => { calls++; };
  const invalid = [
    {owners: [owner('a', -1)]}, {owners: [owner('a', 1, 2)]}, {owners: [owner('a', 3), owner('a', 3)]},
    {owners: Array.from({length: 31}, (_, i) => owner(`owner${i}`, 2))},
    {bundles: [bundle('x', 0, ['a'])]}, {bundles: [bundle('x', 1, ['unknown'])]},
    {bundles: [bundle('x', 1, ['a']), bundle('x', 1, ['a'])]},
    {bundles: [bundle('x', 1, ['a']), {...bundle('y', 1, ['a']), obligation_ids: ['x.obligation0']}]},
    {maxSearchNodes: 0}, {maxSearchNodes: 1.2},
  ];
  for (const extra of invalid) await assert.rejects(allocateDagOwners({owners, bundles: [bundle('x', 1, ['a'])], decide, ...extra}));
  assert.equal(calls, 0);
});

test('unoffered owner answer stops without trimming, reallocation, or fabricated completion', async () => {
  let calls = 0;
  await assert.rejects(allocate([2, 2], [owner('a', 2), owner('b', 2), owner('c', 1)], {
    decide: async request => { calls++; assert(!Object.hasOwn(request.questions['dag.owner.v1'].criteria, 'owner_c')); return typed(request, 'owner_c'); }}), error => {
    assert.equal(error.code, 'INVALID_DAG_DECISION_ANSWER');
    assert.deepEqual(error.partial_allocation.assignments, []);
    assert.deepEqual(error.partial_allocation.remaining_bundle_ids, ['b0', 'b1']);
    assert.deepEqual(error.response.answers['dag.owner.v1'].choice, 'owner_c');
    return true;
  });
  assert.equal(calls, 1);
});

test('30 owners may allocate 80 bundles; every offered candidate has a replayable exact witness', async () => {
  const owners = Array.from({length: 30}, (_, i) => owner(`w${i}`, 3, 2));
  const bundles = Array.from({length: 80}, (_, i) => bundle(`b${i}`, 1, owners.map(item => item.id)));
  let calls = 0, maximumChoices = 0;
  const result = await allocateDagOwners({owners, bundles, decide: async request => {
    calls++;
    const choices = Object.keys(request.questions['dag.owner.v1'].criteria);
    maximumChoices = Math.max(maximumChoices, choices.length);
    assert(choices.length >= 2 && choices.length <= 30);
    assert.equal(request.state.input.bundles.length, 80);
    assert.equal(request.state.input.revise_boundary_available, false);
    assert.deepEqual(prepareDecision(request).body, request);
    return typed(request);
  }});
  assert.equal(result.status, 'completed');
  assert.equal(result.coverage.bundle_count, 80);
  assert.equal(result.coverage.obligation_count, 80);
  assert.equal(maximumChoices, 30);
  assert(calls > 0 && calls < 80);
  assertWitness(result.feasibility.witness, bundles, owners);
  const loads = owners.map(() => 0);
  for (const [index, decision] of result.decisions.entries()) {
    for (const candidate of decision.feasibility.candidates.filter(item => item.status === 'feasible')) {
      const next = [...loads];
      next[owners.findIndex(item => item.id === candidate.owner_id)] += bundles[index].obligation_ids.length;
      assertWitness(candidate.witness, bundles.slice(index + 1), owners, next);
    }
    loads[owners.findIndex(item => item.id === result.assignments[index].owner_id)]++;
  }
});

// Independent exhaustive enumeration: no solver pruning, memoization, symmetry,
// or capacity shortcut. Enumerate every owner tuple and inspect terminal loads.
function bruteFeasibleFirstOwners(bundles, owners) {
  const choices = new Set();
  const visit = assigned => {
    if (assigned.length !== bundles.length) {
      for (const item of owners) visit([...assigned, item.id]);
      return;
    }
    const loads = new Map(owners.map(item => [item.id, 0]));
    for (const [i, ownerId] of assigned.entries()) {
      if (!bundles[i].eligible_owner_ids.includes(ownerId)) return;
      loads.set(ownerId, loads.get(ownerId) + bundles[i].obligation_ids.length);
    }
    if (owners.every(item => loads.get(item.id) >= item.minimum && loads.get(item.id) <= item.capacity)) choices.add(assigned[0]);
  };
  visit([]);
  return choices;
}

test('exact candidate feasibility agrees with exhaustive small packing, eligibility and minimum-load enumeration', async () => {
  const eligibility = [['a'], ['b'], ['a', 'b']];
  let checked = 0;
  for (let capacityA = 1; capacityA <= 3; capacityA++) for (let minimumA = 0; minimumA <= capacityA; minimumA++) {
    for (let capacityB = 1; capacityB <= 3; capacityB++) for (let minimumB = 0; minimumB <= capacityB; minimumB++) {
      for (const sizeA of [1, 2]) for (const sizeB of [1, 2]) for (const eligibleA of eligibility) for (const eligibleB of eligibility) {
        const owners = [owner('a', capacityA, minimumA), owner('b', capacityB, minimumB)];
        const bundles = [bundle('x', sizeA, eligibleA), bundle('y', sizeB, eligibleB)];
        const expected = bruteFeasibleFirstOwners(bundles, owners);
        let firstCandidates;
        const result = await allocateDagOwners({bundles, owners, decide: async request => typed(request),
          record: event => { if (event.event === 'dag_owner_candidates' && !firstCandidates) firstCandidates = event; }});
        assert.deepEqual(new Set(firstCandidates.feasible_owner_ids), expected, JSON.stringify({bundles, owners}));
        assert.equal(result.status, expected.size ? 'completed' : 'blocked');
        if (expected.size) assertWitness(result.feasibility.witness, bundles, owners);
        checked++;
      }
    }
  }
  assert.equal(checked, 2916);
});
