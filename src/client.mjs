import { createHash } from 'node:crypto';
import { DECISION_URL, DEFAULT_MODEL, MODELS_URL, CREDITS_URL } from './config.mjs';

const MAX_BODY_BYTES = 256000;
const MAX_ERROR_BODY_BYTES = 32768;
const ERROR_BODY_TIMEOUT_MS = 1000;
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' && value.trim().length > 0;
const probability = (value) => Number.isFinite(value) && value >= 0 && value <= 1;
const own = (obj, key) => Object.hasOwn(obj, key);

export class JevError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'JevError';
    this.code = code;
    Object.assign(this, details);
  }
}

function invalid(message) {
  throw new JevError('INVALID_REQUEST', message);
}

export function prepareDecision(input) {
  if (!object(input)) invalid('A decision request must be an object.');
  if (Object.keys(input).some((key) => !['model', 'state', 'questions'].includes(key))) {
    invalid('This adapter accepts only model, state and questions.');
  }
  const body = { model: DEFAULT_MODEL, ...input };
  if (!text(body.model)) invalid('The model must be a nonempty string.');
  const state = body.state;
  if (!(text(state) || (Array.isArray(state) && state.length) || (object(state) && Object.keys(state).length))) {
    invalid('State must be a nonempty string, object or array.');
  }
  if (!object(body.questions)) invalid('Questions must be an object.');
  const entries = Object.entries(body.questions);
  if (entries.length < 1 || entries.length > 64) invalid('Use between 1 and 64 questions.');
  for (const [id, question] of entries) {
    if (!/^[A-Za-z0-9_.-]{1,64}$/.test(id)) invalid('Question IDs must be 1–64 letters, digits, dots, dashes or underscores.');
    if (!object(question) || !text(question.instructions)) invalid('Each question needs instructions.');
    if (Object.keys(question).some((key) => !['type', 'instructions', 'criteria'].includes(key))) invalid('Unsupported question field.');
    const criteria = question.criteria;
    if (question.type === 'choice') {
      if (!object(criteria) || Object.keys(criteria).length < 2 || Object.keys(criteria).length > 255) invalid('Choice needs 2–255 options.');
      if (Object.entries(criteria).some(([key, value]) => !text(key) || !(value === null || typeof value === 'string'))) invalid('Choice descriptions must be strings or null.');
    } else if (question.type === 'score') {
      if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10 || !criteria.every(text)) invalid('Score needs 2–10 ordered text levels.');
    } else if (question.type === 'noul') {
      if (criteria !== undefined && (!object(criteria) || Object.entries(criteria).some(([key, value]) => !['true', 'false'].includes(key) || typeof value !== 'string'))) invalid('Noul criteria may only describe true and false.');
    } else {
      invalid('Question type must be choice, score or noul.');
    }
  }
  let serialized;
  try { serialized = JSON.stringify(body); } catch { invalid('Request must be JSON serializable.'); }
  if (Buffer.byteLength(serialized, 'utf8') > MAX_BODY_BYTES) invalid('JSON request exceeds 256000 UTF-8 bytes.');
  // Keep response validation tied to the exact request, not a caller-mutated object.
  return { body: JSON.parse(serialized), serialized };
}

