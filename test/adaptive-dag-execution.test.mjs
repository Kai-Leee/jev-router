import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';
import {runAdaptiveDagExecution} from '../src/orchestration/adaptive-dag-execution.mjs';
import {projectAdaptiveRepairFailure} from '../src/orchestration/adaptive-repair-projection.mjs';

const exec = promisify(execFile);
const base = JSON.parse(await readFile(new URL('../examples/dag/contract-fixture.json', import.meta.url)));
const checkerSource = `import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const [id,root,env]=process.argv.slice(2);
const read=async path=>JSON.parse(await readFile(join(root,path)));
let passed=true;
try {
  if(id==='check-core') passed=Number.isInteger((await read('core.json')).value)&&(await read('metadata.json')).kind==='core';
  else if(id==='check-ui') passed=typeof (await read('ui.json')).label==='string';
  else if(id==='check-tools') passed=(await read('tools.json')).ready===true;
  else if(id==='public-1') passed=(await read('core.json')).value===8;
  else passed=(await read('ui.json')).label==='value:'+(await read('core.json')).value;
} catch {passed=false;}
const status=passed?'passed':'failed';
console.log(JSON.stringify({check_id:id,check_version:'1',environment_ref:env,status,executed:true,
 assertions:1,skipped:0,exit_code:passed?0:1,outcome_uncertain:false,
 cases:[{id:id+'-case',status,assertions:1}],unexecuted_test_ids:[]}));
process.exitCode=passed?0:1;
`;

async function remove(path) {
  const stat = await lstat(path).catch(() => null);
  if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    await chmod(path, 0o700);
    for (const child of await readdir(path)) await remove(join(path, child));
  }
  await rm(path, {recursive: true, force: true});
}

async function fixture(t, {localFailure = false} = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'adaptive-execution-')));
  t.after(() => remove(root));
  const checker = join(root, 'checker.mjs');
  await writeFile(checker, checkerSource);
  const plan = structuredClone(base);
  const [core, ui, integration] = plan.tasks;
  core.write_scope = ['core.json', 'metadata.json'];
  ui.write_scope = ['ui.json'];
  ui.input_artifact_ids = ['artifact-core']; ui.read_scope = core.write_scope;
  const tools = {...structuredClone(core), id: 'build-tools', requirement_ids: ['requirement-tools'],
    output_artifact_ids: ['artifact-tools'], check_ids: ['check-tools'], worker_id: 'worker-tools', write_scope: ['tools.json']};
  plan.requirement_ids.push('requirement-tools');
  plan.workers.push({id: 'worker-tools', profile_id: 'fixture-local'});
  plan.artifacts.push({id: 'artifact-tools', producer_task_id: 'build-tools'});
  plan.tasks.splice(2, 0, tools);
  integration.requirement_ids = [...plan.requirement_ids];
  integration.input_artifact_ids = plan.artifacts.map(artifact => artifact.id);
  integration.read_scope = ['core.json', 'metadata.json', 'ui.json', 'tools.json'];
  const prototype = structuredClone(plan.checks[0]);
  plan.checks = [plan.checks[0], plan.checks[1], {...prototype, id: 'check-tools', artifact_ids: ['artifact-tools'], requirement_ids: ['requirement-tools']}];
  integration.check_ids = [];
  for (let index = 1; index <= 7; index++) {
    const id = `public-${index}`;
    integration.check_ids.push(id);
    plan.checks.push({...prototype, id, phase: 'integration', artifact_ids: [...integration.input_artifact_ids], requirement_ids: [...plan.requirement_ids]});
  }
  const artifactBindings = {'artifact-core': {paths: ['core.json', 'metadata.json']},
    'artifact-ui': {paths: ['ui.json']}, 'artifact-tools': {paths: ['tools.json']}};
  const calls = [], checks = [], choices = [], events = [];
  const options = {plan, artifactBindings, run_id: 'adaptive-test', runDirectory: join(root, 'run'),
    maxRepairRounds: 2, checkerFiles: [{path: checker, relative_path: 'checker.mjs'}], environment: {id: 'node22-fixture-v1'},
    probeEnvironment: async () => ({executable: process.execPath, node: process.version, platform: process.platform}),
    testRequirements: {'public-1-case': ['requirement-core']},
    record: async event => { events.push(event); },
    executeTask: async (task, context) => {
      const {stageDirectory, operation, round_index} = context;
      calls.push({id: task.id, operation, round_index, input: context.input_artifact_revisions, repair_context: context.repair_context});
      if (task.id === 'build-core') {
        if (operation === 'repair') {
          assert.equal(JSON.parse(await readFile(join(stageDirectory, 'core.json'))).value, localFailure ? 'bad' : 7);
          assert.equal((await lstat(join(stageDirectory, 'core.json'))).mode & 0o200, 0o200);
        }
        await writeFile(join(stageDirectory, 'core.json'), JSON.stringify({value: round_index > 0 ? 8 : localFailure ? 'bad' : 7}));
        await writeFile(join(stageDirectory, 'metadata.json'), '{"kind":"core"}');
      } else if (task.id === 'build-ui') {
        const value = JSON.parse(await readFile(join(stageDirectory, 'core.json'))).value;
        assert.equal((await lstat(join(context.inputDirectory, 'core.json'))).mode & 0o222, 0);
        await writeFile(join(stageDirectory, 'ui.json'), JSON.stringify({label: `value:${value}`}));
      } else await writeFile(join(stageDirectory, 'tools.json'), '{"ready":true}');
      return {status: 'completed'};
    },
    checkTask: async (check, context) => {
      checks.push({id: check.id, round_index: context.round_index, revisions: context.artifact_revisions});
      const raw = await exec(process.execPath, [join(context.pinnedDirectory, 'checker.mjs'), check.id,
        context.candidateDirectory, context.environment.id]).catch(error => error);
      const report = JSON.parse(raw.stdout);
      return {status: report.status, exit_code: report.exit_code, outcome_uncertain: false, evidence: report};
    },
    decideRepair: async request => {
      choices.push(request);
      const candidate = request.candidates.find(candidate => candidate.id === 'repair-failure-owners-and-consumers') ?? request.candidates[0];
      return {status: 'selected', candidate_id: candidate.id, candidate};
    }};
  return {root, options, calls, checks, choices, events};
}

