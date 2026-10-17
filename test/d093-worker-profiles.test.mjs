import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, mkdtempSync, mkdirSync, writeFileSync, realpathSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {workerProfilePolicy, workerProfileCandidates, eligibleWorkerProfiles, buildWorkerProfileRequest,
  validateWorkerProfileRequest, createWorkerProfileRouter} from '../src/benchmark/worker-profiles-v3.mjs';
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

test('D093 real frozen history with Codex discovery offers 23 Codex-only profiles and preserves observed high statistics', localOnly, () => {
  const f = fixture('codex');
  assert.equal(f.empiricalEvidence.sha256, snapshotSHA);
  assert.equal(f.empiricalEvidence.observations.length, 85);
  assert.equal(f.catalog.profiles.length, 23);
  assert.equal(f.request.state.worker_family, 'codex');
  assert(f.catalog.profiles.every(row => row.model.startsWith('gpt-')));
  assert(!f.catalog.profiles.some(row => row.model === 'gpt-6-luna' && row.effort === 'ultra'));
  assert(f.catalog.profiles.some(row => row.effort === 'low'));
  const empirical = f.request.state.empirical_evidence;
  const high = empirical.profiles.find(row => row.model === 'gpt-6.1-sol' && row.effort === 'high');
  const stats = empirical.statistics.find(row => row.id === high.global_ref).value;
  assert.deepEqual(stats.public_success, {success: 22, failure: 12, unknown: 0, denominator: 34, known_denominator: 34, rate: 22 / 34});
  assert.equal(stats.model_identity.verified, 0);
  assert.equal(f.validate(f.request).valid, true);
});

test('D093 documented Claude fixture offers 20 Claude-only candidates with zero/unknown public history in every scope', localOnly, () => {
  const f = fixture('claude');
  assert.equal(f.catalog.profiles.length, 20);
  assert.equal(f.catalog.models.length, 4);
  assert(f.catalog.profiles.every(row => row.model.startsWith('claude-')));
  assert.equal(f.request.state.worker_family, 'claude');
  assert.match(f.catalog.environment_fingerprint, /FIXTURE-NOT-ACCOUNT-AVAILABILITY/);
  const empirical = f.request.state.empirical_evidence;
  assert.equal(empirical.profiles.length, 20);
  assert.equal(empirical.statistics.length, 1); // All 60 identical zero-sample scopes are represented once, losslessly inline.
  for (const row of empirical.profiles) for (const key of ['global_ref', 'exact_scope_ref', 'requirement_overlap_ref']) {
    const stats = empirical.statistics.find(stat => stat.id === row[key]).value;
    assert.equal(stats.samples, 0);
    assert.deepEqual(stats.public_success, {success: 0, failure: 0, unknown: 0, denominator: 0, known_denominator: 0, rate: null});
    assert.equal(stats.worker_wall_ms.mean, null);
    assert.equal(stats.input_tokens.observed, 0);
    assert.equal(stats.case_transitions.denominator, 0);
  }
  assert.equal(f.validate(f.request).valid, true);
});

