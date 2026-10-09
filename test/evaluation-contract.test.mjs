import test from 'node:test';
import assert from 'node:assert/strict';
import { EvaluationInputError, validateEvaluation } from '../src/evaluation/contract.mjs';

function fixture() {
  return {
    manifest: {
      schema_version: 'jev-eval/v1', dataset_id: 'contract-fixture', dataset_version: '1', provenance: 'synthetic',
      trials: [{ trial_id: 'trial-1', task_id: 'task-1', expected_request_count: 1 }],
      cases: [
        { case_id: 'category', trial_id: 'trial-1', kind: 'categorical', labels: ['a', 'b'], reference: { accepted_answers: ['a'] } },
        { case_id: 'binary', trial_id: 'trial-1', kind: 'binary', labels: null, reference: { accepted_answers: [false] } },
      ],
    },
    records: [
      { type: 'decision', case_id: 'category', execution_status: 'completed', decision_status: 'decided', answer: 'a', probabilities: { a: 0.8, b: 0.2 }, auto_accepted: true, constraint_pass: true, decision_e2e_ms: 0 },
      { type: 'decision', case_id: 'binary', execution_status: 'completed', decision_status: 'decided', answer: false, probabilities: { false: 0.9, true: 0.1 }, auto_accepted: false, constraint_pass: null, decision_e2e_ms: null },
      { type: 'request', request_id: 'request-1', trial_id: 'trial-1', phase: 'decision', status: 'completed', response_received: true, schema_valid: true, duration_ms: 1.5, cost: { usd: null, jev_tokens: 0, jev_credits: 1.25 }, tokens: { input: 0, output: null } },
      { type: 'trial', trial_id: 'trial-1', outcome: 'success', duration_ms: null },
    ],
  };
}

function valid(input) {
  return validateEvaluation(input.manifest, input.records);
}

function invalid(mutate, expectedPath) {
  const input = fixture();
  mutate(input);
  assert.throws(() => valid(input), (error) => {
    assert.ok(error instanceof EvaluationInputError);
    assert.equal(error.name, 'EvaluationInputError');
    assert.equal(error.code, 'INVALID_EVALUATION');
    if (expectedPath) assert.equal(error.path, expectedPath);
    return true;
  });
}

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

test('accepts the complete contract without changing or replacing either input', () => {
  const input = freeze(fixture());
  const before = JSON.stringify(input);
  const result = valid(input);
  assert.equal(result.manifest, input.manifest);
  assert.equal(result.records, input.records);
  assert.equal(JSON.stringify(input), before);
});

test('empty manifests and missing decision/trial/request records remain valid', () => {
  const input = fixture();
  input.records = [];
  valid(input);
  input.manifest.cases = [];
  valid(input);
  input.manifest.trials = [];
  valid(input);
});

test('shared task IDs, multiple accepted answers and missing references are allowed', () => {
  const input = fixture();
  input.manifest.trials.push({ trial_id: 'trial-2', task_id: 'task-1', expected_request_count: null });
  input.manifest.cases[0].reference.accepted_answers = ['a', 'b'];
  input.manifest.cases[1].reference.accepted_answers = [true, false];
  valid(input);
  input.manifest.cases.forEach((evaluationCase) => { evaluationCase.reference = null; });
  valid(input);
});

test('rejects unsupported versions, provenance, and non-array top-level collections', () => {
  invalid(({ manifest }) => { manifest.schema_version = 'jev-eval/v2'; });
  invalid(({ manifest }) => { manifest.provenance = 'estimated'; });
  for (const value of [null, {}, 'invalid']) {
    invalid((input) => { input.manifest = value; });
    invalid((input) => { input.records = value; });
    invalid(({ manifest }) => { manifest.cases = value; });
    invalid(({ manifest }) => { manifest.trials = value; });
  }
});

test('all identifiers, labels and dataset version must have non-whitespace content', () => {
  const targets = [
    (input, value) => { input.manifest.dataset_id = value; },
    (input, value) => { input.manifest.dataset_version = value; },
    (input, value) => { input.manifest.trials[0].trial_id = value; },
    (input, value) => { input.manifest.trials[0].task_id = value; },
    (input, value) => { input.manifest.cases[0].case_id = value; },
    (input, value) => { input.manifest.cases[0].labels[0] = value; },
    (input, value) => { input.records[2].request_id = value; },
  ];
  for (const target of targets) for (const value of ['', ' \n\t ', null, 1]) invalid((input) => target(input, value));
  const input = fixture();
  input.manifest.dataset_id = ' preserved whitespace ';
  valid(input);
  assert.equal(input.manifest.dataset_id, ' preserved whitespace ');
});

