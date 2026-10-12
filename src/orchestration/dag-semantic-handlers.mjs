import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareDecision} from '../client.mjs';
import {validateDagPlan} from './dag-contracts.mjs';
import {analyzeDag} from './artifact-dag.mjs';

const url = new URL('../../docs/orchestration/contracts/dag-routing.v2.json', import.meta.url);
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, ...details}); };
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const text = x => typeof x === 'string' && x.trim().length > 0;
const unique = xs => [...new Set(xs)];
const sameSet = (a, b) => isDeepStrictEqual([...a].sort(), [...b].sort());
const hash = x => createHash('sha256').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex');
const uncertain = x => Boolean(x?.uncertain || x?.outcome_uncertain || x?.outcomeUncertain);
const clone = x => {
  let result;
  try { result = JSON.parse(JSON.stringify(x)); } catch { fail('DAG_SEMANTIC_NON_JSON'); }
  if (!isDeepStrictEqual(x, result)) fail('DAG_SEMANTIC_NON_JSON');
  return result;
};
const refs = x => Array.isArray(x) && x.length > 0 && x.every(text) && unique(x).length === x.length;
const indexed = items => new Map(items.map(item => [item.id, item]));
const planChecked = plan => { const checked = validateDagPlan(plan); analyzeDag(checked); return checked; };

function requireResolvedScope(state, ids, allowedReasons = []) {
  if (state.blockers.some(entry => entry.task_ids.some(id => ids.includes(id)) && !allowedReasons.includes(entry.reason))) fail('DAG_SCOPE_BLOCKED');
}
function resolveBlocks(state, ids, reasons) {
  state.blockers = state.blockers.filter(entry => !(entry.task_ids.every(id => ids.includes(id)) && reasons.includes(entry.reason)));
  for (const id of ids) if (state.task_status[id] === 'blocked' && !state.blockers.some(entry => entry.task_ids.includes(id))) state.task_status[id] = 'pending';
}

export function loadDagSemanticContract() {
  const raw = readFileSync(url, 'utf8'), contract = JSON.parse(raw);
  if (contract.schema_version !== 'dag-routing/v2' || contract.policy.automatic_retries !== 0
    || contract.policy.maximum_workers !== 30 || contract.policy.root_minimum_workers !== 2
    || Object.keys(contract.kinds).sort().join(',') !== 'failure,profile,relation,split') fail('DAG_SEMANTIC_CONTRACT_INVALID');
  for (const [kind, question] of Object.entries(contract.kinds)) {
    if (question.id !== `dag.${kind}.v2` || question.type !== 'choice' || !text(question.instructions)) fail('DAG_SEMANTIC_CONTRACT_INVALID');
  }
  return {...contract, source: {path: fileURLToPath(url), version: contract.version, sha256: hash(raw)}};
}

export function createDagSemanticState({plan, task_status = {}, completed_artifact_revisions = {}, completed_check_evidence = {}}) {
  plan = planChecked(plan);
  return checkState({schema_version: 'dag-semantic-state/v1', revision: 0, base_graph_revision: plan.graph_revision,
    plan, task_status: Object.fromEntries(plan.tasks.map(task => [task.id, task_status[task.id] ?? 'pending'])),
    completed_artifact_revisions, completed_check_evidence, leaf_task_ids: [], blockers: [], repair_queue: [], pending_decisions: [], lineage: [], history: []});
}

