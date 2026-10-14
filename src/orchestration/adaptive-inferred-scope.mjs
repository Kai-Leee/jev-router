import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// D077: the repair scope after owner inference is a code rule, not a second Jev choice.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-inferred-scope.v1.json';
const UNION_ID = 'repair-inferred-owners';
export const EXPANDED_UNION_ID = `${UNION_ID}+worker-mentioned`;
const EXPANSION_MAX = 2;

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
  // An expanded union exists only when the manifest opts into scope_expansion and the rule above added artifacts.
  const union = candidates.find(candidate => candidate.id === EXPANDED_UNION_ID) ?? candidates.find(candidate => candidate.id === UNION_ID);
  const common = {outcome_uncertain: false, dispatch_allowed: false, automatic_retries: 0, selection_basis: basis,
    stats: {provider_calls: 0, provider_questions: 0, local_questions: 1}};
  if (!union) return {...common, status: 'stopped', reason: 'ADAPTIVE_REPAIR_NO_INFERRED_OWNER', candidate: null, candidate_id: null};
  return {...common, status: 'selected', candidate: structuredClone(union), candidate_id: union.id, action: 'fresh_repair_scope_selected'};
}
