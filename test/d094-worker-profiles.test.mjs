import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {workerProfilePolicy, workerProfileCandidates, eligibleWorkerProfiles, buildWorkerProfileRequest,
  validateWorkerProfileRequest, createWorkerProfileRouter} from '../src/benchmark/worker-profiles-v4.mjs';
import {codexPricingContract} from '../src/benchmark/codex-pricing.mjs';
import {claudePricingContract} from '../src/benchmark/claude-pricing.mjs';
import {createFrozenClaudeEnvironment} from '../src/benchmark/claude-environment.mjs';
import {runClaudeAttempt} from '../src/benchmark/claude-provider.mjs';
import {createCodexE2EWorkerExecutor} from '../src/benchmark/codex-e2e-runner.mjs';

const read = path => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url)));
const historyPath = 'benchmark-runs/d092-effort-history-20261017-01/snapshot.final.v2.json';
const discoveryPath = 'benchmark-runs/d092-effort-history-20261017-01/app-discovery.json';
const planningPath = 'benchmark-runs/d091-codex-20261016-01/cohort/pair-fixed/codex/planning.json';
const available = [historyPath, discoveryPath, planningPath].every(path => existsSync(new URL(`../${path}`, import.meta.url)));
const localOnly = {skip: available ? false : 'Requires preserved local D091 planning and frozen D092 history/discovery; no substitute data is generated.'};
const snapshotSHA = 'c0f1b7324056b9cd7ba48a59530dfaf8d8f1470e4382b7064a31ce6c32ae9e89';
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');

function fixture(workerFamily) {
  const empiricalEvidence = read(historyPath), planning = read(planningPath), policy = workerProfilePolicy();
  const task = planning.plan.tasks.find(row => row.kind === 'implementation');
  const context = {operation: 'repair', round_index: 1, input_artifact_revisions: {},
    repair_context: {failure: {code: 'OFFLINE_PUBLIC_FAILURE_FIXTURE', public_evidence: [{check_id: 'public.fixture',
      evidence: {cases: [{test_id: 'PUBLIC-FIXTURE', status: 'failed', message: 'Public failure fixture; not an actual current failure.'}]}}]}}};
  const pricingContract = workerFamily === 'claude' ? claudePricingContract() : codexPricingContract({version: 'v2'});
  const environmentEvidence = workerFamily === 'codex' ? read(discoveryPath) : {
    fingerprint: 'OFFLINE-D093-DOCUMENTED-CLAUDE-FIXTURE-NOT-ACCOUNT-AVAILABILITY',
    models: policy.families.claude.models.map(model => ({model, supported_reasoning_efforts: [...policy.families.claude.adapter_efforts]})),
    allowed_profiles: workerProfileCandidates({workerFamily, pricingContract})};
  const catalog = eligibleWorkerProfiles({workerFamily, environmentEvidence, pricingContract});
  const args = {workerFamily, environmentEvidence, pricingContract, planning, empiricalEvidence, expectedEmpiricalSha256: snapshotSHA};
  const {request} = buildWorkerProfileRequest({...args, task, context, catalog});
  const validate = value => validateWorkerProfileRequest(value, {empiricalEvidence, expectedEmpiricalSha256: snapshotSHA,
    expectedWorkerFamily: workerFamily, expectedEnvironmentEvidence: environmentEvidence});
  return {...args, task, context, catalog, request, validate};
}


