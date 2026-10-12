import {readFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {validatePlan,safeArtifactPath} from './live-file-workers.mjs';
const contract=JSON.parse(readFileSync(new URL('../../docs/orchestration/contracts/decomposition.v1.json',import.meta.url),'utf8'));
const clone=x=>structuredClone(x);
const fail=code=>{throw Object.assign(new Error(code),{code});};
export function validateRequirements(input){
 input=clone(input);
 if(input?.files&&!input.artifact_catalog)input.artifact_catalog=input.files.map(f=>({...f,design_fact:f.purpose}));
 if(Array.isArray(input?.requirements))input.requirements=input.requirements.map(r=>typeof r.source==='string'?{...r,text:r.source,source:r.source_ref,acceptance_criteria:r.acceptance,known_interfaces:r.interfaces,unresolved_gaps:r.gaps}:r);
 if(!input||typeof input.goal!=='string'||!input.goal.trim()||!Array.isArray(input.requirements)||!input.requirements.length||!Array.isArray(input.artifact_catalog)||!input.artifact_catalog.length||typeof input.integrationInstructions!=='string'||!input.integrationInstructions.trim())fail('INVALID_REQUIREMENTS');
 const ids=new Set(),paths=[];
 for(const r of input.requirements){
  if(typeof r.id!=='string'||!r.id||ids.has(r.id)||typeof r.text!=='string'||!r.text.trim()||!r.source||!Array.isArray(r.acceptance_criteria)||!r.acceptance_criteria.length||r.acceptance_criteria.some(a=>typeof a!=='string'||!a.trim()))fail('INVALID_REQUIREMENT');
  ids.add(r.id);
  for(const field of ['constraints','known_interfaces','unresolved_gaps'])if(!Array.isArray(r[field]))fail('INVALID_REQUIREMENT');
 }
 for(const f of input.artifact_catalog){safeArtifactPath(f.path);if(paths.some(p=>p===f.path||p.startsWith(f.path+'/')||f.path.startsWith(p+'/')))fail('OVERLAPPING_CATALOG');paths.push(f.path);}
 return clone(input);
}
export function validateDecomposition(manifest,{taskCount,requirementOwners,fileOwners,dependencies}){
 const issues=[],ids=Array.from({length:taskCount},(_,i)=>`task_${i+1}`);
 if(!Number.isInteger(taskCount)||taskCount<1||taskCount>Math.min(5,manifest.requirements.length,manifest.artifact_catalog.length))return [{id:'invalid_count',expected:'1 to min(5, requirements, artifacts)'}];
 for(const [label,entries,owners,key] of [['requirement',manifest.requirements,requirementOwners,'id'],['file',manifest.artifact_catalog,fileOwners,'path']]){
  const expected=new Set(entries.map(x=>x[key]));
  for(const id of expected)if(!ids.includes(owners?.[id]))issues.push({id:`missing_${label}_owner`,item:id});
  for(const id of Object.keys(owners??{}))if(!expected.has(id))issues.push({id:`unknown_${label}`,item:id});
  for(const owner of ids)if(!Object.values(owners??{}).includes(owner))issues.push({id:`empty_${label}_task`,task:owner});
 }
 for(const r of manifest.requirements)if(Array.isArray(r.artifact_paths)&&r.artifact_paths.length){
  if(r.artifact_paths.some(path=>!manifest.artifact_catalog.some(f=>f.path===path)))issues.push({id:'unknown_relevant_artifact',requirement:r.id});
  if(!r.artifact_paths.some(path=>fileOwners?.[path]===requirementOwners?.[r.id]))issues.push({id:'requirement_owner_without_relevant_artifact',requirement:r.id,accountableTask:requirementOwners?.[r.id]??null,artifact_paths:r.artifact_paths});
 }
 const edges=dependencies??{};
 for(const [id,deps] of Object.entries(edges))if(!ids.includes(id)||!Array.isArray(deps)||new Set(deps).size!==deps.length||deps.some(d=>!ids.includes(d)||d===id))issues.push({id:'invalid_dependency',task:id});
 if(!issues.some(x=>x.id==='invalid_dependency')){
  const done=new Set();let progress=true;while(progress){progress=false;for(const id of ids)if(!done.has(id)&&(edges[id]??[]).every(d=>done.has(d))){done.add(id);progress=true;}}
  if(done.size!==ids.length)issues.push({id:'cyclic_dependencies',tasks:ids.filter(id=>!done.has(id))});
 }
 if(!issues.some(x=>x.id==='invalid_dependency'||x.id==='cyclic_dependencies')){
  const precedes=(producer,consumer,seen=new Set())=>{if(producer===consumer)return true;if(seen.has(consumer))return false;seen.add(consumer);return (edges[consumer]??[]).some(d=>precedes(producer,d,seen));};
  for(const r of manifest.requirements)for(const path of r.required_artifacts??[]){
   if(!manifest.artifact_catalog.some(f=>f.path===path))issues.push({id:'unknown_requirement_artifact',requirement:r.id,path});
   else if(fileOwners?.[path]&&requirementOwners?.[r.id]&&!precedes(fileOwners[path],requirementOwners[r.id]))issues.push({id:'requirement_artifact_unavailable',requirement:r.id,path,artifactTask:fileOwners[path],accountableTask:requirementOwners[r.id]});
  }
  for(const file of manifest.artifact_catalog)for(const path of file.dependency_paths??[]){
   if(!manifest.artifact_catalog.some(f=>f.path===path))issues.push({id:'unknown_dependency_path',path,file:file.path});
   else if(fileOwners?.[path]&&fileOwners?.[file.path]&&!precedes(fileOwners[path],fileOwners[file.path]))issues.push({id:'missing_artifact_dependency',producer:path,consumer:file.path,producerTask:fileOwners[path],consumerTask:fileOwners[file.path]});
  }
 }
 return issues;
}
export function assembleDecompositionPlan(manifest,assignments){
 const issues=validateDecomposition(manifest,assignments);if(issues.length)throw Object.assign(new Error('INVALID_DECOMPOSITION'),{code:'INVALID_DECOMPOSITION',issues});
 const tasks=Array.from({length:assignments.taskCount},(_,i)=>{
  const id=`task_${i+1}`,requirements=manifest.requirements.filter(r=>assignments.requirementOwners[r.id]===id);
  return {id,parentId:null,requirementIds:requirements.map(r=>r.id),requirements:clone(requirements),description:[contract.worker_instructions,...requirements.map(r=>JSON.stringify(r))].join('\n'),paths:manifest.artifact_catalog.filter(f=>assignments.fileOwners[f.path]===id).map(f=>f.path),dependsOn:clone(assignments.dependencies[id]??[]),provenance:{method:'jev_typed_assignment',revision:assignments.revision??0}};
 });
 return validatePlan({tasks,integrationInstructions:manifest.integrationInstructions,decomposition:{schema_version:contract.schema_version,depth:1,recursive:false,requirements:clone(manifest.requirements),artifact_catalog:clone(manifest.artifact_catalog),assignments:clone(assignments)}},{minTasks:1});
}
export async function runTaskDecomposition({requirements,decide,record=async()=>{},maxCorrections=1,maxConcurrency=2,workerProfile={model:'claude-opus-5-5',effort:'medium'}}){
 const manifest=validateRequirements(requirements);if(typeof decide!=='function'||typeof record!=='function'||!Number.isInteger(maxCorrections)||maxCorrections<0||maxCorrections>2||!Number.isInteger(maxConcurrency)||maxConcurrency<1||maxConcurrency>5)fail('INVALID_DECOMPOSITION_OPTIONS');
 const start=performance.now(),trace=[];let decisions=0,sequence=0,priorIssues=[];
 const emit=async(event,data)=>{const row={event,sequence:++sequence,...clone(data)};trace.push(row);await record(row);};
 const query=async(stage,questions,state)=>{
  const answers={},pending={};for(const [key,q] of Object.entries(questions)){const options=Object.keys(q.criteria);if(options.length===1){answers[key]=options[0];await emit('decomposition_bypassed',{stage,key,choice:options[0],reason:'singleton'});}else pending[key]=q;}
  const entries=Object.entries(pending);
  for(let offset=0;offset<entries.length;offset+=32){
   const batch=Object.fromEntries(entries.slice(offset,offset+32)),request={stage,questions:batch,state:{objective:contract.objective,requirements:manifest,workerProfile,maxConcurrency,...clone(state),previousBatchAnswers:clone(answers)}};
   await emit('decomposition_requested',request);const response=await decide(clone(request));decisions++;
   if(response?.outcome_uncertain===true||response?.uncertain===true)fail('UNCERTAIN_PROVIDER_OUTCOME');
   for(const [key,q] of Object.entries(batch)){const a=response?.answers?.[key];if(a?.type!=='choice'||!Object.hasOwn(q.criteria,a.choice)||typeof a.choice!=='string')fail('INVALID_DECOMPOSITION_ANSWER');answers[key]=a.choice;}
   await emit('decomposition_answered',{stage,offset,response});
  }
  return answers;
 };
 const choice=(instructions,criteria)=>({type:'choice',instructions,criteria});
 const maxCount=Math.min(5,manifest.requirements.length,manifest.artifact_catalog.length);
 const countAnswer=await query('decomposition_count',{task_count:choice(contract.questions.count,Object.fromEntries(Array.from({length:maxCount},(_,i)=>[String(i+1),`Create ${i+1} accountable work units; no groups are preassigned.`])))},{}),taskCount=Number(countAnswer.task_count),ids=Array.from({length:taskCount},(_,i)=>`task_${i+1}`);
 const ownerOptions=Object.fromEntries(ids.map(id=>[id,`Assign sole implementation responsibility to ${id}.`]));
 for(let revision=0;revision<=maxCorrections;revision++){
  const questions={};manifest.requirements.forEach((r,i)=>{questions[`requirement_${i}`]=choice(`${contract.questions.requirement}\nRequirement ID: ${r.id}`,ownerOptions);});manifest.artifact_catalog.forEach((f,i)=>{questions[`file_${i}`]=choice(`${contract.questions.file}\nArtifact path: ${f.path}`,ownerOptions);});
  const answers=await query('decomposition_assignment',questions,{taskCount,revision,priorIssues});
  const requirementOwners=Object.fromEntries(manifest.requirements.map((r,i)=>[r.id,answers[`requirement_${i}`]])),fileOwners=Object.fromEntries(manifest.artifact_catalog.map((f,i)=>[f.path,answers[`file_${i}`]]));
  const dependencies=Object.fromEntries(ids.map(id=>[id,[]])),pairs=[];const dependencyQuestions={};
  for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){const a=ids[i],b=ids[j],key=`dependency_${i}_${j}`;pairs.push({a,b,key});dependencyQuestions[key]=choice(`${contract.questions.dependency}\nPair: ${a}, ${b}`,{independent:`Neither needs the other's completed artifact before implementation.`,a_before_b:`${b} needs accepted output from ${a}.`,b_before_a:`${a} needs accepted output from ${b}.`});}
  const dependencyAnswers=await query('decomposition_dependencies',dependencyQuestions,{taskCount,revision,requirementOwners,fileOwners,priorIssues});
  for(const {a,b,key} of pairs){if(dependencyAnswers[key]==='a_before_b')dependencies[b].push(a);if(dependencyAnswers[key]==='b_before_a')dependencies[a].push(b);}
  const assignments={taskCount,requirementOwners,fileOwners,dependencies,revision};priorIssues=validateDecomposition(manifest,assignments);
  await emit('decomposition_validated',{assignments,issues:priorIssues});
  if(!priorIssues.length){const plan=assembleDecompositionPlan(manifest,assignments);return {plan,trace,decisions,corrections:revision,wall_ms:performance.now()-start};}
 }
 throw Object.assign(new Error('DECOMPOSITION_CORRECTION_LIMIT'),{code:'DECOMPOSITION_CORRECTION_LIMIT',issues:priorIssues,trace});
}
