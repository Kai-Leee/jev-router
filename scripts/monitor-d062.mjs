#!/usr/bin/env node
import{readFileSync,writeFileSync,mkdirSync,mkdtempSync}from'node:fs';
import{resolve,join}from'node:path';import{tmpdir}from'node:os';import{performance}from'node:perf_hooks';
import{monitorArguments,monitorDefinition,monitorCompletion}from'../src/benchmark/monitor.mjs';
import{processResult}from'../src/benchmark/docker.mjs';import{claudeEnvironment}from'../src/benchmark/claude-env.mjs';
if(process.argv[2]!=='--spend')throw Error('EXPLICIT_SPEND_REQUIRED');
const root=resolve(import.meta.dirname,'..'),dir=join(root,'benchmark-runs/d062-monitor-01');
const packet=JSON.parse(readFileSync(join(root,'benchmark-runs/d062-live-01/analysis.json')));
mkdirSync(dir,{mode:0o700});const save=(n,x)=>writeFileSync(join(dir,n),JSON.stringify(x,null,2)+'\n',{mode:0o600,flag:'wx'});
save('observation.json',packet);
const cwd=mkdtempSync(join(tmpdir(),'jev-d062-monitor-')),agents=join(cwd,'agents.json'),mcp=join(cwd,'mcp.json');
const role=readFileSync(join(root,'docs/agents/D062_OPUS_MONITOR.md'),'utf8');
writeFileSync(agents,JSON.stringify(monitorDefinition(role)),{mode:0o600});writeFileSync(mcp,'{"mcpServers":{}}',{mode:0o600});
save('started.json',{model:'claude-opus-5-5',effort:'medium',started_at:new Date().toISOString(),automatic_retries:0});
const start=performance.now();
try{
const raw=await processResult('claude',monitorArguments(agents,mcp),{cwd,env:claudeEnvironment(process.env),input:JSON.stringify(packet),timeoutMs:14400000,maxBytes:4000000,killProcessTree:true});
writeFileSync(join(dir,'stdout.jsonl'),raw.stdout,{mode:0o600,flag:'wx'});writeFileSync(join(dir,'stderr.log'),raw.stderr,{mode:0o600,flag:'wx'});
const c=monitorCompletion(raw);const result={status:c.status,code:c.code,models:c.models,identity:c.identity,wall_ms:performance.now()-start,usage:c.final?.usage??null,api_equivalent_usd:c.final?.total_cost_usd??null,actual_billed_usd:null,report:c.report};save('result.json',result);console.log(JSON.stringify(result));if(c.status!=='completed')process.exitCode=1;
}catch{save('failure.json',{status:'uncertain',automatic_retries:0});process.exitCode=1;}
