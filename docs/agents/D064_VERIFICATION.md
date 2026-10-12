# D064 P3 artifact verification — 2026-10-10

Owner: verification role. Scope and file ownership: [D064 parallel contract](D064_PARALLEL.md).
Design basis: [D063 artifact/check conditions and P3](../orchestration/D063_DAG_PLAN.md).
Status: local implementation and focused offline verification complete; main owns workflow integration,
full regression, final review, and decision/state indexes.

## Owned changes

- `src/orchestration/artifact-verification-gate.mjs`: new opt-in task gate.
- `test/artifact-verification-gate.test.mjs`: 75 tests using the shared P0 fixture and controlled counterexamples.
- This status record. Existing gates, historical run sources, budget ledger and public mapping are unchanged by this role.

## Runtime contract

`executeArtifactTask({plan, task, execute, runCheck, getRevision, record, attempt_id,
expected_input_artifact_revisions?})` validates and clones the P0 plan and requires the supplied task
to match its plan entry. It rejects invalid callbacks before executing. A verification task can omit
`execute`; even when supplied, that callback is never invoked for a verification task.

Controller callbacks:

- `getRevision(artifact_id, {plan, task, attempt_id, stage, check_id?})` returns a nonempty opaque revision string.
- `execute(task, {plan, attempt_id, input_artifact_revisions})` returns explicit `status:'completed'`
  without uncertainty. A worker's embedded verification or claimed pass is ignored.
- `runCheck(check, {task, attempt_id, artifact_revisions})` runs the controller-owned check and returns
  the evidence fields specified in D064. Task/check/plan/vector arguments are independent clones.
- `record(event)` receives cloned check lifecycle events. Root supplies run/revision/event IDs and time.

The optional expected-input vector is an integration refinement requested by main after reproducing
the workflow precheck/snapshot race. When supplied, its keys must be exactly the task input IDs, its
values must be nonempty revisions, and the initial input snapshot must match before implementation
executes. It is cloned before asynchronous reads. Root workflow passes it on every task, including
`{}` for tasks with no inputs. Standalone callers can omit it; omission does not establish predecessor
verification and should not be used as a workflow readiness substitute.

The gate snapshots inputs, executes implementation if applicable, then obtains outputs. It rechecks
the complete input/output vector before checks, after every `runCheck` attempt, and after the last
completed-check record immediately before returning a publishable result. A malformed or thrown
check still triggers the post-run revision check. Each check receives the complete task vector even
if its declared `artifact_ids` is only a subset. A later check cannot modify an earlier checked artifact,
and the first check cannot silently change an artifact required by a future check.

Evidence must bind the assigned check ID/version/environment and the exact complete vector.
Required success fields are `status:'passed'`, `executed:true`, `exit_code:0`, a positive safe-integer
assertion count, `skipped:0`, and `outcome_uncertain:false`. Missing, extra, stale, skipped, zero-assertion,
failed or uncertain evidence rejects. Every assigned check must pass. Callback failures propagate;
there is no retry. Falsy thrown values are normalized to errors so they cannot accidentally become success.

Only full success returns `{status:'completed', verification:{artifact_revisions, evidence}}`.
Check events are `dag_check_started` and `dag_check_completed`, carrying task/attempt/check IDs,
check version, phase, environment and pinned artifact vector. Completion adds `status` as
`passed|failed|uncertain`, `outcome_uncertain`, nonnegative reported assertion/skipped counts or `null`, and
an `error_code` on rejection. A passed check event can be followed by task failure if publication detects
later drift; consumers must use task/workflow completion, not the check event alone.

## Actual verification

Commands run from the repository root:

```sh
node --test test/artifact-verification-gate.test.mjs
node --test test/artifact-verification-gate.test.mjs test/dag-workflow.test.mjs
```

The initial focused run passed 64/64. After the expected-input refinement, falsy revision-error regression,
and normalization of invalid negative event counts requested by the observation owner, the combined run
passed **82/82**, with **75 gate tests and 7 main-owned workflow tests**,
zero failures and zero skipped tests. This is the observed count at this role's completion; later main
regression results belong in the main verification record.

The shared `examples/dag/contract-fixture.json` is exercised with real local Node subprocesses in a
temporary directory: `build-core` and `build-ui` each write JSON and pass their frozen assertion,
then `verify-integration` runs its independent cross-artifact assertion without implementation execution.
Revisions are actual SHA-256 hashes. A separately authored `{value:6}` defect fails the fixed core
assertion despite a worker-supplied pass claim. Temporary fixture directories are removed by the tests.

Other counterexamples cover the approved-input race, drift during implementation, future/earlier
check dependencies, post-check record mutation, identity/version/environment mismatch, missing/extra
vector entries, incomplete evidence, zero/skipped assertions, explicit uncertainty, thrown callback
failures, callback isolation and later mutation of returned controller evidence.

## Limits and handoff

These checks demonstrate controller and local fixture behavior. They do not validate all 85 product
specifications, real model behavior, provider runtime, independent product quality, or any time/cost
improvement. The role made no paid calls and did not inspect hidden grading code.

The callback trust boundary remains explicit: evidence fields alone cannot prove that a process ran or
that assertions cover requirements. The controller must register meaningful check runners, bind the
actual environment, and use immutable snapshots or hold the relevant resource leases across revision
reads, checks and publication. The gate does not implement atomic filesystem snapshots, symlink/alias
isolation, or prevention of out-of-band transient writes. Workflow readiness, already-published artifact
invalidation, durable restart/reconciliation and product mapping remain responsibilities of their adapters
and main integration; this standalone function does not claim to replace them.

Main next action: integrate the completed gate and exact expected-input vector into the opt-in workflow,
run independent review/full regression, and record that product execution remains blocked where public
mapping is incomplete. This role has finished writes to its three owned files.
