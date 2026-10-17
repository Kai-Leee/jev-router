import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createCodexE2EChecks, inspectCodexE2EChecks, gradeCodexE2ECandidate, snapshotCodexCandidate, probeCodexBenchmarkHost} from '../src/benchmark/codex-e2e-checks.mjs';
const root = resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(join(root, 'benchmarks/e2e-swe/manifests/pointsman-d083.json')));
const image = JSON.parse(readFileSync(join(root, manifest.image_lock)));
function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'codex-e2e-checks-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}
const process = (exit_code = 0, stdout = '') => ({exit_code, stdout, stderr: '', outcome_uncertain: false});
function docker(report, calls) {
  return async (command, args, options) => {
    calls.push({command, args, options});
    if (args[0] === 'create') return process(0, 'a'.repeat(64));
    if (args[0] === 'start') return process(report.exit_code ?? 0, JSON.stringify(report));
    if (args[0] === 'rm') return process();
    throw new Error('UNEXPECTED_COMMAND');
  };
}
test('static check audit is provider-neutral and makes no process calls', async () => {
  const value = await inspectCodexE2EChecks({rootDir: root, manifest, runCommand: () => { throw new Error('NO_PROCESS_ALLOWED'); }});
  assert.equal(value.live_ready, false);
  assert.equal(value.paid_calls, 0);
  assert.equal(value.frozen_controls.status, 'verified');
  assert.equal(value.mapping.missing_test_count, 0);
  assert.ok(value.registry.length);
});
test('host probe reports sanitized Codex login without claiming model availability', async () => {
  const probe = await probeCodexBenchmarkHost({runCommand: async (_command, args) => args[0] === '--version'
    ? process(0, 'codex-cli 0.144.1\n') : {...process(), stderr: 'Logged in using an API key - secret-value'}});
  assert.equal(probe.version, '0.144.1'); assert.equal(probe.logged_in, true);
  assert.equal(probe.auth_kind, 'api_key'); assert.equal(probe.model_availability_verified, false);
  assert.ok(!JSON.stringify(probe).includes('secret-value'));
  const unknown = await probeCodexBenchmarkHost({runCommand: async () => process(0, 'unrecognized auth')});
  assert.equal(unknown.logged_in, false);
});
test('app preflight uses the frozen app account/version and never probes PATH Codex',async t=>{
 const directory=setup(t),expected=JSON.parse(readFileSync(join(root,manifest.public_checker_root,'environment.json')));
 const calls=[];let verified=0;
 const cliEnvironment={verify:async()=>{verified++;},evidence:{fingerprint:'frozen-app-fixture',app_binary:{version:'0.162.0-alpha.17.2'},auth:{logged_in:true,type:'chatgpt'}}};
 const report={python:expected.python+' fixture',modules:Object.fromEntries(Object.entries(expected.preinstalled_dependencies).map(([name,version])=>[name,{available:true,version}]))};
 const value=await inspectCodexE2EChecks({rootDir:root,manifest,probe:true,evidenceDirectory:directory,cliEnvironment,
  runCommand:async(command,args,options)=>{
   assert.equal(command,'docker');
   if(args[0]==='image')return process(0,JSON.stringify([{Id:image.image_id}]));
   return docker(report,calls)(command,args,options);
  }});
 assert.equal(verified,1);assert.equal(value.auth.version,'0.162.0-alpha.17.2');
 assert.equal(value.auth.source,'frozen_app_cli_environment');assert.equal(value.auth.inference_calls,0);
 assert.equal(value.environment.container_removed,true);assert.equal(value.live_ready,true);
});
test('readiness is real Docker callback, scoped mounts, durable revision binding and cleanup', async t => {
  const directory = setup(t), calls = [], events = [];
  const report = {status: 'passed', executed: true, exit_code: 0, assertions: 3, skipped: 0, error: null, outcome_uncertain: false};
  const {checkTask} = createCodexE2EChecks({rootDir: root, manifest, registry: [],
    context: {directory, remaining: () => Infinity, record: async event => events.push(event)}, runCommand: docker(report, calls)});
  const check = {id: 'readiness.1', version: '1', phase: 'contract', argv: ['python3', '-c', 'pass'], environment_ref: 'env'};
  const result = await checkTask(check, {candidateDirectory: directory, pinnedDirectory: directory, attempt_id: 'a1', artifact_revisions: {a: 'r1'}, round_index: 0});
  assert.equal(result.status, 'passed');
  assert.equal(result.evidence.container_removed, true);
  assert.equal(calls[0].options.timeoutMs, 2147483647);
  assert.ok(calls[0].args.includes('--read-only'));
  assert.ok(calls[0].args.includes('none'));
  assert.ok(calls[0].args.includes(`type=bind,src=${directory},dst=/candidate,readonly`));
  assert.equal(calls.at(-1).args[0], 'rm');
  assert.equal(events.at(-1).removed, true);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, result.evidence.report_ref))).artifact_revisions, {a: 'r1'});
});
test('zero assertion pass and incomplete public evidence are refused after preserving process receipt', async t => {
  for (const phase of ['contract', 'integration']) {
    const directory = setup(t), calls = [];
    const report = {status: 'passed', executed: true, exit_code: 0, assertions: 0, skipped: 0, error: null, outcome_uncertain: false};
    const {checkTask} = createCodexE2EChecks({rootDir: root, manifest, registry: [],
      context: {directory, record: async () => {}}, runCommand: docker(report, calls)});
    await assert.rejects(checkTask({id: 'bad', version: '1', phase, argv: ['python3'], environment_ref: 'env'},
      {candidateDirectory: directory, pinnedDirectory: directory}), /EVIDENCE_INVALID/);
    assert.equal(calls.at(-1).args[0], 'rm');
  }
});
function gradingFixture(t) {
  const directory = setup(t), runDirectory = join(directory, 'run'), candidateDirectory = join(directory, 'candidate');
  mkdirSync(runDirectory); mkdirSync(candidateDirectory); writeFileSync(join(candidateDirectory, 'main.py'), 'pass\n');
  const gradeManifest = 'manifest.json', imageLock = 'image.json';
  writeFileSync(join(directory, gradeManifest), JSON.stringify({task_id: 'openapi_python_client', test_case_count: 63, verifier_timeout_sec: 1200}));
  writeFileSync(join(directory, imageLock), JSON.stringify(image));
  for (const file of ['src/benchmark/codex-e2e-checks.mjs', 'benchmarks/e2e-swe/adapter.py']) {
    mkdirSync(resolve(directory, file, '..'), {recursive: true}); writeFileSync(join(directory, file), 'source');
  }
  const runCommand = async (_command, args) => {
    const output = args[args.indexOf('--output') + 1]; mkdirSync(output);
    writeFileSync(join(output, 'result.json'), JSON.stringify({grading_status: 'completed', resolved: true,
      container_removed: true, model_calls: 0, network: 'none', fresh_verifier: true, workspace: candidateDirectory,
      image, summary: {tests: 63, passed: 63, failed: 0}}));
    return process();
  };
  return {rootDir: directory, runDirectory, candidateDirectory, publicPassed: true, developmentWallMs: 900,
    gradeManifest, imageLock, runCommand};
}
test('independent grade binds candidate and source hashes, includes grade wall, never overwrites', async t => {
  const options = gradingFixture(t), result = await gradeCodexE2ECandidate(options);
  assert.equal(result.product_success, true);
  assert.equal(result.grade_sources_unchanged, true);
  assert.equal(result.completion_wall_ms, 900 + result.grade_wall_ms);
  assert.equal(result.candidate_sha256, snapshotCodexCandidate(options.candidateDirectory).sha256);
  await assert.rejects(gradeCodexE2ECandidate(options), /CODEX_ALREADY_GRADED/);
});
test('independent success cannot hide candidate mutation, source mutation or public failure', async t => {
  for (const kind of ['candidate', 'source', 'public']) {
    const options = gradingFixture(t), invoke = options.runCommand;
    if (kind === 'public') options.publicPassed = false;
    options.runCommand = async (...args) => {
      const result = await invoke(...args);
      if (kind === 'candidate') writeFileSync(join(options.candidateDirectory, 'main.py'), 'changed');
      if (kind === 'source') writeFileSync(join(options.rootDir, 'benchmarks/e2e-swe/adapter.py'), 'changed');
      return result;
    };
    const result = await gradeCodexE2ECandidate(options);
    assert.equal(result.product_success, false);
    assert.equal(result.completion_wall_ms, null);
  }
});
test('missing grader output and symlink candidates cannot certify completion', async t => {
  const options = gradingFixture(t);
  options.runCommand = async () => process(2);
  const result = await gradeCodexE2ECandidate(options);
  assert.equal(result.product_success, false);
  assert.equal(result.grade_status, 'missing');
  assert.equal(result.outcome_uncertain, true);
  symlinkSync('main.py', join(options.candidateDirectory, 'link.py'));
  assert.throws(() => snapshotCodexCandidate(options.candidateDirectory), /UNSAFE_CANDIDATE/);
});
