import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,statSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createFrozenCodexEnvironment,frozenCodexProcessOptions} from '../src/benchmark/codex-environment.mjs';
import {runCodexAttempt} from '../src/benchmark/codex-provider.mjs';
const skills=[{name:'bundled',scope:'system',enabled:false,path:'skills/.system/bundled/SKILL.md',sha256:'fixed'}];
function fixture(t){const dir=mkdtempSync(join(tmpdir(),'frozen-env-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const auth=join(dir,'source');mkdirSync(auth);writeFileSync(join(auth,'auth.json'),'PRIVATE_TEST_AUTH');
 return {dir,auth,discover:async({account})=>({skills,auth:account?{type:'chatgpt',logged_in:true}:null,models:account?[{model:'test-model',supported_reasoning_efforts:['high']}]:null})};}
test('isolated HOME and private auth copy; evidence omits credentials; cleanup preserves source',async t=>{
 const f=fixture(t),environment=await createFrozenCodexEnvironment({command:process.execPath,sourceCodexHome:f.auth,discover:f.discover,model:'test-model',effort:'high'});
 t.after(()=>environment.close());const {env}=frozenCodexProcessOptions(environment);
 assert.notEqual(env.HOME,process.env.HOME);assert.notEqual(env.CODEX_HOME,f.auth);assert.equal(readFileSync(join(env.CODEX_HOME,'auth.json'),'utf8'),'PRIVATE_TEST_AUTH');
 assert.equal(statSync(join(env.CODEX_HOME,'auth.json')).mode&0o777,0o600);
 assert.equal(JSON.stringify(environment.evidence).includes('PRIVATE_TEST_AUTH'),false);assert.equal('OPENAI_API_KEY' in env,false);
 assert.equal((await environment.verify()).verified,true);assert.equal(environment.close().temporary_home_removed,true);
 assert.equal(readFileSync(join(f.auth,'auth.json'),'utf8'),'PRIVATE_TEST_AUTH');await assert.rejects(environment.verify(),/CODEX_ENV_CLOSED/);
});
test('config or discovered skill changes fail closed before any model submission',async t=>{
 const f=fixture(t);let changed=false;const environment=await createFrozenCodexEnvironment({command:process.execPath,sourceCodexHome:f.auth,
 discover:async x=>({...await f.discover(x),skills:changed?[...skills,{name:'new',enabled:true}]:skills})});t.after(()=>environment.close());
 changed=true;await assert.rejects(environment.verify(),/CODEX_ENV_DRIFT/);changed=false;
 const {env}=frozenCodexProcessOptions(environment);writeFileSync(join(env.CODEX_HOME,'config.toml'),'[features]\nplugins = true\n');
 let calls=0;const out=join(f.dir,'attempt');await assert.rejects(runCodexAttempt({out,cwd:f.dir,prompt:'Choose.',schema:{},model:'test-model',effort:'high',spend:true,
 cliEnvironment:environment,validateAnswer:()=>true,run:async()=>calls++}),/CODEX_ENV_DRIFT/);assert.equal(calls,0);
 assert.equal(JSON.parse(readFileSync(join(out,'receipt.json'))).process_submitted,false);
});
test('profile unsupported by same isolated model listing fails and deletes auth copy',async t=>{
 const f=fixture(t);let isolated;await assert.rejects(createFrozenCodexEnvironment({command:process.execPath,sourceCodexHome:f.auth,
 model:'absent',effort:'high',discover:async x=>{isolated=x.env.HOME;return f.discover(x);}}),/CODEX_ENV_MODEL_PROFILE_UNAVAILABLE/);
 assert.equal(existsSync(isolated),false);assert.equal(existsSync(join(f.auth,'auth.json')),true);
});
test('frozen provider loads only isolated config and passes controlled environment, retaining fingerprint',async t=>{
 const f=fixture(t),environment=await createFrozenCodexEnvironment({command:process.execPath,sourceCodexHome:f.auth,discover:f.discover});t.after(()=>environment.close());
 const result=await runCodexAttempt({out:join(f.dir,'attempt'),cwd:f.dir,prompt:'Choose.',schema:{},model:'test-model',effort:'high',spend:true,cliEnvironment:environment,validateAnswer:()=>true,
 run:async(command,args,options)=>{assert.equal(command,process.execPath);assert.equal(args.includes('--ignore-user-config'),false);assert.equal(args.includes('--strict-config'),true);
 assert.equal(options.env.HOME,frozenCodexProcessOptions(environment).env.HOME);const stdout=JSON.stringify({type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:1}});
 options.onStdout(stdout);writeFileSync(args[args.indexOf('--output-last-message')+1],'{}');return {exit_code:0,stdout};}});
 assert.equal(result.receipt.cli_environment,environment.evidence.fingerprint);
});

// The model cwd can have project/ancestor discovery unlike the cohort's empty probe cwd.
test('actual provider cwd is verified before and after execution; inherited skills block dispatch',async t=>{
 const f=fixture(t),observed=[];let contaminated=false;const environment=await createFrozenCodexEnvironment({command:process.execPath,sourceCodexHome:f.auth,
 discover:async x=>{observed.push(x.cwd);return {...await f.discover(x),skills:contaminated&&x.cwd===realpathSync(f.dir)?[...skills,{name:'inherited',enabled:true}]:skills};}});t.after(()=>environment.close());
 const before=observed.length;let calls=0;
 const options={cwd:f.dir,prompt:'Choose.',schema:{},model:'test-model',effort:'high',spend:true,cliEnvironment:environment,validateAnswer:()=>true,
 run:async(_command,args,{onStdout})=>{calls++;const stdout=JSON.stringify({type:'turn.completed',usage:{input_tokens:1,cached_input_tokens:0,output_tokens:1}});onStdout(stdout);writeFileSync(args[args.indexOf('--output-last-message')+1],'{}');return {exit_code:0,stdout};}};
 await runCodexAttempt({...options,out:join(f.dir,'clean-attempt')});assert.deepEqual(observed.slice(before),[realpathSync(f.dir),realpathSync(f.dir)]);assert.equal(calls,1);
 contaminated=true;await assert.rejects(runCodexAttempt({...options,out:join(f.dir,'blocked-attempt')}),/CODEX_ENV_DRIFT/);assert.equal(calls,1);
 assert.equal(JSON.parse(readFileSync(join(f.dir,'blocked-attempt','receipt.json'))).process_submitted,false);
});
