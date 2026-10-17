import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {loadCodexE2EInputs,CODEX_E2E_MANIFEST} from '/Users/lee/workspace/plugins/jev-router-codex-d089-20261016/src/benchmark/codex-e2e-runner.mjs';
import {createPointsmanGateway,validatePointsmanManifest,validatePointsmanBinding,
 D089_REPAIR_EFFICIENCY,D089_REPAIR_POLICY_SOURCES} from '/Users/lee/workspace/plugins/jev-router-codex-d089-20261016/src/orchestration/pointsman-gateway.mjs';
const root='/Users/lee/workspace/plugins/jev-router-codex-d089-20261016',read=p=>JSON.parse(readFileSync(join(root,p)));
const manifest=read('benchmarks/e2e-swe/manifests/pointsman-codex-d089.json');
const originalRoot='/Users/lee/workspace/plugins/jev-router-codex-d088-20261016';
const request=()=>JSON.parse(readFileSync(originalRoot+'/benchmark-runs/d088-codex-20261016-01/pair/jev/calls/jev-0003.request.json'));

test('D089 preserves model, budget, catalog, checks and limits; only three common policies are enabled',()=>{
 assert.equal(CODEX_E2E_MANIFEST,'benchmarks/e2e-swe/manifests/pointsman-codex-d089.json');
 const loaded=loadCodexE2EInputs({rootDir:root});
 assert.equal(loaded.binding.policy.schema_version,'pointsman-routing/v5');
 assert.deepEqual(loaded.manifest.repair_efficiency,D089_REPAIR_EFFICIENCY);
 const normalized=m=>{m=structuredClone(m);for(const k of ['repair_efficiency','skill_gateway','session_semantics'])delete m[k];return m;};
 assert.deepEqual(normalized(manifest),normalized(read('benchmarks/e2e-swe/manifests/pointsman-codex-d088.json')));
 assert.equal(Object.keys(loaded.testRequirements).length,93);
 for(const path of D089_REPAIR_POLICY_SOURCES)assert.ok(loaded.binding.policy.source_pins.some(p=>p.path===path));
});

test('missing/changed/extra efficiency flags or replaced common limits are blocked',()=>{
 for(const mutate of [m=>delete m.repair_efficiency,m=>m.repair_efficiency.dispatch_policy='skip-all',
  m=>m.repair_efficiency.extra=true,m=>m.repair_efficiency.worker_input_projection='unknown',m=>m.max_repair_rounds=3]){
  const m=structuredClone(manifest);mutate(m);assert.throws(()=>validatePointsmanManifest(m,{rootDir:root}));
 }
});

test('D089 mandatory gateway records every send boundary and still accepts a registered1.14 label',async()=>{
 const records=[],events=[],gateway=createPointsmanGateway({rootDir:root,binding:manifest.skill_gateway,
  save:(p,r)=>records.push({p,r}),record:async e=>events.push(e)});
 const body=request(),ticket=await gateway.begin(body,{stage:'split',decisionId:'d089-replay',observedModel:'typesafe/jev-1.14-20261014'});
 ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');
 await ticket.accept({model:'typesafe/jev-1.14-20261014',answers:Object.fromEntries(Object.entries(body.questions).map(([k,q])=>[k,{type:q.type,choice:Object.keys(q.criteria)[0]}])),usage:{input_tokens:1,output_tokens:1}});
 for(const phase of ['initial','before_reservation','before_post'])assert.equal(records.find(x=>x.p.endsWith(`.${phase}.json`)).r.passed,true);
 assert.ok(events.some(e=>e.event==='pointsman_gateway_accepted'));
});

test('D089 rejects unregistered observed labels and request mutation before sending',async()=>{
 const gateway=createPointsmanGateway({rootDir:root,binding:manifest.skill_gateway,save:()=>{},record:async()=>{}});
 await assert.rejects(gateway.begin(request(),{stage:'split',decisionId:'unknown',observedModel:'typesafe/jev-1.14-20991231'}),{code:'POINTSMAN_INPUT_BLOCKED'});
 const body=request(),ticket=await gateway.begin(body,{stage:'split',decisionId:'mutation'});
 ticket.assertBefore('before_reservation');body.state.changed=true;
 assert.throws(()=>ticket.assertBefore('before_post',body),{code:'POINTSMAN_REQUEST_CHANGED'});
});

test('historical production registries remain unchanged and reject new sources with their stale pins',()=>{
 for(const v of [1,2,3,4]){
  const p=`docs/orchestration/contracts/pointsman-routing.v${v}.json`;
  assert.deepEqual(readFileSync(join(root,p)),readFileSync(join(originalRoot,p)));
 }
 const old=read('benchmarks/e2e-swe/manifests/pointsman-codex-d088.json');
 assert.throws(()=>validatePointsmanBinding(old.skill_gateway,{rootDir:root}),{code:'POINTSMAN_SOURCE_CHANGED'});
});
