import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {buildAdaptiveRepairScope} from './adaptive-repair-scope.mjs';
import {buildArtifactRepairDecisionContext as buildDecisionV2,
  buildArtifactRepairWorkerContext as buildWorkerV2} from './adaptive-artifact-repair-v2.mjs';
import {projectCausalChooserPacket} from './adaptive-causal-packet-encoding.mjs';

const contractPath = 'docs/orchestration/contracts/adaptive-causal-repair.v1.json';
const contractBytes = readFileSync(new URL(`../../${contractPath}`, import.meta.url));
const contract = JSON.parse(contractBytes), clone = value => structuredClone(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const size = value => Buffer.byteLength(JSON.stringify(value));
const unique = values => [...new Set(values)];
const same = (left, right) => isDeepStrictEqual(left, right);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const safePath = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value)
  && !value.split('/').some(part => ['.', '..', '.git', '.env', '.claude', '.codex', '.agents'].includes(part));
const ids = value => Array.isArray(value) && value.every(id => typeof id === 'string' && id.length) && unique(value).length === value.length;
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };
const need = (condition, code = 'ADAPTIVE_CAUSAL_REPAIR_INVALID') => { if (!condition) fail(code); };
const contractSource = {path: contractPath, sha256: hash(contractBytes), schema_version: contract.schema_version};

export function loadCausalRepairContract() { return {...clone(contract), source: clone(contractSource)}; }

function ownerMap(plan, bindings) {
  const owners = new Map(), paths = new Map();
  for (const artifact of plan.artifacts) {
    const task = plan.tasks.find(task => task.id === artifact.producer_task_id && task.kind === 'implementation');
    need(task?.output_artifact_ids.includes(artifact.id) && ids(bindings[artifact.id]?.paths)
      && bindings[artifact.id].paths.length && bindings[artifact.id].paths.every(safePath), 'ADAPTIVE_CAUSAL_ARTIFACT_BINDING');
    need(!owners.has(artifact.id), 'ADAPTIVE_CAUSAL_ARTIFACT_BINDING'); owners.set(artifact.id, task.id);
    for (const path of bindings[artifact.id].paths) {
      need(!paths.has(path.toLowerCase()), 'ADAPTIVE_CAUSAL_PATH_COLLISION'); paths.set(path.toLowerCase(), artifact.id);
    }
  }
  return owners;
}

function artifactForPath(path, bindings, owners) {
  need(safePath(path), 'ADAPTIVE_CAUSAL_PATH_INVALID');
  const found = [...owners.keys()].filter(id => bindings[id].paths.some(bound => path === bound || path.startsWith(`${bound}/`)));
  need(found.length === 1, 'ADAPTIVE_CAUSAL_PATH_UNBOUND'); return found[0];
}

const ordered = (plan, values) => plan.artifacts.filter(artifact => values.includes(artifact.id)).map(artifact => artifact.id);
const tasksFor = (plan, artifactIds) => plan.tasks.filter(task => task.kind === 'implementation'
  && task.output_artifact_ids.some(id => artifactIds.includes(id))).map(task => task.id);
function binding(failure) {
  return {source_sha256: failure.source_sha256, catalog_sha256: failure.catalog_sha256,
    graph_revision: failure.graph_revision, binding_digest: failure.binding_digest,
    artifact_revisions_sha256: digest(failure.artifact_revisions)};
}
const failureKey = item => `${item.check_id}/${item.test_id}/${item.assertion_id ?? ''}`;
function observedFailures(failure) {
  return (failure?.public_evidence ?? []).flatMap(item => (item.evidence?.cases ?? []).filter(test => test.status === 'failed').map(test => ({
    check_id: item.check_id, test_id: test.test_id ?? test.id, assertion_id: test.failed_assertion_id ?? null,
    error_type: test.error_type ?? null, message: test.message ?? null,
    ...(Object.hasOwn(test, 'description_provenance') ? {description_provenance: clone(test.description_provenance)} : {})
  })));
}

function passedAfter(failure, prior) {
  const report = failure?.public_evidence?.find(item => item.check_id === prior.check_id);
  if (report?.outcome_uncertain !== false) return false;
  const testcase = report.evidence?.cases?.find(test => (test.test_id ?? test.id) === prior.test_id);
  if (!testcase) return false;
  return prior.assertion_id
    ? testcase.assertion_results?.some(row => row.assertion_id === prior.assertion_id && row.status === 'passed') === true
    : testcase.status === 'passed';
}

