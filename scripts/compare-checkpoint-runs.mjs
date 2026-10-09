#!/usr/bin/env node
// Read-only receipt comparison. No model requests. Output is exclusively new.
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {jevCostCoverage} from '../src/benchmark/cost-coverage.mjs';
import {priceClaudeUsage} from '../src/dashboard/pricing.mjs';
const root=resolve('benchmark-runs');
const json=p=>JSON.parse(readFileSync(p,'utf8'));
const lines=p=>readFileSync(p,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const sum=a=>a.reduce((s,x)=>s+x,0);
const totalOrNull=a=>a.every(x=>typeof x==='number'&&Number.isFinite(x))?sum(a):null;
function claude(result){
 const rows=Object.entries(result.claude_model_usage??{}).map(([model,usage])=>({model,usage}));
 const pricing=priceClaudeUsage({rows,expected:rows.length||null,camel:true,mainUsage:result.claude_usage});
 return {usage:result.claude_usage,model_usage:result.claude_model_usage,api_equivalent_usd:pricing.estimated_usd.total.value,
 provider_reported_usd:result.claude_reported_cost_usd??null,pricing,actual_billed_usd:null};
}
function measure(id,grade){
 const dir=join(root,id),r=json(join(dir,'result.json')),m=json(join(dir,'manifest.json')),p=json(join(dir,'preflight.json'));
 const e=lines(join(dir,'decisions.jsonl')),g=json(join(root,grade,'result.json'));
 const inference=e.filter(x=>x.event==='inference_finished');
 const good=inference.filter(x=>x.status==='completed');
 const coverage=jevCostCoverage(e);
 const charged=coverage.charged_input_tokens;
 const monitor=[];
 for(const entry of readdirSync(root,{withFileTypes:true})){
  if(!entry.isDirectory()||!entry.name.startsWith('monitor-'))continue;
  const d=join(root,entry.name);if(!existsSync(join(d,'manifest.json')))continue;
  const manifest=json(join(d,'manifest.json'));if(manifest.group_id!==m.group_id)continue;
  if(!existsSync(join(d,'result.json'))){monitor.push({id:entry.name,status:'missing_result',cost:null});continue;}
  const result=json(join(d,'result.json'));monitor.push({id:entry.name,status:result.runner_status,duration_ms:result.duration_ms,cost:claude(result)});
 }
 const decisionIntervals=e.filter(x=>x.event==='input'&&x.kind!=='action').map(x=>{const end=e.find(y=>y.event==='decision'&&y.kind===x.kind&&y.decision_id===x.decision_id);return end?Date.parse(end.recorded_at)-Date.parse(x.recorded_at):null;});
 const c=claude(r),mon=monitor.length?totalOrNull(monitor.map(x=>x.cost?.api_equivalent_usd??null)):null;
 const stream=lines(join(dir,'claude.stream.jsonl'));
 const messages=new Set(stream.filter(x=>x.type==='assistant').map(x=>x.message?.id).filter(Boolean));
 const content=stream.flatMap(x=>x.message?.content??[]);
 const oversized_commands=content.filter(x=>x.type==='tool_use'&&typeof x.input?.command==='string'&&Buffer.byteLength(x.input.command)>16384).map(x=>({tool_use_id:x.id,bytes:Buffer.byteLength(x.input.command)}));
 return {id,workflow:m.workflow??'structured-selection-v1',mode:m.mode,status:r.runner_status,runtime_ms:r.duration_ms,
 model:r.observed_model_ids,effort:m.effort,cli:p.cli_version,image:p.actual_image_id,brief_sha256:p.brief_sha256,
 decision_delivery_ms:totalOrNull(decisionIntervals),command_execution_ms:sum(e.filter(x=>x.event==='outcome'&&x.kind==='action').map(x=>x.outcome?.duration_ms??0)),completion_requests:e.filter(x=>x.event==='input'&&x.kind==='finish').length,
 route_requests:e.filter(x=>x.event==='input'&&x.kind==='route').length,
 actions:e.filter(x=>x.event==='action_started').length,
 oversized_commands,rejections:e.filter(x=>x.event==='rejected').length,claude_cli_sessions:1,claude_unique_assistant_messages:messages.size,claude_http_attempts:null,
 claude:c,jev:{...coverage,models:[...new Set(good.map(x=>x.model))],calls:coverage.attempts_started,input_tokens:sum(good.map(x=>x.usage.input_tokens)),output_tokens:sum(good.map(x=>x.usage.output_tokens)),charged_input_tokens:charged,
 http_ms:sum(good.map(x=>x.receipt.durationMs)),monthly_allocation_usd:charged===null?null:charged*29/60000000,conservative_budget_usd:charged===null?null:charged*.6/1e6,actual_billed_usd:null},
 monitors:{sessions:monitor.length,api_equivalent_usd:mon,coverage:'Observed monitor manifests only; completeness of expected observation schedule not asserted',records:monitor},
 combined_equivalent_excluding_monitor_usd:c.api_equivalent_usd===null||charged===null?null:c.api_equivalent_usd+charged*29/60000000,
 combined_equivalent_including_monitor_usd:c.api_equivalent_usd===null||charged===null||mon===null?null:c.api_equivalent_usd+charged*29/60000000+mon,
 grade:{passed:g.summary?.passed,total:g.summary?.tests,reward:g.reward,resolved:g.resolved,elapsed_sec:g.elapsed_sec},
 evidence:{result:join(dir,'result.json'),grade:join(root,grade,'result.json'),decisions:join(dir,'decisions.jsonl')}};
}
const output=process.argv[2];if(!output)throw new Error('OUTPUT_PATH_REQUIRED');
const baseline=measure('e2eswe-d025-baseline-01','grade-d025-baseline-01');
const jev=measure('e2eswe-d025-jev-01','grade-d025-jev-01');
const required=['cli','image','brief_sha256','effort','workflow'];
const matched=Object.fromEntries(required.map(k=>[k,typeof baseline[k]==='string'&&baseline[k].length>0&&baseline[k]===jev[k]]));
matched.model=baseline.model?.length===1&&baseline.model[0]==='claude-opus-5-5'&&JSON.stringify(baseline.model)===JSON.stringify(jev.model);
const historical={baseline:measure('e2eswe-d023-baseline-01','grade-d023-baseline-01'),jev:measure('e2eswe-d022-05','grade-d022-05')};
const report={created_at:new Date().toISOString(),baseline,jev,historical,matched,
 comparison:{jev_minus_baseline_ms:jev.runtime_ms-baseline.runtime_ms,jev_time_ratio:jev.runtime_ms/baseline.runtime_ms,
 time_reduction_percent_baseline_denominator:100*(baseline.runtime_ms-jev.runtime_ms)/baseline.runtime_ms,
 cost_reduction_percent_excluding_monitor:baseline.combined_equivalent_excluding_monitor_usd>0&&jev.combined_equivalent_excluding_monitor_usd!==null?100*(baseline.combined_equivalent_excluding_monitor_usd-jev.combined_equivalent_excluding_monitor_usd)/baseline.combined_equivalent_excluding_monitor_usd:null},
 pricing_sources:['https://platform.claude.com/docs/en/about-claude/pricing','https://jev-ai.pro/pricing'],
 limitations:['One sequential run each, no significance or causal speedup claim','Model execution differs; route candidates chosen by Claude may differ','Role scope is descriptive; no native child spawn in checkpoint run','Same completion evidence supplied but baseline selector is main Claude, Jev separate model','Runtime excludes grader and monitor completion wait; concurrent monitor may contend','Claude HTTP attempts unknown; assistant messages are not HTTP request counts','USD is API equivalent plus subscription allocation, not actual invoice or marginal cost','Creator29USD/60M previously verified account plan retained; public crawler exposes token packs','No amortization of D024 rule generation or D025 development into recurring execution cost']};
writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({output,matched,comparison:report.comparison,baseline:{status:baseline.status,grade:baseline.grade},jev:{status:jev.status,grade:jev.grade}}));
