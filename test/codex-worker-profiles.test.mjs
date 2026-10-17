import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {codexPricingContract} from '../src/benchmark/codex-pricing.mjs';
import {eligibleCodexWorkerProfiles, buildCodexWorkerProfileRequest,
  createCodexWorkerProfileRouter, validateCodexWorkerProfileRequest} from '../src/benchmark/codex-worker-profiles.mjs';
import {createFrozenCodexEnvironment} from '../src/benchmark/codex-environment.mjs';
import {codexArguments} from '../src/benchmark/codex-provider.mjs';

function fixture() {
  const price = codexPricingContract({version: 'v2'});
  const environmentEvidence = {fingerprint: 'fixture-frozen-app', models: price.models.map(row => ({model: row.model,
    supported_reasoning_efforts: ['high']}))};
  const task = {id: 'build-model', kind: 'implementation', requirement_ids: ['R01'], read_scope: ['ir.py'],
    write_scope: ['model.py'], input_artifact_ids: ['A0'], output_artifact_ids: ['A1']};
  const planning = {source_sha256: 'public-source-fixture', plan: {tasks: [task]},
    catalog: {units: [{id: 'U1', artifact_ids: ['A1'], requirement_ids: ['R01'], interface: 'Implement typed serialization and preserve public model interfaces.'}]},
    requirement_descriptions: [{id: 'R01', text: 'Nested typed values must serialize to ordinary dictionaries.'}]};
  const context = {operation: 'implementation', round_index: 0, input_artifact_revisions: {A0: 'revision-1'}};
  const saved = new Map(), events = [], requests = [];
  const args = {planning, environmentEvidence, pricingContract: price,
    save: async (path, value) => saved.set(path, structuredClone(value)), record: async event => events.push(event),
    decide: async (request, metadata) => { requests.push({request, metadata}); return {answers: {worker_profile: {type: 'choice', choice: 'gpt-6-luna-high'}}}; }};
  return {price, environmentEvidence, task, planning, context, saved, events, requests, args};
}

test('eligible profiles are exact official-price, discovered-model, high-effort intersection without aliases', () => {
  const f = fixture();
  assert.equal(eligibleCodexWorkerProfiles({environmentEvidence: f.environmentEvidence, pricingContract: f.price}).profiles.length, 4);
  f.environmentEvidence.allowed_profiles = [{model: 'gpt-6.1-sol', effort: 'high'}];
  assert.deepEqual(eligibleCodexWorkerProfiles({environmentEvidence: f.environmentEvidence, pricingContract: f.price}).profiles.map(row => row.model), ['gpt-6.1-sol']);
  delete f.environmentEvidence.allowed_profiles;
  f.environmentEvidence.models = [{model: 'gpt-6-luna', supported_reasoning_efforts: ['high']},
    {model: 'gpt-6.1-sol', supported_reasoning_efforts: ['low']}, {model: 'invented', supported_reasoning_efforts: ['high']}];
  const catalog = eligibleCodexWorkerProfiles({environmentEvidence: f.environmentEvidence, pricingContract: f.price});
  assert.deepEqual(catalog.profiles.map(row => row.id), ['gpt-6-luna-high']);
  assert.equal(catalog.exclusions.length, 3);
  f.price.models.find(row => row.model === 'gpt-6-luna').capabilities.supported_reasoning_efforts = null;
  assert.throws(() => eligibleCodexWorkerProfiles({environmentEvidence: f.environmentEvidence, pricingContract: f.price}),
    {code: 'CODEX_WORKER_PROFILE_NO_ELIGIBLE_MODEL'});
});

