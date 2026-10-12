import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareDecision} from '../src/client.mjs';
import {runRecursivePlanning, validateRecursiveInput, validateRecursivePlan} from '../src/orchestration/recursive-task-tests.mjs';

const contract = JSON.parse(readFileSync(new URL('../docs/orchestration/contracts/recursive-task-tests.v2.json', import.meta.url), 'utf8'));
const limits = {max_depth: 4, max_leaves: 32, max_planning_decisions: 240, max_repairs_per_node: 1,
  max_planning_input_tokens: 2000000, max_concurrency: 2, max_feasibility_states: 10000};
function fixture(count = 4) {
  const text = Array.from({length: count}, (_, index) => `Requirement ${index + 1} preserves value ${index + 1}.`).join('\n');
  const obligations = Array.from({length: count}, (_, index) => ({id: `R1.${index + 1}`, requirement_id: 'R1',
    text: text.split('\n')[index], source_ref: {path: 'public/instruction.md', start_line: index + 1, end_line: index + 1},
    inputs: [`input ${index + 1}`], outputs: [`value ${index + 1}`], write_scope: [`src/file-${index + 1}.mjs`], depends_on: [], gaps: [], dependency_assertion: 'unasserted'}));
  const tests = obligations.map((item, index) => ({id: `T${index + 1}`, requirement_refs: [item.id],
    scenario: `Read value ${index + 1}`, input: {value: index + 1}, expected: {value: index + 1}, scope: 'unit', runner_ref: null, status: 'not_run'}));
  tests.push({id: 'T_integration', requirement_refs: obligations.map(item => item.id), scenario: 'Combined public output',
    input: {values: obligations.map((_, index) => index + 1)}, expected: {values: obligations.map((_, index) => index + 1)}, scope: 'integration', runner_ref: null, status: 'not_run'});
  tests.push({...structuredClone(tests.at(-1)), id: 'T_acceptance', scope: 'e2e'});
  return {schema_version: 'source-obligations/test', goal: 'Preserve public values', source: {path: 'public/instruction.md', text, sha256: createHash('sha256').update(text).digest('hex')},
    obligations, tests, constraints: ['Preserve exact public expectations.'], interfaces: ['One output per public input.'], provenance: {method: 'authored_test_fixture'}};
}
const answer = (request, choice, extra = {}) => ({answers: {[request.stage]: {type: 'choice', choice}}, ...extra});
const first = request => Object.keys(request.questions[request.stage].criteria)[0];
const split = async request => answer(request, request.stage === 'child_count' ? '2' : first(request));
const keep = async request => answer(request, request.stage === 'child_count' ? '1' : first(request));
const run = (options = {}) => runRecursivePlanning({input: fixture(), decide: split, limits, contract, ...options});
const leaves = result => result.tasks.filter(task => !task.children.length);
const assertValid = (result, input = fixture()) => assert.deepEqual(validateRecursivePlan({input, tasks: result.tasks, tests: result.tests}), {valid: true, issues: []});

test('recursive strict partitions preserve all obligations without executable parents', async () => {
  const result = await run();
  assert.equal(result.status, 'complete', JSON.stringify(result.issues));
  assert.equal(leaves(result).length, 4);
  assert.equal(result.metrics.committed_splits, 3);
  assert.deepEqual(leaves(result).flatMap(task => task.obligation_ids).sort(), fixture().obligations.map(item => item.id).sort());
  assert(result.tasks.filter(task => task.children.length).every(task => task.planning_status === 'aggregate' && !task.execution_eligible));
  assert(leaves(result).every(task => task.planning_status === 'ready_specification_only' && !task.execution_eligible));
  assert(result.tasks.every(task => task.execution_status === 'not_started'));
  assert.equal(result.metrics.product_success, null);
  assertValid(result);
});

test('root count one keeps original task and records one typed review without duplicate child', async () => {
  const calls = [];
  const result = await run({decide: async request => {calls.push(request); return keep(request);}});
  assert.equal(result.status, 'complete');
  assert.equal(calls.length, 1);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].review.provenance.method, 'typed_choice');
  assert.equal(result.metrics.input_tokens, null, 'absent provider usage is unknown, not measured zero');
  assert.equal(result.metrics.known_input_tokens, 0);
  assertValid(result);
});

