import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {planCohesionDag} from '../orchestration/adaptive-cohesion.mjs';
import {planLayeredDag, LAYERED_CONTRACTS} from '../orchestration/adaptive-layered-decomposition.mjs';
import {describeOwnerCriteria, loadOwnerCriteriaContract} from '../orchestration/adaptive-owner-criteria.mjs';
import {splitProfileRequest, combineProfileAnswers} from '../orchestration/adaptive-profile-split.mjs';
import {selectInferredOwnerScope} from '../orchestration/adaptive-inferred-scope.mjs';
import {createDeferringDecider} from '../orchestration/jev-confidence-deferral.mjs';
import {applyWorkloadEstimates, loadScheduleContract, SCHEDULE_CONTRACT} from '../orchestration/adaptive-critical-path-schedule.mjs';
import {specReviewAfterPublicGate, SPEC_REVIEW_CONTRACT} from './adaptive-spec-review.mjs';
import {projectOwnerPayload, OWNER_PAYLOAD_CONTRACT} from '../orchestration/adaptive-owner-payload-projection.mjs';

// Manifest v12: question-form changes behind one dispatch hook; v1-v11 never reach this module.
// D077 bound all five forms; D078 selects forms per manifest and adds the layered decomposition and owner labels v2.
export const QUESTION_FORM_SCHEMA = 'adaptive-dag-comparison/v12';
const C = 'docs/orchestration/contracts/';
export const QUESTION_FORM_OPTIONS = Object.freeze({
  decomposition: {[`${C}adaptive-cohesion.v1.json`]: 'cohesion-v1', [`${C}adaptive-layered-decomposition.v1.json`]: 'layered-v1',
    [`${C}adaptive-layered-decomposition.v2.json`]: 'layered-v2'},
  owner_criteria: {[`${C}adaptive-owner-criteria.v1.json`]: 'v1', [`${C}adaptive-owner-criteria.v2.json`]: 'v2'},
  profile_split: {[`${C}adaptive-profile-selection.v3.json`]: 'v3'},
  inferred_scope: {[`${C}adaptive-inferred-scope.v1.json`]: 'v1'},
  deferral: {[`${C}jev-confidence-deferral.v1.json`]: 'v1'},
});
/** D077 binding, kept for its v12 manifest. */
export const QUESTION_FORM_CONTRACTS = Object.freeze({
  decomposition: `${C}adaptive-cohesion.v1.json`, owner_criteria: `${C}adaptive-owner-criteria.v1.json`,
  profile_split: `${C}adaptive-profile-selection.v3.json`, inferred_scope: `${C}adaptive-inferred-scope.v1.json`,
  deferral: `${C}jev-confidence-deferral.v1.json`,
});
export const QUESTION_FORM_SOURCES = Object.freeze(['src/benchmark/adaptive-question-forms.mjs',
  'src/orchestration/adaptive-cohesion.mjs', 'src/orchestration/adaptive-layered-decomposition.mjs',
  'src/orchestration/adaptive-owner-criteria.mjs', 'src/orchestration/adaptive-profile-split.mjs',
  'src/orchestration/adaptive-inferred-scope.mjs', 'src/orchestration/jev-confidence-deferral.mjs',
  'src/orchestration/adaptive-critical-path-schedule.mjs', SCHEDULE_CONTRACT, 'src/benchmark/adaptive-spec-review.mjs', SPEC_REVIEW_CONTRACT,
  'src/orchestration/adaptive-owner-payload-projection.mjs', OWNER_PAYLOAD_CONTRACT,
  ...Object.values(QUESTION_FORM_OPTIONS).flatMap(Object.keys)]);
