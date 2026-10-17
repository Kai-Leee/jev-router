import {mkdirSync, readFileSync, readdirSync, lstatSync, openSync, writeSync, fsyncSync, closeSync, rmSync, existsSync} from 'node:fs';
import {join, resolve, relative,dirname} from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {cpus} from 'node:os';
import {writePrivateJson} from './runner.mjs';
import {validatePointsmanManifest} from '../orchestration/pointsman-gateway.mjs';
import {loadAdaptivePublicInput, loadAdaptiveSharedPreparation, loadAdaptiveTestRequirements, buildAdaptiveChecks} from './adaptive-dag-runner.mjs';
import {loadPublicAuditInputs} from '../../scripts/audit-dag-public-checks.mjs';
import {validateAdaptiveCatalog} from '../orchestration/adaptive-dag-planner.mjs';
import {planLayeredDag, LAYERED_CONTRACTS} from '../orchestration/adaptive-layered-decomposition.mjs';
import {applyWorkloadEstimates, loadScheduleContract} from '../orchestration/adaptive-critical-path-schedule.mjs';
import {describeOwnerCriteria, loadOwnerCriteriaContract} from '../orchestration/adaptive-owner-criteria.mjs';
import {selectInferredOwnerScope} from '../orchestration/adaptive-inferred-scope.mjs';
import {projectAdaptiveRepairFailure} from '../orchestration/adaptive-repair-projection.mjs';
import {runAdaptiveDagExecution} from '../orchestration/adaptive-dag-execution.mjs';
import {createCodexE2EDecisions, summarizeCodexE2EUsage} from './codex-e2e-decisions.mjs';
import {createCodexArtifactWorker} from './codex-artifact-worker.mjs';
import {codexArguments, runCodexAttempt} from './codex-provider.mjs';
import {createAppBundledCodexEnvironment} from './codex-environment.mjs';
import {selectPublicOwnerEvidenceScope} from '../orchestration/adaptive-public-owner-evidence.mjs';
import {inspectCodexE2EChecks, createCodexE2EChecks, gradeCodexE2ECandidate} from './codex-e2e-checks.mjs';
import {projectOwnerPayload} from '../orchestration/adaptive-owner-payload-projection.mjs';
import {createCodexWorkerProfileRouter,codexWorkerProfilePolicy} from './codex-worker-profiles.mjs';
import {createCodexWorkerProfileRouter as createCodexWorkerProfileRouterV2,codexWorkerProfileCandidates} from './codex-worker-profiles-v2.mjs';
import {loadCodexWorkerHistory} from './codex-worker-history-binding.mjs';
import {createWorkerProfileRouter,workerProfileCandidates} from './worker-profiles-v3.mjs';
import {createWorkerProfileRouter as createWorkerProfileRouterV4} from './worker-profiles-v4.mjs';
import {claudePricingContract} from './claude-pricing.mjs';
import {createFrozenClaudeEnvironment} from './claude-environment.mjs';
import {runClaudeAttempt} from './claude-provider.mjs';
import {codexPricingContract} from './codex-pricing.mjs';

const ROOT=resolve(import.meta.dirname,'../..');
export const CODEX_E2E_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-codex-d091.json';
export const CODEX_E2E_ADAPTIVE_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-codex-d091-adaptive.json';
export const CODEX_E2E_CALIBRATED_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-codex-d092-adaptive.json';
export const D093_CODEX_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-codex-d093.json';
export const D093_CLAUDE_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-claude-d093.json';
export const D093_CLAUDE_RECOVERY_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-claude-d093-recovery.json';
export const D093_CLAUDE_CLASSIFIER_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-claude-d093-classifier.json';
export const D095_RUNTIME_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-claude-d095-runtime.json';
export const D095_CLAUDE_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-claude-d095-boundaries.json';
export const D094_CLAUDE_MANIFEST='benchmarks/e2e-swe/manifests/pointsman-claude-d094-provisional.json';
export function resolveCodexE2EProfile({model='gpt-6.1-sol',effort='high'}={}){
  if(model!=='gpt-6.1-sol'||effort!=='high')fail('CODEX_E2E_PROFILE_CHANGED');
  return {model,effort};
}
const hash=x=>createHash('sha256').update(x).digest('hex');
const read=path=>JSON.parse(readFileSync(path));
const fail=code=>{throw Object.assign(new Error(code),{code});};
const safeCode=e=>/^[A-Z][A-Z0-9_]+$/.test(e?.code)?e.code:'CODEX_E2E_FAILED';
const files=dir=>readdirSync(dir).sort().flatMap(name=>{const path=join(dir,name),s=lstatSync(path);
  if(s.isSymbolicLink())fail('CODEX_E2E_SOURCE_SYMLINK');return s.isDirectory()?files(path):s.isFile()?[path]:[];});
const SOURCES=['src/benchmark/codex-e2e-runner.mjs','src/benchmark/codex-e2e-decisions.mjs','src/benchmark/codex-artifact-worker.mjs',
  'src/benchmark/codex-e2e-checks.mjs','src/benchmark/codex-provider.mjs','src/benchmark/codex-decision-benchmark.mjs','bin/codex-e2e.mjs'];

