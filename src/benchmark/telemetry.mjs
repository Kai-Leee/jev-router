import { openSync, writeFileSync, fsyncSync, closeSync, renameSync, linkSync, unlinkSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { prepareDecision, getHttpErrorDiagnostics } from '../client.mjs';
import { BUDGET_ERROR_CODES, JEV_SETTLEMENT_MODELS } from './budget.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(value);
const errorCodes = new Set(['HTTP_ERROR', 'TRANSPORT_ERROR', 'INVALID_RESPONSE', 'DESTINATION_MISMATCH',
  'MODEL_UNAVAILABLE', 'INVALID_REQUEST', 'MISSING_KEY', 'INVALID_CONFIG', 'DECISION_FAILED', 'RECORD_FAILED', ...BUDGET_ERROR_CODES]);
const gateCodes = new Set(['INVALID_CONFIG', 'INVALID_INPUT', 'BUDGET_EXHAUSTED', 'GATE_STOPPED', 'GATE_COMPLETED',
  'DECISION_FAILED', 'INVALID_DECISION', 'RECORD_FAILED', 'STATE_RECORD_FAILED', 'EXECUTION_UNCERTAIN',
  'MCP_TRANSPORT_FAILED', ...BUDGET_ERROR_CODES]);
const fail = code => { throw Object.assign(new Error(code), { code }); };

function httpFailureDetails(error, code) {
  const httpStatus = code === 'HTTP_ERROR' && Number.isInteger(error?.status)
    && error.status >= 100 && error.status <= 599 ? error.status : null;
  // Bounded reconciliation hints only; never preserve raw headers, body or error text.
  const providerRunId = code === 'HTTP_ERROR' && identifier(error?.runId) && !/[\r\n]/.test(error.runId) ? error.runId : null;
  const retryAfter = code === 'HTTP_ERROR' && typeof error?.retryAfterMs === 'number'
    && Number.isFinite(error.retryAfterMs) && error.retryAfterMs >= 0 && error.retryAfterMs <= 86_400_000 ? error.retryAfterMs : null;
  return { http_status: httpStatus, provider_run_id: providerRunId, retry_after_ms: retryAfter,
    error_diagnostics: code === 'HTTP_ERROR' ? getHttpErrorDiagnostics(error) : null };
}

// Empty IDs are retained for legacy/offline callers; supplied IDs are complete
// and validated. A runner supplies the same identifiers to both providers.
export function validateIdentifiers(value = {}) {
  if (!object(value)) fail('INVALID_IDENTIFIERS');
  if (Object.keys(value).length === 0) return {};
  if (Object.keys(value).some(key => !['run_id', 'attempt_id', 'group_id', 'agent_role'].includes(key))
    || !['run_id', 'attempt_id', 'group_id'].every(key => identifier(value[key]))
    || !['implementation', 'monitor'].includes(value.agent_role)) fail('INVALID_IDENTIFIERS');
  return { run_id: value.run_id, attempt_id: value.attempt_id, group_id: value.group_id, agent_role: value.agent_role };
}

function linkedContext(identifiers, context = {}) {
  if (!object(context)) fail('INVALID_CONTEXT');
  const supplied = Object.fromEntries(['run_id', 'attempt_id', 'group_id', 'agent_role']
    .filter(key => Object.hasOwn(context, key)).map(key => [key, context[key]]));
  const linked = validateIdentifiers(supplied);
  if (Object.keys(identifiers).some(key => Object.hasOwn(linked, key) && linked[key] !== identifiers[key])) fail('INVALID_CONTEXT');
  if (context.decision_id != null && (!Number.isSafeInteger(context.decision_id) || context.decision_id < 1)) fail('INVALID_CONTEXT');
  return { ...identifiers, ...linked, decision_id: context.decision_id ?? null };
}

function safeGateState(value, recordedAt) {
  if (!object(value)) fail('INVALID_GATE_STATE');
  const ids = Object.fromEntries(['run_id', 'attempt_id', 'group_id', 'agent_role']
    .filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]]));
  const clean = { schema_version: 'jev-benchmark-gate-state/v1', recorded_at: recordedAt, ...validateIdentifiers(ids) };
  const enums = {
    mode: ['jev', 'baseline'], state: ['ready', 'running', 'stopped', 'completed'],
    last_event: ['ready', 'input', 'decision', 'action_started', 'outcome', 'stopped', 'rejected'],
  };
  for (const [key, options] of Object.entries(enums)) {
    if (!options.includes(value[key])) fail('INVALID_GATE_STATE');
    clean[key] = value[key];
  }
  for (const key of ['max_decisions', 'decisions_remaining', 'last_decision_id', 'last_exit_code']) {
    if (value[key] !== null && (!Number.isSafeInteger(value[key]) || value[key] < 0)) fail('INVALID_GATE_STATE');
    clean[key] = value[key];
  }
  for (const key of ['decisions_used', 'actions_executed', 'rejections']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) fail('INVALID_GATE_STATE');
    clean[key] = value[key];
  }
  for (const key of ['stop_code', 'last_code']) {
    if (value[key] !== null && !gateCodes.has(value[key])) fail('INVALID_GATE_STATE');
    clean[key] = value[key];
  }
  for (const key of ['completion_claimed', 'journal_healthy', 'state_recording_failed', 'outcome_uncertain', 'recovery_allowed']) {
    if (typeof value[key] !== 'boolean') fail('INVALID_GATE_STATE');
    clean[key] = value[key];
  }
  clean.evaluator_success = null;
  return clean;
}

