import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareDecision} from '../client.mjs';
import {projectAdaptiveRepairFailure} from './adaptive-repair-projection.mjs';
import {loadCausalRepairContract, validateCausalRepairCandidate, buildCausalRepairDecisionContext,
  buildCausalRepairWorkerContext} from './adaptive-causal-repair.mjs';
import {adaptiveOutcomeUncertain, adaptiveTerminalCause} from './adaptive-failure.mjs';
import {projectInferredRepairOwnerRequest} from './adaptive-inferred-repair-projection.mjs';
import {projectRepairDecisionRequest, verifyRepairInputOverride} from './adaptive-repair-input.mjs';

const path = 'docs/orchestration/contracts/adaptive-inferred-repair.v1.json';
const sourceBytes = readFileSync(new URL(`../../${path}`, import.meta.url));
const contract = JSON.parse(sourceBytes);
const v2Path = 'docs/orchestration/contracts/adaptive-inferred-repair.v2.json';
const v2Bytes = readFileSync(new URL(`../../${v2Path}`, import.meta.url));
const v2Contract = JSON.parse(v2Bytes);
const copy = value => structuredClone(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => hash(JSON.stringify(canonical(value)));
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const unique = values => [...new Set(values)];
const same = (a, b) => isDeepStrictEqual(a, b);
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const idList = value => Array.isArray(value) && value.every(id => typeof id === 'string' && id.length)
  && new Set(value).size === value.length;
const safePath = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value)
  && !value.split('/').some(part => ['.', '..', '.git', '.env', '.claude', '.codex', '.agents'].includes(part));
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };
const need = (ok, code = 'ADAPTIVE_INFERRED_REPAIR_INVALID') => { if (!ok) fail(code); };
const source = {path, sha256: hash(sourceBytes), schema_version: contract.schema_version};
const v2Source = {path: v2Path, sha256: hash(v2Bytes), schema_version: v2Contract.schema_version};
function policy(input = {}) {
  const selected = input.ownerInputPolicy ?? 'inferred-v1';
  need(['inferred-v1', 'inferred-v2'].includes(selected), 'ADAPTIVE_INFERRED_INPUT_POLICY');
  return selected === 'inferred-v2' ? {contract: v2Contract, source: v2Source, selected}
    : {contract, source, selected};
}
function reconstructing(input) {
  need(input.repairInputPolicy === undefined || input.repairInputPolicy === 'evidence-v1', 'ADAPTIVE_REPAIR_INPUT_POLICY');
  if (input.repairInputPolicy) need(input.ownerInputPolicy === 'inferred-v2', 'ADAPTIVE_REPAIR_INPUT_POLICY');
  need(!input.requestOverride || input.repairInputPolicy === 'evidence-v1', 'ADAPTIVE_REPAIR_INPUT_OVERRIDE_POLICY');
  return input.repairInputPolicy === 'evidence-v1';
}
const format = (template, values) => template.replace(/\{([a-z_]+)\}/g, (_, key) => {
  need(Object.hasOwn(values, key), 'ADAPTIVE_INFERRED_CONTRACT_VARIABLE'); return String(values[key]);
});
const key = row => JSON.stringify([row.check_id, row.test_id, row.assertion_id ?? null]);
const failureBinding = failure => ({source_sha256: failure.source_sha256, catalog_sha256: failure.catalog_sha256,
  graph_revision: failure.graph_revision, binding_digest: failure.binding_digest,
  artifact_revisions_sha256: digest(failure.artifact_revisions)});
const taskContracts = tasks => tasks.map(task => ({id: task.id, worker_id: task.worker_id,
  input_artifact_ids: copy(task.input_artifact_ids), output_artifact_ids: copy(task.output_artifact_ids),
  requirement_ids: copy(task.requirement_ids), read_scope: copy(task.read_scope), write_scope: copy(task.write_scope)}));
const seal = value => ({...value, sha256: digest(value)});
function verifySeal(value, code) {
  need(object(value), code); const {sha256, ...body} = value; need(sha(sha256) && sha256 === digest(body), code); return body;
}

export function loadInferredRepairContract(ownerInputPolicy = 'inferred-v1') {
  const selected = policy({ownerInputPolicy}); return {...copy(selected.contract), source: copy(selected.source)};
}

