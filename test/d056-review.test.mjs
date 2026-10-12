import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve, dirname, join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {runRecursivePlanning, validateRecursiveInput} from '../src/orchestration/recursive-task-tests.mjs';
import {decodePlanningState} from '../src/orchestration/planning-state-codec.mjs';
import {runPlanningPilot, summarizePlanningReceipts, checkPlanningRequest} from '../src/benchmark/recursive-planning-runner.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {prepareDecision} from '../src/client.mjs';

const root = resolve(import.meta.dirname, '..');
const readJson = path => JSON.parse(readFileSync(path, 'utf8'));
const contract = readJson(join(root, 'docs/orchestration/contracts/recursive-task-tests.v2.json'));
const hash = value => createHash('sha256').update(value).digest('hex');
const bounds = {max_depth:4, max_leaves:32, max_planning_decisions:240, max_repairs_per_node:1,
  max_planning_input_tokens:2_000_000, max_concurrency:2, max_feasibility_states:10_000};

function fixture(count = 4) {
  const lines = Array.from({length:count}, (_, index) => `Preserve outcome ${index + 1}, including false, zero and null.`);
  const source = {path:'public.md', text:lines.join('\n'), sha256:hash(lines.join('\n'))};
  const obligations = lines.map((text, index) => ({id:`O${index + 1}`, requirement_id:`R${index + 1}`, text,
    source_ref:{path:source.path, start_line:index + 1, end_line:index + 1},
    inputs:[`Input ${index + 1}`], outputs:[`Outcome ${index + 1}`], write_scope:['shared.py'],
    depends_on:[], dependency_assertion:'unasserted', gaps:[]}));
  const tests = obligations.map(item => ({id:`T.${item.id}`, requirement_refs:[item.id], scenario:`Check ${item.id}`,
    input:{enabled:false, count:0, missing:null}, expected:{enabled:false, count:0, missing:null},
    scope:'unit', runner_ref:null, status:'not_run'}));
  tests.push({id:'T.acceptance', requirement_refs:obligations.map(item => item.id),
    scenario:'All public outcomes remain observable together.', input:'Whole source fixture',
    expected:'All specified outcomes coexist.', scope:'e2e', runner_ref:null, status:'not_run'});
  return {schema_version:'review-fixture/v1', goal:'Preserve every public outcome.', source,
    obligations, tests, constraints:['No product execution in the planner.'], interfaces:['Read predecessor output before writing shared.py.']};
}

function answer(request, choice) {
  return {model:'offline-review-double', answers:{[request.stage]:{type:'choice', choice}},
    usage:{input_tokens:17, output_tokens:3}};
}

async function plan(input = fixture(), {limits = {}, selector, record} = {}) {
  const requests = [];
  const result = await runRecursivePlanning({input, contract, limits:{...bounds, ...limits}, record,
    decide:async request => {
      requests.push(structuredClone(request));
      const options = Object.keys(request.questions[request.stage].criteria);
      const choice = selector ? selector(request, options) : request.stage === 'child_count' ? '1' : options[0];
      return answer(request, choice);
    }});
  return {result, requests};
}

const splitRoot = (request, options) => request.stage === 'child_count'
  ? request.node_id === 'node_0' ? '2' : '1' : options[0];

test('recursive leaves can exceed five, preserve exact ownership, and never execute aggregates', async () => {
  const input = fixture(6), before = structuredClone(input);
  const {result, requests} = await plan(input, {selector:(request, options) =>
    request.stage === 'child_count' ? options.at(-1) : options[0]});
  assert.equal(result.status, 'complete');
  const leaves = result.tasks.filter(task => task.children.length === 0);
  assert.equal(leaves.length, 6);
  assert.deepEqual(leaves.flatMap(task => task.obligation_ids).sort(), input.obligations.map(item => item.id).sort());
  assert.equal(new Set(leaves.flatMap(task => task.obligation_ids)).size, 6);
  assert.ok(result.tasks.filter(task => task.children.length).every(task => task.planning_status === 'aggregate'));
  assert.ok(result.tasks.every(task => task.execution_eligible === false && task.execution_status === 'not_started'));
  assert.equal(result.metrics.decisions_attempted, requests.length);
  assert.equal(result.metrics.decisions_answered, requests.length);
  assert.equal(result.metrics.known_input_tokens, requests.length * 17);
  assert.deepEqual(Object.keys(requests[0].questions.child_count.criteria), ['1', '2', '3', '4', '5']);
  assert.ok(requests.every(request => Object.keys(request.questions[request.stage].criteria).length >= 2));
  assert.deepEqual(input, before);
});

