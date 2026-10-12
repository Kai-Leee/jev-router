import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createJevClient, getHttpErrorDiagnostics } from '../src/client.mjs';

const KEY = 'diagnostic-test-key-DO-NOT-LOG';
const PRIVATE = 'PRIVATE_REFLECTED_REQUEST_DO_NOT_LOG';
const request = () => ({ state: 'Fixture only.', questions: { yes: { type: 'noul', instructions: 'Is this a fixture?' } } });
const hash = value => createHash('sha256').update(value).digest('hex');
const failure = async (makeResponse, options = {}) => {
  let calls = 0;
  const client = createJevClient({ apiKey: KEY, ...options, fetchImpl: async () => { calls++; return makeResponse(); } });
  let caught;
  await assert.rejects(client.decide(request()), error => { caught = error; return error.code === 'HTTP_ERROR'; });
  assert.equal(calls, 1);
  assert.equal(caught.automaticRetries, 0);
  assert.equal(caught.cause, undefined);
  const serialized = JSON.stringify({ error: caught, message: caught.message, stack: caught.stack });
  for (const secret of [KEY, PRIVATE, 'Authorization', 'Bearer']) assert.equal(serialized.includes(secret), false);
  return caught;
};

for (const [code, category] of [
  ['context_length_exceeded', 'context_limit'], ['request_body_too_large', 'request_size'],
  ['invalid_schema', 'schema'], ['model_not_found', 'model'],
  ['rate_limit_exceeded', 'rate_limit'], ['invalid_request_error', 'request_validation'],
]) test(`exact structural ${code} is diagnostic evidence without reflected text`, async () => {
  const body = JSON.stringify({ error: { code, type: KEY, message: `Authorization: Bearer ${KEY}; ${PRIVATE}`,
    details: { request: PRIVATE, api_key: KEY }, max_tokens: PRIVATE }, Authorization: KEY });
  const error = await failure(() => new Response(body, { status: 400 }));
  assert.equal(error.status, 400);
  assert.equal(error.outcomeUncertain, false);
  assert.deepEqual(error.diagnostics, {
    schema_version: 'jev-http-error-diagnostics/v3', category, classification_source: 'provider_code', provider_code: code,
    semantic_status: 'unavailable', semantic_signals: [], reported_limits: [],
    redacted_excerpt: '[REDACTED]; [REDACTED]',
    body_read_status: 'complete', body_format: 'json', body_bytes: Buffer.byteLength(body),
    body_sha256: hash(body), body_hash_scope: 'complete',
  });
  assert.equal(getHttpErrorDiagnostics(error), error.diagnostics);
  assert.equal(Object.isFrozen(error.diagnostics), true);
});

test('documented numeric codes preserve ambiguity of HTTP 400 and 422', async () => {
  for (const [status, category, source] of [[400, 'unknown', 'unavailable'], [422, 'request_validation', 'http_status']]) {
    const body = JSON.stringify({ error: { code: status,
      message: `context_length_exceeded invalid_schema model_not_found ${PRIVATE} ${KEY}` } });
    const error = await failure(() => new Response(body, { status }));
    assert.equal(error.diagnostics.provider_code, status);
    assert.equal(error.diagnostics.category, category);
    assert.equal(error.diagnostics.classification_source, source);
  }
  const mismatched = await failure(() => new Response(JSON.stringify({ error: { code: 429 } }), { status: 400 }));
  assert.equal(mismatched.diagnostics.category, 'unknown');
});

test('HTTP semantics remain available without a recognized body; 429 does not assert rate versus capacity', async () => {
  for (const [status, category] of [[413, 'request_size'], [429, 'rate_or_capacity'], [503, 'upstream_unavailable'], [504, 'upstream_timeout']]) {
    const error = await failure(() => new Response(`Authorization: Bearer ${KEY} ${PRIVATE}`, { status }));
    assert.equal(error.status, status);
    assert.equal(error.diagnostics.category, category);
    assert.equal(error.diagnostics.classification_source, 'http_status');
    assert.equal(error.diagnostics.provider_code, null);
    assert.equal(error.diagnostics.body_format, 'non_json');
    assert.equal(error.outcomeUncertain, status >= 500);
  }
});

