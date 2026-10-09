#!/usr/bin/env node
// Fixed saved questions; no candidate commands are executed.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {validateRunConfig} from '../src/benchmark/launch.mjs';
import {createTokenBudget} from '../src/benchmark/budget.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {createJevClient,prepareDecision} from '../src/client.mjs';
import {loadConfig} from '../src/config.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
import {providerOutcome} from '../src/benchmark/runner.mjs';

export async function callClaude(request,{cwd,mcpFile,output,systemPrompt}={}) {
  const args=['--print','--restricted','--model','claude-opus-5-5','--effort','medium','--tools','',
    '--strict-mcp-config','--mcp-config',mcpFile,'--setting-sources','','--disable-slash-commands','--no-chrome',
    '--permission-mode','dontAsk','--permission-prompts','none','--no-session-persistence','--output-format','stream-json','--verbose',
    '--system-prompt',systemPrompt??'Answer the supplied typed decision questions using only the supplied evidence. Return only JSON {"answers": {"QUESTION_KEY": {"choice": "CRITERIA_KEY"}}}. Do not execute commands. Do not add explanations.'];
  const started=performance.now();
  const result=await processResult('claude',args,{cwd,env:claudeEnvironment(process.env),input:JSON.stringify(request),timeoutMs:180000,killProcessTree:true});
  const wall_ms=performance.now()-started;
  writeFileSync(output,result.stdout,{flag:'wx',mode:0o600});
  const outcome=providerOutcome(result,'claude-opus-5-5');
  if(outcome.status!=='completed')throw new Error(outcome.code??'CLAUDE_FAILED');
  const final=outcome.completion;
  const response=JSON.parse(final.result.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
  return {provider:'claude',wall_ms,provider_reported_api_ms:final.duration_api_ms??null,models:outcome.models,
    response,usage:final.usage,api_equivalent_usd:final.total_cost_usd??null};
}

async function main(){
  const [configFile,sourceFile,outDir,spend]=process.argv.slice(2);
  if(!outDir||spend!=='--spend'||process.argv.length!==6)throw new Error('USAGE: config trace new-output --spend');
  const config=validateRunConfig(JSON.parse(readFileSync(configFile,'utf8')),dirname(resolve(configFile)));
  const inputs=readFileSync(sourceFile,'utf8').trim().split('\n').map(s=>JSON.parse(s)).filter(e=>e.event==='input');
  const selected=[inputs[0],inputs.find(e=>e.kind==='finish'),inputs.at(-1)];
  if(selected.some(e=>!e?.request))throw new Error('MISSING_REQUEST');
  const dir=resolve(outDir);mkdirSync(dir,{mode:0o700});
  const cwd=mkdtempSync(join(tmpdir(),'jev-fixed-'));
  const mcpFile=join(cwd,'empty-mcp.json');writeFileSync(mcpFile,'{"mcpServers":{}}',{mode:0o600});
  const fd=openSync(join(dir,'events.jsonl'),'wx',0o600);
  const record=async event=>{writeFileSync(fd,JSON.stringify({recorded_at:new Date().toISOString(),...event})+'\n');fsyncSync(fd);};
  let budget;
  const samples=[];
  try{
    budget=createTokenBudget(config.jev_budget);
    const decide=createMeasuredDecider({client:createJevClient(loadConfig()),budget,record,
      identifiers:{run_id:'d024-fixed',attempt_id:'d024-fixed',group_id:'d024-fixed',agent_role:'implementation'}});
    for(let i=0;i<selected.length;i++){
      const request=selected[i].request;prepareDecision(request);
      const hash=createHash('sha256').update(JSON.stringify(request)).digest('hex');
      await record({event:'fixed_input',index:i,source_decision_id:selected[i].decision_id,hash,request});
      const order=i%2?['jev','claude']:['claude','jev'];
      for(const provider of order){
        let result;
        if(provider==='claude')result=await callClaude(request,{cwd,mcpFile,output:join(dir,`claude-${i}.jsonl`)});
        else {const start=performance.now();const response=await decide(request,{decision_id:i+1});result={provider,wall_ms:performance.now()-start,http_ms:response.receipt.durationMs,response};}
        for(const [key,q]of Object.entries(request.questions))if(!Object.hasOwn(q.criteria,result.response.answers?.[key]?.choice??''))throw new Error('INVALID_CHOICE');
        const sample={index:i,hash,...result};samples.push(sample);await record({event:'sample',...sample});
      }
    }
    writeFileSync(join(dir,'result.json'),JSON.stringify({status:'completed',samples,budget:budget.snapshot(),cwd,
      limitations:['n=3 distinct questions, no repeated trials','Claude fresh CLI wall vs Jev reused client with credit/budget overhead','No command execution or correctness gold labels','Sequential alternating order; unequal prompts and transports; not pure inference latency']},null,2),{flag:'wx',mode:0o600});
    console.log(JSON.stringify({status:'completed',samples:samples.map(({index,provider,wall_ms,http_ms,provider_reported_api_ms})=>({index,provider,wall_ms,http_ms,provider_reported_api_ms})),budget:budget.snapshot()}));
  }finally{budget?.close();closeSync(fd);}
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname)main().catch(()=>{console.error('DECISION_EXPERIMENT_STOPPED: inspect private events; no automatic replay');process.exitCode=1;});