test('single source obligation uses explicit deterministic provenance and no provider call', async () => {
  const events = [], input = fixture(1);
  const result = await run({input, decide: () => assert.fail('no provider call'), record: async event => events.push(event)});
  assert.equal(result.status, 'complete');
  assert.equal(result.metrics.decisions_attempted, 0);
  assert.equal(result.tasks[0].review.provenance.method, 'deterministic_singleton');
  assert.equal(result.tasks[0].review.provenance.adequacy_assessed_by_model, false);
  assert(events.some(event => event.event === 'planning_choice_bypassed'));
  assertValid(result, input);
});

test('count options remain one through five independently of global leaf cap', async () => {
  let captured, calls = 0;
  const result = await run({input: fixture(7), limits: {...limits, max_leaves: 1}, decide: async request => {
    calls++;
    captured = request;
    return answer(request, '5');
  }});
  assert.deepEqual(Object.keys(captured.questions.child_count.criteria), ['1', '2', '3', '4', '5']);
  assert.equal(result.status, 'partial');
  assert.equal(result.issues[0].code, 'PLANNING_LEAF_LIMIT');
  assert.equal(result.tasks[0].planning_status, 'pending_review');
  assert.equal(calls, 1);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.metrics.committed_splits, 0);
  assert.equal(result.metrics.ready_leaf_count, 0);
});

test('unit tests crossing child ownership become integration and existing integration/e2e scopes remain', async () => {
  const input = fixture(2);
  input.tests[0].requirement_refs.push('R1.2');
  const result = await run({input});
  const crossed = result.tests.find(item => item.id === 'T1');
  assert.equal(crossed.source_scope, 'unit');
  assert.equal(crossed.scope, 'integration');
  assert.equal(crossed.task_ids.length, 2);
  assert.equal(crossed.integration_node_id, 'node_0');
  assert.equal(result.tests.find(item => item.id === 'T_integration').scope, 'integration');
  const acceptance = result.tests.find(item => item.id === 'T_acceptance');
  assert.equal(acceptance.scope, 'e2e');
  assert.equal(acceptance.integration_node_id, 'node_0');
  assert.deepEqual(new Set(acceptance.task_ids), new Set(leaves(result).map(task => task.id)));
  for (const original of input.tests) {
    const linked = result.tests.find(item => item.id === original.id);
    assert.deepEqual(linked.expected, original.expected);
    assert.deepEqual(linked.input, original.input);
    assert.equal(linked.status, 'not_run');
    assert.equal(linked.runner_ref, null);
  }
  assertValid(result, input);
});

test('sequential feasibility excludes cycle-causing merged responsibility', async () => {
  const input = fixture(3), events = [];
  input.obligations[1].depends_on = ['R1.1']; input.obligations[2].depends_on = ['R1.2'];
  const result = await run({input, record: async event => events.push(event), decide: async request => {
    if (request.stage === 'child_count') return answer(request, request.node_id === 'node_0' ? '2' : '1');
    return answer(request, first(request));
  }});
  assert.equal(result.status, 'complete');
  assert.deepEqual(leaves(result).map(task => task.obligation_ids), [['R1.1'], ['R1.2', 'R1.3']]);
  assert.deepEqual(leaves(result)[1].depends_on, [leaves(result)[0].id]);
  assert(events.some(event => event.event === 'planning_choice_bypassed' && event.provenance.stage === 'assign_obligation' && event.choice === 'node_0.2'));
  assertValid(result, input);
});

test('declared cycles and unknown dependency IDs fail before decisions', async () => {
  for (const mode of ['cycle', 'unknown']) {
    const input = fixture(2);
    input.obligations[0].depends_on = ['R1.2'];
    input.obligations[1].depends_on = [mode === 'cycle' ? 'R1.1' : 'missing'];
    await assert.rejects(run({input, decide: () => assert.fail()}), {code: 'INVALID_RECURSIVE_INPUT'});
  }
});

test('gaps, missing output, and missing tests cannot become ready', async () => {
  const input = fixture();
  input.obligations[0].gaps.push('Public interface unknown'); input.obligations[1].outputs = [];
  input.tests = input.tests.filter(item => !item.requirement_refs.includes('R1.3'));
  const result = await run({input, decide: () => assert.fail('gapped root must not query')});
  assert.equal(result.status, 'needs_spec');
  assert.equal(result.tasks[0].planning_status, 'needs_spec');
  assert(result.tasks[0].gaps.some(item => item.code === 'DECLARED_GAP'));
  assert(result.tasks[0].gaps.some(item => item.code === 'MISSING_OUTPUTS'));
  assert(result.tasks[0].gaps.some(item => item.code === 'MISSING_TEST_SPECIFICATION'));
  assertValid(result, input);
});

