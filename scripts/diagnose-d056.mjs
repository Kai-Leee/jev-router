#!/usr/bin/env node
// One operator-triggered diagnostic reproduction after the prior refund was verified.
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {loadConfig,describeConfig} from '../src/config.mjs';
import {createJevClient} from '../src/client.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {createTokenBudget,validateBudgetConfig,readTokenBudgetSnapshot} from '../src/benchmark/budget.mjs';

const root=resolve(import.meta.dirname,'..');
async function main(){
  if(process.argv.length!==3||process.argv[2]!=='--spend')throw Error('EXPLICIT_SPEND_REQUIRED');
  const manifest=JSON.parse(readFileSync(join(root,'benchmarks/e2e-swe/manifests/d056-planning-json-text.json')));
  const budgetConfig=validateBudgetConfig(manifest.jev_budget,root);
  const before=readTokenBudgetSnapshot(budgetConfig);
  if(before.reservations_pending!==0)throw Error('UNRESOLVED_PRIOR_REQUEST');
  const refund=JSON.parse(readFileSync(join(root,'benchmark-runs/d056-refund-02/reconciliation.json')));
  if(refund.budget_id!==before.budget_id||refund.settled_requests!==before.settled_requests)throw Error('REFUND_STATE_CHANGED');
  const previous=JSON.parse(readFileSync(join(root,'benchmark-runs/d056-recursive-02/calls/001.request.json')));
  const payload={model:previous.model,state:previous.state,questions:previous.questions};
  const dir=join(root,'benchmark-runs/d056-diagnostic-01');mkdirSync(dir,{mode:0o700});
  mkdirSync(join(dir,'sources'),{mode:0o700});
  const save=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  const sources=['scripts/diagnose-d056.mjs','src/client.mjs','src/benchmark/telemetry.mjs','src/benchmark/budget.mjs','src/config.mjs'];
  save('protocol.json',{purpose:'One diagnostic reproduction of the confirmed failed and refunded request. No automatic replay or planning loop.',started_at:new Date().toISOString(),sources:sources.map((path,index)=>{const bytes=readFileSync(join(root,path)),snapshot=`sources/${index}-${basename(path)}`;writeFileSync(join(dir,snapshot),bytes,{flag:'wx',mode:0o600});return{path,sha256:createHash('sha256').update(bytes).digest('hex'),snapshot};}),request_sha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),original:'benchmark-runs/d056-recursive-02/calls/001.request.json'});
  save('request.json',payload);save('budget-before.json',before);
  const config=loadConfig();save('connection-config.json',describeConfig(config));
  const events=[];const record=async row=>{const event={recorded_at:new Date().toISOString(),...row};appendFileSync(join(dir,'events.jsonl'),JSON.stringify(event)+'\n',{mode:0o600});events.push(event);};
  const budget=createTokenBudget(budgetConfig,{requireExisting:true});
  const measured=createMeasuredDecider({client:createJevClient({...config,timeoutMs:60000}),budget,record,
    identifiers:{run_id:'d056-diagnostic-01',attempt_id:'d056-diagnostic-01',group_id:'d056-diagnostic',agent_role:'implementation'}});
  let result;const started=performance.now();
  try{const response=await measured(payload,{decision_id:1});save('response.json',response);result={status:'completed',model:response.model,usage:response.usage,billing:response.billing};}
  catch(error){result={status:'failed',code:error.code??'DIAGNOSTIC_FAILED',http_status:error.http_status??null,provider_run_id:error.provider_run_id??null,error_diagnostics:error.error_diagnostics??null,outcome_uncertain:error.outcomeUncertain??null,usage:null};}
  finally{budget.close();save('budget-after.json',readTokenBudgetSnapshot(budgetConfig));}
  result={...result,wall_ms:performance.now()-started,inference_requests:events.filter(e=>e.event==='inference_started').length,automatic_retries:0,implementation_workers:0,executable_tests_run:0};
  save('events.json',events);save('result.json',result);console.log(JSON.stringify(result,null,2));
  if(result.status!=='completed')process.exitCode=1;
}
main().catch(()=>{console.error('DIAGNOSTIC_STOPPED_NO_RETRY');process.exitCode=1;});
