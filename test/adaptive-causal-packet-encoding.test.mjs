import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {projectCausalChooserPacket, restoreCausalChooserPacket, encodeCausalRepairPacket,
  decodeCausalRepairPacket, CAUSAL_PACKET_ENCODING_VERSION} from '../src/orchestration/adaptive-causal-packet-encoding.mjs';

const clone = value => structuredClone(value), wire = value => JSON.parse(JSON.stringify(value));
const hash = text => createHash('sha256').update(text).digest('hex');
const invalid = {code: 'INVALID_CAUSAL_PACKET_ENCODING'};
const bytes = value => Buffer.byteLength(JSON.stringify(value));
function fixture() {
  const passed = Array.from({length: 85}, (_, index) => ({test_id: `T.public.${index}`, status: 'passed', assertions: index % 3 + 1,
    details: {invocation: ['python', 'run_check.py', String(index)], environment: {interpreter: 'fixture-only'}, setup: 'complete'}}));
  const failed = Array.from({length: 8}, (_, index) => ({test_id: `T.body.${index}`, status: 'failed', assertions: 1,
    error_type: 'AssertionError', message: 'Request-body description keeps its original source.',
    expected_request_description: `Exact public requirement ${index}: preserve punctuation.\nSecond line.`,
    description_provenance: {expected: 'REQUEST', actual: index % 2 ? '' : 'SCHEMA', source_lines: ['    body (Body): SCHEMA']}}));
  const revision = hash('unchanged source'), changed = hash('changed source');
  return {instructions: 'Choose only the supplied repair scope. Read authority cannot become write authority.',
    context_ref: {sha256: hash('context'), source: 'controller-only'}, causal_contract: {source: 'contract.json', sha256: hash('contract')},
    contract_source: {source: 'outer-contract.json', sha256: hash('outer-contract')},
    units: [{id: 'U-producer', artifact_ids: ['A-producer'], requirement_ids: ['R-source'], interface: 'Full original producer interface.'},
      {id: 'U-renderer', artifact_ids: ['A-renderer'], requirement_ids: ['R-body'], interface: 'Full original renderer interface.'}],
    requirement_descriptions: [{id: 'R-body', text: 'Preserve the public request-body description.', source_refs: ['instruction.md#L10']},
      {id: 'R-literal-hash', text: revision}],
    read_only_dependencies: {columns: ['artifact_id', 'path', 'revision'], rows: [
      ['A-producer', 'source.py', revision], ['A-other', 'unrelated.py', hash('unrelated')]]},
    failure: {public_evidence_defaults: {executed: true, outcome_uncertain: false, skipped: 0}, public_evidence: [
      {check_id: 'public.passed', status: 'passed', exit_code: 0, assertions: passed.reduce((sum, row) => sum + row.assertions, 0),
        evidence: {cases: passed, error: null, unexecuted_test_ids: [], environment: {identity: hash('environment')},
          invocation: ['python', 'successful.py'], setup: {status: 'complete'}}},
      {check_id: 'public.failed', status: 'failed', exit_code: 1, assertions: 8,
        evidence: {cases: failed, error: null, unexecuted_test_ids: [], unknown_failure_semantics: {must_remain: true}}}],
      repair_scope: {causal: {binding: {sha256: hash('runtime binding')}, choice_bindings: {repair: hash('choice')}, sha256: hash('scope'),
        chains: [{assertion_ids: ['A.body'], nodes: [{artifact_id: 'A-producer', owner_task_id: 'producer', path: 'source.py', revision},
          {artifact_id: 'A-renderer', owner_task_id: 'renderer', path: 'render.py', revision: changed}]}],
        repair_history: {entries: [{selected_candidate_id: 'repair-renderer', selected_artifact_ids: ['A-renderer'],
          changed_files: [{path: 'render.py', before_sha256: revision, after_sha256: changed}],
          failures_before: clone(failed), failures_after: clone(failed), persistent_failure_keys: failed.map(row => row.test_id),
          resolved_failure_keys: [], unobserved_failure_keys: [], relevant_revisions: {A: {before: revision, after: changed}}}]}}}},
    candidates: [{id: 'repair-renderer', artifact_ids: ['A-renderer'], read_artifact_ids: ['A-producer'],
      reason: 'Repair renderer while preserving the producer source.'}]};
}

