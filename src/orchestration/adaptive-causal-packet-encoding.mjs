import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';

export const CAUSAL_PACKET_ENCODING_VERSION = 'adaptive-causal-packet/v1';
export const CAUSAL_PACKET_DECODING_INSTRUCTIONS = 'Decode d losslessly: k=field names;l=layouts of k indexes;s=literal strings;o=shared values. [N,...v],N>=0 means object with keys k[l[N][i]] and values v[i]. [-1,...v]=array;[]=empty array;[-2,N]=o[N];[-3]=-0. @N strings=s[base36 N];@@ escapes literal @. [-4,...p] joins literal string parts and s[N] for integer parts without spaces. Recurse, then follow decoded instructions/inline_encoding. h verifies decoded identity. Shared refs add no evidence; controller_only/worker_only refs grant no retrieval.';
const MODULE_PATH = 'src/orchestration/adaptive-causal-packet-encoding.mjs';
const own = (x, key) => Object.hasOwn(x, key);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const bytes = x => Buffer.byteLength(JSON.stringify(x), 'utf8');
const hash = x => createHash('sha256').update(x).digest('hex');
const fail = detail => { throw Object.assign(new Error('INVALID_CAUSAL_PACKET_ENCODING'), {code: 'INVALID_CAUSAL_PACKET_ENCODING', detail}); };
const canonical = value => typeof value === 'number' && Object.is(value, -0) ? '-0' : Array.isArray(value)
  ? `[${value.map(canonical).join(',')}]` : object(value)
    ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const digest = value => hash(canonical(value));

function assertJson(value, ancestors = new Set(), depth = 0) {
  if (depth > 128) fail('Maximum JSON depth exceeded');
  if (value === null || ['string', 'boolean'].includes(typeof value) || typeof value === 'number' && Number.isFinite(value)) return;
  if (!(Array.isArray(value) || object(value)) || ancestors.has(value)) fail('Expected acyclic JSON');
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.keys(value).length !== value.length
        || [...value.keys()].some(index => !own(value, index)) || Object.getOwnPropertySymbols(value).length) fail('Expected a plain dense array');
  } else if (Object.getPrototypeOf(value) !== Object.prototype || Reflect.ownKeys(value).length !== Object.keys(value).length) fail('Expected plain enumerable JSON fields');
  if (Object.values(Object.getOwnPropertyDescriptors(value)).some(row => row.get || row.set)) fail('Accessor fields are unsupported');
  ancestors.add(value); for (const child of Object.values(value)) assertJson(child, ancestors, depth + 1); ancestors.delete(value);
}

export function causalPacketEncodingPolicy() {
  return {schema_version: CAUSAL_PACKET_ENCODING_VERSION, source: {path: MODULE_PATH,
    sha256: hash(readFileSync(new URL('./adaptive-causal-packet-encoding.mjs', import.meta.url)))},
  serialization_lossless: true, semantic_projection_lossless: false, live_codec_enabled: false, experimental_wire_target_bytes: 24000,
  wire_guard: 'The live path sends readable projected JSON. Its separately versioned admission policy measures the complete prepareDecision serialization; this experimental codec never overrides admission.'};
}

function caseRows(value) {
  if (Array.isArray(value)) return value;
  if (!object(value) || !Array.isArray(value.columns) || !Array.isArray(value.rows)
      || value.columns.some(key => typeof key !== 'string') || new Set(value.columns).size !== value.columns.length) return null;
  if (!value.rows.every(row => Array.isArray(row) && row.length === value.columns.length)) return null;
  return value.rows.map(row => {
    const out = Object.fromEntries(value.columns.map((key, index) => [key, row[index]]));
    if (object(out.details)) { const details = out.details; delete out.details; return {...out, ...details}; }
    return out;
  });
}

