import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {planAdaptiveDag, prepareAdaptiveCatalog, validateAdaptiveCatalog, chooseAdaptiveRepair,
  loadAdaptiveDagContract} from '../src/orchestration/adaptive-dag-planner.mjs';
import {analyzeDag} from '../src/orchestration/artifact-dag.mjs';
import {runArtifactWorkflow} from '../src/orchestration/dag-workflow.mjs';
import {prepareDecision} from '../src/client.mjs';
import {createArtifactSession} from '../src/orchestration/artifact-transport.mjs';

const limits = {max_units: 30, max_artifacts: 60, max_files: 60, max_leaves: 30, max_depth: 3,
  max_nodes: 59, max_relation_pairs: 435, max_decisions: 128, relation_batch_size: 32, max_request_bytes: 240000};
function fixture(count = 4) {
  const quotes = Array.from({length: count}, (_, i) => `Public clause ${i}: provide interface value_${i} as a complete checked component.`);
  const source = quotes.join('\n'), requirement_ids = quotes.map((_, i) => `R${i}`);
  const catalog = {schema_version: 'adaptive-catalog/v1', source_sha256: createHash('sha256').update(source).digest('hex'),
    evidence: quotes.map((quote, i) => ({id: `e${i}`, quote})),
    units: quotes.map((_, i) => ({id: `u${i}`, title: `Component ${i}`, requirement_ids: [`R${i}`], artifact_ids: [`a${i}`],
      interface: `Exports value_${i}; its implementation file is src/component_${i}.txt.`, evidence_ids: [`e${i}`]})),
    artifacts: quotes.map((_, i) => ({id: `a${i}`, paths: [`src/component_${i}.txt`], description: `Produced component ${i}.`, evidence_ids: [`e${i}`]}))};
  const check = (name, phase, artifacts, requirements) => ({id: name, version: 'fixture-v1', phase,
    artifact_ids: artifacts, requirement_ids: requirements, runner_ref: 'fixture-public-check', argv: ['fixture', name],
    cwd: 'src', environment_ref: 'fixture-env', source_ref: 'test/adaptive-dag-planner.test.mjs'});
  return {catalog, source, requirement_ids,
    requirement_descriptions: requirement_ids.map((id, i) => ({id, text: quotes[i], source_refs: [`public:clause-${i}`]})),
    checks: [...quotes.map((_, i) => check(`local${i}`, 'local', [`a${i}`], [`R${i}`])),
      check('public-all', 'integration', quotes.map((_, i) => `a${i}`), requirement_ids)],
    profile_id: 'fixture-opus-medium', goal_revision: 'fixture-public-v1', limits: {...limits}};
}
const respond = (request, select) => ({answers: Object.fromEntries(Object.entries(request.questions)
  .map(([questionId, question]) => [questionId, {type: 'choice', choice: select(questionId, question, request.state)}]))});
const flat = count => async request => respond(request, (id, question, state) => {
  if (id.startsWith('adaptive.split_count')) return state.scope === 'root' ? `split_${count}` : 'keep';
  if (id.startsWith('adaptive.membership')) return Object.keys(question.criteria).at(-1);
  return 'no_dependency';
});
function recursive(request) {
  return respond(request, (id, question, state) => {
    if (id.startsWith('adaptive.split_count')) return state.scope === 'root' || state.node.id === 'n1' ? 'split_2' : 'keep';
    if (id.startsWith('adaptive.membership')) return state.node_id === 'n0' && state.unit_id === 'u1' ? 'child_1' : Object.keys(question.criteria).at(-1);
    return id.endsWith('.1') ? 'a_requires_b' : 'no_dependency';
  });
}

