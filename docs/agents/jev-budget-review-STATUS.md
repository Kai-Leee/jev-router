# D-020 Jev budget integration review — 2026-10-09

Owner: `/root/benchmark_runner_review`. Read-only review under
[integration review](JEV_BUDGET_INTEGRATION_REVIEW.md),
[budget implementation contract](JEV_BUDGET_IMPLEMENTATION.md), and
[feasibility research](../research/JEV_BUDGET_FEASIBILITY.md).

No confirmed remaining cost-control or integration defect was found in the
reviewed paths. One pre-POST diagnostic/call-count gap was reported, fixed by
main, and reverified. This conclusion applies to the **conditional conservative
token-valuation policy**. It does not establish a provider-enforced actual USD
charge ceiling or remove the research document's unresolved provider assumptions.

The reviewer changed only this status document. No model, account, credential,
auth, Docker or external network calls were made. All POST counts below are
mock function invocations, never live inference.

## Findings and resolution

**BR-01 — pre-POST budget rejection lost diagnostic/count evidence (P2, fixed).**

A malformed credits GET response occurred before reservation/POST. Telemetry
correctly recorded `budget_blocked`, `INVALID_RESPONSE`, and
`outcome_uncertain:false`, but the dashboard showed only generic
`DECISION_FAILED` and `attempted:null`, with a legacy-record warning. Main added
budget-blocked incidents and zero-current-run inference evidence when intact
records establish a pre-POST rejection. Current reproduction shows POST 0,
attempted 0, `INVALID_RESPONSE` visible, stopped/failed status, and no uncertain
paid outcome invented. The gate's generic code remains alongside the specific
incident; the underlying diagnostic is preserved.

No confirmed defect requiring a budget-core change was reported by this
reviewer. The budget author independently added receipt uncertainty rejection
and changed-ledger verification on close before finishing.

## Verified behavior

| Boundary | Current evidence |
| --- | --- |
| Reserve before paid dispatch | Actual ledger contained the full 65,536-token pending reservation inside the mock POST callback. |
| Shared spend across runs | First run settled 100 tokens; after close/reopen, a second run settled 200; shared total was 300 rather than a fresh 200. |
| Unknown outcome | A thrown transport error left 65,536 tokens reserved. Close/reopen plus a new decider blocked its POST with `BUDGET_OUTSTANDING`; only the original mock POST occurred. |
| Credit fallback / incomplete billing | Invalid credits settlement retained the full reservation and stopped later calls. Missing fields are not zero refunds. |
| Concurrent owners | A second object/process cannot hold the ledger's exclusive lock. |
| Integer budget boundary | After 25 maximal settlements, charged 1,638,400 tokens equalled $0.98304; the next full reservation was denied. Focused tests additionally reach the exact 1,666,666-token policy limit. |
| No arbitrary count ceiling | Configs retain `max_decisions:null`; tests permit 65 small settled calls. Count remains limited by actual token valuation and operational boundaries. |
| Restart/file uncertainty | Corrupt data, symlinks, changed/deleted ledger, lock replacement and reservation/settlement write failures stop further work. Stale locks are not automatically removed. |
| Actual billing | Budget snapshots and dashboard projection retain `actual_billed_usd:null`. Token valuation is a separate field, not a relabelled provider charge. |
| Small decision path | `scripts/check-budgeted-jev.mjs` uses the same validated config, `createTokenBudget` and measured decider, with an exclusive trace and exactly one explicit call. Source reviewed only; not executed by reviewer. |

Both concrete prepared configs were passed through actual `validateRunConfig`:

- `benchmark-runs/d020-e2eswe-run.json`
- `benchmark-runs/d020-personal-os-run.json`

Both resolve to the same absolute ledger:
`/Users/lee/workspace/plugins/jev-router/benchmark-runs/jev-usd1-budget.json`,
with `max_usd:1`, rate `0.6`, reservation `65536`, and `max_decisions:null`.
No independent allowance was created for the second workload or the small call.

## Commands and results

From the `jev-router` root:

```sh
node --test test/benchmark-budget.test.mjs test/benchmark-telemetry.test.mjs test/benchmark-mcp-runtime.test.mjs test/dashboard-metrics.test.mjs
node --test test/benchmark-budget.test.mjs
node /private/tmp/jev-budget-integration-review.7QVmLL/audit.mjs
```

- Combined focused run: **110/110 passed** at the 38-budget-test snapshot.
- After the author's last two core regressions: **40/40 budget tests passed**.
  The earlier integration run contains 72 other passing cases; these are not
  additional unique tests to add to the full project suite.
- Independent four-scenario integration script passed before/after BR-01 fix.
  Each repeat creates a fresh private fixture directory; `results.json` records
  exact mock event/ledger/projection evidence. Original defective projection is
  retained in the top-level temporary `results.json`; later `pass-*` results
  show the fix.
- Separate arithmetic/lock and actual-config equality checks passed. Source and
  tests were imported locally; no Docker process or live provider was used.

## Limits of this review

The configured reservation is based on the stated 65,536-token context policy
and a $0.60-per-million valuation. Public evidence does not prove that upstream
gateway retries or billing can never exceed that amount, and a local ledger
cannot atomically lock other clients' account spending or prevent provider
credit fallback. The implementation detects contradictions and stops; detecting
a contradiction after a response cannot undo a provider charge. Main owns the
user-facing description of these assumptions and any separately authorized live
execution. Test success must not be reported as a measured billing guarantee.
