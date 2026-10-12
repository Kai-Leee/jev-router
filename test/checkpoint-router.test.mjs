import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckpointRouter} from '../src/orchestration/checkpoint-router.mjs';
import {splitCheckpointAdapter as adapter} from '../src/orchestration/split-checkpoint.mjs';
const response=(p=.8,e='sufficient')=>({model:'jev-1.13.0',answers:{beneficial:{type:'noul',noul:p},evidence:{type:'choice',choice:e}},usage:{input_tokens:10,output_tokens:1}});
const event=(changes={})=>({id:'event-1',decisionId:1,executionKey:'exec-1',scope:'trial-1',evidenceRevision:'rev-1',type:'plan_ready',brief:[{text:'Build a small library and checks'}],plan:{tasks:[{id:'a',description:'library',paths:['a.py'],dependsOn:[]},{id:'b',description:'checks',paths:['b.py'],dependsOn:['a']}],integrationInstructions:'Import a from b'},workerModel:'claude-opus-5-5',workerEffort:'medium',maxConcurrency:2,threshold:.65,modelIdentity:'jev-1.13.0',...changes});
function setup(options={}){
 const log=[],calls=[],actions=[];
 const handlers=Object.fromEntries(['execute_single','execute_split','collect_evidence'].map(action=>[action,async()=>{actions.push(action);return {generated:true,graded:false};}]));
 const router=createCheckpointRouter({adapter,decide:async request=>{calls.push(request);return response();},record:async row=>log.push(row),readCurrent:async e=>e,handlers,...options});
 return {router,log,calls,actions};
}
test('auto calls injected Jev and directly dispatches one selected handler',async()=>{
 const s=setup(),r=await s.router.run(event());assert.equal(s.calls.length,1);assert.deepEqual(s.actions,['execute_split']);assert.equal(r.authority,'jev');assert.equal(r.decision_used,true);assert.equal(r.quality_verified,false);assert.equal(r.cost_usd,null);assert.equal(r.status,'dispatched');
 assert.deepEqual(s.log.map(x=>x.event),['checkpoint_started','checkpoint_decision_requested','checkpoint_dispatch_ready','checkpoint_finished']);
});
test('single validated task bypasses Jev, force_jev bypasses rule',async()=>{
 const e=event();e.plan.tasks=e.plan.tasks.slice(0,1);
 const s=setup();assert.equal((await s.router.run(e)).authority,'script');assert.equal(s.calls.length,0);
 const r=await s.router.run({...e,id:'event-2',executionKey:'exec-2'},{mode:'force_jev'});assert.equal(r.authority,'jev');assert.equal(s.calls.length,1);
});
test('exact decision reuse is distinct from duplicate execution suppression',async()=>{
 const s=setup();const [a,b]=await Promise.all([s.router.run(event()),s.router.run(event({id:'duplicate'}))]);
 assert.equal(b.duplicate_execution,true);assert.equal(a.event_id,'event-1');assert.equal(s.calls.length,1);assert.equal(s.actions.length,1);
 const r=await s.router.run(event({id:'event-2',executionKey:'exec-2'}));assert.equal(r.authority,'cache');assert.equal(r.decision_id,1);assert.equal(r.jev_attempts,0);assert.equal(r.usage,null);assert.equal(s.actions.length,2);
});
test('changed state, threshold, model or scope cannot reuse a decision',async()=>{
 const s=setup();await s.router.run(event());
 for(const [i,changes] of [{evidenceRevision:'rev-2'},{threshold:.9},{modelIdentity:'jev-1.14.0'},{scope:'trial-2'},{brief:[{text:'Different goal'}]}].entries())await s.router.run(event({id:`e-${i}`,executionKey:`x-${i}`,...changes}));
 assert.equal(s.calls.length,6);
 await assert.rejects(s.router.run(event({threshold:.9})),/EXECUTION_KEY_CONFLICT/);
});
test('latest unresolved model does not enable cross-event cache reuse',async()=>{
 const s=setup();await s.router.run(event({modelIdentity:null}));await s.router.run(event({modelIdentity:null,id:'e2',executionKey:'x2'}));assert.equal(s.calls.length,2);
});
test('force_jev bypasses cache but not duplicate execution lock',async()=>{
 const s=setup();await s.router.run(event());const e=event({id:'e2',executionKey:'x2'});await s.router.run(e,{mode:'force_jev'});await s.router.run(e,{mode:'force_jev'});assert.equal(s.calls.length,2);assert.equal(s.actions.length,2);
});
test('stale evidence after response blocks dispatch and cache write',async()=>{
 let revision='rev-1';const s=setup({decide:async()=>{revision='rev-2';return response();},readCurrent:async e=>({...e,evidenceRevision:revision})});
 const r=await s.router.run(event());assert.equal(r.status,'stopped');assert.equal(r.error_code,'STALE_CHECKPOINT');assert.equal(s.actions.length,0);
});
test('malformed answers and unavailable handlers stop without execution',async()=>{
 for(const opts of [{decide:async()=>response(4)},{handlers:{}}]){const s=setup(opts),r=await s.router.run(event());assert.equal(r.status,'stopped');assert.equal(r.decision_used,false);assert.equal(s.actions.length,0);}
});
test('uncertain provider and handler failures never auto retry same execution',async()=>{
 for(const stage of ['provider','handler']){
  let n=0;const s=setup(stage==='provider'?{decide:async()=>{n++;throw Error('NETWORK_UNKNOWN');}}:{handlers:{execute_split:async()=>{n++;throw Error('BROKEN_HANDLER');}}});
  const r=await s.router.run(event());await s.router.run(event());assert.equal(n,1);assert.ok(r.timing_ms[stage==='provider'?'decision':'handler']>0);assert.equal(r.retry,false);assert.equal(r.status,stage==='provider'?'stopped':'execution_uncertain');
 }
});
test('insufficient evidence dispatches collection, never claims completion',async()=>{
 const s=setup({decide:async()=>response(.9,'insufficient')}),r=await s.router.run(event());assert.deepEqual(s.actions,['collect_evidence']);assert.deepEqual(r.selection.modes,[]);assert.equal(r.quality_verified,false);
});
test('capacity fails closed; finished execution guards are not evicted',async()=>{
 const s=setup({maxEntries:1});await s.router.run(event());await assert.rejects(s.router.run(event({id:'e2',executionKey:'x2'})),/CAPACITY/);assert.equal(s.actions.length,1);
});
test('input mutation during await cannot alter prepared dispatch',async()=>{
 const e=event();const s=setup();const p=s.router.run(e);e.plan.tasks[0].description='mutated';await p;assert.equal(s.calls[0].state.plan.tasks[0].description,'library');
});
test('nested checkpoint rejects instead of deadlocking serialized coordinator',async()=>{
 let router;router=createCheckpointRouter({adapter,decide:async()=>response(),readCurrent:async e=>e,record:async()=>{},handlers:{execute_split:async()=>router.run(event({executionKey:'nested'}))}});
 const r=await router.run(event());assert.equal(r.error_code,'REENTRANT_CHECKPOINT_NOT_ALLOWED');assert.equal(r.status,'execution_uncertain');
});
test('single-task force response cannot dispatch a nonexistent split',async()=>{
 const e=event();e.plan.tasks=e.plan.tasks.slice(0,1);const s=setup();const r=await s.router.run(e,{mode:'force_jev'});assert.equal(r.handler,'execute_single');
});
test('auto single-task checkpoint reaches actual file-arm writer with fake provider',async()=>{
 const {mkdtempSync,rmSync,readFileSync}=await import('node:fs');const {join}=await import('node:path');const {tmpdir}=await import('node:os');const {runFileArm}=await import('../src/orchestration/live-file-workers.mjs');
 const dir=mkdtempSync(join(tmpdir(),'d036-test-'));const e=event();e.plan.tasks=e.plan.tasks.slice(0,1);let calls=0;
 try{
  const s=setup({handlers:{execute_single:async()=>runFileArm({plan:e.plan,brief:e.brief,mode:'single',outputDir:join(dir,'candidate'),inputMode:'projected',allowSingleTask:true,call:async request=>{calls++;return {response:{files:request.task.paths.map(path=>({path,content:'value = 1\n'})),artifacts:request.task.paths,observed_checks:[],blockers:[],uncertainty:['unexecuted'],summary:'fixture'}};}})}});
  const r=await s.router.run(e);assert.equal(r.authority,'script');assert.equal(r.outcome.status,'completed');assert.equal(calls,1);assert.equal(s.calls.length,0);assert.equal(readFileSync(join(dir,'candidate/a.py'),'utf8'),'value = 1\n');
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('oversized payload and invalid plans reject before decider invocation',async()=>{
 const s=setup();await assert.rejects(s.router.run(event({brief:[{text:'x'.repeat(256001)}]})),/REQUEST_TOO_LARGE/);
 const e=event();e.plan.tasks[0].dependsOn=['b'];await assert.rejects(s.router.run(e),/CYCLIC_PLAN/);assert.equal(s.calls.length,0);
});
test('recording failure before dispatch prevents execution; final failure remains locked',async()=>{
 let failAt='checkpoint_dispatch_ready';const s=setup({record:async r=>{if(r.event===failAt)throw Error('RECORD_FAILED');}});
 const r=await s.router.run(event());assert.equal(r.status,'stopped');assert.equal(s.actions.length,0);
 failAt='checkpoint_finished';const e=event({id:'e2',executionKey:'x2'});await assert.rejects(s.router.run(e),/RECORD_FAILED/);await assert.rejects(s.router.run(e),/RECORD_FAILED/);assert.equal(s.actions.length,1);
});
