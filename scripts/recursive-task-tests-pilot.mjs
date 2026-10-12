#!/usr/bin/env node
import {resolve} from 'node:path';
import {runPlanningPilot} from '../src/benchmark/recursive-planning-runner.mjs';

const root=resolve(import.meta.dirname,'..');
const flags=process.argv.slice(2);
const value=flag=>{const i=flags.indexOf(flag);return i<0?undefined:flags[i+1];};
try {
  const allowed=new Set(['--manifest','--output','--spend','--mock']);
  for(let i=0;i<flags.length;i++){
    if(!allowed.has(flags[i]))throw Object.assign(Error('USAGE'),{code:'USAGE'});
    if(['--manifest','--output'].includes(flags[i]) && (!flags[++i] || flags[i].startsWith('--')))throw Object.assign(Error('USAGE'),{code:'USAGE'});
  }
  const result=await runPlanningPilot({rootDir:root,
    manifestPath:value('--manifest')??'benchmarks/e2e-swe/manifests/d056-planning.json',
    outputDir:value('--output'),spend:flags.includes('--spend'),mock:flags.includes('--mock'),
    mockDecide:async request=>{
      const [key,q]=Object.entries(request.questions)[0];
      // Structural smoke only. Never represented as a Jev decision.
      const criteria=Object.keys(q.criteria);
      const choice=request.stage.includes('count')?(criteria.includes('2')?'2':criteria[0]):criteria[0];
      return {answers:{[key]:{type:'choice',choice}}};
    }});
  console.log(JSON.stringify(result,null,2));
  if(['failed','partial','needs_spec'].includes(result.status))process.exitCode=1;
}catch(error){
  console.error(JSON.stringify({code:/^[A-Z][A-Z0-9_]{0,79}$/.test(error?.code??'')?error.code:'PLANNING_START_FAILED',automatic_retries:0}));
  process.exitCode=1;
}
