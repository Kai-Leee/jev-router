"""Grade a named active run once its terminal result appears; no inference or retries."""
import sys,time,subprocess
from pathlib import Path
run=Path(sys.argv[1]);out=Path(sys.argv[2]);started=time.monotonic()
while not (run/'result.json').exists():
    if time.monotonic()-started>14400:raise SystemExit('GRADE_WAIT_DEADLINE')
    time.sleep(2)
raise SystemExit(subprocess.call([sys.executable,'scripts/grade-lifecycle-run.py',str(run),str(out)]))
