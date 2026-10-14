import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// D085 owner_tiebreak flat-reask-v1. A flat inferred owner answer is asked once more with the tied artifacts' source text;
// an answer that stays flat leaves the choice among the tied artifacts to the repair worker.
const CONTRACTS = {'flat-reask-v1': 'docs/orchestration/contracts/adaptive-owner-tiebreak.v1.json',
  'flat-reask-v2': 'docs/orchestration/contracts/adaptive-owner-tiebreak.v2.json'};
export const OWNER_TIEBREAK_POLICIES = Object.keys(CONTRACTS);
export {TIEBREAK_UNION_ID} from './adaptive-inferred-scope.mjs';

const fail = code => { const error = new Error(code); error.code = code; throw error; };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? 'none'));

// v2 keeps the v1 request text and only changes how the second answer is resolved and what the worker is told.
export function loadOwnerTiebreakContract(policy = 'flat-reask-v2') {
  const path = CONTRACTS[policy];
  if (!path) fail('ADAPTIVE_OWNER_TIEBREAK_CONTRACT');
  const raw = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), contract = JSON.parse(raw);
  if (contract.policy !== policy || contract.schema_version !== `adaptive-owner-tiebreak/${policy.slice(-2)}`) fail('ADAPTIVE_OWNER_TIEBREAK_CONTRACT');
  return {contract, source: {path, sha256: createHash('sha256').update(raw).digest('hex'), version: contract.schema_version}};
}

/** The tied artifacts of one answer, or null when the answer is not flat under the contract rule. */
export function tiedArtifacts(answer, choice, rule = loadOwnerTiebreakContract().contract.flat_rule) {
  const probabilities = answer?.probabilities;
  if (!object(probabilities) || choice === 'unknown' || !Number.isFinite(probabilities[choice])) return null;
  const round = value => Number(value.toFixed(rule.rounding_decimals)), top = probabilities[choice];
  if (round(top) >= rule.max_choice_probability) return null;
  const tied = Object.entries(probabilities).filter(([id, value]) => id !== 'unknown' && Number.isFinite(value) && round(top - value) < rule.max_gap)
    .sort((a, b) => b[1] - a[1] || (a[0] === choice ? -1 : b[0] === choice ? 1 : a[0].localeCompare(b[0]))).map(([id]) => id);
  const ordered = [choice, ...tied.filter(id => id !== choice)].slice(0, rule.max_tied_artifacts);
  return ordered.length >= 2 ? ordered : null;
}

export function flatAssignments({assignments, answers, contract = loadOwnerTiebreakContract().contract}) {
  return (assignments ?? []).filter(row => row.status === 'inferred').map(row => {
    const tied = tiedArtifacts(answers?.[row.question_id], row.artifact_id, contract.flat_rule);
    return tied ? {question_id: row.question_id, failure_id: row.failure_id, check_id: row.check_id, test_id: row.test_id ?? null,
      assertion_id: row.assertion_id ?? null, requirement_ids: structuredClone(row.requirement_ids ?? []),
      error_type: row.error_type ?? null, message: row.message ?? null, choice: row.artifact_id, tied,
      first_probabilities: Object.fromEntries(tied.map(id => [id, answers[row.question_id].probabilities[id]]))} : null;
  }).filter(Boolean);
}

/** One request for every flat failure of the round; questions keep the first decision's question IDs. */
export function buildOwnerTiebreakRequest({flat, planning, artifactBindings, sources, policy}) {
  const {contract, source} = loadOwnerTiebreakContract(policy);
  if (!flat.length) fail('ADAPTIVE_OWNER_TIEBREAK_EMPTY');
  const ids = [...new Set(flat.flatMap(row => row.tied))];
  let budget = contract.source_excerpt.max_total_chars;
  const candidates = ids.map(id => {
    const unit = planning.catalog.units.find(row => row.artifact_ids.includes(id));
    const files = sources.filter(file => file.artifact_id === id).map(file => {
      const limit = Math.max(0, Math.min(contract.source_excerpt.max_chars_per_file, budget)), text = file.content.slice(0, limit);
      budget -= text.length;
      return {path: file.path, sha256: file.sha256, chars: file.content.length, truncated: text.length < file.content.length, content: text};
    });
    return {artifact_id: id, paths: structuredClone(artifactBindings[id].paths), interface: unit?.interface ?? null, files};
  });
  const requirementIds = [...new Set(flat.flatMap(row => row.requirement_ids))];
  const state = {schema_version: 'adaptive-owner-tiebreak-request/v1', instructions: contract.state_instructions, contract_source: source,
    failures: flat.map(({question_id, choice, tied, ...row}) => ({...row, first_choice: choice, tied_artifact_ids: tied})),
    requirement_descriptions: planning.requirement_descriptions.filter(row => requirementIds.includes(row.id)), candidates};
  const questions = Object.fromEntries(flat.map(row => [row.question_id, {type: contract.question.type,
    instructions: fill(contract.question.target_template, row) + contract.question.instructions,
    criteria: {...Object.fromEntries(row.tied.map(id => [id, fill(contract.question.criterion_template,
      {artifact_id: id, paths: artifactBindings[id].paths.join(', ')})])), unknown: contract.question.unknown_description}}]));
  return {model: contract.model, state, questions};
}

/** Validates the second answer and resolves each flat failure, or leaves its tied set to the repair worker. */
export function resolveOwnerTiebreak({flat, request, response, policy}) {
  const {contract} = loadOwnerTiebreakContract(policy);
  if (!object(response?.answers)) fail('ADAPTIVE_OWNER_TIEBREAK_RESPONSE');
  return flat.map(row => {
    const answer = response.answers[row.question_id], criteria = request.questions[row.question_id].criteria;
    if (!object(answer) || answer.type !== 'choice' || !Object.hasOwn(criteria, answer.choice)
      || (answer.probabilities !== undefined && (!object(answer.probabilities)
        || Object.values(answer.probabilities).some(value => !Number.isFinite(value) || value < 0 || value > 1)))) fail('ADAPTIVE_OWNER_TIEBREAK_RESPONSE');
    const stillFlat = answer.choice === 'unknown' || tiedArtifacts(answer, answer.choice, contract.flat_rule) !== null;
    // v2: a switch to a different artifact must carry enough confidence; otherwise the worker chooses.
    const confidence = Number.isFinite(answer.confidence) ? answer.confidence : answer.probabilities?.[answer.choice] ?? null;
    const weakSwitch = !stillFlat && contract.resolution && answer.choice !== row.choice
      && !(confidence >= contract.resolution.min_confidence_to_change_owner);
    const unresolved = stillFlat || weakSwitch;
    const ranking = contract.worker_ranking && unresolved && object(answer.probabilities)
      ? [...row.tied].sort((a, b) => (answer.probabilities[b] ?? 0) - (answer.probabilities[a] ?? 0))
        .map(id => ({artifact_id: id, probability: answer.probabilities[id] ?? null})) : null;
    return {question_id: row.question_id, failure_id: row.failure_id, tied: structuredClone(row.tied),
      second_choice: answer.choice, second_confidence: confidence, second_probabilities: structuredClone(answer.probabilities ?? null),
      status: unresolved ? 'unresolved_worker_chooses' : 'resolved',
      ...(unresolved ? {unresolved_reason: answer.choice === 'unknown' ? 'unknown' : stillFlat ? 'still_flat' : 'low_confidence_switch'} : {}),
      ...(ranking ? {worker_ranking: ranking} : {}),
      artifact_ids: unresolved ? structuredClone(row.tied) : [answer.choice]};
  });
}
