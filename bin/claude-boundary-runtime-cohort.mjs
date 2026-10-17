#!/usr/bin/env node
import {readFileSync,mkdirSync,writeFileSync,appendFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {createD093Environment,runProviderE2EArm,loadCodexE2EInputs,inspectCodexE2E,
 D095_RUNTIME_MANIFEST,withCodexE2ELock,validateCodexE2EHost} from '../src/benchmark/codex-e2e-runner.mjs';
import {summarizeCodexE2EUsage} from '../src/benchmark/codex-e2e-decisions.mjs';
const root=resolve(import.meta.dirname,'..'),args=process.argv.slice(2),command=args.shift()??'check',opts={};
const fail=code=>{throw Object.assign(Error(code),{code});},safe=e=>/^[A-Z][A-Z0-9_]+$/.test(e?.code)?e.code:'D093_COHORT_FAILED';
const allowed=new Set(['out','spend','execution-host','family','probe','conditions']);
const controller=new AbortController();for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>controller.abort());
const all=[{id:'claude_native',provider:'claude',worker_family:'claude',manifestPath:D095_RUNTIME_MANIFEST},
 {id:'jev_claude',provider:'jev',worker_family:'claude',manifestPath:D095_RUNTIME_MANIFEST}];
try{
 while(args.length){const arg=args.shift();if(!arg.startsWith('--')||!allowed.has(arg.slice(2))||Object.hasOwn(opts,arg.slice(2)))fail('D093_ARGUMENT_INVALID');
 opts[arg.slice(2)]=['--spend','--probe'].includes(arg)?true:args.shift();if(opts[arg.slice(2)]===undefined)fail('D093_ARGUMENT_MISSING');}
 if(command==='check'){
  const family=opts.family??'claude';if(family!=='claude')fail('D093_WORKER_FAMILY_INVALID');
  const r=await inspectCodexE2E({rootDir:root,manifestPath:D095_RUNTIME_MANIFEST,probe:opts.probe===true,signal:controller.signal});
  console.log(JSON.stringify(r,null,2));
 }else if(command==='run'){
  if(!opts.spend)fail('EXPLICIT_SPEND_REQUIRED');if(!opts.out)fail('D093_OUTPUT_REQUIRED');
  validateCodexE2EHost(opts['execution-host']??'mac');
  const wanted=opts.conditions?opts.conditions.split(','):['jev_claude'];
  if(!wanted.length||new Set(wanted).size!==wanted.length||wanted.some(id=>!all.some(x=>x.id===id)))fail('D093_CONDITION_INVALID');
  const conditions=all.filter(x=>wanted.includes(x.id));for(const c of conditions)loadCodexE2EInputs({rootDir:root,manifestPath:c.manifestPath});
  const out=resolve(opts.out),save=(path,value)=>{const target=join(out,path);mkdirSync(resolve(target,'..'),{recursive:true,mode:0o700});writeFileSync(target,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});};
  mkdirSync(out,{mode:0o700});const started=performance.now(),results=[],environments=new Map(),setup=[];
  const ledger=JSON.parse(readFileSync(join(root,conditions[0].manifestPath))).jev_budget.ledger_path;
  save('ledger-before.json',JSON.parse(readFileSync(ledger)));
  const pins=JSON.parse(readFileSync(join(root,conditions[0].manifestPath))).skill_gateway;
  const descriptor={schema_version:'d095-public-boundaries-comparison/v1',conditions:conditions.map(x=>({...x,directory:x.id})),
   source_binding:pins,repetitions:1,source_phase:'public_boundaries_runtime_v16',previous_cohort:'benchmark-runs/d095-public-boundaries-20261017-01/cohort',previous_failure:'PUBLIC_OWNER_ASSERTION_RUNTIME_DRIFT_controller_initial_vs_round_plan',schedule:'sequential_whole_arms_within_worker_concurrency_2',public_tests:93,public_gate_version:'5',public_predicates:'strengthened_two_cases_post_hoc_public_spec',independent_tests:63,max_repair_rounds:2,
   worker_profiles:'joint_model_and_effort_same_candidates_within_family',historical_snapshot:'frozen_D092_public_only_no_online_updates',
   actual_billed_usd:null,automatic_retries:0,overall_wall_limit_ms:null,setup_wall_attribution:'once_per_family_separate_from_arm_wall',
   comparison_scope:'One fresh Jev+Claude condition compared with preserved D093 Jev+Claude and Claude native; changed source and question policy, no causal speedup claim.'};
  save('conditions.json',descriptor);
  await withCodexE2ELock(root,async()=>{
   try{
    for(const c of conditions){
     if(controller.signal.aborted)break;
     let env=environments.get(c.worker_family);
     if(!env){const began=performance.now();env=await createD093Environment({rootDir:root,workerFamily:c.worker_family});environments.set(c.worker_family,env);
      const row={family:c.worker_family,wall_ms:performance.now()-began,evidence:env.evidence};setup.push(row);save(`environments/${c.worker_family}.json`,row);}
     appendFileSync(join(out,'cohort-events.jsonl'),JSON.stringify({event:'condition_started',condition:c.id,at:new Date().toISOString(),elapsed_ms:performance.now()-started})+'\n',{mode:0o600});
     const result=await runProviderE2EArm({rootDir:root,out:join(out,c.id),provider:c.provider,manifestPath:c.manifestPath,cliEnvironment:env,
      executionHost:opts['execution-host']??'mac',spend:true,signal:controller.signal});
     results.push({id:c.id,worker_family:c.worker_family,...result});
     appendFileSync(join(out,'cohort-events.jsonl'),JSON.stringify({event:'condition_finished',condition:c.id,status:result.status,product_success:result.product_success,stop_code:result.stop_code,elapsed_ms:performance.now()-started})+'\n');
     if(result.outcome_uncertain||result.stop_code?.includes('SOURCE_DRIFT')||result.stop_code?.includes('ENV_')||result.stop_code==='CLAUDE_ACCOUNT_LIMIT')break;
    }
   }catch(e){save('cohort-failure.json',{code:safe(e),automatic_retries:0,replay_allowed:false});}
   finally{for(const[family,env]of environments)save(`environments/${family}-cleanup.json`,env.close());}
  });
  save('ledger-after.json',JSON.parse(readFileSync(ledger)));
  const result={schema_version:'d095-public-boundaries-results/v1',status:results.length<conditions.length?'stopped':results.every(r=>r.product_success)?'completed':'failed',
   total_wall_ms:performance.now()-started,conditions_requested:conditions.length,conditions_finished:results.length,completed_conditions:results.filter(r=>r.product_success).length,
   family_setup:setup,results,usage:summarizeCodexE2EUsage(results.flatMap(r=>r.receipts)),automatic_retries:0,replay_allowed:false};
  save('result.json',result);console.log(JSON.stringify({status:result.status,conditions:results.map(r=>({id:r.id,complete:r.product_success,status:r.status,wall_ms:r.wall_ms,repair_rounds:r.repair_rounds,tokens:r.usage.total.total_tokens,stop:r.stop_code}))}));
  if(result.status!=='completed')process.exitCode=2;
 }else fail('D093_COMMAND_INVALID');
}catch(e){console.error(JSON.stringify({status:'blocked',code:safe(e),automatic_retries:0}));process.exitCode=2;}
