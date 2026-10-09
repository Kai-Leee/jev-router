#!/usr/bin/env node
// Independent grade required. Does not infer, execute candidates or rerun calls.
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const [left,leftGrade,right,rightGrade,output]=process.argv.slice(2);
if(!output)throw Error('Usage: left-run left-grade right-run right-grade new-output.json');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const pairs=[[left,leftGrade],[right,rightGrade]].map(([dir,grade])=>({dir,r:read(join(dir,'result.json')),i:read(join(dir,'inputs.json')),g:read(join(grade,'result.json')),d:read(join(dir,'split-decision.json'))}));
const [a,b]=pairs;
for(const key of ['briefHash','model','effort','inputMode','workerSha256','questionsSha256'])if(!a.i[key]||a.i[key]!==b.i[key])throw Error(`UNMATCHED_${key}`);
if(a.i.maxConcurrency!==b.i.maxConcurrency)throw Error('UNMATCHED_CONCURRENCY');
if(a.g.task_id!==b.g.task_id||a.g.upstream_commit!==b.g.upstream_commit||a.g.image?.image_digest!==b.g.image?.image_digest)throw Error('UNMATCHED_GRADER');
if(a.r.planHash!==b.r.planHash)throw Error('UNMATCHED_PLAN');
if([a,b].every(x=>['claude','jev'].includes(x.r.routing?.authority))&&a.r.routing.threshold!==b.r.routing.threshold)throw Error('UNMATCHED_THRESHOLD');
const sum=xs=>xs.every(Number.isFinite)?xs.reduce((x,y)=>x+y,0):null;
const rows=pairs.map(({dir,r,g,d})=>{
 if(r.status!=='generated_ungraded'||r.arms.length!==1||g.grading_status!=='completed')throw Error('ONE_COMPLETED_ROUTED_ARM_AND_GRADE_REQUIRED');
 const arm=r.arms[0];
 if(resolve(g.workspace)!==resolve(dir,`candidate-${arm.mode}`))throw Error('GRADE_WORKSPACE_MISMATCH');
 const usage=arm.receipts.map(x=>x.usage);
 return {dir,authority:r.routing.authority,mode:arm.mode,planning_reused:r.planning_reused,planning_ms:r.planning_ms,
  decision_ms:r.routing.decision_elapsed_ms,worker_ms:arm.wall_ms,grade_ms:g.elapsed_sec*1000,
  post_plan_stage_sum_ms:r.routing.decision_elapsed_ms+arm.wall_ms+g.elapsed_sec*1000,
  decision_claude_calls:r.routing.claude_decision_calls,decision_jev_calls:r.routing.jev_decision_calls,
  worker_calls:arm.receipts.length,claude_planner_api_equivalent_usd:sum(r.receipts.filter(x=>x.label==='planner').map(x=>x.api_equivalent_usd)),claude_post_plan_api_equivalent_usd:sum(r.receipts.filter(x=>x.label!=='planner').map(x=>x.api_equivalent_usd)),claude_total_api_equivalent_usd:sum(r.receipts.map(x=>x.api_equivalent_usd)),
  jev_input_tokens:d.response?.usage?.input_tokens??(r.routing.jev_decision_calls===0?0:null),
  input_tokens:sum(usage.map(u=>u?.input_tokens)),cache_creation_tokens:sum(usage.map(u=>u?.cache_creation_input_tokens)),cache_read_tokens:sum(usage.map(u=>u?.cache_read_input_tokens)),output_tokens:sum(usage.map(u=>u?.output_tokens)),
  resolved:g.resolved,reward:g.reward,tests:g.summary,probability:r.routing.probability};
});
const baseline=rows.find(x=>x.authority==='claude'),jev=rows.find(x=>x.authority==='jev');
const result={rows,paired_claude_decision_calls_avoided:baseline&&jev?baseline.decision_claude_calls-jev.decision_claude_calls:null,
 paired_post_plan_delta_ms:rows[1].post_plan_stage_sum_ms-rows[0].post_plan_stage_sum_ms,
 limitations:['Stage sum excludes manual waits; planner separately reported','Same plan is required; this isolates decision authority, not plan-generation replacement','Grade workspace, task, upstream and image matched; file mutation after grading is not cryptographically excluded','No oracle regret or probability calibration from one pair','Claude API-equivalent is not actual subscription billing; Jev token usage is separate']};
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result,null,2));
