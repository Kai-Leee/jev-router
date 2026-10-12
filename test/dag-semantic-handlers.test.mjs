import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDagSemanticState, applyDagSemanticDecision, createDagSemanticController, loadDagSemanticContract} from '../src/orchestration/dag-semantic-handlers.mjs';
import {semanticExample} from '../examples/dag/d065-semantic-example.mjs';
import {analyzeDag} from '../src/orchestration/artifact-dag.mjs';
import {prepareDecision} from '../src/client.mjs';

const choose = (state, kind, choice, payload) => applyDagSemanticDecision({state, decision: {kind, type: 'choice', choice}, payload});
const fixture = () => JSON.parse(readFileSync(new URL('../examples/dag/contract-fixture.json', import.meta.url), 'utf8'));
const relationPayload = state => ({expected_graph_revision: state.plan.graph_revision,
  task_a_id: 'build-core', task_b_id: 'build-ui',
  artifact_ids_by_direction: {b_requires_a: ['artifact-core'], a_requires_b: ['artifact-ui']},
  artifact_bindings: {'artifact-core': {paths: ['examples/dag/output/core.json']}, 'artifact-ui': {paths: ['examples/dag/output/ui.json']}},
  evidence: [{id: 'public-artifact-contract', source_ref: 'fixture:public-contract', text: 'Public core/UI artifact contract; fixture only.',
    task_ids: ['build-core', 'build-ui'], artifact_ids: ['artifact-core', 'artifact-ui']}]});
const profilePayload = state => ({expected_graph_revision: state.plan.graph_revision, task_id: 'build-core',
  profiles: [{id: 'observed-fixture', model: 'fixture-only', effort: 'medium', available: true, tool_compatible: true, evidence_refs: ['fixture:capability']} ]});
const failurePayload = (state, extra = {}) => ({expected_graph_revision: state.plan.graph_revision, task_id: 'build-core',
  failure: {attempt_id: 'attempt-failed-1', outcome_uncertain: false, category: 'product', evidence_refs: ['fixture:failure-command-and-check']},
  authorized_actions: ['repair_local', 'repair_verifier', 'revise_dependency'], next_attempt_id: 'attempt-repair-2', ...extra});

test('split commits a complete executable partition with unchanged requirement/check/artifact contracts and distinct root worker count', () => {
  const {state, payload} = semanticExample(), original = structuredClone(state);
  const result = choose(state, 'split', 'candidate_allocated', payload);
  assert.equal(result.status, 'applied');
  assert.equal(result.action.type, 'partition_committed');
  assert.equal(result.action.worker_count, 2);
  assert.equal(result.state.plan.tasks.length, 3);
  assert.deepEqual(result.state.plan.checks, state.plan.checks);
  assert.deepEqual(result.state.plan.requirement_ids, state.plan.requirement_ids);
  assert.deepEqual(result.state.plan.artifacts.map(item => item.producer_task_id), ['build-core', 'build-ui']);
  assert.deepEqual(analyzeDag(result.state.plan).predecessors['verify-integration'], ['build-core', 'build-ui']);
  assert.notEqual(result.state.plan.graph_revision, state.plan.graph_revision);
  assert.deepEqual(state, original);
  const rootOne = structuredClone(payload);
  rootOne.candidates[0].plan.tasks.filter(task => task.kind === 'implementation').forEach(task => { task.worker_id = 'worker-core'; });
  assert.throws(() => choose(state, 'split', 'candidate_allocated', rootOne), {code: 'DAG_PARTITION_NOT_PROGRESSIVE'});
  assert.throws(() => choose(result.state, 'split', 'candidate_allocated', payload), {code: 'DAG_STALE_GRAPH_REVISION'});
  const leafState = createDagSemanticState({plan: fixture()});
  const leaf = choose(leafState, 'split', 'keep_scope', {expected_graph_revision: leafState.plan.graph_revision, scope: 'leaf',
    target_task_ids: ['build-core'], candidates: [], allow_keep_scope: true, preparation: payload.preparation});
  assert.equal(leaf.action.type, 'leaf_retained');
  assert.deepEqual(leaf.state.plan.tasks, leafState.plan.tasks);
});

test('split rejects modified checker behavior, duplicated artifact ownership and removal of unresolved relations', () => {
  const {state, payload} = semanticExample();
  const changedCheck = structuredClone(payload);
  changedCheck.candidates[0].plan.checks[0].argv = ['node', '-e', 'process.exit(0)'];
  assert.throws(() => choose(state, 'split', 'candidate_allocated', changedCheck), {code: 'DAG_PARTITION_CONSERVATION'});
  const duplicate = structuredClone(payload);
  duplicate.candidates[0].plan.tasks[1].output_artifact_ids.push('artifact-core');
  assert.throws(() => choose(state, 'split', 'candidate_allocated', duplicate), {code: 'DAG_ARTIFACT_OWNERSHIP'});
  const unresolved = structuredClone(state);
  unresolved.plan.unknown_relationships = [{task_ids: ['root-implementation', 'verify-integration'], reason: 'Missing interface evidence', evidence_refs: []}];
  assert.throws(() => choose(unresolved, 'split', 'candidate_allocated', payload), {code: 'DAG_SPLIT_UNRESOLVED_RELATION'});
});

