import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, lstatSync, chmodSync, rmSync} from 'node:fs';
import {join, resolve, dirname, relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {loadAdaptiveRunManifest, adaptivePublicInput, ADAPTIVE_ARMS, adaptiveDecisionSchema, createAdaptiveProviderSession,
  validateAdaptivePublicReport, assertAdaptiveCohortCapacity, buildAdaptiveChecks, prepareAdaptiveSharedCatalog,
  runAdaptiveArm, runAdaptiveComparison, loadAdaptiveSharedPreparation, adaptiveUsageSummary} from '../src/benchmark/adaptive-dag-runner.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {createTokenBudget} from '../src/benchmark/budget.mjs';
import {createJevClient} from '../src/client.mjs';

const root = resolve(import.meta.dirname, '..'), manifest = loadAdaptiveRunManifest();
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const hash = path => createHash('sha256').update(readFileSync(path)).digest('hex');
function isolatedManifest(parent, base = manifest) {
  const local = {...base, jev_budget: {...base.jev_budget, ledger_path: join(parent, `ledger-${base.jev_budget.schema_version.split('/').at(-1)}.json`)}};
  createTokenBudget(local.jev_budget).close();
  return local;
}
const input = adaptivePublicInput(read(join(root, manifest.input))), registry = read(join(root, manifest.public_registry));
const raw = (stdout, exit_code = 0) => ({stdout, stderr: '', exit_code, outcome_uncertain: false});
const completion = response => raw(JSON.stringify({type: 'result', subtype: 'success', is_error: false,
  modelUsage: {'claude-opus-5-5': {}}, usage: {input_tokens: 20, output_tokens: 5, cache_read_input_tokens: 3,
    cache_creation_input_tokens: 2, cache_creation: {ephemeral_5m_input_tokens: 2, ephemeral_1h_input_tokens: 0}},
  total_cost_usd: 0.002, structured_output: response, result: 'fixture completed'}) + '\n');
function cleanup(path) {
  const stat = lstatSync(path); chmodSync(path, 0o700);
  if (stat.isDirectory()) for (const name of readdirSync(path)) cleanup(join(path, name));
  rmSync(path, {recursive: true, force: true});
}
function sessionDirectory(parent, name) {
  const directory = join(parent, name); mkdirSync(directory);
  mkdirSync(join(directory, 'calls')); mkdirSync(join(directory, 'receipts')); return directory;
}
const request = {model: 'jev-latest', state: {source_sha256: input.source_ref.sha256, evidence: 'public evidence only'},
  questions: {choose: {type: 'choice', instructions: 'Choose the supported option.', criteria: {left: 'Left.', right: 'Right.'}},
    score: {type: 'score', instructions: 'Rate evidence.', criteria: ['low', 'high']},
    probability: {type: 'noul', instructions: 'Is it supported?'}}};
const answers = {answers: {choose: {type: 'choice', choice: 'left'}, score: {type: 'score', score: 1}, probability: {type: 'noul', noul: 0.7}}};

test('Claude and measured Jev receive identical typed decisions; receipts and arm budget preserve the protocol', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'd066-providers-')), calls = [], events = [];
  let reserved = 0, settled = 0;
  try {
    const session = createAdaptiveProviderSession({rootDir: root, manifest, run_id: 'provider-fixture',
      runDirectory: sessionDirectory(directory, 'session'), remaining: () => 40000, record: async event => events.push(event),
      adapters: {jevConfig: {}, runCommand: async (command, args, options) => {
        calls.push({command, args, body: JSON.parse(options.input), schema: JSON.parse(args[args.indexOf('--json-schema') + 1]),
          mcp: read(args[args.indexOf('--mcp-config') + 1]), cwdFiles: readdirSync(options.cwd)});
        const response = completion(answers); options.onStdout(response.stdout); return response;
      }, openBudget: () => ({reserve: () => { reserved++; return 'fixture-reservation'; }, settle: () => settled++,
        snapshot: () => ({fixture: true}), close: () => {}}), jevClientFactory: () => ({listModels: async () => ({models: [{name: 'jev-latest'}]}),
        listCredits: async () => ({fixture: true}), decide: async body => { calls.push({command: 'jev', body});
          return {...answers, model: 'jev-1.13.0', usage: {input_tokens: 42, output_tokens: 3}}; }})}});
    assert.deepEqual(await session.decide('claude', request, {stage: 'split'}), answers);
    assert.deepEqual(await session.decide('jev', request, {stage: 'split'}), answers);
    assert.deepEqual(calls[0].body, calls[1].body);
    assert.deepEqual(calls[0].schema, adaptiveDecisionSchema(request));
    assert.deepEqual(calls[0].mcp, {mcpServers: {}}); assert.deepEqual(calls[0].cwdFiles, []);
    assert.equal(calls[0].args[calls[0].args.indexOf('--tools') + 1], '');
    assert.equal(calls[0].args[calls[0].args.indexOf('--effort') + 1], 'medium');
    assert.equal(reserved, 1); assert.equal(settled, 1); assert.ok(events.some(event => event.event === 'inference_started'));
    const receipts = session.receipts(); assert.equal(receipts.length, 2);
    assert.deepEqual(receipts[0].usage.cache_creation, {ephemeral_5m_input_tokens: 2, ephemeral_1h_input_tokens: 0});
    assert.equal(receipts[0].actual_billed_usd, null);
    assert.equal(assertAdaptiveCohortCapacity({manifest, snapshot: {remaining_input_tokens: 2366258, reservations_pending: 0, blocked_code: null}}).required_input_tokens, 2165536);
    assert.throws(() => assertAdaptiveCohortCapacity({manifest, snapshot: {remaining_input_tokens: 2100000, reservations_pending: 0, blocked_code: null}}), {code: 'ADAPTIVE_COHORT_BUDGET_INSUFFICIENT'});
    assert.deepEqual(Object.values(ADAPTIVE_ARMS.jev_split_relations), ['jev', 'jev', 'claude']);
    assert.equal(JSON.stringify(input).includes('write_scope'), false);
    assert.equal(JSON.stringify(input).includes('artifact_interfaces'), false);
  } finally { cleanup(directory); }
});

