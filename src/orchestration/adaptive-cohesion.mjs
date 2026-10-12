import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareDecision} from '../client.mjs';
import {planAdaptiveDag, validateAdaptiveCatalog} from './adaptive-dag-planner.mjs';
import {createAdaptiveDecompositionBalancer} from './adaptive-decomposition-balancing.mjs';

// D077: pairwise cohesion noul questions replace sequential split_count/membership choices.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-cohesion.v1.json';
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => values[key]);

export function loadCohesionContract() {
  const raw = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url), 'utf8'), contract = JSON.parse(raw);
  const {policy, question} = contract;
  if (contract.schema_version !== 'adaptive-cohesion/v1' || question?.type !== 'noul' || !(policy?.questions_per_request <= 64)
    || !(policy.merge_threshold > 0 && policy.merge_threshold < 1)) fail('ADAPTIVE_COHESION_CONTRACT_INVALID');
  return {...contract, source: {path: CONTRACT_PATH, sha256: hash(raw), version: contract.version}};
}

const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Every unit pair of the root scope, split into near-equal requests of at most questions_per_request. */
export function buildCohesionRequests({catalog, requirement_descriptions, max_concurrency, limits, contract = loadCohesionContract()}) {
  const balancer = createAdaptiveDecompositionBalancer({catalog, max_concurrency, limits});
  const ids = catalog.units.map(unit => unit.id), root = {id: 'n0', parent_id: null, depth: 0, unit_ids: ids};
  const {literal_interface_references} = balancer.splitState({node: root, tree: [root], maximum: 2, frontier: 1, criteria: {}});
  const {question} = contract;
  const state = {schema_version: 'adaptive-cohesion-state/v1', source_sha256: catalog.source_sha256,
    catalog_sha256: hash(JSON.stringify(catalog)), units: catalog.units, artifacts: catalog.artifacts, evidence: catalog.evidence,
    requirement_descriptions, literal_interface_references,
    cohesion_question: {statement: question.statement, true_when: question.true_when, false_when: question.false_when,
      evidence_rule: question.evidence_rule},
    execution_context: {max_concurrency, implementation_invocation: 'one fresh session per leaf',
      grouping: 'Code groups units from these answers within fixed capacity limits; this question does not choose a count.'}};
  const pairs = ids.flatMap((a, i) => ids.slice(i + 1).map(b => ({a, b, question_id: `${question.id_prefix}.${a}.${b}`})));
  const chunks = Math.ceil(pairs.length / contract.policy.questions_per_request), size = Math.ceil(pairs.length / chunks);
  return Array.from({length: chunks}, (_, index) => {
    const batch = pairs.slice(index * size, (index + 1) * size);
    const questions = Object.fromEntries(batch.map(pair => [pair.question_id,
      {type: 'noul', instructions: fill(question.call_template, pair)}]));
    return {pairs: batch, request: prepareDecision({model: 'jev-latest', state: {...state, batch_index: index, batch_count: chunks}, questions}).body};
  });
}

/** Deterministic average-linkage merge under capacity. ponytail: O(n^3) scan, fine for the 30-unit cap. */
export function clusterUnits({unit_ids, affinity, overload, threshold, targetCount = Infinity, maxLeaves, maxRelationPairs}) {
  let clusters = unit_ids.map(id => [id]);
  const merges = [];
  const average = (left, right) => {
    let sum = 0;
    for (const a of left) for (const b of right) sum += affinity(a, b);
    return sum / (left.length * right.length);
  };
  const best = () => {
    let top = null;
    for (let i = 0; i < clusters.length; i++) for (let j = i + 1; j < clusters.length; j++) {
      const merged = [...clusters[i], ...clusters[j]];
      if (overload(merged).length) continue;
      const score = average(clusters[i], clusters[j]);
      if (!top || score > top.score) top = {i, j, score};
    }
    return top;
  };
  const merge = (top, reason) => {
    merges.push({units: [[...clusters[top.i]], [...clusters[top.j]]], average: top.score, reason});
    const merged = [...clusters[top.i], ...clusters[top.j]].sort((a, b) => unit_ids.indexOf(a) - unit_ids.indexOf(b));
    clusters = clusters.filter((_, index) => index !== top.i && index !== top.j).concat([merged])
      .sort((a, b) => unit_ids.indexOf(a[0]) - unit_ids.indexOf(b[0]));
  };
  for (let top = best(); top && top.score >= threshold; top = best()) merge(top, 'cohesion');
  for (let top = clusters.length > targetCount ? best() : null; top; top = clusters.length > targetCount ? best() : null) merge(top, 'target_count');
  const tooMany = () => clusters.length > maxLeaves || clusters.length * (clusters.length - 1) / 2 > maxRelationPairs;
  while (tooMany()) {
    const top = best();
    if (!top) fail('ADAPTIVE_COHESION_CAPACITY_INFEASIBLE');
    merge(top, 'hard_limit');
  }
  if (clusters.length < 2) fail('ADAPTIVE_COHESION_SINGLE_CLUSTER');
  return {clusters, merges};
}