test('unknown codes, free text, nested lookalikes and malformed JSON are not classified', async () => {
  for (const body of [
    JSON.stringify({ error: { code: `context_length_exceeded ${KEY}`, message: PRIVATE } }),
    JSON.stringify({ error: { code: '400', message: 'model_not_found' } }),
    JSON.stringify({ error: [{ code: 'invalid_schema' }] }),
    JSON.stringify({ code: 'model_not_found', nested: { error: { code: 'invalid_schema' } } }),
    JSON.stringify('context_length_exceeded'),
    `{"error":{"code":"context_length_exceeded"}, ${PRIVATE}`,
    `context_length_exceeded ${PRIVATE}`,
  ]) {
    const error = await failure(() => new Response(body, { status: 400 }));
    assert.equal(error.diagnostics.category, 'unknown');
    assert.equal(error.diagnostics.provider_code, null);
    assert.equal(error.diagnostics.body_hash_scope, 'complete');
  }
});

test('allowlisted type can classify but an API key reflected as a code cannot survive', async () => {
  const typed = await failure(() => new Response(JSON.stringify({ error: { code: 400, type: 'invalid_schema' } }), { status: 400 }));
  assert.equal(typed.diagnostics.category, 'schema');
  assert.equal(typed.diagnostics.provider_code, 'invalid_schema');
  const secretCode = 'model_not_found';
  const reflected = await failure(() => new Response(JSON.stringify({ error: { code: secretCode } }), { status: 400 }), { apiKey: secretCode });
  assert.equal(reflected.diagnostics.provider_code, null);
  assert.equal(reflected.diagnostics.category, 'unknown');
  assert.equal(JSON.stringify(reflected).includes(secretCode), false);
});

test('complete UTF-8 body fingerprints count bytes, and an empty body is explicit', async () => {
  const body = JSON.stringify({ error: { code: 400, message: '한글 fixture' } });
  const error = await failure(() => new Response(body, { status: 400 }));
  assert.equal(error.diagnostics.body_bytes, Buffer.byteLength(body));
  assert.notEqual(error.diagnostics.body_bytes, body.length);
  assert.equal(error.diagnostics.body_sha256, hash(body));
  const empty = await failure(() => new Response(null, { status: 400 }));
  assert.equal(empty.diagnostics.body_bytes, 0);
  assert.equal(empty.diagnostics.body_format, 'empty');
  assert.equal(empty.diagnostics.body_sha256, hash(''));
  assert.equal(empty.diagnostics.body_hash_scope, 'complete');
});

test('oversized response hashes only 32 KiB and never classifies a partial body', async () => {
  const body = Buffer.from(JSON.stringify({ error: { code: 'context_length_exceeded', message: PRIVATE.repeat(10000) } }));
  let cancelled = false;
  const error = await failure(() => new Response(new ReadableStream({
    start(controller) { controller.enqueue(body); },
    cancel() { cancelled = true; },
  }), { status: 400 }));
  assert.equal(cancelled, true);
  assert.equal(error.status, 400);
  assert.equal(error.diagnostics.body_read_status, 'too_large');
  assert.equal(error.diagnostics.body_bytes, 32768);
  assert.equal(error.diagnostics.body_sha256, hash(body.subarray(0, 32768)));
  assert.equal(error.diagnostics.body_hash_scope, 'prefix');
  assert.equal(error.diagnostics.body_format, 'unavailable');
  assert.equal(error.diagnostics.provider_code, null);
  assert.equal(error.diagnostics.category, 'unknown');
});

test('exactly 32 KiB remains a complete body when the stream ends', async () => {
  const body = 'x'.repeat(32768);
  const error = await failure(() => new Response(body, { status: 400 }));
  assert.equal(error.diagnostics.body_read_status, 'complete');
  assert.equal(error.diagnostics.body_bytes, 32768);
  assert.equal(error.diagnostics.body_sha256, hash(body));
  assert.equal(error.diagnostics.body_hash_scope, 'complete');
});