export function loadCodexE2EInputs({rootDir=ROOT,manifestPath=CODEX_E2E_MANIFEST}={}) {
  if(![CODEX_E2E_MANIFEST,CODEX_E2E_ADAPTIVE_MANIFEST,CODEX_E2E_CALIBRATED_MANIFEST,D093_CODEX_MANIFEST,D093_CLAUDE_MANIFEST,D093_CLAUDE_RECOVERY_MANIFEST,D093_CLAUDE_CLASSIFIER_MANIFEST,D094_CLAUDE_MANIFEST,D095_CLAUDE_MANIFEST,D095_RUNTIME_MANIFEST].includes(manifestPath))fail('CODEX_E2E_MANIFEST_NOT_REGISTERED');
  const manifest=read(join(rootDir,manifestPath));
  const binding=validatePointsmanManifest(manifest,{rootDir});
  const input=loadAdaptivePublicInput(rootDir,manifest);
  const prepared=loadAdaptiveSharedPreparation({rootDir,manifest,input,preparationDirectory:join(rootDir,manifest.catalog_reuse.preparation_directory)});
  validateAdaptiveCatalog({...input,catalog:prepared.catalog,limits:manifest.limits});
  const registry=loadPublicAuditInputs(rootDir,{registryPath:manifest.public_registry,runnerPath:manifest.public_runner}).registry;
  const checks=buildAdaptiveChecks({catalog:prepared.catalog,registry,manifest,source_ref:input.source_ref});
  const testRequirements=loadAdaptiveTestRequirements(rootDir,manifest);
  return {manifest,manifestPath,binding,input,prepared,registry,checks,testRequirements};
}

const createE2EEnvironment = options => createAppBundledCodexEnvironment({...resolveCodexE2EProfile(options),
  ...(options?.manifestPath===CODEX_E2E_CALIBRATED_MANIFEST
    ?{allowedProfileCandidates:codexWorkerProfileCandidates({pricingContract:codexPricingContract({version:'v2'})})}
    :{allowedProfiles:codexWorkerProfilePolicy().profiles.map(({model,effort})=>({model,effort}))})});

export async function createD093Environment({workerFamily='codex',rootDir=ROOT}={}){
  if(workerFamily==='codex')return createAppBundledCodexEnvironment({model:'gpt-6.1-sol',effort:'high',
    allowedProfileCandidates:workerProfileCandidates({workerFamily,pricingContract:codexPricingContract({version:'v2'})})});
  if(workerFamily!=='claude')fail('D093_WORKER_FAMILY_INVALID');
  const binary=read(join(rootDir,'docs/orchestration/contracts/claude-app-binary.v1.json'));
  return createFrozenClaudeEnvironment({binary:binary.path,expectedSha256:binary.sha256,expectedVersion:binary.version,
    authEvidence:read(join(rootDir,'benchmark-runs/d093-full-provider-20261017-01/claude-cli-preflight.json')),
    allowedProfiles:workerProfileCandidates({workerFamily,pricingContract:claudePricingContract()}).filter(row=>
      read(join(rootDir,'benchmark-runs/d093-full-provider-20261017-01/claude-account-models.json')).available_models.includes(row.model))});
}

export async function planCodexE2E({loaded,profileId,decide,record,save}) {
  const {input,prepared,checks,manifest}=loaded;
  const planning=await planLayeredDag({...input,catalog:prepared.catalog,checks,profile_id:profileId,
    goal_revision:input.source_ref.sha256,limits:manifest.limits,max_concurrency:manifest.limits.max_concurrency,
    contractPath:LAYERED_CONTRACTS.v2,decide,record});
  if(planning.status!=='planned')return planning;
  const scheduled=applyWorkloadEstimates(planning.plan,loadScheduleContract(manifest.schedule_policy.contract));
  const result={...planning,plan:scheduled.plan,schedule:{policy:'critical-path-v1',priority_order:scheduled.priority_order,
    critical_path_ms:scheduled.critical_path_ms,basis:'estimate'},dispatch_allowed:true,durable_commit_callback:true};
  save('plan-commit.json',result); // No task dispatch before durable commit.
  await record({event:'codex_e2e_plan_committed',workers:result.plan.workers.length,probability_policy:'choice_only_both_arms'});
  return result;
}