function checkState(input) {
  const state = clone(input), plan = planChecked(state.plan);
  if (state.schema_version !== 'dag-semantic-state/v1' || !Number.isSafeInteger(state.revision) || state.revision < 0
    || !text(state.base_graph_revision) || !object(state.task_status)
    || !sameSet(Object.keys(state.task_status), plan.tasks.map(task => task.id))
    || Object.values(state.task_status).some(status => !['pending', 'running', 'completed', 'failed', 'blocked', 'uncertain'].includes(status))
    || !object(state.completed_artifact_revisions) || !object(state.completed_check_evidence)
    || ['leaf_task_ids', 'blockers', 'repair_queue', 'pending_decisions', 'lineage', 'history'].some(key => !Array.isArray(state[key]))) fail('DAG_SEMANTIC_STATE_INVALID');
  for (const [artifactId, revision] of Object.entries(state.completed_artifact_revisions)) {
    const artifact = plan.artifacts.find(item => item.id === artifactId);
    if (!artifact || state.task_status[artifact.producer_task_id] !== 'completed' || !text(revision)) fail('DAG_COMPLETED_REVISION_INVALID');
  }
  for (const [checkId, evidence] of Object.entries(state.completed_check_evidence)) {
    const task = plan.tasks.find(item => item.check_ids.includes(checkId));
    if (!task || state.task_status[task.id] !== 'completed' || !object(evidence)) fail('DAG_COMPLETED_EVIDENCE_INVALID');
  }
  for (const task of plan.tasks.filter(item => state.task_status[item.id] === 'completed')) {
    if (task.output_artifact_ids.some(id => !Object.hasOwn(state.completed_artifact_revisions, id))
      || task.check_ids.some(id => !Object.hasOwn(state.completed_check_evidence, id))) fail('DAG_COMPLETED_EVIDENCE_MISSING');
  }
  return state;
}

function preserveProtected(before, afterPlan) {
  const tasks = indexed(afterPlan.tasks), workers = indexed(afterPlan.workers), checks = indexed(afterPlan.checks), artifacts = indexed(afterPlan.artifacts);
  for (const task of before.plan.tasks.filter(task => ['running', 'completed', 'uncertain'].includes(before.task_status[task.id]))) {
    if (!isDeepStrictEqual(task, tasks.get(task.id))
      || (task.worker_id && !isDeepStrictEqual(before.plan.workers.find(worker => worker.id === task.worker_id), workers.get(task.worker_id)))
      || task.check_ids.some(id => !isDeepStrictEqual(before.plan.checks.find(check => check.id === id), checks.get(id)))
      || task.output_artifact_ids.some(id => !isDeepStrictEqual(before.plan.artifacts.find(artifact => artifact.id === id), artifacts.get(id)))) {
      fail('DAG_PROTECTED_TASK_MUTATION', {task_id: task.id});
    }
  }
}

function targetIds(state, payload) {
  const ids = payload.target_task_ids;
  if (!refs(ids) || ids.some(id => !Object.hasOwn(state.task_status, id))) fail('DAG_SPLIT_TARGET_INVALID');
  if (!['root', 'leaf'].includes(payload.scope)) fail('DAG_SPLIT_SCOPE_INVALID');
  if (payload.scope === 'root' && state.plan.tasks.some(task => task.kind === 'implementation' && !ids.includes(task.id))) fail('DAG_ROOT_SCOPE_INCOMPLETE');
  if (payload.scope === 'leaf' && (ids.length !== 1 || state.plan.tasks.find(task => task.id === ids[0]).kind !== 'implementation')) fail('DAG_LEAF_SCOPE_INVALID');
  return ids;
}

