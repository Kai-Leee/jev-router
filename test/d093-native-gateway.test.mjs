import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {writePrivateJson} from '../src/benchmark/runner.mjs';
import {runCodexAttempt} from '../src/benchmark/codex-provider.mjs';
import {createCodexE2EDecisions,summarizeCodexE2EUsage} from '../src/benchmark/codex-e2e-decisions.mjs';
import {loadCodexE2EInputs,planCodexE2E,compareCodexE2E,validateCodexE2EHost,D093_CODEX_MANIFEST as CODEX_E2E_MANIFEST} from '../src/benchmark/codex-e2e-runner.mjs';
import {buildUnitRelationRequests,loadLayeredContract,LAYERED_CONTRACTS} from '../src/orchestration/adaptive-layered-decomposition.mjs';
const rootDir=resolve(import.meta.dirname,'..');
const read=p=>JSON.parse(readFileSync(p));
test('Mac execution requires an explicit host exception and cannot label Linux as Mac',()=>{
 assert.equal(validateCodexE2EHost('mac','darwin').authorization,'explicit-user-mac-exception-20261014');
 assert.equal(validateCodexE2EHost('cloud','linux').requested,'cloud');
 for(const [host,platform,code] of [['cloud','darwin','POINTSMAN_CLOUD_RUN_REQUIRED'],['mac','linux','CODEX_E2E_MAC_HOST_REQUIRED'],['invalid','darwin','CODEX_E2E_HOST_INVALID']])
  assert.throws(()=>validateCodexE2EHost(host,platform),{code});
});
const request=()=>{const loaded=loadCodexE2EInputs({rootDir,manifestPath:CODEX_E2E_MANIFEST});return buildUnitRelationRequests({catalog:loaded.prepared.catalog,
 requirement_descriptions:loaded.input.requirement_descriptions,max_concurrency:2,limits:loaded.manifest.limits,contract:loadLayeredContract(LAYERED_CONTRACTS.v2)})[0].request;};
