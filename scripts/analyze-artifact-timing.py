"""Offline first-write timing; reads requests/journals/events, never thinking streams."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path


def records(p):
    if not p.exists(): return [], False
    raw=p.read_text(); lines=raw.splitlines(); out=[]
    for i,line in enumerate(lines):
        try: out.append(json.loads(line))
        except json.JSONDecodeError:
            if i==len(lines)-1 and not raw.endswith('\n'): return out,True
            raise
    return out,False


def ms(a,b):
    if not a or not b:return None
    return (datetime.fromisoformat(b.replace('Z','+00:00'))-datetime.fromisoformat(a.replace('Z','+00:00'))).total_seconds()*1000


def analyze(directory):
    d=Path(directory).resolve(); events,partial=records(d/'events.jsonl'); rows=[]
    for start in events:
        if start.get('event')!='invocation_started' or start.get('category') not in ['worker','recovery']:continue
        ident=start['invocation_id']; request_path=d/'calls'/f'{ident}.request.json'
        request=json.loads(request_path.read_text())['request']; task=request['task']; attempt=request['attempt']; name=f"{task['id']}-{attempt}"
        transport_path=d/'calls'/f'{name}.transport.json'; transport=json.loads(transport_path.read_text()); journal=Path(transport['journalPath']).resolve()
        assert journal==d/'calls'/f'{name}.artifacts.jsonl','JOURNAL_MAPPING_MISMATCH'
        assert set(transport['allowedPaths'])==set(task['paths']),'OWNERSHIP_MAPPING_MISMATCH'
        entries,truncated=records(journal); writes=[e for e in entries if e.get('event')=='write_finished']; terminals=[e for e in events if e.get('event')=='invocation_finished' and e.get('invocation_id')==ident]
        assert len(terminals)<=1,'DUPLICATE_TERMINAL'
        assert all(e['path'] in transport['allowedPaths'] for e in writes),'OUT_OF_SCOPE_WRITE'
        terminal=terminals[0] if terminals else {}; first=writes[0]['recorded_at'] if writes else None; last=writes[-1]['recorded_at'] if writes else None
        metrics=dict(start_to_first_artifact_ms=ms(start.get('recorded_at'),first),last_artifact_to_terminal_ms=ms(last,terminal.get('recorded_at')),start_to_terminal_ms=ms(start.get('recorded_at'),terminal.get('recorded_at')))
        assert all(v is None or v>=0 for v in metrics.values()),'TIMESTAMP_ORDER_ERROR'
        rows.append(dict(invocation_id=ident,category=start['category'],task_id=task['id'],attempt=attempt,status=terminal.get('status','pending'),started_at=start.get('recorded_at'),first_artifact_at=first,last_artifact_at=last,terminal_at=terminal.get('recorded_at'),successful_writes=len(writes),unique_written_paths=len({e['path'] for e in writes}),assigned_paths=len(task['paths']),journal_truncated=truncated,**metrics,evidence=dict(request=str(request_path),transport=str(transport_path),journal=str(journal),events=str(d/'events.jsonl'))))
    return dict(run=str(d),event_log_truncated=partial,workers=rows)


if __name__=='__main__':
    cli=argparse.ArgumentParser();cli.add_argument('runs',nargs='+');cli.add_argument('--output',required=True);args=cli.parse_args()
    result=dict(schema_version='artifact-timing/v1',observed_at=datetime.now(timezone.utc).isoformat(),runs=[analyze(p) for p in args.runs],limits=['First artifact means first successful journal write_finished, not first generated token or validated code.','Journal request/task/attempt/ownership mapping is checked; internal provider continuation count is not inferred.','No live thinking streams or thinking text are read. No estimated token count is treated as billed usage.','Missing write or terminal timestamp remains null. Concurrent snapshot is provisional.','Last artifact to terminal includes all time after the last successful file write, not necessarily idle time.'])
    with Path(args.output).open('x') as f:json.dump(result,f,indent=2)
    print(json.dumps([{'run':r['run'],'workers':[{k:w[k] for k in ['invocation_id','task_id','status','successful_writes','start_to_first_artifact_ms','last_artifact_to_terminal_ms']} for w in r['workers']]} for r in result['runs']],indent=2))
