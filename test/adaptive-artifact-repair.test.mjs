import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildArtifactRepairDecisionContext, buildArtifactRepairWorkerContext} from '../src/orchestration/adaptive-artifact-repair.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
function fixture() {
  const source = 'Preserve CLI behavior. Preserve packaging. Preserve names. Read the dependency contract.';
  const units = ['cli', 'package', 'names', 'dependency'].map((id, index) => ({id: `U-${id}`, title: id,
    artifact_ids: [`A-${id}`], requirement_ids: [`R-${id}`], interface: `${id}(input) -> stable output`, evidence_ids: [`E${index}`]}));
  const artifacts = units.map(unit => ({id: unit.artifact_ids[0], paths: [`${unit.title}.mjs`], description: unit.title, evidence_ids: unit.evidence_ids}));
  const catalog = {schema_version: 'adaptive-catalog/v1', source_sha256: hash(source), units, artifacts,
    evidence: units.map((unit, index) => ({id: `E${index}`, quote: source.split('. ')[index]}))};
  const tasks = [{id: 'large-task', kind: 'implementation', output_artifact_ids: artifacts.slice(0, 3).map(a => a.id), input_artifact_ids: ['A-dependency'],
    requirement_ids: ['R-cli', 'R-package', 'R-names'], write_scope: ['cli.mjs', 'package.mjs', 'names.mjs'], read_scope: ['dependency.mjs'],
    check_ids: ['check-cli', 'check-package', 'check-names']},
  {id: 'dependency-task', kind: 'implementation', output_artifact_ids: ['A-dependency'], input_artifact_ids: [], requirement_ids: ['R-dependency'],
    write_scope: ['dependency.mjs'], read_scope: [], check_ids: []}];
  const plan = {tasks, artifacts: artifacts.map(a => ({id: a.id, producer_task_id: a.id === 'A-dependency' ? 'dependency-task' : 'large-task'})),
    checks: artifacts.map(a => ({id: `check-${a.description}`, artifact_ids: [a.id]}))};
  const planning = {plan, catalog, source_sha256: hash(source), catalog_sha256: hash(JSON.stringify(catalog)),
    requirement_descriptions: units.map(u => ({id: u.requirement_ids[0], text: `Complete original ${u.title} requirement.`, source_refs: ['public-spec']})),
    execution_context: {profile_id: 'fixed-worker'}};
  const artifactBindings = Object.fromEntries(artifacts.map(a => [a.id, {paths: a.paths}]));
  const revisions = Object.fromEntries(artifacts.map(a => [a.id, hash(a.id)]));
  const failure = {status: 'failed', outcome_uncertain: false, code: 'ARTIFACT_CHECK_NOT_PASSED',
    source_sha256: planning.source_sha256, catalog_sha256: planning.catalog_sha256, graph_revision: 'round0', binding_digest: 'binding',
    environment: {id: 'local', fingerprint: 'fingerprint'}, artifact_revisions: revisions,
    repair_scope: {observed_failures: [{assertion_id: 'assert-cli', requirement_ids: ['R-cli'], artifact_ids: ['A-cli']}], fallback_required: false},
    local_evidence: [], public_evidence: [{check_id: 'public-cli', check_version: '1', environment_ref: 'local',
      status: 'failed', executed: true, exit_code: 1, assertions: 1, skipped: 0, outcome_uncertain: false, artifact_revisions: revisions,
      runtime_binding: {binding_digest: 'binding', environment_fingerprint: 'fingerprint', plan_hash: hash('plan')}, evidence_key: hash('check'),
      evidence: {cases: [{test_id: 'T-cli', status: 'failed', message: 'existing output refused',
        assertion_results: [{assertion_id: 'assert-cli', status: 'failed'}, {assertion_id: 'assert-later', status: 'not_reached'}]}],
      unexecuted_test_ids: [], error: null, source_extension: {retained: 'unknown fields remain inline'}}}]};
  const candidate = {id: 'repair-cli', task_ids: ['large-task'], artifact_ids: ['A-cli'], reason: 'Repair the observed CLI assertion.', evidence_refs: ['assertion:assert-cli']};
  return {planning, failure, candidates: [candidate], candidate, task: tasks[0], artifactBindings};
}

