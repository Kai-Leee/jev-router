import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

// D085 owner_tiebreak flat-reask-v1. A flat inferred owner answer is asked once more with the tied artifacts' source text;
// an answer that stays flat leaves the choice among the tied artifacts to the repair worker.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-owner-tiebreak.v1.json';
export {TIEBREAK_UNION_ID} from './adaptive-inferred-scope.mjs';

const fail = code => { const error = new Error(code); error.code = code; throw error; };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fill = (template, values) => template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? 'none'));

export function loadOwnerTiebreakContract() {
  const raw = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url), 'utf8'), contract = JSON.parse(raw);
  if (contract.schema_version !== 'adaptive-owner-tiebreak/v1' || contract.policy !== 'flat-reask-v1') fail('ADAPTIVE_OWNER_TIEBREAK_CONTRACT');
  return {contract, source: {path: CONTRACT_PATH, sha256: createHash('sha256').update(raw).digest('hex'), version: contract.schema_version}};
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
export function buildOwnerTiebreakRequest({flat, planning, artifactBindings, sources}) {
  const {contract, source} = loadOwnerTiebreakContract();
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
export function resolveOwnerTiebreak({flat, request, response}) {
  const {contract} = loadOwnerTiebreakContract();
  if (!object(response?.answers)) fail('ADAPTIVE_OWNER_TIEBREAK_RESPONSE');
  return flat.map(row => {
    const answer = response.answers[row.question_id], criteria = request.questions[row.question_id].criteria;
    if (!object(answer) || answer.type !== 'choice' || !Object.hasOwn(criteria, answer.choice)
      || (answer.probabilities !== undefined && (!object(answer.probabilities)
        || Object.values(answer.probabilities).some(value => !Number.isFinite(value) || value < 0 || value > 1)))) fail('ADAPTIVE_OWNER_TIEBREAK_RESPONSE');
    const stillFlat = answer.choice === 'unknown' || tiedArtifacts(answer, answer.choice, contract.flat_rule) !== null;
    return {question_id: row.question_id, failure_id: row.failure_id, tied: structuredClone(row.tied),
      second_choice: answer.choice, second_probabilities: structuredClone(answer.probabilities ?? null),
      status: stillFlat ? 'unresolved_worker_chooses' : 'resolved', artifact_ids: stillFlat ? structuredClone(row.tied) : [answer.choice]};
  });
}
