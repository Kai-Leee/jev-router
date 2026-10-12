import test from 'node:test';
import assert from 'node:assert/strict';
import {runLifecycle} from '../src/orchestration/lifecycle-router-v3.mjs';
const plan={tasks:[{id:'core',description:'Core files',paths:['core.py'],dependsOn:[]},{id:'consumer',description:'Consumer files',paths:['consumer.py'],dependsOn:['core']}],integrationInstructions:'Public requirements only'};
const resume=()=>({selected_count:2,plan:structuredClone(plan),tasks:{core:{status:'accepted',attempts:1,repairs:0},consumer:{status:'pending',attempts:0,repairs:0}},workerResults:{core:{status:'provider_completed',invocation_id:'confirmed-worker',files:[{path:'core.py',sha256:'a'.repeat(64)}],summary:'Core written',outcome_uncertain:false}}});
const options=r=>({plan,selectedPlan:plan,resume:r,decide:async()=>{throw Error('unexpected decision')},execute:async()=>({status:'provider_completed',outcome_uncertain:false}),verify:async()=>({ok:true})});
test('D054 independent: confirmed core is reverified but never reexecuted',async()=>{
 const executed=[],verified=[];const result=await runLifecycle({...options(resume()),execute:async({task})=>{executed.push(task.id);return {status:'provider_completed',outcome_uncertain:false}},verify:async({scope,task})=>{verified.push(scope==='task'?task.id:'whole');return {ok:true}}});
 assert.deepEqual(executed,['consumer']);assert.deepEqual(verified,['core','consumer','whole']);assert.equal(result.continuation,true);assert.equal(result.tasks.core.attempts,1);assert.equal(result.events.filter(e=>e.event==='worker_result_reused').length,1);
});
test('D054 independent: uncertain parent output cannot be reused',async()=>{
 const r=resume();r.workerResults.core.outcome_uncertain=true;let executions=0;await assert.rejects(()=>runLifecycle({...options(r),execute:async()=>executions++}),/UNCONFIRMED_RESUME_RESULT/);assert.equal(executions,0);
});
test('D054 independent: altered selected plan rejects prior evidence',async()=>{
 const changed=structuredClone(plan);changed.tasks[0].paths=['other.py'];await assert.rejects(()=>runLifecycle({...options(resume()),selectedPlan:changed}),/RESUME_PLAN_MISMATCH/);
});
test('D054 independent: failed revalidation cannot dispatch dependent worker',async()=>{
 let executions=0;const result=await runLifecycle({...options(resume()),execute:async()=>executions++,verify:async()=>({ok:false})});assert.equal(executions,0);assert.equal(result.stopped_code,'REPAIR_TARGET_UNRESOLVED');
});
test('D054 independent: prior attempt without confirmed result cannot silently rerun',async()=>{
 const r=resume();delete r.workerResults.core;let executions=0;await assert.rejects(()=>runLifecycle({...options(r),execute:async()=>executions++}),/MISSING_RESUME_RESULT/);assert.equal(executions,0);
});

import {encodeObjectState,decodeObjectState} from '../src/orchestration/decision-projection-v2.mjs';
test('D054 independent: dangling object reference is rejected rather than silently dropped',()=>{
 const e=encodeObjectState({text:'short'});e.data={[e.encoding.reference_key]:'absent'};assert.throws(()=>decodeObjectState(e),/INVALID_OBJECT_REFERENCE/);
});
test('D054 independent: non-string fragment metadata cannot become substituted evidence',()=>{
 const e=encodeObjectState({text:'short'});e.data={[e.encoding.string_parts_key]:[{ref:'bad'}]};e.string_table={bad:{fake:'evidence'}};assert.throws(()=>decodeObjectState(e),/INVALID_STRING_PARTS/);
});
test('D054 independent: repeated evidence and literals survive exact encoding independently',()=>{
 const long='Public requirement with exact source and symbols 한글.\n'.repeat(20);const value={evidence:[{text:long,observed:null},{text:long,observed:null}],literal:{$jev_object_ref:'user string',$jev_string_parts:['user text']},zero:0,no:false};const encoded=encodeObjectState(value);assert.deepEqual(decodeObjectState(encoded),value);assert.equal(decodeObjectState(encoded).evidence.length,2);
});
