#!/usr/bin/env node
// Resume only known failed dispatch. Replays exact local approval receipts, never Jev HTTP.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {createAgentRuleLifecycle,evidenceHash} from '../src/benchmark/agent-rules.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
import {validateEvidenceOutput} from '../src/benchmark/evidence-output.mjs';
import {providerOutcome} from '../src/benchmark/runner.mjs';
const [source,out,spend]=process.argv.slice(2);
if(!out||spend!=='--spend'||process.argv.length!==5)throw new Error('INVALID_ARGUMENTS');
const dir=resolve(out);mkdirSync(dir,{mode:0o700});
const old=JSON.parse(readFileSync(join(source,'result.json'),'utf8'));
if(old.status!=='unverified'||old.native_agent_call_verified!==false)throw new Error('NOT_FAILED_DISPATCH');
const events=readFileSync(join(source,'events.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
const requests=events.filter(e=>e.type==='agent_rules_request');
const responses=events.filter(e=>e.type==='agent_rules_response');
const drafts=events.filter(e=>e.event==='claude_generation').map(e=>e.response);
if(requests.length!==3||responses.length!==3||drafts.length!==2)throw new Error('RECEIPTS_INCOMPLETE');
const initial=requests[0].request.state,changed=requests[1].request.state;
let currentHash=evidenceHash(initial.evidence),g=0,d=0;
const lifecycle=createAgentRuleLifecycle({policy:initial.policy,generate:async()=>drafts[g++],decide:async request=>{
  if(!isDeepStrictEqual(request,requests[d].request))throw new Error('REPLAY_INPUT_MISMATCH');
  return responses[d++].decision;
}});
const first=await lifecycle.create({goal:initial.goal,evidence:initial.evidence,currentEvidenceHash:()=>currentHash});
currentHash=evidenceHash(changed.evidence);
const revised=await lifecycle.update({goal:initial.goal,rules:first.rules,evidence:changed.evidence,currentEvidenceHash:()=>currentHash});
const definitions=await lifecycle.exportClaudeAgent(revised);
if(d!==3||g!==2)throw new Error('REPLAY_COUNT_MISMATCH');
const worker=Object.keys(definitions)[0],parent='jev-dispatcher';
const prompt=`Invoke the Agent tool exactly once with subagent_type ${worker}. Pass all supplied evidence unchanged. Return only the worker JSON. Do not analyze evidence yourself or invoke any other tool.`;
definitions[parent]={description:'Dispatch a Jev-approved role.',prompt,tools:[`Agent(${worker})`],model:'claude-opus-5-5',permissionMode:'dontAsk',omitClaudeMd:true};
const agentsFile=join(dir,'agents.json');writeFileSync(agentsFile,JSON.stringify(definitions,null,2),{flag:'wx',mode:0o600});
const args=['--print','--restricted','--model','claude-opus-5-5','--effort','medium','--agent',parent,'--agents',agentsFile,
'--tools','Agent','--allowedTools',`Agent(${worker})`,'--strict-mcp-config','--mcp-config',join(old.cwd,'mcp.json'),'--setting-sources','',
'--disable-slash-commands','--no-chrome','--permission-mode','dontAsk','--permission-prompts','none','--no-session-persistence','--output-format','stream-json','--verbose'];
const result=await processResult('claude',args,{cwd:old.cwd,env:claudeEnvironment(process.env),input:JSON.stringify(changed.evidence),timeoutMs:180000,killProcessTree:true});
writeFileSync(join(dir,'dispatch.jsonl'),result.stdout,{flag:'wx',mode:0o600});
const outcome=providerOutcome(result,'claude-opus-5-5');
const stream=result.stdout.trim().split('\n').map(JSON.parse);
const content=stream.flatMap(e=>e.message?.content??[]);
const calls=content.filter(c=>c.type==='tool_use'&&['Agent','Task'].includes(c.name));
const replies=content.filter(c=>c.type==='tool_result'&&calls.some(a=>a.id===c.tool_use_id));
let parsed=null;try{parsed=JSON.parse(outcome.completion.result.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{}
const actual=calls.length===1&&calls[0].input?.subagent_type===worker&&replies.length===1&&!replies[0].is_error;
const outputValidation=validateEvidenceOutput(parsed,changed.evidence);
const outputValid=outputValidation.valid;
const summary={status:outcome.status==='completed'&&actual&&outputValid?'completed':'unverified',native_agent_call_verified:actual,output_contract_valid:outputValid,output_validation:outputValidation,worker,rule_version:revised.rules.version,jev_new_calls:0,restored_exact_receipts:d,models:outcome.models,completion:outcome.completion};
writeFileSync(join(dir,'result.json'),JSON.stringify(summary,null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({...summary,completion:undefined}));
if(summary.status!=='completed')process.exitCode=1;
