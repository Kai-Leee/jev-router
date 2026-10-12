#!/usr/bin/env node
// Explicit offline replay: no client, credential or network imports.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createCheckpointRouter,checkpointHash} from '../src/orchestration/checkpoint-router.mjs';
import {splitCheckpointAdapter as adapter} from '../src/orchestration/split-checkpoint.mjs';
const [sourcePath,outputPath]=process.argv.slice(2);
if(!sourcePath||!outputPath)throw Error('USAGE: node scripts/replay-checkpoints.mjs historical-run new-output');
const source=resolve(sourcePath),output=resolve(outputPath);
const inputs=JSON.parse(readFileSync(join(source,'inputs.json'),'utf8'));
const plan=JSON.parse(readFileSync(join(source,'frozen-plan.json'),'utf8')).plan;
const saved=JSON.parse(readFileSync(join(source,'split-decision.json'),'utf8')).response;
const log=[],receipts=[],actions=[];let calls=0;
const event={id:'replay-1',decisionId:1,executionKey:'run-1',scope:'d036-offline',evidenceRevision:checkpointHash(plan),type:'plan_ready',brief:inputs.brief,plan,workerModel:inputs.model,workerEffort:inputs.effort,maxConcurrency:2,threshold:.65,modelIdentity:null};
const router=createCheckpointRouter({adapter,record:async row=>log.push(row),readCurrent:async e=>e,decide:async()=>{calls++;return structuredClone(saved);},handlers:Object.fromEntries(['execute_single','execute_split','collect_evidence'].map(action=>[action,async()=>{actions.push(action);return {simulation_only:true};}]))});
receipts.push(await router.run(event));
receipts.push(await router.run({...event,id:'duplicate'}));
receipts.push(await router.run({...event,id:'forced',decisionId:2,executionKey:'run-2'},{mode:'force_jev'}));
// Cache test is separate synthetic fixture because the historical receipt has an unresolved model alias.
let syntheticCalls=0;const syntheticLog=[];
const synthetic=createCheckpointRouter({adapter,record:async row=>syntheticLog.push(row),readCurrent:async e=>e,decide:async()=>{syntheticCalls++;return {model:'jev-1.13.0',answers:{beneficial:{type:'noul',noul:.7},evidence:{type:'choice',choice:'sufficient'}}};},handlers:{execute_split:async()=>({simulation_only:true})}});
const pin={...event,modelIdentity:'jev-1.13.0'};
const cacheReceipts=[await synthetic.run(pin),await synthetic.run({...pin,id:'cache',decisionId:2,executionKey:'cache-exec'})];
if(receipts[0].handler!=='execute_split'||!receipts[1].duplicate_execution||calls!==2||actions.length!==2||cacheReceipts[1].authority!=='cache'||syntheticCalls!==1)throw Error('REPLAY_ASSERTION_FAILED');
mkdirSync(output,{mode:0o700});
writeFileSync(join(output,'result.json'),JSON.stringify({simulation_only:true,source,source_response_sha256:checkpointHash(saved),new_provider_calls:0,historical_replay:{injected_decider_calls:calls,handler_calls:actions.length,receipts},synthetic_cache:{injected_decider_calls:syntheticCalls,receipts:cacheReceipts},quality_verified:false},null,2)+'\n',{flag:'wx',mode:0o600});
writeFileSync(join(output,'events.jsonl'),[...log,...syntheticLog].map(x=>JSON.stringify(x)).join('\n')+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({output,passed:true,new_provider_calls:0,historical_replay_calls:calls,synthetic_cache_calls:syntheticCalls}));
