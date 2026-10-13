import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareDecision} from '../client.mjs';
import {planAdaptiveDag, validateAdaptiveCatalog} from './adaptive-dag-planner.mjs';
import {createAdaptiveDecompositionBalancer} from './adaptive-decomposition-balancing.mjs';

// D078: unit-level dependency direction lets code keep producers apart from consumers and cap plan depth.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-layered-decomposition.v1.json';
export const LAYERED_CONTRACTS = Object.freeze({v1: CONTRACT_PATH, v2: 'docs/orchestration/contracts/adaptive-layered-decomposition.v2.json'});
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]);

export function loadLayeredContract(path = CONTRACT_PATH) {
  const raw = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), contract = JSON.parse(raw);
  const choices = Object.keys(contract.question?.criteria_templates ?? {}), {policy} = contract;
  if (!['adaptive-layered-decomposition/v1', 'adaptive-layered-decomposition/v2'].includes(contract.schema_version)
    || contract.question.type !== 'choice' || !(policy?.questions_per_request <= 64) || !(policy.target_depth >= 1)
    || ![...Object.keys(policy.edge_choices ?? {}), ...(policy.coupling_choices ?? []), ...(policy.together_choices ?? [])]
      .every(choice => choices.includes(choice))) fail('ADAPTIVE_LAYERED_CONTRACT_INVALID');
  return {...contract, choices, source: {path, sha256: hash(raw), version: contract.version}};
}

/** Every unit pair as one choice question, split into near-equal requests. */
export function buildUnitRelationRequests({catalog, requirement_descriptions, max_concurrency, limits, contract = loadLayeredContract()}) {
  const balancer = createAdaptiveDecompositionBalancer({catalog, max_concurrency, limits});
  const ids = catalog.units.map(unit => unit.id), root = {id: 'n0', parent_id: null, depth: 0, unit_ids: ids};
  const {literal_interface_references} = balancer.splitState({node: root, tree: [root], maximum: 2, frontier: 1, criteria: {}});
  const paths = Object.fromEntries(catalog.units.map(unit => [unit.id,
    `[${unit.artifact_ids.flatMap(id => catalog.artifacts.find(artifact => artifact.id === id).paths).join(', ')}]`]));
  const state = {schema_version: 'adaptive-unit-relation-state/v1', source_sha256: catalog.source_sha256,
    catalog_sha256: hash(JSON.stringify(catalog)), units: catalog.units, artifacts: catalog.artifacts, evidence: catalog.evidence,
    requirement_descriptions, literal_interface_references,
    unit_relation_question: contract.question.instructions,
    execution_context: {max_concurrency, implementation_invocation: 'one fresh session per leaf',
      grouping: 'Code groups units from these answers; producers run before their consumers.'}};
  const {question} = contract;
  const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map(b => ({a, b, question_id: `${question.id_prefix}.${a}.${b}`})));
  const chunks = Math.ceil(pairs.length / contract.policy.questions_per_request), size = Math.ceil(pairs.length / chunks);
  return Array.from({length: chunks}, (_, index) => {
    const batch = pairs.slice(index * size, (index + 1) * size);
    const questions = Object.fromEntries(batch.map(pair => {
      const values = {...pair, a_paths: paths[pair.a], b_paths: paths[pair.b]};
      return [pair.question_id, {type: 'choice', instructions: fill(question.call_template, values),
        criteria: Object.fromEntries(contract.choices.map(choice => [choice, fill(question.criteria_templates[choice], values)]))}];
    }));
    return {pairs: batch, request: prepareDecision({model: 'jev-latest', state: {...state, batch_index: index, batch_count: chunks}, questions}).body};
  });
}

/** Pair answers -> {choice, coupling, edge, together}; coupling uses probabilities when Jev supplied them. */
export function readUnitRelations(built, responses, contract = loadLayeredContract()) {
  const {edge_choices: edges, coupling_choices: coupled, together_choices: together} = contract.policy;
  const relations = [];
  for (const [index, {pairs}] of built.entries()) {
    const answers = responses[index]?.answers ?? {};
    if (Object.keys(answers).length !== pairs.length) fail('ADAPTIVE_LAYERED_ANSWER_INVALID');
    for (const pair of pairs) {
      const answer = answers[pair.question_id];
      if (answer?.type !== 'choice' || !contract.choices.includes(answer.choice)) fail('ADAPTIVE_LAYERED_ANSWER_INVALID', {question_id: pair.question_id});
      const p = answer.probabilities;
      const coupling = p ? coupled.reduce((sum, choice) => sum + (p[choice] ?? 0), 0) : coupled.includes(answer.choice) ? 1 : 0;
      const side = edges[answer.choice];
      relations.push({a: pair.a, b: pair.b, choice: answer.choice, coupling,
        edge: side === 'a' ? [pair.a, pair.b] : side === 'b' ? [pair.b, pair.a] : null, together: together.includes(answer.choice)});
    }
  }
  return relations;
}

