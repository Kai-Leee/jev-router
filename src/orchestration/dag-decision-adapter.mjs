import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {prepareDecision} from '../client.mjs';

const contractUrl = new URL('../../docs/orchestration/contracts/dag-routing.v1.json', import.meta.url);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, ...details}); };
const hash = value => createHash('sha256').update(value).digest('hex');
const safeCode = error => /^[A-Z0-9_]{1,80}$/.test(error?.code ?? '') ? error.code : 'UNKNOWN_CALLBACK_ERROR';
const uncertain = value => Boolean(value?.outcome_uncertain || value?.outcomeUncertain || value?.uncertain);
const callUncertain = error => uncertain(error)
  || !['outcome_uncertain', 'outcomeUncertain', 'uncertain'].some(key => error?.[key] === false);
const unique = values => new Set(values).size === values.length;

// Reject values JSON would silently discard/change. Requests and callback state
// are independent snapshots; neither callbacks nor the adapter mutate inputs.
function cloneJson(value, code = 'INVALID_DAG_DECISION_INPUT') {
  let copy;
  try { copy = JSON.parse(JSON.stringify(value)); }
  catch { fail(code); }
  if (!isDeepStrictEqual(value, copy)) fail(code);
  return copy;
}

const registeredHandlers = new Set([
  'validateAndExpandNode', 'markLeafCandidate', 'requestCandidateRevision',
  'proposeArtifactEdge', 'recordRelationNoEdge', 'requestBoundaryRevision',
  'requestDependencyEvidence', 'reserveAndAssign', 'bindProfile',
  'requestProfileEvidence', 'repairLocal', 'repairContract', 'reviseDependency',
  'repairVerifier', 'requestFailureEvidence',
]);

/** Separate opt-in contract; it does not replace historical document loaders. */
export function loadDagRoutingContract() {
  const raw = readFileSync(contractUrl, 'utf8');
  let contract;
  try { contract = JSON.parse(raw); } catch { fail('INVALID_DAG_ROUTING_CONTRACT'); }
  if (contract?.schema_version !== 'dag-routing/v1' || !text(contract.version)
    || !object(contract.kinds) || Object.keys(contract.kinds).sort().join(',') !== 'failure,owner,profile,relation,split'
    || contract.policy?.maximum_owners !== 30 || contract.policy?.automatic_retries !== 0
    || !Number.isSafeInteger(contract.policy.default_max_search_nodes_per_candidate)
    || contract.policy.default_max_search_nodes_per_candidate < 1) fail('INVALID_DAG_ROUTING_CONTRACT');
  for (const [kind, question] of Object.entries(contract.kinds)) {
    if (question.id !== `dag.${kind}.v1` || question.type !== 'choice' || !text(question.instructions)
      || !object(question.fixed_handlers)
      || Object.values(question.fixed_handlers).some(handler => !registeredHandlers.has(handler))) fail('INVALID_DAG_ROUTING_CONTRACT');
    if (question.dynamic_handler && (!text(question.dynamic_handler.prefix)
      || !registeredHandlers.has(question.dynamic_handler.id))) fail('INVALID_DAG_ROUTING_CONTRACT');
  }
  return {...contract, source: {path: fileURLToPath(contractUrl), version: contract.version, sha256: hash(raw)}};
}

function handlerFor(question, choice) {
  if (Object.hasOwn(question.fixed_handlers, choice)) return {id: question.fixed_handlers[choice]};
  const dynamic = question.dynamic_handler;
  if (dynamic && choice.startsWith(dynamic.prefix) && id(choice.slice(dynamic.prefix.length))) {
    return {id: dynamic.id, candidate_id: choice.slice(dynamic.prefix.length)};
  }
  fail('UNREGISTERED_DAG_CHOICE', {question_id: question.id, choice});
}

