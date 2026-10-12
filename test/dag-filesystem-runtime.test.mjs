import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {chmod, lstat, link, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {promisify} from 'node:util';
import {createDagFilesystemRuntime} from '../src/orchestration/dag-filesystem-runtime.mjs';
import {runArtifactWorkflow} from '../src/orchestration/dag-workflow.mjs';

const exec = promisify(execFile);
const fixture = JSON.parse(await readFile(new URL('../examples/dag/contract-fixture.json', import.meta.url)));
const checker = `import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
const [id,root,environment_ref]=process.argv.slice(2);
const json=async name=>JSON.parse(await readFile(join(root,'examples/dag/output',name+'.json')));
if(id==='check-core')assert.equal((await json('core')).value,7);
else if(id==='check-ui')assert.equal((await json('ui')).label,'value:7');
else if(id==='check-integration')assert.equal((await json('ui')).label,'value:'+(await json('core')).value);
else throw Error('unknown check');
console.log(JSON.stringify({check_id:id,check_version:'1',environment_ref,status:'passed',executed:true,exit_code:0,assertions:1,skipped:0,outcome_uncertain:false}));
`;

async function writableRemove(path) {
  const stat = await lstat(path).catch(() => null);
  if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    await chmod(path, 0o700);
    for (const entry of await readdir(path)) await writableRemove(join(path, entry));
  }
  await rm(path, {recursive: true, force: true});
}

async function setup(t, {dependent = false} = {}) {
  const temporary = await realpath(await mkdtemp(join(tmpdir(), 'dag-filesystem-')));
  const source = join(temporary, 'checker.mjs');
  await writeFile(source, checker);
  t.after(() => writableRemove(temporary));
  const plan = structuredClone(fixture);
  if (dependent) {
    plan.tasks[1].input_artifact_ids = ['artifact-core'];
    plan.tasks[1].read_scope = ['examples/dag/output/core.json'];
  }
  const options = {
    plan, run_id: 'runtime-fixture', runDirectory: join(temporary, 'run'),
    artifactBindings: {'artifact-core': {paths: ['examples/dag/output/core.json']}, 'artifact-ui': {paths: ['examples/dag/output/ui.json']}},
    checkerFiles: [{path: source, relative_path: 'checker.mjs'}], environment: {id: 'node22-fixture-v1'},
    probeEnvironment: async () => ({node: process.version, executable: process.execPath, platform: process.platform, architecture: process.arch}),
    executeTask: async (task, {stageDirectory}) => {
      const output = join(stageDirectory, 'examples/dag/output');
      await mkdir(output, {recursive: true});
      await writeFile(join(output, task.id === 'build-core' ? 'core.json' : 'ui.json'),
        JSON.stringify(task.id === 'build-core' ? {value: 7} : {label: 'value:7'}));
      return {status: 'completed'};
    },
    checkTask: async (check, {candidateDirectory, pinnedDirectory, environment}) => {
      const {stdout} = await exec(process.execPath, [join(pinnedDirectory, 'checker.mjs'), check.id, candidateDirectory, environment.id]);
      return JSON.parse(stdout);
    },
  };
  async function start(changes = {}) {
    const runtime = await createDagFilesystemRuntime({...options, ...changes});
    t.after(() => runtime.close());
    const initialization = await runtime.initialize();
    return {runtime, initialization};
  }
  const workflow = (runtime, currentPlan = plan) => runArtifactWorkflow({plan: currentPlan, run_id: options.run_id,
    execute: runtime.execute, runCheck: runtime.runCheck, getRevision: runtime.getRevision, record: runtime.record});
  return {temporary, source, options, plan, start, workflow};
}

