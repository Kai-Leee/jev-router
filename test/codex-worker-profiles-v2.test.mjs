import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildCodexWorkerOutcomes, summarizeWorkerOutcomes} from '../src/benchmark/codex-worker-outcomes.mjs';
import {codexPricingContract} from '../src/benchmark/codex-pricing.mjs';
import {codexWorkerProfileCandidates, eligibleCodexWorkerProfiles, buildCodexWorkerProfileRequest,
  validateCodexWorkerProfileRequest, createCodexWorkerProfileRouter} from '../src/benchmark/codex-worker-profiles-v2.mjs';
import {codexArguments} from '../src/benchmark/codex-provider.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
function fixture() {
  const price = codexPricingContract({version: 'v2'}), candidates = codexWorkerProfileCandidates({pricingContract: price});
  const environmentEvidence = {fingerprint: 'OFFLINE-D092-FIXTURE',
    models: price.models.map(row => ({model: row.model, supported_reasoning_efforts:
      ['low', 'medium', 'high', 'xhigh', 'max', ...(row.model === 'gpt-6-luna' ? [] : ['ultra'])]}))};
  environmentEvidence.allowed_profiles = candidates.filter(candidate => environmentEvidence.models.some(model =>
    model.model === candidate.model && model.supported_reasoning_efforts.includes(candidate.effort)));
  const task = {id: 'worker-A1', kind: 'implementation', requirement_ids: ['R1'], read_scope: [], write_scope: ['model.py'],
    input_artifact_ids: [], output_artifact_ids: ['A1']};
  const context = {operation: 'repair', round_index: 1, input_artifact_revisions: {}, repair_context: {failure: {
    code: 'PUBLIC_FAILED', public_evidence: [{check_id: 'public.serialize', evidence: {cases: [
      {test_id: 'T1', status: 'failed', message: 'typed map must serialize to plain values'}]}}]}}};
  const planning = {source_sha256: hash('public source fixture'), plan: {tasks: [task]},
    catalog: {units: [{id: 'U1', artifact_ids: ['A1'], requirement_ids: ['R1'], interface: 'Typed recursive serialization.'}]},
    requirement_descriptions: [{id: 'R1', text: 'Serialize nested typed values without changing write authority.'}]};
  const snapshot = buildCodexWorkerOutcomes({arms: [{id: 'empty-fixture', directory: '/private/tmp/D092-NONEXISTENT-HISTORY-FIXTURE'}],
    testRequirements: [{id: 'T1', requirement_ids: ['R1']}]});
  const observation = {model: 'gpt-6-luna', effort: 'low', operation: 'repair', requirement_ids: ['R1'],
    exact_scope_sha256: hash(JSON.stringify({operation: 'repair', paths: ['model.py'], requirements: ['R1']})),
    public_outcome: 'failure', noop: true, later_repair: true, repeat_input: false, model_identity_verified: null,
    public_cases: [{test_id: 'T1', before: 'failed', after: 'failed'}],
    transitions: {failed_to_passed: 0, failed_to_failed: 1, passed_to_failed: 0, unknown_after: 0},
    wall_ms: 1200, input_tokens: 200, output_tokens: 40};
  snapshot.observations.push(observation);
  snapshot.profiles = [{model: observation.model, effort: observation.effort, ...summarizeWorkerOutcomes([observation])}];
  const {sha256: _old, ...body} = snapshot; snapshot.sha256 = hash(JSON.stringify(body));
  const saved = new Map(), records = [], calls = [];
  const args = {planning, environmentEvidence, pricingContract: price, empiricalEvidence: snapshot,
    expectedEmpiricalSha256: snapshot.sha256,
    save: async (path, value) => saved.set(path, structuredClone(value)), record: async event => records.push(event),
    decide: async (request, metadata) => {calls.push({request, metadata}); return {answers: {worker_profile: {type: 'choice', choice: 'gpt-6.1-sol-ultra'}}};}};
  return {price, environmentEvidence, task, context, planning, snapshot, saved, records, calls, args};
}

