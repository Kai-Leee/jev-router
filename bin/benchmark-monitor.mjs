#!/usr/bin/env node
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,openSync,writeSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,join,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {readSnapshot} from '../src/dashboard/reader.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {writePrivateJson} from '../src/benchmark/runner.mjs';
import {MONITOR_MODEL,monitorArguments,monitorDefinition,monitorCompletion,monitorFingerprint,monitorTerminal,finishMonitor} from '../src/benchmark/monitor.mjs';

const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}$/.test(value);
const cancellation=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>cancellation.abort());
function writeAll(fd,value){const bytes=Buffer.isBuffer(value)?value:Buffer.from(value);let offset=0;while(offset<bytes.length){const n=writeSync(fd,bytes,offset,bytes.length-offset);if(n<=0)throw new Error('MONITOR_RECORD_FAILED');offset+=n;}fsyncSync(fd);}
async function main() {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help') {
    console.log('Usage: node bin/benchmark-monitor.mjs --run-dir PATH --output-root PATH [--watch] [--spend]\nSeparate no-tool Opus 5.5 monitoring agent. --watch follows meaningful state transitions until runner terminal; no call-count cap or uncertain-call replay.');return;
  }
  let runDir,outputRoot,watch=false,spend=false;
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--run-dir'&&args[i+1])runDir=resolve(args[++i]);
    else if(args[i]==='--output-root'&&args[i+1])outputRoot=resolve(args[++i]);
    else if(args[i]==='--watch')watch=true;
    else if(args[i]==='--spend')spend=true;
    else throw new Error('INVALID_ARGUMENTS');
  }
  if(!runDir||!outputRoot)throw new Error('INVALID_ARGUMENTS');
  const manifest=JSON.parse(readFileSync(join(runDir,'manifest.json'),'utf8'));
  const groupId=manifest.group_id??manifest.run_id??basename(runDir);
  if(!safeId(groupId))throw new Error('INVALID_GROUP_ID');
  if(!spend){console.log(JSON.stringify({status:'prepared_not_executed',model:MONITOR_MODEL,agent_role:'monitor',group_id:groupId,call_count_limit:null,watch}));return;}
  mkdirSync(outputRoot,{recursive:true,mode:0o700});
  const role=readFileSync(fileURLToPath(new URL('../docs/agents/OPUS_BENCHMARK_MONITOR.md',import.meta.url)),'utf8');
  // The monitor receives sanitized projections only, with no host tool or MCP access.
  const session=mkdtempSync(join(tmpdir(),'jev-opus-monitor-'));
  const agentsFile=join(session,'agents.json'),mcpFile=join(session,'mcp.json');
  writeFileSync(agentsFile,JSON.stringify(monitorDefinition(role)),{mode:0o600,flag:'wx'});
  writeFileSync(mcpFile,'{"mcpServers":{}}',{mode:0o600,flag:'wx'});
  const env=claudeEnvironment(process.env,{auth:'cli'});
  const endAt=Date.now()+((manifest.wall_timeout_seconds??14400)+60)*1000;
  let previous=null,observations=0;
  while(!cancellation.signal.aborted) {
    const snapshot=readSnapshot([runDir]);
    const run=snapshot.runs.find(r=>r.id===`r0-${basename(runDir)}`);
    if(!run)throw new Error('MONITOR_SOURCE_UNAVAILABLE');
    const fingerprint=monitorFingerprint(run);
    if(fingerprint!==previous) {
      previous=fingerprint;
      const id=`monitor-${randomUUID()}`,dir=join(outputRoot,id);
      mkdirSync(dir,{mode:0o700});
      const ids={run_id:id,attempt_id:id,group_id:groupId,agent_role:'monitor'};
      const save=(name,value,atomic=false)=>writePrivateJson(join(dir,name),value,{atomic});
      save('manifest.json',{schema_version:'jev-benchmark-monitor/v1',...ids,mode:'monitor',workload:'monitoring',evidence_kind:'live',
        started_at:new Date().toISOString(),model:MONITOR_MODEL,max_decisions:null,claude_max_budget_usd:null,wall_timeout_seconds:180,
        source_run_id:manifest.run_id??null,source_fingerprint:fingerprint});
      save('observation.json',{generated_at:snapshot.generated_at,run});
      const eventFd=openSync(join(dir,'runner.jsonl'),'wx',0o600);
      const streamFd=openSync(join(dir,'claude.stream.jsonl'),'wx',0o600);
      const event=(name,phase,status,code=null)=>writeAll(eventFd,JSON.stringify({...ids,recorded_at:new Date().toISOString(),event:name,phase,status,code})+'\n');
      const heartbeat=()=>save('runner-heartbeat.json',{...ids,pid:process.pid,recorded_at:new Date().toISOString(),phase:'provider'},true);
      const started=performance.now();let summary;
      event('runner_started','initializing','running');event('provider_started','provider','running');heartbeat();
      const timer=setInterval(()=>{try {heartbeat();}catch{cancellation.abort();}},5000);
      try {
        const result=await processResult('claude',monitorArguments(agentsFile,mcpFile),{cwd:session,env,
          input:JSON.stringify({instruction:'Assess this benchmark observation under your monitor role. Return the required JSON only.',observation:run}),
          timeoutMs:180000,maxBytes:2000000,killProcessTree:true,abortSignal:cancellation.signal,onStdout:chunk=>writeAll(streamFd,chunk)});
        const completed=monitorCompletion(result);
        summary={...ids,runner_status:completed.status,runner_error_code:completed.code,finished_at:new Date().toISOString(),
          process_exit:result.exit_code,outcome_uncertain:result.outcome_uncertain,duration_ms:Math.round(performance.now()-started),
          requested_model:MONITOR_MODEL,observed_model_ids:completed.models,model_identity_verified:completed.identity,
          claude_usage:completed.final?.usage??null,claude_model_usage:completed.final?.modelUsage??null,
          claude_reported_cost_usd:completed.final?.total_cost_usd??null,claude_is_error:completed.final?.is_error??null,
          claude_result_subtype:completed.final?.subtype??null,artifact_frozen:true,evaluator_success:null,automatic_retries:0};
        if(completed.report)save('monitor-report.json',completed.report);
        event('provider_finished','provider',completed.status,completed.code);
        event('runner_finalizing','finalizing','running');event('artifact_frozen','finalizing','completed');
        summary=finishMonitor(summary,{save:(value,atomic)=>save('result.json',value,atomic),event:value=>event('runner_terminal','terminal',value.runner_status,value.runner_error_code)});
      } catch {
        summary={...summary,...ids,runner_status:'uncertain',runner_error_code:'MONITOR_RECORD_OR_START_FAILED',outcome_uncertain:true,finished_at:new Date().toISOString(),automatic_retries:0};
        try {save('result.json',summary,true);}catch{}
      } finally {clearInterval(timer);closeSync(streamFd);closeSync(eventFd);}
      observations++;
      console.log(JSON.stringify({observation:observations,output_dir:dir,runner_status:summary.runner_status,model_identity_verified:summary.model_identity_verified??false}));
      if(summary.runner_status!=='completed'){process.exitCode=1;return;}
    }
    if(!watch||monitorTerminal(run))return;
    if(Date.now()>endAt)throw new Error('MONITOR_WATCH_DEADLINE');
    await delay(3000,undefined,{signal:cancellation.signal});
  }
}
main().catch(error=>{console.error(JSON.stringify({error:/^[A-Z_]+$/.test(error.message)?error.message:'MONITOR_FAILED',automatic_retries:0}));process.exitCode=1;});