test('real staging, pinned subprocess checks, immutable artifacts and durable begin records complete a DAG', async t => {
  const state = await setup(t, {dependent: true});
  let runtime, observedWorkerBegin = false;
  ({runtime} = await state.start({executeTask: async (task, context) => {
    const journal = await runtime.journalState();
    observedWorkerBegin ||= journal.unresolved.some(entry => entry.event === 'worker' && entry.attempt_id === context.attempt_id);
    if (task.id === 'build-ui') {
      const input = join(context.inputDirectory, 'examples/dag/output/core.json');
      assert.equal((await lstat(input)).mode & 0o222, 0);
      assert.equal(JSON.parse(await readFile(input)).value, 7);
    }
    return state.options.executeTask(task, context);
  }}));
  const result = await state.workflow(runtime);
  assert.equal(result.status, 'completed');
  assert.equal(observedWorkerBegin, true);
  const evidence = result.execution.results['verify-integration'].value.verification.evidence[0];
  assert.match(evidence.evidence_key, /^[0-9a-f]{64}$/);
  assert.match(evidence.runtime_binding.checker_manifest_sha256, /^[0-9a-f]{64}$/);
  const final = await runtime.finalize(result);
  assert.equal(final.journal.status, 'recorded');
  assert.equal(final.journal.unresolved.length, 0);
  assert.equal(final.journal.replay_allowed, false);
  assert.equal(JSON.parse(await readFile(join(final.candidateDirectory, 'examples/dag/output/ui.json'))).label, 'value:7');
  assert.equal((await lstat(join(final.candidateDirectory, 'examples/dag/output/core.json'))).mode & 0o222, 0);
});

test('undeclared writes and distinct filesystem aliases fail before checking or publication', async t => {
  for (const fault of ['undeclared', 'symlink', 'hardlink', 'case-alias']) await t.test(fault, async t => {
    const state = await setup(t);
    state.plan.max_concurrency = 1;
    const external = join(state.temporary, 'external.json');
    await writeFile(external, '{"value":7}');
    let checks = 0;
    const {runtime} = await state.start({executeTask: async (task, context) => {
      if (fault === 'undeclared') {
        await state.options.executeTask(task, context);
        await writeFile(join(context.stageDirectory, 'outside.txt'), 'unowned');
      } else if (fault === 'case-alias') {
        await mkdir(join(context.stageDirectory, 'EXAMPLES'), {recursive: true});
        await state.options.executeTask(task, context);
      } else {
        const destination = join(context.stageDirectory, 'examples/dag/output/core.json');
        await mkdir(join(context.stageDirectory, 'examples/dag/output'), {recursive: true});
        await (fault === 'symlink' ? symlink(external, destination) : link(external, destination));
      }
      return {status: 'completed'};
    }, checkTask: async () => { checks++; throw Error('must not check'); }});
    const result = await state.workflow(runtime);
    assert.equal(result.status, 'failed');
    assert.equal(checks, 0);
    assert.deepEqual(result.verified_artifact_revisions, {});
    const failure = result.execution.failure.code;
    assert.ok(['DAG_RUNTIME_UNDECLARED_WRITE', 'DAG_RUNTIME_SYMLINK', 'DAG_RUNTIME_HARDLINK', 'DAG_RUNTIME_PATH_ALIAS'].includes(failure), failure);
  });
});

test('changed immutable input copy blocks the consumer while published predecessor bytes stay intact', async t => {
  const state = await setup(t, {dependent: true});
  const {runtime} = await state.start({executeTask: async (task, context) => {
    await state.options.executeTask(task, context);
    if (task.id === 'build-ui') {
      const input = join(context.inputDirectory, 'examples/dag/output/core.json');
      await chmod(input, 0o644);
      await writeFile(input, '{"value":8}');
    }
    return {status: 'completed'};
  }});
  const result = await state.workflow(runtime);
  assert.equal(result.status, 'failed');
  assert.equal(result.execution.failure.code, 'DAG_RUNTIME_INPUT_MUTATED');
  assert.deepEqual(Object.keys(result.verified_artifact_revisions), ['artifact-core']);
  const final = await runtime.finalize(result);
  assert.equal(JSON.parse(await readFile(join(final.candidateDirectory, 'examples/dag/output/core.json'))).value, 7);
});

