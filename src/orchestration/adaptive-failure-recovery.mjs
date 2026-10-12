import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {adaptiveOutcomeUncertain, adaptiveTerminalCause} from './adaptive-failure.mjs';
import {verifyRepairInputOverride} from './adaptive-repair-input.mjs';
import {prepareDecision} from '../client.mjs';

const path = 'docs/orchestration/contracts/adaptive-failure-recovery.v1.json';
const bytes = readFileSync(new URL(`../../${path}`, import.meta.url)), policy = JSON.parse(bytes);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const hash = value => createHash('sha256').update(value).digest('hex');
export const recoveryDigest = value => hash(JSON.stringify(canonical(value)));
const copy = value => structuredClone(value), equal = isDeepStrictEqual;
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const need = (condition, code) => { if (!condition) throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
const designBytes = readFileSync(new URL(`../../${policy.design_source.path}`, import.meta.url));
need(hash(designBytes) === policy.design_source.sha256, 'ADAPTIVE_RECOVERY_DESIGN_SOURCE_DRIFT');
const design = JSON.parse(designBytes);
export function loadAdaptiveFailureRecoveryPolicy() {
  return {...copy(policy), source: {path, sha256: hash(bytes), schema_version: policy.schema_version}};
}

// Current observations are distinct from cases that never ran. A missing case
// is not a resolved failure, even when its ID disappeared from the failed list.
export function adaptiveRecoveryObservations(failure) {
  return (failure?.public_evidence ?? []).flatMap(item => (item.evidence?.cases ?? []).filter(test => test.status === 'failed')
    .map(test => ({check_id: item.check_id, test_id: test.test_id ?? test.id,
      assertion_id: test.failed_assertion_id ?? null, error_type: test.error_type ?? null, message: test.message ?? null,
      ...(Object.hasOwn(test, 'expected') ? {expected: copy(test.expected)} : {}),
      ...(Object.hasOwn(test, 'actual') ? {actual: copy(test.actual)} : {}),
      ...(Object.hasOwn(test, 'description_provenance') ? {description_provenance: copy(test.description_provenance)} : {})})))
    .sort((a, b) => recoveryDigest(a).localeCompare(recoveryDigest(b)));
}
const key = item => `${item.check_id}/${item.test_id}/${item.assertion_id ?? ''}`;
function passed(failure, observation) {
  const reports = (failure?.public_evidence ?? []).filter(item => item.check_id === observation.check_id && item.outcome_uncertain === false);
  const cases = reports.flatMap(item => item.evidence?.cases ?? []).filter(test => (test.test_id ?? test.id) === observation.test_id);
  if (cases.length !== 1) return false;
  return observation.assertion_id ? cases[0].assertion_results?.some(row => row.assertion_id === observation.assertion_id && row.status === 'passed') === true
    : cases[0].status === 'passed';
}
function historyBinding(history, failure) {
  if (!history) return {active: false, reason: 'absent'};
  const {sha256, ...body} = history, last = body.entries?.at(-1);
  if (body.schema_version !== 'adaptive-causal-repair-history/v1' || !sha(sha256) || sha256 !== recoveryDigest(body)
    || body.source_sha256 !== failure.source_sha256 || body.catalog_sha256 !== failure.catalog_sha256 || !last) {
    return {active: false, reason: 'history_source_or_seal_mismatch'};
  }
  const observations = adaptiveRecoveryObservations(failure);
  const historical = copy(last.failures_after ?? []).sort((a, b) => recoveryDigest(a).localeCompare(recoveryDigest(b)));
  const revisions = Object.entries(last.relevant_revisions ?? {});
  const exact = equal(observations, historical) && revisions.length > 0
    && revisions.every(([id, value]) => sha(value.after) && value.after === failure.artifact_revisions?.[id]);
  return {active: exact, reason: exact ? 'current_public_observations_and_relevant_revisions_match' : 'current_observation_or_revision_mismatch',
    history_sha256: sha256, ...(exact ? {entry: copy(last)} : {})};
}

/** The first matching current failure takes precedence; old history is not a
 * simultaneous transport error. No callback or retry occurs in this function. */
export function assessAdaptiveFailureRecovery({failure = {}, terminal_cause, previous_failure,
  changed_files = null, repair_history, historical_repair_history, independent_evidence, previous_action} = {}) {
  const cause = terminal_cause ? adaptiveTerminalCause({terminal_cause}) : adaptiveTerminalCause(failure);
  const observations = adaptiveRecoveryObservations(failure), historical = historyBinding(historical_repair_history, failure);
  let historyEntry = repair_history?.entries?.at(-1) ?? (historical.active ? historical.entry : null);
  // Current-run history must end at these bytes before it can authorize a branch.
  if (historyEntry && Object.entries(historyEntry.relevant_revisions ?? {}).some(([id, value]) => value.after !== failure.artifact_revisions?.[id])) historyEntry = null;
  const before = previous_failure ? adaptiveRecoveryObservations(previous_failure) : historyEntry?.failures_before ?? [];
  const priorKeys = before.map(key), currentKeys = observations.map(key);
  const resolved = previous_failure ? before.filter(item => passed(failure, item)).map(key) : historyEntry?.resolved_failure_keys ?? [];
  const newFailures = currentKeys.filter(id => !priorKeys.includes(id));
  const unobserved = before.filter(item => !currentKeys.includes(key(item)) && !resolved.includes(key(item))).map(key);
  const changed = changed_files ?? historyEntry?.changed_files ?? null;
  const unchangedSelected = previous_failure && previous_action?.artifact_ids
    ? previous_action.artifact_ids.filter(id => sha(previous_failure.artifact_revisions?.[id])
      && previous_failure.artifact_revisions[id] === failure.artifact_revisions?.[id])
    : historyEntry?.selected_but_unchanged_artifact_ids ?? [];
  const persistent = currentKeys.filter(id => priorKeys.includes(id));
  const attempted = !!previous_failure || !!historyEntry;
  const base = {schema_version: 'adaptive-failure-recovery-assessment/v1', policy: policy.id, terminal_cause: cause,
    observations, historical_binding: historical, progress: {attempted, changed_files: copy(changed), resolved_failure_keys: resolved,
      remaining_failure_keys: currentKeys, new_failure_keys: attempted ? newFailures : [], unobserved_failure_keys: unobserved,
      persistent_failure_keys: persistent, selected_but_unchanged_artifact_ids: copy(unchangedSelected)},
    failure_identity_sha256: recoveryDigest({observations, artifact_revisions: failure.artifact_revisions ?? {},
      local: (failure.local_evidence ?? []).filter(row => row.status !== 'passed').map(row => ({check_id: row.check_id, status: row.status, evidence: row.evidence}))})};
  const result = (condition, action, status = 'needs_evidence') => {
    const transition = design.transitions.find(row => row.when === condition);
    need(!transition || transition.next === action, 'ADAPTIVE_RECOVERY_DESIGN_ACTION_DRIFT');
    return {...base, condition, action, status, requires_before_inference: copy(transition?.requires_before_inference ?? [])};
  };
  if (adaptiveOutcomeUncertain(failure) || cause.outcome_uncertain || failure.reservations_pending > 0
    || ['BUDGET_OUTSTANDING', 'BUDGET_SETTLEMENT_FAILED', 'BUDGET_INVALID_SETTLEMENT', 'BUDGET_LEDGER_CHANGED', 'BUDGET_LEDGER_INVALID',
      'BUDGET_LOCK_LOST', 'BUDGET_IO_FAILED'].includes(cause.code)) return result('outcome_or_accounting_uncertain', 'reconcile_request', 'reconcile_request');
  if (['ADAPTIVE_TRANSMISSION_PREFLIGHT_BLOCKED', 'JEV_TRANSMISSION_RECOVERY_INVALID', 'ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED'].includes(cause.code)
    || /(?:SOURCE|PIN|POLICY).*(?:DRIFT|MISMATCH|INVALID|HASH)/.test(cause.code)) {
    return result('transmission_contract_or_integrity_blocked', 'restore_transmission_contract');
  }
  if (['context_limit', 'model_input_limit', 'request_size', 'schema', 'request_validation'].includes(cause.category)
    || ['REQUEST_LIMIT', 'REQUEST_TOO_LARGE', 'JEV_INPUT_ADMISSION_BLOCKED', 'JEV_TRANSMISSION_PREFLIGHT_FAILED'].includes(cause.code)) {
    return result('schema_body_or_model_context_rejected', 'rebuild_relevant_input');
  }
  if ([401, 404].includes(cause.http_status)) return result('http_401_or_404', 'correct_connection');
  if (cause.http_status === 402 || ['BUDGET_ACCOUNT_BLOCKED', 'BUDGET_PAID_BALANCE_LOW'].includes(cause.code)) return result('http_402', 'resolve_account');
  if ([429, 502, 503].includes(cause.http_status)) return result('confirmed_429_502_503_and_accounting_clear', 'wait_provider');
  if (failure.verification_environment_error === true || failure.verification_stale === true
    || /(?:ENVIRONMENT|INVALID_CHECK_REPORT|EVIDENCE_STALE|HARNESS)/.test(cause.code)
    || [...(failure.public_evidence ?? []), ...(failure.local_evidence ?? [])].some(item => item.executed === false && item.status === 'failed')) {
    return result('verification_stale_or_harness_blocked', 'restore_verification_evidence');
  }
  if (failure.owner_unknown === true || /(?:INVALID_.*(?:CHOICE|SELECTION)|UNKNOWN_OWNER|UNKNOWN_DECISION)/.test(cause.code)) {
    return result('decision_invalid_or_unknown', 'collect_missing_decision_evidence');
  }
  if (terminal_cause && !['ADAPTIVE_RUN_FAILED', 'ARTIFACT_CHECK_NOT_PASSED', 'ARTIFACT_EXECUTION_NOT_COMPLETED',
    'DAG_RUNTIME_ARTIFACT_MISSING', 'DAG_RUNTIME_ARTIFACT_EMPTY'].includes(cause.code)) {
    return result('unclassified_terminal_failure', 'inspect_terminal_failure');
  }
  const complete = failure.status === 'completed' && (failure.public_evidence ?? []).length > 0
    && failure.public_evidence.every(item => item.status === 'passed' && item.outcome_uncertain === false);
  if (complete) {
    const current = independent_evidence && independent_evidence.artifact_revisions_sha256 === recoveryDigest(failure.artifact_revisions ?? {});
    if (current && independent_evidence.status !== 'passed') return result('public_pass_and_current_independent_failed_or_incomplete', 'investigate_public_reproduction');
    return current ? result('independent_pass_and_public_pass_same_revision', 'audit_completion_evidence', 'continue')
      : result('public_pass_and_independent_absent_or_stale', 'run_independent_checks', 'continue');
  }
  if (attempted && newFailures.length) return result('repair_regression', 'inspect_new_failure_path');
  if (attempted && unobserved.length) return result('verification_stale_or_harness_blocked', 'restore_verification_evidence');
  if (attempted && persistent.length && unchangedSelected.length) {
    return result('repair_remaining_scope_no_change', 'inspect_no_write_cause');
  }
  if (attempted && changed?.length === 0 && currentKeys.length) return result('repair_no_change', 'inspect_no_write_cause');
  if (attempted && !resolved.length && currentKeys.length) return result('repair_no_progress', 'inspect_causal_path');
  if (attempted && resolved.length && currentKeys.length) return result('repair_partial_progress', 'infer_remaining_owners', 'continue');
  if (observations.length || (failure.failed_task_ids ?? []).length) return result('current_known_failure', 'infer_remaining_owners', 'continue');
  return result('predicate_evidence_missing', 'collect_missing_decision_evidence');
}

function evidenceIdentity(evidence) {
  return {artifact_id: evidence.artifact_id, path: evidence.path, revision: evidence.revision ?? evidence.artifact_revision,
    sha256: evidence.sha256};
}
function evidenceCoverage(evidence) {
  const groups = new Map();
  for (const item of evidence) {
    const identity = evidenceIdentity(item), id = recoveryDigest(identity);
    if (!groups.has(id)) groups.set(id, {...identity, lines: new Set()});
    for (const range of item.ranges) for (let line = range.start_line; line <= range.end_line; line++) groups.get(id).lines.add(line);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([, item]) => ({...item, lines: [...item.lines].sort((a, b) => a - b)}));
}
/** Accept only new bytes from a verified relevant source. New prose, a new
 * attempt number or a profile change cannot serve as new source evidence. */
export function acceptAdaptiveRecoveryEvidence({failure, sourceFiles, artifactBindings, evidence}) {
  need(Array.isArray(evidence), 'ADAPTIVE_RECOVERY_EVIDENCE_INVALID');
  const accepted = [], covered = new Map(evidenceCoverage(failure.recovery_evidence ?? [])
    .map(({lines, ...identity}) => [recoveryDigest(identity), new Set(lines)]));
  for (const item of evidence) {
    const source = sourceFiles.find(file => file.artifact_id === item.artifact_id && file.path === item.path);
    need(item.kind === 'static_source_observation' && source && artifactBindings?.[item.artifact_id]?.paths
      .some(path => item.path === path || item.path.startsWith(`${path}/`))
      && source.revision === (item.revision ?? item.artifact_revision) && source.revision === failure.artifact_revisions?.[item.artifact_id]
      && sha(source.sha256) && source.sha256 === item.sha256 && hash(source.text) === source.sha256
      && Array.isArray(item.ranges) && item.ranges.length > 0, 'ADAPTIVE_RECOVERY_EVIDENCE_BINDING');
    const lines = source.text.split('\n');
    for (const range of item.ranges) need(Number.isSafeInteger(range.start_line) && Number.isSafeInteger(range.end_line)
      && range.start_line > 0 && range.end_line >= range.start_line && range.end_line <= lines.length
      && range.text === lines.slice(range.start_line - 1, range.end_line).join('\n'), 'ADAPTIVE_RECOVERY_EVIDENCE_RANGE');
    const id = recoveryDigest(evidenceIdentity(item)), linesBefore = covered.get(id) ?? new Set();
    const linesAfter = evidenceCoverage([item])[0].lines;
    if (linesAfter.some(line => !linesBefore.has(line))) accepted.push(copy(item));
    linesAfter.forEach(line => linesBefore.add(line)); covered.set(id, linesBefore);
  }
  const merged = copy(failure.recovery_evidence ?? []);
  for (const item of accepted) {
    const index = merged.findIndex(prior => prior.path === item.path && equal(evidenceIdentity(prior), evidenceIdentity(item)));
    if (index < 0) { merged.push(copy(item)); continue; }
    const prior = merged[index], rangeKeys = new Set();
    const ranges = [...prior.ranges, ...item.ranges].filter(range => {
      const id = recoveryDigest(range); if (rangeKeys.has(id)) return false; rangeKeys.add(id); return true;
    }).sort((a, b) => a.start_line - b.start_line || a.end_line - b.end_line);
    const relationValues = new Map([...(prior.relations ?? []), ...(item.relations ?? [])].map(value => [recoveryDigest(value), value]));
    const {ranges: _a, relations: _b, ...oldMeta} = prior, {ranges: _c, relations: _d, ...newMeta} = item;
    merged[index] = {...copy(item), ranges, relations: [...relationValues.values()].map(copy),
      ...(!equal(oldMeta, newMeta) ? {prior_observations: [copy(prior)]} : {})};
  }
  return {status: accepted.length ? 'ready' : 'needs_evidence', reason: accepted.length ? 'NEW_VERIFIED_SOURCE_EVIDENCE' : 'NO_NEW_RELEVANT_SOURCE_EVIDENCE',
    failure: {...copy(failure), recovery_evidence: merged}, new_evidence: accepted,
    evidence_sha256: recoveryDigest(evidenceCoverage(merged)), added_count: accepted.length};
}

/** A controller identity, not a claim to be the Claude wire payload. */
export function adaptiveWorkerRecoveryIdentity({task, failure = {}, selected_action, input_artifact_revisions = {}}) {
  const ids = [...new Set([...task.input_artifact_ids, ...task.output_artifact_ids, ...(selected_action?.read_artifact_ids ?? [])])].sort();
  const relevant = observation => {
    const mappings = (failure.repair_scope?.observed_failures ?? []).filter(row => row.check_id === observation.check_id
      && row.test_id === observation.test_id && (row.assertion_id ?? null) === observation.assertion_id);
    // An unmapped observation stays explicit; mapping ambiguity never removes it.
    return mappings.length !== 1 || mappings.some(row => (row.owner_task_ids ?? []).includes(task.id)
      || (row.artifact_ids ?? []).some(id => ids.includes(id))
      || (row.requirement_ids ?? []).some(id => task.requirement_ids.includes(id)));
  };
  const body = {task_id: task.id, requirement_ids: task.requirement_ids, inputs: task.input_artifact_ids, outputs: task.output_artifact_ids,
    read_scope: task.read_scope, write_scope: task.write_scope, failed_observations: adaptiveRecoveryObservations(failure).filter(relevant),
    local_failures: (failure.local_evidence ?? []).filter(row => row.status !== 'passed').map(row => ({check_id: row.check_id, status: row.status, evidence: row.evidence})),
    artifact_revisions: Object.fromEntries(ids.map(id => [id, failure.artifact_revisions?.[id] ?? input_artifact_revisions[id] ?? null])),
    source_evidence: evidenceCoverage((failure.recovery_evidence ?? []).filter(item => ids.includes(item.artifact_id)
      || (item.relations ?? []).some(row => [row.producer_artifact_id, row.consumer_artifact_id].some(id => ids.includes(id)))))};
  return {semantic_worker_input_sha256: recoveryDigest(body), semantic_input: body,
    identity_excludes: ['profile', 'effort', 'attempt_id', 'round_index', 'timestamps', 'question_wording']};
}

export function validateAdaptiveRecoveryRequest({input_rebuild, failed_request}) {
  const {request, report, recovery} = input_rebuild ?? {};
  need(request && report && recovery?.schema_version === 'jev-transmission-recovery/v1'
    && recovery.action === 'rebuild_relevant_input' && [recovery.prior_request_sha256, recovery.request_sha256,
      recovery.evidence_sha256, recovery.source_coverage_sha256].every(sha), 'ADAPTIVE_RECOVERY_REBUILD_PROOF');
  const prepared = prepareDecision(request), before = failed_request ? prepareDecision(failed_request) : null;
  need(recovery.request_sha256 === hash(prepared.serialized) && recovery.evidence_sha256 === hash(JSON.stringify(prepared.body.state))
    && recovery.request_sha256 !== recovery.prior_request_sha256, 'ADAPTIVE_RECOVERY_REBUILD_SAME_REQUEST');
  need(failed_request && recovery.prior_request_sha256 === hash(before.serialized)
    && request.model === failed_request.model && equal(request.questions, failed_request.questions), 'ADAPTIVE_RECOVERY_REBUILD_CHOICE_DRIFT');
  verifyRepairInputOverride(failed_request, input_rebuild);
  need(recovery.source_coverage_sha256 === hash(JSON.stringify(report)), 'ADAPTIVE_RECOVERY_REBUILD_COVERAGE');
  return copy(input_rebuild);
}
