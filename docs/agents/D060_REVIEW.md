# D060 independent review

Reviewed 2026-10-10. Reviewer scope: read-only source/test audit; this document only changed. No inference, worker development run, product grading, ledger mutation or hidden grader access.

## Evidence

Executed from repository root:

```sh
node --test test/sequential-allocation-v2.test.mjs test/worker-verification-gate.test.mjs test/bounded-verified-workflow.test.mjs
```

Result: 37 tests passed, 0 failed, 0 skipped; TAP total duration 361.192625 ms. These are mechanics/fixture checks, including actual local Node subprocesses, not the product's independent 63 tests or its 85 public specification checks.

Reviewed `src/orchestration/sequential-allocation-v2.mjs`, `docs/orchestration/contracts/sequential-allocation.v2.json`, `src/orchestration/worker-verification-gate.mjs`, `src/orchestration/public-check-registry.mjs`, `src/orchestration/bounded-verified-workflow.mjs`, their tests, and reused envelope/executor boundaries.

## Findings requiring integration attention

**Current correction after implementation updates:** Findings 1 and 2 below describe the initial audited implementation and are now resolved for the named contracts. Re-read the updated workflow/gate and reran the same targeted command: **51/51 passed, 0 failed, 0 skipped, 280.884708 ms**. The workflow now validates callbacks, concurrency and allowed write paths before `decide`. The gate rejects explicit non-success statuses and all three supported uncertainty flags before verification; only `completed`/`success` explicit statuses pass. Legacy status-absent artifact returns remain supported intentionally. Finding 3 and the product-mapping limitations remain unresolved; no real product experiment was performed.

1. **Pre-inference configuration validation was incomplete at initial review.** The workflow checked public mappings before planning, but validated executable callbacks and execution paths only after `allocateSequentialV2`. A nonempty registry with a missing `execute`, `runCheck`, `getArtifactRevision`, invalid concurrency, or invalid execution paths could spend on planning before a locally detectable error. Validate controller configuration before `decide`. Root notified; recheck any subsequent fix separately.
2. **Execution failure contract is throw-based.** The gate initially accepted any resolved `execute` value; `{status:'failed'}` alone would still proceed to verification. The controller must throw on failed/uncertain execution (existing execution adapter convention), or enforce an explicit result contract. This is a callback integration boundary, not evidence of a failed product run.
3. **Shared checks can require future implementation.** Every test referencing an assigned obligation is linked to that worker. A check covering multiple workers' requirements can therefore block worker 1 before a necessary successor exists. Product mapping needs executable worker-local checks plus explicitly scheduled cross-worker/integration checks or dependency-ready prerequisites. Do not claim all 85 current descriptions are independently executable at each worker gate.

## Confirmed mechanics

- The cap is `ceil(1.25 * N / count)`. Minimum selection reserves sufficient remaining capacity. Maximum and minimum apply to every worker, including deterministic last remainder.
- The actual 80-obligation/85-specification fixture uses mocked Jev answers to reject 65 selections and explicitly replace them with 27, yielding 27/27/26 and cap 34. This proves rejection/refinement mechanics; it is not a real Jev allocation or measured effort reduction.
- No silent trimming or discarded requirements was found. Final coverage checks exclusive original obligation IDs and all original test IDs. Refinement is bounded; malformed or uncertain responses propagate without automatic retry.
- Shared write paths and declared dependency edges reach allocation questions. Unknown dependency IDs remain explicit. Overlap introduces serial edges; cyclic allocation fails before profile selection. `semantic_independence_verified:false` correctly avoids a parallelism guarantee.
- Missing all 85 public executable mappings blocks before planning and execution. The test verifies zero decision/worker callback invocations.
- Missing, duplicate, conflicting, stale, skipped, unexecuted and malformed evidence blocks successor release. Revision is checked before and after verification. Controller callbacks, not worker-generated pass statements, own this boundary.
- A public check must report exit 0, execution true, no uncertainty, zero skipped and a positive assertion count. All selected checks must pass; one successful mapping cannot mask another failed mapping.
- Already-running independent tasks drain after failure; no new tasks are dispatched. This is stop-dispatch behavior, not cancellation of paid calls already underway.

## Limits retained

- `runner_ref` and `source_ref` are structural strings. Registry coverage does not establish file existence, assertion adequacy, absence of hidden-test leakage or ability to run at a given dependency stage. The trusted controller must establish these before a paid experiment.
- Obligation cardinality is not time, token usage or task difficulty. A 34-item cap bounds item count only; no speed/cost saving was measured here.
- Revision callbacks must hash the relevant stable artifact scope. A constant fixture revision proves protocol mechanics only; whole-workspace hashing during disjoint parallel writes may falsely invalidate evidence.
- No current 85-check implementation was supplied. No actual D060 Jev/Claude development experiment or product-completion claim is justified by this review.

Uncommitted review document retained. No containers or subprocesses left running by reviewer.
