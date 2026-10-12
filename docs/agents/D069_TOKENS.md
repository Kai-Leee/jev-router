# D069 token admission — investigation and implementation role

2026-10-11 KST. Owner: `d068_failure`, following [parallel ownership](D069_PARALLEL.md). Current status: official-source investigation, pure local admission module, focused tests and D068 retrospective replay complete. Root owns POST integration and actual acceptance measurement. Local admission is an estimate policy; no exact token counter or provider acceptance guarantee is claimed.

## Purpose and boundary

The D068 repair request used 97,071 serialized UTF-8 bytes yet received HTTP 400 `model_input_limit`. A local request-byte check did not establish model-token admissibility. Preserve this failure and all original evidence. Investigate the official Jev API/TypeSafe SDK for an exact preflight counter or matching tokenizer and for the state-plus-longest-question limit. Do not infer exact tokens from bytes or treat billed input tokens as an interchangeable model-context measure.

This role owns a new pure admission module, versioned contract, focused tests and this document. Root alone integrates it before POST and performs authenticated model/account/provider operations. No `src/client.mjs`, planner, runner, actual ledger, keys, Docker, original candidates or hidden-test details are changed by this role.

## Official-source findings

Checked on 2026-10-11 by reading the public official pages and linked official SDK source, without authentication or inference. Source discovery was web search followed by these primary pages; third-party tokenizer estimates were not used.