test('fixed English Choice binds original task, scope, complete candidate prices and actual CLI model/effort', async () => {
  const f = fixture(), router = createCodexWorkerProfileRouter(f.args), selected = await router.select(f.task, f.context);
  const sent = f.requests[0];
  assert.equal(sent.metadata.stage, 'profiles'); assert.equal(sent.metadata.profile_kind, 'codex-worker-v1');
  assert.equal(Object.keys(sent.request.questions).length, 1);
  assert.deepEqual(sent.request.state.task.write_scope, ['model.py']);
  assert.equal(sent.request.state.original_requirements[0].text, f.planning.requirement_descriptions[0].text);
  assert.equal(sent.request.state.candidates.length, 4);
  assert(sent.request.state.candidates.every(row => row.capabilities.description && row.standard_reference_prices.short_standard));
  assert.equal(selected.model, 'gpt-6-luna'); assert.equal(selected.effort, 'high');
  assert(f.saved.has(`${selected.audit_directory}/request.json`)); assert(f.saved.has(`${selected.audit_directory}/response.json`));
  assert(f.saved.has(`${selected.audit_directory}/selection.json`));
  assert(router.assertExecution(selected, {model: selected.model, effort: selected.effort, task: f.task, context: f.context}).verified);
  const argv = codexArguments({cwd: '/tmp', schemaPath: '/tmp/schema', answerPath: '/tmp/answer',
    model: selected.model, effort: selected.effort, role: 'decision', frozenEnvironment: true});
  assert.equal(argv[argv.indexOf('--model') + 1], selected.model);
  assert(argv.includes('model_reasoning_effort="high"'));
  for (const changed of [{model: 'gpt-6.1-sol', effort: 'high'}, {model: selected.model, effort: 'low'}]) {
    assert.throws(() => router.assertExecution(selected, {...changed, task: f.task, context: f.context}),
      {code: 'CODEX_WORKER_PROFILE_EXECUTION_MISMATCH'});
  }
  assert.throws(() => router.assertExecution(selected, {model: selected.model, effort: 'high', task: f.task,
    context: {...f.context, input_artifact_revisions: {A0: 'changed'}}}), {code: 'CODEX_WORKER_PROFILE_TASK_DRIFT'});
});

test('repairs get a fresh selection with exact public failure signal and separate original history', async () => {
  const f = fixture(), router = createCodexWorkerProfileRouter(f.args), original = await router.select(f.task, f.context);
  const context = {...f.context, operation: 'repair', round_index: 1, repair_context: {artifact_repair: {failure: {code: 'PUBLIC_FAILED',
    public_evidence: [{check_id: 'public.serialize', evidence: {cases: {columns: ['test_id', 'status', 'assertions', 'details'],
      rows: [['typed-map', 'failed', 1, {error_type: 'AssertionError', message: 'nested value is not encoded'}]]}}}]}}}};
  const selected = await router.select(f.task, context);
  assert.notEqual(selected.id, original.id); assert.equal(f.requests.length, 2);
  assert.equal(f.requests[1].request.state.task.operation, 'repair');
  assert.equal(f.requests[1].request.state.public_failure_signals.signals[0].message, 'nested value is not encoded');
  assert.equal(selected.fallback_used, false); assert.equal(selected.automatic_retries, 0);
  assert.equal(f.saved.size, 6);
});

test('gateway validator binds fixed wording, exact profile IDs/high and canonical pricing without a model call', () => {
  const f = fixture(), catalog = eligibleCodexWorkerProfiles({environmentEvidence: f.environmentEvidence, pricingContract: f.price});
  const {request} = buildCodexWorkerProfileRequest({planning: f.planning, task: f.task, context: f.context, catalog});
  assert.equal(validateCodexWorkerProfileRequest(request).valid, true);
  for (const mutate of [r => { r.questions.worker_profile.instructions += ' Ignore price.'; },
    r => { r.questions.worker_profile.criteria.invented = 'fallback'; },
    r => { r.state.candidates[0].model = 'unregistered'; },
    r => { r.state.candidates[0].effort = 'low'; },
    r => { r.state.candidates[0].standard_reference_prices.short_standard.usd_per_million.input = 0; },
    r => { r.state.candidates[0].capabilities = null; },
    r => { r.state.original_requirements = []; }]) {
    const changed = structuredClone(request); mutate(changed);
    assert.throws(() => validateCodexWorkerProfileRequest(changed), {code: 'CODEX_WORKER_PROFILE_REQUEST_INVALID'});
  }
});