function requirementProjection(state) {
  const descriptions = state.requirement_descriptions, scope = state.failure?.repair_scope, causal = scope?.causal;
  const keep = reason => ({status: 'kept_all', reason, included_requirement_ids: descriptions?.map(row => row.id) ?? [], worker_only_requirement_ids: []});
  const ids = value => Array.isArray(value) && value.length > 0 && value.every(id => typeof id === 'string' && id.length > 0);
  if (!Array.isArray(descriptions) || !descriptions.every(row => object(row) && typeof row.id === 'string')
      || !Array.isArray(scope?.observed_failures) || !scope.observed_failures.length
      || !Array.isArray(causal?.chains) || !causal.chains.length) return keep('Missing explicit failure or causal requirement mapping.');
  if (state.failure.outcome_uncertain !== false || (state.failure.failed_task_ids ?? []).length || scope.fallback_required === true
      || ['unresolved', 'unexecuted', 'fixture_blockers', 'not_reached_assertions'].some(key => scope[key] !== undefined && (!Array.isArray(scope[key]) || scope[key].length))
      || causal.unresolved !== undefined && (!Array.isArray(causal.unresolved) || causal.unresolved.length)) return keep('Uncertain, unresolved, unexecuted or local-task ownership needs the original requirements.');
  if (!scope.observed_failures.every(row => object(row) && typeof row.check_id === 'string' && typeof row.test_id === 'string' && ids(row.requirement_ids))
      || !causal.chains.every(row => object(row) && ids(row.requirement_ids))) return keep('An observed failure or causal path has incomplete requirement IDs.');
  const known = row => scope.observed_failures.some(item => item.check_id === row.check_id && item.test_id === row.test_id);
  const observed = new Set();
  for (const report of state.failure.public_evidence ?? []) {
    const effective = {...state.failure.public_evidence_defaults, ...report};
    if (!['passed', 'failed'].includes(effective.status) || effective.executed !== true || effective.outcome_uncertain !== false
        || effective.skipped !== 0 || report.evidence?.error !== null || !Array.isArray(report.evidence?.unexecuted_test_ids)
        || report.evidence.unexecuted_test_ids.length) return keep('Public outcome is incomplete or uncertain.');
    const cases = caseRows(report.evidence?.cases);
    if (effective.status === 'passed') {
      if (effective.exit_code !== 0 || !cases?.length || cases.some(row => row.status !== 'passed')) return keep('Successful public evidence is missing or contradictory.');
      continue;
    }
    if (!cases || cases.some(row => !['passed', 'failed'].includes(row.status)
        || row.status === 'failed' && !known({check_id: report.check_id, test_id: row.test_id}))) return keep('A failed case has no explicit requirement attribution.');
    for (const row of cases.filter(row => row.status === 'failed')) observed.add(JSON.stringify([report.check_id, row.test_id]));
  }
  if (scope.observed_failures.some(row => !observed.has(JSON.stringify([row.check_id, row.test_id])))) return keep('Failure attribution has no matching failed public observation.');
  for (const report of state.failure.local_evidence ?? []) {
    const effective = {...state.failure.local_evidence_defaults, ...report};
    if (effective.status !== 'passed' || effective.executed !== true || effective.outcome_uncertain !== false) return keep('Local execution has an unresolved failure or unknown outcome.');
  }
  for (const entry of causal.repair_history?.entries ?? []) {
    const knownHistory = row => scope.observed_failures.some(item => item.check_id === row.check_id && item.test_id === row.test_id
      && (item.assertion_id ?? null) === (row.assertion_id ?? null));
    if (![entry.failures_before, entry.failures_after].every(Array.isArray)
        || [...entry.failures_before, ...entry.failures_after].some(row => !knownHistory(row))) return keep('Historical failure attribution is not fully linked to the current requirement map.');
  }
  const active = new Set([...scope.observed_failures, ...causal.chains].flatMap(row => row.requirement_ids));
  if ([...active].some(id => !descriptions.some(row => row.id === id))) return keep('A mapped original requirement is unavailable.');
  const unitIds = new Set((state.units ?? []).flatMap(row => row.requirement_ids ?? []));
  return {status: 'scoped', reason: 'Exact assertion/causal requirements remain inline; other explicitly known unit requirements stay complete in workers and the controller.',
    included_requirement_ids: descriptions.filter(row => active.has(row.id) || !unitIds.has(row.id)).map(row => row.id),
    worker_only_requirement_ids: descriptions.filter(row => !active.has(row.id) && unitIds.has(row.id)).map(row => row.id)};
}

