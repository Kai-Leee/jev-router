import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {allocateSequential} from '../src/orchestration/sequential-allocation.mjs';
const profiles = [{id:'test-medium',model:'test-model',effort:'medium',description:'Offline profile only.'}];
function fixture(n = 5) {
  const text = Array.from({length:n}, (_, i) => `Requirement ${i}`).join('\n');
  const obligations = text.split('\n').map((text, i) => ({id:`O${i}`,requirement_id:`R${i}`,text,
    source_ref:{path:'public.md',start_line:i+1,end_line:i+1},inputs:[],outputs:[],write_scope:[`file${i}.py`],depends_on:[],gaps:[]}));
  const tests = obligations.map(o => ({id:`T${o.id}`,requirement_refs:[o.id],scenario:'Public scenario',input:null,expected:true,scope:'unit',runner_ref:null,status:'not_run'}));
  return {schema_version:'fixture',goal:'Implement public requirements',source:{path:'public.md',text,sha256:createHash('sha256').update(text).digest('hex')},obligations,tests,constraints:[],interfaces:[]};
}
function reply(request, count = '3') {
  return {answers:Object.fromEntries(Object.keys(request.questions).map(key => [key,{type:'choice',choice:
    request.stage==='count' ? count : request.stage==='profile' ? profiles[0].id
    : request.state.assignment_questions[key] === request.state.remaining_obligation_ids[0] ? 'include' : 'exclude'}]))};
}
const run = options => allocateSequential({input:fixture(),profiles,decide:async r=>reply(r),...options});
test('exclusive allocation preserves linked tests, last remainder and supplied profiles',async()=>{
  const events=[],requests=[];
  const result = await run({record:async e=>events.push(e),decide:async r=>{requests.push(r);return reply(r);}});
  assert.deepEqual(result.tasks.map(t=>t.obligation_ids),[['O0'],['O1'],['O2','O3','O4']]);
  assert.equal(result.coverage.linked_test_specifications,5);
  assert.equal(events.filter(e=>e.event==='allocation_deterministic_remainder').length,1);
  assert(result.tasks.every(t=>t.profile.id===profiles[0].id));
  assert.deepEqual(requests.map(r=>r.stage),['count','allocate','allocate','profile','profile','profile']);
});
test('batches cap32 with full remaining context and prior batch selection',async()=>{
  const requests=[];
  const result=await run({input:fixture(80),decide:async r=>{requests.push(r);return reply(r);}});
  const batches=requests.filter(r=>r.stage==='allocate');
  assert.deepEqual(batches.map(r=>Object.keys(r.questions).length),[32,32,16,32,32,15]);
  assert.equal(batches[1].state.remaining_obligation_ids.length,80);
  assert.deepEqual(batches[1].state.selected_for_current_worker,['O0']);
  assert.equal(result.coverage.obligations,80);
});
test('empty and excessive model selection fail without truncation or profile calls',async()=>{
  for(const choice of ['include','exclude']){
    const stages=[];
    await assert.rejects(run({decide:async r=>{stages.push(r.stage);const x=reply(r);if(r.stage==='allocate')for(const a of Object.values(x.answers))a.choice=choice;return x;}}),{code:choice==='include'?'ALLOCATION_OVER_ALLOCATED':'ALLOCATION_EMPTY_WORKER'});
    assert.deepEqual(stages,['count','allocate']);
  }
});
test('malformed responses and unsupported profiles stop without retry',async()=>{
  for(const corrupt of [r=>{delete r.answers.count;},r=>{r.answers.count.type='score';},r=>{r.answers.count.choice='1';},r=>{r.answers.extra={type:'choice',choice:'2'};}]){
    let calls=0;
    await assert.rejects(run({decide:async r=>{calls++;const answer=reply(r);corrupt(answer);return answer;}}),{code:'INVALID_ALLOCATION_ANSWER'});
    assert.equal(calls,1);
  }
  await assert.rejects(run({decide:async r=>{const answer=reply(r);if(r.stage==='profile')answer.answers.profile.choice='unknown';return answer;}}),{code:'INVALID_ALLOCATION_ANSWER'});
});
test('explicit dependencies retained and overlapping writes serialize ascending',async()=>{
  const input=fixture();input.obligations[1].write_scope=['file0.py'];input.obligations[3].depends_on=['O1'];
  const result=await run({input});
  assert.deepEqual(result.tasks.map(t=>t.depends_on),[[],['worker_1'],['worker_2']]);
});
test('conflicting dependency and ascending write order reject before model selection',async()=>{
  const input=fixture();input.obligations[0].depends_on=['O1'];input.obligations[1].write_scope=['file0.py'];
  await assert.rejects(run({input}),{code:'ALLOCATION_DEPENDENCY_CYCLE'});
});
test('caller and journal uncertainty propagate with no paid retry',async()=>{
  let calls=0;
  await assert.rejects(run({decide:async()=>{calls++;throw Object.assign(Error('uncertain'),{code:'TIMEOUT',outcomeUncertain:true});}}),{code:'TIMEOUT',outcomeUncertain:true});
  assert.equal(calls,1);
  calls=0;
  await assert.rejects(run({record:async()=>{throw Error('disk');},decide:async r=>{calls++;return reply(r);}}),/disk/);
  assert.equal(calls,0);
});
test('two obligations cannot request infeasible count or mutate original input',async()=>{
  const input=fixture(2), before=structuredClone(input);
  const result=await run({input,decide:async r=>{if(r.stage==='count')assert.deepEqual(Object.keys(r.questions.count.criteria),['2']);return reply(r,'2');}});
  assert.equal(result.tasks.length,2);assert.deepEqual(input,before);
});

test('public80/85 fixture preserves semantic projection and stays below240k bytes',async()=>{
  const input=JSON.parse(readFileSync(new URL('../benchmarks/e2e-swe/manifests/d056-obligations.json',import.meta.url),'utf8'));
  const sizes=[];
  const result=await run({input,decide:async r=>{
    sizes.push(Buffer.byteLength(JSON.stringify(r)));
    assert.deepEqual(r.state.source,input.source);
    assert.deepEqual(r.state.tests.map(t=>t.expected),input.tests.map(t=>t.expected));
    assert.deepEqual(r.state.obligations.map(o=>o.depends_on),input.obligations.map(o=>o.depends_on));
    assert.deepEqual(r.state.obligations.map(o=>o.dependency_assertion),input.obligations.map(o=>o.dependency_assertion));
    return reply(r);
  }});
  assert.equal(result.coverage.obligations,80);assert.equal(result.coverage.linked_test_specifications,85);
  assert(Math.max(...sizes)<240000);assert.equal(sizes.length,10);
});
