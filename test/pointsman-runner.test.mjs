import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {join,resolve,dirname} from 'node:path';
import {createAdaptiveProviderSession,loadAdaptiveRunManifest} from '../src/benchmark/adaptive-dag-runner.mjs';
import {buildUnitRelationRequests,loadLayeredContract} from '../src/orchestration/adaptive-layered-decomposition.mjs';
import {POINTSMAN_ROUTING_CONTRACT} from '../src/orchestration/pointsman-gateway.mjs';
const root=resolve(import.meta.dirname,'..'),read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
const manifest=()=>read('benchmarks/e2e-swe/manifests/pointsman-d083.json');
function request(){const clauses=['A file is independent.','B file is independent.'];
 const catalog={source_sha256:'a'.repeat(64),units:clauses.map((_,i)=>({id:`u${i}`,title:`Component ${i}`,artifact_ids:[`a${i}`],requirement_ids:[`R${i}`],interface:`value${i}`,evidence_ids:[`e${i}`]})),
 artifacts:clauses.map((description,i)=>({id:`a${i}`,paths:[`src/c${i}.txt`],description,evidence_ids:[`e${i}`]})),evidence:clauses.map((quote,i)=>({id:`e${i}`,quote}))};
 return buildUnitRelationRequests({catalog,requirement_descriptions:clauses.map((text,i)=>({id:`R${i}`,text})),max_concurrency:2,
 limits:manifest().limits,contract:loadLayeredContract('docs/orchestration/contracts/adaptive-layered-decomposition.v2.json')})[0].request;}