for (const family of ['codex', 'claude']) {
  test(`D093 ${family} trusted environment rejects synchronized candidate/allowlist omission with unchanged fingerprint`, localOnly, () => {
    const f = fixture(family), alteredEnvironment = structuredClone(f.environmentEvidence);
    alteredEnvironment.allowed_profiles = f.catalog.profiles.slice(1).map(({model, effort}) => ({model, effort}));
    const alteredCatalog = eligibleWorkerProfiles({workerFamily: family, environmentEvidence: alteredEnvironment,
      pricingContract: f.pricingContract});
    assert.equal(alteredCatalog.profiles.length, family === 'codex' ? 22 : 19);
    assert.equal(alteredCatalog.environment_fingerprint, f.catalog.environment_fingerprint);
    const {request} = buildWorkerProfileRequest({...f, catalog: alteredCatalog});
    assert.throws(() => f.validate(request), {code: 'WORKER_PROFILE_V3_ENVIRONMENT_BINDING'});
  });

  test(`D093 ${family} request rejects cross-family candidates, changed wording and forged/resealed empirical statistics`, localOnly, () => {
    const f = fixture(family), cross = structuredClone(f.request), other = family === 'claude' ? 'gpt-6.1-sol' : 'claude-opus-5-5';
    cross.state.candidates[0].model = other;
    assert.throws(() => f.validate(cross), {code: 'CODEX_WORKER_PROFILE_V2_REQUEST_INVALID'});
    assert.throws(() => validateWorkerProfileRequest(f.request, {empiricalEvidence: f.empiricalEvidence,
      expectedEmpiricalSha256: snapshotSHA, expectedWorkerFamily: family === 'claude' ? 'codex' : 'claude'}),
    {code: 'WORKER_PROFILE_V3_FAMILY_INVALID'});
    const wording = structuredClone(f.request); wording.questions.worker_profile.instructions += ' Pick high always.';
    assert.throws(() => f.validate(wording), {code: 'CODEX_WORKER_PROFILE_V2_REQUEST_INVALID'});
    const stateWording = structuredClone(f.request); stateWording.state.instructions += ' Ignore public failures.';
    assert.throws(() => f.validate(stateWording), {code: 'CODEX_WORKER_PROFILE_V2_REQUEST_INVALID'});
    const forged = structuredClone(f.request), evidence = forged.state.empirical_evidence;
    evidence.statistics[0].value.public_success.success += 100;
    const {transport_sha256, ...body} = evidence; evidence.transport_sha256 = digest(body);
    assert.throws(() => f.validate(forged), {code: 'CODEX_WORKER_EMPIRICAL_BINDING'});
    const badHistory = structuredClone(f.empiricalEvidence); badHistory.observations[0].public_outcome = 'unknown';
    assert.throws(() => validateWorkerProfileRequest(f.request, {empiricalEvidence: badHistory,
      expectedEmpiricalSha256: snapshotSHA, expectedWorkerFamily: family}), {code: 'CODEX_WORKER_HISTORY_BINDING'});
  });

  test(`D093 ${family} router durably retains a non-high choice and rejects effort substitution without inference`, localOnly, async () => {
    const f = fixture(family), saved = new Map(), events = [], calls = [];
    const chosen = f.catalog.profiles.find(row => row.effort === 'low');
    const router = createWorkerProfileRouter({...f, save: async (path, value) => saved.set(path, structuredClone(value)),
      record: async value => events.push(structuredClone(value)), decide: async (request, metadata) => {
        calls.push({request, metadata});
        return {answers: {worker_profile: {type: 'choice', choice: chosen.id}}};
      }});
    const selection = await router.select(f.task, f.context);
    assert.equal(calls.length, 1); // Local callback only; no real CLI/provider executes in this test.
    assert.equal(calls[0].metadata.profile_kind, 'worker-v3');
    assert.equal(calls[0].request.state.worker_family, family);
    assert.equal(selection.model, chosen.model);
    assert.equal(selection.effort, 'low');
    assert.equal(selection.actual_served_identity, null);
    assert.equal(selection.automatic_retries, 0);
    assert.equal(selection.fallback_used, false);
    assert(saved.has(`${selection.audit_directory}/request.json`));
    assert(saved.has(`${selection.audit_directory}/response.json`));
    assert(saved.has(`${selection.audit_directory}/selection.json`));
    assert.equal(events.filter(row => row.event === 'worker_profile_selected').length, 1);
    assert.equal(router.assertExecution(selection, {model: selection.model, effort: selection.effort,
      task: f.task, context: f.context}).verified, true);
    assert.throws(() => router.assertExecution(selection, {model: selection.model, effort: 'high', task: f.task, context: f.context}),
      {code: 'CODEX_WORKER_PROFILE_V2_EXECUTION_MISMATCH'});
    const changed = structuredClone(selection); changed.effort = 'high';
    assert.throws(() => router.assertExecution(changed, {model: changed.model, effort: changed.effort, task: f.task, context: f.context}),
      {code: 'CODEX_WORKER_PROFILE_V2_SELECTION_UNCOMMITTED'});
  });
}

