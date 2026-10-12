import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadAdaptiveProfileContract, resolveAdaptiveProfile, buildAdaptiveProfileRequest, buildAdaptiveProfileRequests,
  selectAdaptiveProfiles, applyAdaptiveProfileSelections, projectAdaptiveProfileEvidence} from '../src/orchestration/adaptive-profile-selection.mjs';
import {buildAdaptiveCausalRepairScope} from '../src/orchestration/adaptive-causal-repair.mjs';
import {inferAdaptiveRepairOwners, applyInferredRepairOwners} from '../src/orchestration/adaptive-inferred-repair.mjs';

function fixture(count = 2) {
  const clauses = Array.from({length: count}, (_, index) => index === 0 ? 'Parse the public request without losing its description.'
    : index === 1 ? 'Render the parsed request description unchanged.' : `Preserve the public description in component ${index}.`);
  const source = clauses.join('\n'), paths = clauses.map((_, index) => index === 0 ? 'src/parser.py' : index === 1 ? 'src/render.py' : `src/component${index}.py`);
  const requirements = clauses.map((text, index) => ({id: `R${index}`, text, source_refs: [`public:clause-${index}`]}));
  const duration = () => ({basis: 'unknown', estimate_ms: null, sample_count: 0, source_refs: []});
  const check = (name, phase, artifacts, reqs) => ({id: name, version: 'fixture-v1', phase,
    artifact_ids: artifacts, requirement_ids: reqs, runner_ref: 'public-fixture', argv: ['fixture', name],
    cwd: 'src', environment_ref: 'fixture-env', source_ref: 'test/adaptive-profile-selection.test.mjs'});
  const artifactIds = clauses.map((_, index) => `A${index}`), requirementIds = requirements.map(row => row.id);
  const checks = [...clauses.map((_, index) => check(`local${index}`, 'local', [`A${index}`], [`R${index}`])),
    check('public', 'integration', artifactIds, requirementIds)];
  return {cli_version: '2.1.293', requirement_descriptions: requirements,
    catalog: {schema_version: 'adaptive-catalog/v1', source_sha256: createHash('sha256').update(source).digest('hex'),
      evidence: clauses.map((quote, index) => ({id: `E${index}`, quote})),
      units: clauses.map((_, index) => ({id: `U${index}`, title: index ? 'Renderer' : 'Parser',
        requirement_ids: [`R${index}`], artifact_ids: [`A${index}`],
        interface: index ? 'render consumes parser.Request.description and preserves exact wording.' : 'parser.Request.description stores the public request description.', evidence_ids: [`E${index}`]})),
      artifacts: paths.map((path, index) => ({id: `A${index}`, paths: [path], description: clauses[index], evidence_ids: [`E${index}`]}))},
    plan: {schema_version: 'artifact-dag/v1', goal_revision: 'fixture-goal', graph_revision: 'fixture-graph',
      requirement_ids: requirementIds, worker_limit: 30, max_concurrency: 2,
      workers: clauses.map((_, index) => ({id: `w${index}`, profile_id: 'fixed-opus-medium'})),
      tasks: paths.map((path, index) => ({id: `t${index}`, kind: 'implementation', parent_id: null,
        requirement_ids: [`R${index}`], input_artifact_ids: index ? ['A0'] : [], output_artifact_ids: [`A${index}`],
        check_ids: [`local${index}`], worker_id: `w${index}`, read_scope: index ? [paths[0]] : [], write_scope: [path], duration: duration()}))
        .concat([{id: 'verify', kind: 'verification', parent_id: null, requirement_ids: requirementIds,
          input_artifact_ids: artifactIds, output_artifact_ids: [], check_ids: ['public'], worker_id: null,
          read_scope: paths, write_scope: [], duration: duration()}]),
      artifacts: artifactIds.map((id, index) => ({id, producer_task_id: `t${index}`})), checks, unknown_relationships: []}};
}
const response = (request, choices = ['claude_haiku55_low', 'claude_opus55_high']) => ({answers: Object.fromEntries(
  Object.keys(request.questions).map((key, index) => [key, {type: 'choice', choice: choices[index]}]))});