test('multi-file leaves, all public failures, actual scoped repair and downstream rebuild produce fresh checked revisions', async t => {
  const state = await fixture(t);
  state.options.repairScopePolicy = 'minimal-public-v1';
  let projections = 0;
  state.options.projectRepairFailure = failure => { projections++; return projectAdaptiveRepairFailure(failure); };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed');
  assert.equal(result.repair_rounds_used, 1);
  assert.deepEqual(result.operations, {implementation: 3, repair: 2, carry_forward: 1});
  assert.equal(state.choices.length, 1);
  assert.equal(projections, 1);
  assert.equal(state.choices[0].failure.repair_scope.policy, 'minimal-public-v1');
  for (const call of state.calls.filter(call => call.operation === 'repair')) {
    assert.equal(Object.hasOwn(call.repair_context, 'failed_public_reports'), false);
    assert.equal(call.repair_context.failure.repair_projection.schema_version, 'adaptive-repair-failure-projection/v1');
    assert.equal(call.repair_context.projected_report.schema_version, 'adaptive-repair-projection-report/v1');
  }
  assert.deepEqual(state.choices[0].candidates.find(candidate => candidate.id === 'repair-failure-owners-and-consumers').task_ids,
    ['build-core', 'build-ui']);
  assert.deepEqual(state.calls.filter(call => call.round_index === 1).map(call => [call.id, call.operation]),
    [['build-core', 'repair'], ['build-ui', 'repair']]);
  assert.equal(state.checks.filter(check => check.id.startsWith('public-')).length, 14);
  assert.equal(state.checks.filter(check => check.id === 'check-tools').length, 2);
  assert.equal(result.rounds[0].public_evidence[0].status, 'failed');
  assert.equal(result.rounds[0].public_evidence.length, 7);
  for (const round of result.rounds) {
    for (const evidence of round.public_evidence) {
      assert.deepEqual(evidence.artifact_revisions, round.exported.artifact_revisions);
      assert.equal(evidence.runtime_binding.binding_digest, round.exported.binding_digest);
      assert.match(evidence.evidence_key, /^[0-9a-f]{64}$/);
    }
    const journal = (await readFile(join(round.initialization.root, 'journal.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    for (let index = 1; index <= 7; index++) assert.equal(journal.filter(row => row.event === 'check' &&
      row.check_id === `public-${index}` && row.phase === 'started').length, 1);
  }
  const first = result.rounds[0].exported, final = result.rounds[1].exported;
  assert.equal(JSON.parse(await readFile(join(first.candidateDirectory, 'core.json'))).value, 7);
  assert.equal(JSON.parse(await readFile(join(final.candidateDirectory, 'core.json'))).value, 8);
  assert.equal(JSON.parse(await readFile(join(final.candidateDirectory, 'ui.json'))).label, 'value:8');
  assert.equal((await lstat(join(first.candidateDirectory, 'core.json'))).mode & 0o222, 0);
  assert.notEqual(first.artifact_revisions['artifact-core'], final.artifact_revisions['artifact-core']);
  assert.notEqual(first.artifact_revisions['artifact-ui'], final.artifact_revisions['artifact-ui']);
  assert.equal(first.artifact_revisions['artifact-tools'], final.artifact_revisions['artifact-tools']);
  const consumer = state.calls.find(call => call.id === 'build-ui' && call.round_index === 1);
  assert.equal(consumer.input['artifact-core'], final.artifact_revisions['artifact-core']);
  assert.notEqual(result.rounds[0].plan.graph_revision, result.rounds[1].plan.graph_revision);
  await assert.rejects(runAdaptiveDagExecution(state.options), error => error.code === 'ADAPTIVE_EXECUTION_RESTART_BLOCKED');
  assert.equal(state.calls.length, 5);
});

test('repair decision cause stays distinct from public failure for known rejection and unknown callback interruption', async t => {
  for (const known of [true, false]) await t.test(known ? 'known HTTP400' : 'unknown callback', async t => {
    const state = await fixture(t);
    state.options.maxRepairRounds = 1;
    state.options.decideRepair = async () => {
      if (known) throw Object.assign(new Error('rejected'), {code: 'HTTP_ERROR', http_status: 400,
        error_diagnostics: {category: 'model_input_limit'}, outcomeUncertain: false});
      throw new Error('callback interrupted without an outcome');
    };
    const result = await runAdaptiveDagExecution(state.options);
    assert.equal(result.status, known ? 'failed' : 'uncertain');
    assert.equal(result.outcome_uncertain, !known);
    assert.deepEqual(result.terminal_cause, {stage: 'repair', code: known ? 'HTTP_ERROR' : 'REPAIR_CALLBACK_THROW',
      http_status: known ? 400 : null, category: known ? 'model_input_limit' : null, outcome_uncertain: !known});
    assert.equal(result.stop_code, result.terminal_cause.code);
    assert.equal(result.prior_public_failure.code, 'ARTIFACT_CHECK_NOT_PASSED');
    assert.equal(result.prior_public_failure.public_evidence.length, 7);
    assert.equal(result.operations.repair, 0);
    assert.equal(state.calls.length, 3);
  });
});

test('revision-bound fixture blocker repairs only its owner and still reruns all public checks against carried bytes', async t => {
  const state = await fixture(t), core = state.options.plan.tasks.find(task => task.id === 'build-core');
  const broken = 'import re\nD = r"\\. _-"\ndef words(value):\n return re.findall(rf"[^{D}\\s]+", value)\n';
  state.options.repairScopePolicy = 'minimal-public-v1';
  state.options.maxRepairRounds = 1;
  core.write_scope = [...core.write_scope, 'naming.py'];
  state.options.artifactBindings['artifact-core'].paths.push('naming.py');
  for (const task of state.options.plan.tasks) if (task.input_artifact_ids.includes('artifact-core')) task.read_scope = [...new Set([...task.read_scope, 'naming.py'])];
  const execute = state.options.executeTask;
  state.options.executeTask = async (task, context) => {
    const result = await execute(task, context);
    if (task.id === 'build-core') await writeFile(join(context.stageDirectory, 'naming.py'),
      context.round_index === 0 ? broken : broken.replace(' _-', ' _\\-'));
    return result;
  };
  const check = state.options.checkTask;
  state.options.checkTask = async (definition, context) => {
    const result = await check(definition, context);
    if (definition.id === 'public-1' && context.round_index === 0) {
      result.evidence.cases = [];
      result.evidence.assertions = 0;
      result.evidence.skipped = 1;
      result.evidence.unexecuted_test_ids = ['public-1-case'];
      result.evidence.error = {code: 'AssertionError',
        message: 'valid public fixture generation failed:\nre.error: bad character range _-\\s at position 5'};
    }
    return result;
  };
  state.options.decideRepair = async request => {
    const candidate = request.candidates.find(c => c.id === 'repair-fixture-blocker-owners');
    assert.deepEqual(candidate.task_ids, ['build-core']);
    assert.equal(request.failure.repair_scope.fixture_blockers[0].witness.path, 'naming.py');
    return {status: 'selected', candidate_id: candidate.id, candidate};
  };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.operations, {implementation: 3, repair: 1, carry_forward: 2});
  assert.equal(state.checks.filter(check => check.id.startsWith('public-')).length, 14);
  assert.equal(result.rounds[1].public_evidence[0].status, 'passed');
  assert.equal(result.rounds[1].public_evidence[1].status, 'failed');
  assert.equal(result.rounds[0].repair_scope.fixture_blockers[0].witness.artifact_revision,
    result.rounds[0].exported.artifact_revisions['artifact-core']);
});

