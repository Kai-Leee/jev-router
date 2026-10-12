import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {assessAdaptiveFailureRecovery, adaptiveRecoveryObservations, acceptAdaptiveRecoveryEvidence,
  adaptiveWorkerRecoveryIdentity, validateAdaptiveRecoveryRequest, recoveryDigest} from '../src/orchestration/adaptive-failure-recovery.mjs';
import {projectRepairDecisionRequest} from '../src/orchestration/adaptive-repair-input.mjs';
import {prepareDecision} from '../src/client.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const revision = 'a'.repeat(64), changedRevision = 'b'.repeat(64);
function failure(cases, revisions = {A: revision, B: revision}) {
  return {status: 'failed', outcome_uncertain: false, source_sha256: 'c'.repeat(64), catalog_sha256: 'd'.repeat(64),
    artifact_revisions: revisions, public_evidence: [{check_id: 'public', status: 'failed', executed: true,
      outcome_uncertain: false, evidence: {cases: cases.map(([id, status]) => ({id, status, message: status === 'failed' ? `${id} failed` : null}))}}]};
}

test('transport and accounting failures cannot fall through to a normal new owner choice', () => {
  const current = failure([['one', 'failed']]);
  for (const code of ['ADAPTIVE_TRANSMISSION_PREFLIGHT_BLOCKED', 'JEV_TRANSMISSION_RECOVERY_INVALID',
    'ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED', 'NEW_UNCLASSIFIED_FAILURE']) {
    const result = assessAdaptiveFailureRecovery({failure: current, terminal_cause: {code, stage: 'repair_owners', outcome_uncertain: false}});
    assert.equal(result.status, 'needs_evidence');
    assert.notEqual(result.action, 'infer_remaining_owners');
  }
  const cause = {stage: 'repair', code: 'HTTP_ERROR', http_status: 400, category: 'model_input_limit', outcome_uncertain: false};
  assert.equal(assessAdaptiveFailureRecovery({failure: current, terminal_cause: cause}).action, 'rebuild_relevant_input');
  assert.equal(assessAdaptiveFailureRecovery({failure: {...current, reservations_pending: 1}, terminal_cause: cause}).action, 'reconcile_request');
  assert.equal(assessAdaptiveFailureRecovery({failure: {...current, outcome_uncertain: true}, terminal_cause: cause}).action, 'reconcile_request');
  assert.equal(assessAdaptiveFailureRecovery({failure: {...current, verification_environment_error: true}}).action, 'restore_verification_evidence');
});

test('global partial progress cannot hide unchanged selected scope with a persistent failure', () => {
  const before = failure([['fixed', 'failed'], ['remaining', 'failed']]);
  const after = failure([['fixed', 'passed'], ['remaining', 'failed']], {A: changedRevision, B: revision});
  const result = assessAdaptiveFailureRecovery({failure: after, previous_failure: before,
    previous_action: {artifact_ids: ['A', 'B']}, changed_files: [{artifact_id: 'A', path: 'a.py'}]});
  assert.equal(result.condition, 'repair_remaining_scope_no_change');
  assert.equal(result.action, 'inspect_no_write_cause');
  assert.deepEqual(result.progress.resolved_failure_keys, ['public/fixed/']);
  assert.deepEqual(result.progress.selected_but_unchanged_artifact_ids, ['B']);
  const partial = assessAdaptiveFailureRecovery({failure: after, previous_failure: before,
    previous_action: {artifact_ids: ['A']}, changed_files: [{artifact_id: 'A', path: 'a.py'}]});
  assert.equal(partial.action, 'infer_remaining_owners');
  const missing = failure([['remaining', 'failed']], {A: changedRevision, B: revision});
  assert.equal(assessAdaptiveFailureRecovery({failure: missing, previous_failure: before,
    previous_action: {artifact_ids: ['A']}, changed_files: [{artifact_id: 'A'}]}).action, 'restore_verification_evidence');
});

test('historical no-change evidence is active only at the same source and current relevant bytes', () => {
  const current = failure([['remaining', 'failed']]);
  const entry = {failures_before: adaptiveRecoveryObservations(current), failures_after: adaptiveRecoveryObservations(current),
    relevant_revisions: {B: {before: revision, after: revision}}, changed_files: [], resolved_failure_keys: [],
    persistent_failure_keys: ['public/remaining/'], selected_but_unchanged_artifact_ids: ['B']};
  const body = {schema_version: 'adaptive-causal-repair-history/v1', source_sha256: current.source_sha256,
    catalog_sha256: current.catalog_sha256, entries: [entry]};
  const history = {...body, sha256: recoveryDigest(body)};
  const bound = assessAdaptiveFailureRecovery({failure: current, historical_repair_history: history});
  assert.equal(bound.historical_binding.active, true);
  assert.equal(bound.action, 'inspect_no_write_cause');
  const stale = assessAdaptiveFailureRecovery({failure: {...current, artifact_revisions: {A: revision, B: changedRevision}}, historical_repair_history: history});
  assert.equal(stale.historical_binding.active, false);
  assert.equal(stale.action, 'infer_remaining_owners');
});