test('owner inference to profile selection keeps sealed controller context off the wire without changing repair evidence or authority', async () => {
  const input = fixture(), copy = structuredClone;
  const hash = value => createHash('sha256').update(value).digest('hex');
  const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  const digest = value => hash(JSON.stringify(canonical(value)));
  const planning = {plan: input.plan, catalog: input.catalog, source_sha256: input.catalog.source_sha256,
    catalog_sha256: hash(JSON.stringify(input.catalog)), requirement_descriptions: input.requirement_descriptions};
  const artifactBindings = Object.fromEntries(input.catalog.artifacts.map(row => [row.id, {paths: row.paths}]));
  const check = input.plan.checks.find(row => row.phase === 'integration');
  const contract = {schema_version: 'public-assertion-contract/v1', version: '2', assertions: [{id: 'A.description',
    check_id: check.id, test_id: 'T.description', requirement_ids: ['R1'], artifact_paths: ['src/render.py'],
    causal_paths: [{path: 'src/parser.py', role: 'producer', rationale: 'Produces the request description.'},
      {path: 'src/render.py', role: 'renderer', rationale: 'Renders the request description.'}]}]};
  const source_text = JSON.stringify(contract), assertionContract = {contract, source_text, source_path: 'public/assertions.json', sha256: hash(source_text)};
  const environment = {id: check.environment_ref, fingerprint: hash('environment')};
  const runtimeBinding = {schema_version: 'dag-filesystem-binding/v1', plan: input.plan, environment,
    artifact_bindings: artifactBindings, checker_manifest: [{path: assertionContract.source_path, sha256: assertionContract.sha256}]};
  runtimeBinding.plan_hash = digest(input.plan);
  runtimeBinding.binding_digest = digest({pinManifest: runtimeBinding.checker_manifest, environment,
    plan_hash: runtimeBinding.plan_hash, artifact_bindings: artifactBindings});
  const revisions = Object.fromEntries(input.plan.artifacts.map(row => [row.id, hash(row.id)]));
  const testcase = {test_id: 'T.description', status: 'failed', assertions: 1, error_type: 'AssertionError',
    message: 'Exact request description is missing.', failed_assertion_id: 'A.description',
    assertion_results: [{assertion_id: 'A.description', status: 'failed'}, {assertion_id: 'A.future', status: 'not_reached'}],
    unknown_semantic: {keep: 'literal'}};
  const item = {check_id: check.id, check_version: check.version, environment_ref: check.environment_ref,
    status: 'failed', executed: true, exit_code: 1, assertions: 1, skipped: 0, outcome_uncertain: false,
    artifact_revisions: copy(revisions), runtime_binding: {binding_digest: runtimeBinding.binding_digest,
      checker_manifest_sha256: digest(runtimeBinding.checker_manifest), plan_hash: runtimeBinding.plan_hash,
      environment_fingerprint: environment.fingerprint}, evidence: {check_id: check.id, check_version: check.version,
      environment_ref: check.environment_ref, outcome_uncertain: false, assertion_contract_sha256: assertionContract.sha256,
      cases: [testcase], unexecuted_test_ids: [], error: null}};
  item.evidence_key = digest({check_id: item.check_id, check_version: item.check_version,
    artifact_revisions: item.artifact_revisions, runtime_binding: item.runtime_binding});
  const failure = {status: 'failed', code: 'ARTIFACT_CHECK_NOT_PASSED', outcome_uncertain: false, failed_task_ids: [],
    round_index: 0, source_sha256: planning.source_sha256, catalog_sha256: planning.catalog_sha256,
    graph_revision: input.plan.graph_revision, binding_digest: runtimeBinding.binding_digest, environment,
    artifact_revisions: revisions, local_evidence: [], public_evidence: [item]};
  const ownerInput = {planning, plan: input.plan, failure, artifactBindings, assertionContract, runtimeBinding,
    publicChecks: [check], testRequirements: {'T.description': ['R1']}, sourceFiles: [],
    ownerInputPolicy: 'inferred-v2', repairInputPolicy: 'evidence-v1', repairInputContext: {assertionContract, runtimeBinding}};
  const scope = await buildAdaptiveCausalRepairScope(ownerInput); failure.repair_scope = scope.analysis;
  ownerInput.candidates = scope.candidates;
  const inference = await inferAdaptiveRepairOwners({...ownerInput,
    decide: async request => response(request, Object.keys(request.questions).map(() => 'A0'))});
  assert.equal(inference.status, 'inferred');
  const applied = applyInferredRepairOwners({...ownerInput, inference});
  const selected_action = applied.candidates.find(row => row.id === 'repair-inferred-owners');
  const currentFailure = {...failure, repair_scope: applied.analysis}, original = copy(currentFailure);
  const controllerContext = currentFailure.repair_scope.inferred_ownership.repair_input_context;
  assert.deepEqual(controllerContext, ownerInput.repairInputContext);
  const profileInput = {...input, phase: 'repair', round_index: 1, task_ids: selected_action.task_ids,
    selected_action, failure: currentFailure, profilePolicy: 'provider-limits-v2'};
  const built = buildAdaptiveProfileRequest(profileInput);
  assert.equal(Object.hasOwn(built.request.state.observed_public_failure.repair_scope.inferred_ownership, 'repair_input_context'), false);
  assert.deepEqual(built.request.state.observed_public_failure.public_evidence[0].evidence.cases, [testcase]);
  const withoutContext = copy(currentFailure); delete withoutContext.repair_scope.inferred_ownership.repair_input_context;
  const baseline = buildAdaptiveProfileRequest({...profileInput, failure: withoutContext});
  assert.deepEqual(built.request.questions, baseline.request.questions);
  const state = copy(built.request.state); state.context_ref = baseline.request.state.context_ref;
  assert.deepEqual(state, baseline.request.state);
  const omission = built.metadata.projection_report.evidence.omitted_metadata.find(row =>
    row.pointer === '/failure/repair_scope/inferred_ownership/repair_input_context');
  assert.equal(omission.sha256, hash(JSON.stringify(controllerContext)));
  assert.equal(omission.utf8_bytes, Buffer.byteLength(JSON.stringify(controllerContext)));
  assert.equal(built.metadata.projection_report.evidence.context_ref.sha256,
    hash(JSON.stringify({failure: currentFailure, prior_usage: null})));
  let calls = 0;
  const selection = await selectAdaptiveProfiles({...profileInput, decide: async request => {
    calls++; assert.deepEqual(request, built.request); return response(request, ['claude_sonnet55_medium']);
  }, commit: async () => {}});
  assert.equal(calls, 1); assert.equal(selection.status, 'selected');
  assert.deepEqual(currentFailure, original);
});