test('requires exact fields at every object level, including explicit nullable fields', () => {
  const targets = [
    (input) => input.manifest,
    (input) => input.manifest.trials[0],
    (input) => input.manifest.cases[0],
    (input) => input.manifest.cases[0].reference,
    (input) => input.records[0],
    (input) => input.records[2],
    (input) => input.records[2].cost,
    (input) => input.records[2].tokens,
    (input) => input.records[3],
  ];
  for (const target of targets) {
    const keys = Object.keys(target(fixture()));
    for (const key of keys) invalid((input) => { delete target(input)[key]; });
    invalid((input) => { target(input).prompt = 'forbidden extra content'; });
  }
  invalid((input) => { input.records[2].cost.usd = undefined; });
  invalid((input) => { input.records[0].probabilities = undefined; });
});

test('rejects duplicate manifest cases/trials and unregistered case trials', () => {
  invalid(({ manifest }) => { manifest.trials.push({ ...manifest.trials[0] }); }, 'manifest.trials[1].trial_id');
  invalid(({ manifest }) => { manifest.cases.push({ ...manifest.cases[0] }); }, 'manifest.cases[2].case_id');
  invalid(({ manifest }) => { manifest.cases[0].trial_id = 'unregistered'; }, 'manifest.cases[0].trial_id');
});

test('rejects duplicate record IDs and all unregistered references', () => {
  for (const index of [0, 2, 3]) invalid(({ records }) => { records.push({ ...records[index] }); });
  invalid(({ records }) => { records[0].case_id = 'unregistered'; }, 'records[0].case_id');
  invalid(({ records }) => { records[2].trial_id = 'unregistered'; }, 'records[2].trial_id');
  invalid(({ records }) => { records[3].trial_id = 'unregistered'; }, 'records[3].trial_id');
});

test('categorical labels and references are typed unique sets with allowed members', () => {
  for (const labels of [null, [], ['a'], ['a', 'a'], ['a', false]]) invalid(({ manifest }) => { manifest.cases[0].labels = labels; });
  for (const accepted of [[], ['a', 'a'], ['c'], [true], null]) invalid(({ manifest }) => { manifest.cases[0].reference.accepted_answers = accepted; });
  invalid(({ manifest }) => { manifest.cases[0].kind = 'ranking'; });
  invalid(({ manifest }) => { manifest.cases[0].reference = []; });
});

test('binary cases require null labels and boolean references/answers', () => {
  invalid(({ manifest }) => { manifest.cases[1].labels = ['false', 'true']; });
  for (const accepted of [[0], ['false'], [false, false], []]) invalid(({ manifest }) => { manifest.cases[1].reference.accepted_answers = accepted; });
  for (const value of ['false', 0, null]) invalid(({ records }) => { records[1].answer = value; });
  for (const value of ['c', false, null]) invalid(({ records }) => { records[0].answer = value; });
});

test('probability maps cover exactly the allowed labels and preserve zero/one', () => {
  for (const probabilities of [{ a: 1 }, { a: 1, b: 0, c: 0 }, [0.8, 0.2], 'invalid']) invalid(({ records }) => { records[0].probabilities = probabilities; });
  invalid(({ records }) => { records[1].probabilities = { false: 1, yes: 0 }; });
  const input = fixture();
  input.records[0].probabilities = { a: 0, b: 1 };
  input.records[1].probabilities = { true: 1, false: 0 };
  valid(input); // A selected answer does not have to be the probability argmax.
  input.records[0].probabilities = null;
  valid(input);
});

test('probabilities reject nonnumeric/nonfinite/out-of-range values and invalid sums', () => {
  for (const value of [-0.01, 1.01, NaN, Infinity, -Infinity, '0.8', null, undefined]) invalid(({ records }) => { records[0].probabilities.a = value; });
  for (const probabilities of [{ a: 0.8, b: 0.1 }, { a: 0.8, b: 0.200002 }, { a: 0.8, b: 0.199998 }]) invalid(({ records }) => { records[0].probabilities = probabilities; });
});

