import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chmod, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runAdaptiveDagExecution} from '../src/orchestration/adaptive-dag-execution.mjs';
import {buildAdaptiveChecks, createAdaptiveWorkerAndChecks} from '../src/benchmark/adaptive-dag-runner.mjs';
import {runDagDockerCheck} from '../src/benchmark/dag-runner.mjs';
import {processResult} from '../src/benchmark/docker.mjs';

// No Docker, network or provider: containers are injected runCommand fakes.
const base = JSON.parse(await readFile(new URL('../examples/dag/contract-fixture.json', import.meta.url)));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const raw = (stdout, exit_code = 0) => ({stdout, stderr: '', exit_code, outcome_uncertain: false});

async function remove(path) {
  const stat = await lstat(path).catch(() => null);
  if (!stat) return;
  if (stat.isDirectory() && !stat.isSymbolicLink()) {
    await chmod(path, 0o700);
    for (const child of await readdir(path)) await remove(join(path, child));
  }
  await rm(path, {recursive: true, force: true});
}

async function verdict(id, root, environment) {
  const read = async path => JSON.parse(await readFile(join(root, path)));
  let passed;
  try {
    if (id === 'check-core') passed = Number.isInteger((await read('core.json')).value);
    else if (id === 'check-meta') passed = (await read('metadata.json')).kind === 'core';
    else if (id === 'check-ui') passed = typeof (await read('ui.json')).label === 'string';
    else if (id === 'check-tools') passed = (await read('tools.json')).ready === true;
    else if (id === 'public-1') passed = (await read('core.json')).value === 8;
    else passed = (await read('ui.json')).label === `value:${(await read('core.json')).value}`;
  } catch { passed = false; }
  const status = passed ? 'passed' : 'failed';
  return {check_id: id, check_version: '1', environment_ref: environment, status, executed: true, assertions: 1, skipped: 0,
    exit_code: passed ? 0 : 1, outcome_uncertain: false, cases: [{id: `${id}-case`, status, assertions: 1}], unexecuted_test_ids: []};
}
const envelope = report => ({status: report.status, exit_code: report.exit_code, outcome_uncertain: false, evidence: report});

// Three implementation leaves and seven integration checks, as in the D065
// execution fixture. split=true gives build-core two artifacts and two checks.
async function fixture(t, {roundZeroCore = 8, split = false} = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'adaptive-check-speed-')));
  t.after(() => remove(root));
  const checker = join(root, 'checker.mjs');
  await writeFile(checker, 'export {};\n');
  const plan = structuredClone(base);
  const [core, ui, integration] = plan.tasks;
  core.write_scope = ['core.json', 'metadata.json'];
  ui.write_scope = ['ui.json']; ui.input_artifact_ids = ['artifact-core']; ui.read_scope = core.write_scope;
  const tools = {...structuredClone(core), id: 'build-tools', requirement_ids: ['requirement-tools'],
    output_artifact_ids: ['artifact-tools'], check_ids: ['check-tools'], worker_id: 'worker-tools', write_scope: ['tools.json']};
  plan.requirement_ids.push('requirement-tools');
  plan.workers.push({id: 'worker-tools', profile_id: 'fixture-local'});
  plan.artifacts.push({id: 'artifact-tools', producer_task_id: 'build-tools'});
  plan.tasks.splice(2, 0, tools);
  const prototype = structuredClone(plan.checks[0]);
  plan.checks = [plan.checks[0], plan.checks[1], {...prototype, id: 'check-tools', artifact_ids: ['artifact-tools'], requirement_ids: ['requirement-tools']}];
  const artifactBindings = {'artifact-core': {paths: ['core.json', 'metadata.json']},
    'artifact-ui': {paths: ['ui.json']}, 'artifact-tools': {paths: ['tools.json']}};
  if (split) {
    plan.artifacts.push({id: 'artifact-meta', producer_task_id: 'build-core'});
    core.output_artifact_ids.push('artifact-meta'); core.check_ids.push('check-meta');
    artifactBindings['artifact-core'].paths = ['core.json']; artifactBindings['artifact-meta'] = {paths: ['metadata.json']};
    plan.checks.push({...prototype, id: 'check-meta', artifact_ids: ['artifact-meta']});
  }
  integration.requirement_ids = [...plan.requirement_ids];
  integration.input_artifact_ids = plan.artifacts.map(artifact => artifact.id);
  integration.read_scope = ['core.json', 'metadata.json', 'ui.json', 'tools.json'];
  integration.check_ids = [];
  for (let index = 1; index <= 7; index++) {
    integration.check_ids.push(`public-${index}`);
    plan.checks.push({...prototype, id: `public-${index}`, phase: 'integration', artifact_ids: [...integration.input_artifact_ids],
      requirement_ids: [...plan.requirement_ids]});
  }
  const checks = [], events = [];
  const options = {plan, artifactBindings, run_id: 'adaptive-check-speed', runDirectory: join(root, 'run'),
    maxRepairRounds: 0, checkerFiles: [{path: checker, relative_path: 'checker.mjs'}], environment: {id: 'node22-fixture-v1'},
    probeEnvironment: async () => ({executable: process.execPath, node: process.version}),
    testRequirements: {'public-1-case': ['requirement-core']},
    record: async event => { events.push(event); },
    executeTask: async (task, {stageDirectory, round_index}) => {
      if (task.id === 'build-core') {
        await writeFile(join(stageDirectory, 'core.json'), JSON.stringify({value: round_index > 0 ? 8 : roundZeroCore}));
        await writeFile(join(stageDirectory, 'metadata.json'), '{"kind":"core"}');
      } else if (task.id === 'build-ui') {
        const value = JSON.parse(await readFile(join(stageDirectory, 'core.json'))).value;
        await writeFile(join(stageDirectory, 'ui.json'), JSON.stringify({label: `value:${value}`}));
      } else await writeFile(join(stageDirectory, 'tools.json'), '{"ready":true}');
      return {status: 'completed'};
    },
    checkTask: async (check, context) => {
      checks.push({id: check.id, round_index: context.round_index});
      return envelope(await verdict(check.id, context.candidateDirectory, context.environment.id));
    },
    decideRepair: async request => {
      const candidate = request.candidates.find(candidate => candidate.id === 'repair-failure-owners');
      return {status: 'selected', candidate_id: candidate.id, candidate};
    }};
  return {root, options, checks, events};
}