/** Derive a bounded semantic history from controller observations, never worker claims. */
export function buildCausalRepairHistory({planning, artifactBindings, attempts = []}) {
  need(Array.isArray(attempts), 'ADAPTIVE_CAUSAL_HISTORY_INVALID');
  const owners = ownerMap(planning.plan, artifactBindings), allIds = [...owners.keys()];
  let previousAfter = null;
  const entries = attempts.map((attempt, index) => {
    const action = attempt.action?.candidate ?? attempt.action, before = attempt.before_failure,
      after = attempt.after_failure ?? null, afterRevisions = attempt.after_artifact_revisions ?? after?.artifact_revisions;
    need(attempt.round_index === index && ['completed', 'failed', 'uncertain'].includes(attempt.status)
      && object(before) && ids(action?.task_ids) && ids(action?.artifact_ids) && action.artifact_ids.length
      && action.artifact_ids.every(id => owners.has(id) && action.task_ids.includes(owners.get(id)))
      && action.task_ids.every(id => action.artifact_ids.some(artifact => owners.get(artifact) === id)), 'ADAPTIVE_CAUSAL_HISTORY_INVALID');
    for (const failure of [before, after].filter(Boolean)) need(failure.source_sha256 === planning.source_sha256
      && failure.catalog_sha256 === planning.catalog_sha256, 'ADAPTIVE_CAUSAL_HISTORY_SOURCE');
    need(after || attempt.status === 'completed', 'ADAPTIVE_CAUSAL_HISTORY_OUTCOME');
    const beforeRevisions = before.artifact_revisions;
    need(object(beforeRevisions) && object(afterRevisions) && allIds.every(id => sha(beforeRevisions[id]) && sha(afterRevisions[id]))
      && Object.keys(beforeRevisions).length === allIds.length && Object.keys(afterRevisions).length === allIds.length,
    'ADAPTIVE_CAUSAL_HISTORY_REVISION');
    if (previousAfter) need(same(previousAfter, beforeRevisions), 'ADAPTIVE_CAUSAL_HISTORY_DISCONTINUITY');
    if (after) need(same(afterRevisions, after.artifact_revisions), 'ADAPTIVE_CAUSAL_HISTORY_REVISION');
    previousAfter = afterRevisions;
    const changedIds = allIds.filter(id => beforeRevisions[id] !== afterRevisions[id]);
    need(changedIds.every(id => action.artifact_ids.includes(id)), 'ADAPTIVE_CAUSAL_HISTORY_OUTSIDE_WRITE');
    need(Array.isArray(attempt.changed_files), 'ADAPTIVE_CAUSAL_HISTORY_FILES');
    const seen = new Set();
    for (const file of attempt.changed_files) {
      need(object(file) && !seen.has(file.path) && artifactForPath(file.path, artifactBindings, owners) === file.artifact_id
        && changedIds.includes(file.artifact_id) && [file.before_sha256, file.after_sha256].every(value => value === null || sha(value))
        && [file.before_executable, file.after_executable].every(value => value === null || typeof value === 'boolean')
        && (file.before_sha256 !== file.after_sha256 || file.before_executable !== file.after_executable), 'ADAPTIVE_CAUSAL_HISTORY_FILES');
      seen.add(file.path);
    }
    need(changedIds.every(id => attempt.changed_files.some(file => file.artifact_id === id)), 'ADAPTIVE_CAUSAL_HISTORY_FILES');
    const failedBefore = observedFailures(before), failedAfter = observedFailures(after);
    const beforeKeys = failedBefore.map(failureKey), afterKeys = failedAfter.map(failureKey);
    const relevantIds = ordered(planning.plan, unique([...action.artifact_ids, ...(action.read_artifact_ids ?? [])]));
    need(relevantIds.length === unique([...action.artifact_ids, ...(action.read_artifact_ids ?? [])]).length, 'ADAPTIVE_CAUSAL_HISTORY_INVALID');
    return {round_index: index, status: attempt.status, selected_candidate_id: action.id,
      selected_task_ids: clone(action.task_ids), selected_artifact_ids: clone(action.artifact_ids),
      read_artifact_ids: clone(action.read_artifact_ids ?? []), changed_artifact_ids: changedIds,
      selected_but_unchanged_artifact_ids: action.artifact_ids.filter(id => !changedIds.includes(id)),
      changed_files: clone(attempt.changed_files), failures_before: failedBefore, failures_after: failedAfter,
      persistent_failure_keys: afterKeys.filter(key => beforeKeys.includes(key)),
      resolved_failure_keys: failedBefore.filter(item => passedAfter(after, item)).map(failureKey),
      unobserved_failure_keys: failedBefore.filter(item => !afterKeys.includes(failureKey(item)) && !passedAfter(after, item)).map(failureKey),
      new_failure_keys: afterKeys.filter(key => !beforeKeys.includes(key)),
      relevant_revisions: Object.fromEntries(relevantIds.map(id => [id, {before: beforeRevisions[id], after: afterRevisions[id]}])),
      source_refs: {before_failure_sha256: digest(before), after_failure_sha256: after ? digest(after) : null,
        before_artifact_revisions_sha256: digest(beforeRevisions), after_artifact_revisions_sha256: digest(afterRevisions),
        access: 'controller_only_not_model_retrievable'},
      observation_boundary: 'Public assertion observations and actual changed file hashes; no inference of which branch caused the failure.'};
  });
  const history = {schema_version: 'adaptive-causal-repair-history/v1', source_sha256: planning.source_sha256,
    catalog_sha256: planning.catalog_sha256, entries, final_artifact_revisions_sha256: previousAfter ? digest(previousAfter) : null};
  return {...history, sha256: digest(history)};
}