test('recursive memberships create multi-file leaf jobs; relation choices change executable inputs and verified dispatch order', async () => {
  const input = fixture(), original = structuredClone(input), requests = [], committed = [], events = [];
  const planned = await planAdaptiveDag({...input,
    decide: async (request, meta) => {
      assert.deepEqual(prepareDecision(request).body, request);
      assert.ok(['split', 'relations'].includes(meta.stage));
      assert.equal(request.state.execution_context.max_concurrency, 2);
      assert.equal(request.state.execution_context.implementation_invocation, 'one fresh session per leaf');
      assert.ok(request.state.evidence.every(item => input.source.includes(item.quote)));
      assert.equal(request.state.original_public_source, undefined);
      if (meta.stage === 'relations') for (const pair of request.state.pairs) {
        const criteria = request.questions[pair.question_id].criteria;
        assert.ok(criteria.a_requires_b.startsWith(`${pair.task_a_id} requires ${pair.task_b_id}:`));
        assert.ok(criteria.b_requires_a.startsWith(`${pair.task_b_id} requires ${pair.task_a_id}:`));
        assert.notEqual(criteria.a_requires_b, criteria.b_requires_a);
      }
      requests.push(request); return recursive(request);
    }, commit: async snapshot => { committed.push(snapshot); }, record: async event => { events.push(event); }});
  assert.equal(planned.status, 'planned'); assert.equal(planned.dispatch_allowed, true);
  assert.equal(committed.length, 1); assert.deepEqual(input, original);
  assert.deepEqual(planned.leaves.map(leaf => leaf.unit_ids), [['u2', 'u3'], ['u0'], ['u1']]);
  assert.equal(planned.tree.filter(node => node.status === 'split').length, 2);
  assert.equal(planned.plan.workers.length, 3); assert.deepEqual(planned.plan.checks, input.checks);
  const consumer = planned.plan.tasks.find(task => task.id === planned.leaves[0].id);
  assert.deepEqual(consumer.input_artifact_ids, ['a0']);
  assert.deepEqual(consumer.read_scope, ['src/component_0.txt']);
  assert.deepEqual(consumer.write_scope, ['src/component_2.txt', 'src/component_3.txt']);
  assert.deepEqual(planned.artifactBindings.a0, {paths: ['src/component_0.txt']});
  assert.ok(requests.some(request => Object.keys(request.questions).length === 3));
  assert.equal(events.at(-1).event, 'adaptive_plan_ready');

  const revisions = new Map(), executions = []; let clock = 0;
  const executed = await runArtifactWorkflow({plan: planned.plan, run_id: 'adaptive-local-witness', clock: () => ++clock,
    getRevision: async id => revisions.get(id),
    execute: async task => {
      for (const artifact of task.input_artifact_ids) assert.ok(revisions.has(artifact));
      executions.push(task.id);
      task.output_artifact_ids.forEach(id => revisions.set(id, `verified-${id}`));
      return {status: 'completed', outcome_uncertain: false};
    },
    runCheck: async (check, {artifact_revisions}) => ({status: 'passed', executed: true, exit_code: 0,
      assertions: 1, skipped: 0, outcome_uncertain: false, check_id: check.id, check_version: check.version,
      environment_ref: check.environment_ref, artifact_revisions: structuredClone(artifact_revisions)}),
  });
  assert.equal(executed.status, 'completed'); assert.equal(executed.product_success, null);
  assert.ok(executions.indexOf(planned.leaves[1].id) < executions.indexOf(consumer.id));
  const different = await planAdaptiveDag({...input, decide: flat(2)});
  assert.equal(different.leaves.length, 2); assert.equal(different.dispatch_allowed, false);
  assert.notEqual(different.plan.graph_revision, planned.plan.graph_revision);
  assert.deepEqual(analyzeDag(different.plan).predecessors[different.leaves[0].id], []);
});

