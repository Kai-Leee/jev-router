import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {
  buildArtifactRepairDecisionContext as buildV1Decision,
  buildArtifactRepairWorkerContext as buildV1Worker,
} from './adaptive-artifact-repair.mjs';

const contractPath = 'docs/orchestration/contracts/adaptive-artifact-repair.v2.json';
const contractBytes = readFileSync(new URL(`../../${contractPath}`, import.meta.url));
const contract = JSON.parse(contractBytes);
const clone = value => structuredClone(value);
const json = value => JSON.stringify(value);
const hash = value => createHash('sha256').update(value).digest('hex');
const size = value => Buffer.byteLength(json(value));
const has = (value, key) => Object.hasOwn(value ?? {}, key);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// References identify immutable controller inputs. They are never retrieval tools.
function provenance(input, legacy) {
  const sourceHashes = Object.fromEntries(['planning', 'failure', 'candidates', 'artifactBindings']
    .map(key => [key, hash(json(input[key]))]));
  const binding = {schema_version: 'adaptive-artifact-repair-binding/v2',
    source_hashes: sourceHashes, legacy_packet_sha256: hash(json(legacy)),
    contract: {path: contractPath, sha256: hash(contractBytes), schema_version: contract.schema_version}};
  const contextRef = {sha256: hash(json(binding)), access: 'controller_only'};
  const omitted = [];
  const inlineEncodings = [];
  const record = (value, pointer, reason, origin = 'input') => {
    omitted.push({origin, pointer, sha256: hash(json(value)), utf8_bytes: size(value), reason});
  };
  const omit = (value, key, pointer, reason, origin = 'input') => {
    if (!has(value, key)) return;
    record(value[key], `${pointer}/${key}`, reason, origin);
    delete value[key];
  };
  return {binding, contextRef, omitted, omit, record, inlineEncodings};
}

// Repeated key names are encoded once. Extra fields, including full failures,
// remain untouched in details. Absent required fields keep the original objects.
function inlineTable(values, columns, pointer, p, origin = 'input') {
  if (!Array.isArray(values) || !values.length || !values.every(value => object(value) && columns.every(key => has(value, key)))) return values;
  const encoded = {columns: [...columns, 'details'], rows: values.map(value => {
    const details = Object.fromEntries(Object.entries(value).filter(([key]) => !columns.includes(key)));
    return [...columns.map(key => clone(value[key])), details];
  })};
  if (size(encoded) >= size(values)) return values;
  p.inlineEncodings.push({origin, pointer, encoding: 'columns_rows_details',
    original_sha256: hash(json(values)), encoded_sha256: hash(json(encoded)), model_inline: true});
  return encoded;
}

function exactDefaults(values, keys, pointer, p) {
  if (!values.length) return {};
  const defaults = {};
  for (const key of keys) {
    if (!values.every(value => has(value, key) && isDeepStrictEqual(value[key], values[0][key]))) continue;
    defaults[key] = clone(values[0][key]);
    for (const value of values) delete value[key];
  }
  if (Object.keys(defaults).length) p.inlineEncodings.push({origin: 'projected_packet', pointer,
    encoding: 'exact_shared_defaults', defaults: clone(defaults), model_inline: true});
  return defaults;
}

const outerMetadata = ['check_version', 'environment_ref', 'artifact_revisions', 'runtime_binding', 'evidence_key', 'attempt_id'];
const nestedMetadata = ['artifact_revisions', 'assertion_contract_sha256', 'binding_kind', 'check_version',
  'environment_ref', 'product_certified', 'python_version', 'schema_version', 'scope', 'container_removed', 'report_ref', 'process_ref'];
const setupMetadata = ['console_script', 'interpreter_identity', 'python', 'source_root', 'trace_path', 'venv'];