test('the public fixture newline spans, all source bytes and every test expectation survive a broad leaf', async () => {
  const input = readJson(join(root, 'benchmarks/e2e-swe/manifests/d056-obligations.json'));
  const publicText = readFileSync(join(root, input.source.path), 'utf8');
  assert.equal(input.source.text, publicText);
  assert.equal(hash(publicText), input.source.sha256);
  assert.doesNotThrow(() => validateRecursiveInput(input));
  const {result} = await plan(input);
  assert.equal(result.status, 'complete');
  assert.equal(result.tasks.length, 1);
  for (const obligation of input.obligations) assert.ok(result.tasks[0].goal.includes(obligation.text));
  assert.deepEqual(result.tasks[0].obligation_ids, input.obligations.map(item => item.id));
  for (const original of input.tests) {
    const retained = result.tests.find(item => item.id === original.id);
    assert.ok(retained);
    for (const field of ['input', 'expected', 'requirement_refs', 'source_refs', 'provenance']) {
      assert.deepEqual(retained[field], original[field]);
    }
    assert.equal(retained.runner_ref, null);
    assert.equal(retained.status, 'not_run');
  }
});

test('real projected requests resolve every public source, test value, context and relevant interface without omission', async () => {
  const input = readJson(join(root, 'benchmarks/e2e-swe/manifests/d056-obligations.json'));
  const manifest = readJson(join(root, 'benchmarks/e2e-swe/manifests/d056-planning.json'));
  const {result, requests} = await plan(input, {selector:splitRoot});
  assert.equal(result.status, 'complete');
  const rawLines = input.source.text.match(/[^\n]*\n|[^\n]+$/gu);
  const excerpt = ref => rawLines.slice(ref.start_line - 1, ref.end_line).join('');
  for (const request of requests) {
    const state = request.state;
    assert.deepEqual(state.source, {path:input.source.path, sha256:input.source.sha256});
    assert.deepEqual(state.constraints, input.constraints);
    assert.deepEqual(state.interfaces, input.interfaces);
    const task = result.tasks.find(item => item.id === request.node_id);
    assert.deepEqual(state.node.obligations.map(item => item.id), task.obligation_ids);
    const local = new Map(state.node.obligations.map(item => [item.id, item]));
    for (const [id, projected] of local) {
      const original = input.obligations.find(item => item.id === id);
      for (const field of ['text', 'inputs', 'outputs', 'write_scope', 'depends_on', 'gaps']) {
        assert.deepEqual(projected[field], original[field], `${id}.${field}`);
      }
      assert.equal(projected.source_ref.start_line, original.source_ref.start_line);
      assert.equal(projected.source_ref.end_line, original.source_ref.end_line);
    }
    const related = input.tests.filter(item => item.requirement_refs.some(id => local.has(id)));
    assert.deepEqual(state.tests.map(item => item.id), related.map(item => item.id));
    for (const projected of state.tests) {
      const original = related.find(item => item.id === projected.id);
      for (const field of ['input', 'expected']) {
        const ref = projected[`${field}_ref`];
        const resolved = ref ? local.get(ref.obligation_id)?.[ref.field]?.[ref.index] : projected[field];
        assert.deepEqual(resolved, original[field], `${projected.id}.${field}`);
      }
      assert.deepEqual(projected.requirement_refs, original.requirement_refs);
      assert.equal(projected.scenario, original.scenario);
      assert.equal(projected.source_scope, original.scope);
      if (original.scope === 'e2e') assert.equal(projected.scope, 'e2e');
      assert.equal(projected.runner_ref, null);
      assert.equal(projected.status, 'not_run');
    }
    const refs = [...input.obligations.filter(item => local.has(item.id)).flatMap(item => item.context_refs ?? []),
      ...related.flatMap(item => item.source_refs ?? [])];
    for (const ref of refs) {
      const present = [...local.values()].some(item => item.source_ref.start_line === ref.start_line
        && item.source_ref.end_line === ref.end_line && item.text === excerpt(ref))
        || state.source_context.some(item => item.start_line === ref.start_line && item.end_line === ref.end_line && item.text === excerpt(ref));
      assert.ok(present, `Missing source context ${ref.start_line}:${ref.end_line} for ${request.node_id}`);
    }
    const interfaces = new Map(state.artifact_interfaces.map(item => [item.path, item]));
    const requiredPaths = [...new Set([...local.values()].flatMap(item => item.write_scope))], checked = new Set();
    while (requiredPaths.length) {
      const path = requiredPaths.pop();
      if (checked.has(path)) continue;
      checked.add(path);
      const original = input.artifact_interfaces.find(item => item.path === path);
      if (!original) continue;
      const projected = interfaces.get(path);
      assert.ok(projected, `Missing interface ${path}`);
      assert.equal(projected.purpose, original.purpose);
      assert.deepEqual(projected.dependency_paths, original.dependency_paths);
      requiredPaths.push(...original.dependency_paths);
    }
    assert.doesNotThrow(() => checkPlanningRequest(request, {maxRequestBytes:manifest.max_request_bytes,
      knownInputTokens:0, reserveInputTokens:manifest.jev_budget.reserve_input_tokens,
      maxPlanningInputTokens:manifest.limits.max_planning_input_tokens}));
  }
});

