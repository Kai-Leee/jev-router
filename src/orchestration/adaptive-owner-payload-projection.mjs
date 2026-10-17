import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {prepareDecision} from '../client.mjs';

export const OWNER_PAYLOAD_CONTRACT = 'docs/orchestration/contracts/adaptive-owner-payload.v1.json';
const raw = readFileSync(new URL('../../docs/orchestration/contracts/adaptive-owner-payload.v1.json', import.meta.url), 'utf8');
const contract = JSON.parse(raw), marker = contract.marker;
const hash = value => createHash('sha256').update(value).digest('hex');
const digest = value => hash(JSON.stringify(value));
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = code => {throw Object.assign(new Error(code), {code, outcome_uncertain: false});};
const need = (ok, code = 'ADAPTIVE_OWNER_PAYLOAD_INVALID') => {if (!ok) fail(code);};
const source = {path: OWNER_PAYLOAD_CONTRACT, sha256: hash(raw)};
const ownKeys = (value, keys) => object(value) && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort());
const get = (state, path) => path.split('.').reduce((value, key) => value?.[key], state);
const set = (state, path, value) => {const parts = path.split('.'), key = parts.pop(); get(state, parts.join('.'))[key] = value;};
const put = (state, path, value) => path.includes('.') ? set(state, path, value) : state[path] = value;

function labelsFor(request) {
  const artifacts = new Map((request.state.artifact_contracts ?? []).map(row => [row.id, row]));
  need(artifacts.size === request.state.artifact_contracts.length && !artifacts.has('unknown'));
  const labels = {};
  for (const [qid, question] of Object.entries(request.questions)) {
    need(question.type === 'choice' && object(question.criteria) && typeof question.criteria.unknown === 'string');
    need(isDeepStrictEqual(Object.keys(question.criteria).filter(id => id !== 'unknown').sort(), [...artifacts.keys()].sort()),
      'ADAPTIVE_OWNER_PAYLOAD_LABEL_INVALID');
    const grouped = {};
    for (const [id, value] of Object.entries(question.criteria)) {
      if (id === 'unknown' || value === null) continue;
      const artifact = artifacts.get(id);
      need(artifact && Array.isArray(artifact.paths));
      if (typeof artifact.description !== 'string') continue;
      const kind = value === `${artifact.paths.join(', ')}: ${artifact.description}` ? 'paths_description'
        : value === artifact.description ? 'description' : null;
      if (!kind) continue;
      (grouped[kind] ??= []).push(id);
    }
    if (Object.keys(grouped).length) labels[qid] = grouped;
  }
  return labels;
}

function walk(value, visit) {
  if (Array.isArray(value)) value.forEach(child => walk(child, visit));
  else if (object(value)) {visit(value); Object.values(value).forEach(child => walk(child, visit));}
}

function decode(value, schemas) {
  if (Array.isArray(value)) return value.map(child => decode(child, schemas));
  if (!object(value)) return value;
  if (Object.hasOwn(value, marker)) {
    need(ownKeys(value, [marker]) && Array.isArray(value[marker]), 'ADAPTIVE_OWNER_PAYLOAD_ROW_INVALID');
    const [index, ...values] = value[marker], keys = schemas[index];
    need(Number.isSafeInteger(index) && index >= 0 && Array.isArray(keys) && keys.length === values.length,
      'ADAPTIVE_OWNER_PAYLOAD_ROW_INVALID');
    return Object.fromEntries(keys.map((key, offset) => [key, decode(values[offset], schemas)]));
  }
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, decode(child, schemas)]));
}

