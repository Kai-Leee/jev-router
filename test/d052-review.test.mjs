import test from 'node:test';
import assert from 'node:assert/strict';
import {runLifecycle} from '../src/orchestration/lifecycle-router-v3.mjs';
const plan={tasks:[{id:'a',description:'own a',paths:['a.py'],dependsOn:[]},{id:'b',description:'own b',paths:['b.py'],dependsOn:['a']}],integrationInstructions:'Follow full public specification'};
const issue=path=>({id:'behavior-001',expected:'integer default',observed:'string default',path});
for(const [name,check] of [['no issue',{ok:false}],['unowned issue',{ok:false,issues:[issue('b.py')]}],['incomplete issue',{ok:false,issues:[{id:'x',path:'a.py'}]}]])test(`D052 independent: ${name} does not trigger speculative repair`,async()=>{
 let calls=0,decisions=0;
 const result=await runLifecycle({plan,selectedPlan:plan,execute:async()=>{calls++;return {}},verify:async()=>check,decide:async()=>{decisions++;throw Error('no repair allowed')}});
 assert.equal(result.stopped_code,'REPAIR_TARGET_UNRESOLVED');assert.equal(calls,1);assert.equal(decisions,0);
});
test('D052 independent: whole behavior failure remains failed after scoped stage passes',async()=>{
 const result=await runLifecycle({plan,selectedPlan:plan,execute:async()=>({}),verify:async({scope})=>scope==='whole'?{ok:false,issues:[issue('a.py')]}:{ok:true,public_smoke:{status:'not_applicable'}},decide:async()=>{throw Error('unexpected decision')}});
 assert.equal(result.stopped_code,'WHOLE_VERIFICATION_FAILED');assert.equal(result.independent_resolved,null);
});
test('D052 independent: actual dispatch overlaps ready workers within cap and waits for prerequisites',async()=>{
 const parallel={tasks:[...plan.tasks,{id:'c',description:'own c',paths:['c.py'],dependsOn:[]},{id:'d',description:'own d',paths:['d.py'],dependsOn:[]}],integrationInstructions:plan.integrationInstructions};
 let active=0,max=0;const completed=new Set(),started=[];
 const result=await runLifecycle({plan:parallel,selectedPlan:parallel,maxConcurrency:2,execute:async({task})=>{assert.ok(task.dependsOn.every(id=>completed.has(id)));started.push(task.id);active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;completed.add(task.id);return {}},verify:async()=>({ok:true}),decide:async q=>{const batches=q.state.batches;const key=Object.keys(batches).sort((a,b)=>batches[b].length-batches[a].length)[0];return {answers:{[Object.keys(q.questions)[0]]:{type:'choice',choice:key,confidence:.5}}}}});
 assert.equal(max,2);assert.equal(started.length,4);assert.equal(result.status,'ready_for_independent_grade');
});
test('D052 independent: generic worker exception without artifact observation is terminal',async()=>{
 let decisions=0;const result=await runLifecycle({plan,selectedPlan:plan,execute:async()=>{throw Error('AUTH_CONFIGURATION_FAILURE')},verify:async()=>({ok:true}),decide:async()=>{decisions++;}});
 assert.equal(result.stopped_code,'REPAIR_TARGET_UNRESOLVED');assert.equal(decisions,0);
});
