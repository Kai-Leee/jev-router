const PHASES = ['question_generation', 'decision', 'execution', 'recheck', 'evaluation'];
const EXECUTION_STATUSES = ['completed', 'failed', 'unknown', 'not_called'];
const DECISION_STATUSES = ['decided', 'abstained', 'not_evaluated'];
const REQUEST_STATUSES = ['completed', 'failed', 'unknown'];
const OUTCOMES = ['success', 'failure', 'unknown', 'not_run', 'grader_error'];
const COST_UNITS = ['usd', 'jev_tokens', 'jev_credits'];

function ratio(numerator, denominator, exclusions = {}) {
  const reason = denominator === null ? 'unknown_denominator' : denominator === 0 ? 'zero_denominator' : null;
  return {
    value: reason ? null : numerator / denominator,
    n: denominator, numerator, denominator, unit: 'ratio',
    reason,
    exclusions,
  };
}

function countsFor(values, field, statuses, missing = 0) {
  const counts = Object.fromEntries(statuses.map(status => [status, 0]));
  for (const value of values) counts[value[field]] += 1;
  if (missing !== null) counts.missing = missing;
  return counts;
}

function finiteSum(values) {
  const sum = values.reduce((total, value) => total + value, 0);
  return Number.isFinite(sum) ? sum : null;
}

function distribution(records, field) {
  const values = records.map(record => record[field]).filter(value => value !== null);
  values.sort((a, b) => a - b);
  const nearestRank = p => values.length ? values[Math.ceil(p * values.length) - 1] : null;
  return {
    n: values.length, population_n: records.length,
    missing_count: records.length - values.length,
    p50: nearestRank(0.5), p95: nearestRank(0.95), unit: 'ms',
    convention: 'nearest_rank', reason: values.length ? null : 'no_observed_duration',
  };
}

function timingBy(records, field, statuses, durationField, missing) {
  return {
    missing_records: missing,
    by_status: Object.fromEntries(statuses.map(status => [
      status, distribution(records.filter(record => record[field] === status), durationField),
    ])),
  };
}

function requestLedger(trials, requests) {
  const observed = new Map(trials.map(trial => [trial.trial_id, 0]));
  for (const request of requests) observed.set(request.trial_id, observed.get(request.trial_id) + 1);
  const unknownTrials = trials.filter(trial => trial.expected_request_count === null);
  const knownTrials = trials.filter(trial => trial.expected_request_count !== null);
  const knownExpected = finiteSum(knownTrials.map(trial => trial.expected_request_count));
  const missingKnown = finiteSum(knownTrials.map(trial =>
    trial.expected_request_count - observed.get(trial.trial_id)));
  const expectedSafe = knownExpected !== null && Number.isSafeInteger(knownExpected);
  const missingSafe = missingKnown !== null && Number.isSafeInteger(missingKnown);
  const reasons = [];
  if (unknownTrials.length) reasons.push('unknown_expected_request_count');
  if (!expectedSafe || !missingSafe) reasons.push('request_count_sum_not_safe_integer');
  if (knownTrials.some(trial => trial.expected_request_count > observed.get(trial.trial_id))) {
    reasons.push('missing_request_records');
  }
  return {
    trial_count: trials.length,
    observed_request_count: requests.length,
    expected_request_count: unknownTrials.length || !expectedSafe ? null : knownExpected,
    known_expected_request_count: expectedSafe ? knownExpected : null,
    missing_requests_in_known_trials: missingSafe ? missingKnown : null,
    unknown_expected_request_count_trials: unknownTrials.length,
    complete: reasons.length === 0, reasons,
  };
}

function amount(records, getValue, unit, ledger, expected) {
  const observed = records.map(getValue).filter(value => value !== null);
  const sum = finiteSum(observed);
  const safe = sum !== null && (unit !== 'tokens' || Number.isSafeInteger(sum));
  const reasons = [...ledger.reasons];
  if (observed.length < records.length) reasons.push('missing_cost_or_usage');
  if (!safe) reasons.push(unit === 'tokens' ? 'usage_sum_not_safe_integer' : 'numeric_overflow');
  const complete = reasons.length === 0;
  return {
    unit,
    total: complete ? sum : null,
    observed_subtotal: safe && (observed.length || (ledger.complete && !records.length)) ? sum : null,
    observed_request_count: observed.length,
    recorded_request_count: records.length,
    missing_value_request_count: records.length - observed.length,
    expected_request_count: expected,
    complete, reason: reasons[0] ?? null, reasons,
    observation_rate: ratio(observed.length, expected),
    recorded_value_observation_rate: ratio(observed.length, records.length),
  };
}

