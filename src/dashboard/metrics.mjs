import { BUDGET_ERROR_CODES } from '../benchmark/budget.mjs';
import { priceClaudeUsage, priceJevUsage } from './pricing.mjs';
// Browser-facing projection. Never return arbitrary trace fields or prose.
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
const amount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const billingNumber = value => typeof value === 'string' && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)
  ? amount(Number(value)) : amount(value);
const safeId = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value) ? value : null;
const modelId = value => typeof value === 'string' && (value === 'typesafe-ai/jev' || /^(?:claude-|jev-|typesafe\/jev-)[A-Za-z0-9_.-]{1,96}$/.test(value)) ? value : null;
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const rowsOf = value => object(value) ? Object.values(value).map(row => object(row) ? row : {}) : [];
const finiteSum = values => {
  const sum = values.reduce((total, value) => total + value, 0);
  return Number.isFinite(sum) && sum <= Number.MAX_SAFE_INTEGER ? sum : null;
};

function metric(values = [], expected = null, validator = amount) {
  const valid = values.map(validator).filter(value => value !== null);
  const observed = valid.length ? finiteSum(valid) : expected === 0 ? 0 : null;
  return { value: expected !== null && valid.length === expected ? observed : null,
    observed, known: valid.length, expected };
}

function tokenMetrics(rows, expected, { camel = false, jev = false, live = false } = {}) {
  const fields = camel
    ? ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens']
    : ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'];
  const get = index => rows.map(row => count(row?.[fields[index]]));
  const result = Object.fromEntries(['input', 'output', 'cache_read', 'cache_creation'].map((key, index) =>
    [key, metric(live && index === 1 ? [] : get(index), jev && index > 1 && expected !== 0 ? null : expected, count)]));
  const totalRows = rows.map(row => {
    if (live) return null;
    const values = fields.slice(0, jev ? 2 : 4).map(key => count(row?.[key]));
    return values.includes(null) ? null : finiteSum(values);
  });
  result.total = metric(totalRows, expected, count);
  return result;
}

const NOTES = {
  jev: 'Jev 원시 토큰, 잔액 토큰 차감, credits 차감은 다른 단위입니다. 별도 환산 예산은 추정값이며 실제 청구 USD는 미제공 시 미확인입니다.',
  claude: 'Claude 보고 USD는 CLI 가격표 추정치이며 구독 또는 API 실제 청구액이 아닙니다. 최종 modelUsage를 우선하며 cache 토큰을 분리합니다.',
};

const RUNNER_EVENTS = new Set(['runner_started', 'preflight_started', 'preflight_failed', 'provider_started',
  'provider_finished', 'runner_finalizing', 'artifact_frozen', 'runner_terminal']);
const PHASES = new Set(['initializing', 'preflight', 'provider', 'finalizing', 'terminal']);
const FAILURE_CODES = new Set(['INVALID_CONFIG', 'INVALID_INPUT', 'BUDGET_EXHAUSTED', 'GATE_STOPPED',
  'GATE_COMPLETED', 'DECISION_FAILED', 'INVALID_DECISION', 'RECORD_FAILED', 'EXECUTION_UNCERTAIN',
  'INVALID_RUN_CONFIG', 'INVALID_ARGUMENTS', 'INVALID_BRIEF', 'CLAUDE_AUTH_REQUIRED', 'JEV_MODEL_UNAVAILABLE',
  'MODEL_UNAVAILABLE', 'UNSAFE_SANDBOX', 'TIMEOUT', 'OUTPUT_LIMIT', 'OUTPUT_WRITE_FAILED', 'PROCESS_START_FAILED',
  'INVALID_CONTAINER', 'SANDBOX_UNAVAILABLE', 'INVALID_SANDBOX_RESPONSE', 'INVALID_COMMAND', 'INVALID_REQUEST',
  'INVALID_RESPONSE', 'MISSING_KEY', 'DESTINATION_MISMATCH', 'HTTP_ERROR', 'TRANSPORT_ERROR',
  'BENCHMARK_CONFIGURATION_OR_RUN_FAILED', 'CLAUDE_FINAL_MISSING', 'CLAUDE_FAILED', 'PROVIDER_FAILED',
  'PROVIDER_FINAL_MISSING', 'PROVIDER_RESULT_INVALID', 'PROVIDER_EXIT_NONZERO', 'ARTIFACT_FREEZE_FAILED',
  'RUNNER_RECORD_FAILED', 'RUNNER_FAILED', 'RUNNER_UNCERTAIN', 'CLEANUP_FAILED', 'BRIEF_UNAVAILABLE',
  'CLAUDE_AUTH_CHECK_FAILED', 'JEV_PREFLIGHT_FAILED', 'CLAUDE_VERSION_UNAVAILABLE', 'PROCESS_ABORTED',
  'RUNNER_STOP_REQUESTED', 'PROVIDER_FINAL_INVALID', 'PROVIDER_FINAL_CONFLICT', 'MODEL_IDENTITY_MISMATCH',
  'MODEL_IDENTITY_UNVERIFIED', 'GATE_COMPLETION_UNCONFIRMED', 'GATE_STATE_INVALID', 'RUNNER_INTERNAL_ERROR',
  'STATE_RECORD_FAILED', 'MCP_TRANSPORT_FAILED', 'MODEL_LOOKUP_FAILED',
  'MONITOR_REPORT_INVALID', 'MONITOR_RECORD_OR_START_FAILED', ...BUDGET_ERROR_CODES]);