function scopedFixture() {
  const input = fixture(), scope = input.failure.repair_scope, causal = scope.causal;
  input.failure.outcome_uncertain = false; input.failure.failed_task_ids = [];
  Object.assign(scope, {unresolved: [], unexecuted: [], fixture_blockers: [], not_reached_assertions: [], fallback_required: false});
  scope.observed_failures = input.failure.public_evidence[1].evidence.cases.map(row => ({check_id: 'public.failed', test_id: row.test_id,
    assertion_id: row.test_id.replace('T.', 'A.'), requirement_ids: ['R-body']}));
  causal.chains[0].requirement_ids = ['R-body']; causal.unresolved = [];
  for (const entry of causal.repair_history.entries) for (const row of [...entry.failures_before, ...entry.failures_after]) {
    row.check_id = 'public.failed'; row.assertion_id = row.test_id.replace('T.', 'A.');
  }
  input.requirement_descriptions.push({id: 'R-source', text: 'Complete producer implementation requirement remains in worker input.'});
  input.execution_context = {worker_profiles: [{id: 'W-producer', profile_id: 'fixture-medium'}, {id: 'W-renderer', profile_id: 'fixture-high'},
    {id: 'W-unrelated', profile_id: 'fixture-low'}, {id: 'W-unknown', profile_id: 'fixture-medium'}]};
  const workerTaskBindings = [{task_id: 'producer', worker_id: 'W-producer'}, {task_id: 'renderer', worker_id: 'W-renderer'},
    {task_id: 'other', worker_id: 'W-unrelated'}, {task_id: 'verify', worker_id: null}];
  return {input, workerTaskBindings};
}

function referenceFixture() {
  const {input, workerTaskBindings} = scopedFixture(), cases = input.failure.public_evidence[1].evidence.cases;
  for (const row of cases) row.failed_assertion_id = row.test_id.replace('T.', 'A.');
  const observations = cases.map(row => ({check_id: 'public.failed', test_id: row.test_id, assertion_id: row.failed_assertion_id,
    error_type: row.error_type, message: row.message, description_provenance: clone(row.description_provenance)}));
  input.failure.repair_scope.causal.repair_history.entries[0].failures_before = clone(observations);
  input.failure.repair_scope.causal.repair_history.entries[0].failures_after = clone(observations);
  return {input, workerTaskBindings};
}

test('lossless wire encoding preserves 93 cases, all failure/history values, aliases, and repeated composite independence', () => {
  const input = fixture(), snapshot = clone(input), first = encodeCausalRepairPacket(input), second = encodeCausalRepairPacket(input);
  const decoded = decodeCausalRepairPacket(wire(first.state));
  assert.deepEqual(decoded, snapshot); assert.deepEqual(input, snapshot); assert.deepEqual(first.state, second.state);
  assert.equal(first.state.schema_version, CAUSAL_PACKET_ENCODING_VERSION);
  assert.equal(decoded.failure.public_evidence.flatMap(row => row.evidence.cases).length, 93);
  assert.equal(first.report.lossless, true); assert.equal(first.report.roundtrip_verified, true);
  assert.equal(first.report.encoded_bytes, bytes(first.state)); assert.equal(first.report.wire_target_met, null);
  assert(first.state.o.length > 0);
  decoded.failure.repair_scope.causal.repair_history.entries[0].failures_before[0].message = 'changed locally';
  assert.equal(decoded.failure.repair_scope.causal.repair_history.entries[0].failures_after[0].message, snapshot.failure.public_evidence[1].evidence.cases[0].message);
});

test('literal reference syntax, negative zero, Unicode, empty values and prototype-shaped keys survive JSON serialization', () => {
  const input = {values: [null, false, true, 0, -0, '', [], {}, '@', '@0', '@@0', '한글 😀 雪\n\t\u0000', [-1, -2, -3, -4]],
    literal: JSON.parse('{"__proto__":{"safe":true},"constructor":"literal","prototype":0}'),
    repeated: Array.from({length: 3}, () => ({message: 'Repeated natural-language source string with exact punctuation.', values: ['@0', false, -0]}))};
  assert.deepEqual(decodeCausalRepairPacket(wire(encodeCausalRepairPacket(input).state)), input);
  assert.equal({}.safe, undefined);
});

