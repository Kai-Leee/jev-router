# D057 runtime review — implementation completion comparison

2026-10-10. Owner: runtime-review. Status: static review and proposed integration; no paid inference, credentials, container action, candidate execution or source edit performed. Only this report was written. Scope follows D057_E2E_MEASUREMENT.md; existing Opus 5.5 medium, cumulative Jev 10M ledger and original Personal OS boundary remain.

## Recommendation

Reuse the artifact MCP and restricted Claude invocation from `scripts/decomposition-e2e-anchored.mjs`, but add a separate recursive execution adapter rather than passing D056 tasks through the D053 lifecycle unchanged. Run fresh planning for both conditions with identical public inputs and typed decision contracts, then implementation and public repair, then freeze and independent grade. D056's prior partial tree is historical evidence, not a completed new plan or free preparation.

For the smallest defensible first comparison, execute recursive leaves serially under the same policy in both arms. The fixture explicitly has unasserted obligation dependencies; file-level interfaces and shared writes do not establish that disjoint leaves are semantically independent. This tests decision-provider substitution plus resulting decomposition at concurrency one; it does not test parallel speedup. If root instead selects concurrency two, readiness must account for known producer dependencies and current shared-file versions, and that execution policy must be frozen identically before either arm.

## Confirmed seams and incompatibilities

| Source | Confirmed behavior | D057 implication |
| --- | --- | --- |
| `src/orchestration/recursive-task-tests.mjs` | `runRecursivePlanning({input, decide, record, limits, contract})`; tasks carry obligations, tests, potential write scopes, dependencies and serialization records. `validateRecursivePlan` rejects any mutation of planning-only execution claims. | Keep planning records immutable; construct a separate execution record. A partial planning result must not silently become complete. |
| `src/benchmark/recursive-planning-runner.mjs` | `runPlanningPilot` hard-wires Jev-oriented manifest/client/ledger transport. `checkPlanningRequest` performs representation and budget guard; columnar mode round-trips exact state. | Reuse engine plus shared request preparation with provider adapter; do not present the existing pilot as already supporting a Claude arm. Save identical question/wire-state construction in both arms. |
| `src/orchestration/task-decomposition-v2.mjs` | Anchored file ownership and derived known artifact dependencies give exclusive tasks to lifecycle v3. | Useful reference for genuine producer edges; not equivalent to recursive obligation ownership. |
| `src/orchestration/live-file-workers.mjs` | `validatePlan` allows at most five tasks and globally unique file paths. `runFileArm` writes files with `wx`, from one final JSON response, with no repair. | Cannot accept the D056 32-leaf/shared-scope model. Do not use this file-output worker for D057. |
| `src/orchestration/lifecycle-router-v3.mjs` | `runLifecycle({plan, brief, decide, execute, verify, ..., selectedPlan})`; selected plan still passes `validatePlan`. Ready subsets use `1 << ready.length`. | Merely raising task cap is unsafe: exponential enumeration and 32-bit masks break large recursive trees. Use bounded subset generation or deterministic serial readiness. |
| `src/orchestration/artifact-transport.mjs` | `createArtifactSession({root, allowedPaths, readablePaths, journalPath, maxFileBytes, maxTotalBytes})` allows read/write/status, atomic complete-file replacement and exact allowlists. | Reusable. Atomic replace is not a cross-worker lock. Controller must prevent concurrent writers and stale overwrite. Distinct journal per attempt; require current file reads before modifying existing files. |
| `scripts/decomposition-e2e-anchored.mjs` | Restricted `claude --print --model claude-opus-5-5 --effort medium`, tools empty except three scoped MCP tools, no shell/network/delegation. Worker returns summary; files persist independently. | Reuse this actual worker capability boundary and receipt capture, with fresh candidate and cwd. The older matched script imports lifecycle v2; anchored script imports v3. |
| `src/orchestration/lifecycle-router-v3.mjs` | Repair requires `issues[{id,path,expected,observed}]` attached to currently owned path. Whole verification failure stops. | Existing controller cannot reliably repair public smoke failures or cross-owner integration defects. |
| `src/orchestration/public-smoke.mjs` | `runPublicSmoke({root, outputDir, imageLock, requiredPaths, timeoutMs})` returns public steps/errors, often no source-owned issue attribution; `requirements_verified:false`. | Carry actual public failure evidence into explicit integration repair; never invent a source location or claim complete coverage. |