function validateAnswer(response, question, criteria) {
  if (uncertain(response)) fail('DAG_DECISION_UNCERTAIN', {outcome_uncertain: true});
  if (response?.ok === false || response?.error != null
    || (response?.status !== undefined && !['completed', 'succeeded', 'success'].includes(response.status))) {
    fail('DAG_DECISION_FAILED', {outcome_uncertain: false});
  }
  const answers = response?.answers, answer = answers?.[question.id];
  if (!object(answers) || Object.keys(answers).length !== 1 || !Object.hasOwn(answers, question.id)
    || !object(answer) || answer.type !== 'choice' || typeof answer.choice !== 'string'
    || !Object.hasOwn(criteria, answer.choice)
    || Object.keys(answer).some(key => !['type', 'choice', 'probabilities', 'confidence'].includes(key))) fail('INVALID_DAG_DECISION_ANSWER');
  if (answer.confidence != null && (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1)) fail('INVALID_DAG_DECISION_ANSWER');
  if (answer.probabilities !== undefined && (!object(answer.probabilities)
    || Object.keys(answer.probabilities).length !== Object.keys(criteria).length
    || Object.keys(criteria).some(key => !Object.hasOwn(answer.probabilities, key)
      || !Number.isFinite(answer.probabilities[key]) || answer.probabilities[key] < 0 || answer.probabilities[key] > 1))) fail('INVALID_DAG_DECISION_ANSWER');
  return answer.choice;
}

async function choose({kind, state, criteria, decide, record}, contract) {
  const entry = Object.entries(contract.kinds).find(([key, question]) => key === kind || question.id === kind);
  if (!entry) fail('UNKNOWN_DAG_DECISION_KIND');
  const [name, question] = entry;
  if (!object(state) || !object(criteria) || typeof record !== 'function'
    || (decide !== undefined && typeof decide !== 'function')) fail('INVALID_DAG_DECISION_INPUT');
  state = cloneJson(state);
  criteria = cloneJson(criteria);
  const keys = Object.keys(criteria);
  if (keys.length > 255 || keys.some(key => !text(key) || !(criteria[key] === null || text(criteria[key])))) fail('INVALID_DAG_DECISION_CRITERIA');
  for (const key of keys) handlerFor(question, key);
  // The historical root count1 exclusion cannot be restored via keep_scope.
  if (name === 'split' && Object.hasOwn(criteria, 'keep_scope')
    && (state.split_policy?.scope !== 'leaf' || state.split_policy?.allow_keep_scope !== true)) fail('DAG_KEEP_SCOPE_POLICY_REQUIRED');
  const base = {kind: name, question_id: question.id, contract_source: contract.source};
  const emit = async event => record(cloneJson({...base, ...event}));
  if (!keys.length) {
    const result = {...base, status: 'blocked', reason: 'no_candidates', choice: null,
      handler: null, selection_method: null, request: null, response: null};
    await emit({event: 'dag_decision_blocked', reason: result.reason});
    return result;
  }
  let choice, request = null, response = null;
  const selectionMethod = keys.length === 1 ? 'local_singleton' : 'typed_choice';
  if (keys.length === 1) {
    choice = keys[0];
    await emit({event: 'dag_decision_local', choice, semantic_judgment: false});
  } else {
    if (typeof decide !== 'function') fail('DAG_DECIDER_REQUIRED');
    // Validate the real wire shape and byte bound before invoking any callback.
    request = prepareDecision({model: 'jev-latest', state: {input: state,
      decision_kind: name, contract_source: contract.source},
    questions: {[question.id]: {type: question.type, instructions: question.instructions, criteria}}}).body;
    await emit({event: 'dag_decision_requested', request});
    let responseReceived = false;
    try {
      const returned = await decide(structuredClone(request));
      responseReceived = true;
      response = cloneJson(returned, 'INVALID_DAG_DECISION_ANSWER');
    }
    catch (error) {
      const details = {cause_code: safeCode(error), outcome_uncertain: callUncertain(error),
        response_received: responseReceived, automatic_retries: 0};
      await emit({event: 'dag_decision_failed', ...details});
      fail(error?.code === 'INVALID_DAG_DECISION_ANSWER' ? error.code : 'DAG_DECISION_CALL_FAILED', {...details, request});
    }
    await emit({event: 'dag_decision_responded', response});
    try { choice = validateAnswer(response, question, criteria); }
    catch (error) {
      error.outcome_uncertain ??= error.code === 'INVALID_DAG_DECISION_ANSWER';
      await emit({event: 'dag_decision_rejected', code: error.code, outcome_uncertain: uncertain(error), response_received: true, response});
      Object.assign(error, {request, response, response_received: true, automatic_retries: 0});
      throw error;
    }
  }
  // These registered handlers describe proposed semantic actions. Model text
  // cannot name a function to run, dispatch a worker, alter a DAG, or pass a check.
  const handler = {...handlerFor(question, choice), status: 'proposed', executable: false};
  const result = {...base, status: 'proposed', reason: null, choice, handler,
    selection_method: selectionMethod, request, response};
  await emit({event: 'dag_decision_proposed', choice, handler, selection_method: selectionMethod});
  return result;
}

