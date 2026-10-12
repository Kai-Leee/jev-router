#!/usr/bin/env node
import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {loadConfig,describeConfig} from '../src/config.mjs';
import {createJevClient,prepareDecision} from '../src/client.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {createTokenBudget,validateBudgetConfig,readTokenBudgetSnapshot} from '../src/benchmark/budget.mjs';
import {acquireTokenBudget} from '../src/benchmark/budget-acquire.mjs';
const root=resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const original='benchmark-runs/d057-jev-01/planning/calls/001.request.json';
const old=read(original),payload={model:old.model,state:old.state,questions:structuredClone(old.questions)};
const q=payload.questions.child_count;
if(!q?.criteria?.['1']||Object.keys(payload.questions).length!==1)throw Error('UNEXPECTED_SOURCE_QUESTION');
delete q.criteria['1'];
q.instructions=q.instructions.replace('Choose 1 whenever one capable worker can implement this scope more efficiently than delegation. ','').replace('Choose 2..5 only when smaller coherent responsibilities have a concrete parallel or complexity benefit.','Choose among 2..5; splitting is required in this counterfactual experiment. Prefer the count whose smaller coherent responsibilities have the best concrete parallel or complexity benefit.');
if(Object.keys(q.criteria).join(',')!=='2,3,4,5'||q.instructions.includes('Choose 1'))throw Error('INVALID_COUNTERFACTUAL');
const prepared=prepareDecision(payload);
if(Buffer.byteLength(prepared.serialized)>120000)throw Error('PAYLOAD_LIMIT');
async function main(){
 if(process.argv.length!==3||!['--inspect','--spend'].includes(process.argv[2]))throw Error('EXPLICIT_MODE_REQUIRED');
 if(process.argv[2]==='--inspect'){console.log(JSON.stringify({options:Object.keys(q.criteria),instructions:q.instructions,state_unchanged:payload.state===old.state,model:payload.model,body_bytes:Buffer.byteLength(prepared.serialized),inference_requests:0}));return;}
 const manifest=read('benchmarks/e2e-swe/manifests/d057-planning.json'),bc=validateBudgetConfig(manifest.jev_budget,root);
 const budget=await acquireTokenBudget(bc,{open:c=>createTokenBudget(c,{requireExisting:true})});
 let dir,save,events=[],result;const start=performance.now();
 try{
  if(budget.snapshot().reservations_pending!==0)throw Error('UNRESOLVED_REQUEST');
  dir=join(root,'benchmark-runs/d058-count-no-keep-02');mkdirSync(dir,{mode:0o700});mkdirSync(join(dir,'sources'),{mode:0o700});
  const config=loadConfig();
  const safe=x=>{let s=JSON.stringify(x,null,2)+'\n';if(config.apiKey)s=s.replaceAll(JSON.stringify(config.apiKey).slice(1,-1),'[REDACTED]').replaceAll(config.apiKey,'[REDACTED]');return s;};
  save=(n,x)=>writeFileSync(join(dir,n),safe(x),{flag:'wx',mode:0o600});
  const paths=['scripts/rejudge-d058.mjs',original,'src/client.mjs','src/config.mjs','src/benchmark/telemetry.mjs','src/benchmark/budget.mjs','src/benchmark/budget-acquire.mjs'];
  save('protocol.json',{id:'D058',original,started_at:new Date().toISOString(),scope:'One root count decision only; exclude keep1, require2..5. No allocation, recursive loop, worker or product test.',state_unchanged:payload.state===old.state,automatic_retries:0,sources:paths.map((path,i)=>{const bytes=readFileSync(join(root,path)),snapshot=`sources/${i}-${basename(path)}`;writeFileSync(join(dir,snapshot),bytes,{flag:'wx',mode:0o600});return{path,snapshot,sha256:createHash('sha256').update(bytes).digest('hex')};})});
  save('request.json',payload);save('budget-before.json',budget.snapshot());save('connection-config.json',describeConfig(config));
  const record=async row=>{const e={recorded_at:new Date().toISOString(),...row};events.push(e);appendFileSync(join(dir,'events.jsonl'),safe(e).replace(/\n\s*/g,'')+'\n',{mode:0o600});};
  const measured=createMeasuredDecider({client:createJevClient({...config,timeoutMs:60000}),budget,record,identifiers:{run_id:'d058-count-no-keep-02',attempt_id:'d058-count-no-keep-02',group_id:'d058',agent_role:'implementation'}});
  const t=performance.now();
  try{const response=await measured(payload,{decision_id:1});save('response.json',response);result={status:'completed',choice:response.answers?.child_count?.choice,model:response.model,usage:response.usage,decision_wall_ms:performance.now()-t,api_equivalent_usd:Number.isSafeInteger(response.usage?.input_tokens)?response.usage.input_tokens*manifest.valuation.usd_per_million_input_tokens/1e6:null,actual_billed_usd:null};}
  catch(e){result={status:'failed',code:e.code??'JEV_FAILED',http_status:e.http_status??null,outcome_uncertain:e.outcomeUncertain??null,error_diagnostics:e.error_diagnostics??null,usage:null};}
  save('budget-after.json',budget.snapshot());result={...result,wall_ms:performance.now()-start,inference_requests:events.filter(e=>e.event==='inference_started').length,automatic_retries:0,implementation_workers:0,executable_tests_run:0};save('result.json',result);console.log(JSON.stringify(result));if(result.status!=='completed')process.exitCode=1;
 }finally{budget.close();}
}
main().catch(()=>{console.error('D058_STOPPED_NO_RETRY');process.exitCode=1;});
