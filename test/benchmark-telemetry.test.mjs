import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasuredDecider, createGateStateWriter, validateIdentifiers} from '../src/benchmark/telemetry.mjs';
import {createDecisionGate} from '../src/benchmark/decision-gate.mjs';
import {mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeArguments} from '../src/benchmark/launch.mjs';

const request=()=>({model:'jev-latest',state:'Choose the valid implementation.',questions:{next:{type:'choice',instructions:'Choose an action.',criteria:{build:'Implement the specification',stop:'Stop'}}}});
const response=()=>({model:'jev-1.13',usage:{input_tokens:20,output_tokens:3,cost:null},billing:{creditsCharged:'1.25'}});
test('telemetry excludes lookup and validation from inference; assigns distinct IDs',async()=>{
  const events=[];let gets=0,posts=0;
  const run=createMeasuredDecider({client:{listModels:async()=>{gets++;return {models:[{name:'jev-latest'}]};},decide:async()=>{posts++;return response();}},record:async e=>events.push(e)});
  await assert.rejects(run({}));assert.equal(events.length,0);
  await run(request());await run(request());
  assert.equal(gets,1);assert.equal(posts,2);
  assert.deepEqual(events.filter(e=>e.event==='inference_started').map(e=>e.request_id),['jev-1','jev-2']);
  assert.equal(events.filter(e=>e.event==='inference_finished').length,2);
});
test('model lookup failure cannot create a phantom POST count',async()=>{
  const events=[];let posts=0;
  const run=createMeasuredDecider({client:{listModels:async()=>{throw new Error('lookup failed');},decide:async()=>{posts++;}},record:async e=>events.push(e)});
  await assert.rejects(run(request()));assert.equal(posts,0);
  assert.deepEqual(events.map(event=>event.event),['model_lookup_started','model_lookup_failed']);
  assert.equal(events[1].code,'MODEL_LOOKUP_FAILED');
  assert.equal(events.some(event=>event.event==='inference_started'),false);
});

test('monetary budget denial happens before POST and never increments transmission count', async()=>{
  const events=[];let posts=0;
  const budget={reserve:()=>{throw Object.assign(new Error('BUDGET_EXHAUSTED'),{code:'BUDGET_EXHAUSTED'});},snapshot:()=>({})};
  const run=createMeasuredDecider({budget,client:{listModels:async()=>({models:[{name:'jev-latest'}]}),listCredits:async()=>({}),decide:async()=>{posts++;return response();}},record:async e=>events.push(e)});
  await assert.rejects(run(request()),{code:'BUDGET_EXHAUSTED',outcomeUncertain:false});
  assert.equal(posts,0);assert.equal(events.some(e=>e.event==='inference_started'),false);
  assert.equal(events.at(-1).event,'budget_blocked');
});

