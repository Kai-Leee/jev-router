import {validateRecursiveInput} from './recursive-task-tests.mjs';

const unique = values => [...new Set(values)];
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, ...details}); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;

/** Jev selects a count, then multiple obligations for each worker from the remainder.
 * Selection batches are independent typed choices, NOT a native multi-select API.
 * No fallback, truncation, paid retries, or generated requirement text occurs here.
 */
export async function allocateSequential({input, profiles, decide, record = async () => {}}) {
  input = validateRecursiveInput(input);
  if (input.obligations.length < 2 || typeof decide !== 'function' || typeof record !== 'function') fail('INVALID_ALLOCATION_INPUT');
  if (!Array.isArray(profiles) || !profiles.length || profiles.length > 255
    || profiles.some(p => !object(p) || !['id', 'model', 'effort', 'description'].every(k => text(p[k])))
    || unique(profiles.map(p => p.id)).length !== profiles.length) fail('INVALID_ALLOCATION_PROFILES');
  profiles = structuredClone(profiles);
  const decisions = [], tasks = [];
  // Each public source/catalog appears once per request, never once per typed question.
  // Wire-only projection: full source (including text/hash/path), goal, constraints,
  // interfaces, artifact interfaces, obligation text/inputs/outputs/write_scope/
  // depends_on/gaps/context_refs, and all test scenarios/inputs/expectations remain.
  // Omitted obligation metadata: requirement_id/title/source_ref/source_span,
  // write_scope_provenance. Source text is
  // complete; unknown dependencies are never asserted independent (see return).
  // Omitted test metadata: runner_ref/status/source_refs/provenance. Input validation
  // requires runner_ref=null and status=not_run. Original IDs map to unmodified
  // input for execution; test IDs retain every original cross-worker linkage.
  const base = {goal: input.goal, source: input.source, constraints: input.constraints, interfaces: input.interfaces,
    obligations: input.obligations.map(({id, text, inputs, outputs, write_scope, depends_on, gaps, context_refs, dependency_assertion, dependency_note}) =>
      ({id, text, inputs, outputs, write_scope, depends_on, gaps, context_refs, dependency_assertion, dependency_note})),
    tests: input.tests.map(({id, requirement_refs, scenario, input, expected, scope}) =>
      ({id, requirement_refs, scenario, input, expected, scope})), artifact_interfaces: input.artifact_interfaces ?? []};
  const ask = async (stage, nodeId, state, questions) => {
    const request = {stage, node_id: nodeId, state: {...base, ...state}, questions};
    await record({event: 'allocation_requested', stage, node_id: nodeId, question_count: Object.keys(questions).length});
    const response = await decide(request);
    const decision = {stage, node_id: nodeId, questions: structuredClone(questions), response: structuredClone(response)};
    decisions.push(decision);
    await record({event: 'allocation_responded', ...decision});
    const answers = response?.answers;
    if (!object(answers) || Object.keys(answers).length !== Object.keys(questions).length
      || Object.entries(questions).some(([key, q]) => !object(answers[key]) || answers[key].type !== 'choice'
        || !Object.hasOwn(q.criteria, answers[key].choice))) fail('INVALID_ALLOCATION_ANSWER', {stage, node_id: nodeId});
    return Object.fromEntries(Object.entries(answers).map(([key, answer]) => [key, answer.choice]));
  };
  const countCriteria = Object.fromEntries([2, 3, 4, 5].filter(n => n <= input.obligations.length).map(n => [String(n),
    `${n} workers with nonempty exclusive obligation ownership; consider coordination and integration costs.`]));
  const count = Number((await ask('count', 'root', {}, {count: {type: 'choice',
    instructions: 'Choose how many workers should implement this public task. Keep-one is excluded in this experiment. Optimize total completion time while preserving all requirements; shared files require serialization.',
    criteria: countCriteria}})).count);
  let remaining = input.obligations.map(o => o.id);
  for (let worker = 0; worker < count; worker++) {
    const id = `worker_${worker + 1}`, reserve = count - worker - 1;
    const selected = [];
    if (reserve === 0) {
      selected.push(...remaining);
      await record({event: 'allocation_deterministic_remainder', node_id: id, obligation_ids: [...selected], semantic_judgment: false});
    } else {
      for (let offset = 0; offset < remaining.length; offset += 32) {
        const batch = remaining.slice(offset, offset + 32);
        const questionMap = Object.fromEntries(batch.map((obligationId, i) => [`select_${i}`, obligationId]));
        const answers = await ask('allocate', id, {worker_count: count, worker_index: worker + 1,
          previous_workers: tasks.map(t => ({id: t.id, obligation_ids: t.obligation_ids})), remaining_obligation_ids: remaining,
          selected_for_current_worker: [...selected], reserve_for_later_workers: reserve,
          maximum_total_selection: remaining.length - reserve, assignment_questions: questionMap},
        Object.fromEntries(Object.entries(questionMap).map(([key, obligationId]) => [key, {type: 'choice',
          instructions: `Should obligation ${obligationId} belong to ${id}? Select a coherent nonempty subset across batches, leave at least ${reserve} obligations for later workers, and preserve explicit dependencies. Previously included obligations remain selected.`,
          criteria: {include: 'Assign this obligation to this worker.', exclude: 'Leave this obligation for a later worker.'}}])));
        const included = Object.entries(questionMap).filter(([key]) => answers[key] === 'include').map(([, obligationId]) => obligationId);
        if (selected.length + included.length > remaining.length - reserve) fail('ALLOCATION_OVER_ALLOCATED', {node_id: id});
        selected.push(...included);
      }
      if (!selected.length) fail('ALLOCATION_EMPTY_WORKER', {node_id: id});
    }
    const obligations = input.obligations.filter(o => selected.includes(o.id));
    const task = {id, obligation_ids: selected, test_ids: input.tests.filter(t => t.requirement_refs.some(ref => selected.includes(ref))).map(t => t.id),
      paths: unique(obligations.flatMap(o => o.write_scope)), profile: null, depends_on: [],
      allocation_method: reserve === 0 ? 'deterministic_remainder' : 'jev_batched_choices'};
    if (!task.paths.length) fail('ALLOCATION_EMPTY_WRITE_SCOPE', {node_id: id});
    tasks.push(task);
    remaining = remaining.filter(obligationId => !selected.includes(obligationId));
  }
  const owners = new Map(tasks.flatMap(task => task.obligation_ids.map(id => [id, task.id])));
  for (const task of tasks) {
    const explicit = input.obligations.filter(o => task.obligation_ids.includes(o.id)).flatMap(o => o.depends_on.map(id => owners.get(id))).filter(id => id !== task.id);
    const earlierWriters = tasks.slice(0, tasks.indexOf(task)).filter(other => other.paths.some(path => task.paths.includes(path))).map(other => other.id);
    task.depends_on = unique([...explicit, ...earlierWriters]);
  }
  const completed = new Set();
  while (completed.size < tasks.length) {
    const next = tasks.find(t => !completed.has(t.id) && t.depends_on.every(id => completed.has(id)));
    if (!next) fail('ALLOCATION_DEPENDENCY_CYCLE');
    completed.add(next.id);
  }
  // Profiles are chosen only after an entire allocation is structurally executable.
  for (const task of tasks) {
    const answer = await ask('profile', task.id, {task, allocated_tasks: tasks.map(t => ({id: t.id, obligation_ids: t.obligation_ids, depends_on: t.depends_on})), profiles},
      {profile: {type: 'choice', instructions: 'Select one supplied model and reasoning-effort profile for this worker. Use the task requirements and documented profile descriptions; do not invent capabilities or profile IDs. Optimize complete-task quality, latency, and cost.',
        criteria: Object.fromEntries(profiles.map(p => [p.id, `${p.model}; effort=${p.effort}; ${p.description}`]))}});
    task.profile = structuredClone(profiles.find(p => p.id === answer.profile));
  }
  const assigned = tasks.flatMap(t => t.obligation_ids), linked = unique(tasks.flatMap(t => t.test_ids));
  if (assigned.length !== input.obligations.length || unique(assigned).length !== assigned.length || remaining.length
    || linked.length !== input.tests.length) fail('ALLOCATION_COVERAGE_MISMATCH');
  return {status: 'complete', count, tasks, decisions, coverage: {obligations: assigned.length, exclusive: true,
    linked_test_specifications: linked.length, tests_executed: 0}, semantic_independence_verified: false};
}
