# D071 — Jev model and effort selection

Owner: `/root/d067_runner`. Research: 2026-10-11. Implementation handoff: 2026-10-12.

## Purpose and boundaries

Implement an opt-in, fixed-English typed choice that selects the actual Claude worker model and effort for each validated implementation leaf and selected repair task. The objective is complete public-task quality with lower total completion time and API-equivalent cost. Selection itself is not measured optimization. Root owns all runner/planner/executor integration and every authenticated call, Docker action and real ledger mutation.

Owned new files: `src/orchestration/adaptive-profile-selection.mjs`, `docs/orchestration/contracts/adaptive-profile-selection.v1.json`, `docs/orchestration/contracts/adaptive-profiles.v1.json`, focused tests, this note. Existing fixed behavior and historical runs remain unchanged.

## Work plan

1. Verify current official Anthropic model IDs, effort support, prices, and local Desktop Claude CLI version/flags without inference. Keep documentation support, current account availability, requested arguments, observed model identity, and measured performance separate.
2. Publish a source-pinned candidate set with explicit model/effort pairs and API-list price provenance. Unsupported candidates remain excluded; no invented rates or silent model substitution.
3. Build bounded typed-choice batches from final leaves, their public requirements/interfaces, workload, dependency role, remaining work and explicitly labeled optional historical evidence. Repair choices apply only to the chosen repair tasks and include observed public failures.
4. Validate complete answer coverage and legal choices atomically, then expose immutable selection/apply APIs. Root persists the selection before dispatch and verifies actual CLI arguments and observed identity.
5. Test illegal/partial choices, conservation, no input mutation, repair-only selection, provenance and unsupported candidates; report actual bytes separately from model-token admission.

## Initial findings

Existing `models.v2.json` is a documentation catalog, not current-account availability. Existing dashboard official-equivalent pricing only supports Opus 5.5; do not apply those rates to other models. Current official documents list Opus 5.5, Sonnet 5.5, Haiku 5.5 and Fable 5.1, but no new account probe has run for this task. Findings and exact candidate policy below will be updated after verification.

## Verified support and pricing

