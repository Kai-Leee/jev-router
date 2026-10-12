import {readFileSync, writeFileSync, appendFileSync, mkdirSync, realpathSync, existsSync} from 'node:fs';
import {resolve, relative, dirname, join, basename} from 'node:path';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {isDeepStrictEqual} from 'node:util';
import {runRecursivePlanning, validateRecursiveInput, validateRecursivePlan} from '../orchestration/recursive-task-tests.mjs';
import {encodePlanningState, decodePlanningState} from '../orchestration/planning-state-codec.mjs';
import {prepareDecision, createJevClient} from '../client.mjs';
import {loadConfig, describeConfig, DEFAULT_MODEL} from '../config.mjs';
import {validateBudgetConfig, readTokenBudgetSnapshot, createTokenBudget} from './budget.mjs';
import {acquireTokenBudget} from './budget-acquire.mjs';
import {createMeasuredDecider} from './telemetry.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const fail = code => { throw Object.assign(new Error(code), {code, outcomeUncertain:false}); };
const safeCode = error => /^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code ?? '') ? error.code : 'PLANNING_RUN_FAILED';
const integer = value => Number.isSafeInteger(value) && value > 0;
function inside(root, path) {
  const rel = relative(root, path);
  return rel !== '..' && !rel.startsWith('../') && !rel.startsWith('/');
}
function sourceFile(root, path) {
  if (typeof path !== 'string' || !path || path.includes('\0')) fail('INVALID_PLANNING_PATH');
  const absolute = realpathSync(resolve(root, path));
  if (!inside(root, absolute)) fail('PLANNING_SOURCE_OUTSIDE_ROOT');
  return absolute;
}

export function loadPlanningManifest(manifestPath, root) {
  const absolute = sourceFile(root, manifestPath);
  const manifest = read(absolute);
  if (manifest.schema_version !== 'recursive-planning-pilot/v1' || manifest.model !== DEFAULT_MODEL
      || !['object','json_text','columnar_text'].includes(manifest.state_format ?? 'object')
      || !integer(manifest.max_request_bytes) || manifest.max_request_bytes > 256000
      || !integer(manifest.wall_timeout_seconds) || !integer(manifest.limits?.max_planning_input_tokens)
      || !integer(manifest.limits?.max_planning_decisions)
      || !Number.isFinite(manifest.valuation?.usd_per_million_input_tokens)
      || manifest.valuation.usd_per_million_input_tokens < 0) fail('INVALID_PLANNING_MANIFEST');
  const budget = validateBudgetConfig(manifest.jev_budget, root);
  if (budget.schema_version !== 'jev-token-budget/v2') fail('PLANNING_REQUIRES_SHARED_V2_BUDGET');
  const inputPath = sourceFile(root, manifest.input), contractPath = sourceFile(root, manifest.contract);
  const input = validateRecursiveInput(read(inputPath)), contract = read(contractPath);
  if (contract.schema_version !== 'recursive-task-tests/v2' || contract.status !== 'planning_runtime_contract') fail('INVALID_PLANNING_CONTRACT');
  const publicPath = sourceFile(root, input.source.path);
  if (digest(readFileSync(publicPath)) !== input.source.sha256) fail('PUBLIC_SOURCE_HASH_MISMATCH');
  return {manifest, budget, input, contract, sourcePaths:[absolute,inputPath,contractPath,publicPath]};
}

