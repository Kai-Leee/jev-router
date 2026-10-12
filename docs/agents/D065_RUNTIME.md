# D065 real filesystem runtime — 2026-10-10

Owner: filesystem/runtime role. Contract: [D065 parallel roles](D065_PARALLEL.md).
Status: implementation complete; focused offline verification passed; handed to runner and independent reviewer.
This role owns only `src/orchestration/dag-filesystem-runtime.mjs`,
`test/dag-filesystem-runtime.test.mjs`, and this record. D064 gate/kernel sources were not changed.

## Factory and controller handshake

```js
const runtime = await createDagFilesystemRuntime({
  plan, run_id, runDirectory,
  artifactBindings: {"artifact-id": {paths: ["src/file.py"]}},
  checkerRoot: repositoryRoot,
  checkerFiles: absoluteCheckerAndFixtureFiles,
  environment: {id: plan.checks[0].environment_ref},
  probeEnvironment, executeTask, checkTask, record: optionalExternalRecord,
});
await runtime.initialize();
const result = await runArtifactWorkflow({
  plan, run_id, execute: runtime.execute, runCheck: runtime.runCheck,
  getRevision: runtime.getRevision, record: runtime.record,
});
const exported = await runtime.finalize(result);
```

`checkerFiles` also accepts `{path:absolutePath, relative_path:relativePath}` records.
The string form uses `checkerRoot` to preserve the checker source tree. Call `runtime.close()` in error
cleanup. Initialization exclusively creates `<runDirectory>/runtime`; an existing runtime always blocks
replay and reports its journal state. `journalState()` is read-only and remains callable after close.

`executeTask(task, context)` receives the kernel context plus `stageDirectory`, `inputDirectory` and
`workspace` (alias of staging). Inputs appear at their original relative paths. The callback supplies
actual worker execution/receipts; this runtime launches no model or paid process.

`checkTask(check, context)` receives `task`, `attempt_id`, `candidateDirectory`, `inputDirectory`,
`pinnedDirectory`, `artifact_revisions`, `environment:{id,fingerprint,observed}` and `binding_digest`.
It must execute an independently registered checker and return the real check report. The runtime
does not turn a failed or missing report into a pass. A `null` report artifact vector, as returned by
the public Python runner, is bound by the controller to the exact audited task vector.

Runner agreed to use the pinned Docker image, read-only candidate/checker mounts and network-none
execution for candidate checks. Public integration owner supplied candidate binding v2:
`{schema_version:'dag-public-command/v2',kind:'candidate',candidate_root:'/candidate',environment_ref}`.
The public checker installs the candidate offline into its temporary environment. Docker invocation,
image/dependency probing, candidate setup and actual product evidence belong to the runner/public-check
owners; this role's tests use local Node JSON fixture checks.

`finalize(result)` returns `candidateDirectory`, exact `artifact_revisions`, `binding_digest`,
`environment`, `plan_hash`, status and journal state. It assembles only successfully published artifacts,
so a failed workflow may yield a partial candidate. Root must keep partial output distinct from product
completion and inspect unresolved journal state.

## Enforced behavior

- Explicit artifact IDs bind to canonical relative file/directory sets. Every output binding belongs to
  its producer write scope. Case-folded, ancestor or duplicate binding overlap rejects.
- Each task attempt receives independent staging and read-only input copies. Only declared input
  artifact files within its read scope are materialized. Source hashes, sizes and executable bits define
  artifact revisions; file contents and complete published trees are rechecked before consumption.
- Staging is compared against the initial input tree. Declared-scope writes are checked, and every staged
  input must preserve its baseline bytes even if a coarse write scope overlaps it. Both immutable input
  copies and published predecessor bytes are audited. Symlinks, hardlinks, special files, case collisions,
  noncanonical paths and symlink ancestors reject. Final worker staging and verification-only staging
  become read-only before checks.