function costScope(requests, ledger, expected = ledger.complete ? requests.length : null) {
  return {
    recorded_request_count: requests.length,
    expected_request_count: expected,
    request_records_complete: ledger.complete,
    units: Object.fromEntries(COST_UNITS.map(unit => [
      unit, amount(requests, request => request.cost[unit], unit, ledger, expected),
    ])),
    token_usage: Object.fromEntries(['input', 'output'].map(direction => [
      direction, amount(requests, request => request.tokens[direction], 'tokens', ledger, expected),
    ])),
  };
}

function costsFor(manifest, requests, trialById, successfulTrials) {
  const ledger = requestLedger(manifest.trials, requests);
  const operational = costScope(requests.filter(request => request.phase !== 'evaluation'), ledger);
  operational.cost_per_success = Object.fromEntries(COST_UNITS.map(unit => {
    const cost = operational.units[unit];
    const reasons = [...cost.reasons];
    if (!successfulTrials) reasons.push('zero_successful_trials');
    return [unit, {
      value: reasons.length ? null : cost.total / successfulTrials,
      numerator: cost.total, denominator: successfulTrials, n: manifest.trials.length,
      observed_subtotal: cost.observed_subtotal, unit: `${unit}/successful_trial`,
      includes_failed_trials: true, reason: reasons[0] ?? null, reasons,
    }];
  }));
  return {
    request_completeness: ledger,
    total: costScope(requests, ledger, ledger.expected_request_count),
    operational,
    evaluation: costScope(requests.filter(request => request.phase === 'evaluation'), ledger),
    by_phase: Object.fromEntries(PHASES.map(phase => [
      phase, costScope(requests.filter(request => request.phase === phase), ledger),
    ])),
    by_request_status: Object.fromEntries(REQUEST_STATUSES.map(status => [
      status, costScope(requests.filter(request => request.status === status), ledger),
    ])),
    by_trial_outcome: Object.fromEntries([...OUTCOMES, 'missing'].map(outcome => {
      const trials = manifest.trials.filter(trial =>
        (trialById.get(trial.trial_id)?.outcome ?? 'missing') === outcome);
      const ids = new Set(trials.map(trial => trial.trial_id));
      const selectedRequests = requests.filter(request => ids.has(request.trial_id));
      const selectedLedger = requestLedger(trials, selectedRequests);
      return [outcome, costScope(selectedRequests, selectedLedger, selectedLedger.expected_request_count)];
    })),
  };
}

function exclusionFor(caseItem, decision, requireProbabilities) {
  if (caseItem.reference === null) return 'no_reference';
  if (caseItem.reference.accepted_answers.length !== 1) return 'multiple_accepted_answers';
  if (!decision) return 'missing_decision';
  if (decision.decision_status !== 'decided') return 'not_decided';
  if (requireProbabilities && decision.probabilities === null) return 'missing_probabilities';
  return null;
}

function groupCases(cases, decisionById) {
  const groups = new Map();
  for (const caseItem of cases) {
    const labels = caseItem.kind === 'binary' ? [false, true] : [...caseItem.labels];
    const key = JSON.stringify([caseItem.kind, labels]);
    if (!groups.has(key)) groups.set(key, {kind: caseItem.kind, labels, items: []});
    groups.get(key).items.push({caseItem, decision: decisionById.get(caseItem.case_id)});
  }
  return [...groups.values()];
}

function selectSingleGold(group, requireProbabilities) {
  const exclusions = {
    no_reference: 0, multiple_accepted_answers: 0, missing_decision: 0, not_decided: 0,
    ...(requireProbabilities ? {missing_probabilities: 0} : {}),
  };
  const selected = [];
  for (const item of group.items) {
    const reason = exclusionFor(item.caseItem, item.decision, requireProbabilities);
    if (reason) exclusions[reason] += 1;
    else selected.push(item);
  }
  return {selected, exclusions};
}

