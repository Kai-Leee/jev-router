#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {validatePointsmanManifest} from '../src/orchestration/pointsman-gateway.mjs';
import {runPointsmanSmoke,POINTSMAN_MANIFEST} from '../src/benchmark/pointsman-smoke.mjs';
const rootDir=resolve(import.meta.dirname,'..');
try {
  const [command,...args]=process.argv.slice(2);
  if(!['doctor','smoke','run'].includes(command))throw new Error('POINTSMAN_COMMAND_INVALID');
  let out,spend=false;
  for(let i=0;i<args.length;i++){
    if(args[i]==='--out'&&!out&&args[i+1]&&!args[i+1].startsWith('--'))out=resolve(args[++i]);
    else if(args[i]==='--spend'&&!spend)spend=true;
    else throw new Error('POINTSMAN_ARGUMENT_INVALID');
  }
  if(command==='doctor'&&(args.length))throw new Error('POINTSMAN_ARGUMENT_INVALID');
  if(command==='smoke'&&(!out||spend))throw new Error('POINTSMAN_ARGUMENT_INVALID');
  if(command==='run'&&(!out||!spend))throw new Error('EXPLICIT_SPEND_REQUIRED');
  const manifest=JSON.parse(readFileSync(join(rootDir,POINTSMAN_MANIFEST),'utf8'));
  if(manifest.schema_version!=='adaptive-dag-comparison/v13')throw new Error('POINTSMAN_GATEWAY_SCHEMA_REQUIRED');
  const gate=validatePointsmanManifest(manifest,{rootDir});
  let result;
  if(command==='doctor')result={status:'ready_offline',manifest:POINTSMAN_MANIFEST,gateway_required:true,contract_sha256:gate.sha256,
    skill:gate.policy.skill,registered_stages:Object.keys(gate.policy.stages),node:process.version,host_discovery:'not_checked',
    auth:'not_checked',live_inference:'not_checked',live_execution_policy:process.platform==='darwin'?'cloud_required':'verify_cloud_environment_and_shared_ledger',
    credentials_read:false,network_requests:0};
  else if(command==='smoke')result=await runPointsmanSmoke({out,rootDir});
  else {
    if(process.platform==='darwin')throw new Error('POINTSMAN_CLOUD_RUN_REQUIRED');
    const {loadAdaptiveRunManifest,runAdaptiveComparison}=await import('../src/benchmark/adaptive-dag-runner.mjs');
    const checked=loadAdaptiveRunManifest(join(rootDir,POINTSMAN_MANIFEST),rootDir);
    result=await runAdaptiveComparison({rootDir,manifest:checked,runDir:out,spend:true,
      preparationDirectory:join(rootDir,checked.catalog_reuse.preparation_directory)});
  }
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
  if(!['ready_offline','passed','completed'].includes(result.status))process.exitCode=2;
} catch(error){const raw=error.code??error.message;const code=/^[A-Z][A-Z0-9_]+$/.test(raw)?raw:'POINTSMAN_FAILED';
  process.stderr.write(JSON.stringify({status:'failed',code})+'\n');process.exitCode=1;}
