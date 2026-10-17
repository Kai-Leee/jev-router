import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const path='docs/orchestration/contracts/claude-pricing.v1.json';
const url=new URL(`../../${path}`,import.meta.url),raw=readFileSync(url),contract=JSON.parse(raw);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const source=Object.freeze({path,sha256:sha(raw)});
const integer=n=>Number.isSafeInteger(n)&&n>=0;
const finite=n=>Number.isFinite(n)&&n>=0;
const fail=code=>{throw Object.assign(new Error(code),{code});};
const buckets=['input_tokens','cache_read_input_tokens','cache_creation_input_tokens','output_tokens'];
if(contract.schema_version!=='claude-reference-pricing/v1'||contract.currency!=='USD'
 ||contract.unit!=='per_million_tokens'||!Array.isArray(contract.models)||contract.models.length!==4
 ||new Set(contract.models.map(row=>row.model)).size!==contract.models.length
 ||contract.models.some(row=>!row.model||!row.capabilities?.supported_reasoning_efforts?.includes('high')
  ||!row.source_refs?.length||!['short_standard','long_standard'].every(key=>row.scenarios?.[key]?.service_tier==='standard'
    &&['input','cached_input','cache_write','cache_write_1h','output'].every(k=>finite(row.scenarios[key].usd_per_million?.[k])))))
 fail('CLAUDE_PRICING_CONTRACT_INVALID');

export function claudePricingContract(){return {...structuredClone(contract),source:{...source}};}
export function assertClaudePricingSource(expectedSHA=null){
 if(expectedSHA!==null&&expectedSHA!==source.sha256||sha(readFileSync(url))!==source.sha256)
  fail('CLAUDE_PRICING_CONTRACT_CHANGED');
 return {...source};
}
export function claudePricingProfileEvidence(model){
 assertClaudePricingSource();const row=contract.models.find(x=>x.model===model);
 return {model,priced:Boolean(row),scenarios:row?structuredClone(row.scenarios):null,
  capabilities:row?structuredClone(row.capabilities):null,source:{...source},
  source_refs:row?structuredClone(row.source_refs):[],reason:row?null:'CLAUDE_PRICING_MODEL_UNREGISTERED'};
}

function nativeBuckets(usage){
 if(!usage||!buckets.every(k=>integer(usage[k])))return null;
 const total=buckets.reduce((n,k)=>n+usage[k],0);
 const input=usage.input_tokens+usage.cache_read_input_tokens+usage.cache_creation_input_tokens;
 if(!integer(total)||!integer(input))return null;
 const writes=usage.cache_creation_input_tokens;
 const five=usage.cache_creation?.ephemeral_5m_input_tokens;
 const hour=usage.cache_creation?.ephemeral_1h_input_tokens;
 const detailsPresent=five!==undefined||hour!==undefined;
 const ttlValid=!detailsPresent||integer(five)&&integer(hour)&&five+hour===writes;
 return {uncached_input_tokens:usage.input_tokens,cached_input_tokens:usage.cache_read_input_tokens,
  cache_creation_tokens:writes,cache_write_5m_tokens:writes===0?0:integer(five)&&ttlValid?five:null,
  cache_write_1h_tokens:writes===0?0:integer(hour)&&ttlValid?hour:null,
  input_tokens:input,output_tokens:usage.output_tokens,total_tokens:total,
  cache_ttl_known:writes===0||detailsPresent&&ttlValid,cache_ttl_valid:ttlValid};
}
function amount(b,rate,five=b.cache_write_5m_tokens,hour=b.cache_write_1h_tokens){
 return (b.uncached_input_tokens*rate.input+b.cached_input_tokens*rate.cached_input
  +five*rate.cache_write+hour*rate.cache_write_1h+b.output_tokens*rate.output)/1e6;
}
function requestBuckets(native,aggregate){
 if(!Array.isArray(native?.iterations)||!native.iterations.length)return null;
 const rows=native.iterations.map(nativeBuckets);
 if(rows.some(row=>!row||!row.cache_ttl_valid))return null;
 const keys=['uncached_input_tokens','cached_input_tokens','cache_creation_tokens','output_tokens'];
 if(!keys.every(k=>rows.reduce((n,row)=>n+row[k],0)===aggregate[k]))return null;
 // If aggregate TTL details exist, per-message details must agree with them as well.
 if(aggregate.cache_ttl_known&&rows.every(row=>row.cache_ttl_known)
  &&!['cache_write_5m_tokens','cache_write_1h_tokens'].every(k=>rows.reduce((n,row)=>n+row[k],0)===aggregate[k]))return null;
 return rows;
}

