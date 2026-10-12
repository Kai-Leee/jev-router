import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';

const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-repair-budget.v1.json';
const copy = structuredClone;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const need = (ok, code) => { if (!ok) throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };

const contractBytes = readFileSync(new URL(`../../${CONTRACT_PATH}`, import.meta.url));
const contract = JSON.parse(contractBytes);
export const ADAPTIVE_REPAIR_BUDGET_SOURCE = Object.freeze({path: CONTRACT_PATH, sha256: hash(contractBytes)});
const STEP_IDS = ['history_delta', 'drop_passed_observations', 'dedupe_evidence_relations', 'compact_unfocused_interfaces', 'compact_unfocused_quotes'];
need(contract.schema_version === 'adaptive-repair-budget-contract/v1' && contract.policy === 'repair-budget-v1'
  && same(contract.steps.map(step => step.id), STEP_IDS) && contract.bytes_per_token > 0
  && contract.target_fraction > 0 && contract.target_fraction <= 1, 'ADAPTIVE_REPAIR_BUDGET_CONTRACT');
const step = id => contract.steps.find(row => row.id === id);
const TARGET_TOKENS = Math.floor(contract.limit.state_plus_longest_question_tokens * contract.target_fraction);

/** Estimate only: calibrated bytes per token, not an exact tokenizer. */
export function measureRepairBudget(request) {
  const longest = Math.max(0, ...Object.values(request.questions ?? {}).map(bytes));
  const measured = bytes(request.state) + longest + contract.reserved_question_bytes;
  const estimated = Math.ceil(measured / contract.bytes_per_token);
  return {state_bytes: bytes(request.state), longest_question_bytes: longest, reserved_question_bytes: contract.reserved_question_bytes,
    measured_bytes: measured, estimated_tokens: estimated, target_tokens: TARGET_TOKENS, within_budget: estimated <= TARGET_TOKENS};
}

const shorten = (value, max) => {
  const first = value.split(/(?<=\.)\s/)[0];
  return (first.length <= max ? first : `${first.slice(0, max - 1)}…`);
};

function referencedShared(state) {
  const used = new Set();
  const visit = value => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (object(value)) for (const [key, child] of Object.entries(value)) {
      if (key === 'description_provenance' && object(child) && typeof child.same_as === 'string') used.add(child.same_as);
      visit(child);
    }
  };
  visit(state);
  return used;
}

function focusArtifacts(state) {
  const failing = new Set((state.detailed_failed_cases ?? []).flatMap(row => row.original_requirement_ids ?? []));
  const entries = Array.isArray(state.repair_history?.entries) ? state.repair_history.entries : [];
  const focus = new Set(entries.flatMap(entry => [...(entry.selected_artifact_ids ?? []), ...(entry.changed_artifact_ids ?? [])]));
  for (const unit of state.unit_interfaces ?? []) {
    if ((unit.requirement_ids ?? []).some(id => failing.has(id))) (unit.artifact_ids ?? []).forEach(id => focus.add(id));
  }
  const direct = new Set(focus);
  for (const task of state.task_dependencies ?? []) {
    if ((task.output_artifact_ids ?? []).some(id => direct.has(id))) (task.input_artifact_ids ?? []).forEach(id => focus.add(id));
  }
  return focus;
}

