import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {executeArtifactTask} from '../src/orchestration/artifact-verification-gate.mjs';

const exec = promisify(execFile);
const fixture = JSON.parse(await readFile(new URL('../examples/dag/contract-fixture.json', import.meta.url), 'utf8'));
const passing = (check, {artifact_revisions}) => ({
  status: 'passed', executed: true, exit_code: 0, assertions: 1, skipped: 0, outcome_uncertain: false,
  check_id: check.id, check_version: check.version, environment_ref: check.environment_ref,
  artifact_revisions: structuredClone(artifact_revisions),
});

function setup(taskId = 'verify-integration', source = fixture) {
  const plan = structuredClone(source);
  const task = plan.tasks.find(task => task.id === taskId);
  const revisions = {'artifact-core': 'core-v1', 'artifact-ui': 'ui-v1'};
  const events = [], reads = [], executed = [], checked = [];
  return {
    plan, task, revisions, events, reads, executed, checked,
    args: {
      plan, task, attempt_id: `attempt-${taskId}-1`,
      execute: async (task, context) => { executed.push({task, context}); return {status: 'completed'}; },
      getRevision: async (artifact_id, context) => { reads.push({artifact_id, ...context}); return revisions[artifact_id]; },
      runCheck: async (check, context) => { checked.push({check, context}); return passing(check, context); },
      record: async event => { events.push(event); },
    },
  };
}

function dependentPlan() {
  const plan = structuredClone(fixture);
  const task = plan.tasks.find(task => task.id === 'build-ui');
  task.input_artifact_ids = ['artifact-core'];
  task.read_scope = ['examples/dag/output/core.json'];
  return plan;
}

function twoCheckPlan() {
  const plan = structuredClone(fixture);
  const first = plan.checks.find(check => check.id === 'check-integration');
  first.artifact_ids = ['artifact-core'];
  first.requirement_ids = ['requirement-core'];
  const second = {...structuredClone(first), id: 'check-integration-ui', artifact_ids: ['artifact-ui'], requirement_ids: ['requirement-ui']};
  plan.checks.push(second);
  plan.tasks.find(task => task.id === 'verify-integration').check_ids.push(second.id);
  return plan;
}

