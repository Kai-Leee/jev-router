// Explicit D075 input policy. All model facts remain inline; proofs are local.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {isDeepStrictEqual} from 'node:util';
import {prepareDecision} from '../client.mjs';

const clone = structuredClone, same = isDeepStrictEqual;
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value)), bytes = value => Buffer.byteLength(JSON.stringify(value));
const own = (value, key) => Object.hasOwn(value, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const need = (value, code) => { if (!value) throw Object.assign(new Error(code), {code, outcome_uncertain: false}); };
const contractPath = 'docs/orchestration/contracts/adaptive-repair-input.v1.json';
const contractBytes = readFileSync(new URL(`../../${contractPath}`, import.meta.url));
const contract = JSON.parse(contractBytes);
const source = {path: contractPath, sha256: hash(contractBytes), schema_version: contract.schema_version};
const sha = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const canonical = value => Array.isArray(value) ? value.map(canonical) : object(value)
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const seal = value => ({...value, integrity_sha256: digest(value)});
const unique = values => [...new Set(values)];
export function loadRepairInputContract() { return {...clone(contract), source: clone(source)}; }
const basePriorFields = ['check_id', 'test_id', 'requirement_ids', 'owner_task_ids', 'evidence_level', 'artifact_ids'];
const assignmentFields = ['check_id', 'test_id', 'assertion_id', 'failure_id', 'requirement_ids', 'status', 'artifact_id', 'owner_task_id'];
const attributionRules = 'Attribution references resolve only inside this state. First merge observed_failure_defaults into each observed_failures row; row fields override defaults. observed_failure_ref identifies that exact row. In inferred_ownership.assignments, from_observed_failure reconstructs check_id, test_id, requirement_ids from that row, assertion_id from it (null if absent), failure_id from the reference, status from owner_inference_status, and artifact_id/owner_task_id from the sole artifact_ids/owner_task_ids when inferred (both null when unknown). Literal fields beside the reference override reconstructed values and unknown extra fields remain literal. In prior_observed_failures, from_prior_attribution reconstructs only check_id, test_id, requirement_ids, owner_task_ids, evidence_level, artifact_ids: use the observed row prior_attribution value when present, otherwise its current value; literal fields beside the reference override these values. These are earlier attribution hypotheses, not observed defects. prior_unresolved_groups reconstruct each original row by reading check_id/test_id from its failure_refs and adding details. The groups retain historical mapping limitations; they do not mark current unknown failures resolved. All current public cases, not-reached assertions, original requirements and legal candidate scopes remain unchanged.';
const ruleNotice = '\n\nUse failure.repair_scope.attribution_reference_rules to read repeated attribution facts. Every reference resolves to an inline observed failure; literal differences remain visible.';

function fullObserved(scope) {
  return scope.observed_failures.map(row => ({...clone(scope.observed_failure_defaults ?? {}), ...clone(row)}));
}
function assignmentBase(row, ref) {
  if (!row || !['inferred', 'unknown'].includes(row.owner_inference_status)
    || (row.owner_inference_status === 'inferred' && (row.artifact_ids?.length !== 1 || row.owner_task_ids?.length !== 1))) return null;
  return {check_id: row.check_id, test_id: row.test_id, assertion_id: row.assertion_id ?? null,
    failure_id: ref, requirement_ids: clone(row.requirement_ids), status: row.owner_inference_status,
    artifact_id: row.owner_inference_status === 'unknown' ? null : row.artifact_ids[0],
    owner_task_id: row.owner_inference_status === 'unknown' ? null : row.owner_task_ids[0]};
}
function priorBase(row) {
  return Object.fromEntries(basePriorFields.map(field => [field,
    clone(own(row.prior_attribution ?? {}, field) ? row.prior_attribution[field] : row[field])]));
}
function referenceRow(value, base, marker, ref) {
  const result = {[marker]: ref};
  for (const [field, item] of Object.entries(value)) if (!own(base, field) || !same(base[field], item)) result[field] = clone(item);
  return result;
}

export function projectRepairChoiceAttribution(request) {
  const original = clone(request), output = clone(request), scope = output.state?.failure?.repair_scope;
  const info = scope?.inferred_ownership;
  need(object(scope) && object(info) && Array.isArray(scope.observed_failures) && Array.isArray(info.assignments), 'SCOPE_MISSING');
  need(!own(scope, 'observed_failure_defaults') && !own(scope, 'attribution_reference_rules')
    && !own(info, 'prior_unresolved_groups'), 'RESERVED_FIELD');
  const steps = [{operation: 'original', wire_bytes: bytes(output)}], rows = scope.observed_failures;
  need(new Set(rows.map(row => JSON.stringify([row.check_id, row.test_id]))).size === rows.length, 'OBSERVED_BINDING');
  need(info.assignments.every(row => !own(row, 'from_observed_failure'))
    && (info.prior_observed_failures ?? []).every(row => !own(row, 'from_prior_attribution')), 'RESERVED_FIELD');
  const refs = new Set();
  for (const row of rows) {
    need(!own(row, 'observed_failure_ref'), 'RESERVED_FIELD');
    const assignments = info.assignments.filter(item => item.check_id === row.check_id && item.test_id === row.test_id
      && (item.assertion_id ?? null) === (row.assertion_id ?? null));
    need(assignments.length === 1 && typeof assignments[0].failure_id === 'string' && !refs.has(assignments[0].failure_id), 'OBSERVED_BINDING');
    row.observed_failure_ref = assignments[0].failure_id; refs.add(row.observed_failure_ref);
  }
  const find = value => rows.find(row => row.check_id === value.check_id && row.test_id === value.test_id);
  let priorRefs = 0, assignmentRefs = 0;
  if (Array.isArray(info.prior_observed_failures)) info.prior_observed_failures = info.prior_observed_failures.map(value => {
    const row = find(value);
    if (!row || !basePriorFields.every(field => own(value, field))) return value;
    const ref = referenceRow(value, priorBase(row), 'from_prior_attribution', row.observed_failure_ref);
    if (bytes(ref) >= bytes(value)) return value;
    priorRefs++; return ref;
  });
  steps.push({operation: 'prior_rows_reference_current_attribution_with_literal_differences', wire_bytes: bytes(output)});
  info.assignments = info.assignments.map(value => {
    const row = find(value), base = assignmentBase(row, value.failure_id);
    if (!base || !assignmentFields.every(field => own(value, field))) return value;
    const ref = referenceRow(value, base, 'from_observed_failure', row.observed_failure_ref);
    if (bytes(ref) >= bytes(value)) return value;
    assignmentRefs++; return ref;
  });
  steps.push({operation: 'assignments_reference_one_current_observation', wire_bytes: bytes(output)});
  if (Array.isArray(info.prior_unresolved) && info.prior_unresolved.length) {
    const groups = [];
    let supported = true;
    for (const value of info.prior_unresolved) {
      const row = find(value);
      if (!row || !own(value, 'check_id') || !own(value, 'test_id')) {supported = false; break;}
      const details = Object.fromEntries(Object.entries(value).filter(([key]) => !['check_id', 'test_id'].includes(key)));
      // Contiguous grouping preserves ordering exactly, including unknown fields.
      const last = groups.at(-1);
      if (last && same(last.details, details)) last.failure_refs.push(row.observed_failure_ref);
      else groups.push({details: clone(details), failure_refs: [row.observed_failure_ref]});
    }
    if (supported && bytes(groups) < bytes(info.prior_unresolved)) {
      info.prior_unresolved_groups = groups; delete info.prior_unresolved;
    }
  }
  steps.push({operation: 'group_identical_historical_mapping_limitations', wire_bytes: bytes(output)});
  const defaults = {};
  for (const field of ['evidence_level', 'owner_inference_id', 'owner_inference_status', 'attribution_basis']) {
    if (rows.length > 1 && rows.every(row => own(row, field) && same(row[field], rows[0][field]))) {
      defaults[field] = clone(rows[0][field]); for (const row of rows) delete row[field];
    }
  }
  if (Object.keys(defaults).length) scope.observed_failure_defaults = defaults;
  scope.attribution_reference_rules = attributionRules;
  output.state.instructions += ruleNotice;
  steps.push({operation: 'share_exact_current_defaults_and_include_readable_rules', wire_bytes: bytes(output)});
  const proof = {schema_version: 'offline-repair-choice-attribution/v1', source_request_sha256: digest(original),
    output_request_sha256: digest(output), original_request: original, steps,
    references: {prior: priorRefs, assignment: assignmentRefs, prior_unresolved_groups: info.prior_unresolved_groups?.length ?? 0},
    changed_scope_paths: ['observed_failures', 'observed_failure_defaults', 'attribution_reference_rules',
      'inferred_ownership.assignments', 'inferred_ownership.prior_observed_failures', 'inferred_ownership.prior_unresolved',
      'inferred_ownership.prior_unresolved_groups'],
    dispatch_allowed: false, provider_acceptance: 'unmeasured'};
  proof.integrity_sha256 = digest(proof);
  need(same(restoreRepairChoiceAttribution(output, proof), original), 'ROUNDTRIP_MISMATCH');
  return {request: output, proof};
}

export function restoreRepairChoiceAttribution(request, proof) {
  const {integrity_sha256, ...body} = proof;
  need(integrity_sha256 === digest(body) && proof.output_request_sha256 === digest(request)
    && proof.source_request_sha256 === digest(proof.original_request), 'PROOF_BINDING');
  const output = clone(request), scope = output.state.failure.repair_scope, info = scope.inferred_ownership;
  const rows = fullObserved(scope), byRef = new Map(rows.map(row => [row.observed_failure_ref, row]));
  need(byRef.size === rows.length, 'REF_COLLISION');
  const rowFor = ref => {const row = byRef.get(ref); need(row, 'UNKNOWN_REF'); return row;};
  info.assignments = info.assignments.map(value => {
    if (!own(value, 'from_observed_failure')) return value;
    const {from_observed_failure: ref, ...overrides} = value, base = assignmentBase(rowFor(ref), ref);
    need(base, 'INVALID_OBSERVED_ASSIGNMENT'); return {...base, ...overrides};
  });
  if (Array.isArray(info.prior_observed_failures)) info.prior_observed_failures = info.prior_observed_failures.map(value => {
    if (!own(value, 'from_prior_attribution')) return value;
    const {from_prior_attribution: ref, ...overrides} = value; return {...priorBase(rowFor(ref)), ...overrides};
  });
  if (own(info, 'prior_unresolved_groups')) {
    need(!own(info, 'prior_unresolved'), 'REF_COLLISION');
    info.prior_unresolved = info.prior_unresolved_groups.flatMap(group => group.failure_refs.map(ref => {
      const row = rowFor(ref); return {check_id: row.check_id, test_id: row.test_id, ...clone(group.details)};
    })); delete info.prior_unresolved_groups;
  }
  scope.observed_failures = rows.map(({observed_failure_ref, ...row}) => row);
  delete scope.observed_failure_defaults; delete scope.attribution_reference_rules;
  need(output.state.instructions.endsWith(ruleNotice), 'RULES_BINDING');
  output.state.instructions = output.state.instructions.slice(0, -ruleNotice.length);
  need(same(output, proof.original_request), 'ROUNDTRIP_MISMATCH');
  // Object insertion order is not model semantics. Return the source order only
  // after exact value equality, so the audit also reproduces original wire bytes.
  return clone(proof.original_request);
}

function visit(value, fn, pointer = '') {
  if (Array.isArray(value)) value.forEach((item, index) => visit(item, fn, `${pointer}/${index}`));
  else if (object(value)) for (const [key, item] of Object.entries(value)) {
    fn(value, key, item, `${pointer}/${key}`);
    if (key !== 'repair_input_shared_evidence') visit(item, fn, `${pointer}/${key}`);
  }
}

// These are named, complete observation records, not a token/string codec.
// Only equal fields are shared; changed runtime/source values stay as objects.
function shareDescriptionEvidence(state) {
  const rows = [];
  visit(state, (parent, field, value, pointer) => {
    if (field === 'description_provenance' && object(value)) {
      need(!own(value, 'same_as') && !own(value, 'overrides'), 'REPAIR_INPUT_RESERVED_FIELD');
      rows.push({parent, field, value: clone(value), pointer});
    }
  });
  const dictionary = {}, used = new Set(), groups = [];
  for (let i = 0; i < rows.length; i++) {
    if (used.has(i)) continue;
    const base = rows[i].value, keys = Object.keys(base).sort(), id = `description-observation-${groups.length + 1}`;
    const members = [];
    for (let j = i; j < rows.length; j++) {
      if (used.has(j) || !same(Object.keys(rows[j].value).sort(), keys)) continue;
      const overrides = Object.fromEntries(Object.entries(rows[j].value).filter(([key, value]) => !same(value, base[key])));
      const reference = {same_as: id, ...(Object.keys(overrides).length ? {overrides} : {})};
      if (bytes(reference) < bytes(rows[j].value)) members.push({index: j, reference});
    }
    const originalBytes = members.reduce((sum, row) => sum + bytes(rows[row.index].value), 0);
    const projectedBytes = bytes({[id]: base}) + members.reduce((sum, row) => sum + bytes(row.reference), 0);
    if (members.length < 2 || projectedBytes >= originalBytes) continue;
    dictionary[id] = clone(base);
    for (const {index, reference} of members) {
      rows[index].parent[rows[index].field] = reference; used.add(index);
    }
    groups.push({id, pointers: members.map(row => rows[row.index].pointer), original_bytes: originalBytes,
      projected_bytes: projectedBytes});
  }
  if (groups.length) state.repair_input_shared_evidence = dictionary;
  return groups;
}

function unshareDescriptionEvidence(state) {
  const dictionary = state.repair_input_shared_evidence ?? {};
  need(object(dictionary), 'REPAIR_INPUT_REFERENCE_TABLE');
  const used = new Set();
  visit(state, (parent, field, value) => {
    if (field !== 'description_provenance' || !object(value) || !own(value, 'same_as')) return;
    need(Object.keys(value).every(key => ['same_as', 'overrides'].includes(key))
      && typeof value.same_as === 'string' && own(dictionary, value.same_as)
      && object(dictionary[value.same_as]) && (value.overrides === undefined || object(value.overrides)), 'REPAIR_INPUT_UNKNOWN_REFERENCE');
    const base = dictionary[value.same_as];
    need(Object.keys(value.overrides ?? {}).every(key => own(base, key)), 'REPAIR_INPUT_REFERENCE_OVERRIDE');
    parent[field] = {...clone(base), ...clone(value.overrides ?? {})}; used.add(value.same_as);
  });
  need(same([...used].sort(), Object.keys(dictionary).sort()), 'REPAIR_INPUT_UNUSED_REFERENCE');
  delete state.repair_input_shared_evidence;
}

function validateRecoveryEvidence(evidence) {
  need(Array.isArray(evidence), 'REPAIR_INPUT_SOURCE_EVIDENCE');
  const seen = new Set();
  for (const row of evidence) {
    need(object(row) && row.schema_version === contract.source_collection.schema_version
      && row.kind === 'static_source_observation' && typeof row.artifact_id === 'string'
      && safeSourcePath(row.path) && sha(row.revision) && sha(row.sha256) && Array.isArray(row.ranges) && row.ranges.length
      && !seen.has(row.path) && row.ranges.every(range => Number.isInteger(range.start_line) && range.start_line >= 1
        && Number.isInteger(range.end_line) && range.end_line >= range.start_line && typeof range.text === 'string'),
    'REPAIR_INPUT_SOURCE_EVIDENCE');
    seen.add(row.path);
  }
}

function ownerSourceBoundaries(evidence) {
  return evidence.map(row => {
    const lines = new Map();
    for (const range of row.ranges) range.text.split('\n').forEach((text, index) => lines.set(range.start_line + index, text));
    const selected = new Set();
    for (const [line, text] of lines) {
      if (!/^(?:(?:from\s+\S+\s+import|import)\s+|__all__\s*=|(?:async\s+)?(?:def|class)\s+[A-Za-z]\w*)/.test(text)) continue;
      selected.add(line);
      let open = (text.match(/\(/g)?.length ?? 0) - (text.match(/\)/g)?.length ?? 0);
      for (let next = line + 1; open > 0 && lines.has(next); next++) {
        selected.add(next); const continuation = lines.get(next);
        open += (continuation.match(/\(/g)?.length ?? 0) - (continuation.match(/\)/g)?.length ?? 0);
      }
    }
    if (!selected.size) return {...clone(row), visible_scope: 'unparsed_selected_ranges_retained', omitted_line_count: 0};
    const ranges = [];
    for (const line of [...selected].sort((a, b) => a - b)) {
      const previous = ranges.at(-1);
      if (previous && previous.end_line + 1 === line) {previous.end_line = line; previous.text += `\n${lines.get(line)}`;}
      else ranges.push({start_line: line, end_line: line, text: lines.get(line)});
    }
    return {...clone(row), ranges, visible_scope: 'imports_public_signatures_and_exports', omitted_line_count: lines.size - selected.size,
      selection_basis: 'Owner routing sees these exact interface boundary lines and static relations. Other inspected body ranges remain controller/chooser/worker-only.'};
  });
}

const caseKey = (check, testcase, assertion = null) => `${check}/${testcase}/${assertion ?? ''}`;
const atPointer = (value, pointer) => pointer.slice(1).split('/').reduce((parent, key) => parent[key], value);
function evidenceContext(context, state) {
  if (!context) return null;
  const {failure, assertionContract: envelope, runtimeBinding: runtime} = context;
  need(object(failure) && object(envelope?.contract) && typeof envelope.source_text === 'string'
    && hash(envelope.source_text) === envelope.sha256 && same(JSON.parse(envelope.source_text), envelope.contract)
    && object(runtime) && Array.isArray(runtime.checker_manifest)
    && runtime.checker_manifest.some(row => row.path === envelope.source_path && row.sha256 === envelope.sha256)
    && runtime.binding_digest === failure.binding_digest && runtime.environment.fingerprint === failure.environment.fingerprint
    && runtime.plan_hash === hash(JSON.stringify(canonical(runtime.plan)))
    && runtime.binding_digest === hash(JSON.stringify(canonical({pinManifest: runtime.checker_manifest,
      environment: runtime.environment, plan_hash: runtime.plan_hash, artifact_bindings: runtime.artifact_bindings})))
    && failure.source_sha256 === state.provenance?.source_sha256 && failure.catalog_sha256 === state.provenance?.catalog_sha256,
  'REPAIR_INPUT_RELEVANCE_BINDING');
  const checks = new Map();
  for (const report of failure.public_evidence) {
    need(report.executed === true && report.outcome_uncertain === false && report.evidence?.error == null
      && same(report.artifact_revisions, failure.artifact_revisions)
      && report.runtime_binding?.binding_digest === runtime.binding_digest
      && report.runtime_binding?.checker_manifest_sha256 === hash(JSON.stringify(canonical(runtime.checker_manifest)))
      && report.runtime_binding?.plan_hash === runtime.plan_hash
      && report.runtime_binding?.environment_fingerprint === runtime.environment.fingerprint,
    'REPAIR_INPUT_RELEVANCE_BINDING');
    for (const testcase of report.evidence.cases ?? []) {
      const id = testcase.test_id ?? testcase.id, key = JSON.stringify([report.check_id, id]);
      need(!checks.has(key), 'REPAIR_INPUT_RELEVANCE_CASE_COLLISION');
      checks.set(key, {report, testcase});
    }
  }
  for (const row of [...(state.detailed_failed_cases ?? []), ...(state.additional_observed_cases ?? [])]) {
    need(same(checks.get(JSON.stringify([row.check_id, row.testcase.test_id ?? row.testcase.id]))?.testcase, row.testcase),
      'REPAIR_INPUT_RELEVANCE_CASE_BINDING');
  }
  return {failure, envelope, runtime, checks};
}

// Explicit semantic relevance step, distinct from exact sharing. It only
// summarizes description diagnostics for proven resolved, unrelated cases.
function projectResolvedObservations(state, context, recoveryEvidence) {
  const report = {schema_version: 'adaptive-resolved-observation-projection/v1', policy: 'resolved-unrelated-v1',
    applied: false, removed_fields: [], input_context: context ? clone(context) : null};
  if (state.schema_version !== contract.owner_schema || !context) {report.reason = 'NO_BOUND_OWNER_RELEVANCE_CONTEXT'; return report;}
  const bound = evidenceContext(context, state), failures = state.detailed_failed_cases ?? [], entries = state.repair_history?.entries ?? [];
  const current = new Set([...failures.flatMap(row => row.original_requirement_ids ?? []),
    ...(state.causal_paths ?? []).flatMap(row => row.requirement_ids ?? [])]);
  // A newly selected source artifact's requirements are conservative closure.
  // Missing artifact→unit mapping retains every historical observation.
  for (const row of recoveryEvidence) {
    const units = (state.unit_interfaces ?? []).filter(unit => unit.artifact_ids?.includes(row.artifact_id));
    if (!units.length || units.some(unit => !Array.isArray(unit.requirement_ids) || !unit.requirement_ids.length)) {
      report.reason = 'UNKNOWN_NEW_SOURCE_REQUIREMENT_RELATION'; return report;
    }
    for (const id of units.flatMap(unit => unit.requirement_ids)) current.add(id);
  }
  if (failures.some(row => !row.original_requirement_ids?.length)) {report.reason = 'UNKNOWN_CURRENT_REQUIREMENT_RELATION'; return report;}
  const eligible = new Map();
  for (const row of state.additional_observed_cases ?? []) {
    const testcase = row.testcase, testId = testcase.test_id ?? testcase.id;
    if (testcase.status !== 'passed' || !object(testcase.description_provenance)
      || !Array.isArray(testcase.assertion_results) || !testcase.assertion_results.length
      || testcase.assertion_results.some(result => result.status !== 'passed')
      || Object.keys(testcase).some(key => !['test_id', 'id', 'status', 'assertions', 'assertion_results', 'description_provenance'].includes(key))) continue;
    const check = bound.checks.get(JSON.stringify([row.check_id, testId]));
    const definitions = testcase.assertion_results.map(result => bound.envelope.contract.assertions.find(assertion =>
      assertion.id === result.assertion_id && assertion.check_id === row.check_id && assertion.test_id === testId));
    if (check?.report.evidence.assertion_contract_sha256 !== bound.envelope.sha256 || definitions.some(row => !row)
      || definitions.some(row => !Array.isArray(row.requirement_ids) || !row.requirement_ids.length
        || !Array.isArray(row.artifact_paths) || !row.artifact_paths.length)) continue;
    const requirements = unique(definitions.flatMap(row => row.requirement_ids));
    if (requirements.some(id => current.has(id))) continue;
    const paths = unique(definitions.flatMap(row => [...row.artifact_paths, ...(row.causal_paths ?? []).map(item => item.path)]));
    const artifactIds = paths.map(path => Object.entries(bound.runtime.artifact_bindings).filter(([,binding]) => binding.paths.includes(path)));
    if (artifactIds.some(rows => rows.length !== 1)) continue;
    const ids = unique(artifactIds.map(rows => rows[0][0])), historyMatches = [];
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index];
      for (let observationIndex = 0; observationIndex < (entry.failures_before ?? []).length; observationIndex++) {
        const observation = entry.failures_before[observationIndex];
        if (observation.check_id !== row.check_id || observation.test_id !== testId
          || !definitions.some(definition => definition.id === observation.assertion_id)
          || Object.keys(observation).some(key => !['check_id', 'test_id', 'assertion_id', 'error_type', 'message', 'description_provenance'].includes(key))) continue;
        const key = caseKey(row.check_id, testId, observation.assertion_id);
        if (!entry.resolved_failure_keys?.includes(key) || entry.unobserved_failure_keys?.includes(key)
          || entry.failures_after?.some(item => item.check_id === row.check_id && item.test_id === testId)
          || ids.some(id => entry.relevant_revisions?.[id]?.after !== bound.failure.artifact_revisions[id])) continue;
        historyMatches.push({index, observationIndex, observation});
      }
    }
    if (!historyMatches.length) continue;
    eligible.set(JSON.stringify([row.check_id, testId]), {row, requirements, ids, historyMatches});
  }
  for (const {row, requirements, ids, historyMatches} of eligible.values()) {
    const currentPointer = `/additional_observed_cases/${state.additional_observed_cases.indexOf(row)}/testcase`;
    const targets = [{target: row.testcase, pointer: currentPointer, kind: 'current_passed'}, ...historyMatches.map(item => ({
      target: item.observation, pointer: `/repair_history/entries/${item.index}/failures_before/${item.observationIndex}`, kind: 'historical_resolved'}))];
    for (const {target, pointer, kind} of targets) {
      if (!own(target, 'description_provenance')) continue;
      need(!own(target, 'resolved_observation_summary'), 'REPAIR_INPUT_RESERVED_FIELD');
      const summary = {status: kind, current_status: 'passed', requirement_ids: clone(requirements),
        diagnostic_detail_access: 'controller_only'};
      report.removed_fields.push({pointer: `${pointer}/description_provenance`, value: clone(target.description_provenance),
        sha256: digest(target.description_provenance), added_pointer: `${pointer}/resolved_observation_summary`, summary: clone(summary),
        check_id: row.check_id, test_id: row.testcase.test_id ?? row.testcase.id,
        bound_requirement_ids: clone(requirements), current_requirement_ids: [...current],
        current_artifact_revisions: Object.fromEntries(ids.map(id => [id, bound.failure.artifact_revisions[id]])),
        reason: 'Same-revision passed case and matching resolved history; known assertion requirements do not intersect current failure, causal or new-source requirements.'});
      delete target.description_provenance; target.resolved_observation_summary = summary;
    }
  }
  report.applied = report.removed_fields.length > 0; report.reason = report.applied ? 'PROVEN_RESOLVED_UNRELATED' : 'NO_PROVEN_UNRELATED_OBSERVATION';
  return report;
}