function compactCheck(raw, projected, path, p) {
  const result = clone(raw);
  for (const key of outerMetadata) p.omit(result, key, path, 'controller_check_provenance');
  if (!object(result.evidence)) return result;
  const evidence = result.evidence, evidencePath = `${path}/evidence`;
  for (const key of nestedMetadata) p.omit(evidence, key, evidencePath, 'controller_check_provenance');
  for (const key of ['check_id', 'status', 'executed', 'exit_code', 'assertions', 'skipped', 'outcome_uncertain']) {
    if (has(result, key) && has(evidence, key) && isDeepStrictEqual(result[key], evidence[key])) {
      p.omit(evidence, key, evidencePath, `exact_duplicate_of:${path}/${key}`);
    }
  }
  // Keep all case objects intact, including unknown fields and full error text.
  const representedIds = [...(evidence.cases ?? []).map(item => item.test_id), ...(evidence.unexecuted_test_ids ?? [])];
  if (Array.isArray(evidence.test_ids) && evidence.test_ids.length === new Set(representedIds).size
    && evidence.test_ids.every(id => representedIds.includes(id))) {
    p.omit(evidence, 'test_ids', evidencePath, 'exact_case_and_unexecuted_id_coverage');
  }
  if (Array.isArray(evidence.cases)) evidence.cases = inlineTable(evidence.cases,
    ['test_id', 'status', 'assertions'], `${evidencePath}/cases`, p);
  if (Array.isArray(evidence.candidate_invocations)) evidence.candidate_invocations = inlineTable(evidence.candidate_invocations,
    ['number', 'exit_code', 'installed_cli'], `${evidencePath}/candidate_invocations`, p);
  const setup = evidence.setup_evidence;
  if (object(setup) && setup.exit_code === 0 && setup.console_script_exists !== false
    && !setup.error && !setup.outcome_uncertain) {
    // V1 recognizes only normal successful installer output; do not guess from exit 0 alone.
    if (projected?.evidence?.setup_evidence?.stdout_omitted?.kind === 'normal_successful_install_progress') {
      p.omit(setup, 'stdout', `${evidencePath}/setup_evidence`, 'recognized_successful_install_progress');
    }
    for (const key of setupMetadata) p.omit(setup, key, `${evidencePath}/setup_evidence`, 'successful_setup_identity');
  }
  if (Object.keys(evidence).length === 0) delete result.evidence;
  return result;
}

function compactFailure(raw, projected, p) {
  const result = clone(raw);
  for (const key of ['run_id', 'graph_revision', 'source_sha256', 'catalog_sha256', 'binding_digest',
    'environment', 'task_attempt_ids', 'artifact_revisions']) {
    p.omit(result, key, '/failure', 'controller_failure_provenance');
  }
  for (const key of ['public_evidence', 'local_evidence']) {
    if (Array.isArray(raw[key])) {
      if (has(raw, `${key}_defaults`)) throw Object.assign(new Error('ADAPTIVE_ARTIFACT_REPAIR_ENCODING_COLLISION'),
        {code: 'ADAPTIVE_ARTIFACT_REPAIR_ENCODING_COLLISION', outcome_uncertain: false, field: `${key}_defaults`});
      result[key] = raw[key].map((item, index) => compactCheck(item, projected[key]?.[index], `/failure/${key}/${index}`, p));
      const defaults = exactDefaults(result[key], ['status', 'executed', 'exit_code', 'skipped', 'outcome_uncertain', 'evidence'], `/failure/${key}`, p);
      if (Object.keys(defaults).length) result[`${key}_defaults`] = defaults;
    }
  }
  if (object(result.repair_scope)) {
    p.omit(result.repair_scope, 'assertion_contract_sha256', '/failure/repair_scope', 'controller_assertion_provenance');
    for (const key of ['observed_failures', 'fixture_blockers']) {
      for (const [index, item] of (result.repair_scope[key] ?? []).entries()) {
        for (const field of ['source_ref', 'artifact_revisions']) {
          p.omit(item, field, `/failure/repair_scope/${key}/${index}`, 'controller_assertion_provenance');
        }
      }
    }
  }
  return result;
}

function descriptor(value, pointer, p, {worker = false} = {}) {
  const result = clone(value);
  p.omit(result, 'revision', pointer, 'controller_artifact_revision', 'legacy_packet');
  if (has(result, 'interface')) p.omit(result, 'interface', pointer,
    worker ? `exact_inline_dependency_interfaces:${result.unit_id}` : 'worker_only_dependency_interface', 'legacy_packet');
  return result;
}

