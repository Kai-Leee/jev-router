#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {performance} from 'node:perf_hooks';
import {runArtifactWorkflow} from '../src/orchestration/dag-workflow.mjs';
import {allocateDagOwners} from '../src/orchestration/dag-decision-adapter.mjs';
import {projectDagEvents} from '../src/dashboard/dag-metrics.mjs';
import {renderDagView} from '../src/dashboard/dag-view.mjs';
const exec=promisify(execFile),root=resolve(import.meta.dirname,'..');
const output=resolve(process.argv[2]??join(root,'benchmark-runs',`d064-pilot-${randomUUID()}`));
if(!output.startsWith(join(root,'benchmark-runs')+'/'))throw Error('OUTPUT_MUST_BE_NEW_RUN_DIRECTORY');
mkdirSync(output,{mode:0o700});
const save=(name,value)=>writeFileSync(join(output,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
const sourcePaths=['src/orchestration/dag-contracts.mjs','src/orchestration/dag-decision-adapter.mjs','src/orchestration/artifact-dag.mjs','src/orchestration/dag-scheduler.mjs','src/orchestration/artifact-verification-gate.mjs','src/orchestration/dag-workflow.mjs','src/dashboard/dag-metrics.mjs','src/dashboard/dag-view.mjs','docs/orchestration/contracts/dag-routing.v1.json','examples/dag/contract-fixture.json','scripts/dag-local-pilot.mjs','src/client.mjs'];
mkdirSync(join(output,'sources'));
const sources=sourcePaths.map((path,index)=>{const bytes=readFileSync(join(root,path));const snapshot=`sources/${index}-${path.split('/').at(-1)}`;writeFileSync(join(output,snapshot),bytes,{flag:'wx',mode:0o600});return {path,snapshot,sha256:createHash('sha256').update(bytes).digest('hex')};});
save('protocol.json',{mode:'offline_fixture',sources,model_calls:0});
const sandbox=mkdtempSync(join(tmpdir(),'jev-dag-local-')),plan=JSON.parse(readFileSync(join(root,'examples/dag/contract-fixture.json')));
mkdirSync(join(sandbox,'examples/dag/output'),{recursive:true});
const runtime={node_version:process.version,platform:process.platform,arch:process.arch,executable:process.execPath};
const environmentRef=`node-${process.version}-${process.platform}-${process.arch}-fixture`;
for(const check of plan.checks)check.environment_ref=environmentRef;
const requests=[];
const allocation=await allocateDagOwners({bundles:plan.tasks.filter(t=>t.kind==='implementation').map(t=>({id:t.id,obligation_ids:t.requirement_ids,
 eligible_owner_ids:plan.workers.map(w=>w.id),evidence_refs:['synthetic fixture']})),owners:plan.workers.map(w=>({id:w.id,capacity:1,minimum:1})),
 decide:async r=>{requests.push(r);return {answers:Object.fromEntries(Object.entries(r.questions).map(([id,q])=>[id,{type:'choice',choice:Object.keys(q.criteria)[0]}]))};}});
if(allocation.status!=='completed')throw Error('MOCK_ALLOCATION_FAILED');
for(const a of allocation.assignments)plan.tasks.find(t=>t.id===a.bundle_id).worker_id=a.owner_id;
save('allocation.json',{mode:'mock_choice_no_inference',allocation,requests});
const revisions=id=>join(sandbox,'examples/dag/output',id==='artifact-core'?'core.json':'ui.json');
const subprocesses=[];let active=0,peak=0;const started=performance.now();
try {
 const result=await runArtifactWorkflow({plan,run_id:output.split('/').at(-1),clock:()=>performance.now()-started,
 getRevision:async id=>createHash('sha256').update(readFileSync(revisions(id))).digest('hex'),
 execute:async task=>{
  active++;peak=Math.max(peak,active);
  try {for(const id of task.output_artifact_ids){const body=id==='artifact-core'?{value:7}:{label:'value:7'};
   await exec(process.execPath,['-e',"require('node:fs').writeFileSync(process.argv[1],process.argv[2])",revisions(id),JSON.stringify(body)],{timeout:10000});}
   return {status:'completed'};
  }finally{active--;}
 },
 runCheck:async(check,{artifact_revisions})=>{
  let raw;try {const r=await exec(process.execPath,check.argv.slice(1),{cwd:join(sandbox,check.cwd),timeout:10000});raw={exit_code:0,stdout:r.stdout,stderr:r.stderr};}
  catch(e){raw={exit_code:Number.isInteger(e.code)?e.code:null,stdout:e.stdout??'',stderr:e.stderr??'',outcome_uncertain:!!e.killed};}
  subprocesses.push({check_id:check.id,argv:[process.execPath,...check.argv.slice(1)],cwd:check.cwd,...raw});
  return {status:raw.exit_code===0?'passed':'failed',executed:true,exit_code:raw.exit_code,assertions:raw.exit_code===0?1:0,skipped:0,outcome_uncertain:raw.outcome_uncertain??false,
   check_id:check.id,check_version:check.version,environment_ref:check.environment_ref,artifact_revisions};
 }});
 const source_changes_during_run=sources.filter(s=>createHash('sha256').update(readFileSync(join(root,s.path))).digest('hex')!==s.sha256).map(s=>s.path);
 const summary={...result,source_changes_during_run,wall_ms:performance.now()-started,actual_subprocess_checks:subprocesses.length,peak_fixture_implementations:peak,
  mode:'synthetic_artifact_workflow_actual_local_subprocesses',runtime,environment_ref:environmentRef,model_calls:0,limitations:['Fixture artifacts, not product implementation.','No live Jev choice, paid worker, product grade or speedup measurement.','No durable restart/live adapter.']};
 save('plan.json',plan);save('result.json',summary);save('subprocesses.json',subprocesses);
 const projection=projectDagEvents(result.events);save('projection.json',projection);save('dashboard.html',renderDagView(projection));
 console.log(JSON.stringify({output,status:summary.status,wall_ms:summary.wall_ms,actual_subprocess_checks:subprocesses.length,peak_fixture_implementations:peak,model_calls:0}));
 if(summary.status!=='completed')process.exitCode=1;
}finally{rmSync(sandbox,{recursive:true,force:true});}
