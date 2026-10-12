import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {allocateSequentialV3} from '../src/orchestration/sequential-allocation-v3.mjs';
import {sequentialEnvelopeV3} from '../src/orchestration/sequential-envelope-v3.mjs';
import {executeVerifiedEnvelope} from '../src/orchestration/worker-verification-gate.mjs';
const profiles = [{id:'test-medium',model:'test-model',effort:'medium',description:'Offline profile only.'}];
function fixture(n = 5) {
  const text = Array.from({length:n}, (_, i) => `Requirement ${i}`).join('\n');
  const obligations = text.split('\n').map((text, i) => ({id:`O${i}`,requirement_id:`R${i}`,text,
    source_ref:{path:'public.md',start_line:i+1,end_line:i+1},inputs:[],outputs:[],write_scope:[`file${i}.py`],depends_on:[],gaps:[]}));
  const tests = obligations.map(o => ({id:`T${o.id}`,requirement_refs:[o.id],scenario:'Public scenario',input:null,expected:true,scope:'unit',runner_ref:null,status:'not_run'}));
  return {schema_version:'fixture',goal:'Implement public requirements',source:{path:'public.md',text,sha256:createHash('sha256').update(text).digest('hex')},obligations,tests,constraints:[],interfaces:[]};
}
function answer(r, selector, count = '3') {
  return {answers:Object.fromEntries(Object.keys(r.questions).map(k=>[k,{type:'choice',choice:r.stage==='count'?count:r.stage==='profile'?profiles[0].id:selector(r,r.state.assignment_questions[k])?'include':'exclude'}]))};
}
const balanced = (r,id) => r.state.remaining_obligation_ids.indexOf(id) < Math.ceil(r.state.remaining_obligation_ids.length/(r.state.reserve_for_later_workers+1));
const run = opts => allocateSequentialV3({input:fixture(),profiles,decide:async r=>answer(r,balanced),...opts});
test('30worker choice offered and30worker80obligation plan executes with concurrency2',async()=>{
  const input=fixture(80);
  const plan=await run({input,decide:async r=>{
    if(r.stage==='count')assert.deepEqual(Object.keys(r.questions.count.criteria),Array.from({length:29},(_,i)=>String(i+2)));
    return answer(r,balanced,'30');
  }});
  assert.equal(plan.count,30);assert.equal(plan.maximum_obligations_per_worker,4);
  assert.equal(plan.tasks.length,30);assert.equal(plan.coverage.obligations,80);
  assert(plan.tasks.every(t=>t.obligation_ids.length>=1&&t.obligation_ids.length<=4));
  const envelope=sequentialEnvelopeV3({input,plan,profiles,allPaths:input.obligations.flatMap(o=>o.write_scope)});
  let active=0,peak=0,executed=0;
  const result=await executeVerifiedEnvelope({envelope,maxConcurrency:2,
    execute:async()=>{active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,2));active--;executed++;},
    getArtifactRevision:async()=> 'fixture',
    verify:async t=>({artifact_revision:'fixture',evidence:t.test_ids.map(test_id=>({test_id,status:'passed',executed:true,exit_code:0,check_id:'mock',artifact_revision:'fixture'}))})});
  assert.equal(result.status,'completed');assert.equal(executed,30);assert.equal(peak,2);
  assert.throws(()=>sequentialEnvelopeV3({input,plan:{...plan,tasks:[...plan.tasks,plan.tasks[0]]},profiles,allPaths:[]}),{code:'INVALID_SEQUENTIAL_PLAN'});
});
test('31workers rejected and count choices never exceed obligation count',async()=>{
  let calls=0;
  await assert.rejects(run({policy:{count_options:[31]},decide:async()=>{calls++;}}),{code:'INVALID_ALLOCATION_POLICY'});
  assert.equal(calls,0);
  await run({input:fixture(3),decide:async r=>{if(r.stage==='count')assert.deepEqual(Object.keys(r.questions.count.criteria),['2','3']);return answer(r,balanced,'3');}});
});
test('bounded balanced allocation covers original requirements and tests with deterministic singleton profile',async()=>{
  const requests=[],events=[];
  const result=await run({record:async e=>events.push(e),decide:async r=>{requests.push(r);return answer(r,balanced);}});
  assert.deepEqual(result.tasks.map(t=>t.obligation_ids.length),[2,2,1]);
  assert.equal(result.maximum_obligations_per_worker,3);
  assert.equal(result.coverage.obligations,5);assert.equal(result.coverage.linked_test_specifications,5);
  assert.equal(requests.filter(r=>r.stage==='profile').length,0);
  assert.equal(events.filter(e=>e.event==='allocation_deterministic_profile').length,3);
});
test('actual80/85 fixture explicitly refines65 selected obligations to27, all workers<=34',async()=>{
  const input=JSON.parse(readFileSync(new URL('../benchmarks/e2e-swe/manifests/d056-obligations.json',import.meta.url),'utf8'));
  const before=structuredClone(input),requests=[],events=[];
  const result=await run({input,record:async e=>events.push(e),decide:async r=>{
    requests.push(r);
    assert.deepEqual(r.state.source,input.source);
    return answer(r,(r,id)=>r.node_id==='worker_1'&&r.stage==='allocate' ? r.state.remaining_obligation_ids.indexOf(id)<65 : balanced(r,id));
  }});
  assert.deepEqual(result.tasks.map(t=>t.obligation_ids.length),[27,27,26]);
  assert(result.tasks.every(t=>t.obligation_ids.length<=34));
  assert.equal(result.coverage.linked_test_specifications,85);assert.equal(result.coverage.obligations,80);
  assert.equal(result.tasks[0].allocation_bounds.refinement_rounds,1);
  const rejected=events.filter(e=>e.event==='allocation_selection_rejected');assert.equal(rejected.length,1);assert.equal(rejected[0].selected_count,65);
  assert(requests.filter(r=>r.stage==='refine').every(r=>r.state.prior_rejected_selection.length===65));
  assert.deepEqual(input,before);
});
test('future capacity minimum rejects too-small selection, final remainder bounded',async()=>{
  const events=[];
  const result=await run({input:fixture(80),record:async e=>events.push(e),decide:async r=>answer(r,(r,id)=>r.stage==='allocate'?id===r.state.remaining_obligation_ids[0]:balanced(r,id))});
  assert(result.tasks.every(t=>t.obligation_ids.length<=34));
  assert.equal(events.find(e=>e.event==='allocation_selection_rejected').minimum,12);
});
test('exhaustion stops instead of trimming, fallback or profile calls',async()=>{
  for (const selector of [()=>true,()=>false]) {
    const requests=[];
    await assert.rejects(run({profiles:[...profiles,{...profiles[0],id:'second'}],decide:async r=>{requests.push(r);return answer(r,selector);}}),{code:'ALLOCATION_REFINEMENT_EXHAUSTED'});
    assert.equal(requests.filter(r=>r.stage==='refine').length,3);
    assert.equal(requests.filter(r=>r.stage==='profile').length,0);
  }
});
test('impossible count policy and invalid capacity policy stop before calls',async()=>{
  let calls=0;
  for(const policy of [{count_options:[5]},{load_multiplier:0.5},{max_refinement_rounds:4}]){
    await assert.rejects(run({input:fixture(2),policy,decide:async()=>{calls++;}}));
  }
  assert.equal(calls,0);
});
test('dependency and path evidence passed explicitly; actual overlaps serialize',async()=>{
  const input=fixture();input.obligations[2].write_scope=['file0.py'];input.obligations[4].depends_on=['O2'];
  const requests=[];
  const result=await run({input,decide:async r=>{requests.push(r);return answer(r,balanced);}});
  const state=requests.find(r=>r.stage==='allocate').state;
  assert.deepEqual(state.independence_evidence.shared_write_paths,[{path:'file0.py',obligation_ids:['O0','O2']}]);
  assert.deepEqual(state.independence_evidence.explicit_dependency_edges,[{obligation_id:'O4',depends_on:'O2'}]);
  assert.equal(state.independence_evidence.unknown_dependency_ids.length,5);
  assert.deepEqual(result.tasks.map(t=>t.depends_on),[[],['worker_1'],['worker_2']]);
  assert.equal(result.semantic_independence_verified,false);
});
test('dependency cycle rejects before choosing any supplied profile',async()=>{
  const input=fixture();input.obligations[0].depends_on=['O2'];input.obligations[2].write_scope=['file0.py'];
  const requests=[];
  await assert.rejects(run({input,profiles:[...profiles,{...profiles[0],id:'second'}],decide:async r=>{requests.push(r);return answer(r,balanced);}}),{code:'ALLOCATION_DEPENDENCY_CYCLE'});
  assert.equal(requests.filter(r=>r.stage==='profile').length,0);
});
test('two obligations resolve singleton count deterministically; no invalid one-choice request',async()=>{
  const requests=[],events=[];
  const result=await run({input:fixture(2),record:async e=>events.push(e),decide:async r=>{requests.push(r);return answer(r,balanced);}});
  assert.equal(result.count,2);assert.deepEqual(requests.map(r=>r.stage),['allocate']);
  assert(events.some(e=>e.event==='allocation_deterministic_count'));
});
test('uncertain API and invalid answers propagate without refinement/retry',async()=>{
  let calls=0;
  await assert.rejects(run({decide:async()=>{calls++;throw Object.assign(Error('unknown'),{code:'TIMEOUT',outcomeUncertain:true});}}),{code:'TIMEOUT',outcomeUncertain:true});
  assert.equal(calls,1);calls=0;
  await assert.rejects(run({decide:async()=>{calls++;return {answers:{count:{type:'choice',choice:'1'}}};}}),{code:'INVALID_ALLOCATION_ANSWER'});
  assert.equal(calls,1);
});
test('multiple profiles chosen only after valid allocation and dependencies',async()=>{
  const requests=[];
  const result=await run({profiles:[...profiles,{...profiles[0],id:'second'}],decide:async r=>{requests.push(r);return answer(r,balanced);}});
  assert.deepEqual(requests.slice(-3).map(r=>r.stage),['profile','profile','profile']);
  assert(result.tasks.every(t=>t.profile.id===profiles[0].id));
});
