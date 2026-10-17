import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {claudePricingContract,assertClaudePricingSource,claudePricingProfileEvidence,claudeReferencePricing,
 claudeReferencePrice,summarizeClaudeReferencePricing} from '../src/benchmark/claude-pricing.mjs';
const models=['claude-opus-5-5','claude-fable-5-1','claude-sonnet-5-5','claude-haiku-5-5'];
const usage={input_tokens:100,cache_read_input_tokens:600,cache_creation_input_tokens:300,output_tokens:200,
 cache_creation:{ephemeral_5m_input_tokens:100,ephemeral_1h_input_tokens:200},output_tokens_details:{thinking_tokens:50}};
const near=(a,b)=>assert(Math.abs(a-b)<1e-12,`${a} != ${b}`);
const price=(model=models[0],overrides={})=>claudeReferencePricing({requestedModel:model,usage,...overrides});

test('exact four documented models and five efforts are separate from unverified account availability',()=>{
 const c=claudePricingContract();assert.deepEqual(c.models.map(x=>x.model),models);
 assert.equal(c.schema_version,'claude-reference-pricing/v1');assert.match(c.source.sha256,/^[a-f0-9]{64}$/);
 for(const model of models){const p=claudePricingProfileEvidence(model);assert(p.priced);
  assert.deepEqual(p.capabilities.supported_reasoning_efforts,['low','medium','high','xhigh','max']);
  assert.equal(p.capabilities.context_window_tokens,1000000);assert.equal(p.capabilities.max_output_tokens,128000);
  assert.equal(p.capabilities.parameter_count,null);assert(p.source_refs.every(x=>x.sha256&&x.url.startsWith('https://')));
 }
 assert.equal(claudePricingProfileEvidence('opus').priced,false);
 assert.equal(claudePricingProfileEvidence('claude-opus-5-5-future').scenarios,null);
 c.models[0].scenarios.short_standard.usd_per_million.input=999;
 assert.equal(claudePricingContract().models[0].scenarios.short_standard.usd_per_million.input,4);
});

test('disjoint native input, cache read and both TTL writes use own rates; thinking and TTL subsets are not added',()=>{
 const rates=[[4,.2,5,8,20],[10,.25,12.5,20,50],[2,.1,2.5,4,10],[.1,.01,.125,.2,.5]];
 for(const [i,model]of models.entries()){
  const p=price(model),[input,read,five,hour,output]=rates[i];
  near(p.short_standard.usd,(100*input+600*read+100*five+200*hour+200*output)/1e6);
  assert.equal(p.usage_basis.input_tokens,1000);assert.equal(p.usage_basis.total_tokens,1200);
  assert.equal(p.usage_basis.uncached_input_tokens,100);assert.equal(p.usage_basis.cache_creation_tokens,300);
  assert.equal(p.strict_api_equivalent_usd,null);assert.equal(p.actual_billed_usd,null);
  assert.equal(p.monthly_subscription_allocation_usd,null);near(p.observed_standard.usd,p.short_standard.usd);
  if(i<3)near(p.long_standard.usd,p.short_standard.usd);
 }
 near(price(models[3]).long_standard.usd,5*price(models[3]).short_standard.usd);
 assert.deepEqual(claudeReferencePrice({model:models[0],usage}),price());
});

test('explicit nativeUsage prevents normalized inclusive input from being double-counted',()=>{
 const normalized={input_tokens:1000,cached_input_tokens:600,cache_creation_tokens:300,output_tokens:200,total_tokens:1200};
 const p=price(models[0],{usage:normalized,nativeUsage:usage});near(p.short_standard.usd,price().short_standard.usd);
 assert.equal(p.usage_basis.total_tokens,1200);
 assert.equal(price(models[0],{usage:normalized}).reason,'CLAUDE_PRICING_NATIVE_USAGE_INVALID');
});

test('missing/incomplete/invalid usage and unknown model remain null rather than zero or fallback',()=>{
 for(const invalid of [null,{}, {...usage,input_tokens:-1},{...usage,cache_read_input_tokens:null},
  {...usage,cache_creation_input_tokens:undefined},{...usage,output_tokens:1.5}]){
  const p=price(models[0],{usage:invalid});assert.equal(p.short_standard.usd,null);
  assert.equal(p.short_standard.usd_if_all_cache_writes_5m,null);
  assert.equal(p.reason,'CLAUDE_PRICING_NATIVE_USAGE_INVALID');
 }
 assert.equal(price(models[0],{usageComplete:false}).reason,'CLAUDE_PRICING_USAGE_INCOMPLETE');
 assert.equal(price('claude-opus-5-5-future').reason,'CLAUDE_PRICING_MODEL_UNREGISTERED');
 const zero={input_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0,output_tokens:0};
 assert.equal(price(models[0],{usage:zero}).short_standard.usd,0);
});