function readAffinities(built, responses) {
  const values = new Map();
  for (const [index, {pairs, request}] of built.entries()) {
    const answers = responses[index]?.answers;
    for (const pair of pairs) {
      const answer = answers?.[pair.question_id];
      if (answer?.type !== 'noul' || !Number.isFinite(answer.noul) || answer.noul < 0 || answer.noul > 1
        || !Object.hasOwn(request.questions, pair.question_id)) fail('ADAPTIVE_COHESION_ANSWER_INVALID');
      values.set(pairKey(pair.a, pair.b), answer.noul);
    }
    if (Object.keys(answers).length !== pairs.length) fail('ADAPTIVE_COHESION_ANSWER_INVALID');
  }
  return values;
}

/** Scripted root split so the unchanged planner builds tree, relations and plan from the clusters. */
function scriptedDecider(clusters, decide) {
  const childOf = new Map(clusters.flatMap((units, index) => units.map(unit => [unit, index + 1])));
  return async (request, meta) => {
    const ids = Object.keys(request.questions);
    if (!ids.every(id => id.startsWith('adaptive.split_count') || id.startsWith('adaptive.membership'))) return decide(request, meta);
    const answers = Object.fromEntries(ids.map(id => {
      const criteria = request.questions[id].criteria;
      const choice = id.startsWith('adaptive.split_count')
        ? (request.state.scope === 'root' ? `split_${clusters.length}` : 'keep')
        : `child_${childOf.get(request.state.unit_id)}`;
      if (!Object.hasOwn(criteria, choice)) fail('ADAPTIVE_COHESION_SCRIPT_UNAVAILABLE', {question_id: id, choice});
      return [id, {type: 'choice', choice}];
    }));
    return {answers, selection_basis: 'adaptive-cohesion-v1-code'};
  };
}

/** Cohesion requests, code clustering, then the existing planner for relations and plan compilation. */
export async function planCohesionDag({decide, record = async () => {}, max_concurrency = 2, ...input}) {
  const contract = loadCohesionContract();
  const catalog = validateAdaptiveCatalog({catalog: input.catalog, source: input.source, requirement_ids: input.requirement_ids, limits: input.limits});
  const built = buildCohesionRequests({catalog, requirement_descriptions: input.requirement_descriptions ?? [], max_concurrency, limits: input.limits, contract});
  const responses = [];
  for (const [index, {request}] of built.entries()) {
    await record({event: 'adaptive_cohesion_requested', batch_index: index, question_count: Object.keys(request.questions).length});
    responses.push(await decide(request, {stage: 'split', decision_id: `adaptive-cohesion-${index + 1}`}));
  }
  const affinities = readAffinities(built, responses);
  const balancer = createAdaptiveDecompositionBalancer({catalog, max_concurrency, limits: input.limits});
  const {clusters, merges} = clusterUnits({unit_ids: catalog.units.map(unit => unit.id), affinity: (a, b) => affinities.get(pairKey(a, b)),
    overload: balancer.overload, threshold: contract.policy.merge_threshold, targetCount: balancer.policy.target_leaf_count,
    maxLeaves: input.limits.max_leaves,
    maxRelationPairs: input.limits.max_relation_pairs});
  const report = {schema_version: 'adaptive-cohesion-report/v1', contract_source: contract.source, leaf_capacity: balancer.policy.leaf_capacity,
    target_leaf_count: balancer.policy.target_leaf_count,
    pair_count: affinities.size, provider_requests: built.length, affinities: Object.fromEntries(affinities), clusters, merges};
  await record({event: 'adaptive_cohesion_clustered', clusters, merges});
  // balanced-v2 membership caps would hide cluster children; capacity is already enforced by clusterUnits.
  const planning = await planAdaptiveDag({...input, decompositionPolicy: undefined, catalog, max_concurrency,
    decide: scriptedDecider(clusters, decide), record});
  return {...planning, cohesion: report};
}
