import test from 'node:test';
import assert from 'node:assert/strict';
import { expandDocumentedTask, documentHash, validateDocumentBundle, validateTaskTree, buildDecisionRequest, dispatchDecision, runTaskTree } from '../src/orchestration/document-router.mjs';
const task = (id, parentId = null, extra = {}) => ({id,parentId,description:`Implement ${id}`,requirementIds:['r'],dependsOn:[],writeScopes:[parentId === null ? 'src' : parentId === 'root' ? `src/${id}` : `src/${parentId}/${id}`],evidenceIds:['e'],splitSketch:{children:[{id:'x',description:'part x',dependsOn:[],writeScopes:['x']},{id:'y',description:'part y',dependsOn:[],writeScopes:['y']}],dependencies:[],integration:'Run integration verification'},...extra});
const bundle = () => ({version:'v1',goal:{id:'g',text:'Build app'},requirements:[{id:'r',text:'Exact acceptance requirement'}],tasks:[task('root')],evidence:[{id:'e',text:'Actual failure log and ownership report'}],profiles:[{id:'fast',model:'fixture-model',effort:'low',description:'For bounded editing'}],failureCatalog:[{id:'implementation',description:'Code defect evidenced by failing check',handler:'repair'}]});
const answer = (choice) => ({type:'choice',choice});
const splitResponse = (p,e='sufficient') => ({answers:{beneficial:{type:'noul',noul:p},evidence:answer(e)}});