function restoreResolvedObservations(state, report) {
  for (const row of report?.removed_fields ?? []) {
    const parts = row.pointer.split('/'), field = parts.pop(), target = atPointer(state, parts.join('/'));
    need(!own(target, field) && digest(row.value) === row.sha256
      && same(target.resolved_observation_summary, row.summary), 'REPAIR_INPUT_RELEVANCE_RESTORE');
    target[field] = clone(row.value); delete target.resolved_observation_summary;
  }
}

/** A readable projection with explicit stage visibility; no provider call, token cap or
 * candidate mutation. The original request is retained only in the report. */
export function projectRepairDecisionRequest(request, {stage, recoveryEvidence = [], relevanceContext = null} = {}) {
  need(['repair_owners', 'repair', 'implementation'].includes(stage) && object(request?.state), 'REPAIR_INPUT_STAGE');
  const original = clone(request), state = request.state;
  need(!own(state, 'repair_input') && !own(state, 'repair_input_shared_evidence')
    && !own(state, 'recovery_source_evidence'), 'REPAIR_INPUT_ALREADY_PROJECTED');
  if (stage === 'repair_owners') need(state.schema_version === contract.owner_schema, 'REPAIR_INPUT_OWNER_SCHEMA');
  validateRecoveryEvidence(recoveryEvidence);
  let output = clone(request), attribution = null;
  const relevance = projectResolvedObservations(output.state, relevanceContext, recoveryEvidence);
  const scope = output.state.failure?.repair_scope;
  // A selected worker can receive only part of the observed rows. In that case
  // preserve attribution literally instead of guessing a missing row's link.
  if (stage !== 'repair_owners' && scope?.inferred_ownership
    && Array.isArray(scope.observed_failures) && !scope.other_observed_failures?.length) {
    const projected = projectRepairChoiceAttribution(output);
    if (bytes(projected.request) < bytes(output)) {output = projected.request; attribution = projected.proof;}
  }
  const sharedGroups = shareDescriptionEvidence(output.state);
  output.state.repair_input = {schema_version: 'adaptive-repair-input/v1', policy: contract.policy,
    reference_instructions: contract.reference_instructions,
    source_evidence_instructions: contract.source_evidence_instructions,
    ...(relevance.applied ? {relevance_policy: 'resolved-unrelated-v1', relevance_instructions: contract.relevance_instructions} : {})};
  const visibleRecoveryEvidence = stage === 'repair_owners' ? ownerSourceBoundaries(recoveryEvidence) : clone(recoveryEvidence);
  const omittedSourceLines = visibleRecoveryEvidence.reduce((n, row) => n + (row.omitted_line_count ?? 0), 0);
  if (recoveryEvidence.length) output.state.recovery_source_evidence = visibleRecoveryEvidence;
  const report = seal({schema_version: 'adaptive-repair-input-report/v1', policy: contract.policy,
    contract_source: clone(source), stage, original_request: original,
    input_request_sha256: digest(original), output_request_sha256: digest(output),
    input_wire_bytes: bytes(original), output_wire_bytes: bytes(output),
    attribution, shared_observation_groups: sharedGroups, relevance_projection: relevance, recovery_evidence: clone(recoveryEvidence),
    source_evidence_projection: {mode: stage === 'repair_owners' ? 'owner-interface-boundaries' : 'complete-selected-source-ranges',
      original_bytes: bytes(recoveryEvidence), visible_bytes: bytes(visibleRecoveryEvidence),
      visible_evidence_sha256: digest(visibleRecoveryEvidence), omitted_line_count: omittedSourceLines},
    recovery_evidence_sha256: digest(recoveryEvidence), semantic_values_removed: relevance.removed_fields.length,
    lossless_model_input: !relevance.applied && omittedSourceLines === 0,
    local_token_limit: null, exact_model_tokens: null, provider_acceptance: 'unmeasured',
    model_visibility: 'All referenced observations and source excerpts are inline; the proof is controller-only.'});
  need(same(restoreRepairDecisionRequest(output, report), original), 'REPAIR_INPUT_RESTORE_MISMATCH');
  return {request: output, report};
}

