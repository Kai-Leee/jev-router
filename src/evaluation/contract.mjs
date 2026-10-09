const PROBABILITY_SUM_TOLERANCE = 1e-6;
const MANIFEST_FIELDS = ['schema_version', 'dataset_id', 'dataset_version', 'provenance', 'trials', 'cases'];
const TRIAL_FIELDS = ['trial_id', 'task_id', 'expected_request_count'];
const CASE_FIELDS = ['case_id', 'trial_id', 'kind', 'labels', 'reference'];
const DECISION_FIELDS = ['type', 'case_id', 'execution_status', 'decision_status', 'answer', 'probabilities', 'auto_accepted', 'constraint_pass', 'decision_e2e_ms'];
const REQUEST_FIELDS = ['type', 'request_id', 'trial_id', 'phase', 'status', 'response_received', 'schema_valid', 'duration_ms', 'cost', 'tokens'];
const TRIAL_RECORD_FIELDS = ['type', 'trial_id', 'outcome', 'duration_ms'];

/** Validation errors contain only fixed descriptions and structural field paths. */
export class EvaluationInputError extends Error {
  constructor(path, description) {
    super(`${path}: ${description}`);
    this.name = 'EvaluationInputError';
    this.code = 'INVALID_EVALUATION';
    this.path = path;
  }
}

function requireCondition(condition, path, description) {
  if (!condition) throw new EvaluationInputError(path, description);
}

function object(value, path) {
  requireCondition(value !== null && typeof value === 'object' && !Array.isArray(value), path, 'must be a JSON object.');
  const prototype = Object.getPrototypeOf(value);
  requireCondition(prototype === Object.prototype || prototype === null, path, 'must be a JSON object.');
  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    requireCondition(typeof key === 'string' && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), path, 'must contain only JSON data properties.');
  }
}

function fields(value, expected, path) {
  object(value, path);
  const keys = Object.keys(value);
  requireCondition(keys.length === expected.length && expected.every((key) => Object.hasOwn(value, key)), path, 'must contain exactly the required fields.');
}

function array(value, path) {
  requireCondition(Array.isArray(value), path, 'must be an array.');
  const keys = Reflect.ownKeys(value);
  requireCondition(keys.length === value.length + 1, path, 'must be a dense JSON array without extra properties.');
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    requireCondition(descriptor !== undefined && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), path, 'must contain only JSON data elements.');
  }
}

function string(value, path) {
  requireCondition(typeof value === 'string' && value.trim().length > 0, path, 'must be a nonempty string.');
}

function oneOf(value, values, path) {
  requireCondition(values.includes(value), path, 'must be an allowed value.');
}

function boolean(value, path) {
  requireCondition(typeof value === 'boolean', path, 'must be a boolean.');
}

function nullableBoolean(value, path) {
  requireCondition(value === null || typeof value === 'boolean', path, 'must be a boolean or null.');
}

function nullableNumber(value, path, integer = false, safe = false) {
  requireCondition(value === null || (
    typeof value === 'number' && Number.isFinite(value) && value >= 0 &&
    (!integer || Number.isInteger(value)) && (!safe || Number.isSafeInteger(value))
  ), path, safe ? 'must be a nonnegative safe integer or null.' : integer ? 'must be a nonnegative integer or null.' : 'must be a nonnegative finite number or null.');
}

function register(map, id, value, path) {
  string(id, path);
  requireCondition(!map.has(id), path, 'must be unique.');
  map.set(id, value);
}

function registered(map, id, path) {
  string(id, path);
  requireCondition(map.has(id), path, 'must refer to a registered identifier.');
  return map.get(id);
}

function answer(value, evaluationCase, path) {
  if (evaluationCase.kind === 'binary') boolean(value, path);
  else requireCondition(typeof value === 'string' && evaluationCase.labels.includes(value), path, 'must be an allowed label.');
}

