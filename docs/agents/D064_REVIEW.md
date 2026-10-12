# D064 independent review — 2026-10-10

Status: **independent review complete for the D064 local foundation; R1/R2 repaired and verified; no remaining core blocker found in the reviewed scope**. Public product execution remains blocked by the explicit missing coverage and runtime adapter conditions below. This document is the reviewer's only owned file. No provider call, product execution, historical artifact rewrite, commit, or push was performed by this review.

Reviewed against [D064 shared contract](D064_PARALLEL.md), [D063 plan](../orchestration/D063_DAG_PLAN.md), the current DAG fixture, and actual implementation sources. Root reported the core source freeze. The focused result below and the corrected pilot's retained snapshots cover that implementation; mapping controls were checked separately as the mapping owner completed them. Full repository regression and final shared records belong to root.

## Findings

### R1 — consumer can execute a different revision from the published input (P1; repaired and independently reverified)

`dag-workflow.mjs` checks each input against its published revision, then calls `executeArtifactTask`, which takes a second input snapshot. A mutation between these two reads makes the second snapshot an unverified revision. The gate previously accepted that snapshot and invoked implementation execution. A later integration or postflight failure cannot undo that dispatch.

Independent reproduction used the common fixture with `build-ui.input_artifact_ids = ['artifact-core']` and its corresponding read scope. The controller returned `verified-r1` during the workflow check, then changed `artifact-core` to `unverified-r2` when the gate requested `stage === 'input_snapshot'` for `build-ui`. `execute(build-ui, context)` was called with `context.input_artifact_revisions['artifact-core'] === 'unverified-r2'`. Integration later failed with `DAG_INPUT_NOT_VERIFIED`; this prevented overall completion but did not prevent the unverified consumer execution.

Root confirmed the issue and coordinated an `expected_input_artifact_revisions` argument with the gate owner. The workflow now supplies its published input vector; the gate compares its snapshot to that exact vector before implementation execution. Repeating the same independent mutation injection after repair produced `ARTIFACT_INPUT_REVISION_MISMATCH` for `build-ui`; only `build-core` executed, and only `artifact-core` was published. The resulting event projection was `failed` with `measured_completion_ms: null`. The root-owned regression is also passing.

### R2 — invalid run identity is accepted until post-execution projection (P2; repaired and regression verified)

The workflow's previous nonempty-string check accepted `run_id: ' invalid-surrounding-space '`. It executed both fixture implementation callbacks and returned `completed`; `projectDagEvents(result.events)` then rejected the same run with `DAG_EVENT_INVALID`. The projector requires trimmed, control-free identifiers, so the workflow must use the same envelope boundary before dispatch.

Root aligned its run identity validation and added an invalid-identity regression. The focused test run below passed `run event identity invalidity is rejected before any implementation callback` with the repaired source.

## Independent checks

- Independent mutation injection above reproduced R1 without network or subprocess implementation calls.
- Gate callback failures thrown as each of `null`, `undefined`, `false`, `0`, and `''` were rejected with `ARTIFACT_CHECK_CALLBACK_FAILED` in the inspected version. These values did not produce successful verification evidence.
- `node --test test/dag-workflow.test.mjs` while R1's regression was present but its gate repair was still in flight: 6 passed / 1 failed. The failing test was exactly `consumer never executes an input that changes between dispatch precheck and gate snapshot`; its observed calls included `build-ui`. This is an intermediate failing snapshot, not a final regression result.
- Independent allocation differential check: 400 deterministic sampled instances, 2,280 individual owner-candidate comparisons, all matching an independent exhaustive assignment enumerator. 110 feasible instances completed and 290 infeasible instances blocked. The enumerator considers every eligible owner for each indivisible bundle and checks all final capacity/minimum constraints. Inputs used LCG seed `640063`, `seed = (1664525 * seed + 1013904223) >>> 0`, 1–4 owners, capacity 1–7, minimum 0–capacity, 1–6 bundles of size 1–3, and varying eligible-owner subsets; allocator search budget was 100,000 nodes per candidate. All decisions were local mocked typed answers, no provider calls.
- Independent schema/graph boundary: a generated plan with 61 implementation tasks and 30 workers validated and analyzed; adding a 31st worker produced `DAG_WORKER_LIMIT`. The task count did not inherit the worker cap.
- Current focused suite: **175 passed / 0 failed / 0 skipped**, exit 0, using the command below. This includes actual local fixture subprocess assertions and a defective artifact control, resource/worker locks, successor release while an unrelated branch remains active, unknown relation blocking, exact packing, revision drift, event identity/deduplication, and renderer escaping. This is a DAG foundation test result, not a product benchmark.

```sh
node --test test/dag-contracts.test.mjs test/artifact-dag.test.mjs \
  test/dag-scheduler.test.mjs test/artifact-verification-gate.test.mjs \
  test/dag-workflow.test.mjs test/dag-decision-adapter.test.mjs \
  test/dag-metrics.test.mjs
```

## Corrected pilot and public-check evidence