export function createCodexE2EWorkerExecutor({profileRouter=null,cliEnvironment,context,input,catalog,manifest,model,effort,signal,runCodex,workerReceipts,workerFactory=createCodexArtifactWorker,workerProvider='codex'}) {
  return async(task,worker)=>{
      const selection=profileRouter?await profileRouter.select(task,worker):null;
      if(selection?.status==='blocked')throw Object.assign(new Error(selection.code),selection);
      const executionProfile=selection?{model:selection.model,effort:selection.effort}:{model,effort};
      const verified=selection?profileRouter.assertExecution(selection,{...executionProfile,task,context:worker}):null;
      if(selection){await cliEnvironment.verify(executionProfile);await context.record({event:'codex_worker_profile_dispatch_verified',...verified});}
      return workerFactory({directory:context.directory,input,catalog,manifest,...executionProfile,
        spend:true,signal,runCodex,record:context.record,onReceipt:async r=>{
          workerReceipts.push({...r.provider,id:r.id,purpose:'worker',worker_status:r.status,worker_receipt:r,provider:workerProvider,
            ...(selection?{worker_profile_selection:{id:selection.id,sha256:selection.sha256,audit_directory:selection.audit_directory}}:{})});
          if(selection){
            const binding={schema_version:'codex-worker-profile-execution/v1',...verified,
              selection_directory:selection.audit_directory,task_id:task.id,operation:worker.operation,round_index:worker.round_index,
              worker_id:r.id,worker_receipt:`codex-workers/${r.id}/receipt.json`,provider_receipt:r.provider_receipt,
              status:r.status,profile_id:selection.profile_id,requested_model:r.requested_model,requested_effort:r.requested_effort};
            context.save(`${selection.audit_directory}/execution.json`,binding);
            await context.record({event:'codex_worker_profile_execution_bound',...binding});
          }
        }})(task,worker);
    };
}

export async function inspectCodexE2E({rootDir=ROOT,probe=false,runCommand,signal,manifestPath=CODEX_E2E_MANIFEST}={}) {
  const loaded=loadCodexE2EInputs({rootDir,manifestPath});
  let cliEnvironment;
  try{
  if(probe)cliEnvironment=[D093_CODEX_MANIFEST,D093_CLAUDE_MANIFEST,D093_CLAUDE_RECOVERY_MANIFEST,D093_CLAUDE_CLASSIFIER_MANIFEST,D094_CLAUDE_MANIFEST,D095_CLAUDE_MANIFEST,D095_RUNTIME_MANIFEST].includes(manifestPath)
    ?await createD093Environment({workerFamily:loaded.manifest.codex_execution.worker_family,rootDir})
    :await createE2EEnvironment({manifestPath});
  const checks=await inspectCodexE2EChecks({rootDir,manifest:loaded.manifest,probe,runCommand,signal,cliEnvironment});
  return {schema_version:'codex-e2e-preflight/v1',scope:probe?'environment_probe_no_inference':'offline_source_validation',
    provider_calls:0,catalog_sha256:loaded.prepared.result.catalog_file_sha256,requirements:Object.keys(loaded.testRequirements).length,
    registry_sha256:loaded.binding.sha256,...checks,...(cliEnvironment?{cli_environment:cliEnvironment.evidence}: {})};
  }finally{cliEnvironment?.close();}
}

function contextFor(directory,signal) {
  mkdirSync(directory,{mode:0o700});
  for(const name of ['calls','receipts','gateway','public-workspaces'])mkdirSync(join(directory,name),{mode:0o700});
  const fd=openSync(join(directory,'events.jsonl'),'wx',0o600),started=performance.now();
  return {directory,signal,run_id:`codex-e2e-${randomUUID()}`,started_at:new Date().toISOString(),
    elapsed:()=>performance.now()-started,
    remaining:()=>{if(signal?.aborted)fail('CODEX_E2E_CANCELLED');return 14_400_000;}, // Per-call ceiling, not an overall deadline.
    save:(name,value)=>{
      const target=resolve(directory,name);
      if(!target.startsWith(resolve(directory)+'/'))fail('CODEX_E2E_EVIDENCE_PATH_INVALID');
      mkdirSync(dirname(target),{recursive:true,mode:0o700});writePrivateJson(target,value);
    },
    record:async event=>{const b=Buffer.from(JSON.stringify({recorded_at:new Date().toISOString(),elapsed_ms:performance.now()-started,...event})+'\n');
      let i=0;while(i<b.length){const n=writeSync(fd,b,i,b.length-i);if(n<=0)fail('CODEX_E2E_RECORD_FAILED');i+=n;}fsyncSync(fd);},
    close:()=>closeSync(fd)};
}

export function validateCodexE2EHost(executionHost='cloud',platform=process.platform) {
  if(!['cloud','mac'].includes(executionHost))fail('CODEX_E2E_HOST_INVALID');
  if(executionHost==='mac'&&platform!=='darwin')fail('CODEX_E2E_MAC_HOST_REQUIRED');
  if(executionHost==='cloud'&&platform==='darwin')fail('POINTSMAN_CLOUD_RUN_REQUIRED');
  return {requested:executionHost,platform,authorization:executionHost==='mac'?'explicit-user-mac-exception-20261014':'existing-cloud-policy'};
}

/** Fresh arm only. Shared pair environment is borrowed; standalone owns cleanup. */
export async function runCodexE2EArm(options) {
  if(!options.spend)fail('EXPLICIT_SPEND_REQUIRED');
  validateCodexE2EHost(options.executionHost);
  options={...options,...resolveCodexE2EProfile(options)};
  if(options.cliEnvironment)return executeCodexE2EArm(options);
  loadCodexE2EInputs({rootDir:options.rootDir??ROOT,manifestPath:options.manifestPath});
  const started=performance.now();
  const cliEnvironment=await createE2EEnvironment(options);
  const setupWall=performance.now()-started;
  try {
    const result=await executeCodexE2EArm({...options,cliEnvironment});
    result.cli_environment_setup_wall_ms=setupWall;
    result.wall_ms+=setupWall;
    if(result.completion_wall_ms!==null)result.completion_wall_ms+=setupWall;
    writePrivateJson(join(resolve(options.out),'result.json'),result);return result;
  } finally {
    const cleanup=cliEnvironment.close();
    if(existsSync(resolve(options.out)))writePrivateJson(join(resolve(options.out),'cli-environment-cleanup.json'),cleanup);
  }
}

