import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync, existsSync, rmSync, statSync} from 'node:fs';
import {join, resolve, relative, delimiter} from 'node:path';
import {tmpdir, homedir} from 'node:os';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(x).digest('hex');
const fail=code=>{throw Object.assign(new Error(code),{code});};
const CONFIG='project_doc_max_bytes = 0\ndeveloper_instructions = ""\n[features]\nplugins = false\napps = false\nhooks = false\nmemories = false\nmulti_agent = false\n';
const active=new WeakMap();
function executable(command,path=process.env.PATH??'') {
  const candidates=command.includes('/')?[resolve(command)]:path.split(delimiter).map(p=>join(p,command));
  const found=candidates.find(p=>{try{return statSync(p).isFile();}catch{return false;}});
  if(!found)fail('CODEX_ENV_COMMAND_MISSING');return realpathSync(found);
}
/** No turns/threads are started. Only local capability discovery and optional account/model reads. */
async function discovery({command,env,cwd,disable=false,account=false,timeoutMs=25000}) {
  const p=spawn(command,['app-server','--stdio','--strict-config'],{cwd,env,stdio:['pipe','pipe','pipe']});
  let buffer='',counter=0,closed=false;const pending=new Map();
  const rejectAll=()=>{closed=true;for(const q of pending.values())q.reject(Object.assign(new Error('CODEX_ENV_DISCOVERY_FAILED'),{code:'CODEX_ENV_DISCOVERY_FAILED'}));pending.clear();};
  const exit=new Promise(r=>p.on('close',r));p.on('error',rejectAll);p.on('close',rejectAll);
  p.stderr.on('data',()=>{}); // Never persist raw account/auth/server diagnostics.
  p.stdout.on('data',chunk=>{buffer+=chunk;if(buffer.length>8_000_000){p.kill('SIGKILL');return;}let i;
    while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);let row;try{row=JSON.parse(line);}catch{continue;}
      const q=pending.get(row.id);if(!q)continue;pending.delete(row.id);row.error?q.reject(Object.assign(new Error('CODEX_ENV_RPC_FAILED'),{code:'CODEX_ENV_RPC_FAILED'})):q.resolve(row.result);}});
  p.stdin.on('error',()=>{});
  const rpc=(method,params)=>new Promise((resolve,reject)=>{if(closed){reject(Object.assign(new Error('CODEX_ENV_DISCOVERY_FAILED'),{code:'CODEX_ENV_DISCOVERY_FAILED'}));return;}
    const id=++counter;pending.set(id,{resolve,reject});p.stdin.write(JSON.stringify({id,method,params})+'\n');});
  const timer=setTimeout(()=>{p.kill('SIGKILL');rejectAll();},timeoutMs);
  try {
    await rpc('initialize',{clientInfo:{name:'pointsman-frozen-cli',version:'1.0'}});p.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
    let list=await rpc('skills/list',{cwds:[cwd],forceReload:true});
    if(disable){for(const skill of list.data.flatMap(e=>e.skills))await rpc('skills/config/write',{name:skill.name,enabled:false});list=await rpc('skills/list',{cwds:[cwd],forceReload:true});}
    if(list.data.length!==1||list.data.some(e=>e.errors.length))fail('CODEX_ENV_DISCOVERY_INVALID');
    const skills=list.data.flatMap(e=>e.skills).map(s=>({name:s.name,scope:s.scope,enabled:s.enabled,path:relative(env.CODEX_HOME,s.path),sha256:hash(readFileSync(s.path))})).sort((a,b)=>a.name.localeCompare(b.name));
    if(skills.some(s=>s.enabled||s.path.startsWith('..')||s.scope!=='system'))fail('CODEX_ENV_SKILLS_NOT_FROZEN');
    let auth=null,models=null;
    if(account){const a=await rpc('account/read',{refreshToken:false});auth={logged_in:Boolean(a.account),type:a.account?.type??null};
      const modelRows=[];let cursor=null;do{const page=await rpc('model/list',{includeHidden:true,limit:100,cursor});modelRows.push(...page.data);cursor=page.nextCursor;}while(cursor);
      models=modelRows.map(m=>({id:m.id,model:m.model,is_default:m.isDefault,default_reasoning_effort:m.defaultReasoningEffort,supported_reasoning_efforts:m.supportedReasoningEfforts?.map(x=>x.reasoningEffort)}));}
    return {skills,auth,models};
  } finally {clearTimeout(timer);p.kill('SIGTERM');const kill=setTimeout(()=>p.kill('SIGKILL'),1000);await exit;clearTimeout(kill);}
}