function projectHistoryObservations(state, remember) {
  const history = state.failure?.repair_scope?.causal?.repair_history;
  const report = {mode: 'exact_current_public_observation_reuse', reference_count: 0, preserved_full_count: 0};
  if (!Array.isArray(history?.entries)) return report;
  const identity = row => JSON.stringify([row.check_id, row.test_id, row.assertion_id]);
  const current = new Map();
  for (const item of state.failure.public_evidence ?? []) {
    const effective = {...state.failure.public_evidence_defaults, ...item};
    if (effective.status !== 'failed' || effective.executed !== true || effective.outcome_uncertain !== false) continue;
    for (const testcase of caseRows(item.evidence?.cases) ?? []) {
      if (testcase.status !== 'failed' || typeof testcase.test_id !== 'string') continue;
      const observation = {check_id: item.check_id, test_id: testcase.test_id, assertion_id: testcase.failed_assertion_id ?? null,
        error_type: testcase.error_type ?? null, message: testcase.message ?? null,
        ...(own(testcase, 'description_provenance') ? {description_provenance: structuredClone(testcase.description_provenance)} : {})};
      const key = identity(observation), values = current.get(key) ?? []; values.push(observation); current.set(key, values);
    }
  }
  for (const [entryIndex, entry] of history.entries.entries()) for (const field of ['failures_before', 'failures_after']) {
    if (!Array.isArray(entry[field])) continue;
    for (const [rowIndex, row] of entry[field].entries()) {
      const observations = current.get(identity(row));
      if (observations?.length !== 1 || !isDeepStrictEqual(row, observations[0])) { report.preserved_full_count++; continue; }
      if (own(history, 'observation_references')) fail('History reference metadata already present');
      remember(`/failure/repair_scope/causal/repair_history/entries/${entryIndex}/${field}/${rowIndex}`, row,
        'Exact complete historical observation equals one current failed public case: check_id/test_id/assertion_id, error_type, message and complete description_provenance. Current values remain inline once; changed or unknown values are never replaced.');
      entry[field][rowIndex] = {same_as_current: {check_id: row.check_id, test_id: row.test_id, assertion_id: row.assertion_id}};
      report.reference_count++;
    }
  }
  if (report.reference_count) history.observation_references = 'same_as_current means this complete before/after observation is unchanged from the unique current failed public case with the same check_id, test_id and failed_assertion_id (null if absent). Read error_type, message and the complete description_provenance from that inline case; absent error/message means null. This preserves the observation at this history position, not a claim that files or causes are unchanged. No external lookup is needed.';
  return report;
}

