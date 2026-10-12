import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {prepareDecision} from '../client.mjs';
import {validateDagPlan} from './dag-contracts.mjs';
import {analyzeDag} from './artifact-dag.mjs';
import {adaptiveOutcomeUncertain, adaptiveTerminalCause} from './adaptive-failure.mjs';
import {createAdaptiveDecompositionBalancer, projectBalancedRelationState} from './adaptive-decomposition-balancing.mjs';
import {validateCausalRepairCandidate} from './adaptive-causal-repair.mjs';
import {validateInferredRepairCandidate} from './adaptive-inferred-repair.mjs';
import {verifyRepairInputOverride} from './adaptive-repair-input.mjs';

const CONTRACT_URL = new URL('../../docs/orchestration/contracts/adaptive-dag.v1.json', import.meta.url);
// Keep the additive catalog within artifact-transport's retained path grammar.
const CATALOG_PATH_PATTERN = '^(?!.*(?:^|/)(?:\\.\\.?|\\.git|\\.env|\\.claude|\\.codex|\\.agents|\\.benchmarks)(?:/|$))[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*(?![\\s\\S])';
const catalogPath = new RegExp(CATALOG_PATH_PATTERN);
const hash = value => createHash('sha256').update(value).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
const unique = values => [...new Set(values)];
const sameSet = (a, b) => a.length === b.length && unique(a).length === a.length && a.every(value => b.includes(value));
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, ...details}); };
const unknownDuration = () => ({basis: 'unknown', estimate_ms: null, sample_count: 0, source_refs: []});
const uncertain = value => value?.outcome_uncertain === true || value?.outcomeUncertain === true
  || ['unknown', 'uncertain', 'interrupted', 'timeout'].includes(value?.status);

function clone(value, code = 'ADAPTIVE_INVALID_JSON') {
  let result;
  try { result = JSON.parse(JSON.stringify(value)); } catch { fail(code); }
  if (!isDeepStrictEqual(result, value)) fail(code);
  return result;
}
function fields(value, names, code = 'ADAPTIVE_CATALOG_FIELDS') {
  if (!object(value) || !sameSet(Object.keys(value), names)) fail(code);
}
function ids(values, minimum = 0) {
  return Array.isArray(values) && values.length >= minimum && values.every(id) && unique(values).length === values.length;
}
function checkedLimits(input) {
  const limits = clone(input);
  const minima = {max_units: 2, max_artifacts: 2, max_files: 2, max_leaves: 2, max_depth: 1,
    max_nodes: 3, max_relation_pairs: 1, max_decisions: 1, relation_batch_size: 1, max_request_bytes: 1};
  if (!object(limits) || Object.entries(minima).some(([key, min]) => !Number.isSafeInteger(limits[key]) || limits[key] < min)
    || limits.max_units > 30 || limits.max_leaves > 30 || limits.relation_batch_size > 64
    || limits.max_request_bytes > 256000) fail('ADAPTIVE_LIMITS_INVALID');
  return limits;
}
function publicRequirements(requirement_ids, requirement_descriptions = []) {
  if (!ids(requirement_ids, 1) || !Array.isArray(requirement_descriptions)) fail('ADAPTIVE_REQUIREMENTS_INVALID');
  const descriptions = clone(requirement_descriptions);
  if (descriptions.length) {
    if (!sameSet(descriptions.map(entry => entry.id), requirement_ids)) fail('ADAPTIVE_REQUIREMENTS_INVALID');
    for (const entry of descriptions) {
      fields(entry, ['id', 'text', 'source_refs'], 'ADAPTIVE_REQUIREMENTS_INVALID');
      if (!text(entry.text) || !Array.isArray(entry.source_refs) || !entry.source_refs.length
        || entry.source_refs.some(ref => !text(ref))) fail('ADAPTIVE_REQUIREMENTS_INVALID');
    }
  }
  return descriptions;
}
function safePath(path) {
  return typeof path === 'string' && path.length <= 1024 && catalogPath.test(path);
}
function records(values, code) {
  if (!Array.isArray(values) || !values.length || values.some(value => !object(value) || !id(value.id))
    || unique(values.map(value => value.id)).length !== values.length) fail(code);
  return new Map(values.map(value => [value.id, value]));
}

export function loadAdaptiveDagContract() {
  const raw = readFileSync(CONTRACT_URL, 'utf8'), contract = JSON.parse(raw);
  if (contract.schema_version !== 'adaptive-dag/v1' || contract.policy.maximum_workers !== 30
    || contract.policy.automatic_retries !== 0 || !contract.policy.relation_batch_atomic
    || !sameSet(Object.keys(contract.questions), ['split_count', 'membership', 'relation', 'repair'])) fail('ADAPTIVE_CONTRACT_INVALID');
  for (const [kind, question] of Object.entries(contract.questions)) {
    if (question.id !== `adaptive.${kind}.v1` || question.type !== 'choice' || !text(question.instructions)) fail('ADAPTIVE_CONTRACT_INVALID');
  }
  return {...contract, source: {path: fileURLToPath(CONTRACT_URL), sha256: hash(raw), version: contract.version}};
}

