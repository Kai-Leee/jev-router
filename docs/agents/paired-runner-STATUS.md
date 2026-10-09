# Paired runtime runner status

Updated: 2026-10-09. Owner: `/root/benchmark_bootstrap`, runner delegate for D-019.
Purpose: connect Claude implementation and Jev decisions by run identity while preserving separate
provider/runner/gate/evaluator outcomes. No inference, authentication lookup, Docker operation or
existing run modification was performed by this role.

## Owned implementation

- `src/benchmark/launch.mjs`: explicit `max_decisions:null`; explicit OAuth
  `claude_max_budget_usd:null` omits the USD CLI flag. Missing/invalid limits still reject. API-key
  mode retains a finite positive dollar cap. Safe optional IDs normalize to a generated run ID,
  matching default attempt/group IDs and `agent_role:implementation` for old config compatibility.
- `src/benchmark/runner.mjs`: new injectable runtime, private exclusive output directory,
  early manifest, durable journal, atomic heartbeat, preflight details, provider stream, observed
  completion classification, artifact freeze confirmation and terminal result.
- `bin/benchmark-run.mjs`: CLI wrapper; dry run does not allocate or execute. A valid config under
  `--spend` creates its manifest before brief/auth/sandbox/Jev lookup. Invalid configs and occupied
  output paths fail before writing, because a safe new run identity/location is not established.
- `test/benchmark-runner.test.mjs`: focused fault injection, no external provider or Docker call.

The new runtime uses main's `processResult` cancellation via `abortSignal` and `killProcessTree`.
Heartbeat write failure or SIGINT/SIGTERM aborts the provider group; the exact previously inspected
sandbox is stopped and inspected to confirm `State.Running === false`. Process timeout and command
uncertainty are never replayed. A killed/unresponsive runner or total storage failure cannot be
made durably observable by that same process; absence/staleness remains a reader concern.

## File contract sent to main/metrics/gate

All run files/events carry `run_id`, `attempt_id`, `group_id`, `agent_role`. Identifier syntax is
`[A-Za-z0-9][A-Za-z0-9_.-]{0,95}`. Caller-provided IDs are preserved; malformed IDs are rejected.

- `manifest.json`: validated config and identifiers, `evidence_kind:live`, start time, workload,
  initial `actual_container_id:null`, `actual_image_id:null`, `preflight_status:pending` and isolation
  declaration. It is an immutable early-start snapshot; current phase is in the journal/result.
- `preflight.json`: success time/status, actual container/image IDs, safe model names, CLI version,
  brief and instruction hashes. It supplements the early manifest; it contains no auth response.
- `server.json`: flat identifiers, mode, container, `max_decisions`, trace path and gate-state path.
  Gate/telemetry delegate owns propagation to decision/request records and atomic gate state.
- `runner.jsonl`: `recorded_at,event,phase,status,code` plus identifiers. No arbitrary exception
  diagnostics, commands, prompts, environment or model text is included.
- `runner-heartbeat.json`: identifiers, `pid,recorded_at,phase`; atomic replacement. Writer activity
  only, not progress, correct model behavior or guaranteed health of the entire process tree.
- `result.json`: identifiers and existing provider usage, with `runner_status`, `runner_error_code`,
  `finished_at`, `artifact_frozen`, `cleanup:{container_id,stopped}`. Evaluation remains separately
  `evaluator_success:null`. Model usage/cost are not erased when runtime fails after inference.

Journal event states:

| Event | phase | status |
|---|---|---|
| runner_started | initializing | running |
| preflight_started | preflight | running |
| preflight_failed | preflight | failed |
| provider_started | provider | running |
| provider_finished | provider | completed / failed / uncertain |
| runner_finalizing | finalizing | running |
| artifact_frozen | finalizing | completed |
| runner_terminal | terminal | completed / failed / uncertain |

Runtime completion requires one valid successful provider final, CLI exit 0, exact requested model
identity, confirmed artifact freeze and a matching healthy gate completion claim. A provider final
does not finish the runner, and a gate completion claim does not pass independent evaluation.
Missing/conflicting final, missing model identity or version-suffixed unconfirmed model ID remain
uncertain. A different observed model fails with `MODEL_IDENTITY_MISMATCH`; fallback is disabled.
Stopped gate and cleanup failure override a successful provider final.

Result persistence precedes a successful terminal event. If result writing fails, a separate safe
uncertain terminal journal event is attempted. If terminal journaling fails, the result is atomically
downgraded to uncertainty where storage still permits it. No full-storage-failure durability claim.

## Focused verification

`node --test test/benchmark-runner.test.mjs test/benchmark-transport.test.mjs test/benchmark-telemetry.test.mjs`

Current focused result: 33/33 passed, 0 failed/skipped (including concurrently updated telemetry tests).
Twelve new runner tests cover explicit null vs
missing limits, ID defaults/validation, secret filtering, early brief/auth/model lookup failures,
exclusive directories, finalization before freeze, model/final validation, stopped/missing gate,
freeze failure, timeout usage preservation, spawn failure, heartbeat failure cancellation without
replay, graceful SIGTERM cancellation and handler removal, and final-result writer failure. Existing
transport test was read/run but not edited.
Syntax checks pass for owned launch/helper/CLI. No live CLI/API/Docker claims follow from these mocks.

## Remaining integration

Main owns live paired execution and separate Opus monitor. Metrics/reader own safe projection of
these files; gate/telemetry own their state. Full integration/independent review and real CLI model
identity/stream behavior remain main's verification. Old run receipts are not rewritten.