test('uncertain provider closes the session without another dispatch and explicit spend precedes filesystem effects', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'd066-uncertain-')); let calls = 0;
  try {
    const session = createAdaptiveProviderSession({rootDir: root, manifest, run_id: 'unknown-fixture',
      runDirectory: sessionDirectory(directory, 'session'), remaining: () => 1000,
      adapters: {jevConfig: {}, runCommand: async () => { calls++; return {...raw('', null), outcome_uncertain: true}; }}});
    await assert.rejects(session.decide('claude', request, {stage: 'relations'}), {outcome_uncertain: true});
    await assert.rejects(session.decide('claude', request, {stage: 'repair'}), {code: 'ADAPTIVE_PROVIDER_STOPPED'});
    assert.equal(calls, 1); assert.equal(session.receipts()[0].outcome_uncertain, true);
    await assert.rejects(runAdaptiveArm({manifest, runDir: join(directory, 'must-not-exist'), arm: 'claude_all'}), {code: 'EXPLICIT_SPEND_REQUIRED'});
    assert.equal(readdirSync(directory).includes('must-not-exist'), false);
  } finally { cleanup(directory); }
});

test('D069 token admission blocks before budget reservation or POST and pins an admitted exact body', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'd069-admission-'));
  const config = loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d069-adaptive.json'), root);
  let opens = 0, posts = 0, reservations = 0;
  const events = [], make = name => createAdaptiveProviderSession({rootDir: root, manifest: config,
    run_id: name, runDirectory: sessionDirectory(directory, name), remaining: () => 5000,
    record: async event => events.push(event), adapters: {jevConfig: {},
      openBudget: () => { opens++; return {reserve: () => { reservations++; return 'fixture'; }, settle: () => {},
        snapshot: () => ({fixture: true}), close: () => {}}; },
      jevClientFactory: () => ({listModels: async () => ({models: [{name: 'jev-latest'}]}), listCredits: async () => ({}),
        decide: async body => { posts++; assert.deepEqual(body, request);
          return {...answers, model: 'jev-1.13.0', usage: {input_tokens: 42, output_tokens: 3}}; }})}});
  try {
    const blocked = make('blocked');
    await assert.rejects(blocked.decide('jev', {...request, state: 'x'.repeat(100000)}, {stage: 'repair'}),
      {code: 'ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED', outcome_uncertain: false});
    assert.equal(opens, 0); assert.equal(posts, 0); assert.equal(reservations, 0);
    assert.equal(blocked.receipts()[0].inference_started, false); assert.equal(blocked.receipts()[0].usage, null);
    const allowed = make('allowed'); await allowed.decide('jev', request, {stage: 'repair'});
    assert.equal(posts, 1); assert.equal(reservations, 1);
    const report = read(join(directory, 'allowed/calls/jev-0001.token-admission.json'));
    assert.equal(report.inference_allowed, true); assert.equal(report.provider_acceptance_guaranteed, false);
    assert.equal(report.request_sha256, createHash('sha256').update(JSON.stringify(request)).digest('hex'));
    assert.equal(events.filter(event => event.event === 'inference_started').length, 1);
  } finally { cleanup(directory); }
});