// Public checks wait for a per-check delay; tracks the in-flight maximum. With
// hold=N the first N checks also wait (bounded) until N are in flight together,
// so the bound is observed independently of journal fsync latency under load.
function delayedPublic(state, delays, hold = 0) {
  const check = state.options.checkTask, probe = {inFlight: 0, max: 0}, waiting = [];
  let entered = 0;
  state.options.checkTask = async (definition, context) => {
    if (!definition.id.startsWith('public-')) return check(definition, context);
    probe.inFlight++; probe.max = Math.max(probe.max, probe.inFlight);
    try {
      if (++entered <= hold) {
        if (probe.inFlight >= hold) waiting.splice(0).forEach(release => release());
        else await Promise.race([new Promise(release => waiting.push(release)), sleep(5000)]);
      }
      await sleep(delays[definition.id] ?? 0); return await check(definition, context);
    } finally { probe.inFlight--; }
  };
  return probe;
}
const publicEvents = state => state.events.filter(event => ['adaptive_public_check_started', 'adaptive_public_check_completed'].includes(event.event))
  .map(event => [event.event.endsWith('started') ? 'started' : 'completed', event.check_id]);
const registryOrder = Array.from({length: 7}, (_, index) => `public-${index + 1}`);

async function assertChain(path) {
  const rows = (await readFile(path, 'utf8')).trimEnd().split('\n').map(line => JSON.parse(line));
  let prior = null;
  for (const [index, {hash, ...body}] of rows.entries()) {
    assert.equal(body.sequence, index + 1); assert.equal(body.previous_hash, prior); assert.equal(digest(body), hash);
    prior = hash;
  }
  return rows;
}

test('default public check concurrency reproduces the serial started/completed order', async t => {
  const sequences = [];
  for (const value of [undefined, 1]) {
    const state = await fixture(t), probe = delayedPublic(state, {'public-1': 15, 'public-2': 5});
    if (value !== undefined) state.options.publicCheckConcurrency = value;
    const result = await runAdaptiveDagExecution(state.options);
    assert.equal(result.status, 'completed');
    assert.equal(probe.max, 1);
    const sequence = publicEvents(state);
    assert.deepEqual(sequence, registryOrder.flatMap(id => [['started', id], ['completed', id]]));
    assert.deepEqual(result.public_evidence.map(evidence => evidence.check_id), registryOrder);
    sequences.push(sequence);
  }
  assert.deepEqual(sequences[0], sequences[1]);
  for (const bad of [0, -1, 1.5, '2']) {
    const state = await fixture(t);
    state.options.publicCheckConcurrency = bad;
    await assert.rejects(runAdaptiveDagExecution(state.options), {code: 'ADAPTIVE_EXECUTION_INVALID_CONFIG'});
  }
});