test('unsupported JSON input fails before reading accessors or accepting lossy serialization', () => {
  const cycle = {}; cycle.self = cycle;
  const sparse = []; sparse[2] = true;
  const getter = {}; Object.defineProperty(getter, 'value', {enumerable: true, get: () => assert.fail('Accessor was invoked')});
  const hidden = {}; Object.defineProperty(hidden, 'value', {value: 1});
  const symbol = {[Symbol('metadata')]: 1};
  for (const input of [{value: undefined}, {value: NaN}, {value: Infinity}, {value: 1n}, {value: () => 1},
    {value: new Date()}, {value: sparse}, cycle, getter, hidden, symbol, Object.create(null)]) {
    assert.throws(() => encodeCausalRepairPacket(input), invalid);
  }
});

test('incomplete layouts, missing dictionaries, invalid references, cycles and identity drift fail closed', () => {
  const base = encodeCausalRepairPacket({value: 'original literal'}).state;
  const mutations = [value => {delete value.h;}, value => {value.extra = true;}, value => {value.instructions = 'Changed decoding rules';},
    value => {value.h = '0'.repeat(64);}, value => {value.k = [];}, value => {value.k.push(value.k[0]);},
    value => {value.l = [];}, value => {value.l[0].push(value.l[0][0]);}, value => {value.d.pop();},
    value => {value.d[1] = '@0';}, value => {value.s = ['literal']; value.d[1] = '@00';},
    value => {value.s = ['literal', 'literal'];}, value => {value.d[1] = [-2, 0];},
    value => {value.o = [[-2, 0]]; value.d[1] = [-2, 0];}, value => {value.d[1] = [-4, 0];},
    value => {value.d[1] = [-4];}, value => {value.d[1] = [-3, true];},
    value => {value.d[1] = {value: 'unsupported inline object'};}, value => {value.d[1] = [-5];}];
  for (const mutate of mutations) {const value = clone(base); mutate(value); assert.throws(() => decodeCausalRepairPacket(value), invalid);}
});

test('explicit chooser projection retains exact pass IDs/counts, every failure and causal path, and is reconstructable', () => {
  const input = fixture(), snapshot = clone(input), {state, report} = projectCausalChooserPacket(input);
  assert.deepEqual(input, snapshot); assert.deepEqual(restoreCausalChooserPacket(state, report), snapshot);
  const passed = state.failure.public_evidence[0], original = snapshot.failure.public_evidence[0];
  assert.deepEqual(passed.evidence.rows, original.evidence.cases.map(row => [row.test_id, row.assertions]));
  assert.equal(passed.assertions, original.assertions); assert.equal(passed.evidence.executed, true);
  assert.equal(passed.evidence.skipped, 0); assert.deepEqual(passed.evidence.unexecuted_test_ids, []);
  assert.deepEqual(state.failure.public_evidence[1], snapshot.failure.public_evidence[1]);
  assert.deepEqual(state.requirement_descriptions, snapshot.requirement_descriptions);
  assert.deepEqual(state.candidates, snapshot.candidates);
  assert.equal(state.context_ref, undefined); assert.equal(state.causal_contract, undefined); assert.equal(state.contract_source, undefined);
  assert.equal(state.units[0].interface, undefined); assert.equal(state.units[0].interface_ref.access, 'worker_only');
  assert.deepEqual(state.read_only_dependencies.noncausal_artifact_ids, ['A-other']);
  assert.equal(state.read_only_dependencies.causal_bindings[0].path, 'source.py');
  assert.deepEqual(state.failure.repair_scope.causal.chains[0].nodes.map(row => [row.artifact_id, row.owner_task_id, row.path]),
    snapshot.failure.repair_scope.causal.chains[0].nodes.map(row => [row.artifact_id, row.owner_task_id, row.path]));
  assert.equal(report.lossless, false); assert(report.omitted_fields.every(row => row.reason && row.value !== undefined));
  assert.equal(report.projected_bytes, bytes(state));
  assert.deepEqual(decodeCausalRepairPacket(wire(encodeCausalRepairPacket(state).state)), state);
});

