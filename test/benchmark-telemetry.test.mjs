import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeasuredDecider, createGateStateWriter, validateIdentifiers} from '../src/benchmark/telemetry.mjs';
import {createDecisionGate} from '../src/benchmark/decision-gate.mjs';
import {mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeArguments} from '../src/benchmark/launch.mjs';
import {createJevClient} from '../src/client.mjs';

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

for (const status of [429,504]) test(`HTTP ${status} preserves status and uncertainty without response secrets or retry`,async()=>{
  const events=[];let posts=0,settlements=0,reservations=0;
  const actual=createJevClient({apiKey:'TEST_KEY_DO_NOT_LOG',fetchImpl:async()=>{
    posts++;
    return new Response('RESPONSE_BODY_DO_NOT_LOG',{status,headers:{'x-jev-run-id':'provider-run-123','retry-after':'2','x-private':'HEADER_DO_NOT_LOG'}});
  }});
  const budget={reserve:()=>{reservations++;return 'reserved';},settle:()=>settlements++,snapshot:()=>({reserved_input_tokens:65536})};
  const run=createMeasuredDecider({budget,client:{...actual,listModels:async()=>({models:[{name:'jev-latest'}]}),listCredits:async()=>({})},record:async e=>events.push(e)});
  let caught;
  await assert.rejects(run(request()),error=>{caught=error;return error.code==='HTTP_ERROR'&&error.http_status===status&&error.status===status&&error.outcomeUncertain===(status>=500);});
  const event=events.at(-1);
  assert.equal(event.event,'inference_finished');assert.equal(event.http_status,status);
  assert.equal(event.status,status>=500?'uncertain':'failed');assert.equal(event.outcome_uncertain,status>=500);
  assert.equal(event.recovery_allowed,false);assert.equal(event.provider_run_id,'provider-run-123');assert.equal(event.retry_after_ms,2000);
  await assert.rejects(run(request()),{code:'DECIDER_STOPPED'});
  assert.equal(posts,1);assert.equal(reservations,1);assert.equal(settlements,0);
  const serialized=JSON.stringify({events,error:caught,message:caught.message,stack:caught.stack});
  for(const secret of ['TEST_KEY_DO_NOT_LOG','RESPONSE_BODY_DO_NOT_LOG','HEADER_DO_NOT_LOG'])assert.equal(serialized.includes(secret),false);
  assert.equal(Object.hasOwn(caught,'retryAfterMs'),false);
});

test('untrusted HTTP status values cannot become diagnostic payloads',async()=>{
  for(const status of ['SECRET_STATUS',429.5,600,null]){
    const events=[];
    const run=createMeasuredDecider({client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>{throw Object.assign(new Error('SECRET_ERROR'),{code:'HTTP_ERROR',status,outcomeUncertain:false});}},record:async e=>events.push(e)});
    await assert.rejects(run(request()),e=>e.http_status===null&&e.status===null&&!e.message.includes('SECRET'));
    assert.equal(events.at(-1).http_status,null);assert.equal(JSON.stringify(events).includes('SECRET'),false);
  }
});

