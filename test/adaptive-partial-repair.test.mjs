import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runAdaptiveDagExecution} from '../src/orchestration/adaptive-dag-execution.mjs';
import {createArtifactSession} from '../src/orchestration/artifact-transport.mjs';
import {validateInferredRepairCandidate, buildInferredRepairDecisionContext} from '../src/orchestration/adaptive-inferred-repair.mjs';
import {selectInferredOwnerScope} from '../src/orchestration/adaptive-inferred-scope.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const base = JSON.parse(await readFile(new URL('../examples/dag/contract-fixture.json', import.meta.url)));
async function remove(path) {
  const stat = await lstat(path).catch(() => null); if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    await chmod(path, 0o700); for (const name of await readdir(path)) await remove(join(path, name));
  }
  await rm(path, {recursive: true, force: true});
}
async function fixture(t, {repeat = false} = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'inferred-execution-'))); t.after(() => remove(root));
  const plan = structuredClone(base), [core, ui, aggregate] = plan.tasks;
  core.write_scope = ['producer.py', 'ir.py']; core.output_artifact_ids.push('artifact-ir');
  ui.write_scope = ['template.jinja', 'generator.py']; ui.output_artifact_ids.push('artifact-generator');
  ui.input_artifact_ids = []; ui.read_scope = [];
  const unrelated = {...structuredClone(core), id: 'build-unrelated', worker_id: 'worker-unrelated',
    requirement_ids: ['requirement-unrelated'], write_scope: ['unrelated.py'], output_artifact_ids: ['artifact-unrelated'], check_ids: ['check-unrelated']};
  plan.tasks.splice(2, 0, unrelated); plan.workers.push({id: 'worker-unrelated', profile_id: 'fixture-local'});
  plan.requirement_ids.push('requirement-unrelated'); plan.artifacts.push({id: 'artifact-ir', producer_task_id: core.id},
    {id: 'artifact-generator', producer_task_id: ui.id}, {id: 'artifact-unrelated', producer_task_id: unrelated.id});
  aggregate.requirement_ids = [...plan.requirement_ids]; aggregate.input_artifact_ids = plan.artifacts.map(a => a.id);
  aggregate.read_scope = [...core.write_scope, ...ui.write_scope, ...unrelated.write_scope]; aggregate.check_ids = ['public-description'];
  const proto = structuredClone(plan.checks[0]);
  plan.checks[0].artifact_ids.push('artifact-ir'); plan.checks[1].artifact_ids.push('artifact-generator');
  plan.checks = [...plan.checks.slice(0, 2), {...proto, id: 'check-unrelated', artifact_ids: ['artifact-unrelated'], requirement_ids: unrelated.requirement_ids},
    {...proto, id: 'public-description', version: '4', phase: 'integration', artifact_ids: [...aggregate.input_artifact_ids], requirement_ids: [...plan.requirement_ids]}];
  const bindings = {'artifact-core': {paths: ['producer.py']}, 'artifact-ir': {paths: ['ir.py']},
    'artifact-ui': {paths: ['template.jinja']}, 'artifact-generator': {paths: ['generator.py']}, 'artifact-unrelated': {paths: ['unrelated.py']}};
  const catalog = {source_sha256: hash('original public requirements'),
    artifacts: plan.artifacts.map(a => ({id: a.id, paths: bindings[a.id].paths, evidence_ids: [`e-${a.id}`]})),
    units: plan.artifacts.map(a => ({id: `u-${a.id}`, title: a.id, artifact_ids: [a.id],
      requirement_ids: a.id === 'artifact-core' ? ['requirement-core'] : a.id === 'artifact-ui' ? ['requirement-ui']
        : a.id === 'artifact-unrelated' ? ['requirement-unrelated'] : [],
      interface: `Original complete ${a.id} interface.`, evidence_ids: [`e-${a.id}`]})),
    evidence: plan.artifacts.map(a => ({id: `e-${a.id}`, quote: 'Original source description passes through producer and IR into renderer.'}))};
  const planning = {plan, artifactBindings: bindings, catalog, source_sha256: catalog.source_sha256, catalog_sha256: hash(JSON.stringify(catalog)),
    execution_context: {profile_id: null, profile_policy: 'per_task_jev_selection',
      initial_planning_profile_assumption: 'fixture-local', worker_profiles: structuredClone(plan.workers)},
    requirement_descriptions: plan.requirement_ids.map(id => ({id, text: `Complete ${id}.`, source_refs: ['original-public']}))};
  const contract = {schema_version: 'public-assertion-contract/v1', version: '2', assertions: [{id: 'assert-description',
    check_id: 'public-description', test_id: 'test-description', requirement_ids: ['requirement-ui'], artifact_paths: ['template.jinja'],
    causal_paths: [['producer.py', 'producer'], ['ir.py', 'representation'], ['generator.py', 'renderer'], ['template.jinja', 'renderer']]
      .map(([path, role]) => ({path, role, rationale: 'Explicit public contract path candidate.'}))}]};
  const source_text = JSON.stringify(contract), contractPath = join(root, 'assertions.v2.json'), checker = join(root, 'checker.mjs');
  await writeFile(contractPath, source_text); await writeFile(checker, '// Offline public check identity.\n');
  const assertionContract = {contract, source_text, source_path: 'assertions.v2.json', sha256: hash(source_text)};
  const calls = [], checks = [], choices = [], events = [], profiles = [];
  const options = {plan, planning, artifactBindings: bindings, run_id: 'causal-fixture', runDirectory: join(root, 'run'),
    checkerRoot: root, checkerFiles: [checker, contractPath], environment: {id: 'node22-fixture-v1'},
    maxRepairRounds: repeat ? 2 : 1, repairScopePolicy: 'public-inferred-owner-v1', artifactRepairPolicy: 'inferred-v1', assertionContract,
    testRequirements: {'test-description': ['requirement-ui']}, record: async event => events.push(event),
    probeEnvironment: async () => ({node: process.version, platform: process.platform}),
    prepareRoundPlan: async ({plan, round_index, selected_task_ids, selected_action, failure, repair_history}) => {
      assert.equal(selected_action.id, 'repair-inferred-owners');
      assert.deepEqual(selected_action.task_ids, selected_task_ids);
      assert.equal(selected_action.artifact_ids.length, 1);
      profiles.push({round_index, selected_task_ids, selected_action, failure, repair_history});
      const worker = plan.workers.find(worker => worker.id === core.worker_id); worker.profile_id = `fixture-repair-${round_index}`;
      return {plan};
    },
    executeTask: async (task, context) => {
      calls.push({task: structuredClone(task), context: structuredClone(context)});
      if (context.operation === 'repair') {
        assert.equal(task.id, core.id); assert.deepEqual(task.write_scope, ['producer.py']);
        const executionContext = context.repair_context.artifact_repair.execution_context;
        assert.equal(executionContext.profile_id, null);
        assert.equal(executionContext.worker_profiles.find(worker => worker.id === core.worker_id).profile_id,
          `fixture-repair-${context.round_index}`);
        assert.deepEqual(context.additional_read_sources.map(s => s.path).sort(), ['generator.py', 'template.jinja']);
        assert(!existsSync(join(context.stageDirectory, 'template.jinja')));
        const overlays = new Set(context.additional_read_sources.map(source => source.path));
        const transport = createArtifactSession({root: context.stageDirectory, allowedPaths: task.write_scope,
          readablePaths: task.read_scope.filter(path => !overlays.has(path)), readSources: context.additional_read_sources,
          journalPath: join(root, `worker-${context.round_index}.jsonl`)});
        try {
          assert.equal(transport.readFile({path: 'template.jinja'}).content, 'Render the request description.');
          assert.throws(() => transport.writeFile({path: 'template.jinja', content: 'forbidden'}), /NOT_ALLOWED/);
          transport.writeFile({path: 'producer.py', content: repeat && context.round_index === 1 ? 'description = "STILL_WRONG"\n' : 'description = "REQUEST"\n'});
        } finally { transport.close(); }
        return {status: 'completed', outcome_uncertain: false};
      }
      for (const path of task.write_scope) await writeFile(join(context.stageDirectory, path), path === 'template.jinja'
        ? 'Render the request description.' : path === 'producer.py' ? 'description = "SCHEMA"\n' : 'value = "unchanged"\n');
      return {status: 'completed', outcome_uncertain: false};
    },
    checkTask: async (check, ctx) => {
      checks.push({id: check.id, round: ctx.round_index});
      const isPublic = check.id === 'public-description';
      const passed = !isPublic || (await readFile(join(ctx.candidateDirectory, 'producer.py'), 'utf8')).includes('"REQUEST"');
      const report = {check_id: check.id, check_version: check.version, environment_ref: check.environment_ref,
        status: passed ? 'passed' : 'failed', executed: true, exit_code: passed ? 0 : 1, assertions: 1, skipped: 0,
        outcome_uncertain: false, error: null, unexecuted_test_ids: [], cases: []};
      if (isPublic) {
        report.assertion_contract_sha256 = assertionContract.sha256;
        report.cases.push({test_id: 'test-description', status: report.status, assertions: 1,
          assertion_results: [{assertion_id: 'assert-description', status: report.status}],
          ...(!passed ? {error_type: 'AssertionError', message: 'request description source mismatch', failed_assertion_id: 'assert-description'} : {})});
      }
      return {...report, evidence: report};
    },
    decideRepairOwners: async request => ({answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: 'choice', choice: 'artifact-core'}]))}),
    decideRepair: async request => {
      choices.push(request); const candidate = request.candidates.find(candidate => candidate.id === 'repair-inferred-owners');
      assert(candidate); return {status: 'selected', candidate_id: candidate.id, candidate};
    }};
  return {root, options, calls, checks, choices, events, profiles};
}


