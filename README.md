# Jev Router

**English** | [한국어](README.ko.md) | [简体中文](README.zh-CN.md)

Jev Router helps a main coding agent with model selection and in-task decisions by asking
[Jev AI](https://jev-ai.pro) fixed, structured questions. This repository contains a server-side
Jev client, an offline evaluation CLI, isolated benchmark runners and a local usage dashboard.
It is a research project. Live results are few, and each one is recorded with its evidence.

> Detailed documents under `docs/` are written in Korean.

[Status](#status) · [Why](#why) · [Quick start](#quick-start) · [Limitations](#limitations) ·
[Documentation](#documentation) · [Security](#security) · [License](#license)

## Status

| Area | State | Evidence |
|---|---|---|
| Jev connection (`GET /v1/models`, `POST /v1/systemone`) | Implemented. Key setup and authenticated model listing confirmed on 2026-10-08 | [docs/USAGE.md](docs/USAGE.md#로컬-키-설정) |
| Offline evaluation CLI | Implemented. Bundled examples are synthetic | [docs/EVALUATION_USAGE.md](docs/EVALUATION_USAGE.md) |
| Live single vs. split E2E run (D029) | One run per arm. Both 30/30 on independent grading. Split: stage-time sum 22.829% lower, estimated cost 64.112% higher | [D029 results](docs/orchestration/D029_RESULTS.md) |
| Input projection v3 (D031) | Offline replay only, no new paid calls, 390/390 regression tests | [D031 implementation](docs/orchestration/D031_IMPLEMENTATION.md) |
| Automatic routing benefit, product completeness | Not verified | [STATE](docs/agents/STATE.md) |

The latest checkpoint is always [docs/agents/STATE.md](docs/agents/STATE.md). This table can lag behind it.

## Why

A main agent makes many small judgments while it works: which model and effort to use, whether to
split a task, whether the evidence is sufficient. Jev Router tests whether these repeated judgments
can go to Jev AI as fixed English questions with structured answers (`choice`, `score`, `noul`).

```text
decision point in the main task
→ check goal, evidence and required output
→ build candidates (when needed)
→ write the English question and validate the API input
→ call Jev
→ validate the answer, record decision state and usage
→ main session takes the next action
```

The main session keeps the goal and acts. A Jev answer is not permission to act and not proof that
tests pass. Accuracy, speed, token and cost gains are hypotheses until measured. A Jev probability
is not a task success rate. Details: [technical spec](docs/TECHNICAL_SPEC.md).

## Quick start

Requires Node.js 22 or later. There are no external packages.

```sh
git clone https://github.com/Kai-Leee/jev-router.git
cd jev-router
npm test            # fake key and mock HTTP only; no inference, no balance use
npm run eval:demo   # offline evaluation of synthetic records
```

Three MCP tests need the pinned `jev-mcp` binary (macOS ARM64) in `vendor/jev-mcp/0.3.1/`.
The binary is not committed. Get it from the archive URL in
[vendor/jev-mcp/SOURCE.json](vendor/jev-mcp/SOURCE.json) and check its SHA-256.
Without it, a fresh clone passes 387 of 390 tests.

Connecting to Jev needs a Jev AI key ([key setup](docs/USAGE.md#로컬-키-설정)):

```sh
npm run config           # prints settings and whether a key exists; no network
npm run models           # one authenticated GET
npm run demo -- --spend  # one paid POST; uses your Jev balance
```

More: [all usage, failure handling and deployment](docs/USAGE.md) ·
[MCP launcher](MCP.md) · [dashboard](docs/DASHBOARD.md) (`npm run dashboard`) ·
[benchmarks](benchmarks/README.md).

## Limitations

Do not use Jev Router if you need any of these:

- **A production router.** No deployment has been done. There is no distributed rate limiter.
- **Automatic recovery.** Calls are never retried automatically. A paid POST with an uncertain
  result is not resent; check usage first ([failure handling](docs/USAGE.md#실패-처리와-제한)).
- **Strong evidence.** The only live split comparison (D029) has one run per arm. Thresholds are
  uncalibrated, and the operating threshold is `null`.
- **Host integration.** Automatic plugin loading in hosts, Claude/Codex executor selection and load
  balancing are not verified.
- **Live decisions without a paid key.** Only the offline tools and tests work without a Jev AI key.

## Documentation

- **Start here:** [technical spec](docs/TECHNICAL_SPEC.md) ·
  [contracts and document index](docs/orchestration/README.md) · [current state](docs/agents/STATE.md)
- **Usage:** [usage guide](docs/USAGE.md) · [evaluation CLI](docs/EVALUATION_USAGE.md) and
  [input contract](docs/EVALUATION_CONTRACT.md) · [dashboard](docs/DASHBOARD.md) ·
  [paired run and separate Opus monitor](docs/PAIRED_RUN.md) · [benchmarks](benchmarks/README.md) ·
  [MCP](MCP.md)
- **Evidence:** [decisions](docs/DECISIONS.md) · [work log](docs/WORK_LOG.md) ·
  [verification](VERIFICATION.md)
- **Research:** [evaluation methods](docs/EVALUATION_RESEARCH.md) ·
  [live experiment feasibility](docs/LIVE_EXPERIMENT_FEASIBILITY.md) ·
  [real-time failure reporting](docs/REALTIME_FAILURE_RESEARCH.md)
- **Contributors and agents:** [AGENTS.md](AGENTS.md) (Codex entry) ·
  [CLAUDE.md](CLAUDE.md) (Claude entry, imports AGENTS.md) ·
  [agent roles and handoff](docs/agents/README.md)

## Security

- Keep `JEV_AI_API_KEY` on the server: a process environment variable or `~/workspace/.env`.
  Set another file path with `JEV_AI_ENV_FILE`.
- Never put the key in chat, browser code, Git, command-line arguments or logs. Do not use public
  prefixes such as `NEXT_PUBLIC_`, `VITE_` or `PUBLIC_`.
- Destination URLs are fixed in [src/config.mjs](src/config.mjs). Redirects are refused.
  Diagnostic output never prints the key or the Authorization header.

## License

Not decided yet. There is no `LICENSE` file.

The reused `jev-mcp` v0.3.1 binary is Apache-2.0 and is not committed. Its source and checksums
are in [vendor/jev-mcp/SOURCE.json](vendor/jev-mcp/SOURCE.json).
