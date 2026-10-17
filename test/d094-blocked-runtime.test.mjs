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


test('known profile block closes worker and task journal without producing artifacts or uncertain replay',async t=>{const state=await setup(t);const blocked=Object.assign(Error('WORKER_PROFILE_BLOCKED'),{code:'WORKER_PROFILE_BLOCKED',status:'blocked',dispatch_started:false,outcome_uncertain:false});const {runtime}=await state.start({executeTask:async()=>{throw blocked;}});const r=await runArtifactWorkflow({plan:fixture,run_id:state.options.run_id,execute:runtime.execute,runCheck:runtime.runCheck,getRevision:runtime.getRevision,record:runtime.record});assert.equal(r.status,'blocked');assert.equal(r.execution.failure.code,'WORKER_PROFILE_BLOCKED');assert.equal(r.execution.failure.outcome_uncertain,false);assert.equal((await runtime.journalState()).status,'recorded');assert.deepEqual(r.verified_artifact_revisions,{});});

test('claimed block after possible dispatch cannot downgrade genuine uncertainty',async t=>{
 const state=await setup(t);const {runtime}=await state.start({executeTask:async()=>{throw Object.assign(Error('not known pre-dispatch'),{code:'WORKER_PROFILE_BLOCKED',status:'blocked',dispatch_started:true,outcome_uncertain:false});}});const r=await state.workflow(runtime);assert.equal(r.execution.failure.outcome_uncertain,true);assert.equal((await runtime.journalState()).status,'uncertain');
});
