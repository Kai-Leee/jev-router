import {buildCountCandidates,selectTaskCount} from './task-count.mjs';
// Decision authority is explicit. Forced arms are evaluation, not online routing.
export function validateRoutingOptions({authority,threshold,decisionBasis='probability'}) {
  if(!['forced','claude','jev','script'].includes(authority))throw Error('INVALID_ROUTING_AUTHORITY');
  if(decisionBasis==='count'&&threshold!==undefined)throw Error('COUNT_THRESHOLD_NOT_ALLOWED');
  if(decisionBasis!=='count'&&['claude','jev'].includes(authority)&&(!Number.isFinite(threshold)||threshold<0||threshold>1))throw Error('EXPLICIT_SPLIT_THRESHOLD_REQUIRED');
}
export function buildSplitState({brief,plan,model,effort,maxConcurrency=2}) {
  return {brief,plan,maxConcurrency,workerModel:model,workerEffort:effort,
    workerCapabilities:'fresh CLI, no tools, generate owned files only',
    verification:'Independent hidden grading occurs after candidates freeze; no repair loop or hidden feedback',
    comparison:'same frozen plan and brief, single versus split workers'};
}
export function selectExecution({authority,threshold,answers,plan,decisionBasis='probability'}) {
  validateRoutingOptions({authority,threshold,decisionBasis});
  if(authority==='forced')return {modes:['single','split'],decisionUsed:false,reason:'forced_counterfactual',probability:null};
  if(authority==='script') {
    // Readiness is mechanical; choosing parallel execution from it is a heuristic.
    const done=new Set();let parallel=false;
    while(done.size<plan.tasks.length){const ready=plan.tasks.filter(t=>!done.has(t.id)&&t.dependsOn.every(id=>done.has(id)));if(!ready.length)throw Error('CYCLIC_OR_MISSING_DEPENDENCY');if(ready.length>1)parallel=true;for(const t of ready)done.add(t.id);}
    return {modes:[parallel?'split':'single'],decisionUsed:true,reason:'dependency_width_heuristic_v1',probability:null};
  }
  if(decisionBasis==='count')return selectTaskCount(answers,buildCountCandidates(plan));
  if(!['probability','confidence'].includes(decisionBasis))throw Error('INVALID_DECISION_BASIS');
  if(decisionBasis==='confidence') {
    const a=answers?.execution,c=a?.confidence;
    if(a?.type!=='choice'||!['split','single','defer'].includes(a.choice)||!Number.isFinite(c)||c<0||c>1)throw Error('INVALID_CONFIDENCE_ANSWER');
    const reason=a.choice==='defer'?'decision_deferred':c<threshold?'low_confidence':'confidence_threshold';
    return {modes:reason==='confidence_threshold'?[a.choice]:[],decisionUsed:true,reason,probability:null,confidence:c,choice:a.choice,decisionBasis,threshold};
  }
  const p=answers?.beneficial?.noul,e=answers?.evidence?.choice;
  if(answers?.beneficial?.type!=='noul'||answers?.evidence?.type!=='choice'||!Number.isFinite(p)||p<0||p>1||!['sufficient','insufficient'].includes(e))throw Error('INVALID_ROUTING_ANSWER');
  return {modes:e==='insufficient'?[]:[p>=threshold?'split':'single'],decisionUsed:true,reason:e==='insufficient'?'collect_evidence':'explicit_threshold',probability:p,threshold};
}
export function routingMetrics({authority,selection,elapsedMs,claudeCalls,jevCalls}) {
  return {authority,selected_modes:selection.modes,decision_used:selection.decisionUsed,reason:selection.reason,
    task_count:selection.taskCount??null,decision_basis:selection.decisionBasis??'probability',confidence:selection.confidence??null,choice:selection.choice??null,
    decision_elapsed_ms:elapsedMs,claude_decision_calls:claudeCalls,jev_decision_calls:jevCalls,
    // A missing call in one run is not a measured counterfactual saving.
    eliminated_claude_calls_vs_paired_baseline:null,probability:selection.probability,threshold:selection.threshold??null,
    planning_replaced:false,quality_verified:false};
}
