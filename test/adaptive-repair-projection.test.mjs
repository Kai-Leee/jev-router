import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {projectAdaptiveRepairFailure, restoreAdaptiveRepairFailure,
  projectAdaptiveRepairState, restoreAdaptiveRepairState, projectAdaptiveRepairRequest} from '../src/orchestration/adaptive-repair-projection.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
function stateFixture() {
  const revisions = {A1: 'a'.repeat(64), A2: 'b'.repeat(64)};
  const runtime_binding = {binding_digest: 'binding-1', checker_manifest_sha256: 'c'.repeat(64),
    environment_fingerprint: 'environment-1', plan_hash: 'd'.repeat(64)};
  const common = {check_version: '1', environment_ref: 'env-1', executed: true, assertions: 2, skipped: 0, outcome_uncertain: false};
  const checks = ['check-one', 'check-two'].map((check_id, index) => {
    const status = index ? 'failed' : 'passed', exit_code = index ? 1 : 0;
    return {...common, check_id, status, exit_code,
      evidence: {...common, check_id, status, exit_code,
        cases: [{test_id: `T.R${index + 1}`, status, assertions: 2, ...(index ? {error_type: 'AssertionError', message: 'Expected exact body description.'} : {})}],
        unexecuted_test_ids: index ? ['T.R3'] : [], error: index ? {type: 'FixtureError', message: 'Cannot generate', traceback: 'File /app/naming.py, line 52\nbad character range'} : null,
        setup_evidence: {exit_code: 0, source_root: '/tmp/example/source', python: '/tmp/example/venv/bin/python',
          console_script_exists: true, stderr: index ? 'A retained diagnostic warning' : '',
          stdout: 'Obtaining file:///tmp/example/source\nSuccessfully built pyclientgen\nSuccessfully installed pyclientgen-0.1.0\n'},
        report_ref: `reports/${check_id}.json`, process_ref: `calls/${check_id}.json`, semantic_setup_blocker: index ? {artifact_id: 'A2', cause: 'regex syntax'} : null,
        unknown_future_evidence: {retained: true}},
      artifact_revisions: structuredClone(revisions), runtime_binding: structuredClone(runtime_binding), evidence_key: sha(check_id)};
  });
  const units = [{id: 'U1', title: 'CLI', interface: 'run(args) -> generated files', artifact_ids: ['A1'], requirement_ids: ['R1'], evidence_ids: ['E1']},
    {id: 'U2', title: 'Naming', interface: 'name(value) -> valid identifier', artifact_ids: ['A2'], requirement_ids: ['R2'], evidence_ids: ['E2']}];
  return {source_sha256: 'source-1', catalog_sha256: 'catalog-1', graph_revision: 'graph-1', units,
    artifacts: [{id: 'A1', paths: ['cli.py']}, {id: 'A2', paths: ['naming.py']}],
    evidence: [{id: 'E1', quote: 'Generate a client.'}, {id: 'E2', quote: 'Preserve semantic names.'}],
    requirement_descriptions: [{id: 'R1', text: 'CLI'}, {id: 'R2', text: 'Names'}],
    leaves: units.map(unit => ({id: `leaf-${unit.id}`, unit_ids: [unit.id], artifact_ids: unit.artifact_ids,
      interfaces: [{unit_id: unit.id, title: unit.title, interface: unit.interface}]})),
    execution_context: {profile_id: 'opus55-medium'}, relations: [], candidates: [{id: 'fix-names', task_ids: ['leaf-U2'], reason: 'repair observed naming blocker', evidence_refs: ['check-two']}],
    failure: {status: 'failed', outcome_uncertain: false, code: 'ARTIFACT_CHECK_NOT_PASSED',
      source_sha256: 'source-1', catalog_sha256: 'catalog-1', graph_revision: 'graph-1:round0', binding_digest: 'binding-1',
      environment: {id: 'env-1', fingerprint: 'environment-1', observed: {python: '3.11', modules: {attrs: {version: '1'}}}},
      artifact_revisions: revisions, public_evidence: checks, local_evidence: [], failed_task_ids: [], undispatched_task_ids: [],
      additional_failure_details: {severity: 'important', preserve: true}}, limits: {max_repair_attempts: 2}};
}
function originalLogs(state) {
  return {omitted_stdout: Object.fromEntries([...state.failure.public_evidence, ...state.failure.local_evidence]
    .map(check => check.evidence.setup_evidence?.stdout).filter(value => typeof value === 'string').map(value => [sha(value), value]))};
}

