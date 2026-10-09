# Dashboard metrics role status

2026-10-09 (Asia/Seoul). Implementation complete; main integration/live verification remains separate.

## D-019 paired runtime follow-up — latest

Owned changes additionally include `src/dashboard/reader.mjs` and `test/dashboard-reader.test.mjs`.
The reader now discovers and safely reads `runner.jsonl`, `runner-heartbeat.json`, `gate-state.json`, and
`monitor-report.json`. New files obey the existing bounded regular-file/no-symlink/strict UTF-8 policy.

The snapshot now projects `run_id`, `attempt_id`, `group_id`, `agent_role`, `execution`, `incidents`, and
`monitor_report`. It distinguishes an explicitly null unlimited limit from an absent/invalid unknown limit.
Monitor mode has zero Jev inference by its contract and independently reports observed Claude usage.
Mismatched run/attempt/group/role records are excluded with an observation-gap warning, never combined.

D-018 failures addressed:

- Recoverable nonzero tool exits retain exit code, decision ID and recovery permission; later successful
  tool execution does not erase the earlier incident. Gate halt is separate from runner writer activity.
- Rejected input, model lookup failure, provider failure, durable gate stop and independent gate-state
  fallback expose allowlisted incidents. GET/validation errors are not paid POST counts.
- Claude final alone enters runner finalization and cannot establish overall completion. Missing runner
  terminal after the deadline remains uncertain even when provider usage is valid and complete.
- A CLI exit of zero requires a valid provider result and frozen artifact before displaying overall completed.
  Explicit runner outcomes are consumed separately; provider completion survives wrapper-only freeze/log/gate
  uncertainty. Independent evaluation remains separate from implementation completion.
- Heartbeat age is writer activity only. The 15-second freshness policy is a local display rule, not an SLA
  or proof of process death, useful progress, or screen connection. Deadline grace remains 30 seconds.
- Evaluator `model_calls:0` no longer infers candidate `control` provenance. Evidence kind must be explicit.
  Evaluation may link `evaluates_run_id` and a validated artifact SHA-256 without inferring candidate origin.
- Monitor findings are accepted only for the monitor role as bounded expected fields. Arbitrary raw metadata
  is omitted; credential/private-path patterns are rejected. Findings remain assessments, not evaluator proof.

Latest focused command from `jev-router`:

```sh
node --test test/dashboard-metrics.test.mjs test/dashboard-reader.test.mjs
```

Result: **58/58 passed** (49 metric cases + 9 reader cases), failures 0, skipped 0. No live requests.
The reader fixtures create OS-temporary directories and remove them through test cleanup.

During integration, the first existing-suite run showed 3 failures because older tests treated evaluator zero
calls as control provenance and absent cleanup as completion. Those expectations were corrected with explicit
control/freeze evidence or uncertainty, and new regression cases exercise the stricter requirements.
Reading the actual new runner exposed another semantic change: `result.outcome_uncertain` now covers wrapper
cleanup/gate/journal failures. The Claude projection therefore prefers provider lifecycle evidence, avoiding
loss of confirmed provider usage because an unrelated wrapper phase failed.

No Docker, provider requests, key/config reads, server changes, commit or push were performed by this role.
Main owns end-to-end runtime/browser verification and any actual model execution; focused fixtures are not live
model, actual charge, independent-process-liveness or evaluation-quality evidence.

## Purpose and owned files

- `src/dashboard/metrics.mjs`: pure `summarizeRun(...)` projection from parsed records into the shared dashboard contract.
- `test/dashboard-metrics.test.mjs`: hand-calculated usage/count/cost/privacy regressions.
- This role status only. No shared runtime, server, UI, private config or existing Personal OS changes.

## Measurement semantics

- Jev counts unique `inference_started` request IDs. Starts are dispatch attempts, not proof of server receipt.
  GET, question count, tool calls and historic gate `input` records are never promoted to POST totals.
- Matched successful receipts provide raw input/output tokens, credits and paid-input-token billing units.
  Failed/pending/uncertain requests remain in expected coverage. Unknown USD does not become zero or a credit conversion.
- Duplicate identical receipts are counted once; conflicting receipts are excluded and flagged uncertain.
  Orphan receipts retain observed subtotals but not a complete attempt total.