/** Explicit semantic projection. Removed values remain in the controller report, never silently discarded. */
export function projectCausalChooserPacket(input, {originalPublicEvidence, workerTaskBindings} = {}) {
  assertJson(input); if (!object(input)) fail('Decision state must be an object');
  const state = structuredClone(input), omissions = [];
  if (own(state, 'integrity_aliases') || own(state, 'chooser_requirement_scope')) fail('Projection metadata already present');
  const remember = (pointer, value, reason) => omissions.push({pointer, reason, sha256: digest(value), utf8_bytes: bytes(value), value: structuredClone(value)});
  for (const key of ['context_ref', 'causal_contract', 'contract_source']) if (own(state, key)) {
    remember(`/${key}`, state[key], 'Controller-only protocol provenance; executable contract validation and exact source identities stay in the controller report. All decision policy instructions and requirement evidence remain inline.');
    delete state[key];
  }
  const requirementScope = requirementProjection(state);
  if (requirementScope.worker_only_requirement_ids.length) {
    remember('/requirement_descriptions', state.requirement_descriptions, requirementScope.reason);
    const included = new Set(requirementScope.included_requirement_ids);
    state.requirement_descriptions = state.requirement_descriptions.filter(row => included.has(row.id));
    state.chooser_requirement_scope = {basis: 'observed_assertion_and_causal_chain',
      worker_only_requirement_ids: requirementScope.worker_only_requirement_ids, full_requirements_access: 'controller_and_worker_only'};
  }
  const workerProfiles = state.execution_context?.worker_profiles;
  let profileProjection = {status: 'kept_all', reason: 'No complete task-to-worker binding supplied.'};
  if (Array.isArray(workerProfiles) && Array.isArray(workerTaskBindings)
      && workerTaskBindings.every(row => object(row) && typeof row.task_id === 'string' && (row.worker_id === null || typeof row.worker_id === 'string'))) {
    const taskIds = new Set([...(state.candidates ?? []).flatMap(row => row.task_ids ?? []),
      ...(state.failure?.repair_scope?.causal?.chains ?? []).flatMap(row => row.nodes.map(node => node.owner_task_id))]);
    if (taskIds.size && [...taskIds].every(id => workerTaskBindings.some(row => row.task_id === id && row.worker_id !== null))) {
      const knownWorkerIds = new Set(workerTaskBindings.map(row => row.worker_id).filter(Boolean));
      const relatedWorkerIds = new Set(workerTaskBindings.filter(row => taskIds.has(row.task_id)).map(row => row.worker_id));
      const selected = workerProfiles.filter(row => !knownWorkerIds.has(row.id) || relatedWorkerIds.has(row.id));
      profileProjection = {status: 'scoped', included_worker_ids: selected.map(row => row.id),
        omitted_worker_ids: workerProfiles.filter(row => !selected.includes(row)).map(row => row.id), task_bindings: structuredClone(workerTaskBindings)};
      if (selected.length !== workerProfiles.length) {
        if (own(state.execution_context, 'worker_profiles_scope')) fail('Profile projection metadata already present');
        remember('/execution_context/worker_profiles', workerProfiles, 'Current profiles of causal/candidate tasks remain inline; other known worker profiles stay in the controller. Unmapped worker identities remain inline.');
        state.execution_context.worker_profiles = selected;
        state.execution_context.worker_profiles_scope = 'Only causal/candidate task workers and unmapped identities; complete profiles stay in controller.';
      }
    }
  }
  for (const [index, unit] of (state.units ?? []).entries()) {
    if (!object(unit) || typeof unit.interface !== 'string') continue;
    if (own(unit, 'interface_ref')) fail('Interface projection already present');
    remember(`/units/${index}/interface`, unit.interface, 'Full implementation interface stays in the worker packet; chooser retains unit, artifact, requirement, evidence and causal path descriptors.');
    unit.interface_ref = {access: 'worker_only', sha256: digest(unit.interface)}; delete unit.interface;
  }
  const defaults = state.failure?.public_evidence_defaults ?? {};
  for (const [index, report] of (state.failure?.public_evidence ?? []).entries()) {
    const effective = {...defaults, ...report}, evidence = report.evidence;
    const cases = caseRows(evidence?.cases);
    if (effective.status !== 'passed' || effective.executed !== true || effective.outcome_uncertain !== false || effective.exit_code !== 0
        || !object(evidence) || evidence.error !== null || !Array.isArray(evidence.unexecuted_test_ids) || evidence.unexecuted_test_ids.length
        || effective.skipped !== 0 || !cases?.length || cases.some(row => row.status !== 'passed' || typeof row.test_id !== 'string'
          || !Number.isSafeInteger(row.assertions) || row.assertions < 1) || new Set(cases.map(row => row.test_id)).size !== cases.length) continue;
    const original = originalPublicEvidence?.find(row => row.check_id === report.check_id) ?? input.failure.public_evidence[index];
    const originalCases = caseRows(original.evidence?.cases);
    if (!originalCases || !isDeepStrictEqual(originalCases.map(row => [row.test_id, row.status, row.assertions]),
      cases.map(row => [row.test_id, row.status, row.assertions]))) fail('Original successful report does not match packet cases');
    remember(`/failure/public_evidence/${index}/evidence`, evidence,
      'Known successful suite only: exact test IDs and assertion counts stay inline; successful invocation/setup/environment details stay in immutable controller evidence.');
    report.evidence = {encoding: 'passed-case-id-assertion-count/v1', columns: ['test_id', 'assertions'],
      rows: cases.map(row => [row.test_id, row.assertions]), case_status: 'passed', executed: true, skipped: 0,
      unexecuted_test_ids: [], error: null,
      original_report_ref: {sha256: digest(original), pointer: `/failure/public_evidence/${index}`, access: 'controller_only'}};
  }
  // Cryptographic candidate authorization remains enforced by the controller before/after the choice.
  const causal = state.failure?.repair_scope?.causal;
  const dependencyRows = caseRows(state.read_only_dependencies);
  if (dependencyRows && object(causal) && Array.isArray(causal.chains)) {
    const causalIds = new Set(causal.chains.flatMap(chain => chain.nodes.map(node => node.artifact_id)));
    const outside = dependencyRows.filter(row => !causalIds.has(row.artifact_id));
    if (outside.length) {
      if (dependencyRows.some(row => typeof row.artifact_id !== 'string')) fail('Dependency artifact identity unavailable');
      remember('/read_only_dependencies', state.read_only_dependencies,
        'Noncausal read-only dependency file bindings remain controller/worker metadata; exact artifact IDs stay inline and all causal path descriptors remain complete.');
      state.read_only_dependencies = {noncausal_artifact_ids: outside.map(row => row.artifact_id),
        causal_bindings: dependencyRows.filter(row => causalIds.has(row.artifact_id)),
        full_bindings_access: 'controller_and_worker_only'};
    }
  }
  if (object(causal)) for (const key of ['binding', 'choice_bindings', 'sha256']) if (own(causal, key)) {
    remember(`/failure/repair_scope/causal/${key}`, causal[key], 'Controller-only integrity metadata; exact causal nodes, source revisions, legal candidates and repair history remain inline.');
    delete causal[key];
  }
  const historyProjection = projectHistoryObservations(state, remember);
  const hashAliases = [], aliasIds = new Map();
  const aliasHashes = (value, path = '', key = '', revisionMap = false) => {
    if (typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
        && (key === 'sha256' || key.endsWith('_sha256') || ['revision', 'artifact_revision', 'binding_digest', 'plan_hash', 'environment_fingerprint'].includes(key)
          || revisionMap)) {
      if (!aliasIds.has(value)) { aliasIds.set(value, `h${hashAliases.length}`); hashAliases.push({alias: aliasIds.get(value), sha256: value, field_paths: []}); }
      const alias = aliasIds.get(value); hashAliases.find(row => row.alias === alias).field_paths.push(path); return alias;
    }
    if (Array.isArray(value)) return value.map((child, index) => aliasHashes(child, `${path}/${index}`, key, revisionMap));
    if (!object(value)) return value;
    return Object.fromEntries(Object.entries(value).map(([name, child]) => [name,
      aliasHashes(child, `${path}/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`, name,
        revisionMap || ['artifact_revisions', 'relevant_revisions'].includes(name))]));
  };
  const projected = aliasHashes(state);
  if (hashAliases.length) projected.integrity_aliases = 'hN replaces an exact SHA-256 or revision hash held by the controller. Equal aliases mean equal byte identities; different aliases mean different identities. Aliases do not grant retrieval or write authority.';
  const report = {schema_version: 'adaptive-causal-chooser-projection/v1', lossless: false, input_sha256: digest(input),
    projected_sha256: digest(projected), input_bytes: bytes(input), projected_bytes: bytes(projected), omitted_fields: omissions,
    hash_aliases: hashAliases, reconstruction: 'Restore alias occurrences at their exact field_paths using hash_aliases, then restore omitted_fields in reverse order. Remove integrity_aliases and added interface_ref markers. The original input SHA-256 validates the reconstruction.',
    requirement_projection: requirementScope, worker_profile_projection: profileProjection, history_projection: historyProjection,
    failure_and_history_policy: 'Failed, mixed, uncertain and incomplete reports and all repair-history entries remain semantically complete; exact integrity hashes may use reversible controller aliases.',
    implementation_interfaces: 'Worker packets remain complete; these refs cannot be retrieved by the chooser.'};
  report.sha256 = digest(report);
  return {state: projected, report};
}