test('budget reserves before network; a lost response never releases the reservation or replays', async()=>{
  const order=[];let settlements=0;
  const budget={reserve:()=>{order.push('reserved');return 'reservation';},settle:()=>{settlements++;},snapshot:()=>({reserved_input_tokens:65536})};
  const run=createMeasuredDecider({budget,client:{listModels:async()=>({models:[{name:'jev-latest'}]}),listCredits:async()=>({}),decide:async()=>{order.push('posted');throw Object.assign(new Error('TRANSPORT_ERROR'),{code:'TRANSPORT_ERROR',outcomeUncertain:true});}},record:async e=>order.push(e.event)});
  await assert.rejects(run(request()),{code:'TRANSPORT_ERROR'});await assert.rejects(run(request()),{code:'DECIDER_STOPPED'});
  assert.equal(settlements,0);assert.ok(order.indexOf('reserved')<order.indexOf('posted'));assert.equal(order.filter(x=>x==='posted').length,1);
});
test('durable start failure blocks dispatch',async()=>{
  let posts=0;
  const run=createMeasuredDecider({client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>{posts++;}},record:async e=>{if(e.event==='inference_started')throw new Error('disk full');}});
  await assert.rejects(run(request()));assert.equal(posts,0);
});
test('uncertain error records one attempt with fixed code, no diagnostic secret',async()=>{
  const events=[];let posts=0;
  const run=createMeasuredDecider({client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>{posts++;throw Object.assign(new Error('DO_NOT_EXPOSE'),{code:'TRANSPORT_ERROR',outcomeUncertain:true});}},record:async e=>events.push(e)});
  await assert.rejects(run(request()));assert.equal(posts,1);
  assert.equal(events.at(-1).status,'uncertain');assert.equal(events.at(-1).code,'TRANSPORT_ERROR');
  assert.equal(JSON.stringify(events).includes('DO_NOT_EXPOSE'),false);
});
test('stdout chunks preserve split UTF-8 bytes in the live journal',async()=>{
  const chunks=[];
  const script="const b=Buffer.from('한글');process.stdout.write(b.subarray(0,2));setTimeout(()=>process.stdout.write(b.subarray(2)),25)";
  const result=await processResult(process.execPath,['-e',script],{onStdout:b=>chunks.push(b)});
  assert.equal(result.exit_code,0);assert.equal(Buffer.concat(chunks).toString('utf8'),'한글');assert.equal(result.stdout,'한글');
});
test('failed live journal write stops the process and preserves uncertainty',async()=>{
  const result=await processResult(process.execPath,['-e',"console.log('first');setInterval(()=>console.log('more'),100)"],{killProcessTree:true,onStdout:()=>{throw new Error('disk full');}});
  assert.equal(result.interrupted,'OUTPUT_WRITE_FAILED');assert.equal(result.outcome_uncertain,true);
});
test('Claude launch requests streaming records for measurable usage',()=>{
  const args=claudeArguments({auth:'cli',model:'claude-opus-5-5',effort:'medium',claude_max_budget_usd:1},'/tmp/mcp.json');
  assert.equal(args[args.indexOf('--output-format')+1],'stream-json');assert.ok(args.includes('--verbose'));
});

const ids=()=>({run_id:'run-123',attempt_id:'attempt-1',group_id:'group-1',agent_role:'implementation'});
test('inference and lookup records link safe run IDs and the gate decision ID',async()=>{
  const events=[];
  const run=createMeasuredDecider({identifiers:ids(),client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>response()},record:async event=>events.push(event)});
  await run(request(),{...ids(),decision_id:7});
  for(const event of events){assert.equal(event.run_id,'run-123');assert.equal(event.attempt_id,'attempt-1');assert.equal(event.group_id,'group-1');assert.equal(event.decision_id,7);}
  const attempts=events.filter(event=>event.event.startsWith('inference_'));
  assert.deepEqual(attempts.map(event=>event.request_id),['jev-1','jev-1']);
  await assert.rejects(run(request(),{...ids(),run_id:'different-run',decision_id:8}),{code:'INVALID_CONTEXT'});
  assert.equal(events.length,4);
});

test('uncertain telemetry failure cannot be retried and thrown diagnostics are sanitized',async()=>{
  const events=[];let posts=0;
  const run=createMeasuredDecider({client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>{posts++;throw new Error('secret-in-provider-error');}},record:async event=>events.push(event)});
  await assert.rejects(run(request()),error=>error.code==='DECISION_FAILED'&&!error.stack.includes('secret-in-provider-error'));
  await assert.rejects(run(request()),{code:'DECIDER_STOPPED'});
  assert.equal(posts,1);assert.equal(events.at(-1).status,'uncertain');
});

test('failed final telemetry write does not permit another paid attempt',async()=>{
  let posts=0;
  const run=createMeasuredDecider({client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>{posts++;return response();}},record:async event=>{if(event.event==='inference_finished')throw new Error('disk');}});
  await assert.rejects(run(request()),{code:'RECORD_FAILED'});
  await assert.rejects(run(request()),{code:'DECIDER_STOPPED'});
  assert.equal(posts,1);
});