export function checkPlanningRequest(request, {maxRequestBytes, knownInputTokens, reserveInputTokens, maxPlanningInputTokens, stateFormat='object'}) {
  if (!['object','json_text','columnar_text'].includes(stateFormat)) fail('INVALID_PLANNING_STATE_FORMAT');
  // Representation is explicit and separately versioned. Check every encoded
  // request before spending; a smaller body alone is not proof of preserved facts.
  let state = stateFormat==='json_text' ? JSON.stringify(request.state) : request.state;
  if (stateFormat==='columnar_text') {
    state=JSON.stringify(encodePlanningState(request.state));
  }
  const prepared = prepareDecision({model:DEFAULT_MODEL,state,questions:request.questions});
  if (stateFormat==='columnar_text') {
    const wireState=JSON.parse(JSON.parse(prepared.serialized).state);
    if (!isDeepStrictEqual(decodePlanningState(wireState),request.state)) fail('PLANNING_STATE_ROUNDTRIP_MISMATCH');
  }
  const bytes = Buffer.byteLength(prepared.serialized);
  if (bytes > maxRequestBytes) fail('PLANNING_PAYLOAD_LIMIT');
  if (knownInputTokens + reserveInputTokens > maxPlanningInputTokens) fail('PLANNING_INPUT_RESERVATION_LIMIT');
  return {...prepared,bytes};
}

export function summarizePlanningReceipts(receipts, rate) {
  const completed = receipts.filter(r=>r.status==='completed');
  const submitted = receipts.filter(r=>r.inference_started===true);
  const known = completed.filter(r=>Number.isSafeInteger(r.usage?.input_tokens));
  const knownInput = known.reduce((n,r)=>n+r.usage.input_tokens,0);
  const knownOutput = known.reduce((n,r)=>n+(Number.isSafeInteger(r.usage.output_tokens)?r.usage.output_tokens:0),0);
  const complete = submitted.every(r=>r.status==='completed' && Number.isSafeInteger(r.usage?.input_tokens));
  return {
    inference_requests:submitted.length, completed_requests:completed.length,
    failed_or_uncertain_requests:submitted.filter(r=>r.status!=='completed').length,
    local_or_preflight_rejections:receipts.filter(r=>r.inference_started!==true).length,
    known_input_tokens:knownInput, input_tokens:complete?knownInput:null,
    output_tokens:complete&&known.every(r=>Number.isSafeInteger(r.usage.output_tokens))?knownOutput:null,
    api_equivalent_known_subtotal_usd:knownInput*rate/1e6,
    api_equivalent_usd:complete?knownInput*rate/1e6:null,
    actual_billed_usd:null, subscription_allocation_usd:null,
    valuation:'informational token-pack equivalent, not invoice',
  };
}