test('same source range reordering, regrouping and profile changes are not new evidence', () => {
  const text = 'first\nsecond\nthird', source = {artifact_id: 'B', path: 'b.py', revision, sha256: hash(text), text};
  const row = {kind: 'static_source_observation', artifact_id: 'B', path: 'b.py', revision, sha256: source.sha256,
    ranges: [{start_line: 1, end_line: 1, text: 'first'}, {start_line: 2, end_line: 2, text: 'second'}], relations: []};
  const current = {...failure([['remaining', 'failed']]), recovery_evidence: [row]};
  const base = {failure: current, sourceFiles: [source], artifactBindings: {B: {paths: ['b.py']}}};
  for (const ranges of [[...row.ranges].reverse(), [{start_line: 1, end_line: 2, text: 'first\nsecond'}]]) {
    assert.equal(acceptAdaptiveRecoveryEvidence({...base, evidence: [{...row, ranges}]}).status, 'needs_evidence');
  }
  const added = acceptAdaptiveRecoveryEvidence({...base, evidence: [{...row, ranges: [{start_line: 3, end_line: 3, text: 'third'}]}]});
  assert.equal(added.status, 'ready'); assert.equal(added.failure.recovery_evidence.length, 1);
  assert.throws(() => acceptAdaptiveRecoveryEvidence({...base, evidence: [{...row,
    ranges: [{start_line: 1, end_line: 1, text: 'invented'}]}]}), {code: 'ADAPTIVE_RECOVERY_EVIDENCE_RANGE'});
  const task = {id: 'worker-B', requirement_ids: ['req-B'], input_artifact_ids: [], output_artifact_ids: ['B'], read_scope: [], write_scope: ['b.py']};
  const first = adaptiveWorkerRecoveryIdentity({task, failure: current});
  assert.equal(adaptiveWorkerRecoveryIdentity({task: {...task, profile_id: 'expensive', effort: 'max'}, failure: current}).semantic_worker_input_sha256,
    first.semantic_worker_input_sha256);
  assert.notEqual(adaptiveWorkerRecoveryIdentity({task, failure: added.failure}).semantic_worker_input_sha256, first.semantic_worker_input_sha256);
});

test('another worker improvement does not change an exactly mapped persistent worker input', () => {
  const scope = {observed_failures: [{check_id: 'public', test_id: 'fixed', assertion_id: null, owner_task_ids: ['worker-A'], artifact_ids: ['A'], requirement_ids: ['req-A']},
    {check_id: 'public', test_id: 'remaining', assertion_id: null, owner_task_ids: ['worker-B'], artifact_ids: ['B'], requirement_ids: ['req-B']}]};
  const before = {...failure([['fixed', 'failed'], ['remaining', 'failed']]), repair_scope: scope};
  const after = {...failure([['fixed', 'passed'], ['remaining', 'failed']], {A: changedRevision, B: revision}), repair_scope: scope};
  const task = {id: 'worker-B', requirement_ids: ['req-B'], input_artifact_ids: [], output_artifact_ids: ['B'], read_scope: [], write_scope: ['b.py']};
  assert.equal(adaptiveWorkerRecoveryIdentity({task, failure: before}).semantic_worker_input_sha256,
    adaptiveWorkerRecoveryIdentity({task, failure: after}).semantic_worker_input_sha256);
});

test('request recovery requires canonical exact-source replay, not only plausible hashes', () => {
  const original = {model: 'jev-latest', state: {observed: 'literal public evidence'},
    questions: {pick: {type: 'choice', instructions: 'Choose the existing handler.', criteria: {one: 'First handler', stop: 'Stop'}}}};
  const projected = projectRepairDecisionRequest(original, {stage: 'repair'}), prepared = prepareDecision(projected.request);
  const recovery = {schema_version: 'jev-transmission-recovery/v1', action: 'rebuild_relevant_input',
    prior_request_sha256: hash(prepareDecision(original).serialized), request_sha256: hash(prepared.serialized),
    evidence_sha256: hash(JSON.stringify(prepared.body.state)), source_coverage_sha256: hash(JSON.stringify(projected.report))};
  assert.deepEqual(validateAdaptiveRecoveryRequest({failed_request: original, input_rebuild: {...projected, recovery}}).request, projected.request);
  const arbitrary = {...projected.request, state: {invented: true}}, forged = {...recovery,
    request_sha256: hash(prepareDecision(arbitrary).serialized), evidence_sha256: hash(JSON.stringify(arbitrary.state)), source_coverage_sha256: hash('{}')};
  assert.throws(() => validateAdaptiveRecoveryRequest({failed_request: original, input_rebuild: {request: arbitrary, report: {}, recovery: forged}}));
});