test('unasserted dependencies are disclosed without inventing edges or execution eligibility', async () => {
  const result = await run();
  assert(leaves(result).every(task => task.depends_on.length === 0));
  for (const task of leaves(result)) {
    assert.deepEqual(task.dependency_limitations.map(item => item.obligation_id).sort(), [...task.obligation_ids].sort());
    assert(task.dependency_limitations.every(item => item.assertion === 'unasserted'));
  }
  assert(leaves(result).every(task => task.execution_eligible === false));
});

test('same-file writers have deterministic exclusive serialization consistent with dependencies', async () => {
  const input = fixture(3);
  input.obligations.forEach(item => {item.write_scope = ['src/shared.mjs'];});
  input.obligations[0].depends_on = ['R1.3'];
  const result = await run({input});
  const writers = leaves(result).map(task => ({task, policy: task.write_serialization[0]})).sort((a, b) => a.policy.order_index - b.policy.order_index);
  assert.equal(writers.length, 3);
  assert.equal(writers[0].policy.after, null);
  writers.forEach(({task, policy}, index) => {
    assert.equal(policy.policy, 'exclusive_file_lock');
    assert.equal(policy.read_latest_predecessor_artifact, true);
    assert.equal(policy.after, index ? writers[index - 1].task.id : null);
    for (const prerequisite of task.depends_on) assert(writers.findIndex(item => item.task.id === prerequisite) < index);
  });
  assertValid(result, input);
});

test('depth limit preserves the unsplit reviewed parent as partial', async () => {
  let calls = 0;
  const result = await run({limits: {...limits, max_depth: 0}, decide: async request => {calls++; return split(request);}});
  assert.equal(result.status, 'partial');
  assert.equal(result.issues[0].code, 'PLANNING_DEPTH_LIMIT');
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].planning_status, 'pending_review');
  assert.equal(calls, 1);
  assert.equal(result.metrics.committed_splits, 0);
  assert.equal(result.metrics.ready_leaf_count, 0);
  assertValid(result);
});

test('decision limit during allocation rolls back proposal and never retries unchanged node', async () => {
  const calls = [], events = [];
  const result = await run({limits: {...limits, max_planning_decisions: 1}, record: async event => events.push(event), decide: async request => {calls.push(request); return split(request);}});
  assert.equal(calls.length, 1);
  assert.equal(result.status, 'partial');
  assert.equal(result.issues[0].code, 'PLANNING_DECISION_LIMIT');
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].planning_status, 'pending_review');
  assert(events.some(item => item.event === 'planning_stopped'));
  assertValid(result);
});

test('token accounting reports partial at cap with actual usage retained', async () => {
  const result = await run({limits: {...limits, max_planning_input_tokens: 100}, decide: async request => answer(request, '1', {usage: {input_tokens: 100}})});
  assert.equal(result.status, 'partial');
  assert.equal(result.issues[0].code, 'PLANNING_INPUT_TOKEN_LIMIT');
  assert.equal(result.metrics.input_tokens, 100);
  assert.equal(result.tasks[0].planning_status, 'pending_review');
});

test('bounded feasibility exhaustion is partial and never invents an infeasibility result', async () => {
  const result = await run({limits: {...limits, max_feasibility_states: 1}, decide: () => assert.fail()});
  assert.equal(result.status, 'partial');
  assert.equal(result.issues[0].code, 'FEASIBILITY_SEARCH_LIMIT');
  assert.equal(result.metrics.decisions_attempted, 0);
  assertValid(result);
});

test('malformed, out-of-range and unsolicited answers stop once before publishing split', async () => {
  const responses = [{answers: {child_count: {type: 'choice', choice: '6'}}}, {answers: {child_count: {type: 'score', choice: '2'}}},
    {answers: {child_count: {type: 'choice', choice: '2'}, surprise: {type: 'choice', choice: '1'}}}];
  for (const response of responses) {
    let calls = 0;
    const result = await run({decide: async () => {calls++; return response;}});
    assert.equal(calls, 1);
    assert.equal(result.status, 'failed');
    assert.equal(result.issues[0].code, 'INVALID_RECURSIVE_ANSWER');
    assert.equal(result.tasks.length, 1);
    assertValid(result);
  }
});