/** D093 native or Jev decisions with the same within-family worker catalog. */
export async function runProviderE2EArm(options){
  if(!options.spend)fail('EXPLICIT_SPEND_REQUIRED');
  validateCodexE2EHost(options.executionHost);
  if(![D093_CODEX_MANIFEST,D093_CLAUDE_MANIFEST,D093_CLAUDE_RECOVERY_MANIFEST,D093_CLAUDE_CLASSIFIER_MANIFEST,D094_CLAUDE_MANIFEST,D095_CLAUDE_MANIFEST,D095_RUNTIME_MANIFEST].includes(options.manifestPath))fail('D093_MANIFEST_REQUIRED');
  const loaded=loadCodexE2EInputs({rootDir:options.rootDir??ROOT,manifestPath:options.manifestPath});
  const family=loaded.manifest.codex_execution.worker_family;
  const profile={model:loaded.manifest.codex_execution.model,effort:loaded.manifest.codex_execution.effort};
  if(options.cliEnvironment)return executeCodexE2EArm({...options,...profile});
  const started=performance.now(),cliEnvironment=await createD093Environment({rootDir:options.rootDir??ROOT,workerFamily:family});
  const setup=performance.now()-started;
  try{
    const result=await executeCodexE2EArm({...options,...profile,cliEnvironment});
    result.cli_environment_setup_wall_ms=setup;result.wall_ms+=setup;
    if(result.completion_wall_ms!==null)result.completion_wall_ms+=setup;
    writePrivateJson(join(resolve(options.out),'standalone-result.json'),result);return result;
  }finally{cliEnvironment.close();}
}

