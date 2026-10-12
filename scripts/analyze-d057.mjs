#!/usr/bin/env node
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(p,'utf8'));
const arms=['claude','jev'].map(condition=>{
  const dir=join(root,'benchmark-runs',`d057-${condition}-01`),result=read(join(dir,'result.json')),protocol=read(join(dir,'protocol.json'));
  const receipts=readdirSync(join(dir,'receipts')).filter(p=>p.endsWith('.json')).map(p=>read(join(dir,'receipts',p)));
  const writes=readdirSync(join(dir,'calls')).filter(p=>p.endsWith('.artifacts.jsonl')).flatMap(p=>
    readFileSync(join(dir,'calls',p),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(e=>e.event==='write_finished'));
  const firstWrite=writes.map(e=>Date.parse(e.recorded_at)).sort((x,y)=>x-y)[0];
  const assistantIds=new Set();
  for(const p of readdirSync(join(dir,'calls')).filter(p=>p.endsWith('.live.jsonl'))) {
    for(const line of readFileSync(join(dir,'calls',p),'utf8').trim().split('\n').filter(Boolean)) {
      try{const x=JSON.parse(line);if(x.type==='assistant'&&x.message?.id)assistantIds.add(x.message.id);}catch{}
    }
  }
  const categories=Object.fromEntries([...new Set(receipts.map(r=>r.category))].map(category=>{
    const rs=receipts.filter(r=>r.category===category);
    return [category,{calls:rs.length,process_duration_sum_ms:rs.reduce((n,r)=>n+r.wall_ms,0),api_equivalent_known_subtotal_usd:rs.reduce((n,r)=>n+(r.api_equivalent_usd??0),0)}];
  }));
  const claudeCost=result.claude.api_equivalent_usd,jevCost=condition==='claude'?0:result.jev?.api_equivalent_usd??null;
  return {condition,protocol,result:{...result,independent_grade:result.independent_grade?{
    grading_status:result.independent_grade.grading_status,resolved:result.independent_grade.resolved,
    reward:result.independent_grade.reward,summary:result.independent_grade.summary,
    expected_test_count:result.independent_grade.expected_test_count,observed_test_records:result.independent_grade.observed_test_records,
    container_removed:result.independent_grade.container_removed}:null},categories,
    artifact_timing:{first_saved_file_ms:firstWrite===undefined?null:firstWrite-Date.parse(result.started_at),write_events:writes.length,unique_saved_paths:new Set(writes.map(e=>e.path)).size},
    claude_observation_units:{cli_invocations:receipts.length,observed_assistant_message_ids:assistantIds.size,api_request_count:null,note:'CLI invocations and deduplicated assistant response IDs are different units; unobserved retries or missing responses prevent an exact API-request count.'},
    implementation_api_equivalent_usd:claudeCost!==null&&jevCost!==null?claudeCost+jevCost:null};
});
const [a,b]=arms;
const matching={};
for(const key of ['source_sha256','brief_sha256','input_sha256','architecture_sha256','worker_model','effort','all_paths','image','limits','sources']) {
  // Snapshot paths are identical relative layouts and are part of the frozen protocol.
  matching[key]=JSON.stringify(a.protocol[key])===JSON.stringify(b.protocol[key]);
}
const valid=Object.values(matching).every(Boolean)&&arms.every(x=>x.result.valid_completion_comparison);
const ratio=valid?{
  saved_ms:a.result.completion_wall_ms-b.result.completion_wall_ms,
  saved_percent:(a.result.completion_wall_ms-b.result.completion_wall_ms)/a.result.completion_wall_ms*100,
  speedup:a.result.completion_wall_ms/b.result.completion_wall_ms,
  denominator:'Claude whole-product completion wall time',n_per_condition:1,
}:null;
const monitorPath=join(root,'benchmark-runs/d057-monitor-01/result.json');
const report={schema_version:'d057-comparison/v1',matching,valid_completion_comparison:valid,
  completion_comparison:ratio,
  arms:arms.map(({protocol,...rest})=>rest),
  monitor:existsSync(monitorPath)?read(monitorPath):null,
  limitations:['One sequential attempt per condition, Claude first; not a replicated causal speed estimate.',
    'Whole workflow changes: single Claude versus Jev decomposition plus leaf workers and integration.',
    'Shared historical interface scaffold; development and fixture preparation cost unmeasured.',
    'Actual subscription billing unknown; reported dollars are API/token-pack equivalents.',
    'Process-duration sums are not parallel elapsed time. Failed attempts do not have completion time.']};
if(process.argv.includes('--write'))writeFileSync(join(root,'benchmark-runs/d057-comparison.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify(report,null,2));