test('documented model/effort and tiered price candidates require explicit supported CLI/allowlist evidence', () => {
  const loaded = loadAdaptiveProfileContract();
  assert.equal(loaded.catalog.profiles.length, 20);
  assert.deepEqual(loaded.catalog.models.map(row => row.id), ['opus55', 'sonnet55', 'haiku55', 'fable51']);
  for (const model of loaded.catalog.models) {
    assert.equal(model.current_account_availability, 'unverified');
    assert.equal(model.measured_task_performance, null);
    assert.equal(model.price.actual_billed_usd, null);
  }
  const haiku = resolveAdaptiveProfile('claude_haiku55_low', {cli_version: '2.1.293'});
  assert.deepEqual(haiku.price.prompt_tiers.map(row => [row.min_prompt_tokens, row.max_prompt_tokens, row.rates.input]),
    [[0, 100000, 0.1], [100001, null, 0.5]]);
  assert.equal(haiku.provenance.effective_effort_verified, null);
  assert.equal(resolveAdaptiveProfile('claude_fable51_high', {cli_version: '2.1.293'}).price.prompt_tiers[0].rates.cache_read, 0.25);
  const input = fixture(), built = buildAdaptiveProfileRequest(input);
  assert.equal(Object.keys(built.request.questions).length, 2);
  assert.equal(Object.keys(Object.values(built.request.questions)[0].criteria).length, 21);
  assert.equal(built.request.state.tasks[0].workload.duration.estimate_ms, null);
  assert.deepEqual(built.request.state.tasks[0].dependency_role.direct_consumer_task_ids, ['t1']);
  assert.deepEqual(built.request.state.requirements, input.requirement_descriptions);
  assert.deepEqual(built.request.state.evidence, input.catalog.evidence);
  assert.deepEqual(built.request.state.models.map(model => ({...built.request.state.model_defaults, ...model,
    price: {...built.request.state.price_defaults, ...model.price}})), loaded.catalog.models);
  for (const profile of built.request.state.profiles) assert.equal(
    built.request.state.models.find(model => model.id === profile.family_id).model,
    loaded.catalog.profiles.find(row => row.id === profile.id).model);
  assert.equal(built.request.state.context_ref.retrieval_available_to_model, false);
  assert.equal(createHash('sha256').update(JSON.stringify(built.metadata.projection_report.controller_context_binding)).digest('hex'),
    built.request.state.context_ref.sha256);
  const questions = Object.values(built.request.questions);
  assert.notEqual(questions[0].instructions, questions[1].instructions);
  for (const [index, question] of questions.entries()) {
    assert.ok(question.instructions.includes(`For task "t${index}" assigned to worker "w${index}"`));
    assert.ok(question.instructions.includes(JSON.stringify([`A${index}`])));
    assert.ok(question.instructions.includes(JSON.stringify(input.plan.tasks[index].write_scope)));
    assert.equal(question.instructions.includes('{{'), false);
  }
  for (const options of [{cli_version: '2.1.284'}, {cli_version: undefined}, {allowed_profile_ids: ['unverified-model']},
    {allowed_profile_ids: ['claude_haiku55_low', 'claude_haiku55_low']}]) {
    assert.throws(() => buildAdaptiveProfileRequest({...input, ...options}), error => /^ADAPTIVE_PROFILE_(?:CLI_UNSUPPORTED|ALLOWLIST_INVALID)$/.test(error.code));
  }
  assert.equal(buildAdaptiveProfileRequest({...input, cli_version: '2.1.284', allowed_profile_ids: ['claude_opus55_medium']})
    .metadata.allowed_profile_ids.length, 1);
});

test('a typed choice batch selects distinct model/effort values; immutable application preserves every DAG obligation', async () => {
  const input = fixture(), before = structuredClone(input), events = [], commits = [];
  let calls = 0;
  const selected = await selectAdaptiveProfiles({...input, decide: async (request, metadata) => {
    calls++; assert.equal(metadata.stage, 'profiles'); return response(request);
  }, record: async event => events.push(event), commit: async result => commits.push(result)});
  assert.equal(calls, 1); assert.equal(commits.length, 1);
  assert.equal(selected.status, 'selected'); assert.equal(selected.dispatch_allowed, true);
  assert.deepEqual(selected.selections.map(row => [row.profile_id, row.model, row.effort]),
    [['claude_haiku55_low', 'claude-haiku-5-5', 'low'], ['claude_opus55_high', 'claude-opus-5-5', 'high']]);
  assert.equal(events.filter(event => event.event === 'adaptive_profile_selected').length, 2);
  const applied = applyAdaptiveProfileSelections({plan: input.plan, selection: selected});
  assert.equal(applied.dispatch_allowed, true);
  assert.deepEqual(applied.plan.workers.map(worker => worker.profile_id), ['claude_haiku55_low', 'claude_opus55_high']);
  assert.deepEqual({...applied.plan, workers: input.plan.workers}, input.plan);
  assert.deepEqual(input, before);
  const uncommitted = await selectAdaptiveProfiles({...input, decide: async request => response(request)});
  assert.equal(uncommitted.dispatch_allowed, false);
  assert.equal(applyAdaptiveProfileSelections({plan: input.plan, selection: uncommitted}).dispatch_allowed, false);
});

