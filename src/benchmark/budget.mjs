import { constants, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, fstatSync, lstatSync, realpathSync, renameSync, linkSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

export const BUDGET_ERROR_CODES = Object.freeze([
  'INVALID_BUDGET_CONFIG', 'JEV_BUDGET_REQUIRED', 'BUDGET_REQUIRED', 'BUDGET_LOCKED', 'BUDGET_LOCK_LOST',
  'BUDGET_IO_FAILED', 'BUDGET_LEDGER_INVALID', 'BUDGET_LEDGER_CHANGED', 'BUDGET_CLOSED', 'BUDGET_EXHAUSTED',
  'BUDGET_OUTSTANDING', 'BUDGET_INVALID_LINKAGE', 'BUDGET_INVALID_BALANCES', 'BUDGET_ACCOUNT_BLOCKED',
  'BUDGET_PAID_BALANCE_LOW', 'BUDGET_INVALID_RESERVATION', 'BUDGET_INVALID_SETTLEMENT',
  'BUDGET_MODEL_UNSUPPORTED', 'BUDGET_PREFLIGHT_FAILED', 'BUDGET_SETTLEMENT_FAILED',
  'BUDGET_RECONCILIATION_NOT_ALLOWED',
]);
const TOKEN_LIMIT = 1_666_666; // floor(1 USD / (3 / 5,000,000 USD per token)); comparisons stay integer.
const RESERVATION = 65_536;
// Exact equivalence documented at https://jev-ai.pro/model/jev-1.13, "Dated snapshot"
// (verified 2026-10-09). No moving alias, prefix match, or future dated build is allowed.
// Jev AI may return the Vercel provider ID even for jev-latest. Verified
// 2026-10-09: https://jev-ai.pro/where-to-run-jev and Vercel's official 32K
// catalog https://vercel.com/ai-gateway/models/labs/typesafe-ai . This provider
// alias is not a dated revision; preserve it verbatim in provenance.
const SETTLEMENT_MODELS = Object.freeze(['jev-1.13.0', 'typesafe/jev-1.13-20260917', 'typesafe-ai/jev']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,95}$/.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(value);
const providerId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/.test(value);
const fail = code => { throw Object.assign(new Error(code), { name: 'TokenBudgetError', code }); };
const valueUSD = tokens => tokens * 3 / 5_000_000;
const copy = value => JSON.parse(JSON.stringify(value));
const exactKeys = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const POLICY = Object.freeze({ max_usd: 1, usd_per_million_input_tokens: 0.6, reserve_input_tokens: RESERVATION });

export function validateBudgetConfig(value, baseDirectory = process.cwd()) {
  try {
    if (!exactKeys(value, ['schema_version', 'ledger_path', ...Object.keys(POLICY)])
      || value.schema_version !== 'jev-token-budget/v1'
      || Object.entries(POLICY).some(([key, expected]) => value[key] !== expected)
      || typeof value.ledger_path !== 'string' || !value.ledger_path.trim() || value.ledger_path.includes('\0')
      || typeof baseDirectory !== 'string' || !baseDirectory.trim()) fail('INVALID_BUDGET_CONFIG');
    return Object.freeze({ schema_version: value.schema_version, ledger_path: resolve(baseDirectory, value.ledger_path), ...POLICY });
  } catch { fail('INVALID_BUDGET_CONFIG'); }
}

function safeLinkage(value) {
  if (!object(value) || !['request_id', 'run_id', 'attempt_id', 'group_id'].every(key => identifier(value[key]))) fail('BUDGET_INVALID_LINKAGE');
  // Runtime context may contain decision_id/agent_role. Only these four IDs enter the ledger.
  return Object.fromEntries(['request_id', 'run_id', 'attempt_id', 'group_id'].map(key => [key, value[key]]));
}

function validatePending(value, budgetId, sequence) {
  if (!exactKeys(value, ['reservation_id', 'request_id', 'run_id', 'attempt_id', 'group_id', 'reserved_input_tokens'])
    || value.reservation_id !== `${budgetId}:r${sequence}` || value.reserved_input_tokens !== RESERVATION) fail('BUDGET_LEDGER_INVALID');
  try { safeLinkage(value); } catch { fail('BUDGET_LEDGER_INVALID'); }
}

function validateLedger(value) {
  if (!exactKeys(value, ['schema_version', 'budget_id', ...Object.keys(POLICY), 'token_limit', 'charged_input_tokens',
    'settled_requests', 'pending', 'last_settlement', 'blocked_code'])
    || value.schema_version !== 'jev-token-budget-ledger/v1' || !uuid(value.budget_id)
    || Object.entries(POLICY).some(([key, expected]) => value[key] !== expected) || value.token_limit !== TOKEN_LIMIT
    || !integer(value.charged_input_tokens) || value.charged_input_tokens > TOKEN_LIMIT
    || !integer(value.settled_requests) || value.settled_requests >= Number.MAX_SAFE_INTEGER
    || (value.blocked_code !== null && !['BUDGET_INVALID_SETTLEMENT', 'BUDGET_MODEL_UNSUPPORTED', 'BUDGET_INVALID_RESERVATION'].includes(value.blocked_code))) fail('BUDGET_LEDGER_INVALID');
  if (value.pending !== null) {
    validatePending(value.pending, value.budget_id, value.settled_requests + 1);
    if (value.charged_input_tokens + RESERVATION > TOKEN_LIMIT) fail('BUDGET_LEDGER_INVALID');
  }
  if (value.blocked_code !== null && value.pending === null) fail('BUDGET_LEDGER_INVALID');
  if (value.settled_requests === 0) {
    if (value.charged_input_tokens !== 0 || value.last_settlement !== null) fail('BUDGET_LEDGER_INVALID');
  } else {
    const last = value.last_settlement;
    if (!exactKeys(last, ['reservation_id', 'charged_input_tokens', 'input_tokens', 'billing_run_id'])
      || last.reservation_id !== `${value.budget_id}:r${value.settled_requests}`
      || !integer(last.charged_input_tokens) || last.charged_input_tokens > RESERVATION
      || last.input_tokens !== last.charged_input_tokens || last.charged_input_tokens > value.charged_input_tokens
      || !providerId(last.billing_run_id)) fail('BUDGET_LEDGER_INVALID');
  }
  return value;
}

function regularStat(path) {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0) fail('BUDGET_LEDGER_INVALID');
  return stat;
}