/** Validate provenance and ownership, not the semantic adequacy of a generated catalog. */
export function validateAdaptiveCatalog({catalog, source, requirement_ids, limits}) {
  limits = checkedLimits(limits); catalog = clone(catalog);
  if (!text(source) || !ids(requirement_ids, 1)) fail('ADAPTIVE_SOURCE_INVALID');
  fields(catalog, ['schema_version', 'source_sha256', 'evidence', 'units', 'artifacts']);
  if (catalog.schema_version !== 'adaptive-catalog/v1' || catalog.source_sha256 !== hash(source)) fail('ADAPTIVE_SOURCE_HASH');
  const evidence = records(catalog.evidence, 'ADAPTIVE_EVIDENCE_INVALID');
  for (const entry of evidence.values()) {
    fields(entry, ['id', 'quote']);
    if (!text(entry.quote) || !source.includes(entry.quote)) fail('ADAPTIVE_EVIDENCE_NOT_IN_SOURCE');
  }
  const units = records(catalog.units, 'ADAPTIVE_UNITS_INVALID'), artifacts = records(catalog.artifacts, 'ADAPTIVE_ARTIFACTS_INVALID');
  if (units.size < 2 || units.size > limits.max_units || artifacts.size > limits.max_artifacts) fail('ADAPTIVE_CATALOG_LIMIT');
  const references = refs => ids(refs, 1) && refs.every(ref => evidence.has(ref));
  for (const unit of units.values()) {
    fields(unit, ['id', 'title', 'requirement_ids', 'artifact_ids', 'interface', 'evidence_ids']);
    if (!text(unit.title) || !text(unit.interface) || !ids(unit.requirement_ids) || !ids(unit.artifact_ids, 1)
      || unit.artifact_ids.some(ref => !artifacts.has(ref)) || !references(unit.evidence_ids)) fail('ADAPTIVE_UNIT_INVALID');
  }
  if (!sameSet(catalog.units.flatMap(unit => unit.requirement_ids), requirement_ids)) fail('ADAPTIVE_REQUIREMENT_CONSERVATION');
  if (!sameSet(catalog.units.flatMap(unit => unit.artifact_ids), [...artifacts.keys()])) fail('ADAPTIVE_ARTIFACT_OWNERSHIP');
  for (const artifact of artifacts.values()) {
    fields(artifact, ['id', 'paths', 'description', 'evidence_ids']);
    if (!Array.isArray(artifact.paths) || !artifact.paths.length || artifact.paths.some(path => !safePath(path))
      || !text(artifact.description) || !references(artifact.evidence_ids)) fail('ADAPTIVE_ARTIFACT_INVALID');
  }
  const paths = catalog.artifacts.flatMap(artifact => artifact.paths);
  if (paths.length > limits.max_files) fail('ADAPTIVE_CATALOG_LIMIT');
  const folded = paths.map(path => path.toLowerCase());
  if (unique(folded).length !== folded.length || folded.some(path => folded.some(other => path !== other && path.startsWith(`${other}/`)))) fail('ADAPTIVE_FILE_OWNERSHIP');
  return catalog;
}

/** Pure preparation input. The runner performs and charges the one shared call. */
export function prepareAdaptiveCatalog({source, requirement_ids, requirement_descriptions = [], limits}) {
  limits = checkedLimits(limits);
  if (!text(source)) fail('ADAPTIVE_SOURCE_INVALID');
  const descriptions = publicRequirements(requirement_ids, requirement_descriptions);
  const string = {type: 'string', minLength: 1};
  const idSchema = {...string, pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]*$'};
  const list = (items, minItems = 0, maxItems) => ({type: 'array', items, minItems, uniqueItems: true, ...(maxItems ? {maxItems} : {})});
  const obj = properties => ({type: 'object', properties, required: Object.keys(properties), additionalProperties: false});
  const schema = obj({
    schema_version: {const: 'adaptive-catalog/v1'}, source_sha256: {const: hash(source)},
    evidence: list(obj({id: idSchema, quote: string}), 1),
    units: list(obj({id: idSchema, title: string, requirement_ids: list({enum: requirement_ids}),
      artifact_ids: list(idSchema, 1), interface: string, evidence_ids: list(idSchema, 1)}), 2, limits.max_units),
    artifacts: list(obj({id: idSchema, paths: list({...string, maxLength: 1024, pattern: CATALOG_PATH_PATTERN}, 1, limits.max_files), description: string,
      evidence_ids: list(idSchema, 1)}), 2, limits.max_artifacts),
  });
  return {source_sha256: hash(source), schema, prompt: `${loadAdaptiveDagContract().catalog_instructions}\n\n${JSON.stringify({
    original_public_source: source, source_sha256: hash(source), requirement_ids,
    requirement_descriptions: descriptions, limits: {max_units: limits.max_units, max_artifacts: limits.max_artifacts, max_files: limits.max_files},
  })}`};
}