async function executeCodexE2EArm({rootDir=ROOT,out,provider,model='gpt-6.1-sol',effort='high',spend=false,signal,
  executionHost='cloud',cliEnvironment,manifestPath=CODEX_E2E_MANIFEST,
  gradeManifest='benchmarks/e2e-swe/manifests/openapi_python_client.cloud-4cpu.json'}) {
  if(!spend)fail('EXPLICIT_SPEND_REQUIRED');
  const execution_host=validateCodexE2EHost(executionHost);
  if(!['codex','jev','claude'].includes(provider))fail('CODEX_E2E_PROVIDER_INVALID');
  codexArguments({cwd:rootDir,schemaPath:'schema.json',answerPath:'answer.json',model,effort,role:'decision'});
  const loaded=loadCodexE2EInputs({rootDir,manifestPath}),{manifest,input,prepared,registry,testRequirements}=loaded;
  const provisionalModels=manifest.codex_execution.worker_routing==='joint-model-effort-cold-start-v4';
  const jointModels=provisionalModels||manifest.codex_execution.worker_routing==='joint-model-effort-history-v3';
  const workerFamily=manifest.codex_execution.worker_family??'codex';
  const calibratedModels=jointModels||manifest.codex_execution.worker_routing==='jev-model-effort-history-v2';
  const adaptiveModels=calibratedModels||manifest.codex_execution.worker_routing==='jev-model-size-v1';
  const history=calibratedModels?loadCodexWorkerHistory({rootDir}):null;
  if(adaptiveModels&&!jointModels&&provider!=='jev')fail('CODEX_E2E_ADAPTIVE_JEV_REQUIRED');
  if(jointModels&&provider!=='jev'&&provider!==workerFamily)fail('D093_NATIVE_JUDGE_FAMILY_MISMATCH');
  const workerReceipts=[];
  let decision,planning,execution,grade,environment=null,stopCode=null,outcomeUncertain=false;
  const gradeConfig=read(resolve(rootDir,gradeManifest));
  const sourcePaths=[...new Set([...SOURCES,...loaded.binding.policy.source_pins.map(p=>p.path),
    ...files(join(rootDir,manifest.public_checker_root)).map(p=>relative(rootDir,p)),manifest.image_lock,
    gradeManifest,'benchmarks/e2e-swe/adapter.py',...Object.keys(gradeConfig.upstream_sha256??{}).map(p=>`.benchmarks/E2E-SWE/${p}`),
    manifestPath,manifest.skill_gateway.contract])].sort();
  const pins=sourcePaths.map(path=>({path,sha256:hash(readFileSync(join(rootDir,path)))}));
  const context=contextFor(resolve(out),signal);
  const protocol={schema_version:'codex-e2e-protocol/v1',provider,execution_host,cli_environment:cliEnvironment.evidence,
    worker:calibratedModels?{routing:manifest.codex_execution.worker_routing,worker_family:workerFamily,model:'selected_per_task',effort:'selected_per_task',fallback_profile:null,transport:'structured-artifact-output-v1'}:{model,effort,transport:'structured-artifact-output-v1'},
    source_pins:pins,source_sha256:hash(JSON.stringify(pins)),catalog_sha256:prepared.result.catalog_file_sha256,
    probability_policy:'choice_only_both_arms_raw_probabilities_preserved',spec_review:false,model_selection:adaptiveModels,
    worker_routing:manifest.codex_execution.worker_routing,manifest_path:manifestPath,
    reference_pricing_policy:workerFamily==='claude'?'claude-v1':'codex-v2',
    new_catalog_calls:0,historical_catalog_cost_included:false,automatic_retries:0,overall_timeout_ms:null,grade_manifest:gradeManifest,
    worker_concurrency:manifest.limits.max_concurrency,max_workers:manifest.limits.maximum_workers,max_repair_rounds:manifest.max_repair_rounds,
    ...(history?{public_outcome_history:{binding:history.source,snapshot:history.snapshot_source,source_results_only:true,independent_results_used:false}}:{})};
  try {
    await cliEnvironment.verify();
    context.save('protocol.json',protocol);context.save('catalog.json',prepared.catalog);context.save('public-input.json',input);
    const preflight=await inspectCodexE2EChecks({rootDir,manifest,probe:true,signal,record:context.record,evidenceDirectory:join(context.directory,'environment-probe'),cliEnvironment});
    context.save('preflight.json',preflight);if(!preflight.live_ready)fail('CODEX_E2E_PREFLIGHT_BLOCKED');
    environment={platform:process.platform,architecture:process.arch,node:process.version,cpu_models:[...new Set(cpus().map(c=>c.model))],
      codex_cli_version:preflight.auth.version,checker_image_id:preflight.environment.image_id,
      python:preflight.environment.python,dependencies:preflight.environment.modules,cli_environment_fingerprint:cliEnvironment.evidence.fingerprint};
    context.save('runtime-environment.json',environment);
    const nativeAttempt=workerFamily==='claude'?runClaudeAttempt:runCodexAttempt;
    const runCodex=options=>nativeAttempt({...options,cliEnvironment,referencePricing:workerFamily==='claude'?true:'v2',beforeDispatch:async()=>{
      await cliEnvironment.verify({cwd:options.cwd,model:options.model,effort:options.effort});
      await options.beforeDispatch?.();
    }});
    decision=createCodexE2EDecisions({provider,rootDir,manifest,context,model,effort,runCodex,workerEnvironmentEvidence:cliEnvironment.evidence});
    planning=await planCodexE2E({loaded,profileId:`codex-${model}-${effort}`,decide:decision.decide,record:context.record,save:context.save});
    context.save('planning.json',planning);
    if(planning.status!=='planned'||!planning.dispatch_allowed)fail(planning.reason??'CODEX_E2E_PLAN_BLOCKED');
    // Profile decisions share the guarded Jev session and are serialized before dispatch;
    // implementation remains concurrent under the unchanged scheduler limit.
    let profileQueue=Promise.resolve();
    if(history)context.save('worker-outcome-history.json',history.snapshot);
    const profileRouter=adaptiveModels?(provisionalModels?createWorkerProfileRouterV4:jointModels?createWorkerProfileRouter:calibratedModels?createCodexWorkerProfileRouterV2:createCodexWorkerProfileRouter)({planning,environmentEvidence:cliEnvironment.evidence,
      pricingContract:workerFamily==='claude'?claudePricingContract():codexPricingContract({version:'v2'}),workerFamily,record:context.record,save:context.save,
      ...(history?{empiricalEvidence:history.snapshot,expectedEmpiricalSha256:history.binding.snapshot_sha256}:{}),
      decide:(request,metadata)=>{const call=profileQueue.then(()=>decision.decide(request,metadata));profileQueue=call.catch(()=>{});return call;}}):null;
    const executeTask=createCodexE2EWorkerExecutor({profileRouter,cliEnvironment,context,input,catalog:prepared.catalog,manifest,model,effort,signal,runCodex,workerReceipts,workerProvider:workerFamily});
    const callbacks=createCodexE2EChecks({rootDir,manifest,context,registry,preflightEnvironment:preflight.environment});
    const sourceText=readFileSync(join(rootDir,manifest.repair_policy.assertion_contract),'utf8');
    const owner=loadOwnerCriteriaContract(manifest.question_forms.owner_criteria.contract);
    let ownerProjectionCount=0;
    const decideRepairOwners=async(request,metadata)=>{
      const original=describeOwnerCriteria(request,owner);
      if(manifest.repair_efficiency.owner_input_projection!=='lossless-owner-v1')return decision.decide(original,metadata);
      const projected=projectOwnerPayload(original,{policy:'lossless-owner-v1'});
      const path=`owner-payload-projection/owner-${String(++ownerProjectionCount).padStart(4,'0')}`;
      context.save(`${path}.original.json`,original);context.save(`${path}.request.json`,projected.request);context.save(`${path}.report.json`,projected.report);
      await context.record({event:'codex_e2e_owner_payload_projected',path,...projected.report});
      return decision.decide(projected.request,{...metadata,owner_payload_projection:projected.report});
    };
    execution=await runAdaptiveDagExecution({plan:planning.plan,planning,artifactBindings:planning.artifactBindings,
      run_id:context.run_id,runDirectory:context.directory,checkerRoot:rootDir,
      checkerFiles:[join(rootDir,'src/benchmark/adaptive-dag-runner.mjs'),join(rootDir,'src/orchestration/adaptive-dag-execution.mjs'),
        ...files(join(rootDir,manifest.public_checker_root))],environment:{id:manifest.public_environment_ref},
      executeTask,...callbacks,testRequirements,maxRepairRounds:manifest.max_repair_rounds,record:context.record,
      publicCheckConcurrency:manifest.runtime_speed.public_check_concurrency,repairScopePolicy:'public-inferred-owner-v3',
      partialRepairPolicy:'local-readiness-v1',publicOwnerEvidencePolicy:'public-source-v1',
      repairDispatchPolicy:manifest.repair_efficiency?.dispatch_policy,
      artifactRepairPolicy:'inferred-v3',projectRepairFailure:projectAdaptiveRepairFailure,
      assertionContract:{contract:JSON.parse(sourceText),source_text:sourceText,sha256:hash(sourceText),source_path:manifest.repair_policy.assertion_contract},
      repairBudget:{policy:manifest.repair_budget.policy},repairFeedback:{...manifest.repair_feedback},
      decideRepairOwners,
      decideRepair:input=>selectPublicOwnerEvidenceScope(input)??selectInferredOwnerScope(input)});
    context.save('execution.json',execution);
    outcomeUncertain=execution.outcome_uncertain===true||execution.status==='uncertain';
    if(execution.status!=='completed')stopCode=execution.stop_code??execution.code??'CODEX_E2E_PUBLIC_INCOMPLETE';
    if(execution.candidate_path&&!outcomeUncertain&&execution.status!=='blocked') {
      grade=await gradeCodexE2ECandidate({rootDir,runDirectory:context.directory,candidateDirectory:execution.candidate_path,
        publicPassed:execution.status==='completed',developmentWallMs:context.elapsed(),gradeManifest,signal});
      context.save('grade-summary.json',grade);
      outcomeUncertain||=grade.outcome_uncertain===true;
      if(!grade.product_success)stopCode??='CODEX_E2E_INDEPENDENT_INCOMPLETE';
    }
  } catch(error) {
    stopCode=safeCode(error);outcomeUncertain||=error.outcome_uncertain===true||signal?.aborted===true;
    context.save('failure.json',{code:stopCode,outcome_uncertain:outcomeUncertain,replay_allowed:false});
  }
  try {await cliEnvironment.verify();}catch(error){stopCode=safeCode(error);}
  const changed=pins.filter(p=>{try{return hash(readFileSync(join(rootDir,p.path)))!==p.sha256;}catch{return true;}});
  if(changed.length)stopCode='CODEX_E2E_SOURCE_DRIFT';
  const receipts=[...(decision?.receipts()??[]),...workerReceipts];
  outcomeUncertain||=receipts.some(r=>r.status==='uncertain'||r.outcome_uncertain===true);
  const result={schema_version:'codex-e2e-arm/v1',provider,run_id:context.run_id,started_at:context.started_at,finished_at:new Date().toISOString(),
    status:outcomeUncertain?'uncertain':execution?.status==='blocked'?'blocked':stopCode?'failed':'completed',stop_code:stopCode,outcome_uncertain:outcomeUncertain,
    source_sha256:protocol.source_sha256,catalog_sha256:protocol.catalog_sha256,worker:protocol.worker,
    environment,environment_sha256:environment?hash(JSON.stringify(environment)):null,
    probability_policy:protocol.probability_policy,model_selection:adaptiveModels,worker_routing:protocol.worker_routing,
    source_changes:changed,wall_ms:context.elapsed(),
    completion_wall_ms:!outcomeUncertain&&!stopCode&&grade?.product_success?grade.completion_wall_ms:null,
    product_success:!outcomeUncertain&&!stopCode&&grade?.product_success===true,
    public_status:execution?.status==='completed'?'passed':'not_passed',candidate_path:execution?.candidate_path??null,
    grade:grade??null,planning_stats:planning?.stats??null,
    planning_stats_basis:'Legacy planner counters include scripted callbacks; actual external calls are decision_callbacks and per-attempt receipts.',
    operations:execution?.operations??null,repair_rounds:execution?.repair_rounds_used??null,
    decision_callbacks:decision?.count()??0,usage:summarizeCodexE2EUsage(receipts),receipts,automatic_retries:0,replay_allowed:false};
  try {context.save('result.json',result);await context.record({event:'codex_e2e_terminal',status:result.status});}
  finally {context.close();}
  return result;
}

