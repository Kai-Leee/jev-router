import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, copyFileSync} from 'node:fs';
import {join, dirname, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {prepareDecision, createJevClient} from '../src/client.mjs';
import {DECISION_URL, MODELS_URL, CREDITS_URL} from '../src/config.mjs';
import {projectRepairDecisionRequest} from '../src/orchestration/adaptive-repair-input.mjs';
import {assessJevTransmission, jevTransmissionPolicy, JEV_TRANSMISSION_SOURCE_PATHS,
  JEV_TRANSMISSION_POLICY_PATH} from '../src/orchestration/jev-transmission-preflight.mjs';
import {createAdaptiveProviderSession, loadAdaptiveRunManifest} from '../src/benchmark/adaptive-dag-runner.mjs';

const root = resolve(import.meta.dirname, '..');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const sha = value => createHash('sha256').update(value).digest('hex');
const requestHash = request => sha(prepareDecision(request).serialized);
const example = () => read(join(root, 'examples/jev-preflight/inferred-v2.request.json'));
const ordinary = () => ({model:'jev-latest', state:{evidence:'Synthetic public observation.'},
  questions:{next:{type:'choice', instructions:'Choose the next synthetic action.', criteria:{left:'Left.',right:'Right.'}}}});
const policy = () => jevTransmissionPolicy();
const options = (request, stage, extra={}) => ({stage, expectedRequestSha256:requestHash(request),
  expectedPolicySha256:policy().source.sha256, ...extra});
const binding = () => ({mode:'required', contract:JEV_TRANSMISSION_POLICY_PATH, sha256:policy().source.sha256});
const config = () => ({...read(join(root, 'benchmarks/e2e-swe/manifests/d073-inferred-v2.json')),
  schema_version:'adaptive-dag-comparison/v10', transmission_preflight:binding(),
  failure_recovery:{mode:'required', policy:'evidence-loop-v1', contract:'docs/orchestration/contracts/adaptive-failure-recovery.v1.json',
    sha256:sha(readFileSync(join(root, 'docs/orchestration/contracts/adaptive-failure-recovery.v1.json')))},
  preserved_source:{mode:'initial_profile_failure',directory:'benchmark-runs/d073-comparison-01/jev_profile',
    result_sha256:'a'.repeat(64), expected_public_failed_count:14, comparison:'same_start_as_d073_focused_new_02'}});

function temporary(t) {
  const directory = mkdtempSync(join(tmpdir(), 'jev-d075-gate-'));
  t.after(() => rmSync(directory, {recursive:true, force:true})); return directory;
}
function sourceClone(parent) {
  const target = join(parent, 'sources');
  for (const path of [...JEV_TRANSMISSION_SOURCE_PATHS,JEV_TRANSMISSION_POLICY_PATH]) {
    mkdirSync(dirname(join(target,path)), {recursive:true}); copyFileSync(join(root,path),join(target,path));
  }
  return target;
}
function fixture(t, {sourceRoot=root, mutate=()=>{}, failProvider=null, manifest=config()}={}) {
  const directory = join(temporary(t),'session'); mkdirSync(directory);
  mkdirSync(join(directory,'calls')); mkdirSync(join(directory,'receipts'));
  const events=[], bodies=[], counts={open:0,reserve:0,settle:0,models:0,credits:0,decide:0}, state={pending:false};
  const session = createAdaptiveProviderSession({rootDir:sourceRoot,manifest,run_id:'d075-test',runDirectory:directory,
    remaining:()=>30000,record:async event=>{events.push(structuredClone(event));mutate(event);},adapters:{jevConfig:{},
      runCommand:async()=>{throw new Error('EXTERNAL_COMMAND_FORBIDDEN');},
      openBudget:()=>{counts.open++;return {reserve:()=>{counts.reserve++;state.pending=true;return `test-${counts.reserve}`;},
        settle:()=>{counts.settle++;state.pending=false;},snapshot:()=>({reservations_pending:state.pending?1:0,blocked_code:null}),close:()=>{}};},
      jevClientFactory:()=>({listModels:async()=>{counts.models++;return {models:[{name:'jev-latest'}]};},
        listCredits:async()=>{counts.credits++;mutate({event:'mock_credits'});return {fixture:true};},decide:async body=>{
          counts.decide++;bodies.push(structuredClone(body));if(failProvider)await failProvider(counts.decide);
          return {model:'jev-1.13.0',usage:{input_tokens:10,output_tokens:2},answers:Object.fromEntries(
            Object.entries(body.questions).map(([id,q])=>[id,{type:q.type,choice:Object.keys(q.criteria)[0]}]))};
        }})}});
  return {session,directory,events,bodies,counts,state};
}

test('v10 requires its opt-in binding and preserves explicit legacy v9 loading',t=>{
  const v1='docs/orchestration/contracts/jev-transmission-preflight.v1.json';
  const directory=temporary(t), path=join(directory,'manifest.json');
  const value={...config(), transmission_preflight:{mode:'required', contract:v1, sha256:jevTransmissionPolicy(v1).source.sha256}};
  writeFileSync(path,JSON.stringify(value));assert.equal(loadAdaptiveRunManifest(path,root).schema_version,'adaptive-dag-comparison/v10');
  for(const change of [v=>{delete v.transmission_preflight;},v=>{v.transmission_preflight.mode='optional';},
    v=>{v.transmission_preflight.sha256='0'.repeat(64);},v=>{delete v.failure_recovery;},v=>{delete v.preserved_source;},
    v=>{v.transmission_preflight=binding();},v=>{v.runtime_speed={model_lookup:'per_session',budget_lock:'ledger_op',public_check_concurrency:2,readiness_batch:true};}]) {
    const changed=structuredClone(value);change(changed);writeFileSync(path,JSON.stringify(changed));
    assert.throws(()=>loadAdaptiveRunManifest(path,root));
  }
  assert.equal(loadAdaptiveRunManifest(join(root,'benchmarks/e2e-swe/manifests/d073-inferred-v2.json'),root).schema_version,'adaptive-dag-comparison/v9');
});

test('v11 preserves its historical transmission policy, the v4 ledger and validated runtime speed options',t=>{
  const directory=temporary(t), path=join(directory,'manifest.json');
  const value=read(join(root,'benchmarks/e2e-swe/manifests/d076-preserved-repair.json'));
  assert.equal(value.transmission_preflight.contract,'docs/orchestration/contracts/jev-transmission-preflight.v10.json');
  assert.equal(value.transmission_preflight.sha256,jevTransmissionPolicy(value.transmission_preflight.contract).source.sha256);
  writeFileSync(path,JSON.stringify(value));assert.equal(loadAdaptiveRunManifest(path,root).schema_version,'adaptive-dag-comparison/v11');
  const v1='docs/orchestration/contracts/jev-transmission-preflight.v1.json';
  for(const change of [v=>{v.transmission_preflight={mode:'required',contract:v1,sha256:jevTransmissionPolicy(v1).source.sha256};},
    v=>{v.jev_budget.schema_version='jev-token-budget/v3';},v=>{delete v.runtime_speed;},v=>{v.runtime_speed.budget_lock='call';},
    v=>{v.runtime_speed.public_check_concurrency=0;},v=>{v.runtime_speed.public_check_concurrency=9;},
    v=>{v.runtime_speed.readiness_batch='yes';},v=>{v.runtime_speed.extra=true;}]) {
    const changed=structuredClone(value);change(changed);writeFileSync(path,JSON.stringify(changed));
    assert.throws(()=>loadAdaptiveRunManifest(path,root));
  }
});

test('historical policy v1 stays loadable but its D075 pins now report source drift',()=>{
  const v1='docs/orchestration/contracts/jev-transmission-preflight.v1.json', request=ordinary();
  const report=assessJevTransmission(request,{stage:'split',expectedRequestSha256:requestHash(request),
    expectedPolicySha256:jevTransmissionPolicy(v1).source.sha256,policyPath:v1});
  assert.equal(report.passed,false);assert.ok(report.reason_codes.includes('JEV_TRANSMISSION_SOURCE_DRIFT'));
  assert.equal(report.policy_source.path,v1);
  const current=assessJevTransmission(request,options(request,'split'));
  assert.equal(current.passed,true);assert.equal(current.policy_source.path,JEV_TRANSMISSION_POLICY_PATH);
});

test('the gate distinguishes fixed owner checks from generic stages and binds model/request/policy/official limits',()=>{
  for(const stage of ['split','relations','repair','profiles','repair_owners']) {
    const request=stage==='repair_owners'?example():ordinary(), report=assessJevTransmission(request,options(request,stage));
    assert.equal(report.passed,true,JSON.stringify(report.reason_codes));
    assert.equal(report.validation_scope.fixed_prompt_checked,stage==='repair_owners');
    assert.equal(report.validation_scope.handler_executed,false);assert.equal(report.exact_context_fit,'unknown');
    assert.equal(report.admission.local_caps.request_tokens,null);
  }
  const request=ordinary();
  for(const extra of [{stage:'unknown'},{expectedRequestSha256:'0'.repeat(64)},
    {expectedPolicySha256:'0'.repeat(64)},{observedModel:'other-model'}]) {
    assert.equal(assessJevTransmission(request,options(request,'repair',extra)).passed,false);
  }
  const wrong=example();wrong.state.local_check_results.executed=false;
  assert.ok(assessJevTransmission(wrong,options(wrong,'repair_owners')).reason_codes.includes('JEV_PROMPT_LOCAL_EVIDENCE_UNSUPPORTED'));
  assert.ok(assessJevTransmission(example(),options(example(),'profiles')).reason_codes.includes('JEV_TRANSMISSION_STAGE_MISMATCH'));
  const projected=projectRepairDecisionRequest(example(),{stage:'repair_owners'}).request;
  const projection=assessJevTransmission(projected,options(projected,'repair_owners'));
  assert.equal(projection.passed,true);assert.equal(projection.repair_input_validation.policy,'evidence-v1');
  projected.state.repair_input.reference_instructions='Unbound interpretation.';
  assert.ok(assessJevTransmission(projected,options(projected,'repair_owners')).reason_codes.includes('JEV_TRANSMISSION_REPAIR_INPUT_INVALID'));
  const large=ordinary();large.state.evidence='x'.repeat(240000);
  assert.equal(assessJevTransmission(large,options(large,'repair')).passed,true);
  large.state.evidence='x'.repeat(256000);
  assert.equal(assessJevTransmission(large,{...options(request,'repair')}).passed,false);
});

test('all five Jev stages pass each synchronous gate before one reserve and one provider dispatch',async t=>{
  const f=fixture(t);
  for(const stage of ['split','relations','repair','profiles','repair_owners']) {
    const request=stage==='repair_owners'?example():ordinary();await f.session.decide('jev',request,{stage});
  }
  assert.deepEqual(f.counts,{open:5,reserve:5,settle:5,models:5,credits:5,decide:5});
  for(const receipt of f.session.receipts()) {
    const gate=receipt.transmission_preflight;assert.equal(gate.required,true);assert.equal(gate.provider_decide_called,true);
    assert.equal(gate.reservation_created,true);assert.equal(gate.no_post_verified,false);
    assert.deepEqual(gate.checks.map(row=>row.phase),['initial','before_reservation','before_post']);
    for(const check of gate.checks){assert.equal(check.passed,true);const saved=read(join(f.directory,check.report_path));
      assert.equal(saved.request_sha256,gate.request_sha256);assert.equal(saved.policy_source.sha256,binding().sha256);
      assert.equal(saved.provider_decide_called,false);}
  }
});

test('fixed prompt defects block before budget opening; original caller mutation cannot alter the pinned payload',async t=>{
  const bad=example(), question=Object.keys(bad.questions)[0];bad.questions[question].instructions='Unbound target.';
  const blocked=fixture(t);await assert.rejects(blocked.session.decide('jev',bad,{stage:'repair_owners'}),{code:'ADAPTIVE_TRANSMISSION_PREFLIGHT_BLOCKED'});
  assert.deepEqual(blocked.counts,{open:0,reserve:0,settle:0,models:0,credits:0,decide:0});
  const receipt=blocked.session.receipts()[0];assert.equal(receipt.transmission_preflight.blocked_phase,'initial');
  assert.equal(receipt.inference_started,false);assert.equal(receipt.transmission_preflight.no_post_verified,true);
  const request=ordinary(), original=structuredClone(request);
  const stable=fixture(t,{mutate:event=>{if(event.event==='adaptive_transmission_preflight_checked')request.state.evidence='Changed outside the snapshot.';}});
  await stable.session.decide('jev',request,{stage:'repair'});assert.deepEqual(stable.bodies,[original]);
});

test('source drift before reservation leaves zero reservations; drift after reservation blocks dispatch and preserves pending',async t=>{
  for(const phase of ['before_reservation','before_post']) {
    const directory=temporary(t), sourceRoot=sourceClone(directory);
    const f=fixture(t,{sourceRoot,mutate:event=>{
      if(event.event===(phase==='before_reservation'?'mock_credits':'inference_started')) {
        const path=join(sourceRoot,'src/config.mjs');writeFileSync(path,readFileSync(path,'utf8')+'\n');
      }
    }});
    await assert.rejects(f.session.decide('jev',ordinary(),{stage:'repair'}),{code:'ADAPTIVE_TRANSMISSION_PREFLIGHT_BLOCKED',outcome_uncertain:false});
    const gate=f.session.receipts()[0].transmission_preflight, afterReservation=phase==='before_post';
    assert.equal(gate.blocked_phase,phase);assert.equal(f.counts.decide,0);assert.equal(f.counts.reserve,afterReservation?1:0);
    assert.equal(gate.reservation_created,afterReservation);assert.equal(gate.no_post_verified,true);
    assert.equal(f.state.pending,afterReservation);assert.equal(f.counts.settle,0);
    assert.equal(f.session.receipts()[0].inference_started,false);
    assert.equal(f.events.some(event=>event.event==='inference_started'),afterReservation);
    assert.ok(read(join(f.directory,gate.checks.at(-1).report_path)).reason_codes.includes('JEV_TRANSMISSION_SOURCE_DRIFT'));
  }
});

test('only a changed bound request after known failure and observed settlement can re-enter the session',async t=>{
  const f=fixture(t,{failProvider:async count=>{if(count===1)throw Object.assign(new Error('HTTP_ERROR'),{code:'HTTP_ERROR',status:400,outcomeUncertain:false});}});
  const prior=ordinary();await assert.rejects(f.session.decide('jev',prior,{stage:'repair'}),{outcome_uncertain:false});
  const request=ordinary();request.state.evidence='A new explicit representation with the same public semantics.';
  const proof={schema_version:'jev-transmission-recovery/v1',action:'rebuild_relevant_input',prior_request_sha256:requestHash(prior),
    request_sha256:requestHash(request),evidence_sha256:sha(JSON.stringify(request.state)),source_coverage_sha256:'a'.repeat(64)};
  await assert.rejects(f.session.decide('jev',request,{stage:'repair'}),{code:'JEV_TRANSMISSION_RECOVERY_INVALID'});
  await assert.rejects(f.session.decide('jev',prior,{stage:'repair',recovery:{...proof,request_sha256:requestHash(prior)}}),{code:'JEV_TRANSMISSION_RECOVERY_UNCHANGED'});
  await assert.rejects(f.session.decide('jev',request,{stage:'repair',recovery:proof}),{code:'JEV_TRANSMISSION_RECOVERY_UNSETTLED'});
  assert.equal(f.counts.decide,1);assert.equal(f.counts.reserve,1);
  f.state.pending=false; // Fixture-only external confirmed settlement, never a production ledger edit.
  await f.session.decide('jev',request,{stage:'repair',recovery:proof});assert.equal(f.counts.decide,2);assert.equal(f.counts.reserve,2);
  const last=f.session.receipts().at(-1);assert.equal(last.status,'completed');
  assert.equal(last.transmission_preflight.recovery.source_coverage_semantics,'validated_by_recovery_controller_not_this_gate');
});

test('uncertain outcome cannot re-enter even when a caller supplies fresh hashes and a zero-pending fixture',async t=>{
  const f=fixture(t,{failProvider:async()=>{throw Object.assign(new Error('TRANSPORT_ERROR'),{code:'TRANSPORT_ERROR',outcomeUncertain:true});}});
  const prior=ordinary();await assert.rejects(f.session.decide('jev',prior,{stage:'repair'}),{outcome_uncertain:true});
  const request=ordinary();request.state.evidence='Different evidence.';f.state.pending=false;
  await assert.rejects(f.session.decide('jev',request,{stage:'repair',recovery:{schema_version:'jev-transmission-recovery/v1',
    action:'rebuild_relevant_input',prior_request_sha256:requestHash(prior),request_sha256:requestHash(request),
    evidence_sha256:sha(JSON.stringify(request.state)),source_coverage_sha256:'a'.repeat(64)}}),{code:'JEV_TRANSMISSION_RECOVERY_INVALID'});
  assert.equal(f.counts.decide,1);assert.equal(f.counts.reserve,1);
});

test('the existing HTTP client serializes the gate-bound body to the fixed endpoint without retries',async t=>{
  const directory=join(temporary(t),'session');mkdirSync(directory);mkdirSync(join(directory,'calls'));mkdirSync(join(directory,'receipts'));
  const calls=[],request=ordinary();let reservations=0;
  const session=createAdaptiveProviderSession({rootDir:root,manifest:config(),run_id:'http-mock',runDirectory:directory,
    remaining:()=>30000,adapters:{jevConfig:{},openBudget:()=>({reserve:()=>++reservations,settle:()=>{},snapshot:()=>({fixture:true}),close:()=>{}}),
      jevClientFactory:()=>createJevClient({apiKey:'d075-fake-local-only',fetchImpl:async(url,options)=>{
        assert.equal(options.redirect,'error');assert.equal(options.headers.Authorization,'Bearer d075-fake-local-only');
        calls.push({url,method:options.method,body_sha256:options.body?sha(options.body):null});
        const data=url===MODELS_URL?{models:[{name:'jev-latest'}]}:url===CREDITS_URL?
          {paidInputTokensRemaining:1000000,creditsRemaining:1000000,tokensReserved:0,tokenDebt:0,spending_frozen:false}:
          {model:'jev-1.13.0',answers:{next:{type:'choice',choice:'left',probabilities:{left:1,right:0}}},usage:{input_tokens:10,output_tokens:2}};
        const response=new Response(JSON.stringify(data),{status:200});Object.defineProperty(response,'url',{value:url});return response;
      }})}});
  await session.decide('jev',request,{stage:'repair'});
  assert.deepEqual(calls.map(row=>[row.method,row.url]),[['GET',MODELS_URL],['GET',CREDITS_URL],['POST',DECISION_URL]]);
  assert.equal(calls[2].body_sha256,requestHash(request));assert.equal(reservations,1);
  assert.equal(session.receipts()[0].transmission_preflight.request_sha256,calls[2].body_sha256);
});