test('uncertain provider failure stops without replay and preserves failure checkpoint', async () => {
  let calls = 0; const events = [];
  const result = await run({record: async event => events.push(event), decide: async () => {
    calls++; throw Object.assign(new Error('private upstream text'), {code: 'TIMEOUT', outcomeUncertain: true});
  }});
  assert.equal(calls, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.issues[0].cause_code, 'TIMEOUT');
  assert.equal(result.issues[0].outcome_uncertain, true);
  assert.equal(result.issues[0].retry_performed, false);
  assert.equal(result.metrics.input_tokens, null);
  assert(!JSON.stringify(result).includes('private upstream text'));
  assert(events.some(item => item.event === 'planning_requested'));
  assert(events.some(item => item.event === 'planning_stopped'));
});

test('recording failure prevents provider invocation', async () => {
  const result = await run({record: async () => {throw new Error('disk unavailable');}, decide: () => assert.fail()});
  assert.equal(result.status, 'failed');
  assert.equal(result.metrics.decisions_attempted, 0);
  assert.equal(result.issues[0].code, 'RECORD_FAILED');
  assertValid(result);
});

test('explicit adapter safeguard caps yield a partial plan without retry', async () => {
  for (const code of ['PLANNING_WALL_LIMIT', 'PLANNING_PAYLOAD_LIMIT', 'PLANNING_INPUT_RESERVATION_LIMIT']) {
    let calls = 0;
    const result = await run({decide: async () => {calls++; throw Object.assign(new Error(code), {code, outcomeUncertain: false});}});
    assert.equal(calls, 1);
    assert.equal(result.status, 'partial');
    assert.equal(result.issues[0].code, code);
    assert.equal(result.tasks[0].planning_status, 'pending_review');
    assertValid(result);
  }
});

test('failure to journal a kept leaf leaves it unreviewed', async () => {
  const result = await run({decide: keep, record: async event => {
    if (event.event === 'planning_leaf_reviewed') throw new Error('journal write failed');
  }});
  assert.equal(result.status, 'failed');
  assert.equal(result.tasks[0].planning_status, 'pending_review');
  assert.equal(result.tasks[0].review, null);
});

test('later decision cap preserves already committed tree and outstanding reviews', async () => {
  const result = await run({limits: {...limits, max_planning_decisions: 5}});
  assert.equal(result.status, 'partial');
  assert.equal(result.metrics.committed_splits, 1);
  assert.equal(result.tasks.length, 3);
  assert(leaves(result).every(task => task.planning_status === 'pending_review'));
  assertValid(result);
});

test('ready status cannot be retained after dropping or altering choice provenance', async () => {
  const original = await run({decide: keep});
  for (const corrupt of [plan => {plan.tasks[0].review = {};}, plan => {plan.tasks[0].review.choice = '2';},
    plan => {plan.tasks[0].review.provenance = {};}, plan => {plan.tasks[0].review.provenance.request_sha256 = 'missing';}]) {
    const plan = structuredClone(original); corrupt(plan);
    assert.throws(() => validateRecursivePlan({input: fixture(), tasks: plan.tasks, tests: plan.tests}), {code: 'INVALID_RECURSIVE_PLAN'});
  }
});

test('lost obligations, empty/no-progress splits, duplicate parent execution and source changes are rejected', async () => {
  const original = await run();
  const corruptions = [
    plan => {leaves(plan)[0].obligation_ids = [];},
    plan => {plan.tasks[0].obligation_ids.pop();},
    plan => {plan.tasks.find(task => task.children.length).planning_status = 'ready_specification_only';},
    plan => {plan.tasks.find(task => task.children.length).execution_eligible = true;},
    plan => {plan.tasks[1].obligation_ids = [...plan.tasks[0].obligation_ids];},
    plan => {plan.tasks[0].goal = 'Weakened goal';},
  ];
  for (const corrupt of corruptions) {
    const plan = structuredClone(original); corrupt(plan);
    assert.throws(() => validateRecursivePlan({input: fixture(), tasks: plan.tasks, tests: plan.tests}), {code: 'INVALID_RECURSIVE_PLAN'});
  }
  const partial = await run({decide: async request => answer(request,
    request.stage === 'child_count' ? request.node_id === 'node_0' ? '2' : '1' : first(request))});
  const child = leaves(partial).find(task => task.obligation_ids.length > 1);
  assert(child, 'the omission witness must leave a nonempty child');
  child.obligation_ids.pop();
  assert.throws(() => validateRecursivePlan({input: fixture(), tasks: partial.tasks, tests: partial.tests}), {code: 'INVALID_RECURSIVE_PLAN'});
});

