# Codex E2E integration review

Role: read-only review under `R20261014_CODEX_E2E.md`; only this status document is writable. Date: 2026-10-14. No provider calls, services, ledger changes, or source edits performed.

## Verified existing wiring

Inspected with `rg -n` and `sed -n` in `src/benchmark/adaptive-dag-runner.mjs`, `adaptive-question-forms.mjs`, `src/orchestration/adaptive-layered-decomposition.mjs`, `adaptive-dag-execution.mjs`, `adaptive-inferred-scope.mjs`, `adaptive-owner-criteria.mjs`, and `pointsman-gateway.mjs`.

1. Load and validate the historical catalog with the original `pointsman-d083.json` manifest through `loadAdaptivePublicInput(rootDir, manifest)` and `loadAdaptiveSharedPreparation({rootDir, manifest, preparationDirectory, input})`. This checks the exact historic catalog generation receipt/profile/limits/source pins. Do not rewrite the manifest to substitute Codex profiles.
2. Build checks with `buildAdaptiveChecks({catalog, registry, manifest, source_ref: input.source_ref})`, and assertion-to-requirement mapping with `loadAdaptiveTestRequirements(rootDir, manifest)` (93 entries).
3. Call `planLayeredDag({...input, catalog, checks, profile_id: fixedCodexProfileId, goal_revision: input.source_ref.sha256, limits, max_concurrency, contractPath: LAYERED_CONTRACTS.v2, decide, record})`. Do not pass an early commit. Actual provider calls here have stage `split`, decision IDs `adaptive-unit-relations-N`; subsequent split/group/relation decisions are scripted by the existing planner.
4. Apply `applyWorkloadEstimates(planning.plan, loadScheduleContract(manifest.schedule_policy.contract))`; persist the resulting full planning snapshot durably before marking `dispatch_allowed: true`, `durable_commit_callback: true`. This reproduces the existing schedule hook without importing its provider policy.
5. Call `runAdaptiveDagExecution` with the final plan, original artifact bindings, full planning snapshot, fresh run directory, public checker files, environment ID, callbacks, test mapping, and fixed profile. Required execution callbacks are `executeTask(task, workerContext)`, `checkTask(check, checkContext)`, and `probeEnvironment()`. Use identical callbacks in both arms.
6. D083 repair arguments: `repairScopePolicy: 'public-inferred-owner-v3'`, `artifactRepairPolicy: 'inferred-v3'`, `projectRepairFailure: projectAdaptiveRepairFailure`, `assertionContract: {contract, source_text, sha256, source_path}`, `repairBudget: {policy: 'repair-budget-v3'}`, copied `manifest.repair_feedback`, and `maxRepairRounds: manifest.max_repair_rounds`.
7. Set `decideRepairOwners: (request, metadata) => decide(describeOwnerCriteria(request, ownerContractV2), metadata)`. Executor already performs diagnostics attachment, owner request packing, multipart calls and answer merging. Do not repeat or bypass these steps.
8. Set `decideRepair: request => selectInferredOwnerScope(request)`. This is a deterministic rule selecting the inferred-owner union (or permitted expanded union), zero provider calls. There is no need to fabricate a `repair` API call. No `prepareRoundPlan` or spec review in this fixed-worker comparison.

## Neutrality and gateway boundaries

- Do not use `createQuestionFormHooks`: it calls `session.decide('jev', ...)` internally. Its optional deferral path can call Claude, and `afterPublicGate` invokes Claude spec review.
- Do not call `runAdaptiveArm`, `adaptivePreflight`, or `createAdaptiveProfilePreparer` unchanged: they assume Claude profiles/auth/usage and/or hardcode Jev owner decisions.
- `createAdaptiveProviderSession` with v13 allows only `jev`; it is suitable for the Jev decision transport, not the Codex baseline. Instantiate no Jev session in baseline.
- Direct `createPointsmanGateway` is provider-neutral at response validation: it requires model string, valid nonnegative usage, exact question IDs/types/choice membership. For each Codex call use `begin`, `assertBefore('before_reservation')`, `assertBefore('before_post')`, and `accept` only after durable Codex receipt. These phase names are validation phases, not proof of a Jev reservation. Record baseline Jev calls/reservations as zero.
- A fresh monotonically increasing gate decision ID avoids collisions: owner multipart metadata can reuse original decision IDs.
- Source pins and initial canonical request body remain unchanged. Gateway failure must withhold output from the execution controller.

## Found comparison confound and agreed correction

`readUnitRelations` at lines 54–65 uses summed coupling probabilities when present; otherwise selected-choice coupling is 0 or 1. Existing Codex decision schema returns choices only, whereas Jev commonly returns distributions. Comparing these directly would change both provider and downstream numerical inputs.

Root agreed: retain raw accepted provider response and probabilities in gateway/transport receipts, then record and apply a **choice-only projection for both arms** before `planLayeredDag` consumes the answers. This is the primary controlled comparison and intentionally differs from legacy probability-weighted Jev clustering. Neither route should silently synthesize confidence or probabilities. An optional later probability-aware comparison needs a separate protocol.

## Still to review

New runner integration and targeted tests are pending. No paid development run or success/speed/cost result has been verified by this role. Root should distinguish schema/source checks, fixture execution, actual provider attempts, public completion, and independent same-candidate grade.

## New runner review and offline integration — completed

Reviewed `codex-e2e-runner.mjs`, `codex-e2e-decisions.mjs`, the CLI, and worker/check integration. Reported three concrete issues to root: decision cwd inherited repository instructions, independent grader identity was outside comparison source pins, and uncertain Codex receipts could throw errors without an uncertainty flag. Root corrected all three in the reviewed working tree. Recommended additional comparison artifact consistency checks before emitting efficiency ratios.

Added owned test `test/codex-e2e-integration.test.mjs`. Command: `node --test test/codex-e2e-integration.test.mjs`; final result **3 tests passed / 3 tests**, zero external model calls.

- Real fixed-wording gateway, layered planner, workload scheduling, durable commit, ArtifactSession controller writes, execution checks and inferred-owner repair all run against a three-artifact fixture. Three initial worker calls plus exactly one repair call complete the fixture. The repair only rewrites `src/c0.txt`; `src/c1.txt` and `src/c2.txt` each appear in only one worker call. Accepted external-decision stages are `split` and `repair_owners`; no profile-selection or synthetic repair provider call is added. Every decision receipt is Codex with Jev reservations zero.
- Invalid fixed wording blocks before mock provider dispatch, and the stopped session refuses another decision.
- A mock provider writes an uncertain receipt and throws an otherwise unannotated cancellation. The decision adapter propagates `outcome_uncertain: true`, does not accept a gateway response, and reports unknown tokens and price as null.

The first integration attempt correctly failed `DAG_RUNTIME_CHECKER_ALIAS` because macOS temporary paths used a symlink alias. The test now canonicalizes its root with `realpathSync`. Next, test cleanup failed on the executor's read-only snapshot directories; the cleanup helper now restores directory permissions solely inside its own temporary fixture tree. These were test harness issues, not successful product runs. Three known temporary directories from debugging were removed; successful tests clean their own directories. No paid development performance, Docker product completion, or independent grade is claimed by these tests. New tests and this status remain uncommitted.