test('failing reader and cancellation never erase HTTP status or expose their errors', async () => {
  const prefix = Buffer.from(`{"error":${PRIVATE}`);
  let reads = 0;
  const error = await failure(() => ({ ok: false, status: 504, headers: new Headers(), body: { getReader: () => ({
    async read() { if (!reads++) return { done: false, value: prefix }; throw new Error(`Bearer ${KEY}`); },
    cancel() { return Promise.reject(new Error(PRIVATE)); },
    releaseLock() { throw new Error(KEY); },
  }) } }));
  assert.equal(error.status, 504);
  assert.equal(error.outcomeUncertain, true);
  assert.equal(error.diagnostics.body_read_status, 'read_failed');
  assert.equal(error.diagnostics.body_bytes, prefix.byteLength);
  assert.equal(error.diagnostics.body_sha256, hash(prefix));
  assert.equal(error.diagnostics.body_hash_scope, 'prefix');
  assert.equal(error.diagnostics.category, 'upstream_timeout');
});

test('missing or failed streaming reader is explicit and never falls back to an unbounded text read', async () => {
  for (const [body, expected] of [[undefined, 'unavailable'], [{ getReader() { throw new Error(KEY); } }, 'read_failed']]) {
    const error = await failure(() => ({ ok: false, status: 400, headers: new Headers(), body,
      async text() { assert.fail('Unbounded text must not be read.'); },
      async json() { assert.fail('Unbounded JSON must not be read.'); },
    }));
    assert.equal(error.status, 400);
    assert.equal(error.diagnostics.body_read_status, expected);
    assert.equal(error.diagnostics.body_bytes, null);
    assert.equal(error.diagnostics.body_sha256, null);
    assert.equal(error.diagnostics.body_hash_scope, 'none');
  }
});

test('stalled error read and stalled cancellation respect the client deadline', { timeout: 1500 }, async () => {
  let cancelled = false;
  const started = performance.now();
  const error = await failure(() => ({ ok: false, status: 400, headers: new Headers(), body: { getReader: () => ({
    read() { return new Promise(() => {}); },
    cancel() { cancelled = true; return new Promise(() => {}); },
    releaseLock() {},
  }) } }), { timeoutMs: 25 });
  assert.equal(cancelled, true);
  assert.equal(error.status, 400);
  assert.equal(error.diagnostics.body_read_status, 'timeout');
  assert.equal(error.diagnostics.body_bytes, null);
  assert.equal(error.diagnostics.body_hash_scope, 'none');
  assert.ok(performance.now() - started < 1000);
});

test('a stream of empty chunks is bounded even if it starves the timer queue', { timeout: 1500 }, async () => {
  const error = await failure(() => ({ ok: false, status: 400, headers: new Headers(), body: { getReader: () => ({
    async read() { return { done: false, value: new Uint8Array() }; },
    async cancel() {}, releaseLock() {},
  }) } }), { timeoutMs: 25 });
  assert.equal(error.status, 400);
  assert.equal(error.diagnostics.body_read_status, 'timeout');
});

test('reflected API keys in reconciliation headers are discarded at the client boundary', async () => {
  const error = await failure(() => new Response(JSON.stringify({ error: { code: 400 } }), {
    status: 400, headers: { 'x-jev-run-id': `run-${KEY}`, 'x-private': PRIVATE },
  }));
  assert.equal(error.runId, null);
});

test('forged diagnostics and a replacement public property cannot cross the trusted boundary', async () => {
  assert.equal(getHttpErrorDiagnostics({ diagnostics: { schema_version: 'jev-http-error-diagnostics/v1', body_sha256: KEY } }), null);
  const error = await failure(() => new Response(JSON.stringify({ error: { code: 'invalid_schema' } }), { status: 400 }));
  const captured = getHttpErrorDiagnostics(error);
  error.diagnostics = { ...captured, body_sha256: PRIVATE };
  assert.equal(getHttpErrorDiagnostics(error), captured);
  assert.equal(JSON.stringify(getHttpErrorDiagnostics(error)).includes(PRIVATE), false);
});

const contextMessage = 'This model\'s maximum context length is 32768 tokens. However, your messages resulted in 38000 tokens. Please reduce the length of the messages.';
const modelInputLimitMessage = "The input exceeds the selected model's input limit. Shorten the state, instructions or criteria before retrying. No charge was made.";

