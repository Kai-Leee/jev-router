# D075 preserved-candidate execution

Owner: `/root/d067_review`. Started 2026-10-12.

## Purpose and authority

Connect the D075 required transmission gate and failure recovery policy to a fresh preserved-candidate run. The primary comparison starts from `benchmark-runs/d073-comparison-01/jev_profile`, the same original 79/93 public candidate used by `d073-focused-new-02`. A later 91/93 candidate is a separate possible starting condition and must not replace the primary comparison.

Owned files are `src/benchmark/preserved-artifact-repair-runner.mjs`, `scripts/preserved-artifact-repair.mjs`, a new D075 manifest, and focused preserved-runner tests. Existing source copies are saved under `benchmark-runs/d075-preserved-preflight/source-before/`; their initial hashes are in `source-before.json`. Old evidence and candidates are immutable.

The role applies repository `jev-prompting` and `jev-decision-records`. Root alone performs actual provider, Docker, ledger and independent grading operations. This role uses public source/evidence and local mocks; it does not access keys, hidden grader contents or original ledger state.

## Integration boundaries

- Target manifest v10 inherits v9 inferred-v2 owner inputs, v4 admission and profile-v2. The transport owner supplies the required pre-POST gate contract and final SHA.
- Preserve deterministic bootstrap copy with zero worker/provider calls, exact original failed-case reproduction, original candidate bytes/modes/revisions and historical model/profile evidence.
- Failure recovery is owned by the executor agent. Owner selection, repair selection, profile preparation and selected worker execution remain ordered behind the verified original-failure gate.
- Latest terminal-candidate support must verify its repair profile receipts, final selected/carry artifact revisions and prior no-progress history; it is not equivalent to an untouched initial implementation source.

## Current status

Owned implementation and local validation are complete. The runner, CLI and tests are frozen pending independent findings. Root will fill the new manifest's final transmission/recovery policy SHA values after all policy source pins freeze. The placeholder hashes deliberately cannot authorize a real run.

### Implemented boundaries

- `benchmarks/e2e-swe/manifests/d075-preserved-repair.json` is v10; it inherits inferred-v2, v4 admission and provider-limits-v2 profile selection. Required `transmission_preflight`, `failure_recovery` and `preserved_source` fields are explicit. The source is `d073-comparison-01/jev_profile`, result SHA `22ce2da6e6dc97912b5602896f820fd48af0e5080aa3c8a069d76422471c0273`, with exactly 14 observed public failures.
- The CLI default is this manifest. Explicit v5/v7/v8/v9 manifests remain available. D075 execution accepts only a new `benchmark-runs/d075-*` directory.
- The wrapper connects `failureRecoveryPolicy: evidence-loop-v1`, `repairInputPolicy: evidence-v1` and `createRepairInputRecovery()`. It revalidates original bytes and exact bootstrap failure before owner, repair or recovery callbacks. The executor owns immutable current-source excerpts, repeat identity, uncertain-outcome stops and selected-worker authority.
- Chooser callback metadata maps to the planner's `requestOverride`, `recovery`, `onRequest` hooks. The planner validates any changed-input proof and captures the actual prepared body; the provider session owns mandatory pre-POST validation and settlement checks. Automatic SDK retries remain zero.
- `comparison_condition` is saved in protocol, preserved-source and result. Recovery callback counts are additional metrics. Historical initial profiles remain historical evidence and are not charged as new calls.

### Actual offline evidence

`benchmark-runs/d075-preserved-preflight/primary-inspection-01.json` verifies the original 38 files, 22 artifacts, 14 failures and 15 historical worker profiles. Its source snapshot equals the starting snapshot recorded by `d073-focused-new-02`. The 108 selected source/candidate hashes did not drift.

`owned-tests-01.tap` has **29/29 passed**, no failures/skips/cancellations, 11,958.342166 ms. This includes the legacy tests and two meaningful recovery branches: an unchanged first repair followed by empty investigation blocks any second owner/profile/worker; one new current-source SHA/revision/range observation permits a second selected repair, followed by all public fixture checks. Original bytes/modes and nonselected artifact inheritance remain exact. Mock callbacks are not actual model calls.

The first recovery fixture run was blocked by `REPAIR_INPUT_OWNER_SCHEMA` before all callbacks. Its older fixture placed public-only fields inside local evidence and a top-level harness error beside an observed case failure, so the v2 projection correctly fell back to an unsupported raw shape. The fixture was changed to the actual production local/public report shape; the observed failing case and production guards were not weakened. Initial logs `recovery-tests-01/02/03.tap` remain preserved; final recovery-only log `recovery-tests-04.tap` passes 3/3 (overlapping the 29 tests).

Syntax checks for runner/CLI and whitespace checks passed. Actual provider, Docker, key and ledger operations by this role: **0**. Provider acceptance, actual repair, final public93/independent63 results, wall time and cost remain root-owned and unmeasured by this role.

### Latest 91/93 source limitation

`terminal-support-boundary-01.json` records the latest source's 38 files, two remaining public failures, one historical repair entry, two actual repair-worker receipts, and selected-but-unchanged A10. This is a `preserved_artifact_repair` source, with repair profile applications rather than initial-profile files. Current support deliberately stops with `PRESERVED_TERMINAL_REPAIR_HISTORY_REQUIRED`; it cannot silently reset history or enter the primary condition. Its 48 selected hashes are preserved separately. Future support requires complete final profile/typed-selection/diff/history validation before passing historical repair evidence to the executor. It does not block the authorized same-start primary run.

### Root commands after final policy freeze

```sh
node scripts/preserved-artifact-repair.mjs --manifest benchmarks/e2e-swe/manifests/d075-preserved-repair.json --source-run benchmark-runs/d073-comparison-01/jev_profile
node scripts/preserved-artifact-repair.mjs --manifest benchmarks/e2e-swe/manifests/d075-preserved-repair.json --source-run benchmark-runs/d073-comparison-01/jev_profile --spend benchmark-runs/d075-preserved-primary-01
```

The first command is read-only inspection and makes no inference. The second is an actual fresh run reserved for root; this role has not executed it.
