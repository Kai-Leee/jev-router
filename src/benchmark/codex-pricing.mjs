import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const path = 'docs/orchestration/contracts/codex-pricing.v1.json';
const url = new URL(`../../${path}`, import.meta.url), raw = readFileSync(url), contract = JSON.parse(raw);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const source = Object.freeze({path, sha256: sha(raw)});
const integer = n => Number.isSafeInteger(n) && n >= 0;
const finite = n => Number.isFinite(n) && n >= 0;
const fail = code => {throw Object.assign(new Error(code), {code});};
function validateContract(value, version) {
  if (value.schema_version !== `codex-reference-pricing/${version}` || value.currency !== 'USD'
    || value.unit !== 'per_million_tokens' || !Array.isArray(value.models) || !value.models.length
    || new Set(value.models.map(x=>x.model)).size !== value.models.length
    || value.models.some(row=>!row.model || !['short_standard','long_standard'].every(key=>row.scenarios?.[key]?.service_tier==='standard'
      && ['input','cached_input','cache_write','output'].every(field=>finite(row.scenarios[key].usd_per_million?.[field])))))
    fail('CODEX_PRICING_CONTRACT_INVALID');
  if (version==='v2' && (value.inherits?.contract!==source.path || value.inherits.sha256!==source.sha256
    || value.models.some(row=>!row.capabilities?.description || !row.capabilities.summary
      || !row.capabilities.supported_reasoning_efforts?.includes('high') || !row.source_refs?.length)))
    fail('CODEX_PRICING_CONTRACT_INVALID');
}
validateContract(contract,'v1');
const policies=new Map([['v1',{contract,source,url}]]);
function getPricingPolicy({version='v1'}={}) {
  if(!['v1','v2'].includes(version))fail('CODEX_PRICING_VERSION_UNSUPPORTED');
  if(!policies.has(version)){
    const path=`docs/orchestration/contracts/codex-pricing.${version}.json`;
    const url=new URL(`../../${path}`,import.meta.url),raw=readFileSync(url),value=JSON.parse(raw);
    validateContract(value,version);policies.set(version,{contract:value,source:{path,sha256:sha(raw)},url});
  }
  return policies.get(version);
}
export function codexPricingContract(options={}) {const policy=getPricingPolicy(options);return {...structuredClone(policy.contract),source:{...policy.source}};}
export function assertCodexPricingSource(expectedSha256=null,options={}) {
  const policy=getPricingPolicy(options);
  if(expectedSha256!==null&&expectedSha256!==policy.source.sha256||sha(readFileSync(policy.url))!==policy.source.sha256)
    fail('CODEX_PRICING_CONTRACT_CHANGED');
  if(options.version==='v2'&&sha(readFileSync(url))!==source.sha256)fail('CODEX_PRICING_CONTRACT_CHANGED');
  return {...policy.source};
}

/** Documentation price/capability evidence only; actual app availability is separately gated. */
export function codexPricingProfileEvidence(model,{policy='v2'}={}) {
  assertCodexPricingSource(null,{version:policy});
  const value=codexPricingContract({version:policy}),row=value.models.find(x=>x.model===model);
  return {model,priced:Boolean(row),scenarios:row?structuredClone(row.scenarios):null,
    capabilities:row?.capabilities?structuredClone(row.capabilities):null,source:{...value.source},
    source_refs:row?.source_refs?structuredClone(row.source_refs):[],
    reason:row?null:'CODEX_PRICING_MODEL_UNREGISTERED'};
}

/** Pricing-only native details. Never changes the historical trace/receipt usage shape. */
export function codexPricingTraceDetails(stdout) {
  let rows;
  try {rows=stdout.split('\n').filter(x=>x.trim()).map(JSON.parse);} catch {return {cache_write_tokens:null,turns:null};}
  const turns=rows.filter(row=>row.type==='turn.completed');
  const writes=turns.map(row=>row.usage?.cache_write_tokens ?? row.usage?.input_tokens_details?.cache_write_tokens);
  const invalid=turns.some((row,index)=>writes[index]!==undefined && writes[index]!==null
    && (!integer(writes[index]) || integer(row.usage?.input_tokens) && integer(row.usage?.cached_input_tokens)
      && writes[index]+row.usage.cached_input_tokens>row.usage.input_tokens));
  return {cache_write_tokens:turns.length && writes.every(integer)&&!invalid?writes.reduce((a,b)=>a+b,0):null,
    known_cache_write_tokens:writes.filter(integer).reduce((a,b)=>a+b,0),
    cache_write_observation_status:invalid?'invalid':turns.length&&writes.every(integer)?'complete':'partial_or_unknown',
    turns:turns.map(row=>({input_tokens:integer(row.usage?.input_tokens)?row.usage.input_tokens:null,
      cache_write_tokens:integer(row.usage?.cache_write_tokens ?? row.usage?.input_tokens_details?.cache_write_tokens)
        ? row.usage.cache_write_tokens ?? row.usage.input_tokens_details.cache_write_tokens : null}))};
}