test('known local failure never releases its consumer, then seeded repair and unbuilt implementation are distinct', async t => {
  const state = await fixture(t, {localFailure: true});
  state.options.projectRepairFailure = projectAdaptiveRepairFailure;
  state.options.plan.max_concurrency = 1;
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed');
  assert.deepEqual(state.calls.filter(call => call.round_index === 0).map(call => call.id), ['build-core']);
  assert.equal(result.rounds[0].public_evidence.length, 0);
  assert.deepEqual(result.rounds[0].exported.artifact_revisions, {});
  assert.deepEqual(state.calls.filter(call => call.round_index === 1).map(call => [call.id, call.operation]).sort(),
    [['build-core', 'repair'], ['build-tools', 'implementation'], ['build-ui', 'implementation']]);
  assert.deepEqual(result.operations, {implementation: 3, repair: 1, carry_forward: 0});
});

async function artifactFixture(t) {
  const state = await fixture(t), {options} = state, plan = options.plan;
  const core = plan.tasks.find(task => task.id === 'build-core');
  const hash = value => createHash('sha256').update(value).digest('hex');
  const meta = {id: 'artifact-meta', producer_task_id: core.id};
  plan.artifacts.push(meta); core.output_artifact_ids.push(meta.id);
  core.requirement_ids.push('requirement-meta'); plan.requirement_ids.push('requirement-meta');
  options.artifactBindings['artifact-core'].paths = ['core.json'];
  options.artifactBindings['artifact-meta'] = {paths: ['metadata.json']};
  const integration = plan.tasks.find(task => task.kind === 'verification');
  integration.input_artifact_ids.push(meta.id); integration.requirement_ids.push('requirement-meta');
  const local = plan.checks.find(check => check.id === 'check-core');
  local.artifact_ids.push(meta.id); local.requirement_ids.push('requirement-meta');
  for (const check of plan.checks.filter(check => check.phase === 'integration')) {
    check.artifact_ids.push(meta.id); check.requirement_ids.push('requirement-meta');
  }
  const source = 'Preserve core behavior. Preserve UI behavior. Preserve tools behavior. Preserve metadata behavior.';
  const catalog = {schema_version: 'adaptive-catalog/v1', source_sha256: hash(source),
    units: plan.artifacts.map(artifact => ({id: `unit-${artifact.id}`, title: artifact.id, artifact_ids: [artifact.id],
      requirement_ids: [artifact.id.replace('artifact-', 'requirement-')], interface: `${artifact.id}: stable JSON fields`, evidence_ids: [`evidence-${artifact.id}`]})),
    artifacts: plan.artifacts.map(artifact => ({id: artifact.id, paths: options.artifactBindings[artifact.id].paths,
      description: `Preserve ${artifact.id} behavior.`, evidence_ids: [`evidence-${artifact.id}`]})),
    evidence: plan.artifacts.map(artifact => ({id: `evidence-${artifact.id}`, quote: source}))};
  options.planning = {plan, artifactBindings: options.artifactBindings, catalog, source_sha256: hash(source),
    catalog_sha256: hash(JSON.stringify(catalog)), requirement_descriptions: plan.requirement_ids.map(id => ({id, text: `Original ${id} behavior.`, source_refs: ['fixture-spec']}))};
  const contract = {schema_version: 'public-assertion-contract/v1', version: '1', assertions: [{id: 'assert-core-value',
    check_id: 'public-1', test_id: 'public-1-case', requirement_ids: ['requirement-core'], artifact_paths: ['core.json']}]};
  const source_text = JSON.stringify(contract), source_path = 'assertions.json', sha256 = hash(source_text);
  const path = join(state.root, source_path); await writeFile(path, source_text);
  options.checkerFiles.push({path, relative_path: source_path});
  options.assertionContract = {contract, source_text, source_path, sha256};
  options.repairScopePolicy = 'minimal-public-v1'; options.artifactRepairPolicy = 'artifact-v1'; options.maxRepairRounds = 1;
  const check = options.checkTask;
  options.checkTask = async (definition, context) => {
    const report = await check(definition, context);
    if (definition.id === 'public-1') {
      report.evidence.assertion_contract_sha256 = sha256;
      const testcase = report.evidence.cases[0];
      testcase.assertion_results = [{assertion_id: 'assert-core-value', status: testcase.status}];
      if (testcase.status === 'failed') { testcase.failed_assertion_id = 'assert-core-value'; testcase.error_type = 'AssertionError'; }
    }
    return report;
  };
  const work = options.executeTask;
  state.repairViews = [];
  options.executeTask = async (task, context) => {
    if (context.operation === 'repair') state.repairViews.push({task: structuredClone(task), context: structuredClone(context)});
    return work(task, context);
  };
  return state;
}

