import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

const clone = value => structuredClone(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const need = (ok, code = 'ADAPTIVE_PARTIAL_REPAIR_BINDING') => {
  if (!ok) throw Object.assign(new Error(code), {code, outcome_uncertain: false});
};
export const PARTIAL_REPAIR_POLICY = 'local-readiness-v1';

/** Only an exact runtime-local check owner is scripted. Public failures still
 * use provider owner decisions. Unpublished outputs are never made revisions. */
export function buildPartialReadinessRepair({plan, failure, snapshots, artifactBindings}) {
  if (failure.public_evidence?.length || !failure.local_evidence?.some(row => row.status === 'failed')) return null;
  need(failure.outcome_uncertain === false && failure.code === 'ARTIFACT_CHECK_NOT_PASSED');
  need(sha(failure.binding_digest) && sha(failure.environment?.fingerprint));
  const tasks = plan.tasks.filter(task => task.kind === 'implementation');
  const rows = failure.local_evidence.filter(row => row.status === 'failed');
  const selected = new Set(), artifacts = new Set();
  for (const row of rows) {
    const task = tasks.find(task => task.id === row.task_id);
    const check = plan.checks.find(check => check.id === row.check_id);
    const snapshot = snapshots.get(row.task_id);
    need(task && check && check.phase !== 'integration' && task.check_ids.includes(check.id)
      && check.version === row.check_version && check.environment_ref === row.environment_ref
      && failure.failed_task_ids.includes(task.id) && row.attempt_id === failure.task_attempt_ids[task.id]
      && row.executed === true && row.outcome_uncertain === false && Number.isInteger(row.exit_code) && row.exit_code !== 0
      && row.runtime_binding?.binding_digest === failure.binding_digest
      && row.runtime_binding?.environment_fingerprint === failure.environment.fingerprint
      && sha(row.evidence_key) && snapshot && !snapshot.verified);
    need(check.artifact_ids.length && check.artifact_ids.every(id => task.output_artifact_ids.includes(id)),
      'ADAPTIVE_PARTIAL_REPAIR_AMBIGUOUS_LOCAL_OWNER');
    for (const id of task.output_artifact_ids) {
      const item = snapshot.artifacts[id];
      need(item && sha(item.revision) && digest(item.manifest) === item.revision
        && row.artifact_revisions[id] === item.revision
        && isDeepStrictEqual(item.paths, artifactBindings[id]?.paths));
    }
    for (const id of check.artifact_ids) artifacts.add(id);
    selected.add(task.id);
  }
  need(failure.failed_task_ids.every(id => selected.has(id)), 'ADAPTIVE_PARTIAL_REPAIR_UNEXPLAINED_FAILURE');
  const states = tasks.map(task => {
    const snapshot = snapshots.get(task.id);
    if (selected.has(task.id)) return {task_id: task.id, state: 'failed_local_check',
      artifact_revisions: Object.fromEntries(Object.entries(snapshot.artifacts).map(([id, value]) => [id, value.revision]))};
    if (snapshot?.verified) {
      need(!task.input_artifact_ids.some(id => selected.has(plan.artifacts.find(item => item.id === id)?.producer_task_id)),
        'ADAPTIVE_PARTIAL_REPAIR_STALE_CONSUMER');
      return {task_id: task.id, state: 'ready',
      artifact_revisions: Object.fromEntries(Object.entries(snapshot.artifacts).map(([id, value]) => [id, value.revision]))};
    }
    need(!snapshot && failure.undispatched_task_ids.includes(task.id), 'ADAPTIVE_PARTIAL_REPAIR_UNEXPLAINED_TASK');
    return {task_id: task.id, state: 'undispatched', artifact_revisions: {}};
  });
  const body = {policy: PARTIAL_REPAIR_POLICY, source_round_index: failure.round_index,
    source_binding_digest: failure.binding_digest, task_states: states,
    local_failures: clone(rows), task_ids: tasks.filter(task => selected.has(task.id)).map(task => task.id),
    artifact_ids: plan.artifacts.filter(item => artifacts.has(item.id)).map(item => item.id)};
  return {id: 'repair-local-readiness-owners', ...body, proof_sha256: digest(body),
    reason: 'Repair exact output artifacts rejected by their owner-local readiness checks, then run every remaining DAG task and public check.',
    evidence_refs: rows.map(row => `local:${row.check_id}:${row.evidence_key}`)};
}

export function buildPartialRepairWorkerContext({plan, failure, candidate, task, snapshots, artifactBindings}) {
  const rebuilt = buildPartialReadinessRepair({plan, failure, snapshots, artifactBindings});
  need(isDeepStrictEqual(candidate, rebuilt) && candidate.task_ids.includes(task.id));
  const artifact_ids = task.output_artifact_ids.filter(id => candidate.artifact_ids.includes(id));
  const paths = artifact_ids.flatMap(id => artifactBindings[id].paths);
  need(artifact_ids.length && paths.every(path => task.write_scope.includes(path)));
  return {task: {...clone(task), output_artifact_ids: artifact_ids, write_scope: paths},
    context: {schema_version: 'adaptive-local-readiness-repair/v1', instructions:
      'Correct only the supplied local readiness failures in the writable artifacts. Preserve existing public behavior and interfaces. The remaining DAG tasks have not necessarily executed; missing artifacts are not successful outputs. Do not alter tests.',
      artifact_ids, allowed_write_paths: paths, source_binding_digest: failure.binding_digest,
      source_proof_sha256: candidate.proof_sha256, local_failures: clone(candidate.local_failures.filter(row => row.task_id === task.id)),
      source_artifact_revisions: clone(candidate.task_states.find(row => row.task_id === task.id).artifact_revisions),
      required_read_artifact_ids: [], required_read_artifacts: []},
    report: {policy: PARTIAL_REPAIR_POLICY, exact_runtime_owner: true, provider_calls: 0,
      source_proof_sha256: candidate.proof_sha256, selected_artifact_ids: artifact_ids}};
}