test('D069 v5 repair wire guard and missing stage stop before reservation while a valid repair uses v2', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'd069-v5-'));
  const config = loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d069-adaptive-v2.json'), root);
  let opens = 0, posts = 0;
  const make = name => createAdaptiveProviderSession({rootDir: root, manifest: config, run_id: name,
    runDirectory: sessionDirectory(directory, name), remaining: () => 5000, adapters: {jevConfig: {},
      openBudget: () => { opens++; return {reserve: () => 'fixture', settle: () => {}, snapshot: () => ({}), close: () => {}}; },
      jevClientFactory: () => ({listModels: async () => ({models: [{name: 'jev-latest'}]}), listCredits: async () => ({}),
        decide: async body => { posts++; assert.deepEqual(body, request);
          return {...answers, model: 'jev-1.13.0', usage: {input_tokens: 42, output_tokens: 3}}; }})}});
  try {
    await assert.rejects(make('wire').decide('jev', {...request, state: 'x'.repeat(25000)}, {stage: 'repair'}),
      {code: 'ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED'});
    const blocked = read(join(directory, 'wire/calls/jev-0001.token-admission.json'));
    assert(blocked.reason_codes.includes('JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT'));
    assert.equal(blocked.exact_model_tokens.request, null);
    await assert.rejects(make('missing-stage').decide('jev', request, {}), {code: 'ADAPTIVE_STAGE_INVALID'});
    assert.equal(opens, 0); assert.equal(posts, 0);
    await make('valid').decide('jev', request, {stage: 'repair'});
    const report = read(join(directory, 'valid/calls/jev-0001.token-admission.json'));
    assert.equal(report.stage, 'repair'); assert.equal(report.schema_version, 'jev-token-admission-result/v2');
    assert.equal(report.policy_source.sha256, hash(join(root, config.repair_policy.token_admission_contract)));
    assert.equal(report.request_sha256, createHash('sha256').update(JSON.stringify(request)).digest('hex'));
    assert.equal(opens, 1); assert.equal(posts, 1);
  } finally { cleanup(directory); }
});

test('D070 balanced decomposition is explicit while worker, repair and legacy conditions remain fixed', () => {
  const parent = mkdtempSync(join(tmpdir(), 'd070-manifest-'));
  try {
    const path = join(root, 'benchmarks/e2e-swe/manifests/d070-adaptive.json');
    const original = read(path), config = loadAdaptiveRunManifest(path, root);
    assert.deepEqual(config.decomposition_policy, {id: 'balanced-v2', contract: 'docs/orchestration/contracts/adaptive-decomposition.v2.json'});
    assert.equal(config.limits.max_concurrency, 2);
    assert.equal(config.repair_policy.token_admission_contract, 'docs/orchestration/contracts/jev-token-admission.v2.json');
    const legacy = loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d070-preserved-repair.json'), root);
    assert.equal(legacy.decomposition_policy, undefined);
    for (const changed of [{...original, decomposition_policy: undefined},
      {...original, decomposition_policy: {...original.decomposition_policy, id: 'implicit'}},
      {...original, schema_version: 'adaptive-dag-comparison/v5'},
      {...original, limits: {...original.limits, max_concurrency: 4}}]) {
      const invalid = join(parent, 'invalid.json'); writeFileSync(invalid, JSON.stringify(changed));
      assert.throws(() => loadAdaptiveRunManifest(invalid, root), {code: 'ADAPTIVE_MANIFEST_INVALID'});
    }
  } finally { cleanup(parent); }
});

test('Jev model-limit rejection stays known while 5xx and transport remain uncertain; pending accounting never auto-settles', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'd068-provider-failure-'));
  const incidentMessage = 'The input exceeds the selected model\'s input limit. Shorten the state, instructions or criteria before retrying. No charge was made.';
  try {
    for (const failure of [{name: 'known400', status: 400, uncertain: false, category: 'model_input_limit'},
      {name: 'server503', status: 503, uncertain: true, category: 'upstream_unavailable'},
      {name: 'transport', status: null, uncertain: true, category: null}]) {
      let posts = 0, reservations = 0, settlements = 0;
      const events = [], client = createJevClient({apiKey: 'fixture-key', fetchImpl: async (_url, options) => {
        assert.equal(options.method, 'POST'); posts++;
        if (failure.status === null) throw new Error('fixture transport failure');
        return new Response(JSON.stringify({error: {message: failure.status === 400 ? incidentMessage : 'Service unavailable'}}),
          {status: failure.status, headers: {'content-type': 'application/json'}});
      }});
      const session = createAdaptiveProviderSession({rootDir: root, manifest, run_id: failure.name,
        runDirectory: sessionDirectory(directory, failure.name), remaining: () => 5000, record: async event => events.push(event),
        adapters: {jevConfig: {}, openBudget: () => ({reserve: () => { reservations++; return 'fixture-reservation'; },
          settle: () => { settlements++; }, snapshot: () => ({reservations_pending: reservations - settlements}), close: () => {}}),
          jevClientFactory: () => ({...client, listModels: async () => ({models: [{name: 'jev-latest'}]}), listCredits: async () => ({})})}});
      let thrown;
      await assert.rejects(session.decide('jev', request, {stage: 'repair'}), error => { thrown = error; return true; });
      assert.equal(thrown.outcome_uncertain, failure.uncertain);
      assert.deepEqual(thrown.terminal_cause, {stage: 'repair', code: failure.status === null ? 'TRANSPORT_ERROR' : 'HTTP_ERROR',
        http_status: failure.status, category: failure.category, outcome_uncertain: failure.uncertain});
      const receipt = session.receipts()[0];
      assert.equal(receipt.status, failure.uncertain ? 'uncertain' : 'failed');
      assert.deepEqual(receipt.terminal_cause, thrown.terminal_cause);
      assert.equal(receipt.usage, null); assert.equal(receipt.actual_billed_usd, null);
      assert.equal(events.find(event => event.event === 'inference_finished').outcome_uncertain, failure.uncertain);
      await assert.rejects(session.decide('jev', request, {stage: 'repair'}), {code: 'ADAPTIVE_PROVIDER_STOPPED'});
      assert.equal(posts, 1); assert.equal(reservations, 1); assert.equal(settlements, 0);
    }
  } finally { cleanup(directory); }
});