function validateAnswer(response, questions) {
  if (uncertain(response)) fail('ADAPTIVE_DECISION_UNCERTAIN', {outcome_uncertain: true});
  if (response?.ok === false || response?.error != null
    || (response?.status !== undefined && !['completed', 'succeeded', 'success'].includes(response.status))) fail('ADAPTIVE_DECISION_FAILED', {outcome_uncertain: false});
  if (!object(response?.answers) || !sameSet(Object.keys(response.answers), Object.keys(questions))) fail('ADAPTIVE_DECISION_INVALID', {outcome_uncertain: false});
  const choices = {};
  for (const [key, question] of Object.entries(questions)) {
    const answer = response.answers[key];
    if (!object(answer) || answer.type !== 'choice' || typeof answer.choice !== 'string' || !Object.hasOwn(question.criteria, answer.choice)
      || Object.keys(answer).some(field => !['type', 'choice', 'confidence', 'probabilities'].includes(field))
      || (answer.confidence != null && (!Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1))
      || (answer.probabilities !== undefined && (!object(answer.probabilities)
        || !sameSet(Object.keys(answer.probabilities), Object.keys(question.criteria))
        || Object.values(answer.probabilities).some(value => !Number.isFinite(value) || value < 0 || value > 1)))) fail('ADAPTIVE_DECISION_INVALID', {outcome_uncertain: false});
    choices[key] = answer.choice;
  }
  return choices;
}

function createChooser({contract, limits, decide, record, decisions, stats, prepareRequest}) {
  return async ({kind, state, entries}) => {
    const template = contract.questions[kind], stage = {split_count: 'split', membership: 'split', relation: 'relations', repair: 'repair'}[kind];
    const decisionId = `adaptive-${kind}-${decisions.length + 1}`;
    const questions = {}, local = {};
    for (const entry of entries) {
      const keys = Object.keys(entry.criteria);
      if (!keys.length || keys.length > 255) fail('ADAPTIVE_CHOICES_INVALID');
      if (keys.length === 1) local[entry.id] = keys[0];
      else questions[entry.id] = {type: 'choice', instructions: template.instructions, criteria: entry.criteria};
    }
    let selections = local, selectionMethod = 'local_singleton';
    if (Object.keys(questions).length) {
      if (stats.provider_calls >= limits.max_decisions) fail('ADAPTIVE_DECISION_LIMIT', {outcome_uncertain: false});
      if (typeof decide !== 'function') fail('ADAPTIVE_DECIDER_REQUIRED');
      let prepared = prepareDecision({model: 'jev-latest', state: clone({...state, contract_source: contract.source}), questions});
      if (prepareRequest) prepared = prepareDecision(await prepareRequest(clone(prepared.body)));
      if (Buffer.byteLength(prepared.serialized, 'utf8') > limits.max_request_bytes) fail('ADAPTIVE_REQUEST_LIMIT', {outcome_uncertain: false});
      await record({event: 'adaptive_decision_requested', stage, decision_id: decisionId, request: clone(prepared.body)});
      stats.provider_calls++;
      stats.provider_questions += Object.keys(questions).length;
      let response, received = false;
      try {
        const returned = await decide(clone(prepared.body), {stage, decision_id: decisionId});
        received = true;
        if (uncertain(returned)) fail('ADAPTIVE_DECISION_UNCERTAIN', {outcome_uncertain: true});
        response = clone(returned, 'ADAPTIVE_DECISION_INVALID');
        selections = {...local, ...validateAnswer(response, questions)};
      } catch (error) {
        const outcome = adaptiveOutcomeUncertain(error, {fallback: !received});
        const terminal_cause = adaptiveTerminalCause(error, {stage, fallbackCode: 'ADAPTIVE_DECISION_CALL_FAILED', outcome_uncertain: outcome});
        await record({event: 'adaptive_decision_failed', stage, decision_id: decisionId,
          code: text(error?.code) ? error.code : 'ADAPTIVE_DECISION_CALL_FAILED', response_received: received,
          terminal_cause, outcome_uncertain: outcome, automatic_retries: 0});
        fail(terminal_cause.code, {terminal_cause, outcome_uncertain: outcome, response_received: received});
      }
      selectionMethod = 'typed_choice';
    }
    stats.local_questions += Object.keys(local).length;
    const decision = {decision_id: decisionId, stage, kind, selections, selection_method: selectionMethod,
      local_question_ids: Object.keys(local)};
    decisions.push(clone(decision));
    await record({event: 'adaptive_decision_selected', ...clone(decision)});
    return selections;
  };
}

function project({catalog, requirement_descriptions, unit_ids}) {
  const selected = catalog.units.filter(unit => unit_ids.includes(unit.id));
  if (selected.length !== unique(unit_ids).length) fail('ADAPTIVE_PROJECTION_REFERENCE');
  const artifacts = catalog.artifacts.filter(artifact => selected.some(unit => unit.artifact_ids.includes(artifact.id)));
  const evidenceIds = unique([...selected, ...artifacts].flatMap(item => item.evidence_ids));
  const requirements = selected.flatMap(unit => unit.requirement_ids);
  return {source_projection: 'exact_referenced_quotes', source_sha256: catalog.source_sha256,
    catalog_sha256: hash(JSON.stringify(catalog)), units: clone(selected), artifacts: clone(artifacts),
    evidence: clone(catalog.evidence.filter(item => evidenceIds.includes(item.id))),
    requirement_descriptions: clone(requirement_descriptions.filter(item => requirements.includes(item.id)))};
}

function describeLeaves(tree, catalog) {
  return tree.filter(node => node.status === 'leaf').map(node => {
    const units = catalog.units.filter(unit => node.unit_ids.includes(unit.id));
    const artifacts = catalog.artifacts.filter(artifact => units.some(unit => unit.artifact_ids.includes(artifact.id)));
    return {id: `adaptive-leaf-${node.id}`, node_id: node.id, parent_node_id: node.parent_id, depth: node.depth,
      unit_ids: [...node.unit_ids], requirement_ids: units.flatMap(unit => unit.requirement_ids),
      artifact_ids: artifacts.map(artifact => artifact.id), paths: artifacts.flatMap(artifact => artifact.paths),
      interfaces: units.map(unit => ({unit_id: unit.id, title: unit.title, interface: unit.interface}))};
  });
}