function packet(input, legacy, p, {worker = false} = {}) {
  const selectedEvidenceIds = new Set([...legacy.units, ...legacy.artifacts].flatMap(value => value.evidence_ids ?? []));
  const evidence = legacy.evidence.filter((value, index) => {
    if (worker || selectedEvidenceIds.has(value.id)) return true;
    p.record(value, `/evidence/${index}`, 'worker_only_dependency_source_quote', 'legacy_packet');
    return false;
  });
  const state = {schema_version: contract.packet_version, context_ref: p.contextRef,
    instructions: worker ? contract.worker_instructions : contract.decision_instructions,
    inline_encoding: 'For a {columns,rows} table, each row maps to columns; merge the final details object into that row. For *_evidence arrays, merge the matching *_evidence_defaults into each item. No values are inferred or hidden in these encodings.',
    units: clone(legacy.units), artifacts: clone(legacy.artifacts),
    requirement_descriptions: clone(legacy.requirement_descriptions), evidence: clone(evidence),
    read_only_dependencies: inlineTable(legacy.read_only_dependencies.map((value, index) =>
      descriptor(value, `/read_only_dependencies/${index}`, p, {worker})),
    ['artifact_id', 'owner_task_id', 'paths', 'unit_id', 'declared_for_task_ids'], '/read_only_dependencies', p, 'projected_packet'),
    inherited_same_owner_artifacts: inlineTable(legacy.inherited_same_owner_artifacts.map((value, index) =>
      descriptor(value, `/inherited_same_owner_artifacts/${index}`, p)),
    ['artifact_id', 'owner_task_id', 'paths'], '/inherited_same_owner_artifacts', p, 'projected_packet'),
    dependency_boundary: clone(legacy.dependency_boundary), execution_context: clone(legacy.execution_context),
    failure: compactFailure(input.failure, legacy.failure, p)};
  if (worker) {
    state.dependency_interfaces = Object.fromEntries(legacy.read_only_dependencies.map(value => [value.unit_id, value.interface]));
    state.selected_action = clone(legacy.selected_action);
    state.worker_task_id = legacy.worker_task_id;
    state.allowed_write_paths = clone(legacy.allowed_write_paths);
    state.readable_inherited_paths = clone(legacy.readable_inherited_paths);
    state.verification = clone(legacy.verification);
  } else {
    state.candidates = clone(input.candidates);
  }
  return state;
}

function report(state, legacyReport, p, kind) {
  return {schema_version: 'adaptive-artifact-repair-report/v2', kind, packet_bytes: size(state),
    context_ref: clone(p.contextRef), binding_ref: p.binding, omitted_metadata: p.omitted, inline_encodings: p.inlineEncodings,
    omission_scope: 'Enumerated controller provenance and exact duplicates are referenced; dependency interfaces/source quotes move from decision to worker. All public cases and unknown semantic fields remain inline, with documented lossless tables/defaults.',
    ...Object.fromEntries(Object.entries(legacyReport).filter(([key]) => key.endsWith('_count'))),
    legacy_packet_bytes: legacyReport.packet_bytes, legacy_failure_projection: legacyReport.failure_projection,
    public_case_count: (state.failure.public_evidence ?? []).reduce((sum, item) => {
      const cases = item.evidence?.cases ?? state.failure.public_evidence_defaults?.evidence?.cases;
      return sum + (cases?.rows?.length ?? cases?.length ?? 0);
    }, 0),
    target_wire_bytes: contract.target_wire_bytes, wire_bytes: null, wire_target_met: null,
    wire_guard_required: true, provider_acceptance: 'unmeasured', model_input_tokens: null};
}

/** Same validated scope as v1, with controller-only provenance and no silent truncation. */
export function buildArtifactRepairDecisionContext(input) {
  const legacy = buildV1Decision(input);
  const p = provenance(input, legacy.state);
  const state = packet(input, legacy.state, p);
  return {state, report: report(state, legacy.report, p, 'decision')};
}

/** Narrowed transport authority is unchanged; dependencies remain complete and inline. */
export function buildArtifactRepairWorkerContext(input) {
  const legacy = buildV1Worker(input);
  const normalized = {...input, candidates: [input.candidate]};
  const p = provenance(normalized, legacy.context);
  const context = packet(normalized, legacy.context, p, {worker: true});
  return {task: legacy.task, context, report: report(context, legacy.report, p, 'worker')};
}
