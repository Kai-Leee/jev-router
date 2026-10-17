// A real filesystem/planner/repair integration exercise with deterministic in-process providers.
// Never loads credentials, starts Docker or invokes an external model.
import {mkdirSync, readFileSync, writeFileSync, openSync, writeSync, fsyncSync, closeSync, realpathSync} from 'node:fs';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, dirname, resolve} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createAdaptiveProviderSession, createAdaptiveProfilePreparer} from './adaptive-dag-runner.mjs';
import {createQuestionFormHooks} from './adaptive-question-forms.mjs';
import {runAdaptiveDagExecution} from '../orchestration/adaptive-dag-execution.mjs';
import {projectAdaptiveRepairFailure} from '../orchestration/adaptive-repair-projection.mjs';
import {writePrivateJson} from './runner.mjs';

const sha = v => createHash('sha256').update(v).digest('hex');
const ROOT = resolve(import.meta.dirname,'../..');
export const POINTSMAN_MANIFEST = 'benchmarks/e2e-swe/manifests/pointsman-d083.json';
function fixture(manifest) {
  const quotes = ['The producer preserves REQUEST exactly.', 'The renderer preserves its public description.', 'Metadata preserves its public identifier.'];
  const source = quotes.join('\n'), requirement_ids = quotes.map((_,i)=>`R${i}`);
  const catalog = {schema_version:'adaptive-catalog/v1', source_sha256:sha(source),
    evidence:quotes.map((quote,i)=>({id:`e${i}`,quote})),
    units:quotes.map((_,i)=>({id:`u${i}`,title:`Component ${i}`,requirement_ids:[`R${i}`],artifact_ids:[`a${i}`],interface:`Exports value_${i}.`,evidence_ids:[`e${i}`]})),
    artifacts:quotes.map((_,i)=>({id:`a${i}`,paths:[`src/c${i}.txt`],description:quotes[i],evidence_ids:[`e${i}`]}))};
  const check=(id,phase,artifact_ids,reqs)=>({id,version:'v1',phase,artifact_ids,requirement_ids:reqs,
    runner_ref:'pointsman-offline-fixture',argv:['fixture',id],cwd:'src',environment_ref:'pointsman-fixture-v1',source_ref:'public-fixture'});
  return {source,catalog,requirement_ids,requirement_descriptions:quotes.map((text,i)=>({id:`R${i}`,text,source_refs:[`public:${i}`]})),
    checks:[...quotes.map((_,i)=>check(`local${i}`,'local',[`a${i}`],[`R${i}`])),check('public-all','integration',['a0','a1','a2'],requirement_ids)],
    profile_id:manifest.worker_profile.id,goal_revision:'pointsman-smoke-v1',limits:manifest.limits};
}
export async function runPointsmanSmoke({out, rootDir=ROOT}) {
  // Atomic fresh directory reservation. Existing output can never be overwritten or resumed.
  mkdirSync(resolve(out), {mode:0o700});
  const directory=realpathSync(resolve(out)), began=performance.now(), run_id=`pointsman-${randomUUID()}`;
  const manifest=JSON.parse(readFileSync(join(rootDir,POINTSMAN_MANIFEST),'utf8'));
  if(manifest.schema_version!=='adaptive-dag-comparison/v13')throw new Error('POINTSMAN_GATEWAY_SCHEMA_REQUIRED');
  for(const part of ['calls','receipts','checker'])mkdirSync(join(directory,part),{mode:0o700});
  const fd=openSync(join(directory,'events.jsonl'),'wx',0o600), events=[];
  const record=async event=>{const row={...event,run_id,mode:'offline_fixture',recorded_at:new Date().toISOString()};
    const bytes=Buffer.from(JSON.stringify(row)+'\n');let offset=0;
    while(offset<bytes.length){const n=writeSync(fd,bytes,offset,bytes.length-offset);if(n<=0)throw new Error('POINTSMAN_RECORD_FAILED');offset+=n;}
    fsyncSync(fd);events.push(row);};
  const save=(name,value)=>{mkdirSync(dirname(join(directory,name)),{recursive:true,mode:0o700});writePrivateJson(join(directory,name),value);};
  const counts={provider_requests:0,reservations:0,settlements:0,workers:0,repair_workers:0,checks:0};
  let pending=0;
  try {
    const session=createAdaptiveProviderSession({rootDir,manifest,run_id,runDirectory:directory,remaining:()=>60000,record,
      adapters:{jevConfig:{},openBudget:()=>({reserve:()=>{pending++;return `fixture-${++counts.reservations}`;},settle:()=>{pending--;counts.settlements++;},
        snapshot:()=>({reservations_pending:pending,blocked_code:null}),markUnresolved:()=>{},close:()=>{}}),
      jevClientFactory:()=>({listModels:async()=>({models:[{name:'jev-latest'}]}),listCredits:async()=>({fixture:true}),decide:async request=>{
        counts.provider_requests++;
        return {model:'jev-1.13.0',usage:{input_tokens:1,output_tokens:1},answers:Object.fromEntries(Object.entries(request.questions).map(([id,q])=>{
          const keys=Object.keys(q.criteria),choice=keys.includes('no_dependency')?'no_dependency':keys.includes('claude_sonnet55_medium')?'claude_sonnet55_medium':keys.includes('a0')?'a0':keys[0];
          return [id,{type:'choice',choice}];}))};}})}});
    const input=fixture(manifest),hooks=createQuestionFormHooks({manifest,session,record});
    let planning=await hooks.plan({...input,record,commit:async snapshot=>save('plan-commit.json',snapshot)});
    if(planning.status!=='planned'||!planning.dispatch_allowed)throw new Error('POINTSMAN_PLANNING_FAILED');
    const profiles=new Map();
    const prepareProfiles=createAdaptiveProfilePreparer({rootDir,manifest,context:{directory,record,save},session,input,catalog:input.catalog,
      profileSelections:profiles,decide:hooks.decideProfiles});
    const profiled=await prepareProfiles({plan:planning.plan});
    planning={...planning,plan:profiled.plan,execution_context:{...planning.execution_context,profile_id:null,
      initial_planning_profile_assumption:manifest.worker_profile.id,profile_policy:'per_task_jev_selection',worker_profiles:profiled.plan.workers}};
    save('planning.json',planning);
    const contract={schema_version:'public-assertion-contract/v1',version:'2',assertions:[{id:'assert-request',check_id:'public-all',test_id:'test-request',
      requirement_ids:['R0'],artifact_paths:['src/c0.txt'],causal_paths:[{path:'src/c0.txt',role:'producer',rationale:'Public requirement requires REQUEST.'}]}]};
    const source_text=JSON.stringify(contract),contractPath=join(directory,'checker/assertions.json');
    writeFileSync(contractPath,source_text,{flag:'wx',mode:0o600});
    const assertionContract={contract,source_text,source_path:'assertions.json',sha256:sha(source_text)};
    const execution=await runAdaptiveDagExecution({plan:planning.plan,planning,artifactBindings:planning.artifactBindings,
      run_id,runDirectory:join(directory,'execution'),checkerRoot:join(directory,'checker'),checkerFiles:[contractPath],
      environment:{id:'pointsman-fixture-v1'},probeEnvironment:async()=>({node:process.version,fixture:true}),record,
      maxRepairRounds:manifest.max_repair_rounds,repairScopePolicy:'public-inferred-owner-v3',artifactRepairPolicy:'inferred-v3',
      assertionContract,testRequirements:{'test-request':['R0']},projectRepairFailure:projectAdaptiveRepairFailure,
      repairBudget:{policy:'repair-budget-v3'},repairFeedback:{...manifest.repair_feedback},prepareRoundPlan:prepareProfiles,
      decideRepairOwners:hooks.decideRepairOwners,decideRepair:hooks.decideRepair,
      executeTask:async(task,ctx)=>{
        counts.workers++;if(ctx.operation==='repair')counts.repair_workers++;
        for(const path of task.write_scope){await mkdir(dirname(join(ctx.stageDirectory,path)),{recursive:true});
          await writeFile(join(ctx.stageDirectory,path),path==='src/c0.txt'&&ctx.operation!=='repair'?'BROKEN':'REQUEST');}
        await record({event:'pointsman_fixture_worker_executed',task_id:task.id,operation:ctx.operation,write_scope:task.write_scope,
          selected_profile:profiles.get(task.id)?.profile_id??null});
        return {status:'completed',outcome_uncertain:false};
      },checkTask:async(check,ctx)=>{
        counts.checks++;
        const isPublic=check.id==='public-all';
        const passed=isPublic?(await readFile(join(ctx.candidateDirectory,'src/c0.txt'),'utf8'))==='REQUEST':true;
        const report={check_id:check.id,check_version:check.version,environment_ref:check.environment_ref,status:passed?'passed':'failed',
          executed:true,exit_code:passed?0:1,assertions:1,skipped:0,outcome_uncertain:false,error:null,unexecuted_test_ids:[],cases:[]};
        if(isPublic){report.assertion_contract_sha256=assertionContract.sha256;report.cases=[{test_id:'test-request',status:report.status,assertions:1,
          assertion_results:[{assertion_id:'assert-request',status:report.status}],...(!passed?{error_type:'AssertionError',message:'Expected REQUEST, got BROKEN',failed_assertion_id:'assert-request'}:{})}];}
        return {...report,evidence:report};
      }});
    save('execution.json',execution);
    const stages=[...new Set(events.filter(e=>e.event==='pointsman_gateway_accepted').map(e=>e.stage))];
    const passed=execution.status==='completed'&&['split','profiles','repair_owners'].every(stage=>stages.includes(stage))&&counts.repair_workers===1&&pending===0;
    const summary={schema_version:'pointsman-smoke/v1',status:passed?'passed':'failed',scope:'real_planner_profile_owner_and_filesystem_repair_with_fixture_providers',
      live_jev_inference:false,live_worker_inference:false,product_benchmark:false,external_model_calls:0,actual_billed_usd:0,
      fixture_usage_is_not_measured_tokens:true,counts,stages,operations:execution.operations,execution_status:execution.status,
      terminal_cause:execution.terminal_cause??null,wall_ms:performance.now()-began,run_id,directory};
    save('summary.json',summary);return summary;
  } catch(error){const summary={status:'failed',code:error.code??error.message,live_jev_inference:false,directory};save('failure.json',summary);throw error;}
  finally{closeSync(fd);}
}
