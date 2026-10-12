# D070 — real repair from a preserved failed candidate

2026-10-11. This role owns the new preserved-artifact repair runner, CLI and focused tests under the [D070 parallel contract](D070_PARALLEL.md). Root alone launches paid providers, Docker, ledger activity and independent grading. No historical source, candidate, request, report or decision is modified or reused as a new decision.

## Planned lifecycle and API

`runPreservedArtifactRepair({rootDir, manifest, sourceRunDirectory, runDir, spend, adapters})` uses a fresh D070 repair manifest and directory. `executePreservedArtifactRepair` is the callback-driven execution helper for offline containment and dispatch tests. The CLI requires explicit `--spend`, `--source-run` and a fresh output directory for execution; inspection never authorizes an inference.

Read the failed D068 arm's original plan, catalog, public source, result and exported candidate. Preserve output ownership and the full public specification. Reject unsupported/mismatched source provenance, path traversal, symlinks, hard links, partial initial export coverage or noncanonical immutable file modes. Copy only declared files into new stages. Old exported files are 0444/0555; temporary worker stages use 0644/0755. Fresh exports must preserve the exact original bytes/read-only mode/revision for unchanged artifacts.

Use the existing adaptive execution loop: round0 copies historical files with **zero model workers**, then runs every original local/public check under the current checker/assertion/runtime pins. Before a new repair decision, verify the current export matches the old candidate and that a known public failure was actually reproduced. A non-reproduced or uncertain failure is not a successful repair demonstration. The new Jev decision uses artifact-repair-v2 and token-policy-v2, then only its selected Claude workers may write their selected paths. Nonselected snapshots are carried forward; all original checks run again. Rejected, stop, oversized or uncertain decisions do not create repair workers. No automatic paid retry is added.

The final result retains fresh receipts, current evidence bindings, selected artifact scopes, inheritance proofs, source-before/after hashes, raw exported candidate revisions and separate bootstrap/recheck/repair timings. Public success is insufficient for product completion: root grades the frozen export independently and only public85/85 plus independent63/63 with no skips is completion. A short preserved repair is not a from-scratch speedup over historical Claude development.

## Integration ownership

Root exported existing runner lifecycle helpers: `createAdaptiveRunContext`, `loadAdaptivePublicInput`, `createAdaptiveWorkerAndChecks`, `preflightAdaptiveRun`, `withAdaptiveSettledBudget`. The new runner reuses them for source pinning, shared ledger locks, timeout/abort handling, fresh Claude MCP workers and Docker report validation. It adds its module/CLI and historical source metadata to source pins. This role did not change `adaptive-dag-execution.mjs`.

## Validation plan

Offline fixtures will cover source-copy immutability, current binding and reproduced public failure, a new selected decision leading to one narrowed repair worker, nonselected bytes/mode/revision preservation with full recheck, and stop/oversize/unknown outcomes with no additional worker. Targeted counterexamples will cover source drift, illegal paths/modes and forbidden inherited-file writes. Final commands, results, hashes and handoff limitations will be recorded below. Real D070 execution is not yet performed by this role.

## Implemented handoff and verification

New sources: `src/benchmark/preserved-artifact-repair-runner.mjs`, `scripts/preserved-artifact-repair.mjs`, `test/preserved-artifact-repair-runner.test.mjs`. Inspection is read-only:

```sh
node scripts/preserved-artifact-repair.mjs --manifest benchmarks/e2e-swe/manifests/d070-preserved-repair.json --source-run benchmark-runs/d068-comparison-01/jev_all
```

Actual D068 inspection found 38 regular files and 22 complete artifacts. Snapshot SHA256 is `1f28a8661a1dae80dc15244f59c2f083614fbf35a9b17d46b6db190c308ff4bc`. Historical/current specification and check definitions match. The required reproduced failure is `public.cli-config-environment` / `T.integration.diagnostics`, `AssertionError: existing output refused`. This is source validation only: provider calls 0, Docker calls 0, ledger accesses 0.

Root's authorized execution command is:

```sh
node scripts/preserved-artifact-repair.mjs --manifest benchmarks/e2e-swe/manifests/d070-preserved-repair.json --spend --source-run benchmark-runs/d068-comparison-01/jev_all benchmark-runs/d070-preserved-repair-01
```

Output uses the standard `adaptive-arm-result/v1` receipt layout with `kind: preserved_artifact_repair`. `metrics` separates bootstrap copy count/summed task wall time, initial public recheck interval, complete bootstrap round, new repair decision callbacks, repair worker callbacks and repair-phase wall time. `repair_phase_wall_ms` begins when round 0 completes and includes the new decision, worker and checks through execution return; final source/proof/budget collection is covered by the outer `wall_ms`. `bootstrap_public_recheck_wall_ms` runs from the first public check start through the round's export completion. These intervals are not provider generation latency.

`bootstrap_copy_worker_provider_calls: 0` is explicit. Existing executor `operations.implementation` counts deterministic copies in round 0; it must not be interpreted as Claude implementation calls. Actual worker calls are measured from provider starts and CLI receipts. `bootstrap_proof` binds the newly checked export to the original snapshot and current runtime environment. `inherited_export_proofs` contains only verified exact file bytes, mode and revision preservation. A failed round's incomplete export is recorded in `incomplete_export_proofs` with `status: not_verified`, never in the verified event stream. `original_candidate_unchanged` requires a final reinspection written to `historical-candidate-after.json`.

Validation command:

```sh
node --test test/preserved-artifact-repair-runner.test.mjs test/adaptive-artifact-repair-v2.test.mjs test/adaptive-dag-execution.test.mjs
```

Result: **35 tests passed, 0 failed/skipped, 32,307.385416 ms**. The new file contributes 14 tests including a real current-runtime fixture with two copied tasks, one new typed choice, one selected repair callback, carried own artifact and independent task, and complete public checks after repair. Both 0444 and 0555 inherited modes are checked. Stop/oversize, changed or nonreproduced failure, uncertainty, original source drift, symlink aliases, forbidden inherited writes and replay prevention are covered. A known HTTP 400 `model_input_limit` survives an expired final deadline without invoking that later timeout check or creating a worker. Node syntax checks and scoped `git diff --check` passed.

Initial fixture failures were retained in the task transcript and fixed: the choice response needed the planner's `repair_` prefix, and a corrupted inherited file correctly produced a partial failed export. The latter exposed postprocessing that could replace `ADAPTIVE_ARTIFACT_REPAIR_CARRY_DRIFT` with a coverage error; partial exports now stay unverified while retaining the original execution failure. Independent review also identified the final deadline overwrite, fixed by `preservedRepairTerminalState`. No prior evidence was edited.

Freeze hashes at this handoff:

| File | SHA256 |
|---|---|
| `src/benchmark/preserved-artifact-repair-runner.mjs` | `2920d8c59a7783e1db291c80f65fbec0cd81163a24c251df1926bff06b6cc056` |
| `scripts/preserved-artifact-repair.mjs` | `52ced5cc6ccfc08f6eee31b8f57df9e30e4b552f35b7d60e77caab714965b2c3` |
| `test/preserved-artifact-repair-runner.test.mjs` | `01d8ec66410550c05a1cb237a4ab4fd181b37ac9f960a2968a4768ea0d66098c` |

This role made no authenticated request, real ledger access, Docker execution or independent/hidden grade. Root must validate and freeze the integrated sources before the actual B run. Fixture success establishes dispatch and preservation boundaries, not repaired product success or an efficiency gain.
