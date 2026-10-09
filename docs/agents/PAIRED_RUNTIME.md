# D-019 paired development runtime — 2026-10-09

User instruction: connect Jev and Claude call units for development; no call-count ceiling now.
Benchmark monitoring must use a separate Opus 5.5 agent. Main performs real execution.
Read AGENTS.md, STATE.md, D-018 audit first. No secrets, inference, Docker operations or shared-doc edits by development delegates.

## Shared contract

- `max_decisions:null` explicitly means no count ceiling; missing/invalid values still reject.
- `claude_max_budget_usd:null` omits the CLI USD flag for subscription OAuth (not a dollar guarantee).
- Wall/per-command timeouts and uncertainty stop remain operational failure boundaries, not call caps.
- One run has `run_id`, `attempt_id`, `group_id` (safe identifier), `agent_role:implementation|monitor`.
- Gate records inherit these IDs; measured inference carries the gate `decision_id` as well as its request ID.
- `runner.jsonl` events: `runner_started`, `preflight_started`, `preflight_failed`, `provider_started`,
  `provider_finished`, `runner_finalizing`, `artifact_frozen`, `runner_terminal`.
  Safe fields: recorded_at, event, phase, status, code, run_id, attempt_id, group_id.
- `runner-heartbeat.json`: run_id, attempt_id, pid, recorded_at, phase. It proves writer activity only.
- `result.json` adds `runner_status:completed|failed|uncertain`, `runner_error_code`, `finished_at`;
  completed requires valid successful provider final, CLI exit 0 and confirmed container freeze.
- `gate-state.json` is independent atomic state evidence for a failed journal writer; never contains raw input.
- Reader accepts the new allowlisted files; metrics exposes `execution` (runner/gate/heartbeat/phase),
  `incidents` (safe codes, source, decision_id, exit_code, recovery_allowed), identifiers and `agent_role`.
- Do not infer candidate provenance from evaluator `model_calls:0`. Runtime completion and evaluation separate.
- Each role writes its STATUS and tests; no other role's files. Coordinate contract changes through main.

## gate delegate

Own src/benchmark/decision-gate.mjs, telemetry.mjs, bin/benchmark-mcp.mjs and their focused tests.
Implement explicit null ceiling, durable stop/rejection events, safe recording-failure fallback, linkage.
Tool nonzero can remain recoverable; preserve exit_code. No replay of uncertain side effects.

## runner delegate

Own src/benchmark/launch.mjs, bin/benchmark-run.mjs, new runner helper and focused tests (not existing transport test).
Implement null limits, IDs, early manifest before preflight, runner events/heartbeat, finalization/stop semantics.
Preserve exclusive directories and secret filtering; errors before provider start must be visible.
No live execution. Coordinate file schema with metrics delegate.

## metrics delegate

Own src/dashboard/metrics.mjs, reader.mjs, test/dashboard-metrics.test.mjs and new reader tests.
Fix D-018 false completion, tool/gate failure projection, provenance; consume shared contract.
Expose safe identifiers, incident list and execution details. Raw strings/commands are never UI data.

## transport/UI delegate

Own src/dashboard/server.mjs, dashboard/*, test/dashboard-server.test.mjs and new transport tests.
Implement whole snapshot SSE with epoch/revision, bounded latest pending snapshot, GET fallback;
show execution incidents and paired run grouping. Connection freshness != runner heartbeat/progress.
Read metrics schema from shared contract; coordinate with metrics delegate. No live server changes.

## main

Own separate Opus monitor runner and role, shared docs, real controlled benchmark execution,
integration review/browser validation and final state. Preserve existing Personal OS and Vault.