const fail = code => { throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
const sha = value => createHash('sha256').update(value).digest('hex');

export const isQuestionFormManifest = manifest => [QUESTION_FORM_SCHEMA, 'adaptive-dag-comparison/v13'].includes(manifest?.schema_version);

/** v12-only fields: a decomposition form plus any subset of the others, exact contract bindings, and a ledger lock matching the ledger version. */
export function validateQuestionFormManifest(value, rootDir) {
  const forms = value.question_forms, speed = value.runtime_speed;
  if (!forms || !forms.decomposition || Object.keys(forms).some(key => !QUESTION_FORM_OPTIONS[key])) fail('ADAPTIVE_QUESTION_FORMS_INVALID');
  for (const [key, form] of Object.entries(forms)) {
    if (!QUESTION_FORM_OPTIONS[key][form?.contract] || form.sha256 !== sha(readFileSync(join(rootDir, form.contract)))) fail('ADAPTIVE_QUESTION_FORMS_BINDING');
  }
  const decomposition = QUESTION_FORM_OPTIONS.decomposition[forms.decomposition.contract];
  const schedule = value.schedule_policy;
  if (schedule !== undefined && (schedule?.policy !== 'critical-path-v1' || schedule.contract !== SCHEDULE_CONTRACT
    || schedule.sha256 !== sha(readFileSync(join(rootDir, schedule.contract))))) fail('ADAPTIVE_SCHEDULE_POLICY_BINDING');
  const review = value.spec_review;
  if (review !== undefined && (review?.policy !== 'spec-review-v1' || review.contract !== SPEC_REVIEW_CONTRACT
    || review.sha256 !== sha(readFileSync(join(rootDir, review.contract))))) fail('ADAPTIVE_SPEC_REVIEW_BINDING');
  if (JSON.stringify(value.decomposition_policy) !== JSON.stringify({id: decomposition, contract: forms.decomposition.contract})) fail('ADAPTIVE_QUESTION_FORMS_DECOMPOSITION');
  const v4 = value.jev_budget?.schema_version === 'jev-token-budget/v4';
  if (!speed || !['per_call', 'per_session'].includes(speed.model_lookup) || speed.budget_lock !== (v4 ? 'ledger_op' : 'call')
    || !Number.isSafeInteger(speed.public_check_concurrency) || speed.public_check_concurrency < 1 || speed.public_check_concurrency > 8
    || typeof speed.readiness_batch !== 'boolean'
    || value.transmission_preflight !== undefined || value.failure_recovery !== undefined || value.preserved_source !== undefined) fail('ADAPTIVE_QUESTION_FORMS_RUNTIME');
}

/** Stage hooks for runAdaptiveArm. Absent forms fall back to the v2 question; Jev decisions go through deferral when bound. */
export function createQuestionFormHooks({session, record, manifest}) {
  const forms = manifest?.question_forms ?? Object.fromEntries(Object.entries(QUESTION_FORM_CONTRACTS).map(([key, contract]) => [key, {contract}]));
  const jev = (request, context) => session.decide('jev', request, context);
  const decide = forms.deferral ? createDeferringDecider({jev, claude: (request, context) => session.decide('claude', request, context), record}) : jev;
  const decomposition = QUESTION_FORM_OPTIONS.decomposition[forms.decomposition.contract];
  const planner = decomposition === 'cohesion-v1' ? planCohesionDag
    : input => planLayeredDag({...input, contractPath: LAYERED_CONTRACTS[decomposition.slice('layered-'.length)]});
  const ownerContract = forms.owner_criteria ? loadOwnerCriteriaContract(forms.owner_criteria.contract) : null;
  const ownerPayloadPolicy = manifest?.repair_efficiency?.owner_input_projection;
  if (ownerPayloadPolicy !== undefined && ownerPayloadPolicy !== 'lossless-owner-v1') fail('ADAPTIVE_OWNER_PAYLOAD_POLICY_INVALID');
  const decideRepairOwners = async (request, metadata) => {
    const described = ownerContract ? describeOwnerCriteria(request, ownerContract) : request;
    if (!ownerPayloadPolicy) return decide(described, metadata);
    const projected = projectOwnerPayload(described, {policy: ownerPayloadPolicy});
    // Recording is awaited before any provider submission; a journal failure blocks the call.
    await record({event: 'adaptive_owner_payload_projected', stage: 'repair_owners',
      decision_id: metadata?.decision_id ?? null, report: projected.report});
    return decide(projected.request, {...metadata, owner_payload_projection: {
      policy: ownerPayloadPolicy, input_request_sha256: projected.report.input_request_sha256,
      output_request_sha256: projected.report.output_request_sha256,
      report_sha256: projected.report.integrity_sha256}});
  };
  const schedule = manifest?.schedule_policy ? loadScheduleContract(manifest.schedule_policy.contract) : null;
  // With a schedule policy the planner runs uncommitted; estimates are added, then the caller's commit binds the scheduled plan.
  const plan = async ({commit, ...input}) => {
    if (!schedule) return planner({...input, commit, decide});
    const planning = await planner({...input, decide});
    if (planning.status !== 'planned') return planning;
    const scheduled = applyWorkloadEstimates(planning.plan, schedule);
    const result = {...planning, plan: scheduled.plan, schedule: {policy: schedule.policy, contract_source: schedule.source,
      priority_order: scheduled.priority_order, critical_path_ms: scheduled.critical_path_ms}};
    await record({event: 'adaptive_schedule_estimates_applied', priority_order: scheduled.priority_order});
    if (commit) { await commit(structuredClone(result)); result.dispatch_allowed = true; result.durable_commit_callback = true; }
    return result;
  };
  return {
    decide,
    plan,
    decideProfiles: forms.profile_split ? async (request, metadata) => {
      const response = await decide(splitProfileRequest(request), metadata);
      return {...combineProfileAnswers(request, response), profile_split_response: response};
    } : decide,
    decideRepairOwners: ownerPayloadPolicy ? decideRepairOwners
      : ownerContract ? (request, metadata) => decide(describeOwnerCriteria(request, ownerContract), metadata) : decide,
    decideRepair: forms.inferred_scope ? request => selectInferredOwnerScope(request) : undefined,
    afterPublicGate: manifest?.spec_review ? ({rootDir, runDirectory, execution, input, catalog, runCommand, remaining}) =>
      specReviewAfterPublicGate({rootDir, manifest, runDirectory, execution, input, catalog, record, runCommand, remaining}) : undefined,
  };
}
