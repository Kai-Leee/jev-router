#!/usr/bin/env node
// One explicit, read-only Opus monitor observation of the D052 final public status.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {monitorArguments,monitorDefinition,monitorCompletion} from '../src/benchmark/monitor.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
const root=resolve(import.meta.dirname,'..');
async function main(){
 if(process.argv[2]!=='--spend')throw new Error('EXPLICIT_SPEND_REQUIRED');
 const analysis=JSON.parse(readFileSync(join(root,'benchmark-runs/d054-analysis-final.json'),'utf8'));
 const dir=join(root,'benchmark-runs/d054-monitor');mkdirSync(dir,{mode:0o700});
 const save=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 const packet={task:'openapi_python_client',matched_inputs:analysis.matched_inputs,conditions:analysis.rows.map(r=>({condition:r.condition,status:r.status,operational:r.operational,categories:r.categories,elapsed_through_grade_ms:r.elapsed_through_grade_ms,run_wall_ms:r.run_wall_ms,stages:r.stages?.map(s=>({status:s.status,stopped_code:s.stopped_code,operational:s.operational,run_wall_ms:s.run_wall_ms})),grade:r.grade?{status:r.grade.grading_status,resolved:r.grade.resolved,summary:r.grade.summary}:null})),failure_evidence:['D052 prepared-plan baseline generated16files,62/63independent pass; smoke found list defaults/literal behavior failures,repair owner unresolved so stopped.','D052 simultaneous new decomposition failed structural allocation after7calls;217323input,$0.1303938 separate development history.','D053 anchored sequential plan5tasks was valid:30calls,47.537726958sec,856491input,$0.5138946. Core6files completed then local nextdecision payload312600B exceeded256000, no request sent at that point.','D054 lossless object+string fragment representation verified200249B; confirmedcore reused without generation. NextJevrequest HTTP400 with provider_run_id then stopped; no worker calls.','Provider visible usage table confirms refunded/nocharge; GETcredits reserved0; audited ledger reconciliation now1437350/10Minput,pending0. Failedmodelinputusage/APIequivalent unknown, do not zero missing usage.','Both conditions unresolved. No performancewin. Change of projection and repairpause means exploratory continuation, not fresh matchedjudge test.'],limits:analysis.limits,monitor_cost_scope:'separate from implementation'};
 save('observation.json',packet);
 const cwd=mkdtempSync(join(tmpdir(),'jev-d054-monitor-'));
 const agents=join(cwd,'agents.json'),mcp=join(cwd,'mcp.json');
 writeFileSync(agents,JSON.stringify(monitorDefinition(readFileSync(join(root,'docs/agents/OPUS_BENCHMARK_MONITOR.md'),'utf8'))),{mode:0o600});
 writeFileSync(mcp,'{"mcpServers":{}}',{mode:0o600});
 save('started.json',{model:'claude-opus-5-5',effort:'medium',role:'monitor',started_at:new Date().toISOString(),automaticRetries:0});
 const started=performance.now();
 const result=await processResult('claude',monitorArguments(agents,mcp),{cwd,env:claudeEnvironment(process.env,{auth:'cli'}),input:JSON.stringify(packet),timeoutMs:180000,maxBytes:2000000,killProcessTree:true});
 writeFileSync(join(dir,'stdout.jsonl'),result.stdout,{flag:'wx',mode:0o600});
 writeFileSync(join(dir,'stderr.log'),result.stderr,{flag:'wx',mode:0o600});
 const c=monitorCompletion(result);
 save('result.json',{status:c.status,code:c.code,models:c.models,model_identity:c.identity,usage:c.final?.usage??null,api_equivalent_usd:c.final?.total_cost_usd??null,wall_ms:performance.now()-started,report:c.report,outcome_uncertain:result.outcome_uncertain??null});
 console.log(JSON.stringify({status:c.status,report:c.report,api_equivalent_usd:c.final?.total_cost_usd??null}));
 if(c.status!=='completed')process.exitCode=1;
}
main().catch(()=>{console.error('MONITOR_STOPPED_NO_RETRY');process.exitCode=1;});
