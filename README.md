<p align="center"><img src="docs/brand/pointsman-256.png" width="160" height="160" alt="Pointsman mascot: a frog pulling a rail switch lever with its tongue"></p>
<p align="center"><a href="https://m8ven.ai/mcp/kai-leee-jev-router-1k0heh?s=readme"><img src="https://m8ven.ai/badge/mcp/kai-leee-jev-router-1k0heh?v=048f027e982892c5acfd612cc732a9bb" alt="M8ven Score"></a></p>

<h1 align="center">Pointsman</h1>

<p align="center"><em>Fast task routing with Jev and dependency DAGs.</em><br><sub>formerly Jev Router</sub></p>

**English** | [한국어](README.ko.md) | [简体中文](README.zh-CN.md)

Pointsman is a Jev-powered task routing project for coding agents. It turns structured decisions
into dependency DAGs: divide work, connect prerequisites, and dispatch ready tasks to coding workers.
The research runner connects routing decisions to scoped artifacts, public checks and recorded outcomes.

This release provides the Jev client, evaluation tools, run contracts and usage dashboard.
The advanced DAG experiments are documented on the [research branch](https://github.com/Kai-Leee/pointsman/tree/research).

[Measured results](#measured-results) · [How routing works](#how-routing-works) ·
[Quick start](#quick-start) · [Documentation](#documentation) · [Security](#security)

## Measured results

**21.84% less development-stage time and 58.52% lower API-rate-equivalent cost** in one completed
D067 benchmark observation, with all **85 public and 63 independent checks passing** in both conditions.

| OpenAPI Python client generator | Development-stage time | Historical API-rate-equivalent cost |
|---|---:|---:|
| Claude structured decisions + Claude workers | 36m 20.704s | $21.135172 |
| Jev decomposition and dependency decisions + Claude workers | 28m 24.540s | $8.766580 |

One run per condition in a concurrent cohort; identical Opus 5.5 medium worker profile and two worker slots
per condition. Time includes decisions, implementation, repairs and public validation, excluding shared
preparation and independent grading. Costs use recorded usage and the rates captured for that experiment,
not subscription bills. Reductions use the Claude row as the denominator.
[Measurement method and arithmetic](docs/MEASURED_ROUTING.en.md) ·
[Complete experiment record](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_RESULTS.md).

## How routing works

The main agent supplies the goal, public specification and artifact contracts. Fixed English questions
let Jev judge work decomposition and dependencies. The research runner turns validated decisions into
an executable DAG, then dispatches ready work within each worker's file scope.

```text
Goal + specification + artifact contracts
→ structured Jev questions and input validation
→ decomposition and dependency decisions
→ dependency DAG and ready-task queue
→ scoped coding workers
→ public checks tied to artifact revisions
→ recorded outcomes and evidence-driven repair routing
```

- **Dependencies guide dispatch.** Ready tasks can run concurrently; downstream work consumes validated upstream artifacts.
- **Decisions reach execution.** Structured answers connect to worker scopes and execution handlers.
- **Evidence follows each decision.** Questions, accepted answers, usage, artifact revisions and checks stay connected.

The controller enforces permissions and validation. Jev selects within that contract; tests establish
whether the resulting artifacts meet the task requirements. See the
[technical specification](docs/TECHNICAL_SPEC.en.md) and [research state](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md).

## Quick start

Requires Node.js 22 or later. There are no external packages.

```sh
git clone https://github.com/Kai-Leee/pointsman.git
cd pointsman
npm run mcp:fetch   # pinned jev-mcp binary for the MCP tests, checksum-verified
npm test            # fake key and mock HTTP only; no inference, no balance use
npm run check:links # relative links, heading anchors and research-branch links
npm run eval:demo   # offline evaluation of synthetic records
```

`mcp:fetch` supports macOS ARM64, Linux x64 and Linux arm64 ([SOURCE.json](vendor/jev-mcp/SOURCE.json)).
Without it, the three MCP tests fail. CI runs the tests on macOS (Node 22) and in Docker (Node 24 and 26).

Connecting to Jev needs a Jev AI account and key, and acceptance of the Jev AI Terms of Use
([sign-in](docs/USAGE.en.md#sign-in)):

```sh
npm run login            # accept terms, sign in on the key page, paste the key (hidden)
npm run config           # prints settings and whether a key exists; no network
npm run models           # one authenticated GET
npm run demo -- --spend  # one paid POST; uses your Jev balance
```

More: [all usage, failure handling and deployment](docs/USAGE.en.md) ·
[MCP launcher](MCP.md) · [dashboard](docs/DASHBOARD.en.md) (`npm run dashboard`) ·
[benchmarks](benchmarks/README.md).

## Documentation

`main` holds code, run contracts and usage documents. Experiments, decisions and logs live on the
[`research` branch](https://github.com/Kai-Leee/pointsman/tree/research).

- **Start here:** [technical spec](docs/TECHNICAL_SPEC.en.md) ·
  [run contracts](docs/orchestration/contracts/README.en.md)
- **Usage:** [usage guide](docs/USAGE.en.md) · [evaluation CLI](docs/EVALUATION_USAGE.en.md) and
  [input contract](docs/EVALUATION_CONTRACT.en.md) · [dashboard](docs/DASHBOARD.en.md) ·
  [paired run and separate Opus monitor](docs/PAIRED_RUN.md) · [benchmarks](benchmarks/README.md) ·
  [MCP](MCP.md)
- **Research branch (Korean):** [current state](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md) ·
  [document index](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/README.md) · [decisions](https://github.com/Kai-Leee/pointsman/blob/research/docs/DECISIONS.md) ·
  [work log](https://github.com/Kai-Leee/pointsman/blob/research/docs/WORK_LOG.md) · [verification](https://github.com/Kai-Leee/pointsman/blob/research/VERIFICATION.md) ·
  [evaluation methods](https://github.com/Kai-Leee/pointsman/blob/research/docs/EVALUATION_RESEARCH.md) ·
  [live experiment feasibility](https://github.com/Kai-Leee/pointsman/blob/research/docs/LIVE_EXPERIMENT_FEASIBILITY.md) ·
  [real-time failure reporting](https://github.com/Kai-Leee/pointsman/blob/research/docs/REALTIME_FAILURE_RESEARCH.md)
- **Releases:** [changelog](CHANGELOG.md)
- **Contributors and agents:** [AGENTS.md](AGENTS.md) (Codex entry) ·
  [CLAUDE.md](CLAUDE.md) (Claude entry, imports AGENTS.md) ·
  [agent roles and handoff](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/README.md)

## Security

- Keep `JEV_AI_API_KEY` on the server: a process environment variable or `~/workspace/.env`.
  Set another file path with `JEV_AI_ENV_FILE`.
- Never put the key in chat, browser code, Git, command-line arguments or logs. Do not use public
  prefixes such as `NEXT_PUBLIC_`, `VITE_` or `PUBLIC_`.
- Destination URLs are fixed in [src/config.mjs](src/config.mjs). Redirects are refused.
  Diagnostic output never prints the key or the Authorization header.

## License

[Apache License 2.0](LICENSE).

The license covers the code in this repository only. It grants no rights to the Jev AI service.
Live Jev features need your own Jev AI account and key, and you must accept the Jev AI
[Terms of Use](https://jev-ai.pro/terms) and [Privacy Policy](https://jev-ai.pro/privacy).

The reused `jev-mcp` v0.3.1 binary is Apache-2.0 and is not committed. Its source and checksums
are in [vendor/jev-mcp/SOURCE.json](vendor/jev-mcp/SOURCE.json).
