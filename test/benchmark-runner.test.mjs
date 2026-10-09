import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { validateRunConfig, claudeArguments } from '../src/benchmark/launch.mjs';
import { executeBenchmarkRun, providerOutcome, writePrivateJson } from '../src/benchmark/runner.mjs';

const baseConfig=()=>({schema_version:'jev-benchmark-run/v1',mode:'jev',container:'jev-test',instructions:['goal.md'],
  jev_budget:{schema_version:'jev-token-budget/v1',ledger_path:'budget.json',max_usd:1,usd_per_million_input_tokens:0.6,reserve_input_tokens:65536},
  output_dir:'run',claude_max_budget_usd:null,max_decisions:null,wall_timeout_seconds:60,model:'claude-opus-5-5',
  effort:'medium',auth:'cli',run_id:'run-1',attempt_id:'attempt-1',group_id:'pair-1',agent_role:'implementation'});
const ok=(stdout='')=>({stdout,stderr:'',exit_code:0,outcome_uncertain:false,interrupted:null});
const final=(change={})=>({type:'result',subtype:'success',is_error:false,modelUsage:{'claude-opus-5-5':{inputTokens:5,outputTokens:2}},usage:{input_tokens:5,output_tokens:2},total_cost_usd:0.01,...change});
const identifiers=config=>Object.fromEntries(['run_id','attempt_id','group_id','agent_role'].map(key=>[key,config[key]]));
const read=(config,name)=>JSON.parse(readFileSync(join(config.output_dir,name),'utf8'));
const journal=config=>readFileSync(join(config.output_dir,'runner.jsonl'),'utf8').trim().split('\n').map(JSON.parse);