/** Controller-only reconstruction proves what projection removed; it is never provider input. */
export function restoreCausalChooserPacket(projected, report) {
  assertJson(projected); assertJson(report);
  if (!object(projected) || !object(report)) fail('Projection state and report must be objects');
  const {sha256: reportHash, ...reportBody} = report;
  if (reportHash !== digest(reportBody) || report?.schema_version !== 'adaptive-causal-chooser-projection/v1' || digest(projected) !== report.projected_sha256
      || !Array.isArray(report.omitted_fields) || !Array.isArray(report.hash_aliases)) fail('Projection report identity mismatch');
  const state = structuredClone(projected);
  const parent = pointer => {
    if (typeof pointer !== 'string' || !pointer.startsWith('/')) fail('Invalid reconstruction pointer');
    const keys = pointer.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'));
    const key = keys.pop(); let value = state;
    for (const key of keys) { if (!value || typeof value !== 'object' || !own(value, key)) fail('Missing reconstruction path'); value = value[key]; }
    return {value, key};
  };
  const set = (pointer, replacement) => {
    const {value, key} = parent(pointer);
    Object.defineProperty(value, key, {value: structuredClone(replacement), writable: true, enumerable: true, configurable: true});
  };
  for (const row of report.hash_aliases) {
    if (typeof row.alias !== 'string' || !/^h\d+$/.test(row.alias) || !/^[a-f0-9]{64}$/.test(row.sha256) || !Array.isArray(row.field_paths)) fail('Invalid hash alias');
    for (const path of row.field_paths) { const {value, key} = parent(path); if (value[key] !== row.alias) fail('Hash alias reconstruction mismatch'); set(path, row.sha256); }
  }
  if (report.hash_aliases.length) delete state.integrity_aliases;
  for (const row of [...report.omitted_fields].reverse()) {
    if (digest(row.value) !== row.sha256 || bytes(row.value) !== row.utf8_bytes) fail('Omitted field identity mismatch');
    set(row.pointer, row.value);
    if (/^\/units\/\d+\/interface$/.test(row.pointer)) { const {value} = parent(row.pointer); delete value.interface_ref; }
    if (row.pointer === '/requirement_descriptions') delete state.chooser_requirement_scope;
    if (row.pointer === '/execution_context/worker_profiles') delete state.execution_context.worker_profiles_scope;
  }
  if (report.history_projection?.reference_count) delete state.failure.repair_scope.causal.repair_history.observation_references;
  if (digest(state) !== report.input_sha256) fail('Reconstructed input identity mismatch');
  return state;
}