test('document request contains original text and paired profiles; missing materialization rejected', () => {
 const b=bundle(); const r=buildDecisionRequest(b,{kind:'worker',taskId:'root'});
 assert.equal(r.state.documents.requirements[0].text,b.requirements[0].text);
 assert.match(r.questions.selection.criteria.fast,/fixture-model.*low/);
 b.evidence[0]={id:'e',path:'/tmp/only-reference'};
 assert.throws(()=>validateDocumentBundle(b),/materialized/);
});
test('split probability directly dispatches injected function and insufficiency overrides high probability',async()=>{
 const request=buildDecisionRequest(bundle(),{kind:'split',taskId:'root'}); const calls=[];
 const handlers=Object.fromEntries(['expand_task','execute_leaf','collect_evidence'].map(k=>[k,()=>calls.push(k)]));
 for(const [p,e,action] of [[.8,'sufficient','expand_task'],[.4,'sufficient','execute_leaf'],[.99,'insufficient','collect_evidence']]) {
  const r=await dispatchDecision({request,response:splitResponse(p,e),currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,splitThreshold:.7,handlers}); assert.equal(r.action,action);
 }
 assert.deepEqual(calls,['expand_task','execute_leaf','collect_evidence']);
});
test('split rejects stale, NaN, range, missing answers and implicit threshold before execution',async()=>{
 const request=buildDecisionRequest(bundle(),{kind:'split',taskId:'root'}); let called=false;
 const base={request,response:splitResponse(.9),currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,splitThreshold:.7,handlers:{expand_task:()=>called=true}};
 for(const changed of [{currentEvidenceVersion:'v2'},{response:splitResponse(NaN)},{response:splitResponse(1.01)},{response:{answers:{}}},{splitThreshold:undefined}]) await assert.rejects(dispatchDecision({...base,...changed}));
 assert.equal(called,false);
});
test('worker selection uses allowed model/effort pair, response cannot inject a handler',async()=>{
 const request=buildDecisionRequest(bundle(),{kind:'worker',taskId:'root'}); let profile;
 const base={request,currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,handlers:{spawn_worker:c=>profile=c.profile}};
 await dispatchDecision({...base,response:{answers:{selection:answer('fast')},model:'malicious-model',handler:'shell'}});
 assert.equal(profile.model,'fixture-model'); assert.equal(profile.effort,'low');
 await assert.rejects(dispatchDecision({...base,response:{answers:{selection:answer('shell')}}}),/unknown choice/);
});
test('failure category routes registered handler and unknown collects evidence',async()=>{
 const request=buildDecisionRequest(bundle(),{kind:'failure',taskId:'root'});
 const handlers={repair:()=> 'repair',collect_evidence:()=> 'collect'};
 for(const [value,action] of [['implementation','repair'],['unknown','collect_evidence']]) assert.equal((await dispatchDecision({request,response:{answers:{selection:answer(value)}},currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,handlers})).action,action);
 await assert.rejects(dispatchDecision({request,response:{answers:{selection:answer('implementation')}},currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,handlers:{}}),/registered handler/);
});
test('requirement decisions have five statuses and never finish',async()=>{
 const request=buildDecisionRequest(bundle(),{kind:'requirement',taskId:'root',requirementId:'r'});
 assert.deepEqual(Object.keys(request.questions.status.criteria),['supported','contradicted','insufficient_evidence','needs_execution','blocked']);
 let status; await dispatchDecision({request,response:{answers:{status:answer('needs_execution')}},currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,handlers:{run_verification:c=>status=c.selection}}); assert.equal(status,'needs_execution');
 await assert.rejects(dispatchDecision({request,response:{answers:{status:answer('finish')}},currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,handlers:{}}));
});
test('task tree rejects duplicate, missing parent/dependency, cycles and missing coverage',()=>{
 const req=[{id:'r',text:'requirement'}];
 const invalid=[ [task('root'),task('root')], [task('root'),task('x','missing')], [task('root'),task('a','root',{dependsOn:['missing']})], [task('root'),task('a','root',{dependsOn:['b']}),task('b','root',{dependsOn:['a']})], [task('root'),task('a','root',{requirementIds:[]})] ];
 for(const tasks of invalid) assert.throws(()=>validateTaskTree(tasks,req));
});
test('scheduler runs independent siblings concurrently; dependency follows and no aggregate verification',async()=>{
 const tasks=[task('root'),task('a','root'),task('b','root'),task('c','root',{dependsOn:['a','b']})]; let active=0,peak=0;
 const r=await runTaskTree({tasks,requirements:[{id:'r'}],maxConcurrency:2,executeLeaf:async()=>{active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return {ok:true};}});
 assert.equal(peak,2); assert.equal(r.states.root,'aggregate_ready');assert.equal(r.goalVerified,false);
 const startC=r.events.findIndex(e=>e.type==='started'&&e.taskId==='c');assert.ok(r.events.slice(0,startC).filter(e=>e.type==='settled').length===2);
});
test('scheduler serializes overlapping ownership and blocks failure dependants',async()=>{
 const tasks=[task('root'),task('a','root',{writeScopes:['src']}),task('b','root',{writeScopes:['src/file']}),task('c','root',{dependsOn:['a']})];let active=0,peak=0;const executed=[];
 const r=await runTaskTree({tasks,requirements:[{id:'r'}],maxConcurrency:3,executeLeaf:async t=>{executed.push(t.id);active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,5));active--;return {ok:t.id!=='a'};}});
 assert.equal(peak,1);assert.equal(r.states.c,'blocked');assert.equal(r.states.root,'blocked');assert.deepEqual(executed,['a','b']);
});
test('composite dependency gates descendants; thrown worker failures stay failed',async()=>{
 const tasks=[task('root'),task('a','root'),task('b','root',{dependsOn:['a']}),task('b1','b')];const ran=[];
 const r=await runTaskTree({tasks,requirements:[{id:'r'}],maxConcurrency:2,executeLeaf:async t=>{ran.push(t.id);throw new Error('fixture failure');}});
 assert.deepEqual(ran,['a']);assert.equal(r.states.b1,'blocked');assert.equal(r.states.root,'blocked');
});

test('content hash mismatch and absent split sketch do not dispatch expansion',async()=>{
 const b=bundle();delete b.tasks[0].splitSketch;const request=buildDecisionRequest(b,{kind:'split',taskId:'root'});
 const base={request,response:splitResponse(.99),currentEvidenceVersion:'v1',currentEvidenceHash:documentHash(b),splitThreshold:.6,handlers:{collect_evidence:()=>true}};
 assert.equal((await dispatchDecision(base)).action,'collect_evidence');
 await assert.rejects(dispatchDecision({...base,currentEvidenceHash:'wrong'}),/hash/);
 request.state.documents.goal.text='mutated';await assert.rejects(dispatchDecision(base),/hash/);
});
test('task selection dispatches only explicit known ready candidates',async()=>{
 const b=bundle();b.tasks.push(task('a','root'),task('b','root'));
 const request=buildDecisionRequest(b,{kind:'task',taskId:'root',readyTaskIds:['a']});let chosen;
 const base={request,currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,handlers:{dispatch_task:c=>chosen=c.selectedTask.id}};
 await dispatchDecision({...base,response:{answers:{selection:answer('a')}}});assert.equal(chosen,'a');
 await assert.rejects(dispatchDecision({...base,response:{answers:{selection:answer('b')}}}),/unknown choice/);
 assert.throws(()=>buildDecisionRequest(b,{kind:'task',taskId:'root',readyTaskIds:['missing']}));
 b.failureCatalog=[];assert.throws(()=>buildDecisionRequest(b,{kind:'failure',taskId:'root'}),/candidate limit/);
});