function checked(input) {
  const {planning, failure, artifactBindings} = input;
  need(object(planning?.plan) && object(planning.catalog) && Array.isArray(planning.requirement_descriptions)
    && object(failure) && object(artifactBindings), 'ADAPTIVE_INFERRED_REPAIR_INPUT');
  need(planning.catalog_sha256 === hash(JSON.stringify(planning.catalog)) && failure.catalog_sha256 === planning.catalog_sha256
    && planning.source_sha256 === planning.catalog.source_sha256 && failure.source_sha256 === planning.source_sha256,
  'ADAPTIVE_INFERRED_SOURCE_DRIFT');
  const causal = failure.repair_scope?.causal, causalBody = verifySeal(causal, 'ADAPTIVE_INFERRED_CAUSAL_BINDING');
  need(same(causalBody.contract_source, loadCausalRepairContract().source)
    && same(causalBody.binding, failureBinding(failure)), 'ADAPTIVE_INFERRED_CAUSAL_BINDING');
  need(failure.outcome_uncertain === false && Array.isArray(failure.public_evidence)
    && Array.isArray(failure.local_evidence) && sha(failure.binding_digest), 'ADAPTIVE_INFERRED_FAILURE_UNCERTAIN');
  const tasks = planning.plan.tasks.filter(task => task.kind === 'implementation'), owners = new Map(), paths = new Set();
  const artifacts = planning.plan.artifacts.map(artifact => {
    const owner = tasks.find(task => task.id === artifact.producer_task_id);
    const catalogArtifact = planning.catalog.artifacts.find(item => item.id === artifact.id);
    const units = planning.catalog.units.filter(unit => unit.artifact_ids.includes(artifact.id));
    const actualPaths = artifactBindings[artifact.id]?.paths;
    need(!owners.has(artifact.id) && artifact.id !== 'unknown' && owner?.output_artifact_ids.includes(artifact.id)
      && catalogArtifact && units.length === 1 && idList(actualPaths) && actualPaths.length
      && actualPaths.every(safePath) && same(actualPaths, catalogArtifact.paths)
      && actualPaths.every(path => owner.write_scope.includes(path)) && sha(failure.artifact_revisions[artifact.id]),
    'ADAPTIVE_INFERRED_ARTIFACT_BINDING');
    for (const path of actualPaths) { need(!paths.has(path.toLowerCase()), 'ADAPTIVE_INFERRED_PATH_COLLISION'); paths.add(path.toLowerCase()); }
    owners.set(artifact.id, owner.id);
    return {...copy(catalogArtifact), owner_task_id: owner.id, worker_id: owner.worker_id,
      unit_id: units[0].id, revision: failure.artifact_revisions[artifact.id]};
  });
  need(artifacts.length > 0 && artifacts.length <= 254 && artifacts.length === planning.catalog.artifacts.length
    && same([...owners.keys()].sort(), Object.keys(failure.artifact_revisions).sort()), 'ADAPTIVE_INFERRED_ARTIFACT_BINDING');
  for (const task of tasks) need(idList(task.input_artifact_ids) && idList(task.output_artifact_ids)
    && task.output_artifact_ids.every(id => owners.get(id) === task.id)
    && task.input_artifact_ids.every(id => owners.has(id)), 'ADAPTIVE_INFERRED_OWNER_BINDING');
  const mappings = failure.repair_scope.observed_failures ?? [];
  const failures = [];
  for (const report of failure.public_evidence) {
    need(report.executed === true && report.outcome_uncertain === false && ['passed', 'failed'].includes(report.status)
      && Array.isArray(report.evidence?.cases) && same(report.artifact_revisions, failure.artifact_revisions)
      && report.runtime_binding?.binding_digest === failure.binding_digest
      && report.runtime_binding?.environment_fingerprint === failure.environment.fingerprint,
    'ADAPTIVE_INFERRED_PUBLIC_BINDING');
    for (const testcase of report.evidence.cases.filter(row => row.status === 'failed')) {
      const identity = {check_id: report.check_id, test_id: testcase.test_id ?? testcase.id,
        assertion_id: testcase.failed_assertion_id ?? null};
      need(typeof identity.test_id === 'string' && identity.test_id.length && !failures.some(row => key(row) === key(identity)),
        'ADAPTIVE_INFERRED_FAILURE_IDENTITY');
      const mapped = mappings.filter(row => row.check_id === identity.check_id && row.test_id === identity.test_id);
      need(mapped.length === 1 && idList(mapped[0].requirement_ids)
        && mapped[0].requirement_ids.every(id => planning.requirement_descriptions.some(row => row.id === id)),
      'ADAPTIVE_INFERRED_REQUIREMENT_BINDING');
      failures.push({...identity, failure_id: `failure-${digest(identity).slice(0, 20)}`,
        question_id: `owner.${digest(identity).slice(0, 20)}`, requirement_ids: copy(mapped[0].requirement_ids),
        public_case_sha256: digest(testcase), observation_ref: {check_id: identity.check_id, test_id: identity.test_id},
        error_type: testcase.error_type ?? null, message: testcase.message ?? null,
        not_reached_assertion_ids: (testcase.assertion_results ?? []).filter(row => row.status === 'not_reached').map(row => row.assertion_id)});
    }
  }
  need(failures.length > 0, 'ADAPTIVE_INFERRED_NO_PUBLIC_FAILURE');
  return {tasks, artifacts, owners, failures, causal};
}