test('observed complete Jev input-limit wording identifies no specific token gate or numeric limit', async () => {
  for (const envelope of [{ error: modelInputLimitMessage }, { message: modelInputLimitMessage },
    { detail: modelInputLimitMessage }, { error: { message: modelInputLimitMessage } }]) {
    const body = JSON.stringify(envelope);
    const error = await failure(() => new Response(body, { status: 400 }));
    assert.equal(error.status, 400);
    assert.equal(error.diagnostics.category, 'model_input_limit');
    assert.equal(error.diagnostics.classification_source, 'message_pattern');
    assert.equal(error.diagnostics.provider_code, null);
    assert.equal(error.diagnostics.semantic_status, 'recognized');
    assert.deepEqual(error.diagnostics.semantic_signals, ['model_input_limit_exceeded']);
    assert.deepEqual(error.diagnostics.reported_limits, []);
    assert.equal(error.diagnostics.redacted_excerpt, modelInputLimitMessage);
    assert.equal(error.diagnostics.body_sha256, hash(body));
  }
});

test('input-limit wording cannot classify quoted, altered, incomplete or secret-bearing messages', async () => {
  for (const message of [
    `Example: ${modelInputLimitMessage}`,
    `Error: ${modelInputLimitMessage}`,
    `Quoted text: '${modelInputLimitMessage}'`,
    modelInputLimitMessage.replace('exceeds', 'does not exceed'),
    modelInputLimitMessage.replace('No charge was made.', 'A charge might have been made.'),
    modelInputLimitMessage.split('. ')[0] + '.',
    `${modelInputLimitMessage} This is only an example.`,
    `${modelInputLimitMessage} Authorization: Bearer ${KEY}; ${PRIVATE}`,
  ]) {
    const error = await failure(() => new Response(JSON.stringify({ error: message }), { status: 400 }));
    assert.equal(error.diagnostics.category, 'unknown');
    assert.equal(error.diagnostics.semantic_status, 'unavailable');
    assert.deepEqual(error.diagnostics.semantic_signals, []);
    assert.deepEqual(error.diagnostics.reported_limits, []);
  }
});

test('input-limit wording alongside a conflicting rejection remains ambiguous', async () => {
  const error = await failure(() => new Response(JSON.stringify({ error: modelInputLimitMessage, detail: 'Invalid JSON.' }), { status: 400 }));
  assert.equal(error.diagnostics.category, 'unknown');
  assert.equal(error.diagnostics.semantic_status, 'ambiguous');
  assert.deepEqual(error.diagnostics.reported_limits, []);
});

for (const field of ['error', 'message', 'detail']) test(`top-level ${field} string yields bounded semantic evidence without reflected secrets`, async () => {
  const body = JSON.stringify({ [field]: `${contextMessage} Authorization: Bearer ${KEY}; ${PRIVATE}`,
    request: { message: PRIVATE, api_key: KEY }, metadata: { error: 'Invalid JSON.' } });
  const error = await failure(() => new Response(body, { status: 400 }));
  assert.equal(error.diagnostics.category, 'context_limit');
  assert.equal(error.diagnostics.classification_source, 'message_pattern');
  assert.equal(error.diagnostics.provider_code, null);
  assert.equal(error.diagnostics.semantic_status, 'recognized');
  assert.deepEqual(error.diagnostics.semantic_signals, ['context_length_exceeded']);
  assert.deepEqual(error.diagnostics.reported_limits, [{ kind: 'context_tokens', actual: 38000, limit: 32768 }]);
  assert.equal(Object.isFrozen(error.diagnostics.semantic_signals), true);
  assert.equal(Object.isFrozen(error.diagnostics.reported_limits), true);
  assert.equal(Object.isFrozen(error.diagnostics.reported_limits[0]), true);
});

test('nested whole-string JSON and standard HTTP wrappers are decoded with a fixed depth', async () => {
  const inner = JSON.stringify({ error: { type: 'invalid_request_error', code: 'context_length_exceeded', message: `${contextMessage} ${KEY}` } });
  for (const value of [inner, JSON.stringify(inner), `Error code: 400 - ${inner}`, `HTTP 400: ${inner}`, `Provider API error: ${inner}`]) {
    const error = await failure(() => new Response(JSON.stringify({ error: value }), { status: 400 }));
    assert.equal(error.diagnostics.category, 'context_limit');
    assert.equal(error.diagnostics.classification_source, 'provider_code');
    assert.equal(error.diagnostics.provider_code, 'context_length_exceeded');
    assert.deepEqual(error.diagnostics.reported_limits, [{ kind: 'context_tokens', actual: 38000, limit: 32768 }]);
  }
  let tooDeep = inner;
  for (let index = 0; index < 4; index++) tooDeep = JSON.stringify(tooDeep);
  const deep = await failure(() => new Response(JSON.stringify({ message: tooDeep }), { status: 400 }));
  assert.equal(deep.diagnostics.category, 'unknown');
  assert.equal(deep.diagnostics.semantic_status, 'ambiguous');
});

