import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {validateDagPlan} from './dag-contracts.mjs';
import {analyzeDag} from './artifact-dag.mjs';

// D079: workload estimates turn on the scheduler's existing remaining-path order for adaptive plans.
export const SCHEDULE_CONTRACT = 'docs/orchestration/contracts/adaptive-critical-path-schedule.v1.json';
const fail = code => { throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };

export function loadScheduleContract(path = SCHEDULE_CONTRACT) {
  const raw = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), contract = JSON.parse(raw);
  if (contract.schema_version !== 'adaptive-critical-path-schedule/v1' || contract.policy !== 'critical-path-v1') fail('ADAPTIVE_SCHEDULE_CONTRACT_INVALID');
  return {...contract, source: {path, sha256: createHash('sha256').update(raw).digest('hex')}};
}

/** ponytail: requirement count is a coarse rank, not a duration model; replace with observed per-profile rates when repeated runs exist. */
export function applyWorkloadEstimates(plan, contract = loadScheduleContract()) {
  const {estimate} = contract;
  const next = structuredClone(plan);
  for (const task of next.tasks) task.duration = {basis: estimate.basis, sample_count: 0, source_refs: [estimate.source_ref],
    estimate_ms: task.kind === 'verification' ? estimate.verification_ms
      : Math.max(estimate.minimum_ms, estimate.per_requirement_ms * task.requirement_ids.length)};
  const checked = validateDagPlan(next), analysis = analyzeDag(checked);
  return {plan: checked, priority_order: analysis.priority_order, critical_path_ms: analysis.critical_path_ms};
}