test('deleted, reowned or weakened test expectations cannot validate', async () => {
  const input = fixture(); input.tests[0].expected = 'Preserve the required outcome.';
  const original = await run({input});
  for (const corrupt of [plan => {plan.tests.pop();}, plan => {plan.tests[0].task_ids = ['node_0'];},
    plan => {plan.tests[0].task_ids = ['does-not-exist'];},
    plan => {plan.tests[0].expected = 'Anything passes';},
    plan => {plan.tests[0].expected = {};}, plan => {plan.tests.at(-1).scope = 'unit';},
    plan => {plan.tests[0].status = 'passed';}]) {
    const plan = structuredClone(original); corrupt(plan);
    assert.throws(() => validateRecursivePlan({input, tasks: plan.tasks, tests: plan.tests}), {code: 'INVALID_RECURSIVE_PLAN'});
  }
});

test('missing write serialization and fabricated execution dependency cycle are rejected', async () => {
  const input = fixture(2); input.obligations.forEach(item => {item.write_scope = ['shared.mjs'];});
  const original = await run({input});
  for (const corrupt of [plan => {leaves(plan)[0].write_serialization = [];},
    plan => {const nodes = leaves(plan); nodes[0].depends_on = [nodes[1].id]; nodes[1].depends_on = [nodes[0].id];}]) {
    const plan = structuredClone(original); corrupt(plan);
    assert.throws(() => validateRecursivePlan({input, tasks: plan.tasks, tests: plan.tests}), {code: 'INVALID_RECURSIVE_PLAN'});
  }
});

test('unknown test mapping and tampered source text fail input validation', () => {
  const unmapped = fixture(); unmapped.tests[0].requirement_refs = ['not-in-source'];
  assert.throws(() => validateRecursiveInput(unmapped), {code: 'INVALID_RECURSIVE_INPUT'});
  const changed = fixture(); changed.obligations[0].text = 'Invented responsibility';
  assert.throws(() => validateRecursiveInput(changed), {code: 'INVALID_RECURSIVE_INPUT'});
});

test('requests are client-compatible and contain local source once without full source or ancestor tree', async () => {
  const requests = [];
  const result = await run({decide: async request => {prepareDecision({state: request.state, questions: request.questions}); requests.push(request); return split(request);}});
  assert.equal(result.status, 'complete');
  assert(requests.length > 1);
  const requestHashes = requests.map(request => JSON.stringify(request));
  assert.equal(new Set(requestHashes).size, requestHashes.length);
  for (const request of requests) {
    assert.equal(request.state.source.text, undefined);
    assert.equal(request.state.tasks, undefined);
    assert.equal(request.state.manifest, undefined);
    if (request.node_id !== 'node_0') assert(request.state.node.obligations.length < fixture().obligations.length);
    assert.equal(request.state.policies.execution_eligible, false);
  }
});

test('transparent prompt references reconstruct exact tests and expose context and file interface prerequisites', async () => {
  const input = fixture(3), requests = [];
  input.obligations[0].context_refs = [{path: input.source.path, start_line: 3, end_line: 3}];
  input.tests[0].input = input.obligations[0].inputs[0];
  input.tests[0].expected = input.obligations[0].outputs[0];
  input.artifact_interfaces = [
    {path: 'src/file-1.mjs', purpose: 'Public consumer', dependency_paths: ['src/base.mjs']},
    {path: 'src/base.mjs', purpose: 'Shared producer', dependency_paths: []},
  ];
  const result = await run({input, decide: async request => {requests.push(request); return split(request);}});
  assert.equal(result.status, 'complete');
  for (const request of requests) for (const projected of request.state.tests) {
    const original = input.tests.find(item => item.id === projected.id);
    const resolve = field => {
      const ref = projected[`${field}_ref`];
      return ref ? request.state.node.obligations.find(item => item.id === ref.obligation_id)[ref.field][ref.index] : projected[field];
    };
    assert.deepEqual(resolve('input'), original.input);
    assert.deepEqual(resolve('expected'), original.expected);
  }
  const root = requests[0];
  assert(root.state.artifact_interfaces.some(item => item.path === 'src/base.mjs'));
  assert(root.state.node.obligations.some(item => item.text === input.obligations[2].text)
    || root.state.source_context.some(item => item.text === input.obligations[2].text));
  assert.equal(root.state.tests[0].input, undefined);
  assert.deepEqual(root.state.tests[0].input_ref, {obligation_id: 'R1.1', field: 'inputs', index: 0});
});
