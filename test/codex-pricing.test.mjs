import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {codexReferencePricing,codexPricingContract,assertCodexPricingSource,codexPricingTraceDetails,summarizeCodexReferencePricing} from '../src/benchmark/codex-pricing.mjs';
import {runCodexAttempt} from '../src/benchmark/codex-provider.mjs';
import {summarizeCodexE2EUsage} from '../src/benchmark/codex-e2e-decisions.mjs';
import {createFrozenCodexEnvironment} from '../src/benchmark/codex-environment.mjs';
const usage={input_tokens:100,cached_input_tokens:60,output_tokens:12};
const price=extra=>codexReferencePricing({requestedModel:'gpt-6.1-sol',usage,...extra});
const near=(a,b)=>assert(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const stream=JSON.stringify({type:'turn.completed',usage})+'\n';

test('exact6.1 Standard rates and subset-cache arithmetic are independent of Batch/Flex and actual billing',()=>{
 const p=price();near(p.short_standard.usd,(40*2+60*.1+12*10)/1e6);near(p.long_standard.usd,(40*4+60*.2+12*15)/1e6);
 assert.equal(p.usage_basis.total_tokens,112);assert.equal(p.usage_basis.cache_write_tokens,null);
 assert.equal(p.short_standard.assumptions.cache_write_basis,'not_reported_assumed_zero_for_this_scenario');
 assert.equal(p.strict_api_equivalent_usd,null);assert.equal(p.actual_billed_usd,null);
 assert.equal(p.monthly_subscription_allocation_usd,null);assert.equal(p.requested_model,'gpt-6.1-sol');
 assert.equal(codexPricingContract().models[0].scenarios.short_standard.usd_per_million.input,2);
});

test('cache-write is an input subset with its own replacement rate; it is never added to input totals',()=>{
 const p=price({usage:{...usage,cache_write_tokens:10}});
 near(p.short_standard.usd,(30*2+60*.1+10*2.5+12*10)/1e6);
 assert.equal(p.usage_basis.total_tokens,112);assert.equal(p.usage_basis.cache_write_tokens,10);
 near(p.short_standard.usd_if_all_non_cached_input_are_cache_writes,(60*.1+40*2.5+12*10)/1e6);
 assert.equal(p.strict_api_equivalent_usd,null);
});

test('unregistered model, missing usage/cache and impossible buckets produce null rather than another model price or zero',()=>{
 for(const extra of [{requestedModel:'gpt-5.6-sol'},{requestedModel:'unknown'}, {usage:null},{usageComplete:false},
  {usage:{input_tokens:100,output_tokens:12}},{usage:{...usage,cached_input_tokens:101}},
  {usage:{...usage,cache_write_tokens:41}},{usage:{...usage,cache_write_tokens:-1}}]){
  const p=price(extra);assert.equal(p.short_standard.usd,null);assert.equal(p.long_standard.usd,null);assert.notEqual(p.reason,null);
 }
 const zero=price({usage:{input_tokens:0,cached_input_tokens:0,output_tokens:0}});assert.equal(zero.short_standard.usd,0);
});

test('multiple native turns expose cache-write only when complete and never select context tier from aggregate input',()=>{
 const text=[180000,180000].map(input_tokens=>JSON.stringify({type:'turn.completed',usage:{input_tokens,cached_input_tokens:0,output_tokens:1,cache_write_tokens:100}})).join('\n');
 const details=codexPricingTraceDetails(text);assert.equal(details.cache_write_tokens,200);assert.equal(details.turns.length,2);
 const p=price({usage:{input_tokens:360000,cached_input_tokens:0,output_tokens:2},traceDetails:details});
 assert.equal(p.short_standard.assumptions.context,'short');assert.equal(p.long_standard.assumptions.context,'long');
 assert.equal(p.strict_api_equivalent_usd,null);
 assert.equal(codexPricingTraceDetails(stream).cache_write_tokens,null);
});

test('pricing contract source substitution is detected without changing original source or calling a provider',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'codex-price-source-'));try{
  for(const file of ['src/benchmark/codex-pricing.mjs','docs/orchestration/contracts/codex-pricing.v1.json']){
   mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),readFileSync(resolve(file)));
  }
  const local=await import(pathToFileURL(join(dir,'src/benchmark/codex-pricing.mjs')).href);
  assert.equal(local.assertCodexPricingSource().sha256,codexPricingContract().source.sha256);
  writeFileSync(join(dir,'docs/orchestration/contracts/codex-pricing.v1.json'),'{}');
  assert.throws(()=>local.assertCodexPricingSource(),{code:'CODEX_PRICING_CONTRACT_CHANGED'});
  assert.throws(()=>local.codexReferencePricing({requestedModel:'gpt-6.1-sol',usage}),{code:'CODEX_PRICING_CONTRACT_CHANGED'});
  assert.throws(()=>assertCodexPricingSource('0'.repeat(64)),{code:'CODEX_PRICING_CONTRACT_CHANGED'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});

