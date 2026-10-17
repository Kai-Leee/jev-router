import {mkdtempSync, readFileSync, existsSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {prepareDecision} from '../client.mjs';
import {createPointsmanGateway} from '../orchestration/pointsman-gateway.mjs';
import {createAdaptiveProviderSession, adaptiveSpeedSessionOptions, normalizeAdaptiveAnswers} from './adaptive-dag-runner.mjs';
import {decisionSchema, validDecision} from './codex-decision-benchmark.mjs';
import {runCodexAttempt} from './codex-provider.mjs';
import {summarizeCodexReferencePricing} from './codex-pricing.mjs';
import {summarizeClaudeReferencePricing} from './claude-pricing.mjs';

const fail = code => { throw Object.assign(new Error(code), {code}); };

export function codexE2EDecisionStageAllowed({provider,manifest,metadata}) {
  return ['split','relations','repair_owners','repair'].includes(metadata?.stage) || metadata?.stage==='profiles'&&manifest?.codex_execution?.worker_routing==='joint-model-effort-cold-start-v4'&&metadata.profile_kind==='worker-v4'&&['codex','claude','jev'].includes(provider)
    || metadata?.stage==='profiles'&&manifest?.codex_execution?.worker_routing==='joint-model-effort-history-v3'
      &&metadata.profile_kind==='worker-v3'&&['codex','claude','jev'].includes(provider)
    || metadata?.stage==='profiles' && provider==='jev'
      && (manifest?.codex_execution?.worker_routing==='jev-model-size-v1'&&metadata.profile_kind==='codex-worker-v1'
        ||manifest?.codex_execution?.worker_routing==='jev-model-effort-history-v2'&&metadata.profile_kind==='codex-worker-v2');
}

/** Both arms feed the same discrete choice representation into the planner.
 * Native probabilities remain in the provider response and gateway evidence. */
export function createCodexE2EDecisions({provider,rootDir,manifest,context,model,effort,workerEnvironmentEvidence,runCodex=runCodexAttempt}) {
  if (!['codex','jev','claude'].includes(provider)) fail('CODEX_E2E_PROVIDER_INVALID');
  let count=0,stopped=false;
  const receipts=[];
  // A Codex baseline must never initialize Jev config, authentication, or its ledger.
  const session=provider==='jev'?createAdaptiveProviderSession({rootDir,manifest,run_id:context.run_id,
    runDirectory:context.directory,remaining:context.remaining,record:context.record,abortSignal:context.signal,
    ...adaptiveSpeedSessionOptions(manifest),workerEnvironmentEvidence}):null;
  const gateway=provider!=='jev'?createPointsmanGateway({rootDir,binding:manifest.skill_gateway,
    record:context.record,save:context.save,workerEnvironmentEvidence}):null;
  return {
    receipts:()=>session?session.receipts():structuredClone(receipts),
    count:()=>count,
    async decide(request,metadata) {
      if(stopped)fail('CODEX_E2E_DECISIONS_STOPPED');
      context.remaining();
      if(++count>manifest.limits.max_decisions)fail('ADAPTIVE_DECISION_LIMIT');
      if(!codexE2EDecisionStageAllowed({provider,manifest,metadata}))fail('CODEX_E2E_STAGE_INVALID');
      const prepared=prepareDecision(request),body=JSON.parse(prepared.serialized);
      const id=`${provider==='claude'?'claude':'codex'}-decision-${String(count).padStart(4,'0')}`,out=join(context.directory,'calls',id);
      let ticket,cwd;
      try {
        if(session) {
          const response=await session.decide('jev',body,metadata);
          return normalizeAdaptiveAnswers(body,response); // Same choice-only controller input in both arms.
        }
        ticket=await gateway.begin(body,{...metadata,decisionId:id});
        cwd=mkdtempSync(join(tmpdir(),'codex-e2e-decision-'));
        context.save(`calls/${id}.canonical-request.json`,body);
        const prompt='Answer the supplied typed decision questions using only the inline state and criteria. '+
          'Do not use tools, inspect files, invoke skills, or implement anything. The model field names the comparator, not your identity. '+
          'Return the required JSON answers; choose only a provided criterion key for each question.\n\n'+prepared.serialized;
        const result=await runCodex({out,cwd,prompt,schema:decisionSchema(body),model,effort,role:'decision',spend:true,
          signal:context.signal,validateAnswer:a=>validDecision(body,a),beforeDispatch:()=>{
            context.remaining();ticket.assertBefore('before_reservation',body);ticket.assertBefore('before_post',body);
          }});
        const response={model,answers:result.answer.answers,usage:result.receipt.usage};
        await ticket.accept(response);
        context.save(`calls/${id}.canonical-response.json`,response);
        return normalizeAdaptiveAnswers(body,response);
      } catch(error) {
        stopped=true;
        if(!session&&existsSync(join(out,'receipt.json'))) {
          const receipt=JSON.parse(readFileSync(join(out,'receipt.json')));
          if(receipt.status==='uncertain'||receipt.outcome_uncertain===true)error.outcome_uncertain=true;
        }
        if(ticket)await ticket.failure(error);
        throw error;
      } finally {
        // Remove only our empty workspace. Unexpected content remains as evidence.
        if(cwd)try{rmdirSync(cwd);}catch{}
        if(!session&&existsSync(join(out,'receipt.json'))) {
          const receipt={...JSON.parse(readFileSync(join(out,'receipt.json'))),id,purpose:'decision',stage:metadata.stage,
            receipt_path:join(out,'receipt.json'),jev_reservations:0};
          receipts.push(receipt);
          await context.record({event:'codex_e2e_decision_terminal',...receipt});
        }
      }
    },
  };
}

/** Unknown usage and unknown price never become zero. Cache is part of input. */
export function summarizeCodexE2EUsage(receipts) {
  const summarize=rows=>{
    const started=rows.filter(r=>r.process_submitted===true||r.inference_started===true||r.status==='completed');
    const valid=r=>Number.isSafeInteger(r.usage?.input_tokens)&&r.usage.input_tokens>=0
      &&Number.isSafeInteger(r.usage?.output_tokens)&&r.usage.output_tokens>=0;
    const known=started.filter(valid),complete=known.length===started.length;
    const sum=k=>known.reduce((n,r)=>n+r.usage[k],0);
    const cacheKnown=started.every(r=>Number.isSafeInteger(r.usage?.cached_input_tokens));
    const priced=started.every(r=>typeof r.api_equivalent_usd==='number'&&Number.isFinite(r.api_equivalent_usd));
    return {calls:rows.length,started_calls:started.length,known_usage_calls:known.length,usage_complete:complete,
      input_tokens:complete?sum('input_tokens'):null,output_tokens:complete?sum('output_tokens'):null,
      total_tokens:complete?sum('input_tokens')+sum('output_tokens'):null,
      known_total_tokens:sum('input_tokens')+sum('output_tokens'),
      cached_input_tokens:complete&&cacheKnown?sum('cached_input_tokens'):null,
      api_equivalent_usd:priced?started.reduce((n,r)=>n+r.api_equivalent_usd,0):null,
      actual_billed_usd:null,
      ...(rows.some(r=>r.provider==='codex'&&r.reference_pricing)?{reference_pricing:summarizeCodexReferencePricing(rows)}:{}),
      ...(rows.some(r=>r.provider==='claude'&&r.reference_pricing)?{claude_reference_pricing:summarizeClaudeReferencePricing(rows)}:{})};
  };
  return {total:summarize(receipts),codex:summarize(receipts.filter(r=>r.provider==='codex')),
    claude:summarize(receipts.filter(r=>r.provider==='claude')),
    jev:summarize(receipts.filter(r=>r.provider==='jev')),
    decisions:summarize(receipts.filter(r=>r.provider==='jev'||r.purpose==='decision')),
    workers:summarize(receipts.filter(r=>r.purpose==='worker')),
    basis:'Per-attempt receipts only; shared ledger deltas excluded. Jev value is historical token-pack equivalent, not an invoice.'};
}