export function restoreRepairDecisionRequest(request, report) {
  need(object(report), 'REPAIR_INPUT_PROOF_BINDING');
  const {integrity_sha256, ...body} = report;
  need(integrity_sha256 === digest(body) && same(report.contract_source, source)
    && report.output_request_sha256 === digest(request) && report.input_request_sha256 === digest(report.original_request),
  'REPAIR_INPUT_PROOF_BINDING');
  const output = clone(request);
  need(same(output.state.repair_input, {schema_version: 'adaptive-repair-input/v1', policy: contract.policy,
    reference_instructions: contract.reference_instructions, source_evidence_instructions: contract.source_evidence_instructions,
    ...(report.relevance_projection?.applied ? {relevance_policy: 'resolved-unrelated-v1', relevance_instructions: contract.relevance_instructions} : {})}),
  'REPAIR_INPUT_RULES_BINDING');
  const expectedEvidence = report.stage === 'repair_owners' ? ownerSourceBoundaries(report.recovery_evidence) : report.recovery_evidence;
  need(same(output.state.recovery_source_evidence ?? [], expectedEvidence)
    && digest(expectedEvidence) === report.source_evidence_projection.visible_evidence_sha256
    && digest(report.recovery_evidence) === report.recovery_evidence_sha256, 'REPAIR_INPUT_EVIDENCE_BINDING');
  validateRecoveryEvidence(report.recovery_evidence);
  delete output.state.repair_input; delete output.state.recovery_source_evidence;
  unshareDescriptionEvidence(output.state);
  const restored = report.attribution ? restoreRepairChoiceAttribution(output, report.attribution) : output;
  restoreResolvedObservations(restored.state, report.relevance_projection);
  need(same(restored, report.original_request), 'REPAIR_INPUT_RESTORE_MISMATCH');
  return clone(report.original_request);
}

