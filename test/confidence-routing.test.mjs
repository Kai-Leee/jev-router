import test from 'node:test';
import assert from 'node:assert/strict';
import {selectExecution} from '../src/orchestration/routing-policy.mjs';
import {splitCheckpointAdapter as adapter} from '../src/orchestration/split-checkpoint.mjs';
import {createCheckpointRouter} from '../src/orchestration/checkpoint-router.mjs';
const answers=(choice,confidence)=>({execution:{type:'choice',choice,confidence},evidence:{type:'choice',choice:'sufficient',confidence:1},beneficial:{type:'noul',noul:1}});
const select=(choice,c)=>selectExecution({authority:'jev',threshold:.65,decisionBasis:'confidence',answers:answers(choice,c)});
test('confidence gates the selected strategy, not the direction of splitting',()=>{
 assert.deepEqual(select('single',.99).modes,['single']);assert.deepEqual(select('split',.65).modes,['split']);
 for(const choice of ['split','single']){assert.deepEqual(select(choice,.64).modes,[]);assert.equal(select(choice,.64).reason,'low_confidence');}
 assert.deepEqual(select('defer',1).modes,[]);
});
test('missing invalid confidence never borrows evidence confidence or probability',()=>{
 for(const c of [undefined,null,NaN,-.1,1.1,'0.9'])assert.throws(()=>select('split',c),/INVALID_CONFIDENCE/);
 assert.throws(()=>select('unknown',.9),/INVALID_CONFIDENCE/);assert.deepEqual(select('single',0).modes,[]);
});
const event={id:'e1',decisionId:1,executionKey:'x1',scope:'test',evidenceRevision:'r1',type:'plan_ready',brief:[{text:'Build two independent files'}],plan:{tasks:[{id:'a',description:'a',paths:['a.py'],dependsOn:[]},{id:'b',description:'b',paths:['b.py'],dependsOn:[]}],integrationInstructions:'No imports'},workerModel:'claude-opus-5-5',workerEffort:'medium',maxConcurrency:2,threshold:.65,decisionBasis:'confidence',modelIdentity:'jev-1.13.0'};
test('checkpoint sends choice contract, routes once, separates legacy cache, and abstains',async()=>{
 let calls=0;const actions=[];
 const router=createCheckpointRouter({adapter,decide:async request=>{calls++;return {model:'jev-1.13.0',answers:request.questions.execution?answers('single',calls===3?.2:.9):{beneficial:{type:'noul',noul:.9},evidence:{type:'choice',choice:'sufficient'}}};},record:async()=>{},readCurrent:async e=>e,handlers:Object.fromEntries(['execute_single','execute_split','collect_evidence'].map(a=>[a,async()=>{actions.push(a);return {};}]))});
 const first=await router.run(event);assert.equal(first.handler,'execute_single');assert.equal(first.selection.confidence,.9);
 await router.run({...event,id:'e2',executionKey:'x2',decisionBasis:'probability'});
 await router.run({...event,id:'e3',executionKey:'x3',evidenceRevision:'r2'});
 assert.equal(calls,3);assert.deepEqual(actions,['execute_single','execute_split','collect_evidence']);
 assert.equal(adapter.prepare(event).request.questions.execution.type,'choice');
});

test('one-task forced selection retains confidence metadata',()=>{
 const e=structuredClone(event);e.plan.tasks=e.plan.tasks.slice(0,1);const prepared=adapter.prepare(e);
 const selected=adapter.select(prepared,{answers:answers('split',.91)});
 assert.equal(selected.action,'execute_single');assert.equal(selected.confidence,.91);assert.equal(selected.choice,'split');assert.equal(selected.decisionBasis,'confidence');assert.equal(selected.threshold,.65);
});