function fragmentCodec(counts) {
  const frequencies = new Map();
  for (const [text, count] of counts) {
    const words = text.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+|\s+/gu) ?? [], found = new Set([text]);
    for (let first = 0; first < words.length; first++) {
      let part = '';
      for (let last = first; last < Math.min(words.length, first + 20); last++) {
        part += words[last]; if (part.length > 256) break; if (part.length >= 4) found.add(part);
      }
    }
    for (const part of found) frequencies.set(part, (frequencies.get(part) ?? 0) + count);
  }
  let fragments = [...frequencies].map(([text, count]) => ({text, count, gain: (bytes(text) - 6) * count - bytes(text) - 1}))
    .filter(row => row.count >= 2 && row.gain >= 12).sort((a, b) => b.gain - a.gain || b.text.length - a.text.length
      || (a.text < b.text ? -1 : a.text > b.text ? 1 : 0)).slice(0, 12000).map(row => row.text);
  const compile = pool => {
    const trie = Object.create(null), cache = new Map(), usage = Array(pool.length).fill(0);
    pool.forEach((text, id) => { let node = trie; for (const char of text.split('')) node = node[char] ??= Object.create(null); node.id = id; });
    const encode = text => {
      if (cache.has(text)) return cache.get(text);
      const costs = Array.from({length: text.length + 1}, () => [Infinity, Infinity]);
      const prior = Array.from({length: text.length + 1}, () => [null, null]); costs[0][0] = 0;
      for (let at = 0; at < text.length; at++) for (let literal = 0; literal < 2; literal++) {
        const cost = costs[at][literal]; if (!Number.isFinite(cost)) continue;
        const next = cost + bytes(text[at]) - 2 + (literal ? 0 : 3);
        if (next < costs[at + 1][1]) { costs[at + 1][1] = next; prior[at + 1][1] = [at, literal, text[at]]; }
        let node = trie;
        for (let end = at; end < text.length; end++) {
          node = node[text[end]]; if (!node) break;
          if (node.id !== undefined) {
            const next = cost + String(node.id).length + 1;
            if (next < costs[end + 1][0]) { costs[end + 1][0] = next; prior[end + 1][0] = [at, literal, node.id]; }
          }
        }
      }
      let at = text.length, literal = costs[at][0] < costs[at][1] ? 0 : 1;
      const reversed = []; while (at) { const step = prior[at][literal]; reversed.push(step[2]); [at, literal] = step; }
      const parts = []; for (const part of reversed.reverse()) {
        if (typeof part === 'string' && typeof parts.at(-1) === 'string') parts[parts.length - 1] += part; else parts.push(part);
      }
      let value = parts.length === 1 && typeof parts[0] === 'number' ? '@' + parts[0].toString(36) : [-4, ...parts];
      const plain = text.startsWith('@') ? '@' + text : text;
      if (bytes(value) >= bytes(plain)) value = plain;
      cache.set(text, value); return value;
    };
    for (const [text, count] of counts) {
      const encoded = encode(text);
      if (typeof encoded === 'string' && /^@[0-9a-z]+$/.test(encoded)) usage[parseInt(encoded.slice(1), 36)] += count;
      else if (Array.isArray(encoded)) for (const part of encoded.slice(1)) if (typeof part === 'number') usage[part] += count;
    }
    return {encode, usage};
  };
  for (let pass = 0; pass < 8; pass++) {
    const codec = compile(fragments);
    const keep = fragments.filter((text, index) => codec.usage[index] >= 2 && (bytes(text) - String(index).length - 1) * codec.usage[index] > bytes(text) + 4);
    if (keep.length === fragments.length) break; fragments = keep;
  }
  return {fragments, ...compile(fragments)};
}