/** Original facts are shared once; question text identifies its exact failed case. */
export function buildInferredRepairOwnerRequest(input) {
  const {contract, source, selected} = policy(input);
  const reconstruct = reconstructing(input);
  const {planning, failure} = input, data = checked(input);
  need(data.failures.length <= 64, 'ADAPTIVE_INFERRED_OFFICIAL_QUESTION_LIMIT');
  const unscoped = copy(failure); delete unscoped.repair_scope;
  // Recovery excerpts are added once after the unchanged v2 projection. They
  // remain bound below; removing them here avoids an unsupported raw fallback.
  if (reconstruct) delete unscoped.recovery_evidence;
  const projected = projectAdaptiveRepairFailure(unscoped);
  const tasks = taskContracts(data.tasks);
  const state = {schema_version: 'adaptive-inferred-repair-owners/v1', instructions: `${contract.state_instructions}\n\n${contract.question.instructions}`,
    contract_source: source, source_sha256: planning.source_sha256, catalog_sha256: planning.catalog_sha256,
    failure: projected.failure, failures: copy(data.failures), tasks, artifacts: data.artifacts,
    units: copy(planning.catalog.units), requirement_descriptions: copy(planning.requirement_descriptions),
    evidence: copy(planning.catalog.evidence), causal_paths: copy(data.causal.chains), repair_history: copy(data.causal.repair_history)};
  const criteria = Object.fromEntries(data.artifacts.map(artifact => [artifact.id,
    format(contract.question.artifact_description_template, {artifact_id: artifact.id})]));
  criteria.unknown = contract.question.unknown_description;
  const questions = Object.fromEntries(data.failures.map(row => [row.question_id, {type: contract.question.type,
    instructions: format(contract.question.target_template, {...row, assertion_id: row.assertion_id ?? 'none (case-level observed error)'})
      + contract.question.call_instructions, criteria: copy(criteria)}]));
  const rawRequest = {model: contract.model, state, questions};
  // Only the actual transmitted representation is validated against the body
  // limit; a larger intermediate v1-style corpus is never submitted in v2.
  const projection = selected === 'inferred-v2' ? projectInferredRepairOwnerRequest(rawRequest, {contract}) : null;
  const baseInput = projection?.request ?? rawRequest;
  // Match JSON wire normalization before sealing the additional projection;
  // undefined controller fields are not transmitted by prepareDecision.
  const baseRequest = reconstruct ? JSON.parse(JSON.stringify(baseInput)) : baseInput;
  const repairInputContext = reconstruct ? input.repairInputContext
    ?? failure.repair_scope?.inferred_ownership?.repair_input_context ?? null : null;
  const contextFailure = copy(failure); delete contextFailure.repair_scope;
  const relevanceContext = repairInputContext ? {...copy(repairInputContext), failure: contextFailure} : null;
  const reconstruction = reconstruct ? input.requestOverride
    ? verifyRepairInputOverride(baseRequest, input.requestOverride)
    : projectRepairDecisionRequest(baseRequest, {stage: 'repair_owners', recoveryEvidence: failure.recovery_evidence ?? [], relevanceContext}) : null;
  if (reconstruction) need(same(reconstruction.report.recovery_evidence, failure.recovery_evidence ?? [])
    && same(reconstruction.report.relevance_projection.input_context, relevanceContext)
    && reconstruction.report.stage === 'repair_owners', 'ADAPTIVE_REPAIR_INPUT_OVERRIDE_EVIDENCE');
  const prepared = prepareDecision(reconstruction?.request ?? baseRequest);
  const binding = {failure: failureBinding(failure), tasks_sha256: digest(tasks), artifact_bindings_sha256: digest(input.artifactBindings),
    public_evidence_sha256: digest(failure.public_evidence), local_evidence_sha256: digest(failure.local_evidence),
    requirement_descriptions_sha256: digest(planning.requirement_descriptions),
    ...(reconstruct ? {recovery_evidence_sha256: digest(failure.recovery_evidence ?? [])} : {})};
  const metadata = {schema_version: 'adaptive-inferred-repair-request/v1', contract_source: source, binding,
    decision_id: `repair-owners-${digest(binding).slice(0, 24)}`, stage: contract.stage,
    round_index: failure.round_index ?? 0, request_sha256: hash(prepared.serialized), wire_bytes: Buffer.byteLength(prepared.serialized),
    failure_questions: copy(data.failures), failure_projection: projected.report,
    actual_usage: null, exact_model_tokens: null, automatic_retries: 0,
    ...(projection ? {owner_input_policy: selected, owner_input_projection: projection.report} : {}),
    ...(reconstruction ? {repair_input_policy: input.repairInputPolicy, repair_input_projection: reconstruction.report,
      repair_input_context: copy(repairInputContext)} : {}),
    ...(input.requestOverride?.recovery ? {transmission_recovery: copy(input.requestOverride.recovery)} : {})};
  return {request: prepared.body, metadata};
}

