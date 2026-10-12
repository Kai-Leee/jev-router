import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectRepairDecisionRequest, restoreRepairDecisionRequest, verifyRepairInputOverride,
  collectRepairSourceEvidence, createRepairInputRecovery, validateRepairInputState} from '../src/orchestration/adaptive-repair-input.mjs';
const clone = structuredClone, hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));

function ownerFixture() {
  const oldDiagnostic = {expected_request_description: 'REQUEST', schema_description: 'SCHEMA', runtime: {body_lines: ['SCHEMA']},
    attribution_basis: 'Observed public source, not a fault proof.', long_literal: 'preserved exact diagnostic '.repeat(40)};
  const currentDiagnostic = {...clone(oldDiagnostic), runtime: {body_lines: ['REQUEST']}};
  const failed = {test_id: 'T.current', status: 'failed', assertions: 1, error_type: 'AttributeError', message: 'Missing current value',
    assertion_results: [{assertion_id: 'A.current', status: 'failed'}, {assertion_id: 'A.later', status: 'not_reached'}]};
  const passed = {test_id: 'T.prior', status: 'passed', assertions: 1, description_provenance: currentDiagnostic,
    assertion_results: [{assertion_id: 'A.prior', status: 'passed'}]};
  const publicContract = {schema_version: 'public-assertion-contract/v1', version: '2', assertions: [{id: 'A.prior',
    check_id: 'public.check', test_id: 'T.prior', requirement_ids: ['R-prior'], artifact_paths: ['producer.py']}]};
  const source_text = JSON.stringify(publicContract), assertionContract = {contract: publicContract, source_text,
    sha256: hash(source_text), source_path: 'public/assertions.json'};
  const runtimeBinding = {plan: {tasks: [], artifacts: []}, environment: {fingerprint: hash('env')},
    checker_manifest: [{path: assertionContract.source_path, sha256: assertionContract.sha256}],
    artifact_bindings: {A1: {paths: ['producer.py']}}};
  runtimeBinding.plan_hash = digest(runtimeBinding.plan);
  runtimeBinding.binding_digest = digest({pinManifest: runtimeBinding.checker_manifest, environment: runtimeBinding.environment,
    plan_hash: runtimeBinding.plan_hash, artifact_bindings: runtimeBinding.artifact_bindings});
  const revisions = {A1: hash('current revision')};
  const failure = {artifact_revisions: revisions, binding_digest: runtimeBinding.binding_digest, environment: runtimeBinding.environment,
    source_sha256: hash('source'), catalog_sha256: hash('catalog'), public_evidence: [{check_id: 'public.check', executed: true,
      outcome_uncertain: false, artifact_revisions: clone(revisions), runtime_binding: {binding_digest: runtimeBinding.binding_digest,
        checker_manifest_sha256: digest(runtimeBinding.checker_manifest), plan_hash: runtimeBinding.plan_hash,
        environment_fingerprint: runtimeBinding.environment.fingerprint},
      evidence: {error: null, assertion_contract_sha256: assertionContract.sha256, cases: [failed, passed]}}]};
  const request = {model: 'jev-latest', questions: {choose: {type: 'choice', instructions: 'Choose existing owner', criteria: {A1: null, unknown: 'Unknown'}}},
    state: {schema_version: 'adaptive-inferred-owner-input/v2', instructions: 'Original fixed owner instructions.',
      provenance: {source_sha256: failure.source_sha256, catalog_sha256: failure.catalog_sha256},
      public_gate: {case_count: 2, passed_count: 1, failed_count: 1}, detailed_failed_cases: [{check_id: 'public.check', testcase: clone(failed), original_requirement_ids: ['R-current']}],
      additional_observed_cases: [{check_id: 'public.check', testcase: clone(passed)}], original_requirements: [{id: 'R-current', text: 'Current requirement.'}],
      artifact_contracts: [{id: 'A1', paths: ['producer.py']}], unit_interfaces: [{id: 'U1', artifact_ids: ['A1'], requirement_ids: ['R-prior'], interface: 'Complete producer interface.'}],
      task_dependencies: [], evidence_quotes: [], causal_paths: [], repair_history: {entries: [{
        failures_before: [{check_id: 'public.check', test_id: 'T.prior', assertion_id: 'A.prior', error_type: 'AssertionError',
          message: 'Expected REQUEST, got SCHEMA.', description_provenance: oldDiagnostic}], failures_after: [],
        resolved_failure_keys: ['public.check/T.prior/A.prior'], unobserved_failure_keys: [], relevant_revisions: {A1: {after: revisions.A1}}}]}}};
  return {request, context: {failure, assertionContract, runtimeBinding}};
}

test('resolved-unrelated projection retains current failed/not-reached facts and reconstructs every original field', () => {
  const {request, context} = ownerFixture();
  const result = projectRepairDecisionRequest(request, {stage: 'repair_owners', relevanceContext: context});
  assert.equal(result.report.semantic_values_removed, 2); assert.equal(result.report.lossless_model_input, false);
  assert.deepEqual(result.request.state.detailed_failed_cases, request.state.detailed_failed_cases);
  assert.deepEqual(result.request.questions, request.questions); assert.deepEqual(result.request.state.public_gate, request.state.public_gate);
  assert.equal(result.request.state.repair_history.entries[0].failures_before[0].message, 'Expected REQUEST, got SCHEMA.');
  assert.deepEqual(restoreRepairDecisionRequest(result.request, result.report), request);
  assert.equal(validateRepairInputState(result.request.state).relevance_policy, 'resolved-unrelated-v1');
  verifyRepairInputOverride(request, result);
});