function setup(t){const directory=mkdtempSync(join(tmpdir(),'codex-e2e-test-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
  for(const name of ['calls','gateway'])mkdirSync(join(directory,name));const events=[];
  return {directory,run_id:'test-codex-e2e',remaining:()=>14000000,record:async e=>events.push(e),events,
    save:(p,v)=>writePrivateJson(join(directory,p),v)};}
test('baseline traverses mandatory gateway; no Jev reservations and receipt usage retained',async t=>{
 const context=setup(t),manifest=read(join(rootDir,CODEX_E2E_MANIFEST));let dispatch=0;
 const session=createCodexE2EDecisions({provider:'codex',rootDir,manifest,context,model:'configured-model',effort:'high',runCodex:o=>runCodexAttempt({...o,
   run:async(_cmd,args,opts)=>{dispatch++;assert.ok(!opts.cwd.startsWith(rootDir));
    const body=JSON.parse(opts.input.slice(opts.input.indexOf('\n\n')+2));
    writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify({answers:Object.fromEntries(Object.entries(body.questions).map(([k,q])=>[k,{type:'choice',choice:Object.keys(q.criteria)[0]}]))}));
    const stdout=JSON.stringify({type:'turn.completed',usage:{input_tokens:100,cached_input_tokens:50,output_tokens:10}})+'\n';opts.onStdout(stdout);return {stdout,exit_code:0,outcome_uncertain:false};}})});
 const answer=await session.decide(request(),{stage:'split'});assert.ok(answer.answers);assert.equal(dispatch,1);
 const receipt=session.receipts()[0];assert.equal(receipt.provider,'codex');assert.equal(receipt.jev_reservations,0);
 assert.equal(receipt.usage.total_tokens,110);assert.ok(context.events.some(e=>e.event==='pointsman_gateway_accepted'));
});
test('changed wording is rejected before dispatch and session remains stopped',async t=>{
 const context=setup(t),manifest=read(join(rootDir,CODEX_E2E_MANIFEST));let calls=0;
 const session=createCodexE2EDecisions({provider:'codex',rootDir,manifest,context,model:'configured-model',effort:'high',runCodex:async()=>calls++});
 const body=request();Object.values(body.questions)[0].instructions='changed';
 await assert.rejects(session.decide(body,{stage:'split'}),/POINTSMAN_FIXED_QUESTION_MISMATCH/);
 await assert.rejects(session.decide(request(),{stage:'split'}),/CODEX_E2E_DECISIONS_STOPPED/);assert.equal(calls,0);
});
test('historic real catalog creates fixed Codex scheduled plan without external service initialization',async()=>{
 const loaded=loadCodexE2EInputs({manifestPath:CODEX_E2E_MANIFEST});let actualCalls=0,committed;
 const planning=await planCodexE2E({loaded,profileId:'codex-fixed-high',record:async()=>{},save:(_,v)=>{committed=v;},decide:async body=>{
   actualCalls++;return {answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>[id,{type:'choice',choice:Object.hasOwn(q.criteria,'independent')?'independent':Object.keys(q.criteria)[0]}]))};}});
 assert.equal(planning.status,'planned');assert.equal(planning.dispatch_allowed,true);assert.equal(committed,planning);
 assert.ok(actualCalls>0);assert.ok(planning.plan.workers.every(w=>w.profile_id==='codex-fixed-high'));
 await assert.rejects(planCodexE2E({loaded,profileId:'codex-fixed-high',record:async()=>{},save:()=>{throw Error('durability failed');},decide:async body=>({answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>[id,{type:'choice',choice:Object.hasOwn(q.criteria,'independent')?'independent':Object.keys(q.criteria)[0]}]))})}),/durability failed/);
});
test('missing usage and prices stay unknown; cache never counted twice',()=>{
 const good={provider:'codex',purpose:'worker',status:'completed',process_submitted:true,usage:{input_tokens:100,cached_input_tokens:70,output_tokens:10},api_equivalent_usd:null};
 assert.equal(summarizeCodexE2EUsage([good]).total.total_tokens,110);
 const result=summarizeCodexE2EUsage([good,{provider:'codex',purpose:'decision',status:'uncertain',process_submitted:true,usage:null}]);
 assert.equal(result.total.total_tokens,null);assert.equal(result.total.known_total_tokens,110);assert.equal(result.total.api_equivalent_usd,null);
 assert.equal(result.total.started_calls,2);
});
test('failed arm cannot produce completed speedup; grade and worker mismatches rejected',t=>{
 const ctx=setup(t),a=join(ctx.directory,'a'),b=join(ctx.directory,'b');mkdirSync(a);mkdirSync(b);
 const source_pins=[{path:'test-fixture',sha256:'a'.repeat(64)}];
 const source_sha256=createHash('sha256').update(JSON.stringify(source_pins)).digest('hex');
 const base={source_sha256,catalog_sha256:'c',worker:{model:'fixed',effort:'high'},probability_policy:'choice_only',product_success:false,
  completion_wall_ms:null,usage:{total:{total_tokens:100,api_equivalent_usd:null}},grade:{grade_manifest_sha256:'g',image_lock_sha256:'i'}};
 writePrivateJson(join(a,'result.json'),{...base,provider:'codex'});writePrivateJson(join(b,'result.json'),{...base,provider:'jev'});
 for(const [dir,provider] of [[a,'codex'],[b,'jev']])writePrivateJson(join(dir,'protocol.json'),{...base,provider,source_pins});
 assert.equal(compareCodexE2E(a,b).completed_speed_ratio,null);
 writeFileSync(join(b,'result.json'),JSON.stringify({...base,provider:'jev',grade:{...base.grade,grade_manifest_sha256:'wrong'}}));
 assert.throws(()=>compareCodexE2E(a,b),/CODEX_E2E_PAIR_MISMATCH/);
});