for (const policy of ['artifact-v1', 'artifact-v2']) test(`${policy} narrows a multi-artifact worker, preserves inherited bytes and modes, and rechecks all public cases`, async t => {
  const state = await artifactFixture(t);
  state.options.artifactRepairPolicy = policy;
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed');
  assert.deepEqual(result.operations, {implementation: 3, repair: 2, carry_forward: 1});
  assert.deepEqual(result.repair_actions[0].candidate.artifact_ids, ['artifact-core', 'artifact-ui']);
  const view = state.repairViews.find(row => row.task.id === 'build-core');
  assert.deepEqual(view.task.output_artifact_ids, ['artifact-core']);
  assert.deepEqual(view.task.write_scope, ['core.json']);
  assert(view.task.read_scope.includes('metadata.json'));
  assert.deepEqual(view.context.repair_context.artifact_repair.requirement_descriptions.map(r => r.id), ['requirement-core']);
  assert.equal(view.context.repair_context.failed_public_reports, undefined);
  assert.equal(state.calls.filter(call => call.round_index === 1 && call.id === 'build-tools').length, 0);
  const [before, after] = result.rounds.map(round => round.exported.candidateDirectory);
  assert.deepEqual(await readFile(join(before, 'metadata.json')), await readFile(join(after, 'metadata.json')));
  assert.equal((await lstat(join(before, 'metadata.json'))).mode & 0o777, (await lstat(join(after, 'metadata.json'))).mode & 0o777);
  assert.equal(result.rounds[0].exported.artifact_revisions['artifact-meta'], result.rounds[1].exported.artifact_revisions['artifact-meta']);
  assert.equal(state.checks.filter(check => check.id.startsWith('public-')).length, 14);
  assert.equal(state.events.filter(event => event.event === 'adaptive_artifact_repair_inheritance_verified').length, 2);
});