- Worker begin is durably appended and fsynced before dispatch. Pins/environment, current inputs and
  staging are audited immediately before `executeTask`, then again after it returns. `checkTask` has the
  equivalent audit after its environment probe and before execution, followed by a post-check audit.
- Checker/fixture copies and original sources are hash-pinned. `probeEnvironment()` supplies an actual
  JSON fingerprint, rechecked at worker/check/publish boundaries. Drift invalidates the attempt.
  Evidence includes `runtime_binding` and `evidence_key`, hashing the checker manifest, actual environment,
  plan, artifact bindings, check identity/version and exact artifact vector.
- A completed task event publishes only when every assigned check passed and the final audits hold.
  The runtime copies each artifact into an immutable publication directory and writes a hash manifest
  before forwarding the event. Scheduler consumers therefore open only after publication completes.
- The hash-chained JSONL journal serializes concurrent writes and fsyncs each entry. Worker/check begin
  precedes callbacks. Returned or thrown uncertainty remains unresolved; incomplete or corrupt journals
  cannot authorize replay. `status:'unknown'` explicitly becomes `outcome_uncertain:true` in both worker
  and checker return envelopes, preserving the outer kernel's uncertainty signal.
- `bindPlan(nextPlan,{artifactBindings?})` requires no active/uncertain attempts, validates the new graph
  contract, preserves completed task/check/artifact ownership and updates the plan/binding hash. Old graph
  events and callback plans reject. The current runner binds the final semantic plan before starting a
  workflow; this method does not add dynamic resume to the historical kernel.

## Actual focused verification

`node --check src/orchestration/dag-filesystem-runtime.mjs` passed.
`node --test test/dag-filesystem-runtime.test.mjs` last ran **16/16 passed**, zero failures or skips
(8 top-level behaviors with 8 distinct filesystem/drift/status subcases).

The normal case uses real temporary files, separate input/staging/published directories, real SHA-256
manifests and three subprocess executions of the pinned Node checker. It confirms durable worker begin
is visible before the worker callback, exported contents and read-only file modes.

Faults cover an out-of-scope write, symlink, hardlink, case alias, changed immutable input copy, checker
source drift, observed environment drift, uncertain worker restart, unknown worker/check status, old graph
events and edits to completed check definitions.

Independent reviewer reproduced a missing pre-worker audit: a wrapper changed staged input to `999`
after the gate's input snapshot, and the callback consumed it before the old post-execution audit failed.
The added regression now confirms **consumer callback calls = 0**, failure
`DAG_RUNTIME_STAGED_INPUT_MUTATED`, and a known failed journal transition. The reviewer also found
`status:'unknown',outcome_uncertain:false` could disagree with the uncertain journal; return normalization
now keeps workflow failure and journal uncertainty aligned. Both are actual code corrections, not claims
that the initial implementation already enforced those boundaries.

The first case-alias fixture created a second spelling after the lowercase directory already existed;
on this case-insensitive host that was a no-op, so its expected pre-check rejection failed. Creating the
uppercase parent first produces an actual noncanonical tree and now rejects. No failing historical
evidence was deleted or reclassified as a passed run.

## Limits and handoff

Read-only modes and lexical/tree audits are **not an OS sandbox**. The same user can chmod files, and an
uncontrolled concurrent process can race filesystem reads. The runner's restricted worker tools and
contained Docker checks must provide process containment; these audits enforce detection at the trusted
controller boundaries. Arbitrary adversarial host activity, an atomic multi-file snapshot primitive and
kernel-enforced leases are not claimed. The runtime is conservative about all existing run directories;
automatic crash recovery, reconciliation and replay are intentionally absent.

No paid calls, container creation, hidden grader reads, historical kernel edits, ledger changes, commit,
push or original Personal OS/Vault edits were performed by this role. Product coverage, actual candidate
setup/runtime and real execution quality are pending runner/public-check integration and root's final
frozen-run verification. Local fixture elapsed time is not a product speedup measurement.
