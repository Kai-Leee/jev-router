#!/usr/bin/env node
import {readFileSync} from 'node:fs';
import {runDecisionBenchmark,compareDecisionRuns} from '../src/benchmark/codex-decision-benchmark.mjs';
const controller=new AbortController();
process.once("SIGINT",()=>controller.abort());process.once("SIGTERM",()=>controller.abort());
try {
  const [command,...args]=process.argv.slice(2),options={};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--spend'&&!options.spend)options.spend=true;
    else if(['--request','--stage','--out','--model','--effort','--left','--right'].includes(args[i])&&args[i+1]&&!args[i+1].startsWith('--')&&!Object.hasOwn(options,args[i].slice(2)))options[args[i].slice(2)]=args[++i];
    else throw Object.assign(new Error(),{code:'CODEX_BENCH_ARGUMENT_INVALID'});
  }
  let result;
  if(command==='compare'&&options.left&&options.right&&Object.keys(options).length===2)result=compareDecisionRuns(options.left,options.right);
  else if(['check','codex','jev'].includes(command)&&options.request&&options.stage&&options.out&&!options.left&&!options.right)
    result=await runDecisionBenchmark({...options,signal:controller.signal,provider:command,request:JSON.parse(readFileSync(options.request))});
  else throw Object.assign(new Error(),{code:'CODEX_BENCH_ARGUMENT_INVALID'});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
}catch(error){process.stderr.write(JSON.stringify({status:'failed',code:/^[A-Z][A-Z0-9_]+$/.test(error.code??'')?error.code:'CODEX_BENCH_FAILED'})+'\n');process.exitCode=1;}
