import {readFileSync} from 'node:fs';
import {validatePlan} from './live-file-workers.mjs';
const contract=JSON.parse(readFileSync(new URL('../../docs/orchestration/contracts/task-count.v1.json',import.meta.url),'utf8'));
// Deterministic coarsening only: do not invent finer roles than the supplied plan.
export function buildCountCandidates(input){
 const plan=validatePlan(input,{minTasks:1}),ordered=[],done=new Set();
 while(ordered.length<plan.tasks.length){const ready=plan.tasks.filter(t=>!done.has(t.id)&&t.dependsOn.every(d=>done.has(d)));if(!ready.length)throw Error('INVALID_COUNT_PLAN');for(const t of ready){ordered.push(t);done.add(t.id);}}
 const candidates={};
 for(let count=1;count<=ordered.length;count++){
  const groups=Array.from({length:count},()=>[]);
  ordered.forEach((t,i)=>groups[Math.floor(i*count/ordered.length)].push(t));
  const owner=new Map(groups.flatMap((g,i)=>g.map(t=>[t.id,`group${i+1}`])));
  candidates[count]=validatePlan({tasks:groups.map((g,i)=>({id:`group${i+1}`,description:g.map(t=>`Original role ${t.id}: ${t.description}`).join('\n'),paths:g.flatMap(t=>t.paths),dependsOn:[...new Set(g.flatMap(t=>t.dependsOn).map(d=>owner.get(d)))].filter(d=>d!==`group${i+1}`)})),integrationInstructions:plan.integrationInstructions},{minTasks:1});
 }
 return candidates;
}
export function countQuestions(candidates){
 return {task_count:{...structuredClone(contract.question),criteria:Object.fromEntries(Object.entries(candidates).map(([key,plan])=>[key,`Execute exactly ${plan.tasks.length} task units using candidatePlans[${key}]. ${key==='1'?'Keep the work together.':'Preserve the supplied role boundaries and dependencies.'}`]))}};
}
export function selectTaskCount(answers,candidates){
 const a=answers?.task_count;
 if(a?.type!=='choice'||typeof a.choice!=='string'||! /^[1-5]$/.test(a.choice)||!Object.hasOwn(candidates,a.choice)||!Number.isFinite(a.confidence)||a.confidence<0||a.confidence>1)throw Error('INVALID_TASK_COUNT_ANSWER');
 const count=Number(a.choice);
 return {modes:[count===1?'single':'split'],taskCount:count,choice:a.choice,confidence:a.confidence,decisionBasis:'count',decisionUsed:true,reason:'task_count_choice',probability:null,threshold:null};
}
