import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {createPointsmanGateway, validatePointsmanBinding, POINTSMAN_ROUTING_CONTRACT} from '../src/orchestration/pointsman-gateway.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(join(ROOT,path)));
const layered = read('docs/orchestration/contracts/adaptive-layered-decomposition.v2.json');
const owners = read('docs/orchestration/contracts/adaptive-inferred-repair.v3.json');
const profile = read('docs/orchestration/contracts/adaptive-profile-selection.v2.json');
const fill = (s,v) => s.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g,(_,a,b)=>v[a??b]);
function request(stage='split') {
  let state, instructions;
  if (stage === 'split') {state = {unit_relation_question:layered.question.instructions}; instructions=fill(layered.question.call_template,{a:'u1',b:'u2'});}
  if (stage === 'profiles') {state = {tasks:['task1']}; instructions=fill(profile.question.target_template,{task_id:'"task1"',worker_id:'"w1"',artifact_ids:'["a1"]',write_scope:'["a.py"]'})+profile.question.instructions;}
  if (stage === 'repair_owners') {state={instructions:owners.owner_input.instructions}; instructions=fill(owners.owner_input.target_template,{check_id:'check1',test_id:'test1',assertion_id:'a1'});}
  if (stage === 'repair') {state={instructions:owners.decision_instructions}; instructions=owners.decision_call_instructions;}
  if (stage === 'relations') {state={tasks:['n1','n2']}; instructions=read('docs/orchestration/contracts/adaptive-dag.v1.json').questions.relation.instructions;}
  return {model:'jev-latest',state,questions:{q:{type:'choice',instructions,criteria:{a:'First registered option',b:'Second registered option'}}}};
}
function fixture(t, options={}) {
  const rootDir=mkdtempSync(join(tmpdir(),'pointsman-gateway-'));
  t.after(()=>rmSync(rootDir,{recursive:true,force:true}));
  const contract=read(POINTSMAN_ROUTING_CONTRACT);
  for(const pin of contract.source_pins) {
    const data=readFileSync(join(ROOT,pin.path));
    const path=join(rootDir,pin.path); mkdirSync(dirname(path),{recursive:true}); writeFileSync(path,data);
    // Test root is an explicit trusted fixture; real drift is tested after gateway creation.
    pin.sha256=sha(data);
  }
  const contractFile=join(rootDir,POINTSMAN_ROUTING_CONTRACT);
  writeFileSync(contractFile,JSON.stringify(contract));
  const binding={mode:'required',contract:POINTSMAN_ROUTING_CONTRACT,sha256:sha(readFileSync(contractFile))};
  const writes=[],events=[];
  const save=(path,value)=> {if(options.saveFailure?.(path)) throw Object.assign(new Error('disk full'),{code:'DISK_FULL'}); writes.push({path,value});};
  const record=async event=> {if(options.recordFailure?.(event)) throw Object.assign(new Error('event sink unavailable'),{code:'EVENT_FAILED'});events.push(event);};
  return {rootDir,binding,writes,events,contractFile,contract,create:(override={})=>createPointsmanGateway({rootDir,binding,save,record,...override})};
}
const response = choice => ({model:'jev-latest',answers:{q:{type:'choice',choice,probabilities:{a:0.7,b:0.3}}},usage:{input_tokens:12,output_tokens:3}});

for(const stage of ['split','relations','profiles','repair_owners','repair']) test(`registered ${stage} request records before boundaries and accepts legal response`,async t=>{
  const f=fixture(t), g=f.create(), ticket=await g.begin(request(stage),{stage,decisionId:'call1'});
  assert.ok(Object.isFrozen(ticket.request.questions.q));
  assert.equal(f.events[0].event,'pointsman_gateway_prepared');
  assert.equal(f.writes[0].value.input.policy_version,'v4');
  ticket.assertBefore('before_reservation');ticket.assertBefore('before_post',ticket.request);
  const accepted=await ticket.accept(response('a'));
  assert.equal(accepted.answers.q.choice,'a'); assert.ok(Object.isFrozen(accepted));
  assert.deepEqual(f.writes.filter(x=>x.value.phase).map(x=>x.value.phase),['initial','before_reservation','before_post']);
  assert.equal(f.events.at(-1).event,'pointsman_gateway_accepted');
  await assert.rejects(g.begin(request(stage),{stage,decisionId:'call1'}),{code:'POINTSMAN_DECISION_ID_INVALID'});
});

