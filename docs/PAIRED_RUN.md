# Jev + Claude development with an independent Opus monitor

2026-10-09, D-019. Current execution evidence is in [STATE](agents/STATE.md) and [VERIFICATION](../VERIFICATION.md).

The implementation agent is Claude Opus 5.5. It receives the goal/specification and supplies English questions,
alternative actions and evidence. Jev selects an action, the controller executes it in the isolated container,
and the observation returns to Claude. Both providers carry the same run/attempt/group identifiers.
The Jev inference receipt also carries the gate decision ID. This links the workflow without pretending that
one Claude assistant message always equals one Jev call or one underlying Claude HTTP request.

The separate `benchmark-monitor` agent uses exact `claude-opus-5-5` through the user's existing Claude CLI OAuth.
It receives only the dashboard's sanitized run projection and has no tools, MCP servers or implementation access.
The host invokes it on initial observation and meaningful status/incident/evaluation changes. Timer ticks,
heartbeat timestamps and token counter changes alone do not request another model interpretation.
Each interpretation has its own run record with `agent_role:monitor` and the implementation's `group_id`.
Its usage is separate from development usage, and its conclusion is not an independent evaluator score.

The native custom-agent definition is passed with `--agents` and selected with `--agent`; it runs in a separate
CLI session, not as a Codex conversation or as the implementation agent's tool-capable child.
See [Claude custom agent documentation](https://code.claude.com/docs/en/sub-agents) and
[the exact monitor role](agents/OPUS_BENCHMARK_MONITOR.md).

## Running

### D-020 shared Jev budget

Current user allowance is at most USD 1 for Jev across this experiment, with no arbitrary call-count ceiling.
Every live Jev benchmark now requires `jev_budget`. The current prepared config is
`benchmark-runs/d020-e2eswe-run-04.json`; earlier budgetless live configs stop before launching Claude.

```json
{
  "jev_budget": {
    "schema_version": "jev-token-budget/v1",
    "ledger_path": "jev-usd1-budget.json",
    "max_usd": 1,
    "usd_per_million_input_tokens": 0.6,
    "reserve_input_tokens": 65536
  }
}
```

Resolve `ledger_path` relative to the run config. Reuse the **same absolute ledger** for all workloads,
including Personal OS. Never create another ledger to restart this USD 1 allowance. The implementation
container and monitor cannot access it. Its exclusive lock spans the MCP lifetime; confirmed close unlocks,
but pending reservations survive. Crashes or I/O uncertainty may leave a lock for manual reconciliation.

Each POST first checks `GET /v1/credits` and reserves 65,536 input tokens. The integer token ceiling is
1,666,666 at USD 0.60/M (USD 0.9999996); reserve value is USD 0.0393216. Settlement requires the fixed
destination, `jev-1.13.0`, the exact dated `typesafe/jev-1.13-20260917`, or `typesafe-ai/jev`, tokens billing, 1×,
zero credit charge and matching raw/billed input tokens. The dated identifier is explicitly mapped to the
same version in [Jev AI's model guide](https://jev-ai.pro/model/jev-1.13); arbitrary future IDs are rejected.
The Vercel ID is documented in [Jev AI's provider guide](https://jev-ai.pro/where-to-run-jev) and
[Vercel's 32K model catalog](https://vercel.com/ai-gateway/models/labs/typesafe-ai). Preserve the returned ID;
an unversioned provider alias is not evidence of an exact dated revision.
Missing evidence or any unknown POST outcome keeps the reservation and stops further calls. Model GETs
and balance GETs do not count as inference. The dashboard shows estimated spend/reservations separately.

This is a conservative prepaid-token valuation, **not a provider-enforced dollar billing guarantee**.
Actual provider USD stays null. The policy depends on documented model context/billing behavior; the
service does not expose a documented per-request USD quote or tokens-only control. See the
[feasibility review](research/JEV_BUDGET_FEASIBILITY.md). No auto top-up/purchase is performed.

The first live check returned the dated identifier, initially rejected by our narrower example-based
allowlist. Its successful response and 348-token debit were preserved. After verifying the official version
mapping, explicit offline reconciliation settles that saved receipt; it sends no POST and does not reset
spend. Uncertain transport or other blocked billing states are not automatically reconciled.

Prepare a fresh offline container with the existing [benchmark setup](../benchmarks/README.md).
Create a new manifest pointing at only the goal/specification and a previously unused output directory.
For no call-count ceiling, explicitly set `max_decisions:null`. Missing/invalid values remain errors.
For subscription OAuth use `auth:"cli"`, `claude_max_budget_usd:null`; no invented dollar cap is passed to Claude.
The wall deadline, per-command deadline, output bounds and uncertainty stops remain active. They are not call caps.

```sh
# Validate only (no model calls).
node bin/paired-run.mjs --config benchmark-runs/d020-e2eswe-run-04.json
# Authorized live implementation + independent monitor.
node bin/paired-run.mjs --config benchmark-runs/d020-e2eswe-run-04.json --spend
```

To interpret a saved run once (a paid Claude call) or watch a currently running attempt:

```sh
node bin/benchmark-monitor.mjs --run-dir benchmark-runs/RUN --output-root benchmark-runs --spend
node bin/benchmark-monitor.mjs --run-dir benchmark-runs/RUN --output-root benchmark-runs --watch --spend
```

Do not run a second monitor for a run already controlled by `paired-run`. These are foreground per-run processes,
not an installed daemon or recurring automation. A monitor failure is recorded and never automatically retried.
The implementation may continue independently if its monitor fails; the combined command reports both exits.
Interrupting the paired command signals its two children; they stop their provider subprocesses and preserve
uncertain outcomes. No uncertain Jev POST or command is automatically replayed.

The above fourth-attempt configuration is **already running or recorded**; do not rerun an occupied output
directory. Check STATE and the shared ledger first. The first two attempts preserve authentication/MCP-start
failures. Authentication preflight and both Claude roles now share the same explicit environment allowlist,
including USER/LOGNAME required for macOS keychain lookup. Normal completion gives MCP children 250ms to
close their durable state before final process-group cleanup; uncertain/interrupted calls retain reservations.

Jev keys stay in the host environment or `~/workspace/.env`, never in the container or monitoring packet.
The monitor does not inherit Jev credentials. Deploy with a server-runtime `JEV_AI_API_KEY` secret at the fixed
`https://jev-ai.pro/api` endpoint; OAuth desktop sessions are local and not a deployment credential strategy.

## Evidence and limits

Live journal entries, fallback gate state, runner phases and heartbeat feed the local dashboard. SSE transports
whole snapshots; GET remains a fallback. Repeated snapshots replace state rather than incrementing usage.
Connection heartbeat, runner record activity, tool outcome and evaluation outcome are distinct.

Provider-final is followed by runner finalization and confirmed artifact freeze. Missing/invalid completion,
gate stop, model identity drift or record failure cannot be promoted to success. A nonzero tool exit can still
be a recoverable intermediate failure and remains visible. A stale heartbeat is uncertainty, not proof of death.

Jev billed credits/balance tokens, raw model tokens, Claude-reported estimated USD and actual charged USD are
different quantities. Missing charged USD remains unknown. Model call-count limits do not specify dollar cost.
This pilot does not instrument Claude's internal HTTP retries, arbitrary existing desktop chats or every failure
of the host/collector. Independent evaluation and native Personal OS verification remain separate work.