/** Lossless transport only: no semantic fields or history are removed here. */
export function encodeCausalRepairPacket(input) {
  assertJson(input); if (!object(input)) fail('Decision state must be an object');
  const keys = [], keyIds = new Map(), layouts = [], layoutIds = new Map(), compositeCounts = new Map();
  function inspect(value) {
    if (!value || typeof value !== 'object') return;
    const identity = canonical(value); compositeCounts.set(identity, (compositeCounts.get(identity) ?? 0) + 1);
    if (object(value)) {
      for (const key of Object.keys(value)) if (!keyIds.has(key)) { keyIds.set(key, keys.length); keys.push(key); }
      const shape = Object.keys(value).map(key => keyIds.get(key)), id = JSON.stringify(shape);
      if (!layoutIds.has(id)) { layoutIds.set(id, layouts.length); layouts.push(shape); }
    }
    Object.values(value).forEach(inspect);
  }
  inspect(input);
  const objects = [], objectIds = new Map();
  function encodeStructure(value, literal = false) {
    if (typeof value === 'number' && Object.is(value, -0)) return [-3];
    if (!value || typeof value !== 'object') return value;
    const identity = canonical(value);
    if (!literal && bytes(value) >= 16 && compositeCounts.get(identity) > 1) {
      if (!objectIds.has(identity)) { const id = objects.length; objectIds.set(identity, id); objects.push(null); objects[id] = encodeStructure(value, true); }
      return [-2, objectIds.get(identity)];
    }
    if (Array.isArray(value)) return value.length ? [-1, ...value.map(child => encodeStructure(child))] : [];
    return [layoutIds.get(JSON.stringify(Object.keys(value).map(key => keyIds.get(key)))), ...Object.values(value).map(child => encodeStructure(child))];
  }
  const data = encodeStructure(input), counts = new Map();
  const scan = value => { if (typeof value === 'string') counts.set(value, (counts.get(value) ?? 0) + 1); else if (Array.isArray(value)) value.forEach(scan); };
  scan(data); scan(objects);
  const codec = fragmentCodec(counts), encodeText = value => typeof value === 'string' ? codec.encode(value)
    : Array.isArray(value) ? value.map(encodeText) : value;
  const state = {schema_version: CAUSAL_PACKET_ENCODING_VERSION, instructions: CAUSAL_PACKET_DECODING_INSTRUCTIONS,
    h: digest(input), k: keys, l: layouts, s: codec.fragments, o: encodeText(objects), d: encodeText(data)};
  const decoded = decodeCausalRepairPacket(state);
  if (!isDeepStrictEqual(decoded, input)) fail('Encoder roundtrip changed input');
  return {state, report: {schema_version: 'adaptive-causal-packet-encoding-report/v1', source: causalPacketEncodingPolicy().source,
    input_sha256: state.h, encoded_sha256: digest(state), input_bytes: bytes(input), encoded_bytes: bytes(state),
    field_count: keys.length, layout_count: layouts.length, fragment_count: codec.fragments.length, object_count: objects.length,
    lossless: true, roundtrip_verified: true, wire_bytes: null, wire_target_met: null, provider_acceptance: 'unmeasured'}};
}