## Proposed minimal contracts

These are proposed APIs, not implemented functions:

```js
prepareRecursiveExecution({ input, planningResult, policy })
// -> { planning_sha256, leaves, allPaths, executionOrder, limitations }
// Validate source/obligation coverage, planning status, path allowlists,
// shared-write predecessor constraints. Never mutate planningResult.tasks.

runRecursiveImplementation({
  input, planningResult, brief, execute, verifyPublic, decide, record,
  model: 'claude-opus-5-5', effort: 'medium',
  maxConcurrency: 1, maxIntegrationRepairs, deadline,
})
// -> separate execution states, attempts, source versions, public outcomes;
// terminal ready_for_independent_grade is not product success.

execute({ task, obligations, testSpecifications, interfaces,
  readablePaths, allowedPaths, artifactVersion, evidence, attempt, repair })
// Reuse restricted artifact MCP; read existing owned files before replacement.
// Preserve all previously implemented behavior; do not rewrite shared files
// as though this leaf were the first writer.

verifyPublic({ scope: 'leaf' | 'whole', candidateRoot, artifactVersion })
// -> { status, checks, issues, evidence, requirements_verified: false }
// Leaf checks may be syntax/presence only. Whole smoke needs complete package.
```

Leaf dispatch must include full public brief plus its assigned obligation/test text and shared interfaces. Potential write scopes are conservative relevance maps, not guaranteed exhaustive architecture permissions. The fixture's sixteen artifact interfaces should supply the full candidate path set; absence of a required packaging/runtime path is a blocker, not permission to invent unrestricted filesystem access.

After all leaves, run a common integration worker with access to the complete candidate path set if a frozen policy permits it. Trigger repair only from public observed failures (and preserve its cost/time). The integration worker may fix a producer file even if the failing observable is downstream. Re-run the same public checks on the new candidate hash. If public failure remains at deadline/repair bound, record unsuccessful completion; do not report elapsed-to-failure as completion latency.

Keep `tests.json` test-specification status separate from executable public-suite results. The 85 D056 descriptions have no executable `runner_ref`; running existing smoke does not turn 85 cases into 85 passes. A stronger common public suite can be authored from public source only, frozen before either arm, and mounted outside writable candidate paths. Generated tests written by the worker may supplement evidence but cannot replace the common suite or independent grade.

## Matched control and leakage boundary

1. Fresh empty candidates; same original public source, authored obligation fixture, reused interface architecture, input hashes, worker tool limits, model/effort, test harness/image, deadline and repair policy. Preparation labor is separately disclosed and not counted as Jev output.
2. Claude and Jev answer the same typed decision packets; Claude implementation worker is identical. If Claude instead gets free-form planning, label that a different system comparison, not isolated decision-provider substitution. Include recursive planning time in each arm's total.
3. Predeclare a smaller or batched planning design if needed for remaining cumulative budget. D056 used roughly 5.23M input in a partial run, while recorded remaining global balance was roughly 3.33M; the old plan limit cannot be treated as available new budget. Read current ledger rather than relying on this dated STATE snapshot. Any batch contract is a new condition applied to both arms and validated before spending.
4. Do not reuse one arm's decisions, candidate files, public failures or generated tests in the other arm. Public harness itself is shared and frozen beforehand. Preserve order/cache/provider-latency limitations for a single pair.
5. Workers receive only public source, common public smoke/test observations and their own artifacts. Never expose independent grader code, test names, assertions, answer implementations or raw hidden failure details to planning/repair. Freeze/hash each candidate before independent evaluation. Hidden failure remains measured failure; repairs informed by it would be a new contaminated condition.
6. Record planning, worker/integration, public validation, independent evaluation and total wall time separately. Time to independently accepted completion is defined only if the frozen candidate passes. Unknown usage stays unknown; do not replay uncertain paid calls. All Jev paths retain the same cumulative ledger and automatic retry policy.

## Verification and next action