function reportFor(check, {failed = false} = {}) {
  return {schema_version: 'dag-public-check-evidence/v1', check_id: check.id, check_version: check.version,
    environment_ref: check.environment_ref, scope: 'complete_suite', binding_kind: 'candidate', product_certified: false,
    artifact_revisions: null, status: failed ? 'failed' : 'passed', executed: true, exit_code: failed ? 1 : 0,
    outcome_uncertain: false, test_ids: check.test_ids, cases: check.test_ids.map((test_id, index) => ({test_id,
      status: failed && index === 0 ? 'failed' : 'passed', assertions: failed && index === 0 ? 0 : 1})),
    assertions: check.test_ids.length - (failed ? 1 : 0), skipped: 0, unexecuted_test_ids: [], error: null, setup_evidence: {fixture: true}};
}

test('candidate setup and exact prefix failures remain known failed; incomplete pass and uncertain reports reject', () => {
  const check = registry[0], base = reportFor(check), process = raw('', 1);
  const setup = {...base, status: 'failed', executed: false, exit_code: 1, cases: [], assertions: 0, skipped: check.test_ids.length,
    unexecuted_test_ids: check.test_ids, error: {code: 'RuntimeError', message: 'setup failed'}, setup_evidence: null};
  const validate = report => validateAdaptivePublicReport({check, registeredCheck: check, raw: process, report});
  assert.equal(validate(setup), setup); assert.equal(setup.executed, false);
  const partial = {...setup, executed: true, cases: [base.cases[0]], assertions: 1, skipped: check.test_ids.length - 1,
    unexecuted_test_ids: check.test_ids.slice(1), setup_evidence: {fixture: true}};
  assert.equal(validate(partial), partial);
  assert.throws(() => validate({...partial, unexecuted_test_ids: check.test_ids.slice(2)}), {code: 'ADAPTIVE_PUBLIC_EVIDENCE_INVALID'});
  assert.throws(() => validate({...setup, status: 'passed', error: null}), {code: 'DAG_PUBLIC_EVIDENCE_INVALID'});
  assert.throws(() => validate({...setup, binding_kind: 'normal'}), {code: 'ADAPTIVE_PUBLIC_EVIDENCE_INVALID'});
  assert.throws(() => validate({...setup, outcome_uncertain: true}), {code: 'ADAPTIVE_CHECK_UNCERTAIN', outcome_uncertain: true});
  const known = reportFor(check, {failed: true}); assert.equal(validate(known), known);
});

function fixtureCatalog() {
  return {schema_version: 'adaptive-catalog/v1', source_sha256: input.source_ref.sha256,
    evidence: [{id: 'public-quote', quote: input.source.slice(0, 200)}],
    units: ['core', 'support', 'setup'].map((name, index) => ({id: `unit-${name}`, title: name,
      requirement_ids: input.requirement_ids.filter((_, requirement) => requirement % 3 === index), artifact_ids: [`artifact-${name}`],
      interface: `Controller fixture ${name} file. No product claim.`, evidence_ids: ['public-quote']})),
    artifacts: ['core', 'support', 'setup'].map(name => ({id: `artifact-${name}`, paths: [name === 'setup' ? 'setup.sh' : `${name}.py`],
      description: `Authored fixture ${name}`, evidence_ids: ['public-quote']}))};
}