test('each requirement status maps to a distinct concrete handler without finish',async()=>{
 const request=buildDecisionRequest(bundle(),{kind:'requirement',taskId:'root',requirementId:'r'});
 const expected={supported:'record_requirement_evidence',contradicted:'dispatch_repair',insufficient_evidence:'collect_evidence',needs_execution:'run_verification',blocked:'record_blocker'};
 const called=[];const handlers=Object.fromEntries(Object.values(expected).map(name=>[name,()=>called.push(name)]));
 for(const [status,action] of Object.entries(expected)){
 const result=await dispatchDecision({request,response:{answers:{status:answer(status)}},currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,handlers});assert.equal(result.action,action);
 }assert.deepEqual(called,Object.values(expected));
});
test('parent cycle, dotted ownership and uncovered parent requirements are rejected',()=>{
 const req=[{id:'r'},{id:'r2'}];
 assert.throws(()=>validateTaskTree([task('root'),task('a','b',{writeScopes:[]}),task('b','a',{writeScopes:[]})],req),/cycle/);
 assert.throws(()=>validateTaskTree([task('root',null,{writeScopes:['.']})],req));
 assert.throws(()=>validateTaskTree([task('root',null,{requirementIds:['r','r2']}),task('a','root')],req),/coverage/);
});

test('question mutation rejected; handler receives materialized source evidence',async()=>{
 const request=buildDecisionRequest(bundle(),{kind:'failure',taskId:'root'});let ctx;
 const base={request,response:{answers:{selection:answer('implementation')}},currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,handlers:{repair:c=>{ctx=c;c.documents.evidence[0].text='handler changed';}}};
 await dispatchDecision(base);assert.equal(ctx.task.id,'root');assert.equal(request.state.documents.evidence[0].text,'Actual failure log and ownership report');
 request.questions.selection.instructions='changed';await assert.rejects(dispatchDecision(base),/request hash/);
});

test('invalid split sketches collect evidence rather than expanding',async()=>{
 for(const defect of ['duplicate','cycle','missing','ownership']){const b=bundle();const kids=b.tasks[0].splitSketch.children;
 if(defect==='duplicate')kids[1].id='x';if(defect==='cycle'){kids[0].dependsOn=['y'];kids[1].dependsOn=['x'];}if(defect==='missing')kids[0].dependsOn=['none'];if(defect==='ownership')delete kids[0].writeScopes;
 const request=buildDecisionRequest(b,{kind:'split',taskId:'root'});
 const r=await dispatchDecision({request,response:splitResponse(.99),currentEvidenceVersion:'v1',currentEvidenceHash:request.state.evidenceHash,splitThreshold:.6,handlers:{collect_evidence:()=>true}});assert.equal(r.action,'collect_evidence');
 }
});

test('ownership cannot exceed parent scopes; oversized materialized request fails before inference',()=>{
 const b=bundle();b.tasks.push(task('a','root',{writeScopes:['outside']}));assert.throws(()=>validateDocumentBundle(b),/outside parent ownership/);
 const large=bundle();large.evidence[0].text='x'.repeat(256000);assert.throws(()=>buildDecisionRequest(large,{kind:'worker',taskId:'root'}),/byte document limit/);
});

test('expansion requires exact approved sketch children and ownership',()=>{
 const b=bundle();b.tasks.push(task('x','root'),task('y','root'));
 b.tasks[0].splitSketch.children=b.tasks.slice(1).map(t=>({id:t.id,description:t.description,dependsOn:t.dependsOn,writeScopes:t.writeScopes}));
 assert.deepEqual(expandDocumentedTask(b,'root').map(t=>t.id),['x','y']);
 b.tasks[1].description='unapproved change';assert.throws(()=>expandDocumentedTask(b,'root'),/differs/);
});
