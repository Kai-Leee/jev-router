#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,appendFileSync,realpathSync,lstatSync,existsSync} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {execFileSync} from 'node:child_process';
import {runLifecycle} from '../src/orchestration/lifecycle-router-v2.mjs';
import {preflightVerifier,verifyArtifacts} from '../src/orchestration/artifact-verifier.mjs';
import {prepareDecisionPayload} from '../src/orchestration/decision-payload.mjs';
import {projectLifecycleDecision} from '../src/orchestration/decision-projection.mjs';
import {prepareDecision} from '../src/client.mjs';
import {runPublicSmoke} from '../src/orchestration/public-smoke.mjs';
import {validateRunConfig} from '../src/benchmark/launch.mjs';
import {createTokenBudget,readTokenBudgetSnapshot} from '../src/benchmark/budget.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {loadConfig} from '../src/config.mjs';
import {createJevClient} from '../src/client.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {providerOutcome} from '../src/benchmark/runner.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
const root=resolve(import.meta.dirname,'..'),hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
async function main(){
 const [configFile,output,condition,spend]=process.argv.slice(2);
 if(!['claude','jev'].includes(condition)||spend!=='--spend')throw Error('USAGE_CONFIG_OUTPUT_CLAUDE_OR_JEV_SPEND');
 const config=validateRunConfig(read(configFile),dirname(resolve(configFile)));
 if(config.model!=='claude-opus-5-5'||config.effort!=='medium')throw Error('FIXED_WORKER_PROFILE_REQUIRED');
 const verifierPreflight=preflightVerifier();
 const dir=resolve(output);mkdirSync(dir,{mode:0o700});for(const sub of ['receipts','calls','candidate'])mkdirSync(join(dir,sub),{mode:0o700});
 const candidate=realpathSync(join(dir,'candidate'));const started=performance.now(),started_at=new Date().toISOString();
 const save=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 const record=async e=>appendFileSync(join(dir,'events.jsonl'),JSON.stringify({recorded_at:new Date().toISOString(),...e})+'\n',{mode:0o600});
 const frozen=read(join(root,'benchmark-runs/d040-claude-01/frozen-plan.json')),plan=frozen.plan;
 const brief=config.instructions.map(path=>({path,text:readFileSync(path,'utf8')}));
 const inputs={brief_sha256:hash(brief),plan_sha256:hash(plan),worker_model:config.model,worker_effort:config.effort,worker_transport_sha256:hash(readFileSync(join(root,'src/orchestration/artifact-transport.mjs'),'utf8')),max_concurrency:2};
 save('inputs.json',{...inputs,brief,plan,condition,worker_transport:'scoped-mcp-files-v1',recovery_limit_per_task:1});save('budget-before.json',readTokenBudgetSnapshot(config.jev_budget));
 const initialEvidence=[{kind:'historical_failure',source:'D042/D046 receipts',text:'No-tools single final JSON artifact generation failed after output-token-limit continuation; D046 failed before writing files. This is historical, not a failure observation of the new transport.'},{kind:'current_transport',text:'New worker can write and read exact allowlisted files via artifact MCP. Each write is saved independently. Final summary is not parsed as artifact JSON. Local transport protocol, ownership and filesystem tests passed; live benchmark efficacy unverified.'},{kind:'evaluation_policy',text:'Public task requirements are in brief. Syntax/file coverage is not requirement completion; original independent grader runs after candidate freeze. Hidden grader details never go to workers or decisions.'}];
 save('initial-evidence.json',initialEvidence);save('verifier-preflight.json',verifierPreflight);
 let seq=0,decisionSeq=0,queue=Promise.resolve();
 const remaining=()=>{const ms=config.wall_timeout_seconds*1000-(performance.now()-started);if(ms<=0)throw Error('RUN_DEADLINE');return ms;};
 const id=category=>`${String(++seq).padStart(3,'0')}-${category}`;
 const cli=async({category,request,system,mcp,allowedTools=[]})=>{
  const timeoutMs=remaining();
  const invocation_id=id(category),cwd=mkdtempSync(join(tmpdir(),`jev-d051-${condition}-`));
  const mcpFile=join(dir,'calls',`${invocation_id}.mcp.json`);writeFileSync(mcpFile,JSON.stringify(mcp??{mcpServers:{}}),{mode:0o600});
  const args=['--print','--restricted','--model',config.model,'--effort',config.effort,'--tools','','--strict-mcp-config','--mcp-config',mcpFile,'--setting-sources','','--disable-slash-commands','--no-chrome','--permission-mode','dontAsk','--permission-prompts','none','--no-session-persistence','--output-format','stream-json','--verbose','--system-prompt',system];
  if(allowedTools.length)args.push('--allowedTools',allowedTools.join(','));
  save(`calls/${invocation_id}.request.json`,{request,system,allowedTools,cwd});await record({event:'invocation_started',invocation_id,category,provider:'claude'});
  const t=performance.now();let raw;
  try{raw=await processResult('claude',args,{cwd,env:claudeEnvironment(process.env),input:JSON.stringify(request),timeoutMs,maxBytes:16*1024*1024,killProcessTree:true,onStdout:chunk=>appendFileSync(join(dir,'calls',`${invocation_id}.live.jsonl`),chunk,{mode:0o600})});}
  catch(error){await record({event:'invocation_unresolved',invocation_id,code:error.message});throw Object.assign(Error('CLAUDE_PROCESS_UNCERTAIN'),{uncertain:true});}
  save(`calls/${invocation_id}.process.json`,{exitCode:raw.exit_code,interrupted:raw.interrupted,outcome_uncertain:raw.outcome_uncertain});
  writeFileSync(join(dir,'calls',`${invocation_id}.stderr.log`),raw.stderr,{mode:0o600});
  const outcome=providerOutcome(raw,config.model);
  const receipt={invocation_id,category,provider:'claude',status:outcome.status,wall_ms:performance.now()-t,usage:outcome.completion?.usage??null,api_equivalent_usd:outcome.completion?.total_cost_usd??null,actual_billed_usd:null,model:outcome.models,provider_api_ms:outcome.completion?.duration_api_ms??null,outcome_uncertain:outcome.status==='uncertain'};
  save(`receipts/${invocation_id}.json`,receipt);await record({event:'invocation_finished',...receipt});
  if(outcome.status!=='completed')throw Object.assign(Error(outcome.code??'CLAUDE_FAILED'),{uncertain:outcome.status==='uncertain',evidence:{invocation_id,provider_status:outcome.status,provider_code:outcome.code,terminal_subtype:outcome.completion?.subtype??null,final_message:outcome.completion?.result?.slice(0,4096)??null}});
  return {receipt,completion:outcome.completion};
 };
 const decideRaw=async request=>{
  remaining();
  const projected=projectLifecycleDecision(request);
  const packed=prepareDecisionPayload({model:'jev-latest',state:projected.state,questions:projected.questions});
  prepareDecision(packed.body);
  await record({event:'decision_payload_prepared',stage:request.stage,...packed.metrics});
  request={...projected,state:packed.body.state};
  if(condition==='claude'){
   const result=await cli({category:'decision',request,system:'Answer the supplied typed choice questions using all supplied evidence and goal. Return only JSON {"answers":{"QUESTION_KEY":{"type":"choice","choice":"EXACT_CRITERION_KEY","confidence":0.0}}}. Use the actual question key and one supplied choice. File bodies are absent from the decision packet; use public requirements, actual verification, paths/hashes and worker summaries. Do not claim source inspection. Prioritize whole-task verified quality and elapsed time including recovery. Do not generate implementation or restate documents.'});
   return JSON.parse(result.completion.result.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
  }
  const invocation_id=id('decision'),budget=createTokenBudget(config.jev_budget),t=performance.now();
  const body={model:'jev-latest',state:request.state,questions:request.questions};
  save(`calls/${invocation_id}.request.json`,{stage:request.stage,...body});await record({event:'invocation_started',invocation_id,category:'decision',provider:'jev'});
  try{
   const measured=createMeasuredDecider({client:createJevClient(loadConfig()),budget,record:async e=>record({...e,invocation_id}),identifiers:{run_id:config.run_id,attempt_id:config.attempt_id,group_id:config.group_id,agent_role:'implementation'}});
   const response=await measured(body,{decision_id:++decisionSeq});save(`calls/${invocation_id}.response.json`,response);
   const receipt={invocation_id,category:'decision',provider:'jev',status:'completed',wall_ms:performance.now()-t,usage:response.usage,api_equivalent_usd:response.usage.input_tokens*.6/1e6,valuation_basis:'informational_input_rate_0.6_USD_per_million_not_bill',actual_billed_usd:null,model:response.model};save(`receipts/${invocation_id}.json`,receipt);await record({event:'invocation_finished',...receipt});return response;
  }catch(error){
   const receipt={invocation_id,category:'decision',provider:'jev',status:error.outcomeUncertain===true?'uncertain':'failed',wall_ms:performance.now()-t,usage:null,api_equivalent_usd:null,actual_billed_usd:null,code:error.code??'JEV_FAILED',http_status:error.http_status??null,provider_run_id:error.provider_run_id??null,retry_after_ms:error.retry_after_ms??null,outcome_uncertain:error.outcomeUncertain??true};
   save(`receipts/${invocation_id}.json`,receipt);await record({event:'invocation_finished',...receipt});throw error;
  }
  finally{budget.close();}
 };
 const decide=request=>{const pending=queue.then(()=>decideRaw(request));queue=pending.catch(()=>{});return pending;};
 const snapshot=paths=>{
  const files=[],missing=[],errors=[];
  for(const path of paths){
   try{
    const parts=path.split('/');let current=candidate;
    for(let i=0;i<parts.length;i++){if(!parts[i]||parts[i]==='.'||parts[i]==='..')throw Error('INVALID_PATH');current=join(current,parts[i]);const st=lstatSync(current);if(st.isSymbolicLink()||(i<parts.length-1&&!st.isDirectory())||(i===parts.length-1&&(!st.isFile()||st.nlink!==1||st.size>262144)))throw Error('INVALID_FILE');}
    const content=readFileSync(current,'utf8');files.push({path,content,sha256:hash(content),bytes:Buffer.byteLength(content)});
   }catch(error){if(error.code==='ENOENT')missing.push(path);else errors.push({path,code:error.message});}
  }
  return {files,missing_paths:missing,errors};
 };
 const execute=async({task,plan,evidence,attempt,repair,model,effort})=>{
  const name=`${task.id}-${attempt}`;const transportConfig={root:candidate,allowedPaths:task.paths,readablePaths:plan.tasks.flatMap(t=>t.paths),journalPath:join(dir,'calls',`${name}.artifacts.jsonl`),maxFileBytes:262144,maxTotalBytes:4194304};
  save(`calls/${name}.transport.json`,transportConfig);
  const mcp={mcpServers:{artifact_worker:{command:process.execPath,args:[join(root,'bin/artifact-worker-mcp.mjs'),'--config',join(dir,'calls',`${name}.transport.json`)]}}};
  let result;
  try{result=await cli({category:repair?'recovery':'worker',request:{brief,plan,task,evidence,attempt,repair,model,effort},mcp,allowedTools:['mcp__artifact_worker__write_file','mcp__artifact_worker__read_file','mcp__artifact_worker__status'],system:'Implement your assigned task against the complete public specification. Use artifact_worker tools to write EVERY assigned file separately as complete file content. Only write assigned paths. Read dependency files with read_file when needed. Files persist immediately; do not put file bodies or a giant JSON artifact in your final reply. Check status for missing paths and finish with a concise factual summary of what you wrote and remaining uncertainty. You have no shell, network, test execution, or agent delegation tools. Do not claim tests passed. Implement full functionality, not stubs. For repair, use carried concrete observations and existing files.'});
  }catch(error){const partial=snapshot(task.paths);const journal=existsSync(transportConfig.journalPath)?readFileSync(transportConfig.journalPath,'utf8').trim().split('\n').slice(-8).map(line=>{try{return JSON.parse(line);}catch{return {event:'journal_line_unreadable'};}}):[];error.evidence={...error.evidence,artifacts:partial.files,missing_paths:partial.missing_paths,artifact_errors:partial.errors,journal};throw error;}
  const {files}=snapshot(task.paths);
  return {status:'provider_completed',invocation_id:result.receipt.invocation_id,summary:result.completion.result,files,checks_executed:[],outcome_uncertain:false};
 };
 const smokeCache=new Map();let smokeSeq=0;
 const verify=async({scope,task,plan})=>{
  const allPaths=plan.tasks.flatMap(t=>t.paths),paths=scope==='task'?task.paths:allPaths;
  const syntax=verifyArtifacts({root:candidate,paths,allPaths});if(!syntax.ok)return syntax;
  const snap=snapshot(allPaths);if(snap.missing_paths.length||snap.errors.length)return {...syntax,public_smoke:{status:'not_applicable',reason:'candidate_incomplete'},requirements_verified:false};
  const version=hash(snap.files.map(f=>[f.path,f.sha256]));let smoke=smokeCache.get(version);
  if(!smoke){smoke=await runPublicSmoke({root:candidate,outputDir:join(dir,`public-smoke-${++smokeSeq}`),imageLock:join(root,'benchmark-runs/d040-openapi-image-lock.json'),requiredPaths:allPaths});smokeCache.set(version,smoke);await record({event:'public_smoke_finished',artifact_version:version,...smoke});}
  if(smoke.status==='environment_error')throw Object.assign(Error('VERIFIER_ENVIRONMENT_ERROR'),{code:'VERIFIER_ENVIRONMENT_ERROR',evidence:smoke});
  return {...syntax,ok:syntax.ok&&smoke.ok===true,public_smoke:smoke,errors:[...syntax.errors,...(smoke.errors??[])],requirements_verified:false};
 };
 let lifecycle,status,stopped_code;
 try{lifecycle=await runLifecycle({plan,brief,decide,execute,verify,record,initialEvidence,maxConcurrency:2,maxRecoveryPerTask:1,model:config.model,effort:config.effort});save('lifecycle.json',lifecycle);status=lifecycle.status;stopped_code=lifecycle.stopped_code;}
 catch(error){status='stopped';stopped_code=/^[A-Z_]+$/.test(error.code??error.message)?error.code??error.message:'LIFECYCLE_ERROR';await record({event:'run_stopped',code:stopped_code,outcome_uncertain:error.uncertain??error.outcomeUncertain??null});}
 save('budget-after.json',readTokenBudgetSnapshot(config.jev_budget));
 const result={schema_version:'lifecycle-run/v1',condition,status,stopped_code,started_at,finished_at:new Date().toISOString(),wall_ms:performance.now()-started,inputs,candidate_path:candidate,selected_count:lifecycle?.selected_count??(readFileSync(join(dir,'events.jsonl'),'utf8').trim().split('\n').map(line=>JSON.parse(line)).find(e=>e.event==='evidence_updated'&&e.kind==='decision'&&e.stage==='initial_count')?.choice??null),independent_resolved:null,transport:'scoped-mcp-files',actual_billed_usd:null};save('result.json',result);await record({event:'run_finished',...result});console.log(JSON.stringify(result));if(status!=='ready_for_independent_grade')process.exitCode=1;
}
main().catch(error=>{console.error(`LIFECYCLE_START_FAILED: ${/^[A-Z_]+$/.test(error.message)?error.message:'CHECK_PRIVATE_LOGS'}`);process.exitCode=1;});