/** Owns a temporary private HOME; auth is copied, never symlinked or included in evidence. */
export async function createFrozenCodexEnvironment({command='codex',sourceCodexHome=process.env.CODEX_HOME??join(homedir(),'.codex'),model,effort,
  discover=discovery,requireAuth=true,copyModelsCache=true,allowedProfiles,allowedProfileCandidates}={}) {
  const home=realpathSync(mkdtempSync(join(tmpdir(),'pointsman-frozen-cli-'))),codexHome=join(home,'.codex'),cwd=join(home,'work');
  mkdirSync(codexHome,{mode:0o700});mkdirSync(cwd,{mode:0o700});
  const env=Object.fromEntries(['PATH','TMPDIR','LANG','LC_ALL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));Object.assign(env,{HOME:home,CODEX_HOME:codexHome});
  try {
    if(allowedProfiles!==undefined&&allowedProfileCandidates!==undefined)fail('CODEX_ENV_ALLOWED_PROFILES_INVALID');
    let permitted=allowedProfiles===undefined?null:structuredClone(allowedProfiles);
    const candidates=allowedProfileCandidates===undefined?null:structuredClone(allowedProfileCandidates);
    const validateProfiles=rows=>Array.isArray(rows)&&rows.length&&rows.every(row=>row&&Object.keys(row).sort().join(',')==='effort,model'
      &&typeof row.model==='string'&&row.model&&typeof row.effort==='string'&&row.effort)
      &&new Set(rows.map(row=>`${row.model}:${row.effort}`)).size===rows.length;
    if(allowedProfileCandidates!==undefined&&!validateProfiles(candidates))fail('CODEX_ENV_ALLOWED_PROFILES_INVALID');
    if(allowedProfiles!==undefined&&(!Array.isArray(permitted)||!permitted.length||permitted.some(row=>!row||Object.keys(row).sort().join(',')!=='effort,model'
      ||typeof row.model!=='string'||!row.model||typeof row.effort!=='string'||!row.effort)
      ||new Set(permitted.map(row=>`${row.model}:${row.effort}`)).size!==permitted.length))fail('CODEX_ENV_ALLOWED_PROFILES_INVALID');
    if(permitted){for(const row of permitted)Object.freeze(row);Object.freeze(permitted);}
    const path=executable(command);writeFileSync(join(codexHome,'config.toml'),CONFIG,{mode:0o600,flag:'wx'});
    await discover({command:path,env,cwd,disable:true});
    // A private copy permits local refresh without mutating the user's original credentials.
    if(requireAuth){const authPath=join(sourceCodexHome,'auth.json');if(!existsSync(authPath))fail('CODEX_ENV_AUTH_FILE_REQUIRED');
      writeFileSync(join(codexHome,'auth.json'),readFileSync(authPath),{mode:0o600,flag:'wx'});}
    const cache=join(sourceCodexHome,'models_cache.json');if(copyModelsCache&&existsSync(cache))writeFileSync(join(codexHome,'models_cache.json'),readFileSync(cache),{mode:0o600,flag:'wx'});
    const initial=await discover({command:path,env,cwd,account:requireAuth});
    if(requireAuth&&initial.auth?.type!=='chatgpt')fail('CODEX_ENV_CHATGPT_AUTH_REQUIRED');
    if(candidates){
      permitted=candidates.filter(row=>initial.models?.some(m=>m.model===row.model&&m.supported_reasoning_efforts?.includes(row.effort)));
      if(!permitted.length)fail('CODEX_ENV_MODEL_PROFILE_UNAVAILABLE');
      for(const row of permitted)Object.freeze(row);Object.freeze(permitted);
    }
    if(model&&!initial.models?.some(m=>m.model===model&&(!effort||m.supported_reasoning_efforts?.includes(effort))))fail('CODEX_ENV_MODEL_PROFILE_UNAVAILABLE');
    if(permitted&&permitted.some(row=>!initial.models?.some(m=>m.model===row.model&&m.supported_reasoning_efforts?.includes(row.effort))))
      fail('CODEX_ENV_MODEL_PROFILE_UNAVAILABLE');
    if(permitted&&model&&!permitted.some(row=>row.model===model&&(!effort||row.effort===effort)))fail('CODEX_ENV_PROFILE_NOT_ALLOWED');
    const core={version:'frozen-codex-cli-v1',command_sha256:hash(readFileSync(path)),config_sha256:hash(readFileSync(join(codexHome,'config.toml'))),skills:initial.skills,
      enabled_skills:0,global_home_inherited:false,project_instructions_max_bytes:0,plugins_enabled:false,apps_enabled:false,hooks_enabled:false,memories_enabled:false,model_calls:0,
      ...(permitted?{allowed_profiles:permitted}:{}),
      ...(candidates?{profile_availability_basis:'registered_candidates_intersect_actual_application_discovery',
        excluded_profile_candidates:candidates.filter(row=>!permitted.some(p=>p.model===row.model&&p.effort===row.effort))}:{})};
    const fingerprint=hash(JSON.stringify(core));let cleaned=false;
    const handle={evidence:{...core,fingerprint,auth:initial.auth,models:initial.models,auth_copy:'temporary-private-copy-not-persisted'},
      async verify({cwd:actualCwd=cwd,model:requestedModel,effort:requestedEffort}={}){if(cleaned)fail('CODEX_ENV_CLOSED');
        if(permitted&&(requestedModel!==undefined||requestedEffort!==undefined)&&!permitted.some(row=>row.model===requestedModel&&row.effort===requestedEffort))fail('CODEX_ENV_PROFILE_NOT_ALLOWED');
        if(hash(readFileSync(path))!==core.command_sha256||hash(readFileSync(join(codexHome,'config.toml')))!==core.config_sha256)fail('CODEX_ENV_DRIFT');
        const now=await discover({command:path,env,cwd:realpathSync(actualCwd)});if(JSON.stringify(now.skills)!==JSON.stringify(core.skills))fail('CODEX_ENV_DRIFT');return {fingerprint,verified:true};},
      close(){if(!cleaned){rmSync(home,{recursive:true,force:true});cleaned=true;}return {temporary_home_removed:!existsSync(home)};}};
    active.set(handle,{env,command:path});return handle;
  }catch(error){rmSync(home,{recursive:true,force:true});throw error;}
}
export function frozenCodexProcessOptions(handle){const value=active.get(handle);if(!value)fail('CODEX_ENV_INVALID');return {command:value.command,env:{...value.env}};}

const APP_CONTRACT=resolve(import.meta.dirname,'../../docs/orchestration/contracts/codex-app-binary.v1.json');
const MACH_O_MAGICS=new Set(['cffaedfe','feedfacf','cafebabe','bebafeca','cafebabf','bfbafeca']);
async function appVersion(command) {
  return new Promise((accept,reject)=>{
    const env=Object.fromEntries(['PATH','TMPDIR','LANG','LC_ALL'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
    const child=spawn(command,['--version'],{env,stdio:['ignore','pipe','pipe']});let text='',settled=false;
    const finish=(error)=>{if(settled)return;settled=true;clearTimeout(timer);error?reject(Object.assign(new Error(error),{code:error})):accept(text.trim());};
    const timer=setTimeout(()=>{child.kill('SIGKILL');finish('CODEX_APP_VERSION_UNAVAILABLE');},10000);
    child.stdout.on('data',chunk=>{text+=chunk;if(text.length>4096){child.kill('SIGKILL');finish('CODEX_APP_VERSION_UNAVAILABLE');}});
    child.stderr.on('data',()=>{});child.on('error',()=>finish('CODEX_APP_VERSION_UNAVAILABLE'));
    child.on('close',code=>finish(code===0?null:'CODEX_APP_VERSION_UNAVAILABLE'));
  });
}

/** Opt-in D090 application binary binding. Legacy PATH discovery remains the default above.
 * Test seams permit local fake binaries/discovery; production uses the pinned contract and --version only.
 * No authentication response or source credential contents enter the evidence. */
export async function createAppBundledCodexEnvironment({model='gpt-6.1-sol',effort='high',sourceCodexHome,
  discover=discovery,requireAuth=true,readVersion=appVersion,contractPath=APP_CONTRACT,allowedProfiles,allowedProfileCandidates}={}) {
  const contractBytes=readFileSync(contractPath),contract=JSON.parse(contractBytes),contractHash=hash(contractBytes);
  if(contract.schema_version!=='codex-app-binary/v1'||contract.platform!=='darwin'||contract.format!=='mach-o'
    ||typeof contract.path!=='string'||!contract.path.startsWith('/')||resolve(contract.path)!==contract.path
    ||!/^[a-f0-9]{64}$/.test(contract.sha256??'')||!/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(contract.version??''))fail('CODEX_APP_CONTRACT_INVALID');
  const appBinary={path:contract.path,sha256:contract.sha256,version:contract.version,format:contract.format,
    contract:{path:relative(resolve(import.meta.dirname,'../..'),resolve(contractPath)),sha256:contractHash}};
  const check=async()=>{
    if(hash(readFileSync(contractPath))!==contractHash)fail('CODEX_APP_CONTRACT_DRIFT');
    let bytes;try{if(realpathSync(contract.path)!==contract.path)fail('CODEX_APP_PATH_DRIFT');bytes=readFileSync(contract.path);}
    catch(error){if(error.code?.startsWith('CODEX_APP_'))throw error;fail('CODEX_APP_BINARY_UNAVAILABLE');}
    if(!MACH_O_MAGICS.has(bytes.subarray(0,4).toString('hex')))fail('CODEX_APP_NOT_MACH_O');
    if(hash(bytes)!==contract.sha256)fail('CODEX_APP_BINARY_DRIFT');
    const observed=await readVersion(contract.path);
    if(observed!==contract.version&&observed!==`codex-cli ${contract.version}`)fail('CODEX_APP_VERSION_DRIFT');
    return {verified:true,...appBinary};
  };
  await check(); // No temporary credentials or discovery before the application is verified.
  const guardedDiscover=async options=>{
    await check();const result=await discover(options);await check();return result;
  };
  const environment=await createFrozenCodexEnvironment({command:contract.path,...(sourceCodexHome===undefined?{}:{sourceCodexHome}),
    model,effort,discover:guardedDiscover,requireAuth,copyModelsCache:false,...(allowedProfiles===undefined?{}:{allowedProfiles}),
    ...(allowedProfileCandidates===undefined?{}:{allowedProfileCandidates})});
  const priorEvidence=environment.evidence,verifyFrozen=environment.verify.bind(environment);
  const fingerprint=hash(JSON.stringify({version:'frozen-codex-app-cli-v1',legacy_fingerprint:priorEvidence.fingerprint,app_binary:appBinary,
    models_cache_inherited:false}));
  environment.evidence={...priorEvidence,version:'frozen-codex-app-cli-v1',fingerprint,app_binary:appBinary,
    codex_cli_version:contract.version,models_cache_inherited:false};
  environment.verify=async options=>{await verifyFrozen(options);return {fingerprint,verified:true,app_binary:appBinary};};
  return environment;
}