/** Lossy, opt-in owner-request budget. Every removed value stays in the report with its pointer. */
export function packRepairOwnerRequest(request, {policy} = {}) {
  need(policy === contract.policy, 'ADAPTIVE_REPAIR_BUDGET_POLICY');
  need(object(request?.state) && object(request.questions), 'ADAPTIVE_REPAIR_BUDGET_INPUT');
  need(!Object.hasOwn(request.state, 'repair_budget'), 'ADAPTIVE_REPAIR_BUDGET_ALREADY_APPLIED');
  const before = measureRepairBudget(request), output = copy(request), state = output.state, omissions = [], applied = [];
  // Only the projected v2 owner shape is packed; a raw fallback is measured and, if too large, stopped before sending.
  const packable = state.schema_version === contract.owner_schema;
  const omit = (pointer, value) => omissions.push({pointer, sha256: digest(value), value: copy(value)});
  const pruneShared = () => {
    if (!object(state.repair_input_shared_evidence)) return;
    const used = referencedShared(state);
    for (const id of Object.keys(state.repair_input_shared_evidence)) if (!used.has(id)) {
      omit(`/repair_input_shared_evidence/${id}`, state.repair_input_shared_evidence[id]);
      delete state.repair_input_shared_evidence[id];
    }
    if (!Object.keys(state.repair_input_shared_evidence).length) delete state.repair_input_shared_evidence;
  };
  const steps = {
    history_delta() {
      const entries = state.repair_history?.entries;
      if (!Array.isArray(entries) || !entries.length) return false;
      const keep = step('history_delta').keep_fields;
      let changed = false;
      entries.forEach((entry, index) => {
        for (const key of Object.keys(entry)) if (!keep.includes(key)) {
          omit(`/repair_history/entries/${index}/${key}`, entry[key]); delete entry[key]; changed = true;
        }
      });
      return changed;
    },
    drop_passed_observations() {
      if (!Object.hasOwn(state, 'additional_observed_cases')) return false;
      omit('/additional_observed_cases', state.additional_observed_cases); delete state.additional_observed_cases;
      return true;
    },
    dedupe_evidence_relations() {
      const rows = state.recovery_source_evidence;
      if (!Array.isArray(rows) || !rows.some(row => Object.hasOwn(row, 'relations') || Object.hasOwn(row, 'selection_basis'))) return false;
      const relations = new Map(), bases = new Set();
      rows.forEach((row, index) => {
        for (const relation of row.relations ?? []) {
          const tuple = [relation.producer_artifact_id, relation.consumer_artifact_id, relation.basis, relation.symbols ?? []];
          relations.set(JSON.stringify(tuple), tuple);
        }
        if (typeof row.selection_basis === 'string') bases.add(row.selection_basis);
        for (const key of ['relations', 'selection_basis']) if (Object.hasOwn(row, key)) { omit(`/recovery_source_evidence/${index}/${key}`, row[key]); delete row[key]; }
      });
      state.repair_budget.recovery_relations = [...relations.values()];
      if (bases.size) state.repair_budget.recovery_selection_basis = [...bases];
      return true;
    },
    compact_unfocused_interfaces() {
      const focus = focusArtifacts(state), max = step('compact_unfocused_interfaces').max_chars;
      let changed = false;
      (state.unit_interfaces ?? []).forEach((unit, index) => {
        if ((unit.artifact_ids ?? []).some(id => focus.has(id)) || typeof unit.interface !== 'string') return;
        const short = shorten(unit.interface, max);
        if (short.length >= unit.interface.length) return;
        omit(`/unit_interfaces/${index}/interface`, unit.interface); unit.interface = short; changed = true;
      });
      return changed;
    },
    compact_unfocused_quotes() {
      const focus = focusArtifacts(state), max = step('compact_unfocused_quotes').max_chars, keep = new Set();
      for (const row of state.artifact_contracts ?? []) if (focus.has(row.id)) (row.evidence_ids ?? []).forEach(id => keep.add(id));
      for (const unit of state.unit_interfaces ?? []) if ((unit.artifact_ids ?? []).some(id => focus.has(id))) (unit.evidence_ids ?? []).forEach(id => keep.add(id));
      let changed = false;
      (state.evidence_quotes ?? []).forEach((row, index) => {
        if (keep.has(row.id) || typeof row.quote !== 'string' || row.quote.length <= max) return;
        omit(`/evidence_quotes/${index}/quote`, row.quote); row.quote = `${row.quote.slice(0, max - 1)}…`; changed = true;
      });
      return changed;
    },
  };
  if (!before.within_budget && packable) {
    state.repair_budget = {policy: contract.policy, applied_steps: [], note: contract.state_note};
    for (const id of STEP_IDS) {
      if (!steps[id]()) continue;
      pruneShared();
      state.repair_budget.applied_steps.push(id);
      applied.push({id, ...measureRepairBudget(output)});
      if (applied.at(-1).within_budget) break;
    }
    if (!applied.length) delete state.repair_budget;
  }
  const after = measureRepairBudget(output);
  const report = {schema_version: 'adaptive-repair-budget-report/v1', policy: contract.policy, contract_source: {...ADAPTIVE_REPAIR_BUDGET_SOURCE},
    input_request_sha256: digest(request), output_request_sha256: digest(output), packable, before, after, applied_steps: applied,
    within_budget: after.within_budget, lossless: applied.length === 0, omissions, original_request: copy(request),
    exact_model_tokens: null, provider_acceptance: 'unmeasured',
    boundary: 'Estimate from calibrated bytes per token; the provider may still reject. Removed values are controller-only.'};
  report.integrity_sha256 = digest(report);
  return {request: output, report};
}

export function restoreRepairBudgetRequest(request, report) {
  need(object(report), 'ADAPTIVE_REPAIR_BUDGET_REPORT');
  const {integrity_sha256, ...body} = report;
  need(integrity_sha256 === digest(body) && digest(request) === report.output_request_sha256
    && digest(report.original_request) === report.input_request_sha256, 'ADAPTIVE_REPAIR_BUDGET_REPORT');
  return copy(report.original_request);
}

export const ADAPTIVE_REPAIR_BUDGET_EXCEEDED = contract.over_budget_code;
