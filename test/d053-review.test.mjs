import test from 'node:test';
import assert from 'node:assert/strict';
import {checkOwnershipFeasibility,deriveArtifactDependencies,runTaskDecomposition} from '../src/orchestration/task-decomposition-v2.mjs';
import {validateRequirements} from '../src/orchestration/task-decomposition.mjs';
const fixture=()=>({goal:'Build layered artifacts',integrationInstructions:'Whole-candidate validation',requirements:[{id:'R1',text:'Core and consumer behave correctly',source:{path:'public.md',line:1},acceptance_criteria:['roundtrip behavior'],constraints:[],known_interfaces:[],unresolved_gaps:[],artifact_paths:['a.py','b.py'],required_artifacts:['a.py','b.py']}],artifact_catalog:[{path:'a.py',purpose:'core',dependency_paths:[]},{path:'b.py',purpose:'consumer',dependency_paths:['a.py']},{path:'c.py',purpose:'independent',dependency_paths:[]}]});
const answer=(request,choice)=>({answers:{[Object.keys(request.questions)[0]]:{type:'choice',choice,confidence:.5}}});
test('D053 independent: quotient cycle remains infeasible even original artifact graph is acyclic',()=>{
 const f=fixture();f.artifact_catalog[2].dependency_paths=['b.py'];const m=validateRequirements(f),owners={'a.py':'task_1','b.py':'task_2','c.py':'task_1'};
 assert.equal(deriveArtifactDependencies(m,owners,['task_1','task_2']).acyclic,false);
 assert.equal(checkOwnershipFeasibility(m,owners,['task_1','task_2']).status,'infeasible');
});
test('D053 independent: feasibility search exhaustion is unknown, never feasible',()=>{
 const result=checkOwnershipFeasibility(validateRequirements(fixture()),{},['task_1','task_2'],{maxStates:1});assert.equal(result.status,'unknown');assert.equal(result.witness,null);
});
test('D053 independent: complete owner collapse cannot satisfy requested nonempty count',()=>{
 const m=validateRequirements(fixture());const result=checkOwnershipFeasibility(m,{'a.py':'task_1','b.py':'task_1','c.py':'task_1'},['task_1','task_2']);assert.equal(result.status,'infeasible');
});
test('D053 independent: unknown path and task in partial assignment rejected',()=>{
 const m=validateRequirements(fixture());assert.throws(()=>checkOwnershipFeasibility(m,{'evil.py':'task_1'},['task_1']),/INVALID_PARTIAL/);assert.throws(()=>checkOwnershipFeasibility(m,{'a.py':'unknown'},['task_1']),/INVALID_PARTIAL/);
});
test('D053 independent: layered shared requirement preserves contributors without artificial reverse dependency',async()=>{
 const requests=[];const result=await runTaskDecomposition({requirements:fixture(),decide:async q=>{requests.push(q);const keys=Object.keys(Object.values(q.questions)[0].criteria);let choice=keys[0];if(q.stage==='decomposition_count')choice='2';if(q.stage==='decomposition_anchor')choice=q.state.task==='task_1'?'artifact_0':'artifact_1';if(q.stage==='decomposition_requirement_owner')choice='task_1';return answer(q,choice);}});
 assert.equal(result.plan.tasks.length,2);const [a,b]=result.plan.tasks;assert.deepEqual(a.dependsOn,[]);assert.deepEqual(b.dependsOn,['task_1']);assert.ok(a.contributingRequirementIds.includes('R1'));assert.ok(b.contributingRequirementIds.includes('R1'));assert.deepEqual(result.plan.decomposition.requirementOwners,{R1:'task_1'});assert.ok(requests.filter(q=>q.stage==='decomposition_file_owner').every(q=>Object.keys(q.state.anchors).length===2));
});
test('D053 independent: uncertain provider envelope causes no replay',async()=>{
 let n=0;await assert.rejects(()=>runTaskDecomposition({requirements:fixture(),decide:async()=>{n++;return {outcome_uncertain:true}}}),/UNCERTAIN_PROVIDER_OUTCOME/);assert.equal(n,1);
});
