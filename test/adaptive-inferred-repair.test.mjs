import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildAdaptiveCausalRepairScope} from '../src/orchestration/adaptive-causal-repair.mjs';
import {buildInferredRepairOwnerRequest, inferAdaptiveRepairOwners, applyInferredRepairOwners,
  validateInferredRepairCandidate, buildInferredRepairDecisionContext, buildInferredRepairWorkerContext}
  from '../src/orchestration/adaptive-inferred-repair.mjs';
import {loadInferredRepairContract} from '../src/orchestration/adaptive-inferred-repair.mjs';
import {projectInferredRepairOwnerRequest, restoreInferredRepairOwnerRequest}
  from '../src/orchestration/adaptive-inferred-repair-projection.mjs';
import {restoreRepairDecisionRequest, verifyRepairInputOverride} from '../src/orchestration/adaptive-repair-input.mjs';

const copy = value => structuredClone(value), hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
function fixture() {
  const names = ['producer', 'ir', 'generator', 'template', 'metadata', 'unrelated'];
  const paths = Object.fromEntries(names.map(name => [name, name === 'template' ? 'template.jinja' : `${name}.py`]));
  const owner = name => name === 'metadata' ? 'template' : name;
  const artifacts = names.map(name => ({id: `A-${name}`, producer_task_id: `owner-${owner(name)}`}));
  const tasks = names.filter(name => name !== 'metadata').map(name => ({id: `owner-${name}`, worker_id: `worker-${name}`, kind: 'implementation',
    output_artifact_ids: artifacts.filter(artifact => artifact.producer_task_id === `owner-${name}`).map(artifact => artifact.id),
    input_artifact_ids: name === 'template' ? ['A-generator'] : [],
    requirement_ids: name === 'template' ? ['R-body', 'R-metadata'] : [`R-${name}`],
    write_scope: names.filter(item => owner(item) === name).map(item => paths[item]),
    read_scope: name === 'template' ? ['generator.py'] : [],
    check_ids: names.filter(item => owner(item) === name).map(item => `local-${item}`)}));
  const catalog = {source_sha256: hash('Original body and source requirements.'),
    units: names.map(name => ({id: `U-${name}`, title: name, artifact_ids: [`A-${name}`],
      requirement_ids: [name === 'template' ? 'R-body' : `R-${name}`],
      interface: `Complete original ${name} interface: preserve description provenance.`, evidence_ids: [`E-${name}`]})),
    artifacts: names.map(name => ({id: `A-${name}`, paths: [paths[name]], evidence_ids: [`E-${name}`]})),
    evidence: names.map(name => ({id: `E-${name}`, quote: `Original ${name} public requirement, without deletion.`}))};
  const planning = {catalog, catalog_sha256: hash(JSON.stringify(catalog)), source_sha256: catalog.source_sha256,
    plan: {graph_revision: 'graph-0', tasks, artifacts, checks: names.map(name => ({id: `local-${name}`, artifact_ids: [`A-${name}`]}))},
    requirement_descriptions: names.map(name => ({id: name === 'template' ? 'R-body' : `R-${name}`,
      text: `Complete ${name} requirement.`, source_refs: ['public-source']}))};
  const artifactBindings = Object.fromEntries(catalog.artifacts.map(artifact => [artifact.id, {paths: artifact.paths}]));
  const check = {id: 'public.description', version: '4', requirement_ids: ['R-body'], environment_ref: 'fixture-environment'};
  const contract = {schema_version: 'public-assertion-contract/v1', version: '2', assertions: [{
    id: 'A.body.description', check_id: check.id, test_id: 'T.body.description', requirement_ids: ['R-body'], artifact_paths: ['template.jinja'],
    causal_paths: [['producer', 'producer'], ['ir', 'representation'], ['generator', 'renderer'], ['template', 'renderer']]
      .map(([name, role]) => ({path: paths[name], role, rationale: `Public source-backed ${role} candidate.`}))}]};
  const source_text = JSON.stringify(contract), source_path = 'public/assertions.v2.json';
  const assertionContract = {contract, source_text, source_path, sha256: hash(source_text)};
  const environment = {id: check.environment_ref, fingerprint: hash('environment')};
  const revisions = Object.fromEntries(names.map(name => [`A-${name}`, hash(`revision-${name}`)]));
  const failure = {status: 'failed', code: 'ARTIFACT_CHECK_NOT_PASSED', outcome_uncertain: false, failed_task_ids: [],
    source_sha256: planning.source_sha256, catalog_sha256: planning.catalog_sha256, graph_revision: 'graph-0', round_index: 0,
    environment, artifact_revisions: revisions, local_evidence: [], public_evidence: [{
      check_id: check.id, check_version: check.version, environment_ref: check.environment_ref, status: 'failed',
      executed: true, exit_code: 1, assertions: 2, skipped: 0, outcome_uncertain: false, artifact_revisions: copy(revisions),
      evidence: {check_id: check.id, check_version: check.version, environment_ref: check.environment_ref, outcome_uncertain: false,
        assertion_contract_sha256: assertionContract.sha256, unexecuted_test_ids: [], error: null,
        cases: [{test_id: 'T.body.description', status: 'failed', assertions: 1, error_type: 'AssertionError', message: 'Wrong request-body description.',
          failed_assertion_id: 'A.body.description', assertion_results: [{assertion_id: 'A.body.description', status: 'failed'}],
          description_provenance: {expected_request_description: 'REQUEST', schema_description: 'SCHEMA', runtime: {body_lines: ['SCHEMA']},
            observation: 'schema_description_substitution'}, unknown_semantic: {preserved: true}},
        {test_id: 'T.other', status: 'passed', assertions: 1}]}}]};
  const runtimeBinding = {schema_version: 'dag-filesystem-binding/v1', checker_manifest: [{path: source_path, sha256: assertionContract.sha256}],
    plan: planning.plan, environment, artifact_bindings: artifactBindings};
  const input = {plan: planning.plan, planning, failure, publicChecks: [check], artifactBindings, assertionContract, runtimeBinding,
    testRequirements: {'T.body.description': ['R-body']}, sourceFiles: []};
  seal(input); return input;
}
function seal(input) {
  const {runtimeBinding: binding, plan, failure, artifactBindings, assertionContract} = input;
  assertionContract.source_text = JSON.stringify(assertionContract.contract); assertionContract.sha256 = hash(assertionContract.source_text);
  binding.checker_manifest = [{path: assertionContract.source_path, sha256: assertionContract.sha256}];
  binding.plan_hash = digest(plan); binding.binding_digest = digest({pinManifest: binding.checker_manifest,
    environment: binding.environment, plan_hash: binding.plan_hash, artifact_bindings: artifactBindings});
  failure.binding_digest = binding.binding_digest;
  for (const item of failure.public_evidence) {
    item.evidence.assertion_contract_sha256 = assertionContract.sha256;
    item.artifact_revisions = copy(failure.artifact_revisions);
    item.runtime_binding = {binding_digest: binding.binding_digest, checker_manifest_sha256: digest(binding.checker_manifest),
      environment_fingerprint: binding.environment.fingerprint, plan_hash: binding.plan_hash};
    item.evidence_key = digest({check_id: item.check_id, check_version: item.check_version,
      artifact_revisions: item.artifact_revisions, runtime_binding: item.runtime_binding});
  }
}
async function scoped(input = fixture()) {
  const result = await buildAdaptiveCausalRepairScope(input);
  input.failure.repair_scope = result.analysis; return {...input, candidates: result.candidates};
}