function checkedHistory(history, failure) {
  if (!history) {
    need((failure.round_index ?? 0) === 0, 'ADAPTIVE_CAUSAL_HISTORY_REQUIRED');
    return {schema_version: 'adaptive-causal-repair-history/v1', source_sha256: failure.source_sha256,
      catalog_sha256: failure.catalog_sha256, entries: [], final_artifact_revisions_sha256: null};
  }
  const {sha256, ...value} = history;
  need(value.schema_version === 'adaptive-causal-repair-history/v1' && sha256 === digest(value)
    && value.source_sha256 === failure.source_sha256 && value.catalog_sha256 === failure.catalog_sha256
    && Array.isArray(value.entries) && value.entries.length === (failure.round_index ?? 0), 'ADAPTIVE_CAUSAL_HISTORY_INVALID');
  if (value.entries.length) need(value.final_artifact_revisions_sha256 === digest(failure.artifact_revisions), 'ADAPTIVE_CAUSAL_HISTORY_REVISION');
  return clone(history);
}

/** Only a current, mapped public assertion may nominate its versioned causal paths. */
export async function buildAdaptiveCausalRepairScope(input) {
  const {plan, failure, artifactBindings, assertionContract, repairHistory, sourceFiles = []} = input;
  const assertionVersion = assertionContract?.source_path === 'benchmarks/e2e-swe/public-checks/assertions.v3.json'
    && assertionContract?.contract?.version === '3' ? '3' : contract.assertion_contract_version;
  need(assertionContract?.contract?.version === assertionVersion, 'ADAPTIVE_CAUSAL_ASSERTION_VERSION');
  const base = await buildAdaptiveRepairScope({...input, assertionVersion});
  const owners = ownerMap(plan, artifactBindings), chains = [], unresolved = [], excluded = [];
  for (const observed of base.analysis.observed_failures.filter(item => item.evidence_level === 'assertion')) {
    const definition = assertionContract.contract.assertions.find(item => item.id === observed.assertion_id);
    if (!definition?.causal_paths) continue;
    need(observed.source_ref?.contract_sha256 === assertionContract.sha256, 'ADAPTIVE_CAUSAL_ASSERTION_BINDING');
    const nodes = [], seenPaths = new Set();
    try {
      need(Array.isArray(definition.causal_paths) && definition.causal_paths.length > 0, 'ADAPTIVE_CAUSAL_PATH_INVALID');
      for (const path of definition.causal_paths) {
        need(object(path) && contract.roles.includes(path.role) && typeof path.rationale === 'string' && path.rationale.length
          && !seenPaths.has(path.path), 'ADAPTIVE_CAUSAL_PATH_INVALID');
        const artifactId = artifactForPath(path.path, artifactBindings, owners), source = sourceFiles.find(file => file.path === path.path);
        need(sha(failure.artifact_revisions?.[artifactId]), 'ADAPTIVE_CAUSAL_REVISION_UNAVAILABLE'); seenPaths.add(path.path);
        nodes.push({...clone(path), artifact_id: artifactId, owner_task_id: owners.get(artifactId),
          artifact_revision: failure.artifact_revisions[artifactId], source_sha256: source?.sha256 ?? null,
          evidence_basis: source ? 'bound_public_contract_path_and_verified_source_bytes' : 'bound_public_contract_path_and_export_revision'});
      }
      need(contract.roles.every(role => nodes.some(node => node.role === role))
        && observed.artifact_ids.every(id => nodes.some(node => node.artifact_id === id)), 'ADAPTIVE_CAUSAL_CHAIN_INCOMPLETE');
    } catch (error) {
      unresolved.push({assertion_id: observed.assertion_id, reason: error.code ?? 'ADAPTIVE_CAUSAL_PATH_INVALID',
        action: 'No causal authority added; retain the explicit direct scope.'}); continue;
    }
    const key = digest(nodes), existing = chains.find(chain => chain.nodes_sha256 === key);
    if (existing) {
      existing.assertion_ids.push(observed.assertion_id);
      existing.requirement_ids = unique([...existing.requirement_ids, ...observed.requirement_ids]);
    }
    else chains.push({id: `chain-${key.slice(0, 16)}`, assertion_ids: [observed.assertion_id],
      requirement_ids: clone(observed.requirement_ids), nodes, nodes_sha256: key,
      attribution_basis: 'public_contract_data_path_hypothesis_not_fault_proof'});
  }
  const relatedReads = artifacts => ordered(plan, unique(chains.filter(chain => chain.nodes.some(node => artifacts.includes(node.artifact_id)))
    .flatMap(chain => chain.nodes.map(node => node.artifact_id))));
  const candidates = [];
  const add = candidate => {
    if (candidates.some(prior => same(prior.artifact_ids, candidate.artifact_ids))) return;
    need(ids(candidate.artifact_ids) && candidate.artifact_ids.length && candidate.artifact_ids.every(id => owners.has(id)), 'ADAPTIVE_CAUSAL_CANDIDATE_INVALID');
    const readIds = relatedReads(candidate.artifact_ids);
    candidates.push({...clone(candidate), read_artifact_ids: readIds,
      attribution_basis: readIds.length ? 'bound_public_causal_path_candidate_not_fault_proof' : candidate.attribution_basis});
  };
  const leaves = plan.tasks.filter(task => task.kind === 'implementation');
  const directlyBoundOwners = new Set(base.analysis.observed_failures.filter(item => item.evidence_level === 'assertion')
    .flatMap(item => item.owner_task_ids));
  for (const candidate of base.candidates) {
    if (candidate.task_ids.length === leaves.length && base.analysis.unresolved.length
      && candidate.task_ids.some(id => !directlyBoundOwners.has(id))) {
      excluded.push({candidate_id: candidate.id, reason: 'Unresolved ownership alone cannot authorize all project workers.'}); continue;
    }
    add(candidate);
  }
  const refs = unique(chains.flatMap(chain => chain.assertion_ids.map(id => `assertion:${id}`)));
  for (const [name, roles] of [['producer', ['producer']], ['representation', ['representation']], ['renderer', ['renderer']],
    ['producer-representation', ['producer', 'representation']], ['chain', contract.roles]]) {
    const artifactIds = ordered(plan, unique(chains.flatMap(chain => chain.nodes.filter(node => roles.includes(node.role)).map(node => node.artifact_id))));
    if (artifactIds.length) add({id: `repair-causal-${name}`, task_ids: tasksFor(plan, artifactIds), artifact_ids: artifactIds,
      reason: contract.candidate_reasons[name], evidence_refs: refs, attribution_basis: 'bound_public_causal_path_candidate_not_fault_proof'});
  }
  const history = checkedHistory(repairHistory, failure);
  const causal = {schema_version: 'adaptive-causal-repair-scope/v1', contract_source: contractSource,
    binding: binding(failure), chains, unresolved, excluded_candidates: excluded, repair_history: history,
    choice_bindings: Object.fromEntries(candidates.map(candidate => [candidate.id, digest(candidate)])),
    read_authority: contract.rules.read_basis, causal_relationships_are_dag_edges: false};
  return {candidates, analysis: {...base.analysis, policy: contract.scope_policy, causal: {...causal, sha256: digest(causal)}}};
}