test('catalog preparation is public-only and ownership, provenance, limits and checker conservation reject before any decision', async () => {
  const input = fixture(), prepared = prepareAdaptiveCatalog(input);
  assert.equal(prepared.source_sha256, input.catalog.source_sha256);
  assert.equal(prepared.schema.additionalProperties, false);
  assert.ok(prepared.prompt.includes(input.source.replaceAll('\n', '\\n')));
  assert.equal(validateAdaptiveCatalog(input).units.length, 4);
  const invented = structuredClone(input); invented.catalog.evidence[0].quote = 'This is not in the public source';
  assert.throws(() => validateAdaptiveCatalog(invented), {code: 'ADAPTIVE_EVIDENCE_NOT_IN_SOURCE'});
  const missing = structuredClone(input); missing.catalog.units[0].requirement_ids = [];
  assert.throws(() => validateAdaptiveCatalog(missing), {code: 'ADAPTIVE_REQUIREMENT_CONSERVATION'});
  const overlap = structuredClone(input); overlap.catalog.artifacts[1].paths = ['SRC/COMPONENT_0.TXT'];
  assert.throws(() => validateAdaptiveCatalog(overlap), {code: 'ADAPTIVE_FILE_OWNERSHIP'});
  const grouped = structuredClone(input); grouped.catalog.worker_groups = [['u0', 'u1']];
  assert.throws(() => validateAdaptiveCatalog(grouped), {code: 'ADAPTIVE_CATALOG_FIELDS'});
  const capped = structuredClone(input); capped.limits.max_files = 3;
  assert.throws(() => validateAdaptiveCatalog(capped), {code: 'ADAPTIVE_CATALOG_LIMIT'});
  // Reproduce the actual retained transport boundary, not a second invented path validator.
  const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'adaptive-path-'))), root = join(temporary, 'files');
  mkdirSync(root);
  try {
    const pathSchema = prepared.schema.properties.artifacts.items.properties.paths.items;
    for (const path of ['package/café.py', 'package/my module.py', '.env', 'package/.env/secret.py', 'x'.repeat(1025)]) {
      const incompatible = structuredClone(input); incompatible.catalog.artifacts[0].paths = [path];
      assert.throws(() => validateAdaptiveCatalog(incompatible), {code: 'ADAPTIVE_ARTIFACT_INVALID'});
      assert.ok(path.length > pathSchema.maxLength || !new RegExp(pathSchema.pattern).test(path));
      assert.throws(() => createArtifactSession({root, allowedPaths: [path], journalPath: join(temporary, 'rejected.jsonl')}), {code: 'INVALID_ARTIFACT_CONFIG'});
    }
    const valid = createArtifactSession({root, allowedPaths: input.catalog.artifacts.flatMap(artifact => artifact.paths), journalPath: join(temporary, 'accepted.jsonl')});
    assert.equal(valid.status().missing.length, input.catalog.artifacts.length); valid.close();
  } finally { rmSync(temporary, {recursive: true, force: true}); }
  const badChecks = structuredClone(input); badChecks.checks[0].requirement_ids = [];
  let called = 0;
  await assert.rejects(() => planAdaptiveDag({...badChecks, decide: async () => { called++; }}), {code: 'DAG_REQUIREMENT_CHECK_MISSING'});
  assert.equal(called, 0);
});

test('all 435 leaf pairs fit 14 batches at the 30-worker boundary, while a combined cyclic batch commits nothing', async () => {
  const input = fixture(30), batches = [];
  const planned = await planAdaptiveDag({...input, decide: async (request, meta) => {
    if (meta.stage === 'relations') batches.push(Object.keys(request.questions).length);
    return flat(30)(request);
  }});
  assert.equal(planned.status, 'planned'); assert.equal(planned.plan.workers.length, 30);
  assert.equal(planned.relations.length, 435); assert.equal(batches.length, 14);
  assert.equal(batches.reduce((a, b) => a + b, 0), 435); assert.ok(batches.every(size => size <= 32));
  assert.equal(planned.stats.provider_calls, 15); assert.equal(planned.stats.provider_questions, 436);
  assert.ok(planned.stats.local_questions > 0);

  let commits = 0;
  const cycle = await planAdaptiveDag({...fixture(3), commit: async () => { commits++; }, decide: async request => {
    if (!Object.keys(request.questions)[0].startsWith('adaptive.relation')) return flat(3)(request);
    return respond(request, id => id.endsWith('.2') ? 'a_requires_b' : 'b_requires_a');
  }});
  assert.equal(cycle.reason, 'ADAPTIVE_RELATION_CYCLE'); assert.equal(cycle.plan, null);
  assert.deepEqual(cycle.relations, []); assert.equal(commits, 0); assert.equal(cycle.dispatch_allowed, false);
  const unresolved = await planAdaptiveDag({...fixture(2), decide: async request => respond(request, () => 'unknown')});
  assert.equal(unresolved.reason, 'ADAPTIVE_RELATION_UNRESOLVED'); assert.equal(unresolved.plan, null);
});

