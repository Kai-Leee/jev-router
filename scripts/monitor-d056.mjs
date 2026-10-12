#!/usr/bin/env node
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {monitorArguments,monitorDefinition,monitorCompletion} from '../src/benchmark/monitor.mjs';
import {processResult} from '../src/benchmark/docker.mjs';
import {claudeEnvironment} from '../src/benchmark/claude-env.mjs';

const root=resolve(import.meta.dirname,'..');
const read=path=>JSON.parse(readFileSync(path,'utf8'));
async function main(){
  if(process.argv[2]!=='--spend')throw new Error('EXPLICIT_SPEND_REQUIRED');
  const run=realpathSync(resolve(root,process.argv[3]??'benchmark-runs/d056-recursive-01'));
  const rel=relative(join(root,'benchmark-runs'),run);
  if(!rel||rel.startsWith('..')||rel.startsWith('/'))throw new Error('INVALID_RUN_PATH');
  const result=read(join(run,'result.json'));
  const plan=existsSync(join(run,'plan.json'))?read(join(run,'plan.json')):null;
  const {input}=read(join(run,'inputs.json'));
  const events=readFileSync(join(run,'events.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const answered=events.filter(event=>event.event==='planning_responded');
  const bypassed=events.filter(event=>event.event==='planning_choice_bypassed');
  const packet={task:'openapi_python_client',experiment:'D056 recursive planning only',result,
    metric_definitions:{
      feasibility_states:'Cumulative states visited across all feasibilityOwnership searches.',
      max_feasibility_states:'Maximum states in ONE feasibilityOwnership search; not a cumulative run limit.',
      reviewed_nodes:'Count choices (paid or singleton) processed, including a node whose subsequent proposed partition was not committed.',
      deterministic_choices:'All one-option bypasses across stages, including anchor choices; not only ready leaf reviews.',
      ready_leaf_count:'Published ready_specification_only leaves. A deterministic singleton is not model adequacy approval.',
      stop_code:'Current runner exposes an outer failure or first engine issue. Earlier frozen runs may have null here with an explicit engine issue.',
      write_serialization:'Ordering metadata for shared potential writes. No implementation locks or product workers are executed.',
      model_identity:'Record the returned model string and catalog alias resolution separately; varying alias strings alone do not prove a changed backend.',
    },
    event_summary:{
      answered_by_stage:Object.fromEntries(['child_count','anchor','assign_obligation'].map(stage=>[stage,answered.filter(e=>e.stage===stage).length])),
      singleton_bypasses_by_stage:Object.fromEntries(['child_count','anchor','assign_obligation'].map(stage=>[stage,bypassed.filter(e=>e.provenance?.stage===stage).length])),
      count_choices:answered.filter(e=>e.stage==='child_count').map(e=>({node_id:e.node_id,choice:e.response.answers.child_count.choice})),
      committed_split_nodes:events.filter(e=>e.event==='planning_split_validated').map(e=>e.node_id),
    },
    source:{path:input.source.path,sha256:input.source.sha256},
    obligations:input.obligations.map(o=>({id:o.id,title:o.title,text:o.text,inputs:o.inputs,outputs:o.outputs,write_scope:o.write_scope,dependency_assertion:o.dependency_assertion})),
    tasks:plan?.tasks.map(t=>({id:t.id,parent_id:t.parent_id,depth:t.depth,children:t.children,obligation_ids:t.obligation_ids,test_ids:t.test_ids,depends_on:t.depends_on,write_scope:t.write_scope,write_serialization:t.write_serialization,planning_status:t.planning_status,review:t.review,execution_eligible:t.execution_eligible,verification_status:t.verification_status}))??null,
    tests:plan?.tests.map(t=>({id:t.id,requirement_refs:t.requirement_refs,scenario:t.scenario,input:t.input,expected:t.expected,scope:t.scope,task_ids:t.task_ids,runner_ref:t.runner_ref,status:t.status}))??null,
    limitations:['Public instructions and hand-prepared source-backed test descriptions; no hidden grader feedback.','No product workers or executable product tests were run. Source-linked test IDs alone do not prove semantic coverage.','Empty unasserted dependencies are not evidence of independence. File relevance is conservative, not exact edit ownership.','No matched Claude planning comparison in this run. No whole-task efficiency measurement.','Harness development and test-description preparation tokens are outside this run ledger.'],
    monitor_cost_scope:'separate from Jev planning'};
  const dir=join(root,'benchmark-runs',`${rel}-monitor`);
  mkdirSync(dir,{mode:0o700});
  const save=(name,value)=>writeFileSync(join(dir,name),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  save('observation.json',packet);
  const cwd=mkdtempSync(join(tmpdir(),'jev-d056-monitor-'));
  const agents=join(cwd,'agents.json'),mcp=join(cwd,'mcp.json');
  const role=readFileSync(join(root,'docs/agents/D056_OPUS_MONITOR.md'),'utf8');
  writeFileSync(agents,JSON.stringify(monitorDefinition(role)),{mode:0o600});
  writeFileSync(mcp,'{"mcpServers":{}}',{mode:0o600});
  save('started.json',{model:'claude-opus-5-5',effort:'medium',role:'monitor',started_at:new Date().toISOString(),automaticRetries:0,source_run:rel,role_sha256:createHash('sha256').update(role).digest('hex')});
  const started=performance.now();
  const response=await processResult('claude',monitorArguments(agents,mcp),{cwd,env:claudeEnvironment(process.env,{auth:'cli'}),input:JSON.stringify(packet),timeoutMs:180000,maxBytes:2000000,killProcessTree:true});
  writeFileSync(join(dir,'stdout.jsonl'),response.stdout,{flag:'wx',mode:0o600});
  writeFileSync(join(dir,'stderr.log'),response.stderr,{flag:'wx',mode:0o600});
  const completion=monitorCompletion(response);
  const summary={status:completion.status,code:completion.code,models:completion.models,model_identity:completion.identity,usage:completion.final?.usage??null,api_equivalent_usd:completion.final?.total_cost_usd??null,actual_billed_usd:null,wall_ms:performance.now()-started,report:completion.report,outcome_uncertain:response.outcome_uncertain??null};
  save('result.json',summary);console.log(JSON.stringify(summary));
  if(completion.status!=='completed')process.exitCode=1;
}
main().catch(()=>{console.error('MONITOR_STOPPED_NO_RETRY');process.exitCode=1;});
