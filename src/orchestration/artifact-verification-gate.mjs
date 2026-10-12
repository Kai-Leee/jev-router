import {isDeepStrictEqual} from 'node:util';
import {validateDagPlan} from './dag-contracts.mjs';

const clone = value => structuredClone(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const uncertain = value => value?.outcome_uncertain === true || value?.outcomeUncertain === true ||
  value?.uncertain === true || value?.status === 'uncertain';
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, ...details}); };
const callbackFailure = (error, code = 'ARTIFACT_CHECK_CALLBACK_FAILED') => error && typeof error === 'object' ? error :
  Object.assign(new Error(code), {code, cause: error});
const plainObject = value => value !== null && typeof value === 'object' &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

function validateEvidence(check, evidence, revisions) {
  if (!plainObject(evidence)) fail('INVALID_ARTIFACT_CHECK_EVIDENCE');
  if (uncertain(evidence)) fail('ARTIFACT_CHECK_UNCERTAIN', {outcome_uncertain: true});
  if (evidence.check_id !== check.id) fail('ARTIFACT_CHECK_ID_MISMATCH');
  if (evidence.check_version !== check.version) fail('ARTIFACT_CHECK_VERSION_MISMATCH');
  if (evidence.environment_ref !== check.environment_ref) fail('ARTIFACT_CHECK_ENVIRONMENT_MISMATCH');
  if (evidence.status !== 'passed' || evidence.executed !== true || evidence.exit_code !== 0 ||
      !Number.isSafeInteger(evidence.assertions) || evidence.assertions <= 0 ||
      evidence.skipped !== 0 || evidence.outcome_uncertain !== false) {
    fail('ARTIFACT_CHECK_NOT_PASSED');
  }
  const vector = evidence.artifact_revisions;
  if (!plainObject(vector) || Reflect.ownKeys(vector).length !== Object.keys(revisions).length ||
      Object.entries(revisions).some(([id, revision]) =>
        !Object.hasOwn(vector, id) || vector[id] !== revision)) {
    fail('ARTIFACT_CHECK_VECTOR_MISMATCH');
  }
}