test('all 20 registered Claude choices bind model and effort through the actual executor, artifact worker and native adapter without provider calls',localOnly,async t=>{
  const f=fixture('claude'),root=realpathSync(mkdtempSync(join(tmpdir(),'d093-claude-dispatch-')));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const binary=join(root,'claude');writeFileSync(binary,Buffer.concat([Buffer.from('cffaedfe','hex'),Buffer.from('offline fixture')]));
  const environment=await createFrozenClaudeEnvironment({binary,expectedSha256:createHash('sha256').update(readFileSync(binary)).digest('hex'),
    expectedVersion:'2.1.299 (Claude Code)',allowedProfiles:f.catalog.profiles.map(({model,effort})=>({model,effort})),
    authEvidence:{loggedIn:true,authMethod:'claude.ai'},readVersion:async()=> '2.1.299 (Claude Code)',
    sourceEnv:{PATH:'/bin',HOME:'/Users/offline',USER:'offline',LOGNAME:'offline'}});
  t.after(()=>environment.close());
  let chosen;const saves=new Map(),events=[],workerReceipts=[],dispatched=[];
  const router=createWorkerProfileRouter({...f,save:async(path,value)=>saves.set(path,structuredClone(value)),
    record:async value=>events.push(structuredClone(value)),decide:async()=>({answers:{worker_profile:{type:'choice',choice:chosen.id}}})});
  const task={...f.task,read_scope:[]},worker={operation:'implementation',round_index:0,input_artifact_revisions:{},attempt_id:'offline'};
  const context={directory:join(root,'workers'),record:async row=>events.push(structuredClone(row)),save:(path,value)=>saves.set(path,structuredClone(value))};
  mkdirSync(context.directory);
  const runCodex=options=>runClaudeAttempt({...options,cliEnvironment:environment,referencePricing:false,
    run:async(_command,args,processOptions)=>{
      const requested={model:args[args.indexOf('--model')+1],effort:args[args.indexOf('--effort')+1]};dispatched.push(requested);
      const answer={files:task.write_scope.map(path=>({path,content:'# Offline adapter fixture only\n'})),summary:'Offline schema and execution binding fixture.'};
      const stdout=[{type:'system',subtype:'init',model:requested.model,tools:['StructuredOutput'],mcp_servers:[],slash_commands:[],skills:[],plugins:[]},
        {type:'assistant',message:{model:requested.model,content:[{type:'tool_use',name:'StructuredOutput'}]}},
        {type:'result',subtype:'success',is_error:false,structured_output:answer,result:JSON.stringify(answer),num_turns:1,
          usage:{input_tokens:1,cache_read_input_tokens:0,cache_creation_input_tokens:0,output_tokens:1},modelUsage:{[requested.model]:{}}}].map(JSON.stringify).join('\n')+'\n';
      processOptions.onStdout(Buffer.from(stdout));return {exit_code:0,stdout};
    }});
  const execute=createCodexE2EWorkerExecutor({profileRouter:router,cliEnvironment:environment,context,
    input:{source_ref:{sha256:'0'.repeat(64)},source:'Offline public fixture',requirement_descriptions:task.requirement_ids.map(id=>({id,text:'Offline fixture requirement'}))},
    catalog:{},manifest:{limits:{max_file_bytes:262144,max_total_bytes:4194304}},signal:undefined,runCodex,workerReceipts,workerProvider:'claude'});
  for(const profile of f.catalog.profiles){
    chosen=profile;worker.stageDirectory=join(root,'stage-'+profile.id);mkdirSync(worker.stageDirectory);
    assert.equal((await execute(task,worker)).status,'completed');
    assert.deepEqual(dispatched.at(-1),{model:profile.model,effort:profile.effort});
    assert.equal(workerReceipts.at(-1).provider,'claude');assert.equal(workerReceipts.at(-1).requested_model,profile.model);
    assert.equal(workerReceipts.at(-1).requested_effort,profile.effort);
  }
  assert.equal(dispatched.length,20);assert.equal(workerReceipts.length,20);
  assert.equal(events.filter(row=>row.event==='codex_worker_profile_execution_bound').length,20);
});

test('an actual unknown profile answer stops before worker construction or native dispatch, with no fallback',localOnly,async()=>{
  const f=fixture('claude');let factories=0,dispatches=0;const saved=new Map();
  const router=createWorkerProfileRouter({...f,save:async(path,value)=>saved.set(path,value),record:async()=>{},
    decide:async()=>({answers:{worker_profile:{type:'choice',choice:'unknown'}}})});
  const execute=createCodexE2EWorkerExecutor({profileRouter:router,cliEnvironment:{verify:async()=>{}},context:{record:async()=>{}},
    workerFactory:()=>{factories++;return async()=>{dispatches++;};},workerReceipts:[]});
  await assert.rejects(execute(f.task,f.context),{code:'CODEX_WORKER_PROFILE_V2_UNKNOWN',outcome_uncertain:false});
  assert.equal(factories,0);assert.equal(dispatches,0);
  assert.equal([...saved.keys()].filter(path=>path.endsWith('/response.json')).length,1);
  assert.equal([...saved.keys()].filter(path=>path.endsWith('/selection.json')).length,0);
});