test('mixed, uncertain, skipped, incomplete and mismatched pass evidence is not silently summarized', () => {
  const mutations = [row => {row.evidence.cases[0].status = 'failed';}, row => {row.outcome_uncertain = true;},
    row => {row.skipped = 1;}, row => {row.executed = false;}, row => {row.evidence.unexecuted_test_ids = ['T.not-run'];},
    row => {row.evidence.error = 'setup failed';}, row => {row.evidence.cases[0].assertions = 0;},
    row => {row.evidence.cases.push(clone(row.evidence.cases[0]));}];
  for (const mutate of mutations) {
    const input = fixture(); mutate(input.failure.public_evidence[0]);
    const projected = projectCausalChooserPacket(input);
    assert(!projected.report.omitted_fields.some(row => row.pointer === '/failure/public_evidence/0/evidence'));
    assert.deepEqual(restoreCausalChooserPacket(projected.state, projected.report), input);
  }
  const input = fixture(), originalPublicEvidence = clone(input.failure.public_evidence);
  originalPublicEvidence[0].evidence.cases[0].assertions++;
  assert.throws(() => projectCausalChooserPacket(input, {originalPublicEvidence}), invalid);
});

test('revision aliases retain before/after equality while failure text is literal and tampered reconstruction is rejected', () => {
  const input = fixture(), {state, report} = projectCausalChooserPacket(input);
  const history = state.failure.repair_scope.causal.repair_history.entries[0];
  assert.equal(history.changed_files[0].before_sha256, history.relevant_revisions.A.before);
  assert.equal(history.changed_files[0].after_sha256, history.relevant_revisions.A.after);
  assert.notEqual(history.changed_files[0].before_sha256, history.changed_files[0].after_sha256);
  assert.deepEqual(history.failures_before, input.failure.repair_scope.causal.repair_history.entries[0].failures_before);
  assert.deepEqual(history.failures_after, history.failures_before);
  assert.deepEqual(history.persistent_failure_keys, input.failure.repair_scope.causal.repair_history.entries[0].persistent_failure_keys);
  assert.equal(state.requirement_descriptions[1].text, input.requirement_descriptions[1].text);
  for (const mutate of [row => {row.projected_sha256 = '0'.repeat(64);}, row => {row.omitted_fields[0].value = 'tampered';},
    row => {row.hash_aliases[0].sha256 = '0'.repeat(64);}, row => {row.hash_aliases[0].field_paths = ['/missing'];}]) {
    const changed = clone(report); mutate(changed); assert.throws(() => restoreCausalChooserPacket(state, changed), invalid);
  }
});

test('chooser requirement scope preserves linked originals and unmapped requirements; all original worker inputs remain recoverable', () => {
  const {input, workerTaskBindings} = scopedFixture(), original = clone(input);
  const {state, report} = projectCausalChooserPacket(input, {workerTaskBindings});
  assert.deepEqual(state.requirement_descriptions.map(row => row.id), ['R-body', 'R-literal-hash']);
  assert.deepEqual(state.requirement_descriptions, input.requirement_descriptions.slice(0, 2));
  assert.deepEqual(state.chooser_requirement_scope.worker_only_requirement_ids, ['R-source']);
  assert.equal(report.requirement_projection.status, 'scoped');
  assert.deepEqual(state.execution_context.worker_profiles.map(row => row.id), ['W-producer', 'W-renderer', 'W-unknown']);
  assert.deepEqual(report.worker_profile_projection.omitted_worker_ids, ['W-unrelated']);
  assert.deepEqual(restoreCausalChooserPacket(state, report), original); assert.deepEqual(input, original);
  assert.deepEqual(state.failure.public_evidence[1], original.failure.public_evidence[1]);
  assert.deepEqual(state.candidates, original.candidates);
});

