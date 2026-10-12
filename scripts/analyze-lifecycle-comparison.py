"""Offline D048 paired audit; never calls a provider or executes generated code.

Run: python3 scripts/analyze-lifecycle-comparison.py PROTOCOL --output OUTPUT
Protocol paths are relative to repository root. Output is exclusively created.
See docs/agents/D048_EVALUATION_STATUS.md for the receipt contract.
"""
import argparse
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ('planner', 'decision', 'worker', 'recovery', 'monitor')
TOKENS = ('input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens')
MATCH_KEYS = ('brief_sha256', 'plan_sha256', 'worker_model', 'worker_effort',
              'worker_transport_sha256', 'max_concurrency')


def read(path):
    return json.loads(path.read_text())


def path(value):
    p = Path(value)
    return p if p.is_absolute() else ROOT / p


def sha(p):
    return hashlib.sha256(p.read_bytes()).hexdigest()


def number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0


def total(values):
    values = list(values)
    return sum(values) if all(number(v) for v in values) else None


def elapsed(start, end):
    if not start or not end:
        return None
    a, b = [datetime.fromisoformat(v.replace('Z', '+00:00')) for v in (start, end)]
    if a.tzinfo is None or b.tzinfo is None or b < a:
        raise ValueError('INVALID_TIMELINE')
    return (b - a).total_seconds() * 1000


def rollup(starts, receipts):
    ids = [s['invocation_id'] for s in starts]
    assert len(ids) == len(set(ids)), 'DUPLICATE_INVOCATION_START'
    got = {r['invocation_id']: r for r in receipts}
    assert len(got) == len(receipts), 'DUPLICATE_RECEIPT'
    assert set(got) <= set(ids), 'RECEIPT_WITHOUT_START'
    missing = sorted(set(ids) - set(got))
    for s in starts:
        if s['invocation_id'] in got:
            r = got[s['invocation_id']]
            assert r['category'] == s['category'] and r['provider'] == s['provider'], 'RECEIPT_IDENTITY_MISMATCH'
    costs = [r.get('api_equivalent_usd') for r in receipts]
    return dict(invocations_started=len(ids), receipts=len(receipts), unresolved_invocations=missing,
                api_equivalent_usd=None if missing else total(costs),
                known_api_equivalent_subtotal_usd=sum(v for v in costs if number(v)),
                actual_billed_usd=None if missing else total(r.get('actual_billed_usd') for r in receipts),
                usage={k: None if missing else total((r.get('usage') or {}).get(k) for r in receipts) for k in TOKENS},
                summed_invocation_wall_ms=None if missing else total(r.get('wall_ms') for r in receipts))


