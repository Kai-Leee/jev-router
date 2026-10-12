import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { prepareDecision } from '../client.mjs';

const CONTRACT_URL = new URL('../../docs/orchestration/contracts/adaptive-repair-projection.v1.json', import.meta.url);
const CONTRACT_PATH = 'docs/orchestration/contracts/adaptive-repair-projection.v1.json';
const contractBytes = readFileSync(CONTRACT_URL);
const contract = JSON.parse(contractBytes);
const contractHash = createHash('sha256').update(contractBytes).digest('hex');
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => Object.hasOwn(value, key);
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const hash = value => createHash('sha256').update(value).digest('hex');
const fail = (code = 'ADAPTIVE_REPAIR_PROJECTION_INVALID', path = null) => {
  throw Object.assign(new Error(code), { code, projection_path: path, outcome_uncertain: false });
};
const assert = (valid, path, code = 'ADAPTIVE_REPAIR_PROJECTION_BINDING_MISMATCH') => { if (!valid) fail(code, path); };
function clone(value) {
  try {
    const copied = JSON.parse(JSON.stringify(value));
    if (!isDeepStrictEqual(value, copied)) fail();
    return copied;
  } catch { fail(); }
}
function equal(a, b, path) { assert(isDeepStrictEqual(a, b), path); }
function cleanSlot(value, key, path) { assert(!own(value, key), `${path}.${key}`, 'ADAPTIVE_REPAIR_PROJECTION_INVALID'); }
const metadata = version => ({ schema_version: version, contract_path: CONTRACT_PATH, contract_sha256: contractHash,
  inline_reference_rules: clone(contract.inline_reference_rules), no_remote_file_access: contract.no_remote_file_access });
const repeatedFields = ['check_id', 'check_version', 'environment_ref', 'status', 'executed', 'exit_code', 'assertions', 'skipped', 'outcome_uncertain'];

// Unknown lines remain literal even when exit_code is zero. In particular, an
// application traceback hidden behind a successful installer is never omitted.
function normalInstallProgress(setup) {
  if (setup?.exit_code !== 0 || typeof setup.stdout !== 'string' || !setup.stdout
    || typeof setup.source_root !== 'string') return false;
  const lines = setup.stdout.split('\n');
  const patterns = [
    /^\s*Checking if build backend supports build_editable: (started|finished with status 'done')$/,
    /^\s*Preparing editable metadata \(pyproject\.toml\): (started|finished with status 'done')$/,
    /^Requirement already satisfied: .+ in \S+ \(.+\)( \(.+\))?$/,
    /^Building wheels for collected packages: [A-Za-z0-9._, -]+$/,
    /^\s*Building editable for [A-Za-z0-9._-]+ \(pyproject\.toml\): (started|finished with status 'done')$/,
    /^\s*Created wheel for [A-Za-z0-9._-]+: filename=\S+ size=\d+ sha256=[a-f0-9]{64}$/,
    /^\s*Stored in directory: \S+$/,
    /^Successfully built [A-Za-z0-9._ -]+$/,
    /^Installing collected packages: [A-Za-z0-9._, -]+$/,
    /^Successfully installed [A-Za-z0-9._ -]+$/,
  ];
  return lines.some(line => line.startsWith('Successfully installed '))
    && lines.every(line => line === '' || line === `Obtaining file://${setup.source_root}` || patterns.some(pattern => pattern.test(line)));
}

function checkFailure(failure) {
  assert(object(failure) && object(failure.artifact_revisions) && object(failure.environment)
    && typeof failure.environment.id === 'string' && typeof failure.environment.fingerprint === 'string'
    && typeof failure.binding_digest === 'string'
    && Array.isArray(failure.public_evidence) && Array.isArray(failure.local_evidence), 'failure', 'ADAPTIVE_REPAIR_PROJECTION_INVALID');
}

