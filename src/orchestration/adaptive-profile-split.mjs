import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareDecision} from '../client.mjs';

// D077: one v2 profile choice (model x effort, 21 options) becomes a model choice plus an effort score.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-profile-selection.v3.json';
const fail = (code, details = {}) => { throw Object.assign(new Error(code), {code, outcome_uncertain: false, ...details}); };
const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

export function loadProfileSplitContract() {
  const raw = read(CONTRACT_PATH), contract = JSON.parse(raw), base = JSON.parse(read(contract.base_contract));
  if (contract.schema_version !== 'adaptive-profile-selection/v3' || contract.effort_question.levels.length !== 5
    || base.schema_version !== 'adaptive-profile-selection/v2') fail('ADAPTIVE_PROFILE_SPLIT_CONTRACT_INVALID');
  return {...contract, base_instructions: base.question.instructions,
    source: {path: CONTRACT_PATH, sha256: createHash('sha256').update(raw).digest('hex')}};
}

/** Same state; each task asks model (choice) and effort (score) separately. */
export function splitProfileRequest(request, contract = loadProfileSplitContract()) {
  const {state} = request, {model_question: mq, effort_question: eq} = contract;
  const families = state.models.filter(model => state.profiles.some(profile => profile.family_id === model.id));
  const rates = model => model.price.prompt_tiers[0].rates;
  const modelCriteria = Object.fromEntries(families.map(model => [model.id, mq.criteria_template
    .replace('{model}', model.model).replace('{selection_hypothesis}', model.selection_hypothesis)
    .replace('{input}', rates(model).input).replace('{output}', rates(model).output)]));
  modelCriteria.stop = mq.stop_description;
  const questions = {};
  for (const [id, question] of Object.entries(request.questions)) {
    if (question.type !== 'choice' || !question.instructions.endsWith(contract.base_instructions)) fail('ADAPTIVE_PROFILE_SPLIT_INPUT');
    const target = question.instructions.slice(0, -contract.base_instructions.length);
    questions[id + mq.id_suffix] = {type: 'choice', instructions: target + mq.instructions, criteria: {...modelCriteria}};
    questions[id + eq.id_suffix] = {type: 'score', instructions: target + eq.instructions,
      criteria: eq.levels.map(level => level.situation)};
  }
  return prepareDecision({...request, questions}).body;
}

/** Map split answers back to the original v2 choice keys; the split answers stay attached as evidence. */
export function combineProfileAnswers(request, response, contract = loadProfileSplitContract()) {
  const efforts = contract.effort_question.levels.map(level => level.effort), answers = {}, split = {};
  for (const [id, question] of Object.entries(request.questions)) {
    const model = response.answers?.[id + contract.model_question.id_suffix];
    const effort = response.answers?.[id + contract.effort_question.id_suffix];
    if (model?.type !== 'choice' || effort?.type !== 'score' || !Number.isFinite(effort.score)) fail('ADAPTIVE_PROFILE_SPLIT_ANSWER');
    let choice = 'stop', level = null;
    if (model.choice !== 'stop') {
      const allowed = request.state.profiles.filter(profile => profile.family_id === model.choice)
        .map(profile => ({profile, distance: Math.abs(efforts.indexOf(profile.effort) - Math.round(effort.score))}))
        .sort((a, b) => a.distance - b.distance || efforts.indexOf(a.profile.effort) - efforts.indexOf(b.profile.effort));
      if (!allowed.length || !Object.hasOwn(question.criteria, allowed[0].profile.id)) fail('ADAPTIVE_PROFILE_SPLIT_UNAVAILABLE', {model: model.choice});
      choice = allowed[0].profile.id; level = allowed[0].profile.effort;
    }
    answers[id] = {type: 'choice', choice};
    split[id] = {model, effort, effort_level: level};
  }
  return {answers, profile_split: split};
}