Read-only commands used `fd` for paths, `rg` for content, `sg --lang javascript` for exported function inspection, and `sed`/`cat` for source reads. The installed `sg` command worked with a deprecation notice; no AST fallback was needed. A first shell glob for nonexistent STATE paths failed before reading and was replaced with `fd`. No hidden grader or reference implementation was inspected.

Before paid execution, root should freeze the new adapter and common public checks and verify: shared-writer serialization/current-version preservation; parents never execute; obligation coverage; stopped/partial planning handling; 32-leaf readiness without bitmasks; integration repair outside a leaf's ownership but inside global allowlist; provider uncertainty stop; same packet/config hashes across providers; preservation of original planning/test-spec status. Static review here does not establish live CLI, container or E2E success.

## Root's selected implementation condition (later in this review)

Root has now selected a whole-workflow comparison: A is a Claude single full-goal worker baseline; B is Jev recursive planning plus Claude leaves, product integration and public repair. This supersedes this report's proposed same-typed-planner control for the actual pair. It measures the two workflow configurations together, including decomposition, scheduling and decision overhead; it cannot isolate Jev provider latency or claim a pure judge-substitution effect.

Root will implement a separate shared-file serialized executor with bounded concurrency two, global integration/repair confined to all sixteen artifact allowlist paths, and the same public smoke/repair policy in both arms. B planning will use an explicitly opt-in batch size eight, revised keep wording and resource-based count filtering, with at most eight leaves and depth three; the public eighty obligations and eighty-five test specifications remain unchanged. These are declared compute-envelope choices, not measured optimal decomposition. No obligation dependency edges are asserted by the source fixture. Shared-file serialization prevents write collisions but does not establish semantic independence for the remaining concurrent leaves; full integration and public verification remain essential and cannot prove complete product behavior.

Root confirmed that lifecycle v3 will not be repurposed and hidden grader feedback will not enter repair. Report recommendation now: preserve the whole-workflow label, freeze these selected conditions before either run, and apply the API/pitfall checks above to the separate executor. This section records a root implementation decision; it does not certify that the adapter has been implemented or tested.

## Pre-live implementation audit — first source pass

Read `scripts/recursive-e2e-comparison.mjs`, `src/orchestration/recursive-execution.mjs`, the updated recursive planner, artifact transport/entry point, provider outcome parsing and planning pilot. No inference, container action or core edit. Findings were sent promptly to root; this section describes the inspected version and does not claim subsequent fixes have landed.

**Blocking correctness findings:**

- Uncertain leaf outcome is retained in the executor's result but lost when `runArm` throws `fail(execution.failure.code)` without its uncertainty flag. Also inspect every drained result: a known first failure can coexist with a later uncertain worker. The arm must remain uncertain if any invocation is uncertain. A similar planning failure is collapsed to `PLANNING_NOT_COMPLETE`: `runPlanningPilot` stores uncertainty in receipts but its top-level status is only failed. Preserve actual planning stop code and inspect nested receipt uncertainty; do not infer all failure calls were definitely uncharged. Normalize both `uncertain` and `outcomeUncertain` at arm boundary.
- `candidateSnapshot` recursively walks the actual candidate during concurrent work. Artifact writes create `.artifact-<uuid>.tmp` and rename it. A snapshot can include a transient file or fail with ENOENT between directory listing/stat/read, aborting a subsequent dispatch. Use a snapshot of explicitly published `allPaths`, avoid transient paths, and/or take dispatch-barrier snapshots. Hash and byte length should derive from the same bytes. Artifact MCP atomic replacement prevents torn published file contents but does not give a multi-file snapshot. Reads of another running worker's paths can still observe incompatible versions; restrict readable paths to stable completed artifacts plus this worker's own current files, or explicitly enforce a stage barrier.
- Source pinning omits `bin/artifact-worker-mcp.mjs`, the actual launched transport entry point. Include it in the frozen source list; also consider direct runtime dependencies such as config and budget-acquire, which are not currently in that outer list. A hash list is only as complete as its actual transitive runtime coverage.

**Confirmed useful properties:**

