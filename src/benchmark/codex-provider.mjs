import {mkdirSync, readFileSync, openSync, writeSync, fsyncSync, closeSync, realpathSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {writePrivateJson} from './runner.mjs';
import {frozenCodexProcessOptions} from './codex-environment.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => {throw Object.assign(new Error(code), {code});};
const integer = n => Number.isSafeInteger(n) && n >= 0;
const safeCode = e => /^[A-Z][A-Z0-9_]+$/.test(e?.code) ? e.code : 'CODEX_ATTEMPT_FAILED';
function write(fd, data) {const bytes=Buffer.from(data);let offset=0;while(offset<bytes.length){const n=writeSync(fd,bytes,offset,bytes.length-offset);if(n<=0)fail("CODEX_RECORD_FAILED");offset+=n;}fsyncSync(fd);}

export function codexArguments({cwd, schemaPath, answerPath, model, effort, role, frozenEnvironment=false}) {
  if (!['decision','worker'].includes(role) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/.test(model ?? '')
      || !['low','medium','high','xhigh','max','ultra'].includes(effort)) fail('CODEX_PROFILE_INVALID');
  return ['exec',...(frozenEnvironment?['--strict-config']:['--ignore-user-config']),'--ephemeral','--skip-git-repo-check','--json',
    '--sandbox',role==='decision'?'read-only':'workspace-write','--cd',cwd,
    '--model',model,'--config',`model_reasoning_effort=${JSON.stringify(effort)}`,
    '--output-schema',schemaPath,'--output-last-message',answerPath,'-'];
}

/** Turn-completed usage is aggregated across turns, not across item updates. */
export function parseCodexTrace(stdout) {
  const rows=stdout.split('\n').filter(s=>s.trim()).map(line=>{try{return JSON.parse(line);}catch{fail('CODEX_STREAM_INVALID');}});
  const turns=rows.filter(e=>e.type==='turn.completed'), failures=rows.filter(e=>['turn.failed','error'].includes(e.type));
  const tools=rows.filter(e=>e.type==='item.completed' && ['command_execution','mcp_tool_call','web_search','file_change'].includes(e.item?.type));
  const fields=['input_tokens','cached_input_tokens','output_tokens'];
  let usage=null;
  if(turns.length && turns.every(t=>fields.every(k=>integer(t.usage?.[k])) && t.usage.cached_input_tokens<=t.usage.input_tokens)) {
    usage=Object.fromEntries(fields.map(k=>[k,turns.reduce((sum,t)=>sum+t.usage[k],0)]));
    usage.uncached_input_tokens=usage.input_tokens-usage.cached_input_tokens;
    usage.total_tokens=usage.input_tokens+usage.output_tokens; // Cache is already inside input.
    usage.reasoning_output_tokens=turns.every(t=>integer(t.usage.reasoning_output_tokens))
      ?turns.reduce((s,t)=>s+t.usage.reasoning_output_tokens,0):null; // Never add to output again.
  }
  const observed=[...new Set(rows.flatMap(e=>[e.model,e.item?.model]).filter(x=>typeof x==='string'))];
  return {completed_turns:turns.length,failed_events:failures.length,tools_used:tools.map(e=>e.item?.type),
    usage,usage_complete:turns.length>0 && usage!==null && failures.length===0,observed_models:observed};
}

// Deliberately no implicit 10-minute timeout. Cancellation/output failure is uncertain; no retry.
function execute(command,args,{cwd,input,onStdout,onStderr,signal,env:overrideEnv,maxBytes=16_000_000}) {
  return new Promise((resolveResult,reject)=>{
    if(signal?.aborted){reject(Object.assign(new Error('CODEX_CANCELLED'),{code:'CODEX_CANCELLED'}));return;}
    const env=overrideEnv??Object.fromEntries(['PATH','HOME','TMPDIR','LANG','LC_ALL','CODEX_HOME'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
    const child=spawn(command,args,{cwd,env,detached:true,stdio:['pipe','pipe','pipe']});
    let stopped=null,size=0;const chunks=[];
    const stop=code=>{stopped??=code;try{process.kill(-child.pid,'SIGKILL');}catch{child.kill('SIGKILL');}};
    const abort=()=>stop('CODEX_CANCELLED');signal?.addEventListener('abort',abort,{once:true});
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)return stop('CODEX_OUTPUT_LIMIT');
      try{onStdout(chunk);chunks.push(chunk);}catch{stop('CODEX_RECORD_FAILED');}});
    child.stderr.on('data',chunk=>{size+=chunk.length;if(size>maxBytes)return stop('CODEX_OUTPUT_LIMIT');
      try{onStderr(chunk);}catch{stop('CODEX_RECORD_FAILED');}});
    child.on('error',()=>{signal?.removeEventListener('abort',abort);reject(Object.assign(new Error('CODEX_PROCESS_START_FAILED'),{code:'CODEX_PROCESS_START_FAILED'}));});
    child.on('close',(exit_code,exitSignal)=>{signal?.removeEventListener('abort',abort);try{process.kill(-child.pid,'SIGTERM');}catch{}resolveResult({exit_code,stdout:Buffer.concat(chunks).toString('utf8'),
      interrupted:stopped,outcome_uncertain:Boolean(stopped||exitSignal)});});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}

/** Standalone adapter: never loads Claude config, Jev credentials or the shared ledger. */
export async function runCodexAttempt({out,cwd,prompt,schema,model,effort,role='decision',spend=false,
  validateAnswer,signal,command='codex',run=execute,beforeDispatch=()=>{},cliEnvironment=null,referencePricing=false}) {
  if(!spend)fail('EXPLICIT_SPEND_REQUIRED');
  if(![false,true,'v1','v2'].includes(referencePricing))fail('CODEX_PRICING_MODE_INVALID');
  const pricingVersion=referencePricing==='v2'?'v2':'v1';
  const pricing=referencePricing?await import('./codex-pricing.mjs'):null;
  pricing?.assertCodexPricingSource(null,{version:pricingVersion});
  if(typeof prompt!=='string'||!prompt.trim()||!schema||typeof validateAnswer!=='function')fail('CODEX_INPUT_INVALID');
  const work=realpathSync(cwd),directory=resolve(out);
  const args=codexArguments({cwd:work,schemaPath:join(directory,'schema.json'),answerPath:join(directory,'answer.json'),model,effort,role,frozenEnvironment:Boolean(cliEnvironment)});
  mkdirSync(directory,{mode:0o700}); // Existing evidence can never be resumed/overwritten.
  const save=(name,value)=>writePrivateJson(join(directory,name),value);
  save('schema.json',schema);save('request.json',{provider:'codex',role,prompt,model,effort,cwd:work,args,
    ...(pricing?{reference_pricing_contract:pricing.codexPricingContract({version:pricingVersion}).source}:{}),
    cli_environment:cliEnvironment?.evidence.fingerprint??null,prompt_sha256:hash(prompt),schema_sha256:hash(JSON.stringify(schema)),automatic_retries:0});
  let stdoutFd,stderrFd;
  const began=performance.now();let submitted=false,raw=null,trace=null,receipt;
  const referenceFields=(safe=false)=>{
    if(!pricing)return {};
    try{return {reference_pricing:pricing.codexReferencePricing({requestedModel:model,pricingVersion,usage:trace?.usage??null,
      usageComplete:trace?.usage_complete??false,observedModels:trace?.observed_models??[],
      traceDetails:raw?.stdout?pricing.codexPricingTraceDetails(raw.stdout):null})};}
    catch(error){if(!safe)throw error;return {reference_pricing:{schema_version:`codex-reference-pricing-result/${pricingVersion}`,status:'blocked',
      requested_model:model,contract_source:pricing.codexPricingContract({version:pricingVersion}).source,reason:safeCode(error),
      short_standard:{usd:null},long_standard:{usd:null},strict_api_equivalent_usd:null,actual_billed_usd:null}};}
  };
  try {
    stdoutFd=openSync(join(directory,'stream.jsonl'),'wx',0o600);stderrFd=openSync(join(directory,'stderr.log'),'wx',0o600);
    save('dispatch.json',{provider:'codex',role,requested_model:model,requested_effort:effort,at:new Date().toISOString()});
    pricing?.assertCodexPricingSource(null,{version:pricingVersion});
    await beforeDispatch();
    const environment=cliEnvironment?frozenCodexProcessOptions(cliEnvironment):null;
    if(cliEnvironment)await cliEnvironment.verify({cwd:work});
    submitted=true;
    raw=await run(environment?.command??command,args,{cwd:work,input:prompt,onStdout:c=>write(stdoutFd,c),onStderr:c=>write(stderrFd,c),signal,env:environment?.env});
    trace=parseCodexTrace(raw.stdout);
    if(cliEnvironment)await cliEnvironment.verify({cwd:work});
    if(raw.outcome_uncertain)fail(raw.interrupted??'CODEX_OUTCOME_UNCERTAIN');
    if(raw.exit_code!==0||trace.failed_events||!trace.completed_turns)fail('CODEX_PROVIDER_FAILED');
    if(trace.observed_models.some(value=>value!==model))fail('CODEX_MODEL_MISMATCH');
    if(!trace.usage_complete)fail('CODEX_USAGE_MISSING');
    if(role==='decision'&&trace.tools_used.length)fail('CODEX_DECISION_USED_TOOLS');
    const answerBytes=readFileSync(join(directory,'answer.json'));
    let answer;try{answer=JSON.parse(answerBytes);}catch{fail('CODEX_ANSWER_INVALID');}
    if(validateAnswer(answer)!==true)fail('CODEX_ANSWER_INVALID');
    receipt={provider:'codex',role,status:'completed',wall_ms:performance.now()-began,requested_model:model,requested_effort:effort,
      ...trace,...referenceFields(),model_identity_verified:trace.observed_models.length===1?trace.observed_models[0]===model:null,
      cli_environment:cliEnvironment?.evidence.fingerprint??null,effective_effort_verified:null,actual_billed_usd:null,api_equivalent_usd:null,automatic_retries:0,
      answer_sha256:hash(answerBytes),process_submitted:submitted,outcome_uncertain:false};
    save('receipt.json',receipt); // No accepted output until its evidence is durable.
    return {answer,receipt};
  } catch(error) {
    if(['CODEX_PROCESS_START_FAILED','CODEX_CANCELLED'].includes(error.code)&&raw===null)submitted=false;
    if(!receipt)save('receipt.json',{provider:'codex',role,status:raw?.outcome_uncertain||(submitted&&(error.outcome_uncertain===true||!raw))?'uncertain':'failed',
      cli_environment:cliEnvironment?.evidence.fingerprint??null,code:safeCode(error),wall_ms:performance.now()-began,requested_model:model,requested_effort:effort,
      process_submitted:submitted,usage:trace?.usage??null,usage_complete:trace?.usage_complete??false,...referenceFields(true),
      actual_billed_usd:null,api_equivalent_usd:null,automatic_retries:0});
    if(receipt)Object.assign(error,{code:'CODEX_RECEIPT_PERSISTENCE_FAILED',outcome_uncertain:true});
    throw error;
  } finally {if(stdoutFd!==undefined)closeSync(stdoutFd);if(stderrFd!==undefined)closeSync(stderrFd);}
}