test('fresh preparation reaches real recursive planner, filesystem publication, seven-check collection and a selected repair', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d066-runner-test-')), containers = new Map(), workers = [], suites = [];
  const localManifest = isolatedManifest(parent), catalog = fixtureCatalog(), image = read(join(root, manifest.image_lock)); let sequence = 0, checks = 0;
  const adapters = {jevConfig: {}, preflight: async () => ({live_ready: true, status: 'ready', environment: {fixture: true, image_id: image.image_id}}),
    runCommand: async (command, args, options) => {
      if (command === 'claude') {
        let prompt; try { prompt = JSON.parse(options.input); } catch {}
        let response;
        if (prompt?.questions) response = {answers: Object.fromEntries(Object.entries(prompt.questions).map(([id, question]) => {
          const offered = Object.keys(question.criteria), choice = offered.includes('no_dependency') ? 'no_dependency'
            : offered.includes('keep') ? 'keep' : offered.includes('split_2') ? 'split_2'
              : offered.find(key => key.startsWith('repair_')) ?? offered[0];
          return [id, {type: 'choice', choice}];
        }))};
        else if (prompt?.task) {
          workers.push({task_id: prompt.task.id, operation: prompt.operation, round_index: prompt.round_index});
          const mcp = read(args[args.indexOf('--mcp-config') + 1]), transport = read(mcp.mcpServers.artifact_worker.args.at(-1));
          for (const path of prompt.task.write_scope) { mkdirSync(dirname(join(transport.root, path)), {recursive: true});
            writeFileSync(join(transport.root, path), `# fixture ${prompt.operation} ${prompt.round_index}\n`, {mode: 0o644}); }
          response = {fixture: 'worker completed'};
        } else response = catalog;
        const result = completion(response); options.onStdout(result.stdout); return result;
      }
      assert.equal(command, 'docker');
      if (args[0] === 'image') return raw(JSON.stringify([{Id: image.image_id}]));
      if (args[0] === 'create') {
        assert.ok(args.includes('--network')); assert.ok(args.includes('none')); assert.ok(args.includes('/tmp:rw,exec,size=2g'));
        const id = (++sequence).toString(16).padStart(64, '0'), mounts = args.filter(arg => arg.startsWith('type=bind,'));
        assert.ok(mounts.every(value => value.endsWith(',readonly')));
        const candidate = mounts.find(value => value.includes('dst=/candidate,')).split(',src=')[1].split(',dst=')[0];
        const entry = args.indexOf('--entrypoint'); containers.set(id, {candidate, command: args[entry + 1], args: args.slice(entry + 3)});
        return raw(id);
      }
      if (args[0] === 'rm') { containers.delete(args.at(-1)); return raw('removed'); }
      const container = containers.get(args.at(-1)); assert.ok(container);
      if (container.args[0] === '-c') return processResult(container.command, container.args, {cwd: container.candidate});
      assert.equal(container.args.at(-1), '/run/binding.json');
      const suite = container.args[container.args.indexOf('--suite') + 1], check = registry.find(item => item.id === `public.${suite}`);
      suites.push(suite); const failed = checks++ === 0, report = reportFor(check, {failed});
      return raw(JSON.stringify(report), failed ? 1 : 0);
    }};
  try {
    const prepared = await prepareAdaptiveSharedCatalog({rootDir: root, manifest: localManifest, runDir: join(parent, 'preparation'), spend: true, adapters});
    assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
    const result = await runAdaptiveArm({rootDir: root, manifest: localManifest, runDir: join(parent, 'claude_all'), arm: 'claude_all',
      preparationDirectory: join(parent, 'preparation'), spend: true, adapters});
    assert.equal(result.status, 'completed', JSON.stringify(result));
    assert.equal(result.repair_rounds_used, 1); assert.ok(result.operations.repair > 0); assert.equal(containers.size, 0);
    assert.equal(suites.length, 14); assert.deepEqual(suites.slice(0, 7), suites.slice(7));
    assert.equal(result.product_success, null); assert.equal(result.completion_wall_ms, null); assert.equal(result.usage.jev.calls, 0);
    assert.deepEqual(result.budget_after, result.budget_before);
    assert.ok(result.full_preparation_inclusive_wall_ms > result.wall_ms);
    assert.ok(workers.some(worker => worker.operation === 'repair'));
    const execution = read(join(parent, 'claude_all/execution.json'));
    assert.equal(execution.rounds[0].public_evidence.length, 7); assert.equal(execution.rounds[0].status, 'failed');
    assert.ok(execution.rounds.every(round => round.journal.status === 'recorded' && round.journal.unresolved.length === 0));
    assert.equal(Object.keys(result.artifact_revisions).length, 3);
    const projected = buildAdaptiveChecks({catalog, registry, manifest, source_ref: input.source_ref});
    assert.ok(projected.filter(check => check.phase === 'integration').every(check => check.argv.at(-1) === '/run/binding.json'
      && check.artifact_ids.length === 3));
  } finally { cleanup(parent); }
});

test('comparison stays sequential and stops after uncertain arm without starting a later condition', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d066-sequence-test-')), order = []; let active = false;
  try {
    const result = await runAdaptiveComparison({rootDir: root, manifest, runDir: join(parent, 'comparison'),
      preparationDirectory: parent, spend: true, adapters: {runArm: async ({arm}) => {
        assert.equal(active, false); active = true; order.push(arm); await Promise.resolve(); active = false;
        return {arm, status: arm === 'jev_split' ? 'uncertain' : 'failed', outcome_uncertain: arm === 'jev_split'};
      }}});
    assert.deepEqual(order, ['claude_all', 'jev_split']); assert.equal(result.status, 'uncertain'); assert.equal(result.completed_arms, 2);
    assert.equal(result.successful_completion_comparison, null);
  } finally { cleanup(parent); }
});

