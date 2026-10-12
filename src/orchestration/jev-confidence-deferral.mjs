import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareDecision} from '../client.mjs';

// D077: hold low-confidence Jev answers and ask a fresh Claude decision session for exactly those questions.
const CONTRACT_PATH = 'docs/orchestration/contracts/jev-confidence-deferral.v1.json';
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };

export function loadDeferralPolicy() {
  const raw = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url), 'utf8'), policy = JSON.parse(raw);
  if (policy.schema_version !== 'jev-confidence-deferral/v1' || !(policy.threshold > 0 && policy.threshold < 1)) fail('JEV_DEFERRAL_POLICY_INVALID');
  return {...policy, source: {path: CONTRACT_PATH, sha256: createHash('sha256').update(raw).digest('hex')}};
}

/** Comparable certainty in [0, 1]; null when the answer carries none. */
export function answerCertainty(answer) {
  if (answer?.type === 'noul') return Number.isFinite(answer.noul) ? Math.abs(2 * answer.noul - 1) : null;
  return Number.isFinite(answer?.confidence) ? answer.confidence : null;
}

export function heldQuestions(request, response, threshold) {
  return Object.keys(request.questions).map(id => ({id, certainty: answerCertainty(response.answers?.[id])}))
    .filter(row => row.certainty === null || row.certainty < threshold);
}

/** Wrap a Jev decide; held questions go to claude(subRequest, context) and replace only their answers. */
export function createDeferringDecider({jev, claude, policy = loadDeferralPolicy(), record = async () => {}}) {
  return async (request, context = {}) => {
    const response = await jev(request, context);
    const held = heldQuestions(request, response, policy.threshold);
    if (!held.length) return response;
    const subRequest = prepareDecision({...request, questions: Object.fromEntries(held.map(row => [row.id, request.questions[row.id]]))}).body;
    await record({event: 'jev_confidence_deferral_started', stage: context.stage, decision_id: context.decision_id,
      threshold: policy.threshold, held, policy_source: policy.source});
    const deferred = await claude(subRequest, {...context, deferral_of: context.decision_id ?? null});
    const answers = {...response.answers}, deferrals = [];
    for (const row of held) {
      const answer = deferred.answers?.[row.id];
      if (answer?.type !== request.questions[row.id].type) fail('JEV_DEFERRAL_ANSWER_INVALID', {question_id: row.id});
      deferrals.push({question_id: row.id, certainty: row.certainty, jev_answer: response.answers[row.id], claude_answer: answer});
      answers[row.id] = answer;
    }
    await record({event: 'jev_confidence_deferral_completed', stage: context.stage, decision_id: context.decision_id, deferrals});
    return {...response, answers, deferral: {policy_source: policy.source, threshold: policy.threshold, deferrals}};
  };
}
