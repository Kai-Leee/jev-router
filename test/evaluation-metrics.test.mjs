import assert from 'node:assert/strict';
import test from 'node:test';
import {evaluateMetrics} from '../src/evaluation/metrics.mjs';

const makeTrial = (trial_id = 't1', expected_request_count = 0, task_id = 'task') =>
  ({trial_id, task_id, expected_request_count});
const categorical = (case_id, accepted = ['a'], labels = ['a', 'b'], trial_id = 't1') => ({
  case_id, trial_id, kind: 'categorical', labels,
  reference: accepted === null ? null : {accepted_answers: accepted},
});
const binary = (case_id, accepted = [true], trial_id = 't1') => ({
  case_id, trial_id, kind: 'binary', labels: null,
  reference: accepted === null ? null : {accepted_answers: accepted},
});
const manifest = (cases = [], trials = [makeTrial()]) => ({
  schema_version: 'jev-eval/v1', dataset_id: 'arithmetic', dataset_version: '1',
  provenance: 'synthetic', trials, cases,
});
const decision = (case_id, answer = 'a', options = {}) => ({
  type: 'decision', case_id, execution_status: 'completed', decision_status: 'decided',
  answer, probabilities: null, auto_accepted: false, constraint_pass: null,
  decision_e2e_ms: null, ...options,
});
const trialRecord = (trial_id = 't1', outcome = 'success', duration_ms = null) =>
  ({type: 'trial', trial_id, outcome, duration_ms});
const request = (request_id, options = {}) => ({
  type: 'request', request_id, trial_id: 't1', phase: 'decision', status: 'completed',
  response_received: true, schema_valid: true, duration_ms: null,
  cost: {usd: 0, jev_tokens: 0, jev_credits: 0}, tokens: {input: 0, output: 0}, ...options,
});
const approx = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('manifest denominators retain missing, abstained, failed, unknown and unreferenced cases', () => {
  const cases = Array.from({length: 8}, (_, index) => categorical(`c${index}`));
  cases[6].reference = null;
  cases[7].reference = {accepted_answers: ['a', 'b']};
  const input = manifest(cases, [makeTrial('t1'), makeTrial('t2'), makeTrial('t3'), makeTrial('t4')]);
  const records = [
    decision('c0', 'a', {auto_accepted: true, constraint_pass: true}),
    decision('c1', 'b', {auto_accepted: true, constraint_pass: false}),
    decision('c2', null, {decision_status: 'abstained'}),
    decision('c3', null, {execution_status: 'failed', decision_status: 'not_evaluated'}),
    decision('c4', null, {execution_status: 'unknown', decision_status: 'not_evaluated'}),
    decision('c6', 'b', {auto_accepted: true}),
    decision('c7', 'b'),
    trialRecord('t1'), trialRecord('t2', 'failure'), trialRecord('t3', 'grader_error'),
  ];
  const report = evaluateMetrics(input, records);
  assert.deepEqual(report.dataset, {dataset_id: 'arithmetic', dataset_version: '1', provenance: 'synthetic'});
  assert.equal(report.schema_version, 'jev-eval-report/v1');
  assert.deepEqual(report.cases.counts, {
    manifest: 8, recorded: 7, missing_decisions: 1, referenced: 7, no_reference: 1,
    decided: 4, scored: 3, correct: 2, incorrect: 1, decided_without_reference: 1,
  });
  assert.equal(report.cases.coverage.value, 4 / 8);
  assert.equal(report.cases.scorable_coverage.value, 3 / 7);
  assert.equal(report.cases.accuracy.value, 2 / 3);
  assert.equal(report.cases.selective_risk.value, 1 / 3);
  assert.equal(report.cases.verified_correct_yield.value, 2 / 7);
  assert.equal(report.cases.no_reference_rate.value, 1 / 8);
  assert.deepEqual(report.cases.execution_status, {completed: 5, failed: 1, unknown: 1, not_called: 0, missing: 1});
  assert.deepEqual(report.cases.decision_status, {decided: 4, abstained: 1, not_evaluated: 2, missing: 1});
  assert.equal(report.cases.auto_acceptance.rate.value, 3 / 8);
  assert.equal(report.cases.auto_acceptance.violation_rate.value, 1 / 2);
  assert.equal(report.cases.auto_acceptance.constraint_unchecked, 1);
  assert.equal(report.trials.success_rate.value, 1 / 4);
  assert.equal(report.trials.conditional_success_rate.value, 1 / 2);
  assert.equal(report.trials.outcome.grader_error, 1);
  assert.equal(report.trials.outcome.missing, 1);
  assert.equal(report.trials.task_count, 1);
});

