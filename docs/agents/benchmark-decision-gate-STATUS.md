# Benchmark decision gate status

## 2026-10-09 D-019 — current implementation

Role: [PAIRED_RUNTIME.md](PAIRED_RUNTIME.md), gate delegate. Source work complete; writes stopped
after this status update. Main owns real execution and shared documentation.

- `maxDecisions:null` / MCP `max_decisions:null` now explicitly removes the decision-count ceiling.
  Missing, nonfinite and invalid values still reject. Explicit finite bounds remain supported.
  Serialization, terminal completion and uncertain-side-effect stops remain in force.
- Gate `identifiers:{run_id,attempt_id,group_id,agent_role}` propagate as flat fields to events,
  results and state. Nonempty identifiers are all-or-none, using safe 1..96-character IDs and
  `agent_role:implementation|monitor`. Legacy callers may omit them; the current runner supplies them.
- `decide(request,context)` now receives the gate decision ID and identifiers separately from the
  provider request. Measured inference records retain both `decision_id` and provider `request_id`.
  Lookup-start and lookup-failure events expose pre-inference failures without fabricating POST counts.
- Rejected input and post-terminal calls record `event:rejected` with stable code, null decision ID,
  previous decision ID and recovery status; raw rejected arguments are excluded. Finite budget exhaustion
  now persists `event:stopped`. Known tool failures expose their exact exit code and remain recoverable.
- An optional gate `recordState` callback is mandatory in actual MCP construction. The independent
  `gate-state.json` is written through a private temporary file, fsync and atomic replacement; initial
  creation is exclusive. Its default path is beside `trace_path`, with `gate_state_path` override supported.
  Existing journals still refuse restart. State contains no input, commands, credentials or exception text.
- Journal failures, including failures inside measured inference telemetry, stop as `RECORD_FAILED`
  and attempt the independent state write without retrying the journal. State-writer failures stop as
  `STATE_RECORD_FAILED` and are recorded in a healthy journal. If both storage paths fail, status remains
  stopped in memory; this does not claim a durable record survived complete storage failure.
- `createBenchmarkRuntime` is exported from the MCP executable for dependency-injected offline checks.
  Importing it has no Docker, credential, journal or stdin side effects. Actual MCP transport failure
  writes a safe stop event and independent state before exiting.

Current independent state shape:

```text
schema_version: jev-benchmark-gate-state/v1
recorded_at, run_id?, attempt_id?, group_id?, agent_role?
mode, state, max_decisions, decisions_used, decisions_remaining, actions_executed
stop_code, completion_claimed, evaluator_success:null
last_event, last_code, last_decision_id, last_exit_code, rejections
journal_healthy, state_recording_failed, outcome_uncertain, recovery_allowed
```

`state:completed` and `completion_claimed:true` are written only after the completion outcome journal
record persists. This remains a completion claim, not independent evaluation success. Runner coordination
confirmed flat identifiers and that a stopped or uncertain gate cannot be overridden by a successful
Claude provider final. Tool `outcome` events add `status`, `exit_code`, `recovery_allowed`.

Changed source: [decision-gate.mjs](../../src/benchmark/decision-gate.mjs),
[telemetry.mjs](../../src/benchmark/telemetry.mjs), [benchmark-mcp.mjs](../../bin/benchmark-mcp.mjs).
Focused tests: [gate](../../test/benchmark-decision-gate.test.mjs),
[telemetry](../../test/benchmark-telemetry.test.mjs), [MCP runtime](../../test/benchmark-mcp-runtime.test.mjs).

Final verification command, run in the project directory:

`node --test test/benchmark-decision-gate.test.mjs test/benchmark-telemetry.test.mjs test/benchmark-mcp-runtime.test.mjs test/client.test.mjs test/benchmark-transport.test.mjs`

Result: **81 passed, 0 failed/skipped/cancelled, exit 0**. The three owned test files contribute 54
tests (gate 35, telemetry 14, MCP runtime 5); existing client/transport contribute 27. Tests inject
provider and sandbox callbacks; local Node child processes exercise existing output/deadline behavior.
No inference, Docker operation, real credentials, package change, shared-document change or live-server
operation was performed. The first transitional test run failed 9 expectations that encoded the old
absence of rejection/lookup records and the old status shape; those expectations were updated to the
new explicit event contract, then all focused checks passed.

## Historical 2026-10-08 implementation record

Date: 2026-10-08. Role: [BENCHMARK_DECISION_GATE.md](BENCHMARK_DECISION_GATE.md).
Implementation and offline verification complete; integration remains owned by main.

## Purpose and ownership

Implement the bounded decision/action binding for the authorized goal/specification-only pilots.
This follows D-005/D-006/D-008/D-010/D-012 and the current role authorization.
The two modes are structured matched-scaffold conditions; baseline is not native baseline A.

Only these assigned files were changed:

- [Decision gate](../../src/benchmark/decision-gate.mjs)
- [Offline tests](../../test/benchmark-decision-gate.test.mjs)
- This status document.

## Public contract

