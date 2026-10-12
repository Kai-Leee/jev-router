#!/usr/bin/env node
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(p,'utf8'));
const dir=join(root,'benchmark-runs/d059-e2e-02'),result=read(join(dir,'result.json'));
const plan=read(join(dir,'planning/plan.json'));
const receipts=readdirSync(join(dir,'receipts')).filter(p=>p.endsWith('.json')).sort().map(p=>read(join(dir,'receipts',p)));
const writes=readdirSync(join(dir,'calls')).filter(p=>p.endsWith('.artifacts.jsonl')).flatMap(p=>readFileSync(join(dir,'calls',p),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse).filter(e=>e.event==='write_finished'));
const firstWrite=writes.map(e=>Date.parse(e.recorded_at)).sort((a,b)=>a-b)[0];
const categories=Object.fromEntries([...new Set(receipts.map(r=>r.category))].map(category=>{
  const rs=receipts.filter(r=>r.category===category);
  return [category,{calls:rs.length,process_duration_sum_ms:rs.reduce((n,r)=>n+r.wall_ms,0),api_equivalent_known_subtotal_usd:rs.reduce((n,r)=>n+(r.api_equivalent_usd??0),0),cost_complete:rs.every(r=>typeof r.api_equivalent_usd==='number')}];
}));
const historical=read(join(root,'benchmark-runs/d057-claude-01/result.json'));
const successful=result.valid_completion_comparison&&historical.valid_completion_comparison;
const monitorPath=join(root,'benchmark-runs/d059-monitor-01/result.json');
const report={schema_version:'d059-analysis/v1',result,categories,
  allocation:plan.tasks.map(t=>({id:t.id,obligations:t.obligation_ids.length,tests:t.test_ids.length,paths:t.paths,profile:t.profile,depends_on:t.depends_on,allocation_method:t.allocation_method})),
  coverage:plan.coverage,
  artifact_timing:{first_saved_file_ms:firstWrite===undefined?null:firstWrite-Date.parse(result.started_at),write_events:writes.length,unique_saved_paths:new Set(writes.map(e=>e.path)).size},
  receipts:receipts.map(r=>({id:r.id,category:r.category,task_id:r.task_id,status:r.status,wall_ms:r.wall_ms,requested_model:r.requested_model,requested_effort:r.requested_effort,models:r.models,identity:r.model_identity_verified,effective_effort:r.effective_effort,usage:r.usage,api_equivalent_usd:r.api_equivalent_usd})),
  implementation_equivalent_usd:typeof result.claude.api_equivalent_usd==='number'&&typeof result.jev?.api_equivalent_usd==='number'?result.claude.api_equivalent_usd+result.jev.api_equivalent_usd:null,
  historical_descriptive_comparison:successful?{historical_completion_ms:historical.completion_wall_ms,current_completion_ms:result.completion_wall_ms,saved_ms:historical.completion_wall_ms-result.completion_wall_ms,saved_percent:(historical.completion_wall_ms-result.completion_wall_ms)/historical.completion_wall_ms*100,denominator:'Historical D057 Claude successful completion wall time',n_per_condition:1,matched_causal_comparison:false}:null,
  initial_failed_attempt:read(join(root,'benchmark-runs/d059-e2e-01/result.json')),
  monitor:existsSync(monitorPath)?read(monitorPath):null,
  limitations:['D059 changes forced splitting, profiles, scope and number of calls; no matched causal speedup claim.','Failed attempts have null completion time.','Known equivalent costs are not subscription billing; preparation cost unmeasured.','Last-worker remainder and path serialization are deterministic runtime rules.','CLI calls are not exact provider API request counts; live thinking-token estimates excluded.']};
if(process.argv.includes('--write'))writeFileSync(join(root,'benchmark-runs/d059-analysis.json'),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify(report,null,2));
