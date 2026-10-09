# Dashboard independent review role

2026-10-09. Inspect final call/token/cost dashboard, source normalization and live telemetry changes independently.
Own only docs/agents/dashboard-review-STATUS.md. Do not change implementation or run inference.
Read docs/DASHBOARD_CONTRACT.md and DASHBOARD_RESEARCH.md; test hand arithmetic, process/output failure cases,
file reader exposure, denominator/dedup, unknown versus zero, billing versus estimates, final/error state propagation.
Scope src/dashboard, dashboard, bin/dashboard, src/benchmark/telemetry, benchmark-run/mcp and processResult onStdout.
Main will run real browser tests; report code issues promptly with concrete repro. No secrets/auth/config changes.
May run Node tests and local loopback fixture tests; no external model traffic. No other agents.
On context pressure write OS temp handoff and stop. Report remaining limitations and no-inference boundary.