export async function withCodexE2ELock(rootDir,callback) {
  const lock=join(rootDir,'benchmark-runs/codex-e2e-active.lock');
  try {mkdirSync(lock,{mode:0o700});}catch(error){if(error.code==='EEXIST')fail('CODEX_E2E_ACTIVE_OR_UNRECONCILED');throw error;}
  try {writePrivateJson(join(lock,'owner.json'),{pid:process.pid,started_at:new Date().toISOString()});return await callback();}
  finally {rmSync(lock,{recursive:true});}
}

export function compareCodexE2E(left,right) {
  const a=read(join(left,'result.json')),b=read(join(right,'result.json'));
  for(const [directory,result] of [[left,a],[right,b]]) {
    const protocol=read(join(directory,'protocol.json'));
    if(!Array.isArray(protocol.source_pins)||hash(JSON.stringify(protocol.source_pins))!==result.source_sha256
      ||protocol.source_sha256!==result.source_sha256||protocol.catalog_sha256!==result.catalog_sha256
      ||protocol.provider!==result.provider||JSON.stringify(protocol.worker)!==JSON.stringify(result.worker)
      ||protocol.probability_policy!==result.probability_policy
      ||(protocol.cli_environment&&protocol.cli_environment.fingerprint!==result.environment?.cli_environment_fingerprint))fail('CODEX_E2E_PAIR_EVIDENCE_INVALID');
  }
  if(new Set([a.provider,b.provider]).size!==2||![a.provider,b.provider].every(p=>['codex','jev'].includes(p))
    ||a.source_sha256!==b.source_sha256||a.catalog_sha256!==b.catalog_sha256
    ||JSON.stringify(a.worker)!==JSON.stringify(b.worker)||a.probability_policy!==b.probability_policy
    ||a.environment_sha256!==b.environment_sha256
    ||(a.grade&&b.grade&&(a.grade.grade_manifest_sha256!==b.grade.grade_manifest_sha256
      ||a.grade.image_lock_sha256!==b.grade.image_lock_sha256)))fail('CODEX_E2E_PAIR_MISMATCH');
  const complete=r=>r.product_success===true&&r.status==='completed'&&r.outcome_uncertain===false&&Boolean(r.environment_sha256)
    &&r.public_status==='passed'&&r.source_changes?.length===0&&r.grade?.product_success===true
    &&r.grade.independent_evidence_valid===true&&r.grade.candidate_unchanged===true&&r.grade.grade_sources_unchanged===true
    &&r.grade.summary?.tests===63&&r.grade.summary.passed===63&&Number.isFinite(r.completion_wall_ms)&&r.completion_wall_ms>0;
  const codex=a.provider==='codex'?a:b,jev=a.provider==='jev'?a:b,both=complete(codex)&&complete(jev);
  const ratio=(x,y)=>both&&Number.isFinite(x)&&Number.isFinite(y)&&y>0?x/y:null;
  return {schema_version:'codex-e2e-pair/v1',pairs:1,codex,jev,both_completed:Boolean(both),
    completed_speed_ratio:ratio(codex.completion_wall_ms,jev.completion_wall_ms),
    token_ratio:ratio(codex.usage.total.total_tokens,jev.usage.total.total_tokens),
    api_equivalent_ratio:ratio(codex.usage.total.api_equivalent_usd,jev.usage.total.api_equivalent_usd),
    limitation:'One pair does not establish a stable speedup. Incomplete runs remain reported; no success ratio from failure wall times.'};
}