test('artifact packet preserves full selected requirements, failure assertions and explicit dependency contracts', () => {
  const input = fixture(), before = structuredClone(input);
  const {state, report} = buildArtifactRepairDecisionContext(input);
  assert.deepEqual(input, before);
  assert.deepEqual(state.requirement_descriptions, [input.planning.requirement_descriptions[0]]);
  assert.deepEqual(state.units, [input.planning.catalog.units[0]]);
  assert.deepEqual(state.artifacts, [input.planning.catalog.artifacts[0]]);
  assert.deepEqual(state.failure.public_evidence[0].evidence.cases, input.failure.public_evidence[0].evidence.cases);
  assert.deepEqual(state.failure.public_evidence[0].evidence.source_extension, {retained: 'unknown fields remain inline'});
  assert.equal(state.read_only_dependencies[0].interface, input.planning.catalog.units[3].interface);
  assert.deepEqual(state.inherited_same_owner_artifacts.map(a => a.artifact_id), ['A-package', 'A-names']);
  assert.equal(state.dependency_boundary.artifact_level_internal_dependencies, 'unknown');
  assert.equal(report.full_task_requirement_count, 3);
  assert.equal(report.supplied_requirement_count, 1);
  assert.equal(report.model_input_tokens, null);
});

test('worker receives narrow writes and can read inherited same-owner files without reassignment', () => {
  const input = fixture();
  const {task, context, report} = buildArtifactRepairWorkerContext(input);
  assert.deepEqual(task.write_scope, ['cli.mjs']);
  assert.deepEqual(task.output_artifact_ids, ['A-cli']);
  assert.deepEqual(task.requirement_ids, ['R-cli']);
  assert.deepEqual(task.read_scope, ['dependency.mjs', 'package.mjs', 'names.mjs']);
  assert.deepEqual(context.selected_action, input.candidate);
  assert.equal(context.verification.all_public_checks, true);
  assert.equal(report.original_write_path_count, 3);
  assert.equal(report.allowed_write_path_count, 1);
  assert.deepEqual(input.task.write_scope, ['cli.mjs', 'package.mjs', 'names.mjs']);
});

test('wrong producer, paths, source provenance or absent original requirement fails closed', () => {
  for (const mutate of [
    input => { input.candidates[0].artifact_ids = ['A-dependency']; },
    input => { input.artifactBindings['A-cli'].paths = ['names.mjs']; },
    input => { input.failure.catalog_sha256 = hash('other'); },
    input => { input.planning.requirement_descriptions = []; },
  ]) {
    const input = fixture(); mutate(input);
    assert.throws(() => buildArtifactRepairDecisionContext(input), error => error.code.startsWith('ADAPTIVE_ARTIFACT_REPAIR_') && error.outcome_uncertain === false);
  }
});

test('full-task fallback is explicit and failures outside the chosen artifact keep their requirement text', () => {
  const input = fixture();
  input.failure.repair_scope.observed_failures.push({requirement_ids: ['R-names'], artifact_ids: ['A-names'], evidence_level: 'case'});
  let projected = buildArtifactRepairDecisionContext(input);
  assert.deepEqual(projected.state.requirement_descriptions.map(r => r.id), ['R-cli', 'R-names']);
  input.candidates[0].artifact_ids = [...input.task.output_artifact_ids];
  input.failure.artifact_repair_fallback = {reason: 'ASSERTION_ARTIFACT_MAPPING_UNAVAILABLE', scope: 'all_outputs_of_selected_tasks'};
  projected = buildArtifactRepairDecisionContext(input);
  assert.deepEqual(projected.state.failure.artifact_repair_fallback, input.failure.artifact_repair_fallback);
  assert.equal(projected.report.selected_artifact_count, 3);
  assert.equal(projected.report.supplied_requirement_count, 3);
});