test('bounded public concurrency keeps registry-order evidence, a valid hash chain and identical outcomes under shuffled completion', async t => {
  const reverse = Object.fromEntries(registryOrder.map((id, index) => [id, (7 - index) * 60]));
  const shuffled = {'public-1': 20, 'public-2': 300, 'public-3': 100, 'public-4': 360, 'public-5': 40, 'public-6': 240, 'public-7': 160};
  const outcomes = [];
  for (const delays of [reverse, shuffled]) {
    // Round 0 core=7 fails public-1 only; every check still runs.
    const state = await fixture(t, {roundZeroCore: 7}), probe = delayedPublic(state, delays, 3);
    state.options.publicCheckConcurrency = 3;
    const result = await runAdaptiveDagExecution(state.options);
    assert.equal(result.status, 'failed'); assert.equal(result.outcome_uncertain, false);
    assert.equal(probe.max, 3); assert.equal(probe.inFlight, 0);
    const completed = publicEvents(state).filter(([phase]) => phase === 'completed').map(([, id]) => id);
    assert.notDeepEqual(completed, registryOrder, 'completion order must actually be shuffled');
    assert.deepEqual(completed.slice().sort(), registryOrder.slice().sort());
    assert.deepEqual(result.public_evidence.map(evidence => evidence.check_id), registryOrder);
    assert.deepEqual(result.rounds[0].public_evidence.map(evidence => evidence.check_id), registryOrder);
    const rows = await assertChain(result.journal_path);
    assert.equal(rows.filter(row => row.event === 'adaptive_public_check_completed').length, 7);
    assert.equal(result.rounds[0].journal.status, 'recorded');
    const runtimeRows = (await readFile(join(result.rounds[0].initialization.root, 'journal.jsonl'), 'utf8')).trimEnd().split('\n').map(JSON.parse);
    for (const id of registryOrder) assert.equal(runtimeRows.filter(row => row.event === 'check' && row.check_id === id && row.phase === 'started').length, 1);
    outcomes.push(result.public_evidence.map(({check_id, status, assertions, skipped, artifact_revisions}) =>
      ({check_id, status, assertions, skipped, artifact_revisions})));
  }
  assert.deepEqual(outcomes[0].map(row => row.status), ['failed', 'passed', 'passed', 'passed', 'passed', 'passed', 'passed']);
  assert.deepEqual(outcomes[0].map(({artifact_revisions, ...row}) => row), outcomes[1].map(({artifact_revisions, ...row}) => row));
});

function fakeDocker(onStart) {
  const containers = new Map(), live = new Set(), names = [], removed = [];
  let sequence = 0;
  const runCommand = async (command, args, options) => {
    assert.equal(command, 'docker');
    if (args[0] === 'create') {
      const id = (++sequence).toString(16).padStart(64, '0'), entry = args.indexOf('--entrypoint');
      const candidate = args.find(arg => arg.includes('dst=/candidate,')).split(',src=')[1].split(',dst=')[0];
      names.push(args[args.indexOf('--name') + 1]); live.add(id);
      containers.set(id, {candidate, command: args[entry + 1], args: args.slice(entry + 3)});
      return raw(id);
    }
    if (args[0] === 'rm') { live.delete(args.at(-1)); removed.push(args.at(-1)); return raw('removed'); }
    assert.equal(args[0], 'start');
    return onStart(containers.get(args.at(-1)), options);
  };
  return {runCommand, live, names, removed, created: () => sequence};
}

