import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// D077: the repair scope after owner inference is a code rule, not a second Jev choice.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-inferred-scope.v1.json';
const UNION_ID = 'repair-inferred-owners';

export function selectInferredOwnerScope({candidates}) {
  const raw = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url), 'utf8');
  const basis = {contract: CONTRACT_PATH, sha256: createHash('sha256').update(raw).digest('hex')};
  const union = candidates.find(candidate => candidate.id === UNION_ID);
  const common = {outcome_uncertain: false, dispatch_allowed: false, automatic_retries: 0, selection_basis: basis,
    stats: {provider_calls: 0, provider_questions: 0, local_questions: 1}};
  if (!union) return {...common, status: 'stopped', reason: 'ADAPTIVE_REPAIR_NO_INFERRED_OWNER', candidate: null, candidate_id: null};
  return {...common, status: 'selected', candidate: structuredClone(union), candidate_id: union.id, action: 'fresh_repair_scope_selected'};
}
