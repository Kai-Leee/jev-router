import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';

const CONTRACT_URL = new URL('../../docs/orchestration/contracts/adaptive-decomposition.v2.json', import.meta.url);
const dimensions = ['units', 'requirements', 'artifacts', 'paths'];
const unique = values => [...new Set(values)];
const hash = value => createHash('sha256').update(value).digest('hex');
const clone = value => structuredClone(value);
const fail = code => { throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function loadAdaptiveDecompositionContract() {
  const raw = readFileSync(CONTRACT_URL, 'utf8'), contract = JSON.parse(raw);
  if (contract.schema_version !== 'adaptive-decomposition/v2' || contract.id !== 'balanced-v2'
    || contract.policy?.target_execution_waves !== 2
    || JSON.stringify(Object.keys(contract.questions).sort()) !== JSON.stringify(['membership', 'split_count'])) fail('ADAPTIVE_BALANCE_CONTRACT_INVALID');
  for (const [kind, question] of Object.entries(contract.questions)) {
    if (question.id !== `adaptive.${kind}.v2` || question.type !== 'choice' || !question.instructions?.trim()) fail('ADAPTIVE_BALANCE_CONTRACT_INVALID');
  }
  return {...contract, source: {path: fileURLToPath(CONTRACT_URL), sha256: hash(raw), version: contract.version}};
}

/** Remove only a verified duplicate; every referenced string remains inline. */
export function projectBalancedRelationState(input) {
  if (!Array.isArray(input?.units) || !Array.isArray(input?.leaves)
    || unique(input.units.map(unit => unit.id)).length !== input.units.length
    || Object.hasOwn(input, 'leaf_interface_resolution')) fail('ADAPTIVE_BALANCE_RELATION_PROJECTION_INVALID');
  const state = clone(input), omitted = [];
  for (const [index, leaf] of state.leaves.entries()) {
    if (!Array.isArray(leaf.unit_ids) || unique(leaf.unit_ids).length !== leaf.unit_ids.length) fail('ADAPTIVE_BALANCE_RELATION_PROJECTION_INVALID');
    const selected = state.units.filter(unit => leaf.unit_ids.includes(unit.id));
    const rebuilt = selected.map(unit => ({unit_id: unit.id, title: unit.title, interface: unit.interface}));
    if (selected.length !== leaf.unit_ids.length || !isDeepStrictEqual(rebuilt, leaf.interfaces)) fail('ADAPTIVE_BALANCE_RELATION_PROJECTION_INVALID');
    omitted.push({pointer: `/leaves/${index}/interfaces`, sha256: hash(JSON.stringify(leaf.interfaces)),
      utf8_bytes: Buffer.byteLength(JSON.stringify(leaf.interfaces)),
      resolution: 'Filter state.units in its existing order by this leaf.unit_ids, mapping {unit_id:id,title,interface}.'});
    delete leaf.interfaces;
  }
  state.leaf_interface_resolution = 'For each leaf, reconstruct interfaces by filtering the inline state.units in its existing order to IDs in leaf.unit_ids, then mapping each unit to {unit_id:unit.id,title:unit.title,interface:unit.interface}. Exact original strings are inline; no external retrieval or inference is required.';
  return {state, report: {schema_version: 'adaptive-balanced-relation-projection/v1',
    original_bytes: Buffer.byteLength(JSON.stringify(input)), projected_bytes: Buffer.byteLength(JSON.stringify(state)),
    original_sha256: hash(JSON.stringify(input)), projected_sha256: hash(JSON.stringify(state)), omitted,
    original_requirements_interfaces_evidence_retained: true, model_input_tokens: null}};
}

/** Structural accounting over an already validated catalog; it invents no runtime edges. */
export function createAdaptiveDecompositionBalancer({catalog, max_concurrency, limits}) {
  const contract = loadAdaptiveDecompositionContract();
  const unitById = new Map(catalog.units.map(unit => [unit.id, unit]));
  const artifactById = new Map(catalog.artifacts.map(artifact => [artifact.id, artifact]));
  const load = unitIds => {
    if (unique(unitIds).length !== unitIds.length || unitIds.some(id => !unitById.has(id))) fail('ADAPTIVE_BALANCE_UNIT_REFERENCE');
    const units = unitIds.map(id => unitById.get(id));
    const artifactIds = units.flatMap(unit => unit.artifact_ids);
    return {units: units.length, requirements: units.flatMap(unit => unit.requirement_ids).length,
      artifacts: artifactIds.length, paths: artifactIds.flatMap(id => artifactById.get(id).paths).length};
  };
  const total = load(catalog.units.map(unit => unit.id));
  const targetLeafCount = Math.min(total.units, limits.max_leaves, max_concurrency * contract.policy.target_execution_waves);
  if (!Number.isSafeInteger(targetLeafCount) || targetLeafCount < 1) fail('ADAPTIVE_BALANCE_CAPACITY_INVALID');
  const atomicLoads = catalog.units.map(unit => ({unit_id: unit.id, ...load([unit.id])}));
  const largestAtomic = Object.fromEntries(dimensions.map(key => [key, Math.max(...atomicLoads.map(value => value[key]))]));
  const capacities = Object.fromEntries(dimensions.map(key => [key, Math.max(Math.ceil(total[key] / targetLeafCount), largestAtomic[key])]));
  const references = [];
  for (const consumer of catalog.units) for (const producer of catalog.units) {
    if (consumer.id === producer.id) continue;
    const literals = unique(producer.artifact_ids.flatMap(id => artifactById.get(id).paths).flatMap(path => {
      const module = path.endsWith('.py') && !path.endsWith('/__init__.py') ? path.slice(0, -3).replaceAll('/', '.') : null;
      return module ? [path, module] : [path];
    })).filter(value => new RegExp(`(^|[^A-Za-z0-9_])${escape(value)}($|[^A-Za-z0-9_])`).test(consumer.interface));
    if (literals.length) references.push({from_unit_id: consumer.id, to_unit_id: producer.id, literals,
      evidence_field: `${consumer.id}.interface`, dependency_status: 'unconfirmed'});
  }
  const policy = {id: contract.id, source: contract.source, basis: contract.policy.capacity_basis,
    target_execution_waves: contract.policy.target_execution_waves, target_leaf_count: targetLeafCount,
    catalog_totals: total, largest_atomic_unit: largestAtomic, leaf_capacity: capacities,
    configured_depth_kind: 'soft_for_capacity_escape_only', hard_limits: ['max_leaves', 'max_nodes', 'max_relation_pairs', 'max_decisions'],
    dependency_hint_basis: contract.policy.dependency_hints};
  const overload = unitIds => {
    const value = load(unitIds);
    return dimensions.filter(key => value[key] > capacities[key]);
  };
  const scope = unitIds => ({unit_ids: [...unitIds], workload: load(unitIds), exceeded_dimensions: overload(unitIds),
    atomic: unitIds.length === 1,
    external_referenced_unit_ids: unique(references.filter(ref => unitIds.includes(ref.from_unit_id) && !unitIds.includes(ref.to_unit_id)).map(ref => ref.to_unit_id)),
    external_referring_unit_ids: unique(references.filter(ref => !unitIds.includes(ref.from_unit_id) && unitIds.includes(ref.to_unit_id)).map(ref => ref.from_unit_id))});
  const common = ({node, tree}) => ({policy: clone(policy), current_scope: scope(node.unit_ids),
    unit_workloads: atomicLoads.filter(value => node.unit_ids.includes(value.unit_id)).map(clone),
    frontier: tree.filter(item => item.status !== 'split').map(item => ({node_id: item.id, status: item.status, workload: load(item.unit_ids)})),
    literal_interface_references: references.filter(ref => node.unit_ids.includes(ref.from_unit_id) || node.unit_ids.includes(ref.to_unit_id)).map(clone),
    readiness: {confirmed_dependencies: 'unknown_until_relation_decisions', estimated_duration_ms: null,
      queueing: 'Only the fixed execution slots can run concurrently; descendants may have to wait for chosen producers.'}});
  const membershipCapacity = (unitCount, childCount) => Math.ceil(unitCount / childCount);
  return {contract, policy, load, overload, scope, membershipCapacity,
    splitState({node, tree, maximum, frontier, criteria, providerCalls = 0}) {
      return {...common({node, tree}), keep_allowed: Object.hasOwn(criteria, 'keep'),
        split_count_options: Object.keys(criteria).filter(key => key.startsWith('split_')).map(key => ({choice: key,
          max_child_units: membershipCapacity(node.unit_ids.length, Number(key.slice(6)))})),
        depth: {current: node.depth, configured_soft_limit: limits.max_depth,
          capacity_escape: node.depth >= limits.max_depth && overload(node.unit_ids).length > 0},
        hard_capacity_remaining: {leaf_slots: limits.max_leaves - frontier, nodes: limits.max_nodes - tree.length,
          maximum_children_now: maximum, decision_calls: limits.max_decisions - providerCalls}, model_decides: Object.keys(criteria).length > 1};
    },
    membershipState({node, tree, groups, unitId, remainingUnitIds, criteria, providerCalls = 0}) {
      const cap = membershipCapacity(node.unit_ids.length, groups.length);
      const rows = groups.map((group, index) => {
        const proposed = [...group, unitId], option = `child_${index + 1}`;
        const otherAssigned = groups.flatMap((value, i) => i === index ? [] : value);
        const cuts = references.filter(ref => (proposed.includes(ref.from_unit_id) && otherAssigned.includes(ref.to_unit_id))
          || (otherAssigned.includes(ref.from_unit_id) && proposed.includes(ref.to_unit_id)));
        return {choice: option, allowed: Object.hasOwn(criteria, option), current: load(group), proposed: load(proposed),
          remaining_unit_capacity: cap - proposed.length, cross_child_literal_reference_count: cuts.length};
      });
      return {...common({node, tree}), child_unit_capacity: cap, proposed_child_workloads: rows,
        remaining_workload: load(remainingUnitIds), feasible_choice_count: Object.keys(criteria).length,
        decision_calls_remaining: limits.max_decisions - providerCalls,
        model_decides: Object.keys(criteria).length > 1,
        capacity_rule: 'Nonempty children and a maximum child unit count only. Requirement/artifact/path loads guide Jev now and terminal leaf caps require further splitting if necessary.'};
    },
  };
}
