import {mkdirSync, readFileSync, openSync, writeSync, fsyncSync, closeSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../client.mjs';
import {createPointsmanGateway,validatePointsmanManifest} from '../orchestration/pointsman-gateway.mjs';
import {createAdaptiveProviderSession} from './adaptive-dag-runner.mjs';
import {writePrivateJson} from './runner.mjs';
import {runCodexAttempt} from './codex-provider.mjs';

const ROOT=resolve(import.meta.dirname,'../..'),hash=b=>createHash('sha256').update(b).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function decisionSchema(request) {
  const properties=Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
    if(q.type!=='choice')fail('CODEX_BENCH_CHOICE_REQUIRED');
    return [id,{type:'object',additionalProperties:false,properties:{type:{type:'string',enum:['choice']},
      choice:{type:'string',enum:Object.keys(q.criteria)}},required:['type','choice']}];}));
  return {type:'object',additionalProperties:false,properties:{answers:{type:'object',additionalProperties:false,
    properties,required:Object.keys(properties)}},required:['answers']};
}
export function validDecision(request,answer) {
  return answer&&Object.keys(answer).length===1&&answer.answers&&Object.keys(answer.answers).length===Object.keys(request.questions).length
    &&Object.entries(request.questions).every(([id,q])=>answer.answers[id]?.type==='choice'&&Object.keys(answer.answers[id]).length===2
      &&Object.hasOwn(q.criteria,answer.answers[id].choice));
}

/** Same canonical public request and fixed D083 gate; decision replay only, no workers/grading. */
export async function runDecisionBenchmark({request,stage,out,provider='check',model,effort,spend=false,rootDir=ROOT,runCodex=runCodexAttempt,signal}) {
  if(!['check','codex','jev'].includes(provider))fail('CODEX_BENCH_PROVIDER_INVALID');
  if(provider!=='check'&&!spend)fail('EXPLICIT_SPEND_REQUIRED');
  if(provider!=='check'&&process.platform==='darwin')fail('POINTSMAN_CLOUD_RUN_REQUIRED');
  const manifest=JSON.parse(readFileSync(join(rootDir,'benchmarks/e2e-swe/manifests/pointsman-d083.json')));
  const binding=validatePointsmanManifest(manifest,{rootDir});
  const prepared=prepareDecision(request),body=JSON.parse(prepared.serialized),schema=decisionSchema(body);
  const directory=resolve(out);mkdirSync(directory,{mode:0o700});
  for(const part of ['gateway','calls','receipts','public-workspace'])mkdirSync(join(directory,part),{mode:0o700});
  const save=(name,value)=>writePrivateJson(join(directory,name),value),fd=openSync(join(directory,'events.jsonl'),'wx',0o600);
  const record=async value=>{const b=Buffer.from(JSON.stringify({...value,recorded_at:new Date().toISOString()})+'\n');let i=0;
    while(i<b.length){const n=writeSync(fd,b,i,b.length-i);if(n<=0)fail('CODEX_BENCH_RECORD_FAILED');i+=n;}fsyncSync(fd);};
  const sourcePaths=['src/benchmark/codex-provider.mjs','src/benchmark/codex-decision-benchmark.mjs','bin/codex-benchmark.mjs'];
  const sourcePins=sourcePaths.map(path=>({path,sha256:hash(readFileSync(join(rootDir,path)))}));
  const protocol={benchmark_source_sha256:hash(JSON.stringify(sourcePins)),source_pins:sourcePins,schema_version:'codex-decision-benchmark/v1',provider,stage,request_sha256:hash(prepared.serialized),
    registry_sha256:binding.sha256,requested_model:provider==='codex'?model:body.model,requested_effort:provider==='codex'?effort:null,
    scope:'decision_replay_only',worker_calls:0,automatic_retries:0,accuracy:null,product_success:null};
  let ticket;
  try {
    save('protocol.json',protocol);save('request.json',body);
    if(provider==='jev') {
      // Existing mandatory gate, measured transport and shared ledger; no substitute/reset ledger.
      const session=createAdaptiveProviderSession({rootDir,run_id:`codex-pair-${Date.now()}`,runDirectory:directory,
        manifest,remaining:()=>manifest.limits.wall_timeout_seconds*1000,record,abortSignal:signal});
      const answer=await session.decide('jev',body,{stage});save('answer.json',answer);
      const receipt=JSON.parse(readFileSync(join(directory,'receipts/jev-0001.json')));
      const result={...protocol,status:'completed',wall_ms:receipt.wall_ms,usage:receipt.usage??null,
        actual_billed_usd:receipt.actual_billed_usd??null,api_equivalent_usd:receipt.api_equivalent_usd??null,
        comparison_boundary:'provider-session including preflight, ledger and recorded transport'};
      save('result.json',result);return result;
    }
    const gateway=createPointsmanGateway({rootDir,binding:manifest.skill_gateway,record,save});
    ticket=await gateway.begin(body,{stage,decisionId:'codex-0001'});
    if(provider==='check') {const result={...protocol,status:'ready_offline',provider_calls:0};save('result.json',result);return result;}
    const prompt='Answer the supplied typed decision questions using only the inline state and criteria. '+
      'Do not use tools, inspect files, invoke skills, or implement anything. The model field names the comparator, not your identity. '+
      'Return the required JSON answers; choose only a provided criterion key for each question.\n\n'+prepared.serialized;
    const result=await runCodex({out:join(directory,'codex'),cwd:join(directory,'public-workspace'),prompt,schema,model,effort,
      spend:true,role:'decision',signal,validateAnswer:a=>validDecision(body,a),beforeDispatch:()=>{
        // Phase name belongs to the shared validator, NOT an assertion of a Jev reservation.
        ticket.assertBefore('before_reservation',body);ticket.assertBefore('before_post',body);
      }});
    const normalized={model,answers:result.answer.answers,usage:result.receipt.usage};
    await ticket.accept(normalized);save('answer.json',normalized);
    const summary={...protocol,status:'completed',wall_ms:result.receipt.wall_ms,usage:result.receipt.usage,
      model_identity_verified:result.receipt.model_identity_verified,actual_billed_usd:null,api_equivalent_usd:null,
      comparison_boundary:'CLI launch through completion and durable acceptance',jev_reservations:0};
    save('result.json',summary);return summary;
  } catch(error) {
    if(ticket)await ticket.failure(error);
    save('failure.json',{code:error.code??'CODEX_BENCH_FAILED',replay_allowed:false,product_success:null});throw error;
  } finally {closeSync(fd);}
}