async function partialFixture(t) {
  const f = await fixture(t);
  f.options.partialRepairPolicy = 'local-readiness-v1';
  f.options.plan.checks.find(row => row.id === 'check-core').artifact_ids = ['artifact-core'];
  f.options.plan.checks.push({...structuredClone(f.options.plan.checks[0]), id: 'check-ir', artifact_ids: ['artifact-ir']});
  f.options.plan.tasks.find(row => row.id === 'build-core').check_ids.push('check-ir');
  delete f.options.prepareRoundPlan;
  const ui = f.options.plan.tasks.find(row => row.id === 'build-ui');
  ui.input_artifact_ids = ['artifact-core', 'artifact-ir']; ui.read_scope = ['producer.py', 'ir.py'];
  // Force an actual dependency so the renderer cannot run until repaired producer is ready.
  const unrelated = f.options.plan.tasks.find(row => row.id === 'build-unrelated');
  unrelated.duration.estimate_ms = 100;
  const check = f.options.checkTask;
  f.options.checkTask = async (definition, ctx) => {
    const result = await check(definition, ctx);
    if (definition.id === 'check-core') {
      const passed = (await readFile(join(ctx.candidateDirectory, 'producer.py'), 'utf8')).includes('REQUEST');
      const report = {...result.evidence, status: passed ? 'passed' : 'failed', exit_code: passed ? 0 : 1,
        error: passed ? null : {code: 'SyntaxError', message: 'readiness rejects malformed producer'}};
      return {...report, evidence: report};
    }
    return result;
  };
  f.options.executeTask = async (task, ctx) => {
    f.calls.push({task: structuredClone(task), context: structuredClone(ctx)});
    const session = createArtifactSession({root: ctx.stageDirectory, allowedPaths: task.write_scope,
      readablePaths: [...task.read_scope, ...task.write_scope], journalPath: join(f.root, `worker-${ctx.attempt_id}.jsonl`)});
    try {
      if (ctx.operation === 'repair') {
        assert.deepEqual(task.write_scope, ['producer.py']);
        assert.equal(ctx.repair_context.artifact_repair.schema_version, 'adaptive-local-readiness-repair/v1');
        assert.equal(ctx.repair_context.artifact_repair.local_failures[0].evidence.error.code, 'SyntaxError');
      }
      for (const path of task.write_scope) session.writeFile({path, content: path === 'producer.py'
        ? `description = "${ctx.operation === 'repair' ? 'REQUEST' : 'SCHEMA'}"\n` : 'value = "unchanged"\n'});
    } finally { session.close(); }
    return {status: 'completed', outcome_uncertain: false};
  };
  return f;
}