export async function makeDagDecision({kind, state, criteria, decide, record = async () => {}}) {
  return choose({kind, state, criteria, decide, record}, loadDagRoutingContract());
}

function validateAllocation(bundles, owners, maxSearchNodes, contract) {
  bundles = cloneJson(bundles, 'INVALID_DAG_BUNDLES');
  owners = cloneJson(owners, 'INVALID_DAG_OWNERS');
  if (!Array.isArray(owners) || owners.length > contract.policy.maximum_owners
    || owners.some(owner => !object(owner) || !id(owner.id) || !Number.isSafeInteger(owner.capacity)
      || owner.capacity < 0 || !Number.isSafeInteger(owner.minimum) || owner.minimum < 0 || owner.minimum > owner.capacity)
    || !unique(owners.map(owner => owner.id))) fail('INVALID_DAG_OWNERS');
  const ownerIds = new Set(owners.map(owner => owner.id));
  if (!Array.isArray(bundles) || bundles.some(bundle => !object(bundle) || !id(bundle.id)
    || !Array.isArray(bundle.obligation_ids) || !bundle.obligation_ids.length || !bundle.obligation_ids.every(id)
    || !unique(bundle.obligation_ids) || !Array.isArray(bundle.eligible_owner_ids)
    || !unique(bundle.eligible_owner_ids) || bundle.eligible_owner_ids.some(ownerId => !ownerIds.has(ownerId))
    || !Array.isArray(bundle.evidence_refs) || !bundle.evidence_refs.every(text))
    || !unique(bundles.map(bundle => bundle.id)) || !unique(bundles.flatMap(bundle => bundle.obligation_ids))) fail('INVALID_DAG_BUNDLES');
  if (!Number.isSafeInteger(maxSearchNodes) || maxSearchNodes < 1) fail('INVALID_DAG_SEARCH_LIMIT');
  return {bundles, owners};
}

/** Exact bounded DFS. Only a complete assignment is a feasibility witness.
 * Iterative search avoids imposing an accidental task limit via call-stack depth.
 * Equivalent states/owners are pruned only when all future eligibility matches.
 */
