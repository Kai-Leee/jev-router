"""D040 bounded larger-task comparison. No provider or generated-code execution."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
B = ROOT / 'benchmark-runs'
read = lambda p: json.loads(p.read_text())
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
protocol = read(B / 'd040-protocol.json')
assert all(sha(ROOT / s['path']) == s['sha256'] for s in protocol['sources']), 'SOURCE_DRIFT'
manifest = read(ROOT / protocol['manifest'])
image = read(ROOT / protocol['image_lock'])
matched, requests, rows = [], [], []
plan_preparation = None
keys = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens']

def sum_known(values):
    return sum(values) if all(isinstance(x, (int, float)) for x in values) else None

for mode in protocol['conditions']:
    d = B / f'd040-{mode}-01'
    if not (d / 'inputs.json').exists():
        rows.append(dict(condition=mode,status='not_started',independent_resolved=False))
        continue
    i = read(d / 'inputs.json')
    r = read(d / ('result.json' if (d / 'result.json').exists() else 'stopped.json'))
    frozen = read(d / 'frozen-plan.json') if (d / 'frozen-plan.json').exists() else None
    match = {k: i[k] for k in ['briefHash', 'model', 'effort', 'inputMode', 'workerSha256', 'questionsSha256', 'maxConcurrency', 'splitThreshold']}
    match['planHash'] = frozen['hash'] if frozen else None
    matched.append(match)
    if (d / 'split-request.json').exists(): requests.append(read(d / 'split-request.json'))
    receipts = r.get('receipts', [])
    planners = [x for x in receipts if x['label'] == 'planner']
    operational = [x for x in receipts if x['label'] != 'planner']
    if planners:
        assert plan_preparation is None and len(planners) == 1, 'MULTIPLE_PLANNERS'
        plan_preparation = planners[0]
    events = [json.loads(line) for line in (d / 'events.jsonl').read_text().splitlines()]
    jev_events = [e for e in events if e.get('event') == 'inference_finished' and e.get('provider') == 'jev']
    decision = read(d / 'split-decision.json') if (d / 'split-decision.json').exists() else None
    routing = r.get('routing') or (decision or {}).get('routing')
    checkpoint = read(d / 'checkpoint.json') if (d / 'checkpoint.json').exists() else None
    started_labels = [e['label'] for e in events if e.get('event') == 'claude_started']
    receipt_labels = [x['label'] for x in receipts]
    unresolved_labels = [label for label in started_labels if label not in receipt_labels]
    unresolved_operational = [label for label in unresolved_labels if label != 'planner']
    grades, hashes = [], []
    for arm in r.get('arms', []):
        candidate = d / f'candidate-{arm["mode"]}'
        current = {str(p.relative_to(candidate)): sha(p) for p in sorted(candidate.rglob('*')) if p.is_file()}
        before = read(d / f'pregrade-{arm["mode"]}.json')
        assert current == before, 'CANDIDATE_CHANGED_AFTER_SNAPSHOT'
        hashes.append(current)
        gp = B / f'd040-grade-{mode}-{arm["mode"]}' / 'result.json'
        g = read(gp) if gp.exists() else None
        if g:
            assert g['task_id'] == manifest['task_id'] and g['upstream_commit'] == manifest['upstream_commit'], 'WRONG_TASK'
            assert Path(g['workspace']).resolve() == candidate.resolve(), 'WRONG_WORKSPACE'
            assert g['image']['image_digest'] == image['image_digest'], 'WRONG_IMAGE'
        grades.append(g)
    known_claude_subtotal = sum(x['api_equivalent_usd'] for x in operational if isinstance(x.get('api_equivalent_usd'), (int,float)))
    claude_cost = None if unresolved_operational else sum_known([x.get('api_equivalent_usd') for x in operational])
    # No inference-start event means zero calls, not missing usage. Started but unresolved stays unknown.
    starts = [e for e in events if e.get('event') == 'inference_started' and e.get('provider') == 'jev']
    assert len(starts)<=1 and len(jev_events)<=1, 'UNEXPECTED_MULTIPLE_JEV_CALLS'
    decision_usage = ((decision or {}).get('response') or {}).get('usage')
    if decision_usage is None and len(jev_events) == 1: decision_usage = jev_events[0].get('usage')
    jev_input = (decision_usage or {}).get('input_tokens')
    if not starts and not jev_events and (routing or {}).get('jev_decision_calls') == 0: jev_input = 0
    jev_cost = None if jev_input is None else jev_input * protocol['jev_usd_per_million_input'] / 1e6
    worker_ms = sum_known([a.get('wall_ms') for a in r.get('arms', [])]) if r.get('arms') else None
    decision_ms = (routing or {}).get('decision_elapsed_ms')
    if decision_ms is None and checkpoint: decision_ms = checkpoint.get('timing_ms', {}).get('decision')
    stage_ms = sum_known([decision_ms, worker_ms])
    row = dict(condition=mode, status=r['status'], stopped_code=r.get('code'), jev_started=len(starts), jev_finished=jev_events, routing=routing, checkpoint=checkpoint, unresolved_started_labels=unresolved_labels, claude_known_cost_subtotal=known_claude_subtotal, claude_operational_calls=len([x for x in started_labels if x!='planner']),
               claude_operational_usage={k: None if unresolved_operational else sum_known([(x.get('usage') or {}).get(k) for x in operational]) for k in keys},
               claude_operational_api_equivalent_usd=claude_cost, jev_usage=decision_usage,
               jev_conservative_usd=jev_cost, comparison_operational_usd=sum_known([claude_cost, jev_cost]),
               raw_run_wall_ms=r.get('wall_ms'), decision_worker_stage_ms=stage_ms, worker_ms=worker_ms,
               grades=grades, candidate_sha256=hashes, actual_incremental_billed_usd=None,
               independent_resolved=bool(r['status']=='generated_ungraded' and grades and all(g and g.get('resolved') is True and g.get('grading_status')=='completed' for g in grades)))
    rows.append(row)
matched_ok = bool(len(matched)==len(protocol['conditions']) and all(m.get('planHash') and m == matched[0] for m in matched))
requests_ok = bool(len(requests)==len(protocol['conditions']) and all(x==requests[0] for x in requests))
for row in rows:
    row['normalized_goal_api_equivalent_plus_jev_usd'] = sum_known([row.get('comparison_operational_usd'), (plan_preparation or {}).get('api_equivalent_usd')])
    row['normalized_plan_decision_worker_ms'] = sum_known([row.get('decision_worker_stage_ms'), (plan_preparation or {}).get('wall_ms')])
comparisons = []
for row in (rows[1:] if matched_ok and requests_ok else []):
    differences = {}
    for key in ['decision_worker_stage_ms','comparison_operational_usd','normalized_goal_api_equivalent_plus_jev_usd']:
        base, value = rows[0][key], row[key]
        differences[key] = None if base is None or value is None or base == 0 else dict(baseline=base,value=value,reduction_percent=100*(base-value)/base)
    comparisons.append(dict(baseline=rows[0]['condition'],condition=row['condition'],differences=differences))
out = dict(protocol=protocol, matched_inputs=matched[0] if matched_ok else None, comparisons_valid=matched_ok and requests_ok, plan_preparation=plan_preparation, rows=rows, comparisons=comparisons,
           budget_after=read(B/'jev-usd1-budget.json'), limits=['One attempt per condition; order and caches shared','No-tools file generation; not iterative agent or recursive decomposition','Planner counted once as preparation; normalized totals allocate same preparation to each condition','Comparison cost is API-equivalent plus conservative Jev, not incremental subscription charge','Monitoring and independent grade excluded from operational metrics'])
with (B/'d040-analysis.json').open('x') as f: json.dump(out,f,indent=2)
print(json.dumps({'rows':[{k:r.get(k) for k in ['condition','status','independent_resolved','comparison_operational_usd','decision_worker_stage_ms']} for r in rows],'comparisons':comparisons},indent=2))