function assignmentsFor(response, built, owners) {
  if (adaptiveOutcomeUncertain(response)) fail('ADAPTIVE_INFERRED_RESPONSE_UNCERTAIN', {outcome_uncertain: true});
  need(object(response) && response.ok !== false && response.error == null
    && (response.status === undefined || ['completed', 'success', 'succeeded'].includes(response.status)), 'ADAPTIVE_INFERRED_RESPONSE_FAILED');
  need(object(response.answers) && same(Object.keys(response.answers).sort(), Object.keys(built.request.questions).sort()),
    'ADAPTIVE_INFERRED_ANSWER_COVERAGE');
  return built.metadata.failure_questions.map(row => {
    const answer = response.answers[row.question_id], question = built.request.questions[row.question_id];
    need(object(answer) && answer.type === 'choice' && typeof answer.choice === 'string'
      && Object.hasOwn(question.criteria, answer.choice)
      && Object.keys(answer).every(key => ['type', 'choice', 'confidence', 'probabilities'].includes(key)), 'ADAPTIVE_INFERRED_ANSWER_INVALID');
    if (answer.confidence !== undefined) need(Number.isFinite(answer.confidence) && answer.confidence >= 0 && answer.confidence <= 1,
      'ADAPTIVE_INFERRED_ANSWER_INVALID');
    if (answer.probabilities !== undefined) need(object(answer.probabilities)
      && same(Object.keys(answer.probabilities).sort(), Object.keys(question.criteria).sort())
      && Object.values(answer.probabilities).every(value => Number.isFinite(value) && value >= 0 && value <= 1),
    'ADAPTIVE_INFERRED_ANSWER_INVALID');
    return {...copy(row), status: answer.choice === 'unknown' ? 'unknown' : 'inferred',
      artifact_id: answer.choice === 'unknown' ? null : answer.choice,
      owner_task_id: answer.choice === 'unknown' ? null : owners.get(answer.choice),
      attribution_basis: 'jev_primary_repair_hypothesis_not_fault_proof'};
  });
}

/** Exactly one callback attempt. Transport records actual POSTs separately. */
export async function inferAdaptiveRepairOwners({decide, record = async () => {}, ...input}) {
  const {contract} = policy(input);
  need(typeof decide === 'function' && typeof record === 'function', 'ADAPTIVE_INFERRED_DECIDER_REQUIRED');
  const built = buildInferredRepairOwnerRequest(input), {owners} = checked(input);
  const stats = {decision_callbacks: 0, requested_questions: Object.keys(built.request.questions).length};
  let submitted = false, received = false;
  try {
    await record({event: 'adaptive_repair_owner_inference_requested', ...copy(built.metadata), request: copy(built.request)});
    submitted = true; stats.decision_callbacks++;
    const response = await decide(copy(built.request), {stage: contract.stage, decision_id: built.metadata.decision_id,
      round_index: built.metadata.round_index,
      ...(built.metadata.transmission_recovery ? {recovery: copy(built.metadata.transmission_recovery)} : {})});
    received = true;
    const assignments = assignmentsFor(response, built, owners), response_sha256 = digest(response);
    const result = seal({schema_version: 'adaptive-inferred-repair-result/v1', status: 'inferred', outcome_uncertain: false,
      inference_id: `owner-inference-${digest({request: built.metadata.request_sha256, response: response_sha256}).slice(0, 24)}`,
      ...copy(built.metadata), assignments, response: copy(response), response_sha256, stats,
      unknown_failure_ids: assignments.filter(row => row.status === 'unknown').map(row => row.failure_id),
      response_received: true, dispatch_allowed: false});
    await record({event: 'adaptive_repair_owner_inference_completed', stage: contract.stage, decision_id: result.decision_id,
      round_index: result.round_index, inference_id: result.inference_id, assignments, response_sha256, stats});
    return result;
  } catch (error) {
    const outcome_uncertain = adaptiveOutcomeUncertain(error, {fallback: submitted && !received});
    const terminal_cause = {...adaptiveTerminalCause(error, {outcome_uncertain}), stage: contract.stage};
    const result = {schema_version: 'adaptive-inferred-repair-result/v1', status: outcome_uncertain ? 'uncertain' : 'stopped',
      reason: terminal_cause.code, terminal_cause, outcome_uncertain, ...copy(built.metadata), assignments: [],
      dispatch_allowed: false, response_received: received, stats};
    await record({event: 'adaptive_repair_owner_inference_stopped', ...copy(result)}); return result;
  }
}