test('columnar wire state preserves every literal fact and unknown dependency across all planning stages', async t => {
  const input = readJson(join(root, 'benchmarks/e2e-swe/manifests/d056-obligations.json'));
  const manifest = readJson(join(root, 'benchmarks/e2e-swe/manifests/d056-planning-columnar.json'));
  const {result, requests} = await plan(input, {selector:(request, options) => request.stage === 'child_count'
    ? request.state.node.depth < 2 ? options.at(-1) : '1' : options[0]});
  assert.equal(result.status, 'complete');
  assert.deepEqual([...new Set(requests.map(request => request.stage))].sort(), ['anchor', 'assign_obligation', 'child_count']);
  const literalStrings = value => typeof value === 'string' ? [value]
    : value && typeof value === 'object' ? Object.values(value).flatMap(literalStrings) : [];
  const guard = {maxRequestBytes:manifest.max_request_bytes, knownInputTokens:0,
    reserveInputTokens:manifest.jev_budget.reserve_input_tokens,
    maxPlanningInputTokens:manifest.limits.max_planning_input_tokens, stateFormat:'columnar_text'};
  const sizes = [];
  let originalBytes = 0;
  for (const request of requests) {
    const before = structuredClone(request);
    const prepared = checkPlanningRequest(request, guard), wire = JSON.parse(prepared.serialized);
    assert.equal(typeof wire.state, 'string');
    const envelope = JSON.parse(wire.state), decoded = decodePlanningState(envelope);
    assert.deepEqual(decoded, request.state);
    assert.deepEqual(wire.questions, request.questions);
    assert.deepEqual(request, before);
    assert.equal(prepared.bytes, Buffer.byteLength(prepared.serialized, 'utf8'));
    originalBytes += Buffer.byteLength(prepareDecision({state:JSON.stringify(request.state), questions:request.questions}).serialized);
    const readable = new Set(literalStrings(envelope));
    for (const text of new Set(literalStrings(request.state))) {
      assert.ok(readable.has(text), `Nonliteral or missing fact in ${request.stage}/${request.node_id}: ${text.slice(0, 90)}`);
    }
    for (const obligation of decoded.node.obligations) {
      const original = input.obligations.find(item => item.id === obligation.id);
      assert.deepEqual(obligation.depends_on, original.depends_on);
    }
    assert.deepEqual(decoded.evidence_basis, request.state.evidence_basis);
    assert.deepEqual(decoded.policies, request.state.policies);
    assert.ok(literalStrings(decoded).some(text => text.includes('unasserted dependencies do not establish independence')));
    sizes.push(prepared.bytes);
  }
  assert.throws(() => checkPlanningRequest(requests[0], {...guard, maxRequestBytes:sizes[0] - 1}),
    {code:'PLANNING_PAYLOAD_LIMIT'});
  assert(sizes.reduce((sum, size) => sum + size, 0) < originalBytes * 0.8);
  assert(Math.max(...sizes) < 96000);
  t.diagnostic(`${requests.length} offline requests; wire bytes ${Math.min(...sizes)}..${Math.max(...sizes)}; provider tokens and model understanding unmeasured.`);
});

test('missing test facts and explicit specification gaps stop without a paid-choice attempt', async () => {
  for (const kind of ['test', 'gap']) {
    const input = fixture();
    if (kind === 'test') input.tests[0].expected = null;
    else input.obligations[0].gaps = ['Required interface is not specified.'];
    const {result, requests} = await plan(input);
    assert.equal(result.status, 'needs_spec');
    assert.equal(requests.length, 0);
    assert.equal(result.metrics.ready_leaf_count, 0);
    assert.equal(result.tasks[0].planning_status, 'needs_spec');
  }
});