test('projection preserves decision facts exactly and exposes every non-log reference inline', () => {
  const original = stateFixture(), before = structuredClone(original);
  const {state, report} = projectAdaptiveRepairState(original);
  assert.deepEqual(original, before);
  for (const field of ['candidates', 'units', 'artifacts', 'evidence', 'requirement_descriptions', 'execution_context', 'relations']) {
    assert.deepEqual(state[field], original[field], field);
  }
  assert.deepEqual(state.failure.environment, original.failure.environment);
  assert.deepEqual(state.failure.additional_failure_details, original.failure.additional_failure_details);
  for (let i = 0; i < original.failure.public_evidence.length; i++) {
    const a = original.failure.public_evidence[i].evidence, b = state.failure.public_evidence[i].evidence;
    for (const key of ['cases', 'error', 'unexecuted_test_ids', 'semantic_setup_blocker', 'unknown_future_evidence']) assert.deepEqual(b[key], a[key], key);
    assert.equal(b.setup_evidence.stderr, a.setup_evidence.stderr);
    assert.equal(b.setup_evidence.python, a.setup_evidence.python);
    assert.equal(b.setup_evidence.stdout_omitted.sha256, sha(a.setup_evidence.stdout));
  }
  assert.equal(report.lossless_roundtrip, false);
  assert.equal(report.decision_evidence_preserved, true);
  assert.equal(report.model_input_tokens, null);
  assert.throws(() => restoreAdaptiveRepairState(state), {code: 'ADAPTIVE_REPAIR_PROJECTION_OMITTED_LOG_REQUIRED'});
  assert.deepEqual(restoreAdaptiveRepairState(state, originalLogs(original)), original);
});

test('mismatched revision, environment, runtime, mirrored status or leaf interface rejects before dispatch', () => {
  for (const mutate of [
    s => { s.failure.public_evidence[0].artifact_revisions.A2 = 'wrong'; },
    s => { s.failure.public_evidence[0].artifact_revisions.unknown = 'wrong'; },
    s => { s.failure.public_evidence[0].environment_ref = 'other'; },
    s => { s.failure.public_evidence[0].runtime_binding.environment_fingerprint = 'other'; },
    s => { s.failure.public_evidence[1].runtime_binding.plan_hash = 'other'; },
    s => { s.failure.public_evidence[0].evidence.exit_code = 9; },
    s => { s.leaves[0].interfaces[0].interface = 'invented'; },
    s => { s.failure.source_sha256 = 'other'; },
  ]) {
    const state = stateFixture(); mutate(state); const before = structuredClone(state);
    assert.throws(() => projectAdaptiveRepairState(state), {code: 'ADAPTIVE_REPAIR_PROJECTION_BINDING_MISMATCH'});
    assert.deepEqual(state, before);
  }
});

test('failed or unrecognized setup stdout remains inline including misleading zero exits', () => {
  for (const [exit, stdout] of [[1, 'Traceback\nFile /app/naming.py\nRegexError: bad character range'],
    [0, 'Successfully installed pyclientgen-0.1.0\nTraceback: semantic setup blocker'],
    [0, 'A new installer format with evidence we have not classified']]) {
    const original = stateFixture(); const setup = original.failure.public_evidence[0].evidence.setup_evidence;
    setup.exit_code = exit; setup.stdout = stdout;
    const {failure} = projectAdaptiveRepairFailure(original.failure);
    assert.equal(failure.public_evidence[0].evidence.setup_evidence.stdout, stdout);
    assert.equal(failure.public_evidence[0].evidence.setup_evidence.stdout_omitted, undefined);
    assert.deepEqual(restoreAdaptiveRepairFailure(failure, originalLogs(original)), original.failure);
  }
});

test('narrowed unit projection retains unavailable leaf interfaces while validating available ones', () => {
  const original = stateFixture(); original.units = original.units.slice(0, 1);
  const {state, report} = projectAdaptiveRepairState(original);
  assert.equal(report.leaf_interface_references, 1);
  assert.deepEqual(state.leaves[1], original.leaves[1]);
  assert.deepEqual(restoreAdaptiveRepairState(state, originalLogs(original)), original);
});