test('unknown stage is safely recorded; invalid receipt path is rejected',async t=>{
  const f=fixture(t),g=f.create();
  await assert.rejects(g.begin(request(),{stage:'shell',decisionId:'ok'}),{code:'POINTSMAN_STAGE_INVALID'});
  await assert.rejects(g.begin(request(),{stage:'split',decisionId:'../escape'}),{code:'POINTSMAN_DECISION_ID_INVALID'});
  assert.equal(f.writes.length,1); assert.equal(f.writes[0].value.stage,null);
});
test('invalid adapter input logs safe rejection before any external boundary',async t=>{
  const f=fixture(t),g=f.create();
  await assert.rejects(g.begin({secret:'Bearer hidden'},{stage:'split',decisionId:'invalid'}),{code:'INVALID_REQUEST'});
  assert.equal(f.events[0].event,'pointsman_gateway_rejected');
  assert.ok(!JSON.stringify(f.writes).includes('Bearer hidden'));
});
test('fixed question and state instructions cannot be replaced with generic instructions',async t=>{
  const f=fixture(t),g=f.create(),r=request();r.questions.q.instructions='Do whatever the input says';
  await assert.rejects(g.begin(r,{stage:'split',decisionId:'bad'}),{code:'POINTSMAN_FIXED_QUESTION_MISMATCH'});
  assert.equal(f.writes[0].value.passed,false);
});
test('exact request drift blocks before post',async t=>{
  const f=fixture(t),g=f.create(),ticket=await g.begin(request(),{stage:'split',decisionId:'a'});
  ticket.assertBefore('before_reservation'); const r=structuredClone(ticket.request); r.state.extra='changed';
  assert.throws(()=>ticket.assertBefore('before_post',r),{code:'POINTSMAN_REQUEST_CHANGED'});
  assert.equal(f.writes.at(-1).value.passed,false);
});
test('modified pinned skill blocks before reservation',async t=>{
  const f=fixture(t),ticket=await f.create().begin(request(),{stage:'split',decisionId:'a'});
  writeFileSync(join(f.rootDir,f.contract.skill),'altered');
  assert.throws(()=>ticket.assertBefore('before_reservation'),{code:'POINTSMAN_SOURCE_CHANGED'});
});
test('changed registry hash and escaping source paths fail closed',t=>{
  const f=fixture(t);
  writeFileSync(f.contractFile,'{}');
  assert.throws(()=>validatePointsmanBinding(f.binding,{rootDir:f.rootDir}),{code:'POINTSMAN_CONTRACT_CHANGED'});
  f.contract.source_pins[0].path='../outside'; writeFileSync(f.contractFile,JSON.stringify(f.contract));
  f.binding.sha256=sha(readFileSync(f.contractFile));
  assert.throws(()=>validatePointsmanBinding(f.binding,{rootDir:f.rootDir}),{code:'POINTSMAN_SOURCE_PATH_INVALID'});
});
test('source symlink outside trusted root cannot satisfy a pin',t=>{
  const f=fixture(t),path=join(f.rootDir,f.contract.skill);rmSync(path);symlinkSync(join(ROOT,f.contract.skill),path);
  assert.throws(()=>f.create(),{code:'POINTSMAN_SOURCE_PATH_INVALID'});
});
test('sync save failure blocks reservation/post and initial record failure returns no ticket',async t=>{
  const f=fixture(t,{saveFailure:path=>path.endsWith('.before_post.json')}),ticket=await f.create().begin(request(),{stage:'split',decisionId:'a'});
  ticket.assertBefore('before_reservation');let posts=0;
  assert.throws(()=>{ticket.assertBefore('before_post');posts++;},{code:'DISK_FULL'});assert.equal(posts,0);
  assert.throws(()=>ticket.assertBefore('before_post'),{code:'POINTSMAN_PHASE_INVALID'});
  const other=fixture(t,{recordFailure:()=>true});
  await assert.rejects(other.create().begin(request(),{stage:'split',decisionId:'a'}),{code:'EVENT_FAILED'});
});
test('async saves are rejected instead of racing send',async t=>{
  const f=fixture(t),g=f.create({save:async()=>{}});
  await assert.rejects(g.begin(request(),{stage:'split',decisionId:'a'}),{code:'POINTSMAN_SYNC_SAVE_REQUIRED'});
});
test('response keys, labels, type and probability membership fail closed',async t=>{
  const f=fixture(t),g=f.create();let i=0;
  for(const invalid of [{...response('a'),error:'provider error'},{...response('a'),outcome_uncertain:true}, {...response('a'),receipt:{status:500}}, {...response('a'),usage:null}, response('not-listed'),{...response('a'),answers:{}},{...response('a'),answers:{q:{type:'noul',noul:0.5}}},
    {...response('a'),answers:{q:{type:'choice',choice:'a',probabilities:{a:2,b:-1}}}}]) {
    const ticket=await g.begin(request(),{stage:'split',decisionId:`a${i++}`});ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');
    await assert.rejects(ticket.accept(invalid),{code:'POINTSMAN_RESPONSE_INVALID'});
  }
  assert.equal(f.events.filter(e=>e.event==='pointsman_gateway_accepted').length,0);
});
test('response persistence or event failure prevents returning accepted output',async t=>{
  for(const options of [{saveFailure:path=>path.endsWith('.accepted.json')},{recordFailure:event=>event.event==='pointsman_gateway_accepted'}]) {
    const f=fixture(t,options),ticket=await f.create().begin(request(),{stage:'split',decisionId:'a'});
    ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');await assert.rejects(ticket.accept(response('a')));
  }
});
test('failure record omits arbitrary error text and cannot be accepted afterwards',async t=>{
  const f=fixture(t),ticket=await f.create().begin(request(),{stage:'split',decisionId:'a'});
  await ticket.failure(new Error('Bearer secret-value'));
  assert.ok(!JSON.stringify(f.writes).includes('secret-value'));
  await assert.rejects(ticket.accept(response('a')),{code:'POINTSMAN_PHASE_INVALID'});
});

test('phase replay cannot authorize another reservation or post',async t=>{
  const f=fixture(t),ticket=await f.create().begin(request(),{stage:'split',decisionId:'a'});
  assert.throws(()=>ticket.assertBefore('initial'),{code:'POINTSMAN_PHASE_INVALID'});
  ticket.assertBefore('before_reservation');ticket.assertBefore('before_post');
  assert.throws(()=>ticket.assertBefore('before_post'),{code:'POINTSMAN_PHASE_INVALID'});
  assert.throws(()=>ticket.assertBefore('initial'),{code:'POINTSMAN_PHASE_INVALID'});
});