const codeOf = (value, fallback = 'UNKNOWN_FAILURE') => FAILURE_CODES.has(value) ? value : fallback;
const phaseOf = value => PHASES.has(value) ? value : null;
const exitOf = value => count(value) !== null && value <= 255 ? value : null;
const roleOf = value => ['implementation', 'monitor'].includes(value) ? value : 'unknown';

// The shared ledger snapshot is a token-price estimate, never actual billed USD.
function budgetProjection(manifest, decisions) {
  if (manifest?.jev_budget?.schema_version !== 'jev-token-budget/v1' || manifest.jev_budget.max_usd !== 1
      || manifest.jev_budget.usd_per_million_input_tokens !== 0.6 || manifest.jev_budget.reserve_input_tokens !== 65536) return null;
  const latest = decisions.filter(event => ['budget_reserved', 'budget_settled', 'budget_blocked'].includes(event?.event)).at(-1);
  const data = latest?.budget;
  const valid = object(data) && safeId(data.budget_id) && data.limit_usd === 1 && data.rate_usd_per_million === 0.6
    && ['charged_input_tokens', 'reserved_input_tokens'].every(key => count(data[key]) !== null)
    && data.charged_input_tokens + data.reserved_input_tokens <= 1666666;
  const charged = valid ? data.charged_input_tokens : null;
  const reserved = valid ? data.reserved_input_tokens : null;
  return { limit_usd: 1, rate_usd_per_million: 0.6, budget_id: valid ? data.budget_id : null,
    estimated_spent_usd: charged === null ? null : charged * 0.6 / 1e6,
    estimated_reserved_usd: reserved === null ? null : reserved * 0.6 / 1e6,
    estimated_remaining_usd: charged === null ? null : (1666666 - charged - reserved) * 0.6 / 1e6,
    actual_billed_usd: null, status: latest?.event === 'budget_blocked' ? 'blocked' : valid ? 'observed' : 'not_observed',
    observed_at: iso(latest?.recorded_at), scope: 'shared_experiment' };
}

