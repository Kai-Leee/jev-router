import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const unique = values => [...new Set(values)];
const clone = value => structuredClone(value);
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, ...details}); };
const strings = value => Array.isArray(value) && value.every(nonempty);
const distinct = value => strings(value) && unique(value).length === value.length;
const sameSet = (a, b) => distinct(a) && distinct(b) && a.length === b.length && a.every(x => b.includes(x));
const stable = value => JSON.stringify(value, (_, item) => isObject(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
const hash = value => createHash('sha256').update(stable(value)).digest('hex');
const same = (a, b) => stable(a) === stable(b);
const leafNodes = tasks => tasks.filter(task => task.children.length === 0);
const safeCode = error => typeof error?.code === 'string' && /^[A-Z0-9_]{1,80}$/.test(error.code) ? error.code : 'UNCLASSIFIED_ERROR';
const sourceExcerpt = (source, ref) => {
  const lines = source.text.split('\n');
  return lines.slice(ref.start_line - 1, ref.end_line).join('\n') + (ref.end_line < lines.length ? '\n' : '');
};

function assertJson(value, ancestors = new Set()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!(Array.isArray(value) || isObject(value)) || ancestors.has(value)
    || (isObject(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) fail('INVALID_RECURSIVE_INPUT');
  ancestors.add(value);
  for (const item of Object.values(value)) assertJson(item, ancestors);
  ancestors.delete(value);
}

function topologicalOrder(ids, dependencies) {
  const done = new Set(), order = [];
  while (order.length < ids.length) {
    const next = ids.find(id => !done.has(id) && dependencies[id].every(other => done.has(other)));
    if (next === undefined) return null;
    done.add(next); order.push(next);
  }
  return order;
}

/** Validate source-linked public specifications. This does not prove their semantic adequacy. */
export function validateRecursiveInput(input) {
  assertJson(input);
  const bad = field => fail('INVALID_RECURSIVE_INPUT', {field});
  if (!isObject(input) || !nonempty(input.schema_version) || !nonempty(input.goal)) bad('goal/schema_version');
  if (!isObject(input.source) || !nonempty(input.source.path) || !/^[a-f0-9]{64}$/i.test(input.source.sha256 ?? '')) bad('source');
  if (input.source.text !== undefined && (typeof input.source.text !== 'string'
    || createHash('sha256').update(input.source.text).digest('hex') !== input.source.sha256.toLowerCase())) bad('source.text/hash');
  if (!Array.isArray(input.obligations) || !input.obligations.length || !Array.isArray(input.tests)) bad('obligations/tests');
  if (!strings(input.constraints) || !strings(input.interfaces)) bad('constraints/interfaces');
  const validSourceRef = ref => isObject(ref) && ref.path === input.source.path
    && Number.isSafeInteger(ref.start_line) && ref.start_line >= 1
    && Number.isSafeInteger(ref.end_line) && ref.end_line >= ref.start_line
    && (ref.sha256 === undefined || ref.sha256 === input.source.sha256)
    && (input.source.text === undefined || ref.end_line <= input.source.text.split('\n').length);
  const ids = input.obligations.map(obligation => obligation?.id);
  if (!distinct(ids)) bad('obligation IDs');
  for (const obligation of input.obligations) {
    const ref = obligation?.source_ref;
    if (!isObject(obligation) || !nonempty(obligation.requirement_id) || !nonempty(obligation.text)
      || !validSourceRef(ref)) bad('obligation source');
    for (const field of ['inputs', 'outputs', 'write_scope', 'depends_on', 'gaps']) {
      if (!distinct(obligation[field])) bad(`obligation.${field}`);
    }
    if (obligation.depends_on.some(id => !ids.includes(id) || id === obligation.id)) bad('obligation dependency');
    if (obligation.write_scope.some(path => path.startsWith('/') || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..'))) bad('write_scope');
    if (obligation.context_refs !== undefined && (!Array.isArray(obligation.context_refs)
      || obligation.context_refs.some(context => !validSourceRef(context))
      || (obligation.context_refs.length && input.source.text === undefined))) bad('context_refs');
    if (input.source.text !== undefined) {
      const excerpt = sourceExcerpt(input.source, ref);
      if (!excerpt.includes(obligation.text)) bad('obligation source text');
    }
  }
  const dependencies = Object.fromEntries(input.obligations.map(item => [item.id, item.depends_on]));
  if (!topologicalOrder(ids, dependencies)) bad('cyclic obligation dependencies');
  if (!distinct(input.tests.map(item => item?.id))) bad('test IDs');
  for (const test of input.tests) {
    if (!isObject(test) || !distinct(test.requirement_refs) || !test.requirement_refs.length
      || test.requirement_refs.some(id => !ids.includes(id)) || !nonempty(test.scenario)
      || !Object.hasOwn(test, 'input') || !Object.hasOwn(test, 'expected')
      || !['unit', 'integration', 'e2e'].includes(test.scope) || test.runner_ref !== null || test.status !== 'not_run') bad('test specification');
    if (test.source_refs !== undefined && (!Array.isArray(test.source_refs) || test.source_refs.some(ref => !validSourceRef(ref)))) bad('test source_refs');
  }
  if (input.artifact_interfaces !== undefined) {
    if (!Array.isArray(input.artifact_interfaces) || !distinct(input.artifact_interfaces.map(item => item?.path))) bad('artifact_interfaces');
    for (const item of input.artifact_interfaces) if (!nonempty(item.purpose) || !distinct(item.dependency_paths)
      || item.dependency_paths.some(path => !input.artifact_interfaces.some(other => other.path === path))) bad('artifact_interfaces');
  }
  return clone(input);
}

function taskFacts(input, ids) {
  const obligations = input.obligations.filter(item => ids.includes(item.id));
  return {
    goal: obligations.map(item => `[${item.id}] ${item.text}`).join('\n\n'),
    obligation_ids: obligations.map(item => item.id),
    requirement_refs: obligations.map(item => item.id),
    source_requirement_ids: unique(obligations.map(item => item.requirement_id)),
    source_refs: obligations.map(item => ({obligation_id: item.id, ...clone(item.source_ref)})),
    inputs: unique(obligations.flatMap(item => item.inputs)),
    outputs: unique(obligations.flatMap(item => item.outputs)),
    write_scope: unique(obligations.flatMap(item => item.write_scope)),
    test_ids: input.tests.filter(test => test.requirement_refs.some(id => ids.includes(id))).map(test => test.id),
    dependency_limitations: obligations.filter(item => item.dependency_assertion !== 'asserted')
      .map(item => ({obligation_id: item.id, assertion: item.dependency_assertion ?? 'unspecified', basis: 'Only explicitly declared depends_on edges are known.'})),
  };
}

function makeTask(input, id, parentId, depth, ids) {
  return {
    id, parent_id: parentId, depth, children: [], ...taskFacts(input, ids),
    depends_on: [], write_serialization: [], planning_status: 'pending_review',
    execution_eligible: false, execution_status: 'not_started', verification_status: 'test_specification_only',
    review: null,
  };
}

function ownership(tasks) {
  return new Map(leafNodes(tasks).flatMap(task => task.obligation_ids.map(id => [id, task.id])));
}

function dependenciesFor(input, owners, taskIds) {
  const dependencies = Object.fromEntries(taskIds.map(id => [id, []]));
  for (const obligation of input.obligations) {
    const consumer = owners.get(obligation.id);
    if (!consumer) continue;
    for (const prerequisite of obligation.depends_on) {
      const producer = owners.get(prerequisite);
      if (producer && producer !== consumer && !dependencies[consumer].includes(producer)) dependencies[consumer].push(producer);
    }
  }
  return dependencies;
}

function structuralLinks(input, tasks) {
  const leaves = leafNodes(tasks), ids = leaves.map(task => task.id), owners = ownership(tasks);
  const dependencies = dependenciesFor(input, owners, ids), order = topologicalOrder(ids, dependencies);
  if (!order) fail('CYCLIC_TASK_DEPENDENCIES');
  const serialization = Object.fromEntries(ids.map(id => [id, []]));
  for (const path of unique(leaves.flatMap(task => task.write_scope))) {
    const writers = order.filter(id => leaves.find(task => task.id === id).write_scope.includes(path));
    if (writers.length < 2) continue;
    for (const [index, id] of writers.entries()) serialization[id].push({
      path, task_ids: writers, order_index: index, after: index ? writers[index - 1] : null,
      policy: 'exclusive_file_lock', read_latest_predecessor_artifact: true,
    });
  }
  return {dependencies, serialization};
}

function commonAncestor(tasks, ids) {
  const ancestors = id => {
    const path = [];
    while (id !== null) { path.unshift(id); id = tasks.find(task => task.id === id).parent_id; }
    return path;
  };
  const paths = ids.map(ancestors);
  return paths[0].filter((id, index) => paths.every(path => path[index] === id)).at(-1);
}

function linkedTests(input, tasks) {
  const owners = ownership(tasks), root = tasks.find(task => task.parent_id === null);
  return input.tests.map(test => {
    const taskIds = unique(test.requirement_refs.map(id => owners.get(id)));
    const scope = test.scope === 'unit' && taskIds.length > 1 ? 'integration' : test.scope;
    return {...clone(test), source_scope: test.scope, scope, task_ids: taskIds,
      integration_node_id: scope === 'e2e' ? root.id : scope === 'integration' ? commonAncestor(tasks, taskIds) : null,
      mapping_provenance: 'derived_from_leaf_obligation_ownership',
    };
  });
}

function refreshLinks(input, tasks) {
  const {dependencies, serialization} = structuralLinks(input, tasks);
  for (const task of tasks) {
    task.depends_on = dependencies[task.id] ?? [];
    task.write_serialization = serialization[task.id] ?? [];
  }
  return linkedTests(input, tasks);
}

/** Validate the entire history plus leaf ownership; aggregate parents never execute. */
export function validateRecursivePlan({input: rawInput, tasks, tests}) {
  const input = validateRecursiveInput(rawInput), issues = [];
  const issue = (code, details = {}) => issues.push({code, ...details});
  if (!Array.isArray(tasks) || !tasks.length || !Array.isArray(tests)) fail('INVALID_RECURSIVE_PLAN', {issues: [{code: 'MISSING_LISTS'}]});
  if (!distinct(tasks.map(task => task?.id))) issue('INVALID_TASK_IDS');
  const roots = tasks.filter(task => task?.parent_id === null), allIds = input.obligations.map(item => item.id);
  if (roots.length !== 1 || !sameSet(roots[0]?.obligation_ids, allIds)) issue('ROOT_COVERAGE');
  for (const task of tasks) {
    if (!isObject(task) || !distinct(task.children) || !distinct(task.obligation_ids) || !task.obligation_ids.length
      || task.obligation_ids.some(id => !allIds.includes(id))) { issue('INVALID_TASK_SHAPE'); continue; }
    if (task.execution_eligible !== false || task.execution_status !== 'not_started' || task.verification_status !== 'test_specification_only') issue('UNSUPPORTED_EXECUTION_CLAIM', {task_id: task.id});
    const parent = tasks.find(item => item.id === task.parent_id);
    if ((task.parent_id !== null && (!parent || !parent.children.includes(task.id) || task.depth !== parent.depth + 1))
      || (task.parent_id === null && task.depth !== 0)) issue('INVALID_PARENT', {task_id: task.id});
    const expected = taskFacts(input, task.obligation_ids);
    for (const [field, value] of Object.entries(expected)) if (!same(task[field], value)) issue('TASK_SOURCE_CHANGED', {task_id: task.id, field});
    if (task.children.length) {
      const children = task.children.map(id => tasks.find(item => item.id === id));
      if (task.children.length < 2 || task.children.length > 5 || children.some(child => !child || child.parent_id !== task.id
        || !Array.isArray(child.obligation_ids) || child.obligation_ids.length >= task.obligation_ids.length)) issue('INVALID_SPLIT', {task_id: task.id});
      const union = children.flatMap(child => child?.obligation_ids ?? []);
      if (!sameSet(union, task.obligation_ids)) issue('SPLIT_COVERAGE_OR_DUPLICATION', {task_id: task.id});
      if (task.planning_status !== 'aggregate') issue('PARENT_EXECUTION_DUPLICATION', {task_id: task.id});
    } else if (!['pending_review', 'needs_spec', 'ready_specification_only'].includes(task.planning_status)) issue('INVALID_LEAF_STATUS', {task_id: task.id});
    if (['ready_specification_only', 'aggregate'].includes(task.planning_status)) {
      const provenance = task.review?.provenance;
      const expectedChoice = task.children.length ? String(task.children.length) : '1';
      if (task.review?.choice !== expectedChoice || !isObject(provenance) || provenance.stage !== 'child_count'
        || !['typed_choice', 'deterministic_singleton'].includes(provenance.method) || !nonempty(provenance.question_version)
        || !/^[a-f0-9]{64}$/.test(provenance.request_sha256 ?? '') || !/^[a-f0-9]{64}$/.test(provenance.node_content_hash ?? '')
        || provenance.adequacy_assessed_by_model !== (provenance.method === 'typed_choice')
        || (task.planning_status === 'ready_specification_only' && nodeGaps(input, task).length)) issue('UNREVIEWED_OR_GAPPED_LEAF', {task_id: task.id});
    }
  }
  // Stop before graph traversal if malformed trees could make it unsafe or nonterminating.
  if (issues.length) fail('INVALID_RECURSIVE_PLAN', {issues});
  const reachable = new Set(), visit = id => {
    if (reachable.has(id)) { issue('TREE_CYCLE_OR_DUPLICATION'); return; }
    reachable.add(id); tasks.find(task => task.id === id).children.forEach(visit);
  };
  visit(roots[0].id);
  if (reachable.size !== tasks.length) issue('DISCONNECTED_TASKS');
  const leaves = leafNodes(tasks);
  if (!sameSet(leaves.flatMap(task => task.obligation_ids), allIds)) issue('LEAF_COVERAGE_OR_DUPLICATION');
  if (issues.length) fail('INVALID_RECURSIVE_PLAN', {issues});
  try {
    const expected = structuralLinks(input, tasks);
    for (const task of tasks) {
      if (!sameSet(task.depends_on, expected.dependencies[task.id] ?? [])) issue('DEPENDENCY_CHANGED', {task_id: task.id});
      if (!same(task.write_serialization, expected.serialization[task.id] ?? [])) issue('UNSAFE_SHARED_WRITES', {task_id: task.id});
    }
    if (!same(tests, linkedTests(input, tasks))) issue('TEST_COVERAGE_OR_EXPECTATION_CHANGED');
  } catch (error) { issue(safeCode(error)); }
  if (issues.length) fail('INVALID_RECURSIVE_PLAN', {issues});
  return {valid: true, issues: []};
}

function nodeGaps(input, node) {
  const gaps = [];
  for (const obligation of input.obligations.filter(item => node.obligation_ids.includes(item.id))) {
    for (const gap of obligation.gaps) gaps.push({obligation_id: obligation.id, code: 'DECLARED_GAP', detail: gap});
    for (const field of ['inputs', 'outputs', 'write_scope']) if (!obligation[field].length) gaps.push({obligation_id: obligation.id, code: `MISSING_${field.toUpperCase()}`});
    const tests = input.tests.filter(test => test.requirement_refs.includes(obligation.id));
    if (!tests.length) gaps.push({obligation_id: obligation.id, code: 'MISSING_TEST_SPECIFICATION'});
    for (const test of tests) if (test.expected === null || test.input === null
      || (typeof test.expected === 'string' && !nonempty(test.expected)) || (typeof test.input === 'string' && !nonempty(test.input))) gaps.push({obligation_id: obligation.id, test_id: test.id, code: 'MISSING_TEST_FACTS'});
  }
  return gaps;
}

function validatedOptions(limits, contract) {
  const minimums = {max_depth: 0, max_leaves: 1, max_planning_decisions: 0, max_repairs_per_node: 0,
    max_planning_input_tokens: 0, max_concurrency: 1, max_feasibility_states: 1};
  if (!isObject(limits)) fail('INVALID_RECURSIVE_LIMITS');
  const actual = {...limits, max_feasibility_states: limits.max_feasibility_states ?? 10000};
  for (const [key, minimum] of Object.entries(minimums)) if (!Number.isSafeInteger(actual[key]) || actual[key] < minimum) fail('INVALID_RECURSIVE_LIMITS', {field: key});
  if (!isObject(contract) || !nonempty(contract.schema_version)) fail('INVALID_RECURSIVE_CONTRACT');
  for (const key of ['child_count', 'anchor', 'assign_obligation']) if (contract.questions?.[key]?.type !== 'choice' || !nonempty(contract.questions[key].instructions)) fail('INVALID_RECURSIVE_CONTRACT', {field: key});
  for (let count = 1; count <= 5; count++) if (!nonempty(contract.questions.child_count.criteria?.[String(count)])) fail('INVALID_RECURSIVE_CONTRACT', {field: 'child_count.criteria'});
  return clone(actual);
}

// A bounded witness only determines whether an option can finish without a known dependency cycle.
// Witness assignments are never substituted for the caller's selected anchors/owners.
function feasibleOwnership(input, localIds, fixedOwners, partial, childIds, otherIds, maxStates) {
  const taskIds = [...otherIds, ...childIds];
  let states = 0, exhausted = false;
  const search = assigned => {
    if (++states > maxStates) { exhausted = true; return false; }
    const owners = new Map([...fixedOwners, ...assigned]);
    if (!topologicalOrder(taskIds, dependenciesFor(input, owners, taskIds))) return false;
    const left = localIds.filter(id => !assigned.has(id));
    const missing = childIds.filter(id => ![...assigned.values()].includes(id));
    if (left.length < missing.length) return false;
    if (!left.length) return missing.length === 0;
    for (const child of [...missing, ...childIds.filter(id => !missing.includes(id))]) {
      const next = new Map(assigned); next.set(left[0], child);
      if (search(next)) return true;
      if (exhausted) return false;
    }
    return false;
  };
  const found = search(partial);
  return {status: found ? 'feasible' : exhausted ? 'unknown' : 'infeasible', states};
}

/** Bounded source-preserving planning only. No worker or executable test is invoked. */
export async function runRecursivePlanning({input: rawInput, decide, record = async () => {}, limits, contract, assignmentBatchSize = 1, respectResourceOptions = false}) {
  const input = validateRecursiveInput(rawInput), bounds = validatedOptions(limits, contract);
  if (!Number.isSafeInteger(assignmentBatchSize) || assignmentBatchSize < 1 || assignmentBatchSize > 32
    || typeof respectResourceOptions !== 'boolean') fail('INVALID_RECURSIVE_OPTIONS');
  const batchEnabled = assignmentBatchSize > 1 && input.obligations.every(item => item.depends_on.length === 0);
  if (typeof decide !== 'function' || typeof record !== 'function') fail('INVALID_RECURSIVE_OPTIONS');
  const started = performance.now(), issues = [], reviewed = new Set(), choices = new Map();
  let tasks = [makeTask(input, 'node_0', null, 0, input.obligations.map(item => item.id))];
  let tests = refreshLinks(input, tasks), status = 'complete', sequence = 0, currentNode = null, currentStage = null;
  const metrics = {
    decisions_attempted: 0, decisions_answered: 0, deterministic_choices: 0, reused_choices: 0,
    known_input_tokens: 0, input_tokens: 0, responses_without_usage: 0, repairs: 0,
    reviewed_nodes: 0, committed_splits: 0, feasibility_states: 0, configured_limits: bounds,
    contract_version: contract.schema_version, contract_sha256: hash(contract), planning_only: true,
    test_execution: 'not_run', product_success: null,
    operational_questions: ['child_count', 'anchor', 'assign_obligation'], test_scope_method: 'deterministic_ownership_mapping',
  };
  if (assignmentBatchSize !== 1 || respectResourceOptions) {
    metrics.assignment_batch_size = assignmentBatchSize;
    metrics.assignment_batch_enabled = batchEnabled;
    metrics.respect_resource_options = respectResourceOptions;
    if (batchEnabled) metrics.operational_questions.push('assign_obligation_batch');
  }
  const emit = async (event, data = {}) => {
    try { await record({event, sequence: ++sequence, ...clone(data)}); }
    catch { fail('RECORD_FAILED', {node_id: currentNode, stage: currentStage}); }
  };
  const stop = (code, details = {}) => fail(code, {planning_stop: true, ...details});
  const resourceState = node => ({
    limits: clone(bounds), remaining_planning_decisions: Math.max(0, bounds.max_planning_decisions - metrics.decisions_attempted),
    cumulative_planning_input_tokens: metrics.input_tokens, known_planning_input_tokens: metrics.known_input_tokens,
    remaining_known_input_token_budget: Math.max(0, bounds.max_planning_input_tokens - metrics.known_input_tokens),
    current_leaf_count: leafNodes(tasks).length,
    remaining_additional_leaves: Math.max(0, bounds.max_leaves - leafNodes(tasks).length),
    remaining_depth: Math.max(0, bounds.max_depth - node.depth),
  });
  const withResources = (state, node) => respectResourceOptions ? {...state, resources: resourceState(node)} : state;
  const localState = node => {
    const ids = new Set(node.obligation_ids), owners = ownership(tasks);
    const local = input.obligations.filter(item => ids.has(item.id));
    const related = tests.filter(test => test.requirement_refs.some(id => ids.has(id)));
    const external = input.obligations.filter(item => !ids.has(item.id) && (local.some(other => other.depends_on.includes(item.id))
      || item.depends_on.some(id => ids.has(id))));
    // Explicit references only replace equal, included values; no truncation, paraphrase or opaque encoding.
    const lineRef = ref => ({start_line: ref.start_line, end_line: ref.end_line});
    const projectedObligations = local.map(item => ({id: item.id, requirement_id: item.requirement_id,
      ...(item.title === undefined ? {} : {title: item.title}), text: item.text, source_ref: lineRef(item.source_ref),
      inputs: clone(item.inputs), outputs: clone(item.outputs), write_scope: clone(item.write_scope), depends_on: clone(item.depends_on),
      gaps: clone(item.gaps), context_refs: (item.context_refs ?? []).map(lineRef), dependency_assertion: item.dependency_assertion ?? 'unspecified'}));
    const exactValue = (value, field) => {
      for (const item of local) {
        const index = item[field].findIndex(candidate => same(candidate, value));
        if (index !== -1) return {obligation_id: item.id, field, index};
      }
      return null;
    };
    const projectedTests = related.map(item => {
      const inputRef = exactValue(item.input, 'inputs'), expectedRef = exactValue(item.expected, 'outputs');
      return {id: item.id, requirement_refs: clone(item.requirement_refs), scenario: item.scenario,
        ...(inputRef ? {input_ref: inputRef} : {input: clone(item.input)}),
        ...(expectedRef ? {expected_ref: expectedRef} : {expected: clone(item.expected)}),
        scope: item.scope, source_scope: item.source_scope, task_ids: clone(item.task_ids),
        runner_ref: item.runner_ref, status: item.status,
        ...(item.source_refs ? {source_refs: item.source_refs.map(lineRef)} : {})};
    });
    const contexts = new Map();
    for (const ref of [...local.flatMap(item => item.context_refs ?? []), ...related.flatMap(item => item.source_refs ?? [])]) {
      const key = `${ref.start_line}:${ref.end_line}`;
      if (input.source.text !== undefined && !local.some(item => item.source_ref.start_line === ref.start_line
        && item.source_ref.end_line === ref.end_line && item.text === sourceExcerpt(input.source, ref))) {
        contexts.set(key, {...lineRef(ref), text: sourceExcerpt(input.source, ref)});
      }
    }
    const relevantPaths = new Set(node.write_scope);
    let expanded = true;
    while (expanded) {
      expanded = false;
      for (const item of input.artifact_interfaces ?? []) if (relevantPaths.has(item.path)) for (const path of item.dependency_paths) {
        if (!relevantPaths.has(path)) { relevantPaths.add(path); expanded = true; }
      }
    }
    const artifactInterfaces = (input.artifact_interfaces ?? []).filter(item => relevantPaths.has(item.path))
      .map(item => ({path: item.path, purpose: item.purpose, dependency_paths: clone(item.dependency_paths)}));
    const uniquePresent = values => unique(values.filter(nonempty));
    return {
      objective: input.goal, source: {path: input.source.path, sha256: input.source.sha256},
      node: {id: node.id, parent_id: node.parent_id, depth: node.depth, obligations: projectedObligations},
      tests: projectedTests, constraints: clone(input.constraints), interfaces: clone(input.interfaces),
      source_context: [...contexts.values()], artifact_interfaces: artifactInterfaces,
      evidence_basis: {
        test_kinds: uniquePresent(related.map(item => item.provenance?.kind)),
        test_examples: uniquePresent(related.map(item => item.provenance?.examples)),
        test_expectations: uniquePresent(related.map(item => item.provenance?.expectation_basis)),
        write_scopes: uniquePresent(local.map(item => item.write_scope_provenance?.basis)),
        dependencies: uniquePresent(local.map(item => item.dependency_note)),
        artifact_interfaces: uniquePresent((input.artifact_interfaces ?? []).filter(item => relevantPaths.has(item.path)).map(item => item.dependency_note)),
      },
      projection_contract: 'Every line ref uses the source path/hash above. test input_ref/expected_ref points to the exact value in node.obligations by obligation_id, field and index. Other test values are literal. Source clauses and resolved source_context are verbatim. Repeated provenance is collected in evidence_basis. Full source and provenance remain in the frozen input manifest.',
      external_dependencies: external.map(item => ({id: item.id, text: item.text, source_ref: clone(item.source_ref),
        inputs: item.inputs, outputs: item.outputs, depends_on: item.depends_on, owner_id: owners.get(item.id)})),
      shared_writes: node.write_scope.map(path => ({path, other_leaf_ids: leafNodes(tasks)
        .filter(other => other.id !== node.id && other.write_scope.includes(path)).map(other => other.id)})).filter(item => item.other_leaf_ids.length),
      policies: {same_file_writes: 'exclusive_file_lock_and_read_latest', max_concurrency: bounds.max_concurrency,
        dependency_basis: 'Declared depends_on edges only; unasserted dependencies do not establish independence.',
        test_status: 'source_backed_specifications_not_executed', execution_eligible: false},
      contract_version: contract.schema_version,
    };
  };
  const query = async (stage, node, criteria, state, contentHash) => {
    currentStage = stage;
    const keys = Object.keys(criteria);
    if (!keys.length) stop('NO_FEASIBLE_CHOICE');
    if (keys.length > 255) stop('CHOICE_OPTION_LIMIT', {option_count: keys.length});
    const request = {stage, node_id: node.id, state: {...clone(withResources(state, node)), node_content_hash: contentHash},
      questions: {[stage]: {type: 'choice', instructions: contract.questions[stage].instructions, criteria}}};
    const requestHash = hash(request);
    const provenance = {stage, request_sha256: requestHash, node_content_hash: contentHash, question_version: contract.schema_version};
    if (choices.has(requestHash)) {
      metrics.reused_choices++;
      const prior = choices.get(requestHash);
      await emit('planning_choice_reused', {...provenance, node_id: node.id, choice: prior.choice});
      return clone(prior);
    }
    if (keys.length === 1) {
      metrics.deterministic_choices++;
      const resourceForced = stage === 'child_count' && state.resource_forced_keep === true;
      const result = {choice: keys[0], provenance: {...provenance, method: 'deterministic_singleton', adequacy_assessed_by_model: false,
        ...(resourceForced ? {resource_forced_keep: true, resource_reasons: state.resource_reasons} : {})}};
      choices.set(requestHash, result);
      await emit('planning_choice_bypassed', {...result, node_id: node.id, reason: resourceForced ? 'resource_forced_keep' : 'single_feasible_choice'});
      return result;
    }
    if (metrics.decisions_attempted >= bounds.max_planning_decisions) stop('PLANNING_DECISION_LIMIT');
    if (metrics.known_input_tokens >= bounds.max_planning_input_tokens) stop('PLANNING_INPUT_TOKEN_LIMIT');
    await emit('planning_requested', {request_sha256: requestHash, request});
    metrics.decisions_attempted++;
    let response;
    try { response = await decide(clone(request)); }
    catch (error) {
      metrics.responses_without_usage++; metrics.input_tokens = null;
      const code = safeCode(error), uncertain = Boolean(error?.outcomeUncertain || error?.outcome_uncertain || error?.uncertain);
      if (!uncertain && ['PLANNING_WALL_LIMIT', 'PLANNING_PAYLOAD_LIMIT', 'PLANNING_INPUT_RESERVATION_LIMIT', 'PLANNING_DECISION_LIMIT'].includes(code)) stop(code);
      fail('DECISION_CALL_FAILED', {cause_code: code, outcome_uncertain: uncertain});
    }
    const tokens = response?.usage?.input_tokens;
    if (tokens !== undefined && (!Number.isSafeInteger(tokens) || tokens < 0)) fail('INVALID_PLANNING_USAGE');
    if (tokens === undefined) { metrics.responses_without_usage++; metrics.input_tokens = null; }
    else { metrics.known_input_tokens += tokens; if (metrics.input_tokens !== null) metrics.input_tokens += tokens; }
    await emit('planning_responded', {request_sha256: requestHash, node_id: node.id, stage, response});
    if (response?.uncertain || response?.outcome_uncertain || response?.outcomeUncertain) fail('UNCERTAIN_PROVIDER_OUTCOME', {outcome_uncertain: true});
    const answer = response?.answers?.[stage];
    if (!isObject(response?.answers) || Object.keys(response.answers).length !== 1
      || answer?.type !== 'choice' || typeof answer.choice !== 'string' || !keys.includes(answer.choice)) fail('INVALID_RECURSIVE_ANSWER');
    metrics.decisions_answered++;
    if (metrics.known_input_tokens >= bounds.max_planning_input_tokens) stop('PLANNING_INPUT_TOKEN_LIMIT');
    const result = {choice: answer.choice, provenance: {...provenance, method: 'typed_choice', provider_model: response.model ?? null, adequacy_assessed_by_model: stage === 'child_count'}};
    choices.set(requestHash, result);
    return result;
  };
  // All choices in this request share one provider invocation, usage record and provenance.
  const queryBatch = async (node, obligationIds, childIds, anchors, owners, state, contentHash) => {
    const stage = 'assign_obligation_batch'; currentStage = stage;
    const assignmentQuestions = Object.fromEntries(obligationIds.map((id, index) => [`assign_${index}`, id]));
    const criteria = Object.fromEntries(childIds.map(child => [child,
      `Anchor ${anchors[child]}; current obligations: ${[...owners].filter(([, owner]) => owner === child).map(([id]) => id).join(', ')}.`]));
    const questions = Object.fromEntries(Object.keys(assignmentQuestions).map(key => [key, {
      type: 'choice', instructions: `${contract.questions.assign_obligation.instructions} This question assigns obligation ${assignmentQuestions[key]}; see assignment_questions.`, criteria: clone(criteria),
    }]));
    const request = {stage, node_id: node.id, state: {...clone(withResources(state, node)), node_content_hash: contentHash,
      assignment_questions: assignmentQuestions, anchors: clone(anchors), current_owners: Object.fromEntries(owners)}, questions};
    const requestHash = hash(request);
    const provenance = {stage, request_sha256: requestHash, node_content_hash: contentHash, question_version: contract.schema_version};
    if (metrics.decisions_attempted >= bounds.max_planning_decisions) stop('PLANNING_DECISION_LIMIT');
    if (metrics.known_input_tokens >= bounds.max_planning_input_tokens) stop('PLANNING_INPUT_TOKEN_LIMIT');
    await emit('planning_requested', {request_sha256: requestHash, request});
    metrics.decisions_attempted++;
    let response;
    try { response = await decide(clone(request)); }
    catch (error) {
      metrics.responses_without_usage++; metrics.input_tokens = null;
      const code = safeCode(error), uncertain = Boolean(error?.outcomeUncertain || error?.outcome_uncertain || error?.uncertain);
      if (!uncertain && ['PLANNING_WALL_LIMIT', 'PLANNING_PAYLOAD_LIMIT', 'PLANNING_INPUT_RESERVATION_LIMIT', 'PLANNING_DECISION_LIMIT'].includes(code)) stop(code);
      fail('DECISION_CALL_FAILED', {cause_code: code, outcome_uncertain: uncertain});
    }
    const tokens = response?.usage?.input_tokens;
    if (tokens !== undefined && (!Number.isSafeInteger(tokens) || tokens < 0)) fail('INVALID_PLANNING_USAGE');
    if (tokens === undefined) { metrics.responses_without_usage++; metrics.input_tokens = null; }
    else { metrics.known_input_tokens += tokens; if (metrics.input_tokens !== null) metrics.input_tokens += tokens; }
    await emit('planning_responded', {request_sha256: requestHash, node_id: node.id, stage, response});
    if (response?.uncertain || response?.outcome_uncertain || response?.outcomeUncertain) fail('UNCERTAIN_PROVIDER_OUTCOME', {outcome_uncertain: true});
    if (!isObject(response?.answers) || !sameSet(Object.keys(response.answers), Object.keys(questions))
      || Object.entries(questions).some(([key, question]) => response.answers[key]?.type !== 'choice'
        || typeof response.answers[key].choice !== 'string' || !Object.hasOwn(question.criteria, response.answers[key].choice))) fail('INVALID_RECURSIVE_ANSWER');
    metrics.decisions_answered++;
    if (metrics.known_input_tokens >= bounds.max_planning_input_tokens) stop('PLANNING_INPUT_TOKEN_LIMIT');
    return {answers: clone(response.answers), assignment_questions: assignmentQuestions,
      provenance: {...provenance, method: 'typed_choice_batch', provider_model: response.model ?? null, adequacy_assessed_by_model: false}};
  };
  try {
    await emit('planning_started', {source: {path: input.source.path, sha256: input.source.sha256}, limits: bounds,
      contract_version: contract.schema_version, contract_sha256: metrics.contract_sha256});
    const queue = ['node_0'];
    while (queue.length) {
      const nodeId = queue.shift(), node = tasks.find(item => item.id === nodeId);
      currentNode = node.id; currentStage = 'preparation';
      const gaps = nodeGaps(input, node);
      if (gaps.length) {
        node.planning_status = 'needs_spec'; node.gaps = gaps;
        issues.push({code: 'NEEDS_SPEC', node_id: node.id, gaps});
        await emit('planning_gap', {node_id: node.id, gaps});
        continue;
      }
      const state = localState(node), contentHash = hash({state, contract, resource_policy: bounds});
      if (reviewed.has(contentHash)) stop('REPEATED_NODE_CONTENT', {node_content_hash: contentHash});
      const otherLeaves = leafNodes(tasks).filter(item => item.id !== node.id), fixedOwners = new Map(otherLeaves.flatMap(item => item.obligation_ids.map(id => [id, item.id])));
      const feasible = (partial, childIds) => {
        const result = feasibleOwnership(input, node.obligation_ids, fixedOwners, partial, childIds, otherLeaves.map(item => item.id), bounds.max_feasibility_states);
        metrics.feasibility_states += result.states;
        if (result.status === 'unknown') stop('FEASIBILITY_SEARCH_LIMIT', {states: result.states});
        return result.status === 'feasible';
      };
      const counts = {};
      const naturalMax = Math.min(5, node.obligation_ids.length);
      const maxCount = respectResourceOptions ? Math.min(naturalMax,
        node.depth >= bounds.max_depth ? 1 : bounds.max_leaves - otherLeaves.length) : naturalMax;
      for (let count = 1; count <= maxCount; count++) {
        const ids = Array.from({length: count}, (_, index) => `${node.id}.${index + 1}`);
        if (feasible(new Map(), ids)) counts[String(count)] = contract.questions.child_count.criteria[String(count)];
      }
      const countState = respectResourceOptions && naturalMax > 1 && maxCount === 1
        ? {...state, resource_forced_keep: true, resource_reasons: [
          ...(node.depth >= bounds.max_depth ? ['max_depth'] : []),
          ...(bounds.max_leaves - otherLeaves.length <= 1 ? ['max_leaves'] : []),
        ]} : state;
      const decision = await query('child_count', node, counts, countState, contentHash), count = Number(decision.choice);
      reviewed.add(contentHash); metrics.reviewed_nodes++;
      if (count === 1) {
        await emit('planning_leaf_reviewed', {node_id: node.id, review: decision, execution_eligible: false});
        node.planning_status = 'ready_specification_only'; node.review = decision;
        continue;
      }
      if (node.depth >= bounds.max_depth) stop('PLANNING_DEPTH_LIMIT', {selected_child_count: count});
      if (otherLeaves.length + count > bounds.max_leaves) stop('PLANNING_LEAF_LIMIT', {selected_child_count: count});
      const childIds = Array.from({length: count}, (_, index) => `${node.id}.${index + 1}`), owners = new Map(), anchors = {};
      const allocationDecisions = [];
      for (const child of childIds) {
        const criteria = {};
        for (const obligation of input.obligations.filter(item => node.obligation_ids.includes(item.id) && !owners.has(item.id))) {
          const proposed = new Map(owners); proposed.set(obligation.id, child);
          if (feasible(proposed, childIds)) Object.defineProperty(criteria, obligation.id, {value: `${obligation.id}: ${obligation.title ?? 'Source obligation in node.obligations'}.`, enumerable: true});
        }
        const selected = await query('anchor', node, criteria, {...state, child_id: child, anchors: clone(anchors), current_owners: Object.fromEntries(owners)}, contentHash);
        owners.set(selected.choice, child); anchors[child] = selected.choice; allocationDecisions.push(selected);
      }
      const unassigned = node.obligation_ids.filter(id => !owners.has(id));
      if (batchEnabled) {
        for (let offset = 0; offset < unassigned.length; offset += assignmentBatchSize) {
          const selected = await queryBatch(node, unassigned.slice(offset, offset + assignmentBatchSize), childIds, anchors, owners, state, contentHash);
          // queryBatch validates the entire response before ownership changes become visible.
          for (const [key, id] of Object.entries(selected.assignment_questions)) owners.set(id, selected.answers[key].choice);
          allocationDecisions.push(selected);
        }
      } else for (const obligationId of unassigned) {
        const criteria = {};
        for (const child of childIds) {
          const proposed = new Map(owners); proposed.set(obligationId, child);
          if (feasible(proposed, childIds)) criteria[child] = `Anchor ${anchors[child]}; current obligations: ${[...owners].filter(([, owner]) => owner === child).map(([id]) => id).join(', ')}.`;
        }
        const selected = await query('assign_obligation', node, criteria, {...state, obligation_id: obligationId, anchors: clone(anchors), current_owners: Object.fromEntries(owners)}, contentHash);
        owners.set(obligationId, selected.choice); allocationDecisions.push(selected);
      }
      const candidate = clone(tasks), parent = candidate.find(item => item.id === node.id);
      parent.planning_status = 'aggregate'; parent.children = childIds; parent.review = decision;
      parent.partition_provenance = {anchors, decisions: allocationDecisions, method: batchEnabled ? 'distinct_anchors_then_batched_ownership' : 'distinct_anchors_then_sequential_ownership'};
      for (const id of childIds) candidate.push(makeTask(input, id, parent.id, parent.depth + 1, node.obligation_ids.filter(obligationId => owners.get(obligationId) === id)));
      const candidateTests = refreshLinks(input, candidate);
      validateRecursivePlan({input, tasks: candidate, tests: candidateTests});
      // Journal first: failed recording cannot publish an unrecorded replacement.
      await emit('planning_split_validated', {node_id: node.id, children: childIds, anchors, owners: Object.fromEntries(owners),
        plan_sha256: hash({tasks: candidate, tests: candidateTests})});
      tasks = candidate; tests = candidateTests; metrics.committed_splits++; queue.push(...childIds);
    }
    if (leafNodes(tasks).some(task => task.planning_status === 'needs_spec')) status = 'needs_spec';
  } catch (error) {
    status = error?.planning_stop ? 'partial' : 'failed';
    const entry = {code: safeCode(error), node_id: currentNode, stage: currentStage, retry_performed: false};
    for (const key of ['cause_code', 'outcome_uncertain', 'selected_child_count', 'states', 'option_count']) if (error?.[key] !== undefined) entry[key] = error[key];
    issues.push(entry);
    if (error?.code !== 'RECORD_FAILED') {
      try { await emit('planning_stopped', {status, issue: entry, plan_sha256: hash({tasks, tests})}); }
      catch { issues.push({code: 'RECORD_FAILED', node_id: currentNode, stage: currentStage}); status = 'failed'; }
    }
  }
  validateRecursivePlan({input, tasks, tests});
  metrics.leaf_count = leafNodes(tasks).length;
  metrics.ready_leaf_count = leafNodes(tasks).filter(task => task.planning_status === 'ready_specification_only').length;
  metrics.max_depth_reached = Math.max(...tasks.map(task => task.depth));
  metrics.wall_ms = performance.now() - started;
  metrics.events_recorded = sequence - issues.filter(issue => issue.code === 'RECORD_FAILED').length;
  return {status, tasks, tests, metrics, issues};
}
