import {executeTaskEnvelope} from './recursive-execution.mjs';

const fail = code => { throw Object.assign(new Error(code), {code}); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

export function validateWorkerVerification({task, verification, expectedArtifactRevision}) {
  if (!nonempty(expectedArtifactRevision)) fail('INVALID_ARTIFACT_REVISION');
  if (!verification || verification.artifact_revision !== expectedArtifactRevision) fail('STALE_VERIFICATION_REVISION');
  if (!Array.isArray(verification.evidence)) fail('INVALID_VERIFICATION_EVIDENCE');
  const expected = new Set(task.test_ids), seen = new Set();
  for (const evidence of verification.evidence) {
    if (!evidence || !expected.has(evidence.test_id)) fail('UNEXPECTED_VERIFICATION_TEST');
    if (seen.has(evidence.test_id)) fail('DUPLICATE_VERIFICATION_TEST');
    seen.add(evidence.test_id);
    if (evidence.status !== 'passed' || evidence.executed !== true || evidence.exit_code !== 0 || !nonempty(evidence.check_id)) {
      fail('PUBLIC_VERIFICATION_NOT_PASSED');
    }
    if (evidence.artifact_revision !== expectedArtifactRevision) fail('STALE_VERIFICATION_REVISION');
  }
  if (seen.size !== expected.size) fail('INCOMPLETE_VERIFICATION_EVIDENCE');
  return verification;
}

// `verify` and `getArtifactRevision` are trusted controller callbacks. Fields such
// as executed:true cannot prove a process ran: never wire worker self-reports to
// this boundary. The controller must run public executable checks itself and
// map their actual results to the assigned specification IDs.
export async function executeVerifiedEnvelope({envelope, execute, verify, getArtifactRevision, record=async()=>{}, maxConcurrency=2}) {
  if (typeof execute !== 'function' || typeof verify !== 'function' || typeof getArtifactRevision !== 'function' || typeof record !== 'function') {
    fail('INVALID_VERIFIED_EXECUTOR');
  }
  if (!Array.isArray(envelope?.tasks) || !envelope.tasks.length) fail('INVALID_VERIFIED_ENVELOPE');
  const taskIds = new Set();
  for (const task of envelope.tasks) {
    if (!nonempty(task.id) || taskIds.has(task.id) || !Array.isArray(task.test_ids) || !task.test_ids.length ||
        task.test_ids.some(id=>!nonempty(id)) || new Set(task.test_ids).size !== task.test_ids.length) fail('INVALID_VERIFICATION_TASK');
    taskIds.add(task.id);
  }
  return executeTaskEnvelope({envelope, maxConcurrency, record, execute:async(task, context)=>{
    const value = await execute(task, context);
    // Legacy execution callbacks may return an artifact without a status. Once
    // a callback supplies status, only explicit success may reach verification.
    const uncertain = value?.uncertain === true || value?.outcomeUncertain === true || value?.outcome_uncertain === true || value?.status === 'uncertain';
    if (uncertain || (value?.status !== undefined && !['completed','success'].includes(value.status))) {
      throw Object.assign(new Error('WORKER_EXECUTION_NOT_SUCCESSFUL'), {code:'WORKER_EXECUTION_NOT_SUCCESSFUL', uncertain});
    }
    const expectedArtifactRevision = await getArtifactRevision(task, {...context, value});
    if (!nonempty(expectedArtifactRevision)) fail('INVALID_ARTIFACT_REVISION');
    await record({event:'worker_verification_started', task_id:task.id, test_ids:task.test_ids, artifact_revision:expectedArtifactRevision});
    const verification = await verify(task, {...context, value, expectedArtifactRevision});
    validateWorkerVerification({task, verification, expectedArtifactRevision});
    const currentRevision = await getArtifactRevision(task, {...context, value});
    if (currentRevision !== expectedArtifactRevision) fail('ARTIFACT_CHANGED_DURING_VERIFICATION');
    await record({event:'worker_verification_passed', task_id:task.id, test_ids:task.test_ids, artifact_revision:expectedArtifactRevision});
    return {execution:value, verification};
  }});
}