test('empty manifest returns null ratios and known zero cost without NaN or Infinity', () => {
  const report = evaluateMetrics(manifest([], []), []);
  assert.equal(report.cases.coverage.value, null);
  assert.equal(report.cases.coverage.reason, 'zero_denominator');
  assert.equal(report.trials.success_rate.value, null);
  assert.equal(report.costs.total.units.usd.total, 0);
  assert.equal(report.costs.total.units.usd.complete, true);
  assert.equal(report.costs.operational.cost_per_success.usd.value, null);
  assert.equal(report.costs.operational.cost_per_success.usd.reason, 'zero_successful_trials');
  assert.deepEqual(report.classification.groups, []);
  assert.deepEqual(report.probability.groups, []);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test('all abstentions and uncalled records keep yield at zero but conditional accuracy unknown', () => {
  const input = manifest([categorical('a'), categorical('b'), categorical('c')]);
  const report = evaluateMetrics(input, [
    decision('a', null, {decision_status: 'abstained'}),
    decision('b', null, {execution_status: 'not_called', decision_status: 'not_evaluated'}),
  ]);
  assert.equal(report.cases.coverage.value, 0);
  assert.equal(report.cases.verified_correct_yield.value, 0);
  assert.equal(report.cases.accuracy.value, null);
  assert.equal(report.cases.selective_risk.value, null);
  assert.equal(report.classification.groups[0].n, 0);
  assert.equal(report.classification.groups[0].macro_f1.value, null);
  assert.equal(report.probability.groups[0].log_loss.reason, 'no_eligible_predictions');
  assert.equal(report.cases.execution_status.not_called, 1);
  assert.equal(report.cases.execution_status.missing, 1);
});

test('confusion matrix and macro F1 match hand calculation; zero support is excluded', () => {
  const labels = ['a', 'b', 'c', 'unused'];
  const input = manifest([
    categorical('1', ['a'], labels), categorical('2', ['a'], labels),
    categorical('3', ['b'], labels), categorical('4', ['c'], labels),
  ]);
  const report = evaluateMetrics(input, [decision('1', 'a'), decision('2', 'b'), decision('3', 'b'), decision('4', 'b')]);
  const group = report.classification.groups[0];
  assert.deepEqual(group.confusion_matrix.counts, [[1, 1, 0, 0], [0, 1, 0, 0], [0, 1, 0, 0], [0, 0, 0, 0]]);
  assert.equal(group.per_class[0].precision.value, 1);
  assert.equal(group.per_class[0].recall.value, 1 / 2);
  assert.equal(group.per_class[0].f1.value, 2 / 3);
  assert.equal(group.per_class[1].precision.value, 1 / 3);
  assert.equal(group.per_class[1].f1.value, 1 / 2);
  assert.equal(group.per_class[2].precision.value, null);
  assert.equal(group.per_class[2].recall.value, 0);
  assert.equal(group.per_class[2].f1.value, 0);
  assert.equal(group.per_class[3].f1.value, null);
  assert.equal(group.per_class[3].f1.reason, 'zero_support');
  approx(group.macro_f1.value, (2 / 3 + 1 / 2 + 0) / 3);
  assert.deepEqual(group.macro_f1.excluded_classes, ['unused']);
});

test('false positives on a zero-support class do not make its F1 defined', () => {
  const report = evaluateMetrics(manifest([categorical('1')]), [decision('1', 'b')]);
  const [a, b] = report.classification.groups[0].per_class;
  assert.equal(a.f1.value, 0);
  assert.equal(b.precision.value, 0);
  assert.equal(b.f1.value, null);
  assert.equal(b.f1.reason, 'zero_support');
  assert.equal(report.classification.groups[0].macro_f1.value, 0);
});

test('binary Brier uses p(true), while calibration uses maximum probability and argmax', () => {
  const report = evaluateMetrics(manifest([binary('1', [true]), binary('2', [false])]), [
    decision('1', false, {probabilities: {true: 0.8, false: 0.2}}),
    decision('2', false, {probabilities: {true: 0.3, false: 0.7}}),
  ]);
  const group = report.probability.groups[0];
  approx(group.brier.value, (0.2 ** 2 + 0.3 ** 2) / 2);
  approx(group.log_loss.value, -(Math.log(0.8) + Math.log(0.7)) / 2);
  assert.deepEqual(group.brier.range, [0, 1]);
  assert.equal(report.cases.accuracy.value, 0.5);
  assert.equal(group.reliability.argmax_accuracy.value, 1);
  assert.equal(group.reliability.bins[8].n, 1);
  assert.equal(group.reliability.bins[7].n, 1);
  approx(group.reliability.ece.value, 0.25);
});

test('multiclass Brier uses all class errors and log loss keeps zero probability infinite', () => {
  const labels = ['a', 'b', 'c'];
  const report = evaluateMetrics(manifest([
    categorical('1', ['a'], labels), categorical('2', ['c'], labels),
  ]), [
    decision('1', 'a', {probabilities: {a: 0.7, b: 0.2, c: 0.1}}),
    decision('2', 'a', {probabilities: {a: 1, b: 0, c: 0}}),
  ]);
  const group = report.probability.groups[0];
  approx(group.brier.value, ((0.3 ** 2 + 0.2 ** 2 + 0.1 ** 2) + 2) / 2);
  assert.deepEqual(group.brier.range, [0, 2]);
  assert.equal(group.log_loss.value, null);
  assert.equal(group.log_loss.reason, 'infinite_loss');
  assert.equal(group.log_loss.infinite_loss_count, 1);
  approx(group.log_loss.finite_loss_subtotal, -Math.log(0.7));
  assert.equal(group.reliability.bins[9].n, 1);
  assert.equal(group.reliability.bins[9].upper_inclusive, true);
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
});

test('binary zero-gold probability yields Brier one and explicit infinite log loss', () => {
  const report = evaluateMetrics(manifest([binary('1')]), [decision('1', false, {probabilities: {true: 0, false: 1}})]);
  const group = report.probability.groups[0];
  assert.equal(group.brier.value, 1);
  assert.equal(group.log_loss.value, null);
  assert.equal(group.log_loss.infinite_loss, true);
  assert.equal(group.reliability.bins[9].accuracy.value, 0);
});

test('label order determines probability tie-breaking; kind and ordered spaces stay separate', () => {
  const report = evaluateMetrics(manifest([
    categorical('1', ['b'], ['b', 'a']), categorical('2', ['b'], ['a', 'b']), binary('3', [false]),
  ]), [
    decision('1', 'a', {probabilities: {a: 0.5, b: 0.5}}),
    decision('2', 'b', {probabilities: {a: 0.5, b: 0.5}}),
    decision('3', true, {probabilities: {true: 0.5, false: 0.5}}),
  ]);
  assert.equal(report.classification.groups.length, 3);
  assert.deepEqual(report.probability.groups.map(group => group.reliability.argmax_accuracy.value), [1, 0, 1]);
  assert.equal(report.probability.groups[2].reliability.tie_break, 'false_then_true');
  assert.equal(report.probability.groups[0].reliability.bins[5].n, 1);
});

test('single-gold metrics report mutually exclusive exclusion counts for every manifest case', () => {
  const report = evaluateMetrics(manifest([
    categorical('1', ['a', 'b']), categorical('2', null), categorical('3'), categorical('4'), categorical('5'), categorical('6'),
  ]), [
    decision('1', 'b', {probabilities: {a: 0.2, b: 0.8}}), decision('2', 'a'),
    decision('4', null, {decision_status: 'abstained'}), decision('5', 'a'),
    decision('6', 'a', {probabilities: {a: 1, b: 0}}),
  ]);
  assert.equal(report.cases.accuracy.value, 1);
  assert.equal(report.cases.accuracy.denominator, 3);
  const group = report.probability.groups[0];
  assert.equal(group.n, 1);
  assert.deepEqual(group.exclusions, {no_reference: 1, multiple_accepted_answers: 1, missing_decision: 1, not_decided: 1, missing_probabilities: 1});
  assert.equal(Object.values(group.exclusions).reduce((sum, value) => sum + value, group.n), group.manifest_n);
  assert.equal(report.classification.groups[0].n, 2);
});

test('nearest-rank times separate completed, failed, unknown and trial outcome distributions', () => {
  const input = manifest([categorical('1'), categorical('2'), categorical('3'), categorical('4')], [
    makeTrial('t1', 2), makeTrial('t2'), makeTrial('t3'), makeTrial('t4'), makeTrial('t5'),
  ]);
  const report = evaluateMetrics(input, [
    decision('1', 'a', {decision_e2e_ms: 10}), decision('2', 'a', {decision_e2e_ms: 20}),
    decision('3', null, {execution_status: 'failed', decision_status: 'not_evaluated', decision_e2e_ms: 200}),
    decision('4', null, {execution_status: 'unknown', decision_status: 'not_evaluated', decision_e2e_ms: 900}),
    request('r1', {duration_ms: 7}),
    request('r2', {status: 'failed', schema_valid: false, duration_ms: 99}),
    trialRecord('t1', 'success', 100), trialRecord('t2', 'success', 200),
    trialRecord('t3', 'success', 300), trialRecord('t4', 'failure', 1000), trialRecord('t5', 'unknown', 5000),
  ]);
  const decisionTimes = report.latency.decision_e2e_ms.by_status;
  assert.equal(decisionTimes.completed.n, 2);
  assert.equal(decisionTimes.completed.p50, 10);
  assert.equal(decisionTimes.completed.p95, 20);
  assert.equal(decisionTimes.failed.p50, 200);
  assert.equal(decisionTimes.unknown.p50, 900);
  assert.equal(report.latency.api_ms.by_status.completed.p50, 7);
  assert.equal(report.latency.api_ms.by_status.failed.p50, 99);
  assert.equal(report.latency.task_e2e_ms.by_status.success.p50, 200);
  assert.equal(report.latency.task_e2e_ms.by_status.success.p95, 300);
  assert.equal(report.latency.task_e2e_ms.by_status.failure.p50, 1000);
  assert.equal(report.latency.task_e2e_ms.by_status.unknown.p50, 5000);
});

test('schema pass rate uses received responses and preserves unknown validation', () => {
  const report = evaluateMetrics(manifest([], [makeTrial('t1', 4)]), [
    request('1'), request('2', {status: 'failed', schema_valid: false}),
    request('3', {status: 'unknown', schema_valid: null}),
    request('4', {status: 'unknown', response_received: false, schema_valid: null}),
  ]);
  assert.equal(report.requests.schema.pass_rate.value, 1 / 3);
  assert.equal(report.requests.schema.unknown, 1);
  assert.deepEqual(report.requests.status, {completed: 1, failed: 1, unknown: 2});
});

test('costs charge one request once across multiple decisions and include failures; judge stays separate', () => {
  const input = manifest([categorical('1'), categorical('2')], [makeTrial('t1', 2), makeTrial('t2', 2)]);
  const report = evaluateMetrics(input, [
    decision('1'), decision('2'), trialRecord('t1'), trialRecord('t2', 'failure'),
    request('1', {cost: {usd: 2, jev_tokens: 10, jev_credits: 0}, tokens: {input: 20, output: 30}}),
    request('2', {phase: 'evaluation', cost: {usd: 50, jev_tokens: 100, jev_credits: 0}}),
    request('3', {trial_id: 't2', phase: 'execution', status: 'failed', schema_valid: false,
      cost: {usd: 3, jev_tokens: 20, jev_credits: 0}}),
    request('4', {trial_id: 't2', phase: 'recheck', status: 'unknown', response_received: false, schema_valid: null,
      cost: {usd: 5, jev_tokens: 30, jev_credits: 0}}),
  ]);
  assert.equal(report.costs.total.units.usd.total, 60);
  assert.equal(report.costs.operational.units.usd.total, 10);
  assert.equal(report.costs.evaluation.units.usd.total, 50);
  assert.equal(report.costs.operational.cost_per_success.usd.value, 10);
  assert.equal(report.costs.by_phase.decision.units.usd.total, 2);
  assert.equal(report.costs.by_phase.question_generation.units.usd.total, 0);
  assert.equal(report.costs.by_request_status.failed.units.usd.total, 3);
  assert.equal(report.costs.by_request_status.unknown.units.usd.total, 5);
  assert.equal(report.costs.by_trial_outcome.failure.units.usd.total, 8);
  assert.equal(report.costs.operational.units.jev_tokens.total, 60);
  assert.equal(report.costs.total.units.jev_credits.total, 0);
  assert.equal(report.costs.total.token_usage.input.total, 20);
  assert.equal(report.costs.total.token_usage.output.total, 30);
});

test('missing cost stays null per unit with observed subtotal; complete units remain calculable', () => {
  const input = manifest([], [makeTrial('t1', 2)]);
  const report = evaluateMetrics(input, [trialRecord(),
    request('1', {cost: {usd: 2, jev_tokens: 10, jev_credits: null}}),
    request('2', {cost: {usd: null, jev_tokens: 20, jev_credits: null}}),
  ]);
  assert.equal(report.costs.total.units.usd.total, null);
  assert.equal(report.costs.total.units.usd.observed_subtotal, 2);
  assert.equal(report.costs.total.units.usd.observation_rate.value, 0.5);
  assert.equal(report.costs.total.units.usd.reason, 'missing_cost_or_usage');
  assert.equal(report.costs.total.units.jev_credits.observed_subtotal, null);
  assert.equal(report.costs.total.units.jev_tokens.total, 30);
  assert.equal(report.costs.operational.cost_per_success.usd.value, null);
  assert.equal(report.costs.operational.cost_per_success.jev_tokens.value, 30);
});

test('missing evaluation unit cost does not invalidate fully observed operational cost', () => {
  const report = evaluateMetrics(manifest([], [makeTrial('t1', 2)]), [
    trialRecord(), request('1', {cost: {usd: 3, jev_tokens: 0, jev_credits: 0}}),
    request('2', {phase: 'evaluation', cost: {usd: null, jev_tokens: 0, jev_credits: 0}}),
  ]);
  assert.equal(report.costs.total.units.usd.total, null);
  assert.equal(report.costs.evaluation.units.usd.total, null);
  assert.equal(report.costs.operational.units.usd.total, 3);
  assert.equal(report.costs.operational.cost_per_success.usd.value, 3);
});

test('missing or unknown expected requests invalidate every phase even when logged costs are complete', () => {
  for (const expected of [2, null]) {
    const report = evaluateMetrics(manifest([], [makeTrial('t1', expected)]), [trialRecord(),
      request('1', {cost: {usd: 4, jev_tokens: 0, jev_credits: 0}}),
    ]);
    assert.equal(report.costs.request_completeness.complete, false);
    assert.equal(report.costs.total.units.usd.total, null);
    assert.equal(report.costs.total.units.usd.observed_subtotal, 4);
    assert.equal(report.costs.total.units.usd.observation_rate.value, expected === null ? null : 0.5);
    assert.equal(report.costs.total.units.usd.recorded_value_observation_rate.value, 1);
    assert.equal(report.costs.operational.cost_per_success.usd.value, null);
    assert.equal(report.costs.by_phase.evaluation.units.usd.total, null);
    assert.equal(report.costs.by_phase.evaluation.units.usd.observed_subtotal, null);
    assert.equal(report.costs.by_phase.evaluation.units.usd.observation_rate.value, null);
    assert.equal(report.costs.by_phase.evaluation.units.usd.observation_rate.reason, 'unknown_denominator');
  }
  const unrecorded = evaluateMetrics(manifest([], [makeTrial('t1', null)]), []);
  assert.equal(unrecorded.costs.total.units.usd.total, null);
  assert.equal(unrecorded.costs.total.units.usd.observed_subtotal, null);
  assert.equal(unrecorded.costs.request_completeness.unknown_expected_request_count_trials, 1);
});

test('a missing trial ledger cannot disappear from cost and successful-trial denominators', () => {
  const report = evaluateMetrics(manifest([], [makeTrial('t1', 1), makeTrial('t2', 1)]), [
    trialRecord(), request('1', {cost: {usd: 5, jev_tokens: 0, jev_credits: 0}}),
  ]);
  assert.equal(report.trials.success_rate.value, 0.5);
  assert.equal(report.costs.total.units.usd.total, null);
  assert.equal(report.costs.request_completeness.missing_requests_in_known_trials, 1);
  assert.equal(report.costs.by_trial_outcome.success.units.usd.total, 5);
  assert.equal(report.costs.by_trial_outcome.missing.units.usd.total, null);
});

test('prototype-like labels and IDs are treated as ordinary strings', () => {
  const labels = ['__proto__', 'constructor'];
  const input = manifest([categorical('__proto__', ['__proto__'], labels, 'constructor')], [makeTrial('constructor')]);
  const probabilities = JSON.parse('{"__proto__":0.8,"constructor":0.2}');
  const report = evaluateMetrics(input, [decision('__proto__', '__proto__', {probabilities})]);
  assert.equal(report.cases.accuracy.value, 1);
  assert.deepEqual(report.classification.groups[0].confusion_matrix.counts, [[1, 0], [0, 0]]);
  approx(report.probability.groups[0].brier.value, 0.08);
});

test('numeric overflow and unsafe aggregate token or request counts have explicit reasons', () => {
  const report = evaluateMetrics(manifest([], [makeTrial('t1', 2)]), [trialRecord(),
    request('1', {cost: {usd: Number.MAX_VALUE, jev_tokens: 0, jev_credits: 0}, tokens: {input: Number.MAX_SAFE_INTEGER, output: 0}}),
    request('2', {cost: {usd: Number.MAX_VALUE, jev_tokens: 0, jev_credits: 0}, tokens: {input: 1, output: 0}}),
  ]);
  assert.equal(report.costs.total.units.usd.total, null);
  assert.equal(report.costs.total.units.usd.observed_subtotal, null);
  assert.equal(report.costs.total.units.usd.reason, 'numeric_overflow');
  assert.equal(report.costs.total.token_usage.input.total, null);
  assert.equal(report.costs.total.token_usage.input.reason, 'usage_sum_not_safe_integer');
  assert.deepEqual(JSON.parse(JSON.stringify(report)), report);
  const largeLedger = evaluateMetrics(manifest([], [makeTrial('t1', Number.MAX_SAFE_INTEGER), makeTrial('t2', Number.MAX_SAFE_INTEGER)]), []);
  assert.equal(largeLedger.costs.request_completeness.expected_request_count, null);
  assert.ok(largeLedger.costs.request_completeness.reasons.includes('request_count_sum_not_safe_integer'));
});

test('input objects remain unchanged, report JSON is finite, and repeated calls agree', () => {
  const input = manifest([binary('1')], [makeTrial('t1', 1)]);
  const records = [decision('1', true, {probabilities: {true: 0.8, false: 0.2}}), request('1')];
  const before = structuredClone({input, records});
  function freeze(value) {
    for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
    return Object.freeze(value);
  }
  freeze(input);
  freeze(records);
  const first = evaluateMetrics(input, records);
  assert.deepEqual(evaluateMetrics(input, records), first);
  assert.deepEqual({input, records}, before);
  assert.deepEqual(JSON.parse(JSON.stringify(first)), first);
  function finite(value) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value));
    if (value && typeof value === 'object') Object.values(value).forEach(finite);
  }
  finite(first);
});
