import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {loadCodexE2EInputs,CODEX_E2E_MANIFEST} from '/Users/lee/workspace/plugins/jev-router-codex-d088-20261016/src/benchmark/codex-e2e-runner.mjs';
import {createAdaptiveProviderSession} from '/Users/lee/workspace/plugins/jev-router-codex-d088-20261016/src/benchmark/adaptive-dag-runner.mjs';
import {createTokenBudget} from '../src/benchmark/budget.mjs';
import {validatePointsmanManifest,createPointsmanGateway,validatePointsmanBinding,POINTSMAN_D088_ROUTING_CONTRACT} from '/Users/lee/workspace/plugins/jev-router-codex-d088-20261016/src/orchestration/pointsman-gateway.mjs';
// Historical D088 assertions execute its preserved runtime; D089 current bindings are covered separately.
const root='/Users/lee/workspace/plugins/jev-router-codex-d088-20261016',read=p=>JSON.parse(readFileSync(p));
const manifest=read(join(root,'benchmarks/e2e-swe/manifests/pointsman-codex-d088.json'));
const prior='/Users/lee/workspace/plugins/jev-router-codex-20261016';
const captured=()=>read(join(prior,'benchmark-runs/d087-codex-20261016-01/pair/jev/calls/jev-0003.request.json'));

test('D088 default CLI input binds canonical admission and settlement without changing D087 task/worker/repair scope',()=>{
 assert.equal(CODEX_E2E_MANIFEST,'benchmarks/e2e-swe/manifests/pointsman-codex-d088.json');
 const loaded=loadCodexE2EInputs({rootDir:root});
 assert.equal(loaded.binding.policy.schema_version,'pointsman-routing/v4');
 assert.equal(loaded.binding.policy.input_policy,'v5');
 assert.equal(loaded.manifest.repair_policy.token_admission_contract,'docs/orchestration/contracts/jev-token-admission.v5.json');
 const old=read(join(root,'benchmarks/e2e-swe/manifests/pointsman-codex-d087.json'));
 const normalized=m=>{m=structuredClone(m);delete m.session_semantics;delete m.skill_gateway;delete m.repair_policy.token_admission_contract;return m;};
 assert.deepEqual(normalized(manifest),normalized(old));
 assert.equal(Object.keys(loaded.testRequirements).length,93);assert.equal(loaded.manifest.limits.max_concurrency,2);
 for(const p of ['src/jev-model-registry.mjs','src/benchmark/budget.mjs','src/orchestration/jev-token-admission-v5.mjs',
  'docs/orchestration/contracts/jev-models.v1.json','docs/orchestration/contracts/jev-token-admission.v5.json'])
  assert.ok(loaded.binding.policy.source_pins.some(pin=>pin.path===p));
});

test('two real-session fixture calls cross all gates and native temporary-ledger settlement after native1.14 was observed',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'d088-runtime-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 for(const name of ['calls','receipts'])mkdirSync(join(directory,name));
 const request=captured(),events=[];let posts=0;
 const nativeConfig={...manifest.jev_budget,ledger_path:join(directory,'temporary-native-ledger.json')};
 const initial=createTokenBudget(nativeConfig);const budgetId=initial.snapshot().budget_id;initial.close();
 const session=createAdaptiveProviderSession({rootDir:root,manifest,run_id:'d088-canonical',runDirectory:directory,
  remaining:()=>60000,record:async event=>events.push(event),modelLookup:'per_session',budgetLock:'ledger_op',adapters:{jevConfig:{},
   openBudget:cfg=>{assert.equal(cfg.ledger_path,manifest.jev_budget.ledger_path);return createTokenBudget(nativeConfig,{requireExisting:true});},
   jevClientFactory:()=>({listModels:async()=>({models:[{name:'jev-latest'}]}),listCredits:async()=>({paidInputTokensRemaining:1000000,tokensReserved:0,tokenDebt:0,spending_frozen:false,
     receipt:{method:'GET',destination:'https://jev-ai.pro/api/v1/credits',status:200,automaticRetries:0}}),decide:async body=>{
    posts++;return {model:'typesafe/jev-1.14-20261014',usage:{input_tokens:10,output_tokens:2},
     billing:{mode:'tokens',modelMultiplier:'1',creditsCharged:'0',paidInputTokensUsed:'10',runId:`fixture-native-${posts}`},
     receipt:{method:'POST',destination:'https://jev-ai.pro/api/v1/systemone',status:200,automaticRetries:0,durationMs:1},
     answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>[id,{type:q.type,choice:Object.keys(q.criteria)[0]}]))};}})}});
 for(let i=0;i<2;i++)await session.decide('jev',request,{stage:'split'});
 assert.equal(posts,2);
 const ledger=read(nativeConfig.ledger_path);assert.equal(ledger.budget_id,budgetId);assert.equal(ledger.charged_input_tokens,20);
 assert.equal(ledger.settled_requests,2);assert.deepEqual(ledger.pending,[]);assert.equal(ledger.blocked_code,null);
 assert.deepEqual(session.receipts().map(r=>r.status),['completed','completed']);
 const gate=read(join(directory,'gateway/jev-0002.before_post.json'));
 assert.equal(gate.input.policy_version,'v5');assert.equal(gate.input.admission.inference_allowed,true);
 assert.equal(gate.input.admission.model_context_assumption,'1.14.0');
 assert.equal(gate.input.admission.model_registry_source.sha256,validatePointsmanManifest(manifest,{rootDir:root}).policy.model_registry.sha256);
 const admission=read(join(directory,'calls/jev-0002.token-admission.json'));
 assert.equal(admission.inference_allowed,true);assert.equal(admission.model_context_assumption,'1.14.0');assert.equal(admission.policy_source.path,'docs/orchestration/contracts/jev-token-admission.v5.json');
 assert.ok(events.some(e=>e.event==='pointsman_gateway_accepted'));
});