// Independent atomic snapshot. Initial link is exclusive, so another MCP
// process cannot silently adopt an old run; later updates atomically replace
// only this writer's path. No raw input, command, exception, or headers survive.
export function createGateStateWriter(path, { now = () => new Date().toISOString() } = {}) {
  if (typeof path !== 'string' || !path.trim()) fail('INVALID_GATE_STATE_PATH');
  const destination = resolve(path);
  let initialized = false;
  return async value => {
    let temporary;
    let file;
    let directory;
    try {
      const timestamp = now();
      if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) fail('INVALID_GATE_STATE');
      const payload = JSON.stringify(safeGateState(value, new Date(timestamp).toISOString())) + '\n';
      temporary = `${destination}.${process.pid}.${randomUUID()}.tmp`;
      file = openSync(temporary, 'wx', 0o600);
      writeFileSync(file, payload);
      fsyncSync(file);
      closeSync(file); file = undefined;
      if (initialized) renameSync(temporary, destination);
      else { linkSync(temporary, destination); initialized = true; unlinkSync(temporary); }
      temporary = undefined;
      directory = openSync(dirname(destination), 'r');
      fsyncSync(directory);
      closeSync(directory); directory = undefined;
    } catch {
      if (file !== undefined) { try { closeSync(file); } catch {} }
      if (directory !== undefined) { try { closeSync(directory); } catch {} }
      if (temporary !== undefined) { try { unlinkSync(temporary); } catch {} }
      fail('STATE_RECORD_FAILED');
    }
  };
}