function fixture(t){
  const root=mkdtempSync(join(tmpdir(),'jev-runner-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  writeFileSync(join(root,'goal.md'),'Synthetic goal, no model calls.');
  const config=validateRunConfig(baseConfig(),root);const calls=[];
  let preflightEnv;
  const dependencies={env:{PATH:process.env.PATH,HOME:root,USER:'test-user',LOGNAME:'test-user',SECRET_SENTINEL:'not-forwarded'},manageSignals:false,
    runCommand:async(command,args,options)=>{
      calls.push([command,args]);
      if(command==='claude'&&args[0]==='auth'){preflightEnv=options.env;return ok('{"loggedIn":true}');}
      if(command==='claude'&&args[0]==='--version')return ok('2.1.293');
      if(command==='docker'&&args[0]==='stop')return ok('sandbox-id');
      if(command==='docker'&&args[0]==='container')return ok(JSON.stringify([{Id:'sandbox-id',State:{Running:false}}]));
      throw new Error('Unexpected external request');
    },
    inspect:async()=>({Id:'sandbox-id',Image:'image-id'}),lookupModels:async()=>({models:[{name:'jev-latest'}]}),
    runProvider:async(command,args,options)=>{
      calls.push(['provider',args]);assert.equal(options.env.SECRET_SENTINEL,undefined);assert.equal(options.killProcessTree,true);
      assert.deepEqual(options.env,preflightEnv);assert.equal(options.env.USER,'test-user');assert.equal(options.env.LOGNAME,'test-user');
      writePrivateJson(join(config.output_dir,'gate-state.json'),{...identifiers(config),state:'completed',completion_claimed:true,outcome_uncertain:false});
      const stdout=JSON.stringify(final())+'\n';options.onStdout(Buffer.from(stdout));return ok(stdout);
    }};
  return {root,config,calls,dependencies};
}

test('null limits are explicit; OAuth omits USD CLI flag; missing and invalid limits reject',()=>{
  const config=validateRunConfig(baseConfig(),'/tmp');assert.equal(config.max_decisions,null);
  assert.ok(!claudeArguments(config,'mcp').includes('--max-budget-usd'));
  for(const edit of [c=>delete c.max_decisions,c=>delete c.claude_max_budget_usd,c=>c.max_decisions=0,c=>c.max_decisions=Infinity,
    c=>c.claude_max_budget_usd=0,c=>c.auth='api-key',c=>c.run_id='../../secret',c=>c.agent_role='admin']){
    const value=baseConfig();edit(value);assert.throws(()=>validateRunConfig(value),/INVALID_RUN_CONFIG/);
  }
  const finite=validateRunConfig({...baseConfig(),auth:'api-key',claude_max_budget_usd:1,max_decisions:5});
  assert.equal(claudeArguments(finite,'mcp')[claudeArguments(finite,'mcp').indexOf('--max-budget-usd')+1],'1');
  const legacy=baseConfig();for(const name of ['run_id','attempt_id','group_id','agent_role'])delete legacy[name];
  const normalized=validateRunConfig(legacy);assert.match(normalized.run_id,/^run-/);assert.equal(normalized.agent_role,'implementation');
});

test('successful provider is finalizing until exact sandbox freeze and terminal receipt',async t=>{
  const {config,calls,dependencies}=fixture(t);const original=dependencies.runCommand;
  dependencies.runCommand=async(command,args,options)=>{
    if(command==='docker'&&args[0]==='stop'){
      assert.equal(existsSync(join(config.output_dir,'result.json')),false);
      assert.equal(journal(config).at(-1).event,'runner_finalizing');
    }
    return original(command,args,options);
  };
  const result=await executeBenchmarkRun(config,dependencies);t.after(()=>rmSync(result.session_directory,{recursive:true,force:true}));
  assert.equal(result.runner_status,'completed');assert.equal(result.evaluator_success,null);assert.equal(result.artifact_frozen,true);
  assert.equal(read(config,'result.json').runner_status,'completed');
  assert.deepEqual(journal(config).map(row=>row.event),['runner_started','preflight_started','provider_started','provider_finished','runner_finalizing','artifact_frozen','runner_terminal']);
  for(const row of journal(config))for(const [name,value]of Object.entries(identifiers(config)))assert.equal(row[name],value);
  assert.equal(read(config,'runner-heartbeat.json').phase,'terminal');
  assert.equal(read(config,'server.json').max_decisions,null);assert.equal(read(config,'server.json').attempt_id,'attempt-1');
  assert.equal(read(config,'preflight.json').actual_container_id,'sandbox-id');
  assert.ok(calls.some(([command,args])=>command==='docker'&&args.join(' ')==='container inspect sandbox-id'));
});

test('missing brief and failed authentication create discoverable preflight failure before provider',async t=>{
  for(const failure of ['brief','auth']){
    const {config,calls,dependencies}=fixture(t);
    if(failure==='brief')rmSync(config.instructions[0]);
    else dependencies.runCommand=async()=>{assert.ok(existsSync(join(config.output_dir,'manifest.json')));return ok('{"loggedIn":false}');};
    const result=await executeBenchmarkRun(config,dependencies);
    assert.equal(result.runner_status,'failed');assert.equal(result.runner_error_code,failure==='brief'?'BRIEF_UNAVAILABLE':'CLAUDE_AUTH_REQUIRED');
    assert.equal(result.process_exit,null);assert.equal(result.cleanup,null);assert.ok(journal(config).some(row=>row.event==='preflight_failed'));
    assert.equal(journal(config).at(-1).event,'runner_terminal');assert.ok(!calls.some(([command])=>command==='provider'));
  }
});

test('preflight exceptions are code-filtered and acquired sandbox is frozen',async t=>{
  const {config,dependencies}=fixture(t);dependencies.lookupModels=async()=>{throw new Error('SECRET_SENTINEL');};
  const result=await executeBenchmarkRun(config,dependencies);
  assert.equal(result.runner_error_code,'JEV_PREFLIGHT_FAILED');assert.equal(result.artifact_frozen,true);
  assert.ok(!JSON.stringify(journal(config)).includes('SECRET_SENTINEL'));
});

test('exclusive output directory is never reused for another attempt',async t=>{
  const {config,dependencies}=fixture(t);mkdirSync(config.output_dir);writeFileSync(join(config.output_dir,'keep'),'original');
  await assert.rejects(executeBenchmarkRun(config,dependencies),{code:'EEXIST'});
  assert.equal(readFileSync(join(config.output_dir,'keep'),'utf8'),'original');
});

test('CLI zero without valid final is uncertain; errors, model identity and final conflicts stay distinct',()=>{
  const cases=[
    [ok(''),'uncertain','PROVIDER_FINAL_MISSING'],
    [ok(JSON.stringify(final())+'\n{'),'uncertain','PROVIDER_FINAL_INVALID'],
    [ok(JSON.stringify(final())+'\n'+JSON.stringify(final())),'uncertain','PROVIDER_FINAL_CONFLICT'],
    [ok(JSON.stringify(final({is_error:true,subtype:'error_max_turns'}))),'failed','PROVIDER_FAILED'],
    [ok(JSON.stringify(final({modelUsage:{'claude-other':{}}}))),'failed','MODEL_IDENTITY_MISMATCH'],
    [ok(JSON.stringify(final({modelUsage:{'claude-opus-5-5-version':{}}}))),'uncertain','MODEL_IDENTITY_UNVERIFIED'],
    [ok(JSON.stringify(final({modelUsage:{}}))),'uncertain','MODEL_IDENTITY_UNVERIFIED'],
  ];
  for(const [input,status,code]of cases){const actual=providerOutcome(input,'claude-opus-5-5');assert.equal(actual.status,status);assert.equal(actual.code,code);}
});

test('provider final and CLI zero cannot override failed freeze or stopped/missing gate',async t=>{
  for(const fault of ['freeze','gate-stopped','gate-missing']){
    const {config,dependencies}=fixture(t);const provider=dependencies.runProvider;
    dependencies.runProvider=async(...args)=>{
      const result=await provider(...args);
      if(fault==='gate-missing')rmSync(join(config.output_dir,'gate-state.json'));
      if(fault==='gate-stopped')writePrivateJson(join(config.output_dir,'gate-state.json'),{...identifiers(config),state:'stopped',stop_code:'BUDGET_EXHAUSTED',outcome_uncertain:false,completion_claimed:false},{atomic:true});
      return result;
    };
    const original=dependencies.runCommand;
    if(fault==='freeze')dependencies.runCommand=async(command,args,options)=>command==='docker'&&args[0]==='container'?ok(JSON.stringify([{Id:'sandbox-id',State:{Running:true}}])):original(command,args,options);
    const result=await executeBenchmarkRun(config,dependencies);t.after(()=>rmSync(result.session_directory,{recursive:true,force:true}));
    assert.equal(result.runner_status,fault==='gate-stopped'?'failed':'uncertain');
    assert.equal(result.runner_error_code,{'freeze':'ARTIFACT_FREEZE_FAILED','gate-stopped':'GATE_STOPPED','gate-missing':'GATE_COMPLETION_UNCONFIRMED'}[fault]);
    assert.equal(result.claude_reported_cost_usd,0.01);
  }
});

test('provider timeout preserves usage if final exists and freezes exact container',async t=>{
  const {config,dependencies}=fixture(t);const provider=dependencies.runProvider;
  dependencies.runProvider=async(...args)=>({...await provider(...args),outcome_uncertain:true,interrupted:'TIMEOUT',exit_code:null});
  const result=await executeBenchmarkRun(config,dependencies);t.after(()=>rmSync(result.session_directory,{recursive:true,force:true}));
  assert.equal(result.runner_status,'uncertain');assert.equal(result.runner_error_code,'TIMEOUT');assert.equal(result.cleanup.stopped,true);assert.equal(result.claude_usage.input_tokens,5);
});

test('provider spawn failure emits finished failure and freezes without replay',async t=>{
  const {config,dependencies}=fixture(t);let calls=0;
  dependencies.runProvider=async()=>{calls++;throw new Error('PROCESS_START_FAILED');};
  const result=await executeBenchmarkRun(config,dependencies);t.after(()=>rmSync(result.session_directory,{recursive:true,force:true}));
  assert.equal(calls,1);assert.equal(result.runner_status,'failed');assert.equal(result.runner_error_code,'PROCESS_START_FAILED');
  assert.equal(journal(config).filter(row=>row.event==='provider_finished')[0].status,'failed');assert.equal(result.artifact_frozen,true);
});

test('heartbeat writer failure aborts provider and records uncertainty without replay',async t=>{
  const {config,dependencies}=fixture(t);let providerActive=false,calls=0;
  dependencies.heartbeatMs=5;
  dependencies.jsonWriter=(path,value,options)=>{if(providerActive&&basename(path)==='runner-heartbeat.json')throw new Error('SECRET_SENTINEL');return writePrivateJson(path,value,options);};
  dependencies.runProvider=async(command,args,options)=>{
    calls++;providerActive=true;
    return new Promise(resolve=>options.abortSignal.addEventListener('abort',()=>{providerActive=false;resolve({...ok(),outcome_uncertain:true,interrupted:'CANCELLED',exit_code:null});},{once:true}));
  };
  // Keep this mock's pending operation alive; real provider child processes also hold the event loop.
  const keepAlive=setTimeout(()=>{},1000);
  const result=await executeBenchmarkRun(config,dependencies);clearTimeout(keepAlive);t.after(()=>rmSync(result.session_directory,{recursive:true,force:true}));
  assert.equal(calls,1);assert.equal(result.runner_status,'uncertain');assert.equal(result.runner_error_code,'RUNNER_RECORD_FAILED');assert.equal(result.cleanup.stopped,true);
  assert.ok(!JSON.stringify(result).includes('SECRET_SENTINEL'));
});

test('result writer failure has an independent uncertain terminal journal event',async t=>{
  const {config,dependencies}=fixture(t);dependencies.jsonWriter=(path,value,options)=>{if(basename(path)==='result.json')throw new Error('SECRET_SENTINEL');return writePrivateJson(path,value,options);};
  const result=await executeBenchmarkRun(config,dependencies);t.after(()=>rmSync(result.session_directory,{recursive:true,force:true}));
  assert.equal(result.runner_status,'uncertain');assert.equal(result.runner_error_code,'RUNNER_RECORD_FAILED');
  assert.equal(existsSync(join(config.output_dir,'result.json')),false);
  assert.equal(journal(config).at(-1).event,'runner_terminal');assert.equal(journal(config).at(-1).status,'uncertain');
});

test('graceful stop aborts provider once and confirms artifact freeze',async t=>{
  const {config,dependencies}=fixture(t);let calls=0;dependencies.manageSignals=true;
  const oldCount=process.listenerCount('SIGTERM');
  dependencies.runProvider=async(command,args,options)=>{
    calls++;
    const pending=new Promise(resolve=>options.abortSignal.addEventListener('abort',()=>resolve({...ok(),exit_code:null,outcome_uncertain:true,interrupted:'CANCELLED'}),{once:true}));
    process.emit('SIGTERM');return pending;
  };
  const result=await executeBenchmarkRun(config,dependencies);t.after(()=>rmSync(result.session_directory,{recursive:true,force:true}));
  assert.equal(calls,1);assert.equal(result.runner_status,'uncertain');assert.equal(result.runner_error_code,'RUNNER_STOP_REQUESTED');
  assert.equal(result.cleanup.stopped,true);assert.equal(process.listenerCount('SIGTERM'),oldCount);
});

test('checkpoint workflow reaches exact server brief and route-enabled isolated launch',async t=>{
  const {config,dependencies}=fixture(t);config.workflow='checkpoint-v1';
  const result=await executeBenchmarkRun(config,dependencies);t.after(()=>rmSync(result.session_directory,{recursive:true,force:true}));
  const server=read(config,'server.json');assert.equal(server.workflow,'checkpoint-v1');
  assert.equal(server.trustedBrief,readFileSync(join(config.output_dir,'brief.txt'),'utf8'));
  const args=claudeArguments(config,'mcp');assert.match(args[args.indexOf('--allowedTools')+1],/route/);
  assert.equal(read(config,'manifest.json').controller,'checkpoint-v1');
  assert.throws(()=>validateRunConfig({...baseConfig(),workflow:'unrecognized'}),/INVALID_RUN_CONFIG/);
});
