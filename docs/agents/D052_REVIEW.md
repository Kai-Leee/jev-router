# D052 independent architecture review

Date: 2026-10-10. Owner: decomposition reviewer. Status: architecture reviewed; implementation and live outcome pending.

Scope: typed Jev requirement assignment, deterministic assembly, scheduler integration, evidence-grounded recovery, and fair D052 comparison. No inference or source mutation by this reviewer. This review follows the local `jev-decision-records` evidence separation; a static contract check is not end-to-end quality evidence.

## Findings before implementation

1. **Requirement partition is necessary but insufficient.** Per-question Choice responses can each be valid and still yield empty tasks, inconsistent interface ownership, or cycles. Validate the full answer bundle atomically before launching any worker. Every requirement must have one accountable task; shared consumers are references, not additional owners.
2. **File/interface vocabulary is a preparation dependency.** Typed decisions cannot invent arbitrary path names or interface signatures. Reused path/interface facts must be marked as preparation, with their original generation costs unknown if not available. A hand-authored path schema must not be described as fully autonomous architecture generation. Preserve complete public requirements and separate task assignment from any architecture scaffold.
3. **Dependencies require semantic coverage.** Acyclic edges alone do not prove prerequisites exist. Known consumer/provider relations must induce task edges, unless the workers receive a concrete shared interface contract allowing independent work. Contradictory answers must return stable conflict IDs rather than silently deleting edges or serializing everything.
4. **D051 recovery was not evidence-grounded.** `lifecycle-router-v2.mjs` offers `repair` after `check.ok` even when only syntax/ownership were checked and public smoke was not applicable. D052 must not issue a repair request without a concrete failure ID, expected versus observed result, affected artifact, and accountable repair owner. A successful stage check permits scoped progress; it does not establish whole-task completion.
5. **Limits are implementation gates.** Freeze maximum tasks, question count/body limits, correction count, scheduler concurrency, repair bound, and recursion status before inference. A singleton answer is deterministic. Uncertain calls are not correction candidates and must not be replayed.
6. **Comparison must charge planning.** Report decomposition calls and all failed/correction calls, plus unchanged worker costs, separately. D051 is historical because review/scaffold changes alter conditions. Count selection is not actual parallelism; use execution interval overlap and prerequisite waits. Incomplete runs cannot establish efficiency improvement.

## Required negative controls

| Boundary | Negative control | Expected result |
|---|---|---|
| Requirement assignment | Missing ID, unknown ID, duplicate ID, empty task | Reject entire plan before worker dispatch |
| Ownership | Same output path owned by two tasks; unsafe path | Reject with concrete conflict |
| Dependency | A→B→A or self-reference; nonexistent owner | Reject before dispatch |
| Semantic prerequisite | Consumer without provider edge or interface contract | Reject or explicitly classify unsupported semantic validation |
| Provider result | Malformed answer; valid per-answer but incoherent bundle | No partial plan execution |
| Correction | Still invalid at bound | Terminal plan failure; preserve every attempt |
| Uncertainty | Provider timeout after submission | No automatic replay or correction call |
| Scheduler | Delayed prerequisite; independent ready workers > concurrency | Dependents wait; active workers never exceed bound |
| Recovery | Syntax passes, whole smoke not applicable, no concrete issue | No blind repair; scoped progress only |
| Behavioral check | Syntax-valid generated code with wrong public behavior | Check fails and carries concrete issue evidence |
| Task replacement | Recursive parent and child both dispatch | Unsupported recursion rejected, or parent non-executable |
| Accounting | Known worker usage plus unknown failed call | Total uncertainty retained; never coerce unknown to zero |

## Remaining review

Read new implementation and tests when available. Confirm actual runner imports the new contracts, sends full source references, freezes hashes, and persists decision traces. The reviewer has not executed paid calls, inspected hidden tests, or changed original Personal OS. This file is the only reviewer-owned mutation.

## Independent implementation checks

Added `test/d052-review.test.mjs` with root authorization. Command `node --test test/d052-review.test.mjs` passed **6/6** on 2026-10-10. These are local synthetic lifecycle tests, not model or task-quality measurements.

- Missing, unowned-path, and incomplete repair evidence each stop `REPAIR_TARGET_UNRESOLVED`, with no recovery inference and no dependent worker dispatch.
- Generic worker configuration exception has no evidence-backed artifact repair and stops.
- Whole-task behavior failure remains `WHOLE_VERIFICATION_FAILED` after successful scoped stages.
- Actual asynchronous synthetic execution reached two simultaneous workers, never exceeded two, and dependent work started only after its prerequisite completed.

The implementation now avoids the exact D051 speculative repair path: scoped passing checks without a concrete owned issue advance the stage without a review call. This reduces judgment coverage deliberately; it does not establish semantic correctness. Global generated-output failures without attributable owned paths remain terminal rather than repaired. `verify` remains a callback with an `ok` contract; completeness must be established by the real runner's whole-candidate verifier. A mock returning `ok: true` for an incomplete whole candidate cannot itself test completeness.

Pending decomposition review finding sent to builder/root: independent requirement and file assignments can be individually valid but impossible to implement when crossed. Add declarative requirement/artifact relations and coherence validation, or explicitly keep this as an unimplemented semantic check. The first version also splits questions into batches without preceding batch choices in state; cross-batch coherence needs cumulative answers or whole-plan validation that catches those conflicts.

## Review resolution before live diagnostic

The builder added cumulative previous-batch answers and declared artifact dependency reachability. Optional requirement `required_artifacts` now requires the accountable task to own the artifact or depend on its owner. This addresses structurally unavailable prerequisite artifacts without fixing task groups in advance. It remains a declared-contract check, not proof that code satisfies the requirement or that all semantic dependencies have been discovered. Requirement accountability must include integration of predecessor artifacts.

Independent command:

```sh
node --test test/task-decomposition.test.mjs test/lifecycle-router-v3.test.mjs test/d052-review.test.mjs
git diff --check
```

Observed **26/26** tests pass and diff check pass. This supports proceeding with a diagnostic under frozen limits, not an efficiency claim. New decomposition is depth one only; recursive child replacement is not implemented. Whole-task global smoke recovery cannot reassign a failure to an earlier file owner and terminates unresolved. API request batching respects the adapter's question-count limit; the full actual request still must pass local byte validation before provider dispatch. Paid execution and accounting remain root-owned.
