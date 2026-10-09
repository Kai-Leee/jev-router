# Dashboard independent review status

Date: 2026-10-09 (Asia/Seoul). Role: `DASHBOARD_REVIEW.md`.
Owns this status only; no source, auth, credentials, model calls, or application settings changed.
Reviewed `DASHBOARD_CONTRACT.md`, `DASHBOARD_RESEARCH.md`, metrics/reader/server/UI,
benchmark telemetry, runtime stream persistence and their tests.

## Findings

1. **P2 — positive token observations from failed Claude results disappeared.**
   In the initial `src/dashboard/metrics.mjs:172`, main-loop `usage` was accepted only when
   `!isError && !uncertain`. A final result with `is_error: true`, no `modelUsage`, and
   `{input_tokens:100, output_tokens:20, cache_read_input_tokens:0, cache_creation_input_tokens:0}`
   produced `observed:null` for every token field. Its cost 0.1 was correctly retained as a
   partial observation. Positive final usage should remain observed with unknown complete
   totals, while contradictory crash-zero placeholders must still not erase earlier stream
   observations. The original pure `summarizeRun()` reproduction is fixed and independently
   rechecked: input/output observations 100/20 survive with `value:null`.
   A remaining variant was then reproduced: the same positive final `usage` plus a nonempty
   all-zero error `modelUsage`, with no assistant stream, still selected zero observations.
   The zero-placeholder guard now also considers contradictory positive final usage. Two
   regressions cover that variant with and without assistant stream observations, without
   adding the overlapping sources. Both independently pass. **Resolved.**

2. **P2 — interrupted runs remained running indefinitely.**
   Initial `metrics.mjs:248–253` treated any manifest start time or journal row as current running
   evidence when no final receipt existed. A run started `2026-10-01T00:00:00Z` with a 60-second
   wall limit and an unresolved `inference_started` remained `running`, Jev uncertain count 0.
   A runner crash can leave exactly that durable prefix. Runtime liveness or an elapsed declared
   deadline must qualify the state; otherwise it is unknown, not confirmed running. Reproduced
   with a pure fixture. The fix passes snapshot observation time into the pure aggregator,
   applies the declared deadline plus a 30-second grace, and uses unknown when adequate clock
   evidence is absent. Independently rechecked through `readSnapshot()`: the stale run and its
   unresolved Jev request are uncertain. **Resolved.**

3. **P2 — cleanup failure did not affect run status.**
   A result with `process_exit:0`, `outcome_uncertain:false`, `claude_is_error:false`, positive
   usage and `cleanup:{stopped:false}` displayed `completed` without a cleanup warning. The
   launcher deliberately exits unsuccessfully for this condition because `/app` may still be
   changing. Preserve successful model-response observations, but mark the enclosing run
   uncertain/failed and expose a fixed cleanup warning. Independently rechecked after the
   metrics fix: the run is uncertain, the cleanup warning appears, and successful Claude
   inference/usage observations remain intact. **Resolved.**

4. **P2 — a partial UTF-8 tail discarded preceding valid JSONL records.**
   Initial `src/dashboard/reader.mjs:14–16` fatally decoded the entire file before the JSONL
   parser separated its pending last line. A complete assistant row with input 100 followed
   by an incomplete line ending with bytes `e3 81` yielded no Claude input observation or
   observed response count. The runtime writes original chunks, so split multibyte characters
   occur legitimately; a crash can leave that prefix. Decode newline-complete records first,
   preserve their subtotals, and classify the incomplete suffix separately. Reproduced using
   only a temporary synthetic run directory, removed afterward. The reader now decodes
   newline-complete byte records separately. The same reproduction retains input observation
   100 and one response stage while the complete total stays null. **Resolved.**

All four findings, including the finding 1 conflicting-source variant, were sent to main
promptly and are now fixed and independently rechecked. **No open actionable defect remains
from this bounded review.** This is not production, provider billing, or inference verification.

## Checks performed

Command: `node --test test/dashboard-metrics.test.mjs test/dashboard-server.test.mjs test/benchmark-telemetry.test.mjs`.

- Initial sandbox invocation: 35 passed, 3 HTTP tests could not bind loopback (`listen EPERM`).
  This was an execution-permission limitation, not an observed application assertion failure.
- The same command with authorized local loopback access: **38/38 passed**, zero failures/skips.
- After the first fixes, **46/47 passed**. The one failure was a new test fixture that nested
  `wall_timeout_seconds` inside `limits`, unlike the actual runner's top-level manifest field.
  Main was notified; a separate direct reader fixture using the actual schema passed.
- Final same-command rerun after all fixes and the corrected fixture: **49/49 passed**,
  zero failures/skips. Breakdown: telemetry 7, metrics 32, reader/HTTP 10.
- `node --check dashboard/app.js`, `node --check src/dashboard/reader.mjs`, and
  `node --check src/benchmark/telemetry.mjs`: exit 0.
- Four original reproductions independently pass after the fixes, including a combined stale
  run plus truncated UTF-8 suffix fixture. Its temporary directory was removed after inspection.
- Hand fixtures separately reproduced the four gaps above; the initial suite did not cover them.
- Source inspection confirmed fixed-route HTTP, loopback binding, Host/Origin checks, no mutation
  or arbitrary-file route, no external UI dependencies, and DOM `textContent` rendering.
- Reader tests rejected symlinked run directories/files and suppressed raw prompt/command/output
  and secret sentinels. No actual credential or auth file was read to perform this review.

## Measurement boundaries retained

- Jev POST dispatch intent is separate from model GET, gate-input, question and tool counts.
  Distinct request IDs are deduplicated; missing/failed/uncertain receipts remain in coverage.
- Claude assistant IDs describe observed response stages, not HTTP attempts or retry counts.
  Final modelUsage supersedes per-message/main-loop usage rather than being added to it.
- Claude price-table USD is separate from billed USD; Jev credits and paid-input-token debit
  remain distinct units. Unknown values remain null and synthetic/control records stay labelled.
- CLI completion does not imply independent evaluator success. Zero-test collection failure
  is different from assertions failing, and incomplete Personal OS criteria are not full success.
- Actual browser operation belongs to main. This review uses source, pure fixtures, subprocess
  fixtures and local loopback HTTP tests; it establishes no provider billing or model quality.
- The deadline/grace rule detects abandoned records; it is not a direct process-liveness probe.
  Missing clock/deadline evidence remains unknown, and no retry or resumed inference is triggered.

Review complete. Only this status file was edited; writing ownership is relinquished after
this final update. No external model traffic, keys/auth reads, container commands or settings
changes were performed by the reviewer.
