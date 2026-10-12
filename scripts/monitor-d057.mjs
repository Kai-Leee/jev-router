#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {monitorArguments,monitorDefinition,monitorCompletion} from '../src/benchmark/monitor.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
const root=resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(p,'utf8'));
async function main(){
 if(process.argv[2]!=='--spend')throw Error('EXPLICIT_SPEND_REQUIRED');
 const runs=['d057-claude-01','d057-jev-01'].map(name=>{
  const dir=join(root,'benchmark-runs',name),result=read(join(dir,'result.json')),protocol=read(join(dir,'protocol.json'));
  const plan=existsSync(join(dir,'planning/plan.json'))?read(join(dir,'planning/plan.json')):null;
  const grade=result.independent_grade;
  return {name,result:{...result,independent_grade:grade?{grading_status:grade.grading_status,resolved:grade.resolved,reward:grade.reward,summary:grade.summary,expected_test_count:grade.expected_test_count,observed_test_records:grade.observed_test_records,container_removed:grade.container_removed}:null},
   protocol:{...protocol,sources:protocol.sources.map(({path,sha256})=>({path,sha256}))},
   plan_summary:plan?{status:plan.status,metrics:plan.metrics,issues:plan.issues,leaves:plan.tasks.filter(t=>!t.children.length).map(t=>({id:t.id,obligations:t.obligation_ids.length,paths:t.write_scope,review:t.review}))}:null};
 });
 const comparable=runs.every(r=>r.result.valid_completion_comparison===true);
 const packet={experiment:'D057 whole-workflow product completion comparison',runs,
  comparison:comparable?{claude_wall_ms:runs[0].result.completion_wall_ms,jev_wall_ms:runs[1].result.completion_wall_ms,speed_change_percent:(runs[0].result.completion_wall_ms-runs[1].result.completion_wall_ms)/runs[0].result.completion_wall_ms*100,denominator:'Claude full completion wall time'}:{speed_change_percent:null,reason:'Both valid completions required'},
  boundaries:['Sequential single attempt per condition; shared interface scaffold supplied to both.','No hidden grader contents supplied; only aggregate grader result.','Monitoring is separate from development completion.','Jev batch planning is a new version, not free reuse of D056.']};
 const dir=join(root,'benchmark-runs/d057-monitor-01');mkdirSync(dir,{mode:0o700});
 const save=(name,x)=>writeFileSync(join(dir,name),JSON.stringify(x,null,2)+'\n',{mode:0o600,flag:'wx'});save('observation.json',packet);
 const cwd=mkdtempSync(join(tmpdir(),'jev-d057-monitor-')),agents=join(cwd,'agents.json'),mcp=join(cwd,'mcp.json');
 const role=readFileSync(join(root,'docs/agents/D057_OPUS_MONITOR.md'),'utf8');
 writeFileSync(agents,JSON.stringify(monitorDefinition(role)),{mode:0o600});writeFileSync(mcp,'{"mcpServers":{}}',{mode:0o600});
 save('started.json',{model:'claude-opus-5-5',effort:'medium',role_sha256:createHash('sha256').update(role).digest('hex'),automaticRetries:0,started_at:new Date().toISOString()});
 const t=performance.now(),raw=await processResult('claude',monitorArguments(agents,mcp),{cwd,env:claudeEnvironment(process.env),input:JSON.stringify(packet),timeoutMs:14400000,maxBytes:4000000,killProcessTree:true});
 writeFileSync(join(dir,'stdout.jsonl'),raw.stdout,{mode:0o600,flag:'wx'});writeFileSync(join(dir,'stderr.log'),raw.stderr,{mode:0o600,flag:'wx'});
 const c=monitorCompletion(raw),result={status:c.status,code:c.code,models:c.models,identity:c.identity,wall_ms:performance.now()-t,usage:c.final?.usage??null,api_equivalent_usd:c.final?.total_cost_usd??null,actual_billed_usd:null,report:c.report};
 save('result.json',result);console.log(JSON.stringify(result));if(c.status!=='completed')process.exitCode=1;
}
main().catch(()=>{console.error('D057_MONITOR_FAILED_NO_RETRY');process.exitCode=1;});