function residualPacking(bundles, owners, loads, maxSearchNodes) {
  const ordered = bundles.map((bundle, index) => ({...bundle, size: bundle.obligation_ids.length, index,
    eligible: new Set(bundle.eligible_owner_ids)})).sort((a, b) =>
    a.eligible.size - b.eligible.size || b.size - a.size || a.index - b.index);
  const eligibility = owners.map(owner => ordered.map(bundle => bundle.eligible.has(owner.id) ? '1' : '0').join(''));
  const stack = [{index: 0, loads: [...loads], parent: null}], seen = new Set();
  let nodes = 0;
  while (stack.length) {
    if (nodes >= maxSearchNodes) return {status: 'feasibility_unknown', nodes_visited: nodes, max_search_nodes: maxSearchNodes, witness: null};
    const node = stack.pop();
    nodes++;
    const key = `${node.index}:${node.loads.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const remaining = ordered.slice(node.index);
    const size = remaining.reduce((sum, bundle) => sum + bundle.size, 0);
    if (node.loads.some((load, i) => load > owners[i].capacity)
      || size > owners.reduce((sum, owner, i) => sum + owner.capacity - node.loads[i], 0)
      || size < owners.reduce((sum, owner, i) => sum + Math.max(0, owner.minimum - node.loads[i]), 0)
      || owners.some((owner, i) => owner.minimum - node.loads[i] > remaining.reduce((sum, bundle) =>
        sum + (bundle.eligible.has(owner.id) && bundle.size <= owner.capacity - node.loads[i] ? bundle.size : 0), 0))
      || remaining.some(bundle => !owners.some((owner, i) => bundle.eligible.has(owner.id)
        && node.loads[i] + bundle.size <= owner.capacity))) continue;
    if (!remaining.length) {
      const assignments = [];
      for (let cursor = node; cursor.parent; cursor = cursor.parent) assignments.push({bundle_id: ordered[cursor.index - 1].id, owner_id: cursor.owner_id});
      const byId = new Map(assignments.map(assignment => [assignment.bundle_id, assignment]));
      return {status: 'feasible', nodes_visited: nodes, max_search_nodes: maxSearchNodes,
        witness: {assignments: bundles.map(bundle => byId.get(bundle.id)),
          final_loads: owners.map((owner, i) => ({owner_id: owner.id, load: node.loads[i]}))}};
    }
    const bundle = ordered[node.index], equivalent = new Set(), children = [];
    for (const [i, owner] of owners.entries()) {
      if (!bundle.eligible.has(owner.id) || node.loads[i] + bundle.size > owner.capacity) continue;
      const signature = `${owner.capacity}:${owner.minimum}:${node.loads[i]}:${eligibility[i].slice(node.index)}`;
      if (equivalent.has(signature)) continue;
      equivalent.add(signature);
      const nextLoads = [...node.loads];
      nextLoads[i] += bundle.size;
      children.push({index: node.index + 1, loads: nextLoads, parent: node, owner_id: owner.id});
    }
    // LIFO retains stable input owner order without a hidden load-balancing policy.
    stack.push(...children.reverse());
  }
  return {status: 'infeasible', nodes_visited: nodes, max_search_nodes: maxSearchNodes, witness: null};
}

function verifyWitness({bundles, owners, loads, witness}) {
  if (!witness || witness.assignments.length !== bundles.length || !unique(witness.assignments.map(item => item.bundle_id))) fail('INVALID_DAG_PACKING_WITNESS');
  const finalLoads = [...loads], byId = new Map(bundles.map(bundle => [bundle.id, bundle]));
  for (const assignment of witness.assignments) {
    const bundle = byId.get(assignment.bundle_id), ownerIndex = owners.findIndex(owner => owner.id === assignment.owner_id);
    if (!bundle || ownerIndex < 0 || !bundle.eligible_owner_ids.includes(assignment.owner_id)) fail('INVALID_DAG_PACKING_WITNESS');
    finalLoads[ownerIndex] += bundle.obligation_ids.length;
  }
  if (owners.some((owner, i) => finalLoads[i] < owner.minimum || finalLoads[i] > owner.capacity)
    || !isDeepStrictEqual(witness.final_loads, owners.map((owner, i) => ({owner_id: owner.id, load: finalLoads[i]})))) fail('INVALID_DAG_PACKING_WITNESS');
}

/** Local in-memory allocation only. No provider/client is created here.
 * A reservation is committed only after its exact offered choice is validated.
 * Partial state is retained on blocked/failed outcomes; no trimming or replay.
 */
export async function allocateDagOwners({bundles, owners, decide, record = async () => {}, maxSearchNodes}) {
  const contract = loadDagRoutingContract();
  maxSearchNodes ??= contract.policy.default_max_search_nodes_per_candidate;
  ({bundles, owners} = validateAllocation(bundles, owners, maxSearchNodes, contract));
  if (typeof record !== 'function' || (decide !== undefined && typeof decide !== 'function')) fail('INVALID_DAG_ALLOCATION_CALLBACK');
  const loads = owners.map(() => 0), assignments = [], decisions = [];
  const emit = async event => record(cloneJson(event));
  const ownerSnapshot = () => owners.map((owner, i) => ({...owner, load: loads[i], remaining_capacity: owner.capacity - loads[i]}));
  const snapshot = () => ({assignments: structuredClone(assignments), owners: ownerSnapshot(),
  remaining_bundle_ids: bundles.slice(assignments.length).map(bundle => bundle.id), decisions: structuredClone(decisions)});
  const blocked = async (reason, feasibility) => {
    const result = {status: 'blocked', reason, ...snapshot(), feasibility};
    await emit({event: 'dag_allocation_blocked', reason, remaining_bundle_ids: result.remaining_bundle_ids, feasibility});
    return result;
  };
  for (const [index, bundle] of bundles.entries()) {
    const remaining = bundles.slice(index + 1), evaluations = [];
    for (const [ownerIndex, owner] of owners.entries()) {
      if (!bundle.eligible_owner_ids.includes(owner.id)) {
        evaluations.push({owner_id: owner.id, status: 'ineligible', nodes_visited: 0, witness: null});
        continue;
      }
      if (loads[ownerIndex] + bundle.obligation_ids.length > owner.capacity) {
        evaluations.push({owner_id: owner.id, status: 'capacity_exceeded', nodes_visited: 0, witness: null});
        continue;
      }
      const candidateLoads = [...loads];
      candidateLoads[ownerIndex] += bundle.obligation_ids.length;
      const evaluation = residualPacking(remaining, owners, candidateLoads, maxSearchNodes);
      if (evaluation.status === 'feasible') verifyWitness({bundles: remaining, owners, loads: candidateLoads, witness: evaluation.witness});
      evaluations.push({owner_id: owner.id, ...evaluation});
    }
    const feasible = evaluations.filter(evaluation => evaluation.status === 'feasible');
    const unknown = evaluations.filter(evaluation => evaluation.status === 'feasibility_unknown');
    const feasibility = {bundle_id: bundle.id, candidates: evaluations, feasible_owner_ids: feasible.map(item => item.owner_id),
      excluded_unknown_count: unknown.length, search_limit_per_candidate: maxSearchNodes};
    await emit({event: 'dag_owner_candidates', ...feasibility});
    if (!feasible.length) return blocked(unknown.length ? 'feasibility_unknown' : 'no_feasible_owner', feasibility);
    const criteria = Object.fromEntries(feasible.map(item => [`owner_${item.owner_id}`,
      `Assign this entire bundle to ${item.owner_id}; capacity, minimum final load, eligibility and exact residual packing are verified.`]));
    const state = {bundles, current_bundle_id: bundle.id, remaining_bundle_ids: remaining.map(item => item.id),
      owners: ownerSnapshot(), assignments: assignments.map(({bundle_id, owner_id}) => ({bundle_id, owner_id})),
      reservation_revision: index, revise_boundary_available: false,
      candidate_feasibility: evaluations.map(({witness, ...evaluation}) => ({...evaluation,
        witness_sha256: witness ? hash(JSON.stringify(witness)) : null})),
      witness_scope: 'Exact residual assignments are retained in local candidate evidence. No model semantic dependency claim is inferred from packing.'};
    let decision;
    try { decision = await choose({kind: 'owner', state, criteria, decide, record}, contract); }
    catch (error) { Object.assign(error, {partial_allocation: snapshot(), feasibility}); throw error; }
    const selected = feasible.find(item => `owner_${item.owner_id}` === decision.choice);
    if (!selected) fail('INVALID_DAG_OWNER_SELECTION', {partial_allocation: snapshot()});
    const ownerIndex = owners.findIndex(owner => owner.id === selected.owner_id);
    loads[ownerIndex] += bundle.obligation_ids.length;
    const assignment = {bundle_id: bundle.id, owner_id: selected.owner_id, obligation_ids: [...bundle.obligation_ids],
      reservation_revision: index + 1, selection_method: decision.selection_method};
    assignments.push(assignment);
    decisions.push({...decision, bundle_id: bundle.id, feasibility});
    await emit({event: 'dag_owner_reserved', ...assignment, owner_load: loads[ownerIndex],
      handler: {id: 'reserveAndAssign', status: 'reserved', scope: 'local_memory', worker_dispatched: false}});
  }
  if (owners.some((owner, i) => loads[i] < owner.minimum)) return blocked('minimum_load_unsatisfied', {status: 'infeasible', witness: null});
  const witness = {assignments: assignments.map(({bundle_id, owner_id}) => ({bundle_id, owner_id})),
    final_loads: owners.map((owner, i) => ({owner_id: owner.id, load: loads[i]}))};
  verifyWitness({bundles, owners, loads: owners.map(() => 0), witness});
  const result = {status: 'completed', reason: null, ...snapshot(), feasibility: {status: 'feasible', witness},
    coverage: {bundle_count: bundles.length, obligation_count: bundles.reduce((sum, bundle) => sum + bundle.obligation_ids.length, 0), exclusive: true}};
  await emit({event: 'dag_allocation_completed', coverage: result.coverage, worker_dispatched: false});
  return result;
}
