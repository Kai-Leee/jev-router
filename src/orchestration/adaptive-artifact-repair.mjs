import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {projectAdaptiveRepairFailure} from './adaptive-repair-projection.mjs';

const contractPath = 'docs/orchestration/contracts/adaptive-artifact-repair.v1.json';
const contractBytes = readFileSync(new URL(`../../${contractPath}`, import.meta.url));
const contract = JSON.parse(contractBytes);
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = values => [...new Set(values)];
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };
const requireValue = (condition, code = 'ADAPTIVE_ARTIFACT_REPAIR_INVALID') => { if (!condition) fail(code); };
const ids = value => Array.isArray(value) && value.every(id => typeof id === 'string' && id.length) && unique(value).length === value.length;
const sameSet = (a, b) => ids(a) && ids(b) && a.length === b.length && a.every(id => b.includes(id));
const safePath = path => typeof path === 'string' && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(path)
  && !path.split('/').some(part => ['.', '..', '.git', '.env', '.claude', '.codex', '.agents'].includes(part));

function checkedInputs({planning, failure, candidates, artifactBindings}) {
  requireValue(object(planning?.plan) && object(planning.catalog) && Array.isArray(planning.requirement_descriptions)
    && object(artifactBindings) && Array.isArray(candidates) && candidates.length > 0 && object(failure));
  requireValue(planning.catalog_sha256 === hash(JSON.stringify(planning.catalog))
    && planning.catalog_sha256 === failure.catalog_sha256
    && planning.source_sha256 === planning.catalog.source_sha256 && planning.source_sha256 === failure.source_sha256,
  'ADAPTIVE_ARTIFACT_REPAIR_SOURCE_MISMATCH');
  const {plan, catalog} = planning;
  requireValue(Array.isArray(plan.tasks) && Array.isArray(plan.artifacts) && Array.isArray(catalog.units)
    && Array.isArray(catalog.artifacts) && Array.isArray(catalog.evidence));
  const tasks = new Map(plan.tasks.filter(task => task.kind === 'implementation').map(task => [task.id, task]));
  const artifacts = new Map(catalog.artifacts.map(artifact => [artifact.id, artifact]));
  const unitByArtifact = new Map(), ownerByArtifact = new Map();
  requireValue(artifacts.size === catalog.artifacts.length && unique(catalog.units.map(unit => unit.id)).length === catalog.units.length);
  for (const task of tasks.values()) {
    requireValue(ids(task.output_artifact_ids) && ids(task.input_artifact_ids) && ids(task.requirement_ids));
    for (const id of task.output_artifact_ids) {
      requireValue(!ownerByArtifact.has(id), 'ADAPTIVE_ARTIFACT_REPAIR_OWNER_MISMATCH'); ownerByArtifact.set(id, task.id);
    }
  }
  for (const unit of catalog.units) {
    requireValue(ids(unit.artifact_ids) && ids(unit.requirement_ids) && ids(unit.evidence_ids) && typeof unit.interface === 'string');
    for (const id of unit.artifact_ids) {
      requireValue(artifacts.has(id) && !unitByArtifact.has(id), 'ADAPTIVE_ARTIFACT_REPAIR_CATALOG_MISMATCH'); unitByArtifact.set(id, unit);
    }
  }
  for (const artifact of artifacts.values()) {
    requireValue(Array.isArray(artifact.paths) && artifact.paths.length && artifact.paths.every(safePath)
      && sameSet(artifact.paths, artifactBindings[artifact.id]?.paths)
      && plan.artifacts.find(item => item.id === artifact.id)?.producer_task_id === ownerByArtifact.get(artifact.id)
      && unitByArtifact.has(artifact.id), 'ADAPTIVE_ARTIFACT_REPAIR_BINDING_MISMATCH');
  }
  requireValue(unique(candidates.map(candidate => candidate.id)).length === candidates.length);
  for (const candidate of candidates) {
    requireValue(ids(candidate.task_ids) && candidate.task_ids.length && ids(candidate.artifact_ids) && candidate.artifact_ids.length,
      'ADAPTIVE_ARTIFACT_REPAIR_CANDIDATE_INVALID');
    requireValue(candidate.task_ids.every(id => tasks.has(id))
      && candidate.artifact_ids.every(id => artifacts.has(id) && candidate.task_ids.includes(ownerByArtifact.get(id)))
      && candidate.task_ids.every(id => candidate.artifact_ids.some(artifact => ownerByArtifact.get(artifact) === id)),
    'ADAPTIVE_ARTIFACT_REPAIR_OWNER_MISMATCH');
  }
  return {tasks, artifacts, unitByArtifact, ownerByArtifact};
}

