import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {codexPricingContract,assertCodexPricingSource,codexPricingProfileEvidence,codexReferencePricing,
 summarizeCodexReferencePricing} from '../src/benchmark/codex-pricing.mjs';
import {runCodexAttempt} from '../src/benchmark/codex-provider.mjs';
import {summarizeCodexE2EUsage,codexE2EDecisionStageAllowed} from '../src/benchmark/codex-e2e-decisions.mjs';
const names=['gpt-6.1-sol','gpt-6-sol','gpt-6-luna','gpt-6-astra'];
const usage={input_tokens:1000,cached_input_tokens:600,cache_write_tokens:100,output_tokens:200};
const near=(a,b)=>assert(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const price=model=>codexReferencePricing({requestedModel:model,usage,pricingVersion:'v2'});

test('v2 adds exactly four documented high candidates and preserves immutable v1 rates and default registration',()=>{
 const v1=codexPricingContract(),v2=codexPricingContract({version:'v2'});
 assert.equal(v1.schema_version,'codex-reference-pricing/v1');assert.equal(v2.schema_version,'codex-reference-pricing/v2');
 assert.deepEqual(v2.models.map(x=>x.model),names);assert.equal(v2.inherits.sha256,v1.source.sha256);
 assert.deepEqual(v2.models[0].scenarios,v1.models[0].scenarios);
 assert.equal(codexReferencePricing({requestedModel:'gpt-6-luna',usage}).short_standard.usd,null);
 for(const model of names){const p=codexPricingProfileEvidence(model,{policy:'v2'});assert.equal(p.priced,true);
  assert(p.capabilities.supported_reasoning_efforts.includes('high'));assert.equal(p.capabilities.max_input_tokens,922000);
  assert.equal(p.capabilities.context_window_tokens,1050000);assert.equal(p.capabilities.max_output_tokens,128000);
  assert.equal(p.capabilities.parameter_count,null);assert(p.source_refs.some(x=>x.url.endsWith('/'+model+'.md')));
 }
 assert.equal(codexPricingProfileEvidence('gpt-future',{policy:'v2'}).priced,false);
 assert.equal(codexPricingProfileEvidence('gpt-future',{policy:'v2'}).scenarios,null);
 assert.throws(()=>codexPricingContract({version:'future'}),{code:'CODEX_PRICING_VERSION_UNSUPPORTED'});
});

test('all four models use their own Standard cache/read/write/output rates with no fallback',()=>{
 const expected={
  'gpt-6.1-sol':[[2,.1,2.5,10],[4,.2,5,15]],'gpt-6-sol':[[2,.2,2.5,10],[4,.4,5,15]],
  'gpt-6-luna':[[.1,.01,.125,.5],[.2,.02,.25,.75]],'gpt-6-astra':[[10,1,12.5,50],[20,2,25,75]]};
 for(const [model,rates] of Object.entries(expected)){
  const p=price(model);for(const [i,key]of['short_standard','long_standard'].entries()){
   const [input,read,write,output]=rates[i];near(p[key].usd,(300*input+600*read+100*write+200*output)/1e6);
  }
  assert.equal(p.schema_version,'codex-reference-pricing-result/v2');assert.equal(p.actual_billed_usd,null);
  assert.equal(p.strict_api_equivalent_usd,null);assert.equal(p.usage_basis.total_tokens,1200);
 }
 assert(price('gpt-6-sol').short_standard.usd>price('gpt-6.1-sol').short_standard.usd);
 const bad=codexReferencePricing({requestedModel:'gpt-6-sol-extra',usage,pricingVersion:'v2'});
 assert.equal(bad.short_standard.usd,null);assert.equal(bad.reason,'CODEX_PRICING_MODEL_UNREGISTERED');
});

test('v2 current source and inherited v1 source hashes gate profile selection and pricing',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'d091-price-source-'));try{
  for(const file of ['src/benchmark/codex-pricing.mjs','docs/orchestration/contracts/codex-pricing.v1.json','docs/orchestration/contracts/codex-pricing.v2.json']){
   mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),readFileSync(resolve(file)));
  }
  const module=await import(pathToFileURL(join(dir,'src/benchmark/codex-pricing.mjs')).href);
  assert.equal(module.codexPricingContract({version:'v2'}).source.sha256,codexPricingContract({version:'v2'}).source.sha256);
  writeFileSync(join(dir,'docs/orchestration/contracts/codex-pricing.v2.json'),'{}');
  assert.throws(()=>module.codexPricingProfileEvidence(names[0],{policy:'v2'}),{code:'CODEX_PRICING_CONTRACT_CHANGED'});
  assert.throws(()=>assertCodexPricingSource('0'.repeat(64),{version:'v2'}),{code:'CODEX_PRICING_CONTRACT_CHANGED'});
  // Historical v1 pricing is not changed by a v2 drift.
  assert.equal(module.codexReferencePricing({requestedModel:names[0],usage}).status,'reference_scenarios_only');
  writeFileSync(join(dir,'docs/orchestration/contracts/codex-pricing.v2.json'),readFileSync(resolve('docs/orchestration/contracts/codex-pricing.v2.json')));
  writeFileSync(join(dir,'docs/orchestration/contracts/codex-pricing.v1.json'),'{}');
  assert.throws(()=>module.assertCodexPricingSource(null,{version:'v2'}),{code:'CODEX_PRICING_CONTRACT_CHANGED'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('mixed requested models aggregate exact per-model references; unpriced calls invalidate full totals',()=>{
 const rows=names.map(model=>({provider:'codex',requested_model:model,status:'completed',process_submitted:true,usage,reference_pricing:price(model)}));
 const out=summarizeCodexE2EUsage(rows);assert.equal(out.total.total_tokens,4800);
 assert.equal(out.total.reference_pricing.schema_version,'codex-reference-pricing-summary/v2');
 assert.deepEqual(Object.keys(out.total.reference_pricing.models),names);
 near(out.total.reference_pricing.short_standard.usd,names.reduce((n,m)=>n+price(m).short_standard.usd,0));
 for(const model of names)near(out.total.reference_pricing.models[model].short_standard.usd,price(model).short_standard.usd);
 const missing=summarizeCodexReferencePricing([...rows,{provider:'codex',status:'uncertain',process_submitted:true,requested_model:names[0],usage:null}]);
 assert.equal(missing.short_standard.usd,null);assert.equal(missing.short_standard.known_calls,4);assert.equal(missing.short_standard.total_calls,5);
 assert.equal(missing.strict_api_equivalent_usd,null);
});

test('provider v2 opt-in uses requested candidate rates and leaves true/default v1 behavior intact',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'d091-price-provider-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const run=async(_cmd,args,options)=>{const stdout=JSON.stringify({type:'turn.completed',usage})+'\n';options.onStdout(stdout);
  writeFileSync(args[args.indexOf('--output-last-message')+1],'{}');return{stdout,exit_code:0,outcome_uncertain:false};};
 const base={cwd:dir,prompt:'Answer from supplied criteria.',schema:{},effort:'high',spend:true,validateAnswer:()=>true,run};
 const v2=await runCodexAttempt({...base,out:join(dir,'v2'),model:'gpt-6-luna',referencePricing:'v2'});
 assert.equal(v2.receipt.reference_pricing.schema_version,'codex-reference-pricing-result/v2');near(v2.receipt.reference_pricing.short_standard.usd,price('gpt-6-luna').short_standard.usd);
 assert.equal(v2.receipt.api_equivalent_usd,null);assert.equal(v2.receipt.actual_billed_usd,null);
 const legacy=await runCodexAttempt({...base,out:join(dir,'v1'),model:'gpt-6.1-sol',referencePricing:true});
 assert.equal(legacy.receipt.reference_pricing.schema_version,'codex-reference-pricing-result/v1');
 assert.equal(legacy.receipt.reference_pricing.contract_source.path,'docs/orchestration/contracts/codex-pricing.v1.json');
 const saved=JSON.parse(readFileSync(join(dir,'v2/request.json')));assert.equal(saved.reference_pricing_contract.path,'docs/orchestration/contracts/codex-pricing.v2.json');
});

test('profiles checkpoint is allowed only for explicit Jev model-size routing metadata',()=>{
 const manifest={codex_execution:{worker_routing:'jev-model-size-v1'}},metadata={stage:'profiles',profile_kind:'codex-worker-v1'};
 assert.equal(codexE2EDecisionStageAllowed({provider:'jev',manifest,metadata}),true);
 for(const bad of [{provider:'codex',manifest,metadata},{provider:'jev',manifest:{},metadata},
  {provider:'jev',manifest,metadata:{stage:'profiles'}},{provider:'jev',manifest,metadata:{...metadata,profile_kind:'other'}}])
  assert.equal(codexE2EDecisionStageAllowed(bad),false);
 for(const stage of ['split','relations','repair_owners','repair'])for(const provider of ['codex','jev'])
  assert.equal(codexE2EDecisionStageAllowed({provider,manifest:{},metadata:{stage}}),true);
});
