"""Freeze terminal candidate, grade offline with pinned original tests, append timing."""
import json,sys,hashlib,time,subprocess
from pathlib import Path
from datetime import datetime,timezone
run=Path(sys.argv[1]).resolve(); out=Path(sys.argv[2]).resolve()
r=json.loads((run/'result.json').read_text()); candidate=Path(r['candidate_path'])
assert r['status'] in ('ready_for_independent_grade','stopped')
def snapshot():
    result={}
    for p in sorted(candidate.rglob('*')):
        assert not p.is_symlink()
        if p.is_file():
            assert p.stat().st_nlink==1
            result[str(p.relative_to(candidate))]=hashlib.sha256(p.read_bytes()).hexdigest()
    return result
before=snapshot()
with (run/'pregrade.json').open('x') as f:json.dump(before,f,indent=2)
start=time.monotonic()
p=subprocess.run([sys.executable,'benchmarks/e2e-swe/adapter.py','--manifest','benchmarks/e2e-swe/manifests/openapi_python_client.json','grade','--workspace',str(candidate),'--image-lock','benchmark-runs/d040-openapi-image-lock.json','--output',str(out)],capture_output=True,text=True)
with (run/'grade-controller.json').open('x') as f:json.dump({'returncode':p.returncode,'stdout':p.stdout,'stderr':p.stderr},f,indent=2)
assert before==snapshot(),'CANDIDATE_CHANGED'
assert (out/'result.json').exists(),'NO_GRADE_RECEIPT'
e={'event':'grade_finished','grade_path':str(out/'result.json'),'finished_at':datetime.now(timezone.utc).isoformat(),'wall_ms':(time.monotonic()-start)*1000}
with (run/'events.jsonl').open('a') as f:f.write(json.dumps(e)+'\n')
print((out/'result.json').read_text())
