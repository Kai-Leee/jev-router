import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,realpathSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createFrozenClaudeEnvironment,frozenClaudeProcessOptions} from '../src/benchmark/claude-environment.mjs';
import {claudeArguments,parseClaudeTrace,runClaudeAttempt,inspectClaudeInitialization,CLAUDE_BUILTIN_PLUGIN_MANIFEST} from '../src/benchmark/claude-provider.mjs';
const model='claude-opus-5-5',effort='medium',schema={type:'object',required:['ok'],properties:{ok:{type:'boolean'}},additionalProperties:false};
const native={input_tokens:10,cache_read_input_tokens:20,cache_creation_input_tokens:5,output_tokens:3,
  cache_creation:{ephemeral_5m_input_tokens:2,ephemeral_1h_input_tokens:3}};
function stream({tool='StructuredOutput',initialization={},completion={}}={}) {return [
  {type:'system',subtype:'init',model,tools:['StructuredOutput'],mcp_servers:[],slash_commands:[],skills:[],plugins:[],...initialization},
  {type:'assistant',message:{model,usage:{input_tokens:999999},content:[{type:'tool_use',name:tool}]}},
  {type:'result',subtype:'success',is_error:false,num_turns:1,usage:native,modelUsage:{[model]:{}},structured_output:{ok:true},total_cost_usd:.0001,...completion}
].map(JSON.stringify).join('\n')+'\n';}
async function fixture(t) {
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'claude-attempt-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const binary=join(dir,'claude');writeFileSync(binary,Buffer.concat([Buffer.from('cffaedfe','hex'),Buffer.from('fixture')]));
  const cwd=join(dir,'work');mkdirSync(cwd);
  const options={binary,expectedSha256:createHash('sha256').update(readFileSync(binary)).digest('hex'),expectedVersion:'2.1.299 (Claude Code)',
    allowedProfiles:[{model,effort}],authEvidence:{loggedIn:true,authMethod:'claude.ai',subscriptionType:'max'},readVersion:async()=> '2.1.299 (Claude Code)',
    sourceEnv:{PATH:'/bin',HOME:'/Users/fixture',USER:'fixture',LOGNAME:'fixture',ANTHROPIC_API_KEY:'never-inherit',JEV_AI_API_KEY:'never-inherit',NODE_OPTIONS:'never-inherit'}};
  const environment=await createFrozenClaudeEnvironment(options);t.after(()=>environment.close());
  const args={out:join(dir,'out'),cwd,prompt:'Return the supplied small structured result.',schema,model,effort,spend:true,
    cliEnvironment:environment,validateAnswer:answer=>answer.ok===true,referencePricing:false};
  return {dir,binary,cwd,options,environment,args};
}
function fake(stdout,inspect=()=>{}) {return async (command,args,options)=>{inspect(command,args,options);options.onStdout(Buffer.from(stdout));return {exit_code:0,stdout};};}

test('native isolation preserves OAuth identity without inheriting API secrets or claiming CLI home side effects',async t=>{
  const f=await fixture(t),process=frozenClaudeProcessOptions(f.environment);
  assert.equal(process.env.HOME,'/Users/fixture');assert.equal(process.env.USER,'fixture');assert.equal(process.env.LOGNAME,'fixture');
  assert.equal(process.env.ANTHROPIC_API_KEY,undefined);assert.equal(process.env.JEV_AI_API_KEY,undefined);assert.equal(process.env.NODE_OPTIONS,undefined);
  assert.equal(f.environment.evidence.provider,'claude');assert.equal(f.environment.evidence.auth.logged_in,true);
  assert.equal(f.environment.evidence.models[0].actual_account_availability_verified,false);
  const args=claudeArguments({model,effort,schema});
  for (const flag of ['--safe-mode','--restricted','--disable-slash-commands','--no-session-persistence']) assert(args.includes(flag));
  assert.equal(args[args.indexOf('--tools')+1],'');assert(!args.includes('--bare'));assert(!args.includes('--fallback-model'));
  assert.deepEqual(f.environment.close(),{closed:true,module_direct_auth_or_home_writes:false,cli_home_side_effects:'unverified'});
  await assert.rejects(f.environment.verify(),{code:'CLAUDE_ENV_CLOSED'});
});