const responseFor = (request, choice) => ({answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, {type: 'choice', choice}]))});
async function inferred(input, choice = 'A-producer') {
  const inference = await inferAdaptiveRepairOwners({...input, decide: async request => responseFor(request, choice)});
  assert.equal(inference.status, 'inferred');
  const applied = applyInferredRepairOwners({...input, inference});
  return {...input, candidates: applied.candidates, failure: {...input.failure, repair_scope: applied.analysis}, inference};
}
function restoreMetadata(packet, report) {
  const value = copy(packet);
  for (const pointer of report.added_fields) {
    const parts = pointer.slice(1).split('/'); const last = parts.pop();
    let target = value; for (const field of parts) target = target[field]; delete target[last];
  }
  for (const row of [...report.omitted_fields].reverse()) {
    assert.equal(digest(row.value), row.sha256); const parts = row.pointer.slice(1).split('/'), last = parts.pop();
    let target = value; for (const field of parts) target = target[field]; target[last] = copy(row.value);
  }
  assert.equal(digest(value), report.original_sha256); return value;
}

test('typed owner choice creates existing exact artifact authority, retains original unknown semantic facts and controller metadata reconstructs', async () => {
  const input = await scoped(), original = copy(input), built = buildInferredRepairOwnerRequest(input);
  const [qid, question] = Object.entries(built.request.questions)[0];
  assert(question.instructions.includes('T.body.description')); assert(question.instructions.includes('A.body.description'));
  assert.equal(built.request.state.failures[0].question_id, qid);
  assert.deepEqual(Object.keys(question.criteria), [...input.planning.plan.artifacts.map(row => row.id), 'unknown']);
  const narrowed = await inferred(input), candidate = narrowed.candidates.find(row => row.id === 'repair-inferred-owners');
  assert.deepEqual(candidate.task_ids, ['owner-producer']); assert.deepEqual(candidate.artifact_ids, ['A-producer']);
  assert(!narrowed.candidates.some(row => row.id === 'repair-failure-owners'));
  validateInferredRepairCandidate({...narrowed, candidate});
  const decision = buildInferredRepairDecisionContext(narrowed);
  assert(decision.state.requirement_descriptions.some(row => row.id === 'R-body'));
  assert(!decision.state.requirement_descriptions.some(row => row.id === 'R-unrelated'));
  restoreMetadata(decision.state, decision.report.inferred_metadata_projection);
  const worker = buildInferredRepairWorkerContext({...narrowed, candidate, task: input.planning.plan.tasks[0]});
  assert.deepEqual(worker.task.write_scope, ['producer.py']);
  assert.deepEqual(worker.context.required_read_artifact_ids, ['A-ir', 'A-generator', 'A-template']);
  const originalWorker = restoreMetadata(worker.context, worker.report.inferred_metadata_projection);
  const report = {...originalWorker.failure.public_evidence_defaults, ...originalWorker.failure.public_evidence[0]};
  const cases = report.evidence.cases;
  const first = Array.isArray(cases) ? cases[0] : {...Object.fromEntries(cases.columns.map((column, index) => [column, cases.rows[0][index]])), ...cases.rows[0].at(-1)};
  assert.equal(first.unknown_semantic.preserved, true);
  assert.deepEqual(input, original);
});