test('confirmed invalid answers, unknown call outcomes, request/call limits and commit failures stop without replay', async () => {
  const input = fixture(); let calls = 0;
  const malformed = await planAdaptiveDag({...input, decide: async request => {
    calls++; return respond(request, () => 'unoffered-choice');
  }});
  assert.equal(malformed.status, 'blocked'); assert.equal(malformed.reason, 'ADAPTIVE_DECISION_INVALID');
  assert.equal(malformed.outcome_uncertain, false); assert.equal(malformed.response_received, true); assert.equal(calls, 1);
  calls = 0;
  const unknown = await planAdaptiveDag({...input, decide: async () => { calls++; throw new Error('connection lost'); }});
  assert.equal(unknown.status, 'uncertain'); assert.equal(calls, 1); assert.equal(unknown.automatic_retries, 0);
  const limited = await planAdaptiveDag({...input, limits: {...limits, max_decisions: 1}, decide: recursive});
  assert.equal(limited.reason, 'ADAPTIVE_DECISION_LIMIT'); assert.equal(limited.stats.provider_calls, 1); assert.equal(limited.plan, null);
  calls = 0;
  const oversized = await planAdaptiveDag({...input, limits: {...limits, max_request_bytes: 100}, decide: async () => { calls++; }});
  assert.equal(oversized.reason, 'ADAPTIVE_REQUEST_LIMIT'); assert.equal(calls, 0);
  const events = [];
  const failedCommit = await planAdaptiveDag({...fixture(2), decide: flat(2), record: async event => { events.push(event); },
    commit: async () => { throw Object.assign(new Error('write not accepted'), {outcome_uncertain: false}); }});
  assert.equal(failedCommit.reason, 'ADAPTIVE_COMMIT_FAILED'); assert.equal(failedCommit.plan, null);
  assert.equal(failedCommit.dispatch_allowed, false); assert.ok(!events.some(event => event.event === 'adaptive_plan_ready'));
  assert.equal(loadAdaptiveDagContract().policy.automatic_retries, 0);
});

test('repair selects the exact owner-only scope and leaves the frozen plan intact; uncertainty and exhausted rounds make no call', async () => {
  const input = fixture(), planning = await planAdaptiveDag({...input, decide: recursive}), original = structuredClone(planning);
  const producer = planning.leaves[1].id, consumer = planning.leaves[0].id;
  assert.ok(analyzeDag(planning.plan).successors[producer].includes(consumer));
  const candidates = [
    {id: 'owners', task_ids: [producer], reason: 'Rebuild the failed producer; carry and recheck unchanged consumers.', evidence_refs: ['public:failure']},
    {id: 'with_consumers', task_ids: [producer, consumer], reason: 'Rebuild producer and consumers.', evidence_refs: ['public:failure']},
  ];
  const repair = {source: input.source, planning, candidates,
    failure: {status: 'failed', outcome_uncertain: false, public_reports: [{id: 'public-all', error: 'public mismatch'}]},
    limits: {max_repair_attempts: 2, repair_attempts_used: 0}};
  let called = 0;
  const result = await chooseAdaptiveRepair({...repair, decide: async request => { called++; return respond(request, () => 'repair_owners'); }});
  assert.equal(result.status, 'selected'); assert.deepEqual(result.candidate.task_ids, [producer]);
  assert.equal(result.dispatch_allowed, false); assert.equal(called, 1); assert.deepEqual(planning, original);
  const unknown = await chooseAdaptiveRepair({...repair, failure: {...repair.failure, outcome_uncertain: true}, decide: async () => { called++; }});
  assert.equal(unknown.status, 'uncertain'); assert.equal(called, 1);
  const exhausted = await chooseAdaptiveRepair({...repair, limits: {max_repair_attempts: 2, repair_attempts_used: 2}, decide: async () => { called++; }});
  assert.equal(exhausted.reason, 'ADAPTIVE_REPAIR_LIMIT'); assert.equal(called, 1);
  const arbitrary = structuredClone(repair); arbitrary.candidates[0].command = 'arbitrary model command';
  await assert.rejects(() => chooseAdaptiveRepair(arbitrary), {code: 'ADAPTIVE_REPAIR_CANDIDATES'});
});

