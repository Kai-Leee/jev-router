import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {loadCodexE2EInputs,CODEX_E2E_MANIFEST,CODEX_E2E_ADAPTIVE_MANIFEST,createCodexE2EWorkerExecutor} from '../src/benchmark/codex-e2e-runner.mjs';
import {createPointsmanGateway,validatePointsmanManifest,D091_REPAIR_EFFICIENCY} from '../src/orchestration/pointsman-gateway.mjs';
import {projectOwnerPayload} from '../src/orchestration/adaptive-owner-payload-projection.mjs';
import {buildCodexWorkerProfileRequest,eligibleCodexWorkerProfiles} from '../src/benchmark/codex-worker-profiles.mjs';
import {codexPricingContract} from '../src/benchmark/codex-pricing.mjs';
const root=resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(p));
const prior='/Users/lee/workspace/plugins/jev-router-codex-d090-20261016';
const base=`${prior}/benchmark-runs/d090-codex-20261016-01/pair/jev`;
const manifest=()=>read(`${root}/${CODEX_E2E_MANIFEST}`);
const response=body=>({model:'typesafe/jev-1.14-20261014',usage:{input_tokens:1,output_tokens:1},answers:Object.fromEntries(Object.entries(body.questions).map(([key,q])=>[key,{type:'choice',choice:Object.keys(q.criteria)[0]}]))});

test('D091 fixed controls preserve D090 scope and adaptive changes only registered worker routing',()=>{
 const a=loadCodexE2EInputs({rootDir:root}),b=loadCodexE2EInputs({rootDir:root,manifestPath:CODEX_E2E_ADAPTIVE_MANIFEST});
 assert.deepEqual(a.manifest.repair_efficiency,D091_REPAIR_EFFICIENCY);assert.equal(Object.keys(a.testRequirements).length,93);
 const normalize=x=>{x=structuredClone(x);for(const key of ['skill_gateway','session_semantics','repair_efficiency','codex_execution'])delete x[key];return x;};
 assert.deepEqual(normalize(a.manifest),normalize(read(`${prior}/benchmarks/e2e-swe/manifests/pointsman-codex-d090.json`)));
 assert.deepEqual(normalize(a.manifest),normalize(b.manifest));
 assert.equal(a.manifest.codex_execution.worker_routing,'fixed-profile-v1');assert.equal(b.manifest.codex_execution.worker_routing,'jev-model-size-v1');
 for(const mutate of [m=>m.repair_efficiency.worker_input_projection='off',m=>m.codex_execution.worker_routing='jev-model-size-v1',m=>m.max_repair_rounds=3]){const m=manifest();mutate(m);assert.throws(()=>validatePointsmanManifest(m,{rootDir:root}));}
});

test('real lossless owner wire crosses all required gateway phases and mutated encoding is blocked',async()=>{
 const body=read(`${base}/calls/jev-0005.request.json`),projected=projectOwnerPayload(body,{policy:'lossless-owner-v1'});
 assert.equal(projected.report.applied,true);const reports=[];
 const gateway=createPointsmanGateway({rootDir:root,binding:manifest().skill_gateway,save:(p,r)=>reports.push({p,r}),record:async()=>{}});
 const ticket=await gateway.begin(projected.request,{stage:'repair_owners',decisionId:'d091-owner'});
 ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');await ticket.accept(response(projected.request));
 assert.equal(reports.filter(x=>x.r.phase&&x.r.passed).length,3);
 const invalid=structuredClone(projected.request);invalid.state.owner_payload_encoding.instructions+='changed';
 await assert.rejects(gateway.begin(invalid,{stage:'repair_owners',decisionId:'d091-owner-invalid'}));
});

