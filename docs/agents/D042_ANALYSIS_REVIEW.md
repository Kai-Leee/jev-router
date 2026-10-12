# D042 concurrent comparison analysis review

Reviewed 2026-10-10 while both implementation workers were active. Scope: read-only inspection of `scripts/analyze-parallel-comparison.py`, saved plans, historical accounting evidence and each condition's events. The experiment source and frozen protocol were not changed. No provider or grading calls were made.

The analyzer attributes Claude usage and API-equivalent costs from each condition's own receipts. It attributes Jev input usage from that condition's decision response or inference-finished event. The shared ledger is recorded only as overall state; no shared-ledger delta is used as a cohort's cost. Started Claude calls without matching receipts cause operational totals to remain null, with known subtotals reported separately. Missing token or cost fields propagate null. An unresolved Jev response without usage also remains null.

Historical D040 planning is excluded from new operational calls and spend. Normalized goal-level figures allocate the same historical planner time and cost to each condition. These are accounting allocations, not new D042 calls.

`comparisons_valid` checks input compatibility, not successful or equal quality. Numeric time or cost differences can exist even when a grader fails. Final reporting must call these raw differences unless independently observed quality supports an efficiency comparison. Both conditions selecting single does not demonstrate a split benefit. Concurrent shared-account load and caching are not isolated.

## Separate provenance audit

The private artifact `benchmark-runs/d042-shared-plan-audit.json` records assertions and file hashes. All assertions passed:

- The current D040 analysis file matches SHA-256 `947b4ba07c5644d80f5558c05a119b0a393cf638cd598460e9fae25dc533fe11`, already recorded in `docs/decisions/D040.md`.
- The historical planner receipt exactly matches that pinned analysis's `plan_preparation`.
- The source frozen plan's planning fields, excluding its additional `response`, match the receipt. The additional response equals its plan.
- Each D042 condition's `planning.originalPlanning` equals the source planning object, including response.
- Both copied plans and saved plan hashes equal the source; their recorded source-file hashes equal the current source bytes. Both declare reused planning with zero new time and cost.

This audit was performed after D042 dispatch. It does not establish that D042 had pre-run hashes for historical planner or frozen-plan files. It does establish consistency with the already pinned historical planner accounting and current frozen source. It does not establish generated implementation quality.

At this review point, the auto condition had settled one Jev request with 11,205 input tokens and 59 output tokens. The ledger reported 50 settled requests, 95,992 charged input tokens and no pending reservation. Both conditions' implementation workers were still running; no final completion or grade is claimed here.

## Output continuation handling audit

The main runner reported incomplete JSON followed by a CLI-generated continuation request and another assistant message in both active streams. This reviewer inspected the parsing code without reading model thinking content.

`src/benchmark/runner.mjs:45` (`providerOutcome`) scans stream records for `type: result`, requires exactly one final result and validates provider status/model identity. It does not combine assistant text fragments. `scripts/tree-e2e-pilot.mjs:78` records the final result's usage and cost; line 82 parses only `outcome.completion.result` after removing optional outer Markdown fences. Earlier assistant fragments remain in raw logs but are not included by this parser.

The resulting risk is conditional: if the CLI final result contains only a continuation tail, artifact JSON parsing fails even when provider status is successful. If the CLI supplies a complete JSON object, parsing can succeed. This source inspection does not establish what the still-running CLI will return.

A synthetic offline probe passed two assistant fragments plus a successful final result containing only `]}` to `providerOutcome`. It returned `completed`; parsing its final result as JSON failed. No provider calls occurred. This verifies the parser boundary, not the actual outcome of either active run.

Count CLI invocations separately from distinct assistant messages and CLI continuation requests. One CLI invocation can contain multiple model turns. Aggregate billing must come from the final provider receipt when available; partial assistant usage fields must not be blindly summed. If artifact parsing fails after final receipt capture, usage can be known even though generation/grade fails. The pilot records such JSON parsing failures under its generic stopped code rather than a dedicated artifact-parse code.