function executionProjection({ manifest, result, decisions, claudeEvents, runnerEvents, heartbeat, gateState, observedAt, issues }, warn) {
  const journal = runnerEvents.filter(event => object(event) && RUNNER_EVENTS.has(event.event));
  const lastRunner = journal.at(-1);
  const runnerTerminal = journal.filter(event => event.event === 'runner_terminal').at(-1);
  const providerFinal = claudeEvents.filter(event => event?.type === 'result').at(-1);
  const declared = ['completed', 'failed', 'uncertain'].includes(result?.runner_status) ? result.runner_status
    : ['completed', 'failed', 'uncertain'].includes(runnerTerminal?.status) ? runnerTerminal.status : null;
  const startedAt = iso(manifest?.started_at) ?? iso(journal.find(event => event.event === 'runner_started')?.recorded_at);
  const checkedAt = iso(observedAt);
  const wallSeconds = amount(manifest?.wall_timeout_seconds);
  const deadlineEvidence = startedAt !== null && checkedAt !== null && wallSeconds !== null && wallSeconds > 0
    && Date.parse(checkedAt) >= Date.parse(startedAt) && Number.isSafeInteger(Math.ceil(wallSeconds * 1000 + 30000));
  const terminal = declared !== null || count(result?.process_exit) !== null || result?.outcome_uncertain === true
    || typeof result?.grading_status === 'string' || result?.version === 'personal-os-evaluator-v1-experimental'
    || (result?.model_calls === 0 && Array.isArray(result?.tools));
  const staleDeadline = !terminal && deadlineEvidence && Date.parse(checkedAt) > Date.parse(startedAt) + wallSeconds * 1000 + 30000;
  const heartbeatAt = iso(heartbeat?.recorded_at);
  const heartbeatAge = checkedAt && heartbeatAt && Date.parse(checkedAt) >= Date.parse(heartbeatAt)
    ? Date.parse(checkedAt) - Date.parse(heartbeatAt) : null;
  const heartbeatState = heartbeatAge === null ? 'unknown' : heartbeatAge <= 15000 ? 'fresh' : 'stale';
  const staleHeartbeat = !terminal && heartbeatState === 'stale';
  const incidents = [], seen = new Set();
  const add = (source, code, event = {}, extra = {}) => {
    const incident = { at: iso(event.recorded_at), source, code, decision_id: count(event.decision_id ?? event.last_decision_id),
      exit_code: exitOf(event.exit_code ?? event.outcome?.exit_code ?? event.last_exit_code),
      recovery_allowed: typeof event.recovery_allowed === 'boolean' ? event.recovery_allowed : null, ...extra };
    const key = JSON.stringify(incident);
    if (!seen.has(key)) { incidents.push(incident); seen.add(key); }
  };
  let gateStatus = 'unknown', gateStopCode = null, gateUncertain = null;
  for (const event of decisions) {
    if (!object(event)) continue;
    if (event.event === 'input' || event.event === 'action_started') gateStatus = 'running';
    if (event.event === 'outcome') {
      gateStatus = event.completion_claimed === true ? 'completed' : 'ready';
      if (exitOf(event.exit_code ?? event.outcome?.exit_code) > 0) add('tool', 'TOOL_EXIT_NONZERO', event, { recovery_allowed: event.recovery_allowed !== false });
    }
    if (event.event === 'rejected') add('gate', codeOf(event.code), event);
    if (event.event === 'stopped') {
      gateStatus = 'stopped'; gateStopCode = codeOf(event.code);
      gateUncertain = typeof event.outcome_uncertain === 'boolean' ? event.outcome_uncertain : null;
      add('gate', gateStopCode, event, { recovery_allowed: false });
    }
    if (event.event === 'inference_finished' && ['failed', 'uncertain'].includes(event.status)) {
      add('provider', codeOf(event.code, event.status === 'uncertain' ? 'PROVIDER_UNCERTAIN' : 'PROVIDER_FAILED'), event, { recovery_allowed: false });
    }
    if (event.event === 'model_lookup_failed') add('provider', codeOf(event.code, 'MODEL_LOOKUP_FAILED'), event, { recovery_allowed: false });
    if (event.event === 'budget_blocked') add('gate', codeOf(event.code, 'BUDGET_PREFLIGHT_FAILED'), event, { recovery_allowed: false });
  }
  if (gateState?.schema_version === 'jev-benchmark-gate-state/v1') {
    if (['ready', 'running', 'stopped', 'completed'].includes(gateState.state)) gateStatus = gateState.state;
    gateStopCode = gateStatus === 'stopped' ? codeOf(gateState.stop_code) : null;
    if (typeof gateState.outcome_uncertain === 'boolean') gateUncertain = gateState.outcome_uncertain;
    if (gateStopCode) add('gate', gateStopCode, gateState, { recovery_allowed: false });
    if (gateState.journal_healthy === false || gateState.state_recording_failed === true) {
      add('observer', 'RECORD_FAILED', gateState, { recovery_allowed: false });
      warn('판단 기록 저장 실패가 별도 상태 파일에 남았습니다. 기록 누락과 모델 실패를 구분합니다.');
    }
    if (gateState.last_event === 'rejected') add('gate', codeOf(gateState.last_code), gateState);
  }
  for (const event of journal) {
    if (event.event === 'preflight_failed' || (event.event === 'runner_terminal' && event.status !== 'completed')) {
      add('runner', codeOf(event.code, event.status === 'uncertain' ? 'RUNNER_UNCERTAIN' : 'RUNNER_FAILED'), event, { recovery_allowed: false });
    }
    if (event.event === 'provider_finished' && ['failed', 'uncertain'].includes(event.status)) {
      add('provider', codeOf(event.code, event.status === 'uncertain' ? 'PROVIDER_UNCERTAIN' : 'PROVIDER_FAILED'), event, { recovery_allowed: false });
    }
  }
  if (declared && declared !== 'completed' && !runnerTerminal) add('runner', codeOf(result?.runner_error_code, declared === 'uncertain' ? 'RUNNER_UNCERTAIN' : 'RUNNER_FAILED'),
    { recorded_at: result?.finished_at }, { recovery_allowed: false });
  if (issues.length) add('observer', 'RECORDS_INCOMPLETE', {}, { recovery_allowed: null });
  if (staleDeadline) {
    add('runner', 'RUNNER_DEADLINE_EXPIRED', {}, { recovery_allowed: false });
    warn('선언된 실행 제한과 30초 유예가 지났지만 실행기 종료 기록이 없습니다. 모델 종료와 별도로 결과를 불확실로 표시합니다.');
  }
  if (staleHeartbeat) {
    add('observer', 'RUNNER_HEARTBEAT_STALE');
    warn('실행기 heartbeat 기록이 15초 넘게 갱신되지 않았습니다. 프로세스 사망이나 작업 실패가 확정된 것은 아닙니다.');
  }
  const providerSuccess = providerFinal?.is_error === false || result?.claude_is_error === false
    || journal.some(event => event.event === 'provider_finished' && event.status === 'completed');
  const frozen = result?.artifact_frozen === true || result?.cleanup?.stopped === true
    || journal.some(event => event.event === 'artifact_frozen' && event.status === 'completed');
  const successfulTerminal = declared === 'completed' && providerSuccess && frozen
    && (result?.process_exit === 0 || (!object(result) && runnerTerminal?.status === 'completed'));
  let status;
  if (declared === 'completed') {
    status = successfulTerminal ? 'completed' : 'uncertain';
    if (!successfulTerminal) add('runner', 'TERMINAL_EVIDENCE_INCOMPLETE', runnerTerminal ?? {}, { recovery_allowed: false });
  } else if (declared) status = declared;
  else if (result?.outcome_uncertain === true) status = 'uncertain';
  else if (typeof result?.grading_status === 'string') status = result.grading_status === 'completed' ? 'completed' : 'failed';
  else if (result?.version === 'personal-os-evaluator-v1-experimental' || (result?.model_calls === 0 && Array.isArray(result?.tools))) status = 'completed';
  else if (result?.claude_is_error === true || (count(result?.process_exit) !== null && result.process_exit !== 0)) status = 'failed';
  else if (result?.process_exit === 0) {
    status = providerSuccess && frozen ? 'completed' : 'uncertain';
    if (status === 'uncertain') add('runner', providerSuccess ? 'ARTIFACT_FREEZE_UNCONFIRMED' : 'PROVIDER_FINAL_MISSING', {}, { recovery_allowed: false });
  } else if (journal.some(event => event.event === 'preflight_failed')) status = 'failed';
  else if (staleDeadline || staleHeartbeat) status = 'uncertain';
  else if (heartbeatState === 'fresh' || deadlineEvidence) status = 'running';
  else if (journal.length || decisions.length || claudeEvents.length || startedAt) status = 'unknown';
  else status = object(manifest) ? 'prepared' : 'unknown';
  const freezeFailed = result?.cleanup?.stopped === false || result?.artifact_frozen === false && result?.process_exit === 0 && providerSuccess;
  if (freezeFailed) {
    status = 'uncertain'; add('runner', 'ARTIFACT_FREEZE_FAILED', {}, { recovery_allowed: false });
    warn('작업 컨테이너 정지가 확인되지 않았습니다. 모델 응답과 별도로 실행 결과의 고정·정리 상태가 불확실합니다.');
  }
  const observedRunnerStatus = !terminal && providerFinal && status !== 'uncertain' && status !== 'failed' ? 'finalizing' : status;
  if (gateStatus === 'stopped') {
    status = (gateUncertain ?? ['DECISION_FAILED', 'INVALID_DECISION', 'EXECUTION_UNCERTAIN', 'RECORD_FAILED'].includes(gateStopCode)) ? 'uncertain' : 'failed';
    warn('판단 gate가 정지해 추가 구현 행동을 허용하지 않습니다. 공급자 응답·실행기 생존과 별도 상태입니다.');
  }
  const phase = terminal ? 'terminal' : providerFinal ? 'finalizing' : phaseOf(lastRunner?.phase) ?? phaseOf(heartbeat?.phase);
  const eventTimes = [...journal, ...decisions].map(event => iso(event?.recorded_at)).filter(Boolean).sort();
  return { status, terminal, stale: staleDeadline || staleHeartbeat, startedAt,
    execution: { runner_status: observedRunnerStatus, phase, gate_status: gateStatus, gate_stop_code: gateStopCode,
      heartbeat: { at: heartbeatAt, age_ms: heartbeatAge, state: heartbeatState,
        note: 'heartbeat는 기록 작성자의 최근 활동만 나타냅니다. 프로세스 생존·산출물 진척·화면 연결을 증명하지 않습니다.' },
      last_event_at: eventTimes.at(-1) ?? null }, incidents };
}

