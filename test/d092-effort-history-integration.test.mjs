import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createFrozenCodexEnvironment} from '../src/benchmark/codex-environment.mjs';
import {createCodexWorkerProfileRouter,buildCodexWorkerProfileRequest,eligibleCodexWorkerProfiles} from '../src/benchmark/codex-worker-profiles-v2.mjs';
import {loadCodexWorkerHistory} from '../src/benchmark/codex-worker-history-binding.mjs';
import {createPointsmanGateway,validatePointsmanManifest} from '../src/orchestration/pointsman-gateway.mjs';
import {createCodexE2EWorkerExecutor,loadCodexE2EInputs,CODEX_E2E_CALIBRATED_MANIFEST} from '../src/benchmark/codex-e2e-runner.mjs';
import {codexE2EDecisionStageAllowed} from '../src/benchmark/codex-e2e-decisions.mjs';
import {codexPricingContract} from '../src/benchmark/codex-pricing.mjs';
const root=resolve(import.meta.dirname,'..'),base=join(root,'benchmark-runs/d092-effort-history-20261017-01');
const read=p=>JSON.parse(readFileSync(p));

test('D092 freezes only offered model-effort pairs and rejects an unsupported execution pair',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'d092-env-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const source=join(dir,'source');mkdirSync(source);writeFileSync(join(source,'auth.json'),'local-test-only');
  const models=[{model:'gpt-6.1-sol',supported_reasoning_efforts:['low','high','ultra']},
    {model:'gpt-6-luna',supported_reasoning_efforts:['low','high']}];
  const candidates=models.flatMap(({model})=>['low','high','ultra'].map(effort=>({model,effort})));
  const environment=await createFrozenCodexEnvironment({command:process.execPath,sourceCodexHome:source,
    allowedProfileCandidates:candidates,discover:async({account})=>({skills:[],auth:account?{logged_in:true,type:'chatgpt'}:null,models:account?models:null})});
  t.after(()=>environment.close());
  assert.equal(environment.evidence.allowed_profiles.length,5);
  assert.deepEqual(environment.evidence.excluded_profile_candidates,[{model:'gpt-6-luna',effort:'ultra'}]);
  assert.equal((await environment.verify({model:'gpt-6.1-sol',effort:'low'})).verified,true);
  assert.equal((await environment.verify({model:'gpt-6.1-sol',effort:'ultra'})).verified,true);
  await assert.rejects(environment.verify({model:'gpt-6-luna',effort:'ultra'}),{code:'CODEX_ENV_PROFILE_NOT_ALLOWED'});
  assert.equal(environment.close().temporary_home_removed,true);
});

test('D092 actual public history crosses all required gateway phases and selected low reaches executor without a high fallback',async()=>{
  const loaded=loadCodexE2EInputs({rootDir:root,manifestPath:CODEX_E2E_CALIBRATED_MANIFEST});
  const history=loadCodexWorkerHistory({rootDir:root}),environmentEvidence=read(join(base,'app-discovery.json'));
  const planning=read(join(root,'benchmark-runs/d091-codex-20261016-01/cohort/pair-fixed/codex/planning.json'));
  const task=planning.plan.tasks.find(row=>row.kind==='implementation'),context={operation:'implementation',round_index:0,input_artifact_revisions:{}};
  const saved=[],events=[],receipts=[],actual=[];
  const save=(path,value)=>saved.push({path,value}),record=async e=>events.push(e);
  const gateway=createPointsmanGateway({rootDir:root,binding:loaded.manifest.skill_gateway,save,record});
  const router=createCodexWorkerProfileRouter({planning,environmentEvidence,pricingContract:codexPricingContract({version:'v2'}),
    empiricalEvidence:history.snapshot,expectedEmpiricalSha256:history.binding.snapshot_sha256,save,record,
    decide:async(request,metadata)=>{
      assert.equal(codexE2EDecisionStageAllowed({provider:'jev',manifest:loaded.manifest,metadata}),true);
      assert.equal(codexE2EDecisionStageAllowed({provider:'codex',manifest:loaded.manifest,metadata}),false);
      const ticket=await gateway.begin(request,{stage:'profiles',decisionId:'d092-offline-joint-profile'});
      ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');
      const response={model:'typesafe/jev-1.14-20261014',usage:{input_tokens:1,output_tokens:1},answers:{worker_profile:{type:'choice',choice:'gpt-6.1-sol-low'}}};
      await ticket.accept(response);return response;
    }});
  const execute=createCodexE2EWorkerExecutor({profileRouter:router,cliEnvironment:{verify:async p=>actual.push(p)},
    context:{directory:'/private/tmp/d092-mock-only',save,record},workerReceipts:receipts,
    input:loaded.input,catalog:loaded.prepared.catalog,manifest:loaded.manifest,model:'gpt-6.1-sol',effort:'high',
    workerFactory:options=>async()=>{
      assert.equal(options.model,'gpt-6.1-sol');assert.equal(options.effort,'low');
      await options.onReceipt({id:'offline-worker',status:'completed',requested_model:options.model,requested_effort:options.effort,
        provider_receipt:'offline-provider-receipt.json',provider:{status:'completed'}});return{status:'completed'};
    }});
  await execute(task,context);
  assert.deepEqual(actual,[{model:'gpt-6.1-sol',effort:'low'}]);
  assert.equal(saved.filter(row=>row.value.phase&&row.value.passed).length,3);
  assert.equal(saved.find(row=>row.path.endsWith('/execution.json')).value.requested_effort,'low');
  assert.equal(receipts.length,1);
  // Historical integrity gates remain active; old contracts are not repinned to silently accept new code.
  const historical=read(join(root,'benchmarks/e2e-swe/manifests/pointsman-codex-d091-adaptive.json'));
  assert.throws(()=>validatePointsmanManifest(historical,{rootDir:root}),{code:'POINTSMAN_SOURCE_CHANGED'});
});

test('D092 gateway rejects altered measured history or wording before a provider boundary',async()=>{
  const history=loadCodexWorkerHistory({rootDir:root}),environmentEvidence=read(join(base,'app-discovery.json'));
  const planning=read(join(root,'benchmark-runs/d091-codex-20261016-01/cohort/pair-fixed/codex/planning.json'));
  const task=planning.plan.tasks.find(row=>row.kind==='implementation');
  const catalog=eligibleCodexWorkerProfiles({environmentEvidence,pricingContract:codexPricingContract({version:'v2'})});
  const {request}=buildCodexWorkerProfileRequest({planning,task,context:{operation:'implementation',round_index:0},catalog,
    empiricalEvidence:history.snapshot,expectedEmpiricalSha256:history.binding.snapshot_sha256});
  const manifest=read(join(root,CODEX_E2E_CALIBRATED_MANIFEST));let posts=0;
  for(const [i,change]of [q=>q.state.instructions+=' skip history',
    q=>q.state.empirical_evidence.statistics[0].value.public_success.success+=100].entries()){
    const invalid=structuredClone(request);change(invalid);
    const gateway=createPointsmanGateway({rootDir:root,binding:manifest.skill_gateway,save:()=>{},record:async()=>{}});
    await assert.rejects(async()=>{await gateway.begin(invalid,{stage:'profiles',decisionId:`d092-tampered-${i}`});posts++;});
  }
  assert.equal(posts,0);
});
