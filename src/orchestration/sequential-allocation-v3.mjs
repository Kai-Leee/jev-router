import {readFileSync} from 'node:fs';
import {validateRecursiveInput} from './recursive-task-tests.mjs';

const contract = JSON.parse(readFileSync(new URL('../../docs/orchestration/contracts/sequential-allocation.v3.json', import.meta.url), 'utf8'));
const unique = values => [...new Set(values)];
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, ...details}); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;

/** Jev selects a count, then multiple obligations for each worker from the remainder.
 * Selection batches are independent typed choices, NOT a native multi-select API.
 * No fallback, truncation, paid retries, or generated requirement text occurs here.
 */
export async function allocateSequentialV3({input, profiles, decide, record = async () => {}, policy = {}}) {
  input = validateRecursiveInput(input);
  if (input.obligations.length < 2 || typeof decide !== 'function' || typeof record !== 'function') fail('INVALID_ALLOCATION_INPUT');
  if (!Array.isArray(profiles) || !profiles.length || profiles.length > 255
    || profiles.some(p => !object(p) || !['id', 'model', 'effort', 'description'].every(k => text(p[k])))
    || unique(profiles.map(p => p.id)).length !== profiles.length) fail('INVALID_ALLOCATION_PROFILES');
  if (!object(policy)) fail('INVALID_ALLOCATION_POLICY');
  policy = structuredClone({...contract.policy, ...policy});
  if (!Number.isFinite(policy.load_multiplier) || policy.load_multiplier < 1
    || !Number.isInteger(policy.max_refinement_rounds) || policy.max_refinement_rounds < 0 || policy.max_refinement_rounds > 3
    || !Number.isInteger(policy.batch_size) || policy.batch_size < 1 || policy.batch_size > 32
    || !Array.isArray(policy.count_options) || !policy.count_options.length
    || policy.count_options.some(n => !Number.isInteger(n) || n < 2 || n > 30)
    || unique(policy.count_options).length !== policy.count_options.length) fail('INVALID_ALLOCATION_POLICY');
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
  const pathOwners = new Map();
  for (const obligation of input.obligations) for (const path of obligation.write_scope)
    pathOwners.set(path, [...(pathOwners.get(path) ?? []), obligation.id]);
  const independenceEvidence = {
    shared_write_paths: [...pathOwners].filter(([, ids]) => ids.length > 1).map(([path, obligation_ids]) => ({path, obligation_ids})),
    explicit_dependency_edges: input.obligations.flatMap(o => o.depends_on.map(dependency => ({obligation_id: o.id, depends_on: dependency}))),
    unknown_dependency_ids: input.obligations.filter(o => o.dependency_assertion !== 'asserted').map(o => o.id),
    semantic_independence_verified: false,
  };
  const counts = policy.count_options.filter(n => n <= input.obligations.length);
  if (!counts.length) fail('ALLOCATION_INFEASIBLE_COUNT');
  const countCriteria = Object.fromEntries(counts.map(n => [String(n), `${n} workers; maximum ${Math.ceil(policy.load_multiplier * input.obligations.length / n)} obligations each. Count is not effort or execution time.`]));
  let count;
  if (counts.length === 1) {
    count = counts[0];
    await record({event: 'allocation_deterministic_count', count, semantic_judgment: false});
  } else count = Number((await ask('count', 'root', {independence_evidence: independenceEvidence, policy},
    {count: {type: 'choice', instructions: contract.questions.count, criteria: countCriteria}})).count);
  const cap = Math.ceil(policy.load_multiplier * input.obligations.length / count);
  let remaining = input.obligations.map(o => o.id);
  for (let worker = 0; worker < count; worker++) {
    const id = `worker_${worker + 1}`, reserve = count - worker - 1;
    const minimum = Math.max(1, remaining.length - reserve * cap);
    const maximum = Math.min(cap, remaining.length - reserve);
    if (minimum > maximum) fail('ALLOCATION_INFEASIBLE_CAPACITY', {node_id: id, minimum, maximum});
    let selected = [], refinementRound = 0;
    if (reserve === 0) {
      selected = [...remaining];
      await record({event: 'allocation_deterministic_remainder', node_id: id, obligation_ids: [...selected], semantic_judgment: false});
    } else {
      for (;;) {
        const previousSelection = [...selected];
        selected = [];
        for (let offset = 0; offset < remaining.length; offset += policy.batch_size) {
          const batch = remaining.slice(offset, offset + policy.batch_size);
          const questionMap = Object.fromEntries(batch.map((obligationId, i) => [`select_${i}`, obligationId]));
          const answers = await ask(refinementRound ? 'refine' : 'allocate', id, {
            worker_count: count, worker_index: worker + 1, policy, independence_evidence: independenceEvidence,
            previous_workers: tasks.map(t => ({id: t.id, obligation_ids: t.obligation_ids, paths: t.paths, obligation_count: t.obligation_ids.length})),
            remaining_obligation_ids: remaining, selected_for_current_worker: [...selected],
            reserve_for_later_workers: reserve, maximum_total_selection: maximum, minimum_total_selection: minimum,
            maximum_obligations_per_worker: cap, current_load: selected.length,
            refinement_round: refinementRound, prior_rejected_selection: previousSelection,
            assignment_questions: questionMap,
          }, Object.fromEntries(Object.entries(questionMap).map(([key, obligationId]) => [key, {type: 'choice',
            instructions: `${refinementRound ? contract.questions.refine : contract.questions.allocate} Obligation: ${obligationId}; worker: ${id}. Final selection must contain ${minimum} through ${maximum} obligations.`,
            criteria: contract.criteria.assignment}])));
          selected.push(...Object.entries(questionMap).filter(([key]) => answers[key] === 'include').map(([, obligationId]) => obligationId));
        }
        if (selected.length >= minimum && selected.length <= maximum) break;
        await record({event: 'allocation_selection_rejected', node_id: id, selected_count: selected.length,
          minimum, maximum, refinement_round: refinementRound, obligation_ids: [...selected]});
        if (refinementRound >= policy.max_refinement_rounds) fail('ALLOCATION_REFINEMENT_EXHAUSTED',
          {node_id: id, selected_count: selected.length, minimum, maximum});
        refinementRound++;
      }
    }
    if (selected.length < minimum || selected.length > maximum) fail('ALLOCATION_CAPACITY_VIOLATION', {node_id: id});
    const obligations = input.obligations.filter(o => selected.includes(o.id));
    const task = {id, obligation_ids: selected, test_ids: input.tests.filter(t => t.requirement_refs.some(ref => selected.includes(ref))).map(t => t.id),
      paths: unique(obligations.flatMap(o => o.write_scope)), profile: null, depends_on: [],
      allocation_method: reserve === 0 ? 'deterministic_remainder' : refinementRound ? 'jev_refined_batched_choices' : 'jev_batched_choices',
      allocation_bounds: {minimum, maximum, cap, refinement_rounds: refinementRound}};
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
    if (profiles.length === 1) {
      task.profile = structuredClone(profiles[0]);
      await record({event: 'allocation_deterministic_profile', node_id: task.id, profile_id: profiles[0].id, semantic_judgment: false});
    } else {
      const answer = await ask('profile', task.id, {task, allocated_tasks: tasks.map(t => ({id: t.id, obligation_ids: t.obligation_ids, depends_on: t.depends_on})), profiles},
        {profile: {type: 'choice', instructions: contract.questions.profile,
          criteria: Object.fromEntries(profiles.map(p => [p.id, `${p.model}; effort=${p.effort}; ${p.description}`]))}});
      task.profile = structuredClone(profiles.find(p => p.id === answer.profile));
    }
  }
  const assigned = tasks.flatMap(t => t.obligation_ids), linked = unique(tasks.flatMap(t => t.test_ids));
  if (assigned.length !== input.obligations.length || unique(assigned).length !== assigned.length || remaining.length
    || linked.length !== input.tests.length) fail('ALLOCATION_COVERAGE_MISMATCH');
  return {status: 'complete', count, tasks, decisions, policy, maximum_obligations_per_worker: cap, coverage: {obligations: assigned.length, exclusive: true,
    linked_test_specifications: linked.length, tests_executed: 0}, semantic_independence_verified: false};
}