test('sum tolerance does not silently normalize probability values', () => {
  for (const b of [0.2000005, 0.1999995]) {
    const input = fixture();
    input.records[0].probabilities.b = b;
    freeze(input);
    valid(input);
    assert.equal(input.records[0].probabilities.b, b);
  }
});

test('prototype-like identifiers and label names remain legitimate data', () => {
  const input = fixture();
  input.manifest.trials[0].trial_id = '__proto__';
  input.manifest.cases.forEach((evaluationCase) => { evaluationCase.trial_id = '__proto__'; });
  input.records[2].trial_id = '__proto__';
  input.records[3].trial_id = '__proto__';
  input.manifest.cases[0].labels = ['__proto__', 'constructor'];
  input.manifest.cases[0].reference.accepted_answers = ['__proto__'];
  input.records[0].answer = '__proto__';
  input.records[0].probabilities = JSON.parse('{"__proto__":0.75,"constructor":0.25}');
  valid(input);
  assert.equal(Object.getPrototypeOf(input.records[0].probabilities), Object.prototype);
});

test('abstentions require completed execution, null answer/probabilities and no adoption', () => {
  const abstain = (input) => Object.assign(input.records[0], { decision_status: 'abstained', answer: null, probabilities: null, auto_accepted: false, constraint_pass: null });
  const input = fixture();
  abstain(input);
  valid(input);
  for (const field of ['answer', 'probabilities', 'auto_accepted']) invalid((candidate) => { abstain(candidate); candidate.records[0][field] = fixture().records[0][field]; });
  for (const status of ['failed', 'unknown', 'not_called']) invalid((candidate) => { abstain(candidate); candidate.records[0].execution_status = status; });
});

test('unevaluated decisions preserve failed/unknown/not_called statuses and cannot be completed', () => {
  for (const execution_status of ['failed', 'unknown', 'not_called']) {
    const input = fixture();
    Object.assign(input.records[0], { execution_status, decision_status: 'not_evaluated', answer: null, probabilities: null, auto_accepted: false, constraint_pass: null });
    valid(input);
    for (const field of ['answer', 'probabilities', 'auto_accepted']) invalid((candidate) => { candidate.records[0] = { ...input.records[0], [field]: fixture().records[0][field] }; });
  }
  invalid(({ records }) => { Object.assign(records[0], { decision_status: 'not_evaluated', answer: null, probabilities: null, auto_accepted: false, constraint_pass: null }); });
  for (const execution_status of ['failed', 'unknown', 'not_called']) invalid(({ records }) => { records[0].execution_status = execution_status; });
});

test('automatic acceptance and constraint results retain separate meanings', () => {
  for (const constraint_pass of [false, true, null]) {
    const input = fixture();
    input.records[0].constraint_pass = constraint_pass;
    valid(input);
  }
  for (const value of [false, true]) invalid(({ records }) => { records[1].constraint_pass = value; });
  invalid(({ records }) => { records[0].auto_accepted = 'true'; });
  invalid(({ records }) => { records[0].constraint_pass = 'pass'; });
});

test('every duration and cost unit accepts zero/null but rejects invalid numbers', () => {
  const targets = [
    (records, value) => { records[0].decision_e2e_ms = value; },
    (records, value) => { records[2].duration_ms = value; },
    (records, value) => { records[3].duration_ms = value; },
    ...['usd', 'jev_tokens', 'jev_credits'].map((unit) => (records, value) => { records[2].cost[unit] = value; }),
  ];
  for (const target of targets) {
    for (const value of [0, null, 0.25]) { const input = fixture(); target(input.records, value); valid(input); }
    for (const value of [-1, Infinity, NaN, '1', undefined]) invalid(({ records }) => target(records, value));
  }
});

test('token counts and expected request counts must be nonnegative safe integers or null', () => {
  const targets = [
    (input, value) => { input.manifest.trials[0].expected_request_count = value; },
    (input, value) => { input.records[2].tokens.input = value; },
    (input, value) => { input.records[2].tokens.output = value; },
  ];
  for (const target of targets) {
    for (const value of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, '1', undefined]) invalid((input) => target(input, value));
    for (const value of [null, 1, Number.MAX_SAFE_INTEGER]) { const input = fixture(); target(input, value); valid(input); }
  }
});

