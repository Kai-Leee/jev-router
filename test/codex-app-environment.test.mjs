import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,existsSync,rmSync,realpathSync,statSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {createAppBundledCodexEnvironment,frozenCodexProcessOptions} from '../src/benchmark/codex-environment.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const skills=[{name:'bundled',scope:'system',enabled:false,path:'skills/.system/mock/SKILL.md',sha256:'fixed'}];
function fixture(t){
  const dir=realpathSync(mkdtempSync(join(tmpdir(),'codex-app-env-test-')));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const binary=join(dir,'codex'),auth=join(dir,'source'),contractPath=join(dir,'app-binary.json');mkdirSync(auth);
  const bytes=Buffer.concat([Buffer.from('cffaedfe','hex'),Buffer.from('LOCAL MOCK MACH-O; NEVER EXECUTED')]);
  writeFileSync(binary,bytes,{mode:0o755});writeFileSync(join(auth,'auth.json'),'PRIVATE_LOCAL_AUTH');
  writeFileSync(join(auth,'models_cache.json'),'OLD_MODEL_CACHE');
  const contract={schema_version:'codex-app-binary/v1',platform:'darwin',format:'mach-o',path:binary,
    sha256:sha(bytes),version:'0.162.0-alpha.17.2'};writeFileSync(contractPath,JSON.stringify(contract));
  const calls=[],versionCalls=[];
  const options={contractPath,sourceCodexHome:auth,readVersion:async path=>{versionCalls.push(path);return `codex-cli ${contract.version}`;},
    discover:async x=>{calls.push(x);return {skills,auth:x.account?{logged_in:true,type:'chatgpt'}:null,
      models:x.account?[{model:'gpt-6.1-sol',supported_reasoning_efforts:['high']}]:null};}};
  return {dir,binary,auth,contractPath,contract,calls,versionCalls,options};
}
test('app opt-in pins direct Mach-O, version, private auth, cold model discovery and fingerprint',async t=>{
  const f=fixture(t),environment=await createAppBundledCodexEnvironment(f.options);t.after(()=>environment.close());
  const processOptions=frozenCodexProcessOptions(environment);assert.equal(processOptions.command,f.binary);
  assert.equal(environment.evidence.app_binary.path,f.binary);assert.equal(environment.evidence.app_binary.sha256,f.contract.sha256);
  assert.equal(environment.evidence.app_binary.version,f.contract.version);assert.equal(environment.evidence.models_cache_inherited,false);
  assert.equal(environment.evidence.app_binary.contract.sha256,sha(readFileSync(f.contractPath)));
  assert.equal(existsSync(join(processOptions.env.CODEX_HOME,'models_cache.json')),false);
  assert.equal(readFileSync(join(processOptions.env.CODEX_HOME,'auth.json'),'utf8'),'PRIVATE_LOCAL_AUTH');
  assert.equal(statSync(join(processOptions.env.CODEX_HOME,'auth.json')).mode&0o777,0o600);
  assert.equal(JSON.stringify(environment.evidence).includes('PRIVATE_LOCAL_AUTH'),false);
  assert.equal(JSON.stringify(environment.evidence).includes('OLD_MODEL_CACHE'),false);
  assert.equal((await environment.verify({cwd:f.dir})).fingerprint,environment.evidence.fingerprint);
  assert.ok(f.versionCalls.length>=7);assert.ok(f.calls.every(x=>x.command===f.binary));
  assert.equal(environment.close().temporary_home_removed,true);
  assert.equal(readFileSync(join(f.auth,'auth.json'),'utf8'),'PRIVATE_LOCAL_AUTH');
});
test('shell launcher rejected before discovery, auth copy or version execution',async t=>{
  const f=fixture(t);writeFileSync(f.binary,'#!/bin/sh\nexec other-codex\n');
  const contract={...f.contract,sha256:sha(readFileSync(f.binary))};writeFileSync(f.contractPath,JSON.stringify(contract));
  await assert.rejects(createAppBundledCodexEnvironment(f.options),/CODEX_APP_NOT_MACH_O/);
  assert.equal(f.calls.length,0);assert.equal(f.versionCalls.length,0);
});
test('D091 app profile allowlist is explicit, discovered and enforced without changing isolated settings',async t=>{
  const f=fixture(t),discover=f.options.discover;
  const allowedProfiles=[{model:'gpt-6.1-sol',effort:'high'},{model:'gpt-6-luna',effort:'high'}];
  const environment=await createAppBundledCodexEnvironment({...f.options,allowedProfiles,discover:async options=>{
    const result=await discover(options);if(options.account)result.models.push({model:'gpt-6-luna',supported_reasoning_efforts:['high']});return result;
  }});t.after(()=>environment.close());
  assert.deepEqual(environment.evidence.allowed_profiles,allowedProfiles);
  assert.equal(environment.evidence.models_cache_inherited,false);assert.equal(environment.evidence.enabled_skills,0);
  assert.equal((await environment.verify({cwd:f.dir,model:'gpt-6-luna',effort:'high'})).verified,true);
  await assert.rejects(environment.verify({model:'gpt-6-astra',effort:'high'}),/CODEX_ENV_PROFILE_NOT_ALLOWED/);
  assert.equal(frozenCodexProcessOptions(environment).command,f.binary);
});
test('pre-discovery hash or version mismatch blocks all discovery',async t=>{
  const f=fixture(t);writeFileSync(f.binary,Buffer.concat([Buffer.from('cffaedfe','hex'),Buffer.from('changed')]));
  await assert.rejects(createAppBundledCodexEnvironment(f.options),/CODEX_APP_BINARY_DRIFT/);assert.equal(f.calls.length,0);
  writeFileSync(f.binary,Buffer.concat([Buffer.from('cffaedfe','hex'),Buffer.from('LOCAL MOCK MACH-O; NEVER EXECUTED')]));
  await assert.rejects(createAppBundledCodexEnvironment({...f.options,readVersion:async()=> 'codex-cli 0.162.0-alpha.17.3'}),/CODEX_APP_VERSION_DRIFT/);
  assert.equal(f.calls.length,0);
});
test('app change during discovery rejects setup and cleans temporary HOME',async t=>{
  const f=fixture(t);let isolated;
  await assert.rejects(createAppBundledCodexEnvironment({...f.options,discover:async x=>{isolated=x.env.HOME;const result=await f.options.discover(x);
    writeFileSync(f.binary,Buffer.concat([Buffer.from('cffaedfe','hex'),Buffer.from('APP UPDATED')]));return result;}}),/CODEX_APP_BINARY_DRIFT/);
  assert.equal(existsSync(isolated),false);assert.equal(readFileSync(join(f.auth,'auth.json'),'utf8'),'PRIVATE_LOCAL_AUTH');
});
test('every verify checks the binary, exact version, actual cwd and unchanged skill list',async t=>{
  const f=fixture(t);let version=`codex-cli ${f.contract.version}`;
  const environment=await createAppBundledCodexEnvironment({...f.options,readVersion:async()=>version});t.after(()=>environment.close());
  const count=f.calls.length;await environment.verify({cwd:f.dir});assert.equal(f.calls.at(-1).cwd,f.dir);assert.equal(f.calls.length,count+1);
  version='codex-cli 0.163.0';await assert.rejects(environment.verify({cwd:f.dir}),/CODEX_APP_VERSION_DRIFT/);
  version=`codex-cli ${f.contract.version}`;writeFileSync(f.binary,'different binary');
  await assert.rejects(environment.verify({cwd:f.dir}),/CODEX_ENV_DRIFT|CODEX_APP_NOT_MACH_O|CODEX_APP_BINARY_DRIFT/);
});
test('post-discovery skill or app-contract drift is never accepted',async t=>{
  const f=fixture(t);let changed=false;
  const environment=await createAppBundledCodexEnvironment({...f.options,discover:async x=>({...await f.options.discover(x),skills:changed?[...skills,{name:'unexpected',enabled:true}]:skills})});
  t.after(()=>environment.close());changed=true;await assert.rejects(environment.verify({cwd:f.dir}),/CODEX_ENV_DRIFT/);changed=false;
  writeFileSync(f.contractPath,JSON.stringify({...f.contract,version:'0.163.0'}));
  await assert.rejects(environment.verify({cwd:f.dir}),/CODEX_APP_CONTRACT_DRIFT/);
});
test('requested 6.1/high must be present in cold model listing; profile failure removes auth copy',async t=>{
  const f=fixture(t);let home;
  await assert.rejects(createAppBundledCodexEnvironment({...f.options,discover:async x=>{home=x.env.HOME;return {...await f.options.discover(x),
    models:x.account?[{model:'gpt-5.6-sol',supported_reasoning_efforts:['high']}]:null};}}),/CODEX_ENV_MODEL_PROFILE_UNAVAILABLE/);
  assert.equal(existsSync(home),false);assert.equal(existsSync(join(f.auth,'auth.json')),true);
});
