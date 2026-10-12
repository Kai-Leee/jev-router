const fail=code=>{throw Object.assign(Error(code),{code});};

// D061 versioned validator: at most30 workers, independently of scheduler concurrency.
export function sequentialEnvelopeV3({input,plan,allPaths,profiles}) {
  if(plan?.status!=='complete'||!Array.isArray(plan.tasks)||plan.tasks.length<2||plan.tasks.length>30)fail('INVALID_SEQUENTIAL_PLAN');
  const ids=plan.tasks.map(t=>t.id),obligations=new Map(input.obligations.map(o=>[o.id,o])),tests=new Map(input.tests.map(t=>[t.id,t]));
  if(new Set(ids).size!==ids.length)fail('DUPLICATE_TASK_ID');
  const seen=new Set();
  const tasks=plan.tasks.map((task,index)=>{
    if(!task.id||!Array.isArray(task.obligation_ids)||!task.obligation_ids.length||!Array.isArray(task.test_ids)||!Array.isArray(task.paths)||!task.paths.length||!Array.isArray(task.depends_on))fail('INVALID_SEQUENTIAL_TASK');
    if(task.paths.some(p=>!allPaths.includes(p))||new Set(task.paths).size!==task.paths.length)fail('INVALID_EXECUTION_PATHS');
    if(task.test_ids.some(id=>!tests.has(id))||new Set(task.test_ids).size!==task.test_ids.length)fail('INVALID_TASK_TESTS');
    if(task.depends_on.some(id=>!ids.includes(id)||id===task.id))fail('INVALID_TASK_DEPENDENCY');
    if(!profiles.some(p=>p.id===task.profile?.id&&p.model===task.profile.model&&p.effort===task.profile.effort))fail('INVALID_WORKER_PROFILE');
    for(const id of task.obligation_ids) {if(!obligations.has(id)||seen.has(id))fail('INVALID_OBLIGATION_ALLOCATION');seen.add(id);}
    const required=input.tests.filter(t=>t.requirement_refs.some(id=>task.obligation_ids.includes(id))).map(t=>t.id);
    if(required.some(id=>!task.test_ids.includes(id)))fail('INCOMPLETE_TASK_TEST_ALLOCATION');
    const overlaps=plan.tasks.slice(0,index).filter(prior=>prior.paths.some(p=>task.paths.includes(p))).map(prior=>prior.id);
    return {id:task.id,paths:[...task.paths],obligation_ids:[...task.obligation_ids],test_ids:[...task.test_ids],after:[...new Set([...task.depends_on,...overlaps])],
      task:{...structuredClone(task),goal:input.goal,obligations:task.obligation_ids.map(id=>structuredClone(obligations.get(id))),responsibility:'Implement assigned requirements and linked public checks; preserve predecessors and shared interfaces.'}};
  });
  if(seen.size!==obligations.size)fail('INCOMPLETE_OBLIGATION_ALLOCATION');
  const coveredTests=new Set(tasks.flatMap(t=>t.test_ids));
  if([...tests.keys()].some(id=>!coveredTests.has(id)))fail('INCOMPLETE_TEST_ALLOCATION');
  const done=new Set();
  while(done.size<tasks.length) {const ready=tasks.filter(t=>!done.has(t.id)&&t.after.every(id=>done.has(id)));if(!ready.length)fail('EXECUTION_GRAPH_BLOCKED');ready.forEach(t=>done.add(t.id));}
  return {schema_version:'sequential-execution-envelope/v3',tasks,integration_paths:[...allPaths],uncovered_paths:allPaths.filter(p=>!tasks.some(t=>t.paths.includes(p))),
    scope_basis:'Original obligation scopes; overlapping writes serialize; global integration handles uncovered files.',semantic_independence_verified:false,product_success:null};
}