export function compareDecisionRuns(left,right) {
  const read=(dir,name)=>JSON.parse(readFileSync(join(dir,name)));
  const a=read(left,'result.json'),b=read(right,'result.json');
  if(a.status!=='completed'||b.status!=='completed'||new Set([a.provider,b.provider]).size!==2||![a.provider,b.provider].every(x=>['codex','jev'].includes(x))
    ||a.benchmark_source_sha256!==b.benchmark_source_sha256||a.request_sha256!==b.request_sha256||a.registry_sha256!==b.registry_sha256||a.stage!==b.stage)fail('CODEX_BENCH_PAIR_MISMATCH');
  const leftRequest=read(left,'request.json'),rightRequest=read(right,'request.json');
  if(hash(prepareDecision(leftRequest).serialized)!==a.request_sha256||hash(prepareDecision(rightRequest).serialized)!==b.request_sha256
    ||!validDecision(leftRequest,{answers:read(left,'answer.json').answers})||!validDecision(rightRequest,{answers:read(right,'answer.json').answers}))fail('CODEX_BENCH_PAIR_EVIDENCE_INVALID');
  const ca=a.provider==='codex'?a:b,je=a.provider==='jev'?a:b,aa=read(left,'answer.json').answers,bb=read(right,'answer.json').answers;
  const ids=Object.keys(aa),agreed=ids.filter(id=>aa[id].choice===bb[id]?.choice).length;
  return {scope:'matched_decision_replay',pairs:1,questions:ids.length,agreement_count:agreed,agreement_fraction:agreed/ids.length,
    accuracy:null,product_success:null,codex_wall_ms:ca.wall_ms,jev_wall_ms:je.wall_ms,
    end_to_end_decision_speed_ratio:Number.isFinite(ca.wall_ms)&&je.wall_ms>0?ca.wall_ms/je.wall_ms:null,
    warning:'Agreement is not correctness; provider boundaries differ. No worker, quality, full-development or cost saving claim.'};
}
