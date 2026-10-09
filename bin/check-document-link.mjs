#!/usr/bin/env node
import {readFile,writeFile} from 'node:fs/promises';
import {loadDocumentContracts,prepareDocumentRequest,createWorkerTask} from '../src/orchestration/document-contracts.mjs';
import {dispatchDecision} from '../src/orchestration/document-router.mjs';
if(process.argv.length!==3)throw new Error('Usage: node bin/check-document-link.mjs <new-output.json>');
const bundle=JSON.parse(await readFile(new URL('../examples/orchestration/document-bundle.json',import.meta.url)));
const contracts=await loadDocumentContracts();
const request=prepareDocumentRequest(bundle,{kind:'worker',taskId:'ui'},contracts);
const response={answers:{selection:{type:'choice',choice:'sim_high'}}};
const outcome=await dispatchDecision({request,response,currentEvidenceVersion:bundle.version,currentEvidenceHash:request.state.evidenceHash,handlers:{spawn_worker:context=>createWorkerTask({...context,workerTaskTemplate:request.state.workerTaskTemplate})}});
await writeFile(process.argv[2],JSON.stringify({evidence_mode:'synthetic',providerCalls:0,request,response,outcome},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({handler:outcome.action,model:outcome.result.model,effort:outcome.result.effort,taskId:outcome.result.taskId,source:request.state.contractSources.questions.path}));
