<p align="center"><img src="docs/brand/pointsman-256.png" width="160" height="160" alt="Pointsman mascot: a frog pulling a rail switch lever with its tongue"></p>

<h1 align="center">Pointsman</h1>

<p align="center"><em>I'll follow Jev's judgment.</em><br><sub>formerly Jev Router</sub></p>

**English** | [한국어](README.ko.md) | [简体中文](README.zh-CN.md)

Pointsman helps a main coding agent with model selection and in-task decisions by asking
[Jev AI](https://jev-ai.pro) fixed, structured questions. This repository contains a server-side
Jev client, an offline evaluation CLI, isolated benchmark runners and a local usage dashboard.
It is a research project. Live results are few, and each one is recorded with its evidence.

> Korean documents have English versions (`*.en.md`). Research and analysis records live on the
> [`research` branch](https://github.com/Kai-Leee/pointsman/tree/research) and are in Korean.

[Status](#status) · [Why](#why) · [Quick start](#quick-start) · [Limitations](#limitations) ·
[Documentation](#documentation) · [Security](#security) · [License](#license)

## Status

| Area | State | Evidence |
|---|---|---|
| Jev connection (`GET /v1/models`, `POST /v1/systemone`) | Implemented. Key setup and authenticated model listing confirmed on 2026-10-08 | [usage guide](docs/USAGE.en.md#local-key-setup) |
| Offline evaluation CLI | Implemented. Bundled examples are synthetic | [evaluation CLI](docs/EVALUATION_USAGE.en.md) |
| Live single vs. split E2E run (D029) | One run per arm. Both 30/30 on independent grading. Split: stage-time sum 22.829% lower, estimated cost 64.112% higher | [D029 results](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D029_RESULTS.md) |
| Input projection v3 (D031) | Offline replay only, no new paid calls, 390/390 regression tests | [D031 implementation](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D031_IMPLEMENTATION.md) |
| Automatic routing benefit, product completeness | Not verified | [STATE](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md) |

The latest checkpoint is always [STATE on the research branch](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md). This table can lag behind it.

## Why

A main agent makes many small judgments while it works: which model and effort to use, whether to
split a task, whether the evidence is sufficient. Pointsman tests whether these repeated judgments
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
is not a task success rate. Details: [technical spec](docs/TECHNICAL_SPEC.en.md).

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

## Limitations

Do not use Pointsman if you need any of these:

- **A production router.** No deployment has been done. There is no distributed rate limiter.
- **Automatic recovery.** Calls are never retried automatically. A paid POST with an uncertain
  result is not resent; check usage first ([failure handling](docs/USAGE.en.md#failure-handling-and-limits)).
- **Strong evidence.** The only live split comparison (D029) has one run per arm. Thresholds are
  uncalibrated, and the operating threshold is `null`.
- **Host integration.** Automatic plugin loading in hosts, Claude/Codex executor selection and load
  balancing are not verified.
- **Live decisions without a paid key.** Only the offline tools and tests work without a Jev AI key.

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