function validateCase(evaluationCase, path, trials, cases) {
  fields(evaluationCase, CASE_FIELDS, path);
  register(cases, evaluationCase.case_id, evaluationCase, `${path}.case_id`);
  registered(trials, evaluationCase.trial_id, `${path}.trial_id`);
  oneOf(evaluationCase.kind, ['categorical', 'binary'], `${path}.kind`);
  if (evaluationCase.kind === 'categorical') {
    array(evaluationCase.labels, `${path}.labels`);
    requireCondition(evaluationCase.labels.length >= 2, `${path}.labels`, 'must contain at least two labels.');
    for (let i = 0; i < evaluationCase.labels.length; i++) string(evaluationCase.labels[i], `${path}.labels[${i}]`);
    requireCondition(new Set(evaluationCase.labels).size === evaluationCase.labels.length, `${path}.labels`, 'must contain unique labels.');
  } else {
    requireCondition(evaluationCase.labels === null, `${path}.labels`, 'must be null for a binary case.');
  }
  if (evaluationCase.reference !== null) {
    const referencePath = `${path}.reference`;
    fields(evaluationCase.reference, ['accepted_answers'], referencePath);
    const accepted = evaluationCase.reference.accepted_answers;
    array(accepted, `${referencePath}.accepted_answers`);
    requireCondition(accepted.length > 0, `${referencePath}.accepted_answers`, 'must contain at least one accepted answer.');
    for (let i = 0; i < accepted.length; i++) answer(accepted[i], evaluationCase, `${referencePath}.accepted_answers[${i}]`);
    requireCondition(new Set(accepted).size === accepted.length, `${referencePath}.accepted_answers`, 'must contain unique accepted answers.');
  }
}

function validateProbabilities(probabilities, evaluationCase, path) {
  if (probabilities === null) return;
  const labels = evaluationCase.kind === 'binary' ? ['false', 'true'] : evaluationCase.labels;
  fields(probabilities, labels, path);
  let sum = 0;
  for (const label of labels) {
    const probability = probabilities[label];
    // Label text is input data and must never become part of an error path.
    requireCondition(typeof probability === 'number' && Number.isFinite(probability) && probability >= 0 && probability <= 1, path, 'must contain finite probabilities between zero and one.');
    sum += probability;
  }
  requireCondition(Math.abs(sum - 1) <= PROBABILITY_SUM_TOLERANCE, path, 'probability sum must be within 1e-6 of one.');
}

function validateDecision(record, path, cases, decisions) {
  fields(record, DECISION_FIELDS, path);
  const evaluationCase = registered(cases, record.case_id, `${path}.case_id`);
  register(decisions, record.case_id, record, `${path}.case_id`);
  oneOf(record.execution_status, ['completed', 'failed', 'unknown', 'not_called'], `${path}.execution_status`);
  oneOf(record.decision_status, ['decided', 'abstained', 'not_evaluated'], `${path}.decision_status`);
  boolean(record.auto_accepted, `${path}.auto_accepted`);
  nullableBoolean(record.constraint_pass, `${path}.constraint_pass`);
  nullableNumber(record.decision_e2e_ms, `${path}.decision_e2e_ms`);

  if (record.decision_status === 'decided') {
    requireCondition(record.execution_status === 'completed', `${path}.execution_status`, 'must be completed for a decided answer.');
    answer(record.answer, evaluationCase, `${path}.answer`);
    validateProbabilities(record.probabilities, evaluationCase, `${path}.probabilities`);
  } else {
    requireCondition(record.answer === null, `${path}.answer`, 'must be null without a decided answer.');
    requireCondition(record.probabilities === null, `${path}.probabilities`, 'must be null without a decided answer.');
    requireCondition(!record.auto_accepted, `${path}.auto_accepted`, 'must be false without a decided answer.');
    if (record.decision_status === 'abstained') {
      requireCondition(record.execution_status === 'completed', `${path}.execution_status`, 'must be completed for an abstention.');
    } else {
      requireCondition(record.execution_status !== 'completed', `${path}.execution_status`, 'must not be completed for an unevaluated decision.');
    }
  }
  requireCondition(record.auto_accepted || record.constraint_pass === null, `${path}.constraint_pass`, 'must be null without automatic acceptance.');
}

