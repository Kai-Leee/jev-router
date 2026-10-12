"""Offline D049 continuation audit. Preserve D048 spend and elapsed time."""
import argparse
import importlib.util
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('lifecycle_base', HERE / 'analyze-lifecycle-comparison.py')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)


def combine(parts):
    return dict(invocations_started=sum(x['invocations_started'] for x in parts),
                receipts=sum(x['receipts'] for x in parts),
                unresolved_invocations=[{'stage': i, 'invocation_id': label} for i, x in enumerate(parts) for label in x['unresolved_invocations']],
                api_equivalent_usd=base.total(x['api_equivalent_usd'] for x in parts),
                known_api_equivalent_subtotal_usd=sum(x['known_api_equivalent_subtotal_usd'] for x in parts),
                actual_billed_usd=base.total(x['actual_billed_usd'] for x in parts),
                usage={k: base.total(x['usage'][k] for x in parts) for k in base.TOKENS},
                summed_invocation_wall_ms=base.total(x['summed_invocation_wall_ms'] for x in parts))


def analyze(protocol):
    # New frozen source pins and optional old evidence pins are independently checked.
    for item in protocol.get('parent_evidence', []):
        assert base.sha(base.path(item['path'])) == item['sha256'], 'PARENT_EVIDENCE_DRIFT'
    parent_protocol = dict(protocol, sources=[], conditions=[dict(name=c['name'], path=c['parent_path']) for c in protocol['conditions']])
    parents = base.analyze(parent_protocol)
    current = base.analyze(protocol)
    rows = []
    for condition, old, new in zip(protocol['conditions'], parents['rows'], current['rows']):
        old_dir, new_dir = base.path(condition['parent_path']), base.path(condition['path'])
        before, after = base.read(old_dir / 'result.json'), base.read(new_dir / 'result.json')
        assert base.path(after['parent_path']).resolve() == old_dir.resolve(), 'PARENT_LINEAGE_MISMATCH'
        assert all(before['inputs'].get(k) == after['inputs'].get(k) for k in base.MATCH_KEYS), 'CONTINUATION_INPUT_DRIFT'
        pause = base.elapsed(before['finished_at'], after['started_at'])
        # Sum both measured active stages; continuous end-to-end includes the repair pause.
        active = base.total([old['run_wall_ms'], new['run_wall_ms'], new['grade_elapsed_ms']])
        continuous = base.total([base.elapsed(before['started_at'], after['started_at']), new['elapsed_through_grade_ms']])
        grade_pass = new['independently_resolved']
        all_providers = set(old['providers']) | set(new['providers'])
        empty = base.rollup([], [])
        rows.append(dict(condition=condition['name'], status=new['status'], parent_status=old['status'],
                         parent_path=str(old_dir), continuation_path=str(new_dir),
                         stages=[old, new], operational=combine([old['operational'], new['operational']]),
                         categories={c: combine([old['categories'][c], new['categories'][c]]) for c in base.CATEGORIES},
                         providers={p: combine([old['providers'].get(p, empty), new['providers'].get(p, empty)]) for p in sorted(all_providers)},
                         independently_resolved=grade_pass,
                         elapsed_original_start_through_grade_ms=continuous,
                         verified_total_completion_ms=continuous if grade_pass else None,
                         active_run_and_grade_ms=active,
                         verified_active_completion_ms=active if grade_pass else None,
                         intervening_repair_pause_ms=pause,
                         efficiency_claim_eligible=grade_pass and continuous is not None))
    matched = parents['matched_inputs'] and current['matched_inputs']
    comparisons = []
    for row in rows[1:]:
        first = rows[0]
        eligible = matched and first['efficiency_claim_eligible'] and row['efficiency_claim_eligible']
        differences = {}
        for key in ['verified_total_completion_ms', 'verified_active_completion_ms', 'operational_api_equivalent_usd']:
            a = first['operational']['api_equivalent_usd'] if key == 'operational_api_equivalent_usd' else first[key]
            b = row['operational']['api_equivalent_usd'] if key == 'operational_api_equivalent_usd' else row[key]
            differences[key] = dict(baseline=a, condition=b, reduction_percent=100*(a-b)/a) if eligible and base.number(a) and a > 0 and base.number(b) else None
        comparisons.append(dict(baseline=first['condition'], condition=row['condition'], efficiency_claim_eligible=eligible, differences=differences))
    return dict(schema_version='lifecycle-continuation-comparison/v1', matched_inputs=matched,
                rows=rows, comparisons=comparisons,
                limits=current['limits'] + ['Original-start completion includes the controller defect investigation and continuation pause.',
                                            'Active time sums measured stage wall times and grader wall time; excludes inter-stage investigation and grade queue wait.',
                                            'D048 receipts are charged once as historical stage spend; D049 must contain only newly dispatched calls.',
                                            'The continuation corrects an infrastructure defect; it is not an independent fresh replicate.'])


def self_test():
    empty = base.rollup([], [])
    start = dict(invocation_id='001', category='worker', provider='claude')
    receipt = dict(start, wall_ms=10, usage={k: 1 for k in base.TOKENS}, api_equivalent_usd=2, actual_billed_usd=None)
    known = base.rollup([start], [receipt])
    unknown = base.rollup([start], [])
    assert combine([known, known])['api_equivalent_usd'] == 4
    assert combine([known, known])['invocations_started'] == 2
    assert combine([known, unknown])['api_equivalent_usd'] is None
    assert combine([known, unknown])['known_api_equivalent_subtotal_usd'] == 2
    assert combine([known, empty])['actual_billed_usd'] is None
    assert combine([unknown, unknown])['unresolved_invocations'] == [{'stage': 0, 'invocation_id': '001'}, {'stage': 1, 'invocation_id': '001'}]
    assert base.total([1000, 2000, 3000]) == 6000
    print('PASS: repeated per-stage IDs, all stage spend, unknown total with known subtotal, billing null, active time arithmetic')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('protocol', nargs='?')
    parser.add_argument('--output')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        self_test()
    else:
        if not args.protocol or not args.output:
            parser.error('protocol and --output are required')
        result = analyze(base.read(base.path(args.protocol)))
        with base.path(args.output).open('x') as handle:
            json.dump(result, handle, indent=2)
        print(json.dumps({'matched_inputs': result['matched_inputs'], 'comparisons': result['comparisons']}, indent=2))
