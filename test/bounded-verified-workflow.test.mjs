import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {processResult} from '../src/benchmark/docker.mjs';
import {runBoundedVerifiedWorkflow} from '../src/orchestration/bounded-verified-workflow.mjs';
import {runWorkerPublicChecks} from '../src/orchestration/public-check-registry.mjs';

const source='First requirement\nSecond requirement';
const input={schema_version:'fixture',goal:'Two dependent public behaviors',source:{path:'public.md',text:source,sha256:createHash('sha256').update(source).digest('hex')},constraints:[],interfaces:[],
  obligations:['A','B'].map((id,i)=>({id,requirement_id:id,text:source.split('\n')[i],source_ref:{path:'public.md',start_line:i+1,end_line:i+1},inputs:[],outputs:[],write_scope:['shared.js'],depends_on:i?['A']:[],gaps:[]})),
  tests:['A','B'].map(id=>({id:'T'+id,requirement_refs:[id],scenario:'Boundary',input:null,expected:true,scope:'unit',runner_ref:null,status:'not_run'}))};
const profiles=[{id:'offline',model:'fixture',effort:'medium',description:'No inference'}];
const registry=['A','B'].map(id=>({id:'check'+id,test_ids:['T'+id],source_ref:'public.md',origin:'public_specification',runner_ref:'controller-owned local assertion'}));
const options={input,profiles,allPaths:['shared.js'],registry,getArtifactRevision:async()=> 'fixture-revision',
  decide:async r=>({answers:Object.fromEntries(Object.entries(r.state.assignment_questions).map(([key,id])=>[key,{type:'choice',choice:id==='A'?'include':'exclude'}]))})};
test('missing all85 product checks blocks BEFORE planning or workers',async()=>{
  const actual=JSON.parse(readFileSync(new URL('../benchmarks/e2e-swe/manifests/d056-obligations.json',import.meta.url)));
  let calls=0;const r=await runBoundedVerifiedWorkflow({...options,input:actual,allPaths:[...new Set(actual.obligations.flatMap(o=>o.write_scope))],registry:[],decide:async()=>{calls++;},execute:async()=>{calls++;},runCheck:async()=>{calls++;}});
  assert.equal(r.code,'PUBLIC_CHECK_MAPPING_MISSING');assert.equal(r.missing_test_ids.length,85);assert.equal(calls,0);
});
test('invalid callbacks and write scope fail before any planning call',async()=>{
  for(const patch of [{execute:null},{runCheck:null},{getArtifactRevision:null},{maxConcurrency:0},{allPaths:[]},{allPaths:['wrong.js']}]) {
    let calls=0;
    await assert.rejects(runBoundedVerifiedWorkflow({...options,execute:async()=>{},runCheck:async()=>{},decide:async()=>{calls++;},...patch}),{code:'INVALID_WORKFLOW_CONFIGURATION'});
    assert.equal(calls,0);
  }
});
for(const bad of [false,true])test(`actual subprocess boundary ${bad?'failure blocks successor':'success releases successor'}`,async()=>{
  const order=[];
  const r=await runBoundedVerifiedWorkflow({...options,execute:async t=>{order.push('execute:'+t.id);return{};},runCheck:async c=>{
    order.push('check:'+c.id);
    const raw=await processResult(process.execPath,['--input-type=module','-e',`import assert from 'node:assert/strict';assert.equal(2+2,${bad?5:4});`]);
    return {...raw,executed:true,assertions:1,skipped:0};
  }});
  assert.equal(r.status,bad?'failed':'completed');
  assert.deepEqual(order,bad?['execute:worker_1','check:checkA']:['execute:worker_1','check:checkA','execute:worker_2','check:checkB']);
  assert.equal(r.product_success,null);
});
test('all mapped checks for one test must pass; one generic pass cannot mask another failure',async()=>{
  let calls=0;
  await assert.rejects(runWorkerPublicChecks({task:{id:'one',test_ids:['TA']},registry:[registry[0],{...registry[0],id:'second'}],artifactRevision:'r',runCheck:async()=>({exit_code:++calls===1?0:1,executed:true,assertions:1,skipped:0,outcome_uncertain:false})}),{code:'PUBLIC_BOUNDARY_CHECK_FAILED'});
  assert.equal(calls,2);
});
for(const patch of [{assertions:0},{skipped:1},{executed:false},{outcome_uncertain:true},{exit_code:null}])test(`invalid executable result ${JSON.stringify(patch)} rejects`,async()=>{
  await assert.rejects(runWorkerPublicChecks({task:{id:'one',test_ids:['TA']},registry,artifactRevision:'r',runCheck:async()=>({exit_code:0,executed:true,assertions:1,skipped:0,outcome_uncertain:false,...patch})}),{code:'PUBLIC_BOUNDARY_CHECK_FAILED'});
});