/** One sequential pair; failed/uncertain attempts are retained, never retried. */
export async function runCodexE2EPair({rootDir=ROOT,out,...options}) {
  if(!options.spend)fail('EXPLICIT_SPEND_REQUIRED');
  validateCodexE2EHost(options.executionHost);
  options={...options,...resolveCodexE2EProfile(options)};
  loadCodexE2EInputs({rootDir,manifestPath:options.manifestPath});
  if(options.manifestPath===CODEX_E2E_ADAPTIVE_MANIFEST)fail('CODEX_E2E_ADAPTIVE_PAIR_NOT_MATCHED');
  const directory=resolve(out);mkdirSync(directory,{mode:0o700});
  const began=performance.now();let cliEnvironment;
  try {
    cliEnvironment=await createE2EEnvironment(options);
    const setupWall=performance.now()-began,results=[];
    writePrivateJson(join(directory,'pair-protocol.json'),{schema_version:'codex-e2e-pair-protocol/v1',order:['codex','jev'],
      cli_environment:cliEnvironment.evidence,cli_environment_setup_wall_ms:setupWall,
      repetitions_per_condition:1,maximum_repetitions_policy:3,automatic_retries:0,wall_timeout_ms:null});
    for(const provider of ['codex','jev']) {
      const result=await runCodexE2EArm({...options,rootDir,out:join(directory,provider),provider,cliEnvironment});results.push(result);
      const codexUnavailable=result.receipts.some(r=>r.provider==='codex'
        &&['CODEX_PROCESS_START_FAILED','CODEX_PROVIDER_FAILED','CODEX_MODEL_MISMATCH'].includes(r.code));
      if(result.outcome_uncertain||codexUnavailable||options.signal?.aborted||result.stop_code?.startsWith('CODEX_ENV_')
        ||['CODEX_E2E_PREFLIGHT_BLOCKED','CODEX_E2E_SOURCE_DRIFT'].includes(result.stop_code))break;
    }
    let comparison=null,comparisonError=null;
    if(results.length===2)try{comparison=compareCodexE2E(join(directory,'codex'),join(directory,'jev'));}catch(error){comparisonError=safeCode(error);}
    const result={status:results.some(r=>r.outcome_uncertain)?'uncertain':results.length<2?'stopped':comparison?.both_completed?'completed':'failed',
      wall_ms:performance.now()-began,cli_environment_setup_wall_ms:setupWall,
      results,comparison,comparison_error:comparisonError,automatic_retries:0,actual_repetitions_per_condition:Object.fromEntries(['codex','jev'].map(p=>[p,results.filter(r=>r.provider===p).length]))};
    writePrivateJson(join(directory,'result.json'),result);return result;
  } catch(error) {
    writePrivateJson(join(directory,'pair-failure.json'),{code:safeCode(error),automatic_retries:0});throw error;
  } finally {
    if(cliEnvironment)writePrivateJson(join(directory,'cli-environment-cleanup.json'),cliEnvironment.close());
  }
}