test('unknown TTL stays unknown and exposes explicit all-5m/all-1h bounds; inconsistent TTL invalidates pricing',()=>{
 const noTTL={...usage};delete noTTL.cache_creation;
 const p=price(models[0],{usage:noTTL});assert.equal(p.short_standard.usd,null);assert.equal(p.observed_standard.usd,null);
 near(p.short_standard.usd_if_all_cache_writes_5m,(100*4+600*.2+300*5+200*20)/1e6);
 near(p.short_standard.usd_if_all_cache_writes_1h,(100*4+600*.2+300*8+200*20)/1e6);
 assert(p.unknown_actual_pricing_fields.includes('cache_write_ttl'));
 for(const cache_creation of [{ephemeral_5m_input_tokens:300},{ephemeral_5m_input_tokens:100,ephemeral_1h_input_tokens:201},
  {ephemeral_5m_input_tokens:-1,ephemeral_1h_input_tokens:301}]){
  const bad=price(models[0],{usage:{...usage,cache_creation}});assert.equal(bad.reason,'CLAUDE_PRICING_CACHE_TTL_INVALID');
  assert.equal(bad.short_standard.usd_if_all_cache_writes_1h,null);
 }
});

test('Haiku tier is per request including cache; iterations are verified subsets, not extra tokens',()=>{
 const request=(input,read)=>({input_tokens:input,cache_read_input_tokens:read,cache_creation_input_tokens:0,output_tokens:20});
 const a=request(10000,90000),b=request(10000,90001);
 const aggregate={input_tokens:20000,cache_read_input_tokens:180001,cache_creation_input_tokens:0,output_tokens:40,iterations:[a,b]};
 const p=price(models[3],{usage:aggregate});
 near(p.observed_standard.usd,(10000*.1+90000*.01+20*.5+10000*.5+90001*.05+20*2.5)/1e6);
 assert.equal(p.usage_basis.total_tokens,200041);assert.equal(p.observed_standard.complete_request_iterations,true);
 assert.equal(p.observed_standard.basis,'complete_per_request_iterations');
 const noIterations={...aggregate};delete noIterations.iterations;
 assert.equal(price(models[3],{usage:noIterations}).observed_standard.usd,null);
 assert(price(models[3],{usage:noIterations}).unknown_actual_pricing_fields.includes('per_request_context_regime'));
 const invalidIterations={...aggregate,iterations:[a,{...b,output_tokens:21}]};
 assert.equal(price(models[3],{usage:invalidIterations}).observed_standard.usd,null);
});

test('aggregation includes every started Claude call exactly once and preserves missing reference uncertainty',()=>{
 const rows=models.map(model=>({provider:'claude',requested_model:model,status:'completed',process_submitted:true,reference_pricing:price(model)}));
 rows.push({provider:'jev',status:'completed',process_submitted:true,reference_pricing:price()});
 rows.push({provider:'claude',status:'failed',process_submitted:false});
 const summary=summarizeClaudeReferencePricing(rows);assert.equal(summary.claude_started_calls,4);
 near(summary.short_standard.usd,models.reduce((n,model)=>n+price(model).short_standard.usd,0));
 assert.equal(summary.short_standard.total_calls,4);assert.deepEqual(Object.keys(summary.models),models);
 const missing=summarizeClaudeReferencePricing([...rows,{provider:'claude',status:'uncertain',process_submitted:true,requested_model:models[0]}]);
 assert.equal(missing.short_standard.usd,null);assert.equal(missing.short_standard.known_calls,4);
 assert.equal(missing.short_standard.total_calls,5);near(missing.short_standard.known_subtotal_usd,summary.short_standard.usd);
 assert.equal(missing.actual_billed_usd,null);
});

test('source pin rejects requested/current drift, while captured historical contracts remain unchanged',async()=>{
 assert.throws(()=>assertClaudePricingSource('0'.repeat(64)),{code:'CLAUDE_PRICING_CONTRACT_CHANGED'});
 const c=claudePricingContract();for(const item of c.historical_preservation_baseline){
  assert.equal(createHash('sha256').update(readFileSync(resolve(item.path))).digest('hex'),item.sha256);
 }
 const dir=mkdtempSync(join(tmpdir(),'d093-claude-pricing-'));
 try{
  for(const file of ['src/benchmark/claude-pricing.mjs',c.source.path]){
   mkdirSync(dirname(join(dir,file)),{recursive:true});writeFileSync(join(dir,file),readFileSync(resolve(file)));
  }
  const isolated=await import(pathToFileURL(join(dir,'src/benchmark/claude-pricing.mjs')).href);
  writeFileSync(join(dir,c.source.path),'{}');
  assert.throws(()=>isolated.assertClaudePricingSource(),{code:'CLAUDE_PRICING_CONTRACT_CHANGED'});
  assert.throws(()=>isolated.claudeReferencePricing({requestedModel:models[0],usage}),{code:'CLAUDE_PRICING_CONTRACT_CHANGED'});
 }finally{rmSync(dir,{recursive:true,force:true});}
});
