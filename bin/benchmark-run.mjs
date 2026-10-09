#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { validateRunConfig } from '../src/benchmark/launch.mjs';
import { executeBenchmarkRun, readBrief, safeRunnerCode } from '../src/benchmark/runner.mjs';

try {
  const args=process.argv.slice(2);
  if(args.length===1&&args[0]==='--help') {
    console.log('Usage: node bin/benchmark-run.mjs --config RUN.json [--spend]\nWithout --spend validates the config and brief. --spend launches Claude/Jev work with explicit limits, including null count/USD limits where allowed.');
  }else{
    if(![2,3].includes(args.length)||args[0]!=='--config'||args[2]&&args[2]!=='--spend')throw new Error('INVALID_ARGUMENTS');
    const configPath=resolve(args[1]);
    const config=validateRunConfig(JSON.parse(readFileSync(configPath,'utf8')),dirname(configPath));
    if(args[2]!=='--spend'){
      const brief=readBrief(config);
      console.log(JSON.stringify({...config,status:'prepared_not_executed',instruction_bytes:Buffer.byteLength(brief.prompt),paid_requests:0},null,2));
    }else{
      const result=await executeBenchmarkRun(config);
      console.log(JSON.stringify(result,null,2));
      process.exitCode=result.runner_status==='completed'?0:result.runner_status==='uncertain'?2:1;
    }
  }
}catch(error){
  const configurationCodes=new Set(['INVALID_ARGUMENTS','INVALID_RUN_CONFIG','INVALID_BRIEF','BRIEF_UNAVAILABLE']);
  console.error(JSON.stringify({error:configurationCodes.has(error.message)?error.message:safeRunnerCode(error),automatic_retries:0}));
  process.exitCode=2;
}