function partitionPlan(state, candidate, payload) {
  const before = state.plan, ids = targetIds(state, payload);
  requireResolvedScope(state, ids, ['candidate_revision_required']);
  if (!text(candidate?.id) || !refs(candidate.evidence_refs)) fail('DAG_PARTITION_EVIDENCE_MISSING');
  const after = planChecked(candidate.plan);
  const oldTasks = before.tasks.filter(task => ids.includes(task.id)), outside = before.tasks.filter(task => !ids.includes(task.id));
  const newTasks = after.tasks.filter(task => !outside.some(old => old.id === task.id));
  const values = (tasks, key) => unique(tasks.flatMap(task => task[key]));
  if (after.goal_revision !== before.goal_revision || after.worker_limit !== before.worker_limit || after.max_concurrency !== before.max_concurrency
    || !sameSet(after.requirement_ids, before.requirement_ids)
    || !isDeepStrictEqual([...after.checks].sort((a, b) => a.id.localeCompare(b.id)), [...before.checks].sort((a, b) => a.id.localeCompare(b.id)))
    || !sameSet(after.artifacts.map(item => item.id), before.artifacts.map(item => item.id))
    || outside.some(task => !isDeepStrictEqual(task, after.tasks.find(item => item.id === task.id)))) fail('DAG_PARTITION_CONSERVATION');
  for (const key of ['requirement_ids', 'output_artifact_ids', 'check_ids', 'read_scope', 'write_scope']) {
    if (!sameSet(values(oldTasks, key), values(newTasks, key))) fail('DAG_PARTITION_CONSERVATION', {field: key});
  }
  const outputs = values(oldTasks, 'output_artifact_ids');
  if (!sameSet(values(oldTasks, 'input_artifact_ids').filter(id => !outputs.includes(id)), values(newTasks, 'input_artifact_ids').filter(id => !outputs.includes(id)))) fail('DAG_PARTITION_INPUT_CONSERVATION');
  for (const artifact of before.artifacts.filter(item => !outputs.includes(item.id))) {
    if (!isDeepStrictEqual(artifact, after.artifacts.find(item => item.id === artifact.id))) fail('DAG_PARTITION_ARTIFACT_OWNERSHIP');
  }
  if (before.unknown_relationships.some(relation => relation.task_ids.some(id => ids.includes(id)))) fail('DAG_SPLIT_UNRESOLVED_RELATION');
  if (before.unknown_relationships.some(relation => !after.unknown_relationships.some(next => isDeepStrictEqual(relation, next)))) fail('DAG_PARTITION_UNKNOWN_REMOVED');
  const allowed = indexed([...before.workers, ...(payload.available_workers ?? [])]);
  if (after.workers.some(worker => !isDeepStrictEqual(worker, allowed.get(worker.id)))) fail('DAG_PARTITION_WORKER_NOT_ALLOWED');
  const implementations = newTasks.filter(task => task.kind === 'implementation');
  const workerCount = unique(implementations.map(task => task.worker_id)).length;
  if (implementations.length < 2 || implementations.some(task => !task.requirement_ids.length && !task.output_artifact_ids.length)
    || (payload.scope === 'root' && (workerCount < 2 || workerCount > 30))) fail('DAG_PARTITION_NOT_PROGRESSIVE');
  preserveProtected(state, after);
  return {plan: after, removed: ids, added: newTasks.map(task => task.id), worker_count: workerCount};
}

function preparation(payload) {
  const p = payload.preparation;
  if (!object(p) || !text(p.method) || !refs(p.source_refs) || !Number.isFinite(p.wall_ms) || p.wall_ms < 0
    || !Object.hasOwn(p, 'usage') || !Object.hasOwn(p, 'cost')) fail('DAG_PARTITION_PREPARATION_MISSING');
  return clone(p);
}

function relationContext(state, payload) {
  const a = payload.task_a_id, b = payload.task_b_id;
  if (a === b || !Object.hasOwn(state.task_status, a) || !Object.hasOwn(state.task_status, b)) fail('DAG_RELATION_PAIR_INVALID');
  const evidence = payload.evidence ?? [];
  if (!Array.isArray(evidence) || evidence.some(item => !object(item) || !text(item.id) || !text(item.source_ref) || !text(item.text)
    || !Array.isArray(item.task_ids) || !sameSet(item.task_ids, [a, b]) || !Array.isArray(item.artifact_ids)
    || item.artifact_ids.some(id => !state.plan.artifacts.some(artifact => artifact.id === id)))) fail('DAG_RELATION_EVIDENCE_INVALID');
  return {a, b, evidence, pair: [a, b].sort()};
}