for (const [message, kind, actual, limit] of [
  ['State plus the longest question 38000 tokens exceeds the maximum 32768 tokens.', 'state_question_tokens', 38000, 32768],
  ['The combined state + longest single question must not exceed 32768 tokens. Received 38000 tokens.', 'state_question_tokens', 38000, 32768],
  ['State plus the longest question exceeds the maximum of 32768 tokens.', 'state_question_tokens', null, 32768],
  ['Total input tokens 70000 exceeds the maximum 65536 tokens.', 'total_input_tokens', 70000, 65536],
  ['Total input length must be at most 65536 tokens. Got 70000 tokens.', 'total_input_tokens', 70000, 65536],
  ['Total input tokens exceeds 65536 tokens.', 'total_input_tokens', null, 65536],
  ['Input length (38000 tokens) exceeds max model length (32768 tokens).', 'context_tokens', 38000, 32768],
  ['Maximum model length is 32768 tokens. Received 38000 tokens.', 'context_tokens', 38000, 32768],
]) test(`explicit rejection preserves ${kind} separately`, async () => {
  const error = await failure(() => new Response(JSON.stringify({ error: message }), { status: 400 }));
  assert.equal(error.diagnostics.category, 'context_limit');
  assert.equal(error.diagnostics.classification_source, 'message_pattern');
  assert.deepEqual(error.diagnostics.reported_limits, [{ kind, actual, limit }]);
});

test('state-question and total-input limits are retained without claiming they conflict', async () => {
  const error = await failure(() => new Response(JSON.stringify({
    error: 'State plus longest question 38000 tokens exceeds the maximum 32768 tokens.',
    detail: 'Total input tokens 70000 exceeds the maximum 65536 tokens.',
  }), { status: 400 }));
  assert.equal(error.diagnostics.semantic_status, 'recognized');
  assert.deepEqual(error.diagnostics.reported_limits, [
    { kind: 'state_question_tokens', actual: 38000, limit: 32768 },
    { kind: 'total_input_tokens', actual: 70000, limit: 65536 },
  ]);
});

test('request bytes and schema wording produce fixed signals without logging suffixes', async () => {
  for (const [message, signal, category, limits] of [
    ['Request body 256001 bytes exceeds the maximum 256000 bytes.', 'request_body_too_large', 'request_size', [{ kind: 'request_bytes', actual: 256001, limit: 256000 }]],
    ['Payload too large: 256001 bytes (maximum 256000 bytes).', 'request_body_too_large', 'request_size', [{ kind: 'request_bytes', actual: 256001, limit: 256000 }]],
    ['JSON request exceeds 256000 bytes.', 'request_body_too_large', 'request_size', [{ kind: 'request_bytes', actual: null, limit: 256000 }]],
    ['Invalid JSON body.', 'invalid_json', 'schema', []],
    ['Schema validation failed.', 'invalid_schema', 'schema', []],
  ]) {
    const error = await failure(() => new Response(JSON.stringify({ detail: `${message} Authorization: ${KEY}; ${PRIVATE}` }), { status: 400 }));
    assert.equal(error.diagnostics.category, category);
    assert.deepEqual(error.diagnostics.semantic_signals, [signal]);
    assert.deepEqual(error.diagnostics.reported_limits, limits);
  }
});

test('ambiguous alternatives, contradictory counts and conflicting structured evidence stay unknown', async () => {
  for (const data of [
    { error: 'Context length exceeded. Request body too large.' },
    { error: 'Context length exceeded: false.' },
    { error: 'Context length exceeded. This might be a schema issue.' },
    { error: contextMessage, detail: 'Invalid JSON.' },
    { error: { code: 'model_not_found', message: contextMessage } },
    { error: contextMessage.replace('38000', '100') },
    { error: contextMessage, detail: contextMessage.replace('38000', '39000') },
    { error: contextMessage.replace('38000', '1000000001') },
  ]) {
    const error = await failure(() => new Response(JSON.stringify(data), { status: 400 }));
    assert.equal(error.diagnostics.category, 'unknown');
    assert.equal(error.diagnostics.classification_source, 'unavailable');
    assert.equal(error.diagnostics.semantic_status, 'ambiguous');
    assert.deepEqual(error.diagnostics.reported_limits, []);
  }
});

