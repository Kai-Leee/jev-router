import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildArtifactRepairDecisionContext as decisionV1, buildArtifactRepairWorkerContext as workerV1} from '../src/orchestration/adaptive-artifact-repair.mjs';
import {buildArtifactRepairDecisionContext, buildArtifactRepairWorkerContext} from '../src/orchestration/adaptive-artifact-repair-v2.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
function fixture() {
  const catalog = {source_sha256: hash('public source'), units: ['cli', 'other', 'dep'].map(id => ({id: `U-${id}`, title: id,
    artifact_ids: [`A-${id}`], requirement_ids: [`R-${id}`], interface: `Exact ${id} interface.`, evidence_ids: [`E-${id}`]})),
  artifacts: ['cli', 'other', 'dep'].map(id => ({id: `A-${id}`, paths: [`${id}.py`], evidence_ids: [`E-${id}`]})),
  evidence: ['cli', 'other', 'dep'].map(id => ({id: `E-${id}`, quote: `Original ${id} source.`}))};
  const task = {id: 'owner', kind: 'implementation', output_artifact_ids: ['A-cli', 'A-other'], input_artifact_ids: ['A-dep'],
    requirement_ids: ['R-cli', 'R-other'], write_scope: ['cli.py', 'other.py'], read_scope: ['dep.py'], check_ids: ['local-cli', 'local-other']};
  const planning = {catalog, source_sha256: catalog.source_sha256, catalog_sha256: hash(JSON.stringify(catalog)),
    requirement_descriptions: ['cli', 'other', 'dep'].map(id => ({id: `R-${id}`, text: `Entire ${id} requirement.`, source_refs: ['public-spec']})),
    plan: {tasks: [task, {id: 'dependency', kind: 'implementation', output_artifact_ids: ['A-dep'], input_artifact_ids: [], requirement_ids: ['R-dep']}],
      artifacts: catalog.artifacts.map(artifact => ({id: artifact.id, producer_task_id: artifact.id === 'A-dep' ? 'dependency' : 'owner'})),
      checks: ['cli', 'other'].map(id => ({id: `local-${id}`, artifact_ids: [`A-${id}`]}))}};
  const revisions = Object.fromEntries(catalog.artifacts.map(item => [item.id, hash(item.id)]));
  const cases = Array.from({length: 8}, (_, i) => ({test_id: `test-${i}`, status: 'passed', assertions: i + 1}));
  cases.push({test_id: 'diagnostics', status: 'failed', assertions: 4, error_type: 'AssertionError', message: 'existing output refused',
    failed_assertion_id: 'A.output', assertion_results: [{assertion_id: 'A.output', status: 'failed'}, {assertion_id: 'A.next', status: 'not_reached'}],
    explicit_null: null, unknown_semantic: {nested: ['unchanged', null]}});
  const failure = {status: 'failed', outcome_uncertain: false, code: 'ARTIFACT_CHECK_NOT_PASSED',
    source_sha256: planning.source_sha256, catalog_sha256: planning.catalog_sha256, graph_revision: 'round0',
    artifact_revisions: revisions, binding_digest: hash('binding'), environment: {id: 'public', fingerprint: hash('env')},
    repair_scope: {observed_failures: [{assertion_id: 'A.output', requirement_ids: ['R-cli'], artifact_ids: ['A-cli'],
      source_ref: {contract_sha256: hash('assertion-contract')}, artifact_revisions: {'A-cli': revisions['A-cli']}}],
    not_reached_assertions: [{assertion_ids: ['A.next']}], fallback_required: false},
    local_evidence: ['cli', 'other'].map(id => ({check_id: `local-${id}`, task_id: 'owner', status: 'passed', executed: true,
      exit_code: 0, skipped: 0, assertions: 2, outcome_uncertain: false, evidence: {error: null}, artifact_revisions: revisions})),
    public_evidence: [{check_id: 'public-cli', check_version: '3', environment_ref: 'public', status: 'failed', executed: true, exit_code: 1,
      assertions: 40, skipped: 0, outcome_uncertain: false, artifact_revisions: revisions,
      runtime_binding: {binding_digest: hash('binding'), plan_hash: hash('plan'), environment_fingerprint: hash('env')},
      evidence_key: hash('public'), evidence: {cases, unexecuted_test_ids: ['test-never-run'], test_ids: [...cases.map(c => c.test_id), 'test-never-run'],
        error: null, source_extension: {preserve: ['unknown data', null]}}}]};
  const candidate = {id: 'repair-cli', task_ids: ['owner'], artifact_ids: ['A-cli'], reason: 'A public interface candidate, not proof of fault.'};
  return {planning, failure, candidate, candidates: [candidate], task,
    artifactBindings: Object.fromEntries(catalog.artifacts.map(item => [item.id, {paths: item.paths}]))};
}

function decodeTable(value) {
  if (Array.isArray(value)) return value;
  return value.rows.map(row => Object.assign(Object.fromEntries(value.columns.slice(0, -1).map((key, i) => [key, row[i]])), row.at(-1)));
}
function restoredEvidence(failure, key) {
  return failure[key].map(item => ({...failure[`${key}_defaults`], ...item}));
}
function pointer(value, path) { return path.split('/').slice(1).reduce((item, key) => item[key], value); }

