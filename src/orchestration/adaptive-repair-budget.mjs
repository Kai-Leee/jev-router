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

function ownerSteps(state, omit) {
  return {
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
  const steps = ownerSteps(state, omit);
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

// D081 repair-budget-v2: raw owner-state steps and split owner requests. v1 above is unchanged.
const CONTRACT_V2_PATH = 'docs/orchestration/contracts/adaptive-repair-budget.v2.json';
const contractV2Bytes = readFileSync(new URL(`../../${CONTRACT_V2_PATH}`, import.meta.url));
const contractV2 = JSON.parse(contractV2Bytes);
export const ADAPTIVE_REPAIR_BUDGET_V2_SOURCE = Object.freeze({path: CONTRACT_V2_PATH, sha256: hash(contractV2Bytes)});
const RAW_STEP_IDS = ['raw_drop_local_evidence_refs', 'raw_drop_passed_public_cases', 'raw_scope_requirements',
  'raw_compact_unfocused_interfaces', 'raw_compact_unfocused_quotes'];
need(contractV2.schema_version === 'adaptive-repair-budget-contract/v2' && contractV2.policy === 'repair-budget-v2'
  && same(contractV2.steps.map(row => row.id), [...STEP_IDS, ...RAW_STEP_IDS]) && contractV2.owner_schema === contract.owner_schema
  // One measurement serves both versions.
  && ['limit', 'target_fraction', 'bytes_per_token', 'reserved_question_bytes', 'over_budget_code'].every(key => same(contractV2[key], contract[key])),
'ADAPTIVE_REPAIR_BUDGET_CONTRACT');
const stepV2 = id => contractV2.steps.find(row => row.id === id);
const ownerQuestionId = row => `owner.${hash(JSON.stringify({assertion_id: row.testcase?.failed_assertion_id ?? null,
  check_id: row.check_id, test_id: row.testcase?.test_id ?? row.testcase?.id})).slice(0, 20)}`;

/** Failed cases in request order with their question IDs, or null when the state shape is not packable. */
function ownerCases(request) {
  const state = request.state, ids = Object.keys(request.questions).sort();
  let rows = null;
  if (state.schema_version === contractV2.raw_owner_schema && Array.isArray(state.failures)) {
    rows = state.failures.map(row => ({question_id: row.question_id, check_id: row.check_id, requirement_ids: row.requirement_ids ?? []}));
  } else if (state.schema_version === contractV2.owner_schema && Array.isArray(state.detailed_failed_cases)) {
    rows = state.detailed_failed_cases.map(row => ({question_id: ownerQuestionId(row), check_id: row.check_id,
      requirement_ids: row.original_requirement_ids ?? []}));
  }
  return rows && same(rows.map(row => row.question_id).sort(), ids) ? rows : null;
}

const causalRequirements = state => (state.causal_paths ?? []).flatMap(chain => chain.requirement_ids ?? []);
const resolvedLocal = (failure, row) => ({...(failure.repair_projection?.check_defaults?.[row.check_defaults_ref] ?? {}), ...row});

function rawFocus(state) {
  const failing = new Set((state.failures ?? []).flatMap(row => row.requirement_ids ?? [])), focus = new Set();
  for (const unit of state.units ?? []) if ((unit.requirement_ids ?? []).some(id => failing.has(id))) (unit.artifact_ids ?? []).forEach(id => focus.add(id));
  const direct = new Set(focus);
  for (const task of state.tasks ?? []) {
    if ((task.output_artifact_ids ?? []).some(id => direct.has(id))) (task.input_artifact_ids ?? []).forEach(id => focus.add(id));
  }
  return focus;
}

function rawSteps(state, omit) {
  return {
    raw_drop_local_evidence_refs() {
      const failure = state.failure, rows = failure?.local_evidence;
      if (!Array.isArray(rows)) return false;
      const kept = rows.filter(row => { const value = resolvedLocal(failure, row); return value.status !== 'passed' || value.executed !== true; });
      if (kept.length === rows.length) return false;
      omit('/failure/local_evidence', rows); failure.local_evidence = kept;
      return true;
    },
    raw_drop_passed_public_cases() {
      let changed = false;
      (state.failure?.public_evidence ?? []).forEach((row, index) => {
        const cases = row.evidence?.cases;
        if (!Array.isArray(cases) || !cases.some(item => item.status === 'passed')) return;
        omit(`/failure/public_evidence/${index}/evidence/cases`, cases);
        row.evidence.cases = cases.filter(item => item.status !== 'passed'); changed = true;
      });
      return changed;
    },
    raw_scope_requirements() {
      const keep = new Set([...(state.failures ?? []).flatMap(row => row.requirement_ids ?? []), ...causalRequirements(state)]);
      const rows = state.requirement_descriptions;
      if (!Array.isArray(rows) || rows.every(row => keep.has(row.id))) return false;
      omit('/requirement_descriptions', rows); state.requirement_descriptions = rows.filter(row => keep.has(row.id));
      return true;
    },
    raw_compact_unfocused_interfaces() {
      const focus = rawFocus(state), max = stepV2('raw_compact_unfocused_interfaces').max_chars;
      let changed = false;
      (state.units ?? []).forEach((unit, index) => {
        if ((unit.artifact_ids ?? []).some(id => focus.has(id)) || typeof unit.interface !== 'string') return;
        const short = shorten(unit.interface, max);
        if (short.length >= unit.interface.length) return;
        omit(`/units/${index}/interface`, unit.interface); unit.interface = short; changed = true;
      });
      return changed;
    },
    raw_compact_unfocused_quotes() {
      const focus = rawFocus(state), max = stepV2('raw_compact_unfocused_quotes').max_chars, keep = new Set();
      for (const row of state.artifacts ?? []) if (focus.has(row.id)) (row.evidence_ids ?? []).forEach(id => keep.add(id));
      for (const unit of state.units ?? []) if ((unit.artifact_ids ?? []).some(id => focus.has(id))) (unit.evidence_ids ?? []).forEach(id => keep.add(id));
      let changed = false;
      (state.evidence ?? []).forEach((row, index) => {
        if (keep.has(row.id) || typeof row.quote !== 'string' || row.quote.length <= max) return;
        omit(`/evidence/${index}/quote`, row.quote); row.quote = `${row.quote.slice(0, max - 1)}…`; changed = true;
      });
      return changed;
    },
  };
}

/** Restrict one request to the listed failed cases; the public gate summary and contracts stay complete. */
function focusPart(output, ids, part, parts, omit) {
  const state = output.state, keep = new Set(ids), checks = new Set(), requirements = new Set(causalRequirements(state));
  for (const id of Object.keys(output.questions)) if (!keep.has(id)) { omit(`/questions/${id}`, output.questions[id]); delete output.questions[id]; }
  const restrict = (pointer, rows, test) => {
    const kept = rows.filter(test);
    if (kept.length !== rows.length) omit(pointer, rows);
    return kept;
  };
  if (state.schema_version === contractV2.raw_owner_schema) {
    state.failures = restrict('/failures', state.failures, row => keep.has(row.question_id));
    for (const row of state.failures) { checks.add(row.check_id); (row.requirement_ids ?? []).forEach(id => requirements.add(id)); }
    const tests = new Set(state.failures.map(row => `${row.check_id}\n${row.test_id}`));
    (state.failure?.public_evidence ?? []).forEach((row, index) => {
      if (!object(row.evidence)) return;
      if (checks.has(row.check_id)) {
        // Failed cases owned by sibling parts shrink to IDs; this part's cases and passed cases stay for the steps.
        const cases = row.evidence.cases;
        if (!Array.isArray(cases) || cases.every(item => item.status !== 'failed' || tests.has(`${row.check_id}\n${item.test_id ?? item.id}`))) return;
        omit(`/failure/public_evidence/${index}/evidence/cases`, cases);
        row.evidence.cases = cases.map(item => item.status !== 'failed' || tests.has(`${row.check_id}\n${item.test_id ?? item.id}`) ? item
          : {test_id: item.test_id ?? item.id, status: 'failed', sibling_part: true});
        return;
      }
      // A sibling check keeps its status, error and unexecuted IDs; its failed cases remain visible as IDs only.
      omit(`/failure/public_evidence/${index}/evidence`, row.evidence);
      const {error = null, unexecuted_test_ids = [], cases = []} = row.evidence;
      row.evidence = {error, unexecuted_test_ids, cases: (Array.isArray(cases) ? cases : []).filter(item => item.status === 'failed')
        .map(item => ({test_id: item.test_id ?? item.id, status: 'failed'})), sibling_part_summary: true};
    });
    state.requirement_descriptions = restrict('/requirement_descriptions', state.requirement_descriptions, row => requirements.has(row.id));
  } else {
    state.detailed_failed_cases = restrict('/detailed_failed_cases', state.detailed_failed_cases, row => keep.has(ownerQuestionId(row)));
    for (const row of state.detailed_failed_cases) { checks.add(row.check_id); (row.original_requirement_ids ?? []).forEach(id => requirements.add(id)); }
    if (Array.isArray(state.failed_check_contexts)) state.failed_check_contexts = restrict('/failed_check_contexts', state.failed_check_contexts, row => checks.has(row.check_id));
    state.original_requirements = restrict('/original_requirements', state.original_requirements, row => requirements.has(row.id));
  }
  state.owner_split = {part, parts, question_ids: [...ids], note: contractV2.split_note};
}

function packPart(request, {ids = null, part = 1, parts = 1} = {}) {
  const output = copy(request), state = output.state, omissions = [], applied = [];
  const omit = (pointer, value) => omissions.push({pointer, sha256: digest(value), value: copy(value)});
  if (ids) focusPart(output, ids, part, parts, omit);
  const raw = state.schema_version === contractV2.raw_owner_schema;
  const steps = raw ? rawSteps(state, omit) : ownerSteps(state, omit), order = raw ? RAW_STEP_IDS : STEP_IDS;
  if (!measureRepairBudget(output).within_budget) {
    state.repair_budget = {policy: contractV2.policy, applied_steps: [], note: contractV2.state_note};
    for (const id of order) {
      if (!steps[id]()) continue;
      state.repair_budget.applied_steps.push(id);
      applied.push({id, ...measureRepairBudget(output)});
      if (applied.at(-1).within_budget) break;
    }
    if (!applied.length) delete state.repair_budget;
  }
  const after = measureRepairBudget(output);
  return {request: output, question_ids: Object.keys(output.questions), report: {part, parts, output_request_sha256: digest(output),
    applied_steps: applied, after, within_budget: after.within_budget, omissions}};
}

/** v2: pack the whole owner request, or split it into focused parts that each fit. Removed values stay in the report. */
export function planRepairOwnerRequest(request, {policy} = {}) {
  need(policy === contractV2.policy, 'ADAPTIVE_REPAIR_BUDGET_POLICY');
  need(object(request?.state) && object(request.questions), 'ADAPTIVE_REPAIR_BUDGET_INPUT');
  need(!Object.hasOwn(request.state, 'repair_budget') && !Object.hasOwn(request.state, 'owner_split'), 'ADAPTIVE_REPAIR_BUDGET_ALREADY_APPLIED');
  const before = measureRepairBudget(request), cases = ownerCases(request);
  const finish = (parts, reason = null) => {
    const report = {schema_version: 'adaptive-repair-budget-plan/v1', policy: contractV2.policy, contract_source: {...ADAPTIVE_REPAIR_BUDGET_V2_SOURCE},
      input_request_sha256: digest(request), packable: cases !== null, before, split: parts.length > 1, reason,
      parts: parts.map(row => row.report), within_budget: parts.length > 0 && parts.every(row => row.report.within_budget),
      lossless: parts.length === 1 && !parts[0].report.omissions.length, original_request: copy(request),
      exact_model_tokens: null, provider_acceptance: 'unmeasured',
      boundary: 'Estimate from calibrated bytes per token; the provider may still reject. Removed values are controller-only.'};
    report.after = parts.length === 1 ? parts[0].report.after : null;
    report.integrity_sha256 = digest(report);
    return {parts, report};
  };
  // An unknown state shape is measured only; if it is over the target the caller stops before sending.
  if (!cases) return finish([{request: copy(request), question_ids: Object.keys(request.questions), report: {part: 1, parts: 1,
    output_request_sha256: digest(request), applied_steps: [], after: before, within_budget: before.within_budget, omissions: []}}],
  before.within_budget ? null : 'UNPACKABLE_STATE');
  const whole = packPart(request);
  if (whole.report.within_budget) return finish([whole]);
  // Check blocks in first-appearance order; a block that alone is over the target is split case by case.
  const blocks = [];
  for (const row of cases) {
    const last = blocks.at(-1);
    if (last?.check_id === row.check_id) last.ids.push(row.question_id); else blocks.push({check_id: row.check_id, ids: [row.question_id]});
  }
  const fits = ids => packPart(request, {ids, part: 99, parts: 99}).report.within_budget;
  const groups = []; let current = [];
  const add = id => {
    if (fits([...current, id])) { current.push(id); return true; }
    if (!current.length) return false;
    groups.push(current); current = [id];
    return fits(current);
  };
  for (const block of blocks) {
    if (fits([...current, ...block.ids])) { current.push(...block.ids); continue; }
    if (current.length && fits(block.ids)) { groups.push(current); current = [...block.ids]; continue; }
    for (const id of block.ids) if (!add(id)) return finish([], 'SINGLE_CASE_OVER_TARGET');
  }
  if (current.length) groups.push(current);
  return finish(groups.map((ids, index) => packPart(request, {ids, part: index + 1, parts: groups.length})));
}

export const ADAPTIVE_REPAIR_BUDGET_POLICIES = Object.freeze(['repair-budget-v1', 'repair-budget-v2']);
