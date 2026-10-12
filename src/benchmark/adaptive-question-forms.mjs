import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {planCohesionDag} from '../orchestration/adaptive-cohesion.mjs';
import {describeOwnerCriteria} from '../orchestration/adaptive-owner-criteria.mjs';
import {splitProfileRequest, combineProfileAnswers} from '../orchestration/adaptive-profile-split.mjs';
import {selectInferredOwnerScope} from '../orchestration/adaptive-inferred-scope.mjs';
import {createDeferringDecider} from '../orchestration/jev-confidence-deferral.mjs';

// D077 manifest v12: question-form changes behind one dispatch hook; v1-v11 never reach this module.
export const QUESTION_FORM_SCHEMA = 'adaptive-dag-comparison/v12';
export const QUESTION_FORM_CONTRACTS = Object.freeze({
  decomposition: 'docs/orchestration/contracts/adaptive-cohesion.v1.json',
  owner_criteria: 'docs/orchestration/contracts/adaptive-owner-criteria.v1.json',
  profile_split: 'docs/orchestration/contracts/adaptive-profile-selection.v3.json',
  inferred_scope: 'docs/orchestration/contracts/adaptive-inferred-scope.v1.json',
  deferral: 'docs/orchestration/contracts/jev-confidence-deferral.v1.json',
});
export const QUESTION_FORM_SOURCES = Object.freeze(['src/benchmark/adaptive-question-forms.mjs',
  'src/orchestration/adaptive-cohesion.mjs', 'src/orchestration/adaptive-owner-criteria.mjs',
  'src/orchestration/adaptive-profile-split.mjs', 'src/orchestration/adaptive-inferred-scope.mjs',
  'src/orchestration/jev-confidence-deferral.mjs', ...Object.values(QUESTION_FORM_CONTRACTS)]);
const fail = code => { throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
const sha = value => createHash('sha256').update(value).digest('hex');

export const isQuestionFormManifest = manifest => manifest?.schema_version === QUESTION_FORM_SCHEMA;

/** v12-only fields: exact contract bindings, cohesion decomposition and a ledger lock matching the ledger version. */
export function validateQuestionFormManifest(value, rootDir) {
  const forms = value.question_forms, speed = value.runtime_speed;
  if (!forms || JSON.stringify(Object.keys(forms).sort()) !== JSON.stringify(Object.keys(QUESTION_FORM_CONTRACTS).sort())) fail('ADAPTIVE_QUESTION_FORMS_INVALID');
  for (const [key, path] of Object.entries(QUESTION_FORM_CONTRACTS)) {
    if (forms[key]?.contract !== path || forms[key].sha256 !== sha(readFileSync(join(rootDir, path)))) fail('ADAPTIVE_QUESTION_FORMS_BINDING');
  }
  if (JSON.stringify(value.decomposition_policy) !== JSON.stringify({id: 'cohesion-v1', contract: QUESTION_FORM_CONTRACTS.decomposition})) fail('ADAPTIVE_QUESTION_FORMS_DECOMPOSITION');
  const v4 = value.jev_budget?.schema_version === 'jev-token-budget/v4';
  if (!speed || !['per_call', 'per_session'].includes(speed.model_lookup) || speed.budget_lock !== (v4 ? 'ledger_op' : 'call')
    || !Number.isSafeInteger(speed.public_check_concurrency) || speed.public_check_concurrency < 1 || speed.public_check_concurrency > 8
    || typeof speed.readiness_batch !== 'boolean'
    || value.transmission_preflight !== undefined || value.failure_recovery !== undefined || value.preserved_source !== undefined) fail('ADAPTIVE_QUESTION_FORMS_RUNTIME');
}

/** Stage hooks for runAdaptiveArm. Every Jev decision goes through the low-confidence deferral. */
export function createQuestionFormHooks({session, record}) {
  const decide = createDeferringDecider({jev: (request, context) => session.decide('jev', request, context),
    claude: (request, context) => session.decide('claude', request, context), record});
  return {
    decide,
    plan: input => planCohesionDag({...input, decide}),
    decideProfiles: async (request, metadata) => {
      const response = await decide(splitProfileRequest(request), metadata);
      return {...combineProfileAnswers(request, response), profile_split_response: response};
    },
    decideRepairOwners: (request, metadata) => decide(describeOwnerCriteria(request), metadata),
    decideRepair: request => selectInferredOwnerScope(request),
  };
}