function compilePlan({catalog, leaves, relations, checks, profile_id, goal_revision, limits, max_concurrency, revision}) {
  const tasks = leaves.map((leaf, index) => ({id: leaf.id, kind: 'implementation', parent_id: null,
    requirement_ids: [...leaf.requirement_ids], input_artifact_ids: [], output_artifact_ids: [...leaf.artifact_ids],
    check_ids: [], worker_id: `adaptive-worker-${index + 1}`, read_scope: [], write_scope: [...leaf.paths], duration: unknownDuration()}));
  for (const relation of relations) {
    if (relation.choice === 'no_dependency') continue;
    const consumerId = relation.choice === 'a_requires_b' ? relation.task_a_id : relation.task_b_id;
    const producerId = relation.choice === 'a_requires_b' ? relation.task_b_id : relation.task_a_id;
    const consumer = tasks.find(task => task.id === consumerId), producer = tasks.find(task => task.id === producerId);
    consumer.input_artifact_ids = unique([...consumer.input_artifact_ids, ...producer.output_artifact_ids]);
    consumer.read_scope = unique([...consumer.read_scope, ...producer.write_scope]);
  }
  const integrationChecks = [];
  for (const check of checks) {
    if (check.phase === 'integration') { integrationChecks.push(check.id); continue; }
    const owner = tasks.filter(task => check.artifact_ids.length && check.artifact_ids.every(id => task.output_artifact_ids.includes(id))
      && check.requirement_ids.every(id => task.requirement_ids.includes(id)));
    if (owner.length !== 1) fail('ADAPTIVE_LOCAL_CHECK_SCOPE');
    owner[0].check_ids.push(check.id);
  }
  tasks.push({id: 'verify-public', kind: 'verification', parent_id: null,
    requirement_ids: catalog.units.flatMap(unit => unit.requirement_ids),
    input_artifact_ids: catalog.artifacts.map(artifact => artifact.id), output_artifact_ids: [],
    check_ids: integrationChecks, worker_id: null,
    read_scope: catalog.artifacts.flatMap(artifact => artifact.paths), write_scope: [], duration: unknownDuration()});
  const plan = validateDagPlan({schema_version: 'artifact-dag/v1', goal_revision, graph_revision: revision,
    requirement_ids: catalog.units.flatMap(unit => unit.requirement_ids), worker_limit: limits.max_leaves,
    max_concurrency, workers: tasks.filter(task => task.worker_id).map(task => ({id: task.worker_id, profile_id})),
    tasks, artifacts: catalog.artifacts.map(artifact => ({id: artifact.id,
      producer_task_id: leaves.find(leaf => leaf.artifact_ids.includes(artifact.id)).id})),
    checks: clone(checks), unknown_relationships: []});
  analyzeDag(plan);
  return plan;
}

function assertAcyclic(leaves, relations) {
  const edges = new Map(leaves.map(leaf => [leaf.id, []]));
  for (const relation of relations) {
    if (relation.choice === 'no_dependency' || relation.choice === 'unknown') continue;
    const consumer = relation.choice === 'a_requires_b' ? relation.task_a_id : relation.task_b_id;
    const producer = relation.choice === 'a_requires_b' ? relation.task_b_id : relation.task_a_id;
    edges.get(producer).push(consumer);
  }
  const visiting = new Set(), completed = new Set();
  const visit = node => {
    if (visiting.has(node)) fail('ADAPTIVE_RELATION_CYCLE');
    if (completed.has(node)) return;
    visiting.add(node);
    edges.get(node).forEach(visit);
    visiting.delete(node); completed.add(node);
  };
  leaves.forEach(leaf => visit(leaf.id));
}