test('artifact repair cannot change nonselected own bytes or executable mode', async t => {
  for (const mutation of ['bytes', 'executable']) await t.test(mutation, async t => {
    const state = await artifactFixture(t), execute = state.options.executeTask;
    state.options.executeTask = async (task, context) => {
      const outcome = await execute(task, context);
      if (context.operation === 'repair' && task.id === 'build-core') {
        if (mutation === 'bytes') await writeFile(join(context.stageDirectory, 'metadata.json'), '{"kind":"unauthorized"}');
        else await chmod(join(context.stageDirectory, 'metadata.json'), 0o755);
      }
      return outcome;
    };
    const result = await runAdaptiveDagExecution(state.options);
    assert.equal(result.status, 'failed');
    assert.equal(result.stop_code, 'ADAPTIVE_ARTIFACT_REPAIR_CARRY_DRIFT');
    assert.equal(result.outcome_uncertain, false);
    assert.equal(result.rounds[1].public_evidence.length, 0);
    assert(state.events.some(event => event.event === 'adaptive_artifact_repair_rejected'));
  });
});

test('artifact repair stops before unselected unbuilt workers instead of expanding the chosen scope', async t => {
  const state = await fixture(t, {localFailure: true});
  state.options.artifactRepairPolicy = 'artifact-v1'; state.options.plan.max_concurrency = 1;
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'failed');
  assert.equal(result.stop_code, 'ADAPTIVE_ARTIFACT_REPAIR_UNREADY_UNSELECTED_TASK');
  assert.equal(result.outcome_uncertain, false);
  assert.deepEqual(state.calls.map(call => call.id), ['build-core']);
  assert.equal(result.rounds[0].prior_public_failure.artifact_repair_fallback.reason, 'ASSERTION_ARTIFACT_MAPPING_UNAVAILABLE');
});

test('owner-only choice carries consumer bytes with fresh inputs and cannot reuse its previous check certificate', async t => {
  const state = await fixture(t);
  state.options.maxRepairRounds = 1;
  state.options.decideRepair = async request => {
    const candidate = request.candidates.find(candidate => candidate.id === 'repair-failure-owners');
    assert.deepEqual(candidate.task_ids, ['build-core']);
    return {status: 'selected', candidate_id: candidate.id, candidate};
  };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'failed');
  assert.deepEqual(state.calls.filter(call => call.round_index === 1).map(call => call.id), ['build-core']);
  assert.deepEqual(result.operations, {implementation: 3, repair: 1, carry_forward: 2});
  assert.equal(result.rounds[1].public_evidence.length, 7);
  assert.equal(result.rounds[1].public_evidence[0].status, 'passed');
  assert.equal(result.rounds[1].public_evidence[1].status, 'failed');
  assert.equal(JSON.parse(await readFile(join(result.candidate_path, 'ui.json'))).label, 'value:7');
  assert.equal(JSON.parse(await readFile(join(result.candidate_path, 'core.json'))).value, 8);
  const carry = result.rounds[1].operations.find(operation => operation.task_id === 'build-ui');
  assert.equal(carry.operation, 'carry_forward');
  assert.notEqual(carry.prior_input_artifact_revisions['artifact-core'], carry.current_input_artifact_revisions['artifact-core']);
  assert.equal(state.checks.filter(check => check.id === 'check-ui').length, 2);
  assert.notEqual(result.rounds[0].public_evidence[1].evidence_key, result.rounds[1].public_evidence[1].evidence_key);
});