| Source | Confirmed scope | Remaining unknown |
|---|---|---|
| [Jev API documentation](https://jev-ai.pro/docs) | Hosted base URL, `POST /v1/systemone`, no-inference `GET /v1/models`, official SDK compatibility, separate body limit of 256,000 UTF-8 bytes and maximum 64 questions. Jev hosts the endpoint; TypeSafe publishes the SDK. | A body validator pass does not establish model-context admissibility. No pre-inference token-count endpoint was found on this page. |
| [Jev hosted model table](https://jev-ai.pro/jev-api) | Current aliases include `jev-latest` and `jev-1.13.0`; 64k context with a separate 32k state-plus-longest-question limit. | Exact meaning of `k`, tokenizer identity and provider framing are not specified. |
| [TypeSafe models](https://docs.typesafe.ai/models) | Jev 1.13 has two constraints: state with all questions totals 64k; state with the longest individual question is limited to 32k. Aliases may change. | Model labels alone do not provide a local tokenizer. |
| [TypeSafe API](https://docs.typesafe.ai/api), [state concept](https://docs.typesafe.ai/concepts/state/), [official documentation index](https://docs.typesafe.ai/llms.txt) | State accepts structured data; inference responses report usage. Question identifiers are lookup keys, not reasoning content. | No exact counter/tokenizer resource or exact provider serialization algorithm was found in the reviewed pages/index. |
| Official JavaScript SDK [client](https://raw.githubusercontent.com/typesafe-ai/typesafe-sdk-js/main/src/client.ts), [models resource](https://raw.githubusercontent.com/typesafe-ai/typesafe-sdk-js/main/src/resources/models.ts), [types](https://raw.githubusercontent.com/typesafe-ai/typesafe-sdk-js/main/src/types.ts), [exports](https://raw.githubusercontent.com/typesafe-ai/typesafe-sdk-js/main/src/index.ts), [package](https://raw.githubusercontent.com/typesafe-ai/typesafe-sdk-js/main/package.json) | Version 0.6.0 sends serialized JSON through `systemOne()` and exposes model listing. Usage is returned after inference. No runtime tokenizer dependency or public count method was found in this inspected SDK surface. | This does not prove that no private or future service counter exists. No matching official local tokenizer was available for this implementation. |

The contract therefore records `exact_count.status = not_found_in_reviewed_official_sources`; endpoint, tokenizer, tokenizer version and provider serialization are all `null`. Installing an unrelated tokenizer would not convert a guess into an exact Jev count, so no dependency was added.

## Policy and runtime contract

The versioned source is [jev-token-admission.v1.json](../orchestration/contracts/jev-token-admission.v1.json); implementation is [jev-token-admission.mjs](../../src/orchestration/jev-token-admission.mjs). `prepareDecision()` from the existing client determines the exact compact JSON that the adapter would send. Assessment does not change that request.

| Quantity | Definition | Evidence level |
|---|---|---|
| `measurements.wire_bytes` | UTF-8 byte length of `prepareDecision(request).serialized`. | Exact byte measurement for this adapter serialization, not model tokens. |
| `measurements.state_plus_longest_question_json_bytes` | UTF-8 bytes of `JSON.stringify(prepared.body.state)` plus the largest full serialized question; type, instructions and criteria are included. | Exact local JSON byte measurement. Provider's model-input framing is unknown. |
| `estimates.request_tokens` | `ceil(wire_bytes * 2 / 5) + 512`. | Heuristic input estimate; the ratio and allowance are engineering assumptions. Includes JSON envelope and question keys, even though model-input serialization may differ. |
| `estimates.state_plus_longest_question_tokens` | `ceil(state_plus_longest_question_json_bytes * 2 / 5) + 512`. | Same heuristic for the per-question scope. Largest bytes and largest estimate select the same question because the estimator is monotone. |
| `exact_model_tokens` | Request and per-question counts both `null`. | Not measured and not derivable from available public material. |
| `actual_usage` | `null` in every preflight assessment. | No inference occurred in this module. Historical reported usage is recorded separately by replay. |

For this local policy, the documented 32k/64k labels are interpreted as 32,000/64,000. The official pages do not resolve decimal versus binary `k`; choosing the smaller decimal thresholds is an engineering policy. This does not turn the token estimate into a proven upper bound. A previous successful request can still be refused by a stricter local policy; an admitted request can still be rejected by the provider.

The `2 / 5` slope was chosen above the observed D068 aggregate input-per-wire-byte ratios; `512` is a fixed allowance for unknown framing. Both are tuned assumptions for this English structured workload. They are not a calibrated tokenizer or a general guarantee for other languages, entropy distributions, encodings or later model versions. The historical sample that informed this choice is also used for the replay below, so it is not held-out validation.

Requested models are limited to `jev-latest` and `jev-1.13.0`. Explicit observed labels allow `jev-1.13.0`, `typesafe-ai/jev` and `typesafe/jev-1.13-20260917`, as actually returned by D068 successful calls. The generic provider label is accepted under the documented Jev 1.13 assumption; it does not independently certify the underlying version. An unseen explicit label blocks. A missing observed label remains `null` rather than being invented; root separately verifies current model availability before inference. A changed alias or contract requires revalidation and a new source pin.

```js
import {prepareDecision} from './src/client.mjs';
import {
  assessJevTokenAdmission,
  jevTokenAdmissionPolicy,
} from './src/orchestration/jev-token-admission.mjs';

const prepared = prepareDecision(request);
const assessment = assessJevTokenAdmission(prepared.body, {
  observedModel: observedModelOrNull,
  expectedPolicySha256: frozenPolicySha256,
});
// Save the assessment. Root compares the prepared serialized SHA-256 with
// assessment.request_sha256 immediately before the reservation/POST boundary.
// If blocked: stop locally, without reservation or POST.
// If admitted: POST only the same immutable prepared.body; never retry here.
```

`jevTokenAdmissionPolicy()` returns a copy with the contract path and raw-file SHA-256. `assessJevTokenAdmission(request, {observedModel, expectedRequestSha256, expectedPolicySha256})` returns the request SHA-256, policy hash, measurements, estimates and reason codes. Hash mismatch, unsupported requested/explicit observed model, invalid request or an exceeded estimated constraint returns `admission: blocked` and `inference_allowed: false`. A pass returns `admit_estimated`, never `exact` or `guaranteed`. Every result retains `provider_acceptance_guaranteed: false`, `proven_token_upper_bound: false`, `inference_started: false` and `automatic_retries: 0`.

The module is pure after reading its versioned contract at module load: no environment/key access, network, model lookup, ledger reservation, truncation or retry. The caller must pin the loaded policy and recheck the exact prepared request immediately before POST; module admission alone does not stop an unrelated caller from mutating a request afterward. Root confirmed this integration handshake. A local rejection is distinct from a provider rejection and cannot be recorded as actual usage zero for a call that never happened.

## Verification and preserved evidence

Focused command: `node --test test/jev-token-admission.test.mjs` — **4/4 pass**, 0 failed, 0 skipped, 82.385792 ms. The tests cover exact UTF-8/serialized request binding with Korean and emoji input, inclusion of all question fields, distinct per-question and aggregate oversized cases, request/policy/model revision mismatch, invalid request handling, and inability to mutate the active policy through returned metadata. `node --check` passed for the module and test. No repeated test matrix or product test was introduced.

Read-only replay command: `node benchmark-runs/d069-token-admission/replay.mjs`. The script refuses to overwrite its output; use a new explicit filename for any later replay. [Replay 01](../../benchmark-runs/d069-token-admission/replay-01.json) pins the module, contract, client and replay script plus **143 historical request/response/receipt files**. Before/after SHA comparison found **0 changes** to those historical files. No old candidate, result or receipt was modified.

| Retrospective D068 observation | Result |
|---|---:|
| Stored Jev requests | 48 |
| Previously successful requests admitted by this policy | 47 / 47 |
| Previously rejected repair requests blocked by this policy | 1 / 1 |
| Reported aggregate input tokens from the 47 successful receipts | 897,399 |
| Reported aggregate output tokens from those receipts | 4,851 |
| Sum of heuristic request input estimates over those receipts | 1,016,047 |
| Requests whose heuristic input estimate covers reported aggregate input | 47 / 47 |
| Per-request estimate minus reported aggregate input | 1,466 to 11,685 |
| Observed reported-input / wire-byte ratio | 0.312094 to 0.377578 |
| Largest admitted per-question estimate among prior successes | 31,524 |
| Largest admitted request estimate among prior successes | 51,350 |
| Observed successful response labels | `typesafe-ai/jev`: 30; `typesafe/jev-1.13-20260917`: 3; `jev-1.13.0`: 14 |

The failed `jev-0058` repair measured 97,071 wire bytes, 95,661 state JSON bytes and 1,343 question JSON bytes. Its combined state-plus-question bytes are 97,004. The request estimate is 39,341, below the local aggregate threshold; the **per-question estimate is 39,314, above 32,000**, so it is blocked with `JEV_TOKEN_ADMISSION_ESTIMATED_QUESTION_LIMIT`. Actual tokens for this failed historical call remain `null`. The rejection demonstrates why an aggregate/body-only guard is insufficient; it does not establish an exact count of 39,314 or prove which undocumented internal calculation caused the old HTTP 400.

The 47/47 coverage metric compares **heuristic aggregate input estimates to historical reported aggregate input usage only**. It does not verify the per-question count, model acceptance on unseen requests, billing for failed requests or completed repair. D068's original failure remains preserved. Root will measure actual acceptance on one scoped new repair request and then run the new full condition after the integrated launch gate.

## Handoff and side effects

Production writes by this role are complete: new module, contract and four focused tests. Root can source-pin them and integrate admission before both budget reservation and POST. Research/evidence paths are this document and `benchmark-runs/d069-token-admission/`. The reviewer inspected the pure API and contract, independently confirmed the official limit scopes, and reported no blocking defect at that point; integrated runner behavior remains root/review work.

No new provider call, dependency, key access, real ledger mutation, Docker operation, hidden-check access, old evidence edit, commit/push or global installation occurred in this role. Actual new model acceptance, resulting repair, product completion, runtime and cost comparisons remain unmeasured here and belong to the fresh root-run evidence.

## Follow-up: observed v1 false admission and repair-only v2

Root's actual `d069-admission-probe-02` produced one **false admission**: v1 allowed the 70,510-byte request with estimated request input 28,716 and estimated state-plus-question input 28,690, but the single real POST received HTTP 400 `model_input_limit`. There was no answer, worker execution or automatic retry, and reported usage remains `null`. See the preserved [request assessment](../../benchmark-runs/d069-admission-probe-02/request-admission-before.json) and [result](../../benchmark-runs/d069-admission-probe-02/result.json). This prospective failure invalidates using the 47/47 historical aggregate coverage as evidence that repair requests will be accepted. It does not reveal the actual rejected token count or provider framing.

The old result's `acceptance_boundary` string incorrectly says the question was accepted; its structured status, receipt and HTTP cause establish failure. Preserve that raw string and record this correction separately instead of editing historical evidence. This role does not resolve the account settlement state or infer usage zero from refund wording.

New authorized work: preserve the v1 module/contract/replay, add a separate v2 module/contract with an explicit stage and a **24,000 actual wire-byte operating ceiling for repair only**. Retain the existing planning heuristic, exact/request-policy hash distinctions and no-retry behavior. The 24,000-byte value is a deliberately smaller engineering limit for the next scoped repair experiment, not a verified model-token upper bound or accepted-input guarantee. Implementation and focused replay are in progress; root continues to own authenticated calls, source integration and account/ledger actions.

### V2 implementation and read-only verification complete

The new [v2 module](../../src/orchestration/jev-token-admission-v2.mjs) wraps the unchanged v1 measurements, model validation and heuristic; the [v2 contract](../orchestration/contracts/jev-token-admission.v2.json) pins the v1 module and contract by their original SHA-256 hashes. A changed inherited source makes module loading fail. Root must include both versions in its source freeze. Original v1 module, contract and `replay-01.json` retain hashes `0ffb0209…`, `4378b09a…` and `9c511e9b…`, respectively. Their full hashes remain in the new replay evidence.

The same exported API now requires `options.stage` to be `split`, `relations` or `repair`. Missing and unknown stages return `JEV_TOKEN_ADMISSION_STAGE_UNVERIFIED`. For `repair`, full serialized `wire_bytes > 24_000` returns `JEV_TOKEN_ADMISSION_REPAIR_WIRE_LIMIT`; exactly 24,000 bytes may pass if all other checks pass. Question ID changes do not disable this guard. For `split` and `relations`, the existing planning heuristic remains unchanged.

The returned `operating_limit` records the measured wire bytes, 24,000-byte ceiling, whether the repair guard applies, its outcome and engineering basis. `exact_model_tokens` stays `null`, `provider_acceptance_guaranteed` and `proven_token_upper_bound` stay `false`. The result's policy hash identifies v2; an explicit expected v1 hash is rejected, while the exact prepared-request SHA is unchanged. Returned policy metadata is copied, so altering it does not relax the active limit.

The stage is supplied by trusted orchestration context. This API does not infer semantic stage from question text or detect a caller falsely labeling a repair request as planning. Root must preserve the planner's `context.stage` through assessment and POST; the integrated runtime already recognizes only these three stages. The pure module test ensures missing stage and unrelated question IDs cannot silently bypass the repair limit. Root/reviewer own verification that the actual repair caller supplies `stage: 'repair'`.

```js
import {assessJevTokenAdmission} from './src/orchestration/jev-token-admission-v2.mjs';

const assessment = assessJevTokenAdmission(prepared.body, {
  stage: context.stage,
  observedModel: observedModelOrNull,
  expectedRequestSha256: preparedRequestSha256,
  expectedPolicySha256: frozenV2PolicySha256,
});
// Save the v2 assessment; a block stops before reservation and POST.
// Send only the same prepared.body under the same trusted stage.
```

Focused command: `node --test test/jev-token-admission-v2.test.mjs` — **3/3 pass**, 0 failed, 0 skipped, 75.567834 ms. This covers the false-admit-shaped oversized repair, exact 24,000/24,001-byte boundary, unrelated question ID, unchanged planning behavior, mandatory stage, v1/v2 hash mismatch, request mutation and immutable returned policy. `node --check src/orchestration/jev-token-admission-v2.mjs` passed.

Read-only command: `node benchmark-runs/d069-token-admission/replay-v2.mjs`. [V2 replay 01](../../benchmark-runs/d069-token-admission/replay-v2-01.json) pins **147 historical files**, with **0 before/after hash changes**. It replays all 48 D068 requests and the actual probe-02 request. All **47 planning requests remain admitted**, with identical bytes, heuristic values and request hashes. The actual **70,510-byte false-admitted repair is blocked by v2**, specifically by its repair wire-byte rule. One actual v1 false admission is recorded; this is not a rate estimate from a representative prospective dataset.

New production source hashes: module `3a412347db08ce3abbff9a0ce3e40252df0c99f6f24cd8a830da52d2447e0af4`; contract `7583fe0c167d87be2b1897ad901424db2fc6db653dfb4eb84afba9a96ac47b53`. V2 writes are complete for root integration. Actual acceptance of a new below-ceiling repair request and completed repair remain unmeasured by this role. No provider call, real ledger change, dependency, Docker operation or historical evidence modification was performed.
