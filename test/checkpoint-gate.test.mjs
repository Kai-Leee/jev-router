import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckpointGate,checkpointTools} from '../src/benchmark/checkpoint-gate.mjs';
const route = () => ({purpose:'Choose the next role.',state:'No source yet.',candidates:[{id:'implement',description:'Build the requested library.'},{id:'verify',description:'Check existing work.'}]});
const finish = () => ({purpose:'Assess completion.',state:'See action-1 observations.'});
function answer(req,choice) {
  const kind = Object.keys(req.questions)[0];
  return {model:'fixture',answers:{[kind]:{type:'choice',choice,probabilities:Object.fromEntries(Object.keys(req.questions[kind].criteria).map(k=>[k,k===choice?1:0]))}},usage:{input_tokens:1,output_tokens:1}};
}
function fixture(options={}) {
  const records=[],requests=[],commands=[],states=[];
  const gate=createCheckpointGate({mode:'jev',maxDecisions:null,trustedBrief:'Implement library and verify installation.',
    decide:async req=>{requests.push(req);return answer(req,req.questions.route?'implement':'finish');},
    execute:async command=>{commands.push(command);return {exit_code:0,stdout:'passed'};},
    record:async e=>records.push(e),recordState:async s=>states.push(s),...options});
  return {gate,records,requests,commands,states};
}
const act = command => ({role_id:'implement',command});
test('role selected before command generation; repeated commands do not call Jev; completion sees host goal/outcomes',async()=>{
  const f=fixture();
  await assert.rejects(f.gate.act(act('build')), {code:'INVALID_INPUT'});
  await f.gate.route(route()); await f.gate.act(act('build')); await f.gate.act(act('test'));
  assert.equal(f.requests.length,1); assert.equal(f.gate.status().decisions_used,1);
  const result=await f.gate.finish(finish());
  assert.equal(result.completion_claimed,true); assert.equal(result.evaluator_success,null);
  assert.equal(f.requests[1].state.trusted_goal,'Implement library and verify installation.');
  assert.deepEqual(f.requests[1].state.observed_actions.map(o=>o.evidence_id),['action-1','action-2']);
  assert.deepEqual(f.commands,['build','test']);
});
test('same action version cannot be submitted repeatedly, including after a new role selection',async()=>{
  let calls=0;
  const f=fixture({decide:async req=>{calls++;return answer(req,req.questions.route?'implement':'continue');}});
  await f.gate.route(route()); await f.gate.act(act('test')); await f.gate.finish(finish());
  await f.gate.route(route());
  await assert.rejects(f.gate.finish(finish()),{code:'INVALID_INPUT'}); assert.equal(calls,3);
  await f.gate.act(act('inspect')); await f.gate.finish(finish()); assert.equal(calls,4);
});
test('baseline chooses route and finish without paid callback',async()=>{
  const f=fixture({mode:'baseline',decide:()=>{throw Error('unexpected');}});
  await f.gate.route({...route(),selected_id:'implement'}); await f.gate.act(act('build'));
  await assert.rejects(f.gate.finish(finish()),{code:'INVALID_INPUT'});
  assert.equal((await f.gate.finish({...finish(),selected_id:'finish'})).completion_claimed,true);
  assert.equal(f.gate.status().decisions_used,2);
});
test('failed observed command clears selected role',async()=>{
  const f=fixture({execute:async()=>({exit_code:1,stdout:'test failed'})});
  await f.gate.route(route()); await f.gate.act(act('test'));
  assert.equal(f.gate.status().selected_role,null);
  await assert.rejects(f.gate.act(act('fix')),{code:'INVALID_INPUT'});
  assert.equal(f.gate.status().state,'ready');
});
test('durable action receipt failure prevents execution and stops all work',async()=>{
  const f=fixture({record:async e=>{if(e.event==='action_started')throw Error('disk');}});
  await f.gate.route(route());
  await assert.rejects(f.gate.act(act('write')),{code:'RECORD_FAILED'});
  assert.equal(f.commands.length,0); assert.equal(f.gate.status().journal_healthy,false);
  assert.equal(f.states.at(-1).state,'stopped');
});
test('unknown execution blocks replay and observed action does not enter evidence',async()=>{
  const f=fixture({execute:async()=>({exit_code:0,timed_out:true})});
  await f.gate.route(route());
  await assert.rejects(f.gate.act(act('write')),{code:'EXECUTION_UNCERTAIN'});
  await assert.rejects(f.gate.route(route()),{code:'GATE_STOPPED'});
  assert.equal(f.gate.status().action_version,0);
});
test('unknown paid result is not retried',async()=>{
  let calls=0;const f=fixture({decide:async()=>{calls++;throw Error('network');}});
  await assert.rejects(f.gate.route(route()),{code:'DECISION_FAILED'});
  await assert.rejects(f.gate.route(route()),{code:'GATE_STOPPED'});assert.equal(calls,1);
});
test('independent state writer failure stops before paid request',async()=>{
  const f=fixture({recordState:async()=>{throw Error('disk');}});
  await assert.rejects(f.gate.route(route()),{code:'STATE_RECORD_FAILED'});assert.equal(f.requests.length,0);
});
test('decision limit counts roles/completion only, allows selected-role commands',async()=>{
  const f=fixture({maxDecisions:1}); await f.gate.route(route());
  await f.gate.act(act('one'));await f.gate.act(act('two'));
  await assert.rejects(f.gate.finish(finish()),{code:'BUDGET_EXHAUSTED'}); assert.equal(f.commands.length,2);
});
test('queued calls snapshot command and serialize execution',async()=>{
  const f=fixture();const pending=f.gate.route(route());const input=act('original');const run=f.gate.act(input);input.command='changed';
  await Promise.all([pending,run]);assert.deepEqual(f.commands,['original']);
});
test('schemas forbid command candidates and Jev caller selections',async()=>{
  const f=fixture();const input=route();input.candidates[0].command='hidden';
  await assert.rejects(f.gate.route(input),{code:'INVALID_INPUT'});
  await assert.rejects(f.gate.route({...route(),selected_id:'implement'}),{code:'INVALID_INPUT'});
  assert.deepEqual(checkpointTools('jev').map(t=>t.name),['route','act','finish','status']);
  assert.ok(checkpointTools('baseline')[2].inputSchema.required.includes('selected_id'));
});
test('oversize accumulated evidence rejects before any additional paid call',async()=>{
  const f=fixture({execute:async()=>({exit_code:0,stdout:'x'.repeat(100000)})});
  await f.gate.route(route());for(let i=0;i<3;i++)await f.gate.act(act('collect'));
  await assert.rejects(f.gate.finish(finish()),{code:'INVALID_INPUT'});assert.equal(f.requests.length,1);
});
test('caller cannot mutate the selected role or stored observed evidence through returned objects',async()=>{
  const f=fixture();const selected=await f.gate.route(route());selected.selected_role.id='forged';
  f.gate.status().selected_role.id='forged';
  const result=await f.gate.act(act('test'));result.outcome.stdout='forged';
  await f.gate.finish(finish());assert.equal(f.requests[1].state.observed_actions[0].outcome.stdout,'passed');
});
