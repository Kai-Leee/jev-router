import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runAdaptiveDagExecution} from '../src/orchestration/adaptive-dag-execution.mjs';
import {createArtifactSession} from '../src/orchestration/artifact-transport.mjs';

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
  const root = await realpath(await mkdtemp(join(tmpdir(), 'causal-execution-'))); t.after(() => remove(root));
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
    maxRepairRounds: repeat ? 2 : 1, repairScopePolicy: 'public-causal-v1', artifactRepairPolicy: 'causal-v1', assertionContract,
    testRequirements: {'test-description': ['requirement-ui']}, record: async event => events.push(event),
    probeEnvironment: async () => ({node: process.version, platform: process.platform}),
    prepareRoundPlan: async ({plan, round_index, selected_task_ids, selected_action, failure, repair_history}) => {
      assert.equal(selected_action.id, 'repair-causal-producer');
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
    decideRepair: async request => {
      choices.push(request); const candidate = request.candidates.find(candidate => candidate.id === 'repair-causal-producer');
      assert(candidate); return {status: 'selected', candidate_id: candidate.id, candidate};
    }};
  return {root, options, calls, checks, choices, events, profiles};
}

test('selected producer repair reads immutable causal overlays, preserves unrelated bytes and persists actual history through success', async t => {
  const state = await fixture(t, {repeat: true}), result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed'); assert.deepEqual(result.operations, {implementation: 3, repair: 2, carry_forward: 4});
  assert.equal(state.choices.length, 2); assert.equal(state.profiles.length, 2);
  assert.equal(state.checks.filter(check => check.id === 'public-description').length, 3);
  assert.equal(state.choices[1].failure.repair_scope.causal.repair_history.entries[0].persistent_failure_keys.length, 1);
  assert.equal(result.repair_history.entries.length, 2); assert.equal(result.repair_history.entries[1].resolved_failure_keys.length, 1);
  assert.deepEqual(result.repair_history.entries[1].changed_artifact_ids, ['artifact-core']);
  assert.equal(result.repair_history.entries[0].changed_files[0].path, 'producer.py');
  for (const id of ['artifact-ir', 'artifact-ui', 'artifact-generator', 'artifact-unrelated']) {
    assert.equal(result.rounds[0].exported.artifact_revisions[id], result.rounds[2].exported.artifact_revisions[id]);
  }
  assert.equal(result.rounds[2].plan.workers.find(worker => worker.id === 'worker-core').profile_id, 'fixture-repair-2');
  assert.equal(result.rounds[2].plan.workers.find(worker => worker.id === 'worker-ui').profile_id, 'fixture-local');
  assert.equal(state.events.filter(event => event.event === 'adaptive_causal_read_sources_verified').length, 2);
  assert.equal(state.events.filter(event => event.event === 'adaptive_causal_repair_history_updated').length, 2);
});

test('profile preparation cannot alter DAG authority or an unselected worker and known failures keep their cause', async t => {
  for (const fault of ['writes', 'unselected', 'provider']) await t.test(fault, async t => {
    const state = await fixture(t);
    state.options.prepareRoundPlan = async ({plan}) => {
      if (fault === 'writes') plan.tasks[0].write_scope.push('other.py');
      else if (fault === 'unselected') plan.workers[1].profile_id = 'fixture-illegal';
      else throw Object.assign(new Error('known rejected profile'), {code: 'HTTP_ERROR', http_status: 400,
        error_diagnostics: {category: 'schema'}, outcome_uncertain: false});
      return {plan};
    };
    const result = await runAdaptiveDagExecution(state.options);
    assert.equal(result.status, 'failed'); assert.equal(result.outcome_uncertain, false);
    assert.equal(state.calls.filter(call => call.context.round_index > 0).length, 0);
    assert.equal(result.stop_code, fault === 'writes' ? 'ADAPTIVE_REPAIR_PROFILE_PLAN_DRIFT'
      : fault === 'unselected' ? 'ADAPTIVE_REPAIR_PROFILE_UNSELECTED' : 'HTTP_ERROR');
    if (fault === 'provider') assert.equal(result.terminal_cause.http_status, 400);
  });
});