const parallel = loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d067-adaptive.json'), root);
const unlimitedSnapshot = {schema_version: 'jev-token-budget-snapshot/v3', unlimited: true, token_limit: null,
  remaining_input_tokens: null, reservations_pending: 0, blocked_code: null};

test('only explicit v2/null policy removes the per-arm cap; legacy cap and unresolved reservations remain enforced', async () => {
  const parent = mkdtempSync(join(tmpdir(), 'd067-token-guard-'));
  try {
    for (const [name, config, expected] of [['legacy', manifest, 10], ['unlimited', parallel, 12]]) {
      let posts = 0, opened = 0;
      const session = createAdaptiveProviderSession({rootDir: root, manifest: config, run_id: name,
        runDirectory: sessionDirectory(parent, name), remaining: () => 5000, adapters: {jevConfig: {},
          openBudget: () => { opened++; if (name === 'unlimited' && opened === 1) throw Object.assign(new Error('BUDGET_LOCKED'), {code: 'BUDGET_LOCKED'});
            return {reserve: () => 'fixture-reservation', settle: () => {}, snapshot: () => ({}), close: () => {}}; },
          jevClientFactory: () => ({listModels: async () => ({models: [{name: 'jev-latest'}]}), listCredits: async () => ({}),
            decide: async () => { posts++; return {...answers, model: 'jev-1.13.0', usage: {input_tokens: 65536, output_tokens: 3}}; }})}});
      for (let index = 0; index < expected; index++) await session.decide('jev', request, {stage: 'split'});
      if (name === 'legacy') await assert.rejects(session.decide('jev', request, {stage: 'split'}), {code: 'ADAPTIVE_ARM_TOKEN_LIMIT'});
      else {
        assert.equal(session.receipts()[0].budget_lock_contentions, 1);
        assert.ok(session.receipts()[0].budget_lock_wait_ms > 0);
        assert.equal(session.receipts().reduce((sum, receipt) => sum + receipt.usage.input_tokens, 0), 786432);
      }
      assert.equal(posts, expected);
    }
    assert.equal(assertAdaptiveCohortCapacity({manifest: parallel, snapshot: unlimitedSnapshot}).required_input_tokens, null);
    for (const snapshot of [{...unlimitedSnapshot, unlimited: false}, {...unlimitedSnapshot, remaining_input_tokens: 0},
      {...unlimitedSnapshot, reservations_pending: 1}, {...unlimitedSnapshot, blocked_code: 'BUDGET_OUTSTANDING'}]) {
      assert.throws(() => assertAdaptiveCohortCapacity({manifest: parallel, snapshot}), {code: 'ADAPTIVE_COHORT_BUDGET_INSUFFICIENT'});
    }
    const invalid = join(parent, 'invalid.json');
    writeFileSync(invalid, JSON.stringify({...read(join(root, manifest.manifest_path)), limits: {...manifest.limits, planning_input_tokens: null}}));
    assert.throws(() => loadAdaptiveRunManifest(invalid, root), {code: 'ADAPTIVE_MANIFEST_INVALID'});
  } finally { cleanup(parent); }
});

async function reusableFixture(parent) {
  const preparationDirectory = join(parent, 'preparation'), local = isolatedManifest(parent);
  const prepared = await prepareAdaptiveSharedCatalog({rootDir: root, manifest: local, runDir: preparationDirectory, spend: true,
    adapters: {jevConfig: {}, preflight: async () => ({live_ready: true, status: 'ready'}), runCommand: async (_command, _args, options) => {
      const response = completion(fixtureCatalog()); options.onStdout(response.stdout); return response;
    }}});
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  const reuse = {...parallel.catalog_reuse, preparation_directory: relative(root, preparationDirectory),
    result_sha256: hash(join(preparationDirectory, 'result.json')), catalog_file_sha256: hash(join(preparationDirectory, 'catalog.json')),
    source_pins_sha256: hash(join(preparationDirectory, 'source-pins.json')),
    prepared_request_sha256: hash(join(preparationDirectory, 'catalog-preparation.json')),
    provider_request_sha256: hash(join(preparationDirectory, 'calls', `${prepared.receipts[0].id}.request.json`))};
  return {preparationDirectory, manifest: {...parallel, catalog_reuse: reuse}};
}