test('relation choices bind concrete artifact inputs, resolve only the matching unknown pair, and reject reversed cycles or missing evidence', () => {
  const plan = fixture();
  plan.unknown_relationships = [{task_ids: ['build-core', 'build-ui'], reason: 'Needs artifact decision', evidence_refs: []}];
  const state = createDagSemanticState({plan}), payload = relationPayload(state);
  const result = choose(state, 'relation', 'b_requires_a', payload);
  assert.equal(result.action.type, 'artifact_dependency_bound');
  assert.deepEqual(result.state.plan.tasks.find(task => task.id === 'build-ui').input_artifact_ids, ['artifact-core']);
  assert.deepEqual(result.state.plan.tasks.find(task => task.id === 'build-ui').read_scope, ['examples/dag/output/core.json']);
  assert.deepEqual(result.state.plan.unknown_relationships, []);
  assert.deepEqual(analyzeDag(result.state.plan).predecessors['build-ui'], ['build-core']);
  assert.throws(() => choose(result.state, 'relation', 'a_requires_b', relationPayload(result.state)), {code: 'DAG_CYCLE'});
  const missing = structuredClone(payload); missing.evidence = [];
  assert.throws(() => choose(state, 'relation', 'b_requires_a', missing), {code: 'DAG_RELATION_ARTIFACT_EVIDENCE_MISSING'});
  const unbound = structuredClone(payload); delete unbound.artifact_bindings;
  assert.throws(() => choose(state, 'relation', 'b_requires_a', unbound), {code: 'DAG_RELATION_ARTIFACT_BINDING_MISSING'});
  const noEdge = choose(state, 'relation', 'no_artifact_dependency', payload);
  assert.deepEqual(noEdge.state.plan.unknown_relationships, []);
  const unknown = choose(state, 'relation', 'unknown', payload);
  assert.equal(unknown.status, 'blocked');
  assert.equal(unknown.state.plan.unknown_relationships[0].reason, 'dependency_evidence_required');
});

test('completed revisions/check evidence and running/uncertain task identities remain immutable', () => {
  const plan = fixture();
  const state = createDagSemanticState({plan, task_status: {'build-core': 'completed'},
    completed_artifact_revisions: {'artifact-core': 'sha256:fixture-completed'},
    completed_check_evidence: {'check-core': {status: 'passed', artifact_revision: 'sha256:fixture-completed'}}});
  const allowed = choose(state, 'relation', 'b_requires_a', relationPayload(state));
  assert.deepEqual(allowed.state.completed_artifact_revisions, state.completed_artifact_revisions);
  assert.deepEqual(allowed.state.completed_check_evidence, state.completed_check_evidence);
  assert.deepEqual(allowed.state.plan.tasks[0], state.plan.tasks[0]);
  assert.throws(() => choose(state, 'relation', 'a_requires_b', relationPayload(state)), {code: 'DAG_PROTECTED_TASK_MUTATION'});
  for (const status of ['running', 'uncertain']) {
    const protectedState = createDagSemanticState({plan, task_status: {'build-core': status}});
    const sameProfile = profilePayload(protectedState); sameProfile.profiles[0].id = 'fixture-local';
    assert.throws(() => choose(protectedState, 'profile', 'profile_fixture-local', sameProfile), {code: 'DAG_PROTECTED_TASK_MUTATION'});
  }
});

test('profiles bind an allowlisted worker profile; known failures create fresh scoped repair actions while uncertainty blocks replay', () => {
  const state = createDagSemanticState({plan: fixture()});
  const bound = choose(state, 'profile', 'profile_observed-fixture', profilePayload(state));
  assert.equal(bound.action.type, 'profile_bound');
  assert.equal(bound.state.plan.workers[0].profile_id, 'observed-fixture');
  const failed = createDagSemanticState({plan: fixture(), task_status: {'build-core': 'failed'}});
  const payload = failurePayload(failed);
  const repaired = choose(failed, 'failure', 'repair_local', payload);
  assert.equal(repaired.state.task_status['build-core'], 'pending');
  assert.equal(repaired.state.repair_queue[0].next_attempt_id, 'attempt-repair-2');
  assert.equal(repaired.action.type, 'fresh_repair_authorized');
  const uncertainPayload = structuredClone(payload); uncertainPayload.failure.outcome_uncertain = true;
  assert.throws(() => choose(failed, 'failure', 'repair_local', uncertainPayload), {code: 'DAG_SEMANTIC_CHOICE_NOT_OFFERED'});
  const blocked = choose(failed, 'failure', 'need_evidence', uncertainPayload);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.state.task_status['build-core'], 'uncertain');
  assert.deepEqual(blocked.state.repair_queue, []);
  const replacement = {...fixture().checks[0], version: '2', environment_ref: 'fixture-env-v2'};
  const verifierPayload = failurePayload(failed, {verifier_replacement: replacement, allowed_verifier_replacements: [replacement]});
  verifierPayload.failure.category = 'verifier';
  const verifier = choose(failed, 'failure', 'repair_verifier', verifierPayload);
  assert.equal(verifier.state.plan.checks[0].version, '2');
  assert.equal(verifier.action.type, 'rerun_checks_authorized');
  verifierPayload.allowed_verifier_replacements = [];
  assert.throws(() => choose(failed, 'failure', 'repair_verifier', verifierPayload), {code: 'DAG_VERIFIER_REPLACEMENT_NOT_ALLOWED'});
});

