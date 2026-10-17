import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, lstatSync, chmodSync, readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createCodexE2EDecisions, summarizeCodexE2EUsage} from '../src/benchmark/codex-e2e-decisions.mjs';
import {planCodexE2E,CODEX_E2E_MANIFEST} from '../src/benchmark/codex-e2e-runner.mjs';
import {createCodexArtifactWorker} from '../src/benchmark/codex-artifact-worker.mjs';
import {runAdaptiveDagExecution} from '../src/orchestration/adaptive-dag-execution.mjs';
import {projectAdaptiveRepairFailure} from '../src/orchestration/adaptive-repair-projection.mjs';
import {describeOwnerCriteria, loadOwnerCriteriaContract} from '../src/orchestration/adaptive-owner-criteria.mjs';
import {selectInferredOwnerScope} from '../src/orchestration/adaptive-inferred-scope.mjs';
import {buildUnitRelationRequests, loadLayeredContract, LAYERED_CONTRACTS} from '../src/orchestration/adaptive-layered-decomposition.mjs';
import {writePrivateJson} from '../src/benchmark/runner.mjs';

const rootDir=resolve(import.meta.dirname,'..'),sha=v=>createHash('sha256').update(v).digest('hex');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
function removeFixture(path) {
  const stat=lstatSync(path);
  if(stat.isDirectory()&&!stat.isSymbolicLink()) {
    chmodSync(path,0o700);
    for(const name of readdirSync(path))removeFixture(join(path,name));
  }
  rmSync(path,{recursive:true,force:true});
}
function setup() {
  const directory=realpathSync(mkdtempSync(join(tmpdir(),'codex-e2e-fixture-')));
  for(const name of ['calls','receipts','gateway','public-workspaces','checker'])mkdirSync(join(directory,name));
  const manifest=read(join(rootDir,CODEX_E2E_MANIFEST));
  const quotes=['The producer preserves REQUEST exactly.','The renderer preserves its public description.','Metadata preserves its public identifier.'];
  const source=quotes.join('\n'),requirement_ids=quotes.map((_,i)=>`R${i}`);
  const input={source,source_ref:{path:'public-fixture',sha256:sha(source)},requirement_ids,
    requirement_descriptions:quotes.map((text,i)=>({id:`R${i}`,text,source_refs:[`public:${i}`]}))};
  const catalog={schema_version:'adaptive-catalog/v1',source_sha256:sha(source),evidence:quotes.map((quote,i)=>({id:`e${i}`,quote})),
    units:quotes.map((_,i)=>({id:`u${i}`,title:`Component ${i}`,requirement_ids:[`R${i}`],artifact_ids:[`a${i}`],interface:`Exports value_${i}.`,evidence_ids:[`e${i}`]})),
    artifacts:quotes.map((_,i)=>({id:`a${i}`,paths:[`src/c${i}.txt`],description:quotes[i],evidence_ids:[`e${i}`]}))};
  const check=(id,phase,artifacts,requirements)=>({id,version:'v1',phase,artifact_ids:artifacts,requirement_ids:requirements,
    runner_ref:'codex-fixture',argv:['fixture',id],cwd:'src',environment_ref:'codex-fixture-v1',source_ref:'public-fixture'});
  const checks=[...quotes.map((_,i)=>check(`local${i}`,'local',[`a${i}`],[`R${i}`])),check('public-all','integration',['a0','a1','a2'],requirement_ids)];
  const events=[],context={directory,run_id:'codex-fixture',remaining:()=>60000,record:async event=>events.push(event),
    save:(path,value)=>{mkdirSync(dirname(join(directory,path)),{recursive:true});writePrivateJson(join(directory,path),value);}};
  return {directory,manifest,input,catalog,events,context,loaded:{manifest,input,prepared:{catalog},checks}};
}