test('request status and response schema facts must be consistent', () => {
  invalid(({ records }) => { records[2].response_received = false; });
  invalid(({ records }) => { records[2].schema_valid = false; });
  invalid(({ records }) => { records[2].schema_valid = null; });
  invalid(({ records }) => { records[2].response_received = 'true'; });
  invalid(({ records }) => { records[2].schema_valid = 'true'; });
  for (const status of ['failed', 'unknown']) {
    const input = fixture();
    Object.assign(input.records[2], { status, response_received: false, schema_valid: null });
    valid(input);
    for (const schema_valid of [true, false]) invalid(({ records }) => { Object.assign(records[2], { status, response_received: false, schema_valid }); });
    for (const schema_valid of [null, false, true]) {
      Object.assign(input.records[2], { response_received: true, schema_valid });
      valid(input);
    }
  }
});

test('all request phases and trial outcomes are supported; unknown enums are rejected', () => {
  for (const phase of ['question_generation', 'decision', 'execution', 'recheck', 'evaluation']) { const input = fixture(); input.records[2].phase = phase; valid(input); }
  for (const outcome of ['success', 'failure', 'unknown', 'not_run', 'grader_error']) { const input = fixture(); input.records[3].outcome = outcome; valid(input); }
  for (const [index, field] of [[0, 'execution_status'], [0, 'decision_status'], [2, 'phase'], [2, 'status'], [3, 'outcome'], [0, 'type']]) invalid(({ records }) => { records[index][field] = 'unsupported'; });
});

test('expected request counts include evaluation calls and reject only excess records', () => {
  const input = fixture();
  input.manifest.trials[0].expected_request_count = 2;
  valid(input); // Missing requests are retained for downstream completeness accounting.
  input.records.push({ ...input.records[2], request_id: 'judge', phase: 'evaluation' });
  valid(input);
  invalid((candidate) => { candidate.records.push({ ...candidate.records[2], request_id: 'judge', phase: 'evaluation' }); }, 'manifest.trials[0].expected_request_count');
  input.manifest.trials[0].expected_request_count = null;
  valid(input);
  invalid(({ manifest }) => { manifest.trials[0].expected_request_count = 0; });
  input.records = [];
  input.manifest.trials[0].expected_request_count = 0;
  valid(input);
});

test('request completeness is checked independently for each trial', () => {
  invalid(({ manifest, records }) => {
    manifest.trials[0].expected_request_count = 2;
    manifest.trials.push({ trial_id: 'trial-2', task_id: 'task-1', expected_request_count: 0 });
    records[2].trial_id = 'trial-2';
  }, 'manifest.trials[1].expected_request_count');
});

test('malformed inputs never include input values or dynamic keys in errors', () => {
  const secret = 'synthetic-secret-not-a-real-key';
  const mutations = [
    ({ manifest }) => { manifest[secret] = secret; },
    ({ records }) => { records[0].answer = secret; },
    ({ records }) => { records[2].trial_id = secret; },
    ({ manifest, records }) => {
      manifest.cases[0].labels = ['a', secret];
      records[0].probabilities = { a: 0.8, [secret]: secret };
    },
  ];
  for (const mutate of mutations) {
    const input = fixture();
    mutate(input);
    assert.throws(() => valid(input), (error) => {
      assert.ok(error instanceof EvaluationInputError);
      assert.equal(`${error.stack}${JSON.stringify(error)}`.includes(secret), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('non-JSON objects, symbol properties and accessors fail without invoking getters', () => {
  invalid(({ records }) => { records[2].cost = new Date(); });
  invalid(({ records }) => { records[0][Symbol('private')] = 'private'; });
  invalid(({ records }) => { Object.defineProperty(records[0], 'answer', { enumerable: true, get() { throw new Error('must not invoke'); } }); });
  const input = fixture();
  input.records[0].probabilities = Object.assign(Object.create(null), { a: 0.8, b: 0.2 });
  valid(input);
});

test('sparse arrays, array metadata and array getters are rejected as non-JSON input', () => {
  invalid(({ manifest }) => { delete manifest.cases[0]; });
  invalid(({ records }) => { records.prompt = 'forbidden metadata'; });
  invalid(({ manifest }) => { manifest.cases[0].labels[Symbol('private')] = 'private'; });
  invalid(({ records }) => { Object.defineProperty(records, '0', { enumerable: true, get() { throw new Error('must not invoke'); } }); });
});
