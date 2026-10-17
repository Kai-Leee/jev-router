# Partial readiness repair — 2026-10-15

Purpose: preserve the completed and never-started task states when a local readiness check fails before all artifacts exist. An exact task/check owner is a scripted runtime fact, not a model owner inference. Public failures continue through the existing inferred-owner path.

Files owned:
- `src/orchestration/adaptive-dag-execution.mjs`
- `src/orchestration/adaptive-partial-repair.mjs`
- `test/adaptive-partial-repair.test.mjs`

New opt-in: `partialRepairPolicy: 'local-readiness-v1'`. The runner must explicitly set it for both arms. It verifies failed local check identity/version, task/attempt, runtime binding/environment, every failed stage output revision and manifest, and the unchanged DAG ownership/write scope. Only the failed check's owned artifacts become writable. Successful tasks carry forward; undispatched tasks remain implementations with empty revision maps. A downstream completed consumer of a newly selected failed owner is rejected instead of silently carrying stale data. The original all-artifact inferred validators and legacy behavior remain unchanged.

The pre-repair authorization callback runs with stage `local_readiness_repair`. Committed journal evidence precedes the next worker. Existing seed rehash, runtime scope audits, per-artifact inheritance proof, worker receipt and public check gates remain mandatory. No model call is needed to rediscover the already bound local task owner. Partial repair attempts retain their action and round records; they do not enter the older complete-artifact causal history, which requires revisions for every artifact.

Also integrated owner_evidence agent's explicit `publicOwnerEvidencePolicy: 'public-source-v1'`: collect/journal public source evidence, attach before owner request packing, extend sealed candidates after owner inference and worker-mentioned expansion, enforce coverage before execution commit. Root must wire its corresponding selector and source pins.

Validation executed:
- `node --test test/adaptive-partial-repair.test.mjs`: **3/3 pass**. Real filesystem/ArtifactSession/runtime regression first reproduces `ADAPTIVE_INFERRED_ARTIFACT_BINDING` on legacy input, then the opt-in reaches public completion: implementation 3, repair 1, carry-forward 1. The repair narrows to `producer.py`, preserves `ir.py`, and dispatches the previously blocked renderer exactly once. No model or Docker calls.
- Same test verifies precondition rejection prevents repair dispatch; modified prior staged bytes also prevent repair dispatch (the existing generic runtime callback wrapper conservatively records uncertain).
- `node --test test/adaptive-partial-repair.test.mjs test/adaptive-inferred-execution.test.mjs test/adaptive-dag-execution.test.mjs`: **45/45 pass** before final third test addition. Latest dedicated 3/3 includes the added mutation guard.
- Read-only archived-byte reconstruction from `benchmark-runs/codex-e2e-mac-20261014-02/pair/jev/execution.json`, `plan-commit.json`, runtime `journal.jsonl`, and its staged files selected **adaptive-leaf-n3 / A06 only**. Proof SHA `a2a62009ac653c1690f036a5791da08a5af8db324f21f19fa3b7137916339a94`. n3 has 6 staged revisions; ready n2/n5 have 4/3 respectively; undispatched n1/n4 have 0. No original files modified and no invented revisions.

Not claimed: this fixture is not a paid-model completion or a performance improvement. Actual paired rerun, gateway source pin refresh, overall preservation audit and publication belong to root.