function monitorProjection(value, role, warn) {
  if (role !== 'monitor' || value == null) return null;
  if (!object(value) || !['ok', 'attention', 'failed', 'uncertain'].includes(value.assessment)) {
    warn('모니터 보고서 형식이 유효하지 않아 판정을 표시하지 않습니다.'); return null;
  }
  let rejected = false;
  const text = (item, max) => {
    if (typeof item !== 'string' || !item.trim() || item.length > max || /[\u0000-\u001f\u007f]/u.test(item)
      || /(?:Bearer\s+\S+|sk-(?:ant-)?[A-Za-z0-9_-]{8,}|(?:API_KEY|AUTHORIZATION)\s*[:=]|\/Users\/|\/home\/|[A-Za-z]:\\)/i.test(item)) {
      rejected = true; return null;
    }
    return item;
  };
  const list = (items, max) => {
    if (!Array.isArray(items)) { rejected = true; return []; }
    if (items.length > max) rejected = true;
    return items.slice(0, max).map(item => text(item, 600)).filter(item => item !== null);
  };
  const report = { assessment: value.assessment, evidence: list(value.evidence, 8),
    next_action: text(value.next_action, 1200), limitations: list(value.limitations, 6) };
  if (rejected) warn('모니터 보고서의 형식·길이·민감 정보 경계에 맞지 않는 문구를 제외했습니다.');
  return report;
}

function emptyProvider(provider, knownZero = false) {
  const expected = knownZero ? 0 : null;
  const output = { provider, model_ids: [],
    calls: { attempted: knownZero ? 0 : null, completed: 0, failed: 0, uncertain: 0,
      observed_model_turns: knownZero ? 0 : null, process_runs: knownZero ? 0 : null,
      semantics: knownZero ? '이 기록은 모델 추론 0회를 명시합니다.' : '모델 호출을 확인할 기록이 없습니다.' },
    tokens: tokenMetrics([], expected),
    costs: Object.fromEntries(['reported_usd', 'billed_usd', 'credits', 'paid_input_tokens'].map(key => [key, metric([], expected)])),
    cost_note: NOTES[provider] };
  output.pricing = provider === 'jev' ? priceJevUsage(output) : priceClaudeUsage({ expected });
  return output;
}

function inferenceFingerprint(event) {
  return JSON.stringify({ status: event.status, model: modelId(event.model),
    input: count(event.usage?.input_tokens), output: count(event.usage?.output_tokens),
    credits: billingNumber(event.billing?.creditsCharged), paid: billingNumber(event.billing?.paidInputTokensUsed) });
}