test('unknown remains unresolved with original requirements and never becomes a fabricated artifact or observed not-reached failure', async () => {
  const input = fixture();
  input.failure.public_evidence[0].evidence.cases[0].assertion_results.push({assertion_id: 'not-run', status: 'not_reached'});
  const prepared = await scoped(input), built = buildInferredRepairOwnerRequest(prepared);
  assert.equal(Object.keys(built.request.questions).length, 1);
  assert.deepEqual(built.request.state.failures[0].not_reached_assertion_ids, ['not-run']);
  const narrowed = await inferred(prepared, 'unknown');
  assert.equal(narrowed.inference.assignments[0].artifact_id, null); assert.equal(narrowed.inference.assignments[0].owner_task_id, null);
  assert(!narrowed.candidates.some(row => row.id.startsWith('repair-inferred-')));
  assert(narrowed.failure.repair_scope.unresolved.some(row => row.reason === 'JEV_OWNER_UNKNOWN'));
  if (narrowed.candidates.length) {
    const packet = buildInferredRepairDecisionContext(narrowed);
    assert(packet.state.requirement_descriptions.some(row => row.id === 'R-body'));
  }
});

test('invalid invented artifacts or partial answers never apply; changed input dependencies invalidate a previously complete inference', async () => {
  const input = await scoped(), original = copy(input); let calls = 0;
  const invalid = await inferAdaptiveRepairOwners({...input, decide: async request => {calls++; return responseFor(request, '../invented.py');}});
  assert.equal(invalid.status, 'stopped'); assert.equal(invalid.reason, 'ADAPTIVE_INFERRED_ANSWER_INVALID');
  assert.equal(invalid.outcome_uncertain, false); assert.equal(calls, 1);
  assert.throws(() => applyInferredRepairOwners({...input, inference: invalid}), {code: 'ADAPTIVE_INFERRED_RESULT_BINDING'});
  const incomplete = await inferAdaptiveRepairOwners({...input, decide: async () => ({answers: {}})});
  assert.equal(incomplete.reason, 'ADAPTIVE_INFERRED_ANSWER_COVERAGE');
  const valid = await inferred(copy(input)), candidate = valid.candidates[0];
  valid.planning.plan.tasks[0].input_artifact_ids.push('A-unrelated');
  assert.throws(() => validateInferredRepairCandidate({...valid, candidate}), {code: 'ADAPTIVE_INFERRED_SCOPE_BINDING'});
  assert.deepEqual(input, original);
});

