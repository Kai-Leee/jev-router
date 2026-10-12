#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { createArtifactSession } from '../src/orchestration/artifact-transport.mjs';
let session;
try {
  if(process.argv.length!==4||process.argv[2]!=='--config')throw new Error('INVALID_CONFIG');
  session=createArtifactSession(JSON.parse(readFileSync(process.argv[3],'utf8')));
  const input=createInterface({input:process.stdin});
  let queue=Promise.resolve();
  input.on('line',line=>{queue=queue.then(async()=>{
    if(Buffer.byteLength(line)>2*1024*1024)throw new Error('OVERSIZED_REQUEST');
    let message;try{message=JSON.parse(line);}catch{process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Parse error'}})+'\n');return;}
    const reply=await session.dispatch(message);if(reply)process.stdout.write(JSON.stringify(reply)+'\n');
  }).catch(()=>{session.close();process.stderr.write('Artifact transport stopped. Inspect the private journal.\n');process.exit(1);});});
  input.on('close',()=>queue.finally(()=>session.close()));
  for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{session.close();process.exit(signal==='SIGINT'?130:143);});
}catch{session?.close();process.stderr.write('Artifact transport startup failed.\n');process.exitCode=1;}
