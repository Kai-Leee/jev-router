import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {prepareDecision} from '../client.mjs';

const CONTRACT_PATH = 'docs/orchestration/contracts/jev-token-admission.v1.json';
const contractBytes = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url));
const contract = JSON.parse(contractBytes);
const sha = value => createHash('sha256').update(value).digest('hex');
const policyHash = sha(contractBytes);
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const hashValue = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const estimate = size => Math.ceil(size * contract.estimator.tokens_per_utf8_byte_numerator
  / contract.estimator.tokens_per_utf8_byte_denominator) + contract.estimator.framing_allowance_tokens;

if (contract.schema_version !== 'jev-token-admission-contract/v1' || contract.estimator.kind !== 'heuristic'
    || contract.estimator.proven_upper_bound !== false || contract.estimator.provider_framing_known !== false
    || contract.exact_count.endpoint !== null || contract.exact_count.tokenizer !== null
    || ![contract.estimator.tokens_per_utf8_byte_numerator, contract.estimator.tokens_per_utf8_byte_denominator,
      contract.estimator.framing_allowance_tokens, ...Object.values(contract.local_limit_interpretation).filter(value => typeof value === 'number')]
      .every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('JEV_TOKEN_ADMISSION_POLICY_INVALID');

/** Metadata is copied; callers cannot mutate the policy used by the assessment. */
export function jevTokenAdmissionPolicy() {
  return {...structuredClone(contract), source: {path: CONTRACT_PATH, sha256: policyHash}};
}

/** Pure after module loading: no model lookup, network call, reservation, retry or input mutation. */
export function assessJevTokenAdmission(request, {observedModel = null, expectedRequestSha256 = null, expectedPolicySha256 = null} = {}) {
  const result = {schema_version: 'jev-token-admission-result/v1', admission: 'blocked', inference_allowed: false,
    reason_codes: [], requested_model: null, observed_model: observedModel, model_context_assumption: contract.model_context_assumption,
    policy_id: contract.policy_id, policy_source: {path: CONTRACT_PATH, sha256: policyHash}, request_sha256: null,
    measurements: null, estimates: null,
    exact_model_tokens: {request: null, state_plus_longest_question: null}, provider_acceptance_guaranteed: false,
    proven_token_upper_bound: false, limits: structuredClone(contract.local_limit_interpretation),
    actual_usage: null, inference_started: false, automatic_retries: 0};
  let prepared;
  try { prepared = prepareDecision(request); }
  catch { result.reason_codes.push('JEV_TOKEN_ADMISSION_INVALID_REQUEST'); return result; }
  const {body, serialized} = prepared;
  result.requested_model = body.model; result.request_sha256 = sha(serialized);
  const stateBytes = bytes(body.state), questions = Object.entries(body.questions).map(([id, question]) => ({id, json_bytes: bytes(question)}));
  const longest = questions.reduce((largest, question) => question.json_bytes > largest.json_bytes ? question : largest);
  const wireBytes = Buffer.byteLength(serialized, 'utf8'), stateLongestBytes = stateBytes + longest.json_bytes;
  result.measurements = {wire_bytes: wireBytes, state_json_bytes: stateBytes, question_count: questions.length,
    question_json_bytes: questions, longest_question_id: longest.id, longest_question_json_bytes: longest.json_bytes,
    state_plus_longest_question_json_bytes: stateLongestBytes};
  result.estimates = {kind: 'heuristic', formula: contract.estimator.formula, request_tokens: estimate(wireBytes),
    state_plus_longest_question_tokens: estimate(stateLongestBytes), framing_allowance_tokens: contract.estimator.framing_allowance_tokens,
    provider_framing_known: false, basis: contract.estimator.basis};
  if (!contract.applies_to_requested_models.includes(body.model)
      || (observedModel !== null && !contract.accepted_observed_model_labels.includes(observedModel))) result.reason_codes.push('JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED');
  if (expectedRequestSha256 !== null && (!hashValue(expectedRequestSha256) || expectedRequestSha256 !== result.request_sha256)) {
    result.reason_codes.push('JEV_TOKEN_ADMISSION_REQUEST_CHANGED');
  }
  if (expectedPolicySha256 !== null && (!hashValue(expectedPolicySha256) || expectedPolicySha256 !== policyHash)) {
    result.reason_codes.push('JEV_TOKEN_ADMISSION_POLICY_CHANGED');
  }
  if (result.estimates.state_plus_longest_question_tokens > contract.local_limit_interpretation.state_plus_longest_question_tokens) {
    result.reason_codes.push('JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT');
  }
  if (result.estimates.request_tokens > contract.local_limit_interpretation.request_tokens) {
    result.reason_codes.push('JEV_TOKEN_ADMISSION_ESTIMATED_REQUEST_LIMIT');
  }
  if (!result.reason_codes.length) { result.admission = 'admit_estimated'; result.inference_allowed = true; }
  return result;
}