- Fresh execution envelope validates complete planning, preserves the original planning-only tree, runs leaves only, and combines declared dependency IDs with shared-file predecessor IDs. It checks currently running path conflicts and drains outstanding workers before returning after a failure. This avoids the legacy bitmask/ownership incompatibility.
- An offline exact-path comparison found sixteen `allPaths`, zero missing `artifact_interfaces` paths, and zero missing obligation `write_scope` paths. Integration is granted the full sixteen and can fill uncovered paths.
- `--restricted`, empty built-in tools, strict MCP configuration, empty setting sources, no persistence/browser/slash commands and exact artifact tool allowlist match the earlier restricted worker boundary. Fresh temporary cwd contains no benchmark grader. `claudeEnvironment` does not include Jev credentials by default. No API mismatch found in the inspected `providerOutcome`, `preflightVerifier`, `verifyArtifacts`, `runPublicSmoke`, or planning-pilot call signatures.
- Source/fixture preparation occurs before the arm clock, explicitly disclosed. Planning, leaves, integration, public checks/repair and independent-grade subprocess time are included. `completion_wall_ms` ends after grade process completion, while final bookkeeping contributes only to `wall_ms`. Public smoke currently uses its own default timeout rather than `remaining()`, so a check can overrun the arm deadline before the next remaining-budget check stops execution; bind it to remaining wall budget if strict deadline enforcement is intended.
- Worker requests contain public brief, public test specifications, common interfaces, candidate metadata and actual public check evidence only. Independent evaluation happens after all worker calls and no loop returns its feedback to workers. Pre/post candidate hashes protect against grader-side candidate changes. No hidden grader implementation was inspected in this audit.

Root already identified the independent-grade 63/63 plus cleanup predicate TODO; it was excluded from this review's new findings. Run-level acceptance must still reject an interrupted/uncertain grader subprocess even if a result file happens to exist. This is complementary to the concrete result predicate, not a hidden-test feedback mechanism.

Targeted static tests before live dispatch should include known failure followed by uncertain concurrent failure; uncertain planning receipt; snapshot concurrent atomic rename; exact sixteen-path coverage; no late integration after failure; and candidate hash unchanged after independent evaluation. These are proposed checks, not tests executed by this reviewer.

## Frozen-source follow-up confirmation while A runs

Root reported A started as `d057-claude-01` after full 739/739 and targeted 8/8 tests; those test counts are root-reported, not rerun by this reviewer. Read-only inspection of the final source confirms:

- `publishedSnapshot(candidate, paths)` inspects only supplied allowlisted published paths, skips absent files, and computes length/hash from the same read bytes. Artifact temporary-file traversal is removed from worker dispatch.
- Executor dispatch now passes `readablePaths`, drawn from own paths plus completed tasks and excluding active writers. Running tasks retain those read leases; subsequent writers conflict with both active reads and writes. This prevents concurrently changing predecessor files within the supported executor. The worker's transport receives exactly those paths. Global integration happens only after drain.
- Arm failure checks inspect every drained execution result for uncertainty. Planner decision catches preserve uncertainty in `plan.issues`, which the arm checks. Catch normalizes the two provider flag conventions, and grading uncertainty is propagated before reading a grade result as completion.
- The artifact MCP executable entry point is now pinned. The independent acceptance predicate requires exact 63/63, no failures/skips/pending/other, completed grading, successful verifier process, cleanup, matching task/image/workspace/upstream identity, fresh offline verifier and zero model calls. An uncertain/nonzero controller process cannot qualify.
- Existing original-source/hidden-feedback boundary and total-through-grade timing remain intact.

Remaining nonblocking edge observation: the revised public timeout is `Math.min(180000, remaining())`. Normal calls with at least 180 seconds remaining pass the integer 180000. In the final 180 seconds, `remaining()` is normally fractional, but `runPublicSmoke` requires integer milliseconds; that edge would stop with `INVALID_SMOKE_CONFIG`. It is not an immediate blocker for the running A. Do not edit frozen source during the live pair; record if encountered and use a floored, minimum-valid duration in a future declared revision. Strict end-to-end timeout still has synchronous verifier overhead before the smoke-budget calculation.

Some transitive modules such as config and budget-acquire remain outside the outer source list; therefore its source-integrity claim should be understood as the listed pinned runtime files, not a complete dependency closure. No further immediate API blocker was found in this follow-up. Static confirmation does not certify A/B completion or the root-reported tests. This reviewer made only this report append and no source/provider/container operation.