test('partial local failure reproduces legacy all-revisions stop; opt-in repairs bound stage and runs remaining DAG', async t => {
  const legacy = await partialFixture(t); delete legacy.options.partialRepairPolicy;
  const before = await runAdaptiveDagExecution(legacy.options);
  assert.equal(before.stop_code, 'ADAPTIVE_INFERRED_ARTIFACT_BINDING');
  assert.equal(before.operations.repair, 0);
  const f = await partialFixture(t), gates = [];
  f.options.beforeRepairDecision = async (_, metadata) => gates.push(metadata.stage);
  f.options.decideRepairOwners = async () => assert.fail('Local owner is exact; no paid owner inference');
  f.options.decideRepair = async () => assert.fail('Local owner is exact; no provider repair choice');
  const result = await runAdaptiveDagExecution(f.options);
  assert.equal(result.status, 'completed', JSON.stringify(result.terminal_cause));
  assert.equal(result.rounds.length, 2);
  assert.deepEqual(result.operations, {implementation: 3, repair: 1, carry_forward: 1});
  assert.deepEqual(gates, ['local_readiness_repair']);
  const action = result.repair_actions[0].candidate;
  assert.equal(action.task_states.find(row => row.task_id === 'build-ui').state, 'undispatched');
  assert.deepEqual(action.task_states.find(row => row.task_id === 'build-ui').artifact_revisions, {});
  assert.equal(f.calls.filter(row => row.task.id === 'build-unrelated').length, 1);
  assert.equal(f.calls.filter(row => row.task.id === 'build-ui').length, 1);
  assert.equal(f.calls.filter(row => row.context.operation === 'repair').length, 1);
  assert.equal(result.public_evidence.every(row => row.status === 'passed'), true);
  assert.ok(f.events.some(row => row.event === 'adaptive_artifact_repair_inheritance_verified'));
  assert.equal((await readFile(join(result.candidate_path, 'producer.py'), 'utf8')).includes('REQUEST'), true);
});

test('partial owner precondition rejection dispatches no repair', async t => {
  const f = await partialFixture(t);
  f.options.beforeRepairDecision = async () => {throw Object.assign(new Error('Denied'), {code: 'GATE_DENIED'});};
  const result = await runAdaptiveDagExecution(f.options);
  assert.equal(result.stop_code, 'GATE_DENIED'); assert.equal(result.operations.repair, 0);
});

test('partial repair never inherits modified bytes from failed staged snapshot', async t => {
  const f = await partialFixture(t);
  f.options.beforeRepairDecision = async () => {
    const call = f.calls.find(row => row.task.id === 'build-core');
    assert(call);
    const path = join(call.context.stageDirectory, 'ir.py');
    await chmod(path, 0o600); await writeFile(path, 'tampered = True\n');
  };
  const result = await runAdaptiveDagExecution(f.options);
  assert.equal(result.status, 'uncertain');
  assert.equal(result.operations.repair, 0);
  assert.equal(f.calls.filter(row => row.context.operation === 'repair').length, 0);
  assert.equal(result.outcome_uncertain, true);
});
