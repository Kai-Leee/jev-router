"""Read-only analysis of all 20 attempts. No provider or generated-code execution."""
from pathlib import Path
import json,sys,statistics,hashlib,tomllib,ast,re
run=Path(sys.argv[1]);out=Path(sys.argv[2]);protocol=json.loads((run/'protocol.json').read_text());r=json.loads((run/'result.json').read_text());grades={x['id']:x for x in json.loads((run/'grading-summary.json').read_text())['rows']}
metrics={};samples=[]
for x in r['results']:
 u=x.get('usage') or {};g=grades.get(x['id'],{}).get('grade') or {};checks={}
 if x.get('candidate'):
  candidate=Path(x['candidate'])
  try:
   p=tomllib.loads((candidate/'pyproject.toml').read_text());project=p.get('project',{});build=p.get('build-system',{});cfg=p.get('tool',{}).get('setuptools',{})
   checks['name']=project.get('name')=='pytest-check'
   checks['python_requirement']=project.get('requires-python')=='>=3.9'
   checks['pytest_dependency']=any(str(d).split(';')[0].strip().startswith('pytest') for d in project.get('dependencies',[]))
   checks['backend']=build.get('build-backend')=='setuptools.build_meta'
   checks['src_layout']=cfg.get('packages',{}).get('find',{}).get('where')==['src']
   checks['plugin_entrypoint']=project.get('entry-points',{}).get('pytest11',{}).get('pytest_check')=='pytest_check.plugin'
   checks['typed_marker_declared']=any('py.typed' in a or '*' in a for a in cfg.get('package-data',{}).values())
   ast.parse((candidate/'setup.py').read_text());checks['setup_python_syntax']=True
   shell=(candidate/'setup.sh').read_text();checks['offline_flags_present']=all(s in shell for s in ['--no-build-isolation','--no-deps','--no-use-pep517','-e .'])
   checks['shell_errexit_present']=bool(re.search(r'\bset\s+-[a-zA-Z]*e',shell))
  except Exception as e:checks['parse_success']=False
 row={k:x.get(k) for k in ['id','round','variant','wall_ms','api_equivalent_usd','valid_output','status']}
 row.update({k:u.get(k) for k in ['input_tokens','cache_creation_input_tokens','cache_read_input_tokens','output_tokens']})
 vals=[row.get(k) for k in ['input_tokens','cache_creation_input_tokens','cache_read_input_tokens']];row['total_input_tokens']=sum(vals) if all(isinstance(v,(int,float)) for v in vals) else None
 row.update({'resolved':g.get('resolved'),'grade_status':g.get('grading_status'),'tests':g.get('summary'),'container_removed':g.get('container_removed'),'static_checks':checks,'static_all':bool(checks) and all(checks.values())})
 samples.append(row)
keys=['wall_ms','api_equivalent_usd','input_tokens','cache_creation_input_tokens','cache_read_input_tokens','total_input_tokens','output_tokens']
for size in protocol['sizes']:
 name=size['name'];rows=[x for x in samples if x['variant']==name];stats={}
 for k in keys:
  xs=[x[k] for x in rows if isinstance(x.get(k),(int,float))];stats[k]={'n':len(xs),'mean':statistics.mean(xs) if xs else None,'median':statistics.median(xs) if xs else None,'min':min(xs) if xs else None,'max':max(xs) if xs else None}
 metrics[name]={'attempts':len(rows),'valid_outputs':sum(x['valid_output'] for x in rows),'resolved':sum(x['resolved'] is True for x in rows),'static_pass':sum(x['static_all'] for x in rows),'system_bytes':size['system_bytes'],'request_bytes':size['request_bytes'],'metrics':stats}
base=metrics['baseline']
for name,m in metrics.items():
 m['delta_percent_using_baseline_mean']={k:100*(m['metrics'][k]['mean']/base['metrics'][k]['mean']-1) if base['metrics'][k]['mean'] and m['metrics'][k]['mean'] is not None else None for k in keys}
 m['paired_round_deltas']=[{'round':x['round'],'wall_ms':x['wall_ms']-next(b['wall_ms'] for b in samples if b['variant']=='baseline' and b['round']==x['round']),'api_equivalent_usd':x['api_equivalent_usd']-next(b['api_equivalent_usd'] for b in samples if b['variant']=='baseline' and b['round']==x['round'])} for x in samples if x['variant']==name and x['api_equivalent_usd'] is not None]
result={'actual_calls':r['actual_calls'],'jev_calls':r['jev_calls'],'metrics':metrics,'samples':samples,'claude_api_equivalent_total_usd':sum(x['api_equivalent_usd'] for x in samples) if all(x['api_equivalent_usd'] is not None for x in samples) else None,'all_grading_containers_removed':all(x['container_removed'] is True for x in samples),'limitations':['Single packaging task repeated4times percondition, not4independent tasks','Generated only3files;other8integration files fixed','Shared caches and sequential rotated order; not pure causal latency or cache attribution','Static shell flag checks are lexical, not proof fallback branch executed','CLI API-equivalent cost, not actual extra subscription charge']}
out.write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'actual_calls':result['actual_calls'],'metrics':metrics,'claude_api_equivalent_total_usd':result['claude_api_equivalent_total_usd'],'all_grading_containers_removed':result['all_grading_containers_removed']},ensure_ascii=False))