function directionArtifacts(state, payload, choice) {
  const {a, b, evidence} = relationContext(state, payload);
  const producer = choice === 'a_requires_b' ? b : a, consumer = choice === 'a_requires_b' ? a : b;
  const ids = payload.artifact_ids_by_direction?.[choice];
  if (!refs(ids) || ids.some(id => !state.plan.artifacts.some(artifact => artifact.id === id && artifact.producer_task_id === producer)
    || !evidence.some(item => item.artifact_ids.includes(id)))) fail('DAG_RELATION_ARTIFACT_EVIDENCE_MISSING');
  const producerTask = state.plan.tasks.find(task => task.id === producer), paths = [];
  for (const id of ids) {
    const binding = payload.artifact_bindings?.[id];
    if (!object(binding) || !refs(binding.paths) || binding.paths.some(path =>
      !producerTask.write_scope.some(scope => path === scope || path.startsWith(`${scope}/`)))) fail('DAG_RELATION_ARTIFACT_BINDING_MISSING');
    paths.push(...binding.paths);
  }
  // Reuse the plan path validator before offering the choice. The eventual
  // mutation adds only these explicit producer-owned paths, never a broad root.
  validateDagPlan({...state.plan, tasks: state.plan.tasks.map(task => task.id === consumer
    ? {...task, read_scope: unique([...task.read_scope, ...paths])} : task)});
  return {ids, producer, consumer, paths: unique(paths)};
}

function profiles(payload) {
  if (!Array.isArray(payload.profiles) || payload.profiles.some(profile => !object(profile) || !text(profile.id)
    || !text(profile.model) || !text(profile.effort) || typeof profile.available !== 'boolean'
    || typeof profile.tool_compatible !== 'boolean' || !refs(profile.evidence_refs))) fail('DAG_PROFILE_CATALOG_INVALID');
  if (unique(payload.profiles.map(profile => profile.id)).length !== payload.profiles.length) fail('DAG_PROFILE_CATALOG_INVALID');
  return payload.profiles.filter(profile => profile.available && profile.tool_compatible);
}

function optionsFor(state, kind, payload) {
  if (payload.expected_graph_revision !== state.plan.graph_revision) fail('DAG_STALE_GRAPH_REVISION');
  if (kind === 'split') {
    targetIds(state, payload); preparation(payload);
    if (!Array.isArray(payload.candidates) || unique(payload.candidates.map(item => item.id)).length !== payload.candidates.length) fail('DAG_PARTITION_CANDIDATES_INVALID');
    const choices = {};
    for (const candidate of payload.candidates) { partitionPlan(state, candidate, payload); choices[`candidate_${candidate.id}`] = 'Use this complete conserved executable partition.'; }
    if (payload.scope === 'leaf' && payload.allow_keep_scope === true) choices.keep_scope = 'Retain this executable leaf without changing root worker policy.';
    choices.need_candidate_revision = 'Block this scope and request a new conserved candidate.';
    return choices;
  }
  if (kind === 'relation') {
    const {a, b, evidence} = relationContext(state, payload), choices = {};
    for (const direction of ['a_requires_b', 'b_requires_a']) if (payload.artifact_ids_by_direction?.[direction]?.length) {
      directionArtifacts(state, payload, direction); choices[direction] = 'Bind the named producer artifacts in this direction.';
    }
    const existing = state.plan.tasks.some(task => [a, b].includes(task.id) && task.input_artifact_ids.some(id =>
      state.plan.artifacts.some(artifact => artifact.id === id && [a, b].includes(artifact.producer_task_id))));
    if (evidence.length && !existing) choices.no_artifact_dependency = 'Resolve this uncertain pair without an artifact edge; resource locks remain.';
    if (choices.a_requires_b && choices.b_requires_a) choices.both_require_each_other = 'Block this pair for a boundary revision, without adding a cycle.';
    choices.unknown = 'Keep this pair blocked pending dependency evidence.';
    return choices;
  }
  if (kind === 'profile') return Object.fromEntries([...profiles(payload).map(profile => [`profile_${profile.id}`, `${profile.model}; effort=${profile.effort}`]), ['need_profile_evidence', 'Block pending available profile evidence.']]);
  if (kind === 'failure') {
    if (!object(payload.failure) || !Array.isArray(payload.authorized_actions)
      || payload.authorized_actions.some(action => !['repair_local', 'repair_contract', 'revise_dependency', 'repair_verifier', 'need_evidence'].includes(action))) fail('DAG_FAILURE_ACTION_INVALID');
    if (uncertain(payload.failure) || payload.failure.outcome_uncertain !== false) return {need_evidence: 'Resolve the uncertain external outcome before any new attempt.'};
    return Object.fromEntries(unique([...payload.authorized_actions, 'need_evidence']).map(action => [action, 'Apply this explicitly authorized recovery action.']));
  }
  fail('DAG_SEMANTIC_KIND_UNKNOWN');
}

