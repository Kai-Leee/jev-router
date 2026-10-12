import test from 'node:test';
import assert from 'node:assert/strict';
import {checkPlanningRequest,summarizePlanningReceipts} from '../src/benchmark/recursive-planning-runner.mjs';
import {decodePlanningState} from '../src/orchestration/planning-state-codec.mjs';

const request=()=>({state:{goal:'Preserve all public obligations'},questions:{count:{type:'choice',instructions:'Choose the task count.',criteria:{'1':'Keep','2':'Split'}}}});
const guards={maxRequestBytes:96000,knownInputTokens:0,reserveInputTokens:65536,maxPlanningInputTokens:2000000};

test('planning cap leaves room for the entire provider reservation before any request',()=>{
  assert.throws(()=>checkPlanningRequest(request(),{...guards,knownInputTokens:1934465}),{code:'PLANNING_INPUT_RESERVATION_LIMIT'});
  assert.ok(checkPlanningRequest(request(),{...guards,knownInputTokens:1934464}).bytes>0);
});
test('local request limit is UTF-8 bytes, not characters and never truncates evidence',()=>{
  const value=request();value.state={goal:'한'.repeat(100)};
  const original=structuredClone(value);
  assert.throws(()=>checkPlanningRequest(value,{...guards,maxRequestBytes:300}),{code:'PLANNING_PAYLOAD_LIMIT'});
  assert.deepEqual(value,original);
});
test('actual client format rejects a phantom one-option Choice before budget work',()=>{
  const value=request();delete value.questions.count.criteria['2'];
  assert.throws(()=>checkPlanningRequest(value,guards),{code:'INVALID_REQUEST'});
});
test('unknown submitted usage keeps total tokens and valuation null; known subtotal is separate',()=>{
  const r=summarizePlanningReceipts([
    {status:'completed',inference_started:true,usage:{input_tokens:1000,output_tokens:20}},
    {status:'failed',inference_started:true,usage:null},
  ],.6);
  assert.equal(r.inference_requests,2);assert.equal(r.completed_requests,1);
  assert.equal(r.known_input_tokens,1000);assert.equal(r.input_tokens,null);
  assert.equal(r.api_equivalent_usd,null);assert.equal(r.api_equivalent_known_subtotal_usd,.0006);
  assert.equal(r.actual_billed_usd,null);
});
test('preflight rejection is not a paid inference or unknown paid receipt',()=>{
  const r=summarizePlanningReceipts([{status:'failed',inference_started:false,usage:null}],.6);
  assert.equal(r.inference_requests,0);assert.equal(r.local_or_preflight_rejections,1);
  assert.equal(r.input_tokens,0);assert.equal(r.api_equivalent_usd,0);
});
test('missing output usage remains unknown despite known input usage',()=>{
  const r=summarizePlanningReceipts([{status:'completed',inference_started:true,usage:{input_tokens:1200}}],.6);
  assert.equal(r.input_tokens,1200);assert.equal(r.output_tokens,null);
});

test('explicit JSON text state preserves the complete original value and uses actual wire bytes',()=>{
  const r=request();r.state={goal:'Preserve "false" and null',clauses:['line1\nline2','한글'],flag:false,count:0,missing:null};
  const before=structuredClone(r);
  const projected=checkPlanningRequest(r,{...guards,stateFormat:'json_text'});
  assert.equal(typeof projected.body.state,'string');
  assert.deepEqual(JSON.parse(projected.body.state),r.state);
  assert.deepEqual(projected.body.questions,r.questions);
  assert.equal(projected.bytes,Buffer.byteLength(projected.serialized));
  assert.throws(()=>checkPlanningRequest(r,{...guards,stateFormat:'json_text',maxRequestBytes:projected.bytes-1}),{code:'PLANNING_PAYLOAD_LIMIT'});
  assert.throws(()=>checkPlanningRequest(r,{...guards,stateFormat:'unknown'}),{code:'INVALID_PLANNING_STATE_FORMAT'});
  assert.deepEqual(r,before);
});

test('columnar text preserves complete facts before spend and guards the actual transmitted bytes',()=>{
  const r=request();r.state={goal:'Keep every obligation',clauses:Array.from({length:20},(_,i)=>({
    id:`O${i}`,text:`literal source line ${i}\n한글`,source:{path:'public/instruction.md',start_line:i+1},
    shared_status:'unasserted',expected:null,enabled:false,
  }))};
  const before=structuredClone(r);
  const packed=checkPlanningRequest(r,{...guards,stateFormat:'columnar_text'});
  assert.equal(typeof packed.body.state,'string');
  assert.deepEqual(decodePlanningState(JSON.parse(JSON.parse(packed.serialized).state)),r.state);
  assert.deepEqual(packed.body.questions,r.questions);
  assert.equal(packed.bytes,Buffer.byteLength(packed.serialized));
  assert.throws(()=>checkPlanningRequest(r,{...guards,stateFormat:'columnar_text',maxRequestBytes:packed.bytes-1}),{code:'PLANNING_PAYLOAD_LIMIT'});
  assert.deepEqual(r,before);
});