export function decodeCausalRepairPacket(envelope) {
  assertJson(envelope);
  const fields = ['schema_version', 'instructions', 'h', 'k', 'l', 's', 'o', 'd'];
  if (!object(envelope) || Object.keys(envelope).length !== fields.length || fields.some(key => !own(envelope, key))
      || envelope.schema_version !== CAUSAL_PACKET_ENCODING_VERSION || envelope.instructions !== CAUSAL_PACKET_DECODING_INSTRUCTIONS
      || !/^[a-f0-9]{64}$/.test(envelope.h) || ![envelope.k, envelope.l, envelope.s, envelope.o].every(Array.isArray)
      || envelope.k.some(key => typeof key !== 'string') || new Set(envelope.k).size !== envelope.k.length
      || envelope.s.some(value => typeof value !== 'string') || new Set(envelope.s).size !== envelope.s.length) fail('Malformed envelope or codebook');
  const validIndex = (value, table) => Number.isSafeInteger(value) && value >= 0 && value < table.length;
  for (const layout of envelope.l) if (!Array.isArray(layout) || new Set(layout).size !== layout.length
    || layout.some(index => !validIndex(index, envelope.k))) fail('Invalid field layout');
  let visits = 0;
  function decode(value, active = new Set(), depth = 0) {
    if (++visits > 500000 || depth > 128) fail('Expanded packet limit exceeded');
    if (typeof value === 'string') {
      if (value.startsWith('@@')) return value.slice(1);
      if (!value.startsWith('@')) return value;
      if (!/^@[0-9a-z]+$/.test(value)) fail('Invalid string reference');
      const index = parseInt(value.slice(1), 36);
      if (!validIndex(index, envelope.s) || index.toString(36) !== value.slice(1)) fail('Unknown string reference');
      return envelope.s[index];
    }
    if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
    if (!Array.isArray(value)) fail('Unexpected literal object');
    if (!value.length) return [];
    const [tag, ...cells] = value;
    if (tag === -1) return cells.map(item => decode(item, active, depth + 1));
    if (tag === -2) {
      if (cells.length !== 1 || !validIndex(cells[0], envelope.o) || active.has(cells[0])) fail('Invalid or circular object reference');
      return decode(envelope.o[cells[0]], new Set([...active, cells[0]]), depth + 1);
    }
    if (tag === -3 && cells.length === 0) return -0;
    if (tag === -4) {
      if (!cells.length || cells.some(part => typeof part !== 'string' && !validIndex(part, envelope.s))) fail('Invalid string parts');
      return cells.map(part => typeof part === 'string' ? part : envelope.s[part]).join('');
    }
    if (!validIndex(tag, envelope.l) || cells.length !== envelope.l[tag].length) fail('Unknown object layout or incomplete cells');
    return Object.fromEntries(envelope.l[tag].map((index, offset) => [envelope.k[index], decode(cells[offset], active, depth + 1)]));
  }
  const state = decode(envelope.d);
  if (!object(state) || digest(state) !== envelope.h) fail('Decoded state integrity mismatch');
  return state;
}
