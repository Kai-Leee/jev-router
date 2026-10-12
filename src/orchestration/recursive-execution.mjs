import {validateRecursivePlan} from './recursive-task-tests.mjs';

const fail = code => { throw Object.assign(new Error(code), {code}); };
const unique = values => [...new Set(values)];

// A new execution envelope never upgrades the original planning-only artifact.
export function executionEnvelope({input, plan, allPaths}) {
  if (plan?.status !== 'complete') fail('PLAN_NOT_COMPLETE');
  validateRecursivePlan({input, tasks:plan.tasks, tests:plan.tests});
  if (!Array.isArray(allPaths) || !allPaths.length || unique(allPaths).length !== allPaths.length) fail('INVALID_EXECUTION_PATHS');
  const leaves = plan.tasks.filter(t=>!t.children.length);
  if (leaves.some(t=>t.planning_status!=='ready_specification_only' || !t.write_scope.length || t.write_scope.some(p=>!allPaths.includes(p)))) fail('INVALID_EXECUTION_LEAF');
  const tasks=leaves.map(task=>({
    id:task.id, paths:[...task.write_scope], obligation_ids:[...task.obligation_ids], test_ids:[...task.test_ids],
    after:unique([...task.depends_on,...task.write_serialization.map(w=>w.after).filter(Boolean)]),
    task:structuredClone(task),
  }));
  const done=new Set();
  while(done.size<tasks.length) {
    const ready=tasks.filter(t=>!done.has(t.id)&&t.after.every(id=>done.has(id)));
    if(!ready.length) fail('EXECUTION_GRAPH_BLOCKED');
    ready.forEach(t=>done.add(t.id));
  }
  return {schema_version:'recursive-execution-envelope/v1',tasks,
    integration_paths:[...allPaths],
    uncovered_paths:allPaths.filter(p=>!tasks.some(t=>t.paths.includes(p))),
    scope_basis:'Conservative artifact relevance; explicit experiment authorizes implementation within these scopes. Global integration resolves interfaces and uncovered files.',
    semantic_independence_verified:false, product_success:null};
}

export async function executeTaskEnvelope({envelope, execute, record=async()=>{}, maxConcurrency=2}) {
  if(!Number.isSafeInteger(maxConcurrency)||maxConcurrency<1||typeof execute!=='function') fail('INVALID_EXECUTOR');
  const tasks=envelope.tasks, done=new Set(), results=[], running=new Map();
  let firstFailure=null;
  const launch=(task,readablePaths)=>{
    const p=(async()=>{
      try {
        await record({event:'execution_task_started',task_id:task.id,paths:task.paths});
        const value=await execute(task,{readablePaths});
        await record({event:'execution_task_finished',task_id:task.id,status:'completed'});
        return {task_id:task.id,status:'completed',value};
      } catch(error) {
        return {task_id:task.id,status:'failed',code:error.code??'WORKER_FAILED',outcome_uncertain:error.uncertain??error.outcomeUncertain??false};
      }
    })();
    running.set(task.id,{task,p,readablePaths});
  };
  while(done.size<tasks.length && (!firstFailure||running.size)) {
    if(!firstFailure) {
      for(const task of tasks) {
        if(running.size>=maxConcurrency) break;
        if(done.has(task.id)||running.has(task.id)||!task.after.every(id=>done.has(id))) continue;
        const activeWrites=new Set([...running.values()].flatMap(v=>v.task.paths));
        const readablePaths=unique([...task.paths,...tasks.filter(t=>done.has(t.id)).flatMap(t=>t.paths)])
          .filter(p=>!activeWrites.has(p)||task.paths.includes(p));
        if([...running.values()].some(({task:other,readablePaths:reads})=>
          task.paths.some(p=>other.paths.includes(p)||reads.includes(p))||readablePaths.some(p=>other.paths.includes(p)))) continue;
        launch(task,readablePaths);
      }
    }
    if(!running.size) {
      if(!firstFailure) fail('EXECUTION_GRAPH_BLOCKED');
      break;
    }
    const outcome=await Promise.race([...running.values()].map(v=>v.p));
    running.delete(outcome.task_id); results.push(outcome);
    if(outcome.status==='completed') done.add(outcome.task_id);
    else {firstFailure??=outcome; await record({event:'execution_task_failed',...outcome});}
  }
  return {status:firstFailure?'failed':'completed',results,completed_ids:[...done],failure:firstFailure,
    undispatched_ids:tasks.filter(t=>!results.some(r=>r.task_id===t.id)).map(t=>t.id)};
}
