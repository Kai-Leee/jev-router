import test from 'node:test';
import assert from 'node:assert/strict';
import {runLifecycle} from '../src/orchestration/lifecycle-router-v3.mjs';
const plan={tasks:[{id:'a',description:'core',paths:['a.py'],dependsOn:[]},{id:'b',description:'consumer',paths:['b.py'],dependsOn:['a']}],integrationInstructions:'Preserve requirements'};
const answer=(r,c)=>({answers:{[Object.keys(r.questions)[0]]:{type:'choice',choice:c,confidence:.7}}});
test('externally assigned plan bypasses count and incomplete smoke cannot create speculative repair',async()=>{
 const calls=[],decisions=[];
 const r=await runLifecycle({plan,selectedPlan:plan,brief:'requirements',decide:async q=>{decisions.push(q);throw Error('unexpected decision')},execute:async x=>{calls.push(x.task.id);return {summary:'written'}},verify:async()=>({ok:true,public_smoke:{status:'not_applicable'},requirements_verified:false})});
 assert.deepEqual(calls,['a','b']);assert.equal(decisions.length,0);assert.equal(r.independent_resolved,null);assert.equal(r.status,'ready_for_independent_grade');
});
test('invalid supplied dependency graph never dispatches',async()=>{
 const bad=structuredClone(plan);bad.tasks[0].dependsOn=['b'];let n=0;
 await assert.rejects(()=>runLifecycle({plan,selectedPlan:bad,execute:async()=>n++,verify:async()=>({ok:true}),decide:async()=>{}}));assert.equal(n,0);
});
test('confirmed verifier failure retains observations and bounded repair',async()=>{
 let attempts=0;const requests=[];const one={...plan,tasks:[plan.tasks[0]]};
 const r=await runLifecycle({plan:one,selectedPlan:one,brief:'requirements',decide:async q=>{requests.push(q);return answer(q,'repair')},execute:async()=>{attempts++;return {}},verify:async()=>({ok:false,issues:[{id:'check-default',expected:'integer default',observed:'string default',path:'a.py'}]})});
 assert.equal(attempts,2);assert.equal(r.stopped_code,'RECOVERY_LIMIT');assert.equal(requests[0].state.failure.observations.issues[0].id,'check-default');
});
test('uncertain execution stops without repair or dependency dispatch',async()=>{
 const calls=[];const r=await runLifecycle({plan,selectedPlan:plan,decide:async()=>{throw Error('unexpected')},execute:async x=>{calls.push(x.task.id);return {outcome_uncertain:true}},verify:async()=>({ok:true})});assert.deepEqual(calls,['a']);assert.equal(r.stopped_code,'UNCERTAIN_PROVIDER_OUTCOME');
});