/** Pure, fully inline decision packet. It already applies the canonical failure
 * projection; do not pass this packet through the legacy leaf-state projector. */
export function buildArtifactRepairDecisionContext(input) {
  const {planning, failure, candidates, artifactBindings} = input;
  const {tasks, artifacts, unitByArtifact, ownerByArtifact} = checkedInputs(input);
  const selectedArtifactIds = unique(candidates.flatMap(candidate => candidate.artifact_ids));
  const taskIds = unique(candidates.flatMap(candidate => candidate.task_ids));
  const selectedUnitIds = unique(selectedArtifactIds.map(id => unitByArtifact.get(id).id));
  const units = planning.catalog.units.filter(unit => selectedUnitIds.includes(unit.id));
  const dependencyIds = unique(taskIds.flatMap(id => tasks.get(id).input_artifact_ids)).filter(id => !selectedArtifactIds.includes(id));
  requireValue(dependencyIds.every(id => artifacts.has(id)), 'ADAPTIVE_ARTIFACT_REPAIR_DEPENDENCY_MISMATCH');
  const failureRequirements = unique((failure.repair_scope?.observed_failures ?? []).flatMap(item => item.requirement_ids ?? []));
  const requirementIds = unique([...units.flatMap(unit => unit.requirement_ids), ...failureRequirements]);
  const requirements = planning.requirement_descriptions.filter(item => requirementIds.includes(item.id));
  requireValue(sameSet(requirementIds, requirements.map(item => item.id)), 'ADAPTIVE_ARTIFACT_REPAIR_REQUIREMENT_MISSING');
  const dependencyUnits = unique(dependencyIds.map(id => unitByArtifact.get(id).id));
  const evidenceIds = unique([...units, ...planning.catalog.units.filter(unit => dependencyUnits.includes(unit.id))].flatMap(unit => unit.evidence_ids)
    .concat([...selectedArtifactIds, ...dependencyIds].flatMap(id => artifacts.get(id).evidence_ids)));
  const evidence = planning.catalog.evidence.filter(item => evidenceIds.includes(item.id));
  requireValue(sameSet(evidenceIds, evidence.map(item => item.id)), 'ADAPTIVE_ARTIFACT_REPAIR_EVIDENCE_MISSING');
  const {failure: projectedFailure, report: failureReport} = projectAdaptiveRepairFailure(failure);
  const revision = id => failure.artifact_revisions[id] ?? null;
  const descriptor = id => ({artifact_id: id, owner_task_id: ownerByArtifact.get(id), paths: clone(artifactBindings[id].paths), revision: revision(id)});
  const inheritedIds = unique(taskIds.flatMap(id => tasks.get(id).output_artifact_ids)).filter(id => !selectedArtifactIds.includes(id));
  const state = {schema_version: contract.packet_version, source_projection: 'selected_artifacts_and_explicit_input_contracts',
    source_sha256: planning.source_sha256, catalog_sha256: planning.catalog_sha256, graph_revision: failure.graph_revision,
    contract_source: {path: contractPath, sha256: hash(contractBytes), schema_version: contract.schema_version},
    instructions: contract.decision_instructions, rules: clone(contract.rules),
    units: clone(units), artifacts: selectedArtifactIds.map(id => clone(artifacts.get(id))), requirement_descriptions: clone(requirements), evidence: clone(evidence),
    read_only_dependencies: dependencyIds.map(id => ({...descriptor(id), interface: clone(unitByArtifact.get(id).interface),
      unit_id: unitByArtifact.get(id).id, declared_for_task_ids: taskIds.filter(task => tasks.get(task).input_artifact_ids.includes(id))})),
    inherited_same_owner_artifacts: inheritedIds.map(descriptor),
    dependency_boundary: {basis: 'declared_task_inputs', artifact_level_internal_dependencies: 'unknown',
      inherited_files_readable: true, independence_claimed: false, scope_expansion_allowed: false},
    execution_context: clone(planning.execution_context ?? null), candidates: clone(candidates), failure: projectedFailure};
  return {state, report: {schema_version: 'adaptive-artifact-repair-report/v1', packet_bytes: bytes(state),
    selected_task_count: taskIds.length, selected_artifact_count: selectedArtifactIds.length, selected_unit_count: units.length,
    supplied_requirement_count: requirements.length, declared_dependency_artifact_count: dependencyIds.length,
    inherited_same_owner_artifact_count: inheritedIds.length,
    full_task_requirement_count: unique(taskIds.flatMap(id => tasks.get(id).requirement_ids)).length,
    full_task_output_artifact_count: unique(taskIds.flatMap(id => tasks.get(id).output_artifact_ids)).length,
    failure_projection: failureReport, provider_acceptance: 'unmeasured', model_input_tokens: null}};
}