/** Validate only facts actually present in the wire request; no sidecar is needed to read or restore it. */
export function validateOwnerPayloadEncoding(request) {
  const encoding = request?.state?.owner_payload_encoding;
  if (encoding === undefined) return {applied: false};
  need(ownKeys(encoding, ['schema_version', 'policy', 'contract_source', 'instructions', 'schemas', 'encoded_fields', 'criterion_labels']),
    'ADAPTIVE_OWNER_PAYLOAD_ENCODING_INVALID');
  need(request.state.schema_version === contract.input_schema && encoding.schema_version === contract.encoding_schema
    && encoding.policy === contract.policy && isDeepStrictEqual(encoding.contract_source, source)
    && encoding.instructions === contract.inline_instructions, 'ADAPTIVE_OWNER_PAYLOAD_CONTRACT_BINDING');
  need(Array.isArray(encoding.schemas) && encoding.schemas.every(keys => Array.isArray(keys) && keys.length > 1
    && keys.every(key => typeof key === 'string' && ![marker, '__proto__', 'prototype', 'constructor'].includes(key))
    && new Set(keys).size === keys.length) && new Set(encoding.schemas.map(keys => JSON.stringify(keys))).size === encoding.schemas.length,
  'ADAPTIVE_OWNER_PAYLOAD_SCHEMA_INVALID');
  need(Array.isArray(encoding.encoded_fields) && new Set(encoding.encoded_fields).size === encoding.encoded_fields.length
    && encoding.encoded_fields.every(path => contract.fields.includes(path) && get(request.state, path) !== undefined),
  'ADAPTIVE_OWNER_PAYLOAD_FIELDS_INVALID');
  for (const path of encoding.encoded_fields) decode(get(request.state, path), encoding.schemas);
  need(object(encoding.criterion_labels) && Array.isArray(request.state.artifact_contracts), 'ADAPTIVE_OWNER_PAYLOAD_LABEL_INVALID');
  const artifacts = new Map(request.state.artifact_contracts.map(row => [row.id, row]));
  need(artifacts.size === request.state.artifact_contracts.length && !artifacts.has('unknown'), 'ADAPTIVE_OWNER_PAYLOAD_LABEL_INVALID');
  for (const question of Object.values(request.questions ?? {})) need(question.type === 'choice'
    && typeof question.criteria?.unknown === 'string'
    && isDeepStrictEqual(Object.keys(question.criteria).filter(id => id !== 'unknown').sort(), [...artifacts.keys()].sort()),
  'ADAPTIVE_OWNER_PAYLOAD_LABEL_INVALID');
  for (const key of contract.protected_fields) walk(request.state[key], value =>
    need(!Object.hasOwn(value, marker), 'ADAPTIVE_OWNER_PAYLOAD_PROTECTED_ENCODING'));
  for (const [qid, grouped] of Object.entries(encoding.criterion_labels)) {
    const question = request.questions?.[qid], seen = new Set();
    need(object(grouped) && Object.keys(grouped).every(kind => ['paths_description', 'description'].includes(kind))
      && question?.type === 'choice' && typeof question.criteria?.unknown === 'string', 'ADAPTIVE_OWNER_PAYLOAD_LABEL_INVALID');
    for (const ids of Object.values(grouped)) {
      need(Array.isArray(ids) && ids.length > 0, 'ADAPTIVE_OWNER_PAYLOAD_LABEL_INVALID');
      for (const id of ids) {
        const artifact = artifacts.get(id);
        need(id !== 'unknown' && !seen.has(id) && artifact && Array.isArray(artifact.paths)
          && artifact.paths.every(path => typeof path === 'string') && typeof artifact.description === 'string'
          && question.criteria[id] === null, 'ADAPTIVE_OWNER_PAYLOAD_LABEL_INVALID');
        seen.add(id);
      }
    }
  }
  return {applied: true, policy: encoding.policy, contract_source: {...source}, schema_count: encoding.schemas.length};
}

/** Restore from the inline layouts and original artifact text, without reading the controller report. */
export function restoreOwnerPayload(request) {
  if (!validateOwnerPayloadEncoding(request).applied) return structuredClone(request);
  const output = structuredClone(request), encoding = output.state.owner_payload_encoding;
  for (const path of encoding.encoded_fields) put(output.state, path, decode(get(output.state, path), encoding.schemas));
  const artifacts = new Map(output.state.artifact_contracts.map(row => [row.id, row]));
  for (const [qid, grouped] of Object.entries(encoding.criterion_labels)) for (const [kind, ids] of Object.entries(grouped)) {
    for (const id of ids) {
      const artifact = artifacts.get(id);
      output.questions[qid].criteria[id] = kind === 'description' ? artifact.description : `${artifact.paths.join(', ')}: ${artifact.description}`;
    }
  }
  delete output.state.owner_payload_encoding;
  return output;
}