test('registered model x offered effort yields 23 candidates, includes app ultra, and shares model/statistic originals inline', () => {
  const f = fixture();
  assert.equal(codexWorkerProfileCandidates({pricingContract: f.price}).length, 24);
  const catalog = eligibleCodexWorkerProfiles({environmentEvidence: f.environmentEvidence, pricingContract: f.price});
  assert.equal(catalog.profiles.length, 23);
  assert(!catalog.profiles.some(row => row.model === 'gpt-6-luna' && row.effort === 'ultra'));
  assert(catalog.profiles.some(row => row.model === 'gpt-6.1-sol' && row.effort === 'ultra' && !row.effort_documented_in_pricing_snapshot));
  const {request} = buildCodexWorkerProfileRequest({planning: f.planning, task: f.task, context: f.context,
    catalog, empiricalEvidence: f.snapshot, expectedEmpiricalSha256: f.snapshot.sha256});
  assert.equal(request.state.models.length, 4);
  assert.equal(request.state.candidates.length, 23);
  assert(request.state.candidates.every(row => Object.keys(row).sort().join(',') === 'effort,id,model'));
  const empirical = request.state.empirical_evidence;
  assert.equal(empirical.encoding, 'inline-statistics-pool/v1');
  assert(empirical.statistics.length < 23);
  const luna = empirical.profiles.find(row => row.model === 'gpt-6-luna' && row.effort === 'low');
  const stats = empirical.statistics.find(row => row.id === luna.exact_scope_ref).value;
  assert.equal(stats.public_success.failure, 1); assert.equal(stats.public_success.denominator, 1);
  assert.equal(stats.noop.count, 1); assert.equal(stats.rework.count, 1);
  const absent = empirical.profiles.find(row => row.model === 'gpt-6-sol' && row.effort === 'medium');
  assert.equal(empirical.statistics.find(row => row.id === absent.global_ref).value.public_success.rate, null);
  assert.equal(validateCodexWorkerProfileRequest(request, {empiricalEvidence: f.snapshot, expectedEmpiricalSha256: f.snapshot.sha256}).valid, true);
});

test('typed model-plus-effort selection is durable and matches actual CLI args; substituted effort or task cannot execute', async () => {
  const f = fixture(), router = createCodexWorkerProfileRouter(f.args), selection = await router.select(f.task, f.context);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].metadata.profile_kind, 'codex-worker-v2');
  assert.equal(selection.model, 'gpt-6.1-sol'); assert.equal(selection.effort, 'ultra');
  assert(f.saved.has(`${selection.audit_directory}/request.json`)); assert(f.saved.has(`${selection.audit_directory}/response.json`));
  assert(f.saved.has(`${selection.audit_directory}/selection.json`));
  assert.equal(router.assertExecution(selection, {model: selection.model, effort: selection.effort, task: f.task, context: f.context}).verified, true);
  const args = codexArguments({model: selection.model, effort: selection.effort, role: 'decision', cwd: '/tmp', schemaPath: '/tmp/schema', answerPath: '/tmp/answer'});
  assert.equal(args[args.indexOf('--model') + 1], 'gpt-6.1-sol'); assert(args.includes('model_reasoning_effort="ultra"'));
  assert.throws(() => router.assertExecution(selection, {model: selection.model, effort: 'high', task: f.task, context: f.context}),
    {code: 'CODEX_WORKER_PROFILE_V2_EXECUTION_MISMATCH'});
  assert.throws(() => router.assertExecution(selection, {model: selection.model, effort: selection.effort,
    task: {...f.task, write_scope: ['other.py']}, context: f.context}), {code: 'CODEX_WORKER_PROFILE_TASK_SCOPE_INVALID'});
  const low = createCodexWorkerProfileRouter({...f.args, decide: async () => ({answers: {worker_profile: {type: 'choice', choice: 'gpt-6-luna-low'}}})});
  assert.equal((await low.select(f.task, f.context)).effort, 'low');
  const unavailable = createCodexWorkerProfileRouter({...f.args, decide: async () => ({answers: {worker_profile: {type: 'choice', choice: 'gpt-6-luna-ultra'}}})});
  await assert.rejects(unavailable.select(f.task, f.context), {code: 'CODEX_WORKER_PROFILE_V2_NOT_REGISTERED'});
});

test('trusted history re-projection rejects altered/resealed rates, bad evidence SHA and candidate/effort tampering before transport', () => {
  const f = fixture(), catalog = eligibleCodexWorkerProfiles({environmentEvidence: f.environmentEvidence, pricingContract: f.price});
  const {request} = buildCodexWorkerProfileRequest({planning: f.planning, task: f.task, context: f.context,
    catalog, empiricalEvidence: f.snapshot});
  const altered = structuredClone(request), empirical = altered.state.empirical_evidence;
  empirical.statistics.find(row => row.value.public_success.failure > 0).value.public_success.rate = 1;
  const {transport_sha256: _seal, ...body} = empirical; empirical.transport_sha256 = digest(body);
  assert.throws(() => validateCodexWorkerProfileRequest(altered, {empiricalEvidence: f.snapshot}), {code: 'CODEX_WORKER_EMPIRICAL_BINDING'});
  const badSha = structuredClone(request); badSha.state.binding.empirical_snapshot_sha256 = hash('other');
  assert.throws(() => validateCodexWorkerProfileRequest(badSha, {empiricalEvidence: f.snapshot}), {code: 'CODEX_WORKER_PROFILE_V2_REQUEST_INVALID'});
  const badEffort = structuredClone(request); badEffort.state.candidates[0].effort = 'none';
  assert.throws(() => validateCodexWorkerProfileRequest(badEffort, {empiricalEvidence: f.snapshot}), {code: 'CODEX_WORKER_PROFILE_V2_REQUEST_INVALID'});
  assert.throws(() => validateCodexWorkerProfileRequest(request), {code: 'CODEX_WORKER_HISTORY_INVALID'});
});