// All callbacks belong to the controller. A worker's claimed evidence cannot
// replace runCheck. The adapter must use immutable snapshots or hold resource
// leases while it hashes, runs checks, and publishes the returned result.
// This module neither launches a process nor retries any callback.
export async function executeArtifactTask({
  plan, task, execute, runCheck, getRevision, record = async () => {}, attempt_id,
  expected_input_artifact_revisions,
}) {
  const currentPlan = validateDagPlan(plan);
  const currentTask = currentPlan.tasks.find(candidate => candidate.id === task?.id);
  if (!currentTask || !isDeepStrictEqual(currentTask, task)) fail('INVALID_ARTIFACT_TASK');
  if (!nonempty(attempt_id)) fail('INVALID_ARTIFACT_ATTEMPT');
  if (typeof runCheck !== 'function' || typeof getRevision !== 'function' || typeof record !== 'function' ||
      (currentTask.kind === 'implementation' && typeof execute !== 'function') ||
      (execute !== undefined && typeof execute !== 'function')) {
    fail('INVALID_ARTIFACT_TASK_EXECUTOR');
  }
  let expectedInputs;
  if (expected_input_artifact_revisions !== undefined) {
    const expected = expected_input_artifact_revisions;
    if (!plainObject(expected) || Reflect.ownKeys(expected).length !== currentTask.input_artifact_ids.length ||
        currentTask.input_artifact_ids.some(id => !Object.hasOwn(expected, id) || !nonempty(expected[id]))) {
      fail('INVALID_EXPECTED_INPUT_REVISIONS');
    }
    expectedInputs = clone(expected);
  }

  const taskIds = [...currentTask.input_artifact_ids, ...currentTask.output_artifact_ids];
  const checks = currentTask.check_ids.map(id => currentPlan.checks.find(check => check.id === id));
  const context = extra => ({
    plan: clone(currentPlan), task: clone(currentTask), attempt_id, ...extra,
  });
  async function readRevisions(ids, stage, check_id) {
    const entries = [];
    for (const artifact_id of ids) {
      const revision = await getRevision(artifact_id, context({stage, ...(check_id ? {check_id} : {})}));
      if (!nonempty(revision)) fail('INVALID_ARTIFACT_REVISION', {artifact_id, stage});
      entries.push([artifact_id, revision]);
    }
    return Object.fromEntries(entries);
  }
  async function assertCurrent(revisions, stage, check_id) {
    // Read the complete vector before comparing. A check may have changed an
    // artifact used only by an earlier or later check in this same task.
    const observed = await readRevisions(taskIds, stage, check_id);
    const changed = taskIds.filter(id => observed[id] !== revisions[id]);
    if (changed.length) fail('ARTIFACT_REVISION_CHANGED', {artifact_ids: changed, stage});
  }

  const inputRevisions = await readRevisions(currentTask.input_artifact_ids, 'input_snapshot');
  // The workflow passes the versions approved by predecessor gates. Pinning a
  // newer, unverified revision here must not silently release its consumer.
  if (expectedInputs && currentTask.input_artifact_ids.some(id => inputRevisions[id] !== expectedInputs[id])) {
    fail('ARTIFACT_INPUT_REVISION_MISMATCH');
  }
  if (currentTask.kind === 'implementation') {
    const result = await execute(clone(currentTask), {
      plan: clone(currentPlan), attempt_id, input_artifact_revisions: clone(inputRevisions),
    });
    if (uncertain(result)) fail('ARTIFACT_EXECUTION_UNCERTAIN', {outcome_uncertain: true});
    if (result?.status !== 'completed') fail('ARTIFACT_EXECUTION_NOT_COMPLETED');
  }
  const outputRevisions = await readRevisions(currentTask.output_artifact_ids, 'output_snapshot');
  const artifactRevisions = Object.fromEntries([...Object.entries(inputRevisions), ...Object.entries(outputRevisions)]);
  await assertCurrent(artifactRevisions, 'before_checks');

  const evidence = [];
  for (const check of checks) {
    const event = {
      task_id: currentTask.id, attempt_id, check_id: check.id, check_version: check.version,
      phase: check.phase, environment_ref: check.environment_ref, artifact_revisions: clone(artifactRevisions),
    };
    await record(clone({event: 'dag_check_started', ...event}));
    let result;
    let failure;
    try {
      const observed = await runCheck(clone(check), {
        task: clone(currentTask), attempt_id, artifact_revisions: clone(artifactRevisions),
      });
      result = clone(observed);
      validateEvidence(check, observed, artifactRevisions);
    } catch (error) {
      failure = callbackFailure(error);
    }
    try {
      // A thrown, skipped, or failed runner is still a run. Recheck its complete
      // vector, but preserve the original uncertainty/failure if it also drifts.
      await assertCurrent(artifactRevisions, 'after_check', check.id);
    } catch (error) {
      failure ??= callbackFailure(error, 'ARTIFACT_REVISION_CALLBACK_FAILED');
    }
    const outcomeUncertain = uncertain(failure);
    await record(clone({
      event: 'dag_check_completed', ...event,
      status: failure ? (outcomeUncertain ? 'uncertain' : 'failed') : 'passed',
      outcome_uncertain: outcomeUncertain,
      assertions: Number.isSafeInteger(result?.assertions) && result.assertions >= 0 ? result.assertions : null,
      skipped: Number.isSafeInteger(result?.skipped) && result.skipped >= 0 ? result.skipped : null,
      ...(failure ? {error_code: nonempty(failure?.code) ? failure.code : 'ARTIFACT_CHECK_CALLBACK_FAILED'} : {}),
    }));
    if (failure) throw failure;
    evidence.push(result);
  }

  // This is the last asynchronous boundary. In particular, a record callback
  // must not change an artifact after its last check and still publish success.
  await assertCurrent(artifactRevisions, 'before_publication');
  return {status: 'completed', verification: clone({artifact_revisions: artifactRevisions, evidence})};
}
