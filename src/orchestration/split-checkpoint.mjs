import {buildCountCandidates,countQuestions} from './task-count.mjs';
import {readFileSync} from 'node:fs';
import {validatePlan} from './live-file-workers.mjs';
import {buildSplitState,selectExecution} from './routing-policy.mjs';

const contract=JSON.parse(readFileSync(new URL('../../docs/orchestration/contracts/checkpoints.v3.json',import.meta.url),'utf8'));
const confidenceQuestions=JSON.parse(readFileSync(new URL('../../docs/orchestration/contracts/split-confidence.v2.json',import.meta.url),'utf8')).questions;
const questions=JSON.parse(readFileSync(new URL('../../docs/orchestration/contracts/questions.v1.json',import.meta.url),'utf8')).kinds.split.questions;
export const splitCheckpointAdapter={
  version:contract.implementedEvents.plan_ready.policyVersion,
  prepare(event) {
    if(event.type!=='plan_ready')throw Error('UNSUPPORTED_CHECKPOINT_EVENT');
    const {brief,plan,workerModel,workerEffort,maxConcurrency,threshold,modelIdentity=null,decisionBasis='probability'}=event;
    if(!Array.isArray(brief)||!brief.length||brief.some(x=>typeof x.text!=='string'||!x.text.trim()))throw Error('CHECKPOINT_BRIEF_REQUIRED');
    if(typeof workerModel!=='string'||!workerModel||typeof workerEffort!=='string'||!workerEffort)throw Error('CHECKPOINT_WORKER_REQUIRED');
    if(!Number.isInteger(maxConcurrency)||maxConcurrency<1)throw Error('INVALID_CONCURRENCY');
    if(decisionBasis!=='count'&&(!Number.isFinite(threshold)||threshold<0||threshold>1))throw Error('EXPLICIT_SPLIT_THRESHOLD_REQUIRED');
    if(modelIdentity!==null && (typeof modelIdentity!=='string'||!/^jev-\d+\.\d+\.\d+$/.test(modelIdentity)))throw Error('PINNED_MODEL_IDENTITY_REQUIRED');
    if(!['count','confidence','probability'].includes(decisionBasis))throw Error('INVALID_DECISION_BASIS');
    const validated=validatePlan(plan,{minTasks:1});
    const candidates=decisionBasis==='count'?buildCountCandidates(validated):null;
    if(decisionBasis==='count'&&threshold!==undefined)throw Error('COUNT_THRESHOLD_NOT_ALLOWED');
    const request={model:modelIdentity??'jev-latest',state:buildSplitState({brief,plan:validated,model:workerModel,effort:workerEffort,maxConcurrency}),questions:structuredClone(decisionBasis==='confidence'?confidenceQuestions:questions)};
    if(candidates){request.state.candidatePlans=candidates;request.questions=countQuestions(candidates);}
    if(Buffer.byteLength(JSON.stringify(request))>256000)throw Error('CHECKPOINT_REQUEST_TOO_LARGE');
    return {request,mandatoryDeterministic:decisionBasis==='count'&&validated.tasks.length===1,
      policy:{decisionBasis,threshold:threshold??null,maxConcurrency,workerModel,workerEffort,contract},modelIdentity,
      deterministic:validated.tasks.length===1?{action:'execute_single',modes:['single'],reason:'one_validated_task',probability:null,decisionBasis,...(decisionBasis==='count'?{taskCount:1,choice:'1',confidence:null,decisionUsed:false}: {})}:null};
  },
  select(prepared,response) {
    const selected=selectExecution({authority:'jev',decisionBasis:prepared.policy.decisionBasis,threshold:prepared.policy.threshold??undefined,answers:response?.answers,plan:prepared.request.state.plan});
    if(prepared.deterministic && selected.modes.length)return {...selected,...prepared.deterministic,decisionUsed:true,probability:selected.probability,reason:'one_task_execution_constraint'};
    return {...selected,action:selected.modes.length===0?'collect_evidence':selected.modes[0]==='split'?'execute_split':'execute_single'};
  }
};