export function retryAfterMs(value, now = Date.now()) {
  if (!value) return null;
  if (/^\d+(\.\d+)?$/.test(value.trim())) return Math.ceil(Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

const ERROR_ACTIONS = {
  401: 'Check the Jev AI key and destination host.',
  402: 'Check account balance and spending settings.',
  404: 'Check the endpoint path.',
  409: 'Read the current saved-judge revision before retrying.',
  422: 'Correct the request; do not retry it unchanged.',
  429: 'Honor Retry-After. Retry with bounded backoff only after confirming failure.',
  502: 'Retry later with bounded backoff only after confirming failure.',
  503: 'Retry later with bounded backoff only after confirming failure.',
  504: 'Check API usage and request outcome before another POST.',
};

// These are exact structural code matches, not guesses from reflected messages.
// Jev documents numeric error.code values; upstream symbolic codes are optional
// diagnostic evidence only, not a claim that Jev guarantees these wire values.
const PROVIDER_ERROR_CATEGORIES = new Map([
  ['context_length_exceeded', 'context_limit'],
  ['context_limit_exceeded', 'context_limit'],
  ['context_window_exceeded', 'context_limit'],
  ['request_too_large', 'request_size'],
  ['request_body_too_large', 'request_size'],
  ['payload_too_large', 'request_size'],
  ['invalid_json', 'schema'],
  ['invalid_schema', 'schema'],
  ['schema_validation_error', 'schema'],
  ['validation_error', 'request_validation'],
  ['invalid_request_error', 'request_validation'],
  ['invalid_model', 'model'],
  ['model_not_found', 'model'],
  ['unsupported_model', 'model'],
  ['rate_limit_exceeded', 'rate_limit'],
  ['rate_limit_error', 'rate_limit'],
]);
const HTTP_ERROR_CATEGORIES = new Map([
  [401, 'authentication'], [402, 'billing'], [404, 'not_found'], [409, 'conflict'],
  [413, 'request_size'], [422, 'request_validation'], [429, 'rate_or_capacity'],
  [502, 'upstream_unavailable'], [503, 'upstream_unavailable'], [504, 'upstream_timeout'],
]);
const capturedHttpDiagnostics = new WeakMap();

// Only diagnostics captured by this client cross the measured-decider boundary.
// A custom exception cannot pass arbitrary strings off as hashes or provider codes.
export function getHttpErrorDiagnostics(error) {
  return capturedHttpDiagnostics.get(error) ?? null;
}

function classifyError(status, providerCode) {
  if (PROVIDER_ERROR_CATEGORIES.has(providerCode)) {
    return { category: PROVIDER_ERROR_CATEGORIES.get(providerCode), classification_source: 'provider_code' };
  }
  if (HTTP_ERROR_CATEGORIES.has(status)) {
    return { category: HTTP_ERROR_CATEGORIES.get(status), classification_source: 'http_status' };
  }
  return { category: 'unknown', classification_source: 'unavailable' };
}

const SEMANTIC_CATEGORIES = new Map([
  ['context_length_exceeded', 'context_limit'], ['request_body_too_large', 'request_size'],
  ['model_input_limit_exceeded', 'model_input_limit'],
  ['invalid_json', 'schema'], ['invalid_schema', 'schema'],
]);

// Whole-message templates produce fixed signals, never excerpts. They describe
// provider-reported evidence, not an independently established failure cause.
function messageEvidence(value) {
  const message = value.replace(/\s+/g, ' ').trim()
    .replace(/^(?:(?:Error|Bad Request|Invalid request|Validation error):\s*){1,2}/i, '');
  const result = { signal: null, limit: null, ambiguous: false };
  const set = (signal, kind, actual, limit) => {
    result.signal = signal;
    // Conflicting rejection statements and explicit alternatives are not one
    // diagnosis. Arbitrary explanatory suffixes are never retained.
    const named = [
      /context (?:length|window)(?: limit)? (?:is |was )?exceeded/i.test(message),
      /(?:request(?: body)?|payload)(?: is)? too large/i.test(message),
      /(?:invalid|malformed) JSON|schema validation failed|invalid request schema/i.test(message),
    ].filter(Boolean).length;
    if (named > 1 || /\b(?:might|may|possibly|perhaps|hypothetical)\b/i.test(message)
      || /(?:exceeded|too large)\s*:\s*(?:false|no|not)\b/i.test(message)) result.ambiguous = true;
    if (actual === undefined && limit === undefined) return result;
    const number = text => text === undefined ? null : Number(text);
    actual = number(actual); limit = number(limit);
    if ([actual, limit].some(value => value !== null && (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000_000))
      || limit === 0 || (actual !== null && limit !== null && actual <= limit)) {
      result.ambiguous = true;
    } else result.limit = { kind, actual, limit };
    return result;
  };
  // This complete provider wording establishes an input-limit rejection without
  // identifying a token count, a particular model limit, or verified billing.
  if (value === "The input exceeds the selected model's input limit. Shorten the state, instructions or criteria before retrying. No charge was made.") {
    return set('model_input_limit_exceeded');
  }
  let match;
  // Common OpenAI-compatible rejection wording; token units and both amounts
  // are required. Merely mentioning a model's maximum is not a rejection.
  match = /^(?:This|The) model['’]s maximum context length is (\d+) tokens[.,]\s*(?:However,?\s*)?(?:you requested|your messages resulted in|your input resulted in) (\d+) tokens(?=[\s.,;(]|$)/i.exec(message);
  if (match) return set('context_length_exceeded', 'context_tokens', match[2], match[1]);
  match = /^(?:The )?input(?: length)?(?: of)? (\d+) tokens exceeds (?:the )?(?:maximum )?context (?:length|limit)(?: of)? (\d+) tokens(?=[\s.,;(]|$)/i.exec(message);
  if (match) return set('context_length_exceeded', 'context_tokens', match[1], match[2]);
  match = /^(?:The )?(?:input|prompt)(?: length)? \((\d+) tokens\) exceeds (?:the )?(?:maximum|max) model length \((\d+) tokens\)(?=[\s.,;]|$)/i.exec(message);
  if (match) return set('context_length_exceeded', 'context_tokens', match[1], match[2]);
  match = /^(?:The )?(?:maximum|max) model length is (\d+) tokens[.;]\s*(?:Received|Got|Requested) (\d+) tokens(?=[\s.,;(]|$)/i.exec(message);
  if (match) return set('context_length_exceeded', 'context_tokens', match[2], match[1]);
  // Jev distinguishes the state + longest question from total request tokens.
  // The published limit alone does not establish that this request exceeded it.
  const stateQuestion = '(?:The )?(?:combined )?state(?: length)?(?: \\(\\d+ tokens\\))? (?:plus|and|\\+) (?:the )?longest(?: single)? question(?: \\(\\d+ tokens\\))?';
  match = new RegExp(`^${stateQuestion}(?: length)?(?: of| is|:)? (\\d+) tokens (?:exceeds|exceeded|is greater than) (?:the )?(?:maximum(?: allowed)?|limit)(?: of|:)? (\\d+) tokens(?=[\\s.,;(]|$)`, 'i').exec(message);
  if (match) return set('context_length_exceeded', 'state_question_tokens', match[1], match[2]);
  match = new RegExp(`^${stateQuestion} must (?:not exceed|be (?:less than|at most)) (\\d+) tokens[.;]\\s*(?:Received|Got|Actual(?: length)?(?: is|:)?) (\\d+) tokens(?=[\\s.,;(]|$)`, 'i').exec(message);
  if (match) return set('context_length_exceeded', 'state_question_tokens', match[2], match[1]);
  match = new RegExp(`^${stateQuestion} (?:exceeds|exceeded) (?:the )?(?:maximum(?: allowed)?(?: of)? |limit(?: of)? )?(\\d+) tokens(?=[\\s.,;(]|$)`, 'i').exec(message);
  if (match) return set('context_length_exceeded', 'state_question_tokens', undefined, match[1]);
  match = /^(?:The )?total input (?:tokens|token count|length)(?: is|:| of)? (\d+)(?: tokens)? (?:exceeds|exceeded) (?:the )?(?:maximum(?: allowed)?|limit)(?: of|:)? (\d+) tokens(?=[\s.,;(]|$)/i.exec(message);
  if (match) return set('context_length_exceeded', 'total_input_tokens', match[1], match[2]);
  match = /^(?:The )?total input (?:tokens|token count|length) must (?:not exceed|be (?:less than|at most)) (\d+) tokens[.;]\s*(?:Received|Got|Actual(?: length)?(?: is|:)?) (\d+) tokens(?=[\s.,;(]|$)/i.exec(message);
  if (match) return set('context_length_exceeded', 'total_input_tokens', match[2], match[1]);
  match = /^(?:The )?total input (?:tokens|token count|length) (?:exceeds|exceeded) (?:the )?(?:maximum(?: allowed)?(?: of)? |limit(?: of)? )?(\d+) tokens(?=[\s.,;(]|$)/i.exec(message);
  if (match) return set('context_length_exceeded', 'total_input_tokens', undefined, match[1]);
  if (/^The prompt \(total length \d+\) is too long to fit into the model \(context length \d+\)(?:[.!;:]|$)/i.test(message)) return set('context_length_exceeded');
  match = /^(?:Maximum )?context (?:length|window)(?: limit)? (?:is |was )?exceeded(?:[.!;:]|$)/i.exec(message);
  if (match || message === 'context_length_exceeded') return set('context_length_exceeded');

  match = /^(?:JSON request|Request(?: body)?|Payload)(?: size)?(?: is| of)? (\d+) bytes (?:exceeds|exceeded|is over) (?:the )?(?:maximum(?: allowed size)?|limit)(?: of| is|:)? (\d+) bytes(?=[\s.,;(]|$)/i.exec(message);
  if (match) return set('request_body_too_large', 'request_bytes', match[1], match[2]);
  match = /^(?:JSON request|Request(?: body)?|Payload)(?: is)? too large[:.]\s*(\d+) bytes\s*\((?:maximum|max|limit)(?: is|:)? (\d+) bytes\)(?=[\s.,;]|$)/i.exec(message);
  if (match) return set('request_body_too_large', 'request_bytes', match[1], match[2]);
  match = /^(?:JSON request|Request(?: body)?|Payload)(?: size)? exceeds (?:the )?(?:maximum(?: size)?(?: of)? )?(\d+) bytes(?=[\s.,;(]|$)/i.exec(message);
  if (match) return set('request_body_too_large', 'request_bytes', undefined, match[1]);
  match = /^(?:JSON request|Request(?: body)?|Payload)(?: is)? too large(?:[.!;:]|$)/i.exec(message);
  if (match || message === 'request_body_too_large') return set('request_body_too_large');
  if (/^(?:Invalid|Malformed) JSON(?: (?:body|request|payload))?(?:[.!;:]|$)/i.test(message)
    || /^Request body must be valid JSON(?:[.!;:]|$)/i.test(message) || message === 'invalid_json') return set('invalid_json');
  if (/^(?:Schema validation failed|Invalid request schema|Request body does not match (?:the )?(?:request )?schema)(?:[.!;:]|$)/i.test(message)
    || message === 'invalid_schema') return set('invalid_schema');
  return result;
}

function errorEvidence(data, apiKey, status) {
  const codes = [];
  const signals = new Set();
  const limits = new Map();
  let ambiguous = false;
  let remaining = 24;
  const visit = (value, jsonDepth = 0, errorObject = false) => {
    if (remaining-- <= 0) { ambiguous = true; return; }
    if (typeof value === 'string') {
      if (value.length > 8192) return;
      // Exact known credentials are removed before any numeric/pattern matching.
      const message = value.split(apiKey).join('[redacted]').trim();
      const wrapped = message.replace(/^(?:(?:Error code:\s*|HTTP\s+)?[45]\d{2}(?: Bad Request)?\s*[-:]\s*|(?:Upstream|Provider)(?: API)? error:\s*)(?=[{"])/i, '');
      if (/^[{"]/.test(wrapped)) {
        if (jsonDepth >= 3) { ambiguous = true; return; }
        try {
          const parsed = JSON.parse(wrapped);
          if (object(parsed) || typeof parsed === 'string') { visit(parsed, jsonDepth + 1, true); return; }
        } catch { /* A partial/embedded JSON excerpt is not trusted as an envelope. */ }
      }
      const evidence = messageEvidence(message);
      if (evidence.signal) signals.add(evidence.signal);
      if (evidence.ambiguous) ambiguous = true;
      if (evidence.limit) {
        const previous = limits.get(evidence.limit.kind);
        if (previous && ['actual', 'limit'].some(key => previous[key] !== null && evidence.limit[key] !== null && previous[key] !== evidence.limit[key])) ambiguous = true;
        else limits.set(evidence.limit.kind, { kind: evidence.limit.kind,
          actual: evidence.limit.actual ?? previous?.actual ?? null, limit: evidence.limit.limit ?? previous?.limit ?? null });
      }
      return;
    }
    if (!object(value)) return;
    for (const field of errorObject || typeof value.message === 'string' || typeof value.detail === 'string' ? ['code', 'type'] : []) {
      if (!own(value, field)) continue;
      const code = value[field];
      if (typeof code === 'string' && !code.includes(apiKey) && PROVIDER_ERROR_CATEGORIES.has(code)) codes.push(code);
      else if (field === 'code' && Number.isInteger(code) && code >= 400 && code <= 599) codes.push(code);
    }
    // No request, state, details, metadata, arbitrary paths or array traversal.
    for (const field of ['error', 'message', 'detail']) {
      if (own(value, field) && (typeof value[field] === 'string' || (field === 'error' && object(value[field])))) visit(value[field], jsonDepth, field === 'error');
    }
  };
  if (object(data)) visit(data);
  const specificCodes = codes.filter(code => typeof code === 'string' && PROVIDER_ERROR_CATEGORIES.get(code) !== 'request_validation');
  const providerCode = specificCodes[0] ?? codes.find(code => typeof code === 'string') ?? codes[0] ?? null;
  const categories = new Set([...specificCodes.map(code => PROVIDER_ERROR_CATEGORIES.get(code)), ...[...signals].map(signal => SEMANTIC_CATEGORIES.get(signal))]);
  if (categories.size > 1) ambiguous = true;
  if ([...limits.values()].some(value => value.actual !== null && value.limit !== null && value.actual <= value.limit)) ambiguous = true;
  let classification = classifyError(status, providerCode);
  if (ambiguous) classification = { category: 'unknown', classification_source: 'unavailable' };
  else if (signals.size && !specificCodes.length) classification = { category: categories.values().next().value, classification_source: 'message_pattern' };
  return {
    ...classification, provider_code: providerCode,
    semantic_status: ambiguous ? 'ambiguous' : signals.size ? 'recognized' : 'unavailable',
    semantic_signals: Object.freeze([...signals]),
    reported_limits: Object.freeze(ambiguous ? [] : [...limits.values()].map(value => Object.freeze(value))),
  };
}

function diagnosticSecretVariants(apiKey) {
  const variants = new Set();
  const add = value => { if (value && value.length <= MAX_ERROR_BODY_BYTES && variants.size < 96) variants.add(value); };
  add(apiKey);
  add([...Buffer.from(apiKey)].map(byte => `%${byte.toString(16).padStart(2, '0')}`).join(''));
  add(apiKey.split('').map(char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`).join(''));
  for (let depth = 0; depth < 2; depth++) {
    for (const value of [...variants]) {
      add(JSON.stringify(value).slice(1, -1));
      const encoded = encodeURIComponent(value);
      add(encoded); add(encoded.replace(/%[0-9A-F]{2}/g, escape => escape.toLowerCase()));
      add(value.replace(/\\u[0-9a-f]{4}/g, escape => escape.slice(0, 2) + escape.slice(2).toUpperCase()));
      const base64 = Buffer.from(value).toString('base64');
      add(base64); add(base64.replace(/=+$/, '')); add(Buffer.from(value).toString('base64url'));
    }
  }
  return [...variants].sort((left, right) => right.length - left.length);
}

function redactedErrorExcerpt(data, apiKey) {
  if (!object(data)) return null;
  const variants = diagnosticSecretVariants(apiKey);
  const excerpts = new Set();
  let remaining = 24;
  const redact = value => {
    // Do not retain reflected JSON request/state/header objects embedded in a
    // message. Whole-string error JSON is handled structurally before this step.
    if (/["'](?:headers|request|state)["']\s*[:=]/i.test(value)) return '[REDACTED REQUEST DATA]';
    let clean = value;
    for (const secret of variants) clean = clean.replace(new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '[REDACTED]');
    clean = clean
      .replace(/\b(?:authorization|proxy-authorization|x-api-key|(?:[a-z0-9]+_)*api[_ -]?key|access[_ -]?token|auth[_ -]?token|token|password|secret)\b["']?\s*(?:[:=]|\bis\b)\s*(?:Bearer\s+)?(?:\[REDACTED\]|"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi, '[REDACTED]')
      .replace(/\bBearer\s+(?:\[REDACTED\]|"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi, '[REDACTED]')
      .replace(/(?:\\u[0-9a-f]{4}){4,}/gi, '[REDACTED]')
      .replace(/[A-Za-z0-9_./~+%=-]{24,}/g, '[REDACTED]')
      .replace(/\b[A-Z][A-Z0-9_]{11,}\b/g, '[REDACTED]')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ').trim();
    // Redact the entire available field before truncation so a limit boundary
    // cannot expose a prefix of a key or opaque token.
    return clean;
  };
  const visit = (value, depth = 0) => {
    if (remaining-- <= 0) return;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const wrapped = trimmed.replace(/^(?:(?:Error code:\s*|HTTP\s+)?[45]\d{2}(?: Bad Request)?\s*[-:]\s*|(?:Upstream|Provider)(?: API)? error:\s*)(?=[{"])/i, '');
      if (/^[{"]/.test(wrapped)) {
        if (depth >= 3) return;
        try {
          const parsed = JSON.parse(wrapped);
          if (object(parsed) || typeof parsed === 'string') { visit(parsed, depth + 1); return; }
        } catch { /* An unparseable JSON envelope is omitted rather than logged. */ }
        return;
      }
      const clean = redact(value);
      if (clean) excerpts.add(clean);
      return;
    }
    if (!object(value)) return;
    for (const field of ['error', 'message', 'detail']) {
      if (own(value, field) && (typeof value[field] === 'string' || (field === 'error' && object(value[field])))) visit(value[field], depth);
    }
  };
  visit(data);
  return [...excerpts].join('\n').slice(0, 2048) || null;
}

async function readHttpErrorDiagnostics(response, { apiKey, timeoutMs }) {
  const chunks = [];
  let bytes = 0;
  let readStatus = 'unavailable';
  let reader;
  let timer;
  const deadline = performance.now() + timeoutMs;
  const timedOut = Symbol('error-body-timeout');
  try {
    if (response.body === null) readStatus = 'complete';
    else if (timeoutMs <= 0) readStatus = 'timeout';
    else if (typeof response.body?.getReader === 'function') {
      reader = response.body.getReader();
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(timedOut), timeoutMs); });
      while (true) {
        if (performance.now() >= deadline) throw timedOut;
        const { done, value } = await Promise.race([reader.read(), timeout]);
        if (done) { readStatus = 'complete'; break; }
        if (!(value instanceof Uint8Array)) throw new TypeError('Invalid error body chunk.');
        const remaining = MAX_ERROR_BODY_BYTES - bytes;
        // Copy only the bounded prefix, even if a transport supplies a huge chunk.
        const kept = Math.min(remaining, value.byteLength);
        if (kept) { chunks.push(Buffer.from(value.subarray(0, kept))); bytes += kept; }
        if (value.byteLength > remaining) { readStatus = 'too_large'; break; }
      }
    }
  } catch (error) {
    readStatus = error === timedOut ? 'timeout' : 'read_failed';
  } finally {
    clearTimeout(timer);
    if (reader) {
      // Cancellation itself can reject or hang; it must not mask the HTTP error.
      if (readStatus !== 'complete') { try { Promise.resolve(reader.cancel()).catch(() => {}); } catch {} }
      try { reader.releaseLock(); } catch {}
    }
  }
  const complete = readStatus === 'complete';
  const captured = complete || bytes > 0;
  const body = Buffer.concat(chunks, bytes);
  let format = 'unavailable';
  let evidence = errorEvidence(null, apiKey, response.status);
  let excerpt = null;
  if (complete) {
    if (!bytes) format = 'empty';
    else {
      try {
        const parsed = JSON.parse(body.toString('utf8'));
        evidence = errorEvidence(parsed, apiKey, response.status);
        excerpt = redactedErrorExcerpt(parsed, apiKey);
        format = 'json';
      }
      catch { format = 'non_json'; }
    }
  }
  return Object.freeze({
    schema_version: 'jev-http-error-diagnostics/v3',
    ...evidence,
    redacted_excerpt: excerpt,
    body_read_status: readStatus,
    body_format: format,
    // For incomplete reads this is the captured prefix size, not total size.
    body_bytes: captured ? bytes : null,
    body_sha256: captured ? createHash('sha256').update(body).digest('hex') : null,
    body_hash_scope: complete ? 'complete' : captured ? 'prefix' : 'none',
  });
}

function safeErrorRunId(headers, apiKey) {
  const value = headers.get('x-jev-run-id');
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(value)
    && !/[\r\n]/.test(value) && !diagnosticSecretVariants(apiKey).some(secret => value.toLowerCase().includes(secret.toLowerCase())) ? value : null;
}

const BILLING_HEADERS = {
  runId: 'x-jev-run-id',
  mode: 'x-jev-billing',
  paidInputTokensUsed: 'x-jev-paid-input-tokens-used',
  modelMultiplier: 'x-jev-model-multiplier',
  creditsCharged: 'x-jev-credits-charged',
  tokensRemaining: 'x-jev-tokens-remaining',
  creditsRemaining: 'x-jev-credits-remaining',
};

function billingHeaders(headers) {
  return Object.fromEntries(Object.entries(BILLING_HEADERS).map(([name, header]) => [name, headers.get(header)]));
}

function parseDecision(data, request) {
  const bad = () => { throw new JevError('INVALID_RESPONSE', 'Unexpected decision response. Check API usage before another POST.', { outcomeUncertain: true }); };
  if (!object(data) || !text(data.model) || !object(data.answers) || !object(data.usage)) bad();
  if (Object.keys(data.answers).length !== Object.keys(request.questions).length) bad();
  const answers = {};
  for (const [id, question] of Object.entries(request.questions)) {
    const answer = data.answers[id];
    if (!object(answer) || answer.type !== question.type) bad();
    let clean;
    if (question.type === 'noul') {
      if (!probability(answer.noul)) bad();
      clean = { type: 'noul', noul: answer.noul };
    } else {
      const options = question.type === 'choice' ? Object.keys(question.criteria) : question.criteria.map((_, i) => String(i));
      if (!object(answer.probabilities) || Object.keys(answer.probabilities).length !== options.length || !options.every((option) => own(answer.probabilities, option) && probability(answer.probabilities[option]))) bad();
      if (answer.confidence !== undefined && !probability(answer.confidence)) bad();
      clean = { type: question.type, probabilities: answer.probabilities, confidence: answer.confidence ?? null };
      if (question.type === 'choice') {
        if (typeof answer.choice !== 'string' || !options.includes(answer.choice)) bad();
        clean.choice = answer.choice;
      } else {
        if (!Number.isFinite(answer.score) || answer.score < 0 || answer.score > options.length - 1) bad();
        clean.score = answer.score;
        clean.legend = Object.fromEntries(question.criteria.map((label, i) => [String(i), label]));
      }
    }
    Object.defineProperty(answers, id, { value: clean, enumerable: true });
  }
  for (const field of ['input_tokens', 'output_tokens']) {
    if (!Number.isSafeInteger(data.usage[field]) || data.usage[field] < 0) bad();
  }
  if (data.usage.cost !== undefined && (!Number.isFinite(data.usage.cost) || data.usage.cost < 0)) bad();
  return {
    model: data.model,
    answers,
    usage: { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens, cost: data.usage.cost ?? null },
  };
}

// Server-only: fixed origin, no redirects, no provider fallback, no automatic retries.
export function createJevClient({ apiKey, fetchImpl = globalThis.fetch, timeoutMs = 30000 } = {}) {
  if (!text(apiKey) || /\s/.test(apiKey)) throw new JevError('MISSING_KEY', 'Set JEV_AI_API_KEY in ~/workspace/.env or deployment secrets.');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new JevError('INVALID_CONFIG', 'Timeout must be a positive integer in milliseconds.');
  async function request(url, method, body) {
    const start = performance.now();
    let response;
    let data;
    try {
      response = await fetchImpl(url, {
        method,
        headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.url && response.url !== url) {
        throw new JevError('DESTINATION_MISMATCH', 'Unexpected response destination. No automatic retry will be made.', { outcomeUncertain: method === 'POST' });
      }
      if (!response.ok) {
        // Read a bounded body for structural diagnostics; never retain raw text.
        const diagnostics = await readHttpErrorDiagnostics(response, {
          apiKey, timeoutMs: Math.min(ERROR_BODY_TIMEOUT_MS, Math.max(0, timeoutMs - (performance.now() - start))),
        });
        const error = new JevError('HTTP_ERROR', `Jev AI HTTP ${response.status}. ${ERROR_ACTIONS[response.status] ?? 'Check configuration and request outcome before retrying.'}`, {
          status: response.status,
          retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
          outcomeUncertain: method === 'POST' && response.status >= 500,
          runId: safeErrorRunId(response.headers, apiKey),
          automaticRetries: 0,
          diagnostics,
        });
        capturedHttpDiagnostics.set(error, diagnostics);
        throw error;
      }
      try { data = await response.json(); } catch {
        throw new JevError('INVALID_RESPONSE', 'Response is not valid JSON. Check API usage before repeating a decision request.', { outcomeUncertain: method === 'POST' });
      }
    } catch (error) {
      if (error instanceof JevError) throw error;
      // Do not retain the underlying error/cause: transports may embed credentials.
      throw new JevError('TRANSPORT_ERROR', method === 'POST' ? 'Decision outcome is uncertain. Check API usage before another POST.' : 'Model lookup failed. Check network access and try again.', { outcomeUncertain: method === 'POST', automaticRetries: 0 });
    }
    return {
      data,
      receipt: { method, destination: response.url || url, status: response.status, durationMs: Math.round(performance.now() - start), automaticRetries: 0 },
      billing: billingHeaders(response.headers),
    };
  }
  return {
    async listCredits() {
      const result = await request(CREDITS_URL, 'GET');
      const data = result.data;
      if (!object(data) || !['paidInputTokensRemaining', 'creditsRemaining', 'tokensReserved', 'tokenDebt'].every(key => Number.isSafeInteger(data[key]) && data[key] >= 0)
          || typeof data.spending_frozen !== 'boolean') {
        throw new JevError('INVALID_RESPONSE', 'Balance information is incomplete. No inference was requested.');
      }
      return { ...Object.fromEntries(['paidInputTokensRemaining', 'creditsRemaining', 'tokensReserved', 'tokenDebt', 'spending_frozen'].map(key => [key, data[key]])), receipt: result.receipt };
    },
    async listModels() {
      const result = await request(MODELS_URL, 'GET');
      if (!object(result.data) || !Array.isArray(result.data.models) || !result.data.models.every((model) => object(model) && text(model.name))) {
        throw new JevError('INVALID_RESPONSE', 'Unexpected model-list response. No inference was requested.');
      }
      return { models: result.data.models.map(({ name, description }) => ({ name, description: typeof description === 'string' ? description : null })), receipt: result.receipt };
    },
    async decide(input) {
      const prepared = prepareDecision(input);
      const result = await request(DECISION_URL, 'POST', prepared.serialized);
      return { ...parseDecision(result.data, prepared.body), billing: result.billing, receipt: result.receipt };
    },
  };
}