test('D068 dispatches only Jev-all and reuses the exact catalog without weakening generation or source checks', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d068-reuse-test-'));
  try {
    const config = loadAdaptiveRunManifest(join(root, 'benchmarks/e2e-swe/manifests/d068-adaptive.json'), root);
    const fixture = await reusableFixture(parent);
    const local = isolatedManifest(parent, {...config, catalog_reuse: {...fixture.manifest.catalog_reuse,
      schema_version: config.catalog_reuse.schema_version, allowed_changed_source_paths: config.catalog_reuse.allowed_changed_source_paths}});
    const args = {rootDir: root, manifest: local, preparationDirectory: fixture.preparationDirectory, input};
    assert.equal(loadAdaptiveSharedPreparation(args).compatibility.generation_prompt_schema_exact_match, true);
    assert.throws(() => loadAdaptiveSharedPreparation({...args, manifest: {...local, catalog_reuse: {...local.catalog_reuse,
      allowed_changed_source_paths: [...local.catalog_reuse.allowed_changed_source_paths, 'src/client.mjs']}}}),
    {code: 'ADAPTIVE_PREPARATION_REUSE_INVALID'});
    assert.throws(() => loadAdaptiveSharedPreparation({...args, input: {...input, requirement_descriptions:
      input.requirement_descriptions.map((item, index) => index ? item : {...item, text: item.text + ' Changed.'})}}),
    {code: 'ADAPTIVE_PREPARATION_REUSE_INPUT_DRIFT'});
    await assert.rejects(runAdaptiveArm({...args, runDir: join(parent, 'excluded'), arm: 'claude_all', spend: true}), {code: 'ADAPTIVE_ARM_INVALID'});
    const starts = [];
    const result = await runAdaptiveComparison({rootDir: root, manifest: local, preparationDirectory: fixture.preparationDirectory,
      runDir: join(parent, 'comparison'), spend: true, adapters: {preflight: async () => ({live_ready: true, status: 'ready'}),
        runArm: async ({arm}) => { starts.push(arm); return {arm, status: 'failed', outcome_uncertain: false, usage: null}; }}});
    assert.deepEqual(starts, ['jev_all']); assert.equal(result.completed_arms, 1);
    assert.equal(result.maximum_simultaneously_active_arms, 1); assert.equal(result.results[0].status, 'failed');
    assert.equal(result.status, 'failed'); assert.equal(result.failed_arm_count, 1); assert.equal(result.terminal_collection_complete, true);
    assert.equal(result.product_success, null); assert.equal(result.current_run_preparation_calls, 0);
  } finally { cleanup(parent); }
});

test('catalog reuse requires exact source-backed generation input and immutable historical snapshots', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d067-reuse-test-'));
  try {
    const fixture = await reusableFixture(parent), args = {rootDir: root, ...fixture, input};
    const reused = loadAdaptiveSharedPreparation(args);
    assert.equal(reused.reused, true); assert.equal(reused.compatibility.generation_request_exact_match, true);
    assert.equal(reused.compatibility.new_catalog_inference_calls, 0);
    assert.throws(() => loadAdaptiveSharedPreparation({...args, input: {...input,
      requirement_descriptions: input.requirement_descriptions.map((entry, index) => index ? entry : {...entry, text: entry.text + ' Changed.'})}}),
    {code: 'ADAPTIVE_PREPARATION_REUSE_INPUT_DRIFT'});
    assert.throws(() => loadAdaptiveSharedPreparation({...args, manifest: {...fixture.manifest,
      catalog_reuse: {...fixture.manifest.catalog_reuse, result_sha256: '0'.repeat(64)}}}), {code: 'ADAPTIVE_PREPARATION_REUSE_INVALID'});
    const pin = read(join(fixture.preparationDirectory, 'source-pins.json'))[0];
    writeFileSync(join(fixture.preparationDirectory, pin.snapshot), 'changed historical snapshot');
    assert.throws(() => loadAdaptiveSharedPreparation(args), {code: 'ADAPTIVE_PREPARATION_SOURCE_DRIFT'});
  } finally { cleanup(parent); }
});

