"""Read an already terminal count trial. Never execute providers or generated code."""
import json,hashlib,sys
from pathlib import Path
run=Path(sys.argv[1]);protocol=Path(sys.argv[2]);out=Path(sys.argv[3])
read=lambda p:json.loads(p.read_text())
p=read(protocol)
assert all(hashlib.sha256(Path(s['path']).read_bytes()).hexdigest()==s['sha256'] for s in p['sources']), 'SOURCE_DRIFT'
r=read(run/('result.json' if (run/'result.json').exists() else 'stopped.json'))
events=[json.loads(x) for x in (run/'events.jsonl').read_text().splitlines()]
receipts=r.get('receipts',[])
started=[e['label'] for e in events if e.get('event')=='claude_started']
missing=[label for label in started if label not in {r['label'] for r in receipts}]
stream=[]
for f in run.glob('*.live.jsonl'):
 rows=[]
 for line in f.read_text().splitlines():
  try: rows.append(json.loads(line))
  except ValueError: pass
 terminal=[x for x in rows if x.get('type')=='result']
 parse_error=None
 if terminal:
  text=terminal[-1].get('result','').strip()
  import re
  text=re.sub(r'^```(?:json)?\s*','',text);text=re.sub(r'\s*```$','',text)
  try: json.loads(text)
  except ValueError as e: parse_error=str(e)
 stream.append({'file':f.name,'assistant_message_ids':len({x.get('message',{}).get('id') for x in rows if x.get('type')=='assistant'}),'continuation_user_events':sum(x.get('type')=='user' for x in rows),'terminal_result_count':len(terminal),'final_json_parse_error':parse_error})
keys=['input_tokens','cache_creation_input_tokens','cache_read_input_tokens','output_tokens']
known=sum(x['api_equivalent_usd'] for x in receipts if isinstance(x.get('api_equivalent_usd'),(int,float)))
unknown=bool(missing or any(x.get('api_equivalent_usd') is None for x in receipts))
jev=[x for x in events if x.get('event')=='inference_finished' and x.get('provider')=='jev']
result={'status':r['status'],'routing':r.get('routing'),'wall_ms':r.get('wall_ms'),'arms':[{k:a.get(k) for k in ['mode','status','fileCount','completed','error','wall_ms']} for a in r.get('arms',[])],'claude_cli_calls':len(started),'unresolved_labels':missing,'claude_known_api_equivalent_subtotal_usd':known,'claude_total_api_equivalent_usd':None if unknown else known,'claude_usage':{k:None if missing or any((x.get('usage') or {}).get(k) is None for x in receipts) else sum(x['usage'][k] for x in receipts) for k in keys},'jev_finished_calls':len(jev),'jev_usage':[x.get('usage') for x in jev],'streams':stream,'actual_incremental_billed_usd':None,'independent_grading':'pending if complete candidate, otherwise not_run','limits':['one trial; no paired efficiency claim','CLI calls are not underlying model turn counts','Provider API-equivalent values are not subscription bills']}
out.write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