test('uncertain relation, stale revision, missing contract mapping and new source relation keep full historical diagnostics', () => {
  const changes = [
    ({request}) => {request.state.repair_history.entries[0].relevant_revisions.A1.after = hash('stale');},
    ({request}) => {request.state.repair_history.entries[0].resolved_failure_keys = [];},
    ({request}) => {request.state.detailed_failed_cases[0].original_requirement_ids.push('R-prior');},
    ({request}) => {request.state.repair_history.entries[0].failures_before[0].unknown_field = 'must stay';},
  ];
  for (const change of changes) {
    const fixture = ownerFixture(); change(fixture);
    const result = projectRepairDecisionRequest(fixture.request, {stage: 'repair_owners', relevanceContext: fixture.context});
    assert.equal(result.report.semantic_values_removed, 0);
    assert.deepEqual(restoreRepairDecisionRequest(result.request, result.report), fixture.request);
  }
  const fixture = ownerFixture(), text = 'def producer():\n    return 1';
  const evidence = [{schema_version: 'adaptive-repair-source-evidence/v1', kind: 'static_source_observation', artifact_id: 'A1',
    path: 'producer.py', revision: fixture.context.failure.artifact_revisions.A1, sha256: hash(text), ranges: [{start_line: 1, end_line: 2, text}]}];
  const related = projectRepairDecisionRequest(fixture.request, {stage: 'repair_owners', relevanceContext: fixture.context, recoveryEvidence: evidence});
  assert.equal(related.report.semantic_values_removed, 0);
  assert(related.report.source_evidence_projection.omitted_line_count > 0);
  assert.equal(related.report.lossless_model_input, false);
  const stale = clone(fixture.context); stale.runtimeBinding.environment.fingerprint = hash('other env');
  assert.throws(() => projectRepairDecisionRequest(fixture.request, {stage: 'repair_owners', relevanceContext: stale}), {code: 'REPAIR_INPUT_RELEVANCE_BINDING'});
});

test('exact observation references reject invented refs and source/override mutation before dispatch', async () => {
  const {request} = ownerFixture();
  const result = projectRepairDecisionRequest(request, {stage: 'repair_owners'});
  assert.equal(result.report.lossless_model_input, true);
  assert(Object.keys(result.request.state.repair_input_shared_evidence).length);
  const bad = clone(result); bad.request.state.additional_observed_cases[0].testcase.description_provenance.same_as = 'invented';
  assert.throws(() => validateRepairInputState(bad.request.state), {code: 'REPAIR_INPUT_UNKNOWN_REFERENCE'});
  assert.throws(() => verifyRepairInputOverride(request, bad), {code: 'REPAIR_INPUT_PROOF_BINDING'});
  const recovery = createRepairInputRecovery();
  const rebuilt = await recovery({action: 'rebuild_relevant_input', stage: 'repair_owners', failed_request: request});
  if (rebuilt.status === 'ready') {
    verifyRepairInputOverride(request, rebuilt.input_rebuild);
    const wrong = clone(rebuilt.input_rebuild); wrong.recovery.source_coverage_sha256 = hash('wrong');
    assert.throws(() => verifyRepairInputOverride(request, wrong), {code: 'REPAIR_INPUT_RECOVERY_BINDING'});
  }
  assert.equal((await recovery({action: 'rebuild_relevant_input', stage: 'repair_owners', failed_request: result.request})).status, 'needs_evidence');
});

test('generic no-write source collection verifies current bytes and captures the actual producer/import consumer without widening writes', async () => {
  const sources = [{artifact_id: 'parser', path: 'pkg/parser.py', text: 'def parse(value):\n    return value\n'},
    {artifact_id: 'output', path: 'pkg/output.py', text: 'from pkg.parser import parse\ndef build(value):\n    return parse(value)\n'}]
    .map(row => ({...row, revision: hash(row.artifact_id), sha256: hash(row.text)}));
  const input = {sourceFiles: sources, planning: {plan: {artifacts: sources.map(row => ({id: row.artifact_id})), tasks: [
    {id: 'output-task', kind: 'implementation', input_artifact_ids: ['parser'], output_artifact_ids: ['output']}]}},
    artifactBindings: Object.fromEntries(sources.map(row => [row.artifact_id, {paths: [row.path]}])),
    failure: {artifact_revisions: Object.fromEntries(sources.map(row => [row.artifact_id, row.revision])), public_evidence: [{check_id: 'public.output',
      evidence: {cases: [{test_id: 'T.output', status: 'failed', message: "module 'generated.output' has no attribute 'Required'"}]}}]},
    previous_action: {artifact_ids: ['parser']}, repair_history: {entries: [{selected_but_unchanged_artifact_ids: ['parser']}]}};
  const result = collectRepairSourceEvidence(input);
  assert.equal(result.status, 'ready'); assert.deepEqual(result.evidence.map(row => row.path), sources.map(row => row.path));
  assert(result.evidence.some(row => row.relations.some(relation => relation.basis === 'literal_source_import')));
  for (const row of result.evidence) for (const range of row.ranges) assert.equal(range.text,
    sources.find(file => file.path === row.path).text.split('\n').slice(range.start_line - 1, range.end_line).join('\n'));
  assert.equal(collectRepairSourceEvidence({...input, failure: {...input.failure, recovery_evidence: result.evidence}}).status, 'needs_evidence');
  const wrong = clone(input); wrong.sourceFiles[0].text += '# drift';
  assert.throws(() => collectRepairSourceEvidence(wrong), {code: 'REPAIR_SOURCE_BINDING'});
  const callback = createRepairInputRecovery();
  for (const action of ['collect_missing_decision_evidence', 'inspect_new_failure_path', 'inspect_no_write_cause']) {
    assert.equal((await callback({...input, action})).status, 'ready');
  }
});