function jevSummary(decisions, { condition, terminal, noCalls, broken }, warn) {
  const events = decisions.filter(object);
  const inference = events.filter(event => event.provider === 'jev' && ['inference_started', 'inference_finished'].includes(event.event));
  const legacy = events.filter(event => event.event === 'decision' && object(event.decision));
  const legacyInputs = events.filter(event => event.event === 'input' && event.mode === 'jev');
  if (!broken && !inference.length && !legacy.length && events.some(event => event.event === 'model_lookup_failed'
    || event.event === 'budget_blocked' && event.provider === 'jev' && event.outcome_uncertain === false)) return emptyProvider('jev', true);
  if (!inference.length && !legacy.length && !legacyInputs.length && !broken && (noCalls || condition === 'baseline')) return emptyProvider('jev', true);
  const output = emptyProvider('jev');
  let receipts = [], expected = null;
  if (inference.length) {
    const starts = new Set(), finishes = new Map(), conflicts = new Set();
    let invalid = false;
    for (const event of inference) {
      const id = safeId(event.request_id);
      if (!id) { invalid = true; continue; }
      if (event.event === 'inference_started') { starts.add(id); continue; }
      if (!['completed', 'failed', 'uncertain'].includes(event.status)) { invalid = true; conflicts.add(id); continue; }
      if (finishes.has(id) && inferenceFingerprint(finishes.get(id)) !== inferenceFingerprint(event)) conflicts.add(id);
      else finishes.set(id, event);
    }
    const orphaned = [...finishes.keys()].filter(id => !starts.has(id));
    const incomplete = broken || invalid || orphaned.length > 0;
    if (incomplete) warn('Jev 추론 기록 일부가 누락되거나 유효하지 않아 총합을 확정할 수 없습니다.');
    if (conflicts.size) warn('같은 Jev 요청의 종료 기록이 충돌해 사용량과 결과를 확정할 수 없습니다.');
    output.calls.attempted = incomplete ? null : starts.size;
    output.calls.semantics = '고유 전송 시작 기록 수입니다. GET·질문·도구 호출 수가 아니며 서버 수신을 보장하지 않습니다. 미종료 요청은 실행 종료 후 불확실로 표시합니다.';
    const ids = new Set([...starts, ...finishes.keys()]);
    for (const id of ids) {
      const finish = finishes.get(id);
      if (conflicts.has(id) || !finish) {
        if (conflicts.has(id) || terminal) output.calls.uncertain++;
        receipts.push({});
      } else {
        output.calls[finish.status]++;
        receipts.push(finish.status === 'completed' ? finish : {});
      }
    }
    expected = incomplete ? null : ids.size;
  } else {
    const ids = new Map(), conflicts = new Set();
    for (const event of legacy) {
      const id = count(event.decision_id);
      if (id !== null) {
        if (ids.has(id) && inferenceFingerprint(ids.get(id)) !== inferenceFingerprint(event.decision)) conflicts.add(id);
        else ids.set(id, event.decision);
      }
    }
    receipts = [...ids.entries()].filter(([id]) => !conflicts.has(id)).map(([, receipt]) => receipt);
    output.calls.completed = receipts.length;
    output.calls.uncertain = conflicts.size;
    if (conflicts.size) warn('같은 Jev 판단의 이전 형식 응답이 충돌해 해당 사용량을 집계하지 않습니다.');
    output.calls.semantics = '이전 형식의 판단 응답 기록 수입니다. 판단 입력은 POST 전송 증거가 아니므로 전송 시도 총수는 미확인입니다.';
    if (legacy.length || legacyInputs.length) warn('이전 Jev 기록에는 전송 경계가 없어 호출·사용량의 완전한 총합을 확정할 수 없습니다.');
  }
  output.model_ids = [...new Set(receipts.map(event => modelId(event.model)).filter(Boolean))].sort();
  output.tokens = tokenMetrics(receipts.map(event => object(event.usage) ? event.usage : {}), expected, { jev: true });
  output.costs.credits = metric(receipts.map(event => event.billing?.creditsCharged), expected, billingNumber);
  output.costs.paid_input_tokens = metric(receipts.map(event => event.billing?.paidInputTokensUsed), expected, billingNumber);
  // No conversion is documented for Jev usage.cost, credits or paid tokens.
  output.costs.reported_usd = metric([], expected === 0 ? 0 : expected);
  output.costs.billed_usd = metric([], expected === 0 ? 0 : expected);
  output.pricing = priceJevUsage(output);
  return output;
}