test('official 64-question boundary rejects 65 observed failures before any callback without dropping cases', async () => {
  const input = fixture(), originalCase = input.failure.public_evidence[0].evidence.cases[0];
  input.failure.public_evidence[0].evidence.cases = Array.from({length: 65}, (_, index) => ({
    ...copy(originalCase), test_id: `failure-${index}`, failed_assertion_id: undefined, assertion_results: []}));
  input.testRequirements = Object.fromEntries(input.failure.public_evidence[0].evidence.cases.map(row => [row.test_id, ['R-body']]));
  const prepared = await scoped(input); let calls = 0;
  await assert.rejects(inferAdaptiveRepairOwners({...prepared, decide: async () => { calls++; }}), {code: 'ADAPTIVE_INFERRED_OFFICIAL_QUESTION_LIMIT'});
  assert.equal(calls, 0); assert.equal(prepared.failure.public_evidence[0].evidence.cases.length, 65);
});

test('v2 keeps complete failed cases and every existing contract, then binds the actual projected request to exact repair authority', async () => {
  const base = fixture();
  base.failure.public_evidence[0].evidence.cases[0].assertion_results.push({assertion_id: 'not-yet-reached', status: 'not_reached'});
  const input = {...await scoped(base), ownerInputPolicy: 'inferred-v2'}, original = copy(input);
  const built = buildInferredRepairOwnerRequest(input), state = built.request.state;
  assert.equal(built.metadata.owner_input_projection.mode, 'single_target_state');
  assert.equal(built.metadata.request_sha256, hash(JSON.stringify(built.request)));
  const restored = restoreInferredRepairOwnerRequest(built.request, built.metadata.owner_input_projection);
  assert.deepEqual(state.detailed_failed_cases[0].testcase, input.failure.public_evidence[0].evidence.cases[0]);
  assert.deepEqual(state.detailed_failed_cases[0].original_requirement_ids, ['R-body']);
  assert.deepEqual(state.unit_interfaces, input.planning.catalog.units);
  assert.deepEqual(state.evidence_quotes, input.planning.catalog.evidence);
  assert.equal(state.public_gate.case_count, 2); assert.equal(state.public_gate.failed_count, 1);
  assert.equal(Object.keys(built.request.questions).length, 1);
  assert.deepEqual(state.artifact_contracts, restored.state.artifacts.map(({revision, ...rest}) => rest));
  for (const task of state.task_dependencies) {
    const prior = input.planning.plan.tasks.find(row => row.id === task.id);
    const paths = ids => ids.flatMap(id => state.artifact_contracts.find(row => row.id === id).paths);
    assert.deepEqual(task.read_paths_from_input_artifacts ? paths(task.input_artifact_ids) : task.read_scope, prior.read_scope);
    assert.deepEqual(task.write_paths_from_output_artifacts ? paths(task.output_artifact_ids) : task.write_scope, prior.write_scope);
  }
  assert(state.original_requirements.some(row => row.id === 'R-body'));
  assert(!state.original_requirements.some(row => row.id === 'R-unrelated'));
  const narrowed = await inferred(input), candidate = narrowed.candidates.find(row => row.id === 'repair-inferred-owners');
  assert.equal(narrowed.failure.repair_scope.policy, 'public-inferred-owner-v2');
  assert.equal(narrowed.inference.request_sha256, built.metadata.request_sha256);
  validateInferredRepairCandidate({...narrowed, candidate});
  const decision = buildInferredRepairDecisionContext(narrowed);
  assert.equal(decision.report.inferred_contract.schema_version, 'adaptive-inferred-repair-contract/v2');
  const worker = buildInferredRepairWorkerContext({...narrowed, candidate, task: input.planning.plan.tasks[0]});
  assert.deepEqual(worker.task.write_scope, ['producer.py']);
  assert.equal(worker.report.inferred_contract.schema_version, 'adaptive-inferred-repair-contract/v2');
  assert.throws(() => validateInferredRepairCandidate({...narrowed, candidate, ownerInputPolicy: 'inferred-v1'}),
    {code: 'ADAPTIVE_INFERRED_SCOPE_BINDING'});
  const tampered = copy(narrowed.inference); tampered.request_sha256 = hash('a different request');
  const {sha256, ...body} = tampered; tampered.sha256 = digest(body);
  assert.throws(() => applyInferredRepairOwners({...input, inference: tampered}), {code: 'ADAPTIVE_INFERRED_RESULT_BINDING'});
  assert.deepEqual(input, original);
});

