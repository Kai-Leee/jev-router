#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { inspectSandbox, processResult } from '../src/benchmark/docker.mjs';

const image='node@sha256:0e5f906573693feaa1e21057ebdcfdb5bd5021f050b2dc7c9deceb629c7da2a8';
const packet=fileURLToPath(new URL('../benchmarks/personal-os/agent',import.meta.url));
const [name,receipt]=process.argv.slice(2);
let created=false;
try {
  if(process.argv.length!==4||!/^jev-personal-[a-z0-9][a-z0-9-]{0,50}$/.test(name)||existsSync(receipt))throw new Error('INVALID_ARGUMENTS_OR_EXISTING_RECEIPT');
  const run=async args=>{const result=await processResult('docker',args,{timeoutMs:30000});if(result.exit_code!==0||result.outcome_uncertain)throw new Error('DOCKER_PREPARATION_FAILED');return result;};
  const imageInfo=JSON.parse((await run(['image','inspect',image])).stdout)[0];
  await run(['create','--name',name,'--network','none','--cpus','4','--memory','4g','--workdir','/app',
    '--label','org.jev-router.benchmark=true','--label','org.jev-router.benchmark.role=agent',
    '--entrypoint','/bin/bash',image,'-c','sleep infinity']);created=true;
  await run(['start',name]);
  await run(['exec',name,'/bin/bash','-c','test -z "$(ls -A /app)" && test ! -e /tests']);
  await run(['cp',packet,name+':/app/brief']);
  const info=await inspectSandbox(name);
  const probes=await run(['exec',name,'/bin/bash','-c','node --version; python3 --version; test -f /app/brief/GOAL.md; test ! -e /app/evaluator; test ! -e /tests']);
  const hashes=Object.fromEntries(['GOAL.md','RECORD_FORMAT.md'].map(file=>[file,createHash('sha256').update(readFileSync(resolve(packet,file))).digest('hex')]));
  const value={container:name,container_id:info.Id,image_digest:image,image_id:info.Image,image_architecture:imageInfo.Architecture,
    network:'none',mounts:[],packet_sha256:hashes,agent_input:'/app/brief',runtime_probe:probes.stdout,
    native_macos_verified:false,dependency_install_network:false,storage_limit_enforced:false,model_calls:0};
  writeFileSync(receipt,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify(value,null,2));
}catch(error){
  if(created)await processResult('docker',['rm','-f',name]).catch(()=>{});
  console.error(JSON.stringify({error:/^[A-Z_]+$/.test(error.message)?error.message:'PERSONAL_OS_PREPARATION_FAILED'}));process.exitCode=2;
}