Read `benchmark-runs/d064-pilot-02/{protocol,plan,result,subprocesses,projection}.json` and independently recomputed SHA-256 for each protocol source and its retained snapshot: **12/12 snapshots and 12/12 current source files matched**. Replaying `projectDagEvents(result.events)` exactly reproduced the saved projection.

The retained result reports the observed `node-v26.4.0-darwin-arm64-fixture` environment, three assertion subprocesses with exit 0, two peak simultaneous fixture implementations, 15 events, and 154.889334 ms local workflow wall time. The 40 ms critical path is the synthetic duration model; it is not that observed wall time or a measured speedup. `product_success:null`, `independent_grade:'not_run'`, `paid_adapter_connected:false`, and `restart_supported:false` remain explicit. The allocator responses are marked `mock_choice_no_inference`.

Root preserved pilot 01's original evidence after discovering its nominal Node 22 environment label. Pilot 02 records the actual process environment. This review did not alter either run or treat the corrected metadata as a new product measurement.

The public audit was executed independently after the registry integration repair:

```sh
node scripts/audit-dag-public-checks.mjs
```

It returned exit **2**, the expected `blocked` status: **36 implemented test descriptions / 85 total; 49 exact missing IDs**, four integration suites, `mapping_only:true`, and `product_execution_ready:false`. The original D056 manifest and public instruction hashes were verified by the audit. Public CLI/layout and metadata expectations were also read directly from the public instruction and matched to the new assertions; no hidden grader code was read.

An independent module call to `auditPublicChecks({controls:true})` executed the complete authored controls and asserted those same coverage/readiness values. It returned **4 normal suites passed and 35 defective controls rejected**, with control status `passed`. These are normal/defective local generators, not an actual product implementation or independent product grade. The runner's `artifact_revisions:null` and `product_certified:false` are intentional while the real artifact adapter is unbound.

The audit retains all three blockers:

- `PUBLIC_CHECK_MAPPING_INCOMPLETE`
- `REAL_CANDIDATE_ENVIRONMENT_NOT_VALIDATED`
- `ARTIFACT_REVISION_ADAPTER_NOT_BOUND`

The opt-in DAG fixture kernel may be integrated at this evidence level. These controls do not justify enabling real product dispatch, declaring all 85 descriptions covered, or asserting Jev quality/cost/speed improvement.

## Independent maintenance-skill application

Applied [jev-skill-maintenance](../../skills/jev-skill-maintenance/SKILL.md) to the concrete D064 maintenance review after reading its entrypoint, current backlog, and the revised decision-records skill. This was the already assigned independent reviewer applying repository source instructions; no new agent or host installation was created.

The working question was whether the new DAG revision/mapping evidence requires a separate skill, and whether source/copy drift is sufficient reason to overwrite an installed copy. Following the maintenance instructions led to the existing `jev-decision-records` responsibility: graph revision, exact artifact/check identity, and mapping versus product completion are already covered there. D064's current evidence belongs in its decision/review record. A new DAG operating skill remains a backlog candidate until a distinct repeated operational need is observed. A source/copy difference is reported, not automatically installed.

The independent read-only inventory command was:

```sh
python3 skills/jev-skill-maintenance/scripts/inventory_skills.py \
  --source-root skills \
  --installed-root /Users/lee/.codex/skills \
  --installed-root /Users/lee/.agents/skills
python3 skills/jev-skill-maintenance/scripts/test_inventory_skills.py
```

Both commands exited 0. The helper tests independently reran **6 passed / 0 skipped**, covering ordinary copies/differences, missing versus invalid roots, internal and installation symlinks, immediate-skill scope and input immutability, and an `fd` error reported with exit 0. The current inventory found two source skills. The existing Codex decision-records copy differed only at `SKILL.md` and `references/record-contract.md`; the maintenance skill was absent in both explicitly inspected roots. Installed-copy changes were not performed. The returned `host_discovery_verified` and `host_invocation_verified` remained `false`.

The earlier backlog tree hashes differed after the author's final repository-root guidance edits. This was reported to root and the skill owner, who retained the earlier values as history and added a correction. It was not treated as a cache mutation or installation event.

This provides an independent manual application plus executable helper evidence. It does not establish host automatic discovery, automatic skill selection, a paid agent benchmark, or measured user productivity. A structural check would not establish those claims either.

## Evidence limits

- Contract and mapping validity cannot establish runner assertion adequacy or public-product coverage.
- This workflow is a fresh local callback path. Product success remains `null`, independent grade remains `not_run`, and restart/paid adapter support is not inferred from offline tests.
- Declared scopes cannot alone enforce filesystem isolation. A future adapter must bind actual immutable snapshots or leases, symlink/case normalization, and allowed access to the declared contract.
- No elapsed-time improvement or model-selection benefit has been measured by this review.

## Handoff

Root can complete its full regression and final D064 records using the local-foundation completion boundary above. Any future real-product workflow must finish the 49 missing mappings, validate the candidate environment, bind check evidence to real artifact revisions and enforced access/snapshot boundaries, and pass the already specified gates. Actual paid adapters, uncertain external restart behavior, product grade, host skill discovery, and performance comparisons remain unverified. Reviewer writes end with this record.