test('a profile cannot clear an unrelated boundary blocker, while the queued dependency decision resolves its own blocker', () => {
  const {state, payload} = semanticExample();
  const blocked = choose(state, 'split', 'need_candidate_revision', payload).state;
  const p = profilePayload(blocked); p.task_id = 'root-implementation';
  assert.throws(() => choose(blocked, 'profile', 'profile_observed-fixture', p), {code: 'DAG_SCOPE_BLOCKED'});
  const failed = createDagSemanticState({plan: fixture(), task_status: {'build-core': 'failed'}});
  const queued = choose(failed, 'failure', 'revise_dependency', failurePayload(failed, {relation: relationPayload(failed)}));
  assert.equal(queued.status, 'blocked');
  assert.equal(queued.state.pending_decisions[0].payload.expected_graph_revision, queued.state.plan.graph_revision);
  const resolved = choose(queued.state, 'relation', 'a_requires_b', queued.state.pending_decisions[0].payload);
  assert.equal(resolved.state.task_status['build-core'], 'pending');
  assert.deepEqual(resolved.state.blockers, []);
  assert.deepEqual(resolved.state.pending_decisions, []);
  assert.deepEqual(resolved.state.plan.tasks[0].input_artifact_ids, ['artifact-ui']);
});

test('controller commits before releasing action, serializes decisions, and failed CAS leaves state unchanged without action events', async () => {
  const {state, payload} = semanticExample(), events = [];
  let release, entered;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const commitWait = new Promise(resolve => { release = resolve; });
  const controller = createDagSemanticController({state, record: event => events.push(event), commit: async (_next, context) => {
    assert.equal(context.previous_revision, state.plan.graph_revision); entered(); await commitWait;
  }});
  const active = controller.apply({decision: {kind: 'split', type: 'choice', choice: 'candidate_allocated'}, payload});
  await enteredPromise;
  assert.deepEqual(controller.snapshot(), state);
  assert.deepEqual(events, []);
  await assert.rejects(controller.apply({decision: {kind: 'split', type: 'choice', choice: 'candidate_allocated'}, payload}), {code: 'DAG_SEMANTIC_CONTROLLER_BUSY'});
  release();
  const result = await active;
  assert.equal(result.status, 'applied');
  assert.equal(events[0].event, 'dag_semantic_committed');
  const failedEvents = [], failing = createDagSemanticController({state, record: event => failedEvents.push(event),
    commit: async () => { throw Object.assign(new Error('CAS rejected'), {code: 'STALE_REVISION', outcome_uncertain: false}); }});
  await assert.rejects(failing.apply({decision: {kind: 'split', type: 'choice', choice: 'candidate_allocated'}, payload}), {code: 'DAG_SEMANTIC_COMMIT_FAILED', outcome_uncertain: false});
  assert.deepEqual(failing.snapshot(), state);
  assert.deepEqual(failedEvents, []);
  const unknownCommit = createDagSemanticController({state, commit: async () => { throw new Error('Write outcome unknown'); }});
  await assert.rejects(unknownCommit.apply({decision: {kind: 'split', type: 'choice', choice: 'candidate_allocated'}, payload}), {code: 'DAG_SEMANTIC_COMMIT_FAILED', outcome_uncertain: true});
  await assert.rejects(unknownCommit.apply({decision: {kind: 'split', type: 'choice', choice: 'candidate_allocated'}, payload}), {code: 'DAG_SEMANTIC_COMMIT_UNCERTAIN'});
});

test('v2 wire decisions use fixed questions; failed or arbitrary responses cannot mutate the executable plan or cause retries', async () => {
  const {state, payload} = semanticExample();
  let calls = 0;
  const controller = createDagSemanticController({state});
  const result = await controller.decide({kind: 'split', payload, decide: async request => {
    calls++; assert.deepEqual(prepareDecision(request).body, request);
    assert.equal(request.questions['dag.split.v2'].instructions, loadDagSemanticContract().kinds.split.instructions);
    return {answers: {'dag.split.v2': {type: 'choice', choice: 'candidate_allocated'}}};
  }});
  assert.equal(result.state.plan.tasks.length, 3);
  assert.equal(result.selection_method, 'typed_choice');
  assert.equal(calls, 1);
  const failed = createDagSemanticController({state});
  await assert.rejects(failed.decide({kind: 'split', payload, decide: async () => { calls++; return {status: 'failed',
    answers: {'dag.split.v2': {type: 'choice', choice: 'candidate_allocated'}}}; }}), {code: 'DAG_SEMANTIC_RESPONSE_INVALID'});
  assert.deepEqual(failed.snapshot(), state);
  assert.equal(calls, 2);
});