test('unknown observed model is blocked before any reservation/post and registry source drift still rejects',async t=>{
 const writes=[],gateway=createPointsmanGateway({rootDir:root,binding:manifest.skill_gateway,record:async()=>{},save:(p,v)=>writes.push({p,v})});
 await assert.rejects(gateway.begin(captured(),{stage:'split',decisionId:'unknown',observedModel:'typesafe/jev-1.14-20991231'}),{code:'POINTSMAN_INPUT_BLOCKED'});
 assert.equal(writes.some(x=>x.p.endsWith('.before_reservation.json')),false);
 const directory=mkdtempSync(join(tmpdir(),'d088-drift-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));
 const contract=read(join(root,POINTSMAN_D088_ROUTING_CONTRACT));
 for(const pin of contract.source_pins){const path=join(directory,pin.path);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,readFileSync(join(root,pin.path)));}
 const path=join(directory,POINTSMAN_D088_ROUTING_CONTRACT);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,readFileSync(join(root,POINTSMAN_D088_ROUTING_CONTRACT)));
 writeFileSync(join(directory,'docs/orchestration/contracts/jev-models.v1.json'),'{}');
 assert.throws(()=>validatePointsmanBinding(manifest.skill_gateway,{rootDir:directory}),{code:'POINTSMAN_SOURCE_CHANGED'});
});

test('D088 cannot bind the legacy model gate and preserves historical registries/admission sources byte-for-byte',()=>{
 const wrong=structuredClone(manifest);wrong.repair_policy.token_admission_contract='docs/orchestration/contracts/jev-token-admission.v4.json';
 assert.throws(()=>validatePointsmanManifest(wrong,{rootDir:root}),{code:'POINTSMAN_MODEL_POLICY_CHANGED'});
 for(const v of [1,2,3])assert.deepEqual(readFileSync(join(root,`docs/orchestration/contracts/pointsman-routing.v${v}.json`)),readFileSync(join(prior,`docs/orchestration/contracts/pointsman-routing.v${v}.json`)));
 for(const v of [1,2,3,4]){
  const mod=v===1?'src/orchestration/jev-token-admission.mjs':`src/orchestration/jev-token-admission-v${v}.mjs`;
  assert.deepEqual(readFileSync(join(root,mod)),readFileSync(join(prior,mod)));
  assert.deepEqual(readFileSync(join(root,`docs/orchestration/contracts/jev-token-admission.v${v}.json`)),readFileSync(join(prior,`docs/orchestration/contracts/jev-token-admission.v${v}.json`)));
 }
});

test('canonical Jev request admission never classifies the Codex response model as Jev billing',async()=>{
 const gateway=createPointsmanGateway({rootDir:root,binding:manifest.skill_gateway,record:async()=>{},save:()=>{}});
 const request=captured(),ticket=await gateway.begin(request,{stage:'split',decisionId:'codex-response'});
 ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');
 const response={model:'gpt-5.6-sol',usage:{input_tokens:2,output_tokens:1},answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>[id,{type:q.type,choice:Object.keys(q.criteria)[0]}]))};
 assert.equal((await ticket.accept(response)).model,'gpt-5.6-sol');
});
