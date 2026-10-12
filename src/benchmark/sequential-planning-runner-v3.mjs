import {readFileSync,writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve,join,relative,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {isDeepStrictEqual} from 'node:util';
import {encodePlanningState,decodePlanningState} from '../orchestration/planning-state-codec.mjs';
import {allocateSequentialV3} from '../orchestration/sequential-allocation-v3.mjs';
import {loadConfig,describeConfig} from '../config.mjs';
import {createJevClient,prepareDecision} from '../client.mjs';
import {createMeasuredDecider} from './telemetry.mjs';
import {createTokenBudget,validateBudgetConfig,readTokenBudgetSnapshot} from './budget.mjs';
import {acquireTokenBudget} from './budget-acquire.mjs';
import {summarizePlanningReceipts} from './recursive-planning-runner.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
const safe=e=>/^[A-Z0-9_]{1,80}$/.test(e?.code??'')?e.code:'SEQUENTIAL_PLANNING_FAILED';
export async function runSequentialPlanningV3({rootDir,outputDir,spend=false,profiles}){
 if(!spend)throw Object.assign(Error('EXPLICIT_SPEND_REQUIRED'),{code:'EXPLICIT_SPEND_REQUIRED'});
 const root=resolve(rootDir),dir=resolve(outputDir);if(!dir.startsWith(join(root,'benchmark-runs')+'/'))throw Error('INVALID_OUTPUT');
 const manifest=JSON.parse(readFileSync(join(root,'benchmarks/e2e-swe/manifests/d057-planning.json'),'utf8'));
 const input=JSON.parse(readFileSync(join(root,manifest.input),'utf8')),bc=validateBudgetConfig(manifest.jev_budget,root);
 mkdirSync(dir,{mode:0o700});for(const s of ['calls','receipts','sources'])mkdirSync(join(dir,s),{mode:0o700});
 let key='';const safeJSON=x=>{let s=JSON.stringify(x,null,2)+'\n';if(key)s=s.replaceAll(JSON.stringify(key).slice(1,-1),'[REDACTED]').replaceAll(key,'[REDACTED]');return s;};
 const save=(p,x)=>writeFileSync(join(dir,p),safeJSON(x),{flag:'wx',mode:0o600});
 const events=[],receipts=[];let seq=0,plan=null,stop=null,uncertain=false,held=null;
 const record=async e=>{const r={recorded_at:new Date().toISOString(),...e};events.push(r);appendFileSync(join(dir,'events.jsonl'),safeJSON(r).replace(/\n\s*/g,'')+'\n',{mode:0o600});};
 const sources=['src/benchmark/sequential-planning-runner-v3.mjs','src/orchestration/planning-state-codec.mjs','src/orchestration/sequential-allocation-v3.mjs','docs/orchestration/contracts/sequential-allocation.v3.json','docs/orchestration/contracts/models.v2.json',manifest.input,'src/client.mjs','src/benchmark/telemetry.mjs','src/benchmark/budget.mjs','src/benchmark/budget-acquire.mjs','src/config.mjs'];
 const pinned=sources.map((p,i)=>{const b=readFileSync(join(root,p)),snapshot=`sources/${i}-${basename(p)}`;writeFileSync(join(dir,snapshot),b,{flag:'wx',mode:0o600});return{path:p,sha256:hash(b),snapshot};});
 save('protocol.json',{schema_version:'d062-planning/v1',sources:pinned,profiles,automatic_retries:0,max_requests:120,max_input_tokens:3000000,budget_unit:'cumulative10Minput',max_body_bytes:240000,state_format:'lossless_columnar_text',mode:'sequential_multi_selection',last_worker:'deterministic remainder',allocation_invalid:'stop without silently changing returned selections'});save('inputs.json',input);save('budget-before.json',readTokenBudgetSnapshot(bc));
 const start=performance.now();
 try{
 const config=loadConfig();key=config.apiKey;save('connection-config.json',describeConfig(config));
 const proxy={reserve:(...a)=>held.reserve(...a),settle:(...a)=>held.settle(...a),snapshot:()=>held.snapshot()};
 const measured=createMeasuredDecider({client:createJevClient({...config,timeoutMs:60000}),budget:proxy,record,identifiers:{run_id:basename(dir),attempt_id:basename(dir),group_id:'d062-planning',agent_role:'implementation'}});
 const decide=async request=>{
  const used=receipts.reduce((n,r)=>n+(r.usage?.input_tokens??0),0);
  if(seq>=120||used+bc.reserve_input_tokens>3000000)throw Object.assign(Error('PLANNING_LIMIT'),{code:'PLANNING_LIMIT'});
  const encoded=encodePlanningState(request.state);
  if(!isDeepStrictEqual(request.state,decodePlanningState(encoded)))throw Object.assign(Error('ROUNDTRIP_FAILED'),{code:'ROUNDTRIP_FAILED'});
  const prepared=prepareDecision({model:'jev-latest',state:JSON.stringify(encoded),questions:request.questions});
  if(Buffer.byteLength(prepared.serialized)>240000)throw Object.assign(Error('PAYLOAD_LIMIT'),{code:'PAYLOAD_LIMIT'});
  const id=String(++seq).padStart(3,'0');save(`calls/${id}.request.json`,{stage:request.stage,node_id:request.node_id,...prepared.body});const t=performance.now(),eventStart=events.length;
  let receipt, observedResponse=null;
  try{
   held=await acquireTokenBudget(bc,{open:c=>createTokenBudget(c,{requireExisting:true})});
   const response=await measured(prepared.body,{decision_id:seq});observedResponse=response;save(`calls/${id}.response.json`,response);
   receipt={invocation_id:id,stage:request.stage,status:'completed',inference_started:events.slice(eventStart).some(e=>e.event==='inference_started'),wall_ms:performance.now()-t,model:response.model,usage:response.usage};return response;
  }catch(e){const submitted=events.slice(eventStart).some(x=>x.event==='inference_started');e.outcomeUncertain=e.outcomeUncertain??submitted;receipt={invocation_id:id,stage:request.stage,status:e.outcomeUncertain?'uncertain':'failed',inference_started:submitted,wall_ms:performance.now()-t,code:safe(e),outcome_uncertain:e.outcomeUncertain,error_diagnostics:e.error_diagnostics??null,usage:observedResponse?.usage??null,response_received:observedResponse!==null};throw e;}
  finally{try{if(receipt){receipts.push(receipt);save(`receipts/${id}.json`,receipt);}}catch(e){e.outcomeUncertain=e.outcomeUncertain??events.slice(eventStart).some(x=>x.event==='inference_started');throw e;}finally{if(held){held.close();held=null;}}}
 };
 plan=await allocateSequentialV3({input,profiles,decide,record});save('plan.json',plan);
 }catch(e){stop=safe(e);uncertain=e.outcomeUncertain??false;await record({event:'planning_stopped',code:stop,outcome_uncertain:uncertain});}
 finally{if(held)held.close();save('budget-after.json',readTokenBudgetSnapshot(bc));}
 const result={status:stop?'failed':plan?.status??'failed',stop_code:stop,issues:stop?[{code:stop,outcome_uncertain:uncertain}]:[],wall_ms:performance.now()-start,usage:summarizePlanningReceipts(receipts,manifest.valuation.usd_per_million_input_tokens),source_changes_during_run:pinned.filter(s=>hash(readFileSync(join(root,s.path)))!==s.sha256).map(s=>s.path),implementation_workers:0,executable_tests_run:0};save('result.json',result);return{result,plan};
}