def analyze(protocol):
    for source in protocol.get('sources', []):
        assert sha(path(source['path'])) == source['sha256'], 'SOURCE_DRIFT'
    manifest, image = read(path(protocol['manifest'])), read(path(protocol['image_lock']))
    assert manifest['image_digest'] == image['image_digest'], 'MANIFEST_IMAGE_MISMATCH'
    rows = []
    for condition in protocol['conditions']:
        d = path(condition['path'])
        r = read(d / 'result.json')
        assert r['schema_version'] == 'lifecycle-run/v1', 'WRONG_RUN_SCHEMA'
        assert r['condition'] == condition['name'], 'WRONG_CONDITION'
        events = [json.loads(line) for line in (d / 'events.jsonl').read_text().splitlines() if line.strip()]
        starts = [e for e in events if e.get('event') == 'invocation_started']
        assert all(s['category'] in CATEGORIES for s in starts), 'UNKNOWN_CALL_CATEGORY'
        receipts = [read(p) for p in sorted((d / 'receipts').glob('*.json'))]
        # Validate globally first: duplicate IDs cannot hide across categories.
        rollup(starts, receipts)
        groups = {c: rollup([s for s in starts if s['category'] == c], [v for v in receipts if v['category'] == c]) for c in CATEGORIES}
        providers = {p: rollup([s for s in starts if s['provider'] == p], [v for v in receipts if v['provider'] == p]) for p in sorted({s['provider'] for s in starts})}
        operational = rollup([s for s in starts if s['category'] != 'monitor'], [v for v in receipts if v['category'] != 'monitor'])
        grade_events = [e for e in events if e.get('event') == 'grade_finished']
        assert len(grade_events) <= 1, 'MULTIPLE_FINAL_GRADES'
        grade_event = grade_events[0] if grade_events else {}
        grade_location = r.get('grade_path') or grade_event.get('grade_path')
        grade_file = path(grade_location) if grade_location else None
        grade = read(grade_file) if grade_file and grade_file.exists() else None
        grade_timing = read(d / 'grade-timing.json') if (d / 'grade-timing.json').exists() else grade_event
        candidate = path(r['candidate_path']) if r.get('candidate_path') else None
        snapshot_file = d / 'pregrade.json'
        snapshot_verified = False
        if grade:
            assert candidate and candidate.is_dir() and snapshot_file.exists(), 'MISSING_CANDIDATE_PROVENANCE'
            assert not any(p.is_symlink() for p in candidate.rglob('*')), 'CANDIDATE_SYMLINK'
            current = {str(p.relative_to(candidate)): sha(p) for p in sorted(candidate.rglob('*')) if p.is_file()}
            assert current == read(snapshot_file), 'CANDIDATE_CHANGED_AFTER_SNAPSHOT'
            assert grade['task_id'] == manifest['task_id'] and grade['upstream_commit'] == manifest['upstream_commit'], 'WRONG_GRADE_TASK'
            assert Path(grade['workspace']).resolve() == candidate.resolve(), 'WRONG_GRADE_WORKSPACE'
            assert grade['image']['image_digest'] == image['image_digest'], 'WRONG_GRADE_IMAGE'
            snapshot_verified = True
        resolved = bool(grade and grade.get('grading_status') == 'completed' and grade.get('resolved') is True and snapshot_verified
                        and grade.get('summary', {}).get('tests') == manifest['test_case_count']
                        and grade.get('summary', {}).get('passed') == manifest['test_case_count'])
        grade_end = (grade_timing or {}).get('finished_at')
        through_grade_ms = elapsed(r.get('started_at'), grade_end) if grade_end else None
        if grade_end:
            elapsed(r.get('finished_at'), grade_end)  # Grade cannot predate generation completion.
        measured_wall = elapsed(r.get('started_at'), r.get('finished_at'))
        if number(r.get('wall_ms')) and measured_wall is not None:
            assert abs(r['wall_ms'] - measured_wall) < 1000, 'RUN_CLOCK_MISMATCH'
        rows.append(dict(condition=condition['name'], status=r['status'], inputs=r.get('inputs', {}),
                         operational=operational, categories=groups, providers=providers, grade=grade,
                         independently_resolved=resolved, run_wall_ms=r.get('wall_ms'),
                         elapsed_through_grade_ms=through_grade_ms,
                         verified_total_completion_ms=through_grade_ms if resolved else None,
                         grade_elapsed_ms=(grade_timing or {}).get('wall_ms'),
                         snapshot_verified=snapshot_verified,
                         efficiency_claim_eligible=resolved and through_grade_ms is not None))
    matches = [{k: row['inputs'].get(k) for k in MATCH_KEYS} for row in rows]
    matched = bool(len(matches) >= 2 and all(all(v is not None for v in m.values()) and m == matches[0] for m in matches))
    comparisons = []
    for row in rows[1:]:
        base = rows[0]
        eligible = matched and base['efficiency_claim_eligible'] and row['efficiency_claim_eligible']
        diff = {}
        for key, a, b in [('verified_total_completion_ms', base['verified_total_completion_ms'], row['verified_total_completion_ms']),
                          ('operational_api_equivalent_usd', base['operational']['api_equivalent_usd'], row['operational']['api_equivalent_usd'])]:
            diff[key] = dict(baseline=a, condition=b, reduction_percent=100 * (a-b) / a) if eligible and number(a) and a > 0 and number(b) else None
        comparisons.append(dict(baseline=base['condition'], condition=row['condition'], efficiency_claim_eligible=eligible, differences=diff))
    return dict(schema_version='lifecycle-comparison/v1', matched_inputs=matched, rows=rows, comparisons=comparisons,
                limits=['One trial per condition cannot establish stable latency or quality superiority.',
                        'Wall time includes waiting through independent grading; summed invocation time is not parallel wall time.',
                        'Operational totals include planner, all decisions, workers, and recovery; monitoring is separately reported.',
                        'API-equivalent costs are not subscription incremental billing; missing receipt or field remains null.',
                        'Invocation means controller dispatch; internal provider continuations are not separate invocations.',
                        'Thinking estimates and partial assistant usage are never summed.'])


