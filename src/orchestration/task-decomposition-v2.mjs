import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {validateRequirements} from './task-decomposition.mjs';
import {validatePlan} from './live-file-workers.mjs';
const contract=JSON.parse(readFileSync(new URL('../../docs/orchestration/contracts/decomposition.v2.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);
const fail=(code,details={})=>{throw Object.assign(Error(code),{code,...details});};
export function deriveArtifactDependencies(manifest,owners,taskIds){
 const dependencies=Object.fromEntries(taskIds.map(id=>[id,[]]));
 for(const f of manifest.artifact_catalog)for(const producer of f.dependency_paths??[]){
  if(!manifest.artifact_catalog.some(x=>x.path===producer))fail('UNKNOWN_ARTIFACT_DEPENDENCY',{producer,consumer:f.path});
  const a=owners[producer],b=owners[f.path];if(a&&b&&a!==b&&!dependencies[b].includes(a))dependencies[b].push(a);
 }
 const done=new Set();let progress=true;while(progress){progress=false;for(const id of taskIds)if(!done.has(id)&&dependencies[id].every(d=>done.has(d))){done.add(id);progress=true;}}
 return {dependencies,acyclic:done.size===taskIds.length};
}
// Feasibility witnesses only filter offered choices. They never replace a selected assignment.
export function checkOwnershipFeasibility(manifest,partial,taskIds,{maxStates=10000}={}){
 if(!Number.isSafeInteger(maxStates)||maxStates<1)fail('INVALID_FEASIBILITY_BOUND');
 const paths=manifest.artifact_catalog.map(f=>f.path);if(Object.keys(partial).some(p=>!paths.includes(p))||Object.values(partial).some(id=>!taskIds.includes(id)))fail('INVALID_PARTIAL_OWNERSHIP');
 let states=0,exhausted=false;
 const search=owners=>{
  if(++states>maxStates){exhausted=true;return null;}
  if(!deriveArtifactDependencies(manifest,owners,taskIds).acyclic)return null;
  const left=paths.filter(p=>!owners[p]),missing=taskIds.filter(id=>!Object.values(owners).includes(id));
  if(left.length<missing.length)return null;if(!left.length)return owners;
  // Missing owners first supports nonempty tasks; DFS remains complete within the bound.
  const options=[...missing,...taskIds.filter(id=>!missing.includes(id))];
  for(const id of options){const result=search({...owners,[left[0]]:id});if(result)return result;if(exhausted)return null;}
  return null;
 };
 const witness=search(clone(partial));return {status:witness?'feasible':exhausted?'unknown':'infeasible',states,witness};
}
export async function runTaskDecomposition({requirements,decide,record=async()=>{},maxConcurrency=2,workerProfile={model:'claude-opus-5-5',effort:'medium'},maxFeasibilityStates=10000}){
 const manifest=validateRequirements(requirements);if(typeof decide!=='function'||typeof record!=='function')fail('INVALID_DECOMPOSITION_OPTIONS');
 const catalogPaths=new Set(manifest.artifact_catalog.map(f=>f.path));
 for(const item of [...manifest.artifact_catalog,...manifest.requirements])for(const field of ['dependency_paths','artifact_paths','required_artifacts'])if(item[field]!==undefined&&(!Array.isArray(item[field])||item[field].some(p=>!catalogPaths.has(p))))fail('INVALID_ARTIFACT_REFERENCE',{field,item:item.id??item.path});
 const started=performance.now(),trace=[];let sequence=0,decisions=0;
 const emit=async(event,data)=>{const e={event,sequence:++sequence,...clone(data)};trace.push(e);await record(e);};
 const query=async(stage,key,instructions,criteria,state={})=>{
  const keys=Object.keys(criteria);if(!keys.length)fail('NO_FEASIBLE_DECOMPOSITION_CHOICE',{stage,key});
  if(keys.length===1){await emit('decomposition_bypassed',{stage,key,choice:keys[0],reason:'singleton'});return keys[0];}
  const request={stage,questions:{[key]:{type:'choice',instructions,criteria}},state:{objective:contract.objective,manifest,workerProfile,maxConcurrency,...clone(state)}};
  await emit('decomposition_requested',request);const response=await decide(clone(request));decisions++;
  if(response?.uncertain||response?.outcome_uncertain)fail('UNCERTAIN_PROVIDER_OUTCOME');
  const answer=response?.answers?.[key];if(answer?.type!=='choice'||typeof answer.choice!=='string'||!keys.includes(answer.choice))fail('INVALID_DECOMPOSITION_ANSWER');
  await emit('decomposition_answered',{stage,key,response});return answer.choice;
 };
 const counts={};for(let n=1;n<=Math.min(5,manifest.artifact_catalog.length);n++){
  const result=checkOwnershipFeasibility(manifest,{},Array.from({length:n},(_,i)=>`task_${i+1}`),{maxStates:maxFeasibilityStates});
  await emit('count_feasibility_checked',{count:n,status:result.status,states:result.states});
  if(result.status==='unknown')fail('OWNERSHIP_FEASIBILITY_UNKNOWN',{count:n,states:result.states});
  if(result.status==='feasible')counts[String(n)]=`${n} nonempty artifact-owning work units.`;
 }
 const taskCount=Number(await query('decomposition_count','task_count',contract.questions.count,counts)),taskIds=Array.from({length:taskCount},(_,i)=>`task_${i+1}`),owners={},anchors={};
 const feasible=async partial=>{const result=checkOwnershipFeasibility(manifest,partial,taskIds,{maxStates:maxFeasibilityStates});await emit('ownership_feasibility_checked',{partial,status:result.status,states:result.states});if(result.status==='unknown')fail('OWNERSHIP_FEASIBILITY_UNKNOWN',{states:result.states});return result.status==='feasible';};
 if(taskCount===1){for(const f of manifest.artifact_catalog)owners[f.path]=taskIds[0];anchors[taskIds[0]]=null;await emit('decomposition_bypassed',{stage:'decomposition_file_owner',reason:'singleton_task',choice:taskIds[0]});}
 for(const id of taskCount===1?[]:taskIds){
  const options={};for(const [index,f] of manifest.artifact_catalog.entries())if(!owners[f.path]&&await feasible({...owners,[f.path]:id}))options[`artifact_${index}`]=`${f.path}: ${f.design_fact??f.purpose??''}`;
  const selected=await query('decomposition_anchor',`anchor_${id}`,contract.questions.anchor,options,{task:id,anchors,fileOwners:owners});const path=manifest.artifact_catalog[Number(selected.slice(9))].path;owners[path]=id;anchors[id]=path;
 }
 for(const f of manifest.artifact_catalog)if(!owners[f.path]){
  const options={};for(const id of taskIds)if(await feasible({...owners,[f.path]:id}))options[id]=`Anchor ${anchors[id]}; current owned files: ${Object.keys(owners).filter(p=>owners[p]===id).join(', ')}`;
  owners[f.path]=await query('decomposition_file_owner','file_owner',contract.questions.file,options,{artifact:f,anchors,fileOwners:owners});
 }
 const {dependencies,acyclic}=deriveArtifactDependencies(manifest,owners,taskIds);if(!acyclic)fail('CYCLIC_ARTIFACT_ASSIGNMENT');
 await emit('dependencies_derived',{dependencies,basis:'known artifact dependency_paths only; required_artifacts are acceptance availability, not implementation waits'});
 const requirementOwners={};for(const r of manifest.requirements){
  const relevant=r.artifact_paths?.length?r.artifact_paths:manifest.artifact_catalog.map(f=>f.path),options=Object.fromEntries(taskIds.filter(id=>relevant.some(p=>owners[p]===id)).map(id=>[id,`Accountable requirement integrator; owns ${Object.keys(owners).filter(p=>owners[p]===id).join(', ')}.`]));
  requirementOwners[r.id]=await query('decomposition_requirement_owner','requirement_owner',contract.questions.requirement,options,{requirement:r,anchors,fileOwners:owners,dependencies,requirementOwners});
 }
 const tasks=taskIds.map(id=>{
  const paths=Object.keys(owners).filter(p=>owners[p]===id),accountable=manifest.requirements.filter(r=>requirementOwners[r.id]===id),contributed=manifest.requirements.filter(r=>(r.artifact_paths??[]).some(p=>paths.includes(p))),scope={ownedArtifacts:manifest.artifact_catalog.filter(f=>paths.includes(f.path)),accountableRequirements:accountable,contributingRequirements:contributed};
  return {id,parentId:null,paths,dependsOn:dependencies[id],requirementIds:accountable.map(r=>r.id),requirements:accountable,contributingRequirementIds:contributed.map(r=>r.id),description:`${contract.worker_instructions}\n${JSON.stringify(scope)}`,provenance:{method:'jev_anchored_sequential_assignment',anchor:anchors[id]}};
 });
 const plan=validatePlan({tasks,integrationInstructions:manifest.integrationInstructions,decomposition:{schema_version:contract.schema_version,depth:1,recursive:false,anchors,fileOwners:owners,requirementOwners,dependencies,requirements:manifest.requirements,artifact_catalog:manifest.artifact_catalog,acceptance_scope:'whole candidate; required_artifacts checked only after all implementation tasks'}} ,{minTasks:1});
 await emit('decomposition_validated',{taskCount,plan,issues:[]});return {plan,trace,decisions,corrections:0,wall_ms:performance.now()-started};
}
