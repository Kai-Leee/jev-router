import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCountCandidates,countQuestions,selectTaskCount} from '../src/orchestration/task-count.mjs';
import {splitCheckpointAdapter as adapter} from '../src/orchestration/split-checkpoint.mjs';
import {createCheckpointRouter} from '../src/orchestration/checkpoint-router.mjs';
import {runFileArm,validatePlan} from '../src/orchestration/live-file-workers.mjs';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const plan={tasks:Array.from({length:5},(_,i)=>({id:`t${i}`,description:`role ${i}`,paths:[`file${i}.py`],dependsOn:i?[`t${i-1}`]:[]})),integrationInstructions:'Preserve interfaces'};
const answers=(n,c=0)=>({task_count:{type:'choice',choice:String(n),confidence:c}});
test('1..5 candidates preserve all files and dependencies without extra model calls',()=>{
 const candidates=buildCountCandidates(plan);assert.deepEqual(Object.keys(countQuestions(candidates).task_count.criteria),['1','2','3','4','5']);
 for(let n=1;n<=5;n++){const p=candidates[n];assert.equal(p.tasks.length,n);validatePlan(p,{minTasks:1});assert.deepEqual(p.tasks.flatMap(t=>t.paths),plan.tasks.flatMap(t=>t.paths));const s=selectTaskCount(answers(n),candidates);assert.equal(s.taskCount,n);assert.deepEqual(s.modes,[n===1?'single':'split']);assert.equal(s.confidence,0);}
});
test('unavailable counts, defer, zero, six, malformed confidence reject',()=>{
 const p=structuredClone(plan);p.tasks=p.tasks.slice(0,2);const c=buildCountCandidates(p);assert.deepEqual(Object.keys(c),['1','2']);
 for(const n of [0,3,5,6,'defer'])assert.throws(()=>selectTaskCount(answers(n),c));
 for(const confidence of [undefined,null,-1,2,'0.5']){const a=answers(1);a.task_count.confidence=confidence;assert.throws(()=>selectTaskCount(a,c));}
});
test('count checkpoint directly dispatches chosen number of actual fixture workers even at zero confidence',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'jev-count-'));let calls=0;const e={id:'count',decisionId:1,executionKey:'count1',scope:'fixture',evidenceRevision:'r1',type:'plan_ready',brief:[{text:'Write five files'}],plan,workerModel:'fixture-model',workerEffort:'medium',maxConcurrency:2,decisionBasis:'count'};
 try{const prepared=adapter.prepare(e);const router=createCheckpointRouter({adapter,readCurrent:async x=>x,record:async()=>{},decide:async()=>({model:'fixture',answers:answers(3)}),handlers:{execute_split:async({selection})=>runFileArm({plan:prepared.request.state.candidatePlans[selection.choice],brief:e.brief,mode:'split',outputDir:join(dir,'out'),allowSingleTask:true,call:async req=>{calls++;return {response:{files:req.task.paths.map(path=>({path,content:'pass\n'})),artifacts:req.task.paths,observed_checks:[],blockers:[],uncertainty:[],summary:'fixture'}};}})}});const r=await router.run(e);assert.equal(r.status,'dispatched');assert.equal(r.selection.taskCount,3);assert.equal(calls,3);assert.equal(r.outcome.fileCount,5);}finally{rmSync(dir,{recursive:true,force:true});}
});
test('one candidate bypasses provider even in force_jev because choice API requires two options',async()=>{
 const one=structuredClone(plan);one.tasks=one.tasks.slice(0,1);let calls=0,executed=0;
 const router=createCheckpointRouter({adapter,decide:async()=>{calls++;throw Error('MUST_NOT_CALL');},record:async()=>{},readCurrent:async e=>e,handlers:{execute_single:async()=>{executed++;return {};}}});
 for(const mode of ['auto','force_jev']){const r=await router.run({id:mode,decisionId:1,executionKey:mode,scope:'one',evidenceRevision:'r1',type:'plan_ready',brief:[{text:'One task'}],plan:one,workerModel:'fixture',workerEffort:'medium',maxConcurrency:2,decisionBasis:'count'},{mode});assert.equal(r.authority,'script');assert.equal(r.decision_used,false);assert.equal(r.selection.taskCount,1);}
 assert.equal(calls,0);assert.equal(executed,2);
});
test('multi-candidate numeric questions satisfy actual API request validation',async()=>{
 const {prepareDecision}=await import('../src/client.mjs');
 for(let n=2;n<=5;n++){const p=structuredClone(plan);p.tasks=p.tasks.slice(0,n);assert.doesNotThrow(()=>prepareDecision({model:'jev-latest',state:{plan:p},questions:countQuestions(buildCountCandidates(p))}));}
});
