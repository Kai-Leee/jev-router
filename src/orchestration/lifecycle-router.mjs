import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {buildCountCandidates} from './task-count.mjs';
const contract=JSON.parse(readFileSync(new URL('../../docs/orchestration/contracts/lifecycle.v1.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);
export async function runLifecycle({plan,brief,decide,execute,verify,record=async()=>{},initialEvidence=[],maxConcurrency=2,maxRecoveryPerTask=1,model='opus',effort='medium'}){
 if(![decide,execute,verify,record].every(x=>typeof x==='function')||!Number.isInteger(maxConcurrency)||maxConcurrency<1||maxConcurrency>5||![0,1].includes(maxRecoveryPerTask)||!Array.isArray(initialEvidence))throw Error('INVALID_LIFECYCLE_OPTIONS');
 const candidates=buildCountCandidates(plan),started=performance.now(),evidence=clone(initialEvidence),events=[];let revision=0,sequence=0,selected;
 const emit=async(event,data={})=>{const row={event,sequence:++sequence,...clone(data)};events.push(row);await record(row);};
 const add=async(kind,data)=>{evidence.push({revision:++revision,kind,...clone(data)});await emit('evidence_updated',{revision,kind,...data});};
 const snapshot=()=>({schema_version:'lifecycle-evidence/v1',revision,items:clone(evidence)});
 const choose=async(stage,criteria,extra={})=>{
  const keys=Object.keys(criteria);if(keys.length===1){await emit('decision_bypassed',{stage,reason:'singleton',choice:keys[0]});return keys[0];}
  const q=contract.questions[stage],request={stage,questions:{[q.key]:{type:'choice',instructions:q.instructions,criteria}},state:{objective:contract.objective,brief:clone(brief),plan:clone(selected??plan),evidence:snapshot(),workerProfile:{model,effort,fixed:true},workerCapabilities:'Scoped tool-based individual file writes; final response is summary, not giant JSON. Verification checks syntax and ownership only, not requirement satisfaction.',maxConcurrency,...clone(extra)}};
  await emit('decision_requested',request);const response=await decide(clone(request)),a=response?.answers?.[q.key];
  if(a?.type!=='choice'||!keys.includes(a.choice)||!Number.isFinite(a.confidence)||a.confidence<0||a.confidence>1)throw Error('INVALID_LIFECYCLE_DECISION');
  await add('decision',{stage,choice:a.choice,confidence:a.confidence});return a.choice;
 };
 await emit('profile_selection_bypassed',{reason:'paired_experiment_fixed_profile',model,effort});
 const count=await choose('initial_count',Object.fromEntries(Object.keys(candidates).map(n=>[n,`Execute candidatePlans[${n}] with exactly ${n} owned task units.`])),{candidatePlans:candidates});selected=candidates[count];
 const states=Object.fromEntries(selected.tasks.map(t=>[t.id,{status:'pending',attempts:0,repairs:0}]));let stopped=null;
 const verifyChecked=async(args)=>{const result=await verify(args);if(typeof result?.ok!=='boolean')throw Error('INVALID_VERIFICATION_RESULT');return result;};
 const work=async(task,repair=false)=>{
  const s=states[task.id];s.status='running';s.attempts++;if(repair)s.repairs++;
  await emit('worker_started',{taskId:task.id,attempt:s.attempts,repair});
  try{const workerResult=await execute({task:clone(task),plan:clone(selected),brief:clone(brief),evidence:snapshot(),attempt:s.attempts,repair,model,effort});
   await add('worker_result',{taskId:task.id,attempt:s.attempts,result:workerResult??null});
   if(workerResult?.outcome_uncertain===true||workerResult?.uncertain===true){const failure={code:'UNCERTAIN_PROVIDER_OUTCOME',uncertain:true};await add('failure',{taskId:task.id,attempt:s.attempts,...failure});return {task,failure};}
   const check=await verifyChecked({scope:'task',task:clone(task),plan:clone(selected),brief:clone(brief),evidence:snapshot(),workerResult});
   await add('verification',{taskId:task.id,scope:'task',result:check});return {task,workerResult,check};
  }catch(error){const failure={code:error.code??error.message??'WORKER_ERROR',uncertain:error.uncertain===true||error.outcome_uncertain===true,...(error.evidence===undefined?{}:{evidence:clone(error.evidence)})};await add('failure',{taskId:task.id,attempt:s.attempts,...failure});return {task,failure};}
 };
 const resolve=async outcome=>{
  const {task}=outcome,s=states[task.id];let repair=false;
  if(outcome.failure?.uncertain){s.status='uncertain';stopped='UNCERTAIN_PROVIDER_OUTCOME';await emit('recovery_bypassed',{taskId:task.id,reason:stopped});return;}
  if(outcome.failure||!outcome.check.ok){
   if(s.repairs>=maxRecoveryPerTask){s.status='failed';stopped='RECOVERY_LIMIT';return;}
   repair=(await choose('failure_recovery',{repair:'Repair the confirmed failure using the same owned paths and carried observations.',stop:'Stop because repair is not justified by available evidence.'},{task,failure:outcome.failure??{code:'VERIFICATION_FAILED',observations:outcome.check}}))==='repair';
   if(!repair){s.status='failed';stopped='RECOVERY_STOPPED';return;}
  }else{
   const criteria={accept:'Accept this task based on observations and continue with dependent tasks; independent grading remains pending.'};
   if(s.repairs<maxRecoveryPerTask)criteria.repair='Repair a substantive requirement gap using the same owned task and available observations.';
   else criteria.stop='Stop this task if a substantive gap remains; the repair budget is exhausted.';
   const choice=await choose('post_worker_review',criteria,{task,workerResult:outcome.workerResult,verification:outcome.check});
   if(choice==='accept'){s.status='accepted';await emit('task_accepted',{taskId:task.id});return;}
   if(choice==='stop'){s.status='failed';stopped='REVIEW_STOPPED';return;}repair=true;
  }
  if(repair)await resolve(await work(task,true));
 };
 while(Object.values(states).some(s=>s.status==='pending')&&!stopped){
  const ready=selected.tasks.filter(t=>states[t.id].status==='pending'&&t.dependsOn.every(d=>states[d].status==='accepted'));
  if(!ready.length){stopped='DEPENDENCY_STALLED';break;}
  const batches={};for(let mask=1;mask<(1<<ready.length);mask++){const batch=ready.filter((_,i)=>mask&(1<<i));if(batch.length<=maxConcurrency)batches[`batch${mask}`]=batch;}
  const key=await choose('ready_selection',Object.fromEntries(Object.entries(batches).map(([k,v])=>[k,`Execute together: ${v.map(t=>t.id).join(', ')}.`])),{readyTasks:ready,batches:Object.fromEntries(Object.entries(batches).map(([k,v])=>[k,v.map(t=>t.id)]))});
  const outcomes=await Promise.all(batches[key].map(t=>work(t)));
  // All dispatched outcomes retained before recovery; uncertainty blocks new work.
  if(outcomes.some(o=>o.failure?.uncertain)){for(const o of outcomes){states[o.task.id].status=o.failure?.uncertain?'uncertain':'unreviewed';}stopped='UNCERTAIN_PROVIDER_OUTCOME';await emit('recovery_bypassed',{reason:stopped});break;}
  for(const outcome of outcomes){if(stopped){states[outcome.task.id].status='unreviewed';continue;}await resolve(outcome);}
 }
 let finalCheck=null;
 if(!stopped){finalCheck=await verifyChecked({scope:'whole',plan:clone(selected),brief:clone(brief),evidence:snapshot()});await add('verification',{scope:'whole',result:finalCheck});if(!finalCheck.ok)stopped='WHOLE_VERIFICATION_FAILED';}
 const result={schema_version:'lifecycle-result/v1',status:stopped?'stopped':'ready_for_independent_grade',stopped_code:stopped,selected_count:Number(count),plan:clone(selected),tasks:clone(states),evidence:snapshot(),final_check:finalCheck,independent_resolved:null,wall_ms:performance.now()-started};
 await emit('lifecycle_completed',result);return {...result,events};
}
