import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareDecision} from '../client.mjs';

// D077: label opaque owner options (A01..A22) with their inline path and description; keys stay artifact IDs.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-owner-criteria.v1.json';
const fail = code => { throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };

export function loadOwnerCriteriaContract() {
  const raw = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url), 'utf8'), contract = JSON.parse(raw);
  if (contract.schema_version !== 'adaptive-owner-criteria/v1') fail('ADAPTIVE_OWNER_CRITERIA_CONTRACT_INVALID');
  return {...contract, source: {path: CONTRACT_PATH, sha256: createHash('sha256').update(raw).digest('hex')}};
}

/** Return a new request whose null artifact options carry the artifact's inline paths and description. */
export function describeOwnerCriteria(request, contract = loadOwnerCriteriaContract()) {
  const artifacts = new Map((request?.state?.artifact_contracts ?? []).map(row => [row.id, row]));
  if (!artifacts.size) fail('ADAPTIVE_OWNER_CRITERIA_STATE');
  const label = row => (row.description ? contract.artifact_description_template : contract.missing_description)
    .replace('{paths}', row.paths.join(', ')).replace('{description}', row.description ?? '');
  const questions = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
    const criteria = Object.fromEntries(Object.entries(question.criteria).map(([key, value]) => {
      if (key === 'unknown') return [key, value];
      if (value !== null || !artifacts.has(key)) fail('ADAPTIVE_OWNER_CRITERIA_UNEXPECTED');
      return [key, label(artifacts.get(key))];
    }));
    return [id, {...question, criteria}];
  }));
  return prepareDecision({...request, questions}).body;
}