function verifiedInference(input, inference) {
  const {source, selected} = policy(input);
  verifySeal(inference, 'ADAPTIVE_INFERRED_RESULT_BINDING');
  const built = buildInferredRepairOwnerRequest(input), {owners} = checked(input);
  need(inference.status === 'inferred' && same(inference.contract_source, source)
    && inference.request_sha256 === built.metadata.request_sha256 && same(inference.binding, built.metadata.binding)
    && inference.response_sha256 === digest(inference.response), 'ADAPTIVE_INFERRED_RESULT_BINDING');
  if (selected === 'inferred-v2') need(inference.owner_input_policy === selected
    && same(inference.owner_input_projection, built.metadata.owner_input_projection), 'ADAPTIVE_INFERRED_RESULT_BINDING');
  need(inference.repair_input_policy === built.metadata.repair_input_policy
    && same(inference.repair_input_projection, built.metadata.repair_input_projection), 'ADAPTIVE_INFERRED_RESULT_BINDING');
  const assignments = assignmentsFor(inference.response, built, owners);
  need(same(inference.assignments, assignments)
    && inference.inference_id === `owner-inference-${digest({request: inference.request_sha256, response: inference.response_sha256}).slice(0, 24)}`,
  'ADAPTIVE_INFERRED_ASSIGNMENT_DRIFT');
  return assignments;
}