test('staging drift after input snapshot is rejected before the consumer callback can read it', async t => {
  const state = await setup(t, {dependent: true});
  let consumerCalls = 0, injected = false;
  const {runtime, initialization} = await state.start({executeTask: async (task, context) => {
    if (task.id === 'build-ui') consumerCalls++;
    return state.options.executeTask(task, context);
  }});
  const result = await runArtifactWorkflow({plan: state.plan, run_id: state.options.run_id,
    execute: runtime.execute, runCheck: runtime.runCheck, record: runtime.record,
    getRevision: async (id, context) => {
      const revision = await runtime.getRevision(id, context);
      if (!injected && context.task?.id === 'build-ui' && context.stage === 'input_snapshot') {
        const journal = (await readFile(join(initialization.root, 'journal.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
        const prepared = journal.find(entry => entry.event === 'task_prepared' && entry.attempt_id === context.attempt_id);
        await writeFile(join(prepared.stage_directory, 'examples/dag/output/core.json'), '{"value":999}');
        injected = true;
      }
      return revision;
    },
  });
  assert.equal(injected, true);
  assert.equal(consumerCalls, 0);
  assert.equal(result.status, 'failed');
  assert.equal(result.execution.failure.code, 'DAG_RUNTIME_STAGED_INPUT_MUTATED');
  assert.equal((await runtime.journalState()).status, 'recorded');
});

test('checker and actual environment drift cannot retain successful evidence identity', async t => {
  for (const fault of ['checker', 'environment']) await t.test(fault, async t => {
    const state = await setup(t);
    state.plan.max_concurrency = 1;
    let changed = false;
    const {runtime} = await state.start({
      probeEnvironment: async () => ({node: process.version, dependency_revision: changed ? 'v2' : 'v1'}),
      checkTask: async (check, context) => {
        const result = await state.options.checkTask(check, context);
        if (fault === 'checker') await writeFile(state.source, `${checker}\n// changed checker\n`);
        else changed = true;
        return result;
      },
    });
    const result = await state.workflow(runtime);
    assert.equal(result.status, 'failed');
    assert.equal(result.execution.failure.code, fault === 'checker' ? 'DAG_RUNTIME_CHECKER_DRIFT' : 'DAG_RUNTIME_ENVIRONMENT_DRIFT');
    assert.deepEqual(result.verified_artifact_revisions, {});
  });
});

test('a fresh runtime refuses durable uncertain attempts without replaying a worker', async t => {
  const state = await setup(t);
  state.plan.max_concurrency = 1;
  let calls = 0;
  const executeTask = async () => { calls++; throw Object.assign(new Error('connection closed'), {outcome_uncertain: true}); };
  const {runtime} = await state.start({executeTask});
  const result = await state.workflow(runtime);
  assert.equal(result.status, 'failed');
  assert.equal(result.execution.failure.outcome_uncertain, true);
  await runtime.close();
  const restarted = await createDagFilesystemRuntime({...state.options, executeTask});
  await assert.rejects(restarted.initialize(), error => error.code === 'DAG_RUNTIME_RESTART_BLOCKED' && error.journal_state.status === 'uncertain');
  assert.equal(calls, 1);
});

test('unknown worker or checker status cannot downgrade journal uncertainty at the kernel boundary', async t => {
  for (const stage of ['worker', 'check']) await t.test(stage, async t => {
    const state = await setup(t);
    state.plan.max_concurrency = 1;
    const changes = stage === 'worker'
      ? {executeTask: async () => ({status: 'unknown', outcome_uncertain: false})}
      : {checkTask: async (check, context) => ({...(await state.options.checkTask(check, context)), status: 'unknown', outcome_uncertain: false})};
    const {runtime} = await state.start(changes);
    const result = await state.workflow(runtime);
    assert.equal(result.status, 'failed');
    assert.equal(result.execution.failure.outcome_uncertain, true);
    assert.equal((await runtime.journalState()).status, 'uncertain');
  });
});

test('explicit plan rebinding replaces the frozen graph and rejects old contexts or completed-check edits', async t => {
  const state = await setup(t);
  const {runtime} = await state.start();
  const nextPlan = structuredClone(state.plan);
  nextPlan.graph_revision = 'fixture-graph-v2';
  const binding = await runtime.bindPlan(nextPlan);
  await assert.rejects(runtime.record({run_id: state.options.run_id, graph_revision: state.plan.graph_revision, event: 'dag_plan_analyzed'}),
    {code: 'DAG_RUNTIME_EVENT_MISMATCH'});
  const result = await state.workflow(runtime, nextPlan);
  assert.equal(result.status, 'completed');
  assert.equal(result.execution.results['build-core'].value.verification.evidence[0].runtime_binding.binding_digest, binding.binding_digest);
  const altered = structuredClone(nextPlan);
  altered.graph_revision = 'fixture-graph-v3';
  altered.checks[0].version = '2';
  await assert.rejects(runtime.bindPlan(altered), {code: 'DAG_RUNTIME_COMPLETED_PLAN_CHANGE'});
  await runtime.finalize(result);
});