function claudeSummary(events, result, { noCalls, broken, stale, providerStatus = null, providerStarted = false }, warn) {
  const finals = events.filter(event => object(event) && event.type === 'result');
  const final = finals.at(-1) ?? null;
  const byMessage = new Map();
  let invalidAssistant = false;
  for (const event of events) {
    if (!object(event) || event.type !== 'assistant') continue;
    const message = event.message;
    if (!object(message) || !safeId(message.id)) { invalidAssistant = true; continue; }
    const before = byMessage.get(message.id) ?? {};
    const merged = { ...before };
    for (const key of ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']) {
      if (count(message.usage?.[key]) !== null) merged[key] = message.usage[key];
    }
    if (object(message.usage?.cache_creation)) merged.cache_creation = {
      ephemeral_5m_input_tokens: count(message.usage.cache_creation.ephemeral_5m_input_tokens),
      ephemeral_1h_input_tokens: count(message.usage.cache_creation.ephemeral_1h_input_tokens),
    };
    merged.model = modelId(message.model) ?? before.model ?? null;
    byMessage.set(message.id, merged);
  }
  const hasProcess = providerStarted || count(result?.process_exit) !== null || (result?.outcome_uncertain === true && !result?.runner_status)
    || final !== null || byMessage.size > 0 || events.some(event => event?.type === 'system' && event?.subtype === 'init');
  if (!hasProcess && noCalls && !broken) return emptyProvider('claude', true);
  const output = emptyProvider('claude');
  output.calls.process_runs = hasProcess ? 1 : null;
  output.calls.observed_model_turns = events.length && !invalidAssistant ? byMessage.size : null;
  output.calls.semantics = 'HTTP 요청·재시도 총수는 미제공입니다. 응답 단계는 고유 assistant message.id 수, 완료·실패·불확실은 CLI 프로세스 결과 수입니다.';
  const isError = providerStatus === 'failed' || final?.is_error === true || result?.claude_is_error === true || (count(result?.process_exit) !== null && result.process_exit !== 0);
  // D-019 runner outcome_uncertain describes the whole run (including gate,
  // freeze and journal), so it cannot override an observed provider success.
  const providerUncertain = providerStatus === 'uncertain' || (providerStatus === null && result?.outcome_uncertain === true && !result?.runner_status);
  const uncertain = (stale && hasProcess) || providerUncertain || (providerStatus === null && hasProcess && !final && count(result?.process_exit) !== null && !object(result?.claude_usage) && !object(result?.claude_model_usage));
  if (uncertain) output.calls.uncertain = 1;
  else if (isError) output.calls.failed = 1;
  else if (providerStatus === 'completed' || final || (result?.process_exit === 0 && (object(result?.claude_usage) || object(result?.claude_model_usage)))) output.calls.completed = 1;
  if (invalidAssistant) warn('Claude 응답 식별자가 없어 일부 응답 단계 수를 확정할 수 없습니다.');
  if (broken) warn('Claude 기록 일부가 누락되거나 유효하지 않아 총합을 확정할 수 없습니다.');
  if (finals.length > 1) warn('여러 Claude 최종 결과 중 마지막 누적 결과만 사용했습니다. 이전 결과와 합산하지 않습니다.');
  const modelUsage = object(final?.modelUsage) ? final.modelUsage
    : object(result?.claude_model_usage) ? result.claude_model_usage : object(result?.modelUsage) ? result.modelUsage : null;
  const usage = object(final?.usage) ? final.usage : object(result?.claude_usage) ? result.claude_usage : null;
  let tokenRows = [], expected = null, camel = false, live = false;
  // Some crash results contain zero placeholders. They cannot erase positive
  // observations preserved in the stream before the crash.
  const modelRows = rowsOf(modelUsage);
  const crashZero = (isError || uncertain) && modelRows.length > 0
    && modelRows.every(row => ['inputTokens', 'outputTokens', 'cacheReadInputTokens', 'cacheCreationInputTokens']
      .every(key => row[key] === 0 || row[key] == null))
    && ([...byMessage.values()].some(row => ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].some(key => row[key] > 0))
      || ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].some(key => count(usage?.[key]) > 0));
  const usageCrashZero = (isError || uncertain) && usage
    && ['input_tokens', 'output_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens']
      .every(key => usage[key] === 0 || usage[key] == null)
    && [...byMessage.values()].some(row => ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].some(key => row[key] > 0));
  if (modelUsage && Object.keys(modelUsage).length && !crashZero) {
    tokenRows = rowsOf(modelUsage); camel = true;
    expected = broken || isError || uncertain ? null : tokenRows.length;
    output.model_ids = Object.keys(modelUsage).map(modelId).filter(Boolean).sort();
  } else if (usage && !usageCrashZero) {
    tokenRows = [usage]; expected = broken || isError || uncertain ? null : 1;
    warn('Claude 최종 modelUsage가 없어 메인 루프 usage만 표시합니다. 하위 에이전트 사용량은 미포함일 수 있습니다.');
  } else {
    tokenRows = [...byMessage.values()]; live = true;
  }
  if (isError || uncertain) warn('Claude 실행 종료가 불완전합니다. 오류 결과의 0으로 이전 관측 사용량을 덮어쓰지 않습니다.');
  if (!output.model_ids.length) output.model_ids = [...new Set([...byMessage.values()].map(row => row.model).filter(Boolean))].sort();
  if (!output.model_ids.length && modelUsage) output.model_ids = Object.keys(modelUsage).map(modelId).filter(Boolean).sort();
  if (!output.model_ids.length && Array.isArray(result?.observed_model_ids)) {
    output.model_ids = [...new Set(result.observed_model_ids.map(modelId).filter(Boolean))].sort();
  }
  output.tokens = tokenMetrics(tokenRows, expected, { camel, live });
  const finalCost = amount(final?.total_cost_usd) ?? amount(result?.claude_reported_cost_usd);
  const incomplete = broken || isError || uncertain;
  if (finalCost !== null && !(incomplete && finalCost === 0)) output.costs.reported_usd = metric([finalCost], incomplete ? null : 1);
  else if (modelUsage && Object.keys(modelUsage).length && !crashZero) output.costs.reported_usd = metric(rowsOf(modelUsage).map(row => row.costUSD), incomplete ? null : Object.keys(modelUsage).length);
  const modelKeys = camel ? Object.keys(modelUsage) : [];
  const fallbackModel = output.model_ids.length === 1 ? output.model_ids[0] : null;
  output.pricing = priceClaudeUsage({ rows: tokenRows.map((row, index) => ({
    model: camel ? modelKeys[index] : live ? row.model : fallbackModel, usage: row,
  })), expected, camel, mainUsage: usage, live });
  return output;
}