/** Fresh planning only. Dispatch is permitted only after a successful commit callback. */
export async function planAdaptiveDag({catalog, source, requirement_ids, requirement_descriptions = [], checks,
  profile_id, goal_revision, limits, max_concurrency = 2, decompositionPolicy, decide, record = async () => {}, commit}) {
  limits = checkedLimits(limits);
  catalog = validateAdaptiveCatalog({catalog, source, requirement_ids, limits});
  requirement_descriptions = publicRequirements(requirement_ids, requirement_descriptions);
  checks = clone(checks);
  if (!id(profile_id) || !text(goal_revision) || !Number.isSafeInteger(max_concurrency) || max_concurrency < 1
    || max_concurrency > limits.max_leaves || typeof record !== 'function'
    || (commit !== undefined && typeof commit !== 'function')) fail('ADAPTIVE_PLANNING_INPUT');
  if (decompositionPolicy !== undefined && decompositionPolicy !== 'balanced-v2') fail('ADAPTIVE_DECOMPOSITION_POLICY_INVALID');
  // Verify trusted checker coverage before the first decision, independent of grouping.
  const atomicTree = catalog.units.map((unit, index) => ({id: `n${index + 1}`, parent_id: null, depth: 1,
    unit_ids: [unit.id], child_ids: [], status: 'leaf'}));
  compilePlan({catalog, leaves: describeLeaves(atomicTree, catalog), relations: [], checks, profile_id, goal_revision,
    limits: {...limits, max_leaves: 30}, max_concurrency, revision: 'adaptive-preflight'});
  const baseContract = loadAdaptiveDagContract();
  const balancing = decompositionPolicy === 'balanced-v2'
    ? createAdaptiveDecompositionBalancer({catalog, max_concurrency, limits}) : null;
  const contract = balancing ? {...baseContract,
    questions: {...baseContract.questions, ...balancing.contract.questions},
    source: {...balancing.contract.source, inherited_contract: baseContract.source}} : baseContract;
  const decisions = [], relations = [];
  const stats = {provider_calls: 0, provider_questions: 0, local_questions: 0};
  const executionContext = {profile_id, max_concurrency, implementation_invocation: 'one fresh session per leaf',
    session_reuse: false, per_file_calls: false, multi_file_leaf_allowed: true, root_minimum_children: 2};
  const tree = [{id: 'n0', parent_id: null, depth: 0, unit_ids: catalog.units.map(unit => unit.id), child_ids: [], status: 'pending'}];
  const ask = createChooser({contract, limits, decide, record, decisions, stats});
  const projection = unit_ids => ({...project({catalog, requirement_descriptions, unit_ids}), execution_context: clone(executionContext)});
  const base = () => ({catalog_sha256: hash(JSON.stringify(catalog)), source_sha256: catalog.source_sha256,
    catalog_hash_basis: 'JSON.stringify(validated_catalog)', limits: clone(limits), stats: clone(stats),
    ...(balancing ? {decomposition_policy: clone(balancing.policy)} : {}),
    tree: clone(tree), relations: clone(relations), decisions: clone(decisions)});
  let leaves = [];
  try {
    for (;;) {
      const node = tree.find(item => item.status === 'pending');
      if (!node) break;
      const frontier = tree.filter(item => item.status !== 'split').length;
      const overCapacity = balancing ? balancing.overload(node.unit_ids).length > 0 : false;
      let maximum = Math.min(node.unit_ids.length, limits.max_leaves - frontier + 1, limits.max_nodes - tree.length);
      if (node.depth >= limits.max_depth && !overCapacity) maximum = 1;
      while (maximum >= 2 && (frontier + maximum - 1) * (frontier + maximum - 2) / 2 > limits.max_relation_pairs) maximum--;
      const criteria = {};
      if (node.parent_id !== null && !overCapacity) criteria.keep = 'Keep this scope as one implementation leaf.';
      for (let count = 2; count <= maximum; count++) criteria[`split_${count}`] = `Partition these units into exactly ${count} nonempty children.`;
      const splitBalance = balancing?.splitState({node, tree, maximum, frontier, criteria, providerCalls: stats.provider_calls});
      if (balancing) await record({event: 'adaptive_balancing_options_prepared', kind: 'split_count', node_id: node.id,
        criteria: clone(criteria), balancing: clone(splitBalance)});
      if (!Object.keys(criteria).length) fail(balancing && overCapacity ? 'ADAPTIVE_BALANCE_CAPACITY_INFEASIBLE' : 'ADAPTIVE_ROOT_SPLIT_INFEASIBLE', {outcome_uncertain: false});
      const questionId = contract.questions.split_count.id;
      const answer = await ask({kind: 'split_count', entries: [{id: questionId, criteria}], state: {
        ...projection(node.unit_ids), node: clone(node), tree: clone(tree), limits: clone(limits),
        scope: node.parent_id === null ? 'root' : 'recursive', remaining_leaf_slots: limits.max_leaves - frontier,
        ...(balancing ? {balancing: splitBalance} : {}),
      }});
      if (answer[questionId] === 'keep') { node.status = 'leaf'; continue; }
      const count = Number(answer[questionId].slice('split_'.length));
      const groups = Array.from({length: count}, () => []);
      for (const [index, unitId] of node.unit_ids.entries()) {
        const remaining = node.unit_ids.length - index - 1;
        const firstEmpty = groups.findIndex(group => group.length === 0), options = {};
        for (let child = 0; child < count; child++) {
          // Equivalent empty child labels are canonicalized, never unit membership.
          if (groups[child].length === 0 && child !== firstEmpty) continue;
          if (balancing && groups[child].length >= balancing.membershipCapacity(node.unit_ids.length, count)) continue;
          const emptyAfter = groups.filter(group => !group.length).length - (groups[child].length === 0 ? 1 : 0);
          if (emptyAfter <= remaining) options[`child_${child + 1}`] = `Assign ${unitId} to child ${child + 1}.`;
        }
        const membershipBalance = balancing?.membershipState({node, tree, groups, unitId,
          remainingUnitIds: node.unit_ids.slice(index + 1), criteria: options, providerCalls: stats.provider_calls});
        if (balancing) await record({event: 'adaptive_balancing_options_prepared', kind: 'membership', node_id: node.id,
          unit_id: unitId, criteria: clone(options), balancing: clone(membershipBalance)});
        if (balancing && !Object.keys(options).length) fail('ADAPTIVE_BALANCE_CAPACITY_INFEASIBLE', {outcome_uncertain: false});
        const membershipId = contract.questions.membership.id;
        const selected = await ask({kind: 'membership', entries: [{id: membershipId, criteria: options}], state: {
          ...projection(node.unit_ids), node_id: node.id, unit_id: unitId,
          child_membership: groups.map((unit_ids, child) => ({child: child + 1, unit_ids: [...unit_ids]})),
          remaining_unit_ids: node.unit_ids.slice(index + 1), selected_child_count: count,
          ...(balancing ? {balancing: membershipBalance} : {}),
        }});
        groups[Number(selected[membershipId].slice('child_'.length)) - 1].push(unitId);
      }
      if (groups.some(group => !group.length || group.length >= node.unit_ids.length)
        || !sameSet(groups.flat(), node.unit_ids)) fail('ADAPTIVE_PARTITION_CONSERVATION');
      const firstIndex = tree.length;
      const children = groups.map((unit_ids, index) => ({id: `n${firstIndex + index}`, parent_id: node.id,
        depth: node.depth + 1, unit_ids, child_ids: [], status: 'pending'}));
      node.status = 'split'; node.child_ids = children.map(child => child.id); tree.push(...children);
      await record({event: 'adaptive_scope_split', node_id: node.id, children: clone(children)});
    }
    leaves = describeLeaves(tree, catalog);
    if (balancing && leaves.some(leaf => balancing.overload(leaf.unit_ids).length)) fail('ADAPTIVE_BALANCE_CAPACITY_INFEASIBLE', {outcome_uncertain: false});
    if (leaves.length < 2 || leaves.length > limits.max_leaves || !sameSet(leaves.flatMap(leaf => leaf.unit_ids), catalog.units.map(unit => unit.id))) fail('ADAPTIVE_LEAF_CONSERVATION');
    const pairs = leaves.flatMap((a, i) => leaves.slice(i + 1).map(b => ({task_a_id: a.id, task_b_id: b.id})));
    if (pairs.length > limits.max_relation_pairs) fail('ADAPTIVE_RELATION_LIMIT');
    for (let offset = 0; offset < pairs.length; offset += limits.relation_batch_size) {
      const batch = pairs.slice(offset, offset + limits.relation_batch_size);
      const entries = batch.map((pair, index) => {
        const criteria = {};
        for (const choice of ['a_requires_b', 'b_requires_a']) {
          try {
            assertAcyclic(leaves, [...relations, {...pair, choice}]);
            const producer = leaves.find(leaf => leaf.id === (choice === 'a_requires_b' ? pair.task_b_id : pair.task_a_id));
            const consumer = choice === 'a_requires_b' ? pair.task_a_id : pair.task_b_id;
            criteria[choice] = `${consumer} requires ${producer.id}: ${producer.id} must produce artifacts [${producer.artifact_ids.join(', ')}] at [${producer.paths.join(', ')}] and pass their local checks before ${consumer} consumes those files.`;
          }
          catch (error) { if (error.code !== 'ADAPTIVE_RELATION_CYCLE') throw error; }
        }
        criteria.no_dependency = 'Neither task consumes files produced by the other.';
        criteria.unknown = 'Block dispatch because this pair is unresolved or mutually dependent.';
        return {id: `${contract.questions.relation.id}.${offset + index + 1}`, criteria};
      });
      const relevant = leaves.filter(leaf => batch.some(pair => [pair.task_a_id, pair.task_b_id].includes(leaf.id)));
      const relationState = {...projection(relevant.flatMap(leaf => leaf.unit_ids)),
        leaves: clone(relevant), pairs: batch.map((pair, index) => ({question_id: entries[index].id, ...pair})),
        accepted_relations: clone(relations), relation_batch_atomic: true};
      const relationProjection = balancing ? projectBalancedRelationState(relationState) : null;
      if (relationProjection) await record({event: 'adaptive_relation_input_projected', report: clone(relationProjection.report)});
      const selected = await ask({kind: 'relation', entries, state: relationProjection?.state ?? relationState});
      const proposed = batch.map((pair, index) => ({...pair, question_id: entries[index].id, choice: selected[entries[index].id]}));
      if (proposed.some(relation => relation.choice === 'unknown')) fail('ADAPTIVE_RELATION_UNRESOLVED', {outcome_uncertain: false});
      assertAcyclic(leaves, [...relations, ...proposed]);
      relations.push(...proposed);
      await record({event: 'adaptive_relation_batch_applied', relations: clone(proposed)});
    }
    const revision = `adaptive-${hash(JSON.stringify({catalog, tree, relations, checks, profile_id, goal_revision,
      ...(balancing ? {decomposition_policy: balancing.policy} : {})})).slice(0, 24)}`;
    const plan = compilePlan({catalog, leaves, relations, checks, profile_id, goal_revision, limits, max_concurrency, revision});
    const result = {status: 'planned', dispatch_allowed: Boolean(commit), ...base(), plan,
      artifactBindings: Object.fromEntries(catalog.artifacts.map(artifact => [artifact.id, {paths: [...artifact.paths]}])),
      leaves: clone(leaves), catalog: clone(catalog), requirement_descriptions: clone(requirement_descriptions),
      contract_source: contract.source, execution_context: clone(executionContext), durable_commit_callback: Boolean(commit)};
    if (commit) {
      try { await commit(clone(result), {graph_revision: revision, catalog_sha256: result.catalog_sha256}); }
      catch (error) { fail('ADAPTIVE_COMMIT_FAILED', {outcome_uncertain: uncertain(error) || error?.outcome_uncertain !== false}); }
    }
    await record({event: 'adaptive_plan_ready', graph_revision: revision, worker_count: leaves.length,
      dispatch_allowed: result.dispatch_allowed, stats: clone(stats)});
    return result;
  } catch (error) {
    const result = {status: uncertain(error) ? 'uncertain' : 'blocked', dispatch_allowed: false, plan: null,
      reason: text(error?.code) ? error.code : 'ADAPTIVE_PLANNING_FAILED', outcome_uncertain: uncertain(error),
      terminal_cause: adaptiveTerminalCause(error, {stage: 'planning', fallbackCode: 'ADAPTIVE_PLANNING_FAILED'}),
      response_received: error?.response_received ?? false, automatic_retries: 0,
      ...base(), leaves: clone(leaves)};
    await record({event: 'adaptive_planning_stopped', reason: result.reason, terminal_cause: result.terminal_cause,
      outcome_uncertain: result.outcome_uncertain, stats: clone(stats)});
    return result;
  }
}