test('quoted examples, bare published limits, arbitrary embedded JSON and secret numbers are not causes', async () => {
  const inner = JSON.stringify({ error: { code: 'context_length_exceeded' } });
  for (const message of [
    `The request said: ${contextMessage}`, `Example: ${contextMessage}`, `If ${contextMessage}`,
    'This model\'s maximum context length is 32768 tokens.',
    'State plus longest question must not exceed 32768 tokens.',
    'The total input limit is 65536 tokens.', 'Context length may be exceeded.',
    `Request data: ${inner}`, `${inner} reflected request: ${PRIVATE}`,
    'Input length 38000 characters exceeds the maximum context length 32768 characters.',
    `Authorization: ${KEY}; context length exceeded`,
  ]) {
    const error = await failure(() => new Response(JSON.stringify({ error: message }), { status: 400 }));
    assert.equal(error.diagnostics.category, 'unknown');
    assert.equal(error.diagnostics.semantic_status, 'unavailable');
    assert.deepEqual(error.diagnostics.reported_limits, []);
  }
  const numericKey = '38000';
  const protectedNumber = await failure(() => new Response(JSON.stringify({ error: contextMessage }), { status: 400 }), { apiKey: numericKey });
  assert.equal(JSON.stringify(protectedNumber.diagnostics).includes(numericKey), false);
  assert.deepEqual(protectedNumber.diagnostics.reported_limits, []);
});

test('oversized message and strings under arbitrary request fields cannot create semantic evidence', async () => {
  const error = await failure(() => new Response(JSON.stringify({
    error: `${contextMessage}${'x'.repeat(9000)}`, request: { error: contextMessage },
    details: { message: contextMessage }, state: { detail: 'Invalid JSON.' },
  }), { status: 400 }));
  assert.equal(error.diagnostics.category, 'unknown');
  assert.equal(error.diagnostics.semantic_status, 'unavailable');
  assert.deepEqual(error.diagnostics.semantic_signals, []);
});

test('v3 retains a bounded redacted excerpt for an unfamiliar error without inventing a cause', async () => {
  const message = 'Provider rejected evaluation: the selected question could not be evaluated.';
  const body = JSON.stringify({ error: message });
  const error = await failure(() => new Response(body, { status: 400 }));
  assert.equal(error.diagnostics.schema_version, 'jev-http-error-diagnostics/v3');
  assert.equal(error.diagnostics.redacted_excerpt, message);
  assert.equal(error.diagnostics.category, 'unknown');
  assert.equal(error.diagnostics.body_sha256, hash(body));
});

test('v3 removes current-key JSON, URL, Unicode, Base64 and combined encodings before persistence', async () => {
  const apiKey = 'k+"\\/?=9A';
  const unicode = apiKey.split('').map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join('');
  const percent = [...Buffer.from(apiKey)].map(byte => `%${byte.toString(16).padStart(2, '0')}`).join('');
  const base64 = Buffer.from(apiKey).toString('base64');
  const variants = [apiKey, JSON.stringify(apiKey).slice(1, -1), encodeURIComponent(apiKey),
    encodeURIComponent(apiKey).replace(/%[A-F0-9]{2}/g, value => value.toLowerCase()),
    unicode, JSON.stringify(unicode).slice(1, -1), percent,
    percent.replace(/%[a-f0-9]{2}/g, (value, offset) => offset % 2 ? value.toUpperCase() : value),
    base64, base64.replace(/=+$/, ''), Buffer.from(apiKey).toString('base64url'), encodeURIComponent(base64),
  ];
  for (const value of variants) {
    const error = await failure(() => new Response(JSON.stringify({ message: `Credential reflected: ${value}` }), { status: 400 }), { apiKey });
    assert.equal(error.diagnostics.redacted_excerpt, 'Credential reflected: [REDACTED]');
    assert.equal(JSON.stringify(error).includes(apiKey), false);
    assert.equal(error.diagnostics.redacted_excerpt.includes(value), false);
  }
});

