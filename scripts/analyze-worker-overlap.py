"""Measure actual worker-process overlap from paired invocation events; no provider calls."""
import json, sys
from datetime import datetime
from pathlib import Path

def stamp(value):
    return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()

def analyze(directory):
    events=[json.loads(line) for line in (directory/'events.jsonl').read_text().splitlines() if line.strip()]
    starts={e['invocation_id']:e for e in events if e.get('event')=='invocation_started' and e.get('category') in ('worker','recovery')}
    ends={e['invocation_id']:e for e in events if e.get('event')=='invocation_finished'}
    missing=sorted(set(starts)-set(ends))
    intervals=[]
    for key,start in starts.items():
        if key in ends:
            a,b=stamp(start['recorded_at']),stamp(ends[key]['recorded_at'])
            assert b>=a
            intervals.append({'invocation_id':key,'category':start['category'],'start':a,'end':b})
    points=sorted([(r['start'],1) for r in intervals]+[(r['end'],-1) for r in intervals])
    active=maximum=0;union=overlap=0.;previous=None
    for instant,delta in points:
        if previous is not None:
            if active:union+=instant-previous
            if active>=2:overlap+=instant-previous
        active+=delta;maximum=max(maximum,active);previous=instant
    return {'run':str(directory),'complete':not missing,'unresolved_invocations':missing,'worker_calls':len(starts),'completed_worker_calls':len(intervals),'max_observed_worker_processes':maximum,'union_execution_seconds':union,'at_least_two_workers_seconds':overlap,'summed_worker_seconds':sum(r['end']-r['start'] for r in intervals),'boundary':'Controller process intervals; not provider GPU utilization or productive work time.'}

if __name__=='__main__':
    print(json.dumps([analyze(Path(p)) for p in sys.argv[1:]],indent=2))
