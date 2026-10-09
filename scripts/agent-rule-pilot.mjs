#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,openSync,fsyncSync,closeSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {validateRunConfig} from '../src/benchmark/launch.mjs';
import {createTokenBudget} from '../src/benchmark/budget.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {createJevClient} from '../src/client.mjs';
import {loadConfig} from '../src/config.mjs';
import {createAgentRuleLifecycle,evidenceHash} from '../src/benchmark/agent-rules.mjs';
import {callClaude} from './decision-latency.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
import {validateEvidenceOutput} from '../src/benchmark/evidence-output.mjs';
import {providerOutcome} from '../src/benchmark/runner.mjs';

let budget,fd;
try {
  const [configFile,out,spend]=process.argv.slice(2);
  if(!out||spend!=='--spend'||process.argv.length!==5)throw new Error('INVALID_ARGUMENTS');
  const config=validateRunConfig(JSON.parse(readFileSync(configFile,'utf8')),dirname(resolve(configFile)));
  const dir=resolve(out);mkdirSync(dir,{mode:0o700});
  const cwd=mkdtempSync(join(tmpdir(),'jev-rules-'));
  const mcpFile=join(cwd,'mcp.json');writeFileSync(mcpFile,'{"mcpServers":{}}',{mode:0o600});
  fd=openSync(join(dir,'events.jsonl'),'wx',0o600);
  const record=async event=>{writeFileSync(fd,JSON.stringify({recorded_at:new Date().toISOString(),...event})+'\n');fsyncSync(fd);};
  budget=createTokenBudget(config.jev_budget);
  const measured=createMeasuredDecider({client:createJevClient(loadConfig()),budget,record,
    identifiers:{run_id:'d024-rules',attempt_id:'d024-rules',group_id:'d024-rules',agent_role:'implementation'}});
  let generation=0,decision=0;
  const goal='Create a no-tools Claude subagent that extracts observable completion evidence from a supplied benchmark result. Report missing evidence. Do not decide completion, rewrite implementation, or claim independent tests ran. Jev handles semantic rule validation and update decisions.';
  const evidence={revision:'initial',items:[{id:'source-result',content:'Actual saved benchmark: e2eswe-d022-05 completed with 7 commands, 4 finish calls; separate original-artifact grader passed 30/30. The worker sees only supplied text, not files.'},{id:'output-contract',content:'Return JSON with observed_facts and missing_evidence arrays. Reference supplied evidence IDs. Never infer test success from an exit code alone.'}]};
  let currentHash=evidenceHash(evidence);
  const lifecycle=createAgentRuleLifecycle({policy:{allowedTools:[],workspace:cwd},record,
    generate:async request=>{const result=await callClaude(request,{cwd,mcpFile,output:join(dir,`generation-${++generation}.jsonl`),systemPrompt:request.instructions});await record({event:'claude_generation',...result});return result.response;},
    decide:request=>measured(request,{decision_id:++decision})});
  const initial=await lifecycle.create({goal,evidence,currentEvidenceHash:()=>currentHash});
  await record({event:'initial_result',result:initial});
  if(initial.status!=='accepted')throw new Error('INITIAL_RULES_NOT_ACCEPTED');
  // Explicit changed-contract fixture, not a fabricated production failure.
  const changed={revision:'contract-fixture-v2',items:[...evidence.items,{id:'new-contract-fixture',content:'Validation fixture: the consumer now requires an additional top-level JSON field evidence_revision with the exact supplied revision string. The previous output contract did not require this field. Update the output and acceptance rules to enforce its presence and exact match.'}]};
  currentHash=evidenceHash(changed);
  const updated=await lifecycle.update({goal,rules:initial.rules,evidence:changed,currentEvidenceHash:()=>currentHash});
  await record({event:'updated_result',result:updated});
  if(!['accepted','keep'].includes(updated.status))throw new Error('UPDATED_RULES_NOT_ACCEPTED');
  const definitions=await lifecycle.exportClaudeAgent(updated);
  const worker=Object.keys(definitions)[0];
  const parent='jev-dispatcher';
  const prompt=`You are a mechanical dispatcher. Invoke the Agent tool exactly once with subagent_type ${worker}, passing the complete supplied evidence unchanged. Do not analyze it yourself. Return the worker JSON as your final response. Do not perform any other operation.`;
  definitions[parent]={description:'Dispatch a Jev-approved evidence extraction role.',prompt,tools:[`Agent(${worker})`],model:'claude-opus-5-5',permissionMode:'dontAsk',omitClaudeMd:true};
  const agentsFile=join(dir,'agents.json');writeFileSync(agentsFile,JSON.stringify(definitions,null,2),{flag:'wx',mode:0o600});
  const args=['--print','--restricted','--model','claude-opus-5-5','--effort','medium','--agent',parent,'--agents',agentsFile,
    '--tools','Agent','--allowedTools',`Agent(${worker})`,'--strict-mcp-config','--mcp-config',mcpFile,'--setting-sources','',
    '--disable-slash-commands','--no-chrome','--permission-mode','dontAsk','--permission-prompts','none',
    '--no-session-persistence','--output-format','stream-json','--verbose'];
  const result=await processResult('claude',args,{cwd,env:claudeEnvironment(process.env),input:JSON.stringify(changed),timeoutMs:180000,killProcessTree:true});
  writeFileSync(join(dir,'dispatch.jsonl'),result.stdout,{flag:'wx',mode:0o600});
  const outcome=providerOutcome(result,'claude-opus-5-5');
  const events=result.stdout.trim().split('\n').map(line=>JSON.parse(line));
  const calls=events.flatMap(e=>e.message?.content??[]).filter(c=>c.type==='tool_use'&&c.name==='Agent');
  const replies=events.flatMap(e=>e.message?.content??[]).filter(c=>c.type==='tool_result'&&calls.some(a=>a.id===c.tool_use_id));
  const actual=calls.length===1&&calls[0].input?.subagent_type===worker&&replies.length===1&&!replies[0].is_error;
  let parsed=null;try{parsed=JSON.parse(outcome.completion.result.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));}catch{}
  const outputValidation=validateEvidenceOutput(parsed,changed);
  const summary={status:outcome.status==='completed'&&actual&&outputValidation.valid?'completed':'unverified',output_validation:outputValidation,generation_calls:generation,jev_calls:decision,
    initial_status:initial.status,updated_status:updated.status,rule_version:updated.rules.version,
    native_agent_call_verified:actual,models:outcome.models,completion:outcome.completion,budget:budget.snapshot(),cwd,
    limitations:['No-tools evidence extraction only, not coding E2E speed proof','Changed output contract is a declared fixture','Not installed in global Claude configuration','Existing benchmark gate remains a comparison baseline']};
  writeFileSync(join(dir,'result.json'),JSON.stringify(summary,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({...summary,completion:undefined}));
  if(summary.status!=='completed')process.exitCode=1;
} catch {console.error('RULE_PILOT_STOPPED: inspect private events; no automatic replay');process.exitCode=1;}
finally{budget?.close();if(fd!==undefined)closeSync(fd);}