test('outer dispatch accepts only the macOS temporary OS alias while internal dispatch verifies the same canonical empty directory',async t=>{
  if(process.platform!=='darwin')return t.skip('macOS OS alias fixture requires darwin');
  const f=await fixture(t);assert(f.cwd.startsWith('/private/var/folders/'));
  const alias=f.cwd.slice('/private'.length);let outer=null,calls=0;
  const result=await runClaudeAttempt({...f.args,cwd:alias,beforeDispatch:async()=>{
    outer=await f.environment.verify({cwd:alias,model,effort});
  },run:fake(stream(),(_command,_args,options)=>{calls++;assert.equal(options.cwd,f.cwd);})});
  assert.equal(result.receipt.status,'completed');assert.equal(calls,1);
  assert.deepEqual(outer.workspace,{requested_cwd:alias,canonical_cwd:f.cwd,os_temporary_alias_used:true});
  const canonical=await f.environment.verify({cwd:f.cwd,model,effort});
  assert.equal(canonical.workspace.canonical_cwd,outer.workspace.canonical_cwd);
  assert.equal(canonical.workspace.os_temporary_alias_used,false);
  assert.equal(f.environment.evidence.workspace_path_policy.other_symlinks_allowed,false);
  const foreign=join(f.dir,'foreign-alias');symlinkSync(f.cwd,foreign);
  for(const path of [foreign,foreign.slice('/private'.length)]) {
    await assert.rejects(f.environment.verify({cwd:path,model,effort}),{code:'CLAUDE_ENV_WORKSPACE_NOT_EMPTY'});
  }
  writeFileSync(join(f.cwd,'unexpected.txt'),'not empty');
  await assert.rejects(f.environment.verify({cwd:alias,model,effort}),{code:'CLAUDE_ENV_WORKSPACE_NOT_EMPTY'});
  await assert.rejects(f.environment.verify({cwd:f.cwd,model,effort}),{code:'CLAUDE_ENV_WORKSPACE_NOT_EMPTY'});
});

test('one native invocation preserves final disjoint usage, counts cache once, records formatter separately and persists raw output',async t=>{
  const f=await fixture(t),stdout=stream();let calls=0;
  const result=await runClaudeAttempt({...f.args,referencePricing:true,run:fake(stdout,()=>calls++)});
  assert.equal(calls,1);assert.equal(result.receipt.status,'completed');assert.equal(result.receipt.usage.input_tokens,35);
  assert.equal(result.receipt.usage.total_tokens,38);assert.equal(result.receipt.usage.cached_input_tokens,20);
  assert.equal(result.receipt.usage.cache_creation_tokens,5);assert.equal(result.receipt.usage.output_tokens,3);
  assert.deepEqual(result.receipt.native_usage,native);assert.deepEqual(result.receipt.tools_used,[]);
  assert.equal(result.receipt.structured_output_tool_calls,1);assert.equal(result.receipt.actual_billed_usd,null);
  assert.equal(result.receipt.reference_pricing.usage_basis.uncached_input_tokens,10);
  assert.equal(readFileSync(join(f.args.out,'stream.jsonl'),'utf8'),stdout);
  assert.equal(JSON.parse(readFileSync(join(f.args.out,'receipt.json'))).usage.total_tokens,38);
  await assert.rejects(runClaudeAttempt({...f.args,run:fake(stdout)}),{code:'EEXIST'});
});