test('abort during concurrent public checks settles every container, starts nothing new and records no pass', async t => {
  const state = await fixture(t), controller = new AbortController(), image = {image_id: `sha256:${'c'.repeat(64)}`};
  let starts = 0, returned = false, lateSettle = false;
  const docker = fakeDocker((container, options) => new Promise(resolve => {
    if (++starts === 3) setTimeout(() => controller.abort('ADAPTIVE_CANCELLED'), 10);
    const timer = setTimeout(() => resolve(raw('{}')), 5000);
    options.abortSignal.addEventListener('abort', () => {
      clearTimeout(timer); setTimeout(() => { lateSettle ||= returned; resolve({...raw(''), exit_code: null, outcome_uncertain: true}); }, 20);
    }, {once: true});
  }));
  const local = state.options.checkTask;
  state.options.publicCheckConcurrency = 3;
  state.options.checkTask = async (check, context) => {
    if (!check.id.startsWith('public-')) return local(check, context);
    const bindingDirectory = await mkdtemp(join(state.root, 'binding-'));
    const remaining = () => {
      if (controller.signal.aborted) throw Object.assign(new Error('ADAPTIVE_CANCELLED'), {code: 'ADAPTIVE_CANCELLED', outcome_uncertain: true});
      return 10000;
    };
    const {report} = await runDagDockerCheck({image, check: {...check, argv: ['python3', '/checker/run.py']},
      candidateDirectory: context.candidateDirectory, pinnedDirectory: context.pinnedDirectory, bindingDirectory,
      runCommand: docker.runCommand, remaining, attemptId: context.attempt_id, abortSignal: controller.signal});
    return envelope(report);
  };
  const result = await runAdaptiveDagExecution(state.options);
  returned = true;
  await sleep(60);
  assert.equal(lateSettle, false, 'every aborted container settled before the run returned');
  assert.equal(result.status, 'uncertain'); assert.equal(result.outcome_uncertain, true);
  assert.equal(docker.created(), 3); assert.equal(docker.live.size, 0); assert.equal(docker.removed.length, 3);
  assert.equal(new Set(docker.names).size, 3);
  const started = state.events.filter(event => event.event === 'adaptive_public_check_started').map(event => event.check_id);
  assert.deepEqual(started, ['public-1', 'public-2', 'public-3']);
  assert.equal(state.events.some(event => event.event === 'adaptive_public_check_completed' && event.status === 'passed'), false);
  assert.deepEqual(result.rounds[0].public_evidence, []);
  assert.equal(result.rounds[0].journal.status, 'uncertain');
  await assertChain(result.journal_path);
});

function batchFake(state, behavior) {
  const batches = [];
  state.options.batchChecks = async (checks, context) => {
    batches.push({mode: context.mode, round_index: context.round_index, check_ids: checks.map(check => check.id)});
    if (behavior) return behavior(checks, context);
    const results = {};
    for (const check of checks) results[check.id] = envelope(await verdict(check.id, context.candidateDirectory, context.environment.id));
    return {results};
  };
  return batches;
}

test('batched results reach downstream evidence in the single-run shape; batch identity stays in the event (D076 regression)', async t => {
  // A real readiness batch adds evidence.batch; leaving it in local evidence made the owner v2 projection fall back to raw.
  const state = await fixture(t, {split: true});
  batchFake(state, async (checks, context) => {
    const results = {};
    for (const check of checks) {
      const report = envelope(await verdict(check.id, context.candidateDirectory, context.environment.id));
      report.evidence = {...report.evidence, batch: {id: context.batch_id, mode: context.mode, size: checks.length}};
      results[check.id] = report;
    }
    return {results};
  });
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed');
  const local = result.rounds[0].local_evidence.filter(evidence => ['check-core', 'check-meta'].includes(evidence.check_id));
  assert.equal(local.length, 2);
  assert.ok(local.every(evidence => !JSON.stringify(evidence).includes('"batch"')), JSON.stringify(local));
  const used = state.events.filter(event => event.event === 'adaptive_check_batch_result_used');
  assert.deepEqual(used.map(event => event.batch?.mode), ['task', 'task']);
});

test('task batch covers all checks of a multi-artifact leaf in one call and each check reuses only its own result', async t => {
  const state = await fixture(t, {split: true}), batches = batchFake(state);
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.status, 'completed');
  assert.deepEqual(batches, [{mode: 'task', round_index: 0, check_ids: ['check-core', 'check-meta']}]);
  assert.deepEqual(state.checks.filter(check => !check.id.startsWith('public-')).map(check => check.id).sort(), ['check-tools', 'check-ui']);
  assert.deepEqual(state.events.filter(event => event.event === 'adaptive_check_batch_result_used').map(event => event.check_id), ['check-core', 'check-meta']);
  const local = result.rounds[0].local_evidence.filter(evidence => ['check-core', 'check-meta'].includes(evidence.check_id));
  assert.deepEqual(local.map(evidence => [evidence.check_id, evidence.status]), [['check-core', 'passed'], ['check-meta', 'passed']]);
  assert.ok(local.every(evidence => evidence.artifact_revisions['artifact-core'] === result.artifact_revisions['artifact-core']));
  await assertChain(result.journal_path);

  const off = await fixture(t, {split: true});
  assert.equal((await runAdaptiveDagExecution(off.options)).status, 'completed');
  assert.equal(off.events.some(event => event.event.startsWith('adaptive_check_batch')), false);
  assert.equal(off.checks.filter(check => ['check-core', 'check-meta'].includes(check.id)).length, 2);
});