/** Replace broad case-owner fallbacks with typed inferred scopes, retaining the original diagnosis as provenance. */
export function applyInferredRepairOwners(input) {
  const {contract, source, selected} = policy(input);
  const {planning, failure, candidates, inference} = input, {owners} = checked(input);
  const assignments = verifiedInference(input, inference), analysis = copy(failure.repair_scope);
  for (const candidate of candidates) validateCausalRepairCandidate({...input, candidate});
  const known = assignments.filter(row => row.status === 'inferred'), active = [];
  const artifactOrder = values => planning.plan.artifacts.filter(row => values.includes(row.id)).map(row => row.id);
  const taskOrder = values => planning.plan.tasks.filter(task => task.kind === 'implementation'
    && task.output_artifact_ids.some(id => values.includes(id))).map(task => task.id);
  const relatedReads = values => artifactOrder(unique(analysis.causal.chains.filter(chain => chain.nodes.some(node => values.includes(node.artifact_id)))
    .flatMap(chain => chain.nodes.map(node => node.artifact_id))));
  const add = candidate => {
    if (active.some(row => same(row.artifact_ids, candidate.artifact_ids))) return;
    active.push({...candidate, owner_inference_id: inference.inference_id});
  };
  const inferredIds = artifactOrder(unique(known.map(row => row.artifact_id)));
  const inferredCandidate = (id, artifact_ids) => ({id, task_ids: taskOrder(artifact_ids), artifact_ids,
    read_artifact_ids: relatedReads(artifact_ids), attribution_basis: 'jev_primary_repair_hypothesis_not_fault_proof',
    evidence_refs: known.filter(row => artifact_ids.includes(row.artifact_id)).map(row => `inferred:${row.failure_id}`),
    reason: artifact_ids.length > 1 ? 'Repair the exact union of primary artifacts inferred for observed failures; preserve unknown failures and all other artifacts.'
      : 'Inspect and repair this primary inferred artifact only; other failures may remain unresolved until every public check reruns.'});
  if (inferredIds.length) add(inferredCandidate('repair-inferred-owners', inferredIds));
  for (const id of inferredIds) add(inferredCandidate(`repair-inferred-${digest(id).slice(0, 16)}`, [id]));
  for (const candidate of candidates.filter(row => row.id.startsWith('repair-causal-'))) add(copy(candidate));
  const removed = candidates.filter(row => !row.id.startsWith('repair-causal-'));
  const inferenceSummary = seal({schema_version: 'adaptive-inferred-repair-scope/v1', inference_id: inference.inference_id,
    contract_source: source, request_sha256: inference.request_sha256, response_sha256: inference.response_sha256,
    ...(selected === 'inferred-v2' ? {owner_input_policy: selected,
      owner_input_projection_sha256: inference.owner_input_projection.integrity_sha256} : {}),
    ...(reconstructing(input) ? {repair_input_policy: input.repairInputPolicy,
      repair_input_projection_sha256: inference.repair_input_projection.integrity_sha256,
      repair_input_context: copy(inference.repair_input_context)} : {}),
    binding: copy(inference.binding), assignments: copy(assignments),
    unknown_failure_ids: assignments.filter(row => row.status === 'unknown').map(row => row.failure_id),
    prior_observed_failures: copy(analysis.observed_failures), prior_unresolved: copy(analysis.unresolved),
    removed_active_fallbacks: removed.map(row => ({id: row.id, task_ids: row.task_ids, artifact_ids: row.artifact_ids,
      reason: 'Owner hypotheses are obtained from the typed inference stage; broad requirement-owner fallback is inactive.'})),
    result_sha256: inference.sha256, result_ref: {access: 'controller_only', event: 'adaptive_repair_owner_inference_committed'},
    proof: {answers: copy(inference.response.answers)},
    choice_bindings: Object.fromEntries(active.map(row => [row.id, digest(row)]))});
  analysis.inferred_ownership = inferenceSummary;
  analysis.policy = contract.scope_policy;
  analysis.inference = true;
  analysis.attribution_basis = 'jev_primary_repair_hypothesis_not_fault_proof';
  analysis.observed_failure_owner_task_ids = taskOrder(inferredIds);
  analysis.observed_failures = analysis.observed_failures.map(row => {
    const assigned = assignments.find(item => item.check_id === row.check_id && item.test_id === row.test_id);
    need(assigned, 'ADAPTIVE_INFERRED_ASSIGNMENT_COVERAGE');
    return {...row, prior_attribution: {evidence_level: row.evidence_level, artifact_ids: copy(row.artifact_ids), owner_task_ids: copy(row.owner_task_ids)},
      owner_inference_id: inference.inference_id, owner_inference_status: assigned.status,
      evidence_level: 'inferred_primary_artifact', attribution_basis: assigned.attribution_basis,
      artifact_ids: assigned.artifact_id ? [assigned.artifact_id] : [], owner_task_ids: assigned.owner_task_id ? [assigned.owner_task_id] : []};
  });
  analysis.unresolved = [
    ...analysis.unresolved.filter(row => !assignments.some(assignment => assignment.check_id === row.check_id && assignment.test_id === row.test_id)),
    ...assignments.filter(row => row.status === 'unknown').map(row => ({check_id: row.check_id, test_id: row.test_id,
      failure_id: row.failure_id, reason: 'JEV_OWNER_UNKNOWN', original_requirement_ids: row.requirement_ids})),
  ];
  analysis.fallback_required = analysis.unresolved.length > 0;
  const {sha256: priorSeal, ...causal} = analysis.causal;
  causal.inferred_owner_scope_sha256 = inferenceSummary.sha256;
  causal.choice_bindings = Object.fromEntries(active.map(row => [row.id, digest(row)]));
  analysis.causal = seal(causal);
  need(active.every(row => row.artifact_ids.every(id => owners.has(id))), 'ADAPTIVE_INFERRED_SCOPE_INVALID');
  return {candidates: active, analysis};
}

/** Add inferred provenance checks without weakening the original causal validator. */
export function validateInferredRepairCandidate(input) {
  const {source, selected} = policy(input);
  const reconstruct = reconstructing(input);
  const {failure, candidate} = input, info = failure.repair_scope?.inferred_ownership;
  const proof = verifySeal(info, 'ADAPTIVE_INFERRED_SCOPE_BINDING'), {owners, failures, tasks} = checked(input);
  need(same(proof.contract_source, source) && same(proof.binding.failure, failureBinding(failure))
    && proof.binding.artifact_bindings_sha256 === digest(input.artifactBindings)
    && proof.binding.tasks_sha256 === digest(taskContracts(tasks))
    && proof.binding.public_evidence_sha256 === digest(failure.public_evidence)
    && proof.binding.local_evidence_sha256 === digest(failure.local_evidence)
    && proof.binding.requirement_descriptions_sha256 === digest(input.planning.requirement_descriptions)
    && candidate.owner_inference_id === proof.inference_id && proof.choice_bindings[candidate.id] === digest(candidate)
    && failure.repair_scope.causal.inferred_owner_scope_sha256 === info.sha256,
  'ADAPTIVE_INFERRED_SCOPE_BINDING');
  if (selected === 'inferred-v2') {
    const actual = buildInferredRepairOwnerRequest(input);
    need(proof.owner_input_policy === selected && proof.request_sha256 === actual.metadata.request_sha256
      && proof.owner_input_projection_sha256 === actual.metadata.owner_input_projection.integrity_sha256,
    'ADAPTIVE_INFERRED_SCOPE_BINDING');
    need(proof.repair_input_policy === actual.metadata.repair_input_policy
      && proof.repair_input_projection_sha256 === actual.metadata.repair_input_projection?.integrity_sha256,
    'ADAPTIVE_INFERRED_SCOPE_BINDING');
  }
  if (reconstruct) need(proof.binding.recovery_evidence_sha256 === digest(failure.recovery_evidence ?? []),
    'ADAPTIVE_INFERRED_SCOPE_BINDING');
  const built = {metadata: {failure_questions: failures}, request: {questions: Object.fromEntries(failures.map(row => [row.question_id,
    {criteria: Object.fromEntries([...owners.keys(), 'unknown'].map(id => [id, null]))}]))}};
  need(same(assignmentsFor({answers: proof.proof.answers}, built, owners), proof.assignments), 'ADAPTIVE_INFERRED_ASSIGNMENT_DRIFT');
  validateCausalRepairCandidate(input); return candidate;
}