/** Exact candidate authority must still equal the controller's scope artifact. */
export function validateCausalRepairCandidate({planning, failure, candidate, artifactBindings}) {
  const causal = failure.repair_scope?.causal;
  need(object(causal) && object(candidate), 'ADAPTIVE_CAUSAL_SCOPE_BINDING');
  const {sha256, ...sealedScope} = causal;
  need(sha256 === digest(sealedScope) && causal.schema_version === 'adaptive-causal-repair-scope/v1' && same(causal.contract_source, contractSource)
    && same(causal.binding, binding(failure)), 'ADAPTIVE_CAUSAL_SCOPE_BINDING');
  need(causal.choice_bindings?.[candidate?.id] === digest(candidate), 'ADAPTIVE_CAUSAL_CHOICE_DRIFT');
  const owners = ownerMap(planning.plan, artifactBindings);
  need(ids(candidate.task_ids) && ids(candidate.artifact_ids) && ids(candidate.read_artifact_ids)
    && candidate.artifact_ids.length && candidate.artifact_ids.every(id => owners.has(id) && candidate.task_ids.includes(owners.get(id)))
    && candidate.task_ids.every(id => candidate.artifact_ids.some(artifact => owners.get(artifact) === id))
    && candidate.read_artifact_ids.every(id => owners.has(id) && sha(failure.artifact_revisions[id])), 'ADAPTIVE_CAUSAL_CANDIDATE_INVALID');
  return candidate;
}