test('partial, unknown, stopped and uncertain batches never yield partial assignments or implicit retry', async () => {
  for (const malformed of [
    request => { const value = response(request); delete value.answers[Object.keys(request.questions)[1]]; return value; },
    request => response(request, ['unknown', 'claude_opus55_high']),
    request => response(request, ['claude_haiku55_low', 'stop']),
    request => { const value = response(request); value.answers[Object.keys(request.questions)[0]].type = 'score'; return value; },
    () => ({status: 'uncertain'}),
    () => { throw Object.assign(new Error('known failure'), {code: 'HTTP_ERROR', status: 400, outcome_uncertain: false}); },
  ]) {
    let calls = 0, commits = 0; const events = [];
    const result = await selectAdaptiveProfiles({...fixture(), decide: async request => { calls++; return malformed(request); },
      record: async event => events.push(event), commit: async () => { commits++; }});
    assert.equal(calls, 1); assert.equal(commits, 0); assert.equal(result.dispatch_allowed, false);
    assert.deepEqual(result.selections, []); assert.deepEqual(result.profiles, {});
    assert.equal(events.filter(event => event.event === 'adaptive_profile_selected').length, 0);
    assert.equal(result.terminal_cause.stage, 'profiles');
    if (result.reason === 'HTTP_ERROR') { assert.equal(result.outcome_uncertain, false); assert.equal(result.terminal_cause.http_status, 400); }
  }
  const result = await selectAdaptiveProfiles({...fixture(), decide: async request => response(request),
    commit: async () => { throw Object.assign(new Error('commit failed'), {code: 'COMMIT_FAILED'}); }});
  assert.equal(result.status, 'stopped'); assert.equal(result.dispatch_allowed, false); assert.deepEqual(result.selections, []);
});

test('repair selection covers only chosen tasks, preserves public failure and dependencies, and leaves other profiles intact', async () => {
  const input = fixture(), failure = {status: 'failed', public_cases: [{id: 'description', status: 'failed', error: 'wrong description'}],
    future_evidence: {unchanged: ['exact', null]}};
  const selected = await selectAdaptiveProfiles({...input, phase: 'repair', round_index: 2, task_ids: ['t1'], failure,
    selected_action: {id: 'repair-renderer', task_ids: ['t1'], artifact_ids: ['A1'], read_artifact_ids: ['A0']},
    prior_usage: {profile_id: 'fixed-opus-medium', input_tokens: 123, wall_ms: 456},
    decide: async request => {
      assert.equal(Object.keys(request.questions).length, 1);
      assert.deepEqual(request.state.observed_public_failure, failure);
      assert.deepEqual(request.state.tasks[0].dependency_role.predecessor_task_ids, ['t0']);
      assert.deepEqual(request.state.units.map(unit => unit.id), ['U0', 'U1']);
      assert.equal(request.state.remaining_work.other_implementation_task_count, 1);
      assert.equal(request.state.tasks[0].previous_profile_id, 'fixed-opus-medium');
      assert.deepEqual(request.state.tasks[0].repair_context_read_scope, ['src/parser.py']);
      return response(request, ['claude_sonnet55_high']);
    }, commit: async () => {}});
  assert.equal(selected.phase, 'repair'); assert.equal(selected.round_index, 2);
  const applied = applyAdaptiveProfileSelections({plan: input.plan, selection: selected});
  assert.equal(applied.plan.workers[0].profile_id, 'fixed-opus-medium');
  assert.equal(applied.plan.workers[1].profile_id, 'claude_sonnet55_high');
  assert.throws(() => buildAdaptiveProfileRequest({...input, phase: 'repair'}), {code: 'ADAPTIVE_PROFILE_TASKS_INVALID'});
  const multiple = fixture(3), second = multiple.plan.tasks[1], third = multiple.plan.tasks[2];
  for (const key of ['requirement_ids', 'output_artifact_ids', 'check_ids', 'write_scope']) second[key].push(...third[key]);
  multiple.plan.tasks.splice(2, 1); multiple.plan.workers.splice(2, 1);
  multiple.plan.artifacts[2].producer_task_id = second.id;
  const repairInput = {...multiple, phase: 'repair', round_index: 1, task_ids: ['t1'],
    selected_action: {id: 'repair-one-output', task_ids: ['t1'], artifact_ids: ['A1'], read_artifact_ids: ['A0']}};
  const narrowed = buildAdaptiveProfileRequest(repairInput).request.state;
  assert.deepEqual(narrowed.requirements.map(row => row.id), ['R1']);
  assert.deepEqual(narrowed.tasks[0].selected_write_artifact_ids, ['A1']);
  assert.deepEqual(narrowed.units.map(row => row.id), ['U0', 'U1']);
  multiple.catalog.units[1].artifact_ids.push('A2'); multiple.catalog.units[1].requirement_ids.push('R2');
  multiple.catalog.units[1].evidence_ids.push('E2'); multiple.catalog.units.splice(2, 1);
  const sharedUnit = buildAdaptiveProfileRequest(repairInput).request.state;
  assert.deepEqual(sharedUnit.requirements.map(row => row.id), ['R1', 'R2']);
  assert.deepEqual(sharedUnit.tasks[0].selected_write_artifact_ids, ['A1']);
  const generalInput = fixture(3);
  const profileOnly = buildAdaptiveProfileRequest({...generalInput, phase: 'repair', round_index: 1, task_ids: ['t2'],
    selected_action: {id: 'repair-t2', task_ids: ['t2'], artifact_ids: ['A2'], read_artifact_ids: [], evidence_refs: ['public:R2']}});
  assert.deepEqual(profileOnly.request.state.units.map(row => row.id), ['U2']);
  assert.deepEqual(profileOnly.request.state.direct_inputs[0], {artifact_id: 'A0', paths: ['src/parser.py'],
    role: 'declared_read_only_input', producer_task_id: 't0', unit_ids: ['U0'], unit_count: 1, requirement_count: 1, full_interface_inline: false});
  assert.deepEqual(profileOnly.metadata.projection_report.omitted_direct_input_interface_unit_ids, ['U0']);
  assert.deepEqual(profileOnly.request.state.requirements.map(row => ({...row,
    source_refs: profileOnly.metadata.projection_report.controller_requirement_source_refs[row.id]})), [generalInput.requirement_descriptions[2]]);
  assert.equal(Object.hasOwn(profileOnly.request.state.selected_action, 'evidence_refs'), false);
  assert.deepEqual(profileOnly.metadata.projection_report.controller_action_evidence_refs, ['public:R2']);
  assert.deepEqual(profileOnly.request.state.remaining_work.original_scope_totals,
    {unit_count: 3, requirement_count: 3, output_artifact_count: 3, output_path_count: 3});
});

