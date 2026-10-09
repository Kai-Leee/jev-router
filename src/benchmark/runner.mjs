import { readFileSync, mkdirSync, mkdtempSync, openSync, writeSync, fsyncSync, closeSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { claudeArguments } from './launch.mjs';
import { inspectSandbox, processResult } from './docker.mjs';
import { createJevClient } from '../client.mjs';
import { loadConfig } from '../config.mjs';
import { claudeEnvironment } from './claude-env.mjs';
import {createTokenBudget,BUDGET_ERROR_CODES} from './budget.mjs';

const CODES = new Set(['INVALID_BRIEF','BRIEF_UNAVAILABLE','CLAUDE_AUTH_REQUIRED','CLAUDE_AUTH_CHECK_FAILED',
  'UNSAFE_SANDBOX','SANDBOX_UNAVAILABLE','INVALID_SANDBOX_RESPONSE','JEV_MODEL_UNAVAILABLE','JEV_PREFLIGHT_FAILED',
  'CLAUDE_VERSION_UNAVAILABLE','PROCESS_START_FAILED','PROCESS_ABORTED','TIMEOUT','OUTPUT_LIMIT','OUTPUT_WRITE_FAILED',
  'RUNNER_RECORD_FAILED','RUNNER_STOP_REQUESTED','PROVIDER_FAILED','PROVIDER_FINAL_MISSING','PROVIDER_FINAL_INVALID',
  'PROVIDER_FINAL_CONFLICT','MODEL_IDENTITY_MISMATCH','MODEL_IDENTITY_UNVERIFIED','ARTIFACT_FREEZE_FAILED',
  'GATE_COMPLETION_UNCONFIRMED','GATE_STOPPED','GATE_STATE_INVALID','RUNNER_INTERNAL_ERROR','JEV_BUDGET_REQUIRED',...BUDGET_ERROR_CODES]);
export const safeRunnerCode = error => CODES.has(error?.message) ? error.message : 'RUNNER_INTERNAL_ERROR';
const ids = config => Object.fromEntries(['run_id','attempt_id','group_id','agent_role'].map(key => [key,config[key]]));
const sha = value => createHash('sha256').update(value).digest('hex');

function writeAll(fd, value) {
  const data = Buffer.isBuffer(value) ? value : Buffer.from(value);
  let offset=0;
  while(offset<data.length) {const written=writeSync(fd,data,offset,data.length-offset);if(written<=0)throw new Error('RUNNER_RECORD_FAILED');offset+=written;}
  fsyncSync(fd);
}

export function writePrivateJson(path, value, { atomic=false }={}) {
  const target=atomic?`${path}.${randomUUID()}.tmp`:path;
  let fd;
  try {fd=openSync(target,'wx',0o600);writeAll(fd,JSON.stringify(value,null,2)+'\n');closeSync(fd);fd=undefined;if(atomic)renameSync(target,path);}
  catch {if(fd!==undefined)try{closeSync(fd);}catch{};if(atomic)try{unlinkSync(target);}catch{};throw new Error('RUNNER_RECORD_FAILED');}
}

export function readBrief(config) {
  let contents;
  try {contents=config.instructions.map(path=>readFileSync(path));}catch{throw new Error('BRIEF_UNAVAILABLE');}
  const prompt=contents.map(value=>value.toString('utf8')).join('\n\n');
  if(!prompt.trim()||Buffer.byteLength(prompt)>150000)throw new Error('INVALID_BRIEF');
  return {prompt,brief_sha256:sha(prompt),instruction_sha256:contents.map((value,i)=>({path:config.instructions[i],sha256:sha(value)}))};
}

export function providerOutcome(result, model) {
  let completion=null;let finalCount=0;let malformed=false;
  for(const line of (result?.stdout??'').split('\n')) {
    if(!line.trim())continue;
    try {const item=JSON.parse(line);if(item?.type==='result'){completion=item;finalCount++;}}
    catch{malformed=true;}
  }
  const models=completion?.modelUsage&&typeof completion.modelUsage==='object'&&!Array.isArray(completion.modelUsage)?Object.keys(completion.modelUsage):[];
  const identity=models.length>0&&models.every(id=>id===model);
  let status='completed',code=null;
  if(result?.outcome_uncertain){status='uncertain';code=CODES.has(result.interrupted)?result.interrupted:'PROVIDER_FAILED';}
  else if(result?.exit_code!==0){status='failed';code='PROVIDER_FAILED';}
  else if(finalCount!==1){status='uncertain';code=finalCount?'PROVIDER_FINAL_CONFLICT':'PROVIDER_FINAL_MISSING';}
  else if(malformed||typeof completion.is_error!=='boolean'||typeof completion.subtype!=='string'){status='uncertain';code='PROVIDER_FINAL_INVALID';}
  else if(completion.is_error||completion.subtype!=='success'){status='failed';code='PROVIDER_FAILED';}
  else if(!identity){status=models.some(id=>id!==model&&!id.startsWith(`${model}-`))?'failed':'uncertain';code=status==='failed'?'MODEL_IDENTITY_MISMATCH':'MODEL_IDENTITY_UNVERIFIED';}
  return {status,code,completion,models,identity};
}

export async function executeBenchmarkRun(config, {
  runCommand=processResult, inspect=inspectSandbox, runProvider=processResult,
  lookupModels=async()=>createJevClient(loadConfig()).listModels(), env=process.env,
  now=()=>new Date().toISOString(), heartbeatMs=3000, manageSignals=true,
  jsonWriter=writePrivateJson,
}={}) {
  // Do not reuse, overwrite, or append to a prior attempt, even for failed preflight.
  mkdirSync(config.output_dir,{mode:0o700});
  const path=name=>join(config.output_dir,name),identifiers=ids(config),started=performance.now();
  const controller=new AbortController();let phase='initializing',journal,heartbeat,recordFailure=false;
  let sandbox=null,cleanup=null,provider=null,providerState=null,session=null,stage='preflight';
  let status='failed',code=null,summary=null;
  const save=(name,value,atomic=false)=>jsonWriter(path(name),value,{atomic});
  const beat=()=>save('runner-heartbeat.json',{...identifiers,pid:process.pid,recorded_at:now(),phase},true);
  const event=(name,nextPhase,nextStatus,eventCode=null)=>{
    phase=nextPhase;
    try {writeAll(journal,JSON.stringify({recorded_at:now(),event:name,phase,status:nextStatus,code:eventCode,...identifiers})+'\n');beat();}
    catch{recordFailure=true;controller.abort('RUNNER_RECORD_FAILED');throw new Error('RUNNER_RECORD_FAILED');}
  };
  const safelyEvent=(...args)=>{try{event(...args);return true;}catch{return false;}};
  const stopRequested=()=>controller.abort('RUNNER_STOP_REQUESTED');
  const checkStop=()=>{if(controller.signal.aborted)throw new Error(controller.signal.reason);};
  const freeze=async()=>{
    if(!sandbox)return null;
    const record={container_id:sandbox.Id,stopped:false};
    try {
      await runCommand('docker',['stop','--time','1',sandbox.Id],{timeoutMs:15000});
      const checked=await runCommand('docker',['container','inspect',sandbox.Id],{timeoutMs:15000});
      const info=JSON.parse(checked.stdout)[0];
      record.stopped=checked.exit_code===0&&!checked.outcome_uncertain&&info?.Id===sandbox.Id&&info.State?.Running===false;
    }catch{}
    return record;
  };
  try {
    save('manifest.json',{...config,...identifiers,evidence_kind:'live',started_at:now(),
      workload:config.instructions.some(p=>p.includes('personal-os'))?'personal-os':config.instructions.some(p=>p.includes('E2E-SWE'))?'e2e-swe':'smoke',
      actual_container_id:null,actual_image_id:null,preflight_status:'pending',controller:config.workflow??'structured-selection-v1',
      context_isolation:config.auth==='api-key'?'bare':'restricted_cli_context_not_yet_verified'});
    journal=openSync(path('runner.jsonl'),'wx',0o600);
    event('runner_started','initializing','running');
    heartbeat=setInterval(()=>{try{beat();}catch{recordFailure=true;controller.abort('RUNNER_RECORD_FAILED');}},heartbeatMs);
    heartbeat.unref();
    if(manageSignals){process.on('SIGINT',stopRequested);process.on('SIGTERM',stopRequested);}
    event('preflight_started','preflight','running');
    if(config.mode==='jev'&&!config.jev_budget)throw new Error('JEV_BUDGET_REQUIRED');
    if(config.mode==='jev') {
      const allowance=createTokenBudget(config.jev_budget);
      try {const state=allowance.snapshot();if(state.blocked_code)throw new Error(state.blocked_code);}
      finally {allowance.close();}
    }
    const brief=readBrief(config);checkStop();
    const providerEnv=claudeEnvironment(env,{auth:config.auth,includeJev:true});
    const auth=await runCommand('claude',['auth','status','--json'],{env:providerEnv});checkStop();
    if(auth.exit_code!==0||auth.outcome_uncertain)throw new Error('CLAUDE_AUTH_CHECK_FAILED');
    let authOk=false;try{authOk=JSON.parse(auth.stdout).loggedIn===true;}catch{}
    if(config.auth==='api-key'?!env.ANTHROPIC_API_KEY:!authOk)throw new Error('CLAUDE_AUTH_REQUIRED');
    sandbox=await inspect(config.container);checkStop();
    let modelNames=null;
    if(config.mode==='jev') {
      let models;try{models=await lookupModels();}catch{throw new Error('JEV_PREFLIGHT_FAILED');}checkStop();
      if(!Array.isArray(models?.models)||!models.models.some(item=>item.name==='jev-latest'))throw new Error('JEV_MODEL_UNAVAILABLE');
      modelNames=models.models.map(item=>item.name).filter(name=>typeof name==='string'&&/^[a-zA-Z0-9_.-]{1,100}$/.test(name));
    }
    const version=await runCommand('claude',['--version']);checkStop();
    if(version.exit_code!==0||version.outcome_uncertain)throw new Error('CLAUDE_VERSION_UNAVAILABLE');
    save('preflight.json',{...identifiers,recorded_at:now(),status:'completed',actual_container_id:sandbox.Id,
      actual_image_id:sandbox.Image,model_names:modelNames,cli_version:version.stdout.trim().slice(0,160),
      brief_sha256:brief.brief_sha256,instruction_sha256:brief.instruction_sha256});
    const briefFd=openSync(path('brief.txt'),'wx',0o600);try{writeAll(briefFd,brief.prompt);}finally{closeSync(briefFd);}
    session=mkdtempSync(join(tmpdir(),'jev-benchmark-session-'));
    const serverConfig=path('server.json'),mcpConfig=path('mcp.json');
    save('server.json',{...identifiers,mode:config.mode,container:config.container,max_decisions:config.max_decisions,
      ...(config.workflow?{workflow:config.workflow,trustedBrief:brief.prompt}:{}),
      ...(config.jev_budget?{jev_budget:config.jev_budget}:{}),trace_path:path('decisions.jsonl'),gate_state_path:path('gate-state.json')});
    save('mcp.json',{mcpServers:{jev_benchmark:{command:process.execPath,args:[fileURLToPath(new URL('../../bin/benchmark-mcp.mjs',import.meta.url)),'--config',serverConfig]}}});
    const stream=openSync(path('claude.stream.jsonl'),'wx',0o600);
    try {
      checkStop();event('provider_started','provider','running');stage='provider';
      provider=await runProvider('claude',claudeArguments(config,mcpConfig),{cwd:session,env:providerEnv,input:brief.prompt,
        timeoutMs:config.wall_timeout_seconds*1000,maxBytes:20_000_000,killProcessTree:true,abortSignal:controller.signal,onStdout:chunk=>writeAll(stream,chunk)});
    }finally{closeSync(stream);}
    providerState=providerOutcome(provider,config.model);
    event('provider_finished','provider',providerState.status,providerState.code);
    status=providerState.status;code=providerState.code;
  }catch(error){
    code=safeRunnerCode(error);status=stage==='provider'&&code!=='PROCESS_START_FAILED'?'uncertain':'failed';
    if(stage==='preflight')safelyEvent('preflight_failed','preflight','failed',code);
    else if(!providerState)safelyEvent('provider_finished','provider',status,code);
  }finally{
    if(journal!==undefined)safelyEvent('runner_finalizing','finalizing','running');
    cleanup=await freeze();
    if(cleanup?.stopped&&journal!==undefined)safelyEvent('artifact_frozen','finalizing','completed');
    if(sandbox&&!cleanup?.stopped){status='uncertain';code='ARTIFACT_FREEZE_FAILED';}
    if(controller.signal.aborted){status='uncertain';code=controller.signal.reason;}
    if(status==='completed') {
      try {
        const gate=JSON.parse(readFileSync(path('gate-state.json'),'utf8'));
        if(['run_id','attempt_id','group_id','agent_role'].some(key=>gate[key]!==identifiers[key]))throw new Error('GATE_STATE_INVALID');
        if(gate.state==='stopped'){status=gate.outcome_uncertain?'uncertain':'failed';code='GATE_STOPPED';}
        else if(gate.outcome_uncertain===true||gate.journal_healthy===false||gate.state_recording_failed===true){status='uncertain';code='GATE_STATE_INVALID';}
        else if(gate.state!=='completed'||gate.completion_claimed!==true){status='uncertain';code='GATE_COMPLETION_UNCONFIRMED';}
      }catch(error){status='uncertain';code=error?.message==='GATE_STATE_INVALID'?'GATE_STATE_INVALID':'GATE_COMPLETION_UNCONFIRMED';}
    }
    if(recordFailure){status='uncertain';code='RUNNER_RECORD_FAILED';}
    const completion=providerState?.completion??null;
    summary={...identifiers,runner_status:status,runner_error_code:code,finished_at:now(),
      process_exit:provider?.exit_code??null,outcome_uncertain:status==='uncertain',interruption:provider?.interrupted??null,
      duration_ms:Math.round(performance.now()-started),observed_model_ids:providerState?.models??[],requested_model:config.model,
      model_identity_verified:providerState?.identity??false,claude_reported_cost_usd:completion?.total_cost_usd??null,
      claude_usage:completion?.usage??null,claude_model_usage:completion?.modelUsage??null,claude_is_error:completion?.is_error??null,
      claude_result_subtype:completion?.subtype??null,jev_cost_usd:null,evaluator_success:null,
      session_directory:session,cleanup,artifact_frozen:cleanup?.stopped===true,automatic_retries:0};
    try {
      if(provider){const fd=openSync(path('claude.stderr.log'),'wx',0o600);try{writeAll(fd,provider.stderr);}finally{closeSync(fd);}}
      if(completion)save('claude.stdout.json',completion);
    }catch{summary.runner_status='uncertain';summary.outcome_uncertain=true;summary.runner_error_code='RUNNER_RECORD_FAILED';}
    clearInterval(heartbeat);
    if(manageSignals){process.removeListener('SIGINT',stopRequested);process.removeListener('SIGTERM',stopRequested);}
    // Result is persisted before terminal: readers can see finalization but never a premature terminal.
    try {
      save('result.json',summary);
      if(journal!==undefined&&!safelyEvent('runner_terminal','terminal',summary.runner_status,summary.runner_error_code)) {
        summary.runner_status='uncertain';summary.outcome_uncertain=true;summary.runner_error_code='RUNNER_RECORD_FAILED';
        save('result.json',summary,true);
      }
    }catch{
      summary.runner_status='uncertain';summary.outcome_uncertain=true;summary.runner_error_code='RUNNER_RECORD_FAILED';
      if(journal!==undefined)safelyEvent('runner_terminal','terminal','uncertain','RUNNER_RECORD_FAILED');
    }
    if(journal!==undefined)try{closeSync(journal);}catch{}
  }
  return summary;
}
