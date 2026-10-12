import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {loadAdaptiveRunManifest,loadAdaptivePublicInput,loadAdaptiveSharedPreparation,
  createAdaptiveProviderSession} from '../src/benchmark/adaptive-dag-runner.mjs';

const root=resolve(import.meta.dirname,'..'),read=path=>JSON.parse(readFileSync(path,'utf8'));
const manifest=()=>loadAdaptiveRunManifest(join(root,'benchmarks/e2e-swe/manifests/d073-adaptive.json'),root);
const hash=value=>createHash('sha256').update(value).digest('hex');
function directory(t) {
  const path=mkdtempSync(join(tmpdir(),'d073-runner-'));
  for(const name of ['calls','receipts'])mkdirSync(join(path,name));
  t.after(()=>rmSync(path,{recursive:true,force:true}));return path;
}

test('D073 focused owner v9 requires its matching contract while preserving source-only preparation',t=>{
  const path=join(root,'benchmarks/e2e-swe/manifests/d073-inferred-v2.json');
  const config=loadAdaptiveRunManifest(path,root);
  assert.equal(config.repair_policy.scope_contract,'public-inferred-owner-v2');
  assert.equal(config.repair_policy.owner_inference_contract,'docs/orchestration/contracts/adaptive-inferred-repair.v2.json');
  const prepared=loadAdaptiveSharedPreparation({rootDir:root,manifest:config,input:loadAdaptivePublicInput(root,config),
    preparationDirectory:join(root,config.catalog_reuse.preparation_directory)});
  assert.equal(prepared.compatibility.generation_request_exact_match,true);
  assert.equal(prepared.compatibility.new_catalog_inference_calls,0);
  const invalid=read(path);invalid.repair_policy.owner_inference_contract='docs/orchestration/contracts/adaptive-inferred-repair.v1.json';
  const changed=join(directory(t),'invalid.json');writeFileSync(changed,JSON.stringify(invalid));
  assert.throws(()=>loadAdaptiveRunManifest(changed,root),{code:'ADAPTIVE_MANIFEST_INVALID'});
});

test('D073 changes input policy without changing source catalog generation or historical D071 defaults',()=>{
  const config=manifest(),input=loadAdaptivePublicInput(root,config);
  const prepared=loadAdaptiveSharedPreparation({rootDir:root,manifest:config,input,
    preparationDirectory:join(root,config.catalog_reuse.preparation_directory)});
  assert.deepEqual(config.arms,['jev_profile']);assert.equal(config.cohort_concurrency,1);
  assert.equal(config.limits.planning_input_tokens,null);assert.equal(config.jev_budget.max_input_tokens,null);
  assert.equal(config.limits.max_request_bytes,256000);
  assert.equal(config.repair_policy.scope_contract,'public-inferred-owner-v1');
  assert.equal(prepared.compatibility.generation_request_exact_match,true);
  assert.equal(prepared.compatibility.generation_prompt_schema_exact_match,true);
  assert.equal(prepared.compatibility.new_catalog_inference_calls,0);
  assert.deepEqual(prepared.compatibility.local_request_limit_change,
    {previous_bytes:240000,current_bytes:256000,catalog_generation_content_unchanged:true});
  const old=loadAdaptiveRunManifest(join(root,'benchmarks/e2e-swe/manifests/d071-adaptive.json'),root);
  assert.deepEqual(old.arms,['claude_all','jev_all','jev_profile']);
  assert.equal(old.limits.max_request_bytes,240000);
  assert.equal(old.repair_policy.token_admission_contract,'docs/orchestration/contracts/jev-token-admission.v3.json');
});

test('the formerly blocked 86809-byte request reaches injected transport at every D073 stage after v4 admission',async t=>{
  const runDirectory=directory(t),config=manifest(),events=[],bodies=[];let opens=0,reserves=0,settles=0;
  const request=read(join(root,'benchmark-runs/d071-comparison-01/jev_profile/calls/jev-0064.request.json'));
  assert.equal(Buffer.byteLength(prepareDecision(request).serialized),86809);
  const answers={answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>[id,
    {type:q.type,choice:Object.keys(q.criteria)[0]}]))};
  const session=createAdaptiveProviderSession({rootDir:root,manifest:config,run_id:'d073-integration',runDirectory,
    remaining:()=>30000,record:async event=>events.push(event),adapters:{jevConfig:{},
      openBudget:()=>{opens++;return {reserve:()=>{reserves++;return `fixture-${reserves}`;},settle:()=>{settles++;},
        snapshot:()=>({fixture:true}),close:()=>{}};},
      jevClientFactory:()=>({listModels:async()=>({models:[{name:'jev-latest'}]}),listCredits:async()=>({fixture:true}),
        decide:async body=>{bodies.push(body);return {...answers,model:'jev-1.13.0',usage:{input_tokens:35000,output_tokens:3}};}})}});
  for(const stage of ['split','relations','profiles','repair_owners','repair'])
    assert.deepEqual(await session.decide('jev',request,{stage}),answers);
  assert.equal(opens,5);assert.equal(reserves,5);assert.equal(settles,5);assert.equal(bodies.length,5);
  for(const receipt of session.receipts()) {
    const admission=read(join(runDirectory,'calls',`${receipt.id}.token-admission.json`));
    assert.equal(admission.schema_version,'jev-token-admission-result/v4');assert.equal(admission.inference_allowed,true);
    assert.equal(admission.request_sha256,hash(prepareDecision(request).serialized));
    assert.ok(admission.warning_codes.includes('JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT'));
    assert.equal(admission.local_caps.request_tokens,null);assert.equal(receipt.inference_started,true);
    const admitted=events.findIndex(e=>e.event==='adaptive_token_admission_checked'&&e.id===receipt.id);
    const reserved=events.findIndex(e=>e.event==='budget_reserved'&&e.attempt_id===receipt.attempt_id);
    const sent=events.findIndex(e=>e.event==='inference_started'&&e.attempt_id===receipt.attempt_id);
    assert.ok(admitted>=0&&reserved>admitted&&sent>reserved);
  }
});

test('D073 official body limit and unknown stage still stop before reservation or provider creation',async t=>{
  const config=manifest();let external=0;
  const make=()=>createAdaptiveProviderSession({rootDir:root,manifest:config,run_id:'guard',runDirectory:directory(t),
    remaining:()=>30000,adapters:{jevConfig:{},openBudget:()=>{external++;throw Error('UNEXPECTED_BUDGET');},
      jevClientFactory:()=>{external++;throw Error('UNEXPECTED_PROVIDER');}}});
  const request={model:'jev-latest',state:'x'.repeat(256000),questions:{owner:{type:'choice',instructions:'Choose.',criteria:{one:'One.',two:'Two.'}}}};
  await assert.rejects(make().decide('jev',request,{stage:'repair_owners'}));
  await assert.rejects(make().decide('jev',{...request,state:'Small public input.'},{stage:'arbitrary'}),{code:'ADAPTIVE_STAGE_INVALID'});
  assert.equal(external,0);
});
