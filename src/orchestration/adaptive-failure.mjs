const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const codes = value => typeof value === 'string' && /^[A-Z0-9_]{1,100}$/.test(value);
const stages = new Set(['catalog', 'split', 'relations', 'repair', 'repair_owners', 'profiles', 'worker', 'planning', 'execution', 'preflight', 'budget']);
const categories = new Set(['context_limit', 'model_input_limit', 'request_size', 'schema', 'request_validation',
  'model', 'rate_limit', 'authentication', 'billing', 'not_found', 'conflict', 'rate_or_capacity',
  'upstream_unavailable', 'upstream_timeout', 'unknown']);

/** Missing normalized answers do not invalidate an explicit known HTTP rejection. */
export function adaptiveOutcomeUncertain(value, {fallback = false} = {}) {
  if (value?.outcome_uncertain === true || value?.outcomeUncertain === true || value?.uncertain === true
      || ['unknown', 'uncertain', 'interrupted', 'timeout'].includes(value?.status)) return true;
  if (value?.outcome_uncertain === false || value?.outcomeUncertain === false || value?.uncertain === false) return false;
  return fallback;
}

/** Only bounded classification fields cross layers; never copy error text, bodies or headers. */
export function adaptiveTerminalCause(value, {stage = 'execution', fallbackCode = 'ADAPTIVE_RUN_FAILED', outcome_uncertain} = {}) {
  const previous = object(value?.terminal_cause) ? value.terminal_cause : {};
  const code = [previous.code, value?.code, value?.reason, fallbackCode].find(codes) ?? 'ADAPTIVE_RUN_FAILED';
  const httpStatus = [previous.http_status, value?.http_status, value?.status]
    .find(status => Number.isInteger(status) && status >= 100 && status <= 599) ?? null;
  const category = [previous.category, value?.error_diagnostics?.category]
    .find(category => categories.has(category)) ?? null;
  return {stage: stages.has(previous.stage) ? previous.stage : stages.has(stage) ? stage : 'execution', code,
    http_status: httpStatus, category,
    outcome_uncertain: typeof outcome_uncertain === 'boolean' ? outcome_uncertain
      : adaptiveOutcomeUncertain(value, {fallback: adaptiveOutcomeUncertain(previous)})};
}
