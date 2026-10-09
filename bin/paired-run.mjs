#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {validateRunConfig} from '../src/benchmark/launch.mjs';

// One foreground controller, two independent CLI sessions. No automatic reruns.
const root=fileURLToPath(new URL('../',import.meta.url));
const children=new Set();
let cancelled=false;
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{
  cancelled=true;
  for(const child of children)child.kill(signal);
});
function start(script,args) {
  if(cancelled)throw new Error('PAIRED_RUN_CANCELLED');
  const child=spawn(process.execPath,[join(root,'bin',script),...args],{stdio:['ignore','inherit','inherit']});
  children.add(child);let done=false;
  const completion=new Promise(resolve=>{
    child.once('error',()=>{done=true;children.delete(child);resolve(2);});
    child.once('close',code=>{done=true;children.delete(child);resolve(code??2);});
  });
  return {completion,isDone:()=>done};
}
try {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help') {
    console.log('Usage: node bin/paired-run.mjs --config RUN.json [--spend]\nRuns paired Jev/Claude implementation and a separate Opus 5.5 benchmark monitor. Omit --spend to validate only.');
  } else {
    if(![2,3].includes(args.length)||args[0]!=='--config'||args[2]&&args[2]!=='--spend')throw new Error('INVALID_ARGUMENTS');
    const configPath=resolve(args[1]);
    const config=validateRunConfig(JSON.parse(readFileSync(configPath,'utf8')),dirname(configPath));
    if(args[2]!=='--spend') {
      const prepared=start('benchmark-run.mjs',['--config',configPath]);
      process.exitCode=await prepared.completion;
    } else {
      if(existsSync(config.output_dir))throw new Error('OUTPUT_DIRECTORY_EXISTS');
      const implementation=start('benchmark-run.mjs',['--config',configPath,'--spend']);
      const manifest=join(config.output_dir,'manifest.json');
      while(!existsSync(manifest)&&!implementation.isDone())await delay(100);
      let monitor=null;
      if(!cancelled&&existsSync(manifest)) {
        // If implementation stopped immediately, the monitor still explains the terminal evidence.
        monitor=start('benchmark-monitor.mjs',['--run-dir',config.output_dir,'--output-root',dirname(config.output_dir),'--watch','--spend']);
      }
      const implementationExit=await implementation.completion;
      const monitorExit=monitor?await monitor.completion:null;
      console.log(JSON.stringify({implementation_exit:implementationExit,monitor_exit:monitorExit,output_dir:config.output_dir,automatic_retries:0}));
      process.exitCode=!cancelled&&implementationExit===0&&monitorExit===0?0:1;
    }
  }
}catch(error){console.error(JSON.stringify({error:/^[A-Z_]+$/.test(error.message)?error.message:'PAIRED_RUN_FAILED',automatic_retries:0}));process.exitCode=2;}
