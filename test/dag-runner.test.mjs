import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync, readdirSync, chmodSync, lstatSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {loadDagRunManifest, buildAtomicDagPlan, prepareDagAllocation, runDagBenchmark, runDagDockerCheck, validateDagPublicReport} from '../src/benchmark/dag-runner.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {createTokenBudget} from '../src/benchmark/budget.mjs';

const root = resolve(import.meta.dirname, '..');
const manifest = loadDagRunManifest();
function isolatedBudget(parent, base = manifest) {
  const local = {...base, jev_budget: {...base.jev_budget, ledger_path: join(parent, 'mock-budget.json')}};
  createTokenBudget(local.jev_budget).close();
  return local;
}
function cleanup(path) {
  if (!existsSync(path)) return;
  chmodSync(path, 0o700);
  if (lstatSync(path).isDirectory()) for (const name of readdirSync(path)) cleanup(join(path, name));
  rmSync(path, {recursive: true, force: true});
}
function allocationFixture() {
  const input = {goal: 'Controller fixture', source: {path: 'public/spec.md', sha256: 'fixture-goal', text: 'Three source files.'},
    artifact_interfaces: [
      {path: 'a.py', purpose: 'A producer', dependency_paths: []},
      {path: 'b.py', purpose: 'B producer', dependency_paths: []},
      {path: 'c.py', purpose: 'Consumer', dependency_paths: ['a.py', 'b.py']},
    ], obligations: ['a', 'b', 'c'].map(id => ({id: `requirement-${id}`, write_scope: [`${id}.py`]}))};
  const registry = [{id: 'public.fixture', version: '1', requirement_ids: input.obligations.map(item => item.id),
    runner_ref: 'public/check.py', argv: ['python3', 'public/check.py', '--suite', 'fixture'], source_ref: 'public/spec.md'}];
  return {input, registry};
}

test('actual bounded owner choices change executed worker ownership without changing atomic artifact edges', async () => {
  const fixture = allocationFixture(), requests = [];
  const prepare = async reverse => prepareDagAllocation({...fixture, manifest, decide: async request => {
    requests.push(request);
    const [id, question] = Object.entries(request.questions)[0];
    const keys = Object.keys(question.criteria);
    const choice = id === 'dag.worker_count.d065' ? '2' : (reverse ? keys.at(-1) : keys[0]);
    return {answers: {[id]: {type: 'choice', choice}}};
  }});
  const left = await prepare(false), right = await prepare(true);
  assert.equal(left.plan.tasks.length, 4);
  assert.equal(left.plan.workers.length, 2);
  assert.notEqual(left.plan.tasks[0].worker_id, right.plan.tasks[0].worker_id);
  assert.deepEqual(left.plan.tasks[2].input_artifact_ids, ['artifact-1', 'artifact-2']);
  assert.deepEqual(left.plan.tasks.flatMap(task => task.kind === 'implementation' ? task.requirement_ids : []).sort(), fixture.input.obligations.map(item => item.id).sort());
  assert.equal(left.semantic_action.type, 'partition_committed');
  assert.ok(requests.some(request => Object.hasOwn(request.questions, 'dag.owner.v1')));
  for (const request of requests) assert.deepEqual(request.state.execution_model, {
    atomic_task_count: 3, cli_sessions_for_complete_execution: 3, session_scope: 'fresh_per_atomic_task',
    conversation_reuse: false, worker_count_effect: 'mutual_exclusion_and_resource_assignment_only',
    worker_profile: manifest.worker_profile, execution_slots: 2,
  });
});

test('invalid root count is rejected before owner allocation or plan commitment', async () => {
  let calls = 0, commits = 0;
  await assert.rejects(prepareDagAllocation({...allocationFixture(), manifest, commit: async () => commits++, decide: async () => {
    calls++; return {answers: {'dag.worker_count.d065': {type: 'choice', choice: '1'}}};
  }}), {code: 'DAG_WORKER_COUNT_INVALID'});
  assert.equal(calls, 1); assert.equal(commits, 0);
});

test('a failed or unknown root-count envelope cannot reuse an otherwise valid choice', async () => {
  for (const status of ['failed', 'unknown']) {
    let calls = 0, commits = 0;
    await assert.rejects(prepareDagAllocation({...allocationFixture(), manifest, commit: async () => commits++, decide: async () => {
      calls++; return {status, answers: {'dag.worker_count.d065': {type: 'choice', choice: '2'}}};
    }}), {code: 'DAG_WORKER_COUNT_INVALID', outcome_uncertain: status === 'unknown'});
    assert.equal(calls, 1); assert.equal(commits, 0);
  }
});

