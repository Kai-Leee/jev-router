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
const response = request => ({answers: Object.fromEntries(Object.entries(request.questions).map(([key, question]) => [key,
  {type: 'choice', choice: request.stage === 'child_count' ? (request.node_id === 'node_0' ? '2' : '1') : Object.keys(question.criteria)[0]}])), usage: {input_tokens: 7}, model: 'offline-fixture'});
const run = options => runRecursivePlanning({input: fixture(9), limits, contract, decide: async request => response(request), assignmentBatchSize: 3, ...options});
const valid = (result, input = fixture(9)) => assert.deepEqual(validateRecursivePlan({input, tasks: result.tasks, tests: result.tests}), {valid: true, issues: []});

test('batched assignments retain exact source, one usage per call, sequential anchors and chunk ownership', async () => {
  const calls = [], events = [];
  const result = await run({respectResourceOptions: true, record: async event => events.push(event), decide: async request => {
    prepareDecision({state: request.state, questions: request.questions}); calls.push(request); return response(request);
  }});
  assert.equal(result.status, 'complete', JSON.stringify(result.issues)); valid(result);
  const batches = calls.filter(call => call.stage === 'assign_obligation_batch');
  assert.deepEqual(batches.map(call => Object.keys(call.questions).length), [3, 3, 1]);
  assert.deepEqual(calls.slice(0, 3).map(call => call.stage), ['child_count', 'anchor', 'anchor']);
  assert.deepEqual(batches.map(call => Object.keys(call.state.current_owners).length), [2, 5, 8]);
  assert(batches.every(call => call.state.node.obligations.length === 9));
  assert.deepEqual(batches[0].state.assignment_questions, {assign_0: 'R1.3', assign_1: 'R1.4', assign_2: 'R1.5'});
  calls.forEach((call, index) => {
    assert.equal(call.state.resources.remaining_planning_decisions, limits.max_planning_decisions - index);
    assert.equal(call.state.resources.cumulative_planning_input_tokens, index * 7);
  });
  assert.equal(result.metrics.decisions_attempted, calls.length);
  assert.equal(result.metrics.decisions_answered, calls.length);
  assert.equal(result.metrics.input_tokens, calls.length * 7);
  assert.equal(events.filter(event => event.event === 'planning_responded').length, calls.length);
  const decisions = result.tasks[0].partition_provenance.decisions.filter(item => item.provenance.stage === 'assign_obligation_batch');
  assert.equal(decisions.length, 3);
  assert(decisions.every(item => item.provenance.method === 'typed_choice_batch' && item.usage === undefined));
});

test('any explicit input dependency falls back to sequential assignment even outside current node', async () => {
  const input = fixture(9); input.obligations[8].depends_on = ['R1.1']; const calls = [];
  const result = await run({input, decide: async request => {calls.push(request); return response(request);}});
  assert.equal(result.status, 'complete'); valid(result, input);
  assert.equal(result.metrics.assignment_batch_enabled, false);
  assert(calls.some(call => call.stage === 'assign_obligation'));
  assert(!calls.some(call => call.stage === 'assign_obligation_batch'));
});

test('batch missing, extra, wrong type and wrong option answers roll back whole proposal', async () => {
  for (const corrupt of [answers => {delete answers.assign_1;}, answers => {answers.extra = answers.assign_0;},
    answers => {answers.assign_1.type = 'score';}, answers => {answers.assign_1.choice = 'unknown';}]) {
    let batchCalls = 0;
    const result = await run({decide: async request => {
      const result = response(request); if (request.stage === 'assign_obligation_batch') {batchCalls++; corrupt(result.answers);} return result;
    }});
    assert.equal(result.status, 'failed'); assert.equal(result.issues[0].code, 'INVALID_RECURSIVE_ANSWER');
    assert.equal(batchCalls, 1); assert.equal(result.tasks.length, 1); assert.equal(result.tasks[0].review, null);
    assert.equal(result.metrics.input_tokens, 28); valid(result);
  }
});

test('batch token cap, decision cap and journal failure fail closed without partial split', async () => {
  for (const options of [
    {limits: {...limits, max_planning_input_tokens: 28}},
    {limits: {...limits, max_planning_decisions: 3}},
    {record: async event => {if (event.event === 'planning_responded' && event.stage === 'assign_obligation_batch') throw Error('disk');}},
  ]) {
    const result = await run(options);
    assert(['partial', 'failed'].includes(result.status)); assert.equal(result.tasks.length, 1); valid(result);
  }
});

