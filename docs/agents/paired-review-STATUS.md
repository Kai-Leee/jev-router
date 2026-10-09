# D-019 paired runtime independent review — 2026-10-09

Reviewer: `/root/benchmark_runner_review`. Read [review role](PAIRED_REVIEW.md),
[runtime contract](PAIRED_RUNTIME.md), [monitor role](OPUS_BENCHMARK_MONITOR.md),
and the earlier [failure audit](../research/CURRENT_FAILURE_AUDIT.md).

The four concrete defects found below are fixed and independently rechecked.
No confirmed live-start blocker remains in the reviewed code. This is source,
unit/integration fixture and fault-injection evidence; it is not evidence of a
successful paid run, real tool isolation, provider billing or benchmark quality.
The reviewer made no model, Docker, credential or auth calls and edited no product
source. Main additionally authorized ownership of `test/paired-cancellation.test.mjs`.

## Confirmed findings and resolution

| ID | Priority | Reproduction and impact | Final disposition |
| --- | --- | --- | --- |
| PR-01 | P1 | `SIGINT`/`SIGTERM` while the controller waits for the implementation manifest signalled only existing children. The subsequent manifest check still spawned `benchmark-monitor --spend`; cancellation could initiate a fresh paid request. | Main added a cancellation latch, a guard in every `start`, and a guard before monitor creation. Four permanent mocked-controller regressions pass. |
| PR-02 | P2 | With provider phase, 300-second wall limit, and heartbeat age 16 seconds, actual metrics returns observational `uncertain`. `monitorTerminal` formerly treated that status as terminal, abandoning later recovery or freeze evidence. | Terminal detection now requires terminal phase plus terminal runner status. Rechecked through actual `summarizeRun`; the stale provider observation remains watched. |
| PR-03 | P2 | A failure result followed by a success result, or malformed JSONL before a success result, was accepted as monitor `completed`. That permitted continuing interpretation after contradictory/incomplete provider evidence. | `monitorCompletion` now reuses strict `providerOutcome`. Conflicting finals yield `PROVIDER_FINAL_CONFLICT`; malformed stream yields `PROVIDER_FINAL_INVALID`, both uncertain. |
| PR-04 | P2 | Inject failure into the first `runner_terminal` journal write after saving a completed monitor result. The old catch used exclusive creation again, leaving disk `completed` while console/exit reported uncertainty. | `finishMonitor` atomically downgrades the existing receipt, retaining usage/identity. Current full CLI mock persists `uncertain` with `MONITOR_RECORD_OR_START_FAILED`, with one provider request and one attempted terminal journal write. If the result writer fails first, the independent journal is attempted. |

Relevant final code: [paired controller](../../bin/paired-run.mjs),
[monitor status and finalization](../../src/benchmark/monitor.mjs),
[monitor CLI](../../bin/benchmark-monitor.mjs),
[provider outcome validator](../../src/benchmark/runner.mjs).

## Reproducible verification

Run commands from the `jev-router` root:

```sh
node --test test/paired-cancellation.test.mjs test/benchmark-monitor.test.mjs
node --test test/benchmark-runner.test.mjs test/benchmark-telemetry.test.mjs test/dashboard-metrics.test.mjs test/dashboard-reader.test.mjs
node --test test/benchmark-decision-gate.test.mjs test/benchmark-mcp-runtime.test.mjs test/benchmark-transport.test.mjs
```

- First command: **9/9 passed** after all four corrections. The new controller
  suite covers both signals before monitor startup, forwarding to both active
  children and waiting for closure, and normal early implementation completion
  receiving exactly one terminal monitor observation.
- Second command: **84/84 passed** on the current runner/telemetry/metrics/reader.
  These use dependency injection and temporary files; no external inference or
  container is launched.
- Third command: **48/48 passed** for gate, MCP runtime and process transport.
  Across these three non-overlapping focused groups: **141/141 passed**. This
  is the reviewer's selected validation scope, not a replacement for main's full
  suite and browser checks.
- `/opt/homebrew/bin/claude --help` confirms this installed CLI accepts
  `--agents <json-or-file>` in print mode and `--tools ""`. Help inspection alone
  does not prove actual role loading, no-tool enforcement or model identity.
- Temporary fault scripts are in `/private/tmp/jev-paired-review.vGwgPt/`.
  `cancel-controller.mjs` retains the original defective-behavior expectation,
  so that assertion now fails intentionally; the permanent suite expresses the
  required behavior. `monitor-terminal-write.mjs` was rerun after correction:

```sh
node --experimental-vm-modules /private/tmp/jev-paired-review.vGwgPt/monitor-terminal-write.mjs
```

  Result: one mocked provider call; persisted status `uncertain`; persisted code
  `MONITOR_RECORD_OR_START_FAILED`; console status agrees; exit 1; one journal
  terminal attempt. The actual CLI module is evaluated with mocked filesystem,
  provider process and reader imports. No real benchmark is started.

## Additional boundaries checked

- Monitor requests the exact `claude-opus-5-5` model and verifies final model IDs;
  implementation and monitor records have separate attempt/run IDs with a shared
  group. Monitor credentials/environment do not forward Jev/API-key variables.
- Monitor receives the reader's sanitized projection; raw prompts, commands,
  stderr and private observation artifacts are not generic HTTP file routes.
  Reader tests cover role-only bounded monitor reports and sensitive fields.
- Provider completion, artifact freeze and runner terminal are separate records;
  gate completion cannot substitute for evaluator success. Wrapper uncertainty
  does not erase confirmed provider usage.
- Explicit `null` call/USD limits are preserved; review did not add a count cap.
  Timeouts, output limits and cancellation retain uncertainty and do not replay
  provider requests. The abort test kills a disposable local Node child only.
- SSE code inspection confirms bounded latest pending frames and no replay claim;
  UI distinguishes connection freshness from writer heartbeat and task progress.
  Main owns actual browser and transport integration verification.

## Remaining integration note and limitations

- At review time the dashboard safe-code allowlist included the new runner/gate
  codes but omitted `MONITOR_REPORT_INVALID` and `MONITOR_RECORD_OR_START_FAILED`.
  The failure remains visible as generic runner failure/uncertainty, but the
  specific monitor diagnosis is lost. Main was notified; this is not a live-start
  blocker. Confirm the allowlist when integrating the final monitor code.
- Heartbeat remains writer activity evidence only. Reading it cannot prove OS
  process liveness, useful task progress, remote request cancellation or billing.
- Actual CLI role loading, tool enforcement, exact returned model identity and
  independent evaluator result require main's separately authorized real run.
  This review does not infer those from mocks or existing control receipts.