`createDecisionGate({mode, maxDecisions, decide, execute, record})` returns `{act, finish, status}`.
`act` and `finish` return promises; `status` is synchronous. All injected callbacks may be async.
`mode` is `jev` or `baseline`; `maxDecisions` is an integer from 1 through 10000.

- `act({purpose,state,candidates,selected_id?})`: 2 through 8 candidates with unique
  `{id,description,command}`. Jev rejects `selected_id`; baseline requires a listed ID.
- `finish({state,purpose})`: Jev chooses `finish`, `continue` or `abstain`.
  Baseline records an unverified completion claim without calling `decide`.
- `decide(request)`: the existing client-compatible request uses `model:'jev-latest'`,
  state and one choice question. Question ID is `action` for act and `finish` for finish.
  Every action criterion contains both description and exact command; `abstain` is internal.
  Responses use the current client's normalized `model`, `answers`, `usage`, `billing`, `receipt`.
- `execute(command)`: return bounded JSON with integer `exit_code` from 0 through 255
  for observed normal process termination. A known nonzero exit is recorded and permits another action.
  Throwing, absent/invalid exit observation, `outcome_uncertain:true`, `outcomeUncertain:true`,
  `timed_out:true`, `timedOut:true`, or a non-null `signal` stops the gate without replay.
- `record(event)`: resolving confirms persistence; rejection stops the gate. It receives a detached
  JSON snapshot. Event names are `input`, `decision`, `action_started`, `outcome`, `stopped`.
  Common fields are numeric `decision_id`, `kind`, `mode`. No callback exception text is retained.

An operation result has `decision_id`, `kind`, `mode`, `choice`, `action:{id,command}|null`,
`outcome`, `completion_claimed` and `evaluator_success:null`. Decision usage/billing/receipt are
persisted in the decision event before any command executes. Missing metadata stays null;
missing USD cost is never fabricated as zero. Optional metadata is not evidence of provider receipt.

`status()` exposes only `mode`, `state`, `max_decisions`, `decisions_used`,
`decisions_remaining`, `actions_executed`, `stop_code`, `completion_claimed`, `evaluator_success:null`.
State is `ready`, `running`, `stopped` or `completed`; actions_executed counts callback invocations,
including executions whose final outcome is uncertain. It does not count successful commands.

## Limits and control behavior

- Purpose is bounded to 2048 UTF-8 bytes, contains Latin letters and rejects non-Latin letters.
  This deterministic English-oriented format check is not semantic language identification;
  original-language evidence belongs in state, which retains arbitrary valid JSON text.
- State is nonempty string/object/array, at most 65536 serialized UTF-8 bytes. Descriptions are
  at most 4096 bytes and commands at most 16384 bytes. IDs use 1 through 64 letters, digits,
  underscores, dots or dashes; `abstain` and prototype-mutating names are reserved.
- Full Jev payload passes the existing 256000-byte client request bound. JSON snapshots reject
  nonfinite numbers, undefined/functions, accessors, custom prototypes, cycles, sparse arrays,
  excessive nesting and excessive node counts. The execute outcome bound is 131072 bytes.
- Calls serialize across act and finish. Each operation reserves a monotonically increasing ID
  and one decision slot before persistence/request. Failed requests and failed input persistence
  still consume that reservation. Local invalid input consumes no slot and invokes no callback.
- Choice membership, exact probability keys including abstain, finite 0..1 values, and sum within
  1e-6 of 1 are verified before execution. Explicit uncertain response markers and replay receipts fail closed.
- Record failure before execution prevents execution. Record failure after execution stops further work.
  Completion is terminal only after its outcome record persists; it never proves evaluator success.
- Errors are `DecisionGateError` with stable codes: `INVALID_CONFIG`, `INVALID_INPUT`,
  `BUDGET_EXHAUSTED`, `GATE_STOPPED`, `GATE_COMPLETED`, `DECISION_FAILED`, `INVALID_DECISION`,
  `RECORD_FAILED`, `EXECUTION_UNCERTAIN`. Exception/cause/credential text is not copied.

## Verification and limits

Executed from the jev-router project directory:

`node --test test/benchmark-decision-gate.test.mjs test/client.test.mjs`

Result: 47 tests passed, 0 failed/skipped/cancelled, exit 0. The new gate contributes 28 tests;
the existing client contributes 19. Covered exact selected-command binding, abstention,
probability corruption, explicit uncertainty, missing and observed cost, no retry,
concurrent budget exhaustion, logging failure before and after execution, completion gating,
baseline without paid decision calls, callback/caller mutation, secret-bearing exceptions,
unknown shell outcomes, known nonzero exit, input bounds and status isolation.
The three local Markdown links resolve. `git diff --no-index --check` against each of the
three new files produced no whitespace diagnostics (untracked-file comparison exits 1).

No real API, Docker, package changes, credential reads, remote push or Personal OS/Vault edits.
These tests establish deterministic scaffold behavior only. Actual model quality, billing,
durable host logs, sandbox/deadline controls and end-to-end benchmark results remain unverified here.
Main owns MCP transport, durable append, Docker execution, deadlines and independent evaluation.

Next action: main can import `createDecisionGate`, supply the documented callbacks, run the full
suite and continue integration. No handoff or context-limit agent replacement was necessary.