/** Wire-only structural audit. This deliberately does not certify relevance,
 * source-file bytes or semantic equality without the controller proof. */
export function validateRepairInputState(state) {
  need(object(state) && object(state.repair_input), 'REPAIR_INPUT_WIRE_POLICY');
  need(same(state.repair_input, {schema_version: 'adaptive-repair-input/v1', policy: contract.policy,
    reference_instructions: contract.reference_instructions, source_evidence_instructions: contract.source_evidence_instructions,
    ...(state.repair_input.relevance_policy === 'resolved-unrelated-v1'
      ? {relevance_policy: 'resolved-unrelated-v1', relevance_instructions: contract.relevance_instructions} : {})}),
  'REPAIR_INPUT_WIRE_RULES');
  const checked = clone(state); unshareDescriptionEvidence(checked);
  validateRecoveryEvidence(state.recovery_source_evidence ?? []);
  const scope = state.failure?.repair_scope;
  if (scope?.attribution_reference_rules !== undefined) {
    need(scope.attribution_reference_rules === attributionRules, 'REPAIR_INPUT_WIRE_RULES');
    const rows = fullObserved(scope), refs = new Map(rows.map(row => [row.observed_failure_ref, row]));
    need(refs.size === rows.length && !refs.has(undefined), 'REPAIR_INPUT_REFERENCE_COLLISION');
    for (const row of scope.inferred_ownership.assignments ?? []) if (own(row, 'from_observed_failure')) {
      need(assignmentBase(refs.get(row.from_observed_failure), row.from_observed_failure), 'REPAIR_INPUT_UNKNOWN_REFERENCE');
    }
    for (const row of scope.inferred_ownership.prior_observed_failures ?? []) if (own(row, 'from_prior_attribution')) {
      need(refs.has(row.from_prior_attribution), 'REPAIR_INPUT_UNKNOWN_REFERENCE');
    }
    for (const group of scope.inferred_ownership.prior_unresolved_groups ?? []) {
      need(Array.isArray(group.failure_refs) && group.failure_refs.every(ref => refs.has(ref)) && object(group.details),
        'REPAIR_INPUT_UNKNOWN_REFERENCE');
    }
  }
  visit(state, (_parent, field, value) => {
    if (field !== 'resolved_observation_summary') return;
    need(state.repair_input.relevance_policy === 'resolved-unrelated-v1' && object(value)
      && ['current_passed', 'historical_resolved'].includes(value.status) && value.current_status === 'passed'
      && Array.isArray(value.requirement_ids) && value.requirement_ids.length > 0, 'REPAIR_INPUT_RELEVANCE_WIRE');
  });
  return {passed: true, policy: contract.policy, relevance_policy: state.repair_input.relevance_policy ?? null,
    shared_observation_count: Object.keys(state.repair_input_shared_evidence ?? {}).length,
    source_evidence_count: (state.recovery_source_evidence ?? []).length,
    semantic_equality_without_controller_proof: 'unverified', provider_acceptance: 'unmeasured'};
}

