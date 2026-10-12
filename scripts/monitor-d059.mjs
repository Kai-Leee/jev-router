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
 const runs=['d057-claude-01','d059-e2e-02'].map(name=>{
  const dir=join(root,'benchmark-runs',name),result=read(join(dir,'result.json')),protocol=read(join(dir,'protocol.json'));
  const plan=existsSync(join(dir,'planning/plan.json'))?read(join(dir,'planning/plan.json')):null;
  const grade=result.independent_grade;
  return {name,result:{...result,independent_grade:grade?{grading_status:grade.grading_status,resolved:grade.resolved,reward:grade.reward,summary:grade.summary,expected_test_count:grade.expected_test_count,observed_test_records:grade.observed_test_records,container_removed:grade.container_removed}:null},
   protocol:{...protocol,sources:protocol.sources.map(({path,sha256})=>({path,sha256}))},
   plan_summary:plan?{status:plan.status,metrics:plan.metrics,issues:plan.issues,leaves:plan.tasks.filter(t=>!t.children?.length).map(t=>({id:t.id,obligations:t.obligation_ids.length,paths:t.paths??t.write_scope,profile:t.profile,depends_on:t.depends_on,allocation_method:t.allocation_method}))}:null};
 });
 const comparable=runs.every(r=>r.result.valid_completion_comparison===true);
 const packet={experiment:'D059 sequential allocation and profile-routing actual development',runs,
  comparison:comparable?{claude_wall_ms:runs[0].result.completion_wall_ms,jev_wall_ms:runs[1].result.completion_wall_ms,speed_change_percent:(runs[0].result.completion_wall_ms-runs[1].result.completion_wall_ms)/runs[0].result.completion_wall_ms*100,denominator:'Claude full completion wall time'}:{speed_change_percent:null,reason:'Both valid completions required'},
  boundaries:['Single terminal attempt per condition; D059 forced split and selected model/effort differ from D057. Descriptive comparison only.','No hidden grader contents supplied; only aggregate grader result.','Monitoring is separate from development completion.','D059 initial count request failed model input limit with confirmed no charge; run02 used lossless state codec. Last worker remainder is deterministic.']};
 const dir=join(root,'benchmark-runs/d059-monitor-01');mkdirSync(dir,{mode:0o700});
 const save=(name,x)=>writeFileSync(join(dir,name),JSON.stringify(x,null,2)+'\n',{mode:0o600,flag:'wx'});save('observation.json',packet);
 const cwd=mkdtempSync(join(tmpdir(),'jev-d059-monitor-')),agents=join(cwd,'agents.json'),mcp=join(cwd,'mcp.json');
 const role=readFileSync(join(root,'docs/agents/D059_OPUS_MONITOR.md'),'utf8');
 writeFileSync(agents,JSON.stringify(monitorDefinition(role)),{mode:0o600});writeFileSync(mcp,'{"mcpServers":{}}',{mode:0o600});
 save('started.json',{model:'claude-opus-5-5',effort:'medium',role_sha256:createHash('sha256').update(role).digest('hex'),automaticRetries:0,started_at:new Date().toISOString()});
 const t=performance.now(),raw=await processResult('claude',monitorArguments(agents,mcp),{cwd,env:claudeEnvironment(process.env),input:JSON.stringify(packet),timeoutMs:14400000,maxBytes:4000000,killProcessTree:true});
 writeFileSync(join(dir,'stdout.jsonl'),raw.stdout,{mode:0o600,flag:'wx'});writeFileSync(join(dir,'stderr.log'),raw.stderr,{mode:0o600,flag:'wx'});
 const c=monitorCompletion(raw),result={status:c.status,code:c.code,models:c.models,identity:c.identity,wall_ms:performance.now()-t,usage:c.final?.usage??null,api_equivalent_usd:c.final?.total_cost_usd??null,actual_billed_usd:null,report:c.report};
 save('result.json',result);console.log(JSON.stringify(result));if(c.status!=='completed')process.exitCode=1;
}
main().catch(()=>{console.error('D059_MONITOR_FAILED_NO_RETRY');process.exitCode=1;});