/** Explicit requested-model reference scenarios; subscription and strict actual API pricing remain unknown. */
export function codexReferencePricing({requestedModel, usage, usageComplete = true, observedModels = [], traceDetails = null,pricingVersion='v1'}) {
  assertCodexPricingSource(null,{version:pricingVersion});
  const {contract,source}=getPricingPolicy({version:pricingVersion});
  const model = contract.models.find(row => row.model === requestedModel);
  const input = usage?.input_tokens, cached = usage?.cached_input_tokens, output = usage?.output_tokens;
  const writeRaw = traceDetails?.cache_write_tokens ?? usage?.cache_write_tokens;
  const writesKnown = integer(writeRaw), writes = writesKnown ? writeRaw : null;
  const knownWriteMinimum=integer(traceDetails?.known_cache_write_tokens)?traceDetails.known_cache_write_tokens:0;
  const scenarioWrites=writes ?? knownWriteMinimum;
  const invalidWrite = traceDetails?.cache_write_observation_status==='invalid'
    || writeRaw !== undefined && writeRaw !== null && !writesKnown;
  const reason = !model ? 'CODEX_PRICING_MODEL_UNREGISTERED' : usageComplete !== true ? 'CODEX_PRICING_USAGE_INCOMPLETE'
    : !integer(input) || !integer(output) || !integer(cached) || cached > input ? 'CODEX_PRICING_USAGE_INVALID'
      : invalidWrite || cached+scenarioWrites>input ? 'CODEX_PRICING_CACHE_BUCKETS_INVALID' : null;
  const value = (rate, writeTokens) => ((input-cached-writeTokens)*rate.input + cached*rate.cached_input
    + writeTokens*rate.cache_write + output*rate.output)/1e6;
  const scenarios=Object.fromEntries(['short_standard','long_standard'].map(key=>{
    const spec=model?.scenarios[key];
    return [key,{usd:reason?null:value(spec.usd_per_million,scenarioWrites),
      usd_if_no_cache_writes:reason?null:value(spec.usd_per_million,0),
      usd_if_all_non_cached_input_are_cache_writes:reason?null:value(spec.usd_per_million,input-cached),
      usd_per_million:spec?.usd_per_million ?? null,source: {...source},
      assumptions:{requested_model_pricing_proxy:requestedModel,service_tier:'standard',context:key==='short_standard'?'short':'long',
        cache_write_tokens:scenarioWrites,cache_write_basis:writesKnown?'reported_subset_of_input':knownWriteMinimum>0
          ?'partially_reported_remainder_assumed_zero_for_scenario':'not_reported_assumed_zero_for_this_scenario',
        excludes_region_and_tool_fees:true}}];
  }));
  return {schema_version:`codex-reference-pricing-result/${pricingVersion}`,status:reason?'unknown':'reference_scenarios_only',
    requested_model:requestedModel,requested_model_registered:Boolean(model),observed_models:[...observedModels],
    contract_source:{...source},rate_sources:structuredClone(contract.sources),reason,usage_complete:usageComplete===true,
    usage_basis:{input_tokens:integer(input)?input:null,cached_input_tokens:integer(cached)?cached:null,
      cache_write_tokens:writes,known_cache_write_tokens:knownWriteMinimum,output_tokens:integer(output)?output:null,
      total_tokens:integer(input)&&integer(output)?input+output:null,cache_already_in_input:true},
    ...scenarios,strict_api_equivalent_usd:null,actual_billed_usd:null,monthly_subscription_allocation_usd:null,
    unknown_actual_pricing_fields:['served_model_billing_identity','effective_service_tier','per_request_context_regime','region_and_tool_charges',
      ...(!writesKnown?['cache_write_tokens']:[])],
    basis:'Captured official Standard API scenarios for the exact requested model; not an invoice, actual subscription allocation, verified served model or measured effective API price. Aggregate turns do not establish long-context billing.'};
}

/** Missing opt-in rows or missing scenario values invalidate a full Codex total rather than becoming zero. */
export function summarizeCodexReferencePricing(receipts) {
  const rows=receipts.filter(row=>row.provider==='codex' && (row.process_submitted===true || row.status==='completed'));
  const total=key=>{
    const values=rows.map(row=>row.reference_pricing?.[key]?.usd);
    return {usd:values.every(finite)?values.reduce((a,b)=>a+b,0):null,
      known_subtotal_usd:values.filter(finite).reduce((a,b)=>a+b,0),known_calls:values.filter(finite).length,
      total_calls:rows.length,complete:values.every(finite),
      contract_sources:[...new Map(rows.map(row=>row.reference_pricing?.contract_source).filter(Boolean).map(x=>[`${x.path}:${x.sha256}`,x])).values()]};
  };
  const version2=rows.some(row=>row.reference_pricing?.schema_version==='codex-reference-pricing-result/v2');
  const byModel=version2?Object.fromEntries([...new Set(rows.map(row=>row.reference_pricing?.requested_model??row.requested_model??'UNKNOWN_REQUESTED_MODEL'))]
    .map(model=>{const group=rows.filter(row=>(row.reference_pricing?.requested_model??row.requested_model??'UNKNOWN_REQUESTED_MODEL')===model);
      const total=key=>{const values=group.map(row=>row.reference_pricing?.[key]?.usd);return {usd:values.every(finite)?values.reduce((a,b)=>a+b,0):null,known_subtotal_usd:values.filter(finite).reduce((a,b)=>a+b,0),calls:group.length};};
      return [model,{short_standard:total('short_standard'),long_standard:total('long_standard')}];})):null;
  return {schema_version:version2?'codex-reference-pricing-summary/v2':'codex-reference-pricing-summary/v1',codex_started_calls:rows.length,
    priced_opt_in_calls:rows.filter(row=>row.reference_pricing).length,short_standard:total('short_standard'),long_standard:total('long_standard'),
    strict_api_equivalent_usd:null,actual_billed_usd:null,monthly_subscription_allocation_usd:null,
    ...(version2?{models:byModel}:{}),excludes_jev:true,basis:'Codex-only reference scenarios summed per attempt. Jev historical token-pack equivalent remains separate; missing opt-in/usage stays unknown.'};
}