function validateBinding(check, failure, path, local = false) {
  assert(object(check) && object(check.evidence) && object(check.artifact_revisions), path, 'ADAPTIVE_REPAIR_PROJECTION_INVALID');
  if (own(check, 'environment_ref')) equal(check.environment_ref, failure.environment.id, `${path}.environment_ref`);
  const unpublished = Object.keys(check.artifact_revisions).filter(id => !own(failure.artifact_revisions, id));
  if (unpublished.length) {
    // Failed local outputs may never have been published. Keep their actual
    // per-attempt revision map instead of manufacturing exported provenance.
    assert(local && typeof check.task_id === 'string' && typeof check.attempt_id === 'string'
      && check.attempt_id.length && object(failure.task_attempt_ids)
      && failure.task_attempt_ids[check.task_id] === check.attempt_id
      && object(check.runtime_binding) && typeof check.evidence_key === 'string' && check.evidence_key.length,
    `${path}.unpublished_artifact_binding`);
  }
  for (const [id, revision] of Object.entries(check.artifact_revisions)) {
    if (own(failure.artifact_revisions, id)) equal(revision, failure.artifact_revisions[id], `${path}.artifact_revisions.${id}`);
  }
  if (own(check, 'runtime_binding')) {
    assert(object(check.runtime_binding), `${path}.runtime_binding`);
    equal(check.runtime_binding.binding_digest, failure.binding_digest, `${path}.runtime_binding.binding_digest`);
    equal(check.runtime_binding.environment_fingerprint, failure.environment.fingerprint, `${path}.runtime_binding.environment_fingerprint`);
  }
  for (const field of repeatedFields) if (own(check.evidence, field) && own(check, field)) {
    equal(check.evidence[field], check[field], `${path}.evidence.${field}`);
  }
  if (object(check.evidence.artifact_revisions)) for (const [id, revision] of Object.entries(check.evidence.artifact_revisions)) {
    const boundRevisions = own(failure.artifact_revisions, id) ? failure.artifact_revisions : check.artifact_revisions;
    assert(own(boundRevisions, id), `${path}.evidence.artifact_revisions.${id}`);
    equal(revision, boundRevisions[id], `${path}.evidence.artifact_revisions.${id}`);
  }
}

function sharedCheckDefaults(records, key) {
  if (records.length < 2) return null;
  const common = (items, fields) => Object.fromEntries(fields.filter(field => own(items[0], field)
    && items.every(item => own(item, field) && isDeepStrictEqual(item[field], items[0][field])))
    .map(field => [field, clone(items[0][field])]));
  const defaults = common(records, [...repeatedFields, 'runtime_binding_ref', 'artifact_revision_ids']);
  const evidenceDefaults = common(records.map(check => check.evidence), ['binding_kind', 'environment_evidence', 'error',
    'product_certified', 'python_version', 'schema_version', 'scope', 'container_removed', 'inherited_fields', 'artifact_revisions']);
  if (Object.keys(evidenceDefaults).length) defaults.evidence = evidenceDefaults;
  if (!Object.keys(defaults).length) return null;
  for (const check of records) {
    cleanSlot(check, 'check_defaults_ref', 'failure.check');
    for (const field of Object.keys(defaults)) if (field !== 'evidence') delete check[field];
    for (const field of Object.keys(evidenceDefaults)) delete check.evidence[field];
    check.check_defaults_ref = key;
  }
  return defaults;
}