/** Cluster graph helpers over consumer -> producer unit edges. */
function graph(clusters, edges) {
  const of = new Map(clusters.flatMap((units, index) => units.map(unit => [unit, index])));
  const out = clusters.map(() => new Set());
  for (const [consumer, producer] of edges) if (of.get(consumer) !== of.get(producer)) out[of.get(consumer)].add(of.get(producer));
  const down = [], state = [];
  const visit = node => {
    if (state[node] === 1) return null;
    if (state[node] === 2) return down[node];
    state[node] = 1; let best = 0;
    for (const next of out[node]) { const value = visit(next); if (value === null) return null; best = Math.max(best, value); }
    state[node] = 2; return (down[node] = best + 1);
  };
  for (let node = 0; node < clusters.length; node++) if (visit(node) === null) return {acyclic: false};
  const up = clusters.map(() => 1);
  for (const node of [...down.keys()].sort((x, y) => down[y] - down[x])) for (const next of out[node]) up[next] = Math.max(up[next], up[node] + 1);
  return {acyclic: true, out, down, up, depth: Math.max(...down)};
}

/** Forced merges, depth repair, coupling merges and target-count merges under capacity. ponytail: O(n^4) worst case at 30 units. */
export function layeredClusters({unit_ids, relations, overload, threshold, targetCount, targetDepth, maxLeaves, maxRelationPairs}) {
  const order = unit => unit_ids.indexOf(unit), merges = [];
  const edges = relations.flatMap(row => row.edge ? [row.edge] : []);
  const coupling = new Map(relations.map(row => [[row.a, row.b].sort().join('|'), row.coupling]));
  let clusters = unit_ids.map(unit => [unit]);
  const sort = list => list.map(units => [...units].sort((x, y) => order(x) - order(y))).sort((x, y) => order(x[0]) - order(y[0]));
  const join = (i, j, reason, score = null) => {
    merges.push({units: [clusters[i], clusters[j]], reason, coupling: score});
    clusters = sort([...clusters.filter((_, k) => k !== i && k !== j), [...clusters[i], ...clusters[j]]]);
  };
  const average = (left, right) => {
    let sum = 0;
    for (const a of left) for (const b of right) sum += coupling.get([a, b].sort().join('|')) ?? 0;
    return sum / (left.length * right.length);
  };
  // 1. unknown pairs and cycles must share a leaf.
  for (const row of relations.filter(item => item.together)) {
    const i = clusters.findIndex(units => units.includes(row.a)), j = clusters.findIndex(units => units.includes(row.b));
    if (i !== j) { if (overload([...clusters[i], ...clusters[j]]).length) fail('ADAPTIVE_LAYERED_FORCED_MERGE_CAPACITY'); join(i, j, 'unknown'); }
  }
  for (let current = graph(clusters, edges); !current.acyclic; current = graph(clusters, edges)) {
    const pair = clusters.flatMap((_, i) => clusters.map((__, j) => [i, j])).find(([i, j]) => i < j
      && graph(sort([...clusters.filter((_, k) => k !== i && k !== j), [...clusters[i], ...clusters[j]]]), edges).acyclic
      && !overload([...clusters[i], ...clusters[j]]).length);
    if (!pair) fail('ADAPTIVE_LAYERED_CYCLE_UNRESOLVED');
    join(pair[0], pair[1], 'cycle');
  }
  const candidate = (i, j) => {
    if (overload([...clusters[i], ...clusters[j]]).length) return null;
    const next = graph(sort([...clusters.filter((_, k) => k !== i && k !== j), [...clusters[i], ...clusters[j]]]), edges);
    return next.acyclic ? {i, j, depth: next.depth, score: average(clusters[i], clusters[j])} : null;
  };
  const best = filter => {
    let top = null;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const option = candidate(i, j);
      if (option && filter(option) && (!top || option.score > top.score)) top = option;
    }
    return top;
  };
  // 2. depth repair along longest paths.
  for (let g = graph(clusters, edges); g.depth > targetDepth; g = graph(clusters, edges)) {
    const onPath = (c, p) => g.out[c].has(p) && g.up[c] + g.down[p] === g.depth;
    // Merging one of several equally long paths may keep depth; each merge still removes a cluster, so the loop ends.
    const top = best(option => (onPath(option.i, option.j) || onPath(option.j, option.i)) && option.depth <= g.depth);
    if (!top) break;
    join(top.i, top.j, 'depth', top.score);
  }
  const limit = () => Math.max(targetDepth, graph(clusters, edges).depth);
  // 3. coupling, then 4. target count; neither may raise depth above max(target, current).
  for (let top = best(option => option.score >= threshold && option.depth <= limit()); top; top = best(option => option.score >= threshold && option.depth <= limit()))
    join(top.i, top.j, 'coupling', top.score);
  for (let top = clusters.length > targetCount ? best(option => option.depth <= limit()) : null; top;
    top = clusters.length > targetCount ? best(option => option.depth <= limit()) : null) join(top.i, top.j, 'target_count', top.score);
  while (clusters.length > maxLeaves || clusters.length * (clusters.length - 1) / 2 > maxRelationPairs) {
    const top = best(() => true);
    if (!top) fail('ADAPTIVE_LAYERED_CAPACITY_INFEASIBLE');
    join(top.i, top.j, 'hard_limit', top.score);
  }
  if (clusters.length < 2) fail('ADAPTIVE_LAYERED_SINGLE_CLUSTER');
  const final = graph(clusters, edges);
  return {clusters, merges, edges, depth: final.depth, depth_target_met: final.depth <= targetDepth};
}

