import { DECISION_URL, DEFAULT_MODEL, MODELS_URL, CREDITS_URL } from './config.mjs';

const MAX_BODY_BYTES = 256000;
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
        // Do not print upstream error bodies: they can reflect request data or secrets.
        throw new JevError('HTTP_ERROR', `Jev AI HTTP ${response.status}. ${ERROR_ACTIONS[response.status] ?? 'Check configuration and request outcome before retrying.'}`, {
          status: response.status,
          retryAfterMs: retryAfterMs(response.headers.get('retry-after')),
          outcomeUncertain: method === 'POST' && response.status >= 500,
          runId: response.headers.get('x-jev-run-id'),
          automaticRetries: 0,
        });
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