test('file readiness allows empty Python initializers and rejects invalid Python syntax', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'd065-file-readiness-'));
  try {
    const {plan} = buildAtomicDagPlan({...allocationFixture(), manifest,
      workers: [{id: 'worker-1', profile_id: manifest.worker_profile.id}, {id: 'worker-2', profile_id: manifest.worker_profile.id}],
      ownerByArtifact: {'artifact-1': 'worker-1', 'artifact-2': 'worker-2', 'artifact-3': 'worker-1'}});
    const [command, ...args] = plan.checks[0].argv;
    writeFileSync(join(directory, 'a.py'), '');
    const valid = await processResult(command, args, {cwd: directory});
    assert.equal(valid.exit_code, 0, valid.stderr); assert.ok(JSON.parse(valid.stdout).assertions > 0);
    writeFileSync(join(directory, 'a.py'), 'def broken(:');
    const invalid = await processResult(command, args, {cwd: directory});
    assert.notEqual(invalid.exit_code, 0);
  } finally { rmSync(directory, {recursive: true, force: true}); }
});

test('explicit mock runner uses actual file revisions/checks and never charges the ledger or claims a product grade', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d065-runner-test-'));
  try {
    const local = isolatedBudget(parent);
    const result = await runDagBenchmark({rootDir: root, manifest: local, mode: 'mock', runDir: join(parent, 'normal')});
    assert.equal(result.status, 'completed');
    assert.equal(result.usage.jev.calls, 0); assert.equal(result.usage.claude.calls, 0);
    assert.equal(result.product_success, null); assert.equal(result.completion_wall_ms, null);
    assert.equal(result.independent_grade, 'not_run_root_owned');
    assert.deepEqual(result.budget_after, result.budget_before);
    assert.equal(Object.keys(result.artifact_revisions).length, 2);
    assert.equal(JSON.parse(readFileSync(join(result.candidate_path, 'examples/dag/output/core.json'))).value, 7);
    assert.equal(result.runtime.journal.replay_allowed, false);
    await assert.rejects(runDagBenchmark({rootDir: root, manifest: local, mode: 'mock', runDir: join(parent, 'normal')}), {code: 'DAG_FRESH_RUN_DIRECTORY_REQUIRED'});
  } finally { cleanup(parent); }
});

test('a defective mock artifact cannot publish or open its downstream integration check', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d065-runner-test-'));
  try {
    const defective = isolatedBudget(parent, structuredClone(manifest));
    defective.mock_files['examples/dag/output/core.json'] = '{"value":8}\n';
    const result = await runDagBenchmark({rootDir: root, manifest: defective, mode: 'mock', runDir: join(parent, 'defective')});
    assert.equal(result.status, 'failed');
    assert.equal(result.product_success, null);
    assert.equal(Object.hasOwn(result.artifact_revisions, 'artifact-core'), false);
    const workflow = JSON.parse(readFileSync(join(parent, 'defective/workflow.json')));
    assert.ok(workflow.execution.undispatched_ids.includes('verify-integration'));
  } finally { cleanup(parent); }
});

test('live preflight failure never reaches a provider and explicit spending is required', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d065-runner-test-'));
  try {
    const output = join(parent, 'missing-authorization');
    await assert.rejects(runDagBenchmark({rootDir: root, manifest, mode: 'live', runDir: output}), {code: 'EXPLICIT_SPEND_REQUIRED'});
    assert.equal(existsSync(output), false);
    const result = await runDagBenchmark({rootDir: root, manifest, mode: 'live', spend: true, runDir: join(parent, 'blocked'),
      adapters: {preflight: async () => ({status: 'blocked', live_ready: false}),
        runCommand: async () => { throw new Error('provider must not be reached'); }}});
    assert.equal(result.stop_code, 'DAG_LIVE_PREFLIGHT_BLOCKED');
    assert.equal(result.usage.jev.calls, 0); assert.equal(result.usage.claude.calls, 0);
  } finally { cleanup(parent); }
});