// Inspection never loads credentials or starts inference. Mock mode must be explicit.
export async function runPlanningPilot({rootDir, manifestPath, outputDir, spend=false, mock=false, mockDecide,
  clientFactory=createJevClient, openBudget=acquireTokenBudget, runEngine=runRecursivePlanning}={}) {
  const root = realpathSync(rootDir);
  if (spend && mock) fail('AMBIGUOUS_PLANNING_MODE');
  const {manifest,budget:budgetConfig,input,contract,sourcePaths} = loadPlanningManifest(manifestPath,root);
  if (!spend && !mock) return {status:'inspected_no_inference',model:manifest.model,
    obligations:input.obligations.length,tests:input.tests.length,limits:manifest.limits,
    max_request_bytes:manifest.max_request_bytes,mode:'planning_only',runtime_worker_dispatch:false};
  if (typeof outputDir !== 'string' || !outputDir) fail('PLANNING_OUTPUT_REQUIRED');
  const output = resolve(root,outputDir), outputParent = realpathSync(dirname(output));
  if (!inside(root,outputParent) || output===root || existsSync(output)) fail('PLANNING_OUTPUT_MUST_BE_NEW');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(basename(output))) fail('INVALID_RUN_ID');
  mkdirSync(output,{mode:0o700});
  for (const name of ['calls','receipts','sources']) mkdirSync(join(output,name),{mode:0o700});
  let apiKey='';
  const encode = value => {
    let text = JSON.stringify(value,null,2)+'\n';
    if(apiKey) text=text.replaceAll(JSON.stringify(apiKey).slice(1,-1),'[REDACTED]').replaceAll(apiKey,'[REDACTED]');
    return text;
  };
  const save = (path,value) => writeFileSync(join(output,path),encode(value),{mode:0o600,flag:'wx'});
  const events=[], receipts=[];
  const record = async event => {
    const row={recorded_at:new Date().toISOString(),...event};
    appendFileSync(join(output,'events.jsonl'),encode(row).replace(/\n\s*/g,'')+'\n',{mode:0o600});
    events.push(row);
  };
  const startedAt=new Date().toISOString(), started=performance.now();
  const pinnedPaths=[...sourcePaths,
    sourceFile(root,'src/benchmark/recursive-planning-runner.mjs'),
    sourceFile(root,'src/orchestration/recursive-task-tests.mjs'),
    sourceFile(root,'src/orchestration/planning-state-codec.mjs'),
    sourceFile(root,'src/client.mjs'),sourceFile(root,'src/benchmark/telemetry.mjs'),
    sourceFile(root,'src/benchmark/budget.mjs')];
  const frozenSources=pinnedPaths.map((path,index)=>{
    const bytes=readFileSync(path),snapshotPath=`sources/${String(index+1).padStart(3,'0')}-${basename(path)}`;
    writeFileSync(join(output,snapshotPath),bytes,{mode:0o600,flag:'wx'});
    return {path:relative(root,path),sha256:digest(bytes),snapshot_path:snapshotPath};
  });
  save('protocol.json',{schema_version:'recursive-planning-protocol/v1',started_at:startedAt,mode:mock?'mock':'jev',
    manifest,sources:frozenSources,
    outcome_boundary:'Planning lists only. Test specs are not executed checks; no product implementation or independent grade.'});
  save('inputs.json',{input,contract});
  let heldBudget=null, sequence=0, usage=0, stopped=null, plan=null;
  const remaining=()=>manifest.wall_timeout_seconds*1000-(performance.now()-started);
  const proxyBudget={reserve:(...args)=>heldBudget.reserve(...args),settle:(...args)=>heldBudget.settle(...args),snapshot:()=>heldBudget.snapshot()};
  let measured;
  try {
    if(spend){
      save('budget-before.json',readTokenBudgetSnapshot(budgetConfig));
      const config=loadConfig();apiKey=config.apiKey;
      save('connection-config.json',describeConfig(config));
      const client=clientFactory({...config,timeoutMs:60000});
      // A single measured decider performs model GET once, before its first POST.
      measured=createMeasuredDecider({client,budget:proxyBudget,
        identifiers:{run_id:basename(output),attempt_id:basename(output),group_id:'d056-recursive-planning',agent_role:'implementation'},
        record:async event=>record({...event,invocation_id:String(sequence).padStart(3,'0')})});
    }
    const decide=async request=>{
      if(remaining()<=0)fail('PLANNING_WALL_LIMIT');
      if(sequence>=manifest.limits.max_planning_decisions)fail('PLANNING_DECISION_LIMIT');
      const prepared=checkPlanningRequest(request,{maxRequestBytes:manifest.max_request_bytes,
        knownInputTokens:usage,reserveInputTokens:spend?budgetConfig.reserve_input_tokens:0,
        maxPlanningInputTokens:manifest.limits.max_planning_input_tokens,stateFormat:manifest.state_format??'object'});
      const id=String(++sequence).padStart(3,'0'), start=performance.now(), eventStart=events.length;
      save(`calls/${id}.request.json`,{stage:request.stage,node_id:request.node_id,...prepared.body});
      await record({event:'planning_request_prepared',invocation_id:id,stage:request.stage,node_id:request.node_id,
        body_bytes:prepared.bytes,state_format:manifest.state_format??'object',
        source_representation:manifest.state_format==='columnar_text'
          ? 'Readable tables and exact references; original state deep equality checked before inference.'
          : 'Plain local source and test facts.'});
      let decisionResponse;
      try {
        let response;
        if(mock){
          if(typeof mockDecide!=='function')fail('MOCK_DECIDER_REQUIRED');
          response=await mockDecide(request);
        }else{
          heldBudget=await openBudget(budgetConfig,{open:c=>createTokenBudget(c,{requireExisting:true})});
          response=await measured(prepared.body,{decision_id:sequence});
        }
        save(`calls/${id}.response.json`,response);
        const startedInference=events.slice(eventStart).some(e=>e.event==='inference_started');
        const receipt={invocation_id:id,stage:request.stage,node_id:request.node_id,
          provider:mock?'mock':'jev',status:'completed',inference_started:startedInference,
          wall_ms:performance.now()-start,body_bytes:prepared.bytes,model:response.model??null,
          usage:mock?null:response.usage??null,billing:mock?null:response.billing??null,
          api_equivalent_usd:!mock&&Number.isSafeInteger(response.usage?.input_tokens)?response.usage.input_tokens*manifest.valuation.usd_per_million_input_tokens/1e6:null,
          actual_billed_usd:null};
        receipts.push(receipt);save(`receipts/${id}.json`,receipt);
        if(spend && Number.isSafeInteger(response.usage?.input_tokens))usage+=response.usage.input_tokens;
        await record({event:'planning_response_recorded',...receipt});
        decisionResponse=response;
      }catch(error){
        const receipt={invocation_id:id,stage:request.stage,node_id:request.node_id,provider:mock?'mock':'jev',
          status:error.outcomeUncertain===true?'uncertain':'failed',wall_ms:performance.now()-start,body_bytes:prepared.bytes,
          inference_started:events.slice(eventStart).some(e=>e.event==='inference_started'),
          code:safeCode(error),http_status:error.http_status??null,provider_run_id:error.provider_run_id??null,
          error_diagnostics:error.error_diagnostics??null,outcome_uncertain:error.outcomeUncertain??null,
          usage:null,api_equivalent_usd:null,actual_billed_usd:null};
        receipts.push(receipt);save(`receipts/${id}.json`,receipt);
        await record({event:'planning_response_failed',...receipt});throw error;
      }finally{if(heldBudget){heldBudget.close();heldBudget=null;}}
      // A completed paid request stays recorded and settled even if it was late.
      // Reject outside the receipt catch so the known receipt is not overwritten.
      if(remaining()<=0)fail('PLANNING_WALL_LIMIT');
      return decisionResponse;
    };
    plan=await runEngine({input,contract,limits:manifest.limits,decide,record});
    if(remaining()<=0 && plan.status==='complete') {
      plan={...plan,status:'partial',issues:[...plan.issues,{code:'PLANNING_WALL_LIMIT',stage:'post_planning',retry_performed:false}]};
    }
    validateRecursivePlan({input,tasks:plan.tasks,tests:plan.tests});
    save('plan.json',plan);save('tasks.json',plan.tasks);save('tests.json',plan.tests);
  }catch(error){
    stopped=safeCode(error);
    await record({event:'planning_run_stopped',code:stopped,outcome_uncertain:error.outcomeUncertain??null});
  }finally{
    if(heldBudget){heldBudget.close();heldBudget=null;}
    if(spend)save('budget-after.json',readTokenBudgetSnapshot(budgetConfig));
  }
  const sourceChanges=pinnedPaths.filter(path=>{
    const original=read(join(output,'protocol.json')).sources.find(s=>s.path===relative(root,path));
    return digest(readFileSync(path))!==original.sha256;
  }).map(path=>relative(root,path));
  const result={schema_version:'recursive-planning-result/v1',mode:mock?'mock':'jev',
    status:stopped?'failed':plan?.status??'failed',
    stop_code:stopped??(plan?.status!=='complete'?plan?.issues?.[0]?.code??null:null),
    started_at:startedAt,finished_at:new Date().toISOString(),
    wall_ms:performance.now()-started,plan_metrics:plan?.metrics??null,issues:plan?.issues??[],
    usage:mock?null:summarizePlanningReceipts(receipts,manifest.valuation.usd_per_million_input_tokens),
    simulated_decisions:mock?sequence:0,source_changes_during_run:sourceChanges,
    implementation_workers:0,executable_tests_run:0,independent_grade:null,efficiency_gain:null,
    budget_unit:'cumulative provider-charged input tokens',valuation:manifest.valuation};
  save('result.json',result);await record({event:'planning_run_finished',status:result.status,stop_code:result.stop_code});
  return result;
}