test('profile failure projection retains exact failures, not-reached and unknown semantics while binding passed summaries', () => {
  const binding = {binding_digest: 'binding', environment_fingerprint: 'env-hash'};
  const cases = [{test_id: 'pass', status: 'passed', assertions: 3},
    {test_id: 'fail', status: 'failed', assertions: 1, message: 'exact original failure text', assertion_results: [{assertion_id: 'a', status: 'failed'}, {assertion_id: 'b', status: 'not_reached'}]},
    {test_id: 'future', status: 'passed', assertions: 1, future_semantics: {retain: true}}];
  const failure = {status: 'failed', artifact_revisions: {A0: 'revision'}, environment: {id: 'env', fingerprint: 'env-hash'},
    binding_digest: 'binding', future_evidence: {keep: [null, 'exact']}, local_evidence: [], public_evidence: [{check_id: 'check',
      check_version: 'v1', environment_ref: 'env', artifact_revisions: {A0: 'revision'}, runtime_binding: binding,
      status: 'failed', executed: true, exit_code: 1, assertions: 5, skipped: 0, outcome_uncertain: false,
      evidence: {cases, unexecuted_test_ids: ['not-run'], test_ids: ['pass', 'fail', 'future', 'not-run'],
        error: null, future_check_semantics: 'keep this exactly'}}]};
  const prior_usage = [{id: 'cli-1', task_id: 't0', requested_profile: {id: 'claude_opus55_medium', model: 'claude-opus-5-5',
    effort: 'medium', price: {large: 'known catalog metadata'}, provenance: {ref: 'controller'}}, usage: {input_tokens: 123},
    api_equivalent_usd: 0.1, actual_billed_usd: null, future_metric: {keep: true}}];
  const raw = {failure, prior_usage}, before = structuredClone(raw), result = projectAdaptiveProfileEvidence(raw);
  assert.deepEqual(raw, before);
  const evidence = result.failure.public_evidence[0].evidence;
  assert.deepEqual(evidence.cases, cases.slice(1));
  assert.deepEqual(evidence.unexecuted_test_ids, ['not-run']);
  assert.deepEqual(evidence.profile_passed_case_summary, {status: 'passed', case_count: 1, assertions: 3, test_ids: ['pass']});
  assert.equal(evidence.future_check_semantics, 'keep this exactly');
  assert.deepEqual(result.failure.future_evidence, failure.future_evidence);
  assert.equal(result.prior_usage.receipts[0].tokens.input_tokens, 123);
  assert.equal(result.prior_usage.receipts[0].tokens.output_tokens, null);
  assert.equal(result.prior_usage.receipts[0].api_equivalent_usd, 0.1);
  assert.equal(result.prior_usage.receipts[0].executed_effort_arg, null);
  assert.equal(result.prior_usage.receipts[0].future_metric, undefined);
  assert.equal(result.prior_usage.original_receipts_ref.sha256, createHash('sha256').update(JSON.stringify(prior_usage)).digest('hex'));
  assert.equal(result.context_ref.retrieval_available_to_model, false);
  for (const omission of result.report.omitted_metadata) {
    const value = omission.pointer.split('/').slice(1).reduce((current, key) => current[key], before);
    assert.equal(createHash('sha256').update(JSON.stringify(value)).digest('hex'), omission.sha256);
  }
  const stale = structuredClone(raw); stale.failure.public_evidence[0].runtime_binding.binding_digest = 'different';
  assert.throws(() => projectAdaptiveProfileEvidence(stale), {code: 'ADAPTIVE_REPAIR_PROJECTION_BINDING_MISMATCH'});
  const withHistory = structuredClone(raw);
  withHistory.failure.repair_scope = {observed_failures: [{controller_proof: 'already used for scope selection'}],
    future_scope_meaning: 'preserve', causal: {chains: [{controller_graph: 'already selected'}],
      repair_history: {entries: [{selected_action: 'previous', actual_changed_paths: ['src/parser.py'], still_failing: ['fail']}]},
      future_causal_meaning: ['preserve']}};
  withHistory.prior_usage[0].usage.iterations = [{type: 'message', input_tokens: 1, future_meaning: 'retain this iteration'}];
  const history = projectAdaptiveProfileEvidence(withHistory);
  assert.deepEqual(history.failure.public_evidence[0].evidence.cases, cases.slice(1));
  assert.deepEqual(history.failure.repair_scope.causal.repair_history, withHistory.failure.repair_scope.causal.repair_history);
  assert.equal(history.failure.repair_scope.future_scope_meaning, 'preserve');
  assert.deepEqual(history.failure.repair_scope.causal.future_causal_meaning, ['preserve']);
  assert.equal(history.prior_usage.receipts[0].tokens.input_tokens, 123);
  assert.equal(history.prior_usage.original_receipts_ref.sha256, createHash('sha256').update(JSON.stringify(withHistory.prior_usage)).digest('hex'));
  const extended = [...prior_usage, {id: 'cli-other', task_id: 't1', status: 'completed', round_index: 0,
    requested_profile: {model: 'claude-opus-5-5', effort: 'medium'}, executed_effort_arg: 'medium',
    wall_ms: 50, usage: {input_tokens: 7}, api_equivalent_usd: null, actual_billed_usd: null}];
  const scoped = projectAdaptiveProfileEvidence({prior_usage: extended, related_task_ids: ['t0']}).prior_usage;
  assert.deepEqual(scoped.receipts.map(row => row.task_id), ['t0']);
  assert.equal(scoped.all_receipts.receipt_count, 2);
  const table = scoped.all_receipts.by_requested_model_effort;
  const aggregate = Object.fromEntries(table.columns.map((key, index) => [key, table.rows[0][index]]));
  assert.equal(aggregate.reported_completed_count, 1);
  assert.deepEqual(aggregate.api_equivalent_usd, {known_subtotal: 0.1, missing_count: 1, complete_total: null});
  assert.equal(aggregate.input_tokens, 130);
  assert.deepEqual(aggregate.worker_wall_ms, {known_subtotal: 50, missing_count: 1, complete_total: null});
});

