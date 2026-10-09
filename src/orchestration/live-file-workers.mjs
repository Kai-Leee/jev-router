import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {buildWorkerInput} from './worker-inputs.mjs';

const fail=code=>{throw new Error(code);};
export function safeArtifactPath(path){
  if(typeof path!=='string'||!path||path.length>240||path.includes('\\')||path.startsWith('/')||path.split('/').some(p=>!p||p==='.'||p==='..'||p.startsWith('.git'))||!/^[-a-zA-Z0-9_./]+$/.test(path))fail('INVALID_ARTIFACT_PATH');
  return path;
}
export function validatePlan(plan){
  if(!plan||!Array.isArray(plan.tasks)||plan.tasks.length<2||plan.tasks.length>4||typeof plan.integrationInstructions!=='string'||!plan.integrationInstructions.trim())fail('INVALID_PLAN');
  const ids=new Set(),paths=new Set();
  for(const task of plan.tasks){
    if(!/^[a-zA-Z][a-zA-Z0-9_-]{0,39}$/.test(task.id)||ids.has(task.id)||typeof task.description!=='string'||!task.description.trim()||!Array.isArray(task.paths)||!task.paths.length||!Array.isArray(task.dependsOn))fail('INVALID_TASK');
    ids.add(task.id);
    for(const path of task.paths){safeArtifactPath(path);if([...paths].some(p=>p===path||p.startsWith(path+'/')||path.startsWith(p+'/')))fail('OVERLAPPING_OWNERSHIP');paths.add(path);}
  }
  for(const t of plan.tasks)if(new Set(t.dependsOn).size!==t.dependsOn.length||t.dependsOn.some(id=>!ids.has(id)||id===t.id))fail('INVALID_DEPENDENCY');
  const done=new Set();
  while(done.size<ids.size){const ready=plan.tasks.filter(t=>!done.has(t.id)&&t.dependsOn.every(id=>done.has(id)));if(!ready.length)fail('CYCLIC_PLAN');for(const t of ready)done.add(t.id);}
  return structuredClone(plan);
}
export function validateFiles(response,allowed){
  if(!response||typeof response.summary!=='string'||!Array.isArray(response.files))fail('INVALID_WORKER_RESPONSE');
  if(!['artifacts','observed_checks','blockers','uncertainty'].every(key=>Array.isArray(response[key]))||response.observed_checks.length!==0)fail('INVALID_WORKER_EVIDENCE');
  if(response.artifacts.length!==allowed.length||new Set(response.artifacts).size!==allowed.length||response.artifacts.some(path=>!allowed.includes(path)))fail('INVALID_ARTIFACT_RECEIPT');
  const seen=new Set();let bytes=0;
  for(const file of response.files){safeArtifactPath(file.path);if(seen.has(file.path)||!allowed.includes(file.path)||typeof file.content!=='string')fail('INVALID_WORKER_FILE');seen.add(file.path);bytes+=Buffer.byteLength(file.content);}
  if(bytes>2_000_000||allowed.some(path=>!seen.has(path)))fail('INCOMPLETE_OR_OVERSIZED_FILES');
  return response.files;
}
export function splitPolicies(answer){
  const p=answer?.beneficial?.noul,e=answer?.evidence?.choice;
  if(typeof p!=='number'||!Number.isFinite(p)||p<0||p>1||!['sufficient','insufficient'].includes(e))fail('INVALID_SPLIT_ANSWER');
  return [.5,.65,.8].map(threshold=>({threshold,probability:p,evidence:e,action:e==='insufficient'?'collect_evidence':p>=threshold?'split':'single'}));
}
// No generated command is executed. Caller owns a new private directory.
export async function runFileArm({plan,brief,mode,outputDir,call,record=async()=>{},maxConcurrency=2,profile={model:'fixture-model',effort:'medium'},inputMode='legacy'}){
  plan=validatePlan(plan);
  if(!['single','split'].includes(mode)||![1,2].includes(maxConcurrency)||!['legacy','deduplicated','projected'].includes(inputMode))fail('INVALID_ARM');
  mkdirSync(outputDir,{mode:0o700});
  const started=performance.now(),completed=new Set(),files=[],receipts=[];
  const tasks=mode==='single'?[{id:'single',description:'Implement every task in the frozen plan.',paths:plan.tasks.flatMap(t=>t.paths),dependsOn:[]}]:plan.tasks;
  let failure=null;
  while(completed.size<tasks.length&&!failure){
    const ready=tasks.filter(t=>!completed.has(t.id)&&t.dependsOn.every(id=>completed.has(id))).slice(0,maxConcurrency);
    if(!ready.length)fail('SCHEDULER_STALLED');
    // Stage barrier: deterministic completed context; never dispatch more after failure.
    const context=structuredClone(files);
    const settled=await Promise.allSettled(ready.map(async task=>{
      const preparationStarted=performance.now();
      const legacyRequest={brief,plan,task,taskId:task.id,goal:brief,requirements:brief,model:profile.model,effort:profile.effort,writeScopes:task.paths,dependencies:task.dependsOn,acceptanceCriteria:{originalBrief:brief,assignedContract:task.description,integrationInstructions:plan.integrationInstructions},evidence:context,completedFiles:context,outputContract:{files:[{path:'owned relative path',content:'complete file contents'}],artifacts:task.paths,observed_checks:[],blockers:[],uncertainty:['No tools available; checks are unexecuted.'],summary:'Generated files; no checks executed.'}};
      const prepared=inputMode==='legacy'?{request:legacyRequest,manifest:{mode:'legacy'}}:buildWorkerInput({plan,task,brief,completedFiles:context,profile,mode:inputMode,executionMode:mode});
      await record({event:'worker_input_prepared',arm:mode,taskId:task.id,manifest:prepared.manifest,input_preparation_ms:performance.now()-preparationStarted});
      const response=await call(prepared.request,`${mode}-${task.id}`);
      const artifacts=validateFiles(response.response,task.paths);
      for(const f of artifacts){const p=join(outputDir,f.path);mkdirSync(dirname(p),{recursive:true,mode:0o700});writeFileSync(p,f.content,{flag:'wx',mode:0o600});}
      const receipt={taskId:task.id,...response};await record({event:'worker_completed',arm:mode,...receipt});return {receipt,artifacts};
    }));
    for(const s of settled){if(s.status==='rejected'){failure=s.reason;await record({event:'worker_failed',arm:mode,code:'WORKER_FAILED',retry:false});}else{completed.add(s.value.receipt.taskId);files.push(...s.value.artifacts);receipts.push(s.value.receipt);}}
  }
  return {mode,status:failure?'failed':'completed',wall_ms:performance.now()-started,receipts,completed:[...completed],fileCount:files.length,quality:null,error:failure?'WORKER_FAILED':null};
}