/** Lossless opt-in representation only. Critical original facts and choice identities stay unencoded. */
export function projectOwnerPayload(input, {policy} = {}) {
  need(policy === contract.policy, 'ADAPTIVE_OWNER_PAYLOAD_POLICY_INVALID');
  const original = prepareDecision(input).body;
  need(original.state.owner_payload_encoding === undefined, 'ADAPTIVE_OWNER_PAYLOAD_ALREADY_APPLIED');
  const before = bytes(original), output = structuredClone(original);
  const report = {schema_version: 'adaptive-owner-payload-report/v1', policy, contract_source: {...source},
    input_request_sha256: digest(original), input_wire_bytes: before, original_question_ids: Object.keys(original.questions),
    original_field_bytes: Object.fromEntries(Object.entries(original.state).map(([key, value]) => [key, bytes(value)])),
    exact_model_tokens: null, provider_token_savings: 'unmeasured', facts_omitted: 0};
  const finish = (request, applied, reason = null) => {
    const restored = restoreOwnerPayload(request);
    need(JSON.stringify(restored) === JSON.stringify(original), 'ADAPTIVE_OWNER_PAYLOAD_ROUNDTRIP_MISMATCH');
    const result = {...report, applied, fallback_reason: reason, output_request_sha256: digest(request),
      output_wire_bytes: bytes(request), saved_wire_bytes: before - bytes(request),
      roundtrip_request_sha256: digest(restored), roundtrip_exact: true,
      protected_fields_unchanged: contract.protected_fields.every(key => isDeepStrictEqual(original.state[key], request.state[key])),
      question_instructions_unchanged: Object.keys(original.questions).every(id => original.questions[id].instructions === request.questions[id].instructions),
      choice_keys_unchanged: Object.keys(original.questions).every(id => isDeepStrictEqual(Object.keys(original.questions[id].criteria), Object.keys(request.questions[id].criteria)))};
    result.integrity_sha256 = digest(result);
    return {request: prepareDecision(request).body, report: result};
  };
  if (original.state.schema_version !== contract.input_schema) return finish(original, false, 'UNSUPPORTED_OWNER_SCHEMA');
  const fields = contract.fields.filter(path => get(output.state, path) !== undefined), shapes = new Map();
  for (const path of fields) walk(get(output.state, path), value => {
    need(!Object.hasOwn(value, marker), 'ADAPTIVE_OWNER_PAYLOAD_RESERVED_MARKER');
    const keys = Object.keys(value), signature = JSON.stringify(keys);
    if (keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) return;
    const row = shapes.get(signature) ?? {keys, count: 0}; row.count++; shapes.set(signature, row);
  });
  const schemas = [...shapes.values()].filter(row => row.count > 1 && row.keys.length > 1
    && row.keys.reduce((n, key) => n + key.length + 3, 0) > marker.length + 8).map(row => row.keys);
  const indexes = new Map(schemas.map((keys, index) => [JSON.stringify(keys), index]));
  function encode(value) {
    if (Array.isArray(value)) return value.map(encode);
    if (!object(value)) return value;
    const keys = Object.keys(value), index = indexes.get(JSON.stringify(keys));
    if (index !== undefined) return {[marker]: [index, ...keys.map(key => encode(value[key]))]};
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encode(child)]));
  }
  for (const path of fields) put(output.state, path, encode(get(output.state, path)));
  const criterionLabels = labelsFor(output);
  for (const [qid, grouped] of Object.entries(criterionLabels)) for (const ids of Object.values(grouped)) {
    for (const id of ids) output.questions[qid].criteria[id] = null;
  }
  output.state.owner_payload_encoding = {schema_version: contract.encoding_schema, policy,
    contract_source: {...source}, instructions: contract.inline_instructions, schemas, encoded_fields: fields, criterion_labels: criterionLabels};
  return bytes(output) < before ? finish(output, true) : finish(original, false, 'NO_NET_WIRE_REDUCTION');
}