test('actual tool invocation or unisolated initialization cannot produce an accepted answer',async t=>{
  for (const [name,data,code] of [['tool',stream({tool:'Bash'}),'CLAUDE_TOOLS_USED'],
    ['skills',stream({initialization:{skills:['personal']}}),'CLAUDE_INITIALIZATION_NOT_ISOLATED']]) {
    const f=await fixture(t);f.args.out=join(f.dir,name);let calls=0;
    await assert.rejects(runClaudeAttempt({...f.args,run:fake(data,()=>calls++)}),{code});
    assert.equal(calls,1);assert.notEqual(JSON.parse(readFileSync(join(f.args.out,'receipt.json'))).status,'completed');
  }
});

test('quota denial is a terminal account failure with zero usage, never a retry or code-repair answer',async t=>{
  const f=await fixture(t);let calls=0;
  const stdout=JSON.stringify({type:'result',subtype:'error_during_execution',is_error:true,result:'You have hit your weekly usage limit',
    usage:{input_tokens:0,cache_read_input_tokens:0,cache_creation_input_tokens:0,output_tokens:0}})+'\n';
  await assert.rejects(runClaudeAttempt({...f.args,run:fake(stdout,()=>calls++)}),{code:'CLAUDE_ACCOUNT_LIMIT',outcome_uncertain:false});
  const receipt=JSON.parse(readFileSync(join(f.args.out,'receipt.json')));assert.equal(calls,1);assert.equal(receipt.status,'failed');
  assert.equal(receipt.usage.total_tokens,0);assert.equal(receipt.automatic_retries,0);
});

test('successful generated files containing every denial phrase are accepted; actual error terminals are classified without retry',async t=>{
  const denialText='not logged in; please log in; authentication required; invalid api key; oauth expired; '
    +'usage limit; rate limit; weekly limit; hit your limit; quota; credit balance; insufficient credit; out of usage; '
    +'model not found; model unavailable; model unsupported; model access; unknown model; invalid model';
  const f=await fixture(t);let calls=0;
  const answer={files:[{path:'client.py',content:`# Test error handling\nERROR_CASES = ${JSON.stringify(denialText)}\n`}],summary:'Implemented error messages.'};
  const stdout=stream({completion:{result:JSON.stringify(answer),structured_output:answer,errors:[],is_error:false,subtype:'success'}});
  const result=await runClaudeAttempt({...f.args,validateAnswer:x=>x.files?.length===1&&typeof x.files[0].content==='string',
    run:fake(stdout,()=>calls++)});
  assert.equal(calls,1);assert.deepEqual(result.answer,answer);assert.equal(result.receipt.failed_events,0);
  for(const [name,result,code,metadata] of [
    ['auth','Please log in.','CLAUDE_AUTH_REQUIRED',{subtype:'error_during_execution',is_error:true}],
    ['quota','You hit your weekly limit.','CLAUDE_ACCOUNT_LIMIT',{subtype:'error_during_execution',is_error:true}],
    ['model','Model unavailable for this account.','CLAUDE_MODEL_UNAVAILABLE',{subtype:'error_during_execution',is_error:true}],
    ['metadata','ordinary payload','CLAUDE_AUTH_REQUIRED',{subtype:'success',is_error:false,errors:['authentication required']}],
    ['generic','ordinary payload','CLAUDE_PROVIDER_FAILED',{subtype:'error_during_execution',is_error:false}]
  ]) {
    const fixtureData=await fixture(t);fixtureData.args.out=join(fixtureData.dir,name);let dispatches=0;
    await assert.rejects(runClaudeAttempt({...fixtureData.args,run:fake(stream({completion:{...metadata,result}}),()=>dispatches++)}),
      {code,outcome_uncertain:false});
    assert.equal(dispatches,1);
  }
});

test('model mismatch and missing structured output are rejected without natural-language fallback',async t=>{
  for (const [name,data,code] of [['model',stream({initialization:{model:'claude-sonnet-5-5'}}),'CLAUDE_MODEL_MISMATCH'],
    ['answer',stream({completion:{structured_output:null,result:'{"ok":true}'}}),'CLAUDE_STRUCTURED_ANSWER_INVALID']]) {
    const f=await fixture(t);f.args.out=join(f.dir,name);
    await assert.rejects(runClaudeAttempt({...f.args,run:fake(data)}),{code,outcome_uncertain:false});
  }
});

