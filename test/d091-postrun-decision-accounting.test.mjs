// PROPOSAL ONLY. After the paid cohort terminates and root approves/applies the summary patch,
// save as test/d091-postrun-decision-accounting.test.mjs and run the focused test.
// No model, GET, account, Docker or ledger calls: pure aggregation of synthetic receipt fixtures.
import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCodexE2EUsage} from '../src/benchmark/codex-e2e-decisions.mjs';
import {codexReferencePricing} from '../src/benchmark/codex-pricing.mjs';
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-12,`${actual} != ${expected}`);
const codex=(id,purpose,input,cached,output)=>{
 const usage={input_tokens:input,cached_input_tokens:cached,output_tokens:output};
 return{id,provider:'codex',purpose,status:'completed',process_submitted:true,usage,api_equivalent_usd:null,
  reference_pricing:codexReferencePricing({requestedModel:'gpt-6.1-sol',usage,pricingVersion:'v2'})};
};
const fixture=()=>[
 codex('codex-decision-1','decision',1000,800,100),
 codex('codex-worker-1','worker',2000,1000,200),
 {id:'jev-split-1',provider:'jev',purpose:'decision',stage:'split',status:'completed',inference_started:true,
  usage:{input_tokens:100,output_tokens:5},api_equivalent_usd:.00006},
 // Actual D091 metadata shape: context purpose overrides the session's original 'decision'.
 {id:'jev-profile-1',provider:'jev',purpose:'codex-worker-v1',stage:'profiles',status:'completed',inference_started:true,
  usage:{input_tokens:500,output_tokens:20},api_equivalent_usd:.0003},
];

test('Jev profile selection belongs to decision accounting exactly once without changing worker, total, cache or pricing sums',()=>{
 const rows=fixture(),before=JSON.stringify(rows),out=summarizeCodexE2EUsage(rows);
 assert.equal(out.decisions.calls,3);assert.equal(out.workers.calls,1);assert.equal(out.total.calls,4);
 assert.equal(out.decisions.calls+out.workers.calls,out.total.calls);
 assert.equal(out.total.total_tokens,3925);assert.equal(out.decisions.total_tokens,1725);assert.equal(out.workers.total_tokens,2200);
 assert.equal(out.decisions.total_tokens+out.workers.total_tokens,out.total.total_tokens);
 assert.equal(out.jev.total_tokens,625);assert.equal(out.codex.total_tokens,3300);
 assert.equal(out.codex.cached_input_tokens,1800);assert.equal(out.workers.cached_input_tokens,1000);
 // Missing Jev cache fields stay unknown in mixed groups; cache is already inside Codex input.
 assert.equal(out.decisions.cached_input_tokens,null);assert.equal(out.total.cached_input_tokens,null);
 near(out.jev.api_equivalent_usd,.00036);assert.equal(out.total.api_equivalent_usd,null);assert.equal(out.total.actual_billed_usd,null);
 const decisionReference=out.decisions.reference_pricing.short_standard.usd;
 const workerReference=out.workers.reference_pricing.short_standard.usd;
 near(decisionReference,.00148);near(workerReference,.0041);
 near(out.total.reference_pricing.short_standard.usd,decisionReference+workerReference);
 assert.equal(out.decisions.reference_pricing.codex_started_calls,1);assert.equal(out.total.reference_pricing.codex_started_calls,2);
 assert.equal(out.total.reference_pricing.strict_api_equivalent_usd,null);
 assert.equal(JSON.stringify(rows),before); // No raw receipt/purpose mutation.
});

test('generic Jev and Codex decision behavior is unchanged and unknown profile usage remains unknown',()=>{
 const original=fixture().filter(row=>row.id!=='jev-profile-1'),legacy=summarizeCodexE2EUsage(original);
 assert.equal(legacy.decisions.calls,2);assert.equal(legacy.workers.calls,1);assert.equal(legacy.total.calls,3);
 assert.equal(legacy.decisions.total_tokens,1205);assert.equal(legacy.total.total_tokens,3405);
 const rows=fixture();rows.at(-1).usage=null;rows.at(-1).api_equivalent_usd=null;
 const unknown=summarizeCodexE2EUsage(rows);
 assert.equal(unknown.decisions.calls,3);assert.equal(unknown.decisions.total_tokens,null);
 assert.equal(unknown.decisions.known_total_tokens,1205);assert.equal(unknown.total.total_tokens,null);
 assert.equal(unknown.total.known_total_tokens,3405);assert.equal(unknown.jev.api_equivalent_usd,null);
 assert.equal(unknown.workers.total_tokens,2200);assert.equal(unknown.workers.cached_input_tokens,1000);
});