function evaluation(result) {
  const empty = { status: 'not_run', passed: null, total: null, note: '모델의 완료 주장과 CLI 종료는 독립 평가 통과 증거가 아닙니다.' };
  if (!object(result)) return empty;
  if (typeof result.grading_status === 'string') {
    const total = count(result.summary?.tests), passed = count(result.summary?.passed);
    const valid = total !== null && passed !== null && passed <= total;
    const status = result.grading_status === 'completed' && valid
      ? result.resolved === true && total > 0 && passed === total && result.reward === 1 ? 'passed' : result.resolved === false ? 'failed' : 'unknown'
      : 'unknown';
    return { status, passed: valid ? passed : null, total: valid ? total : null,
      note: '별도 Docker 채점 결과입니다. 테스트 수집 0건은 0개의 실패 assertion과 구분합니다.' };
  }
  if (result.version === 'personal-os-evaluator-v1-experimental') {
    const criteria = Array.isArray(result.criteria) ? result.criteria : [];
    const required = criteria.filter(item => item?.required === true);
    const passed = required.filter(item => item?.status === 'pass').length;
    return { status: result.full_product_verified === true && required.length > 0 && passed === required.length ? 'passed'
      : result.overall_status === 'fail' ? 'failed' : 'unknown', passed: required.length ? passed : null,
      total: required.length || null, note: 'Personal OS 전체 요구사항 평가입니다. 미실행 브라우저·native 검사를 통과로 간주하지 않습니다.' };
  }
  return empty;
}

function activity(decisions, events, runnerEvents = []) {
  const allowed = new Set(['input', 'decision', 'action_started', 'outcome', 'stopped', 'rejected', 'inference_started', 'inference_finished',
    'model_lookup_started', 'model_lookup', 'model_lookup_failed']);
  const rows = decisions.filter(event => object(event) && allowed.has(event.event)).map(event => ({
    at: iso(event.recorded_at), provider: event.provider === 'jev' ? 'jev' : 'controller', type: event.event,
    status: event.event === 'inference_finished' && ['completed', 'failed', 'uncertain'].includes(event.status) ? event.status
      : event.event === 'stopped' ? 'stopped' : event.event === 'rejected' ? 'rejected' : event.event === 'model_lookup_failed' ? 'failed'
        : event.event === 'outcome' && exitOf(event.exit_code ?? event.outcome?.exit_code) > 0 ? 'failed' : 'observed',
    duration_ms: amount(event.duration_ms ?? event.outcome?.duration_ms), decision_id: count(event.decision_id),
    exit_code: exitOf(event.exit_code ?? event.outcome?.exit_code),
    code: ['stopped', 'rejected', 'model_lookup_failed'].includes(event.event) ? codeOf(event.code) : null }));
  for (const event of events) {
    if (event?.type === 'result') rows.push({ at: iso(event.timestamp), provider: 'claude', type: 'result',
      status: event.is_error === true ? 'failed' : 'completed', duration_ms: amount(event.duration_ms) });
  }
  for (const event of runnerEvents) {
    if (RUNNER_EVENTS.has(event?.event)) rows.push({ at: iso(event.recorded_at), provider: 'controller', type: event.event,
      status: ['running', 'completed', 'failed', 'uncertain'].includes(event.status) ? event.status : 'observed',
      duration_ms: null, decision_id: null, exit_code: null, code: event.code == null ? null : codeOf(event.code) });
  }
  return rows.slice(-100);
}