The current [Claude Code model configuration](https://code.claude.com/docs/en/model-config) documents the four exact model IDs below and low, medium, high, xhigh and max effort. Minimum CLI versions are Opus 2.1.280, Sonnet 2.1.284, Haiku 2.1.293 and Fable 2.1.257. Fable noninteractive calls can consume usage credits without an interactive prompt. The experiment must authorize candidates explicitly and treat account rejection as failure, not a silent substitute. The [effort reference](https://platform.claude.com/docs/en/build-with-claude/effort) describes effort as a behavioral request; it is not a strict token budget or proof of actual internal reasoning.

The observed local command `/opt/homebrew/bin/claude` is a symlink to the Desktop bundle `/Users/lee/Library/Application Support/Claude/claude-code/2.1.293/8433d0d9cd0d/claude.app/Contents/MacOS/claude`. `--version` returned `2.1.293 (Claude Code)`; `--help` exposes model and effort flags. This is not an independent Homebrew binary. The read-only receipt is `benchmark-runs/d071-profiles-research-01/cli-evidence.json`; no account query or inference ran.

Official standard [API list prices](https://platform.claude.com/docs/en/about-claude/pricing), USD per million tokens, checked 2026-10-11:

| Exact model | Input | Output | Cache write 5m | Cache write 1h | Cache read |
| --- | ---: | ---: | ---: | ---: | ---: |
| claude-opus-5-5 | 4 | 20 | 5 | 8 | 0.20 |
| claude-sonnet-5-5 | 2 | 10 | 2.5 | 4 | 0.10 |
| claude-haiku-5-5, prompt ≤100,000 | 0.10 | 0.50 | 0.125 | 0.20 | 0.01 |
| claude-haiku-5-5, prompt >100,000 | 0.50 | 2.50 | 0.625 | 1 | 0.05 |
| claude-fable-5-1 | 10 | 50 | 12.5 | 20 | 0.25 |

Haiku's prompt length includes all input categories and is priced per request. Aggregate CLI tokens cannot determine the tier of each request. Missing tier or cache-TTL evidence leaves independent recalculation unknown. CLI-reported cost remains a separate observation. OAuth incremental billing stays null. Opus rates are checked against existing `OPUS_55_RATES`; the legacy dashboard remains Opus-only and must not price other models using its rates.

All twenty documented model/effort combinations are represented explicitly. Current account entitlement and task-specific speed/quality are unverified; a catalog row is not a successful availability probe. Historical Opus receipts remain historical evidence. Profile descriptions are routing hypotheses, not benchmark rankings. `ultracode` is excluded because it would change orchestration rather than select effort.

## Fixed API and dispatch contract

- `loadAdaptiveProfileContract()` returns fixed question, candidate catalog, and SHA-256 sources including the existing model catalog and canonical Opus pricing file.
- `resolveAdaptiveProfile(profile_id, {cli_version, allowed_profile_ids?})` resolves an exact allowlisted model/effort and price provenance. Unsupported versions or IDs fail locally.
- `buildAdaptiveProfileRequest(input)` prepares one complete scope. `buildAdaptiveProfileRequests(input)` deterministically partitions selected implementation tasks in plan order: at most **two initial tasks or one repair task per batch**. An initial pair that exceeds the 48,000-byte engineering guard is prepared again as two single-task batches before any POST; a single task still above the guard stops locally without truncation. Input includes `plan`, `catalog`, complete `requirement_descriptions`, `cli_version`, optional explicit `task_ids`, `phase`, `round_index`, public `failure`, `prior_usage`, `historical_aggregate`, `remaining_work`, `selected_action` and byte `limits`. A repair action binds exact task/artifact writes and any explicit context reads; context reads grant no write permission.
- `projectAdaptiveProfileEvidence({failure, prior_usage, related_task_ids?})` returns `{failure, prior_usage, context_ref, report}`. It validates supported public failure revision/runtime bindings through the established repair projection, removes specified controller proof fields and normal successful evidence envelopes, and records every omission's original pointer/hash/size. Unknown failure semantics remain inline. Worker receipts use an explicit model-selection summary, with complete raw rows bound to a controller-only reference unavailable to the model.
- `selectAdaptiveProfiles({...input, decide, admitBatch?, record?, commit?})` prepares every batch before any callback. The runner supplies `admitBatch(request, metadata) -> {inference_allowed: true, ...}` for all-batch token admission; without it the module only proves byte preflight. A blocked admission produces zero decision callbacks. Each callback uses trusted stage `profiles`. There is no automatic retry. Complete legal responses for all batches are required before selected events or a single overall commit; a later failed batch preserves earlier response evidence while returning no assignments and no dispatch.
- `applyAdaptiveProfileSelections({plan, selection})` returns `{plan, profiles, selections, profile_revision, source_plan_sha256, applied_plan_sha256, dispatch_allowed}`. The `profiles` object is keyed by exact profile ID. Only `workers[].profile_id` changes in the existing DAG schema; task order, requirements, artifacts, edges, checks and graph revision remain unchanged. A separate profile revision binds the original plan and selections. Source drift, answer drift, price/model/effort tampering and plan mismatch fail before application.

Selection items carry `task_id`, `worker_id`, `profile_id`, exact `model` and `effort`, their batch `decision_id`, `choice_id`, `question_id`, `phase`, `round_index`, `price` and `provenance`. A group `selection_id` binds all batches. `adaptive_profile_decision_requested` and `adaptive_profile_decision_completed` precede `adaptive_profile_selected`; all have stage `profiles`. The worker receipt must link these IDs to actual CLI model/effort arguments and observed models. The CLI flag is evidence of a requested effort, so `effective_effort_verified` remains null without provider acknowledgement. A returned model mismatch must fail; automatic substitution does not count as the selected profile.

When `commit` is absent, selections remain planning output and `dispatch_allowed` is false. A commit failure also blocks dispatch. Root persists the profile-plan wrapper before workers. Fixed-profile arms do not invoke this module. Repair uses explicit selected task IDs, fresh phase/round binding and previous public failure/profile usage; unaffected worker profiles stay unchanged. A repair must not broaden write scope merely because it selected a different model.

Every question's fixed English template names its exact task ID, worker ID, selected artifact IDs and writable paths in the instructions themselves. Question keys and `state.tasks[].question_id` only provide transport mapping; the module does not depend on a question key influencing model reasoning. Two tasks therefore have distinct literal target instructions without an LLM generating new questions.

## State projection and request preflight

For each batch, the model receives exact requirement text and source quotes for units owning selected writable artifacts, relevant interfaces and paths, workload counts, dependency roles, candidate prices/support and public failure/history. Initial selection includes declared direct-input interfaces. Repair selection includes complete interfaces for selected writes and explicit causal reads; other direct inputs retain artifact/path/producer/count information while full implementation details stay in the worker context. A unit with multiple artifacts retains every requirement even when only one artifact may be repaired. Other outputs of the same task do not import unrelated units' full requirements. Original leaf workload remains explicitly labeled context; selected write fields govern repair. Remaining repair work uses exact original scope counts rather than a repeated vector for all tasks. No completion or duration is inferred.

The repair action is already chosen. Its task/artifact/read IDs, reason and attribution caveat remain inline; repeated proof references and requirement source locations stay in controller metadata. Requirement text and source quotes are unchanged. A single context hash binds source/catalog/plan/contracts/evidence provenance. Shared candidate support/price metadata uses readable defaults and reconstructs exactly to the original catalog. These are declared projections, not a claim that all omitted information was duplicate. No hidden tests are read.

All observed failure/assertion identities, full error messages, expected/actual description values and not-reached/unexecuted distinctions remain available. Known description source hashes and JSON pointers move to controller provenance; an exactly duplicate source/runtime observation is stored once with `source_equals_runtime:true`. Plain complete successful public checks are aggregated by check/case/assertion counts, and local checks by task/check/assertion counts. Unknown success or failure semantics keep their original rows. Raw inputs and each omission pointer/hash/size remain in the evidence artifact.

History reuse requires the same check ID, test ID and assertion ID, deep equality of the complete observation and exactly one current matching failed case. Changed, ambiguous or unknown observations remain literal. A readable `same_as_current_public_case` refers to the current inline observation; it does not imply unchanged files or causes. When every complete ordered before/after observation is also exactly equal and individually verified, `failures_after:{same_as_failures_before:true}` avoids a second identical array. Action IDs, actual changed files/artifacts and persistent/new/resolved failure distinctions remain. No external lookup or string dictionary codec is needed.

Only selected-task and explicit causal-task receipts remain inline as typed task/round/status/cause/model/effort/CLI argument/identity/wall/four-token-category/API-equivalent cost summaries. All supplied receipts also contribute to exact model-and-effort aggregates in a readable `columns`/`rows` table. A numeric metric is a complete total with no missing values; an incomplete metric is `{known_subtotal, missing_count, complete_total:null}`. Per-receipt unknown fields remain null. Complete raw receipts, transport details and provenance stay controller-only. CLI requested effort is not verified provider-internal effort, worker completion is not public-check success, summed worker time is not E2E time, and no Haiku tier or actual OAuth charge is inferred.

The preserved first full-scope preview (`benchmark-runs/d071-profiles-preview-01`) had 112,528 wire bytes for actual D070 ten-leaf planning and 163,370 bytes for the historical offline atomic21 branch. Transport's unchanged estimator rejected the former at estimated 32,439 per-question tokens and the latter at estimated 36,813 per-question /65,860 whole-request tokens. These are heuristic estimates, not measured Jev input tokens, and no POST was made.

Previews02 and03 remain immutable intermediate evidence. Preview03 did not load historical worker receipts. **Historical preview04** used the then-current four-initial/two-repair policy, literal target questions, actual prior receipts and separate raw request/metadata/admission files:

| Offline input | Batches | Wire bytes | Largest estimated per-question tokens |
| --- | ---: | --- | ---: |
| Actual historical D070 ten-leaf plan | 3 | 62,047 / 59,916 / 26,037 | 21,828 |
| Historical offline atomic21 mock plan | 6 | maximum 44,880 | 14,965 |
| Actual D070 round0 failure + only 10 initial worker receipts | 1 | 48,040 | 19,702 |
| Historical eight description failures in a synthetic current-check envelope + all 12 actual prior receipts | 2 | 72,957 / 65,080 | 28,546 |
| Same causal input with synthetic D071 profile-link/CLI receipt fields | 2 | 76,689 / 68,812 | 30,039 |

All fourteen historical requests passed the heuristic admission, but this was insufficient: a prior actual D069 70,510-byte request with estimated 28,690 tokens was rejected with HTTP400 `model_input_limit`. Therefore preview04's 76,689-byte/30,039-token estimate did not establish safety or acceptance. Preview05 measured the same inputs as two/one-task chunks before the current purpose projection; its 48,040–71,974-byte repair maxima remained above the new 48,000-byte guard. These intermediate receipts and source snapshots remain unchanged.

The final `benchmark-runs/d071-profiles-preview-06/receipt.json` covers the current two/one-task policy and the actual root v4 public recheck (85 passed, 8 failed). Current receipts and the one-entry repair history use explicitly synthetic binding/metadata for offline sizing. The maximum-row fixture represents all twenty legal model/effort groups and reuses historical numeric values only as shape data, not observed model performance.

| Final offline input | Prepared requests | Maximum wire bytes | Maximum estimated per-question tokens |
| --- | ---: | ---: | ---: |
| Historical actual ten-leaf initial plan | 5 | 38,656 | 14,814 |
| Historical offline atomic21 plan | 11 | 29,803 | 11,239 |
| Historical actual round0 repair, initial receipts only | 1 | 24,421 | 10,254 |
| Historical causal envelope, twelve actual receipts | 4 | 38,254 | 15,787 |
| Historical causal envelope, synthetic current receipt metadata | 4 | 38,896 | 16,044 |
| Actual v4 failure, all six legal repair candidates | 11 | 40,276 | 16,596 |
| Same actual v4 failure plus one synthetic history entry | 11 | 44,175 | 18,156 |
| Same history with twenty synthetic model/effort aggregate rows | 11 | 47,659 | 19,549 |

All 58 requests passed the byte guard and current heuristic admission locally. The first five comparison shapes now require 25 requests versus historical preview04's 14; additional batching overhead must count in total execution time and cost. The maximum has only 341 bytes of the engineering guard remaining, so larger or changed future evidence can still stop locally. This is not a provider byte limit or token proof. Unknown/changed observations are never discarded merely to fit. A final conservative history guard was added after preview generation; `final-source-verification.json` binds the frozen source and reproduces all 58 request bodies and metadata exactly. Requirements, legal profiles, failure semantics, history observations, all public case counts and usage aggregates/missing counts passed conservation checks. No provider request ran.

## Verification and handoff

`node --test test/adaptive-profile-selection.test.mjs`: **8/8 passed**. Tests cover source/CLI/price-tier contracts, literal task targets, exact model-default reconstruction, typed choices and immutable application, malformed/stopped/uncertain answers, repair artifact scope and intact unit requirements, failure/not-reached/unknown semantics, unique check/test/assertion history reuse versus changed/ambiguous observations, source/plan/profile/answer drift, deterministic oversized-pair fallback, a blocked single task with zero callbacks, all-batch admission, and later-batch failure with zero dispatch. These are local contract tests, not model-quality or paid CLI tests. Final source hashes and both preview/final-source receipts are recorded in `benchmark-runs/d071-profiles-research-01/source-handoff-03.json`; handoffs01/02 remain historical.

Owned production sources are new files; no historical source, candidate, request, ledger or fixed-profile implementation was edited. Root owns integration, independent review, complete regression and actual comparison. Provider calls by this agent: 0. Actual account availability, profile-quality tradeoffs, total completion time and cost benefit remain unmeasured until the new run receipts exist.