function block(state, taskIds, reason, evidenceRefs = []) {
  for (const id of taskIds) {
    if (!Object.hasOwn(state.task_status, id)) fail('DAG_SEMANTIC_TASK_UNKNOWN');
    if (['completed', 'running'].includes(state.task_status[id])) fail('DAG_PROTECTED_TASK_MUTATION', {task_id: id});
    if (state.task_status[id] !== 'uncertain') state.task_status[id] = 'blocked';
  }
  state.blockers.push({task_ids: [...taskIds], reason, evidence_refs: [...evidenceRefs]});
  return {type: 'blocked', reason, task_ids: [...taskIds], dispatch_allowed: false};
}

function applyPartition(state, candidate, payload) {
  const replacement = partitionPlan(state, candidate, payload);
  state.plan = replacement.plan;
  state.task_status = Object.fromEntries(state.plan.tasks.map(task => [task.id, state.task_status[task.id] ?? 'pending']));
  state.lineage.push({scope: payload.scope, source_task_ids: replacement.removed, task_ids: replacement.added, candidate_id: candidate.id});
  state.leaf_task_ids = state.leaf_task_ids.filter(id => !replacement.removed.includes(id));
  resolveBlocks(state, replacement.removed, ['candidate_revision_required']);
  return {type: 'partition_committed', candidate_id: candidate.id, removed_task_ids: replacement.removed,
    task_ids: replacement.added, worker_count: replacement.worker_count, preparation: preparation(payload), dispatch_allowed: true};
}

/** Pure transformation: trusted payload supplies plans, paths, catalogs and evidence.
 * The typed choice only selects among that payload; it cannot provide code to run.
 */
