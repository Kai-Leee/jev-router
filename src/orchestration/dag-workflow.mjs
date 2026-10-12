import {performance} from 'node:perf_hooks';
import {validateDagPlan} from './dag-contracts.mjs';
import {analyzeDag} from './artifact-dag.mjs';
import {runDag} from './dag-scheduler.mjs';
import {executeArtifactTask} from './artifact-verification-gate.mjs';

const fail = code => { throw Object.assign(new Error(code), {code}); };
const text = value => typeof value === 'string' && value.length > 0 && value.trim() === value
  && !/[\u0000-\u001f\u007f]/u.test(value);

// Opt-in local foundation: fresh in-process runs only. The caller owns durable
// receipts, execution isolation and any future paid adapter. No provider imported.
export async function runArtifactWorkflow({plan, run_id, execute, runCheck, getRevision,
  record = async () => {}, clock = () => performance.now(), resume = false}) {
  if (!text(run_id) || [execute,runCheck,getRevision,record,clock].some(f => typeof f !== 'function')) fail('INVALID_DAG_WORKFLOW_CONFIG');
  if (resume) fail('DAG_RESUME_NOT_IMPLEMENTED');
  const frozenPlan = validateDagPlan(plan), analysis = analyzeDag(frozenPlan);
  const events = [], verified = new Map();
  let sequence = 0, lastTime = -Infinity;
  const emit = async event => {
    const at = clock();
    if (!Number.isFinite(at) || at < 0 || at < lastTime) fail('INVALID_DAG_CLOCK');
    lastTime = at;
    const full = {...structuredClone(event),run_id,graph_revision:frozenPlan.graph_revision,
      event_id:`${run_id}:${++sequence}`,at_ms:at};
    events.push(full); await record(structuredClone(full));
  };
  await emit({event:'dag_plan_analyzed',analysis});
  const execution = await runDag({plan:frozenPlan,clock,record:emit,execute:async(task,{attempt_id}) => {
    // A predecessor's completion is insufficient if its published artifact has
    // since changed. This guard supplements the within-task revision vector.
    for (const id of task.input_artifact_ids) {
      const revision = await getRevision(id,{task,plan:frozenPlan,attempt_id});
      if (!verified.has(id) || revision !== verified.get(id)) fail('DAG_INPUT_NOT_VERIFIED');
    }
    const value = await executeArtifactTask({plan:frozenPlan,task,execute,runCheck,getRevision,record:emit,attempt_id,
      expected_input_artifact_revisions:Object.fromEntries(task.input_artifact_ids.map(id=>[id,verified.get(id)]))});
    for (const id of task.output_artifact_ids) verified.set(id,value.verification.artifact_revisions[id]);
    return value;
  }});
  let status = execution.status, postflight_error = null;
  if (status === 'completed') {
    for (const [id,revision] of verified) {
      try {
        if (await getRevision(id,{plan:frozenPlan,task:null,attempt_id:null}) !== revision) {
          status = 'failed'; postflight_error = 'DAG_PUBLISHED_ARTIFACT_CHANGED'; break;
        }
      } catch {
        status = 'failed'; postflight_error = 'DAG_POSTFLIGHT_REVISION_UNAVAILABLE'; break;
      }
    }
  }
  await emit({event:'dag_run_completed',status,postflight_error,product_success:null});
  return {schema_version:'dag-workflow-result/v1',mode:'local_callback_workflow',status,analysis,execution,
    postflight_error,verified_artifact_revisions:Object.fromEntries(verified),events,
    product_success:null,independent_grade:'not_run',paid_adapter_connected:false,restart_supported:false};
}
