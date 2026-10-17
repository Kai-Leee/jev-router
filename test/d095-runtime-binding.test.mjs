import test from 'node:test';import assert from 'node:assert/strict';
import{readFileSync,existsSync}from'node:fs';import{createHash}from'node:crypto';import{resolve}from'node:path';
import{collectPublicOwnerEvidence,applyPublicOwnerEvidenceScope,selectPublicOwnerEvidenceScope}from'../src/orchestration/adaptive-public-owner-evidence.mjs';
const root=resolve(import.meta.dirname,'..'),B='benchmark-runs/d095-public-boundaries-20261017-01/cohort/jev_claude',read=p=>JSON.parse(readFileSync(resolve(root,p))),available=existsSync(resolve(root,B+'/execution.json'));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x,digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
function fixture(){const source_path='benchmarks/e2e-swe/public-checks/assertions.v3.json',source_text=readFileSync(resolve(root,source_path),'utf8');return{planning:read(B+'/planning.json'),runtimeBinding:read(B+'/adaptive-execution/round-0/runtime/binding.json'),assertionContract:{source_path,source_text,sha256:createHash('sha256').update(source_text).digest('hex'),contract:JSON.parse(source_text)},failure:read(B+'/execution.json').rounds[0].prior_public_failure,candidateDirectory:resolve(root,B+'/adaptive-execution/round-0/runtime/candidate')};}
function rebind(f){f.runtimeBinding.plan_hash=digest(f.runtimeBinding.plan);f.runtimeBinding.binding_digest=digest({pinManifest:f.runtimeBinding.checker_manifest,environment:f.runtimeBinding.environment,plan_hash:f.runtimeBinding.plan_hash,artifact_bindings:f.runtimeBinding.artifact_bindings});f.failure.binding_digest=f.runtimeBinding.binding_digest;f.failure.public_evidence=[];}
test('actual initial/round0 plan decorations accept current public failures and retain owner evidence',{skip:!available},async()=>{
 const f=fixture();assert.notEqual(digest(f.planning.plan),f.runtimeBinding.plan_hash);
 const e=await collectPublicOwnerEvidence(f);assert.equal(e.provider_calls,0);assert.ok(e.observations.length>0);
 const original={candidates:[{id:'repair-inferred-owners',artifact_ids:[],task_ids:[],read_artifact_ids:[],owner_inference_id:'fixture'}],analysis:{inferred_ownership:{sha256:'old',proof:{answers:{}},choice_bindings:{}},causal:{sha256:'old',chains:[],choice_bindings:{}}}};
 if(e.required_artifact_ids.length){const chosen=selectPublicOwnerEvidenceScope(applyPublicOwnerEvidenceScope(original,{plan:f.planning.plan,evidence:e,failure:f.failure}));assert.deepEqual(chosen.candidate.artifact_ids,e.required_artifact_ids);}
});
test('legal later-round decorations accepted; changed producer, wider writes and stale plan hash rejected',{skip:!available},async()=>{
 const f=fixture();f.runtimeBinding.plan.graph_revision+=':offline-round1';rebind(f);await collectPublicOwnerEvidence(f);
 const moved=fixture();moved.runtimeBinding.plan.artifacts[0].producer_task_id='different-owner';rebind(moved);await assert.rejects(collectPublicOwnerEvidence(moved),/RUNTIME_DRIFT/);
 const widened=fixture();widened.runtimeBinding.plan.tasks.find(x=>x.kind==='implementation').write_scope.push('outside.py');rebind(widened);await assert.rejects(collectPublicOwnerEvidence(widened),/RUNTIME_DRIFT/);
 const stale=fixture();stale.runtimeBinding.plan.graph_revision+=':stale';await assert.rejects(collectPublicOwnerEvidence(stale),/RUNTIME_DRIFT/);
});