test('v3 removes short unknown Bearer and API-key assignments and opaque long tokens', async () => {
  for (const message of ['Bearer abc123', 'Authorization: Bearer tinysecret', 'api_key=tinysecret',
    'apiKey: "short secret"', "JEV_AI_API_KEY='tinysecret'", 'x-api-key=small', 'token=small',
    'Request failed with opaque value q8xp2nz4v6km9rs1t3wd5yc7b0fh2ja4']) {
    const error = await failure(() => new Response(JSON.stringify({ detail: message }), { status: 400 }));
    assert.equal(error.diagnostics.redacted_excerpt.includes('[REDACTED]'), true);
    for (const secret of ['abc123', 'tinysecret', 'short secret', 'small', 'q8xp2nz4v6km9rs1t3wd5yc7b0fh2ja4']) {
      assert.equal(error.diagnostics.redacted_excerpt.includes(secret), false);
    }
  }
});

test('v3 traverses only diagnostic envelope fields, including inside stringified JSON', async () => {
  const ignored = 'private short prose should not leave the request';
  const inner = JSON.stringify({ error: { message: 'Provider rejected the question.' }, request: { state: ignored }, headers: { secret: ignored } });
  const error = await failure(() => new Response(JSON.stringify({
    error: { message: 'Outer failure.', state: ignored, request: { message: ignored }, headers: { detail: ignored } },
    detail: inner, state: ignored, headers: { error: ignored }, request: { error: ignored },
  }), { status: 400 }));
  assert.equal(error.diagnostics.redacted_excerpt, 'Outer failure.\nProvider rejected the question.');
  assert.equal(JSON.stringify(error).includes(ignored), false);
});

test('v3 omits reflected request JSON embedded in an unstructured error string', async () => {
  const ignored = 'private short prose should not leave the request';
  const error = await failure(() => new Response(JSON.stringify({
    error: `Provider failure with data {"state":"${ignored}","headers":{"authorization":"short"}}`,
  }), { status: 400 }));
  assert.equal(error.diagnostics.redacted_excerpt, '[REDACTED REQUEST DATA]');
  assert.equal(JSON.stringify(error).includes(ignored), false);
});

test('v3 redacts before its 2048-character boundary and never leaves a truncated credential prefix', async () => {
  const prefix = 'Readable provider explanation. '.repeat(67).slice(0, 2038);
  const error = await failure(() => new Response(JSON.stringify({ message: `${prefix}${KEY} ${'further details '.repeat(300)}` }), { status: 400 }));
  assert.equal(error.diagnostics.redacted_excerpt.length, 2048);
  assert.equal(error.diagnostics.redacted_excerpt.includes('diagnostic-test'), false);
  assert.equal(error.diagnostics.redacted_excerpt, `${prefix}[REDACTED] `.slice(0, 2048));
});

test('v3 excerpt stays unavailable for plain, partial, malformed and deeply wrapped bodies', async () => {
  const plain = await failure(() => new Response('unstructured provider text', { status: 400 }));
  assert.equal(plain.diagnostics.redacted_excerpt, null);
  const malformed = await failure(() => new Response('{"error":"incomplete', { status: 400 }));
  assert.equal(malformed.diagnostics.redacted_excerpt, null);
  const oversized = await failure(() => new Response(JSON.stringify({ error: 'x'.repeat(40000) }), { status: 400 }));
  assert.equal(oversized.diagnostics.redacted_excerpt, null);
  let deep = JSON.stringify({ error: 'sensitive short text' });
  for (let index = 0; index < 4; index++) deep = JSON.stringify(deep);
  const nested = await failure(() => new Response(JSON.stringify({ error: deep }), { status: 400 }));
  assert.equal(nested.diagnostics.redacted_excerpt, null);
});

test('v3 also discards an encoded API key masquerading as a valid reconciliation ID', async () => {
  const encoded = Buffer.from(KEY).toString('base64url');
  const error = await failure(() => new Response(JSON.stringify({ error: 'Provider rejection.' }), {
    status: 400, headers: { 'x-jev-run-id': encoded },
  }));
  assert.equal(error.runId, null);
  assert.equal(JSON.stringify(error).includes(encoded), false);
});
