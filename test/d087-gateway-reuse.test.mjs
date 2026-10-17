import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {loadCodexE2EInputs,CODEX_E2E_MANIFEST} from '/Users/lee/workspace/plugins/jev-router-codex-20261016/src/benchmark/codex-e2e-runner.mjs';
import {loadAdaptiveSharedPreparation} from '/Users/lee/workspace/plugins/jev-router-codex-20261016/src/benchmark/adaptive-dag-runner.mjs';
import {validatePointsmanManifest,createPointsmanGateway,validatePointsmanBinding,POINTSMAN_D087_ROUTING_CONTRACT,POINTSMAN_D087_REUSE} from '/Users/lee/workspace/plugins/jev-router-codex-20261016/src/orchestration/pointsman-gateway.mjs';
import {JEV_SETTLEMENT_MODELS} from '/Users/lee/workspace/plugins/jev-router-codex-20261016/src/benchmark/budget.mjs';
const currentRoot=resolve(import.meta.dirname,'..'),root='/Users/lee/workspace/plugins/jev-router-codex-20261016',read=p=>JSON.parse(readFileSync(p)),sha=b=>createHash('sha256').update(b).digest('hex');
const manifest=read(join(root,CODEX_E2E_MANIFEST));

test('D087 uses only the exact shared ledger and same original catalog file through a new pinned registry',()=>{
 const loaded=loadCodexE2EInputs({rootDir:root});
 assert.equal(CODEX_E2E_MANIFEST,'benchmarks/e2e-swe/manifests/pointsman-codex-d087.json');
 assert.equal(loaded.binding.policy.schema_version,'pointsman-routing/v3');
 assert.equal(loaded.manifest.jev_budget.ledger_path,POINTSMAN_D087_REUSE.shared_ledger_path);
 assert.equal(realpathSync(loaded.prepared.catalog_path),join(POINTSMAN_D087_REUSE.catalog_directory,'catalog.json'));
 assert.equal(loaded.prepared.result.catalog_file_sha256,loaded.manifest.catalog_reuse.catalog_file_sha256);
 assert.equal(Object.keys(loaded.testRequirements).length,93);
 assert.deepEqual(loaded.manifest.repair_feedback,{read_scope:'candidate-v1',worker_diagnostics:'report-v1',scope_expansion:'worker-mentioned-v1'});
 assert.equal(loaded.prepared.catalog.artifacts.length,22);
});

test('D087 rejects other absolute ledgers, a relative alias, or workflow changes',()=>{
 for(const ledger of ['/tmp/copied-ledger.json','benchmark-runs/jev-usd1-budget.json',POINTSMAN_D087_REUSE.shared_ledger_path+'.other']){
  const changed=structuredClone(manifest);changed.jev_budget.ledger_path=ledger;
  assert.throws(()=>validatePointsmanManifest(changed,{rootDir:root}),{code:'POINTSMAN_SHARED_LEDGER_CHANGED'});
 }
 const changed=structuredClone(manifest);changed.max_repair_rounds=3;
 assert.throws(()=>validatePointsmanManifest(changed,{rootDir:root}),{code:'POINTSMAN_WORKFLOW_CHANGED'});
});

test('equal catalog bytes at a different file identity cannot satisfy D087 reuse',t=>{
 const loaded=loadCodexE2EInputs({rootDir:root}),other=mkdtempSync(join(tmpdir(),'d087-not-original-'));
 t.after(()=>rmSync(other,{recursive:true,force:true}));
 for(const name of ['result.json','catalog.json'])writeFileSync(join(other,name),readFileSync(join(loaded.prepared.directory,name)));
 assert.throws(()=>loadAdaptiveSharedPreparation({rootDir:root,manifest:loaded.manifest,input:loaded.input,preparationDirectory:other}),{code:'ADAPTIVE_PREPARATION_INVALID'});
});

test('D087 fixed question and source gates still precede both dispatch boundaries and durable acceptance',async t=>{
 const copy=mkdtempSync(join(tmpdir(),'d087-gateway-'));t.after(()=>rmSync(copy,{recursive:true,force:true}));
 const contract=read(join(root,POINTSMAN_D087_ROUTING_CONTRACT));
 for(const pin of contract.source_pins){const dest=join(copy,pin.path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,readFileSync(join(root,pin.path)));}
 mkdirSync(dirname(join(copy,POINTSMAN_D087_ROUTING_CONTRACT)),{recursive:true});
 writeFileSync(join(copy,POINTSMAN_D087_ROUTING_CONTRACT),readFileSync(join(root,POINTSMAN_D087_ROUTING_CONTRACT)));
 const binding=manifest.skill_gateway,writes=[],events=[];
 const gateway=createPointsmanGateway({rootDir:copy,binding,save:(p,v)=>writes.push({p,v}),record:async e=>events.push(e)});
 const c=read(join(root,'docs/orchestration/contracts/adaptive-layered-decomposition.v2.json'));
 const instructions=c.question.call_template.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g,(_,a,b)=>({a:'u1',b:'u2',a_paths:'one.py',b_paths:'two.py'}[a??b]??'fixture'));
 const request={model:'jev-latest',state:{unit_relation_question:c.question.instructions},questions:{q:{type:'choice',instructions,criteria:{a:'First.',b:'Second.'}}}};
 const ticket=await gateway.begin(request,{stage:'split',decisionId:'fixture'});
 ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');
 await ticket.accept({model:'fixture-codex',answers:{q:{type:'choice',choice:'a'}},usage:{input_tokens:1,output_tokens:1}});
 assert.ok(writes.some(x=>x.p.endsWith('.before_post.json')));assert.ok(events.some(e=>e.event==='pointsman_gateway_accepted'));
 writeFileSync(join(copy,'src/benchmark/budget.mjs'),'// drift');
 assert.throws(()=>validatePointsmanBinding(binding,{rootDir:copy}),{code:'POINTSMAN_SOURCE_CHANGED'});
});

test('only the exact verified Jev1.14 dated build joins the unchanged settlement allowlist',()=>{
 assert.ok(JEV_SETTLEMENT_MODELS.includes('typesafe/jev-1.14-20261014'));
 for(const model of ['jev-latest','jev-1.14','typesafe/jev-1.14','typesafe/jev-1.14-20261015'])assert.ok(!JEV_SETTLEMENT_MODELS.includes(model));
 for(const version of ['v1','v2'])assert.equal(sha(readFileSync(join(root,`docs/orchestration/contracts/pointsman-routing.${version}.json`))),
  sha(readFileSync(`/Users/lee/workspace/plugins/jev-router/docs/orchestration/contracts/pointsman-routing.${version}.json`)));
});

test('production legacy v1/v3 source pins still reject current D088 source drift',async()=>{
 const {validatePointsmanManifest:active}=await import('../src/orchestration/pointsman-gateway.mjs');
 for(const path of ['benchmarks/e2e-swe/manifests/pointsman-d083.json','benchmarks/e2e-swe/manifests/pointsman-codex-d087.json'])
  assert.throws(()=>active(read(join(currentRoot,path)),{rootDir:currentRoot}),{code:'POINTSMAN_SOURCE_CHANGED'});
});