// Records dispatch intent separately from response evidence. A failed or
// uncertain attempt closes this decider instance; it never automatically retries.
// Opt-in modelLookupCache ({models_checked}) is shared by one provider session's
// deciders: the model GET repeats only after a non-completed call or an
// unaccepted response model. Credits are always fetched: billing headers carry
// no tokensReserved/tokenDebt/spending_frozen, so reserve balances cannot be derived.
export function createMeasuredDecider({ client, record, identifiers: suppliedIdentifiers, budget, clock = () => performance.now(),
  modelLookupCache = null }) {
  const identifiers = validateIdentifiers(suppliedIdentifiers);
  let modelsChecked = false;
  let sequence = 0;
  let stopped = false;
  return async (request, context) => {
    if (stopped) fail('DECIDER_STOPPED');
    let prepared;
    try { prepared = prepareDecision(request); }
    catch (error) {
      // Local validation has not transmitted an inference request.
      const code = errorCodes.has(error?.code) ? error.code : 'INVALID_REQUEST';
      throw Object.assign(new Error(code), { code, outcomeUncertain: false });
    }
    const linkage = linkedContext(identifiers, context);
    let reservation, reservationOpen = false;
    // A narrow-lock budget cannot infer that this request ended; mark its open reservation unresolved.
    const unresolved = async () => {
      if (!reservationOpen || typeof budget?.markUnresolved !== 'function') return {};
      reservationOpen = false;
      try { await budget.markUnresolved(reservation); return { reservation_marked_unresolved: true }; }
      catch { return { reservation_marked_unresolved: false }; }
    };
    const persist = async event => {
      try { await record({ ...event, ...linkage }); }
      catch { stopped = true; await unresolved(); fail('RECORD_FAILED'); }
    };
    const cached = modelLookupCache?.models_checked === true;
    if (modelLookupCache) modelLookupCache.models_checked = false; // re-armed only by a completed, accepted call
    const sources = modelLookupCache ? { model_lookup_source: cached ? 'session_cache' : 'get' } : {};
    if (modelLookupCache ? !cached : !modelsChecked) {
      await persist({ event: 'model_lookup_started', provider: 'jev', phase: 'model_lookup' });
      let result;
      try {
        result = await client.listModels();
        if (!result.models.some(model => model.name === 'jev-latest')) fail('MODEL_UNAVAILABLE');
      } catch (error) {
        stopped = true;
        const code = errorCodes.has(error?.code) ? error.code : 'MODEL_LOOKUP_FAILED';
        const details = httpFailureDetails(error, code);
        await persist({ event: 'model_lookup_failed', provider: 'jev', phase: 'model_lookup', status: 'failed', code, ...details, recovery_allowed: false });
        throw Object.assign(new Error(code), { code, ...details, status: details.http_status, outcomeUncertain: false });
      }
      await persist({ event: 'model_lookup', provider: 'jev', phase: 'model_lookup', models: result.models, receipt: result.receipt });
      modelsChecked = true;
    }
    const requestId = `jev-${++sequence}`;
    if (budget) {
      try {
        if (prepared.body.model !== 'jev-latest') fail('BUDGET_MODEL_UNSUPPORTED');
        const balances = await client.listCredits();
        reservation = await budget.reserve({ ...linkage, request_id: requestId }, balances);
        reservationOpen = true;
      } catch (error) {
        stopped = true;
        const code = errorCodes.has(error?.code) ? error.code : 'BUDGET_PREFLIGHT_FAILED';
        const details = httpFailureDetails(error, code);
        await persist({ event: 'budget_blocked', provider: 'jev', phase: 'decision', code,
          ...details, budget: budget.snapshot(), outcome_uncertain: false, recovery_allowed: false });
        throw Object.assign(new Error(code), { code, ...details, status: details.http_status, outcomeUncertain: false });
      }
      await persist({ event: 'budget_reserved', provider: 'jev', phase: 'decision', request_id: requestId, budget: budget.snapshot(),
        ...(modelLookupCache ? { balance_source: 'credits_get' } : {}) });
    }
    await persist({ event: 'inference_started', provider: 'jev', phase: 'decision', request_id: requestId, ...sources });
    const started = clock();
    let response;
    try { response = await client.decide(request); }
    catch (error) {
      stopped = true;
      const code = errorCodes.has(error?.code) ? error.code : 'DECISION_FAILED';
      const uncertain = error?.outcomeUncertain !== false;
      const details = httpFailureDetails(error, code);
      const marked = await unresolved();
      await persist({ event: 'inference_finished', provider: 'jev', phase: 'decision', request_id: requestId,
        status: uncertain ? 'uncertain' : 'failed', code, ...details, outcome_uncertain: uncertain, recovery_allowed: false, ...marked,
        duration_ms: Math.max(0, Math.round(clock() - started)) });
      throw Object.assign(new Error(code), { code, ...details, status: details.http_status, outcomeUncertain: uncertain });
    }
    await persist({ event: 'inference_finished', provider: 'jev', phase: 'decision', request_id: requestId, status: 'completed',
      model: response.model, usage: response.usage, billing: response.billing, receipt: response.receipt,
      duration_ms: Math.max(0, Math.round(clock() - started)) });
    if (budget) {
      try { await budget.settle(reservation, response); reservationOpen = false; }
      catch (error) {
        stopped = true;
        const code = errorCodes.has(error?.code) ? error.code : 'BUDGET_SETTLEMENT_FAILED';
        const marked = await unresolved();
        await persist({ event: 'budget_blocked', provider: 'jev', phase: 'decision', request_id: requestId,
          code, budget: budget.snapshot(), outcome_uncertain: true, recovery_allowed: false, ...marked });
        throw Object.assign(new Error(code), { code, outcomeUncertain: true });
      }
      await persist({ event: 'budget_settled', provider: 'jev', phase: 'decision', request_id: requestId, budget: budget.snapshot() });
    }
    if (modelLookupCache) modelLookupCache.models_checked = JEV_SETTLEMENT_MODELS.includes(response.model);
    return response;
  };
}
