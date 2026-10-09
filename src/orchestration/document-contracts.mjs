import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildDecisionRequest, decisionHash, documentHash } from './document-router.mjs';
const base = new URL('../../docs/orchestration/contracts/', import.meta.url);
const names = { questions:'questions.v1.json', profiles:'profiles.v1.json', workerTask:'worker-task.v1.json' };
const ensure = (ok,msg) => { if(!ok) throw new Error(msg); };

export async function loadDocumentContracts() {
  const docs={}, sources={};
  for(const [key,name] of Object.entries(names)) {
    const url=new URL(name,base);
    docs[key]=JSON.parse(await readFile(url,'utf8'));
    ensure(typeof docs[key].version==='string','contract version missing');
    sources[key]={path:fileURLToPath(url),version:docs[key].version,sha256:documentHash(docs[key])};
  }
  ensure(Object.keys(docs.questions.kinds).sort().join(',')==='failure,requirement,split,task,worker','question kinds invalid');
  const ids=new Set();
  for(const p of docs.profiles.profiles){
    ensure(typeof p.id==='string'&&!ids.has(p.id),'duplicate profile');ids.add(p.id);
    ensure(['id','description','model','effort','adapter','verification'].every(k=>typeof p[k]==='string'&&p[k]),'profile fields missing');
    ensure(typeof p.enabled==='boolean','profile enabled missing');
  }
  ensure(typeof docs.workerTask.instructions==='string'&&Array.isArray(docs.workerTask.requiredOutput),'worker template invalid');
  return {...docs,sources};
}
export function prepareDocumentRequest(bundle, options, contracts) {
  const selectedProfiles=contracts.profiles.profiles.filter(p=>p.enabled);
  const materialized={...structuredClone(bundle),profiles:structuredClone(selectedProfiles)};
  // Reuse existing task/evidence/choice validation; replace its prose with the document source.
  const request=buildDecisionRequest(materialized,options);
  const template=contracts.questions.kinds[options.kind];
  ensure(template,'unknown question document');
  const questions=structuredClone(template.questions);
  for(const [key,q] of Object.entries(questions)) {
    const expected=request.questions[key];
    ensure(expected&&q.type===expected.type,'question type contract mismatch');
    ensure(typeof q.instructions==='string'&&q.instructions.length>0,'question text missing');
    q.instructions=q.instructions.replaceAll('{{requirementId}}',options.requirementId??'');
    ensure(!q.instructions.includes('{{'),'unresolved question placeholder');
    if(template.optionsFrom){
      ensure(key==='selection'&&Object.keys(q.criteria).join(',')==='unknown','dynamic criteria contract mismatch');
      q.criteria={...request.questions.selection.criteria,unknown:q.criteria.unknown};
    } else if(q.type==='choice') {
      ensure(Object.keys(q.criteria).sort().join(',')===Object.keys(expected.criteria).sort().join(','),'answer enum contract mismatch');
    }
  }
  ensure(Object.keys(questions).sort().join(',')===Object.keys(request.questions).sort().join(','),'question keys mismatch');
  request.questions=questions;
  request.state.contractSources=structuredClone(contracts.sources);
  request.state.workerTaskTemplate=structuredClone(contracts.workerTask);
  request.state.decisionHash=decisionHash(request);
  ensure(Buffer.byteLength(JSON.stringify(request))<=256000,'request size limit');
  return request;
}
export function createWorkerTask(context) {
  const p=context.profile;
  ensure(p?.enabled===true,'profile disabled or missing');
  ensure(p.adapter==='simulation'&&p.verification==='fixture-only','live adapter not verified/connected');
  ensure(context.task&&context.documents,'materialized task missing');
  const template=context.workerTaskTemplate;
  ensure(template?.instructions&&Array.isArray(template.requiredOutput),'worker template missing');
  return {adapter:p.adapter,model:p.model,effort:p.effort,taskId:context.task.id,
    instructions:template.instructions,requiredOutput:structuredClone(template.requiredOutput),
    task:structuredClone(context.task),goal:structuredClone(context.documents.goal),
    requirements:context.documents.requirements.filter(r=>context.task.requirementIds.includes(r.id)),
    evidence:context.documents.evidence.filter(e=>context.task.evidenceIds.includes(e.id)),
    verification:'simulation-only',goalVerified:false};
}