function scopedInput(input, artifactIds) {
  const view = copy(input), info = input.failure.repair_scope.inferred_ownership;
  const relevant = new Set(info.assignments.filter(row => row.status === 'unknown' || artifactIds.includes(row.artifact_id)).map(row => row.failure_id));
  const relatedAssertions = new Set(input.failure.repair_scope.causal.chains.filter(chain => chain.nodes.some(node => artifactIds.includes(node.artifact_id)))
    .flatMap(chain => chain.assertion_ids));
  for (const row of info.assignments) if (relatedAssertions.has(row.assertion_id)) relevant.add(row.failure_id);
  const selected = input.failure.repair_scope.observed_failures.filter(row => info.assignments.some(assignment => relevant.has(assignment.failure_id)
    && assignment.check_id === row.check_id && assignment.test_id === row.test_id));
  const other = input.failure.repair_scope.observed_failures.filter(row => !selected.includes(row));
  view.failure.repair_scope.observed_failures = copy(selected);
  view.failure.repair_scope.other_observed_failures = copy(other);
  view.failure.repair_scope.detailed_requirement_scope = {artifact_ids: copy(artifactIds), failure_ids: [...relevant],
    other_failures_remain_unresolved: other.map(row => ({check_id: row.check_id, test_id: row.test_id, requirement_ids: row.requirement_ids})),
    unknown_requirements_retained: true, public_cases_removed: 0,
    basis: 'Complete selected-artifact units plus linked inferred/causal failures and every unknown assignment; other observed failures remain inline.'};
  return {input: view, report: {schema_version: 'adaptive-inferred-detail-scope/v1',
    selected_artifact_ids: copy(artifactIds), detailed_failure_ids: [...relevant],
    other_observed_failure_ids: info.assignments.filter(row => !relevant.has(row.failure_id)).map(row => row.failure_id),
    original_observed_failures_sha256: digest(input.failure.repair_scope.observed_failures), public_cases_removed: 0}};
}