test('v2 preserves public cases, missing/null/unknown fields and exact candidates without mutating inputs', () => {
  const input = fixture(), original = copy(input), built = buildArtifactRepairDecisionContext(input);
  const publicEvidence = restoredEvidence(built.state.failure, 'public_evidence')[0].evidence;
  assert.deepEqual(decodeTable(publicEvidence.cases), input.failure.public_evidence[0].evidence.cases);
  assert.deepEqual(publicEvidence.unexecuted_test_ids, ['test-never-run']);
  assert.deepEqual(publicEvidence.source_extension, input.failure.public_evidence[0].evidence.source_extension);
  assert.deepEqual(built.state.candidates, input.candidates);
  assert.deepEqual(built.state.requirement_descriptions, [input.planning.requirement_descriptions[0]]);
  assert.deepEqual(built.state.units, [input.planning.catalog.units[0]]);
  assert.deepEqual(restoredEvidence(built.state.failure, 'local_evidence'), input.failure.local_evidence.map(({artifact_revisions, ...semantic}) => semantic));
  assert.equal(built.report.public_case_count, 9);
  assert.equal(built.state.context_ref.access, 'controller_only');
  assert.deepEqual(input, original);
  const missing = fixture(); delete missing.failure.public_evidence[0].evidence.cases[0].assertions;
  const m = buildArtifactRepairDecisionContext(missing);
  assert.deepEqual(restoredEvidence(m.state.failure, 'public_evidence')[0].evidence.cases, missing.failure.public_evidence[0].evidence.cases);
});

test('every omitted input/legacy pointer resolves to its recorded original SHA; source changes bind a new context', () => {
  const input = fixture(), old = decisionV1(input), built = buildArtifactRepairDecisionContext(input);
  for (const entry of built.report.omitted_metadata) {
    const value = pointer(entry.origin === 'input' ? input : old.state, entry.pointer);
    assert.equal(hash(JSON.stringify(value)), entry.sha256, entry.pointer);
    assert.equal(Buffer.byteLength(JSON.stringify(value)), entry.utf8_bytes);
  }
  assert.equal(hash(JSON.stringify(built.report.binding_ref)), built.state.context_ref.sha256);
  const changed = copy(input); changed.failure.artifact_revisions['A-cli'] = hash('new immutable revision');
  for (const evidence of [...changed.failure.public_evidence, ...changed.failure.local_evidence]) evidence.artifact_revisions['A-cli'] = changed.failure.artifact_revisions['A-cli'];
  assert.notEqual(buildArtifactRepairDecisionContext(changed).state.context_ref.sha256, built.state.context_ref.sha256);
  const invalid = copy(input); invalid.artifactBindings['A-cli'].paths = ['other.py'];
  assert.throws(() => buildArtifactRepairDecisionContext(invalid), {code: 'ADAPTIVE_ARTIFACT_REPAIR_BINDING_MISMATCH'});
});

test('worker keeps exact authority, original selected requirements and complete declared dependency interfaces', () => {
  const input = fixture(), prior = workerV1(input), built = buildArtifactRepairWorkerContext(input);
  assert.deepEqual(built.task, prior.task);
  assert.deepEqual(built.context.requirement_descriptions, prior.context.requirement_descriptions);
  assert.deepEqual(built.context.evidence, prior.context.evidence);
  for (const dependency of decodeTable(built.context.read_only_dependencies)) {
    assert.equal(built.context.dependency_interfaces[dependency.unit_id], prior.context.read_only_dependencies.find(d => d.artifact_id === dependency.artifact_id).interface);
  }
  assert.deepEqual(built.context.allowed_write_paths, ['cli.py']);
  assert.deepEqual(built.context.readable_inherited_paths, ['other.py']);
  assert.equal(built.context.dependency_boundary.artifact_level_internal_dependencies, 'unknown');
  assert.equal(built.context.verification.all_public_checks, true);
  assert.equal(Object.hasOwn(built.context, 'candidates'), false);
  assert.equal(built.report.allowed_write_path_count, 1);
  assert.deepEqual(decodeTable(restoredEvidence(built.context.failure, 'public_evidence')[0].evidence.cases), input.failure.public_evidence[0].evidence.cases);
});

test('large or failed unfamiliar evidence remains exact and requires a complete-wire admission guard', () => {
  const input = fixture(), evidence = input.failure.public_evidence[0].evidence;
  evidence.setup_evidence = {exit_code: 1, console_script_exists: false, stdout: 'failure stdout', stderr: 'full stderr', error: {unknown: null}};
  evidence.source_extension.long = 'semantic payload '.repeat(3000);
  const built = buildArtifactRepairDecisionContext(input);
  const restored = restoredEvidence(built.state.failure, 'public_evidence')[0].evidence;
  assert.deepEqual(restored.setup_evidence, evidence.setup_evidence);
  assert.deepEqual(restored.source_extension, evidence.source_extension);
  assert.ok(built.report.packet_bytes > built.report.target_wire_bytes);
  assert.equal(built.report.wire_guard_required, true);
  assert.equal(built.report.wire_target_met, null);
  assert.equal(built.report.model_input_tokens, null);
  assert.equal(built.report.provider_acceptance, 'unmeasured');
  for (const key of ['public_evidence_defaults', 'local_evidence_defaults']) {
    const collision = fixture(); collision.failure[key] = {unknown_semantic: 'must not be overwritten'};
    const before = copy(collision);
    assert.throws(() => buildArtifactRepairDecisionContext(collision), error =>
      error.code === 'ADAPTIVE_ARTIFACT_REPAIR_ENCODING_COLLISION' && error.outcome_uncertain === false);
    assert.deepEqual(collision, before);
  }
});
