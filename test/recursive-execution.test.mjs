import test from 'node:test';
import assert from 'node:assert/strict';
import {executeTaskEnvelope,executionEnvelope} from '../src/orchestration/recursive-execution.mjs';

test('shared writers never overlap; independent tasks can overlap and successors read current state',async()=>{
  const tasks=[{id:'a',paths:['shared'],after:[]},{id:'b',paths:['other'],after:[]},{id:'c',paths:['shared'],after:['a']}];
  const live=new Set(),observed=[],state={};
  const result=await executeTaskEnvelope({envelope:{tasks},maxConcurrency:2,execute:async t=>{
    if(t.id==='c')assert.equal(state.shared,'a');
    assert.ok(![...live].some(id=>tasks.find(x=>x.id===id).paths.some(p=>t.paths.includes(p))));
    live.add(t.id);observed.push([...live]);
    await new Promise(resolve=>setTimeout(resolve,10));
    state[t.paths[0]]=t.id;live.delete(t.id);return {saved:true};
  }});
  assert.equal(result.status,'completed');assert.equal(state.shared,'c');
  assert.ok(observed.some(x=>x.includes('a')&&x.includes('b')));
});

test('failure drains already running work without dispatching a successor or retrying',async()=>{
  const called=[];
  const tasks=[{id:'a',paths:['a'],after:[]},{id:'b',paths:['b'],after:[]},{id:'c',paths:['c'],after:['a']}];
  const r=await executeTaskEnvelope({envelope:{tasks},execute:async t=>{
    called.push(t.id);
    if(t.id==='a')throw Object.assign(Error('test'),{code:'KNOWN_FAILURE'});
    await new Promise(resolve=>setTimeout(resolve,5));return {};
  }});
  assert.deepEqual(called,['a','b']);assert.equal(r.status,'failed');assert.deepEqual(r.undispatched_ids,['c']);
  assert.equal(r.failure.code,'KNOWN_FAILURE');assert.deepEqual(r.completed_ids,['b']);
});

test('partial planning cannot be silently promoted to an execution plan',()=>{
  assert.throws(()=>executionEnvelope({plan:{status:'partial'}}),{code:'PLAN_NOT_COMPLETE'});
});

test('blocked dependency graph fails before an implementation call',async()=>{
  let calls=0;
  await assert.rejects(executeTaskEnvelope({envelope:{tasks:[{id:'a',after:['missing'],paths:['a']}]},execute:async()=>calls++}),{code:'EXECUTION_GRAPH_BLOCKED'});
  assert.equal(calls,0);
});

test('a predecessor artifact cannot be overwritten while an active worker reads it',async()=>{
  const tasks=[{id:'a',paths:['base'],after:[]},{id:'reader',paths:['output'],after:['a']},{id:'writer',paths:['base'],after:['a']}];
  let reading=false;
  const result=await executeTaskEnvelope({envelope:{tasks},execute:async(t,ctx)=>{
    if(t.id==='reader'){assert.ok(ctx.readablePaths.includes('base'));reading=true;await new Promise(r=>setTimeout(r,5));reading=false;}
    if(t.id==='writer')assert.equal(reading,false);
    return {};
  }});assert.equal(result.status,'completed');
});