test('history references require a unique exact current check/test/assertion observation; changes and unknown rows remain literal', () => {
  const currentCase = {test_id: 'case', status: 'failed', assertions: 1, failed_assertion_id: 'assertion-a',
    error_type: 'AssertionError', message: 'expected body description; actual schema description'};
  const observation = {check_id: 'check', test_id: 'case', assertion_id: 'assertion-a',
    error_type: currentCase.error_type, message: currentCase.message};
  const failure = {status: 'failed', artifact_revisions: {A0: 'revision'},
    environment: {id: 'env', fingerprint: 'env-hash'}, binding_digest: 'binding', local_evidence: [],
    public_evidence: [{check_id: 'check', check_version: 'v1', environment_ref: 'env', artifact_revisions: {A0: 'revision'},
      runtime_binding: {binding_digest: 'binding', environment_fingerprint: 'env-hash'},
      status: 'failed', executed: true, exit_code: 1, assertions: 1, skipped: 0, outcome_uncertain: false,
      evidence: {cases: [currentCase], error: null, unexecuted_test_ids: []}}],
    repair_scope: {causal: {repair_history: {entries: [{selected_artifact_ids: ['A0'], changed_artifact_ids: ['A0'],
      failures_before: [observation], failures_after: [observation]}]}}}};
  const raw = structuredClone(failure), projected = projectAdaptiveProfileEvidence({failure});
  const history = projected.failure.repair_scope.causal.repair_history;
  assert.deepEqual(history.entries[0].failures_before, [{same_as_current_public_case: {
    check_id: 'check', test_id: 'case', assertion_id: 'assertion-a'}}]);
  assert.deepEqual(history.entries[0].changed_artifact_ids, ['A0']);
  assert.deepEqual(history.entries[0].failures_after, {same_as_failures_before: true});
  assert.match(history.observation_reference_rule, /not say files or causes are unchanged/);
  assert.deepEqual(failure, raw);
  for (const change of [row => ({...row, assertion_id: 'assertion-b'}), row => ({...row, message: 'changed observation'}),
    row => ({...row, unknown_observation: null}), () => null]) {
    const changed = structuredClone(failure), row = change(structuredClone(observation));
    changed.repair_scope.causal.repair_history.entries[0].failures_before = [row];
    const result = projectAdaptiveProfileEvidence({failure: changed});
    assert.deepEqual(result.failure.repair_scope.causal.repair_history.entries[0].failures_before, [row]);
  }
  const duplicate = structuredClone(failure); duplicate.public_evidence[0].evidence.cases.push(structuredClone(currentCase));
  const duplicateResult = projectAdaptiveProfileEvidence({failure: duplicate});
  assert.deepEqual(duplicateResult.failure.repair_scope.causal.repair_history.entries[0].failures_before, [observation]);
  const existing = structuredClone(failure); existing.repair_scope.causal.repair_history.observation_reference_rule = 'future meaning';
  assert.deepEqual(projectAdaptiveProfileEvidence({failure: existing}).failure.repair_scope.causal.repair_history,
    existing.repair_scope.causal.repair_history);
});