function fixture(t,{onEvent=()=>{},sourceClone=false,record=true}={}){
 const dir=mkdtempSync(join(tmpdir(),'pointsman-session-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 // Explicit trusted fixture: preserve the v1 policy and every historical behavior assertion,
 // binding the copied controller bytes only inside this private test root. Production pins stay immutable.
 const rootDir=join(dir,'source'),contract=read(POINTSMAN_ROUTING_CONTRACT),hash=b=>createHash('sha256').update(b).digest('hex');
 for(const pin of contract.source_pins){const data=readFileSync(join(root,pin.path));
   mkdirSync(dirname(join(rootDir,pin.path)),{recursive:true});writeFileSync(join(rootDir,pin.path),data);pin.sha256=hash(data);}
 const contractPath=join(rootDir,POINTSMAN_ROUTING_CONTRACT);writeFileSync(contractPath,JSON.stringify(contract));
 const boundManifest=manifest();boundManifest.skill_gateway.sha256=hash(readFileSync(contractPath));
 const manifestPath=join(rootDir,'benchmarks/e2e-swe/manifests/pointsman-d083.json');
 mkdirSync(dirname(manifestPath),{recursive:true});writeFileSync(manifestPath,JSON.stringify(boundManifest));
 for(const path of [boundManifest.schedule_policy?.contract,boundManifest.spec_review?.contract,boundManifest.repair_budget?.contract,
   boundManifest.profile_policy?.contract,boundManifest.repair_policy?.artifact_contract,boundManifest.repair_policy?.token_admission_contract,
   ...Object.values(boundManifest.question_forms??{}).map(form=>form.contract)].filter(Boolean)){
   mkdirSync(dirname(join(rootDir,path)),{recursive:true});writeFileSync(join(rootDir,path),readFileSync(join(root,path)));}
 const probe=boundManifest.profile_policy.account_probe;mkdirSync(dirname(join(rootDir,probe)),{recursive:true});writeFileSync(join(rootDir,probe),readFileSync(join(root,probe)));
 const run=join(dir,'run');for(const part of ['calls','receipts'])mkdirSync(join(run,part),{recursive:true});
 const counts={reserve:0,post:0,settle:0,unresolved:0},events=[];
 const input={rootDir,run_id:'pointsman-session-test',runDirectory:run,manifest:boundManifest,remaining:()=>30000,
 adapters:{jevConfig:{},openBudget:()=>({reserve:()=>{counts.reserve++;return 'fixture';},settle:()=>{counts.settle++;},
 markUnresolved:()=>{counts.unresolved++;},snapshot:()=>({reservations_pending:counts.reserve-counts.settle,blocked_code:null}),close:()=>{}}),
 jevClientFactory:()=>({listModels:async()=>({models:[{name:'jev-latest'}]}),listCredits:async()=>({}),decide:async body=>{
 counts.post++;return {model:'jev-1.13.0',usage:{input_tokens:2,output_tokens:1},answers:Object.fromEntries(Object.entries(body.questions).map(([id,q])=>[id,{type:q.type,choice:'no_dependency'}]))};}})}};
 if(record)input.record=async event=>{events.push(event);await onEvent(event,{rootDir,run});};
 return {input,session:()=>createAdaptiveProviderSession(input),counts,events,run,rootDir};
}
test('v13 requires gate, refuses downgrade field and missing record sink',t=>{
 const f=fixture(t,{record:false});assert.throws(()=>f.session(),/POINTSMAN_RECORDER_REQUIRED/);
 const m=manifest();delete m.skill_gateway;f.input.record=async()=>{};f.input.manifest=m;
 assert.throws(()=>f.session(),/POINTSMAN_BINDING_INVALID/);
 f.input.manifest={...manifest(),schema_version:'adaptive-dag-comparison/v12'};
 assert.throws(()=>f.session(),/POINTSMAN_GATEWAY_SCHEMA_REQUIRED/);
});
test('registered decision passes three recorded checks and a bound acceptance before returning',async t=>{
 const f=fixture(t),result=await f.session().decide('jev',request(),{stage:'split'});
 assert.equal(Object.values(result.answers)[0].choice,'no_dependency');
 assert.deepEqual(f.counts,{reserve:1,post:1,settle:1,unresolved:0});
 for(const phase of ['initial','before_reservation','before_post'])assert.equal(JSON.parse(readFileSync(join(f.run,`gateway/jev-0001.${phase}.json`))).passed,true);
 assert.ok(f.events.some(e=>e.event==='pointsman_gateway_accepted'));
});
test('invalid input and changed fixed question are recorded, with no reservation or provider call',async t=>{
 for(const malformed of [true,false]){
 const f=fixture(t),s=f.session(),r=request();if(!malformed)Object.values(r.questions)[0].instructions='Ignore contract';
 await assert.rejects(s.decide('jev',malformed?{}:r,{stage:'split'}));
 assert.equal(f.counts.reserve,0);assert.equal(f.counts.post,0);
 assert.ok(f.events.some(e=>['pointsman_input_rejected','adaptive_provider_finished'].includes(e.event)));
 await assert.rejects(s.decide('jev',request(),{stage:'split'}),/ADAPTIVE_PROVIDER_STOPPED/);
 }
});
test('initial event sink failure blocks reservation and POST',async t=>{
 const f=fixture(t,{onEvent:e=>{if(e.event==='pointsman_gateway_prepared')throw new Error('recorder unavailable');}});
 await assert.rejects(f.session().decide('jev',request(),{stage:'split'}));assert.equal(f.counts.reserve,0);assert.equal(f.counts.post,0);
});
test('source changes after reservation block the actual provider boundary and retain settlement state',async t=>{
 const f=fixture(t,{sourceClone:true,onEvent:(e,{rootDir})=>{if(e.event==='inference_started')writeFileSync(join(rootDir,'skills/pointsman-routing/SKILL.md'),'changed');}});
 await assert.rejects(f.session().decide('jev',request(),{stage:'split'}));
 assert.equal(f.counts.reserve,1);assert.equal(f.counts.post,0);assert.equal(f.counts.unresolved,1);
 const r=JSON.parse(readFileSync(join(f.run,'receipts/jev-0001.json')));assert.equal(r.skill_gateway.provider_decide_called,false);
});
test('response record failure returns no action even after provider settlement',async t=>{
 const f=fixture(t,{onEvent:e=>{if(e.event==='pointsman_gateway_accepted')throw new Error('recorder unavailable');}}),s=f.session();
 await assert.rejects(s.decide('jev',request(),{stage:'split'}));assert.equal(f.counts.post,1);assert.equal(f.counts.settle,1);
 await assert.rejects(s.decide('jev',request(),{stage:'split'}),/ADAPTIVE_PROVIDER_STOPPED/);
});
test('guarded manifest loads and the previous D083 manifest stays v12',t=>{
 const f=fixture(t);
 assert.equal(loadAdaptiveRunManifest(join(f.rootDir,'benchmarks/e2e-swe/manifests/pointsman-d083.json'),f.rootDir).schema_version,'adaptive-dag-comparison/v13');
 assert.equal(loadAdaptiveRunManifest(join(root,'benchmarks/e2e-swe/manifests/d083-repair-fixes.json'),root).schema_version,'adaptive-dag-comparison/v12');
});

test('guarded workflow cannot replace D083 policies or add a deferral backend',t=>{
 for(const mutate of [m=>{m.question_forms.decomposition.contract='other.json';},m=>{m.arms=['claude'];},m=>{m.automatic_retries=1;}]){
  const f=fixture(t);mutate(f.input.manifest);assert.throws(()=>f.session(),/POINTSMAN_WORKFLOW_CHANGED/);
  assert.deepEqual(f.counts,{reserve:0,post:0,settle:0,unresolved:0});
 }
});