test('Docker checks pin identity, mount candidate/checkers readonly, and preserve uncertain cleanup or inner reports', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'd065-docker-controller-'));
  const id = 'a'.repeat(64), calls = [];
  try {
    await assert.rejects(runDagDockerCheck({image: {image_id: `sha256:${'b'.repeat(64)}`},
      check: {id: 'public.fixture', environment_ref: 'fixture-env', argv: ['python3', '-c', 'pass']},
      candidateDirectory: '/candidate-source', pinnedDirectory: '/pinned-source', bindingDirectory: directory,
      remaining: () => 43210, record: async () => {}, attemptId: 'fixture-attempt',
      runCommand: async (command, args, options) => {
        calls.push({command, args, options});
        if (args[0] === 'create') return {exit_code: 0, stdout: id, outcome_uncertain: false};
        if (args[0] === 'start') throw Object.assign(new Error('known controller error'), {code: 'KNOWN_CHECK_FAILURE', outcome_uncertain: false});
        return {exit_code: 1, stdout: '', outcome_uncertain: false};
      }}), {code: 'DAG_CONTAINER_CLEANUP_UNCONFIRMED', outcome_uncertain: true});
    assert.ok(calls[0].args.includes('--read-only'));
    assert.equal(calls[0].args[calls[0].args.indexOf('--network') + 1], 'none');
    assert.ok(calls[0].args.includes('type=bind,src=/candidate-source,dst=/candidate,readonly'));
    assert.ok(calls[0].args.includes('type=bind,src=/pinned-source,dst=/checker,readonly'));
    assert.deepEqual(calls.at(-1).args, ['rm', '--force', id]);
    assert.equal(calls[1].options.timeoutMs, 43210);
    const reportBinding = join(directory, 'reported-uncertainty'); mkdirSync(reportBinding);
    let rawSaved = false, cleanupConfirmed = false;
    await assert.rejects(runDagDockerCheck({image: {image_id: `sha256:${'b'.repeat(64)}`},
      check: {id: 'public.fixture', environment_ref: 'fixture-env', argv: ['python3', '-c', 'pass']},
      candidateDirectory: '/candidate-source', pinnedDirectory: '/pinned-source', bindingDirectory: reportBinding,
      remaining: () => 43210, record: async () => {}, attemptId: 'inner-timeout-attempt',
      saveProcess: async raw => { rawSaved = JSON.parse(raw.stdout).outcome_uncertain === true; },
      runCommand: async (command, args) => {
        if (args[0] === 'create') return {exit_code: 0, stdout: id, outcome_uncertain: false};
        if (args[0] === 'start') return {exit_code: 1, stdout: JSON.stringify({status: 'failed', outcome_uncertain: true}), outcome_uncertain: false};
        cleanupConfirmed = true;
        return {exit_code: 0, stdout: id, outcome_uncertain: false};
      }}), {code: 'DAG_CHECK_REPORT_UNCERTAIN', outcome_uncertain: true});
    assert.equal(rawSaved, true); assert.equal(cleanupConfirmed, true);
    // D065 live schema failure: import may fail before the first assertion.
    const check = {id: 'public.fixture', version: '2', environment_ref: 'fixture-env'};
    const registeredCheck = {...check, test_ids: ['passed-case', 'import-failure']};
    const report = {schema_version: 'dag-public-check-evidence/v1', scope: 'complete_suite', check_id: check.id,
      check_version: check.version, environment_ref: check.environment_ref, product_certified: false,
      artifact_revisions: null, error: null, status: 'failed', exit_code: 1, executed: true, outcome_uncertain: false,
      skipped: 0, unexecuted_test_ids: [], test_ids: registeredCheck.test_ids, assertions: 1, cases: [
        {test_id: 'passed-case', status: 'passed', assertions: 1},
        {test_id: 'import-failure', status: 'failed', assertions: 0, error_type: 'SyntaxError'},
      ]};
    const raw = {exit_code: 1, outcome_uncertain: false};
    assert.equal(validateDagPublicReport({check, registeredCheck, raw, report}).status, 'failed');
    const falsePass = structuredClone(report);
    falsePass.status = 'passed'; falsePass.exit_code = 0; falsePass.cases[1].status = 'passed';
    assert.throws(() => validateDagPublicReport({check, registeredCheck, raw: {...raw, exit_code: 0}, report: falsePass}),
      {code: 'DAG_PUBLIC_EVIDENCE_INVALID'});
    // Observed HTTP suite import failure: no case began, and every requested ID is explicit.
    const initializationFailed = {...report, error: {code: 'SyntaxError', message: 'generated module import failed'},
      assertions: 0, cases: [], skipped: registeredCheck.test_ids.length, unexecuted_test_ids: [...registeredCheck.test_ids]};
    assert.equal(validateDagPublicReport({check, registeredCheck, raw, report: initializationFailed}), initializationFailed);
    const incompletePass = {...initializationFailed, error: null, status: 'passed', exit_code: 0, skipped: 0,
      assertions: 1, cases: [report.cases[0]], unexecuted_test_ids: ['import-failure']};
    assert.throws(() => validateDagPublicReport({check, registeredCheck, raw: {...raw, exit_code: 0}, report: incompletePass}),
      {code: 'DAG_PUBLIC_EVIDENCE_INVALID'});
  } finally { rmSync(directory, {recursive: true, force: true}); }
});