test('source/plan/profile/answer drift and oversized or unbound evidence fail locally before dispatch', async () => {
  const input = fixture(), selected = await selectAdaptiveProfiles({...input, decide: async request => response(request), commit: async () => {}});
  for (const mutate of [
    value => { value.selections[0].model = 'claude-opus-5-5'; },
    value => { value.selections[0].effort = 'ultracode'; },
    value => { value.selections[0].price.prompt_tiers[0].rates.input = 0; },
    value => { value.decisions[0].choices[value.selections[0].question_id] = 'claude_opus55_high'; },
    value => { value.decisions[0].response.answers[value.selections[0].question_id].choice = 'claude_opus55_high'; },
    value => { value.source.candidates.sha256 = '0'.repeat(64); },
  ]) {
    const bad = structuredClone(selected); mutate(bad);
    assert.throws(() => applyAdaptiveProfileSelections({plan: input.plan, selection: bad}), error =>
      ['ADAPTIVE_PROFILE_SELECTION_BINDING', 'ADAPTIVE_PROFILE_SOURCE_CHANGED'].includes(error.code));
  }
  const changed = structuredClone(input.plan); changed.graph_revision = 'changed-graph';
  assert.throws(() => applyAdaptiveProfileSelections({plan: changed, selection: selected}), {code: 'ADAPTIVE_PROFILE_SELECTION_BINDING'});
  assert.throws(() => buildAdaptiveProfileRequest({...input, limits: {max_request_bytes: 50}}), {code: 'ADAPTIVE_PROFILE_REQUEST_LIMIT'});
  const bad = structuredClone(input); bad.catalog.units[0].requirement_ids = ['R1'];
  assert.throws(() => buildAdaptiveProfileRequest(bad), {code: 'ADAPTIVE_PROFILE_CATALOG_BINDING'});
  let calls = 0;
  await assert.rejects(() => selectAdaptiveProfiles({...input, cli_version: '2.1.100', decide: async () => { calls++; }}),
    {code: 'ADAPTIVE_PROFILE_CLI_UNSUPPORTED'});
  assert.equal(calls, 0);
});

test('all scoped batches pass admission before any callback; a later failure preserves prior answers but dispatches no worker', async () => {
  const input = fixture(5), built = buildAdaptiveProfileRequests(input);
  assert.deepEqual(built.batches.map(batch => batch.metadata.question_tasks.length), [2, 2, 1]);
  assert.deepEqual(buildAdaptiveProfileRequests({...input, phase: 'repair', round_index: 1, task_ids: ['t0', 't1', 't2', 't3', 't4']})
    .batches.map(batch => batch.metadata.question_tasks.length), [1, 1, 1, 1, 1]);
  assert.equal(new Set(built.metadata.question_tasks.map(row => row.question_id)).size, 5);
  assert.deepEqual(built.batches[2].request.state.requirements.map(row => row.id), ['R4']);
  assert.deepEqual(built.batches[2].request.state.units.map(row => row.id), ['U0', 'U4']);
  assert.ok(built.batches[2].metadata.projection_report.omitted_requirement_ids.includes('R0'));
  const largePair = fixture();
  for (let index = 0; index < 2; index++) {
    largePair.requirement_descriptions[index].text = `Exact selected requirement ${index}. `.repeat(450);
    largePair.catalog.evidence[index].quote = largePair.requirement_descriptions[index].text;
  }
  assert.throws(() => buildAdaptiveProfileRequest(largePair), {code: 'ADAPTIVE_PROFILE_REQUEST_LIMIT'});
  const split = buildAdaptiveProfileRequests(largePair);
  assert.deepEqual(split.batches.map(batch => batch.metadata.question_tasks.length), [1, 1]);
  for (const [index, batch] of split.batches.entries()) {
    assert.ok(batch.metadata.wire_bytes <= 48000);
    assert.deepEqual(batch.request.state.requirements, [largePair.requirement_descriptions[index]]);
  }
  let oversizedCalls = 0;
  const largeSingle = fixture(1); largeSingle.requirement_descriptions[0].text = 'Do not silently truncate requirements. '.repeat(1500);
  await assert.rejects(() => selectAdaptiveProfiles({...largeSingle, decide: async () => { oversizedCalls++; }}),
    {code: 'ADAPTIVE_PROFILE_REQUEST_LIMIT'});
  assert.equal(oversizedCalls, 0);
  let calls = 0, admitted = 0;
  const preblocked = await selectAdaptiveProfiles({...input,
    admitBatch: async () => ({inference_allowed: ++admitted === 1}), decide: async () => { calls++; }});
  assert.equal(preblocked.reason, 'ADAPTIVE_PROFILE_ADMISSION_BLOCKED');
  assert.equal(calls, 0); assert.equal(preblocked.admissions.length, 2);
  const events = []; let commits = 0; calls = 0;
  const failed = await selectAdaptiveProfiles({...input, admitBatch: async () => ({inference_allowed: true}),
    decide: async request => {
      calls++; if (calls === 2) throw new Error('unknown callback outcome');
      return response(request, Object.keys(request.questions).map(() => 'claude_sonnet55_medium'));
    }, record: async event => events.push(event), commit: async () => { commits++; }});
  assert.equal(failed.status, 'uncertain'); assert.equal(calls, 2); assert.equal(commits, 0);
  assert.equal(failed.decisions.length, 1); assert.equal(failed.stats.provider_questions, 4);
  assert.deepEqual(failed.selections, []); assert.equal(failed.dispatch_allowed, false);
  assert.equal(events.filter(event => event.event === 'adaptive_profile_selected').length, 0);
  const selected = await selectAdaptiveProfiles({...input, admitBatch: async () => ({inference_allowed: true}),
    decide: async request => response(request, Object.keys(request.questions).map(() => 'claude_sonnet55_medium')),
    commit: async () => { commits++; }});
  assert.equal(selected.decisions.length, 3); assert.equal(commits, 1);
  assert.equal(applyAdaptiveProfileSelections({plan: input.plan, selection: selected}).plan.workers.length, 5);
});