function classificationGroup(group) {
  const {selected, exclusions} = selectSingleGold(group, false);
  const matrix = group.labels.map(() => group.labels.map(() => 0));
  for (const {caseItem, decision} of selected) {
    matrix[group.labels.indexOf(caseItem.reference.accepted_answers[0])][group.labels.indexOf(decision.answer)] += 1;
  }
  const classes = group.labels.map((label, index) => {
    const support = matrix[index].reduce((sum, count) => sum + count, 0);
    const predicted = matrix.reduce((sum, row) => sum + row[index], 0);
    const tp = matrix[index][index];
    const fp = predicted - tp;
    const fn = support - tp;
    const f1 = ratio(2 * tp, 2 * tp + fp + fn);
    if (support === 0) {
      f1.value = null;
      f1.reason = 'zero_support';
    }
    return {
      label, support, predicted_count: predicted, true_positive: tp, false_positive: fp, false_negative: fn,
      precision: ratio(tp, predicted), recall: ratio(tp, support), f1,
    };
  });
  const defined = classes.filter(item => item.f1.value !== null);
  const excluded = classes.filter(item => item.f1.value === null).map(item => item.label);
  return {
    kind: group.kind, labels: group.labels, manifest_n: group.items.length, n: selected.length, exclusions,
    confusion_matrix: {rows: 'reference', columns: 'selected_answer', counts: matrix},
    per_class: classes,
    macro_f1: {
      value: defined.length ? finiteSum(defined.map(item => item.f1.value)) / defined.length : null,
      n: selected.length, included_class_count: defined.length,
      excluded_class_count: excluded.length, excluded_classes: excluded,
      reason: defined.length ? null : 'no_defined_class_f1', unit: 'score',
    },
  };
}

function probabilityGroup(group) {
  const {selected, exclusions} = selectSingleGold(group, true);
  const bins = Array.from({length: 10}, (_, index) => ({
    lower: index / 10, upper: (index + 1) / 10, upper_inclusive: index === 9,
    n: 0, confidence_sum: 0, correct_count: 0,
  }));
  let brierSum = 0;
  let finiteLogLoss = 0;
  let infiniteLossCount = 0;
  let argmaxCorrectCount = 0;
  for (const {caseItem, decision} of selected) {
    const gold = caseItem.reference.accepted_answers[0];
    const probabilities = group.labels.map(label => decision.probabilities[String(label)]);
    if (group.kind === 'binary') {
      brierSum += (decision.probabilities.true - Number(gold)) ** 2;
    } else {
      brierSum += probabilities.reduce((sum, probability, index) =>
        sum + (probability - Number(group.labels[index] === gold)) ** 2, 0);
    }
    const goldProbability = decision.probabilities[String(gold)];
    if (goldProbability === 0) infiniteLossCount += 1;
    else finiteLogLoss += -Math.log(goldProbability);
    let argmaxIndex = 0;
    for (let index = 1; index < probabilities.length; index += 1) {
      if (probabilities[index] > probabilities[argmaxIndex]) argmaxIndex = index;
    }
    const confidence = probabilities[argmaxIndex];
    const correct = Number(group.labels[argmaxIndex] === gold);
    argmaxCorrectCount += correct;
    const bin = bins[Math.min(9, Math.floor(confidence * 10))];
    bin.n += 1;
    bin.confidence_sum += confidence;
    bin.correct_count += correct;
  }
  const n = selected.length;
  const binReports = bins.map(bin => ({
    lower: bin.lower, upper: bin.upper, lower_inclusive: true, upper_inclusive: bin.upper_inclusive,
    n: bin.n, mean_confidence: bin.n ? bin.confidence_sum / bin.n : null,
    correct_count: bin.correct_count, accuracy: ratio(bin.correct_count, bin.n),
  }));
  const brierFinite = Number.isFinite(brierSum);
  const lossFinite = Number.isFinite(finiteLogLoss);
  return {
    kind: group.kind, labels: group.labels, manifest_n: group.items.length, n, exclusions,
    brier: {
      value: n && brierFinite ? brierSum / n : null, n, unit: 'score',
      range: group.kind === 'binary' ? [0, 1] : [0, 2],
      convention: group.kind === 'binary' ? 'mean_squared_error_p_true' : 'mean_sum_squared_error_all_classes',
      reason: !n ? 'no_eligible_predictions' : !brierFinite ? 'numeric_overflow' : null,
    },
    log_loss: {
      value: n && !infiniteLossCount && lossFinite ? finiteLogLoss / n : null,
      n, unit: 'nats', infinite_loss: infiniteLossCount > 0, infinite_loss_count: infiniteLossCount,
      finite_loss_subtotal: lossFinite ? finiteLogLoss : null, finite_loss_count: n - infiniteLossCount,
      convention: 'mean_negative_natural_log_gold_probability_no_clipping',
      reason: !n ? 'no_eligible_predictions' : infiniteLossCount ? 'infinite_loss' : !lossFinite ? 'numeric_overflow' : null,
    },
    reliability: {
      n, confidence: 'maximum_probability', correctness: 'argmax_equals_single_gold',
      tie_break: group.kind === 'binary' ? 'false_then_true' : 'manifest_label_order',
      bin_count: 10, bin_convention: '[lower,upper); final bin includes 1', bins: binReports,
      argmax_accuracy: ratio(argmaxCorrectCount, n),
      ece: {
        value: n ? binReports.reduce((sum, bin) => bin.n ?
          sum + (bin.n / n) * Math.abs(bin.accuracy.value - bin.mean_confidence) : sum, 0) : null,
        n, unit: 'score', reason: n ? null : 'no_eligible_predictions',
        convention: 'sample_weighted_absolute_bin_accuracy_minus_mean_confidence',
      },
    },
  };
}

