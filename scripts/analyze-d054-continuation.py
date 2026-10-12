"""Offline continuation audit. No inference; exclusive output; stage costs never reset."""
import argparse
import importlib.util
import json
from pathlib import Path

SPEC = importlib.util.spec_from_file_location('lifecycle_base', Path(__file__).with_name('analyze-lifecycle-comparison.py'))
base = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(base)


def chain_for(condition):
    """Follow parent_path in condition or result, oldest first; reject repeated paths."""
    chain, seen = [], set()
    current = dict(condition)
    while current:
        directory = base.path(current['path']).resolve()
        assert directory not in seen, 'CONTINUATION_CYCLE'
        seen.add(directory)
        result = base.read(directory / 'result.json')
        chain.append((directory, result))
        parent = current.get('parent_path') or result.get('parent_path')
        current = {'path': parent} if parent else None
    return list(reversed(chain))


def combine(stages, raw_results):
    first, last = raw_results[0], raw_results[-1]
    for previous, current in zip(raw_results, raw_results[1:]):
        base.elapsed(previous['finished_at'], current['started_at'])
    operational = {}
    for field in ('invocations_started', 'receipts', 'api_equivalent_usd', 'known_api_equivalent_subtotal_usd', 'actual_billed_usd', 'summed_invocation_wall_ms'):
        operational[field] = base.total(s['operational'][field] for s in stages)
    operational['usage'] = {k: base.total(s['operational']['usage'][k] for s in stages) for k in base.TOKENS}
    operational['unresolved_invocations'] = [f'stage_{i}:{v}' for i, s in enumerate(stages) for v in s['operational']['unresolved_invocations']]
    active_ms = base.total(s['run_wall_ms'] for s in stages)
    continuous_ms = base.elapsed(first['started_at'], last['finished_at'])
    final_grade_ms = stages[-1]['elapsed_through_grade_ms']
    prefix_ms = base.elapsed(first['started_at'], last['started_at'])
    through_grade = None if final_grade_ms is None else prefix_ms + final_grade_ms
    resolved = stages[-1]['independently_resolved']
    return dict(operational=operational, active_stage_run_wall_ms=active_ms,
                original_start_through_final_run_ms=continuous_ms,
                continuation_pause_ms=max(0, continuous_ms-active_ms) if active_ms is not None else None,
                elapsed_through_grade_ms=through_grade,
                verified_total_completion_ms=through_grade if resolved else None,
                independently_resolved=resolved, grade=stages[-1]['grade'],
                efficiency_claim_eligible=resolved and through_grade is not None)


def analyze(protocol):
    rows=[]
    for condition in protocol['conditions']:
        chain=chain_for(condition)
        stages=[]
        for directory,result in chain:
            one={**protocol,'conditions':[{'name':result['condition'],'path':str(directory)}]}
            measured=base.analyze(one)['rows'][0]
            measured['path']=str(directory)
            measured['stopped_code']=result.get('stopped_code')
            stages.append(measured)
        # A resume must retain all comparable worker/brief settings.
        reference={k:stages[0]['inputs'].get(k) for k in base.MATCH_KEYS}
        assert all({k:s['inputs'].get(k) for k in base.MATCH_KEYS}==reference for s in stages),'CONTINUATION_INPUT_DRIFT'
        row=combine(stages,[r for _,r in chain])
        row.update(condition=condition['name'],inputs=reference,stages=stages)
        rows.append(row)
    matched=len(rows)>1 and all(r['inputs']==rows[0]['inputs'] and all(v is not None for v in r['inputs'].values()) for r in rows)
    comparisons=[]
    for row in rows[1:]:
        first=rows[0];eligible=matched and first['efficiency_claim_eligible'] and row['efficiency_claim_eligible']
        differences={}
        for key,a,b in [('verified_total_completion_ms',first['verified_total_completion_ms'],row['verified_total_completion_ms']),('operational_api_equivalent_usd',first['operational']['api_equivalent_usd'],row['operational']['api_equivalent_usd'])]:
            differences[key]={'baseline':a,'condition':b,'reduction_percent':100*(a-b)/a} if eligible and base.number(a) and a>0 and base.number(b) else None
        comparisons.append({'baseline':first['condition'],'condition':row['condition'],'efficiency_claim_eligible':eligible,'differences':differences})
    history=[]
    for item in protocol.get('development_history',[]):
        directory=base.path(item['path']);r=base.read(directory/'result.json')
        measured=base.analyze({**protocol,'conditions':[{'name':r['condition'],'path':str(directory)}]})['rows'][0]
        history.append({'path':str(directory),'operational':measured['operational'],'excluded_from_condition_comparison':True})
    return {'schema_version':'d054-continuation-comparison/v1','matched_inputs':matched,'rows':rows,'comparisons':comparisons,'development_history':history,
            'development_api_equivalent_usd':base.total([r['operational']['api_equivalent_usd'] for r in rows]+[h['operational']['api_equivalent_usd'] for h in history]),
            'limits':['Continuation stages each contribute their own invocation receipts once; reused files are not new worker calls.','Original start through final grade includes controller repair pauses and intermediate grading time.','active_stage_run_wall_ms excludes gaps and must not replace continuous elapsed time.','Prepared versus resumed decomposition has changed scaffolding and is not a pure judge comparison.','Historical failed planning stays separate from condition comparison and is included only in development total.','Reuse preparation cost and actual subscription billing remain unknown.','Full-quality gate suppresses efficiency ratios when either condition is unresolved.']}


def self_test():
    def stage(cost,wall,grade=None,resolved=False):
        return {'operational':{'invocations_started':1,'receipts':1,'api_equivalent_usd':cost,'known_api_equivalent_subtotal_usd':cost,'actual_billed_usd':None,'summed_invocation_wall_ms':wall,'usage':{k:1 for k in base.TOKENS},'unresolved_invocations':[]},'run_wall_ms':wall,'elapsed_through_grade_ms':grade,'independently_resolved':resolved,'grade':None}
    raw=[{'started_at':'2026-10-10T00:00:00Z','finished_at':'2026-10-10T00:00:01Z'},{'started_at':'2026-10-10T00:00:10Z','finished_at':'2026-10-10T00:00:12Z'}]
    r=combine([stage(2,1000),stage(3,2000,3000,True)],raw)
    assert r['operational']['api_equivalent_usd']==5
    assert r['operational']['actual_billed_usd'] is None
    assert r['continuation_pause_ms']==9000 and r['elapsed_through_grade_ms']==13000
    assert r['active_stage_run_wall_ms']==3000 and r['original_start_through_final_run_ms']==12000
    assert combine([stage(2,1000)],[raw[0]])['verified_total_completion_ms'] is None
    print('PASS: stage costs once, unknown billing, repair pause retained, continuous through-grade time, incomplete quality gate')


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('protocol',nargs='?');parser.add_argument('--output');parser.add_argument('--self-test',action='store_true');args=parser.parse_args()
    if args.self_test:self_test()
    else:
        if not args.protocol or not args.output:parser.error('protocol and --output required')
        result=analyze(base.read(base.path(args.protocol)))
        with base.path(args.output).open('x') as handle:json.dump(result,handle,indent=2)
        print(json.dumps({'matched_inputs':result['matched_inputs'],'comparisons':result['comparisons']}))
