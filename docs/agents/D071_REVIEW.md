# D071 independent review

Date: 2026-10-12 Asia/Seoul. Reviewer: `/root/d071_review`.

Role: read-only review of D071 integration, separate from implementing agents. Own only this record and `benchmark-runs/d071-review-*`. No inference, Docker, ledger writes, historical candidate changes, or hidden-grader inspection.

Status: **frozen-source prelaunch review passed**. Findings R1/R2/R4 are corrected; R3's known fixture now passes the explicit V3 operating guard. Approval covers the pinned offline preparation and permits the authorized experiment to proceed through root's remaining launch gate. It is not a completed product, provider-acceptance or efficiency result.

## Findings

### R1 — P1: batched profile questions did not identify their target in model-visible question content

Observed in `src/orchestration/adaptive-profile-selection.mjs:208-211` and `docs/orchestration/contracts/adaptive-profile-selection.v1.json:20` before correction. All task questions in a batch had identical instructions and criteria. The task mapping existed only in the question ID and common state. The fixed instruction referred to “this question's task mapping” without identifying the target task in its own content.

The official [TypeSafe skill](https://github.com/typesafe-ai/skills/blob/main/skills/typesafe-ai/SKILL.md), checked with web search on this review turn, states: “Question IDs are for code and are not sent to the model; include complete meaning in the question.” Jev's [hosted endpoint reference](https://jev-ai.pro/docs#request-body) describes the shared state and per-question definitions, but does not promise question-ID visibility to inference.

Offline reproduction used `buildAdaptiveProfileRequests` with the preserved D070 planning/public-input files, CLI version `2.1.293`, and no provider callback. The three batches contained 4, 4, and 2 questions but **1 distinct question payload per batch**. Exact payloads, source hashes and mappings are preserved in `benchmark-runs/d071-review-01/question-target-before.json`; provider calls were 0.

Correction: a fixed document template now puts each task ID, worker ID and target writable scope into the question's instructions. The first independent recheck (`question-target-after.json`) found 4/4, 4/4 and 2/2 distinct question bodies, with the task/worker/scope present independently of object keys. Final `question-target-final.json` verifies five batches of two distinct questions against the frozen 2/1 policy; every body contains its task, worker, artifacts and writable paths. All five have exact measured serialization and estimated admission; the original plan/input is unchanged.

### R2 — P2: repair context retains the initial fixed profile after actual per-task selection

Observed in `src/benchmark/adaptive-dag-runner.mjs:754-757`: initial profile application replaces `planning.plan` but leaves `planning.execution_context.profile_id` as the original fixed Opus profile. `src/orchestration/adaptive-artifact-repair.mjs:99` and `adaptive-artifact-repair-v2.mjs:160` copy that context into repair decisions and worker packets. The executor also holds an initial planning clone across repair rounds.

Consequently a profile-selected worker can have a different actual CLI model/effort while its repair scope packet still represents a fixed Opus context. The outer worker prompt does carry actual selected execution model, creating conflicting context rather than changing dispatch itself.

Correction: the runner now labels the planning-time profile as `initial_planning_profile_assumption`, sets scalar `profile_id` to null for the dynamic arm, and exposes current `worker_profiles`. After repair selection, the executor updates both its planning worker map and `execution_context.worker_profiles`. The actual requested profile still resolves through the allowlist to CLI arguments and invocation receipts. Final focused regression covers current repair profile context and actual CLI argument/receipt identity mapping. Provider-internal effective effort remains unverified.

### R3 — execution limitation before freeze: one retained unresolved repair exceeds the inherited wire ceiling

The final codec preview `benchmark-runs/d071-repair-preview-02/result.json` records a 23,909-byte first repair request, but 25,948 bytes after one synthetic unresolved repair with its actual changed-file and persistent-assertion history. `src/orchestration/jev-token-admission-v3.mjs:23-24,55` inherits and enforces the 24,000-byte engineering ceiling for repair. Such a second repair request stops before budget opening or POST even though the experiment permits additional repair rounds. The first preview has only 91 bytes of room; current profile-context or real checker evidence can also increase its size.

The history scenario reuses historical observed failure values with explicitly synthetic current binding metadata. It is evidence of a local size/admission boundary, not a new product failure or provider rejection. Root notified before launch; treatment of this known boundary remains pending. No proposal to silently discard failure/history or weaken the provider token guard is approved by this review.

Root subsequently chose readable projected JSON for all new arms and a V3-only 48,000-byte operating ceiling. V1/V2 and the 32,000/64,000 token estimates remain unchanged. The older 70,510-byte D069 request was falsely admitted by the estimate but rejected with HTTP400 `model_input_limit`; therefore an estimate or a larger byte ceiling is not evidence of model acceptance. A preliminary reviewer suggestion of 64,000 bytes was withdrawn after rechecking that counterexample. The final choice is an uncalibrated operating policy. The experimental dictionary encoder is retained offline and is not the live protocol.

The actual-v4 plain preview initially measured 38,866 bytes and 61,988 bytes after one synthetic unchanged repair history. The latter still exceeded the new operating guard. Root approved only exact full-observation reuse: before/after values become an inline current-case identity reference only when every observation field matches one unique current failed case. Changed messages, provenance, extra fields, earlier assertions, duplicate current identities and uncertainty preserve literal values. Current public case bodies remain inline. File revisions and other history remain distinct.

Independent production-chooser replay on final causal projection SHA `44b3bdb5b60d47de425d40fea67f0e1dfe6b2f56d6df541f215885aa3e84b9d1` matches the saved request body and serialized hash. `preview04-independent.json` records **38,866 bytes initially, 44,542 bytes with one unchanged history, and 45,737 bytes with one changed historical observation**. All three are `admit_estimated`. Complete original state, candidate authority and history restore exactly; the changed observation remains literal and only its 15 unchanged peers are references. The observations are actual public93 reports, while DAG binding, profile-context shape and repair history are synthetic sizing fixtures. No new repair or provider acceptance is established. More history or a different failure can still exceed the guard and stop safely.

### R4 — P2: historical requirement attribution did not distinguish assertions in the same test

Observed in `src/orchestration/adaptive-causal-packet-encoding.mjs:61,82-84`: the helper deciding whether historical failure attribution is known compares check ID and test ID but omits assertion ID. A prior `A.old` and current `A.current` within `T.same` can therefore share the current requirement map. The old assertion stays in history while its distinct `R.old` requirement is removed from the chooser as a known unrelated unit requirement. This contradicts the policy to retain original requirements when historical attribution is unclear.

The small offline counterexample is preserved in `benchmark-runs/d071-review-01/history-attribution-before.json`. It is a general projection-boundary fixture, not an observed D070 product fault. The owner added exact historical check/test/assertion equality, treating null as equal only to null. Independent `history-attribution-after.json` confirms the old/current assertion example now retains both original requirements and restores the whole input exactly. The final focused regression includes this counterexample and changed/duplicate/unknown-observation reference boundaries.

## Checks already run

Command from the repository root:

```sh
node --test test/adaptive-causal-repair.test.mjs test/adaptive-causal-execution.test.mjs test/adaptive-profile-selection.test.mjs test/jev-token-admission-v3.test.mjs test/public-audit-v4.test.mjs test/artifact-transport.test.mjs
```

Result: 35 tests passed, 0 failed, 0 skipped; runner duration 5,031.791459 ms. Output preserved in `benchmark-runs/d071-review-01/focused-tests-before.txt`. This is offline contract verification, not provider or candidate E2E evidence. The green profile tests had not tested task-target meaning; R1 is a gap in those checks.

The reviewed paths currently connect allowlisted profile values to CLI `--model`/`--effort`, verify observed model identity, hold effective-effort verification at null, validate immutable causal read hashes, keep causal writes narrow, and separate new public93 from historical85. These observations remain subject to final source freeze and actual receipt checks.

Additional command: `node --test test/artifact-read-sources.test.mjs test/preserved-artifact-repair-runner.test.mjs`. Result: 23 passed, 0 failed/skipped, 8,861.978042 ms. Output is `benchmark-runs/d071-review-01/overlay-preserved-tests-before.txt`. The later new public-gate tests were still being appended by their owner, so this run is not the final preserved-gate coverage count.

Read-only revalidation with `verifyFrozenControlEvidence({registryPath:'benchmarks/e2e-swe/public-checks/registry.v4.json',runnerPath:'benchmarks/e2e-swe/public-checks/run_public_checks_v4.py',path:'benchmark-runs/d071-preflight/public-controls-v4.json'})` accepted the root-owned Docker receipt against 47 current source pins, 8 normal suites and 83 defects. Receipt SHA: `d4eff0c8f436cadf4ea2ab898f17a31f3212dfd8b8bdae29f0bbc875685939a4`. This reviewer did not launch Docker. Output is `benchmark-runs/d071-review-01/public-controls-revalidation-before.txt`.

## Correction observations before freeze

The profile owner added a document-backed target template containing task ID, worker ID, artifact IDs and writable paths. Root also labels the initial fixed profile as `initial_planning_profile_assumption`, sets the dynamic context's scalar `profile_id` to null, and supplies `worker_profiles`. The executor updates those worker profiles after repair reselection. These source changes address the mechanisms behind R1/R2; the final frozen-source recheck remains pending.

`node --test benchmark-runs/d071-analysis-tools/analysis.test.mjs` passed 6/6, with 0 failures/skips and 91.188542 ms reported duration. This checks accounting and completion refusal conditions with fixtures, not new live savings.

The earlier causal codec experiment had two different boundaries: implementation interfaces were deliberately projected to non-retrievable worker-only references, while layout/object/string encoding was serialization-lossless. Its decoder roundtrip never established that Jev interprets dense encoding accurately. Root removed that codec from the live path. The current semantic projection is still intentionally not called lossless; controller reconstruction proves exactly which values were projected, while all worker requirements remain complete.

The earlier profile preview04 had 14 estimated-admitted requests, with a largest state-plus-question estimate of 30,039/32,000. It used initial groups of four and repair groups of two, so these numbers are historical preparation evidence. The final policy reduces initial groups to two and repair groups to one, adds a 48,000-byte local guard, and summarizes typed worker usage for the selected/causal tasks plus aggregates for all prior workers. A pair that exceeds the local byte limit is split into single-task requests before any provider submission; an oversized singleton blocks locally.

Integration checks also exposed profile history input growth and the extra groups created by actual model/effort selection. The owner removed repeated known metadata, retained exact changed observations, and encoded model/effort aggregates as ordinary named columns/rows. Numeric aggregates represent a complete total only when no values are missing; otherwise the known subtotal, missing count and null complete total remain explicit. The final `source-handoff-03.json` pins module `7442c53d1b742ffc1a232ebb83c76b0a4917aa46eeb1d24f9c0b7813606d6733`. Its 58 saved requests cover the current v4 public observations, all six legal candidates, history0/1 and a synthetic twenty-profile-group shape. The owner's final-source replay is exact for every request/metadata record. Independent `profile-preview06-independent.json` rechecks all 58 serialized hashes, literal targets and current admission; maximum is **47,659 bytes**, so the largest fixture has 341 bytes below the engineering guard. Any larger live shape must still stop locally rather than drop failure information. The profile groups/history binding are fixtures, not new performance measurements.

Independent `profile-history-final.json` separately regenerates all six candidate scopes with current history0/1 and historical receipts. Every request is prepared successfully and receives estimated admission. These receipt values are sizing data and do not claim that historical workers were new D071 profile selections.

## Frozen-source verification and approval

`benchmark-runs/d071-review-01/focused-final.json` records **91/91 passed**, 0 failures/cancellations/skips, **10,486.55 ms** wall time, and **285 source/evidence pins with no drift**. The explicit TAP command is recorded there and its output remains `focused-tests-final.txt`. Coverage includes causal projection/restoration, scope/history, current profiles, CLI model/effort dispatch, actual model-identity mismatch handling, 48k admission boundaries, public93 provenance/control binding, immutable read overlays, preserved candidate gate upgrades, and truthful measurement fixtures. No API, Docker or real ledger operation ran in this review.

Root's single whole-suite `npm test` run passed **1,190/1,190**, 0 failures/cancellations/skips, with exit0 and 40,424.427542 ms process wall time. Its first summary helper expected TAP `#` lines although Node emitted spec-reporter `ℹ` lines, yielding null counts and a helper exit1. The original log and incorrect summary remain unchanged. `regression-summary-02.json` reconciles the same log, records its hash and reports zero test reruns. This is a preparation-reporting defect, not a failed product test. The reviewer verified the original summary's npm exit0, corrected log identity and literal 1,190/1,190/0 result lines. Root's launch gate now uses the corrected summary. The independent focused helper explicitly requests TAP to avoid the same ambiguity.

Root's actual public candidate recheck remains **85 passed + 8 description failures out of 93**, with all 38 candidate file records unchanged (`public-candidate-recheck.json`). It validates the preserved failure starting point, not a successful repair or an independent63 grade. V4 control evidence was revalidated against the current 47 public source pins, eight normal suites and 83 negative controls.

The machine-readable approval is `benchmark-runs/d071-review-01/prelaunch-final.json`. It binds the verified source/evidence hashes and the above offline receipts. Root must retain its separate checks for unchanged historical evidence, settled original ledger, source freeze and launch authorization. No source change after approval is silently covered.

## Remaining live-result review

- Read new live request/response, actual model/effort receipts, causal history and independent63 result metadata after root executes them.
- Reconcile completion time, all token categories, known/unknown cost, preparation and separate preserved repair. Do not compute completion speedup for an incomplete arm.
- Require public93 and independent63 for new completion. Keep historical85/63 evidence separate; the structured Claude-only arm uses multiple sessions. One sample per fresh arm does not establish a general optimum, and shared host/account contention is a limitation.

Review side effects: this record and a new review notes directory only. Existing runs and production files are untouched by this reviewer.