/** Three fresh sequential conditions, one shared frozen environment. The third
 * condition changes worker model selection and is not a matched-worker pair. */
export async function runCodexE2ECohort({rootDir=ROOT,out,...options}) {
  if(!options.spend)fail('EXPLICIT_SPEND_REQUIRED');
  validateCodexE2EHost(options.executionHost);
  options={...options,...resolveCodexE2EProfile(options)};
  for(const manifestPath of [CODEX_E2E_MANIFEST,CODEX_E2E_ADAPTIVE_MANIFEST])loadCodexE2EInputs({rootDir,manifestPath});
  const directory=resolve(out);mkdirSync(directory,{mode:0o700});
  const fixed=join(directory,'pair-fixed');mkdirSync(fixed,{mode:0o700});
  const began=performance.now(),results=[];let cliEnvironment;
  const conditions=[{id:'codex_fixed',provider:'codex',out:join(fixed,'codex'),manifestPath:CODEX_E2E_MANIFEST},
    {id:'jev_fixed',provider:'jev',out:join(fixed,'jev'),manifestPath:CODEX_E2E_MANIFEST},
    {id:'jev_model_routing',provider:'jev',out:join(directory,'jev-model-routing'),manifestPath:CODEX_E2E_ADAPTIVE_MANIFEST}];
  try {
    cliEnvironment=await createE2EEnvironment(options);
    const setupWall=performance.now()-began;
    const protocol={schema_version:'codex-e2e-cohort-protocol/v1',conditions:conditions.map(({id,provider,out,manifestPath})=>({id,provider,directory:relative(directory,out),manifestPath})),
      cli_environment:cliEnvironment.evidence,cli_environment_setup_wall_ms:setupWall,repetitions_per_condition:1,
      model:options.model,effort:options.effort,automatic_retries:0,wall_timeout_ms:null,
      comparison_boundary:'First two conditions match worker profile. Third adds Jev-selected worker capability profiles, high effort fixed.'};
    writePrivateJson(join(directory,'cohort-protocol.json'),protocol);
    for(const condition of conditions){
      const result=await runCodexE2EArm({...options,rootDir,...condition,cliEnvironment});
      results.push({id:condition.id,...result});
      const unavailable=result.receipts.some(r=>r.provider==='codex'&&['CODEX_PROCESS_START_FAILED','CODEX_PROVIDER_FAILED','CODEX_MODEL_MISMATCH'].includes(r.code));
      if(result.outcome_uncertain||unavailable||options.signal?.aborted||result.stop_code?.startsWith('CODEX_ENV_')
        ||result.stop_code?.startsWith('CODEX_APP_')||['CODEX_E2E_PREFLIGHT_BLOCKED','CODEX_E2E_SOURCE_DRIFT'].includes(result.stop_code))break;
    }
    let comparison=null,comparisonError=null;
    if(results.length>=2)try{comparison=compareCodexE2E(conditions[0].out,conditions[1].out);}catch(error){comparisonError=safeCode(error);}
    writePrivateJson(join(fixed,'result.json'),{schema_version:'codex-e2e-cohort-fixed-pair/v1',results:results.slice(0,2),comparison,comparison_error:comparisonError,
      cli_environment_borrowed:true,cli_environment_cleanup:'../cli-environment-cleanup.json',automatic_retries:0});
    const result={schema_version:'codex-e2e-cohort/v1',status:results.some(r=>r.outcome_uncertain)?'uncertain':results.length<3?'stopped':results.every(r=>r.product_success)?'completed':'failed',
      wall_ms:performance.now()-began,cli_environment_setup_wall_ms:setupWall,conditions:results.length,
      completed_conditions:results.filter(r=>r.product_success).length,results,comparison,comparison_error:comparisonError,
      usage:summarizeCodexE2EUsage(results.flatMap(r=>r.receipts)),automatic_retries:0,replay_allowed:false};
    writePrivateJson(join(directory,'result.json'),result);return result;
  }catch(error){writePrivateJson(join(directory,'cohort-failure.json'),{code:safeCode(error),automatic_retries:0,replay_allowed:false});throw error;}
  finally{if(cliEnvironment)writePrivateJson(join(directory,'cli-environment-cleanup.json'),cliEnvironment.close());}
}