function wrapperReport(base, packet, kind, extras = {}) {
  return {...base, schema_version: 'adaptive-causal-repair-report/v1', kind, base_packet_schema: 'adaptive-artifact-repair/v2',
    contract_source: contractSource, packet_bytes: size(packet), ...extras,
    wire_bytes: null, wire_target_met: null, wire_guard_required: true, model_input_tokens: null, provider_acceptance: 'unmeasured'};
}

export function buildCausalRepairDecisionContext(input) {
  for (const candidate of input.candidates) validateCausalRepairCandidate({...input, candidate});
  const built = buildDecisionV2(input);
  const complete = {...built.state, schema_version: contract.packet_version,
    instructions: `${built.state.instructions}\n\n${contract.decision_instructions}`, causal_contract: contractSource};
  const projected = projectCausalChooserPacket(complete, {originalPublicEvidence: input.failure.public_evidence,
    workerTaskBindings: input.planning.plan.tasks.map(({id, worker_id}) => ({task_id: id, worker_id}))});
  return {state: projected.state, report: wrapperReport(built.report, projected.state, 'decision', {
    lossless: false, semantic_projection: projected.report,
    encoding: {applied: false, format: 'readable_projected_json', reason: 'The experimental dictionary codec is not used for live Jev choices.'},
    complete_packet_bytes: size(complete), projected_packet_bytes: size(projected.state),
    causal_chain_count: input.failure.repair_scope.causal.chains.length,
    repair_history_entry_count: input.failure.repair_scope.causal.repair_history.entries.length})};
}

export function buildCausalRepairWorkerContext(input) {
  const {planning, failure, candidate, task, artifactBindings} = input;
  validateCausalRepairCandidate(input);
  const built = buildWorkerV2(input), owners = ownerMap(planning.plan, artifactBindings);
  const extraIds = candidate.read_artifact_ids.filter(id => !task.output_artifact_ids.includes(id) && !task.input_artifact_ids.includes(id));
  const required = extraIds.map(id => ({artifact_id: id, owner_task_id: owners.get(id), paths: clone(artifactBindings[id].paths),
    revision: failure.artifact_revisions[id]}));
  const units = planning.catalog.units.filter(unit => unit.artifact_ids.some(id => extraIds.includes(id)));
  const evidenceIds = unique(units.flatMap(unit => unit.evidence_ids).concat(planning.catalog.artifacts.filter(artifact => extraIds.includes(artifact.id)).flatMap(artifact => artifact.evidence_ids)));
  const readPaths = required.flatMap(item => item.paths);
  const context = {...built.context, schema_version: contract.packet_version,
    instructions: `${built.context.instructions}\n\n${contract.worker_instructions}`, causal_contract: contractSource,
    required_read_artifact_ids: extraIds, required_read_artifacts: required,
    causal_read_interfaces: units.map(unit => ({unit_id: unit.id, artifact_ids: unit.artifact_ids.filter(id => extraIds.includes(id)), interface: unit.interface})),
    causal_read_evidence: clone(planning.catalog.evidence.filter(item => evidenceIds.includes(item.id))),
    causal_read_basis: {additional: 'verified_immutable_failure_baseline', declared_inputs: 'current_runtime_revisions',
      original_dag_dependency_edges_changed: false, read_source_bytes_required_before_worker_dispatch: true}};
  return {task: {...built.task, read_scope: unique([...built.task.read_scope, ...readPaths])}, context,
    report: wrapperReport(built.report, context, 'worker', {required_read_artifact_ids: extraIds, required_read_path_count: readPaths.length,
      unchanged_write_scope: same(built.task.write_scope, context.allowed_write_paths)})};
}
