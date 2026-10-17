#!/usr/bin/env node
import {resolve} from 'node:path';
import {inspectCodexE2E,runCodexE2EArm,runCodexE2EPair,runCodexE2ECohort,withCodexE2ELock,compareCodexE2E,validateCodexE2EHost,CODEX_E2E_CALIBRATED_MANIFEST} from '../src/benchmark/codex-e2e-runner.mjs';
const args=process.argv.slice(2),command=args.shift()??'check',options={};
const allowed=new Set(['out','provider','model','effort','left','right','grade-manifest','probe','spend','execution-host','manifest']);
const fail=code=>{throw Object.assign(new Error(code),{code});};
const controller=new AbortController();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
try {
  while(args.length){const key=args.shift();if(!key.startsWith('--')||!allowed.has(key.slice(2))||Object.hasOwn(options,key.slice(2)))fail('CODEX_E2E_ARGUMENT_INVALID');
    options[key.slice(2)]=['--probe','--spend'].includes(key)?true:args.shift();
    if(options[key.slice(2)]===undefined)fail('CODEX_E2E_ARGUMENT_MISSING');}
  let result;
  if(command==='check')result=await inspectCodexE2E({probe:options.probe===true,signal:controller.signal,manifestPath:options.manifest??CODEX_E2E_CALIBRATED_MANIFEST});
  else if(command==='compare') {
    if(!options.left||!options.right)fail('CODEX_E2E_PAIR_PATH_REQUIRED');
    result=compareCodexE2E(resolve(options.left),resolve(options.right));
  } else if(['run','pair','cohort','route'].includes(command)) {
    if(!options.spend)fail('EXPLICIT_SPEND_REQUIRED');
    validateCodexE2EHost(options['execution-host']??'cloud');
    if(command==='route'){
      if(options.provider&&options.provider!=='jev'||options.manifest&&options.manifest!==CODEX_E2E_CALIBRATED_MANIFEST)fail('CODEX_E2E_RUN_ARGUMENTS_REQUIRED');
      options.provider='jev';options.manifest=CODEX_E2E_CALIBRATED_MANIFEST;
    }
    if(!options.out||(command==='run'&&!['codex','jev'].includes(options.provider)))fail('CODEX_E2E_RUN_ARGUMENTS_REQUIRED');
    result=await withCodexE2ELock(resolve(import.meta.dirname,'..'),()=>(command==='cohort'?runCodexE2ECohort:command==='pair'?runCodexE2EPair:runCodexE2EArm)({out:resolve(options.out),provider:options.provider,
      model:options.model??'gpt-6.1-sol',effort:options.effort??'high',executionHost:options['execution-host']??'cloud',spend:true,signal:controller.signal,gradeManifest:options['grade-manifest'],manifestPath:options.manifest}));
  } else fail('CODEX_E2E_COMMAND_INVALID');
  console.log(JSON.stringify(result,null,2));if(['failed','uncertain','stopped'].includes(result.status))process.exitCode=2;
} catch(error) {console.error(JSON.stringify({status:'blocked',code:/^[A-Z][A-Z0-9_]+$/.test(error.code??'')?error.code:'CODEX_E2E_FAILED',automatic_retries:0}));process.exitCode=2;}