- Claude uses final `modelUsage` across models before main-loop-only final `usage` fallback. Cache read/creation
  stay separate. Per-message output placeholders are not summed. Assistant IDs count observed response stages,
  not underlying HTTP requests. CLI process outcomes are separately identified in fixed semantics text.
- Claude reported USD is a price-table estimate, not subscription/API actual billed USD. Crash zero placeholders
  cannot erase earlier token observations. Multiple final records use the latest cumulative record only.
- Positive final/main-loop usage from failed Claude runs is retained as a partial observation with null complete
  totals. The contradictory all-zero placeholder guard does not discard valid positive error receipts.
- The optional `observedAt` argument comes from the reader's snapshot timestamp, not an internal clock. Without
  a terminal record, the declared `started_at + wall_timeout_seconds + 30 seconds` boundary marks a stale run
  uncertain and unresolved Jev/observed Claude outcomes uncertain. Missing or contradictory time/deadline evidence
  yields unknown current liveness; completed records are unaffected.
- Explicit `cleanup.stopped: false` marks the overall run uncertain because its container artifact was not
  confirmed frozen. Valid completed Claude inference and usage remain completed; cleanup is not a model failure.
- Invalid/partial records preserve known subtotals and set complete totals to null. Loader issue codes prefixed
  `decisions_` or `claude_` affect only that provider; generic issue codes conservatively affect both.
- Only allowlisted fields, normalized identifiers, numbers and fixed Korean messages reach the browser. Raw prompt,
  shell command, output, account/private path and arbitrary error text have no pass-through field.
- Completion claims and successful CLI exits do not imply independent evaluation success. E2E zero-collected-tests
  and Personal OS not-run native/browser criteria keep their own evaluation state.

## Actual validation

Run from `jev-router`:

```sh
node --test test/dashboard-metrics.test.mjs
```

Latest result after independent review fixes: **32/32 passed**, failures 0, skipped 0. No API/model requests. Tests cover unknown vs measured zero,
GET/input vs POST attempts, duplicate/conflicting/orphan receipts, partial coverage, malformed billing, multiple
Claude models and cache units, assistant repeats/output placeholders, error-zero preservation, loader issues,
invalid JSONL record types, malicious metadata/privacy, evaluation boundaries, invalid numeric sums and actual zero.
The 5 added tests reproduce positive failed-final usage loss, positive failed legacy usage, an expired run without
terminal output, exact grace/completed-run boundaries and missing or invalid liveness evidence.
Two more regressions verify failed container freeze produces overall uncertainty while preserving successful
Claude usage, and confirmed/absent legacy cleanup does not fabricate a cleanup failure.
Two further tests cover contradictory all-zero error `modelUsage` alongside positive final `usage`, with and
without assistant stream records. Positive final main-loop usage is retained once as a partial observation.

During own audit, two gaps in the first 18-test version were found and corrected: conflicting legacy receipts
previously selected the last subtotal, and error results containing nonempty all-zero `modelUsage` could erase
prior stream input observations. The final suite explicitly exercises both cases.

Independent review then found two additional P2 defects in the 23-test version: positive failed-final `usage`
without `modelUsage` was dropped, and an old start record could remain "running" forever after a crash.
Both were corrected and covered by the 28-test focused run. Main owns reader propagation of `observedAt` and
end-to-end server/browser checks; this role does not claim that integration from the pure-function tests alone.
Further review found a third P2: a successful Claude exit with `cleanup.stopped: false` displayed overall completed
even though the runner reports a failed freeze boundary. The run now becomes uncertain with a fixed warning;
the independently valid model result remains completed. The focused suite now passes 30 tests.
The reviewer also reproduced an F1 variant: the zero-placeholder guard used positive assistant evidence but
missed contradictory positive final `usage` when no assistant stream was present. The guard now considers both
sources and selects the positive final usage once, never adding it to per-message usage. The final focused suite
passes 32 tests.

## Remaining limits

- Receipt arithmetic and privacy projection are tested using synthetic in-memory objects. This is not evidence of
  actual Claude/Jev billing accuracy, model performance or end-to-end browser behavior.
- Real run files must be safely loaded by the main-owned server. This module intentionally performs no filesystem,
  clock, network, authentication or inference operation.
- USD billing is not queried; missing values remain null. Partial live Claude token observations may exclude hidden
  helper/subagent requests until an authoritative final modelUsage appears.
- No paid run, installation, server process, Docker operation, commit or push was performed by this role.