/** Callback view only. The runtime retains the original DAG output coverage. */
export function buildArtifactRepairWorkerContext({planning, failure, candidate, task, artifactBindings}) {
  requireValue(candidate?.task_ids?.includes(task.id), 'ADAPTIVE_ARTIFACT_REPAIR_UNSELECTED_TASK');
  const original = planning.plan.tasks.find(item => item.id === task.id);
  requireValue(original && isDeepStrictEqual(original.output_artifact_ids, task.output_artifact_ids)
    && isDeepStrictEqual(original.write_scope, task.write_scope), 'ADAPTIVE_ARTIFACT_REPAIR_TASK_MISMATCH');
  checkedInputs({planning, failure, candidates: [candidate], artifactBindings});
  const artifactIds = candidate.artifact_ids.filter(id => task.output_artifact_ids.includes(id));
  const single = {...clone(candidate), task_ids: [task.id], artifact_ids: artifactIds};
  const {state, report} = buildArtifactRepairDecisionContext({planning, failure, candidates: [single], artifactBindings});
  const write_scope = artifactIds.flatMap(id => artifactBindings[id].paths);
  requireValue(write_scope.every(path => task.write_scope.includes(path)), 'ADAPTIVE_ARTIFACT_REPAIR_WRITE_MISMATCH');
  const inheritedIds = task.output_artifact_ids.filter(id => !artifactIds.includes(id));
  const read_scope = unique([...task.read_scope, ...inheritedIds.flatMap(id => artifactBindings[id].paths)]);
  const narrowed = {...clone(task), requirement_ids: unique(state.units.flatMap(unit => unit.requirement_ids)),
    output_artifact_ids: artifactIds, write_scope, read_scope,
    check_ids: task.check_ids.filter(id => planning.plan.checks.find(check => check.id === id)?.artifact_ids.some(id => artifactIds.includes(id)))};
  const context = {...state, instructions: contract.worker_instructions,
    selected_action: clone(candidate), worker_task_id: task.id, allowed_write_paths: write_scope,
    readable_inherited_paths: inheritedIds.flatMap(id => artifactBindings[id].paths),
    verification: {all_original_local_checks: true, all_public_checks: true, prior_certificates_reused: false}};
  return {task: narrowed, context, report: {...report, packet_bytes: bytes(context),
    original_write_path_count: task.write_scope.length, allowed_write_path_count: write_scope.length}};
}
