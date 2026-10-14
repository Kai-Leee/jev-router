import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {buildCausalRepairWorkerContext} from './adaptive-causal-repair.mjs';

// D085 check_error_repair generation-direct-v1. A public check blocked by an import or syntax error goes straight to a
// repair worker for the code-generation artifacts; no Jev owner inference is made for that round.
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-check-error-repair.v1.json';
export const CHECK_ERROR_CANDIDATE_ID = 'repair-check-error-generation';

const fail = code => { const error = new Error(code); error.code = code; throw error; };
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const clone = value => structuredClone(value);

export function loadCheckErrorRepairContract() {
  const raw = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url), 'utf8'), contract = JSON.parse(raw);
  if (contract.schema_version !== 'adaptive-check-error-repair/v1' || contract.policy !== 'generation-direct-v1') fail('ADAPTIVE_CHECK_ERROR_CONTRACT');
  return {contract, source: {path: CONTRACT_PATH, sha256: createHash('sha256').update(raw).digest('hex'), version: contract.schema_version}};
}

/** Public checks that raised one of the contract's error codes before any test ran. */
export function blockedCheckErrors(failure, contract = loadCheckErrorRepairContract().contract) {
  return (failure?.public_evidence ?? []).filter(report => report.status === 'failed' && report.evidence?.error
    && contract.error_codes.includes(report.evidence.error.code) && (report.evidence.unexecuted_test_ids ?? []).length)
    .map(report => ({check_id: report.check_id, code: report.evidence.error.code, message: report.evidence.error.message ?? null,
      unexecuted_test_count: report.evidence.unexecuted_test_ids.length}));
}

const generationPath = (path, rule) => {
  const parts = path.split('/');
  return rule.basenames.includes(parts.at(-1)) || parts.slice(0, -1).some(part => rule.directory_segments.includes(part));
};

export function checkErrorCandidate({plan, artifactBindings, errors, contract = loadCheckErrorRepairContract().contract}) {
  if (!errors.length) return null;
  const artifact_ids = plan.artifacts.map(row => row.id)
    .filter(id => (artifactBindings[id]?.paths ?? []).some(path => generationPath(path, contract.generation_paths)));
  if (!artifact_ids.length) return null;
  const task_ids = plan.tasks.filter(task => task.kind === 'implementation' && task.output_artifact_ids.some(id => artifact_ids.includes(id)))
    .map(task => task.id);
  return {id: CHECK_ERROR_CANDIDATE_ID, task_ids, artifact_ids, read_artifact_ids: [], reason: contract.candidate_reason,
    evidence_refs: [...new Set(errors.map(row => `check_error:${row.check_id}`))],
    attribution_basis: 'check_error_generation_scope_not_fault_proof'};
}

/** Adds the direct candidate to the sealed causal scope so the unchanged causal validator accepts it. */
export function withCheckErrorScope({analysis, candidate, errors, diagnoses}) {
  const {sha256: prior, ...causal} = analysis.causal;
  causal.choice_bindings = {...causal.choice_bindings, [candidate.id]: digest(candidate)};
  causal.check_error_repair = {policy: 'generation-direct-v1', prior_sha256: prior, candidate_id: candidate.id,
    errors: clone(errors), diagnoses_sha256: digest(diagnoses)};
  return {...clone(analysis), causal: {...causal, sha256: digest(causal)}};
}

/** Causal worker packet plus the blocking errors and the controller's reproduction of the generated files. */
export function buildCheckErrorWorkerContext({checkError, ...input}) {
  const {contract, source} = loadCheckErrorRepairContract();
  const sealed = input.failure.repair_scope?.causal?.check_error_repair;
  if (!sealed || sealed.candidate_id !== input.candidate.id || sealed.diagnoses_sha256 !== digest(checkError.diagnoses)
    || digest(sealed.errors) !== digest(checkError.errors)) fail('ADAPTIVE_CHECK_ERROR_BINDING');
  const built = buildCausalRepairWorkerContext(input);
  const context = {...built.context, instructions: `${built.context.instructions}\n\n${contract.worker_instructions}`,
    check_error_repair: {contract: source, errors: clone(checkError.errors), diagnoses: clone(checkError.diagnoses)}};
  return {...built, context, report: {...built.report, check_error_contract: source,
    diagnosed_files: checkError.diagnoses.flatMap(row => (row.files ?? []).map(file => file.path)),
    packet_bytes: Buffer.byteLength(JSON.stringify(context))}};
}
