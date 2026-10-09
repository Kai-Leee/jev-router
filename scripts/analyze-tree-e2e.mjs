#!/usr/bin/env node
// Read-only aggregation. No models, file edits to candidates or grading execution.
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const [run,sg,pg,out]=process.argv.slice(2);
if(!out)throw new Error('Usage: run-dir single-grade-dir split-grade-dir new-output.json');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const r=read(join(run,'result.json')),decision=read(join(run,'split-decision.json'));
const grades={single:read(join(sg,'result.json')),split:read(join(pg,'result.json'))};
const monitor=read(join(run,'independent-opus-monitor-result.json'));
const sum=xs=>xs.every(x=>Number.isFinite(x))?xs.reduce((a,b)=>a+b,0):null;
const planner=r.receipts.find(x=>x.label==='planner');
const jevInput=decision.response.usage.input_tokens;
const jevMonthly=jevInput*29/60000000;
const arms=r.arms.map(a=>{
 const g=grades[a.mode];
 const cost=sum(a.receipts.map(c=>c.api_equivalent_usd));
 return {mode:a.mode,worker_calls:a.receipts.length,worker_wall_ms:a.wall_ms,grade_wall_ms:g.elapsed_sec*1000,
   workflow_ms:planner.wall_ms+a.wall_ms+g.elapsed_sec*1000+(a.mode==='split'?decision.wall_ms:0),
   claude_api_equivalent_usd:cost,
   allocated_workflow_estimate_usd:cost===null||planner.api_equivalent_usd===null?null:cost+planner.api_equivalent_usd+(a.mode==='split'?jevMonthly:0),
   resolved:g.resolved,reward:g.reward,tests:g.summary??null,graderStatus:g.grading_status,
   requested_model:'claude-opus-5-5',requested_effort:'medium',effective_effort:null};
});
const single=arms.find(a=>a.mode==='single'),split=arms.find(a=>a.mode==='split');
const delta=split.workflow_ms-single.workflow_ms;
const observedBenefit=typeof split.resolved==='boolean'&&typeof single.resolved==='boolean'?split.resolved&&delta<0:null;
const result={evidence_mode:'live-exploratory',sample_count:1,arms,planning_ms:planner.wall_ms,planning_api_equivalent_usd:planner.api_equivalent_usd,jev:{input_tokens:jevInput,output_tokens:decision.response.usage.output_tokens,probability:decision.response.answers.beneficial.noul,wall_ms:decision.wall_ms,http_ms:decision.response.receipt.durationMs,monthly_allocation_estimate_usd:jevMonthly,conservative_budget_usd:jevInput*.6/1000000,actual_billed_usd:null},
  observedBenefit,workflow_delta_ms:delta,workflow_delta_percent_using_single_denominator:delta/single.workflow_ms*100,
  policy_labels:decision.policies,monitor_api_equivalent_usd:monitor.api_equivalent_usd,
  actual_experiment_claude_api_equivalent_usd:sum([...r.receipts.map(x=>x.api_equivalent_usd),monitor.api_equivalent_usd]),
  limitations:['Workflow is a reconstructed sum of measured stages; manual waits and inter-arm delays are excluded, not continuous user wall-clock','Forced counterfactual arms do not measure automatic Jev routing benefit; no same-four-tasks serial ablation isolates parallelism','One frozen plan and one run per arm, sequential single then split, no calibrated probability claim','Both arms share planner cost for hypothetical workflow allocation; actual experiment cost counts planner once','Stage barrier with max 2 workers, not work-conserving dispatch','No-tools generated artifacts; no local repair loop; not comparable with D025 shell loop','Workflow includes independent grader elapsed; monitor separately accounted','Effective effort is not independently observable; requested setting only','Other catalog models and recursive multi-level live splits not evaluated']};
writeFileSync(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