function mockCodex(calls) {
  return async options=>{
    options.beforeDispatch?.();
    let answer;
    if(options.schema.properties.answers) {
      answer={answers:Object.fromEntries(Object.entries(options.schema.properties.answers.properties).map(([id,schema])=>{
        const choices=schema.properties.choice.enum;
        const choice=choices.includes('no_dependency')?'no_dependency':choices.includes('a0')?'a0':choices[0];
        return [id,{type:'choice',choice}];
      }))};
      calls.push({kind:'decision',questions:Object.keys(answer.answers)});
    } else {
      const packet=JSON.parse(options.prompt.slice(options.prompt.lastIndexOf('\n')+1));
      answer={files:packet.writable_paths.map(path=>({path,content:path==='src/c0.txt'&&packet.operation!=='repair'?'BROKEN':'REQUEST'})),summary:'Fixture source bodies only; checks belong to controller.'};
      calls.push({kind:'worker',operation:packet.operation,paths:packet.writable_paths});
    }
    assert.equal(options.role,'decision');assert.equal(options.validateAnswer(answer),true);
    mkdirSync(options.out,{recursive:true});
    const receipt={provider:'codex',status:'completed',process_submitted:true,outcome_uncertain:false,tools_used:[],
      requested_model:options.model,requested_effort:options.effort,usage:{input_tokens:10,cached_input_tokens:4,output_tokens:2},wall_ms:1,
      model_identity_verified:null,api_equivalent_usd:null};
    writePrivateJson(join(options.out,'receipt.json'),receipt);
    return {answer,receipt};
  };
}

test('Codex choices pass real gateway, planner and selective artifact repair without Jev transport',async()=>{
  const f=setup(),calls=[],workerReceipts=[];
  try {
    const decision=createCodexE2EDecisions({provider:'codex',rootDir,manifest:f.manifest,context:f.context,
      model:'fixture-codex',effort:'high',runCodex:mockCodex(calls)});
    const planning=await planCodexE2E({loaded:f.loaded,profileId:'codex-fixture',decide:decision.decide,record:f.context.record,save:f.context.save});
    assert.equal(planning.status,'planned');assert.equal(planning.dispatch_allowed,true);
    assert.deepEqual(read(join(f.directory,'plan-commit.json')),planning);
    assert.ok(planning.plan.workers.every(worker=>worker.profile_id==='codex-fixture'));
    const executeTask=createCodexArtifactWorker({directory:f.directory,input:f.input,catalog:f.catalog,manifest:f.manifest,
      model:'fixture-codex',effort:'high',spend:true,runCodex:mockCodex(calls),record:f.context.record,onReceipt:r=>workerReceipts.push(r)});
    const contract={schema_version:'public-assertion-contract/v1',version:'2',assertions:[{id:'assert-request',check_id:'public-all',test_id:'test-request',
      requirement_ids:['R0'],artifact_paths:['src/c0.txt'],causal_paths:[{path:'src/c0.txt',role:'producer',rationale:'Public requirement requires REQUEST.'}]}]};
    const source_text=JSON.stringify(contract),contractPath=join(f.directory,'checker/assertions.json');writeFileSync(contractPath,source_text);
    const assertionContract={contract,source_text,source_path:'assertions.json',sha256:sha(source_text)};
    const owner=loadOwnerCriteriaContract(f.manifest.question_forms.owner_criteria.contract);
    const execution=await runAdaptiveDagExecution({plan:planning.plan,planning,artifactBindings:planning.artifactBindings,
      run_id:f.context.run_id,runDirectory:join(f.directory,'execution'),checkerRoot:join(f.directory,'checker'),checkerFiles:[contractPath],
      environment:{id:'codex-fixture-v1'},probeEnvironment:async()=>({node:process.version,fixture:true}),record:f.context.record,
      executeTask,maxRepairRounds:2,repairScopePolicy:'public-inferred-owner-v3',artifactRepairPolicy:'inferred-v3',
      repairDispatchPolicy:f.manifest.repair_efficiency?.dispatch_policy,
      assertionContract,testRequirements:{'test-request':['R0']},projectRepairFailure:projectAdaptiveRepairFailure,
      repairBudget:{policy:'repair-budget-v3'},repairFeedback:{...f.manifest.repair_feedback},
      decideRepairOwners:(request,metadata)=>decision.decide(describeOwnerCriteria(request,owner),metadata),decideRepair:selectInferredOwnerScope,
      checkTask:async(check,ctx)=>{
        const isPublic=check.id==='public-all',passed=!isPublic||readFileSync(join(ctx.candidateDirectory,'src/c0.txt'),'utf8')==='REQUEST';
        const report={check_id:check.id,check_version:check.version,environment_ref:check.environment_ref,status:passed?'passed':'failed',executed:true,
          exit_code:passed?0:1,assertions:1,skipped:0,outcome_uncertain:false,error:null,unexecuted_test_ids:[],cases:[]};
        if(isPublic){report.assertion_contract_sha256=assertionContract.sha256;report.cases=[{test_id:'test-request',status:report.status,assertions:1,
          assertion_results:[{assertion_id:'assert-request',status:report.status}],...(!passed?{error_type:'AssertionError',message:'Expected REQUEST, got BROKEN',failed_assertion_id:'assert-request'}:{})}];}
        return {...report,evidence:report};
      }});
    assert.equal(execution.status,'completed',JSON.stringify(execution.terminal_cause));
    assert.equal(execution.repair_rounds_used,1);
    assert.ok(f.events.some(event=>event.event==='adaptive_verified_repair_context_attached'));
    assert.equal(readFileSync(join(execution.candidate_path,'src/c0.txt'),'utf8'),'REQUEST');
    const workers=calls.filter(call=>call.kind==='worker'),repairs=workers.filter(call=>call.operation==='repair');
    assert.equal(workers.length,planning.plan.workers.length+1);assert.equal(repairs.length,1);
    assert.deepEqual(repairs[0].paths,['src/c0.txt']);
    for(const path of ['src/c1.txt','src/c2.txt'])assert.equal(workers.filter(call=>call.paths.includes(path)).length,1);
    assert.ok(workerReceipts.every(row=>row.status==='completed'));
    assert.deepEqual([...new Set(f.events.filter(e=>e.event==='pointsman_gateway_accepted').map(e=>e.stage))].sort(),['repair_owners','split']);
    assert.ok(decision.receipts().every(receipt=>receipt.provider==='codex'&&receipt.jev_reservations===0));
    assert.equal(f.events.some(event=>event.event==='inference_started'),false);
    const usage=summarizeCodexE2EUsage(decision.receipts());
    assert.equal(usage.total.total_tokens,decision.receipts().length*12);assert.equal(usage.jev.calls,0);
  } finally {removeFixture(f.directory);}
});