test('uncertain batch failure is never retried and missing usage remains unknown', async () => {
  let batchCalls = 0;
  const result = await run({decide: async request => {
    if (request.stage === 'assign_obligation_batch') {batchCalls++; throw Object.assign(Error('secret'), {code: 'TIMEOUT', outcomeUncertain: true});}
    return response(request);
  }});
  assert.equal(batchCalls, 1); assert.equal(result.metrics.input_tokens, null);
  assert.equal(result.metrics.known_input_tokens, 21); assert.equal(result.status, 'failed');
  assert.equal(result.issues[0].outcome_uncertain, true); assert(!JSON.stringify(result).includes('secret')); valid(result);
});

test('resource-forced keeps are deterministic and do not claim model adequacy', async () => {
  for (const caps of [{max_depth: 0}, {max_leaves: 1}]) {
    const events = [];
    const result = await run({limits: {...limits, ...caps}, respectResourceOptions: true,
      decide: () => assert.fail('forced keep must bypass provider'), record: async event => events.push(event)});
    assert.equal(result.status, 'complete'); assert.equal(result.metrics.decisions_attempted, 0);
    assert.equal(result.tasks[0].review.provenance.resource_forced_keep, true);
    assert.equal(result.tasks[0].review.provenance.adequacy_assessed_by_model, false);
    assert(events.some(event => event.reason === 'resource_forced_keep')); valid(result);
  }
});

test('resource-aware candidate counts respect remaining global leaves', async () => {
  const calls = [];
  const result = await run({limits: {...limits, max_leaves: 2}, respectResourceOptions: true,
    decide: async request => {calls.push(request); return response(request);}});
  assert.equal(result.status, 'complete'); valid(result);
  assert.deepEqual(Object.keys(calls[0].questions.child_count.criteria), ['1', '2']);
  assert.equal(calls.filter(call => call.stage === 'child_count').length, 1);
  assert.equal(result.metrics.leaf_count, 2);
});

test('invalid opt-in values fail before invoking a provider', async () => {
  for (const assignmentBatchSize of [0, -1, 33, 1.5, '8', null]) await assert.rejects(run({assignmentBatchSize}), {code: 'INVALID_RECURSIVE_OPTIONS'});
  await assert.rejects(run({respectResourceOptions: 'true'}), {code: 'INVALID_RECURSIVE_OPTIONS'});
});

test('explicit default settings preserve default request and final tree shape', async () => {
  const collect = async extra => {
    const calls = []; const result = await runRecursivePlanning({input: fixture(9), limits, contract,
      decide: async request => {calls.push(request); return response(request);}, ...extra});
    return {calls, tasks: result.tasks, tests: result.tests, status: result.status};
  };
  assert.deepEqual(await collect({}), await collect({assignmentBatchSize: 1, respectResourceOptions: false}));
});

test('batch missing usage and uncertain successful response retain accounting without commitment', async () => {
  for (const uncertain of [false, true]) {
    const result = await run({decide: async request => {
      const result = response(request);
      if (request.stage === 'assign_obligation_batch') {delete result.usage; if (uncertain) result.outcome_uncertain = true;}
      return result;
    }});
    assert.equal(result.metrics.input_tokens, null);
    assert.equal(result.status, uncertain ? 'failed' : 'complete');
    if (uncertain) {assert.equal(result.tasks.length, 1); assert.equal(result.issues[0].code, 'UNCERTAIN_PROVIDER_OUTCOME');}
    valid(result);
  }
});

test('batch journal failure before request prevents that provider call', async () => {
  let calls = 0;
  const result = await run({record: async event => {
    if (event.event === 'planning_requested' && event.request.stage === 'assign_obligation_batch') throw Error('disk');
  }, decide: async request => {calls++; return response(request);}});
  assert.equal(calls, 3); assert.equal(result.metrics.decisions_attempted, 3);
  assert.equal(result.status, 'failed'); assert.equal(result.issues[0].code, 'RECORD_FAILED'); valid(result);
});

test('batch assignment preserves shared file serialization and cross-child tests', async () => {
  const input = fixture(9); input.obligations.forEach(item => {item.write_scope = ['shared.mjs'];});
  input.tests[0].requirement_refs.push('R1.2');
  const result = await run({input}); assert.equal(result.status, 'complete'); valid(result, input);
  const leaves = result.tasks.filter(task => !task.children.length);
  assert.equal(leaves.length, 2);
  assert(leaves.every(task => task.write_serialization[0].policy === 'exclusive_file_lock'));
  assert.equal(leaves[1].write_serialization[0].after, leaves[0].id);
  assert.equal(result.tests[0].scope, 'integration');
});