test('telemetry journal failure reaches independent gate-state as RECORD_FAILED before dispatch',async()=>{
  const states=[];const events=[];let posts=0;
  const record=async event=>{if(event.event==='inference_started')throw new Error('SECRET_WRITER_FAILURE');events.push(event);};
  const decide=createMeasuredDecider({record,identifiers:ids(),client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>{posts++;return response();}}});
  const gate=createDecisionGate({mode:'jev',maxDecisions:null,identifiers:ids(),record,recordState:async state=>states.push(state),decide,execute:async()=>({exit_code:0})});
  await assert.rejects(gate.act({purpose:'Choose the next action.',state:'Ready.',candidates:[{id:'a',description:'Inspect source.',command:'ls'},{id:'b',description:'Run tests.',command:'npm test'}]}),{code:'RECORD_FAILED'});
  assert.equal(posts,0);assert.equal(states.at(-1).stop_code,'RECORD_FAILED');assert.equal(states.at(-1).journal_healthy,false);
  assert.equal(states.at(-1).last_decision_id,1);assert.equal(JSON.stringify(states).includes('SECRET_WRITER_FAILURE'),false);
  assert.equal(events.some(event=>event.event==='stopped'),false);
});

test('identifiers accept legacy absence but reject partial/unsafe linkage',()=>{
  assert.deepEqual(validateIdentifiers(),{});assert.deepEqual(validateIdentifiers(ids()),ids());
  for(const value of [null,{run_id:'only-one'},{...ids(),run_id:'../private'},{...ids(),agent_role:'invented'},{...ids(),authorization:'do-not-log'}])assert.throws(()=>validateIdentifiers(value));
});

test('independent gate state is atomic, private, exclusive and strips raw data',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'jev-gate-state-'));
  try{
    const path=join(directory,'gate-state.json');
    const writer=createGateStateWriter(path,{now:()=> '2026-10-09T10:00:00Z'});
    const gate=createDecisionGate({mode:'baseline',maxDecisions:null,identifiers:ids(),record:async()=>{},execute:async()=>({exit_code:0})});
    await writer({...gate.status(),raw_input:'SECRET_STATE_INPUT',command:'SECRET_COMMAND'});
    const first=JSON.parse(readFileSync(path,'utf8'));
    assert.equal(first.run_id,'run-123');assert.equal(first.max_decisions,null);assert.equal(first.schema_version,'jev-benchmark-gate-state/v1');
    assert.equal(first.recorded_at,'2026-10-09T10:00:00.000Z');assert.equal(first.raw_input,undefined);assert.equal(first.command,undefined);
    assert.equal(statSync(path).mode&0o777,0o600);
    await writer({...gate.status(),state:'stopped',stop_code:'RECORD_FAILED',last_code:'RECORD_FAILED',last_event:'stopped',journal_healthy:false,recovery_allowed:false,outcome_uncertain:true});
    assert.equal(JSON.parse(readFileSync(path,'utf8')).stop_code,'RECORD_FAILED');
    assert.deepEqual(readdirSync(directory),['gate-state.json']);
    const previous=readFileSync(path,'utf8');
    await assert.rejects(createGateStateWriter(path)(gate.status()),{code:'STATE_RECORD_FAILED'});
    assert.equal(readFileSync(path,'utf8'),previous);
    await assert.rejects(writer({...gate.status(),stop_code:'SECRET_EXCEPTION_TEXT'}),{code:'STATE_RECORD_FAILED'});
    assert.equal(readFileSync(path,'utf8'),previous);
  }finally{rmSync(directory,{recursive:true,force:true});}
});

test('independent state writer rejects a pre-existing output without overwriting it',async()=>{
  const directory=mkdtempSync(join(tmpdir(),'jev-gate-existing-'));
  try{
    const path=join(directory,'gate-state.json');writeFileSync(path,'preserve-existing');
    const gate=createDecisionGate({mode:'baseline',maxDecisions:1,record:async()=>{},execute:async()=>({exit_code:0})});
    await assert.rejects(createGateStateWriter(path)(gate.status()),{code:'STATE_RECORD_FAILED'});
    assert.equal(readFileSync(path,'utf8'),'preserve-existing');assert.deepEqual(readdirSync(directory),['gate-state.json']);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