export function applyDagSemanticDecision({state: input, decision, payload: supplied}) {
  const before = checkState(input), state = clone(before), payload = clone(supplied), contract = loadDagSemanticContract();
  if (!object(decision) || decision.type !== 'choice' || !text(decision.choice) || !Object.hasOwn(contract.kinds, decision.kind)
    || Object.keys(decision).some(key => !['kind', 'type', 'choice'].includes(key))) fail('DAG_SEMANTIC_DECISION_INVALID');
  const {kind, choice} = decision, choices = optionsFor(before, kind, payload);
  if (!Object.hasOwn(choices, choice)) fail('DAG_SEMANTIC_CHOICE_NOT_OFFERED');
  let action;
  if (kind === 'split') {
    if (choice.startsWith('candidate_')) action = applyPartition(state, payload.candidates.find(item => `candidate_${item.id}` === choice), payload);
    else if (choice === 'keep_scope') {
      const id = payload.target_task_ids[0];
      requireResolvedScope(state, [id], ['candidate_revision_required']);
      if (['completed', 'running', 'uncertain'].includes(state.task_status[id])) fail('DAG_PROTECTED_TASK_MUTATION');
      state.leaf_task_ids = unique([...state.leaf_task_ids, id]);
      state.task_status[id] = 'pending';
      resolveBlocks(state, [id], ['candidate_revision_required']);
      action = {type: 'leaf_retained', task_id: id, dispatch_allowed: true};
    } else action = block(state, payload.target_task_ids, 'candidate_revision_required');
  } else if (kind === 'relation') {
    const {a, b, pair, evidence} = relationContext(state, payload);
    const matches = relation => sameSet(relation.task_ids, pair);
    if (['unknown', 'both_require_each_other'].includes(choice)) {
      const reason = choice === 'unknown' ? 'dependency_evidence_required' : 'boundary_revision_required';
      state.plan.unknown_relationships = [...state.plan.unknown_relationships.filter(relation => !matches(relation)), {task_ids: pair, reason, evidence_refs: evidence.map(item => item.id)}];
      action = {type: 'relation_blocked', reason, task_ids: pair, dispatch_allowed: false};
    } else {
      requireResolvedScope(state, pair, ['dependency_decision_required', 'dependency_evidence_required']);
      if (choice !== 'no_artifact_dependency') {
        const {ids, producer, consumer, paths} = directionArtifacts(state, payload, choice);
        const task = state.plan.tasks.find(task => task.id === consumer);
        task.input_artifact_ids = unique([...task.input_artifact_ids, ...ids]);
        const addedPaths = paths.filter(path => !task.read_scope.includes(path));
        task.read_scope = unique([...task.read_scope, ...paths]);
        action = {type: 'artifact_dependency_bound', producer_task_id: producer, consumer_task_id: consumer,
          artifact_ids: ids, read_scope_added: addedPaths, evidence_refs: evidence.map(item => item.id), dispatch_allowed: true};
      } else action = {type: 'relation_resolved_without_edge', task_ids: [a, b], evidence_refs: evidence.map(item => item.id), dispatch_allowed: true};
      state.plan.unknown_relationships = state.plan.unknown_relationships.filter(relation => !matches(relation));
      resolveBlocks(state, pair, ['dependency_decision_required', 'dependency_evidence_required']);
      state.pending_decisions = state.pending_decisions.filter(entry => entry.kind !== 'relation'
        || !sameSet([entry.payload.task_a_id, entry.payload.task_b_id], pair));
    }
  } else if (kind === 'profile') {
    const task = state.plan.tasks.find(task => task.id === payload.task_id && task.kind === 'implementation');
    if (!task) fail('DAG_PROFILE_TASK_INVALID');
    if (choice === 'need_profile_evidence') action = block(state, [task.id], 'profile_evidence_required');
    else {
      requireResolvedScope(state, [task.id], ['profile_evidence_required']);
      const profile = profiles(payload).find(item => `profile_${item.id}` === choice);
      const currentWorker = state.plan.workers.find(worker => worker.id === task.worker_id);
      if (payload.new_worker_id) {
        if (state.plan.workers.some(worker => worker.id === payload.new_worker_id)) fail('DAG_PROFILE_WORKER_EXISTS');
        state.plan.workers.push({id: payload.new_worker_id, profile_id: profile.id});
        task.worker_id = payload.new_worker_id;
      } else {
        if (currentWorker.profile_id !== profile.id && state.plan.tasks.some(other => other.id !== task.id && other.worker_id === task.worker_id)) fail('DAG_PROFILE_WORKER_SHARED');
        currentWorker.profile_id = profile.id;
      }
      state.task_status[task.id] = 'pending';
      resolveBlocks(state, [task.id], ['profile_evidence_required']);
      action = {type: 'profile_bound', task_id: task.id, worker_id: task.worker_id, profile: clone(profile), dispatch_allowed: true};
    }
  } else {
    const id = payload.task_id, failure = payload.failure;
    if (!Object.hasOwn(state.task_status, id)) fail('DAG_SEMANTIC_TASK_UNKNOWN');
    if (choice === 'need_evidence') {
      if (uncertain(failure) || failure.outcome_uncertain !== false) state.task_status[id] = 'uncertain';
      action = block(state, [id], 'failure_evidence_required', failure.evidence_refs ?? []);
    } else {
      if (state.task_status[id] !== 'failed' || !refs(failure.evidence_refs) || !text(failure.attempt_id)) fail('DAG_FAILURE_NOT_CONFIRMED');
      requireResolvedScope(state, [id]);
      if (choice === 'repair_contract') action = applyPartition(state, payload.candidates?.find(item => item.id === payload.candidate_id), payload);
      else if (choice === 'revise_dependency') {
        relationContext(state, payload.relation);
        const queuedPayload = clone(payload.relation);
        queuedPayload.expected_graph_revision = `${state.base_graph_revision}.semantic-${state.revision + 1}`;
        state.pending_decisions.push({kind: 'relation', payload: queuedPayload, reason: 'confirmed_failure'});
        action = block(state, [id], 'dependency_decision_required', failure.evidence_refs);
        action.type = 'dependency_decision_queued';
      } else {
        if (!text(payload.next_attempt_id) || payload.next_attempt_id === failure.attempt_id
          || state.repair_queue.some(item => item.next_attempt_id === payload.next_attempt_id)) fail('DAG_REPAIR_ATTEMPT_INVALID');
        if (choice === 'repair_verifier') {
          const replacement = payload.verifier_replacement;
          if (failure.category !== 'verifier' || !object(replacement)
            || !Array.isArray(payload.allowed_verifier_replacements)
            || !payload.allowed_verifier_replacements.some(item => isDeepStrictEqual(item, replacement))) fail('DAG_VERIFIER_REPLACEMENT_NOT_ALLOWED');
          const task = state.plan.tasks.find(task => task.id === id), old = state.plan.checks.find(check => check.id === replacement.id);
          if (!old || !task.check_ids.includes(old.id) || old.version === replacement.version
            || !sameSet(old.requirement_ids, replacement.requirement_ids) || !sameSet(old.artifact_ids, replacement.artifact_ids)
            || old.phase !== replacement.phase) fail('DAG_VERIFIER_COVERAGE_CHANGED');
          state.plan.checks = state.plan.checks.map(check => check.id === old.id ? clone(replacement) : check);
        } else if (failure.category !== 'product') fail('DAG_LOCAL_REPAIR_CATEGORY_INVALID');
        const queued = {task_id: id, previous_attempt_id: failure.attempt_id, next_attempt_id: payload.next_attempt_id, action: choice, status: 'authorized'};
        state.repair_queue.push(queued);
        state.task_status[id] = 'pending';
        action = {...queued, type: choice === 'repair_verifier' ? 'rerun_checks_authorized' : 'fresh_repair_authorized', dispatch_allowed: true};
      }
    }
  }
  state.plan = planChecked(state.plan);
  preserveProtected(before, state.plan);
  for (const [id, status] of Object.entries(before.task_status)) {
    if (['completed', 'running', 'uncertain'].includes(status) && state.task_status[id] !== status) fail('DAG_PROTECTED_TASK_MUTATION', {task_id: id});
  }
  state.revision++;
  state.plan.graph_revision = `${state.base_graph_revision}.semantic-${state.revision}`;
  state.history.push({decision: clone(decision), previous_graph_revision: before.plan.graph_revision,
    graph_revision: state.plan.graph_revision, payload_sha256: hash(payload), action: clone(action), contract_source: contract.source});
  return {status: action.dispatch_allowed ? 'applied' : 'blocked', state: checkState(state), action, selection_method: 'supplied_typed_choice'};
}