test('v2 never applies failed or uncertain envelopes, incomplete answers or invented artifacts; unknown stays independently unresolved', async () => {
  const input = {...await scoped(), ownerInputPolicy: 'inferred-v2'};
  for (const extra of [{status: 'failed'}, {error: {code: 'UPSTREAM_FAILURE'}}, {outcomeUncertain: true}]) {
    const result = await inferAdaptiveRepairOwners({...input, decide: async request => ({...responseFor(request, 'A-producer'), ...extra})});
    assert.notEqual(result.status, 'inferred'); assert.equal(result.assignments.length, 0);
    assert.equal(result.stats.decision_callbacks, 1);
    assert.throws(() => applyInferredRepairOwners({...input, inference: result}), {code: 'ADAPTIVE_INFERRED_RESULT_BINDING'});
  }
  for (const response of [{answers: {}}, {answers: {extra: {type: 'choice', choice: 'A-producer'}}}]) {
    const result = await inferAdaptiveRepairOwners({...input, decide: async () => response});
    assert.equal(result.reason, 'ADAPTIVE_INFERRED_ANSWER_COVERAGE');
  }
  const invalid = await inferAdaptiveRepairOwners({...input, decide: async request => responseFor(request, 'new-owner.py')});
  assert.equal(invalid.reason, 'ADAPTIVE_INFERRED_ANSWER_INVALID');
  const unknown = await inferred(input, 'unknown');
  assert.equal(unknown.inference.assignments[0].owner_task_id, null);
  assert.equal(unknown.inference.assignments[0].status, 'unknown');
  assert(unknown.failure.repair_scope.unresolved.some(row => row.reason === 'JEV_OWNER_UNKNOWN'));
});

test('v2 semantic projection preserves diagnostics or explicitly falls back, and refuses broken case/default/projection bindings', async () => {
  const input = await scoped(), raw = buildInferredRepairOwnerRequest(input).request;
  const project = request => projectInferredRepairOwnerRequest(request, {contract: loadInferredRepairContract('inferred-v2')});
  for (const change of [request => { request.state.failure.new_failure_context = {traceback: 'KEEP'}; },
    request => { request.state.failure.public_evidence[0].evidence.unexecuted_test_ids = ['not-run']; },
    request => { request.state.failure.public_evidence[0].evidence.error = {traceback: 'KEEP'}; }]) {
    const changed = copy(raw); change(changed); const projected = project(changed);
    assert.equal(projected.report.mode, 'raw_request_fallback'); assert.deepEqual(projected.request, changed);
  }
  const ambiguous = copy(raw); ambiguous.state.failures[0].requirement_ids = [];
  const all = project(ambiguous);
  assert.deepEqual(all.request.state.original_requirements, raw.state.requirement_descriptions);
  const observed = copy(raw); observed.state.failure.public_evidence[0].evidence.cases[1].diagnostic = 'passed with semantic context';
  const observedProjection = project(observed);
  assert.equal(observedProjection.request.state.additional_observed_cases[0].testcase.diagnostic, 'passed with semantic context');
  const changedCase = copy(raw); changedCase.state.failure.public_evidence[0].evidence.cases[0].message = 'different failure';
  assert.throws(() => project(changedCase), {code: 'ADAPTIVE_OWNER_PROJECTION_CASE_BINDING'});
  const missingDefault = copy(raw); missingDefault.state.failure.public_evidence[0].check_defaults_ref = 'invented';
  assert.throws(() => project(missingDefault), {code: 'ADAPTIVE_OWNER_PROJECTION_DEFAULT_REF'});
  const partial = project(raw); delete partial.request.questions[Object.keys(partial.request.questions)[0]];
  assert.throws(() => restoreInferredRepairOwnerRequest(partial.request, partial.report), {code: 'ADAPTIVE_OWNER_PROJECTION_REPORT_BINDING'});
});

