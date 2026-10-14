import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// D077: the repair scope after owner inference is a code rule, not a second Jev choice.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-inferred-scope.v1.json';
const UNION_ID = 'repair-inferred-owners';
export const EXPANDED_UNION_ID = `${UNION_ID}+worker-mentioned`;
export const ALTERNATIVES_UNION_ID = `${UNION_ID}+owner-alternatives`;
const EXPANSION_MAX = 2;
const ALTERNATIVE_MIN_PROBABILITY = 0.2, ALTERNATIVE_MIN_RATIO = 0.4;

/** D085 owner-probability-v1 (multi-owner from one choice answer): for each inferred failure, a non-chosen artifact whose
 * Jev probability is at least 0.2 and at least 0.4 x the chosen artifact's probability is a secondary owner. Up to 2 such
 * artifacts outside the union join it, ordered by the number of failures naming them, then their summed probability. */
export function ownerProbabilityAlternatives({baseArtifactIds, plan, assignments, answers}) {
  const counts = new Map(), sums = new Map();
  for (const row of assignments ?? []) {
    if (row.status !== 'inferred') continue;
    const probabilities = answers?.[row.question_id]?.probabilities;
    if (!probabilities || !Number.isFinite(probabilities[row.artifact_id])) continue;
    const top = probabilities[row.artifact_id];
    for (const [id, value] of Object.entries(probabilities)) {
      if (id === 'unknown' || id === row.artifact_id || value < ALTERNATIVE_MIN_PROBABILITY || value < ALTERNATIVE_MIN_RATIO * top) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1); sums.set(id, (sums.get(id) ?? 0) + value);
    }
  }
  const order = plan.artifacts.map(row => row.id);
  const added = order.filter(id => counts.has(id) && !baseArtifactIds.includes(id))
    .sort((a, b) => counts.get(b) - counts.get(a) || sums.get(b) - sums.get(a) || order.indexOf(a) - order.indexOf(b)).slice(0, EXPANSION_MAX);
  if (!added.length) return null;
  return {artifact_ids: order.filter(id => baseArtifactIds.includes(id) || added.includes(id)),
    info: {policy: 'owner-probability-v1', base_candidate_id: UNION_ID, added_artifact_ids: added,
      failure_counts: Object.fromEntries(added.map(id => [id, counts.get(id)])),
      probability_sums: Object.fromEntries(added.map(id => [id, Number(sums.get(id).toFixed(6))])),
      min_probability: ALTERNATIVE_MIN_PROBABILITY, min_ratio_to_choice: ALTERNATIVE_MIN_RATIO,
      basis: 'jev_secondary_probabilities_not_fault_proof'}};
}

/** D083 worker-mentioned-v1: after a repair round whose failures persisted, artifacts that at least min(2, workers)
 * of that round's repair workers named outside their own repaired artifacts join the union scope (at most 2). */
export function workerMentionedExpansion({baseArtifactIds, plan, diagnostics, persistentFailureKeys}) {
  const entries = diagnostics?.entries ?? [];
  if (!entries.length || !persistentFailureKeys?.length) return null;
  const counts = new Map();
  for (const entry of entries) {
    const own = new Set(entry.repaired_artifact_ids ?? []);
    for (const id of entry.mentioned_artifact_ids ?? []) if (!own.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  const threshold = Math.min(2, entries.length), order = plan.artifacts.map(row => row.id);
  const added = order.filter(id => (counts.get(id) ?? 0) >= threshold && !baseArtifactIds.includes(id))
    .sort((a, b) => counts.get(b) - counts.get(a) || order.indexOf(a) - order.indexOf(b)).slice(0, EXPANSION_MAX);
  if (!added.length) return null;
  return {artifact_ids: order.filter(id => baseArtifactIds.includes(id) || added.includes(id)),
    info: {policy: 'worker-mentioned-v1', base_candidate_id: UNION_ID, added_artifact_ids: added,
      mention_counts: Object.fromEntries(added.map(id => [id, counts.get(id)])), threshold,
      persistent_failure_keys: structuredClone(persistentFailureKeys), basis: 'unverified_worker_statements_not_fault_proof'}};
}

export function selectInferredOwnerScope({candidates}) {
  const raw = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url), 'utf8');
  const basis = {contract: CONTRACT_PATH, sha256: createHash('sha256').update(raw).digest('hex')};
  // An expanded union exists only when the manifest opts into an expansion and its rule added artifacts; the
  // worker-mentioned union is built on the owner-alternatives union when both apply.
  const union = [EXPANDED_UNION_ID, ALTERNATIVES_UNION_ID, UNION_ID].map(id => candidates.find(candidate => candidate.id === id)).find(Boolean);
  const common = {outcome_uncertain: false, dispatch_allowed: false, automatic_retries: 0, selection_basis: basis,
    stats: {provider_calls: 0, provider_questions: 0, local_questions: 1}};
  if (!union) return {...common, status: 'stopped', reason: 'ADAPTIVE_REPAIR_NO_INFERRED_OWNER', candidate: null, candidate_id: null};
  return {...common, status: 'selected', candidate: structuredClone(union), candidate_id: union.id, action: 'fresh_repair_scope_selected'};
}
