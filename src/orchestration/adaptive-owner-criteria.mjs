import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareDecision} from '../client.mjs';

// D077: label opaque owner options (A01..A22) with their inline path and description; keys stay artifact IDs.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-owner-criteria.v1.json';
const fail = code => { throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };

export function loadOwnerCriteriaContract(path = CONTRACT_PATH) {
  const raw = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'), contract = JSON.parse(raw);
  if (!['adaptive-owner-criteria/v1', 'adaptive-owner-criteria/v2'].includes(contract.schema_version)) fail('ADAPTIVE_OWNER_CRITERIA_CONTRACT_INVALID');
  return {...contract, source: {path, sha256: createHash('sha256').update(raw).digest('hex')}};
}

/** Return a new request whose null artifact options carry inline labels. v2 falls back to shorter labels, then none, to fit max_question_bytes. */
export function describeOwnerCriteria(request, contract = loadOwnerCriteriaContract()) {
  const artifacts = new Map((request?.state?.artifact_contracts ?? []).map(row => [row.id, row]));
  if (!artifacts.size) fail('ADAPTIVE_OWNER_CRITERIA_STATE');
  for (const question of Object.values(request.questions)) for (const [key, value] of Object.entries(question.criteria)) {
    if (key !== 'unknown' && (value !== null || !artifacts.has(key))) fail('ADAPTIVE_OWNER_CRITERIA_UNEXPECTED');
  }
  const templates = contract.label_templates ?? [contract.artifact_description_template];
  const labelled = template => Object.fromEntries(Object.entries(request.questions).map(([id, question]) => [id, {...question,
    criteria: Object.fromEntries(Object.entries(question.criteria).map(([key, value]) => {
      if (key === 'unknown') return [key, value];
      const row = artifacts.get(key), chosen = row.description ? template : contract.missing_description ?? '{paths}';
      return [key, chosen.replace('{paths}', row.paths.join(', ')).replace('{description}', row.description ?? '')];
    }))}]));
  const fits = questions => !contract.max_question_bytes
    || Object.values(questions).every(question => Buffer.byteLength(JSON.stringify(question)) <= contract.max_question_bytes);
  const questions = templates.map(labelled).find(fits) ?? request.questions;
  return prepareDecision({...request, questions}).body;
}
