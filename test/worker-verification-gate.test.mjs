import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {executeVerifiedEnvelope} from '../src/orchestration/worker-verification-gate.mjs';

const exec = promisify(execFile);
const envelope = {tasks:[
  {id:'first',paths:['first.js'],after:[],test_ids:['public-a','public-b']},
  {id:'next',paths:['next.js'],after:['first'],test_ids:['public-c']},
]};
const evidence = (task, revision='revision-1') => ({artifact_revision:revision,evidence:task.test_ids.map(test_id=>({
  test_id,status:'passed',executed:true,exit_code:0,check_id:`check-${test_id}`,artifact_revision:revision,
}))});
const defaults = {envelope,getArtifactRevision:async()=>'revision-1',execute:async()=>({written:true}),verify:async task=>evidence(task)};

test('real subprocess checks must finish before the successor executes',async()=>{
  const events=[];
  const result=await executeVerifiedEnvelope({...defaults,execute:async task=>{events.push(`execute-${task.id}`);return {written:true};},verify:async(task,context)=>{
    assert.deepEqual(context.value,{written:true});
    for (const id of task.test_ids) {
      const {stdout}=await exec(process.execPath,['-e','process.stdout.write("public fixture passed")']);
      assert.equal(stdout,'public fixture passed');events.push(`verified-${id}`);
    }
    return evidence(task,context.expectedArtifactRevision);
  }});
  assert.equal(result.status,'completed');
  assert.ok(events.indexOf('execute-next')>events.indexOf('verified-public-b'));
  assert.deepEqual(result.results[0].value.execution,{written:true});
});

test('real failed subprocess blocks successor without retrying the worker',async()=>{
  const called=[];
  const result=await executeVerifiedEnvelope({...defaults,execute:async task=>called.push(task.id),verify:async task=>{
    let exitCode=0;
    try {await exec(process.execPath,['-e','process.exit(7)']);} catch(error) {exitCode=error.code;}
    const result=evidence(task);result.evidence[0].exit_code=exitCode;result.evidence[0].status='failed';return result;
  }});
  assert.deepEqual(called,['first']);assert.equal(result.status,'failed');
  assert.equal(result.failure.code,'PUBLIC_VERIFICATION_NOT_PASSED');assert.deepEqual(result.undispatched_ids,['next']);
});

for (const [name,mutate,code] of [
  ['missing',v=>v.evidence.pop(),'INCOMPLETE_VERIFICATION_EVIDENCE'],
  ['duplicate',v=>v.evidence.push({...v.evidence[0]}),'DUPLICATE_VERIFICATION_TEST'],
  ['conflicting',v=>v.evidence.push({...v.evidence[0],status:'failed'}),'DUPLICATE_VERIFICATION_TEST'],
  ['unknown extra',v=>v.evidence.push({...v.evidence[0],test_id:'not-assigned'}),'UNEXPECTED_VERIFICATION_TEST'],
  ['skipped',v=>{v.evidence[0].status='skipped';},'PUBLIC_VERIFICATION_NOT_PASSED'],
  ['not executed',v=>{v.evidence[0].executed=false;},'PUBLIC_VERIFICATION_NOT_PASSED'],
  ['missing exit',v=>{delete v.evidence[0].exit_code;},'PUBLIC_VERIFICATION_NOT_PASSED'],
  ['missing check',v=>{delete v.evidence[0].check_id;},'PUBLIC_VERIFICATION_NOT_PASSED'],
  ['stale envelope',v=>{v.artifact_revision='old';},'STALE_VERIFICATION_REVISION'],
  ['stale evidence',v=>{v.evidence[0].artifact_revision='old';},'STALE_VERIFICATION_REVISION'],
  ['malformed',v=>{v.evidence=null;},'INVALID_VERIFICATION_EVIDENCE'],
]) test(`${name} evidence fails closed`,async()=>{
  const called=[];
  const result=await executeVerifiedEnvelope({...defaults,execute:async task=>called.push(task.id),verify:async task=>{const v=evidence(task);mutate(v);return v;}});
  assert.deepEqual(called,['first']);assert.equal(result.failure.code,code);assert.deepEqual(result.completed_ids,[]);
});

test('revision change during checks blocks successor',async()=>{
  let reads=0;
  const result=await executeVerifiedEnvelope({...defaults,getArtifactRevision:async()=>++reads===1?'revision-1':'revision-2'});
  assert.equal(result.failure.code,'ARTIFACT_CHANGED_DURING_VERIFICATION');assert.deepEqual(result.undispatched_ids,['next']);
});

for (const stage of ['execute','verify','getArtifactRevision']) test(`${stage} throw retains uncertain paid outcome and never retries`,async()=>{
  let calls=0;
  const result=await executeVerifiedEnvelope({...defaults,[stage]:async()=>{calls++;throw Object.assign(new Error('unknown outcome'),{code:'UNCERTAIN_PAID_CALL',outcomeUncertain:true});}});
  assert.equal(calls,1);assert.equal(result.failure.outcome_uncertain,true);assert.equal(result.failure.code,'UNCERTAIN_PAID_CALL');
  assert.deepEqual(result.undispatched_ids,['next']);
});

test('invalid task test IDs are rejected before execution',async()=>{
  let calls=0;
  await assert.rejects(executeVerifiedEnvelope({...defaults,envelope:{tasks:[{...envelope.tasks[0],test_ids:[]}]},execute:async()=>calls++}),{code:'INVALID_VERIFICATION_TASK'});
  assert.equal(calls,0);
});

for (const status of ['failed','uncertain','stopped','blocked','unresolved','unknown',null]) test(`returned ${status} status never reaches verification`,async()=>{
  let verifications=0;
  const result=await executeVerifiedEnvelope({...defaults,execute:async()=>({status}),verify:async task=>{verifications++;return evidence(task);}});
  assert.equal(verifications,0);assert.equal(result.failure.code,'WORKER_EXECUTION_NOT_SUCCESSFUL');
  assert.equal(result.failure.outcome_uncertain,status==='uncertain');assert.deepEqual(result.undispatched_ids,['next']);
});

for (const status of ['completed','success',undefined]) test(`returned ${status} status accepts controller verification`,async()=>{
  const result=await executeVerifiedEnvelope({...defaults,execute:async()=>({status})});
  assert.equal(result.status,'completed');
});

for (const field of ['uncertain','outcomeUncertain','outcome_uncertain']) test(`returned ${field} takes precedence over a success status`,async()=>{
  let verifications=0;
  const result=await executeVerifiedEnvelope({...defaults,execute:async()=>({status:'completed',[field]:true}),verify:async task=>{verifications++;return evidence(task);}});
  assert.equal(verifications,0);assert.equal(result.failure.outcome_uncertain,true);
  assert.deepEqual(result.undispatched_ids,['next']);
});
