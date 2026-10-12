#!/usr/bin/env node
// One explicit, read-only Opus monitor observation of the D050 final public status.
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
 const analysis=JSON.parse(readFileSync(join(root,'benchmark-runs/d050-analysis-final.json'),'utf8'));
 const dir=join(root,'benchmark-runs/d050-monitor');mkdirSync(dir,{mode:0o700});
 const save=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
 const packet={task:'openapi_python_client',matched_core_inputs:analysis.matched_core_inputs,matched_representation:analysis.matched_representation,pure_judge_attribution_eligible:analysis.pure_judge_attribution_eligible,conditions:analysis.rows.map(r=>({condition:r.condition,status:r.status,operational:r.operational,categories:r.categories,elapsed_original_start_through_grade_ms:r.elapsed_original_start_through_grade_ms,active_run_and_grade_ms:r.active_run_and_grade_ms,intervening_repair_pause_ms:r.intervening_repair_pause_ms,grade:r.stages.at(-1).grade?{status:r.stages.at(-1).grade.grading_status,resolved:r.stages.at(-1).grade.resolved,summary:r.stages.at(-1).grade.summary}:null})),failure_evidence:['D048 both stopped because controller imported tomllib under Python3.10. Completed artifacts reused in continuation.','D049 Jev rejected locally before HTTP:278820-byte body exceeds256000; exact duplicate strings removed losslessly in D050. Claude representation unchanged: comparison confounded.','D050 Jev parallel groups2/3 completed; next review HTTP_ERROR with missing exact HTTP status due telemetry loss. One budget reservation65536 remains outstanding; do not retry or assume zero charge.'],limits:analysis.limits,monitor_cost_scope:'separate from implementation'};
 save('observation.json',packet);
 const cwd=mkdtempSync(join(tmpdir(),'jev-d050-monitor-'));
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
