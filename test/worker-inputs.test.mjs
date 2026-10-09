import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildWorkerInput} from '../src/orchestration/worker-inputs.mjs';
const plan = () => ({integrationInstructions: 'Preserve shared interface and global checks.', tasks: [
  {id: 'core', description: 'Implement core with exact exception behavior.', paths: ['core.py', 'types.py'], dependsOn: []},
  {id: 'api', description: 'Implement API using core.', paths: ['api.py'], dependsOn: ['core']},
  {id: 'plugin', description: 'Connect plugin to API.', paths: ['plugin.py'], dependsOn: ['api']},
  {id: 'packaging', description: 'Installable package.', paths: ['setup.py'], dependsOn: []}
]});
const profile = {model: 'claude-opus-5-5', effort: 'medium'};
const brief = ['Global requirement MUST survive.', {acceptance: 'Do not hide errors.'}];
const files = ['core.py', 'types.py', 'api.py', 'setup.py'].map(path => ({path, content: `EXACT_CONTENT:${path}`}));
function build(mode = 'projected', overrides = {}) {
  const p = plan();
  return buildWorkerInput({plan: p, task: p.tasks[2], brief, completedFiles: files, profile, mode, ...overrides});
}
test('deduplicated preserves original inputs once and v3 required fields exist', () => {
  const {request, manifest} = build('deduplicated');
  assert.deepEqual(request.brief, brief); assert.deepEqual(request.plan, plan()); assert.deepEqual(request.completedFiles, files);
  for (const key of ['goal', 'requirements', 'evidence', 'acceptanceCriteria', 'writeScopes', 'dependencies', 'manifest']) assert.equal(key in request, false);
  assert.equal(JSON.stringify(request).split('Global requirement MUST survive.').length - 1, 1);
  assert.equal(manifest.bytes.request, Buffer.byteLength(JSON.stringify(request)));
  const contract = JSON.parse(readFileSync(new URL('../docs/orchestration/contracts/worker-task.v3.json', import.meta.url)));
  for (const key of contract.requiredTaskInputs) assert.ok(key in request);
});
test('projection keeps transitive dependencies and excludes unrelated completed files', () => {
  const {request, manifest} = build();
  assert.equal('plan' in request, false);
  assert.equal(request.integrationInstructions, plan().integrationInstructions);
  assert.deepEqual(request.completedFiles, files.slice(0, 3));
  assert.deepEqual(manifest.selectedPaths, ['core.py', 'types.py', 'api.py']);
  assert.deepEqual(manifest.excludedPaths, ['setup.py']);
  assert.deepEqual(request.brief, brief);
  assert.deepEqual(request.task, plan().tasks[2]);
  assert.equal(request.model, profile.model); assert.equal(request.effort, profile.effort);
});
test('missing direct and transitive outputs reject before dispatch', () => {
  for (const missing of ['core.py', 'types.py', 'api.py']) {
    assert.throws(() => build('projected', {completedFiles: files.filter(f => f.path !== missing)}), /MISSING_DEPENDENCY_FILE/);
  }
});
test('root projection contains no unrelated completed output', () => {
  const p = plan();
  const {request} = build('projected', {task: p.tasks[3], completedFiles: files.slice(0, 3)});
  assert.deepEqual(request.completedFiles, []);
});
test('single projection retains every task description and all ownership', () => {
  const p = plan(), task = {id: 'single', description: 'Implement every task.', paths: p.tasks.flatMap(t => t.paths), dependsOn: []};
  const {request, manifest} = build('projected', {task, completedFiles: []});
  assert.deepEqual(request.plan, p); assert.deepEqual(request.task.paths, task.paths); assert.equal(manifest.single, true);
  for (const t of p.tasks) assert.ok(JSON.stringify(request).includes(t.description));
  assert.throws(() => build('projected', {task: {...task, paths: ['core.py']}, completedFiles: []}), /TASK_PLAN_MISMATCH/);
});
test('untrusted or ambiguous completed files and tampered task reject', () => {
  for (const extra of [{path: 'core.py', content: 'duplicate'}, {path: '../private', content: 'x'}, {path: 'not-owned.py', content: 'x'}, {path: 'plugin.py', content: 'already owned'}, {path: 'x.py', content: 1}]) {
    assert.throws(() => build('projected', {completedFiles: [...files, extra]}));
  }
  assert.throws(() => build('projected', {task: {...plan().tasks[2], dependsOn: []}}), /TASK_PLAN_MISMATCH/);
});
test('invalid graph, nested ownership and unmapped requirement slicing fail closed', () => {
  const p = plan(); p.tasks[0].dependsOn = ['plugin'];
  assert.throws(() => build('projected', {plan: p}), /CYCLIC_PLAN/);
  const q = plan(); q.tasks[2].dependsOn = ['unknown'];
  assert.throws(() => build('projected', {plan: q}), /INVALID_DEPENDENCY/);
  const r = plan(); r.tasks[3].paths = ['core.py/child'];
  assert.throws(() => build('projected', {plan: r}), /OVERLAPPING_OWNERSHIP/);
  assert.throws(() => build('projected', {requirements: []}), /UNVERIFIED_REQUIREMENT_MAPPING/);
});
test('builder leaves originals unchanged and output mutation cannot alter inputs', () => {
  const p = plan(), input = {plan: p, task: p.tasks[2], brief: structuredClone(brief), completedFiles: structuredClone(files), profile: {...profile}, mode: 'projected'};
  const before = structuredClone(input), a = buildWorkerInput(input), b = buildWorkerInput(input);
  assert.deepEqual(a, b); assert.deepEqual(input, before);
  a.request.task.paths.push('bad'); a.request.brief[1].acceptance = 'changed'; a.request.completedFiles[0].content = 'changed';
  assert.deepEqual(input, before);
  assert.notEqual(build('projected', {brief: 'different'}).manifest.sourceHashes.brief, b.manifest.sourceHashes.brief);
  assert.match(b.manifest.requestSha256, /^[a-f0-9]{64}$/);
});

test('explicit single execution avoids collision with a plan task named single',()=>{
 const p=plan();p.tasks[0].id='single';p.tasks[1].dependsOn=['single'];
 const task={id:'single',description:'Implement every task in the frozen plan.',paths:p.tasks.flatMap(t=>t.paths),dependsOn:[]};
 for(const mode of ['deduplicated','projected']){const {request,manifest}=buildWorkerInput({plan:p,task,brief,completedFiles:[],profile,mode,executionMode:'single'});assert.equal(manifest.single,true);assert.equal(request.plan.tasks.length,4);}
 assert.throws(()=>buildWorkerInput({plan:p,task,brief,completedFiles:[],profile,mode:'projected',executionMode:'split'}));
});
