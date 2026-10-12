"""Observe private receipts; grade materialized candidates in existing isolated adapter."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess,json,time,sys
root=Path(__file__).resolve().parents[1];run=Path(sys.argv[1]).resolve();seen=set();active={};rows=[];started=time.monotonic()
def grade(p):
 r=json.loads(p.read_text());out=run/(r['id']+'-grade');log=run/(r['id']+'-grade.log')
 with log.open('xb') as f:
  c=subprocess.run(['/opt/homebrew/bin/python3.14',str(root/'benchmarks/e2e-swe/adapter.py'),'grade','--workspace',r['candidate'],'--image-lock',str(root/'benchmark-runs/image-lock-pytest-check.json'),'--output',str(out)],stdout=f,stderr=subprocess.STDOUT)
 result=json.loads((out/'result.json').read_text()) if (out/'result.json').exists() else {}
 return {'id':r['id'],'returncode':c.returncode,'grade':result,'output':str(out)}
with ThreadPoolExecutor(max_workers=2) as pool:
 while time.monotonic()-started<2400:
  for p in sorted(run.glob('*.receipt.json')):
   if p.name in seen:continue
   seen.add(p.name);r=json.loads(p.read_text())
   if r.get('valid_output') and r.get('candidate'):active[pool.submit(grade,p)]=r['id']
   else:rows.append({'id':r['id'],'grade':None,'reason':'invalid_output'})
  for future in list(active):
   if future.done():
    ident=active.pop(future)
    try:row=future.result()
    except Exception as e:row={'id':ident,'grade':None,'reason':type(e).__name__}
    rows.append(row);print(json.dumps({'graded':row['id'],'resolved':(row.get('grade') or {}).get('resolved'),'count':len(rows)}),flush=True)
  (run/'grading-progress.json').write_text(json.dumps({'seen':len(seen),'active':len(active),'rows':rows},indent=2))
  if (run/'result.json').exists() and not active:
   expected=json.loads((run/'result.json').read_text())['actual_calls']
   if len(seen)==expected:break
  time.sleep(1)
 else:raise RuntimeError('GRADE_MONITOR_TIMEOUT')
(run/'grading-summary.json').write_text(json.dumps({'rows':rows},indent=2))