function validateRequest(record, path, trials, requests, requestCounts) {
  fields(record, REQUEST_FIELDS, path);
  register(requests, record.request_id, record, `${path}.request_id`);
  registered(trials, record.trial_id, `${path}.trial_id`);
  oneOf(record.phase, ['question_generation', 'decision', 'execution', 'recheck', 'evaluation'], `${path}.phase`);
  oneOf(record.status, ['completed', 'failed', 'unknown'], `${path}.status`);
  boolean(record.response_received, `${path}.response_received`);
  nullableBoolean(record.schema_valid, `${path}.schema_valid`);
  nullableNumber(record.duration_ms, `${path}.duration_ms`);
  requireCondition(record.response_received || record.schema_valid === null, `${path}.schema_valid`, 'must be null when no response was received.');
  if (record.status === 'completed') {
    requireCondition(record.response_received && record.schema_valid === true, path, 'completed requests require a received, schema-valid response.');
  }
  fields(record.cost, ['usd', 'jev_tokens', 'jev_credits'], `${path}.cost`);
  for (const unit of ['usd', 'jev_tokens', 'jev_credits']) nullableNumber(record.cost[unit], `${path}.cost.${unit}`);
  fields(record.tokens, ['input', 'output'], `${path}.tokens`);
  for (const direction of ['input', 'output']) nullableNumber(record.tokens[direction], `${path}.tokens.${direction}`, true, true);
  requestCounts.set(record.trial_id, requestCounts.get(record.trial_id) + 1);
}

/** Validate the offline v1 contract without changing or normalizing the input. */
export function validateEvaluation(manifest, records) {
  fields(manifest, MANIFEST_FIELDS, 'manifest');
  requireCondition(manifest.schema_version === 'jev-eval/v1', 'manifest.schema_version', 'must be the supported schema version.');
  string(manifest.dataset_id, 'manifest.dataset_id');
  string(manifest.dataset_version, 'manifest.dataset_version');
  oneOf(manifest.provenance, ['synthetic', 'observed'], 'manifest.provenance');
  array(manifest.trials, 'manifest.trials');
  array(manifest.cases, 'manifest.cases');
  array(records, 'records');

  const trials = new Map();
  const cases = new Map();
  const requestCounts = new Map();
  for (let i = 0; i < manifest.trials.length; i++) {
    const trial = manifest.trials[i];
    const path = `manifest.trials[${i}]`;
    fields(trial, TRIAL_FIELDS, path);
    register(trials, trial.trial_id, trial, `${path}.trial_id`);
    string(trial.task_id, `${path}.task_id`);
    nullableNumber(trial.expected_request_count, `${path}.expected_request_count`, true, true);
    requestCounts.set(trial.trial_id, 0);
  }
  for (let i = 0; i < manifest.cases.length; i++) validateCase(manifest.cases[i], `manifest.cases[${i}]`, trials, cases);

  const decisions = new Map();
  const requests = new Map();
  const trialRecords = new Map();
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const path = `records[${i}]`;
    object(record, path);
    oneOf(record.type, ['decision', 'request', 'trial'], `${path}.type`);
    if (record.type === 'decision') validateDecision(record, path, cases, decisions);
    else if (record.type === 'request') validateRequest(record, path, trials, requests, requestCounts);
    else {
      fields(record, TRIAL_RECORD_FIELDS, path);
      registered(trials, record.trial_id, `${path}.trial_id`);
      register(trialRecords, record.trial_id, record, `${path}.trial_id`);
      oneOf(record.outcome, ['success', 'failure', 'unknown', 'not_run', 'grader_error'], `${path}.outcome`);
      nullableNumber(record.duration_ms, `${path}.duration_ms`);
    }
  }
  for (let i = 0; i < manifest.trials.length; i++) {
    const trial = manifest.trials[i];
    requireCondition(trial.expected_request_count === null || requestCounts.get(trial.trial_id) <= trial.expected_request_count, `manifest.trials[${i}].expected_request_count`, 'must not be less than the observed request count.');
  }
  return { manifest, records };
}