test('a mid-partition decision cap preserves the prior complete obligation set', async () => {
  const input = fixture(), {result, requests} = await plan(input, {selector:splitRoot, limits:{max_planning_decisions:2}});
  assert.equal(result.status, 'partial');
  assert.equal(requests.length, 2);
  assert.equal(result.metrics.committed_splits, 0);
  assert.equal(result.tasks.length, 1);
  assert.deepEqual(result.tasks[0].obligation_ids, input.obligations.map(item => item.id));
  assert.equal(result.tasks[0].planning_status, 'pending_review');
});

test('invalid typed choice stops once and never publishes partially assigned children', async () => {
  const {result, requests} = await plan(fixture(), {selector:request => request.stage === 'child_count' ? '2' : 'invented-option'});
  assert.equal(result.status, 'failed');
  assert.equal(requests.length, 2);
  assert.equal(result.metrics.decisions_attempted, 2);
  assert.equal(result.metrics.decisions_answered, 1);
  assert.equal(result.metrics.committed_splits, 0);
  assert.equal(result.tasks.length, 1);
  assert.equal(result.issues.at(-1).retry_performed, false);
});

test('an uncertain decision is neither retried nor assigned zero unknown usage', async () => {
  let calls = 0;
  const result = await runRecursivePlanning({input:fixture(), contract, limits:bounds,
    decide:async () => { calls++; throw Object.assign(new Error('Synthetic timeout'), {code:'TRANSPORT_ERROR', outcomeUncertain:true}); }});
  assert.equal(calls, 1);
  assert.equal(result.status, 'failed');
  assert.equal(result.metrics.input_tokens, null);
  assert.equal(result.metrics.known_input_tokens, 0);
  assert.equal(result.metrics.ready_leaf_count, 0);
  assert.ok(result.issues.some(issue => issue.outcome_uncertain === true && issue.retry_performed === false));
});

test('transport double reserves before its single inference attempt and never retries uncertain failure', async () => {
  const order = [], events = [];
  const measured = createMeasuredDecider({
    client:{listModels:async () => { order.push('models'); return {models:[{name:'jev-latest'}]}; },
      listCredits:async () => { order.push('credits'); return {}; },
      decide:async () => { order.push('inference'); throw Object.assign(Error('Synthetic timeout'), {code:'TRANSPORT_ERROR', outcomeUncertain:true}); }},
    budget:{reserve:() => { order.push('reserve'); return 'synthetic-reservation'; },
      settle:() => { order.push('settle'); }, snapshot:() => ({synthetic:true})},
    record:async row => events.push(row),
  });
  let lastRequest;
  const result = await runRecursivePlanning({input:fixture(), contract, limits:bounds,
    decide:async request => {
      lastRequest = {model:'jev-latest', state:request.state, questions:request.questions};
      return measured(lastRequest, {decision_id:1});
    }});
  assert.equal(result.status, 'failed');
  assert.deepEqual(order, ['models', 'credits', 'reserve', 'inference']);
  assert.equal(events.filter(row => row.event === 'inference_started').length, 1);
  assert.equal(events.filter(row => row.event === 'inference_finished').length, 1);
  assert.equal(events.find(row => row.event === 'inference_finished').status, 'uncertain');
  await assert.rejects(measured(lastRequest, {decision_id:2}), {code:'DECIDER_STOPPED'});
  assert.deepEqual(order, ['models', 'credits', 'reserve', 'inference']);
});

test('a blocked budget in the transport double prevents any inference start', async () => {
  let inferenceCalls = 0;
  const events = [];
  const measured = createMeasuredDecider({
    client:{listModels:async () => ({models:[{name:'jev-latest'}]}), listCredits:async () => ({}),
      decide:async () => { inferenceCalls++; }},
    budget:{reserve:() => { throw Object.assign(Error('Synthetic exhausted budget'), {code:'BUDGET_EXHAUSTED'}); },
      snapshot:() => ({synthetic:true})},
    record:async row => events.push(row),
  });
  const result = await runRecursivePlanning({input:fixture(), contract, limits:bounds,
    decide:request => measured({model:'jev-latest', state:request.state, questions:request.questions}, {decision_id:1})});
  assert.equal(result.status, 'failed');
  assert.equal(inferenceCalls, 0);
  assert.equal(events.filter(row => row.event === 'inference_started').length, 0);
  assert.equal(events.filter(row => row.event === 'budget_blocked').length, 1);
});

test('journal failure cannot publish a ready leaf or a split replacement', async () => {
  for (const event of ['planning_leaf_reviewed', 'planning_split_validated']) {
    const {result} = await plan(fixture(), {selector:event === 'planning_split_validated' ? splitRoot : undefined,
      record:async row => { if (row.event === event) throw Error('Synthetic journal failure'); }});
    assert.equal(result.status, 'failed');
    assert.equal(result.tasks.length, 1);
    assert.equal(result.tasks[0].planning_status, 'pending_review');
    assert.equal(result.metrics.ready_leaf_count, 0);
    assert.equal(result.metrics.committed_splits, 0);
  }
});