test('round-start batch reuses carried revisions and a repaired artifact falls back to a single run', async t => {
  const state = await fixture(t, {roundZeroCore: 7}), batches = batchFake(state);
  state.options.maxRepairRounds = 1;
  const result = await runAdaptiveDagExecution(state.options);
  assert.equal(result.rounds.length, 2); assert.equal(result.status, 'failed');
  assert.deepEqual(result.operations, {implementation: 3, repair: 1, carry_forward: 2});
  assert.deepEqual(batches, [{mode: 'round_start', round_index: 1, check_ids: ['check-core', 'check-ui', 'check-tools']}]);
  const local = round => state.checks.filter(check => check.round_index === round && !check.id.startsWith('public-')).map(check => check.id);
  assert.deepEqual(local(0).sort(), ['check-core', 'check-tools', 'check-ui']);
  assert.deepEqual(local(1), ['check-core']);
  assert.deepEqual(state.events.filter(event => event.event === 'adaptive_check_batch_fallback').map(event => [event.check_id, event.reason]),
    [['check-core', 'ARTIFACT_REVISION_CHANGED']]);
  assert.deepEqual(state.events.filter(event => event.event === 'adaptive_check_batch_result_used').map(event => event.check_id).sort(), ['check-tools', 'check-ui']);
  const [before, after] = result.rounds.map(round => round.exported.artifact_revisions);
  assert.notEqual(before['artifact-core'], after['artifact-core']);
  assert.equal(before['artifact-ui'], after['artifact-ui']);
  const batchDirectory = join(result.directory, 'round-1', 'round-start-check-batch');
  assert.equal((await lstat(batchDirectory)).mode & 0o777, 0o555);
  assert.deepEqual((await readdir(batchDirectory)).sort(), ['core.json', 'metadata.json', 'tools.json', 'ui.json']);
  const reused = result.rounds[1].local_evidence.find(evidence => evidence.check_id === 'check-ui');
  assert.equal(reused.status, 'passed'); assert.equal(reused.artifact_revisions['artifact-ui'], after['artifact-ui']);
  await assertChain(result.journal_path);
});

test('known batch failure falls back to single runs; an unknown batch outcome stays uncertain without a fresh run', async t => {
  for (const unknown of [false, true]) await t.test(unknown ? 'uncertain' : 'known failure', async t => {
    const state = await fixture(t, {split: true});
    batchFake(state, () => { throw Object.assign(new Error('batch'), {code: unknown ? 'DAG_CONTAINER_PROCESS_UNCERTAIN' : 'ADAPTIVE_READINESS_BATCH_INVALID',
      outcome_uncertain: unknown}); });
    const result = await runAdaptiveDagExecution(state.options);
    const singles = state.checks.filter(check => ['check-core', 'check-meta'].includes(check.id)).map(check => check.id);
    if (unknown) {
      assert.equal(result.status, 'uncertain'); assert.equal(result.outcome_uncertain, true);
      assert.deepEqual(singles, []); assert.equal(result.rounds[0].journal.status, 'uncertain');
    } else {
      assert.equal(result.status, 'completed'); assert.deepEqual(singles, ['check-core', 'check-meta']);
      assert.deepEqual(state.events.filter(event => event.event === 'adaptive_check_batch_fallback').map(event => event.reason),
        ['BATCH_RESULT_UNAVAILABLE', 'BATCH_RESULT_UNAVAILABLE']);
    }
  });
  await t.test('round-start uncertainty is surfaced as the round terminal cause', async t => {
    const state = await fixture(t, {roundZeroCore: 7});
    const batches = batchFake(state, () => { throw Object.assign(new Error('batch'), {code: 'DAG_CONTAINER_PROCESS_UNCERTAIN', outcome_uncertain: true}); });
    state.options.maxRepairRounds = 1;
    const result = await runAdaptiveDagExecution(state.options);
    assert.equal(batches.length, 1); assert.equal(result.rounds.length, 2);
    assert.equal(result.status, 'uncertain'); assert.equal(result.stop_code, 'DAG_CONTAINER_PROCESS_UNCERTAIN');
    assert.deepEqual(state.checks.filter(check => check.round_index === 1 && ['check-ui', 'check-tools'].includes(check.id)), []);
    await assertChain(result.journal_path);
  });
});