test('unknown references, collisions and tampered omitted logs cannot silently reconstruct', () => {
  const original = stateFixture();
  for (const mutate of [
    s => { s.failure.public_evidence[0].check_defaults_ref = 'absent'; },
    s => { s.failure.public_evidence[0].runtime_binding_ref = 'absent'; },
    s => { s.failure.public_evidence[0].artifact_revision_ids = ['absent']; },
    s => { s.leaves[0].unit_ids = ['absent']; },
    s => { s.failure.public_evidence[0].evidence.setup_evidence.stdout_omitted.sha256 = 'bad'; },
  ]) {
    const {state} = projectAdaptiveRepairState(original); mutate(state);
    assert.throws(() => restoreAdaptiveRepairState(state, originalLogs(original)), error => error.code.startsWith('ADAPTIVE_REPAIR_PROJECTION_'));
  }
  const collision = stateFixture(); collision.failure.public_evidence[0].artifact_revision_ids = ['A1'];
  assert.throws(() => projectAdaptiveRepairState(collision), {code: 'ADAPTIVE_REPAIR_PROJECTION_INVALID'});
});

test('wire measurement uses client serialization and preserves model, questions and option text', () => {
  const request = {model: 'jev-latest', state: stateFixture(), questions: {repair: {type: 'choice',
    instructions: 'Select an evidence-backed repair scope.', criteria: {repair_names: 'Repair naming.py', stop: 'Stop without changing artifacts'}}}};
  const {request: projected, report} = projectAdaptiveRepairRequest(request);
  assert.equal(projected.model, request.model);
  assert.deepEqual(projected.questions, request.questions);
  assert.equal(report.input_wire_bytes, Buffer.byteLength(prepareDecision(request).serialized, 'utf8'));
  assert.equal(report.projected_wire_bytes, Buffer.byteLength(prepareDecision(projected).serialized, 'utf8'));
  assert.equal(report.wire_bytes_removed, report.input_wire_bytes - report.projected_wire_bytes);
  assert.equal(report.provider_acceptance, 'unmeasured');
});

test('unpublished local revisions retain per-attempt provenance without becoming exported revisions', () => {
  const localFailure = () => {
    const failure = stateFixture().failure;
    const check = failure.public_evidence[1];
    check.task_id = 'build-names'; check.attempt_id = 'build-names:attempt-1';
    check.evidence.artifact_revisions = structuredClone(check.artifact_revisions);
    failure.task_attempt_ids = {[check.task_id]: check.attempt_id};
    failure.public_evidence = []; failure.local_evidence = [check];
    failure.artifact_revisions = {};
    return failure;
  };
  const original = localFailure();
  const {failure, report} = projectAdaptiveRepairFailure(original);
  assert.deepEqual(failure.artifact_revisions, {});
  assert.deepEqual(failure.local_evidence[0].artifact_revisions, original.local_evidence[0].artifact_revisions);
  assert.deepEqual(failure.local_evidence[0].evidence.artifact_revisions, original.local_evidence[0].evidence.artifact_revisions);
  assert.equal(failure.local_evidence[0].task_id, 'build-names');
  assert.equal(failure.local_evidence[0].attempt_id, 'build-names:attempt-1');
  assert.equal(report.unpublished_local_revision_maps_preserved, 1);
  assert.deepEqual(restoreAdaptiveRepairFailure(failure, originalLogs({failure: original})), original);
  for (const mutate of [
    f => { f.task_attempt_ids['build-names'] = 'unrelated-attempt'; },
    f => { delete f.local_evidence[0].runtime_binding; },
    f => { f.artifact_revisions.A1 = 'contradictory-exported-hash'; },
    f => { f.local_evidence[0].evidence.artifact_revisions.A1 = 'contradictory-report-hash'; },
    f => { f.public_evidence = f.local_evidence; f.local_evidence = []; },
  ]) {
    const bad = localFailure(); mutate(bad);
    assert.throws(() => projectAdaptiveRepairFailure(bad), {code: 'ADAPTIVE_REPAIR_PROJECTION_BINDING_MISMATCH'});
  }
});