/** Calculate an offline report from validated v1 inputs without modifying them. */
export function evaluateMetrics(manifest, records) {
  const decisions = records.filter(record => record.type === 'decision');
  const requests = records.filter(record => record.type === 'request');
  const trialRecords = records.filter(record => record.type === 'trial');
  const decisionById = new Map(decisions.map(record => [record.case_id, record]));
  const trialById = new Map(trialRecords.map(record => [record.trial_id, record]));
  const referenced = manifest.cases.filter(caseItem => caseItem.reference !== null);
  const decided = decisions.filter(record => record.decision_status === 'decided');
  const scored = referenced.filter(caseItem => decisionById.get(caseItem.case_id)?.decision_status === 'decided');
  const correct = scored.filter(caseItem =>
    caseItem.reference.accepted_answers.includes(decisionById.get(caseItem.case_id).answer));
  const autoAccepted = decisions.filter(record => record.auto_accepted);
  const constraintChecked = autoAccepted.filter(record => record.constraint_pass !== null);
  const constraintViolations = constraintChecked.filter(record => !record.constraint_pass);
  const outcomes = countsFor(trialRecords, 'outcome', OUTCOMES, manifest.trials.length - trialRecords.length);
  const groups = groupCases(manifest.cases, decisionById);
  const received = requests.filter(request => request.response_received);
  const schemaPassed = received.filter(request => request.schema_valid === true);
  return {
    schema_version: 'jev-eval-report/v1',
    dataset: {dataset_id: manifest.dataset_id, dataset_version: manifest.dataset_version, provenance: manifest.provenance},
    conventions: {
      denominator: 'manifest cases and trials; missing records remain in planned denominators',
      ratio_zero_denominator: 'null with zero_denominator',
      classification: 'selected answer; single gold; groups preserve kind and ordered label space',
      classification_zero_support: 'class F1 is null; macro F1 averages only defined classes',
      probability: 'single gold and full probability map; no normalization or clipping',
      probability_sum_tolerance: 1e-6,
      probability_exclusions: 'one first-applicable reason per case: no reference, multiple answers, missing decision, not decided, missing probabilities',
      reliability: '10 equal-width bins of maximum probability; correctness uses argmax, independently of selected answer',
      latency: 'nearest rank ceil(p*n)-1; observed times separated by execution status or trial outcome',
      cost: 'one record per HTTP request, including failed and unknown requests; units are never converted',
      cost_completeness: 'all cohort request counts must be known and matched, and every recorded scoped value observed; missing request phase is unknown',
      cost_per_success: 'all operational costs from the manifest trial cohort divided by successful trials; evaluation phase excluded',
      uncertainty: 'no confidence intervals or statistical significance claim',
    },
    cases: {
      counts: {
        manifest: manifest.cases.length, recorded: decisions.length,
        missing_decisions: manifest.cases.length - decisions.length,
        referenced: referenced.length, no_reference: manifest.cases.length - referenced.length,
        decided: decided.length, scored: scored.length, correct: correct.length, incorrect: scored.length - correct.length,
        decided_without_reference: decided.length - scored.length,
      },
      execution_status: countsFor(decisions, 'execution_status', EXECUTION_STATUSES, manifest.cases.length - decisions.length),
      decision_status: countsFor(decisions, 'decision_status', DECISION_STATUSES, manifest.cases.length - decisions.length),
      coverage: ratio(decided.length, manifest.cases.length),
      scorable_coverage: ratio(scored.length, referenced.length, {no_reference: manifest.cases.length - referenced.length}),
      selective_risk: ratio(scored.length - correct.length, scored.length, {not_scored: manifest.cases.length - scored.length}),
      accuracy: ratio(correct.length, scored.length, {not_scored: manifest.cases.length - scored.length}),
      verified_correct_yield: ratio(correct.length, referenced.length, {no_reference: manifest.cases.length - referenced.length}),
      no_reference_rate: ratio(manifest.cases.length - referenced.length, manifest.cases.length),
      auto_acceptance: {
        count: autoAccepted.length, rate: ratio(autoAccepted.length, manifest.cases.length),
        constraint_checked: constraintChecked.length,
        constraint_unchecked: autoAccepted.length - constraintChecked.length,
        constraint_violations: constraintViolations.length,
        violation_rate: ratio(constraintViolations.length, constraintChecked.length, {unchecked_accepted: autoAccepted.length - constraintChecked.length}),
      },
    },
    requests: {
      count: requests.length, status: countsFor(requests, 'status', REQUEST_STATUSES, null),
      response_received: received.length,
      schema: {passed: schemaPassed.length, failed: received.filter(request => request.schema_valid === false).length,
        unknown: received.filter(request => request.schema_valid === null).length,
        pass_rate: ratio(schemaPassed.length, received.length, {no_response: requests.length - received.length})},
    },
    trials: {
      manifest: manifest.trials.length, recorded: trialRecords.length,
      task_count: new Set(manifest.trials.map(trial => trial.task_id)).size, outcome: outcomes,
      success_rate: ratio(outcomes.success, manifest.trials.length),
      conditional_success_rate: ratio(outcomes.success, outcomes.success + outcomes.failure,
        {not_validly_graded: manifest.trials.length - outcomes.success - outcomes.failure}),
    },
    latency: {
      decision_e2e_ms: timingBy(decisions, 'execution_status', EXECUTION_STATUSES, 'decision_e2e_ms', manifest.cases.length - decisions.length),
      api_ms: timingBy(requests, 'status', REQUEST_STATUSES, 'duration_ms', null),
      task_e2e_ms: timingBy(trialRecords, 'outcome', OUTCOMES, 'duration_ms', manifest.trials.length - trialRecords.length),
    },
    costs: costsFor(manifest, requests, trialById, outcomes.success),
    classification: {groups: groups.map(classificationGroup)},
    probability: {groups: groups.map(probabilityGroup)},
    limitations: [
      'Synthetic provenance demonstrates arithmetic and contracts, not model quality or user benefit.',
      'Selected answer accuracy and probability argmax calibration can differ.',
      'Missing records, unknown outcomes, and ungraded decisions are not semantic errors.',
      'Small-sample p95 and fixed-bin ECE do not establish stable performance or calibration.',
      'Ranking, oracle regret, confidence intervals, online collection, and live model evaluation are outside v1.',
    ],
  };
}