def self_test():
    s = dict(invocation_id='a', category='worker', provider='claude')
    assert rollup([s], [])['api_equivalent_usd'] is None
    assert rollup([], [])['api_equivalent_usd'] == 0
    r = dict(s, api_equivalent_usd=2, actual_billed_usd=None, usage={k: 3 for k in TOKENS}, wall_ms=5)
    assert rollup([s], [r])['actual_billed_usd'] is None
    assert rollup([s], [r])['usage']['output_tokens'] == 3
    assert total([1, None]) is None and total([True]) is None
    assert elapsed('2026-10-10T00:00:00Z', '2026-10-10T00:01:00Z') == 60000
    for starts, rs in [([s, s], [r]), ([], [r]), ([s], [r, r])]:
        try:
            rollup(starts, rs)
        except AssertionError:
            continue
        raise AssertionError('IDENTITY_VALIDATION_FAILED')
    with tempfile.TemporaryDirectory(prefix='d048-analyzer-') as directory:
        base = Path(directory)
        def write(p, value):
            p.write_text(json.dumps(value))
        manifest = dict(image_digest='pinned', task_id='fixture', upstream_commit='fixed', test_case_count=2)
        write(base / 'manifest.json', manifest)
        write(base / 'image.json', dict(image_digest='pinned'))
        protocol = dict(manifest=str(base / 'manifest.json'), image_lock=str(base / 'image.json'), conditions=[])
        for name in ['claude', 'jev']:
            d = base / name
            (d / 'receipts').mkdir(parents=True)
            (d / 'candidate').mkdir()
            (d / 'candidate' / 'file.py').write_text('pass\n')
            write(d / 'pregrade.json', {'file.py': sha(d / 'candidate' / 'file.py')})
            write(d / 'receipts' / 'a.json', r)
            write(d / 'grade.json', dict(manifest, workspace=str(d / 'candidate'), image=dict(image_digest='pinned'), grading_status='completed', resolved=True, summary=dict(tests=2, passed=2)))
            (d / 'events.jsonl').write_text(json.dumps(dict(s, event='invocation_started')) + '\n' + json.dumps(dict(event='grade_finished', grade_path=str(d / 'grade.json'), finished_at='2026-10-10T00:00:02Z', wall_ms=1000)) + '\n')
            write(d / 'result.json', dict(schema_version='lifecycle-run/v1', condition=name, status='generated_ungraded', inputs={k: 'matched' for k in MATCH_KEYS}, candidate_path=str(d / 'candidate'), started_at='2026-10-10T00:00:00Z', finished_at='2026-10-10T00:00:01Z', wall_ms=1000))
            protocol['conditions'].append(dict(name=name, path=str(d)))
        result = analyze(protocol)
        assert result['comparisons'][0]['efficiency_claim_eligible'] is True
        assert result['rows'][0]['verified_total_completion_ms'] == 2000
        g = read(base / 'jev' / 'grade.json')
        g['summary'] = dict(tests=2, passed=1)
        write(base / 'jev' / 'grade.json', g)
        assert analyze(protocol)['comparisons'][0]['differences']['operational_api_equivalent_usd'] is None
        (base / 'jev' / 'candidate' / 'file.py').write_text('changed\n')
        try:
            analyze(protocol)
        except AssertionError as error:
            assert str(error) == 'CANDIDATE_CHANGED_AFTER_SNAPSHOT'
        else:
            raise AssertionError('MUTATED_CANDIDATE_ACCEPTED')
    print('PASS: unknown billing/usage, call identity, timestamps, full paired fixture, quality gating, mutated candidate rejection')


if __name__ == '__main__':
    cli = argparse.ArgumentParser()
    cli.add_argument('protocol', nargs='?')
    cli.add_argument('--output')
    cli.add_argument('--self-test', action='store_true')
    args = cli.parse_args()
    if args.self_test:
        self_test()
    else:
        if not args.protocol or not args.output:
            cli.error('protocol and --output are required')
        result = analyze(read(path(args.protocol)))
        with path(args.output).open('x') as handle:
            json.dump(result, handle, indent=2)
        print(json.dumps({k: result[k] for k in ('matched_inputs', 'comparisons')}, indent=2))