test('shared fixture runs real local checks then an integration verification task without implementation execute', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'artifact-gate-'));
  const output = join(directory, 'examples/dag/output');
  await mkdir(output, {recursive: true});
  const files = {'artifact-core': join(output, 'core.json'), 'artifact-ui': join(output, 'ui.json')};
  const executed = [], checked = [];
  try {
    const results = [];
    for (const task of fixture.tasks) {
      results.push(await executeArtifactTask({
        plan: fixture, task, attempt_id: `attempt-real-${task.id}`,
        execute: async current => {
          executed.push(current.id);
          const value = current.id === 'build-core' ? {value: 7} : {label: 'value:7'};
          await writeFile(files[current.output_artifact_ids[0]], JSON.stringify(value));
          return {status: 'completed', verification: {status: 'passed'}};
        },
        getRevision: async id => createHash('sha256').update(await readFile(files[id])).digest('hex'),
        runCheck: async (check, context) => {
          assert.equal(check.runner_ref, 'node-assert-json-v1');
          assert.equal(check.argv[0], 'node');
          await exec(process.execPath, check.argv.slice(1), {cwd: join(directory, check.cwd)});
          checked.push(check.id);
          // Each frozen fixture command contains one real node:assert assertion.
          return passing(check, context);
        },
      }));
    }
    assert.deepEqual(executed, ['build-core', 'build-ui']);
    assert.deepEqual(checked, ['check-core', 'check-ui', 'check-integration']);
    assert.deepEqual(Object.keys(results[0].verification.artifact_revisions), ['artifact-core']);
    assert.deepEqual(Object.keys(results[1].verification.artifact_revisions), ['artifact-ui']);
    assert.deepEqual(Object.keys(results[2].verification.artifact_revisions), ['artifact-core', 'artifact-ui']);
    assert.ok(results.every(result => result.status === 'completed'));
    assert.equal(results[2].verification.evidence[0].assertions, 1);
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('a real defective artifact cannot pass by supplying worker claimed verification', async () => {
  const state = setup('build-core');
  const directory = await mkdtemp(join(tmpdir(), 'artifact-gate-defect-'));
  const output = join(directory, 'examples/dag/output');
  await mkdir(output, {recursive: true});
  try {
    await assert.rejects(executeArtifactTask({...state.args,
      execute: async () => {
        await writeFile(join(output, 'core.json'), JSON.stringify({value: 6}));
        return {status: 'completed', verification: {status: 'passed', assertions: 100}};
      },
      getRevision: async () => createHash('sha256').update(await readFile(join(output, 'core.json'))).digest('hex'),
      runCheck: async (check, context) => {
        let exit_code = 0;
        try { await exec(process.execPath, check.argv.slice(1), {cwd: join(directory, check.cwd)}); }
        catch (error) { exit_code = error.code; }
        assert.equal(exit_code, 1);
        return {...passing(check, context), status: 'failed', exit_code};
      },
    }), {code: 'ARTIFACT_CHECK_NOT_PASSED'});
    assert.equal(state.events.at(-1).status, 'failed');
  } finally {
    await rm(directory, {recursive: true, force: true});
  }
});

test('implementation consumes pinned inputs and snapshots outputs only after successful execution', async () => {
  const state = setup('build-ui', dependentPlan());
  const log = [];
  delete state.revisions['artifact-ui'];
  const result = await executeArtifactTask({...state.args,
    getRevision: async (id, context) => { log.push(`${context.stage}:${id}`); return state.revisions[id]; },
    execute: async (task, context) => {
      log.push('execute');
      assert.deepEqual(context.input_artifact_revisions, {'artifact-core': 'core-v1'});
      state.revisions['artifact-ui'] = 'new-ui-v1';
      return {status: 'completed'};
    },
  });
  assert.deepEqual(log.slice(0, 3), ['input_snapshot:artifact-core', 'execute', 'output_snapshot:artifact-ui']);
  assert.deepEqual(result.verification.artifact_revisions, {'artifact-core': 'core-v1', 'artifact-ui': 'new-ui-v1'});
  assert.deepEqual(state.checked[0].context.artifact_revisions, result.verification.artifact_revisions);
});

test('verification can omit the implementation callback', async () => {
  const state = setup();
  const result = await executeArtifactTask({...state.args, execute: undefined});
  assert.equal(result.status, 'completed');
  assert.equal(state.executed.length, 0);
});

test('input drift during implementation prevents any check from running', async () => {
  const state = setup('build-ui', dependentPlan());
  await assert.rejects(executeArtifactTask({...state.args, execute: async () => {
    state.revisions['artifact-core'] = 'core-v2';
    return {status: 'completed'};
  }}), {code: 'ARTIFACT_REVISION_CHANGED', stage: 'before_checks'});
  assert.equal(state.checked.length, 0);
});

test('an input newer than the predecessor-approved revision is rejected before consumer execute', async () => {
  const state = setup('build-ui', dependentPlan());
  state.revisions['artifact-core'] = 'core-v2-unverified';
  await assert.rejects(executeArtifactTask({...state.args,
    expected_input_artifact_revisions: {'artifact-core': 'core-v1'},
  }), {code: 'ARTIFACT_INPUT_REVISION_MISMATCH'});
  assert.equal(state.executed.length, 0);
  assert.equal(state.checked.length, 0);
  assert.ok(state.reads.every(read => read.stage === 'input_snapshot'));
});

test('exact predecessor-approved input revisions allow execution and cannot be changed through caller state', async () => {
  const state = setup('build-ui', dependentPlan());
  const expected = {'artifact-core': 'core-v1'};
  const result = await executeArtifactTask({...state.args,
    expected_input_artifact_revisions: expected,
    getRevision: async id => {
      expected['artifact-core'] = 'forged-after-start';
      return state.revisions[id];
    },
  });
  assert.equal(result.status, 'completed');
  assert.equal(state.executed.length, 1);
  assert.equal(result.verification.artifact_revisions['artifact-core'], 'core-v1');
});

for (const expected of [null, {}, {'artifact-ui': 'ui-v1'}, {'artifact-core': 'core-v1', extra: 'v1'}, {'artifact-core': ''}, []]) {
  test(`invalid predecessor vector ${JSON.stringify(expected)} rejects before callbacks`, async () => {
    const state = setup('build-ui', dependentPlan());
    await assert.rejects(executeArtifactTask({...state.args, expected_input_artifact_revisions: expected}),
      {code: 'INVALID_EXPECTED_INPUT_REVISIONS'});
    assert.equal(state.reads.length, 0);
    assert.equal(state.executed.length, 0);
  });
}

test('an implementation with no inputs accepts an explicitly empty predecessor vector', async () => {
  const state = setup('build-core');
  const result = await executeArtifactTask({...state.args, expected_input_artifact_revisions: {}});
  assert.equal(result.status, 'completed');
});

test('every task artifact is rechecked after each check, including future check dependencies', async () => {
  const state = setup('verify-integration', twoCheckPlan());
  let checks = 0;
  await assert.rejects(executeArtifactTask({...state.args, runCheck: async (check, context) => {
    checks++;
    assert.deepEqual(check.artifact_ids, ['artifact-core']);
    state.revisions['artifact-ui'] = 'ui-v2';
    return passing(check, context);
  }}), {code: 'ARTIFACT_REVISION_CHANGED', stage: 'after_check', artifact_ids: ['artifact-ui']});
  assert.equal(checks, 1);
  assert.deepEqual(state.reads.filter(read => read.stage === 'after_check').map(read => read.artifact_id), ['artifact-core', 'artifact-ui']);
  assert.equal(state.events.at(-1).status, 'failed');
});

test('a later check cannot modify an artifact verified by an earlier check', async () => {
  const state = setup('verify-integration', twoCheckPlan());
  let checks = 0;
  await assert.rejects(executeArtifactTask({...state.args, runCheck: async (check, context) => {
    checks++;
    if (checks === 2) state.revisions['artifact-core'] = 'core-v2';
    return passing(check, context);
  }}), {code: 'ARTIFACT_REVISION_CHANGED', artifact_ids: ['artifact-core']});
  assert.equal(checks, 2);
});

test('mutation after the last completed-check record is caught before publication', async () => {
  const state = setup();
  await assert.rejects(executeArtifactTask({...state.args, record: async event => {
    state.events.push(event);
    if (event.event === 'dag_check_completed') state.revisions['artifact-ui'] = 'ui-v2';
  }}), {code: 'ARTIFACT_REVISION_CHANGED', stage: 'before_publication'});
  assert.equal(state.events.at(-1).status, 'passed');
});

test('check lifecycle payloads retain exact identity, environment and artifact revision vector', async () => {
  const state = setup();
  await executeArtifactTask(state.args);
  assert.equal(state.events.length, 2);
  const [started, completed] = state.events;
  assert.equal(started.event, 'dag_check_started');
  assert.equal(completed.event, 'dag_check_completed');
  assert.equal(started.task_id, 'verify-integration');
  assert.equal(started.attempt_id, 'attempt-verify-integration-1');
  assert.equal(started.check_id, 'check-integration');
  assert.equal(started.check_version, '1');
  assert.equal(started.phase, 'integration');
  assert.equal(started.environment_ref, 'node22-fixture-v1');
  assert.deepEqual(completed, {...started, event: 'dag_check_completed', status: 'passed', outcome_uncertain: false, assertions: 1, skipped: 0});
  assert.deepEqual(state.reads.filter(read => read.stage === 'before_publication').map(read => read.artifact_id), ['artifact-core', 'artifact-ui']);
});

test('negative callback counts reject evidence and remain null in projectable check events', async () => {
  const state = setup();
  await assert.rejects(executeArtifactTask({...state.args, runCheck: async (check, context) => ({
    ...passing(check, context), assertions: -1, skipped: -1,
  })}), {code: 'ARTIFACT_CHECK_NOT_PASSED'});
  assert.equal(state.events.at(-1).assertions, null);
  assert.equal(state.events.at(-1).skipped, null);
  assert.equal(state.events.at(-1).status, 'failed');
});

for (const [name, mutate, code] of [
  ['missing evidence', () => undefined, 'INVALID_ARTIFACT_CHECK_EVIDENCE'],
  ['array evidence', () => [], 'INVALID_ARTIFACT_CHECK_EVIDENCE'],
  ['wrong check identity', value => ({...value, check_id: 'other-check'}), 'ARTIFACT_CHECK_ID_MISMATCH'],
  ['old check version', value => ({...value, check_version: 'old'}), 'ARTIFACT_CHECK_VERSION_MISMATCH'],
  ['wrong environment', value => ({...value, environment_ref: 'other-environment'}), 'ARTIFACT_CHECK_ENVIRONMENT_MISMATCH'],
  ['skipped check', value => ({...value, skipped: 1}), 'ARTIFACT_CHECK_NOT_PASSED'],
  ['missing skip count', value => { delete value.skipped; return value; }, 'ARTIFACT_CHECK_NOT_PASSED'],
  ['zero assertions', value => ({...value, assertions: 0}), 'ARTIFACT_CHECK_NOT_PASSED'],
  ['fractional assertions', value => ({...value, assertions: 0.5}), 'ARTIFACT_CHECK_NOT_PASSED'],
  ['missing assertion count', value => { delete value.assertions; return value; }, 'ARTIFACT_CHECK_NOT_PASSED'],
  ['not executed', value => ({...value, executed: false}), 'ARTIFACT_CHECK_NOT_PASSED'],
  ['nonzero exit', value => ({...value, exit_code: 2}), 'ARTIFACT_CHECK_NOT_PASSED'],
  ['missing exit', value => { delete value.exit_code; return value; }, 'ARTIFACT_CHECK_NOT_PASSED'],
  ['failed status', value => ({...value, status: 'failed'}), 'ARTIFACT_CHECK_NOT_PASSED'],
  ['unknown uncertainty', value => { delete value.outcome_uncertain; return value; }, 'ARTIFACT_CHECK_NOT_PASSED'],
  ['uncertain outcome', value => ({...value, outcome_uncertain: true}), 'ARTIFACT_CHECK_UNCERTAIN'],
  ['conflicting uncertainty alias', value => ({...value, outcomeUncertain: true}), 'ARTIFACT_CHECK_UNCERTAIN'],
  ['uncertain status', value => ({...value, status: 'uncertain'}), 'ARTIFACT_CHECK_UNCERTAIN'],
  ['missing vector', value => { delete value.artifact_revisions; return value; }, 'ARTIFACT_CHECK_VECTOR_MISMATCH'],
  ['array vector', value => ({...value, artifact_revisions: []}), 'ARTIFACT_CHECK_VECTOR_MISMATCH'],
  ['missing artifact', value => { delete value.artifact_revisions['artifact-ui']; return value; }, 'ARTIFACT_CHECK_VECTOR_MISMATCH'],
  ['extra artifact', value => { value.artifact_revisions['artifact-other'] = 'other-v1'; return value; }, 'ARTIFACT_CHECK_VECTOR_MISMATCH'],
  ['one stale artifact', value => { value.artifact_revisions['artifact-ui'] = 'ui-old'; return value; }, 'ARTIFACT_CHECK_VECTOR_MISMATCH'],
  ['symbol vector entry', value => { value.artifact_revisions[Symbol('extra')] = 'extra'; return value; }, 'ARTIFACT_CHECK_VECTOR_MISMATCH'],
]) test(`${name} fails closed and still rechecks all artifacts`, async () => {
  const state = setup();
  let calls = 0;
  await assert.rejects(executeArtifactTask({...state.args, runCheck: async (check, context) => {
    calls++; return mutate(passing(check, context));
  }}), {code});
  assert.equal(calls, 1);
  assert.deepEqual(state.reads.filter(read => read.stage === 'after_check').map(read => read.artifact_id), ['artifact-core', 'artifact-ui']);
  assert.equal(state.events.at(-1).status, code === 'ARTIFACT_CHECK_UNCERTAIN' ? 'uncertain' : 'failed');
});

for (const result of [undefined, null, {}, {status: 'failed'}, {status: 'success'}, {status: 'blocked'}]) {
  test(`implementation result ${JSON.stringify(result)} does not reach output hashing or checks`, async () => {
    const state = setup('build-core');
    await assert.rejects(executeArtifactTask({...state.args, execute: async () => result}), {code: 'ARTIFACT_EXECUTION_NOT_COMPLETED'});
    assert.equal(state.reads.length, 0);
    assert.equal(state.checked.length, 0);
  });
}

for (const field of ['uncertain', 'outcomeUncertain', 'outcome_uncertain']) test(`implementation ${field} overrides completed`, async () => {
  const state = setup('build-core');
  await assert.rejects(executeArtifactTask({...state.args, execute: async () => ({status: 'completed', [field]: true})}),
    {code: 'ARTIFACT_EXECUTION_UNCERTAIN', outcome_uncertain: true});
  assert.equal(state.checked.length, 0);
});

for (const stage of ['execute', 'runCheck', 'getRevision']) test(`${stage} uncertainty throws once and is not retried`, async () => {
  const state = setup('build-ui', dependentPlan());
  let calls = 0;
  const failure = Object.assign(new Error('unknown result'), {code: 'UNKNOWN_EXTERNAL_RESULT', outcomeUncertain: true});
  await assert.rejects(executeArtifactTask({...state.args, [stage]: async () => { calls++; throw failure; }}), error => error === failure);
  assert.equal(calls, 1);
  if (stage === 'runCheck') {
    assert.equal(state.events.at(-1).status, 'uncertain');
    assert.equal(state.events.at(-1).outcome_uncertain, true);
  }
});

for (const thrown of [null, undefined, false, 0, '']) test(`falsy thrown runner result ${String(thrown)} cannot become success`, async () => {
  const state = setup();
  await assert.rejects(executeArtifactTask({...state.args, runCheck: async () => { throw thrown; }}), {code: 'ARTIFACT_CHECK_CALLBACK_FAILED'});
  assert.equal(state.events.at(-1).status, 'failed');
});

test('a falsy revision-read failure after a passing check still rejects publication', async () => {
  const state = setup();
  await assert.rejects(executeArtifactTask({...state.args, getRevision: async (id, context) => {
    if (context.stage === 'after_check') throw null;
    return state.revisions[id];
  }}), {code: 'ARTIFACT_REVISION_CALLBACK_FAILED'});
  assert.equal(state.events.at(-1).status, 'failed');
});

for (const revision of [null, undefined, '', ' ', 1, {revision: 'v1'}]) test(`invalid revision ${JSON.stringify(revision)} blocks before execution`, async () => {
  const state = setup('build-ui', dependentPlan());
  await assert.rejects(executeArtifactTask({...state.args, getRevision: async () => revision}), {code: 'INVALID_ARTIFACT_REVISION'});
  assert.equal(state.executed.length, 0);
  assert.equal(state.checked.length, 0);
});

test('plan, task, callback arguments and returned evidence have no shared mutable state', async () => {
  const state = setup('build-ui', dependentPlan());
  const original = structuredClone(state.plan);
  let evidence;
  const result = await executeArtifactTask({...state.args,
    execute: async (task, context) => {
      task.check_ids.length = 0;
      context.plan.tasks.length = 0;
      context.input_artifact_revisions['artifact-core'] = 'forged';
      return {status: 'completed'};
    },
    runCheck: async (check, context) => {
      evidence = passing(check, context);
      check.id = 'forged';
      context.task.id = 'forged';
      context.artifact_revisions['artifact-ui'] = 'forged';
      return evidence;
    },
    record: async event => { event.artifact_revisions['artifact-core'] = 'forged'; },
  });
  evidence.artifact_revisions['artifact-core'] = 'future-change';
  evidence.assertions = 0;
  assert.deepEqual(state.plan, original);
  assert.equal(state.task.id, 'build-ui');
  assert.deepEqual(result.verification.artifact_revisions, {'artifact-core': 'core-v1', 'artifact-ui': 'ui-v1'});
  assert.equal(result.verification.evidence[0].artifact_revisions['artifact-core'], 'core-v1');
  assert.equal(result.verification.evidence[0].assertions, 1);
});

test('forged task cannot replace the checks or artifact sets from its plan', async () => {
  const state = setup();
  const task = {...state.task, input_artifact_ids: ['artifact-core']};
  await assert.rejects(executeArtifactTask({...state.args, task}), {code: 'INVALID_ARTIFACT_TASK'});
  assert.equal(state.reads.length, 0);
  assert.equal(state.checked.length, 0);
});

test('missing check plan fails validation before any execution', async () => {
  const state = setup('build-core');
  state.task.check_ids = [];
  await assert.rejects(executeArtifactTask(state.args), error => error.code.startsWith('DAG_'));
  assert.equal(state.executed.length, 0);
});

for (const [field, value, code] of [
  ['attempt_id', '', 'INVALID_ARTIFACT_ATTEMPT'],
  ['runCheck', undefined, 'INVALID_ARTIFACT_TASK_EXECUTOR'],
  ['getRevision', undefined, 'INVALID_ARTIFACT_TASK_EXECUTOR'],
  ['record', null, 'INVALID_ARTIFACT_TASK_EXECUTOR'],
  ['execute', undefined, 'INVALID_ARTIFACT_TASK_EXECUTOR'],
]) test(`invalid ${field} is rejected before implementation`, async () => {
  const state = setup('build-core');
  await assert.rejects(executeArtifactTask({...state.args, [field]: value}), {code});
  assert.equal(state.executed.length, 0);
});
