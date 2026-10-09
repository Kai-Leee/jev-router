import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBenchmarkRuntime} from '../bin/benchmark-mcp.mjs';

const identifiers={run_id:'run-1',attempt_id:'attempt-1',group_id:'pair-1',agent_role:'implementation'};
const action=()=>({purpose:'Inspect the isolated workspace.',state:'The workspace is ready.',candidates:[
  {id:'inspect',description:'List source files.',command:'ls src'},
  {id:'test',description:'Run available tests.',command:'npm test'},
]});
const call=(id,name,args)=>({jsonrpc:'2.0',id,method:'tools/call',params:{name,arguments:args}});
const payload=result=>JSON.parse(result.result.content[0].text);

test('MCP runtime accepts legacy identifiers, explicit unlimited and persists recoverable tool failure',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'jev-mcp-runtime-'));let runtime;
  try{
    runtime=await createBenchmarkRuntime({mode:'baseline',container:'mock-container',max_decisions:null,trace_path:join(directory,'decisions.jsonl')},{inspect:async()=>{},execute:async()=>({exit_code:7})});
    assert.equal(runtime.gate.status().max_decisions,null);
    const result=payload(await runtime.dispatch(call(1,'act',{...action(),selected_id:'inspect'})));
    assert.equal(result.outcome.exit_code,7);
    const state=JSON.parse(readFileSync(join(directory,'gate-state.json'),'utf8'));
    assert.equal(state.state,'ready');assert.equal(state.last_exit_code,7);assert.equal(state.recovery_allowed,true);
    const events=readFileSync(join(directory,'decisions.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(events.at(-1).exit_code,7);assert.equal(events.at(-1).status,'failed');
  }finally{runtime?.close();rmSync(directory,{recursive:true,force:true});}
});

test('MCP runtime links gate and measured Jev attempts under one run without network calls',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'jev-mcp-link-'));let runtime;let commands=0;
  try{
    const client={listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async request=>({model:'jev-mock',usage:{input_tokens:10,output_tokens:1,cost:null},answers:{action:{type:'choice',choice:'inspect',probabilities:Object.fromEntries(Object.keys(request.questions.action.criteria).map(id=>[id,id==='inspect'?1:0]))}}})};
    runtime=await createBenchmarkRuntime({...identifiers,mode:'jev',container:'mock-container',max_decisions:null,trace_path:join(directory,'decisions.jsonl')},{inspect:async()=>{},client,execute:async()=>{commands++;return{exit_code:0};}});
    await runtime.dispatch(call(1,'act',action()));
    const events=readFileSync(join(directory,'decisions.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(events.every(event=>event.run_id==='run-1'&&event.attempt_id==='attempt-1'&&event.group_id==='pair-1'));
    const inference=events.filter(event=>event.event.startsWith('inference_'));
    assert.deepEqual(inference.map(event=>event.decision_id),[1,1]);assert.deepEqual(inference.map(event=>event.request_id),['jev-1','jev-1']);
    assert.equal(commands,1);
  }finally{runtime?.close();rmSync(directory,{recursive:true,force:true});}
});

test('MCP journal failure uses independent state evidence without executing or replaying',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'jev-mcp-journal-fail-'));let runtime;let commands=0;
  try{
    runtime=await createBenchmarkRuntime({...identifiers,mode:'baseline',container:'mock-container',max_decisions:null,trace_path:join(directory,'decisions.jsonl')},{inspect:async()=>{},execute:async()=>{commands++;return{exit_code:0};}});
    runtime.close(); // Inject an unavailable primary journal descriptor.
    const result=await runtime.dispatch(call(1,'act',{...action(),selected_id:'inspect'}));
    assert.equal(result.result.isError,true);
    const state=JSON.parse(readFileSync(join(directory,'gate-state.json'),'utf8'));
    assert.equal(state.state,'stopped');assert.equal(state.stop_code,'RECORD_FAILED');assert.equal(state.journal_healthy,false);
    assert.equal(state.run_id,'run-1');assert.equal(state.last_decision_id,1);assert.equal(commands,0);
    assert.equal(readFileSync(join(directory,'gate-state.json'),'utf8').includes('ls src'),false);
  }finally{runtime?.close();rmSync(directory,{recursive:true,force:true});}
});

test('MCP requires a supplied null or valid finite limit before sandbox inspection',async()=>{
  let inspected=0;
  for(const max_decisions of [undefined,Infinity,0,'unlimited'])await assert.rejects(createBenchmarkRuntime({mode:'baseline',max_decisions,trace_path:'/unused/decisions.jsonl'},{inspect:async()=>{inspected++;}}));
  assert.equal(inspected,0);
});

test('MCP transport stop is independently visible and old journal prevents restart',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'jev-mcp-stop-'));let runtime;
  try{
    const config={...identifiers,mode:'baseline',container:'mock-container',max_decisions:null,trace_path:join(directory,'decisions.jsonl')};
    runtime=await createBenchmarkRuntime(config,{inspect:async()=>{},execute:async()=>({exit_code:0})});
    await runtime.transportFailure();
    const state=JSON.parse(readFileSync(join(directory,'gate-state.json'),'utf8'));
    assert.equal(state.state,'stopped');assert.equal(state.stop_code,'MCP_TRANSPORT_FAILED');assert.equal(state.outcome_uncertain,true);
    await assert.rejects(createBenchmarkRuntime(config,{inspect:async()=>{}}));
  }finally{runtime?.close();rmSync(directory,{recursive:true,force:true});}
});

test('checkpoint runtime routes before single-command execution with persisted state and no per-command model calls',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'jev-checkpoint-runtime-'));let runtime,calls=0;
  try{
    const client={listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async request=>{calls++;const kind=Object.keys(request.questions)[0];const choice=kind==='route'?'build':'finish';return {model:'jev-mock',usage:{input_tokens:10,output_tokens:1,cost:null},answers:{[kind]:{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(request.questions[kind].criteria).map(id=>[id,id===choice?1:0]))}}};}};
    runtime=await createBenchmarkRuntime({...identifiers,mode:'jev',workflow:'checkpoint-v1',trustedBrief:'Build the requested artifact.',container:'mock-container',max_decisions:null,trace_path:join(directory,'decisions.jsonl')},{inspect:async()=>{},client,execute:async()=>({exit_code:0,stdout:'observed',stderr:''})});
    const listed=await runtime.dispatch({jsonrpc:'2.0',id:0,method:'tools/list'});
    assert.deepEqual(listed.result.tools.map(t=>t.name),['route','act','finish','status']);
    const rejected=await runtime.dispatch(call(1,'act',{role_id:'build',command:'echo before'}));assert.equal(rejected.result.isError,true);assert.equal(calls,0);
    const route=await runtime.dispatch(call(2,'route',{purpose:'Choose scope',state:'Ready',candidates:[{id:'build',description:'Construct and verify the artifact.'},{id:'inspect',description:'Inspect prerequisites only.'}]}));assert.notEqual(route.result.isError,true);
    const acted=await runtime.dispatch(call(3,'act',{role_id:'build',command:'echo observed'}));assert.notEqual(acted.result.isError,true);assert.equal(calls,1);
    const finish=await runtime.dispatch(call(4,'finish',{purpose:'Complete goal',state:'action-1 records the observed outcome.'}));assert.notEqual(finish.result.isError,true);assert.equal(calls,2);
    const state=JSON.parse(readFileSync(join(directory,'gate-state.json'),'utf8'));assert.equal(state.state,'completed');assert.equal(state.completion_claimed,true);
  }finally{runtime?.close();rmSync(directory,{recursive:true,force:true});}
});
