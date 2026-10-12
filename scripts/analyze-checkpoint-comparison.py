"""D037 fixed-plan comparison; no network, model calls or artifact execution."""
import json,hashlib,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
prefix=sys.argv[1] if len(sys.argv)>1 else 'd037'
read=lambda p:json.loads(p.read_text())
protocol=read(root/'benchmark-runs'/f'{prefix}-protocol.json')
source_checks=[{'path':s['path'],'matches':hashlib.sha256((root/s['path']).read_bytes()).hexdigest()==s['sha256']} for s in protocol['sources']]
assert all(s['matches'] for s in source_checks),'SOURCE_CHANGED_DURING_EXPERIMENT'
rows=[];matched=[]
manifest=read(root/'benchmarks/e2e-swe/manifest.json')
for mode in protocol['conditions']:
 d=root/'benchmark-runs'/f'{prefix}-{mode}-01';i=read(d/'inputs.json')
 r=read(d/'result.json') if (d/'result.json').exists() else read(d/'stopped.json')
 decision=read(d/'split-decision.json') if (d/'split-decision.json').exists() else None
 rt=r.get('routing');receipts=r.get('receipts',[])
 matched.append({k:i[k] for k in ['briefHash','model','effort','inputMode','workerSha256','questionsSha256','maxConcurrency','splitThreshold']})
 matched[-1]['planHash']=read(d/'frozen-plan.json')['hash']
 gs=[];candidate_hashes={}
 for arm in r.get('arms',[]):
  gp=root/'benchmark-runs'/f'{prefix}-grade-{mode}-{arm["mode"]}'/'result.json'
  g=read(gp) if gp.exists() else None
  if g:
   assert g['task_id']==manifest['task_id'] and g['upstream_commit']==manifest['upstream_commit'],'WRONG_GRADER'
   assert Path(g['workspace']).resolve()==(d/f'candidate-{arm["mode"]}').resolve(),'WRONG_GRADE_WORKSPACE'
   assert g['image']['image_digest']==read(root/'benchmark-runs/image-lock-pytest-check.json')['image_digest'],'WRONG_IMAGE'
  gs.append(g)
  for p in sorted((d/f'candidate-{arm["mode"]}').rglob('*')):
   if p.is_file():candidate_hashes[str(p.relative_to(d))]=hashlib.sha256(p.read_bytes()).hexdigest()
 def total(key):
  values=[x.get('usage',{}).get(key) if isinstance(x.get('usage'),dict) else None for x in receipts]
  return sum(values) if all(isinstance(v,(float,int)) for v in values) else None
 costs=[x.get('api_equivalent_usd') for x in receipts]
 c=sum(costs) if all(isinstance(v,(float,int)) for v in costs) else None
 events=[json.loads(line) for line in (d/'events.jsonl').read_text().splitlines()]
 resp=(decision or {}).get('response') or {}
 observed=[e for e in events if e.get('event')=='inference_finished' and e.get('provider')=='jev' and e.get('status')=='completed']
 if mode!='claude' and not resp and len(observed)==1:resp=observed[0]
 jev=resp.get('usage') if mode!='claude' else None
 jev_tokens=jev.get('input_tokens') if jev else (0 if rt and rt['jev_decision_calls']==0 else None)
 grade_ms=sum(g['elapsed_sec']*1000 for g in gs) if gs and all(g and 'elapsed_sec' in g for g in gs) else None
 worker_ms=sum(a['wall_ms'] for a in r.get('arms',[]))
 row={'condition':mode,'status':r['status'],'routing':rt,'claude_calls':len(receipts),'claude_usage':{k:total(k) for k in ['input_tokens','cache_creation_input_tokens','cache_read_input_tokens','output_tokens']},'claude_api_equivalent_usd':c,'jev_usage':jev,'jev_conservative_usd':None if jev_tokens is None else jev_tokens*.6/1e6,'actual_incremental_billed_usd':None,'planner_calls':r.get('planning_call_count'),'worker_ms':worker_ms,'run_wall_ms':r.get('wall_ms'),'grade_ms':grade_ms,'grade':gs,'independent_resolved':bool(r['status']=='generated_ungraded' and r.get('arms') and all(a['status']=='completed' for a in r['arms']) and gs and all(g and g.get('grading_status')=='completed' and g.get('resolved') is True for g in gs)),'candidate_sha256':candidate_hashes}
 if rt and grade_ms is not None:row['decision_worker_grade_stage_sum_ms']=rt['decision_elapsed_ms']+worker_ms+grade_ms
 if c is not None and row['jev_conservative_usd'] is not None:row['comparison_conservative_usd']=c+row['jev_conservative_usd']
 rows.append(row)
assert all(x==matched[0] for x in matched),'UNMATCHED_INPUTS'
# All provider questions/state must match; model field is Jev-only wire configuration.
requests=[read(root/'benchmark-runs'/f'{prefix}-{m}-01'/'split-request.json') for m in protocol['conditions']]
assert all(x==requests[0] for x in requests),'UNMATCHED_DECISION_REQUEST'
base=rows[0];comparisons=[]
for row in rows[1:]:
 deltas={}
 for key in ['run_wall_ms','decision_worker_grade_stage_sum_ms','comparison_conservative_usd']:
  b=base.get(key);v=row.get(key)
  deltas[key]=None if not isinstance(b,(int,float)) or not isinstance(v,(int,float)) or b==0 else {'baseline':b,'value':v,'reduction_percent':100*(b-v)/b}
 if base['routing'] and row['routing']:
  b=base['routing']['decision_elapsed_ms'];v=row['routing']['decision_elapsed_ms'];deltas['decision_ms']={'baseline':b,'value':v,'reduction_percent':100*(b-v)/b,'speed_ratio':b/v if v else None}
 comparisons.append({'baseline':'claude','condition':row['condition'],'deltas':deltas})
out={'protocol':protocol,'source_checks':source_checks,'matched_inputs':matched[0],'rows':rows,'comparisons':comparisons,'budget_after':read(root/'benchmark-runs/jev-usd1-budget.json'),'limits':['n=1 each; sequential order/cache not isolated','Fixed plan; planning calls deliberately reused, not eliminated by Jev','API-equivalent plus Jev conservative estimate is not actual billed cost','Stage-sum excludes human wait; run wall excludes external grader','Failure/abstention rows preserved; no claim of general superiority','Candidate hashes collected after grading; no pregrade cryptographic immutability proof']}
p=root/'benchmark-runs'/f'{prefix}-analysis.json'
with p.open('x') as f:json.dump(out,f,indent=2)
print(json.dumps({'output':str(p),'rows':[{k:r[k] for k in ['condition','status','claude_calls','claude_api_equivalent_usd','jev_conservative_usd','run_wall_ms','independent_resolved']} for r in rows],'comparisons':comparisons},indent=2))