test('local invalid request carries known-unsent outcome without inference or budget work',async()=>{
  const events=[];let network=0,reserved=0;
  const run=createMeasuredDecider({client:{listModels:async()=>network++,decide:async()=>network++},budget:{reserve:()=>reserved++},record:async e=>events.push(e)});
  await assert.rejects(run({}),{code:'INVALID_REQUEST',outcomeUncertain:false});
  assert.equal(network,0);assert.equal(reserved,0);assert.equal(events.length,0);
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

test('HTTP 429 preserves bounded provider reconciliation IDs and retry hints without retry',async()=>{
 const events=[];let posts=0;
 const run=createMeasuredDecider({client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>{posts++;throw Object.assign(Error('private body'),{code:'HTTP_ERROR',status:429,runId:'run_0123-abc.def',retryAfterMs:12000,outcomeUncertain:false,headers:{Authorization:'SECRET'},body:'SECRET'});}},record:async e=>events.push(e)});
 await assert.rejects(run(request()),e=>e.http_status===429&&e.provider_run_id==='run_0123-abc.def'&&e.retry_after_ms===12000&&!JSON.stringify(e).includes('SECRET'));
 assert.equal(events.at(-1).provider_run_id,'run_0123-abc.def');assert.equal(events.at(-1).retry_after_ms,12000);assert.equal(events.at(-1).recovery_allowed,false);assert.equal(JSON.stringify(events).includes('private body'),false);assert.equal(JSON.stringify(events).includes('SECRET'),false);
 await assert.rejects(run(request()),{code:'DECIDER_STOPPED'});assert.equal(posts,1);
});
test('unsafe provider IDs and invalid retry hints are dropped, never stringified',async()=>{
 const values=[['Bearer SECRET',-1],['run\n',Infinity],['x'.repeat(97),NaN],[{secret:'SECRET'},'1200'],['한글',null],['../secret',86400001],[42,{secret:'SECRET'}]];
 for(const [runId,retryAfterMs]of values){const events=[];const run=createMeasuredDecider({client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>{throw Object.assign(Error('SECRET'),{code:'HTTP_ERROR',status:429,runId,retryAfterMs});}},record:async e=>events.push(e)});
 await assert.rejects(run(request()),e=>e.provider_run_id===null&&e.retry_after_ms===null&&!JSON.stringify(e).includes('SECRET'));assert.equal(events.at(-1).provider_run_id,null);assert.equal(events.at(-1).retry_after_ms,null);assert.equal(JSON.stringify(events).includes('SECRET'),false);}
});

test('captured safe diagnostics survive the measured failure event and rethrow without settlement or retry',async()=>{
 const events=[];let posts=0,reservations=0,settlements=0;
 const actual=createJevClient({apiKey:'TEST_DIAGNOSTIC_KEY',fetchImpl:async()=>{
  posts++;return new Response(JSON.stringify({error:{code:'context_length_exceeded',message:'Authorization: Bearer TEST_DIAGNOSTIC_KEY PRIVATE_STATE',details:{state:'PRIVATE_STATE'}}}),{status:400});
 }});
 const budget={reserve:()=>{reservations++;return'reserved';},settle:()=>settlements++,snapshot:()=>({reserved_input_tokens:65536})};
 const run=createMeasuredDecider({budget,client:{...actual,listModels:async()=>({models:[{name:'jev-latest'}]}),listCredits:async()=>({})},record:async event=>events.push(event)});
 let caught;
 await assert.rejects(run(request()),error=>{caught=error;return error.code==='HTTP_ERROR'&&error.status===400;});
 const diagnostic=events.at(-1).error_diagnostics;
 assert.equal(diagnostic.schema_version,'jev-http-error-diagnostics/v3');assert.equal(diagnostic.category,'context_limit');assert.equal(diagnostic.classification_source,'provider_code');
 assert.equal(diagnostic.body_read_status,'complete');assert.equal(diagnostic.body_hash_scope,'complete');
 assert.deepEqual(caught.error_diagnostics,diagnostic);assert.equal(caught.outcomeUncertain,false);assert.equal(events.at(-1).recovery_allowed,false);
 const serialized=JSON.stringify({events,error:caught,message:caught.message,stack:caught.stack});
 for(const secret of ['TEST_DIAGNOSTIC_KEY','PRIVATE_STATE','Authorization','Bearer'])assert.equal(serialized.includes(secret),false);
 await assert.rejects(run(request()),{code:'DECIDER_STOPPED'});
 assert.equal(posts,1);assert.equal(reservations,1);assert.equal(settlements,0);
});

