import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {parseCodexTrace,codexArguments,runCodexAttempt} from '../src/benchmark/codex-provider.mjs';
import {decisionSchema,validDecision,compareDecisionRuns} from '../src/benchmark/codex-decision-benchmark.mjs';
const event=usage=>JSON.stringify({type:'turn.completed',usage});
const trace=event({input_tokens:100,cached_input_tokens:60,output_tokens:12,reasoning_output_tokens:4});
function setup(t){const dir=mkdtempSync(join(tmpdir(),'pointsman-codex-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const cwd=join(dir,'public');mkdirSync(cwd);return {dir,cwd,out:join(dir,'attempt'),prompt:'Choose from public criteria only',
 model:'configured-model',effort:'high',role:'decision',schema:{type:'object'},spend:true,validateAnswer:x=>x.answer==='a'};}
function mock({text=trace,answer={answer:'a'},exit_code=0,outcome_uncertain=false}={}) {return async(_cmd,args,options)=>{
 options.onStdout(Buffer.from(text+'\n'));writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify(answer));
 return {stdout:text,exit_code,outcome_uncertain};};}
test('cache and reasoning are not added twice; absent/invalid usage remains unknown',()=>{
 const p=parseCodexTrace(trace);assert.deepEqual(p.usage,{input_tokens:100,cached_input_tokens:60,output_tokens:12,uncached_input_tokens:40,total_tokens:112,reasoning_output_tokens:4});
 assert.equal(parseCodexTrace('{}').usage,null);assert.equal(parseCodexTrace(event({input_tokens:2,cached_input_tokens:3,output_tokens:1})).usage,null);
 assert.throws(()=>parseCodexTrace('{bad'),/CODEX_STREAM_INVALID/);
});
test('diagnostic items are not tools; multiple completed turns accumulate exactly once',()=>{
 const p=parseCodexTrace(JSON.stringify({type:'item.completed',item:{type:'error',message:'diagnostic'}})+'\n'+trace+'\n'+trace);
 assert.deepEqual(p.tools_used,[]);assert.equal(p.usage.total_tokens,224);
 assert.equal(parseCodexTrace(trace+'\n'+JSON.stringify({type:'turn.failed'})).usage_complete,false);
});
test('exact CLI profile and sandbox are explicit; no approval bypass or arbitrary flags',()=>{
 const args=codexArguments({cwd:'/public',schemaPath:'/schema',answerPath:'/answer',model:'gpt-test',effort:'high',role:'decision'});
 assert.ok(args.includes('read-only'));assert.ok(args.includes('model_reasoning_effort="high"'));assert.equal(args.at(-1),'-');
 assert.ok(!args.some(s=>s.includes('dangerously')));assert.throws(()=>codexArguments({model:'--evil',effort:'high',role:'decision'}));
});
test('success records provider codex, unknown identity/cost, and refuses overwriting a previous attempt',async t=>{
 const f=setup(t),a=await runCodexAttempt({...f,run:mock()});assert.equal(a.receipt.provider,'codex');
 assert.equal(a.receipt.model_identity_verified,null);assert.equal(a.receipt.actual_billed_usd,null);
 const old=readFileSync(join(f.out,'receipt.json'));await assert.rejects(runCodexAttempt({...f,run:mock()}));assert.deepEqual(readFileSync(join(f.out,'receipt.json')),old);
});
test('preflight rejection stops before launching a model; missing spend creates no attempt',async t=>{
 const f=setup(t);let calls=0;await assert.rejects(runCodexAttempt({...f,spend:false,run:async()=>calls++}),/EXPLICIT_SPEND_REQUIRED/);
 assert.equal(existsSync(f.out),false);
 await assert.rejects(runCodexAttempt({...f,beforeDispatch:()=>{throw Object.assign(new Error('blocked'),{code:'GATE_BLOCKED'});},run:async()=>calls++}));
 assert.equal(calls,0);assert.equal(JSON.parse(readFileSync(join(f.out,'receipt.json'))).process_submitted,false);
});
test('bad answer, tool use, explicit model mismatch and uncertainty never return accepted output',async t=>{
 for(const [name,options] of [ ['answer',{answer:{answer:'bad'}}],['tool',{text:trace+'\n'+JSON.stringify({type:'item.completed',item:{type:'command_execution'}})}],
 ['identity',{text:JSON.stringify({type:'session',model:'wrong'})+'\n'+trace}],['interrupted',{outcome_uncertain:true}] ]){
  const f=setup(t);await assert.rejects(runCodexAttempt({...f,run:mock(options)}),undefined,name);
  assert.notEqual(JSON.parse(readFileSync(join(f.out,'receipt.json'))).status,'completed');
 }
});
test('process-start failure is known failed with no model submission',async t=>{
 const f=setup(t);await assert.rejects(runCodexAttempt({...f,run:async()=>{throw Object.assign(new Error(),{code:'CODEX_PROCESS_START_FAILED'});}}));
 const r=JSON.parse(readFileSync(join(f.out,'receipt.json')));assert.equal(r.status,'failed');assert.equal(r.process_submitted,false);assert.equal(r.usage,null);
});
test('schema and answer validation bind exact question IDs and option membership',()=>{
 const request={questions:{q:{type:'choice',criteria:{a:'A',b:'B'}}}};assert.deepEqual(decisionSchema(request).properties.answers.required,['q']);
 assert.equal(validDecision(request,{answers:{q:{type:'choice',choice:'a'}}}),true);
 assert.equal(validDecision(request,{answers:{q:{type:'choice',choice:'else'}}}),false);
 assert.equal(validDecision(request,{answers:{q:{type:'choice',choice:'a'},extra:{}}}),false);
});
test('comparison refuses mismatched requests and calls agreement ungraded',t=>{
 const {dir}=setup(t),a=join(dir,'a'),b=join(dir,'b');mkdirSync(a);mkdirSync(b);
 const req={model:'jev-latest',state:'Public state',questions:{q:{type:'choice',instructions:'Choose one',criteria:{left:'Left',right:'Right'}}}};
 const requestHash=createHash('sha256').update(prepareDecision(req).serialized).digest('hex');
 const base={status:'completed',request_sha256:requestHash,registry_sha256:'same',stage:'split',wall_ms:10};
 for(const [d,provider,choice] of [[a,'codex','left'],[b,'jev','right']]){
  writeFileSync(join(d,'request.json'),JSON.stringify(req));
  writeFileSync(join(d,'result.json'),JSON.stringify({...base,provider}));writeFileSync(join(d,'answer.json'),JSON.stringify({answers:{q:{type:'choice',choice}}}));}
 const c=compareDecisionRuns(a,b);assert.equal(c.agreement_fraction,0);assert.equal(c.accuracy,null);assert.equal(c.product_success,null);
 writeFileSync(join(b,'result.json'),JSON.stringify({...base,provider:'jev',request_sha256:'different'}));assert.throws(()=>compareDecisionRuns(a,b),/PAIR_MISMATCH/);
});