function setup(t){const dir=mkdtempSync(join(tmpdir(),'d090-provider-price-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 return{dir,cwd:dir,out:join(dir,'attempt'),prompt:'Answer using the supplied options.',schema:{},model:'gpt-6.1-sol',effort:'high',spend:true,validateAnswer:()=>true};}
const run=async(_cmd,args,options)=>{options.onStdout(stream);writeFileSync(args[args.indexOf('--output-last-message')+1],'{}');return{stdout:stream,exit_code:0,outcome_uncertain:false};};

test('provider opt-in adds references while preserving legacy unknown actual and API-equivalent fields',async t=>{
 const a=setup(t),legacy=await runCodexAttempt({...a,run});assert.equal('reference_pricing'in legacy.receipt,false);
 const b=setup(t),enabled=await runCodexAttempt({...b,referencePricing:true,run});
 assert.equal(enabled.receipt.reference_pricing.status,'reference_scenarios_only');assert.equal(enabled.receipt.api_equivalent_usd,null);
 assert.equal(enabled.receipt.actual_billed_usd,null);assert.equal(enabled.receipt.usage.total_tokens,112);
});

test('reference aggregation retains unknown full totals when a Codex row is unpriced; Jev remains separately accounted',()=>{
 const good={provider:'codex',status:'completed',process_submitted:true,usage,reference_pricing:price()};
 const jev={provider:'jev',status:'completed',inference_started:true,usage:{input_tokens:200,output_tokens:10},api_equivalent_usd:.00012};
 const a=summarizeCodexE2EUsage([good,jev]);near(a.total.reference_pricing.short_standard.usd,price().short_standard.usd);
 assert.equal(a.total.reference_pricing.codex_started_calls,1);assert.equal(a.total.api_equivalent_usd,null);
 const b=summarizeCodexReferencePricing([good,{...good,reference_pricing:undefined}]);assert.equal(b.short_standard.usd,null);
 near(b.short_standard.known_subtotal_usd,price().short_standard.usd);assert.equal(b.short_standard.known_calls,1);assert.equal(b.short_standard.total_calls,2);
 assert.equal('reference_pricing'in summarizeCodexE2EUsage([{...good,reference_pricing:undefined}]).total,false);
});

test('post-dispatch app drift remains uncertain with native usage preserved, while pre-dispatch drift is known failed',async t=>{
 for(const when of ['before','after']){
  const f=setup(t),auth=join(f.dir,'source-auth');mkdirSync(auth);writeFileSync(join(auth,'auth.json'),'PRIVATE_FIXTURE_AUTH');
  const env=await createFrozenCodexEnvironment({command:process.execPath,sourceCodexHome:auth,discover:async({account})=>({skills:[],auth:account?{type:'chatgpt',logged_in:true}:null,
    models:account?[{model:'gpt-6.1-sol',supported_reasoning_efforts:['high']}]:null})});
  try{let dispatched=false;env.verify=async()=>{if(when==='before'||dispatched)throw Object.assign(new Error('CODEX_APP_BINARY_DRIFT'),{code:'CODEX_APP_BINARY_DRIFT',outcome_uncertain:true});};
   await assert.rejects(runCodexAttempt({...f,cliEnvironment:env,referencePricing:true,run:async(...args)=>{dispatched=true;return run(...args);}}),{code:'CODEX_APP_BINARY_DRIFT'});
   const receipt=JSON.parse(readFileSync(join(f.out,'receipt.json')));assert.equal(receipt.status,when==='after'?'uncertain':'failed');
   assert.equal(receipt.process_submitted,when==='after');assert.equal(receipt.automatic_retries,0);
   assert.equal(receipt.usage?.total_tokens??null,when==='after'?112:null);
  }finally{env.close();}
 }
});


test('partial cache-write observations retain known writes; malformed reported writes cannot become unknown-zero pricing',()=>{
 const first=JSON.stringify({type:'turn.completed',usage:{input_tokens:50,cached_input_tokens:20,output_tokens:6,cache_write_tokens:10}});
 const second=JSON.stringify({type:'turn.completed',usage:{input_tokens:50,cached_input_tokens:40,output_tokens:6}});
 const details=codexPricingTraceDetails(first+'\n'+second);assert.equal(details.cache_write_tokens,null);assert.equal(details.known_cache_write_tokens,10);
 const p=price({traceDetails:details});near(p.short_standard.usd,(30*2+60*.1+10*2.5+12*10)/1e6);
 assert.equal(p.short_standard.assumptions.cache_write_basis,'partially_reported_remainder_assumed_zero_for_scenario');
 const invalid=codexPricingTraceDetails(JSON.stringify({type:'turn.completed',usage:{...usage,cache_write_tokens:-1}}));
 assert.equal(price({traceDetails:invalid}).short_standard.usd,null);
});