/** Select a closed repair scope; execution owns the new attempt and immutable old round. */
export async function chooseAdaptiveRepair({source, planning, failure, candidates, limits, decide, projectRepairState,
  buildRepairState, artifactBindings, repairPolicy, repairInputPolicy, requestOverride, recovery, onRequest,
  record = async () => {}}) {
  if (repairPolicy !== undefined && !['causal-v1', 'inferred-v1', 'inferred-v2'].includes(repairPolicy)) fail('ADAPTIVE_REPAIR_POLICY_INVALID');
  const inferred = ['inferred-v1', 'inferred-v2'].includes(repairPolicy), causal = inferred || repairPolicy === 'causal-v1';
  if (causal && typeof buildRepairState !== 'function') fail('ADAPTIVE_REPAIR_STATE_REQUIRED');
  if (repairInputPolicy !== undefined && repairInputPolicy !== 'evidence-v1') fail('ADAPTIVE_REPAIR_INPUT_POLICY');
  if (onRequest !== undefined && typeof onRequest !== 'function') fail('ADAPTIVE_REPAIR_REQUEST_OBSERVER');
  if ((requestOverride || recovery) && !repairInputPolicy) fail('ADAPTIVE_REPAIR_INPUT_OVERRIDE_POLICY');
  if (!object(limits) || !Number.isSafeInteger(limits.max_repair_attempts) || limits.max_repair_attempts < 0
    || !Number.isSafeInteger(limits.repair_attempts_used) || limits.repair_attempts_used < 0) fail('ADAPTIVE_REPAIR_LIMITS');
  const stopped = (reason, outcome_uncertain = false) => ({status: outcome_uncertain ? 'uncertain' : 'stopped', reason,
    outcome_uncertain, dispatch_allowed: false, candidate: null, candidate_id: null, automatic_retries: 0});
  if (uncertain(failure) || failure?.outcome_uncertain !== false) return stopped('ADAPTIVE_REPAIR_OUTCOME_UNCERTAIN', true);
  if (limits.repair_attempts_used >= limits.max_repair_attempts) return stopped('ADAPTIVE_REPAIR_LIMIT');
  if (failure?.status !== 'failed') return stopped('ADAPTIVE_REPAIR_NO_KNOWN_FAILURE');
  planning = clone(planning); failure = clone(failure); candidates = clone(candidates);
  const plan = validateDagPlan(planning.plan); analyzeDag(plan);
  if (!text(source) || planning.source_sha256 !== hash(source) || !object(planning.catalog)
    || planning.catalog_sha256 !== hash(JSON.stringify(planning.catalog))) fail('ADAPTIVE_REPAIR_SOURCE_MISMATCH');
  const implementations = plan.tasks.filter(task => task.kind === 'implementation').map(task => task.id);
  if (!Array.isArray(candidates) || candidates.length > 254 || unique(candidates.map(candidate => candidate.id)).length !== candidates.length) fail('ADAPTIVE_REPAIR_CANDIDATES');
  for (const candidate of candidates) {
    fields(candidate, ['id', 'task_ids', 'reason', 'evidence_refs', ...(buildRepairState ? ['artifact_ids', 'attribution_basis'] : []),
      ...(causal ? ['read_artifact_ids'] : []), ...(inferred ? ['owner_inference_id'] : [])], 'ADAPTIVE_REPAIR_CANDIDATES');
    if (!id(candidate.id) || !ids(candidate.task_ids, 1) || candidate.task_ids.some(task => !implementations.includes(task))
      || !text(candidate.reason) || !Array.isArray(candidate.evidence_refs) || !candidate.evidence_refs.length
      || candidate.evidence_refs.some(ref => !text(ref))) fail('ADAPTIVE_REPAIR_CANDIDATES');
    if (buildRepairState) {
      if (!ids(candidate.artifact_ids, 1)) fail('ADAPTIVE_REPAIR_ARTIFACTS');
      const selected = plan.artifacts.filter(artifact => candidate.artifact_ids.includes(artifact.id));
      if (selected.length !== candidate.artifact_ids.length
        || selected.some(artifact => !candidate.task_ids.includes(artifact.producer_task_id))
        || candidate.task_ids.some(taskId => !selected.some(artifact => artifact.producer_task_id === taskId))) fail('ADAPTIVE_REPAIR_ARTIFACTS');
    }
    if (causal) (inferred ? validateInferredRepairCandidate : validateCausalRepairCandidate)({planning, failure, candidate, artifactBindings,
      ...(inferred ? {ownerInputPolicy: repairPolicy, ...(repairInputPolicy ? {repairInputPolicy} : {})} : {})});
  }
  if (!candidates.length) return stopped('ADAPTIVE_REPAIR_NO_CANDIDATE');
  const contract = loadAdaptiveDagContract(), decisions = [], stats = {provider_calls: 0, provider_questions: 0, local_questions: 0};
  if (causal) {
    const inferredVersion = repairPolicy === 'inferred-v2' ? 'v2' : 'v1';
    const path = inferred ? `docs/orchestration/contracts/adaptive-inferred-repair.${inferredVersion}.json` : 'docs/orchestration/contracts/adaptive-causal-repair.v1.json';
    const raw = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), policy = JSON.parse(raw);
    if (!text(policy.decision_call_instructions)) fail('ADAPTIVE_REPAIR_QUESTION_TEMPLATE');
    contract.questions.repair = {id: inferred ? `adaptive.inferred_repair.${inferredVersion}` : 'adaptive.causal_repair.v1', type: 'choice', instructions: policy.decision_call_instructions};
    if (!text(policy.candidate_reference_template) || !policy.candidate_reference_template.includes('{candidate_id}')) fail('ADAPTIVE_REPAIR_CRITERIA_TEMPLATE');
    contract.repair_criteria_template = policy.candidate_reference_template;
    contract.source = {path, sha256: hash(raw), version: policy.schema_version};
  }
  const prepareRepairRequest = onRequest || requestOverride || recovery ? async request => {
    let actual = request;
    if (requestOverride) {
      const rebuilt = verifyRepairInputOverride(request, requestOverride);
      if (recovery && !isDeepStrictEqual(recovery, requestOverride.recovery)) fail('ADAPTIVE_REPAIR_RECOVERY_BINDING');
      actual = rebuilt.request;
    } else if (recovery) fail('ADAPTIVE_REPAIR_RECOVERY_WITHOUT_OVERRIDE');
    const prepared = prepareDecision(actual);
    if (onRequest) await onRequest(clone(prepared.body));
    return clone(prepared.body);
  } : undefined;
  const checkedDecide = requestOverride?.recovery ? (request, context) => decide(request,
    {...context, recovery: clone(requestOverride.recovery)}) : decide;
  const ask = createChooser({contract, decide: checkedDecide, prepareRequest: prepareRepairRequest, record, decisions, stats,
    limits: {max_decisions: 1, max_request_bytes: limits.max_request_bytes ?? 240000}});
  const criteria = Object.fromEntries(candidates.map(candidate => [`repair_${candidate.id}`, causal
    ? contract.repair_criteria_template.replaceAll('{candidate_id}', candidate.id) : candidate.reason]));
  criteria.stop = 'Stop this attempt without modifying any prior artifacts or checks.';
  const questionId = contract.questions.repair.id;
  let projectionReport = null;
  try {
    const rawState = buildRepairState ? null : {
      ...project({catalog: planning.catalog, requirement_descriptions: planning.requirement_descriptions ?? [],
        unit_ids: unique(planning.leaves.filter(leaf => candidates.some(candidate => candidate.task_ids.includes(leaf.id))).flatMap(leaf => leaf.unit_ids))}),
      graph_revision: plan.graph_revision, relations: planning.relations, leaves: planning.leaves,
      execution_context: planning.execution_context,
      failure, candidates, limits: clone(limits),
    };
    const projected = buildRepairState
      ? buildRepairState({planning, failure, candidates, artifactBindings,
        ...(inferred ? {ownerInputPolicy: repairPolicy, ...(repairInputPolicy ? {repairInputPolicy} : {})} : {})})
      : projectRepairState ? projectRepairState(rawState) : null;
    if (buildRepairState && (!object(projected?.state) || !object(projected?.report))) fail('ADAPTIVE_REPAIR_STATE_INVALID');
    projectionReport = projected?.report ?? null;
    if (projected) await record({event: 'adaptive_repair_input_projected', report: clone(projectionReport)});
    const selected = await ask({kind: 'repair', entries: [{id: questionId, criteria}], state: projected?.state ?? rawState});
    if (selected[questionId] === 'stop') return {...stopped('ADAPTIVE_REPAIR_SELECTED_STOP'), decision: decisions[0], stats,
      projection_report: projectionReport};
    const candidate = candidates.find(item => `repair_${item.id}` === selected[questionId]);
    return {status: 'selected', candidate: clone(candidate), candidate_id: candidate.id, decision: decisions[0], stats,
      outcome_uncertain: false, dispatch_allowed: false, action: 'fresh_repair_scope_selected', projection_report: projectionReport};
  } catch (error) {
    return {...stopped(error.code ?? 'ADAPTIVE_REPAIR_DECISION_FAILED', uncertain(error)), stats, projection_report: projectionReport,
      terminal_cause: adaptiveTerminalCause(error, {stage: 'repair', fallbackCode: 'ADAPTIVE_REPAIR_DECISION_FAILED'}),
      response_received: error?.response_received ?? false};
  }
}