test('uncertain worker or public check stops before repair selection and existing journals cannot replay', async t => {
  for (const fault of ['worker', 'check']) await t.test(fault, async t => {
    const state = await fixture(t);
    state.options.plan.max_concurrency = 1;
    if (fault === 'worker') state.options.executeTask = async () => ({status: 'unknown', outcome_uncertain: false});
    else {
      const check = state.options.checkTask;
      state.options.checkTask = async (definition, context) => definition.id === 'public-2'
        ? {status: 'unknown', outcome_uncertain: false} : check(definition, context);
    }
    const result = await runAdaptiveDagExecution(state.options);
    assert.equal(result.status, 'uncertain');
    assert.equal(result.outcome_uncertain, true);
    assert.equal(result.rounds.length, 1);
    assert.equal(result.rounds[0].journal.status, 'uncertain');
    assert.equal(state.choices.length, 0);
    assert.equal(state.checks.some(check => check.id === 'public-3'), false);
    await assert.rejects(runAdaptiveDagExecution(state.options), error => error.code === 'ADAPTIVE_EXECUTION_RESTART_BLOCKED');
  });
});

test('repair choices cannot change the controller candidate scope or exceed the same fixed round budget', async t => {
  const state = await fixture(t);
  state.options.decideRepair = async request => ({status: 'selected', candidate_id: request.candidates[0].id,
    candidate: {...request.candidates[0], task_ids: ['build-core', 'build-ui']}});
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'failed');
  assert.equal(result.rounds.length, 1);
  assert.equal(result.rounds[0].fatal.code, 'ADAPTIVE_EXECUTION_INVALID_REPAIR_SELECTION');
  assert.equal(state.calls.length, 3);

  const bounded = await fixture(t);
  bounded.options.maxRepairRounds = 0;
  const noRepair = await runAdaptiveDagExecution(bounded.options);
  assert.equal(noRepair.status, 'failed');
  assert.equal(noRepair.rounds.length, 1);
  assert.equal(bounded.choices.length, 0);
  assert.equal(noRepair.public_evidence.length, 7);
});