/** Pure inline-only projection, reusable in a repair worker's failure context. */
export function projectAdaptiveRepairFailure(input) {
  const failure = clone(input); checkFailure(failure); cleanSlot(failure, 'repair_projection', 'failure');
  const checks = [...failure.public_evidence, ...failure.local_evidence];
  const bindings = {};
  const omittedStdout = {};
  let bindingCount = 0, stdoutCount = 0, stdoutBytes = 0, localRevisionMaps = 0;
  for (const [index, check] of checks.entries()) {
    const path = `failure.checks[${index}]`; validateBinding(check, failure, path, index >= failure.public_evidence.length);
    cleanSlot(check, 'artifact_revision_ids', path);
    if (Object.keys(check.artifact_revisions).every(id => own(failure.artifact_revisions, id))) {
      check.artifact_revision_ids = Object.keys(check.artifact_revisions);
      delete check.artifact_revisions;
    } else localRevisionMaps++;
    if (own(check, 'runtime_binding')) {
      cleanSlot(check, 'runtime_binding_ref', path);
      if (Object.keys(bindings).length) equal(check.runtime_binding, Object.values(bindings)[0], `${path}.runtime_binding`);
      let key = Object.keys(bindings).find(id => isDeepStrictEqual(bindings[id], check.runtime_binding));
      if (!key) { key = `runtime_${Object.keys(bindings).length + 1}`; bindings[key] = check.runtime_binding; }
      check.runtime_binding_ref = key; delete check.runtime_binding; bindingCount++;
    }
    cleanSlot(check.evidence, 'inherited_fields', `${path}.evidence`);
    const inherited = repeatedFields.filter(field => own(check.evidence, field) && own(check, field));
    if (inherited.length) { check.evidence.inherited_fields = inherited; for (const field of inherited) delete check.evidence[field]; }
    const setup = check.evidence.setup_evidence;
    // Successful normal installation progress is explicitly non-decision data.
    // All setup metadata, failures, stderr and unrecognized stdout stay inline.
    if (normalInstallProgress(setup)) {
      cleanSlot(setup, 'stdout_omitted', `${path}.evidence.setup_evidence`);
      assert(typeof check.evidence.report_ref === 'string' && check.evidence.report_ref.length
        && typeof check.evidence_key === 'string' && check.evidence_key.length, `${path}.evidence.report_ref`);
      const sha256 = hash(setup.stdout), utf8Bytes = Buffer.byteLength(setup.stdout, 'utf8');
      omittedStdout[sha256] = setup.stdout;
      setup.stdout_omitted = {kind: 'normal_successful_install_progress', sha256, utf8_bytes: utf8Bytes,
        source: 'This check evidence.report_ref and evidence_key bind the original stdout; all setup identity and error facts remain inline.'};
      delete setup.stdout; stdoutCount++; stdoutBytes += utf8Bytes;
    }
  }
  const defaults = {};
  for (const kind of ['public_evidence', 'local_evidence']) {
    const shared = sharedCheckDefaults(failure[kind], kind);
    if (shared) defaults[kind] = shared;
  }
  failure.repair_projection = { ...metadata(contract.failure_version), runtime_bindings: bindings, check_defaults: defaults };
  const restored = restoreAdaptiveRepairFailure(failure, {omitted_stdout: omittedStdout});
  equal(restored, input, 'failure.evidence_roundtrip');
  return { failure, report: { schema_version: 'adaptive-repair-projection-report/v1',
    input_failure_bytes: bytes(input), projected_failure_bytes: bytes(failure),
    removed_bytes: bytes(input) - bytes(failure),
    check_count: checks.length, public_case_count: failure.public_evidence.reduce((sum, check) => sum + (check.evidence.cases?.length ?? 0), 0),
    runtime_binding_references: bindingCount, unique_runtime_bindings: Object.keys(bindings).length,
    unpublished_local_revision_maps_preserved: localRevisionMaps,
    successful_stdout_omitted: stdoutCount, successful_stdout_omitted_bytes: stdoutBytes,
    literal_failure_stdout_preserved: true, stderr_preserved: true, decision_evidence_preserved: true,
    lossless_roundtrip: stdoutCount === 0, exact_reconstruction_with_original_logs: true,
    provider_acceptance: 'unmeasured', model_input_tokens: null } };
}

