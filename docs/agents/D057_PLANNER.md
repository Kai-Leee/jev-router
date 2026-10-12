# D057 planner — opt-in assignment batches

2026-10-10. Owner: planner. Status: implementation and offline engine verification complete. Root owns live E2E wiring, prompt version, experimental batch size (intended 8), and shared decision/state records. No paid API requests, credentials, hidden grader inspection, commits or pushes performed here.

## Implemented contract

`runRecursivePlanning` adds `assignmentBatchSize = 1` (integer 1–32) and `respectResourceOptions = false`. Default request/tree behavior remains unchanged and existing v2 tests pass. Batch size greater than 1 only takes effect when **all input obligations** have empty explicit `depends_on`. Otherwise allocation stays sequential, including feasibility filtering. Unasserted dependencies remain visible uncertainty; empty explicit edges are not evidence of semantic independence.

Anchors are still selected sequentially. Each remaining chunk uses one request with `stage: assign_obligation_batch` and standard typed choice questions `assign_0`, `assign_1`, etc. `state.assignment_questions` maps these keys to obligation IDs. Each question lists the child IDs and their anchor/current ownership. The request keeps local source obligations, tests, dependencies, interfaces, evidence, constraints and policies. The adapter returns `answers` with exactly these keys and valid child choices, plus one request-level `usage.input_tokens` and optional model. Every answer is validated before any chunk owner is applied; the proposed split is validated and journaled before the task tree changes.

A batch counts once in attempted/answered decisions, usage and request/response events. Missing usage remains unknown. Partition provenance includes one decision object per batch containing answers, question mapping and common request hash; method is `typed_choice_batch`. Usage is not fabricated per obligation. The partition method is `distinct_anchors_then_batched_ownership`. Existing source coverage, exact test preservation, shared file serialization, cumulative token/call caps, uncertain-outcome stops and no-retry behavior still apply.

With `respectResourceOptions: true`, count options fit remaining global leaf slots and depth. A resource-forced count of one uses deterministic provenance with `resource_forced_keep: true`, resource reasons and `adequacy_assessed_by_model: false`; it is not a model adequacy decision. The plan still means specifications only. Each actual request refreshes `state.resources` with configured limits, remaining decisions, cumulative and known planning input tokens, remaining known token budget, current leaf count, remaining additional leaves and remaining depth. Null total token usage is not replaced by the known subtotal.

## Evidence and limits

Read role contract, AGENTS, current STATE, technical/decision/work/verification entrypoints, benchmark and agent README, D056 implementation, decision-record skill, engine and engine tests. A memory keyword check found only older connector material; current implementation decisions rely on repository sources.

Executed from `/Users/lee/workspace/plugins`:

```
node --test jev-router/test/recursive-task-tests.test.mjs jev-router/test/recursive-task-tests-batch.test.mjs
```

Result: **39 tests passed, 0 failed** (27 existing plus 12 new). New tests cover chunk ownership, source validation, standard client request validation, one-charge usage, current resource exposure, explicit-dependency fallback, malformed/missing/extra answers, token/call caps, journaling failures, uncertain outcomes, unknown usage, resource-forced keeps, option validation, default equality, shared writes and cross-child tests. These are deterministic offline fixtures, not observed provider compatibility or product completion gains.

`node --check` succeeded. These engine/test files are currently untracked, so rooted `git diff --check` alone had no coverage; explicit `git diff --no-index --check /dev/null <file>` checks for all three owned files completed without whitespace diagnostics. An earlier diff from the parent plugins directory interpreted the two filenames as a no-index comparison; it was not a meaningful repository diff and was replaced by the rooted check.

Next owner: root connects both judges to the same versioned prompt/codec and resource/batch settings, pins sources, and measures full development completion separately from planning. Engine worker dispatch and hidden evaluation remain outside this file's scope.
