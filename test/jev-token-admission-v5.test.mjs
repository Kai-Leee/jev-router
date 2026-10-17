import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {jevModelRegistry} from '../src/jev-model-registry.mjs';
import {assessJevTokenAdmission as assessV4,jevTokenAdmissionPolicy as policyV4} from '../src/orchestration/jev-token-admission-v4.mjs';
import {assessJevTokenAdmission,jevTokenAdmissionPolicy} from '../src/orchestration/jev-token-admission-v5.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const request={model:'jev-latest',state:'Perform the independent tasks.',questions:{route:{type:'choice',instructions:'Choose the existing owner.',criteria:{a:'OwnerA.',b:'OwnerB.'}}}};
function sized(n){const r=structuredClone(request);r.state+='x'.repeat(n-Buffer.byteLength(prepareDecision(r).serialized));return r;}

test('v5 changes the model authority while preserving v4 exact measurements, caps, warnings and request hash',()=>{
 const policy=jevTokenAdmissionPolicy(),registry=jevModelRegistry();
 assert.equal(policy.model_registry_source.sha256,registry.source.sha256);assert.equal(policy.inherited_policy_source.sha256,policyV4().source.sha256);
 assert.equal(assessJevTokenAdmission(request,{stage:'split',observedModel:'typesafe-ai/jev'}).model_context_assumption,null);
 for(const model of registry.request_models)assert.equal(assessJevTokenAdmission({...request,model},{stage:'split'}).inference_allowed,true);
 for(const n of [500,70510,107729,245000,256000])for(const stage of ['split','relations','repair','profiles','repair_owners']){
  const r=sized(n),before=structuredClone(r),a=assessV4(r,{stage}),b=assessJevTokenAdmission(r,{stage,observedModel:'typesafe/jev-1.14-20261014',
   expectedPolicySha256:policy.source.sha256,expectedModelRegistrySha256:registry.source.sha256,expectedRequestSha256:sha(prepareDecision(r).serialized)});
  assert.equal(b.inference_allowed,true);for(const key of ['measurements','estimates','request_sha256','local_caps','limits','operating_limit','warnings','warning_codes','official_validation'])assert.deepEqual(b[key],a[key],key);
  assert.deepEqual(r,before);assert.equal(b.actual_usage,null);assert.equal(b.inference_started,false);assert.equal(b.automatic_retries,0);
  assert.equal(b.provider_acceptance_guaranteed,false);assert.equal(b.model_context_assumption,'1.14.0');
 }
});

test('source/hash/stage/schema/body gates remain mandatory; unknown/future models cannot enter through the new registry',()=>{
 for(const [options,reason] of [[{stage:null},'JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED'],[{stage:'split',expectedRequestSha256:'0'.repeat(64)},'JEV_TOKEN_ADMISSION_REQUEST_CHANGED'],
  [{stage:'split',expectedPolicySha256:policyV4().source.sha256},'JEV_TOKEN_ADMISSION_POLICY_CHANGED'],
  [{stage:'split',expectedModelRegistrySha256:'0'.repeat(64)},'JEV_TOKEN_ADMISSION_MODEL_REGISTRY_CHANGED'],
  [{stage:'split',observedModel:'typesafe/jev-1.14-20261015'},'JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED']]){
  const r=assessJevTokenAdmission(request,options);assert.equal(r.inference_allowed,false);assert(r.reason_codes.includes(reason));
 }
 assert.deepEqual(assessJevTokenAdmission({...request,state:''},{stage:'split'}).reason_codes,['JEV_TOKEN_ADMISSION_INVALID_REQUEST']);
 assert.deepEqual(assessJevTokenAdmission({...sized(256000),state:sized(256000).state+'x'},{stage:'split'}).reason_codes,['JEV_TOKEN_ADMISSION_INVALID_REQUEST']);
 assert(assessJevTokenAdmission({...request,model:'jev-future'},{stage:'split'}).reason_codes.includes('JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED'));
});

test('preserved D087 third request retains its SHA and bytes; v4 rejection becomes explicit v5 admission',{skip:!process.env.D088_D087_ARM},()=>{
 const arm=resolve(process.env.D088_D087_ARM),requestPath=join(arm,'calls/jev-0003.request.json'),priorPath=join(arm,'calls/jev-0003.token-admission.json');
 assert.equal(existsSync(requestPath),true);const r=JSON.parse(readFileSync(requestPath)),prior=JSON.parse(readFileSync(priorPath));
 const input=r.model?r:r.body; assert(input?.questions);const priorBytes=readFileSync(requestPath);
 assert.equal(prior.observed_model,'typesafe/jev-1.14-20261014');assert.equal(prior.inference_allowed,false);
 const result=assessJevTokenAdmission(input,{stage:prior.stage,observedModel:prior.observed_model,expectedRequestSha256:prior.request_sha256,
 expectedPolicySha256:jevTokenAdmissionPolicy().source.sha256,expectedModelRegistrySha256:jevModelRegistry().source.sha256});
 assert.equal(result.inference_allowed,true);assert.deepEqual(result.measurements,prior.measurements);assert.equal(result.request_sha256,prior.request_sha256);
 assert.equal(result.measurements.wire_bytes,107729);assert.deepEqual(readFileSync(requestPath),priorBytes);
 const historical=assessV4(input,{stage:prior.stage,observedModel:prior.observed_model});assert.deepEqual(historical.reason_codes,['JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED']);
});