export function restoreAdaptiveRepairFailure(input, {omitted_stdout = {}} = {}) {
  const failure = clone(input); checkFailure(failure);
  const projection = failure.repair_projection;
  assert(object(projection) && projection.schema_version === contract.failure_version
    && projection.contract_sha256 === contractHash && object(projection.runtime_bindings) && object(projection.check_defaults), 'failure.repair_projection');
  for (const [index, check] of [...failure.public_evidence, ...failure.local_evidence].entries()) {
    const path = `failure.checks[${index}]`;
    assert(object(check) && object(check.evidence), path);
    if (own(check, 'check_defaults_ref')) {
      const defaults = projection.check_defaults[check.check_defaults_ref];
      assert(object(defaults), `${path}.check_defaults_ref`);
      for (const [field, value] of Object.entries(defaults)) {
        if (field === 'evidence') {
          assert(object(value), `${path}.evidence`);
          for (const [key, item] of Object.entries(value)) { cleanSlot(check.evidence, key, `${path}.evidence`); check.evidence[key] = clone(item); }
        } else { cleanSlot(check, field, path); check[field] = clone(value); }
      }
      delete check.check_defaults_ref;
    }
    if (own(check, 'artifact_revision_ids')) {
      assert(Array.isArray(check.artifact_revision_ids)
        && new Set(check.artifact_revision_ids).size === check.artifact_revision_ids.length, path);
      cleanSlot(check, 'artifact_revisions', path);
      check.artifact_revisions = Object.fromEntries(check.artifact_revision_ids.map(id => {
        assert(typeof id === 'string' && own(failure.artifact_revisions, id), `${path}.artifact_revision_ids`);
        return [id, failure.artifact_revisions[id]];
      }));
      delete check.artifact_revision_ids;
    } else assert(index >= failure.public_evidence.length && object(check.artifact_revisions), `${path}.artifact_revisions`);
    if (own(check, 'runtime_binding_ref')) {
      cleanSlot(check, 'runtime_binding', path);
      assert(own(projection.runtime_bindings, check.runtime_binding_ref), `${path}.runtime_binding_ref`);
      check.runtime_binding = clone(projection.runtime_bindings[check.runtime_binding_ref]); delete check.runtime_binding_ref;
    }
    if (own(check.evidence, 'inherited_fields')) {
      const fields = check.evidence.inherited_fields;
      assert(Array.isArray(fields) && new Set(fields).size === fields.length, `${path}.evidence.inherited_fields`);
      for (const field of fields) {
        assert(repeatedFields.includes(field) && own(check, field) && !own(check.evidence, field), `${path}.evidence.${field}`);
        check.evidence[field] = clone(check[field]);
      }
      delete check.evidence.inherited_fields;
    }
    const setup = check.evidence.setup_evidence;
    if (setup && own(setup, 'stdout_omitted')) {
      cleanSlot(setup, 'stdout', `${path}.evidence.setup_evidence`);
      const omission = setup.stdout_omitted;
      assert(setup.exit_code === 0 && object(omission) && omission.kind === 'normal_successful_install_progress', `${path}.evidence.setup_evidence.stdout_omitted`);
      const stdout = omitted_stdout[omission.sha256];
      assert(typeof stdout === 'string', `${path}.evidence.setup_evidence.stdout_omitted`, 'ADAPTIVE_REPAIR_PROJECTION_OMITTED_LOG_REQUIRED');
      assert(hash(stdout) === omission.sha256 && Buffer.byteLength(stdout, 'utf8') === omission.utf8_bytes,
        `${path}.evidence.setup_evidence.stdout_omitted`);
      setup.stdout = stdout; delete setup.stdout_omitted;
      assert(normalInstallProgress(setup), `${path}.evidence.setup_evidence.stdout`);
    }
    validateBinding(check, failure, path, index >= failure.public_evidence.length);
  }
  delete failure.repair_projection; return failure;
}