/** Scripted root split, keep children, and code-derived leaf relations; the planner then compiles the DAG. */
function scriptedDecider(clusters, edges) {
  const childOf = new Map(clusters.flatMap((units, index) => units.map(unit => [unit, index + 1])));
  const requires = (consumers, producers) => edges.some(([c, p]) => consumers.includes(c) && producers.includes(p));
  return async request => {
    const leaves = new Map((request.state.leaves ?? []).map(leaf => [leaf.id, leaf.unit_ids]));
    const answers = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
      let choice;
      if (id.startsWith('adaptive.split_count')) choice = request.state.scope === 'root' ? `split_${clusters.length}` : 'keep';
      else if (id.startsWith('adaptive.membership')) choice = `child_${childOf.get(request.state.unit_id)}`;
      else {
        const pair = request.state.pairs.find(row => row.question_id === id), a = leaves.get(pair.task_a_id), b = leaves.get(pair.task_b_id);
        choice = requires(a, b) ? 'a_requires_b' : requires(b, a) ? 'b_requires_a' : 'no_dependency';
      }
      if (!Object.hasOwn(question.criteria, choice)) fail('ADAPTIVE_LAYERED_SCRIPT_UNAVAILABLE', {question_id: id, choice});
      return [id, {type: 'choice', choice}];
    }));
    return {answers, selection_basis: 'adaptive-layered-v1-code'};
  };
}

export async function planLayeredDag({decide, record = async () => {}, max_concurrency = 2, contractPath, ...input}) {
  const contract = loadLayeredContract(contractPath);
  const catalog = validateAdaptiveCatalog({catalog: input.catalog, source: input.source, requirement_ids: input.requirement_ids, limits: input.limits});
  const built = buildUnitRelationRequests({catalog, requirement_descriptions: input.requirement_descriptions ?? [], max_concurrency, limits: input.limits, contract});
  const responses = [];
  for (const [index, {request}] of built.entries()) {
    await record({event: 'adaptive_unit_relations_requested', batch_index: index, question_count: Object.keys(request.questions).length});
    responses.push(await decide(request, {stage: 'split', decision_id: `adaptive-unit-relations-${index + 1}`}));
  }
  const relations = readUnitRelations(built, responses, contract);
  const balancer = createAdaptiveDecompositionBalancer({catalog, max_concurrency, limits: input.limits});
  const layered = layeredClusters({unit_ids: catalog.units.map(unit => unit.id), relations, overload: balancer.overload,
    threshold: contract.policy.merge_threshold, targetCount: balancer.policy.target_leaf_count, targetDepth: contract.policy.target_depth,
    maxLeaves: input.limits.max_leaves, maxRelationPairs: input.limits.max_relation_pairs});
  await record({event: 'adaptive_layered_clustered', clusters: layered.clusters, depth: layered.depth, merges: layered.merges});
  const planning = await planAdaptiveDag({...input, decompositionPolicy: undefined, catalog, max_concurrency,
    decide: scriptedDecider(layered.clusters, layered.edges), record});
  return {...planning, layered: {schema_version: 'adaptive-layered-report/v1', contract_source: contract.source,
    leaf_capacity: balancer.policy.leaf_capacity, target_leaf_count: balancer.policy.target_leaf_count, provider_requests: built.length,
    relations, ...layered}};
}