test('missing cache buckets are unknown and repeated assistant usage never substitutes for final aggregate',()=>{
  const parsed=parseClaudeTrace(stream({completion:{usage:{input_tokens:10,output_tokens:2}}}));
  assert.equal(parsed.usage,null);assert.equal(parsed.usage_complete,false);
  assert.throws(()=>parseClaudeTrace('{bad'),{code:'CLAUDE_STREAM_INVALID'});
});

test('only the exact observed builtin manifest bound to native version and SHA is allowed; thinking is a nonadditive output subset',()=>{
  const manifest=CLAUDE_BUILTIN_PLUGIN_MANIFEST;
  const binding={binarySha256:manifest.binary_sha256,version:manifest.version};
  const initial={plugins:structuredClone(manifest.plugins),claude_code_version:'2.1.299'};
  const trace=parseClaudeTrace(stream({initialization:initial,completion:{usage:{...native,output_tokens_details:{thinking_tokens:2}}}}));
  const evidence=inspectClaudeInitialization(trace,binding);
  assert.equal(evidence.reported_builtin_plugins.length,3);assert.equal(evidence.external_plugins_reported,0);
  assert.equal(evidence.builtin_plugin_semantics_verified,false);assert.equal(trace.usage.reasoning_output_tokens,2);
  assert.equal(trace.usage.output_tokens,3);assert.equal(trace.usage.total_tokens,38);
  for(const change of [{plugins:[{...initial.plugins[0],path:'/custom'},...initial.plugins.slice(1)]},
    {plugins:[...initial.plugins,{name:'custom',path:'builtin',source:'custom@builtin'}]},
    {plugins:[{...initial.plugins[0],source:'custom'},...initial.plugins.slice(1)]},{claude_code_version:'2.1.300'}]) {
    const modified=parseClaudeTrace(stream({initialization:{...initial,...change}}));
    assert.throws(()=>inspectClaudeInitialization(modified,binding),{code:'CLAUDE_INITIALIZATION_NOT_ISOLATED'});
  }
  assert.throws(()=>inspectClaudeInitialization(trace,{...binding,binarySha256:'0'.repeat(64)}),{code:'CLAUDE_INITIALIZATION_NOT_ISOLATED'});
  assert.equal(parseClaudeTrace(stream({completion:{usage:{...native,output_tokens_details:{thinking_tokens:4}}}})).usage_complete,false);
});

test('unsupported profile prevents dispatch; a changed native binary after dispatch makes outcome uncertain',async t=>{
  const f=await fixture(t);let calls=0;
  await assert.rejects(runClaudeAttempt({...f.args,effort:'high',run:fake(stream(),()=>calls++)}),{code:'CLAUDE_ENV_PROFILE_NOT_ALLOWED',outcome_uncertain:false});
  assert.equal(calls,0);
  f.args.out=join(f.dir,'after');
  await assert.rejects(runClaudeAttempt({...f.args,run:fake(stream(),()=>{calls++;writeFileSync(f.binary,Buffer.concat([Buffer.from('cffaedfe','hex'),Buffer.from('changed')]));})}),
    {code:'CLAUDE_ENV_BINARY_CHANGED',outcome_uncertain:true});
  assert.equal(calls,1);assert.equal(JSON.parse(readFileSync(join(f.args.out,'receipt.json'))).status,'uncertain');
});

test('partial output is uncertain; absent trusted OAuth attestation is rejected before spawning',async t=>{
  const f=await fixture(t);
  await assert.rejects(createFrozenClaudeEnvironment({...f.options,authEvidence:undefined}),{code:'CLAUDE_ENV_OAUTH_REQUIRED'});
  await assert.rejects(runClaudeAttempt({...f.args,run:fake('{"type":"system","subtype":"init"}\n')}),
    {code:'CLAUDE_RESULT_MISSING_OR_DUPLICATE',outcome_uncertain:true});
});
