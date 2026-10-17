import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync} from 'node:fs';
import {join, resolve, dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {jevModelRegistry, JEV_OBSERVED_MODEL_LABELS, isJevSettlementModel, isJevRequestedModel,
  resolveJevObservedModel, validateJevModelRegistry} from '../src/jev-model-registry.mjs';
import {createTokenBudget, JEV_SETTLEMENT_MODELS} from '../src/benchmark/budget.mjs';
import {assessJevTokenAdmission} from '../src/orchestration/jev-token-admission-v5.mjs';

const body = {model:'jev-latest',state:'Route these independent tasks.',questions:{route:{type:'choice',
 instructions:'Choose the implementation owner.',criteria:{a:'WorkerA.',b:'WorkerB.'}}}};
const labels = ['jev-1.13.0','typesafe/jev-1.13-20260917','typesafe-ai/jev','typesafe/jev-1.14-20261014'];
const response = model => ({model,usage:{input_tokens:10,output_tokens:2},
 billing:{mode:'tokens',modelMultiplier:'1',creditsCharged:'0',paidInputTokensUsed:'10',runId:'fixture-provider-id'},
 receipt:{method:'POST',destination:'https://jev-ai.pro/api/v1/systemone',status:200,durationMs:1,automaticRetries:0}});
const config = path => ({schema_version:'jev-token-budget/v4',ledger_path:path,max_input_tokens:null,reserve_input_tokens:65536});
const ids = {request_id:'request',run_id:'run',attempt_id:'attempt',group_id:'group'};
const balances = {paidInputTokensRemaining:1e6,tokensReserved:0,tokenDebt:0,spending_frozen:false};

test('one registry supplies exactly four admission and settlement labels; alias provenance never invents revision',()=>{
 assert.deepEqual(JEV_OBSERVED_MODEL_LABELS,labels); assert.deepEqual(JEV_SETTLEMENT_MODELS,labels);
 assert.equal(resolveJevObservedModel('typesafe-ai/jev').version,null);
 assert.equal(resolveJevObservedModel('typesafe/jev-1.14-20261014').version,'1.14.0');
 const copy=jevModelRegistry();copy.observed_models.push({...copy.observed_models[0],label:'future'});
 assert.equal(isJevSettlementModel('future'),false);
 for(const requested of ['jev-latest','jev-preview','jev-1.13.0','jev-1.14.0'])assert.equal(isJevRequestedModel(requested),true);
});

test('admission and native budget agree for all observed labels, rejecting future dates and prefix variants',()=>{
 for(const model of [...labels,'typesafe/jev-1.14-20261015','typesafe/jev-1.14-20261014-extra','jev-latest','jev-1.14.0','unknown']){
  const accepted=labels.includes(model), admission=assessJevTokenAdmission(body,{stage:'split',observedModel:model});
  assert.equal(admission.inference_allowed,accepted,model);assert.equal(isJevSettlementModel(model),accepted);
  const dir=mkdtempSync(join(tmpdir(),'d088-budget-'));let b;
  try{b=createTokenBudget(config(join(dir,'ledger.json')));const id=b.reserve(ids,balances,{leaseMs:10000});
   if(accepted){const after=b.settle(id,response(model));assert.equal(after.charged_input_tokens,10);assert.equal(after.reservations_pending,0);}
   else{assert.throws(()=>b.settle(id,response(model)),{code:'BUDGET_MODEL_UNSUPPORTED'});assert.equal(b.snapshot().charged_input_tokens,0);assert.equal(b.snapshot().reservations_pending,1);}
  }finally{b?.close();rmSync(dir,{recursive:true,force:true});}
 }
});

test('registry validator rejects duplicates, inferred alias revision and unsupported billing policy',()=>{
 for(const corrupt of [v=>v.observed_models.push(v.observed_models[0]),v=>v.observed_models[2].version='1.14.0',
  v=>v.observed_models[0].billing_multiplier='2',v=>v.observed_models[0].provenance_source_ids=['absent'],v=>v.request_models.push(v.request_models[0])]){
  const value=jevModelRegistry();corrupt(value);assert.throws(()=>validateJevModelRegistry(value),{code:'JEV_MODEL_REGISTRY_INVALID'});
 }
});

test('on-disk registry mutation blocks both admission and native settlement after module load',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'d088-source-'));
 try{
  const inheritedFiles = ['src/client.mjs','src/config.mjs','src/orchestration/jev-token-admission.mjs',
    ...[2,3,4,5].map(v=>`src/orchestration/jev-token-admission-v${v}.mjs`),
    ...[1,2,3,4,5].map(v=>`docs/orchestration/contracts/jev-token-admission.v${v}.json`)];
  for(const file of ['src/jev-model-registry.mjs','docs/orchestration/contracts/jev-models.v1.json','src/benchmark/budget.mjs',...inheritedFiles]){
   mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),readFileSync(resolve(file)));
  }
  const loader=await import(pathToFileURL(join(dir,'src/jev-model-registry.mjs')).href);
  const budgetModule=await import(pathToFileURL(join(dir,'src/benchmark/budget.mjs')).href);
  const admissionModule=await import(pathToFileURL(join(dir,'src/orchestration/jev-token-admission-v5.mjs')).href);
  assert.equal(admissionModule.assessJevTokenAdmission(body,{stage:'split',observedModel:labels[3]}).inference_allowed,true);
  const b=budgetModule.createTokenBudget(config(join(dir,'ledger.json')));try{
   const reservation=b.reserve(ids,balances,{leaseMs:10000});
   writeFileSync(join(dir,'docs/orchestration/contracts/jev-models.v1.json'),JSON.stringify({...loader.jevModelRegistry(),changed:true}));
   assert.throws(()=>loader.assertJevModelRegistrySource(),{code:'JEV_MODEL_REGISTRY_SOURCE_CHANGED'});
   const denied=admissionModule.assessJevTokenAdmission(body,{stage:'split',observedModel:labels[3]});
   assert.equal(denied.inference_allowed,false);assert(denied.reason_codes.includes('JEV_TOKEN_ADMISSION_MODEL_REGISTRY_CHANGED'));
   assert.throws(()=>b.settle(reservation,response(labels[0])),{code:'BUDGET_INVALID_SETTLEMENT'});
   assert.equal(b.snapshot().charged_input_tokens,0);assert.equal(b.snapshot().reservations_pending,1);
  }finally{b.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