export function verifyRepairInputOverride(base, override) {
  need(object(override) && object(override.request) && object(override.report), 'REPAIR_INPUT_OVERRIDE');
  need(same(restoreRepairDecisionRequest(override.request, override.report), base), 'REPAIR_INPUT_OVERRIDE_SOURCE');
  const replay = projectRepairDecisionRequest(base, {stage: override.report.stage,
    recoveryEvidence: override.report.recovery_evidence, relevanceContext: override.report.relevance_projection?.input_context ?? null});
  need(same(replay, {request: override.request, report: override.report}), 'REPAIR_INPUT_OVERRIDE_REPLAY');
  if (override.recovery !== undefined) {
    const before = prepareDecision(base), after = prepareDecision(override.request);
    need(same(override.recovery, {schema_version: contract.recovery.schema_version, action: 'rebuild_relevant_input',
      prior_request_sha256: hash(before.serialized), request_sha256: hash(after.serialized),
      evidence_sha256: digest(after.body.state), source_coverage_sha256: digest(override.report)}), 'REPAIR_INPUT_RECOVERY_BINDING');
  }
  return replay;
}

const safeSourcePath = value => typeof value === 'string' && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(value)
  && !value.split('/').some(part => ['.', '..', '.git', '.env', '.claude', '.codex', '.agents'].includes(part));