test('artifact repair chooses the bound artifact packet without constructing legacy leaf context', async () => {
  const input = fixture(), planning = await planAdaptiveDag({...input, decide: recursive});
  const task = planning.plan.tasks.find(item => item.kind === 'implementation');
  const candidate = {id: 'owner', task_ids: [task.id], artifact_ids: [task.output_artifact_ids[0]],
    attribution_basis: 'public_interface_candidate_not_fault_proof', reason: 'Repair the failed public artifact.', evidence_refs: ['public:failure']};
  let builds = 0, calls = 0;
  const repair = {source: input.source, planning, candidates: [candidate], artifactBindings: planning.artifactBindings,
    failure: {status: 'failed', outcome_uncertain: false, code: 'ARTIFACT_CHECK_NOT_PASSED'},
    limits: {max_repair_attempts: 2, repair_attempts_used: 0},
    projectRepairState: () => { throw Error('legacy projection must not run'); },
    buildRepairState: args => { builds++; assert.deepEqual(args.candidates, [candidate]);
      return {state: {packet: 'artifact-only'}, report: {fixture: true}}; },
    decide: async request => { calls++; assert.equal(request.state.packet, 'artifact-only');
      assert.equal(request.state.leaves, undefined); return respond(request, () => 'repair_owner'); }};
  const result = await chooseAdaptiveRepair(repair);
  assert.equal(result.status, 'selected'); assert.deepEqual(result.candidate, candidate);
  assert.equal(builds, 1); assert.equal(calls, 1);
  await assert.rejects(chooseAdaptiveRepair({...repair, candidates: [{...candidate, artifact_ids: ['nonexistent']}]}),
    {code: 'ADAPTIVE_REPAIR_ARTIFACTS'});
  assert.equal(calls, 1);
});

test('repair preserves explicit camelCase known rejection and its terminal classification without a returned answer', async () => {
  const input = fixture(), planning = await planAdaptiveDag({...input, decide: recursive}), events = [];
  let calls = 0;
  const result = await chooseAdaptiveRepair({source: input.source, planning,
    candidates: [{id: 'owner', task_ids: [planning.leaves[0].id], reason: 'Repair the observed public failure.', evidence_refs: ['public:failure']}],
    failure: {status: 'failed', outcome_uncertain: false, code: 'ARTIFACT_CHECK_NOT_PASSED'},
    limits: {max_repair_attempts: 2, repair_attempts_used: 0}, record: async event => events.push(event),
    decide: async () => { calls++; throw Object.assign(new Error('HTTP_ERROR'), {code: 'HTTP_ERROR', outcomeUncertain: false,
      http_status: 400, error_diagnostics: {category: 'model_input_limit', redacted_excerpt: 'provider body excluded'}}); }});
  assert.equal(result.status, 'stopped'); assert.equal(result.reason, 'HTTP_ERROR'); assert.equal(result.outcome_uncertain, false);
  assert.deepEqual(result.terminal_cause, {stage: 'repair', code: 'HTTP_ERROR', http_status: 400,
    category: 'model_input_limit', outcome_uncertain: false});
  assert.equal(result.response_received, false); assert.equal(result.automatic_retries, 0); assert.equal(result.dispatch_allowed, false);
  assert.equal(result.candidate, null); assert.equal(calls, 1);
  assert.deepEqual(events.find(event => event.event === 'adaptive_decision_failed').terminal_cause, result.terminal_cause);
  assert.equal(JSON.stringify(result).includes('provider body excluded'), false);
});