test('runner readiness batch makes one container call for N artifacts and fails only the artifact with a broken file', async t => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'adaptive-readiness-batch-')));
  t.after(() => remove(root));
  const image = {image_id: `sha256:${'d'.repeat(64)}`, os: 'linux', architecture: 'amd64'};
  await writeFile(join(root, 'image-lock.json'), JSON.stringify(image));
  const candidate = join(root, 'candidate'), pinned = join(root, 'pinned'), runDirectory = join(root, 'run');
  for (const path of [join(candidate, 'pkg'), pinned, join(runDirectory, 'check-bindings')]) await mkdir(path, {recursive: true});
  await writeFile(join(candidate, 'pkg/a.py'), 'VALUE = 1\n');
  await writeFile(join(candidate, 'pkg/__init__.py'), '');
  await writeFile(join(candidate, 'pkg/b.py'), 'def broken(:\n');
  await writeFile(join(candidate, 'setup.sh'), 'echo ready\n');
  const catalog = {units: [], artifacts: [{id: 'artifact-a', paths: ['pkg/a.py', 'pkg/__init__.py']},
    {id: 'artifact-b', paths: ['pkg/b.py']}, {id: 'artifact-setup', paths: ['setup.sh']}]};
  const checks = buildAdaptiveChecks({catalog, registry: [], manifest: {public_environment_ref: 'fixture-env'}, source_ref: {path: 'spec.md'}});
  const saved = new Map();
  const docker = fakeDocker(container => processResult(container.command, container.args, {cwd: container.candidate, timeoutMs: 30000}));
  const context = {directory: runDirectory, remaining: () => 30000, record: async () => {}, save: (name, value) => saved.set(name, value)};
  const make = readinessBatch => createAdaptiveWorkerAndChecks({rootDir: root, manifest: {image_lock: 'image-lock.json'}, context,
    session: {}, input: {}, catalog, registry: [], preflight: {}, adapters: {runCommand: docker.runCommand}, ...(readinessBatch ? {readinessBatch} : {})});
  assert.equal(Object.hasOwn(make(false), 'batchChecks'), false);
  const callbacks = make(true), revisions = {'artifact-a': 'rev-a', 'artifact-b': 'rev-b', 'artifact-setup': 'rev-setup'};
  const singles = [];
  for (const check of checks) singles.push(await callbacks.checkTask(check, {candidateDirectory: candidate, pinnedDirectory: pinned,
    attempt_id: `single-${check.id}`, round_index: 0, artifact_revisions: revisions}));
  assert.equal(docker.created(), 3);
  const {results} = await callbacks.batchChecks([...checks, {...checks[0], id: 'not-readiness', argv: ['python3', '-c', 'pass', '[]']}],
    {candidateDirectory: candidate, pinnedDirectory: pinned, batch_id: 'fixture-batch', mode: 'round_start', round_index: 1,
      artifact_revisions: revisions});
  assert.equal(docker.created(), 4, 'one container for all three readiness checks');
  assert.equal(docker.live.size, 0);
  assert.deepEqual(Object.keys(results), checks.map(check => check.id));
  assert.deepEqual(Object.values(results).map(result => result.status), ['passed', 'failed', 'passed']);
  assert.equal(results['adaptive.readiness.2'].evidence.error.code, 'SyntaxError');
  assert.equal(results['adaptive.readiness.2'].exit_code, 1);
  for (const [index, check] of checks.entries()) {
    const single = singles[index], batched = results[check.id];
    for (const key of ['check_id', 'check_version', 'environment_ref', 'status', 'executed', 'exit_code', 'assertions', 'skipped', 'outcome_uncertain']) {
      assert.deepEqual(batched[key], single[key], `${check.id}.${key}`);
    }
    assert.deepEqual(batched.evidence.error, single.evidence.error);
    assert.deepEqual(batched.evidence.batch, {id: 'fixture-batch', mode: 'round_start', size: 3,
      artifact_revisions: {[check.artifact_ids[0]]: revisions[check.artifact_ids[0]]}});
  }
  const receipt = saved.get(results['adaptive.readiness.1'].evidence.report_ref);
  assert.equal(receipt.batch_id, 'fixture-batch'); assert.deepEqual(Object.keys(receipt.envelopes), checks.map(check => check.id));
});
