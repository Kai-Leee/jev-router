# Offline evaluation input contract v1

> English translation of [EVALUATION_CONTRACT.md](EVALUATION_CONTRACT.md). The Korean original is authoritative if they differ.

Status: the first implementation contract under D-012. It is not a confirmed product performance standard.
Every JSON object allows only the fields defined below. Records do not contain prompt, state or authentication values.
Input/results use English identifiers. null means not provided and is distinct from 0.
Every ID, dataset version and label string must be non-empty after trim. The original value is not changed.
Labels such as `__proto__` are also allowed, so dictionaries are handled safely with own properties, Map or similar.

## Manifest

Required: `schema_version: "jev-eval/v1"`, `dataset_id` (non-empty string),
`dataset_version` (string), `provenance: "synthetic" | "observed"`, a `trials` array and a `cases` array.

- trial: `trial_id`, `task_id` (each a string), `expected_request_count` (a safe integer of 0 or more, or null).
  trial_id is unique. expected_request_count is the expected total number of actual HTTP requests, including the evaluation phase.
  null means the completeness of the request records is unknown. If there are more actual records than expected, it is a contract error.
- case: `case_id`, `trial_id`, `kind: "categorical" | "binary"`, `labels`, `reference`.
  case_id is unique, and trial_id must be a registered trial.
  categorical labels is an array of 2 or more strings without duplicates; binary labels is null.
  reference is null or `{ accepted_answers: [...] }`. It is a non-empty set of accepted answers without duplicates.
  For categorical they are strings in labels; for binary they are booleans. There can be more than one answer.

Empty manifest arrays are allowed. A trial with no cases is also allowed. Cases/trials with missing input also stay in the denominator.
The correct/accepted answer sets are for evaluation only and are kept separate from the model call state.

## JSONL records

Each line is one of the following. All listed fields are required. Fields marked nullable allow an explicit null.

### decision

`type: "decision"`, `case_id`, `execution_status` (completed/failed/unknown/not_called),
`decision_status` (decided/abstained/not_evaluated), `answer` (string/boolean/null),
`probabilities` (probability map or null), `auto_accepted` (boolean), `constraint_pass` (boolean/null),
`decision_e2e_ms` (finite number of 0 or more, or null).

- At most one per case. An unregistered case is an error.
- decided must be completed and must have a valid answer. abstained is completed, and answer/probabilities are null.
  not_evaluated is not completed, and answer/probabilities are null. This restriction is a v1 simplification.
- auto_accepted can be true only when decided. constraint_pass can be a boolean only when auto_accepted.
- probabilities is allowed only when decided. For categorical it contains exactly all labels,
  and for binary it contains exactly `"true"` and `"false"`. Each value is a finite number in [0,1],
  and the sum error is within 1e-6. Automatic normalization is forbidden. The selected answer is not required to be the label with the highest probability.

### request

`type: "request"`, `request_id`, `trial_id`,
`phase` (question_generation/decision/execution/recheck/evaluation),
`status` (completed/failed/unknown), `response_received` (boolean), `schema_valid` (boolean/null),
`duration_ms` (finite number of 0 or more/null),
`cost: { usd, jev_tokens, jev_credits }` (each a finite number of 0 or more/null),
`tokens: { input, output }` (each a safe integer of 0 or more/null).

- request_id is unique, and trial_id must be registered. A request with multiple questions also uses only one line.
- If there is no response, schema_valid is null. completed means response_received=true and schema_valid=true.
  failed includes HTTP errors and unsuitable responses. unknown keeps an unknown result.
- judge requests for evaluation are in the evaluation phase. The rest are operation costs.
- For a unit, use 0 if not applicable or an actual 0 was confirmed. Use null if it was not confirmed.
  Units are not converted automatically. An unknown expected request count or a shortfall against it is reflected in the completeness of total.

### trial

`type: "trial"`, `trial_id`, `outcome` (success/failure/unknown/not_run/grader_error),
`duration_ms` (finite number of 0 or more/null). At most one per trial. An unregistered trial is an error.
success/failure are results from an independent verifier. The main agent's own claims are not recorded in their place.

## API and output

- `validateEvaluation(manifest, records)` -> `{manifest, records}`; does not change the input.
- `evaluateMetrics(manifest, records)` -> JSON report; a pure function that takes validated input.
- `evaluate({manifest, records})` -> calls metrics after validate.
- The report keeps schema_version `jev-eval-report/v1`, dataset provenance, manifest denominators/missing items/statuses,
  and for each metric the n, rate numerator/denominator, convention and null reason.
- A 0 denominator gives null. Log-loss with 0 probability gives null+infinite_loss. An unobserved cost gives null+the observed subtotal.
  If the expected request count and the record count do not match, or the expected count is null, no complete cost is claimed.
- Cost `observation_rate` is requests with an observed value / planned requests. If the denominator cannot be known,
  for example because of the phase of missing requests, it is null+unknown_denominator. `recorded_value_observation_rate` is kept separate
  as requests with an observed value / recorded requests. An observation rate that can look like 100% even when records themselves are missing is not used as the overall observation rate.
- latency quantiles use nearest-rank (ceil(p*n)-1, a sorted 0-based index).
  Task success/failure time and unknown elapsed are kept separate.
- probability reliability uses 10 fixed equal-width bins and confidence=max(p). Correctness compares the argmax with the single gold.
  A tied argmax is decided by the manifest labels order (binary false,true), and the policy is recorded in the output.
  The accuracy of the actually selected answer and the calibration result of this probability classification are kept separate.
- Basic class metrics are computed on single-gold cases. Classes with 0 support and F1 with a 0 denominator are null.
  macro-F1 averages only defined classes and also records the excluded classes and their count.

Ranking, routing regret, CI and a real-time collector that extend the original output contract are later steps.
Compared model IDs, settings and raw traces will be added later in a real run adapter contract. They are not inserted arbitrarily into v1 files.