// Authorization proofs stay in controller records. The model gets each public
// observation once, with readable identities tying assignments to those cases.
// Unknown/new fields are retained; this is not a token-budget truncation.
function projectInferredMetadata(packet) {
  const value = copy(packet), omitted = [], info = value.failure?.repair_scope?.inferred_ownership;
  if (!info) return {value, report: null};
  const put = (target, field, pointer, replacement, reason) => {
    if (!Object.hasOwn(target, field)) return;
    omitted.push({pointer: `${pointer}/${field}`, value: copy(target[field]), sha256: digest(target[field]), reason});
    if (replacement === undefined) delete target[field]; else target[field] = replacement;
  };
  const base = '/failure/repair_scope/inferred_ownership';
  for (const field of ['binding', 'choice_bindings', 'proof', 'result_sha256', 'request_sha256', 'response_sha256', 'sha256', 'contract_source',
    'repair_input_context', 'repair_input_projection_sha256']) {
    put(info, field, base, undefined, 'Controller validates this exact authorization proof before model selection and before worker dispatch. The complete value remains in the projection report.');
  }
  const assignments = info.assignments.map(row => {
    const compact = copy(row);
    for (const field of ['question_id', 'public_case_sha256', 'observation_ref', 'error_type', 'message',
      'not_reached_assertion_ids', 'attribution_basis']) delete compact[field];
    return compact;
  });
  put(info, 'assignments', base, assignments,
    'Assignment identities, original requirement IDs, status and exact artifact/owner remain inline. Error/message/not-reached values are already present in each uniquely identified public case; hashes and question IDs stay in controller evidence.');
  const observed = [...(value.failure.repair_scope.observed_failures ?? []), ...(value.failure.repair_scope.other_observed_failures ?? [])];
  const recoverablePrior = info.prior_observed_failures?.every(prior => {
    const matches = observed.filter(row => row.check_id === prior.check_id && row.test_id === prior.test_id);
    if (matches.length !== 1) return false;
    const current = matches[0];
    return Object.entries(prior).every(([field, original]) => same(original,
      Object.hasOwn(current.prior_attribution ?? {}, field) ? current.prior_attribution[field] : current[field]));
  });
  if (recoverablePrior) put(info, 'prior_observed_failures', base, undefined,
    'Each prior observed row exactly equals the matching current observed_failures/other_observed_failures row with prior_attribution fields restored. Original rows remain in controller evidence.');
  info.inline_observation_links = 'Each assignment identifies one full inline public case by check_id/test_id/assertion_id. Read its error_type, message, description provenance and not-reached assertions there. All assignments are primary repair hypotheses, not fault proof. Prior attribution remains in the matching observed_failures/other_observed_failures row. No external retrieval is assumed.';
  return {value, report: seal({schema_version: 'adaptive-inferred-metadata-projection/v1',
    original_sha256: digest(packet), projected_sha256: digest(value), original_bytes: bytes(packet), projected_bytes: bytes(value),
    omitted_fields: omitted, added_fields: [`${base}/inline_observation_links`],
    public_cases_removed: 0, failure_values_removed: 0, requirement_values_removed: 0})};
}

export function buildInferredRepairDecisionContext(input) {
  const {contract, source} = policy(input);
  const reconstruct = reconstructing(input);
  for (const candidate of input.candidates) validateInferredRepairCandidate({...input, candidate});
  const scoped = scopedInput(input, unique(input.candidates.flatMap(row => row.artifact_ids)));
  if (reconstruct) delete scoped.input.failure.recovery_evidence;
  const built = buildCausalRepairDecisionContext(scoped.input);
  built.state.instructions += `\n\n${contract.decision_instructions}`;
  built.state.inferred_contract = copy(source);
  const projected = projectInferredMetadata(built.state);
  const rebuilt = reconstruct ? projectRepairDecisionRequest({state: projected.value}, {stage: 'repair',
    recoveryEvidence: input.failure.recovery_evidence ?? []}) : null;
  return {state: rebuilt?.request.state ?? projected.value, report: {...built.report, inferred_contract: source, inferred_metadata_projection: projected.report,
    inferred_detail_scope: scoped.report, owner_inference_id: input.failure.repair_scope.inferred_ownership.inference_id,
    ...(rebuilt ? {repair_input_projection: rebuilt.report, repair_input_policy: input.repairInputPolicy} : {}),
    packet_bytes: bytes(rebuilt?.request.state ?? projected.value), omitted_requirement_records: input.planning.requirement_descriptions.filter(row =>
      !built.state.requirement_descriptions.some(included => included.id === row.id))}};
}

export function buildInferredRepairWorkerContext(input) {
  const {contract, source} = policy(input);
  const reconstruct = reconstructing(input);
  validateInferredRepairCandidate(input);
  const artifactIds = input.candidate.artifact_ids.filter(id => input.task.output_artifact_ids.includes(id));
  const scoped = scopedInput(input, artifactIds);
  if (reconstruct) delete scoped.input.failure.recovery_evidence;
  const built = buildCausalRepairWorkerContext(scoped.input);
  built.context.instructions += `\n\n${contract.worker_instructions}`;
  built.context.inferred_contract = copy(source);
  const projected = projectInferredMetadata(built.context);
  const rebuilt = reconstruct ? projectRepairDecisionRequest({state: projected.value}, {stage: 'implementation',
    recoveryEvidence: input.failure.recovery_evidence ?? []}) : null;
  return {...built, context: rebuilt?.request.state ?? projected.value, report: {...built.report, inferred_contract: source, inferred_metadata_projection: projected.report,
    inferred_detail_scope: scoped.report, owner_inference_id: input.candidate.owner_inference_id,
    ...(rebuilt ? {repair_input_projection: rebuilt.report, repair_input_policy: input.repairInputPolicy} : {}),
    packet_bytes: bytes(rebuilt?.request.state ?? projected.value), omitted_requirement_records: input.planning.requirement_descriptions.filter(row =>
      !built.context.requirement_descriptions.some(included => included.id === row.id))}};
}