/** Raw Claude buckets are disjoint. A normalized inclusive input total must never be supplied as native input. */
export function claudeReferencePricing({requestedModel,usage,usageComplete=true,observedModels=[],nativeUsage=null}){
 assertClaudePricingSource();const row=contract.models.find(x=>x.model===requestedModel);
 const native=nativeUsage??usage,b=nativeBuckets(native);
 const reason=!row?'CLAUDE_PRICING_MODEL_UNREGISTERED':usageComplete!==true?'CLAUDE_PRICING_USAGE_INCOMPLETE'
  :!b?'CLAUDE_PRICING_NATIVE_USAGE_INVALID':!b.cache_ttl_valid?'CLAUDE_PRICING_CACHE_TTL_INVALID':null;
 const requests=!reason?requestBuckets(native,b):null;
 const scenarios=Object.fromEntries(['short_standard','long_standard'].map(key=>{
  const spec=row?.scenarios[key],rate=spec?.usd_per_million;
  return [key,{usd:reason||!b.cache_ttl_known?null:amount(b,rate),
   usd_if_all_cache_writes_5m:reason?null:amount(b,rate,b.cache_creation_tokens,0),
   usd_if_all_cache_writes_1h:reason?null:amount(b,rate,0,b.cache_creation_tokens),
   usd_per_million:rate?structuredClone(rate):null,source:{...source},
   assumptions:{requested_model_pricing_proxy:requestedModel,service_tier:'standard',inference_geo:'global',speed:'standard',
    prompt_regime:spec?.prompt_regime??null,cache_write_ttl:b?.cache_ttl_known?'reported_native_split':'unknown_no_default',
    excludes_tool_and_other_fees:true}}];
 }));
 let observedUSD=null,observedBasis=null;
 if(!reason){
  if(requests&&requests.every(x=>x.cache_ttl_known)){
   observedUSD=requests.reduce((n,x)=>n+amount(x,row.scenarios[row.prompt_tier_threshold_tokens!==null
    &&x.input_tokens>row.prompt_tier_threshold_tokens?'long_standard':'short_standard'].usd_per_million),0);
   observedBasis='complete_per_request_iterations';
  }else if(b.cache_ttl_known&&(row.prompt_tier_threshold_tokens===null||b.input_tokens<=row.prompt_tier_threshold_tokens)){
   observedUSD=scenarios.short_standard.usd;observedBasis=row.prompt_tier_threshold_tokens===null
    ?'context_invariant_rates':'aggregate_prompt_sum_at_most_threshold_implies_all_requests_short';
  }
 }
 return {schema_version:'claude-reference-pricing-result/v1',status:reason?'unknown':'reference_scenarios_only',
  requested_model:requestedModel,requested_model_registered:Boolean(row),observed_models:[...observedModels],
  contract_source:{...source},rate_sources:structuredClone(contract.sources),reason,usage_complete:usageComplete===true,
  usage_basis:b?{...b,source:'native_disjoint_buckets',cache_already_in_input:true,thinking_already_in_output:true}:null,
  ...scenarios,observed_standard:{usd:observedUSD,basis:observedBasis,
   complete_request_iterations:Boolean(requests),assumptions:'Exact requested model, Standard global API with reported native TTL; not actual subscription charges.'},
  strict_api_equivalent_usd:null,actual_billed_usd:null,monthly_subscription_allocation_usd:null,
  unknown_actual_pricing_fields:['served_model_billing_identity','effective_service_tier','region_and_tool_charges',
   ...(!b?.cache_ttl_known?['cache_write_ttl']:[]),
   ...(row?.prompt_tier_threshold_tokens!==null&&!requests&&b?.input_tokens>row?.prompt_tier_threshold_tokens?['per_request_context_regime']:[])],
  basis:'Captured official first-party Standard global API references. Native ordinary input, cache reads, writes and output are disjoint; TTL and thinking details and iterations are subsets, not extra tokens. Not an invoice.'};
}
export function claudeReferencePrice({model,usage,...options}){
 return claudeReferencePricing({...options,requestedModel:model,usage});
}

export function summarizeClaudeReferencePricing(receipts){
 const rows=receipts.filter(x=>x.provider==='claude'&&(x.process_submitted===true||x.status==='completed'));
 const sum=(group,key)=>{const values=group.map(x=>x.reference_pricing?.[key]?.usd);return {
  usd:values.every(finite)?values.reduce((n,x)=>n+x,0):null,known_subtotal_usd:values.filter(finite).reduce((n,x)=>n+x,0),
  known_calls:values.filter(finite).length,total_calls:group.length,complete:values.every(finite)};};
 const models=Object.fromEntries([...new Set(rows.map(x=>x.reference_pricing?.requested_model??x.requested_model??'UNKNOWN_REQUESTED_MODEL'))]
  .map(model=>{const group=rows.filter(x=>(x.reference_pricing?.requested_model??x.requested_model??'UNKNOWN_REQUESTED_MODEL')===model);
   return [model,Object.fromEntries(['short_standard','long_standard','observed_standard'].map(key=>[key,sum(group,key)]))];}));
 return {schema_version:'claude-reference-pricing-summary/v1',claude_started_calls:rows.length,
  priced_opt_in_calls:rows.filter(x=>x.reference_pricing).length,
  ...Object.fromEntries(['short_standard','long_standard','observed_standard'].map(key=>[key,sum(rows,key)])),models,
  contract_sources:[...new Map(rows.map(x=>x.reference_pricing?.contract_source).filter(Boolean).map(x=>[`${x.path}:${x.sha256}`,x])).values()],
  strict_api_equivalent_usd:null,actual_billed_usd:null,monthly_subscription_allocation_usd:null,excludes_jev:true};
}