export function projectAdaptiveRepairState(input) {
  const state = clone(input);
  assert(object(state) && Array.isArray(state.units) && Array.isArray(state.leaves), 'state', 'ADAPTIVE_REPAIR_PROJECTION_INVALID');
  cleanSlot(state, 'repair_projection', 'state');
  equal(state.source_sha256, state.failure?.source_sha256, 'state.source_sha256');
  equal(state.catalog_sha256, state.failure?.catalog_sha256, 'state.catalog_sha256');
  const { failure, report } = projectAdaptiveRepairFailure(state.failure); state.failure = failure;
  const units = new Map(state.units.map(unit => [unit.id, unit]));
  assert(units.size === state.units.length, 'state.units');
  let references = 0;
  for (const [index, leaf] of state.leaves.entries()) {
    const path = `state.leaves[${index}]`; cleanSlot(leaf, 'interfaces_from_units', path);
    assert(Array.isArray(leaf.unit_ids) && Array.isArray(leaf.interfaces), path);
    for (const entry of leaf.interfaces) if (units.has(entry.unit_id)) {
      const unit = units.get(entry.unit_id);
      equal(entry, {unit_id: unit.id, title: unit.title, interface: unit.interface}, `${path}.interfaces`);
    }
    const matched = leaf.unit_ids.every(id => units.has(id));
    // A narrowed catalog does not authorize dropping an unavailable interface.
    if (!matched) continue;
    const expected = leaf.unit_ids.map(id => { const unit = units.get(id); return {unit_id: id, title: unit.title, interface: unit.interface}; });
    equal(leaf.interfaces, expected, `${path}.interfaces`);
    delete leaf.interfaces; leaf.interfaces_from_units = true; references++;
  }
  state.repair_projection = { ...metadata(contract.state_version), leaf_interface_references: references };
  const omitted_stdout = Object.fromEntries([...input.failure.public_evidence, ...input.failure.local_evidence]
    .map(check => check.evidence?.setup_evidence?.stdout).filter(value => typeof value === 'string').map(value => [hash(value), value]));
  equal(restoreAdaptiveRepairState(state, {omitted_stdout}), input, 'state.evidence_roundtrip');
  return { state, report: { ...report, input_state_bytes: bytes(input), projected_state_bytes: bytes(state),
    removed_state_bytes: bytes(input) - bytes(state), leaf_interface_references: references } };
}

export function restoreAdaptiveRepairState(input, options) {
  const state = clone(input); const projection = state.repair_projection;
  assert(object(projection) && projection.schema_version === contract.state_version && projection.contract_sha256 === contractHash
    && Array.isArray(state.units) && Array.isArray(state.leaves), 'state.repair_projection');
  state.failure = restoreAdaptiveRepairFailure(state.failure, options);
  const units = new Map(state.units.map(unit => [unit.id, unit]));
  for (const [index, leaf] of state.leaves.entries()) if (own(leaf, 'interfaces_from_units')) {
    assert(leaf.interfaces_from_units === true && Array.isArray(leaf.unit_ids), `state.leaves[${index}].interfaces_from_units`);
    cleanSlot(leaf, 'interfaces', `state.leaves[${index}]`);
    leaf.interfaces = leaf.unit_ids.map(id => {
      assert(units.has(id), `state.leaves[${index}].unit_ids`);
      const unit = units.get(id); return {unit_id: id, title: unit.title, interface: unit.interface};
    }); delete leaf.interfaces_from_units;
  }
  delete state.repair_projection; return state;
}

/** Uses the actual client's wire serializer; performs no network request. */
export function projectAdaptiveRepairRequest(input) {
  const original = prepareDecision(input);
  const {state, report} = projectAdaptiveRepairState(original.body.state);
  const projected = prepareDecision({...original.body, state});
  equal(projected.body.questions, original.body.questions, 'request.questions');
  return { request: projected.body, report: {...report,
    input_wire_bytes: Buffer.byteLength(original.serialized, 'utf8'),
    projected_wire_bytes: Buffer.byteLength(projected.serialized, 'utf8'),
    wire_bytes_removed: Buffer.byteLength(original.serialized, 'utf8') - Buffer.byteLength(projected.serialized, 'utf8'),
    wire_measurement: 'Buffer.byteLength(prepareDecision(request).serialized, utf8)'} };
}