function publicErrors(failure) {
  return (failure?.public_evidence ?? []).flatMap(check => (check.evidence?.cases ?? [])
    .filter(row => row.status === 'failed').map(row => ({check_id: check.check_id, test_id: row.test_id ?? row.id,
      assertion_id: row.failed_assertion_id ?? null, error_type: row.error_type ?? null, message: row.message ?? null})));
}
function identifiers(errors) {
  const result = new Set();
  for (const row of errors) {
    for (const match of String(row.message ?? '').matchAll(/['"`]([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)['"`]/g)) {
      result.add(match[1]); if (match[1].includes('.')) result.add(match[1].split('.').at(-1));
    }
  }
  return [...result];
}
function errorModuleLeaves(errors) {
  return unique(errors.flatMap(row => [...String(row.message ?? '').matchAll(/module ['"]([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)['"]/g)]
    .map(match => match[1].split('.').at(-1))));
}
function symbols(text) {
  return unique([...text.matchAll(/^(?:async\s+)?(?:def|class)\s+([A-Za-z_]\w*)\b/gm)].map(match => match[1]));
}
function containsIdentifier(text, symbol) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?<![A-Za-z0-9_])${escaped}(?![A-Za-z0-9_])`).test(text);
}
function sourceRanges(text, needles, includeDefinitions) {
  const lines = text.split('\n'), selected = new Set(), definitions = [];
  for (let i = 0; i < lines.length; i++) if (/^(?:async\s+)?(?:def|class)\s+/.test(lines[i])) definitions.push(i);
  for (let i = 0; i < lines.length; i++) {
    const matches = needles.some(needle => containsIdentifier(lines[i], needle));
    const moduleInterface = /^(?:from\s+\S+\s+import\s+|import\s+|__all__\s*=)/.test(lines[i]);
    const enclosing = lines.slice(0, i + 1).map((line, index) => ({line, index}))
      .filter(row => /^\s*(?:async\s+)?def\s+/.test(row.line)).at(-1)?.line;
    const publicDefinition = /^(?:async\s+)?(?:def|class)\s+[A-Za-z][A-Za-z0-9_]*\b/.test(lines[i]);
    const publicReturn = /^\s*(?:return|yield)\b/.test(lines[i])
      && enclosing && /^(?:async\s+)?def\s+[A-Za-z][A-Za-z0-9_]*\b/.test(enclosing);
    const boundary = includeDefinitions && (publicDefinition || publicReturn || /^__all__\s*=/.test(lines[i]));
    if (!matches && !moduleInterface && !boundary) continue;
    selected.add(i);
    // Preserve multiline signatures/imports and the exact enclosing branch
    // headers, without sending every unrelated implementation statement.
    if (/\(\s*$/.test(lines[i])) for (let j = i + 1; j < lines.length; j++) {
      selected.add(j); if (/\)\s*(?:->[^:]+)?\s*[:,]?\s*$/.test(lines[j])) break;
    }
    let indent = lines[i].match(/^\s*/)[0].length;
    for (let j = i - 1; j >= 0 && indent > 0; j--) {
      if (!lines[j].trim()) continue;
      const parentIndent = lines[j].match(/^\s*/)[0].length;
      if (parentIndent < indent && /:\s*(?:#.*)?$/.test(lines[j])) {selected.add(j); indent = parentIndent;}
    }
  }
  const ranges = [];
  for (const index of [...selected].sort((a, b) => a - b)) {
    const previous = ranges.at(-1);
    if (previous && previous.end_line === index) previous.end_line = index + 1;
    else ranges.push({start_line: index + 1, end_line: index + 1});
  }
  return ranges.map(range => ({...range, text: lines.slice(range.start_line - 1, range.end_line).join('\n')}));
}

function literalImports(file, files) {
  const moduleName = path => path.replace(/\.py$/, '').replace(/\/__init__$/, '').split('/').join('.');
  const current = file.path.split('/').slice(0, -1), result = [];
  for (const match of file.text.matchAll(/^\s*from\s+(\.*[A-Za-z0-9_.]*)\s+import\s+([^\n]+)/gm)) {
    const dots = match[1].match(/^\.+/)?.[0].length ?? 0, tail = match[1].slice(dots);
    const qualified = dots ? [...current.slice(0, current.length - dots + 1), ...tail.split('.').filter(Boolean)].join('.') : tail;
    for (const producer of files.filter(row => row.path.endsWith('.py') && moduleName(row.path) === qualified)) {
      result.push({producer, consumer: file, symbols: [...match[2].matchAll(/\b[A-Za-z_]\w*\b/g)].map(row => row[0])
        .filter(name => name !== 'as'), basis: 'literal_source_import'});
    }
  }
  return result;
}

/** Consume already-authorized immutable snapshot text. Never reads files,
 * executes candidate code, infers write permission, or consults hidden tests. */
export function collectRepairSourceEvidence({sourceFiles, planning, artifactBindings, failure, previous_action, repair_history, historical_repair_history} = {}) {
  need(Array.isArray(sourceFiles) && object(planning?.plan) && object(artifactBindings) && object(failure?.artifact_revisions),
    'REPAIR_SOURCE_INPUT');
  const artifacts = new Map(planning.plan.artifacts.map(row => [row.id, row])), seen = new Set();
  const files = sourceFiles.map(row => {
    need(object(row) && artifacts.has(row.artifact_id) && safeSourcePath(row.path) && !seen.has(row.path)
      && artifactBindings[row.artifact_id]?.paths.includes(row.path) && row.revision === failure.artifact_revisions[row.artifact_id]
      && sha(row.revision) && sha(row.sha256) && typeof row.text === 'string' && hash(Buffer.from(row.text, 'utf8')) === row.sha256,
    'REPAIR_SOURCE_BINDING');
    seen.add(row.path); return {...clone(row), symbols: symbols(row.text)};
  });
  const errors = publicErrors(failure), errorIdentifiers = identifiers(errors), entries = (repair_history ?? historical_repair_history)?.entries ?? [];
  const unchanged = entries.at(-1)?.selected_but_unchanged_artifact_ids ?? [];
  const priorIds = unique(unchanged.length ? unchanged : previous_action?.artifact_ids ?? []);
  need(priorIds.every(id => artifacts.has(id)), 'REPAIR_SOURCE_PRIOR_ARTIFACT');
  const moduleLeaves = errorModuleLeaves(errors);
  const seeds = new Set(priorIds), seedPaths = new Set(files.filter(row => priorIds.includes(row.artifact_id)).map(row => row.path)), relations = [];
  for (const file of files) if (errorIdentifiers.filter(id => !moduleLeaves.includes(id)).some(id => containsIdentifier(file.text, id))
    || moduleLeaves.some(id => file.path.split('/').some(part => {
      const name = part.replace(/(?:\.(?:py|jinja|mjs|js|ts))+$/, ''); return name === id || name.startsWith(`${id}_`);
    }))) {seeds.add(file.artifact_id); seedPaths.add(file.path);}
  const tasks = planning.plan.tasks.filter(row => row.kind === 'implementation');
  for (const task of tasks) for (const input of task.input_artifact_ids) for (const output of task.output_artifact_ids) {
    if (seeds.has(input) || seeds.has(output)) relations.push({producer_artifact_id: input, consumer_artifact_id: output,
      basis: 'declared_artifact_dependency', runtime_fault_proof: false});
  }
  const selectedPaths = new Set(seedPaths), relatedSymbols = new Map();
  for (const edge of files.flatMap(file => literalImports(file, files))) {
    if (!seedPaths.has(edge.producer.path) && !seedPaths.has(edge.consumer.path)) continue;
    selectedPaths.add(edge.producer.path); selectedPaths.add(edge.consumer.path);
    for (const path of [edge.producer.path, edge.consumer.path]) relatedSymbols.set(path,
      unique([...(relatedSymbols.get(path) ?? []), ...edge.symbols]));
    relations.push({producer_artifact_id: edge.producer.artifact_id, consumer_artifact_id: edge.consumer.artifact_id,
      producer_path: edge.producer.path, consumer_path: edge.consumer.path, symbols: edge.symbols,
      basis: 'literal_source_import', runtime_fault_proof: false});
  }
  const evidence = [];
  for (const file of files.filter(row => selectedPaths.has(row.path))) {
    const ranges = sourceRanges(file.text, [...errorIdentifiers.filter(id => !moduleLeaves.includes(id)),
      ...(relatedSymbols.get(file.path) ?? [])], seedPaths.has(file.path));
    if (!ranges.length) continue;
    evidence.push({schema_version: contract.source_collection.schema_version, kind: 'static_source_observation',
      artifact_id: file.artifact_id, path: file.path, revision: file.revision, sha256: file.sha256, ranges,
      selection_basis: 'Exact imports, public signatures/returns, imported-symbol lines and enclosing branches; other bodies remain controller-only.',
      relations: relations.filter(row => [row.producer_artifact_id, row.consumer_artifact_id].includes(file.artifact_id)),
      attribution: 'static_hypothesis_not_runtime_fault_proof'});
  }
  const priorEvidence = failure.recovery_evidence ?? [];
  validateRecoveryEvidence(priorEvidence);
  const facts = rows => rows.map(row => ({artifact_id: row.artifact_id, path: row.path, revision: row.revision,
    sha256: row.sha256, ranges: row.ranges.map(({start_line, end_line, text}) => ({start_line, end_line, text}))}));
  const changed = evidence.length > 0 && !same(facts(evidence), facts(priorEvidence));
  const report = seal({schema_version: 'adaptive-repair-source-coverage/v1', contract_source: clone(source),
    input_files: files.map(({artifact_id, path, revision, sha256}) => ({artifact_id, path, revision, sha256})),
    public_errors: errors, error_identifiers: errorIdentifiers, module_leaf_identifiers: moduleLeaves, previous_artifact_ids: priorIds,
    source_inventory_sha256: digest(files.map(({artifact_id, path, revision, sha256}) => ({artifact_id, path, revision, sha256}))),
    selected_paths: evidence.map(row => row.path), excluded_paths: files.filter(row => !evidence.some(item => item.path === row.path)).map(row => row.path),
    evidence_sha256: digest(evidence), evidence_bytes: bytes(evidence), new_inline_facts: changed,
    boundary: 'Static source investigation only; candidate code was not executed and no causal branch is proven.'});
  return {status: changed ? 'ready' : 'needs_evidence', evidence, report};
}

export function createRepairInputRecovery() {
  return async (input, _context = {}) => {
    if (input.action === 'rebuild_relevant_input') {
      const request = input.failed_request;
      if (!request || request.state?.repair_input) return {status: 'needs_evidence', evidence: [],
        reason: request ? 'CANONICAL_INPUT_ALREADY_APPLIED' : 'FAILED_REQUEST_UNAVAILABLE'};
      const projected = projectRepairDecisionRequest(request, {stage: input.stage, recoveryEvidence: input.failure?.recovery_evidence ?? []});
      const before = prepareDecision(request), after = prepareDecision(projected.request);
      if (before.serialized === after.serialized || Buffer.byteLength(after.serialized) >= Buffer.byteLength(before.serialized)) {
        return {status: 'needs_evidence', evidence: [], reason: 'NO_SMALLER_SEMANTIC_REPRESENTATION', report: projected.report};
      }
      return {status: 'ready', evidence: [], input_rebuild: {...projected,
        recovery: {schema_version: contract.recovery.schema_version, action: input.action,
          prior_request_sha256: hash(before.serialized), request_sha256: hash(after.serialized),
          evidence_sha256: digest(after.body.state), source_coverage_sha256: digest(projected.report)}}};
    }
    if (['inspect_no_write_cause', 'inspect_causal_path', 'collect_missing_evidence',
      'collect_missing_decision_evidence', 'inspect_new_failure_path'].includes(input.action)) {
      return collectRepairSourceEvidence(input);
    }
    return {status: 'needs_evidence', evidence: [], reason: 'UNSUPPORTED_RECOVERY_ACTION'};
  };
}
