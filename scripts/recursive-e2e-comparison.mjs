#!/usr/bin/env node
import {readFileSync,writeFileSync,appendFileSync,mkdirSync,mkdtempSync,existsSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {resolve,join,relative,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {processResult} from '../src/benchmark/docker.mjs';
import {providerOutcome} from '../src/benchmark/runner.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';
import {readTokenBudgetSnapshot} from '../src/benchmark/budget.mjs';
import {loadPlanningManifest,runPlanningPilot} from '../src/benchmark/recursive-planning-runner.mjs';
import {runRecursivePlanning} from '../src/orchestration/recursive-task-tests.mjs';
import {executionEnvelope,executeTaskEnvelope} from '../src/orchestration/recursive-execution.mjs';
import {preflightVerifier,verifyArtifacts} from '../src/orchestration/artifact-verifier.mjs';
import {runPublicSmoke} from '../src/orchestration/public-smoke.mjs';

const ROOT=resolve(import.meta.dirname,'..');
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const MODEL='claude-opus-5-5', EFFORT='medium';
const PYTHON='/opt/homebrew/bin/python3.14';
const MANIFEST='benchmarks/e2e-swe/manifests/d057-planning.json';
const IMAGE='benchmark-runs/d040-openapi-image-lock.json';
const safeCode=e=>/^[A-Z0-9_]+$/.test(e?.code??e?.message??'')?e.code??e.message:'E2E_RUN_FAILED';
const fail=code=>{throw Object.assign(Error(code),{code});};
const PRIVATE={mode:0o600,flag:'wx'};

export function summarizeUsage(receipts) {
  const totals={input_tokens:0,cache_creation_input_tokens:0,cache_read_input_tokens:0,output_tokens:0};
  let complete=true,usd=0,known=0;
  for(const r of receipts) {
    if(r.status!=='completed'||!r.usage) complete=false;
    for(const k of Object.keys(totals)) {
      if(Number.isSafeInteger(r.usage?.[k]))totals[k]+=r.usage[k];
      else if(k==='input_tokens'||k==='output_tokens')complete=false;
    }
    if(typeof r.api_equivalent_usd==='number'){usd+=r.api_equivalent_usd;known++;}else complete=false;
  }
  return {calls:receipts.length,known_token_subtotals:totals,tokens_complete:complete,
    api_equivalent_known_subtotal_usd:usd,api_equivalent_usd:complete&&known===receipts.length?usd:null,actual_billed_usd:null};
}

export function candidateSnapshot(candidate) {
  const files=[];
  const walk=dir=>{
    for(const name of readdirSync(dir).sort()) {
      const path=join(dir,name),st=lstatSync(path);
      if(st.isSymbolicLink())fail('UNSAFE_CANDIDATE');
      if(st.isDirectory())walk(path);
      else if(st.isFile()&&st.nlink===1)files.push({path:relative(candidate,path),bytes:st.size,sha256:hash(readFileSync(path))});
      else fail('UNSAFE_CANDIDATE');
    }
  };walk(candidate);return files;
}

// Only published allowlisted paths are observed while sibling workers may write.
export function publishedSnapshot(candidate,paths) {
  return paths.flatMap(path=>{
    const full=join(candidate,path);
    try {
      const st=lstatSync(full);
      if(!st.isFile()||st.isSymbolicLink()||st.nlink!==1)fail('UNSAFE_CANDIDATE');
      const bytes=readFileSync(full);return [{path,bytes:bytes.length,sha256:hash(bytes)}];
    } catch(e) {if(e.code==='ENOENT')return [];throw e;}
  });
}

export function isIndependentCompletion({grade,process:result,image,upstreamCommit,workspace}) {
  return result?.exit_code===0 && !result.outcome_uncertain &&
    grade?.grading_status==='completed' && grade.resolved===true && grade.reward===1 &&
    grade.expected_test_count===63 && grade.observed_test_records===63 && grade.expected_test_count_observed===true &&
    grade.summary?.tests===63 && grade.summary.passed===63 &&
    ['failed','skipped','pending','other'].every(k=>grade.summary[k]===0) &&
    grade.verifier_process_returncode===0 && grade.container_removed===true &&
    grade.task_id==='openapi_python_client' && grade.upstream_commit===upstreamCommit &&
    grade.image?.image_id===image.image_id && grade.image?.image_digest===image.image_digest &&
    grade.workspace===workspace && grade.network==='none' && grade.fresh_verifier===true && grade.model_calls===0;
}

export async function runArm({condition,outputDir}) {
  if(!['claude','jev'].includes(condition))fail('INVALID_CONDITION');
  const dir=resolve(ROOT,outputDir);
  if(!dir.startsWith(join(ROOT,'benchmark-runs')+'/')||existsSync(dir))fail('OUTPUT_MUST_BE_NEW');
  const {input,contract,budget}=loadPlanningManifest(MANIFEST,ROOT);
  const fixed=read(join(ROOT,'benchmark-runs/d040-claude-01/frozen-plan.json')).plan;
  const allPaths=[...new Set(fixed.tasks.flatMap(t=>t.paths))];
  const brief=[{path:input.source.path,text:input.source.text},{path:'benchmarks/e2e-swe/artifact-contract.md',text:readFileSync(join(ROOT,'benchmarks/e2e-swe/artifact-contract.md'),'utf8')}];
  const sharedArchitecture={artifact_interfaces:input.artifact_interfaces,
    interface_contract:fixed.integrationInstructions.replace('- Do not modify files owned by another task.',''),
    basis:'Shared historical interface design supplied equally; task grouping and historical implementations are not reused.'};
  preflightVerifier({python:PYTHON});
  mkdirSync(dir,{mode:0o700});for(const sub of ['calls','receipts','sources','candidate'])mkdirSync(join(dir,sub),{mode:0o700});
  const candidate=realpathSync(join(dir,'candidate'));
  const save=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',PRIVATE);
  const record=async e=>appendFileSync(join(dir,'events.jsonl'),JSON.stringify({recorded_at:new Date().toISOString(),...e})+'\n',{mode:0o600});
  const sourcePaths=[MANIFEST,'docs/orchestration/contracts/recursive-task-tests.d057.json',
    'benchmarks/e2e-swe/manifests/d056-obligations.json',input.source.path,brief[1].path,
    'benchmark-runs/d040-claude-01/frozen-plan.json',IMAGE,
    'scripts/recursive-e2e-comparison.mjs','src/orchestration/recursive-execution.mjs',
    'src/orchestration/recursive-task-tests.mjs','src/benchmark/recursive-planning-runner.mjs',
    'src/orchestration/planning-state-codec.mjs','src/orchestration/artifact-transport.mjs','bin/artifact-worker-mcp.mjs',
    'src/orchestration/public-smoke.mjs','src/orchestration/artifact-verifier.mjs',
    'src/benchmark/runner.mjs','src/benchmark/docker.mjs','src/benchmark/claude-env.mjs',
    'src/client.mjs','src/benchmark/telemetry.mjs','src/benchmark/budget.mjs',
    'benchmarks/e2e-swe/adapter.py','benchmarks/e2e-swe/manifests/openapi_python_client.json'];
  const sources=sourcePaths.map((path,i)=>{
    const bytes=readFileSync(join(ROOT,path)),snapshot_path=`sources/${String(i+1).padStart(2,'0')}-${basename(path)}`;
    writeFileSync(join(dir,snapshot_path),bytes,PRIVATE);return {path,sha256:hash(bytes),snapshot_path};
  });
  save('protocol.json',{schema_version:'recursive-e2e/v1',condition,worker_model:MODEL,effort:EFFORT,
    source_sha256:input.source.sha256,brief_sha256:hash(brief),input_sha256:hash(input),architecture_sha256:hash(sharedArchitecture),
    all_paths:allPaths,image:read(join(ROOT,IMAGE)),sources,
    limits:{wall_seconds:14400,max_concurrency:2,max_public_repairs:3,assignment_batch_size:8,max_leaves:8,max_depth:3},
    control:'Claude single full-goal implementation versus Jev recursive planning plus Claude leaf/integration implementation. Whole-workflow comparison; not pure judge substitution.',
    completion:'Same independent original grader: completed, resolved=true, reward=1 and63/63 passed. No hidden grader feedback returns to workers.',
    timing:'Arm start immediately before runtime planning/implementation through independent-grade subprocess completion; includes planning, all workers, public checks, repair and evaluation. Controller development/common fixture preparation excluded and disclosed.'});
  save('inputs.json',{input,brief,sharedArchitecture});save('budget-before.json',readTokenBudgetSnapshot(budget));
  const started=performance.now(),started_at=new Date().toISOString();
  let seq=0,status='running',stopCode=null,planning=null,execution=null,grade=null,gradeWall=null,gradeEnd=null,publicCheck=null;
  const receipts=[];
  const remaining=()=>{const ms=14400000-(performance.now()-started);if(ms<=0)fail('RUN_DEADLINE');return ms;};
  const invoke=async({category,task,paths,readablePaths=allPaths,evidence=[]})=>{
    const id=`${String(++seq).padStart(3,'0')}-${category}`,cwd=mkdtempSync(join(tmpdir(),`jev-d057-${condition}-`));
    const transport={root:candidate,allowedPaths:paths,readablePaths,journalPath:join(dir,'calls',`${id}.artifacts.jsonl`),maxFileBytes:262144,maxTotalBytes:4194304};
    save(`calls/${id}.transport.json`,transport);
    const mcp={mcpServers:{artifact_worker:{command:process.execPath,args:[join(ROOT,'bin/artifact-worker-mcp.mjs'),'--config',join(dir,'calls',`${id}.transport.json`)]}}};
    const mcpFile=join(dir,'calls',`${id}.mcp.json`);writeFileSync(mcpFile,JSON.stringify(mcp),PRIVATE);
    const system='You are the implementation worker for a controlled whole-product benchmark. Implement the public specification correctly and completely within your assigned responsibility. Use artifact_worker write_file to persist complete file contents individually; read_file to inspect current artifacts before replacing shared files. Preserve existing behavior implemented by predecessors. Source requirement atoms are responsibilities, not permission to rewrite the whole product for an overview clause. Shared architecture is a common interface reference, not preexisting implementation. Only write assigned paths. Final reply is a concise factual summary, not file bodies. You have no shell/network/delegation tools. Do not claim executed tests; the controller runs checks and returns public evidence. Do not write stubs. For integration or repair, resolve missing modules, inconsistent interfaces and all public requirements across the entire allowed product. Never modify expected test behavior.';
    const request={brief,shared_architecture:sharedArchitecture,task,
      test_specifications:input.tests.filter(t=>task.test_ids?.includes(t.id)),
      writable_paths:paths,readable_paths:readablePaths,current_artifacts:publishedSnapshot(candidate,readablePaths),public_evidence:evidence};
    save(`calls/${id}.request.json`,{request,system,cwd});
    const args=['--print','--restricted','--model',MODEL,'--effort',EFFORT,'--tools','','--strict-mcp-config','--mcp-config',mcpFile,'--setting-sources','','--disable-slash-commands','--no-chrome','--permission-mode','dontAsk','--permission-prompts','none','--no-session-persistence','--output-format','stream-json','--verbose','--system-prompt',system,'--allowedTools','mcp__artifact_worker__write_file,mcp__artifact_worker__read_file,mcp__artifact_worker__status'];
    await record({event:'invocation_started',id,category,task_id:task.id,provider:'claude'});const t=performance.now();
    let raw,outcome;
    try {
      raw=await processResult('claude',args,{cwd,env:claudeEnvironment(process.env),input:JSON.stringify(request),timeoutMs:remaining(),maxBytes:32*1024*1024,killProcessTree:true,
        onStdout:chunk=>appendFileSync(join(dir,'calls',`${id}.live.jsonl`),chunk,{mode:0o600})});
      writeFileSync(join(dir,'calls',`${id}.stderr.log`),raw.stderr,PRIVATE);
      outcome=providerOutcome(raw,MODEL);
    } catch(e) {
      const receipt={id,category,task_id:task.id,status:'uncertain',code:safeCode(e),wall_ms:performance.now()-t,usage:null,api_equivalent_usd:null};
      receipts.push(receipt);save(`receipts/${id}.json`,receipt);await record({event:'invocation_finished',...receipt});
      throw Object.assign(Error('CLAUDE_PROCESS_UNCERTAIN'),{code:'CLAUDE_PROCESS_UNCERTAIN',uncertain:true});
    }
    const receipt={id,category,task_id:task.id,status:outcome.status,code:outcome.code,wall_ms:performance.now()-t,
      models:outcome.models,model_identity_verified:outcome.identity,usage:outcome.completion?.usage??null,
      api_equivalent_usd:outcome.completion?.total_cost_usd??null,actual_billed_usd:null,provider_api_ms:outcome.completion?.duration_api_ms??null};
    receipts.push(receipt);save(`receipts/${id}.json`,receipt);await record({event:'invocation_finished',...receipt});
    if(outcome.status!=='completed')throw Object.assign(Error(outcome.code),{code:outcome.code,uncertain:outcome.status==='uncertain'});
    return {invocation_id:id,summary:outcome.completion.result};
  };
  const whole={id:'whole-product',goal:input.goal,obligation_ids:input.obligations.map(o=>o.id),test_ids:input.tests.map(t=>t.id),responsibility:'Implement and integrate the complete public specification.'};
  const check=async ordinal=>{
    remaining();const t=performance.now();
    const syntax=verifyArtifacts({root:candidate,paths:allPaths,allPaths,python:PYTHON});
    let smoke=null;
    if(syntax.ok)smoke=await runPublicSmoke({root:candidate,outputDir:join(dir,`public-smoke-${ordinal}`),imageLock:join(ROOT,IMAGE),requiredPaths:allPaths,timeoutMs:Math.min(180000,remaining())});
    const result={syntax,smoke,ok:syntax.ok&&smoke?.ok===true,wall_ms:performance.now()-t};
    save(`public-check-${ordinal}.json`,result);await record({event:'public_check_finished',ordinal,...result});return result;
  };
  await record({event:'arm_started',condition,started_at});
  try {
    if(condition==='jev') {
      planning=await runPlanningPilot({rootDir:ROOT,manifestPath:MANIFEST,outputDir:join(dir,'planning'),spend:true,
        runEngine:args=>runRecursivePlanning({...args,assignmentBatchSize:8,respectResourceOptions:true})});
      if(planning.status!=='complete')throw Object.assign(Error('PLANNING_NOT_COMPLETE'),{code:'PLANNING_NOT_COMPLETE',uncertain:planning.issues.some(i=>i.outcome_uncertain===true)});
      remaining();
      const plan=read(join(dir,'planning/plan.json'));
      const envelope=executionEnvelope({input,plan,allPaths});save('execution-envelope.json',envelope);
      execution=await executeTaskEnvelope({envelope,maxConcurrency:2,record,execute:(t,{readablePaths})=>invoke({category:'leaf',task:t.task,paths:t.paths,readablePaths})});
      save('execution.json',execution);if(execution.status!=='completed')throw Object.assign(Error(execution.failure?.code??'LEAF_EXECUTION_FAILED'),{code:execution.failure?.code??'LEAF_EXECUTION_FAILED',uncertain:execution.results.some(r=>r.outcome_uncertain===true)});
    } else {
      await invoke({category:'implementation',task:whole,paths:allPaths});
    }
    // Both arms receive one full-spec integration review; its cost stays in completion time.
    await invoke({category:'integration',task:{...whole,id:'integration',responsibility:'Read the actual files, integrate all modules, fill uncovered paths, preserve implemented behavior, and verify every public requirement by source inspection. Resolve interfaces across the product.'},paths:allPaths});
    for(let n=0;n<=3;n++) {
      publicCheck=await check(n);
      if(publicCheck.ok)break;
      if(publicCheck.smoke?.status==='environment_error')fail('VERIFIER_ENVIRONMENT_ERROR');
      if(n===3)break;
      await invoke({category:'public-repair',task:{...whole,id:`public-repair-${n+1}`},paths:allPaths,evidence:[publicCheck]});
    }
    await record({event:'candidate_frozen',snapshot:candidateSnapshot(candidate)});
    const pregrade=candidateSnapshot(candidate);save('pregrade.json',pregrade);
    const gstart=performance.now();
    const g=await processResult(PYTHON,[join(ROOT,'benchmarks/e2e-swe/adapter.py'),'--manifest',join(ROOT,'benchmarks/e2e-swe/manifests/openapi_python_client.json'),'grade','--workspace',candidate,'--image-lock',join(ROOT,IMAGE),'--output',join(dir,'grade')],{cwd:ROOT,timeoutMs:remaining(),maxBytes:4*1024*1024,killProcessTree:true});
    gradeEnd=performance.now();gradeWall=gradeEnd-gstart;
    save('grade-controller.json',{exit_code:g.exit_code,stdout:g.stdout,stderr:g.stderr,wall_ms:gradeWall,outcome_uncertain:g.outcome_uncertain??false});
    if(hash(pregrade)!==hash(candidateSnapshot(candidate)))fail('CANDIDATE_CHANGED_DURING_GRADE');
    if(g.outcome_uncertain)throw Object.assign(Error('GRADE_OUTCOME_UNCERTAIN'),{code:'GRADE_OUTCOME_UNCERTAIN',uncertain:true});
    if(!existsSync(join(dir,'grade/result.json')))fail('INDEPENDENT_GRADE_MISSING');
    grade=read(join(dir,'grade/result.json'));
    await record({event:'independent_grade_finished',wall_ms:gradeWall,grade});
    status=isIndependentCompletion({grade,process:g,image:read(join(ROOT,IMAGE)),upstreamCommit:read(join(ROOT,'benchmarks/e2e-swe/manifests/openapi_python_client.json')).upstream_commit,workspace:candidate})?'completed':g.outcome_uncertain?'uncertain':'unresolved';
  } catch(e) {
    status=e.uncertain||e.outcomeUncertain?'uncertain':'stopped';stopCode=safeCode(e);
    await record({event:'arm_stopped',code:stopCode,outcome_uncertain:e.uncertain??e.outcomeUncertain??false});
  }
  const runtimeWall=performance.now()-started;
  const sourceChanges=sources.filter(s=>hash(readFileSync(join(ROOT,s.path)))!==s.sha256).map(s=>s.path);
  save('budget-after.json',readTokenBudgetSnapshot(budget));
  const result={schema_version:'recursive-e2e-result/v1',condition,status,stop_code:stopCode,started_at,finished_at:new Date().toISOString(),
    wall_ms:runtimeWall,completion_wall_ms:status==='completed'&&sourceChanges.length===0?gradeEnd-started:null,
    candidate_path:candidate,planning_wall_ms:planning?.wall_ms??0,planning_status:planning?.status??'not_applicable',
    claude:summarizeUsage(receipts),jev:planning?.usage??null,public_check_passed:publicCheck?.ok??null,
    independent_grade:grade,grade_wall_ms:gradeWall,source_changes_during_run:sourceChanges,
    valid_completion_comparison:status==='completed'&&sourceChanges.length===0,
    development_and_fixture_preparation_cost:null,actual_billed_usd:null};
  save('result.json',result);await record({event:'arm_finished',status,wall_ms:runtimeWall,completion_wall_ms:result.completion_wall_ms});
  return result;
}

async function main() {
  const [condition,output,spend]=process.argv.slice(2);
  if(spend!=='--spend') {
    const x=loadPlanningManifest(MANIFEST,ROOT);
    console.log(JSON.stringify({status:'inspected_no_inference',conditions:['claude','jev'],obligations:x.input.obligations.length,tests:x.input.tests.length,limits:x.manifest.limits}));return;
  }
  const result=await runArm({condition,outputDir:output});
  console.log(JSON.stringify({condition:result.condition,status:result.status,stop_code:result.stop_code,wall_ms:result.wall_ms,completion_wall_ms:result.completion_wall_ms,claude:result.claude,jev:result.jev,resolved:result.independent_grade?.resolved??null}));
  if(result.status!=='completed')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(e=>{console.error(safeCode(e));process.exitCode=1;});
