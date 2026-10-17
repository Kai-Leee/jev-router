import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {collectPublicOwnerEvidence,applyPublicOwnerEvidenceScope,selectPublicOwnerEvidenceScope,assertPublicOwnerEvidenceCoverage} from '../src/orchestration/adaptive-public-owner-evidence.mjs';
import {loadPublicAuditInputs,inspectPublicMapping,publicAuditConfiguration} from '../scripts/audit-dag-public-checks.mjs';

test('v5 retains93 case IDs, version5 runners and rejects mixed gate versions',()=>{
 const inputs=loadPublicAuditInputs(undefined,{registryPath:'benchmarks/e2e-swe/public-checks/registry.v5.json'});
 assert.equal(inspectPublicMapping(inputs).source_test_count,93);
 assert.ok(inputs.registry.every(row=>row.version==='5'&&row.runner_ref.endsWith('_v5.py')));
 assert.throws(()=>publicAuditConfiguration({registryPath:'benchmarks/e2e-swe/public-checks/registry.v5.json',runnerPath:'benchmarks/e2e-swe/public-checks/run_public_checks_v4.py'}),/INVALID/);
});

test('current public assertion connects producer outside requirement assignment and refuses source tampering',async t=>{
 const root=await mkdtemp(join(tmpdir(),'d095-owner-'));t.after(()=>rm(root,{recursive:true,force:true}));
 await mkdir(join(root,'schema'));await writeFile(join(root,'schema/producer.py'),'# current producer\n');await writeFile(join(root,'consumer.py'),'# current consumer\n');
 const artifacts=[{id:'producer',paths:['schema/producer.py']},{id:'consumer',paths:['consumer.py']}];
 const plan={artifacts:artifacts.map(a=>({...a,producer_task_id:'owner-'+a.id})),tasks:artifacts.map(a=>({id:'owner-'+a.id,kind:'implementation',requirement_ids:[a.id==='producer'?'unrelated':'R04.05'],output_artifact_ids:[a.id],write_scope:a.paths}))};
 const contract={schema_version:'public-assertion-contract/v1',version:'3',assertions:[{id:'public-boundary',check_id:'public.example',test_id:'T.example',artifact_paths:['schema/producer.py','consumer.py','missing.py']}]};
 const source_text=JSON.stringify(contract),sha256=createHash('sha256').update(source_text).digest('hex');
 const assertionContract={contract,source_text,sha256,source_path:'benchmarks/e2e-swe/public-checks/assertions.v3.json'};
 const failure={outcome_uncertain:false,artifact_revisions:{},binding_digest:'binding',public_evidence:[{check_id:'public.example',status:'failed',executed:true,outcome_uncertain:false,evidence:{assertion_contract_sha256:sha256,cases:[{test_id:'T.example',status:'failed',error_type:'AssertionError',message:'public boundary failed',failed_assertion_id:'public-boundary',assertion_results:[{assertion_id:'public-boundary',status:'failed'}]}]}}]};
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
 const digest=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
 const runtimeBinding={schema_version:'dag-filesystem-binding/v1',plan,plan_hash:digest(plan),checker_manifest:[{path:assertionContract.source_path,sha256}],environment:{fingerprint:'env'},artifact_bindings:{}};
 runtimeBinding.binding_digest=digest({pinManifest:runtimeBinding.checker_manifest,environment:runtimeBinding.environment,plan_hash:runtimeBinding.plan_hash,artifact_bindings:{}});failure.binding_digest=runtimeBinding.binding_digest;
 const report=failure.public_evidence[0];report.check_version='5';report.artifact_revisions={};report.runtime_binding={binding_digest:failure.binding_digest,plan_hash:digest(plan),checker_manifest_sha256:digest(runtimeBinding.checker_manifest),environment_fingerprint:'env'};
 report.evidence_key=digest({check_id:report.check_id,check_version:report.check_version,artifact_revisions:{},runtime_binding:report.runtime_binding});
 const planning={plan,catalog:{artifacts}},evidence=await collectPublicOwnerEvidence({planning,failure,candidateDirectory:root,assertionContract,runtimeBinding});
 assert.deepEqual(evidence.required_artifact_ids,['producer','consumer']);
 assert.ok(evidence.links.every(x=>x.basis==='public_assertion_current_path_owner'));
 const original={candidates:[{id:'repair-inferred-owners',artifact_ids:['consumer'],task_ids:['owner-consumer'],read_artifact_ids:[],owner_inference_id:'inference'}],analysis:{inferred_ownership:{sha256:'old',proof:{answers:{}},choice_bindings:{}},causal:{sha256:'old',chains:[],choice_bindings:{}}}};
 const selected=selectPublicOwnerEvidenceScope(applyPublicOwnerEvidenceScope(original,{plan,evidence,failure}));
 assert.deepEqual(selected.candidate.artifact_ids,['producer','consumer']);
 assert.throws(()=>assertPublicOwnerEvidenceCoverage(original.candidates[0],evidence),/OMITTED/);
 await assert.rejects(collectPublicOwnerEvidence({planning,failure,candidateDirectory:root,runtimeBinding,assertionContract:{...assertionContract,source_text:source_text+'x'}}),/SOURCE_DRIFT/);
 const stale=structuredClone(failure);stale.public_evidence[0].evidence.assertion_contract_sha256='0'.repeat(64);
 assert.deepEqual((await collectPublicOwnerEvidence({planning,failure:stale,candidateDirectory:root,assertionContract,runtimeBinding})).required_artifact_ids,[]);
 const staleRevision=structuredClone(failure);staleRevision.artifact_revisions={producer:'changed'};
 assert.deepEqual((await collectPublicOwnerEvidence({planning,failure:staleRevision,candidateDirectory:root,assertionContract,runtimeBinding})).required_artifact_ids,[]);
});
