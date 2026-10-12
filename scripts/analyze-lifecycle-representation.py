"""D050 wrapper: preserve measured totals without attributing representation effects to judge."""
import argparse
import importlib.util
import json
from pathlib import Path

here = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('continuation', here / 'analyze-lifecycle-continuation.py')
continuation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(continuation)


def enforce_representation(result, protocol):
    # Absence of an explicit match is not evidence that both wire representations match.
    matched = protocol.get('matched_representation') is True
    result['schema_version'] = 'lifecycle-representation-comparison/v1'
    result['matched_core_inputs'] = result['matched_inputs']
    result['matched_representation'] = matched
    result['matched_inputs'] = result['matched_inputs'] and matched
    result['pure_judge_attribution_eligible'] = result['matched_inputs'] and all(r['efficiency_claim_eligible'] for r in result['rows'])
    result['protocol_limitations'] = protocol.get('limitations', [])
    result['limits'].extend(protocol.get('limitations', []))
    if not matched:
        result['limits'].append('Different or unconfirmed wire representations forbid pure judge savings attribution; raw whole-system totals remain descriptive measurements only.')
        for row in result['rows']:
            row['independent_completion_measured'] = row['efficiency_claim_eligible']
            row['efficiency_claim_eligible'] = False
        for comparison in result['comparisons']:
            comparison['efficiency_claim_eligible'] = False
            comparison['differences'] = {key: None for key in comparison['differences']}
            comparison['suppression_reason'] = 'UNMATCHED_DECISION_REPRESENTATION'
    return result


def analyze(protocol):
    return enforce_representation(continuation.analyze(protocol), protocol)


def self_test():
    fixture = dict(matched_inputs=True, rows=[dict(efficiency_claim_eligible=True)], comparisons=[dict(efficiency_claim_eligible=True, differences={'cost': {'reduction_percent': 50}})], limits=[])
    out = enforce_representation(fixture, {'limitations': ['different encoding']})
    assert not out['pure_judge_attribution_eligible']
    assert out['comparisons'][0]['differences']['cost'] is None
    assert out['rows'][0]['independent_completion_measured'] is True
    assert out['matched_core_inputs'] is True and out['matched_inputs'] is False
    print('PASS: identical core inputs and successful quality cannot override unmatched representation')


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
        result = analyze(continuation.base.read(continuation.base.path(args.protocol)))
        with continuation.base.path(args.output).open('x') as handle:
            json.dump(result, handle, indent=2)
        print(json.dumps({key: result[key] for key in ('matched_core_inputs', 'matched_representation', 'pure_judge_attribution_eligible', 'comparisons')}, indent=2))
