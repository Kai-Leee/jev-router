# D064 P0 contract role — 2026-10-10

Status: implementation and focused offline checks complete. Shared fixture and API are frozen for the D064 scheduler, verification, public-mapping and root integration roles. This record does not assert product execution readiness or a performance improvement.

Owned files only:

- `src/orchestration/dag-contracts.mjs`
- `docs/orchestration/contracts/artifact-dag.v1.schema.json`
- `examples/dag/contract-fixture.json`
- `test/dag-contracts.test.mjs`
- This status record.

## Interfaces

`validateDagPlan(plan)` returns an independent structured clone and preserves task order. It throws an `Error` with `code` and `path` on invalid input. Unknown fields, missing fields, malformed types, duplicate lists, non-JSON accessor/hidden records and sparse arrays are rejected. It does not normalize an invalid plan into a valid one.

`publicCheckMapping({requirement_ids, test_ids}, registry)` validates public registry metadata and returns:

```json
{
  "status": "mapped | blocked",
  "mapping_only": true,
  "missing_requirement_ids": [],
  "missing_test_ids": [],
  "checks": []
}
```

Registry entries have all plan-check fields plus `origin: "public_specification"` and nonempty unique `test_ids`. `checks` is the selected cloned subset. Several public descriptions may map to one suite and several suites may overlap; missing IDs remain exact. An empty registry reports all requested IDs missing. Empty requested requirements **and** tests are invalid. `mapped` means metadata coverage only; no runner is called or assertion certified.

## Contract boundaries

- Version is `artifact-dag/v1`; `unknown_relationships` is the required relationship field, including when empty.
- Each goal requirement has exactly one implementation owner. Verification may reference the same requirement. All referenced IDs must exist.
- Every task requirement must occur in a task-assigned check. Check requirements stay within that task's requirements.
- Every artifact has exactly one matching output declaration and producer. Task inputs cannot be self-produced. Every output must have a producer-assigned check in this first version. **Deferred downstream-only verification is unsupported**; root approved this restriction for v1.
- Every check has one task owner, concrete nonempty argv/cwd/environment/source metadata, and only artifacts present in that task's input/output vector. Integration checks require a verification task. Verification may have no output and no worker.
- Implementation tasks require a declared worker. Task, worker and artifact IDs are distinct namespaces; a worker may serve many tasks. Workers cannot exceed `worker_limit`, and its maximum is 30. Task count has no worker cap. Concurrency is positive and at most `worker_limit`; default 2 is fixture/config policy, not a hard upper limit.
- Parent edges are organizational, with existing distinct parents and no parent cycles. Artifact input-producer edges alone define semantic dependencies. `analyzeDag` owns semantic cycle rejection; callers must use the graph layer before scheduling.
- Unknown pairs contain exactly two distinct existing task IDs, a reason and explicit evidence references; unordered duplicate pairs reject. The contract preserves the records. The scheduler owns dispatch blocking and propagation to dependents; unrelated tasks are not converted into global blockers.
- Unknown duration remains `estimate_ms: null`, `sample_count: 0`; estimates must be finite and nonnegative. Observed durations require a positive sample count and source references. Aggregate overflow belongs to graph analysis.
- Scope/cwd/source paths are canonical relative POSIX paths. Absolute, backslash, empty/dot/dotdot segments, encoded/URI/drive/home/glob aliases, padded segments and non-NFC spelling reject. Equal/directory-ancestor overlap remains a runtime lease concern. Symlinks, case-insensitive aliases and actual allowed filesystem access are **not** enforced by this module.
- Profile/environment/runner references identify controller-owned configurations. Their installation, integrity and actual environment matching are runtime concerns. Metadata cannot establish trusted execution, safe command arguments or assertion adequacy. `attempt_id` is a runtime identity and is deliberately absent from the immutable plan.

## Shared fixture

Two independent implementation branches, `build-core` and `build-ui`, produce `artifact-core` and `artifact-ui`; `verify-integration` reads both and has no output/worker. Synthetic estimates are 30/20/10 ms, hence a hand-calculated semantic critical path of 40 ms. These are illustrative estimates, not observed execution durations.

The three concrete commands run Node assertions on isolated `examples/dag/output/core.json` and `ui.json`. Normal values are `{"value":7}` and `{"label":"value:7"}`. The commands check core, UI, and their relation respectively. They are fixture controls, not the E2E-SWE product's public check mapping.

## Actual verification

From the repository root, on Node **v26.4.0**:

- `node --test test/dag-contracts.test.mjs`: **22 tests passed**, 0 failed/skipped/cancelled.
- `node --check src/orchestration/dag-contracts.mjs`: passed.
- The fixture parsed and passed `validateDagPlan`: 3 tasks, 2 workers, 0 unknown relationships.
- Tests accept 43 tasks on 2 workers and 30 workers, and reject worker 31, ownership gaps, double ownership, dangling refs, unchecked requirements/artifacts, future-artifact checks, parent cycles, unknown-pair aliases and path aliases.
- Tests execute all 3 fixture commands in a temporary workspace for 4 controls: normal `[0,0,0]`, wrong core `[1,0,1]`, wrong UI `[0,1,1]`, missing core `[1,0,1]`. All 12 command exit statuses matched; the temporary workspace was removed. This is actual local assertion execution, separate from registry metadata validation.
- Published JSON Schema parsed successfully; tests check closed record keys and its path regex against the same alias cases. No independent full JSON Schema engine was available (`jsonschema_available=False`), and none was installed. Semantic invariants are exercised through `validateDagPlan`; the JSON Schema explicitly documents the additional semantic layer.

The fixture's environment label is metadata, not evidence of running a pinned Node 22 environment. The control execution above used the observed Node version. No real worker, provider request, paid inference, network execution, product-grade run, historical source rewrite, original Personal OS modification, ledger change, commit or push occurred in this role.

## Handoff

Root may integrate the frozen APIs and fixture, then run the complete regression and independent review. P2 must reject artifact cycles and handle finite aggregate timing; P3 must bind exact check evidence to revision vectors/environment and reject drift. P0 public mapping completeness is owned by the mapping role, not established by these fixture checks.
