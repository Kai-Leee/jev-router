import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {loadDocumentContracts,prepareDocumentRequest,createWorkerTask} from '../src/orchestration/document-contracts.mjs';
import {dispatchDecision} from '../src/orchestration/document-router.mjs';
const bundle=JSON.parse(await readFile(new URL('../examples/orchestration/document-bundle.json',import.meta.url)));
test('question document instructions/types/fixed answers are copied verbatim',async()=>{
 const c=await loadDocumentContracts();
 for(const kind of ['split','task','worker','failure','requirement']){
  const r=prepareDocumentRequest(bundle,{kind,taskId:'root',requirementId:'R3',readyTaskIds:['ui','backend']},c);
  for(const [k,q] of Object.entries(c.questions.kinds[kind].questions)){
   assert.equal(r.questions[k].instructions,q.instructions.replaceAll('{{requirementId}}','R3'));
   assert.equal(r.questions[k].type,q.type);
   if(!c.questions.kinds[kind].optionsFrom)assert.deepEqual(r.questions[k].criteria,q.criteria);
  }
  assert.ok(r.state.contractSources.questions.path.endsWith('questions.v1.json'));
 }
});
test('question edits in documents propagate; incompatible response enums rejected',async()=>{
 const c=await loadDocumentContracts();c.questions.kinds.worker.questions.selection.instructions='Document-author edited question.';
 assert.equal(prepareDocumentRequest(bundle,{kind:'worker',taskId:'root'},c).questions.selection.instructions,'Document-author edited question.');
 c.questions.kinds.requirement.questions.status.criteria.finish='finish';
 assert.throws(()=>prepareDocumentRequest(bundle,{kind:'requirement',taskId:'root',requirementId:'R3'},c),/enum/);
});
test('profile selection dispatches original model/effort and task documents into worker creation',async()=>{
 const c=await loadDocumentContracts();const r=prepareDocumentRequest(bundle,{kind:'worker',taskId:'ui'},c);
 assert.ok(!Object.hasOwn(r.questions.selection.criteria,'claude_opus55_medium'));
 const response={answers:{selection:{type:'choice',choice:'sim_high'}}};
 const out=await dispatchDecision({request:r,response,currentEvidenceVersion:bundle.version,currentEvidenceHash:r.state.evidenceHash,handlers:{spawn_worker:ctx=>createWorkerTask({...ctx,workerTaskTemplate:r.state.workerTaskTemplate})}});
 assert.equal(out.result.model,'fixture-model');assert.equal(out.result.effort,'high');assert.equal(out.result.taskId,'ui');
 assert.equal(out.result.instructions,c.workerTask.instructions);assert.deepEqual(out.result.requirements.map(r=>r.id),['R2']);assert.ok(out.result.evidence.length);
});
test('disabled/unknown profile and unconnected live adapters cannot spawn',async()=>{
 const c=await loadDocumentContracts();const r=prepareDocumentRequest(bundle,{kind:'worker',taskId:'root'},c);
 let called=false;
 await assert.rejects(dispatchDecision({request:r,response:{answers:{selection:{type:'choice',choice:'claude_opus55_medium'}}},currentEvidenceVersion:bundle.version,currentEvidenceHash:r.state.evidenceHash,handlers:{spawn_worker:()=>called=true}}));
 assert.equal(called,false);
 assert.throws(()=>createWorkerTask({profile:{enabled:true,adapter:'claude-cli',verification:'historical-run-only'}}),/not verified/);
});