test('D075 profile preparation failure retains checked candidate evidence without inventing a repair attempt or retry', async t => {
  for (const kind of ['known input limit', 'uncertain outcome', 'outstanding request']) await t.test(kind, async t => {
    const state = await artifactFixture(t);
    Object.assign(state.options, {failureRecoveryPolicy: 'evidence-loop-v1', repairScopePolicy: 'public-causal-v1',
      artifactRepairPolicy: 'causal-v1'});
    const contract = {...state.options.assertionContract.contract, version: '2'}, source_text = JSON.stringify(contract);
    const sha256 = createHash('sha256').update(source_text).digest('hex');
    state.options.assertionContract = {...state.options.assertionContract, contract, source_text, sha256};
    await writeFile(join(state.root, 'assertions.json'), source_text);
    const check = state.options.checkTask;
    state.options.checkTask = async (definition, context) => {
      const report = await check(definition, context);
      if (definition.id === 'public-1') report.evidence.assertion_contract_sha256 = sha256;
      return report;
    };
    const terminal = {stage: 'profiles', code: kind === 'outstanding request' ? 'BUDGET_OUTSTANDING' : 'HTTP_ERROR',
      http_status: kind === 'known input limit' ? 400 : null,
      category: kind === 'known input limit' ? 'model_input_limit' : null,
      outcome_uncertain: kind === 'uncertain outcome'};
    let preparations = 0, recoveries = 0;
    state.options.prepareRoundPlan = async () => {
      preparations++;
      throw Object.assign(new Error(terminal.code), {code: terminal.code, terminal_cause: terminal,
        outcome_uncertain: terminal.outcome_uncertain});
    };
    state.options.recoverFailure = async () => { recoveries++; throw new Error('profile reconstruction is unsupported'); };
    const result = await runAdaptiveDagExecution(state.options), [verified, preparation] = result.rounds;
    assert.equal(preparations, 1); assert.equal(recoveries, 0); assert.equal(state.choices.length, 1);
    assert.equal(state.calls.length, 3); assert.equal(result.operations.repair, 0);
    assert.equal(result.repair_rounds_used, 0); assert.equal(result.repair_history.entries.length, 0);
    assert.deepEqual(result.terminal_cause, terminal); assert.equal(result.stop_code, terminal.code);
    assert.equal(preparation.initialization, null); assert.equal(preparation.exported, null);
    assert.deepEqual(preparation.preparation_failure, {stage: 'profiles', runtime_started: false, worker_started: false});
    assert.equal(preparation.repair_history_unavailable, undefined);
    assert.deepEqual(preparation.public_evidence, []);
    assert.equal(result.candidate_path, verified.exported.candidateDirectory);
    assert.deepEqual(result.artifact_revisions, verified.exported.artifact_revisions);
    assert.deepEqual(result.public_evidence, verified.public_evidence);
    assert.deepEqual(result.prior_public_failure.public_evidence, verified.public_evidence);
    assert.deepEqual(result.candidate_basis, {round_index: 0, reason: 'retained_export_before_profile_preparation_failure', failed_round_index: 1});
    assert.equal(JSON.parse(await readFile(join(result.candidate_path, 'core.json'))).value, 7);
    assert.equal((await lstat(join(result.candidate_path, 'core.json'))).mode & 0o222, 0);
    assert.equal(result.rounds[1].recovery_assessment.progress.attempted, false);
    assert.equal(result.failure_recovery.actions.length, 1);
    assert.equal(state.events.filter(event => event.event === 'adaptive_failure_recovery_requested').length, 0);
    assert.equal(state.events.filter(event => event.event === 'adaptive_failure_recovery_blocked').length, 1);
    assert.equal(state.events.filter(event => event.event === 'adaptive_causal_repair_history_unavailable').length, 0);
    if (kind === 'known input limit') {
      assert.equal(result.failure_recovery.terminal.reason, 'PROFILE_INPUT_REBUILD_UNSUPPORTED');
      assert.deepEqual(result.failure_recovery.terminal.unsupported_recovery, {failed_request_captured: false,
        canonical_rebuild_supported: false, required_handler: 'profile_request_capture_and_verified_reconstruction'});
    } else assert.equal(result.failure_recovery.terminal.status, 'reconcile_request');
  });
});

test('D075 partial global progress inspects an unchanged selected scope before another owner, profile or worker call', async t => {
  const state = await fixture(t);
  const checker = join(state.root, 'checker.mjs');
  await writeFile(checker, checkerSource.replace("else passed=(await read('ui.json')).label==='value:'+(await read('core.json')).value;",
    "else if(id==='public-2') passed=(await read('ui.json')).label==='fixed'; else passed=true;"));
  Object.assign(state.options, {failureRecoveryPolicy: 'evidence-loop-v1', repairScopePolicy: 'minimal-public-v1'});
  state.options.testRequirements['public-2-case'] = ['requirement-ui'];
  const execute = state.options.executeTask;
  state.options.executeTask = async (task, context) => {
    const result = await execute(task, context);
    if (task.id === 'build-ui' && context.round_index === 1) await writeFile(join(context.stageDirectory, 'ui.json'), '{"label":"value:7"}');
    return result;
  };
  let profileCalls = 0, recoveryCalls = 0;
  state.options.prepareRoundPlan = async ({plan}) => { profileCalls++; return {plan}; };
  state.options.recoverFailure = async context => {
    recoveryCalls++; assert.equal(context.action, 'inspect_no_write_cause');
    assert.equal(context.failure.public_evidence[0].status, 'passed');
    assert.equal(context.failure.public_evidence[1].status, 'failed');
    assert.ok(context.sourceFiles.some(source => source.path === 'ui.json' && source.text === '{"label":"value:7"}'));
    return {status: 'needs_evidence', evidence: [], reason: 'NO_NEW_CAUSAL_EVIDENCE'};
  };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'failed'); assert.equal(result.rounds.length, 2);
  assert.equal(state.choices.length, 1); assert.equal(profileCalls, 1); assert.equal(recoveryCalls, 1);
  assert.equal(state.calls.some(call => call.round_index === 2), false);
  assert.equal(result.failure_recovery.terminal.action, 'inspect_no_write_cause');
  assert.equal(result.failure_recovery.terminal.status, 'needs_evidence');
  assert.equal(state.checks.filter(check => check.id.startsWith('public-')).length, 14);
  assert.equal(result.rounds[0].exported.artifact_revisions['artifact-ui'], result.artifact_revisions['artifact-ui']);
});

