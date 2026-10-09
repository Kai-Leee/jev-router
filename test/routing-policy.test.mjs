import test from 'node:test';
import assert from 'node:assert/strict';
import {selectExecution,routingMetrics} from '../src/orchestration/routing-policy.mjs';
const answer=(p,e='sufficient')=>({beneficial:{type:'noul',noul:p},evidence:{type:'choice',choice:e}});
test('both model authorities use same threshold, abstain and reject invalid answers',()=>{for(const authority of ['claude','jev']){assert.deepEqual(selectExecution({authority,threshold:.65,answers:answer(.66)}).modes,['split']);assert.deepEqual(selectExecution({authority,threshold:.65,answers:answer(.66,'insufficient')}).modes,[]);assert.throws(()=>selectExecution({authority,answers:answer(.9)}));assert.throws(()=>selectExecution({authority,threshold:.65,answers:answer(2)}));}});
test('forced arm does not claim decision use or avoided Claude call',()=>{const selection=selectExecution({authority:'forced'});assert.deepEqual(selection.modes,['single','split']);const m=routingMetrics({authority:'forced',selection,elapsedMs:0,claudeCalls:0,jevCalls:1});assert.equal(m.decision_used,false);assert.equal(m.eliminated_claude_calls_vs_paired_baseline,null);assert.equal(m.planning_replaced,false);});
test('script detects later parallel branch and rejects impossible graph',()=>{assert.deepEqual(selectExecution({authority:'script',plan:{tasks:[{id:'a',dependsOn:[]},{id:'b',dependsOn:['a']},{id:'c',dependsOn:['a']}]}}).modes,['split']);assert.deepEqual(selectExecution({authority:'script',plan:{tasks:[{id:'a',dependsOn:[]},{id:'b',dependsOn:['a']}]}}).modes,['single']);assert.throws(()=>selectExecution({authority:'script',plan:{tasks:[{id:'a',dependsOn:['missing']}]}}));});

test('pilot telemetry identifiers construct without network access',async()=>{
 const {createMeasuredDecider}=await import('../src/benchmark/telemetry.mjs');
 const fs=await import('node:fs');const source=fs.readFileSync(new URL('../scripts/tree-e2e-pilot.mjs',import.meta.url),'utf8');
 const role=source.match(/agent_role:'([^']+)'/)[1];
 assert.doesNotThrow(()=>createMeasuredDecider({client:{},record:async()=>{},identifiers:{run_id:'tree-pilot',attempt_id:'tree-pilot',group_id:'tree-pilot',agent_role:role}}));
});
