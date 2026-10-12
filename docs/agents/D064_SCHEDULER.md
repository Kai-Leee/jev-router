# D064 P2 graph and scheduler status — 2026-10-10

Owner: scheduler role under [D064 parallel contract](D064_PARALLEL.md). Implements the P2 foundation from [D063](../orchestration/D063_DAG_PLAN.md). Repository checkout is shared; only the five files listed below were written by this role.

## Implemented

- `src/orchestration/artifact-dag.mjs`: validates through `validateDagPlan`, derives edges exclusively from consumed artifacts and their producers, rejects semantic cycles, and returns deterministic topological order, predecessor/successor maps, ES/EF, remaining paths and priority order. Parent relationships and shared paths do not add execution edges. Verification durations are counted once.
- Unknown duration propagates `null` through affected timing calculations and makes the global critical path `null`; priority falls back to task input order. Known ranks otherwise use longer remaining path first with stable input order ties. Finite node estimates that overflow a path are rejected.
- Unresolved relationships also make the global critical path `null`. `dependency_model_complete:false` and `critical_path_basis:'known_artifact_edges_only'` label the remaining partial timing maps. Resolved relations use `dependency_model_complete:true` and `critical_path_basis:'declared_artifact_edges'`. These are duration-model estimates, not measured completion times or resource-constrained optima.
- `src/orchestration/dag-scheduler.mjs`: schedules completion events without level barriers. Artifact predecessors must have a completed callback result before a successor starts. Same-worker and read/write or write/write overlap holds a resource lock. Paths overlap by exact equality or directory ancestry, so `src` conflicts with `src/file`, while `src2/file` remains independent. Read/read overlap is allowed.
- Every task, including verification with `worker_id:null`, consumes a scheduling slot. Task/root count is not capped at 30; the worker pool and configured slots remain separate. Unknown relationships block their participants and dependent consumers while unrelated branches can finish.
- Callback failures, non-completed returns and uncertain outcomes stop admission and drain all in-flight promises. There is no retry loop. Caller inputs, callback arguments and returned callback values are cloned. Each dispatched attempt receives a UUID and the same ID is passed through its start/finish events and execution context.

`runDag({plan,execute,record,clock,maxConcurrency})` returns `status` (`completed`, `blocked`, `failed`), a `results` object keyed by task ID, completion-order `completed_ids`, input-order `undispatched_ids`, and optional failure details in `failure` (`null` when absent). Each result includes `task_id`, `attempt_id`, `status`, and either a cloned completed `value` or failure `code`/`outcome_uncertain`. `clock` may be a function or `{now()}`; values must be finite, nonnegative and monotonic. Invalid plans/configurations throw before execution; normal unresolved relationships return `blocked`.

The scheduler emits only `dag_task_started`, `dag_task_completed`, `dag_task_failed` and `dag_task_blocked`. Root workflow emits plan/run events and adds the common run/revision/event envelope. Scheduler events carry local monotonic `at_ms`; root may replace it with its common envelope clock. Wait reporting uses one exclusive reason per transition: unknown relation, dependency, resource (worker before scope), then slot. Once a failure stops the run, undispatched tasks transition to `run_failed`. Started attempts close their prior waits. Record/clock failure stops admission and drains work; missing lifecycle records remain missing evidence.

## Verification actually run

```sh
node --test test/artifact-dag.test.mjs test/dag-scheduler.test.mjs
```

**31/31 passed**, zero failures/skips/cancelled. Tests cover the hand-computed CP9 vector, shared fixture CP40, verification duration, unknown duration and relationship metadata, FIFO ties, true cycles, a false shared-path cycle, dangling references, duration overflow, caller isolation, and 37 task roots with two workers. Controlled promises and fake clocks verify short-branch successor release, scope/worker locks, read/read overlap, verification slots, exclusive wait transitions, unrelated branches under unknown relationships, failure draining, uncertainty retention, no implicit retries, monotonic timestamps and recording failure.

```sh
node --test test/artifact-dag.test.mjs test/dag-scheduler.test.mjs test/dag-contracts.test.mjs test/artifact-verification-gate.test.mjs test/dag-workflow.test.mjs
```

**133/133 passed**, zero failures/skips/cancelled, against the available shared checkout after contract/gate/root workflow integration. This includes other owners' tests and isolated local fixture checks; ownership of their implementation remains with those roles. Full repository regression belongs to root. `git diff --no-index --check /dev/null <file>` returned no whitespace diagnostics for all five owned files; they remain untracked until root stages them.

## Boundaries and next owner

- `runDag` requires a controller that returns `status:'completed'` only after actual artifact verification. The scheduler itself does not certify checks; root's `runArtifactWorkflow` composes the revision gate and publication guards.
- Lexical scope locks do not enforce operating-system access, symlink/case aliases, undeclared writes or external resources. Execution isolation and filesystem alias handling belong to the runtime adapter. V1 has no separate environment/resource-key field, so such resources must not be assumed locked.
- Scheduler state is in-memory. Fresh UUIDs and event records do not provide durable resume or externally guaranteed exactly-once execution. Root workflow rejects `resume`; caller-managed receipts and reconciliation are prerequisites to any future restart capability.
- Synthetic scheduling assertions and local fixture execution establish behavior, not end-to-end product success, public mapping completeness, paid model integration, or a performance improvement.
- No provider requests, budget-ledger changes, original Personal OS changes, commits or pushes were made by this role. Root owns integration documentation, complete regression and independent review.

Written files: `artifact-dag.mjs`, `dag-scheduler.mjs`, `test/artifact-dag.test.mjs`, `test/dag-scheduler.test.mjs`, this status document. P2 writes complete; root may proceed with review/integration.
