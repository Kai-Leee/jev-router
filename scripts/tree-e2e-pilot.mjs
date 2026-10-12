#!/usr/bin/env node
import {buildCountCandidates,countQuestions} from '../src/orchestration/task-count.mjs';
// New no-tools file-generation scaffold. Not native Claude Agent tool execution.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,openSync,fsyncSync,closeSync,existsSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {validateRunConfig} from '../src/benchmark/launch.mjs';
import {createTokenBudget,readTokenBudgetSnapshot} from '../src/benchmark/budget.mjs';
import {createMeasuredDecider} from '../src/benchmark/telemetry.mjs';
import {createJevClient} from '../src/client.mjs';
import {loadConfig,DECISION_URL} from '../src/config.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
import {providerOutcome} from '../src/benchmark/runner.mjs';
import {loadModelCatalog,selectModelProfile} from '../src/orchestration/model-catalog.mjs';
import {validatePlan,runFileArm,splitPolicies} from '../src/orchestration/live-file-workers.mjs';
import {buildSplitState,selectExecution,routingMetrics,validateRoutingOptions} from '../src/orchestration/routing-policy.mjs';
import {createCheckpointRouter} from '../src/orchestration/checkpoint-router.mjs';
import {splitCheckpointAdapter} from '../src/orchestration/split-checkpoint.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function main(){
  const [configPath,output,spend,...flags]=process.argv.slice(2);
  if(!output||spend!=='--spend'||flags.length%2)throw new Error('USAGE: config new-output --spend [--input-mode projected|deduplicated|legacy] [--routing-mode auto|force_jev|forced|claude|jev|script] [--decision-basis count|confidence|probability] [--confidence-threshold number | --split-threshold number] [--plan-source frozen-plan.json] [--concurrency 1|2]');
  const opts={};for(let i=0;i<flags.length;i+=2){if(!['--input-mode','--routing-mode','--split-threshold','--confidence-threshold','--decision-basis','--plan-source','--concurrency'].includes(flags[i])||Object.hasOwn(opts,flags[i]))throw new Error('INVALID_OPTION');opts[flags[i]]=flags[i+1];}
  const inputMode=opts['--input-mode']??'projected',authority=opts['--routing-mode']??'auto';
  const decisionBasis=opts['--decision-basis']??'count';
  if(!['count','confidence','probability'].includes(decisionBasis))throw Error('INVALID_DECISION_BASIS');
  if(decisionBasis==='count'&&(opts['--split-threshold']!==undefined||opts['--confidence-threshold']!==undefined))throw Error('COUNT_THRESHOLD_NOT_ALLOWED');
  const thresholdOption=decisionBasis==='confidence'?'--confidence-threshold':'--split-threshold';
  if(opts[decisionBasis==='confidence'?'--split-threshold':'--confidence-threshold']!==undefined)throw Error('THRESHOLD_BASIS_MISMATCH');
  const threshold=opts[thresholdOption]===undefined?undefined:Number(opts[thresholdOption]);
  if(!['legacy','deduplicated','projected'].includes(inputMode))throw new Error('INVALID_INPUT_MODE');
  validateRoutingOptions({authority:['auto','force_jev'].includes(authority)?'jev':authority,threshold,decisionBasis});
  if(decisionBasis==='count'&&['forced','script'].includes(authority))throw Error('COUNT_REQUIRES_MODEL_AUTHORITY');
  const checkpointMode=['auto','force_jev'].includes(authority);
  const maxConcurrency=Number(opts['--concurrency']??2);if(![1,2].includes(maxConcurrency))throw new Error('INVALID_CONCURRENCY');
  const config=validateRunConfig(JSON.parse(readFileSync(configPath,'utf8')),dirname(resolve(configPath)));
  if(config.model!=='claude-opus-5-5'||config.effort!=='medium'||!config.jev_budget||!existsSync(config.jev_budget.ledger_path))throw new Error('EXISTING_SHARED_BUDGET_AND_OPUS_MEDIUM_REQUIRED');
  const modelCatalog=await loadModelCatalog();
  const profile=selectModelProfile(modelCatalog.catalog,{model:config.model,effort:config.effort,allowedProfiles:['opus55_medium']});
  const dir=resolve(output);mkdirSync(dir,{mode:0o700});
  const cwd=mkdtempSync(join(tmpdir(),'jev-tree-'));
  const mcpFile=join(cwd,'empty-mcp.json');writeFileSync(mcpFile,'{"mcpServers":{}}',{mode:0o600});
  const fd=openSync(join(dir,'events.jsonl'),'wx',0o600);
  const save=(name,x)=>writeFileSync(join(dir,name),JSON.stringify(x,null,2)+'\n',{flag:'wx',mode:0o600});
  const record=async event=>{writeFileSync(fd,JSON.stringify({recorded_at:new Date().toISOString(),...event})+'\n');fsyncSync(fd);};
  let budget;const started=performance.now(),receipts=[],arms=[];let phaseStarted=started;
  const maxTotalMs=Math.min(30*60*1000,config.wall_timeout_seconds*1000);
  try{
    const brief=config.instructions.map(path=>({path,text:readFileSync(path,'utf8')}));
    const questionsPath=join(root,decisionBasis==='count'?'docs/orchestration/contracts/task-count.v1.json':decisionBasis==='confidence'?'docs/orchestration/contracts/split-confidence.v2.json':'docs/orchestration/contracts/questions.v1.json');
    const questionDocument=JSON.parse(readFileSync(questionsPath,'utf8'));
    let questions=decisionBasis==='count'?null:decisionBasis==='confidence'?questionDocument.questions:questionDocument.kinds.split.questions;
    const workerPath=join(root,inputMode==='legacy'?'docs/orchestration/contracts/worker-task.v2.json':'docs/orchestration/contracts/worker-task.v3.json');
    if(!existsSync(workerPath))throw new Error('WORKER_V2_REQUIRED');
    const workerContract=JSON.parse(readFileSync(workerPath,'utf8'));
    save('inputs.json',{commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),brief,briefHash:hash(brief),questions,questionTemplate:questionDocument,questionsPath,questionsSha256:createHash('sha256').update(readFileSync(questionsPath)).digest('hex'),workerContract,workerPath,workerSha256:createHash('sha256').update(readFileSync(workerPath)).digest('hex'),profile,inputMode,maxConcurrency,routingAuthority:authority,decisionBasis,confidenceThreshold:decisionBasis==='confidence'?threshold??null:null,splitThreshold:decisionBasis==='probability'?threshold??null:null,modelCatalogSource:modelCatalog.source,model:config.model,effort:config.effort,cwd,decisionEndpoint:DECISION_URL,scaffold:'fresh-no-tools-cli-file-generation',gradingInputProvided:false});
    // Non-Jev cohorts observe the shared ledger without acquiring its writer lock.
    const budgetSnapshot=()=>readTokenBudgetSnapshot(config.jev_budget);
    save('budget-before.json',budgetSnapshot());
    const decideWithBudget=async(req,context)=>{
      budget=createTokenBudget(config.jev_budget);
      try {
        const decide=createMeasuredDecider({client:createJevClient(loadConfig()),budget,record,identifiers:{run_id:config.run_id,attempt_id:config.attempt_id,group_id:config.group_id,agent_role:'implementation'}});
        return await decide(req,context);
      } finally { budget.close();budget=null; }
    };
    const call=async(request,label,planner=false,decisionOnly=false)=>{
      if(performance.now()-phaseStarted>=maxTotalMs)throw new Error('TOTAL_TIMEOUT');
      let system=decisionOnly?(decisionBasis==='count'?'Answer the supplied task_count choice question. Return only JSON {"answers":{"task_count":{"type":"choice","choice":"1","confidence":0.0}}}. Choose only one supplied candidate key. Do not invent a plan.':decisionBasis==='confidence'?'Answer only the supplied typed choice question against state. Return JSON {"answers":{"execution":{"type":"choice","choice":"split","confidence":0.0}}}. Choose split, single, or defer from the supplied criteria; confidence must be a number from 0 to 1 for that selected choice. This is self-reported confidence, not calibrated accuracy. Do not generate a plan or implementation.':'Answer only the supplied typed questions against state. Return JSON {"answers":{"beneficial":{"type":"noul","noul":0.0},"evidence":{"type":"choice","choice":"sufficient"}}}. Use sufficient or insufficient as defined in the supplied question. Do not generate a new plan or implementation.'):planner?'Produce only JSON {"tasks":[{"id":"identifier","description":"full task and interface contract","paths":["exact/relative/file"],"dependsOn":[]}],"integrationInstructions":"shared interfaces and integration rules"}. Split the supplied goal into 2 to 5 tasks with disjoint exact file ownership and an acyclic dependency graph. Include every file needed to satisfy the artifact contract. Do not execute anything. Do not reference hidden tests.':`Follow the supplied worker contract and frozen plan. You have NO tools. Return only JSON {"files":[{"path":"owned relative path","content":"complete file content"}],"artifacts":["owned relative path"],"observed_checks":[],"blockers":[],"uncertainty":["Checks unexecuted: no tools"],"summary":"brief summary and unexecuted checks"}. Supply EVERY assigned file, only assigned paths. Do not return Markdown fences. Artifacts must list exactly all returned file paths. observed_checks must be empty because no tools are available. Never claim executed tests. Worker contract:\n${JSON.stringify(workerContract)}`;
      if(planner&&(checkpointMode||decisionBasis==='count'))system=system.replace('Split the supplied goal into 2 to 5 tasks','Represent the supplied goal as 1 to 5 tasks; keep one task when decomposition is unnecessary. Use tasks');
      const args=['--print','--restricted','--model',config.model,'--effort',config.effort,'--tools','','--strict-mcp-config','--mcp-config',mcpFile,'--setting-sources','','--disable-slash-commands','--no-chrome','--permission-mode','dontAsk','--permission-prompts','none','--no-session-persistence','--output-format','stream-json','--verbose','--system-prompt',system];
      await record({event:'claude_started',label,request,system,model:config.model,effort:config.effort});
      const t=performance.now();
      const streamFd=openSync(join(dir,`${label}.live.jsonl`),'wx',0o600);
      let result;
      try {result=await processResult('claude',args,{cwd,env:claudeEnvironment(process.env),input:JSON.stringify(request),maxBytes:4*1024*1024,timeoutMs:maxTotalMs-(performance.now()-phaseStarted),killProcessTree:true,onStdout:chunk=>writeFileSync(streamFd,chunk)});}
      finally {closeSync(streamFd);}
      writeFileSync(join(dir,`${label}.stdout.jsonl`),result.stdout,{flag:'wx',mode:0o600});
      writeFileSync(join(dir,`${label}.stderr.log`),result.stderr,{flag:'wx',mode:0o600});
      const outcome=providerOutcome(result,config.model);
      const receipt={label,wall_ms:performance.now()-t,status:outcome.status,models:outcome.models,usage:outcome.completion?.usage??null,api_equivalent_usd:outcome.completion?.total_cost_usd??null,provider_api_ms:outcome.completion?.duration_api_ms??null,exitCode:result.exit_code??null,interrupted:result.interrupted??null,outcome_uncertain:result.outcome_uncertain??null};
      receipts.push(receipt);save(`${label}.receipt.json`,receipt);await record({event:'claude_finished',...receipt});
      if(outcome.status!=='completed')throw new Error('CLAUDE_FAILED_NO_RETRY');
      const response=JSON.parse(outcome.completion.result.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
      return {...receipt,response};
    };
    let planning,plan,planSource=null;
    if(opts['--plan-source']){
      planSource=resolve(opts['--plan-source']);
      const frozen=JSON.parse(readFileSync(planSource,'utf8'));
      const previousInputs=JSON.parse(readFileSync(join(dirname(planSource),'inputs.json'),'utf8'));
      if(previousInputs.briefHash!==hash(brief))throw new Error('FROZEN_PLAN_BRIEF_MISMATCH');
      plan=validatePlan(frozen.plan,{minTasks:checkpointMode||decisionBasis==='count'?1:2});
      if(hash(plan)!==frozen.hash)throw new Error('FROZEN_PLAN_HASH_MISMATCH');
      planning={wall_ms:0,api_equivalent_usd:0,reused:true,source:planSource,sourceHash:createHash('sha256').update(readFileSync(planSource)).digest('hex'),originalPlanning:frozen.planning};
    }else{planning=await call({brief,workerContract},'planner',true);plan=validatePlan(planning.response,{minTasks:checkpointMode||decisionBasis==='count'?1:2});}
    save('frozen-plan.json',{plan,hash:hash(plan),planning});
    // Give generated-plan and reused-plan cohorts the same post-plan execution budget.
    phaseStarted=performance.now();
    const candidatePlans=decisionBasis==='count'?buildCountCandidates(plan):null;
    if(candidatePlans)questions=countQuestions(candidatePlans);
    const state=buildSplitState({brief,plan,model:config.model,effort:config.effort,maxConcurrency});
    if(candidatePlans)state.candidatePlans=candidatePlans;
    const request={model:'jev-latest',state,questions};
    save('split-request.json',request);
    const jt=performance.now();let response=null,claudeDecisionCalls=0,jevDecisionCalls=0,selection,routing,checkpoint=null;
    const executeMode=async (mode,chosen=selection)=>{
      const executionPlan=candidatePlans?candidatePlans[chosen.choice]:plan;
      if(!executionPlan)throw Error('MISSING_EXECUTION_PLAN');
      if(candidatePlans)save(`selected-plan-${mode}.json`,executionPlan);
      await record({event:'arm_started',mode,planHash:hash(plan),executionPlanHash:hash(executionPlan),taskCount:executionPlan.tasks.length,briefHash:hash(brief),profile});
      const arm=await runFileArm({plan:executionPlan,brief,mode,outputDir:join(dir,`candidate-${mode}`),call,record,maxConcurrency,profile,inputMode,allowSingleTask:checkpointMode||decisionBasis==='count'});arms.push(arm);save(`${mode}.json`,arm);
      return {status:arm.status,mode,quality_verified:false};
    };
    if(['auto','force_jev'].includes(authority)){
      // New vertical slice: checkpoint dispatch owns execution, no second approval loop.
      const event={id:'tree-plan-ready',decisionId:1,scope:dir,executionKey:'initial-plan',type:'plan_ready',evidenceRevision:hash(plan),brief,plan,workerModel:config.model,workerEffort:config.effort,maxConcurrency,threshold,decisionBasis,modelIdentity:null};
      const router=createCheckpointRouter({adapter:splitCheckpointAdapter,record,
        readCurrent:async original=>({...original,plan:JSON.parse(readFileSync(join(dir,'frozen-plan.json'),'utf8')).plan,brief:config.instructions.map(path=>({path,text:readFileSync(path,'utf8')}))}),
        decide:async(req,context)=>{
          jevDecisionCalls++;response=await decideWithBudget(req,context);return response;
        },handlers:{execute_single:({selection})=>executeMode('single',selection),execute_split:({selection})=>executeMode('split',selection),collect_evidence:async()=>({status:'needs_evidence'})}});
      checkpoint=await router.run(event,{mode:authority});save('checkpoint.json',checkpoint);
      if(checkpoint.status!=='dispatched')throw new Error('CHECKPOINT_STOPPED');
      selection=checkpoint.selection;
      routing={...routingMetrics({authority,selection,elapsedMs:checkpoint.timing_ms.decision,claudeCalls:0,jevCalls:jevDecisionCalls}),checkpoint_authority:checkpoint.authority,skip_reason:checkpoint.skip_reason,decision_used:checkpoint.decision_used};
    }else{
      if(candidatePlans&&Object.keys(candidatePlans).length===1){
        selection={modes:['single'],taskCount:1,choice:'1',confidence:null,decisionBasis:'count',decisionUsed:false,reason:'one_validated_task',probability:null,threshold:null};
      }else if(authority==='jev'||authority==='forced'){
        response=await decideWithBudget(request,{decision_id:1});jevDecisionCalls=1;
      }else if(authority==='claude'){
        response=(await call({state,questions},'claude-routing',false,true)).response;claudeDecisionCalls=1;
      }
      selection??=selectExecution({authority,threshold,decisionBasis,answers:response?.answers,plan});
      routing=routingMetrics({authority,selection,elapsedMs:performance.now()-jt,claudeCalls:claudeDecisionCalls,jevCalls:jevDecisionCalls});
    }
    const splitDecision={response,wall_ms:routing.decision_elapsed_ms,policies:response?(decisionBasis==='count'?[selection]:decisionBasis==='confidence'?[.5,.65,.8].map(threshold=>selectExecution({authority:'jev',threshold,decisionBasis,answers:response.answers,plan})):splitPolicies(response.answers)):[],routing};save('split-decision.json',splitDecision);
    await record({event:'routing_selected',...routing});
    if(!checkpoint)for(const mode of selection.modes){await executeMode(mode);if(arms.at(-1).status!=='completed')break;}
    save('result.json',{status:selection.modes.length===0?'needs_evidence':arms.length===selection.modes.length&&arms.every(a=>a.status==='completed')?'generated_ungraded':'failed',inputMode,maxConcurrency,routing,planning_reused:planning.reused===true,planning_call_count:planning.reused?0:1,planning_ms:planning.wall_ms,jev_ms:jevDecisionCalls?splitDecision.wall_ms:0,wall_ms:performance.now()-started,planHash:hash(plan),arms,receipts,budget:budgetSnapshot(),limitations:['n=1 plan; no calibration claim','Stage barriers await all ready workers before dispatching the next batch; not a continuously filled scheduler','Wall time includes CLI startup and provider delays; queue time is not separately measured','Only forced authority runs both counterfactual arms; other authorities execute selected arm or abstain; no paired speedup claim from a single run','Fresh no-tools CLI workers, not native Agent tool','Changed scaffold versus D025; no direct comparison','No generated tests or commands executed here; independent grade pending','Fixed Opus medium isolates decomposition; dynamic model selection not tested']});
    const finalStatus=selection.modes.length===0?'needs_evidence':arms.length===selection.modes.length&&arms.every(a=>a.status==='completed')?'generated_ungraded':'failed';
    if(finalStatus==='failed')process.exitCode=1;
    console.log(JSON.stringify({output:dir,status:finalStatus,arms:arms.map(a=>({mode:a.mode,status:a.status,wall_ms:a.wall_ms}))}));
  }catch(error){save('stopped.json',{status:'stopped',code:/^[A-Z_]+$/.test(error.message)?error.message:'PILOT_FAILED',retry:false,receipts,arms,budget:budget?.snapshot()??null});throw error;}
  finally{budget?.close();closeSync(fd);}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(()=>{console.error('TREE_PILOT_STOPPED: inspect private receipts; no automatic replay');process.exitCode=1;});