test('D075 transmission integrity or unknown known failure terminates after one callback instead of looping', async t => {
  for (const code of ['ADAPTIVE_TRANSMISSION_PREFLIGHT_BLOCKED', 'JEV_TRANSMISSION_RECOVERY_INVALID',
    'ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED', 'NEW_UNCLASSIFIED_FAILURE', 'BUDGET_OUTSTANDING']) await t.test(code, async t => {
    const state = await fixture(t); let decisions = 0, investigations = 0;
    state.options.failureRecoveryPolicy = 'evidence-loop-v1';
    state.options.decideRepair = async () => { decisions++; throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
    state.options.recoverFailure = async () => { investigations++; throw new Error('must not investigate a transport contract'); };
    const result = await runAdaptiveDagExecution(state.options);
    assert.equal(decisions, 1); assert.equal(investigations, 0);
    assert.equal(result.rounds.length, 1); assert.equal(result.operations.repair, 0);
    assert.equal(result.stop_code, code);
    assert.equal(result.failure_recovery.terminal.status, code === 'BUDGET_OUTSTANDING' ? 'reconcile_request' : 'needs_evidence');
  });
});

test('D075 uncertain worker stops at reconciliation without invoking the recovery callback', async t => {
  const state = await fixture(t); let investigations = 0;
  state.options.failureRecoveryPolicy = 'evidence-loop-v1'; state.options.plan.max_concurrency = 1;
  state.options.executeTask = async () => ({status: 'unknown', outcome_uncertain: true});
  state.options.recoverFailure = async () => { investigations++; return {status: 'ready', evidence: []}; };
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.outcome_uncertain, true); assert.equal(investigations, 0); assert.equal(state.choices.length, 0);
  assert.equal(result.failure_recovery.terminal.status, 'reconcile_request');
});

test('D075 recovery callback cannot replace controller source authority, while original-byte evidence still recovers', async t => {
  for (const forgeSource of [true, false]) await t.test(forgeSource ? 'mutated source text and SHA' : 'valid source with isolated metadata edits', async t => {
    const state = await fixture(t), execute = state.options.executeTask;
    Object.assign(state.options, {failureRecoveryPolicy: 'evidence-loop-v1', repairScopePolicy: 'minimal-public-v1'});
    state.options.executeTask = async (task, context) => {
      if (context.round_index === 1) return {status: 'completed'}; // Seeded bytes are intentionally unchanged.
      return execute(task, context);
    };
    let recoveryCalls = 0;
    state.options.recoverFailure = async context => {
      recoveryCalls++;
      const source = context.sourceFiles.find(row => row.path === 'core.json');
      assert.equal(source.text, '{"value":7}');
      if (forgeSource) {
        source.text = '{"value":888}';
        source.sha256 = createHash('sha256').update(source.text).digest('hex');
      }
      // None of these callback-owned mutations may change later authorization.
      context.artifactBindings['artifact-core'].paths.push('forged.py');
      context.planning.plan.tasks[0].write_scope.push('forged.py');
      context.candidates[0].task_ids.push('forged-task');
      context.failure.public_evidence[0].status = 'passed';
      return {status: 'ready', evidence: [{kind: 'static_source_observation', artifact_id: source.artifact_id,
        path: source.path, revision: source.revision, sha256: source.sha256,
        ranges: [{start_line: 1, end_line: 1, text: source.text}], relations: []}]};
    };
    const result = await runAdaptiveDagExecution(state.options);
    assert.equal(recoveryCalls, 1);
    assert.equal(result.rounds.length, forgeSource ? 2 : 3);
    assert.equal(result.status, forgeSource ? 'failed' : 'completed');
    assert.equal(state.choices.length, forgeSource ? 1 : 2);
    assert.equal(result.rounds[1].public_evidence[0].status, 'failed');
    assert.equal(result.rounds.some(round => round.plan.tasks.some(task => task.write_scope.includes('forged.py'))), false);
    assert.equal(JSON.parse(await readFile(join(result.rounds[1].exported.candidateDirectory, 'core.json'))).value, 7);
    if (forgeSource) {
      assert.equal(result.failure_recovery.terminal.reason, 'ADAPTIVE_RECOVERY_EVIDENCE_BINDING');
      assert.equal(state.calls.some(call => call.round_index === 2), false);
    } else {
      assert.equal(JSON.parse(await readFile(join(result.candidate_path, 'core.json'))).value, 8);
      assert.equal(result.rounds[2].public_evidence.every(row => row.status === 'passed'), true);
      assert.equal(result.failure_recovery.actions.some(action => action.status === 'ready'), true);
    }
  });
});