function isolatedPilot(t, {wallSeconds = 60} = {}) {
  const tempRoot = mkdtempSync(join(tmpdir(), 'd056-review-'));
  t.after(() => rmSync(tempRoot, {recursive:true, force:true}));
  const put = (relative, text) => { const path = join(tempRoot, relative); mkdirSync(dirname(path), {recursive:true}); writeFileSync(path, text); };
  const input = fixture(2);
  put(input.source.path, input.source.text);
  put('input.json', JSON.stringify(input));
  put('contract.json', JSON.stringify(contract));
  for (const path of ['src/benchmark/recursive-planning-runner.mjs', 'src/orchestration/recursive-task-tests.mjs',
    'src/orchestration/planning-state-codec.mjs',
    'src/client.mjs', 'src/config.mjs', 'src/benchmark/telemetry.mjs', 'src/benchmark/budget.mjs',
    'src/benchmark/budget-acquire.mjs', 'scripts/recursive-task-tests-pilot.mjs']) put(path, readFileSync(join(root, path), 'utf8'));
  const manifest = readJson(join(root, 'benchmarks/e2e-swe/manifests/d056-planning.json'));
  Object.assign(manifest, {input:'input.json', contract:'contract.json', wall_timeout_seconds:wallSeconds});
  put('manifest.json', JSON.stringify(manifest));
  return {tempRoot, input, options:{rootDir:tempRoot, manifestPath:'manifest.json', outputDir:'run', mock:true}};
}

test('runner mock saves one exact request, response and receipt for one answered choice', async t => {
  const {tempRoot, options} = isolatedPilot(t);
  let invoked = 0;
  const result = await runPlanningPilot({...options, mockDecide:async request => { invoked++; return answer(request, '1'); }});
  assert.equal(result.status, 'complete');
  assert.equal(result.stop_code, null);
  assert.equal(invoked, 1);
  assert.equal(result.simulated_decisions, 1);
  assert.equal(result.usage, null);
  assert.deepEqual(readdirSync(join(tempRoot, 'run', 'calls')).sort(), ['001.request.json', '001.response.json']);
  assert.deepEqual(readdirSync(join(tempRoot, 'run', 'receipts')), ['001.json']);
  const receipt = readJson(join(tempRoot, 'run', 'receipts', '001.json'));
  assert.equal(receipt.inference_started, false);
  assert.equal(receipt.provider, 'mock');
  assert.equal(result.implementation_workers, 0);
  assert.equal(result.executable_tests_run, 0);
  assert.equal(result.independent_grade, null);
});

test('final response after wall expiry stays recorded but cannot yield a complete plan', async t => {
  const {tempRoot, options} = isolatedPilot(t, {wallSeconds:1});
  let calls = 0;
  const result = await runPlanningPilot({...options, mockDecide:async request => {
    calls++; await delay(1050); return answer(request, '1');
  }});
  assert.equal(calls, 1);
  assert.notEqual(result.status, 'complete');
  assert.equal(result.issues[0].code, 'PLANNING_WALL_LIMIT');
  assert.equal(result.stop_code, result.issues[0].code);
  const receipts = readdirSync(join(tempRoot, 'run', 'receipts'));
  assert.deepEqual(receipts, ['001.json']);
  assert.equal(readJson(join(tempRoot, 'run', 'receipts', '001.json')).status, 'completed');
  assert.ok(readJson(join(tempRoot, 'run', 'calls', '001.response.json')).answers.child_count);
});

test('usage summary counts actual starts independently from successful responses and local failures', () => {
  const result = summarizePlanningReceipts([
    {status:'completed', inference_started:true, usage:{input_tokens:37, output_tokens:4}},
    {status:'uncertain', inference_started:true, usage:null},
    {status:'failed', inference_started:false, usage:null},
  ], 0.6);
  assert.equal(result.inference_requests, 2);
  assert.equal(result.completed_requests, 1);
  assert.equal(result.failed_or_uncertain_requests, 1);
  assert.equal(result.local_or_preflight_rejections, 1);
  assert.equal(result.known_input_tokens, 37);
  assert.equal(result.input_tokens, null);
  assert.equal(result.output_tokens, null);
  assert.equal(result.api_equivalent_usd, null);
  assert.equal(result.actual_billed_usd, null);
});
