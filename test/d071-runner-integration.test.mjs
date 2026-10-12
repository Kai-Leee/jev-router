import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,realpathSync} from 'node:fs';
import {join,relative,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../src/client.mjs';
import {ADAPTIVE_ARMS,loadAdaptiveRunManifest,loadAdaptivePublicInput,loadAdaptiveTestRequirements,
  loadAdaptiveSharedPreparation,buildAdaptiveChecks,createAdaptiveProviderSession,
  createAdaptiveWorkerAndChecks,runAdaptiveComparison} from '../src/benchmark/adaptive-dag-runner.mjs';
import {resolveAdaptiveProfile} from '../src/orchestration/adaptive-profile-selection.mjs';
import {loadPublicAuditInputs} from '../scripts/audit-dag-public-checks.mjs';
import {createTokenBudget} from '../src/benchmark/budget.mjs';

const root=resolve(import.meta.dirname,'..');
const manifestPath=join(root,'benchmarks/e2e-swe/manifests/d071-adaptive.json');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest=()=>loadAdaptiveRunManifest(manifestPath,root);
function fixtureDirectory(t,{inRepo=false}={}) {
  const directory=realpathSync(mkdtempSync(join(inRepo?join(root,'benchmark-runs'):tmpdir(),'d071-runner-test-')));
  t.after(()=>rmSync(directory,{recursive:true,force:true}));return directory;
}
function sessionDirectory(parent,name) {
  const path=join(parent,name);mkdirSync(path);mkdirSync(join(path,'calls'));mkdirSync(join(path,'receipts'));return path;
}
function completion(model) {
  return {stdout:JSON.stringify({type:'result',subtype:'success',is_error:false,modelUsage:{[model]:{}},
    usage:{input_tokens:20,output_tokens:5,cache_read_input_tokens:3,cache_creation_input_tokens:2},
    total_cost_usd:0.002,result:'fixture completed'})+'\n',stderr:'',exit_code:0,outcome_uncertain:false};
}
const request={model:'jev-latest',state:{evidence:'Public fixture evidence only'},questions:{choose:{type:'choice',
  instructions:'Choose the supported option.',criteria:{left:'Left.',right:'Right.'}}}};
const answers={answers:{choose:{type:'choice',choice:'left'}}};

test('D071 v7 binds three conditions and 93 public checks while reusing the exact original catalog prompt',t=>{
  const config=manifest(), input=loadAdaptivePublicInput(root,config);
  assert.deepEqual(config.arms,['claude_all','jev_all','jev_profile']);assert.equal(config.cohort_concurrency,3);
  assert.deepEqual(config.worker_profile,{id:'opus55-medium',model:'claude-opus-5-5',effort:'medium'});
  assert.deepEqual(ADAPTIVE_ARMS.claude_all,{split:'claude',relations:'claude',repair:'claude'});
  assert.deepEqual(ADAPTIVE_ARMS.jev_profile,{split:'jev',relations:'jev',repair:'jev',profiles:'jev'});
  const probeBytes=readFileSync(join(root,config.profile_policy.account_probe));
  assert.equal(sha(probeBytes),config.profile_policy.account_probe_sha256);
  const probe=JSON.parse(probeBytes);assert.equal(probe.receipts.length,4);
  assert.equal(new Set(probe.receipts.map(row=>row.requested_model)).size,4);
  assert.ok(probe.receipts.every(row=>row.status==='completed'&&row.model_identity_verified===true));
  // D076 changed src/benchmark/telemetry.mjs, which the D066 catalog pins outside the v7 allowlist, so historical
  // reuse now fails closed. The same reuse path runs under the v11 allowlist in test/d076-runtime-speed.test.mjs;
  // the original v7 behavior reproduces at commit 5f78c6c.
  assert.throws(()=>loadAdaptiveSharedPreparation({rootDir:root,manifest:config,
    preparationDirectory:join(root,config.catalog_reuse.preparation_directory),input}),{code:'ADAPTIVE_PREPARATION_REUSE_INVALID'});
  const {registry}=loadPublicAuditInputs(root,{registryPath:config.public_registry,runnerPath:config.public_runner});
  const mapping=loadAdaptiveTestRequirements(root,config);
  assert.equal(Object.keys(mapping).length,93);assert.equal(new Set(registry.flatMap(check=>check.test_ids)).size,93);
  const directory=fixtureDirectory(t), badPath=join(directory,'bad-manifest.json');
  writeFileSync(badPath,JSON.stringify({...read(manifestPath),profile_policy:{...config.profile_policy,account_probe_sha256:'0'.repeat(64)}}));
  assert.throws(()=>loadAdaptiveRunManifest(badPath,root),{code:'ADAPTIVE_PROFILE_ACCOUNT_BINDING'});
});

test('D071 cohort dispatch starts all three isolated arms and preserves zero new catalog calls',async t=>{
  const directory=fixtureDirectory(t,{inRepo:true}), starts=[];
  // Isolated v3 ledger: the shared benchmark-runs ledger is v4 since D076 and is never opened by tests.
  const jevBudget={...manifest().jev_budget,ledger_path:relative(root,join(directory,'ledger.json'))};
  createTokenBudget(jevBudget).close();
  const config={...manifest(),jev_budget:jevBudget};
  let release,preflights=0;const barrier=new Promise(resolve=>{release=resolve;});
  const result=await runAdaptiveComparison({rootDir:root,manifest:config,runDir:join(directory,'comparison'),
    preparationDirectory:join(root,config.catalog_reuse.preparation_directory),spend:true,adapters:{
      preflight:async()=>{preflights++;return {status:'ready',live_ready:true,fixture:true};},
      runCommand:async()=>{throw new Error('EXTERNAL_COMMAND_FORBIDDEN');},
      runArm:async({arm,manifest:boundManifest,adapters})=>{
        assert.deepEqual(boundManifest.worker_profile,config.worker_profile);assert.equal(adapters.cohortPreflight.fixture,true);
        starts.push(arm);if(starts.length===3)release();await barrier;
        return {arm,status:'completed',outcome_uncertain:false,usage:null,product_success:null};
      }}});
  assert.deepEqual(starts,config.arms);assert.equal(preflights,1);
  assert.equal(result.maximum_simultaneously_active_arms,3);assert.equal(result.completed_arms,3);
  assert.equal(result.current_run_preparation_calls,0);assert.equal(result.product_success,null);
  assert.equal(result.independent_grade,'not_run_root_owned');
  assert.deepEqual(read(join(directory,'comparison','progress.json')).active_arms,[]);
});

test('selected profiles become actual CLI model/effort arguments and requested-versus-observed receipts',async t=>{
  const directory=fixtureDirectory(t),config=manifest(),calls=[];
  const session=createAdaptiveProviderSession({rootDir:root,manifest:config,run_id:'profile-args',
    runDirectory:sessionDirectory(directory,'session'),remaining:()=>30000,adapters:{jevConfig:{},
      runCommand:async(command,args,options)=>{
        assert.equal(command,'claude');const model=args[args.indexOf('--model')+1],effort=args[args.indexOf('--effort')+1];
        calls.push({model,effort,args,prompt:options.input});const raw=completion(model);options.onStdout(raw.stdout);return raw;
      }}});
  const ids=['claude_opus55_xhigh','claude_sonnet55_medium','claude_haiku55_low','claude_fable51_high'];
  for(const id of ids) {
    const profile=resolveAdaptiveProfile(id,config.profile_policy);
    await session.claude({purpose:'worker',profile,prompt:'Public fixture task',system:'Fixture system',task_id:id});
  }
  await session.claude({purpose:'catalog',prompt:'Fixture catalog',system:'Fixture system'});
  assert.equal(calls.length,5);assert.equal(calls[4].model,'claude-opus-5-5');assert.equal(calls[4].effort,'medium');
  for(const [index,id] of ids.entries()) {
    const expected=resolveAdaptiveProfile(id,config.profile_policy),receipt=session.receipts()[index];
    assert.equal(calls[index].model,expected.model);assert.equal(calls[index].effort,expected.effort);
    assert.equal(receipt.status,'completed');assert.equal(receipt.requested_profile.id,id);
    assert.equal(receipt.requested_model,expected.model);assert.equal(receipt.executed_model_arg,expected.model);
    assert.equal(receipt.requested_effort,expected.effort);assert.equal(receipt.executed_effort_arg,expected.effort);
    assert.deepEqual(receipt.observed_models,[expected.model]);assert.equal(receipt.model_identity_verified,true);
    assert.equal(receipt.effective_effort_verified,null);assert.equal(receipt.actual_billed_usd,null);
    const persisted=read(join(directory,'session','calls',`${receipt.id}.request.json`));
    assert.equal(persisted.requested_profile.id,id);assert.equal(persisted.executed_effort_arg,expected.effort);
  }
});

test('illegal or contradictory requested profiles fail before any CLI call; observed model mismatch has no fallback',async t=>{
  const directory=fixtureDirectory(t),config=manifest();let calls=0;
  const runDirectory=sessionDirectory(directory,'session');
  const session=createAdaptiveProviderSession({rootDir:root,manifest:config,run_id:'profile-invalid',runDirectory,remaining:()=>30000,
    adapters:{jevConfig:{},runCommand:async(_command,_args,options)=>{calls++;const raw=completion('claude-opus-5-5');options.onStdout(raw.stdout);return raw;}}});
  const profile=resolveAdaptiveProfile('claude_sonnet55_medium',config.profile_policy),base={purpose:'worker',prompt:'Fixture',system:'Fixture'};
  await assert.rejects(session.claude({...base,profile:{...profile,id:'not-allowed'}}),{code:'ADAPTIVE_PROFILE_NOT_ALLOWED'});
  await assert.rejects(session.claude({...base,profile:{...profile,effort:'max'}}),{code:'ADAPTIVE_PROFILE_DISPATCH_MISMATCH'});
  await assert.rejects(session.claude({...base,profile:{...profile,model:'claude-opus-5-5'}}),{code:'ADAPTIVE_PROFILE_DISPATCH_MISMATCH'});
  await assert.rejects(session.claude({...base,purpose:'catalog',profile}),{code:'ADAPTIVE_PROFILE_OVERRIDE_INVALID'});
  assert.equal(calls,0);assert.deepEqual(session.receipts(),[]);assert.deepEqual(readdirSync(join(runDirectory,'calls')),[]);
  await assert.rejects(session.claude({...base,profile}),{code:'MODEL_IDENTITY_MISMATCH',outcome_uncertain:false});
  assert.equal(calls,1);const receipt=session.receipts()[0];
  assert.equal(receipt.status,'failed');assert.equal(receipt.requested_model,'claude-sonnet-5-5');
  assert.deepEqual(receipt.observed_models,['claude-opus-5-5']);assert.equal(receipt.model_identity_verified,false);
});

test('Jev-profile workers require a selected profile and pass it through without Docker or provider fallback',async t=>{
  const directory=fixtureDirectory(t),config=manifest(),runDirectory=sessionDirectory(directory,'worker'),seen=[];
  const stageDirectory=join(directory,'stage');mkdirSync(stageDirectory);
  const context={directory:runDirectory,remaining:()=>30000,record:async()=>{},save:()=>{}};
  const input={source:'Public fixture specification',source_ref:{path:'fixture.md',sha256:'1'.repeat(64)},
    requirement_descriptions:[{id:'R1',text:'Produce a file.',source_refs:['fixture.md']}]};
  const profileSelections=new Map();
  const workers=createAdaptiveWorkerAndChecks({rootDir:root,manifest:config,context,
    session:{claude:async value=>{seen.push(value);}},input,catalog:{fixture:true},registry:[],preflight:{},arm:'jev_profile',profileSelections,
    adapters:{runCommand:async()=>{throw new Error('DOCKER_FORBIDDEN');}}});
  const task={id:'task-1',write_scope:['output.py'],read_scope:[],requirement_ids:['R1']};
  const worker={stageDirectory,operation:'implementation',round_index:0,attempt_id:'fixture-worker',input_artifact_revisions:[]};
  await assert.rejects(workers.executeTask(task,worker),{code:'ADAPTIVE_PROFILE_REQUIRED'});assert.equal(seen.length,0);
  profileSelections.set(task.id,{task_id:task.id,profile_id:'claude_haiku55_low',decision_id:'profile-fixture',choice_id:'claude_haiku55_low'});
  assert.deepEqual(await workers.executeTask(task,worker),{status:'completed',outcome_uncertain:false});
  assert.equal(seen.length,1);assert.equal(seen[0].profile.id,'claude_haiku55_low');
  assert.equal(seen[0].prompt.execution_model.profile.model,'claude-haiku-5-5');
  assert.equal(seen[0].context.profile_selection.decision_id,'profile-fixture');
});

test('all four trusted stages admit the identical body through v3 before injected reservation and provider execution',async t=>{
  const directory=fixtureDirectory(t),config=manifest(),events=[],bodies=[];let reserved=0,settled=0,opened=0;
  const runDirectory=sessionDirectory(directory,'session');
  const session=createAdaptiveProviderSession({rootDir:root,manifest:config,run_id:'profile-stage',runDirectory,remaining:()=>30000,
    record:async event=>events.push(event),adapters:{jevConfig:{},
      openBudget:()=>{opened++;return {reserve:()=>{reserved++;return `fixture-${reserved}`;},settle:()=>{settled++;},snapshot:()=>({fixture:true}),close:()=>{}};},
      jevClientFactory:()=>({listModels:async()=>({models:[{name:'jev-latest'}]}),listCredits:async()=>({fixture:true}),
        decide:async body=>{bodies.push(body);return {...answers,model:'jev-1.13.0',usage:{input_tokens:42,output_tokens:3}};}})}});
  for(const stage of ['split','relations','repair','profiles'])assert.deepEqual(await session.decide('jev',request,{stage}),answers);
  assert.equal(opened,4);assert.equal(reserved,4);assert.equal(settled,4);assert.equal(bodies.length,4);
  const hash=sha(prepareDecision(request).serialized),policyHash=sha(readFileSync(join(root,config.repair_policy.token_admission_contract)));
  for(const [index,stage] of ['split','relations','repair','profiles'].entries()) {
    assert.deepEqual(bodies[index],request);const receipt=session.receipts()[index];
    const admission=read(join(runDirectory,'calls',`${receipt.id}.token-admission.json`));
    assert.equal(admission.schema_version,'jev-token-admission-result/v3');assert.equal(admission.stage,stage);
    assert.equal(admission.inference_allowed,true);assert.equal(admission.request_sha256,hash);assert.equal(admission.policy_source.sha256,policyHash);
    assert.equal(receipt.stage,stage);assert.equal(receipt.inference_started,true);
    const admissionAt=events.findIndex(event=>event.event==='adaptive_token_admission_checked'&&event.id===receipt.id);
    const reservationAt=events.findIndex(event=>event.event==='budget_reserved'&&event.attempt_id===receipt.attempt_id);
    const inferenceAt=events.findIndex(event=>event.event==='inference_started'&&event.attempt_id===receipt.attempt_id);
    assert.ok(admissionAt>=0&&reservationAt>admissionAt&&inferenceAt>reservationAt);
  }
});

test('oversized profile state and missing trusted stage stop before budget opening or provider construction',async t=>{
  const directory=fixtureDirectory(t),config=manifest();let opens=0,clients=0;
  const make=name=>createAdaptiveProviderSession({rootDir:root,manifest:config,run_id:name,
    runDirectory:sessionDirectory(directory,name),remaining:()=>30000,adapters:{jevConfig:{},
      openBudget:()=>{opens++;throw new Error('BUDGET_FORBIDDEN');},jevClientFactory:()=>{clients++;throw new Error('PROVIDER_FORBIDDEN');}}});
  const initial=read(join(root,'benchmark-runs/d071-profiles-preview-01/initial.request.json'));
  const blocked=make('oversized');
  await assert.rejects(blocked.decide('jev',initial,{stage:'profiles'}),{code:'ADAPTIVE_TOKEN_PREFLIGHT_BLOCKED',outcome_uncertain:false});
  const admission=read(join(directory,'oversized','calls','jev-0001.token-admission.json'));
  assert.deepEqual(admission.reason_codes,['JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT']);
  assert.equal(blocked.receipts()[0].inference_started,false);assert.equal(blocked.receipts()[0].usage,null);
  await assert.rejects(make('missing').decide('jev',request,{}),{code:'ADAPTIVE_STAGE_INVALID'});
  assert.equal(opens,0);assert.equal(clients,0);
});