test('provider-limits-v2 removes local size rejection while preserving official body limits, admission injection and v1 defaults', async () => {
  const profilePolicy = 'provider-limits-v2', original = loadAdaptiveProfileContract(), enabled = loadAdaptiveProfileContract({profilePolicy});
  assert.equal(original.contract.policy.max_wire_bytes, 48000);
  assert.equal(enabled.contract.policy.max_wire_bytes, null);
  assert.equal(enabled.contract.policy.provider_max_wire_bytes, 256000);
  assert.deepEqual(enabled.contract.question, original.contract.question);
  assert.deepEqual(enabled.catalog, original.catalog);
  assert.throws(() => loadAdaptiveProfileContract({profilePolicy: 'unknown'}), {code: 'ADAPTIVE_PROFILE_POLICY_INVALID'});
  const input = {...fixture(1), profilePolicy, limits: {max_request_bytes: 50}, remaining_work: {fixture_literal: ''}};
  const base = buildAdaptiveProfileRequest(input);
  input.remaining_work.fixture_literal = 'x'.repeat(245000 - base.metadata.wire_bytes);
  const request = buildAdaptiveProfileRequest(input);
  assert.equal(request.metadata.wire_bytes, 245000);
  assert.equal(request.metadata.ignored_local_max_request_bytes, 50);
  assert.equal(request.metadata.local_wire_byte_limit, null);
  assert.equal(request.metadata.local_token_estimates, 'observation_only');
  assert.equal(buildAdaptiveProfileRequests(input).batches.length, 1);
  assert.throws(() => buildAdaptiveProfileRequest({...input, profilePolicy: 'bounded-v1', limits: {max_request_bytes: 240000}}),
    error => error.code === 'ADAPTIVE_PROFILE_REQUEST_LIMIT' && error.max_request_bytes === 48000);
  let admissions = 0, calls = 0, commits = 0;
  const selected = await selectAdaptiveProfiles({...input, admitBatch: async (body, metadata) => {
    admissions++; assert.equal(calls, 0); assert.equal(metadata.stage, 'profiles');
    assert.equal(Buffer.byteLength(JSON.stringify(body)), 245000);
    return {schema_version: 'jev-token-admission-result/v4', inference_allowed: true, admission: 'admit_observed',
      warning_codes: ['LOCAL_TOKEN_ESTIMATE_OBSERVED_ONLY']};
  }, decide: async body => { calls++; return response(body); }, commit: async () => { commits++; }});
  assert.equal(admissions, 1); assert.equal(calls, 1); assert.equal(commits, 1);
  assert.equal(selected.dispatch_allowed, true);
  assert.equal(selected.profile_policy, profilePolicy);
  assert.equal(applyAdaptiveProfileSelections({plan: input.plan, selection: selected, profilePolicy}).dispatch_allowed, true);
  assert.throws(() => applyAdaptiveProfileSelections({plan: input.plan, selection: selected}), {code: 'ADAPTIVE_PROFILE_SOURCE_CHANGED'});
  assert.equal(resolveAdaptiveProfile(selected.selections[0].profile_id, {cli_version: input.cli_version, profilePolicy})
    .provenance.contract_sources.question.path, enabled.source.question.path);
  input.remaining_work.fixture_literal = 'x'.repeat(256000 - base.metadata.wire_bytes);
  assert.equal(buildAdaptiveProfileRequest(input).metadata.wire_bytes, 256000);
  input.remaining_work.fixture_literal += 'x';
  await assert.rejects(() => selectAdaptiveProfiles({...input, decide: async () => { calls++; }}), error =>
    error.code === 'ADAPTIVE_PROFILE_REQUEST_LIMIT' && error.constraint_kind === 'provider_request_body_byte_limit'
      && error.max_request_bytes === 256000 && error.wire_bytes === 256001);
  assert.equal(calls, 1);
});