/** Serialized controller. A successful commit precedes returning any action.
 * An uncertain commit poisons further writes; no callback/provider is replayed.
 */
export function createDagSemanticController({state, commit, record = async () => {}}) {
  let current = checkState(state), busy = false, commitUncertain = false;
  if ((commit !== undefined && typeof commit !== 'function') || typeof record !== 'function') fail('DAG_SEMANTIC_CALLBACK_INVALID');
  const execute = async operation => {
    if (busy) fail('DAG_SEMANTIC_CONTROLLER_BUSY');
    if (commitUncertain) fail('DAG_SEMANTIC_COMMIT_UNCERTAIN', {outcome_uncertain: true});
    busy = true;
    try { return await operation(); } finally { busy = false; }
  };
  const persist = async result => {
    const context = {previous_revision: current.plan.graph_revision, graph_revision: result.state.plan.graph_revision};
    if (commit) {
      try { if (await commit(clone(result.state), clone(context)) === false) fail('DAG_SEMANTIC_COMMIT_REJECTED', {outcome_uncertain: false}); }
      catch (error) {
        commitUncertain = uncertain(error) || !['outcome_uncertain', 'outcomeUncertain', 'uncertain'].some(key => error?.[key] === false);
        fail('DAG_SEMANTIC_COMMIT_FAILED', {cause_code: error?.code ?? null, outcome_uncertain: commitUncertain, previous_revision: context.previous_revision});
      }
    }
    current = clone(result.state);
    await record({event: 'dag_semantic_committed', ...context, action: clone(result.action), selection_method: result.selection_method, durable_commit_callback: Boolean(commit)});
    return {...result, durable_commit_callback: Boolean(commit)};
  };
  return {
    snapshot: () => clone(current),
    apply: ({decision, payload}) => execute(async () => persist(applyDagSemanticDecision({state: current, decision, payload}))),
    decide: ({kind, payload: supplied, decide}) => execute(async () => {
      const payload = clone(supplied), contract = loadDagSemanticContract(), question = contract.kinds[kind];
      if (!question) fail('DAG_SEMANTIC_KIND_UNKNOWN');
      const criteria = optionsFor(current, kind, payload), keys = Object.keys(criteria);
      let choice, response = null, request = null;
      if (keys.length === 1) choice = keys[0];
      else {
        if (typeof decide !== 'function') fail('DAG_SEMANTIC_DECIDER_REQUIRED');
        request = prepareDecision({model: 'jev-latest', state: {plan: current.plan, task_status: current.task_status, payload, contract_source: contract.source},
          questions: {[question.id]: {type: 'choice', instructions: question.instructions, criteria}}}).body;
        await record({event: 'dag_semantic_requested', request: clone(request)});
        try { response = clone(await decide(clone(request))); }
        catch (error) { fail('DAG_SEMANTIC_DECISION_FAILED', {outcome_uncertain: uncertain(error) || !['outcome_uncertain', 'outcomeUncertain', 'uncertain'].some(key => error?.[key] === false), request, automatic_retries: 0}); }
        await record({event: 'dag_semantic_responded', response: clone(response)});
        const answer = response?.answers?.[question.id];
        if (uncertain(response) || response?.ok === false || response?.error != null
          || (response?.status !== undefined && !['completed', 'success', 'succeeded'].includes(response.status))
          || !object(response?.answers) || Object.keys(response.answers).length !== 1 || !object(answer) || answer.type !== 'choice'
          || typeof answer.choice !== 'string' || !Object.hasOwn(criteria, answer.choice)
          || Object.keys(answer).some(key => !['type', 'choice', 'confidence', 'probabilities'].includes(key))) {
          fail('DAG_SEMANTIC_RESPONSE_INVALID', {response, request, outcome_uncertain: uncertain(response), automatic_retries: 0});
        }
        choice = answer.choice;
      }
      const result = applyDagSemanticDecision({state: current, decision: {kind, type: 'choice', choice}, payload});
      result.selection_method = keys.length === 1 ? 'local_singleton' : 'typed_choice';
      result.request = request; result.response = response;
      return persist(result);
    }),
  };
}