test('invalid fixed question stops Codex before dispatch and stops subsequent decisions',async()=>{
  const f=setup(),calls=[];
  try {
    const decision=createCodexE2EDecisions({provider:'codex',rootDir,manifest:f.manifest,context:f.context,
      model:'fixture-codex',effort:'high',runCodex:mockCodex(calls)});
    const request={model:'jev-latest',state:{unit_relation_question:'bad template'},questions:{q:{type:'choice',instructions:'Choose arbitrary.',criteria:{yes:'Yes',no:'No'}}}};
    await assert.rejects(decision.decide(request,{stage:'split'}));
    await assert.rejects(decision.decide(request,{stage:'split'}),{code:'CODEX_E2E_DECISIONS_STOPPED'});
    assert.equal(calls.length,0);assert.equal(decision.receipts().length,0);
  } finally {removeFixture(f.directory);}
});

test('uncertain provider receipt propagates through the decision gateway and remains unpriced',async()=>{
  const f=setup();let dispatched=0;
  try {
    const decision=createCodexE2EDecisions({provider:'codex',rootDir,manifest:f.manifest,context:f.context,
      model:'fixture-codex',effort:'high',runCodex:async options=>{
        options.beforeDispatch();dispatched++;
        mkdirSync(options.out,{recursive:true});
        writePrivateJson(join(options.out,'receipt.json'),{provider:'codex',status:'uncertain',process_submitted:true,usage:null});
        throw Object.assign(new Error('Interrupted'),{code:'CODEX_CANCELLED'});
      }});
    const [{request}]=buildUnitRelationRequests({catalog:f.catalog,requirement_descriptions:f.input.requirement_descriptions,
      max_concurrency:2,limits:f.manifest.limits,contract:loadLayeredContract(LAYERED_CONTRACTS.v2)});
    await assert.rejects(decision.decide(request,{stage:'split'}),{code:'CODEX_CANCELLED',outcome_uncertain:true});
    assert.equal(dispatched,1);
    assert.equal(decision.receipts()[0].status,'uncertain');
    const usage=summarizeCodexE2EUsage(decision.receipts());
    assert.equal(usage.total.started_calls,1);assert.equal(usage.total.total_tokens,null);
    assert.equal(usage.total.api_equivalent_usd,null);
    assert.equal(f.events.some(event=>event.event==='pointsman_gateway_accepted'),false);
  } finally {removeFixture(f.directory);}
});
