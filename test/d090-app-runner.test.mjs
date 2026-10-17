import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {loadCodexE2EInputs,CODEX_E2E_MANIFEST,resolveCodexE2EProfile} from '/Users/lee/workspace/plugins/jev-router-codex-d090-20261016/src/benchmark/codex-e2e-runner.mjs';
import {createPointsmanGateway,validatePointsmanManifest,validatePointsmanBinding,D090_CODEX_EXECUTION,D090_CODEX_SOURCES} from '/Users/lee/workspace/plugins/jev-router-codex-d090-20261016/src/orchestration/pointsman-gateway.mjs';
const root='/Users/lee/workspace/plugins/jev-router-codex-d090-20261016',read=p=>JSON.parse(readFileSync(join(root,p)));
const oldRoot='/Users/lee/workspace/plugins/jev-router-codex-d089-20261016';
const manifest=()=>read(CODEX_E2E_MANIFEST);
const request=()=>JSON.parse(readFileSync(oldRoot+'/benchmark-runs/d089-codex-20261016-01/pair/jev/calls/jev-0001.request.json'));

test('D090 switches only app CLI/profile/pricing while preserving D089 task and repair contracts',()=>{
 const loaded=loadCodexE2EInputs({rootDir:root});
 assert.equal(loaded.binding.policy.schema_version,'pointsman-routing/v6');
 assert.deepEqual(loaded.manifest.codex_execution,D090_CODEX_EXECUTION);
 const normalize=m=>{m=structuredClone(m);for(const k of ['codex_execution','skill_gateway','session_semantics'])delete m[k];return m;};
 assert.deepEqual(normalize(manifest()),normalize(read('benchmarks/e2e-swe/manifests/pointsman-codex-d089.json')));
 assert.equal(Object.keys(loaded.testRequirements).length,93);
 for(const path of D090_CODEX_SOURCES)assert.ok(loaded.binding.policy.source_pins.some(p=>p.path===path));
});

test('different model/effort, PATH environment, unknown prices and changed common scope are rejected before dispatch',()=>{
 assert.deepEqual(resolveCodexE2EProfile(),{model:'gpt-6.1-sol',effort:'high'});
 for(const options of [{model:'gpt-5.6-sol'},{effort:'max'}])assert.throws(()=>resolveCodexE2EProfile(options),{code:'CODEX_E2E_PROFILE_CHANGED'});
 for(const change of [m=>delete m.codex_execution,m=>m.codex_execution.environment='path',m=>m.codex_execution.model='gpt-5.6-sol',
  m=>m.codex_execution.pricing_contract='other.json',m=>m.codex_execution.extra=true,m=>m.max_repair_rounds=3]){
  const m=manifest();change(m);assert.throws(()=>validatePointsmanManifest(m,{rootDir:root}));
 }
});

test('D090 real captured question crosses recorded initial/reserve/post gates and accepts registered model',async()=>{
 const records=[],events=[],gateway=createPointsmanGateway({rootDir:root,binding:manifest().skill_gateway,
  save:(path,value)=>records.push({path,value}),record:async e=>events.push(e)});
 const body=request(),ticket=await gateway.begin(body,{stage:'split',decisionId:'d090-native-shape',observedModel:'typesafe/jev-1.14-20261014'});
 ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');
 await ticket.accept({model:'typesafe/jev-1.14-20261014',answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>[id,{type:q.type,choice:Object.keys(q.criteria)[0]}])),usage:{input_tokens:1,output_tokens:1}});
 for(const phase of ['initial','before_reservation','before_post'])assert.equal(records.find(r=>r.path.endsWith(`.${phase}.json`)).value.passed,true);
 assert.ok(events.some(e=>e.event==='pointsman_gateway_accepted'));
});

test('request mutation and unregistered response labels still stop before sending',async()=>{
 const gateway=createPointsmanGateway({rootDir:root,binding:manifest().skill_gateway,save:()=>{},record:async()=>{}});
 await assert.rejects(gateway.begin(request(),{stage:'split',decisionId:'unknown',observedModel:'typesafe/jev-1.14-20991231'}),{code:'POINTSMAN_INPUT_BLOCKED'});
 const body=request(),ticket=await gateway.begin(body,{stage:'split',decisionId:'mutation'});ticket.assertBefore('before_reservation');body.state.changed=true;
 assert.throws(()=>ticket.assertBefore('before_post',body),{code:'POINTSMAN_REQUEST_CHANGED'});
});

test('historical production gateway v1-v5 remain byte-identical and v5 rejects new source pins',()=>{
 for(const v of [1,2,3,4,5]){const path=`docs/orchestration/contracts/pointsman-routing.v${v}.json`;assert.deepEqual(readFileSync(join(root,path)),readFileSync(join(oldRoot,path)));}
 assert.throws(()=>validatePointsmanBinding(read('benchmarks/e2e-swe/manifests/pointsman-codex-d089.json').skill_gateway,{rootDir:root}),{code:'POINTSMAN_SOURCE_CHANGED'});
});