test('registered Codex model question crosses v8 gateway but not fixed v7 wording',async()=>{
 const planning=read(`${base}/planning.json`),environmentEvidence=read(`${base}/protocol.json`).cli_environment;
 const catalog=eligibleCodexWorkerProfiles({environmentEvidence,pricingContract:codexPricingContract({version:'v2'})});
 const task=planning.plan.tasks.find(t=>t.kind==='implementation');
 const {request}=buildCodexWorkerProfileRequest({planning,task,context:{operation:'implementation',round_index:0},catalog});
 const adaptive=read(`${root}/${CODEX_E2E_ADAPTIVE_MANIFEST}`);
 const gateway=createPointsmanGateway({rootDir:root,binding:adaptive.skill_gateway,save:()=>{},record:async()=>{}});
 const ticket=await gateway.begin(request,{stage:'profiles',decisionId:'d091-profile'});ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');await ticket.accept(response(request));
 const fixed=createPointsmanGateway({rootDir:root,binding:manifest().skill_gateway,save:()=>{},record:async()=>{}});
 await assert.rejects(fixed.begin(request,{stage:'profiles',decisionId:'d091-fixed-profile'}),{code:'POINTSMAN_FIXED_QUESTION_MISMATCH'});
});

test('selected model reaches worker factory and exact native receipt binding is persisted',async()=>{
 const stored=[],events=[],receipts=[],calls=[];
 const selection={id:'selection-1',sha256:'a'.repeat(64),audit_directory:'worker-model-routing/selection-1',profile_id:'gpt-6-luna-high',model:'gpt-6-luna',effort:'high'};
 const task={id:'task-1'},worker={operation:'implementation',round_index:0};
 const profileRouter={select:async(t,w)=>{assert.equal(t,task);assert.equal(w,worker);return selection;},assertExecution:(s,o)=>{assert.equal(s,selection);assert.equal(o.model,selection.model);assert.equal(o.effort,'high');return{verified:true,selection_id:s.id,selection_sha256:s.sha256,model:o.model,effort:o.effort};}};
 const execute=createCodexE2EWorkerExecutor({profileRouter,cliEnvironment:{verify:async o=>calls.push(o)},context:{directory:'/private/tmp/test',save:(p,r)=>stored.push({p,r}),record:async e=>events.push(e)},workerReceipts:receipts,
  model:'gpt-6.1-sol',effort:'high',workerFactory:options=>async()=>{assert.equal(options.model,'gpt-6-luna');assert.equal(options.effort,'high');await options.onReceipt({id:'worker-1',status:'completed',requested_model:options.model,requested_effort:options.effort,provider_receipt:'codex-workers/worker-1/provider/receipt.json',provider:{status:'completed'}});return{status:'completed'};}});
 assert.equal((await execute(task,worker)).status,'completed');assert.equal(calls.length,1);
 assert.equal(receipts[0].worker_profile_selection.id,selection.id);
 assert.equal(stored[0].p,selection.audit_directory+'/execution.json');assert.equal(stored[0].r.requested_model,'gpt-6-luna');assert.equal(stored[0].r.selection_sha256,selection.sha256);
 assert.ok(events.some(e=>e.event==='codex_worker_profile_execution_bound'));
});

test('rejected model binding never invokes a worker or fallback',async()=>{
 let called=false;
 const execute=createCodexE2EWorkerExecutor({profileRouter:{select:async()=>({model:'gpt-6-luna',effort:'high'}),assertExecution:()=>{throw Object.assign(Error('changed'),{code:'MODEL_BINDING_CHANGED'});}},workerFactory:()=>{called=true;},model:'gpt-6.1-sol',effort:'high'});
 await assert.rejects(execute({id:'task'},{}),{code:'MODEL_BINDING_CHANGED'});assert.equal(called,false);
});

test('fixed executor makes no model-routing question and keeps the common profile',async()=>{
 let profile;
 const execute=createCodexE2EWorkerExecutor({context:{directory:'/private/tmp/test',record:async()=>{}},workerReceipts:[],model:'gpt-6.1-sol',effort:'high',workerFactory:o=>async()=>{profile={model:o.model,effort:o.effort};return{status:'completed'};}});
 await execute({id:'fixed'},{});assert.deepEqual(profile,{model:'gpt-6.1-sol',effort:'high'});
});