/** Aggregate parsed local run records only; no I/O, inference, price conversion or raw text escape hatch. */
export function summarizeRun({ id, manifest = null, result = null, decisions = [], claudeEvents = [], issues = [], observedAt = null,
  runnerEvents = [], heartbeat = null, gateState = null, monitorReport = null } = {}) {
  const warnings = new Set();
  const warn = message => warnings.add(message);
  let genericBroken = false;
  if (!object(manifest) && manifest !== null) { manifest = null; genericBroken = true; }
  if (!object(result) && result !== null) { result = null; genericBroken = true; }
  if (!Array.isArray(decisions)) { decisions = []; genericBroken = true; }
  if (!Array.isArray(claudeEvents)) { claudeEvents = []; genericBroken = true; }
  if (!Array.isArray(runnerEvents)) { runnerEvents = []; genericBroken = true; }
  if (!object(heartbeat) && heartbeat !== null) { heartbeat = null; genericBroken = true; }
  if (!object(gateState) && gateState !== null) { gateState = null; genericBroken = true; }
  const invalidDecisions = decisions.some(event => !object(event));
  const invalidClaude = claudeEvents.some(event => !object(event));
  const issueCodes = Array.isArray(issues) ? issues.map(issue => typeof issue === 'string' ? issue : issue?.code).filter(value => typeof value === 'string') : ['invalid_issues'];
  if (runnerEvents.some(event => !object(event))) issueCodes.push('runner_invalid_record');
  const firstRunner = runnerEvents.find(event => event?.event === 'runner_started');
  const identities = Object.fromEntries(['run_id', 'attempt_id', 'group_id'].map(key => [key,
    safeId(manifest?.[key]) ?? safeId(result?.[key]) ?? safeId(firstRunner?.[key]) ?? safeId(gateState?.[key]) ?? safeId(heartbeat?.[key])]));
  const agentRole = roleOf(manifest?.agent_role ?? result?.agent_role ?? firstRunner?.agent_role ?? gateState?.agent_role ?? heartbeat?.agent_role);
  const matchesIdentity = item => !object(item) || Object.entries(identities).every(([key, value]) =>
    value === null || item[key] === undefined || item[key] === value)
      && (agentRole === 'unknown' || item.agent_role === undefined || item.agent_role === agentRole);
  let identityMismatch = false;
  const sameRun = item => { if (matchesIdentity(item)) return true; identityMismatch = true; return false; };
  decisions = decisions.filter(sameRun); runnerEvents = runnerEvents.filter(sameRun);
  if (!sameRun(heartbeat)) heartbeat = null;
  if (!sameRun(gateState)) gateState = null;
  if (!sameRun(result)) result = null;
  if (identityMismatch) { issueCodes.push('identity_mismatch'); warn('다른 실행 식별자의 기록을 제외했습니다. 실행 간 사용량과 상태를 합치지 않습니다.'); }
  const providerIssue = code => !['runner_', 'heartbeat_', 'gate_state_', 'monitor_report_'].some(prefix => code.startsWith(prefix));
  const jevBroken = genericBroken || invalidDecisions || issueCodes.some(code => providerIssue(code) && !code.startsWith('claude_'));
  const claudeBroken = genericBroken || invalidClaude || issueCodes.some(code => providerIssue(code) && !code.startsWith('decisions_'));
  if (genericBroken || invalidDecisions || invalidClaude || issueCodes.length) warn('일부 원본 기록이 없거나 읽기·형식 검증이 완료되지 않았습니다. 미확인 값을 0으로 바꾸지 않습니다.');
  const noCalls = result?.model_calls === 0 && !jevBroken && !claudeBroken;
  const workload = ['e2e-swe', 'personal-os', 'smoke', 'monitoring'].includes(manifest?.workload) ? manifest.workload
    : result?.adapter === 'jev-router-standalone-docker-v1' ? 'e2e-swe'
      : result?.version === 'personal-os-evaluator-v1-experimental' ? 'personal-os'
        : noCalls && Array.isArray(result?.tools) ? 'smoke' : 'unknown';
  const condition = ['jev', 'baseline', 'monitor'].includes(manifest?.mode) ? manifest.mode
    : manifest?.evidence_kind === 'control' || result?.evidence_kind === 'control' ? 'control' : 'unknown';
  const kind = ['live', 'synthetic', 'control'].includes(manifest?.evidence_kind) ? manifest.evidence_kind
    : ['live', 'synthetic', 'control'].includes(result?.evidence_kind) ? result.evidence_kind : 'unknown';
  const projection = executionProjection({ manifest, result, decisions, claudeEvents, runnerEvents, heartbeat, gateState,
    observedAt, issues: issueCodes }, warn);
  let { status } = projection;
  const preflightStopped = runnerEvents.some(event => event?.event === 'preflight_failed')
    && !runnerEvents.some(event => event?.event === 'provider_started') && !issueCodes.length;
  const jev = jevSummary(decisions, { condition, terminal: projection.terminal || projection.stale,
    noCalls: noCalls || condition === 'monitor' || preflightStopped, broken: jevBroken }, warn);
  const claude = claudeSummary(claudeEvents, result, { noCalls: noCalls || preflightStopped, broken: claudeBroken,
    stale: projection.stale && !claudeEvents.some(event => event?.type === 'result'),
    providerStatus: runnerEvents.filter(event => event?.event === 'provider_finished').at(-1)?.status ?? null,
    providerStarted: runnerEvents.some(event => event?.event === 'provider_started') }, warn);
  if (kind === 'unknown') warn('실측·합성·대조군 구분 근거가 없어 unknown으로 유지합니다.');
  if (jev.calls.uncertain && status === 'completed') status = 'uncertain';
  if (typeof result?.grading_status === 'string' && kind === 'unknown') warn('평가기의 모델 호출 0회는 제출물 생성 출처가 아닙니다. 생성 실행 연결과 evidence kind가 필요합니다.');
  const names = { 'e2e-swe': 'E2E-SWE', 'personal-os': 'Personal OS', smoke: '연결 smoke', monitoring: '벤치마크 모니터', unknown: '미분류 실행' };
  const limit = key => object(manifest) && Object.hasOwn(manifest, key) && manifest[key] === null ? 'unlimited'
    : (key === 'max_decisions' ? count(manifest?.[key]) : amount(manifest?.[key])) > 0 ? 'bounded' : 'unknown';
  const evaluated = evaluation(result);
  evaluated.evaluates_run_id = safeId(result?.evaluates_run_id);
  evaluated.artifact_sha256 = typeof result?.artifact_sha256 === 'string' && /^[a-f0-9]{64}$/.test(result.artifact_sha256) ? result.artifact_sha256 : null;
  const monitor = monitorProjection(monitorReport, agentRole, warn);
  return { id: safeId(id) ?? 'unknown-run', ...identities, agent_role: agentRole,
    title: names[workload], workload, condition, kind, status,
    started_at: projection.startedAt ?? iso(result?.started_at),
    duration_ms: amount(result?.duration_ms) ?? (amount(result?.elapsed_sec) === null ? null : amount(result.elapsed_sec * 1000)),
    jev_budget: budgetProjection(manifest, decisions),
    limits: { jev_max_calls: count(manifest?.max_decisions), wall_timeout_seconds: amount(manifest?.wall_timeout_seconds),
      claude_max_budget_usd: amount(manifest?.claude_max_budget_usd), jev_call_limit: limit('max_decisions'),
      claude_budget_limit: limit('claude_max_budget_usd') }, execution: projection.execution, incidents: projection.incidents, monitor_report: monitor,
    providers: [jev, claude], evaluation: evaluated, activity: activity(decisions, claudeEvents, runnerEvents), warnings: [...warnings] };
}