test('parallel comparison starts four isolated arms and awaits all terminals despite uncertain and thrown outcomes', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d067-parallel-test-')), local = isolatedManifest(parent, parallel),
    starts = [], terminals = [], usage = adaptiveUsageSummary([{provider: 'claude', inference_started: true,
      usage: {input_tokens: 2, output_tokens: 3, cache_creation_input_tokens: 4, cache_read_input_tokens: 5}, api_equivalent_usd: 0.01}]);
  let release, probes = 0;
  const barrier = new Promise(resolve => { release = resolve; });
  try {
    const result = await runAdaptiveComparison({rootDir: root, manifest: local, runDir: join(parent, 'comparison'),
      preparationDirectory: parent, spend: true, adapters: {preflight: async () => { probes++; return {live_ready: true, status: 'ready'}; },
        runArm: async ({arm, runDir, adapters}) => {
          assert.equal(adapters.cohortPreflight.live_ready, true); mkdirSync(runDir); writeFileSync(join(runDir, 'identity.txt'), arm);
          starts.push(arm); if (starts.length === 4) release(); await barrier;
          if (arm === 'jev_split') throw Object.assign(new Error('FIXTURE_FAILURE'), {code: 'FIXTURE_FAILURE'});
          await new Promise(resolve => setTimeout(resolve, arm === 'jev_all' ? 30 : 10)); terminals.push(arm);
          return {arm, status: arm === 'jev_split_relations' ? 'uncertain' : 'completed', outcome_uncertain: arm === 'jev_split_relations',
            usage, shared_preparation_usage_full: usage, shared_preparation_wall_ms: 100};
        }}});
    assert.equal(probes, 1); assert.deepEqual(starts, parallel.arms); assert.equal(terminals.length, 3);
    assert.deepEqual(result.results.map(item => item.arm), parallel.arms);
    assert.equal(result.results[1].stop_code, 'FIXTURE_FAILURE'); assert.equal(result.completed_arms, 4);
    assert.equal(result.all_started_arms_terminal, true); assert.equal(result.status, 'uncertain');
    assert.equal(result.maximum_simultaneously_active_arms, 4); assert.ok(result.overlap.duration_by_active_arm_count_ms[4] > 0);
    assert.equal(result.current_run_preparation_calls, 0); assert.equal(result.usage_actual_once, null);
    assert.equal(result.historical_preparation_usage_reference.claude.calls, 1);
    const progress = read(join(parent, 'comparison/progress.json')); assert.equal(progress.active_arms.length, 0);
    assert.equal(progress.finished_arms.length, 4);
    for (const arm of parallel.arms) assert.equal(readFileSync(join(parent, 'comparison', arm, 'identity.txt'), 'utf8'), arm);
  } finally { cleanup(parent); }
});

test('arm terminal collection preserves a sibling pending reservation without converting a known arm failure to uncertainty', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d067-snapshot-test-'));
  let snapshots = 0;
  try {
    const fixture = await reusableFixture(parent);
    const result = await runAdaptiveArm({rootDir: root, ...fixture, runDir: join(parent, 'arm'), arm: 'claude_all', spend: true,
      adapters: {jevConfig: {}, cohortPreflight: {live_ready: true, status: 'ready'},
        openBudget: () => ({snapshot: () => (++snapshots === 1 ? unlimitedSnapshot : {...unlimitedSnapshot,
          reservations_pending: 1, blocked_code: 'BUDGET_OUTSTANDING'}), close: () => {}}),
        runCommand: async (_command, _args, options) => {
          const response = completion({answers: {unexpected: {type: 'choice', choice: 'invalid'}}});
          options.onStdout(response.stdout); return response;
        }}});
    assert.equal(result.status, 'failed', JSON.stringify(result)); assert.equal(result.outcome_uncertain, false);
    assert.equal(result.budget_after.reservations_pending, 1); assert.equal(result.budget_after.blocked_code, 'BUDGET_OUTSTANDING');
    assert.equal(result.settlement_status.status, 'pending');
    assert.equal(result.preparation_reused, true);
  } finally { cleanup(parent); }
});

test('known provider cause reaches arm result independently of its pending reservation', async () => {
  const parent = mkdtempSync(join(root, 'benchmark-runs/d068-terminal-test-'));
  let posts = 0, pending = 0, settlements = 0;
  try {
    const fixture = await reusableFixture(parent);
    const client = createJevClient({apiKey: 'fixture-key', fetchImpl: async (_url, options) => {
      assert.equal(options.method, 'POST'); posts++;
      return new Response(JSON.stringify({error: {code: 'context_length_exceeded'}}), {status: 400});
    }});
    const result = await runAdaptiveArm({rootDir: root, ...fixture, runDir: join(parent, 'arm'), arm: 'jev_all', spend: true,
      adapters: {jevConfig: {}, cohortPreflight: {live_ready: true, status: 'ready'},
        openBudget: () => ({snapshot: () => ({...unlimitedSnapshot, reservations_pending: pending,
          blocked_code: pending ? 'BUDGET_OUTSTANDING' : null}), reserve: () => { pending++; return 'fixture-reservation'; },
          settle: () => { settlements++; }, close: () => {}}),
        jevClientFactory: () => ({...client, listModels: async () => ({models: [{name: 'jev-latest'}]}), listCredits: async () => ({})})}});
    assert.equal(result.status, 'failed'); assert.equal(result.stop_code, 'HTTP_ERROR'); assert.equal(result.outcome_uncertain, false);
    assert.deepEqual(result.terminal_cause, {stage: 'split', code: 'HTTP_ERROR', http_status: 400, category: 'context_limit', outcome_uncertain: false});
    assert.equal(result.prior_public_failure, null); assert.equal(result.settlement_status.status, 'pending');
    assert.equal(result.settlement_status.reservations_pending, 1); assert.equal(result.usage.jev.api_equivalent_usd, null);
    assert.equal(result.automatic_retries, 0); assert.equal(result.replay_allowed, false); assert.equal(posts, 1); assert.equal(settlements, 0);
  } finally { cleanup(parent); }
});