test('uncertain requirement attribution and missing worker bindings preserve complete originals instead of authorizing omission', () => {
  const mutations = [input => {input.failure.repair_scope.unresolved.push({reason: 'owner unknown'});},
    input => {input.failure.repair_scope.causal.unresolved.push({reason: 'path unknown'});},
    input => {input.failure.repair_scope.observed_failures[0].requirement_ids = [];},
    input => {input.failure.public_evidence[1].evidence.cases[0].test_id = 'T.unmapped';},
    input => {input.failure.public_evidence[0].exit_code = 1;},
    input => {input.failure.public_evidence[0].evidence.cases = [];},
    input => {input.failure.repair_scope.causal.repair_history.entries[0].failures_before[0].test_id = 'T.older-unmapped';},
    input => {input.failure.repair_scope.causal.chains[0].requirement_ids.push('R-missing');},
    input => {input.failure.public_evidence[1].evidence.cases = [];}];
  for (const mutate of mutations) {
    const {input} = scopedFixture(); mutate(input);
    const {state, report} = projectCausalChooserPacket(input);
    assert.deepEqual(state.requirement_descriptions, input.requirement_descriptions);
    assert.equal(report.requirement_projection.status, 'kept_all');
    assert.deepEqual(restoreCausalChooserPacket(state, report), input);
  }
  const {input, workerTaskBindings} = scopedFixture();
  workerTaskBindings[0].worker_id = undefined;
  const {state, report} = projectCausalChooserPacket(input, {workerTaskBindings});
  assert.deepEqual(state.execution_context.worker_profiles, input.execution_context.worker_profiles);
  assert.equal(report.worker_profile_projection.status, 'kept_all');
});

test('an older assertion under the same test cannot borrow the current assertion requirement mapping', () => {
  const {input} = scopedFixture();
  input.units[0].requirement_ids.push('R-older-assertion');
  input.requirement_descriptions.push({id: 'R-older-assertion', text: 'Original requirement for the historical assertion.'});
  input.failure.repair_scope.causal.repair_history.entries[0].failures_before[0].assertion_id = 'A.older-under-same-test';
  const {state, report} = projectCausalChooserPacket(input);
  assert.deepEqual(state.requirement_descriptions, input.requirement_descriptions);
  assert.equal(report.requirement_projection.status, 'kept_all');
  assert.match(report.requirement_projection.reason, /Historical failure attribution/);
  assert.deepEqual(restoreCausalChooserPacket(state, report), input);
});

test('exact current observations can be referenced from before/after history without losing values or changed-file meaning', () => {
  const {input} = referenceFixture(), original = clone(input), {state, report} = projectCausalChooserPacket(input);
  const entry = state.failure.repair_scope.causal.repair_history.entries[0];
  assert.equal(report.history_projection.reference_count, 16); assert.equal(report.history_projection.preserved_full_count, 0);
  assert.deepEqual(entry.failures_before[0], {same_as_current: {check_id: 'public.failed', test_id: 'T.body.0', assertion_id: 'A.body.0'}});
  assert.deepEqual(entry.failures_after, entry.failures_before);
  assert.deepEqual(state.failure.public_evidence[1], original.failure.public_evidence[1]);
  assert.deepEqual(entry.persistent_failure_keys, original.failure.repair_scope.causal.repair_history.entries[0].persistent_failure_keys);
  assert.notEqual(entry.changed_files[0].before_sha256, entry.changed_files[0].after_sha256);
  assert.equal(state.failure.repair_scope.causal.repair_history.observation_references.includes('No external lookup'), true);
  assert.deepEqual(restoreCausalChooserPacket(state, report), original); assert.deepEqual(input, original);
});

test('changed historical values, unknown fields, ambiguous current observations and uncertainty are never replaced by references', () => {
  const mutations = [input => {input.failure.repair_scope.causal.repair_history.entries[0].failures_before[0].description_provenance.actual = 'OLDER';},
    input => {input.failure.repair_scope.causal.repair_history.entries[0].failures_before[0].message = 'Different historical error';},
    input => {input.failure.repair_scope.causal.repair_history.entries[0].failures_before[0].unexpected_detail = {retain: true};},
    input => {input.failure.repair_scope.causal.repair_history.entries[0].failures_before[0].assertion_id = 'A.older';},
    input => {input.failure.public_evidence[1].evidence.cases.push(clone(input.failure.public_evidence[1].evidence.cases[0]));},
    input => {input.failure.public_evidence[1].outcome_uncertain = true;}];
  for (const mutate of mutations) {
    const {input} = referenceFixture(); mutate(input); const original = clone(input), {state, report} = projectCausalChooserPacket(input);
    assert.deepEqual(state.failure.repair_scope.causal.repair_history.entries[0].failures_before[0],
      original.failure.repair_scope.causal.repair_history.entries[0].failures_before[0]);
    assert(report.history_projection.preserved_full_count >= 1);
    assert.deepEqual(restoreCausalChooserPacket(state, report), original);
  }
});