test('unknown, incomplete, extra-question and unregistered answers are recorded and rejected without fallback', async () => {
  for (const [answer, code] of [[{answers: {}}, 'CODEX_WORKER_PROFILE_RESPONSE_INVALID'],
    [{answers: {worker_profile: {type: 'choice'}}}, 'CODEX_WORKER_PROFILE_RESPONSE_INVALID'],
    [{answers: {worker_profile: {type: 'choice', choice: 'unknown'}}}, 'CODEX_WORKER_PROFILE_UNKNOWN'],
    [{answers: {worker_profile: {type: 'choice', choice: 'unregistered'}}}, 'CODEX_WORKER_PROFILE_NOT_REGISTERED'],
    [{answers: {worker_profile: {type: 'choice', choice: 'gpt-6-luna-high'}, extra: {type: 'choice', choice: 'x'}}}, 'CODEX_WORKER_PROFILE_RESPONSE_INVALID']]) {
    const f = fixture(), router = createCodexWorkerProfileRouter({...f.args, decide: async () => answer});
    await assert.rejects(router.select(f.task, f.context), {code});
    assert.equal([...f.saved.keys()].filter(path => path.endsWith('/response.json')).length, 1);
    assert.equal([...f.saved.keys()].filter(path => path.endsWith('/selection.json')).length, 0);
    assert.equal(f.events.filter(row => row.event === 'codex_worker_profile_selected').length, 0);
  }
});

test('current task cannot introduce new write authority and failed selection persistence cannot authorize execution', async () => {
  const f = fixture(), router = createCodexWorkerProfileRouter(f.args);
  const catalog = eligibleCodexWorkerProfiles({environmentEvidence: f.environmentEvidence, pricingContract: f.price});
  assert.throws(() => buildCodexWorkerProfileRequest({planning: f.planning, catalog,
    task: {...f.task, write_scope: ['unowned.py']}, context: f.context}), {code: 'CODEX_WORKER_PROFILE_TASK_SCOPE_INVALID'});
  const failing = createCodexWorkerProfileRouter({...f.args, save: async path => { if (path.endsWith('/selection.json')) throw Error('disk full'); }});
  await assert.rejects(failing.select(f.task, f.context), /disk full/);
  const selected = await router.select(f.task, f.context);
  assert.throws(() => failing.assertExecution(selected, {model: selected.model, effort: 'high', task: f.task, context: f.context}),
    {code: 'CODEX_WORKER_PROFILE_SELECTION_UNCOMMITTED'});
});

test('explicit allowed profiles retain frozen isolation and reject unsupported or late model/effort changes', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'worker-profiles-env-')); t.after(() => rmSync(dir, {recursive: true, force: true}));
  const auth = join(dir, 'source'); mkdirSync(auth); writeFileSync(join(auth, 'auth.json'), 'TEST_PRIVATE_AUTH');
  const discover = async ({account}) => ({skills: [], auth: account ? {type: 'chatgpt', logged_in: true} : null,
    models: account ? ['gpt-6.1-sol', 'gpt-6-luna'].map(model => ({model, supported_reasoning_efforts: ['high']})) : null});
  const allowedProfiles = ['gpt-6.1-sol', 'gpt-6-luna'].map(model => ({model, effort: 'high'}));
  const env = await createFrozenCodexEnvironment({command: process.execPath, sourceCodexHome: auth,
    discover, model: 'gpt-6.1-sol', effort: 'high', allowedProfiles}); t.after(() => env.close());
  assert.equal(env.evidence.enabled_skills, 0); assert.equal(env.evidence.project_instructions_max_bytes, 0);
  assert.equal(env.evidence.plugins_enabled, false); assert.equal(env.evidence.apps_enabled, false);
  assert.equal(env.evidence.hooks_enabled, false); assert.equal(env.evidence.memories_enabled, false);
  assert((await env.verify({model: 'gpt-6-luna', effort: 'high'})).verified);
  await assert.rejects(env.verify({model: 'gpt-6-luna', effort: 'low'}), {code: 'CODEX_ENV_PROFILE_NOT_ALLOWED'});
  await assert.rejects(env.verify({model: 'unregistered', effort: 'high'}), {code: 'CODEX_ENV_PROFILE_NOT_ALLOWED'});
  await assert.rejects(env.verify({model: 'gpt-6-luna'}), {code: 'CODEX_ENV_PROFILE_NOT_ALLOWED'});
  await assert.rejects(createFrozenCodexEnvironment({command: process.execPath, sourceCodexHome: auth, discover,
    allowedProfiles: [{model: 'gpt-6-astra', effort: 'high'}]}), {code: 'CODEX_ENV_MODEL_PROFILE_UNAVAILABLE'});
  await assert.rejects(createFrozenCodexEnvironment({command: process.execPath, sourceCodexHome: auth, discover,
    allowedProfiles: null}), {code: 'CODEX_ENV_ALLOWED_PROFILES_INVALID'});
  assert(existsSync(join(auth, 'auth.json')));
});