test('forged diagnostic fields on a custom exception are ignored, including plausible secret hashes',async()=>{
 const events=[];const secret='abcdef0123456789'.repeat(4);
 const run=createMeasuredDecider({client:{listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async()=>{
  throw Object.assign(Error('PRIVATE_ERROR'),{code:'HTTP_ERROR',status:400,outcomeUncertain:false,diagnostics:{
   schema_version:'jev-http-error-diagnostics/v3',category:'context_limit',classification_source:'provider_code',provider_code:'context_length_exceeded',
   body_read_status:'complete',body_format:'json',body_bytes:64,body_sha256:secret,body_hash_scope:'complete',raw:'PRIVATE_ERROR',
  }});
 }},record:async event=>events.push(event)});
 await assert.rejects(run(request()),error=>error.error_diagnostics===null&&error.status===400&&!JSON.stringify(error).includes(secret));
 assert.equal(events.at(-1).error_diagnostics,null);assert.equal(JSON.stringify(events).includes(secret),false);assert.equal(JSON.stringify(events).includes('PRIVATE_ERROR'),false);
});

test('lookup and balance failures preserve safe diagnostics without recording an inference attempt',async()=>{
 for(const phase of ['model_lookup','credits']){
  const events=[];let calls=0,reservations=0;
  const actual=createJevClient({apiKey:'PREFLIGHT_TEST_KEY',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({error:{code:429,message:'PREFLIGHT_TEST_KEY'}}),{status:429});}});
  const budget={reserve:()=>reservations++,snapshot:()=>({})};
  const client=phase==='model_lookup'?actual:{...actual,listModels:async()=>({models:[{name:'jev-latest'}]})};
  const run=createMeasuredDecider({client,budget,record:async event=>events.push(event)});
  await assert.rejects(run(request()),error=>error.code==='HTTP_ERROR'&&error.status===429&&error.outcomeUncertain===false&&error.error_diagnostics.category==='rate_or_capacity');
  assert.equal(events.at(-1).event,phase==='model_lookup'?'model_lookup_failed':'budget_blocked');
  assert.equal(events.at(-1).http_status,429);assert.equal(events.at(-1).error_diagnostics.provider_code,429);
  assert.equal(events.some(event=>event.event==='inference_started'),false);assert.equal(JSON.stringify(events).includes('PREFLIGHT_TEST_KEY'),false);
  await assert.rejects(run(request()),{code:'DECIDER_STOPPED'});assert.equal(calls,1);assert.equal(reservations,0);
 }
});

test('semantic signals and numeric limits survive telemetry while replacement messages are discarded',async()=>{
 const events=[];let calls=0;
 const actual=createJevClient({apiKey:'SEMANTIC_TEST_KEY',fetchImpl:async()=>{calls++;return new Response(JSON.stringify({
  error:'State plus longest question 38000 tokens exceeds the maximum 32768 tokens. Authorization: SEMANTIC_TEST_KEY PRIVATE_STATE',
 }),{status:400});}});
 const run=createMeasuredDecider({client:{...actual,listModels:async()=>({models:[{name:'jev-latest'}]}),decide:async input=>{
  try{return await actual.decide(input);}catch(error){error.diagnostics={...error.diagnostics,semantic_signals:['PRIVATE_STATE'],message:'SEMANTIC_TEST_KEY'};throw error;}
 }},record:async event=>events.push(event)});
 await assert.rejects(run(request()),error=>{
  assert.equal(error.error_diagnostics.schema_version,'jev-http-error-diagnostics/v3');
  assert.equal(error.error_diagnostics.classification_source,'message_pattern');
  assert.deepEqual(error.error_diagnostics.semantic_signals,['context_length_exceeded']);
  assert.deepEqual(error.error_diagnostics.reported_limits,[{kind:'state_question_tokens',actual:38000,limit:32768}]);
  assert.equal(JSON.stringify(error).includes('SEMANTIC_TEST_KEY'),false);return true;
 });
 assert.equal(events.at(-1).error_diagnostics.semantic_status,'recognized');
 assert.equal(JSON.stringify(events).includes('PRIVATE_STATE'),false);assert.equal(JSON.stringify(events).includes('SEMANTIC_TEST_KEY'),false);
 await assert.rejects(run(request()),{code:'DECIDER_STOPPED'});assert.equal(calls,1);
});