function readPrivate(path) {
  const before = regularStat(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.dev !== before.dev || stat.ino !== before.ino) fail('BUDGET_LEDGER_INVALID');
    const bytes = readFileSync(fd);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('BUDGET_LEDGER_INVALID'); }
    return { stat, text };
  } finally { closeSync(fd); }
}

function syncDirectory(directory) {
  const fd = openSync(directory, 'r');
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

// This is a fixed conservative token-valuation policy, not a provider-issued USD
// guarantee. Official modes: https://jev-ai.pro/jev-api, Balance row (2026-10-09):
// tokens / credits / credits-fallback / tokens-fallback. Accept ONLY plain tokens.
// Resolved model and multiplier: https://jev-ai.pro/docs#billing and #models.
function settlement(response) {
  if (!object(response) || !SETTLEMENT_MODELS.includes(response.model)) fail('BUDGET_MODEL_UNSUPPORTED');
  const billing = response.billing;
  const usage = response.usage;
  const receipt = response.receipt;
  if (!object(billing) || billing.mode !== 'tokens' || billing.modelMultiplier !== '1' || billing.creditsCharged !== '0'
    || typeof billing.paidInputTokensUsed !== 'string' || !/^(0|[1-9][0-9]*)$/.test(billing.paidInputTokensUsed)
    || !providerId(billing.runId)
    || !object(usage) || !integer(usage.input_tokens) || usage.input_tokens > RESERVATION
    || !integer(usage.output_tokens)
    || !object(receipt) || receipt.method !== 'POST' || receipt.destination !== 'https://jev-ai.pro/api/v1/systemone'
    || !Number.isInteger(receipt.status) || receipt.status < 200 || receipt.status >= 300 || receipt.automaticRetries !== 0
    || !Number.isFinite(receipt.durationMs) || receipt.durationMs < 0
    || receipt.outcomeUncertain === true || receipt.outcome_uncertain === true
    || response.outcomeUncertain === true || response.outcome_uncertain === true) fail('BUDGET_INVALID_SETTLEMENT');
  const charged = Number(billing.paidInputTokensUsed);
  if (!integer(charged) || charged > RESERVATION || charged !== usage.input_tokens) fail('BUDGET_INVALID_SETTLEMENT');
  return { charged_input_tokens: charged, input_tokens: usage.input_tokens, billing_run_id: billing.runId };
}

export function createTokenBudget(input) {
  const config = validateBudgetConfig(input);
  let directory;
  try { directory = realpathSync(dirname(config.ledger_path)); } catch { fail('BUDGET_IO_FAILED'); }
  const path = join(directory, basename(config.ledger_path));
  const lockPath = `${path}.lock`;
  const owner = randomUUID();
  const lockText = JSON.stringify({ schema_version: 'jev-token-budget-lock/v1', owner }) + '\n';
  let lock;
  let lockStat;
  try { lock = openSync(lockPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600); }
  catch (error) { fail(error?.code === 'EEXIST' ? 'BUDGET_LOCKED' : 'BUDGET_IO_FAILED'); }
  let ledger;
  let ledgerText = null;
  let ledgerStat = null;
  let closed = false;
  let broken = false;
  let lastBlockingCode = null;

  function block(code) { lastBlockingCode = code; fail(code); }
  function assertOpen() {
    if (closed) block('BUDGET_CLOSED');
    if (broken) block(lastBlockingCode ?? 'BUDGET_IO_FAILED');
    try {
      const current = readPrivate(lockPath);
      if (current.stat.dev !== lockStat.dev || current.stat.ino !== lockStat.ino || current.text !== lockText) throw new Error();
    } catch { broken = true; block('BUDGET_LOCK_LOST'); }
  }
  function checkLedgerUnchanged() {
    if (ledgerText === null) return;
    try {
      const current = readPrivate(path);
      if (current.text !== ledgerText || current.stat.dev !== ledgerStat.dev || current.stat.ino !== ledgerStat.ino) throw new Error();
    } catch { broken = true; block('BUDGET_LEDGER_CHANGED'); }
  }
  function persist(next) {
    assertOpen();
    checkLedgerUnchanged();
    const text = JSON.stringify(validateLedger(next)) + '\n';
    const temporary = `${path}.${owner}.${randomUUID()}.tmp`;
    let fd;
    try {
      fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
      writeFileSync(fd, text);
      fsyncSync(fd);
      closeSync(fd); fd = undefined;
      if (ledgerText === null) { linkSync(temporary, path); unlinkSync(temporary); }
      else renameSync(temporary, path);
      syncDirectory(directory);
      ledgerStat = regularStat(path);
      ledgerText = text;
      ledger = next;
      lastBlockingCode = null;
    } catch {
      if (fd !== undefined) { try { closeSync(fd); } catch {} }
      try { unlinkSync(temporary); } catch {}
      // If reservation persistence was uncertain, retain its full amount in memory.
      // For settlement failures, retain the older unresolved reservation instead.
      if (ledger?.pending === null && next.pending !== null) ledger = next;
      broken = true;
      block('BUDGET_IO_FAILED');
    }
  }

  try {
    writeFileSync(lock, lockText);
    fsyncSync(lock);
    lockStat = fstatSync(lock);
    syncDirectory(directory);
    try {
      const existing = readPrivate(path);
      try { ledger = validateLedger(JSON.parse(existing.text)); } catch { fail('BUDGET_LEDGER_INVALID'); }
      ledgerText = existing.text;
      ledgerStat = existing.stat;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const fresh = { schema_version: 'jev-token-budget-ledger/v1', budget_id: randomUUID(), ...POLICY, token_limit: TOKEN_LIMIT,
        charged_input_tokens: 0, settled_requests: 0, pending: null, last_settlement: null, blocked_code: null };
      persist(fresh);
    }
  } catch (error) {
    try { closeSync(lock); } catch {}
    // Remove only our newly acquired lock for a confirmed invalid ledger. I/O
    // uncertainty deliberately leaves a stale lock requiring manual inspection.
    if (error?.code === 'BUDGET_LEDGER_INVALID') {
      try { if (readPrivate(lockPath).text === lockText) { unlinkSync(lockPath); syncDirectory(directory); } } catch {}
      fail('BUDGET_LEDGER_INVALID');
    }
    fail(error?.code === 'BUDGET_LEDGER_CHANGED' ? error.code : 'BUDGET_IO_FAILED');
  }

  function snapshot() {
    const reserved = ledger.pending ? RESERVATION : 0;
    return { schema_version: 'jev-token-budget-snapshot/v1', budget_id: ledger.budget_id,
      limit_usd: 1, rate_usd_per_million: 0.6, token_limit: TOKEN_LIMIT,
      charged_input_tokens: ledger.charged_input_tokens, reserved_input_tokens: reserved,
      estimated_spent_usd: valueUSD(ledger.charged_input_tokens), estimated_reserved_usd: valueUSD(reserved),
      remaining_usd: valueUSD(TOKEN_LIMIT - ledger.charged_input_tokens - reserved), actual_billed_usd: null,
      reservations_pending: ledger.pending ? 1 : 0, pending_reservation_id: ledger.pending?.reservation_id ?? null,
      blocked_code: lastBlockingCode ?? ledger.blocked_code ?? (ledger.pending ? 'BUDGET_OUTSTANDING' : null), closed };
  }

  function reserve(linkage, balances) {
    assertOpen();
    if (ledger.blocked_code) block(ledger.blocked_code);
    if (ledger.pending) block('BUDGET_OUTSTANDING');
    let ids;
    try { ids = safeLinkage(linkage); } catch { block('BUDGET_INVALID_LINKAGE'); }
    if (!object(balances) || !['paidInputTokensRemaining', 'tokensReserved', 'tokenDebt'].every(key => integer(balances[key]))
      || typeof balances.spending_frozen !== 'boolean') block('BUDGET_INVALID_BALANCES');
    if (balances.spending_frozen || balances.tokenDebt !== 0) block('BUDGET_ACCOUNT_BLOCKED');
    if (balances.paidInputTokensRemaining - balances.tokensReserved < RESERVATION) block('BUDGET_PAID_BALANCE_LOW');
    if (ledger.charged_input_tokens + RESERVATION > TOKEN_LIMIT) block('BUDGET_EXHAUSTED');
    const pending = { reservation_id: `${ledger.budget_id}:r${ledger.settled_requests + 1}`, ...ids, reserved_input_tokens: RESERVATION };
    persist({ ...ledger, pending });
    return pending.reservation_id;
  }

  function settle(reservationId, response) {
    assertOpen();
    if (ledger.blocked_code) block(ledger.blocked_code);
    if (!ledger.pending) block('BUDGET_INVALID_RESERVATION');
    let observed;
    let code;
    if (reservationId !== ledger.pending.reservation_id) code = 'BUDGET_INVALID_RESERVATION';
    else {
      try { observed = settlement(response); }
      catch (error) { code = error?.code === 'BUDGET_MODEL_UNSUPPORTED' ? error.code : 'BUDGET_INVALID_SETTLEMENT'; }
    }
    if (code) { persist({ ...ledger, blocked_code: code }); block(code); }
    return commitSettlement(reservationId, observed);
  }

  function commitSettlement(reservationId, observed) {
    const next = { ...ledger, charged_input_tokens: ledger.charged_input_tokens + observed.charged_input_tokens,
      settled_requests: ledger.settled_requests + 1, pending: null,
      blocked_code: null,
      last_settlement: { reservation_id: reservationId, ...observed } };
    persist(next);
    return snapshot();
  }

  // Explicit offline reconciliation of a saved receipt after a documented model
  // mapping update. Never sends a request, refunds tokens, resets prior spend,
  // or clears any other blocking condition. Invalid evidence leaves disk intact.
  function reconcile(reservationId, response) {
    assertOpen();
    if (!ledger.pending || ledger.blocked_code !== 'BUDGET_MODEL_UNSUPPORTED') fail('BUDGET_RECONCILIATION_NOT_ALLOWED');
    if (reservationId !== ledger.pending.reservation_id) fail('BUDGET_INVALID_RESERVATION');
    let observed;
    try { observed = settlement(response); }
    catch (error) { fail(error?.code === 'BUDGET_MODEL_UNSUPPORTED' ? error.code : 'BUDGET_INVALID_SETTLEMENT'); }
    return commitSettlement(reservationId, observed);
  }

  function close() {
    if (closed) return;
    if (broken) { try { closeSync(lock); } finally { closed = true; } return; }
    try { assertOpen(); checkLedgerUnchanged(); }
    catch (error) { try { closeSync(lock); } catch {} closed = true; throw error; }
    try {
      closeSync(lock);
      unlinkSync(lockPath);
      syncDirectory(directory);
      closed = true;
    } catch { broken = true; closed = true; block('BUDGET_IO_FAILED'); }
  }

  return { snapshot, reserve, settle, reconcile, close };
}
