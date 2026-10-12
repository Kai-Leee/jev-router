# D063 independent integration review

Reviewed 2026-10-10. Status: side proposal, current runtime, and `docs/orchestration/D063_DAG_PLAN.md` reviewed. This is a design/code inspection, not runtime or performance verification. Reviewer owns only this file.

## Judgment

The side design is suitable as a design baseline because it explicitly separates decomposition, artifact dependencies, resource conflicts, and independent verification. It is not a drop-in contract for the v3 workflow. The following migration obligations must remain visible before implementation or live comparison. The code references below describe the inspected source, not all historical runs.

The main D063 plan explicitly incorporates the material migration obligations below. **Acceptable for design adoption and development planning; no blocking design correction remains.** This approval does not certify an implementation, complete the public-check mapping, or authorize a paid comparison. R7 is a factual clarification: non-barrier dispatch already exists in the old executor and should be preserved, not presented as an established new gain.

## Main-plan disposition

- R1: §1/§2 separates task, worker, slot and verification nodes, preserving the worker cap and historical root-count policy.
- R2: §3 supplies an equivalent indivisible packing counterexample, exact small-fixture search, and `feasibility_unknown` for bounded-search exhaustion.
- R3/R6: §2/§3 separates semantic edges, write/read conflicts and leases. Adapter migration and path enforcement remain implementation gates.
- R4/R5: §3/§4 specifies separate verification nodes, revision vectors, environment-bound evidence, fixed running snapshots and consumer re-evaluation.
- R8: §3 defines unknown-duration FIFO with task-ID tie-break, conditional CP and single accounting of overhead. Implementation should freeze whether FIFO uses ready-arrival sequence before the tie-break.
- R9: §6 freezes common candidates, stages, worker profiles and executor; native free planning is a separate reference condition, and all-trial failures remain visible.
- P0–P5 role dependencies correctly permit schema-fixture development in parallel while keeping product dispatch blocked on actual executable mappings and gates. Proposed paths are explicitly unimplemented.

## Required integration corrections