test('D094 cold start selects a real eligible profile and preserves null statistics',localOnly,async()=>{
 const f=fixture('claude'),writes=[],events=[];const router=createWorkerProfileRouter({...f,save:(p,v)=>writes.push({p,v}),record:e=>events.push(e),decide:async r=>{f.validate(r);assert.equal(r.state.empirical_evidence.statistics[0].value.public_success.rate,null);assert.match(r.state.cold_start_policy,/provisional/);return{answers:{worker_profile:{type:'choice',choice:f.catalog.profiles[1].id}}};}});
 const selected=await router.select(f.task,f.context);assert.equal(selected.selection_basis,'cold_start_provisional');assert.equal(selected.empirical_samples,0);assert.equal(selected.clarifications_used,0);assert.equal(router.assertExecution(selected,{...selected,task:f.task,context:f.context}).verified,true);assert.equal(writes.filter(x=>x.p.endsWith('selection.json')).length,1);
});
test('D094 explicit blocked clarification recovers selection without dispatch or invented history',localOnly,async()=>{
 const f=fixture('claude'),writes=[],events=[];let calls=0;const router=createWorkerProfileRouter({...f,save:(p,v)=>writes.push({p,v}),record:e=>events.push(e),decide:async r=>{f.validate(r);assert.equal(r.state.empirical_evidence.statistics[0].value.samples,0);calls++;if(calls===1){assert.equal(r.state.recovery,null);return{answers:{worker_profile:{type:'choice',choice:'unknown'}}};}assert.equal(r.state.recovery.attempt,1);assert.equal(r.state.recovery.previous_choice,'unknown');return{answers:{worker_profile:{type:'choice',choice:f.catalog.profiles[1].id}}};}});
 const selected=await router.select(f.task,f.context);assert.equal(calls,2);assert.equal(selected.clarifications_used,1);assert.equal(router.assertExecution(selected,{...selected,task:f.task,context:f.context}).verified,true);assert.equal(writes.find(x=>x.p.endsWith('blocked.json')).v.outcome_uncertain,false);assert(events.some(x=>x.event==='worker_profile_recovery_started'));
});
test('D094 repeated unknown ends known blocked after exactly one clarification',localOnly,async()=>{
 const f=fixture('claude');let calls=0;const router=createWorkerProfileRouter({...f,save:()=>{},record:()=>{},decide:async()=>{calls++;return{answers:{worker_profile:{type:'choice',choice:'unknown'}}};}});const b=await router.select(f.task,f.context);assert.equal(calls,2);assert.equal(b.status,'blocked');assert.equal(b.dispatch_started,false);assert.equal(b.outcome_uncertain,false);assert.equal(b.recoverable,false);
});
test('D094 uncertain transport is never retried as a blocked clarification',localOnly,async()=>{
 const f=fixture('claude');let calls=0;const router=createWorkerProfileRouter({...f,save:()=>{},record:()=>{},decide:async()=>{calls++;throw Object.assign(Error('transport'),{outcome_uncertain:true});}});await assert.rejects(()=>router.select(f.task,f.context),e=>e.outcome_uncertain===true);assert.equal(calls,1);
});
test('D094 rejects arbitrary clarification text before a provider call',localOnly,()=>{const f=fixture('claude'),r=structuredClone(f.request);r.state.recovery={attempt:1,previous_choice:'unknown',previous_response_sha256:'a'.repeat(64),notice:'invent observations'};assert.throws(()=>f.validate(r),{code:'WORKER_PROFILE_V4_REQUEST_INVALID'});});

test('D094 real executor dispatches exactly once after blocked clarification recovery',localOnly,async()=>{
 const f=fixture('claude');let decisions=0,factories=0,executes=0,verified=0;const events=[];
 const router=createWorkerProfileRouter({...f,save:()=>{},record:e=>events.push(e),decide:async()=>({answers:{worker_profile:{type:'choice',choice:++decisions===1?'unknown':f.catalog.profiles[1].id}}})});
 const execute=createCodexE2EWorkerExecutor({profileRouter:router,cliEnvironment:{verify:async p=>{verified++;assert.equal(p.model,f.catalog.profiles[1].model);}},context:{directory:'OFFLINE',save:()=>{},record:async e=>events.push(e)},input:{},catalog:{},manifest:{},model:'unused',effort:'unused',workerReceipts:[],workerFactory:p=>{factories++;assert.equal(p.model,f.catalog.profiles[1].model);return async()=>{executes++;return{status:'completed'};};}});
 assert.equal((await execute(f.task,f.context)).status,'completed');assert.equal(decisions,2);assert.equal(verified,1);assert.equal(factories,1);assert.equal(executes,1);assert.equal(events.filter(e=>e.event==='codex_worker_profile_dispatch_verified').length,1);
});
test('D094 real executor never creates a worker for exhausted blocked selection',localOnly,async()=>{
 const f=fixture('claude');let factories=0;const router=createWorkerProfileRouter({...f,save:()=>{},record:()=>{},decide:async()=>({answers:{worker_profile:{type:'choice',choice:'unknown'}}})});const execute=createCodexE2EWorkerExecutor({profileRouter:router,cliEnvironment:{verify:async()=>{throw Error('MUST_NOT_VERIFY_DISPATCH');}},context:{},workerFactory:()=>{factories++;throw Error('MUST_NOT_DISPATCH');}});await assert.rejects(()=>execute(f.task,f.context),e=>e.code==='WORKER_PROFILE_BLOCKED'&&e.status==='blocked'&&!e.outcome_uncertain&&e.dispatch_started===false);assert.equal(factories,0);
});
