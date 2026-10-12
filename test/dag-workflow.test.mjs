import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runArtifactWorkflow} from '../src/orchestration/dag-workflow.mjs';
const fixture=()=>JSON.parse(readFileSync(new URL('../examples/dag/contract-fixture.json',import.meta.url)));
function setup() {
 const plan=fixture(), revisions=new Map(), calls=[];let clock=0;
 const opts={plan,run_id:'offline-workflow-test',clock:()=>++clock,
 execute:async task=>{calls.push(task.id);for(const id of task.output_artifact_ids)revisions.set(id,`r-${id}`);return {status:'completed'};},
 getRevision:async id=>revisions.get(id),
 runCheck:async (check,{artifact_revisions})=>({status:'passed',executed:true,exit_code:0,assertions:1,skipped:0,outcome_uncertain:false,
 check_id:check.id,check_version:check.version,environment_ref:check.environment_ref,artifact_revisions:structuredClone(artifact_revisions)})};
 return {opts,revisions,calls};
}
test('workflow publishes checked artifacts then verifies integration, without claiming product success',async()=>{
 const {opts,calls}=setup(),r=await runArtifactWorkflow(opts);
 assert.equal(r.status,'completed');assert.equal(r.product_success,null);assert.equal(r.independent_grade,'not_run');
 assert.equal(r.restart_supported,false);assert.deepEqual(calls.sort(),['build-core','build-ui']);
 assert.equal(new Set(r.events.map(e=>e.event_id)).size,r.events.length);
 assert.ok(r.events.every(e=>e.run_id===opts.run_id&&e.graph_revision===opts.plan.graph_revision));
 assert.equal(r.analysis.critical_path_ms,40);
});
test('uncertain implementation cannot open integration',async()=>{
 const {opts,calls}=setup();opts.execute=async t=>{calls.push(t.id);return {status:'completed',outcome_uncertain:true};};
 const r=await runArtifactWorkflow(opts);assert.equal(r.status,'failed');assert.ok(r.execution.undispatched_ids.includes('verify-integration'));
 assert.deepEqual(r.verified_artifact_revisions,{});
});
test('artifact changed after publication blocks consumer even though predecessor completed',async()=>{
 const {opts,revisions}=setup();opts.record=async e=>{if(e.event==='dag_task_completed'&&e.task_id==='build-core')revisions.set('artifact-core','mutated');};
 const r=await runArtifactWorkflow(opts);assert.equal(r.status,'failed');assert.ok(JSON.stringify(r.execution).includes('DAG_INPUT_NOT_VERIFIED'));
});
test('final publication check catches mutation after the final task',async()=>{
 const {opts,revisions}=setup();opts.record=async e=>{if(e.event==='dag_task_completed'&&e.task_id==='verify-integration')revisions.set('artifact-ui','changed');};
 const r=await runArtifactWorkflow(opts);assert.equal(r.status,'failed');assert.equal(r.postflight_error,'DAG_PUBLISHED_ARTIFACT_CHANGED');
});
test('resume unsupported and invalid callbacks fail before implementation',async()=>{
 const {opts,calls}=setup();await assert.rejects(()=>runArtifactWorkflow({...opts,resume:true}),{code:'DAG_RESUME_NOT_IMPLEMENTED'});
 await assert.rejects(()=>runArtifactWorkflow({...opts,runCheck:null}),{code:'INVALID_DAG_WORKFLOW_CONFIG'});assert.equal(calls.length,0);
});
test('unknown relation remains blocked and no product execution is asserted',async()=>{
 const {opts,calls}=setup();opts.plan.unknown_relationships=[{task_ids:['build-core','build-ui'],reason:'unresolved interface',evidence_refs:[]}];
 const r=await runArtifactWorkflow(opts);assert.equal(r.status,'blocked');assert.equal(calls.length,0);assert.equal(r.product_success,null);
});

test('consumer never executes an input that changes between dispatch precheck and gate snapshot',async()=>{
 const {opts,revisions,calls}=setup();
 const ui=opts.plan.tasks.find(t=>t.id==='build-ui');
 ui.input_artifact_ids=['artifact-core'];ui.read_scope=['examples/dag/output/core.json'];
 opts.getRevision=async(id,context)=>{
  if(context.task?.id==='build-ui'&&context.stage==='input_snapshot')revisions.set(id,'unverified-r2');
  return revisions.get(id);
 };
 const r=await runArtifactWorkflow(opts);assert.equal(r.status,'failed');
 assert.deepEqual(calls,['build-core']);assert.ok(r.execution.undispatched_ids.includes('verify-integration'));
});

test('run event identity invalidity is rejected before any implementation callback',async()=>{
 for(const run_id of [' bad ','bad\nrun','bad\u0000run','']) {
  const {opts,calls}=setup();await assert.rejects(()=>runArtifactWorkflow({...opts,run_id}),{code:'INVALID_DAG_WORKFLOW_CONFIG'});
  assert.equal(calls.length,0);
 }
});