test('D075 actual owner body is bound through inference/apply/candidate and source ranges reach the selected worker', async () => {
  const input = {...await scoped(), ownerInputPolicy: 'inferred-v2', repairInputPolicy: 'evidence-v1'};
  input.repairInputContext = {assertionContract: input.assertionContract, runtimeBinding: input.runtimeBinding};
  const sourceText = 'def build_value(data):\n    return data.get("body")\n';
  input.failure.recovery_evidence = [{schema_version: 'adaptive-repair-source-evidence/v1', kind: 'static_source_observation',
    artifact_id: 'A-producer', path: 'producer.py', revision: input.failure.artifact_revisions['A-producer'], sha256: hash(sourceText),
    ranges: [{start_line: 1, end_line: 2, text: sourceText.trimEnd()}], relations: [], attribution: 'static_hypothesis_not_runtime_fault_proof'}];
  const built = buildInferredRepairOwnerRequest(input);
  assert.equal(built.metadata.request_sha256, hash(JSON.stringify(built.request)));
  const plain = restoreRepairDecisionRequest(built.request, built.metadata.repair_input_projection);
  assert.equal(plain.state.schema_version, 'adaptive-inferred-owner-input/v2');
  assert.equal(built.request.state.recovery_source_evidence[0].visible_scope, 'imports_public_signatures_and_exports');
  assert(!JSON.stringify(built.request.state.recovery_source_evidence).includes('data.get'));
  let transmitted;
  const inference = await inferAdaptiveRepairOwners({...input, decide: async request => {
    transmitted = request; return responseFor(request, 'A-producer');
  }});
  assert.equal(inference.status, 'inferred');
  assert.equal(inference.request_sha256, hash(JSON.stringify(transmitted)));
  assert.deepEqual(transmitted, built.request);
  const applied = applyInferredRepairOwners({...input, inference});
  const narrowed = {...input, candidates: applied.candidates, failure: {...input.failure, repair_scope: applied.analysis}};
  const candidate = narrowed.candidates.find(row => row.id === 'repair-inferred-owners');
  validateInferredRepairCandidate({...narrowed, candidate});
  assert.throws(() => validateInferredRepairCandidate({...narrowed, candidate, repairInputPolicy: undefined}),
    {code: 'ADAPTIVE_INFERRED_SCOPE_BINDING'});
  const decision = buildInferredRepairDecisionContext(narrowed);
  assert.deepEqual(decision.state.recovery_source_evidence, input.failure.recovery_evidence);
  const worker = buildInferredRepairWorkerContext({...narrowed, candidate, task: input.planning.plan.tasks[0]});
  assert.deepEqual(worker.context.recovery_source_evidence, input.failure.recovery_evidence);
  assert(JSON.stringify(worker.context).includes('data.get'));
  assert.deepEqual(worker.task.write_scope, ['producer.py']);
  assert(!Object.hasOwn(worker.context.failure.repair_scope.inferred_ownership, 'repair_input_context'));
  const changed = copy(narrowed); changed.failure.recovery_evidence[0].ranges[0].text += '\n# invented';
  assert.throws(() => validateInferredRepairCandidate({...changed, candidate}), {code: 'ADAPTIVE_INFERRED_SCOPE_BINDING'});
});

test('D075 request override must reproduce the actual opted-in source and unknown remains unresolved', async () => {
  const input = {...await scoped(), ownerInputPolicy: 'inferred-v2', repairInputPolicy: 'evidence-v1'};
  const built = buildInferredRepairOwnerRequest(input), override = {request: built.request, report: built.metadata.repair_input_projection};
  assert.deepEqual(buildInferredRepairOwnerRequest({...input, requestOverride: override}).request, built.request);
  assert.throws(() => verifyRepairInputOverride({state: {}}, override), {code: 'REPAIR_INPUT_OVERRIDE_SOURCE'});
  const inference = await inferAdaptiveRepairOwners({...input, requestOverride: override, decide: async request => responseFor(request, 'unknown')});
  const applied = applyInferredRepairOwners({...input, inference});
  assert.equal(inference.assignments[0].status, 'unknown');
  assert(applied.analysis.unresolved.some(row => row.reason === 'JEV_OWNER_UNKNOWN'));
  for (const responseExtra of [{status: 'failed'}, {error: {code: 'FAIL'}}, {outcome_uncertain: true}]) {
    const failed = await inferAdaptiveRepairOwners({...input, decide: async request => ({...responseFor(request, 'A-producer'), ...responseExtra})});
    assert.notEqual(failed.status, 'inferred'); assert.equal(failed.assignments.length, 0);
  }
});