| ID | Priority | Observed boundary and consequence | Required plan/contract correction |
|---|---|---|---|
| R1 | High | `src/orchestration/sequential-allocation-v3.mjs:67-81,117-120` creates exactly one `worker_N` task per selected count. `sequential-envelope-v3.mjs:5` limits tasks to 2..30. Reusing this envelope would silently turn the worker cap into a task/verification-node cap. | Separate stable task IDs, worker/session IDs, attempts, and concurrency slots. Declare which count remains 2..30 under D061 and whether optional single-worker comparison is only a baseline. Verification/summary nodes must not consume implementation-worker cardinality by accident. |
| R2 | High | The v3 lower/upper bounds count individually assignable obligations. Indivisible bundles invalidate an aggregate-capacity sufficiency check. Remaining capacities [5,5] and bundle sizes [4,4,2] have equal total 10 yet no packing. | Candidate eligibility needs a residual feasible assignment witness or a sound feasibility algorithm that honors bundle size, owner eligibility, and minimum load; failure/unknown must request revised boundaries rather than claim feasibility. A timeout in exact feasibility is unknown, not proof of impossibility. Include this counterexample as a future fixture. |
| R3 | High | Allocator lines 127-129 and envelope lines 18-19 both inject earlier shared writers into `depends_on`/`after`. If earlier A requires later B and both write one path, this creates an artificial A↔B cycle. | A new envelope must preserve semantic artifact edges separately from conflict leases/order. Do not pass it through the v3 overlap-injection adapter. Orient resource ordering consistently with semantic predecessors or use runtime locks. Preserve the rejected historical plan. |
| R4 | High | `public-check-registry.mjs:31-45` runs every check intersecting each task's test IDs; the registry has no local/integration phase or required-artifact readiness. Allocator line 117 and envelope lines 16-17 assign every linked test to each owner. A shared A+B check can block A before B is allowed to start. | Distinguish responsibility links from executable release checks. Use local/contract release checks and explicit multi-artifact verification nodes with their own input set. Validate the combined task/artifact/check graph for deadlock before dispatch. Mapping completeness alone is insufficient. |
| R5 | High | `worker-verification-gate.mjs:49-56` checks one revision before and after verification. `recursive-execution.mjs:63-64` then permanently marks task done. There is no consumed-revision vector, graph revision, or invalidation after later shared-file writes. | Bind checks to immutable output revision plus every consumed artifact revision, verifier/version and relevant configuration. At publication/dispatch validate pinned inputs. Later mutation requires a new version and explicit affected-check invalidation; immutable snapshots may instead keep old consumers valid. A task-level hash alone must not certify all upstream state. |
| R6 | Medium | `recursive-execution.mjs:54-60` grants each new task readable paths from all completed tasks and uses these broad reads for exclusion. This is conservative but can serialize unrelated work; it does not consume declared `read_scope`. | Define declared versus enforced read/write scopes and canonical path/alias semantics. Include read/write conflicts, resource waits, and diff audit. Do not describe the existing path policy as fine-grained artifact scheduling. |
| R7 | Medium | Existing executor already uses `Promise.race` to release successors without a global wave barrier (`recursive-execution.mjs:62`). Side hypothesis H2 is valid as a general hypothesis, but removal of a barrier is not an established improvement over this runtime. | Test that a short branch's successor starts before an unrelated long branch finishes. Attribute improvement only to an observed baseline delay; investigate broad read scopes and coarse task boundaries as separate mechanisms. |
| R8 | Medium | Side ARCHITECTURE §6 correctly leaves unknown duration null, but `longest_remaining_path_priority` still needs a policy when ranks cannot be computed. Estimates depend on model/effort and include startup/check boundaries. | Freeze a deterministic unknown-duration scheduling fallback and mark its ranks unavailable, or use explicitly labeled scenario estimates. Keep verification/integration overhead exactly once. A dependency-only CP is a conditional lower bound under the frozen duration model, not measured completion time. |
| R9 | High | Side research specifies matched planner conditions, but candidate generation and judgment are potentially different interventions. Historical D062 has no valid allocation or implementation outcome. | Freeze identical goal/source snapshot, candidate/evidence pool, worker profile, executable checks, scheduler, environment/concurrency and budget/stop policy. Changing candidates or profile selection is a separate factor. Include preparation, failed attempts, planning and independent grading time. Do not reuse old include/exclude answers as answers to new owner questions. |

## Proposed acceptance gates

These are requested future checks, not tests executed by this review.

1. Schema/contract: unique stable IDs, preserved obligation ownership, all original expected outcomes, explicit unresolved relations, bundle feasibility witness, allowed profile and handler IDs.
2. Combined graph: artifact existence, release checks, integration verification nodes, read/write conflicts, artificial resource-cycle counterexample, unresolved relation cannot unlock execution.
3. Revision correctness: mutate a consumed input during a check; mutate an output after publication; replay stale verification after graph revision; confirm none unlocks an incompatible consumer.
4. Scheduling: chain, fork/join, short-branch successor, limited slots, broad-read conflict, and unknown-duration tie handling. Record waits separately from semantic edges.
5. Controller evidence: missing runner, wrong artifact, verifier crash, zero assertions, skipped assertions, real public failure, uncertain worker result, duplicate completion/event and restart/reservation recovery. Product failure, verifier failure and uncertainty remain distinct.
6. Measurement: source/contract pins, receipt deduplication, matched trial protocol, independently graded completion and all-trial success denominator. Mock checks and shadow planning are labeled as such.

## Evidence and limits

Read the five documents in `docs/orchestration/jev-dag-design/`, v3 allocator/envelope/workflow, worker verification gate, public check registry, and current recursive executor. Read `docs/decisions/D062.md`, `docs/agents/D062_REVIEW.md`, current STATE and repository entry/contract documents. D062 failure figures are relied on as documented prior evidence; raw live receipts were not re-audited here.

The side documents already acknowledge most conceptual risks, including artifact versions, integration deadlock, unknown duration, and matched comparisons. Findings are concrete adoption requirements where the current runtime does not implement those concepts. No claim that source code already implements the new DAG design is justified.

No new model/network calls, product runs, tests, ledger changes, runtime edits, commits, or external messages were made. Only this review file was created. Root owns adopting findings, D063 decision/index updates, and later implementation validation.
