# Live benchmark research — STATUS

- Updated: 2026-10-08 (Asia/Seoul).
- Role: [LIVE_BENCHMARK_RESEARCH.md](LIVE_BENCHMARK_RESEARCH.md), D-012.
- State: research complete; no benchmark execution or integration validation.
- Owned/changed file: this file only.
- Purpose: find an existing evaluation for a Claude Opus 5.5 main agent using Jev for structured decisions, given goals/specifications without a human-authored implementation task breakdown.

## Conclusion

An existing benchmark matches the **specification + empty workspace → complete repository** requirement: **E2E-SWE**. Its task format explicitly leaves internal design to the agent. It is therefore incorrect to conclude that no such benchmark exists or that Personal OS must be the first experiment.

This is not a ready-tested **Claude Code + Opus 5.5 + Jev** integration. E2E-SWE's published runner uses a host-side mini-swe-agent adapter; network isolation, agent bridging, Jev call policy, and verifier compatibility need integration work. Nor does passing a repository benchmark establish desktop-app usability or real Personal OS behavior. The inspected editor task uses jsdom and a mocked canvas.

Recommendation (proposal, not a new user decision): begin with an E2E-SWE pilot to test autonomous decomposition and Jev-assisted decisions under repeatable grading. Use a separately specified, isolated Personal OS reconstruction as the later product-level test if native app/UX requirements are the intended endpoint. Do not launch or modify the existing Personal OS for this research.

## Harnesses versus task datasets

| Item | What was documented | Fit and limit |
| --- | --- | --- |
| Harbor | Execution/evaluation framework; Claude Code integration, custom agents, MCP configuration, native config, ATIF traces, separate verifier environments | Appropriate runner for Harbor-format tasks. MCP configuration support does not prove server connectivity or mandatory Jev calls. E2E-SWE uses an additional adapter and version-specific patch. |
| Inspect SWE | `claude_code()` runs unattended in a sandbox; model calls are proxied to Inspect. Options include `mcp_servers`, host-side `bridged_tools`, `system_prompt`, version/model selection, retries, and limits through Inspect | A plausible alternative when a host-side Jev tool and process telemetry are important. It is an agent integration, not an end-to-end software task dataset. E2E-SWE-to-Inspect task/scorer wiring would need adaptation. |

Sources checked 2026-10-08 by official documentation read:

- [Harbor pre-integrated agents](https://docs.harborframework.com/agents/pre-integrated-agents).
- [Harbor MCP/environment configuration](https://docs.harborframework.com/tasks/environment).
- [Harbor separate verifier](https://docs.harborframework.com/tasks/separate-verifier).
- [Inspect SWE](https://meridianlabs-ai.github.io/inspect_swe/).
- [Inspect SWE Claude Code and bridged tools](https://meridianlabs-ai.github.io/inspect_swe/claude_code.html).

## Three benchmark candidates

| Dataset | Agent input and grading | Match to the request | Material limitations |
| --- | --- | --- | --- |
| **E2E-SWE** | Natural-language behavior/API specification, empty workspace; installation in a fresh container followed by hidden tests. Whole-task success requires all tests. | Closest match: the implementation plan and internal decomposition are agent-owned. Public task assets actually exist. | Existing runner is host-side mini-swe-agent; custom Claude Code/Jev integration is untested. Current documented setup pins Harbor 0.22.0 and requires a verifier upload patch. Public interfaces can be detailed; this is goals **plus a specification**, not an underspecified one-line goal. Native UX coverage is not established. |
| **Commit0** | API documentation plus a starter repository with empty function bodies and visible interactive tests; unit-test pass rate. | Useful library-level comparison of implementation, dependency handling, and iterative repair. | Starter files/signatures already constrain design. It does not test autonomous creation of an entire app from an empty workspace. Original CLI README advertises aider; substituting the requested system needs an adapter. Current README says 57 libraries, paper says 54: pin dataset revision/split rather than silently merging counts. |
| **ProjDevBench** | Project requirements, Docker runner, Online Judge execution plus code review. Hard tasks are from-scratch creation; Easy tasks provide partial code. | Hard subset is relevant for goal/specification-driven repository creation; documented Claude Code support. | Many tasks are data-structure/interpreter/management-system exercises. Official workflow requires GitHub repository creation/push and an ACMOJ account/token. It is less convenient for a contained local pilot and not direct native-app UX evidence. |

Official sources, all read 2026-10-08:

- [E2E-SWE paper](https://arxiv.org/abs/2609.38335), [task formulation](https://arxiv.org/html/2609.38335v1), [repository/run instructions](https://github.com/facebookresearch/E2E-SWE).
- [Commit0 paper](https://arxiv.org/html/2412.01769v1), [official repository](https://github.com/commit-0/commit0).
- [ProjDevBench paper](https://arxiv.org/abs/2602.01655), [official repository and prerequisites](https://github.com/zsworld6/projdevbench).

This is a bounded comparison, not an exhaustive proof of absence of other benchmarks. Initial broad search surfaced other names; no additional benchmark is promoted as evaluated here.

## E2E-SWE artifact verification

Public GitHub API read on 2026-10-08 independently confirmed **186 task directories**, beyond the README's claim. The observed `main` commit was **`b11ac067b1dfe8ce8b6db245d88756f426007797`**, dated **2026-10-05T21:34:04Z**. The pin matters because the README's Harbor patch may change with future framework revisions.

The inspected sample was `canvas_editor`:

- [Specification at the inspected commit](https://github.com/facebookresearch/E2E-SWE/blob/b11ac067b1dfe8ce8b6db245d88756f426007797/tasks/canvas_editor/instruction.md): TypeScript rich-text document-editor library, public command/API and observable-behavior contract, freedom over internal design. This is a real specification, not a sequence of implementation tasks. It does pin the package entry point and exported interfaces.
- [Task configuration](https://github.com/facebookresearch/E2E-SWE/blob/b11ac067b1dfe8ce8b6db245d88756f426007797/tasks/canvas_editor/task.toml): 48 declared tests; separate verifier; agent timeout 14,400 seconds; verifier timeout 900 seconds; image `ghcr.io/facebookresearch/e2e-swe:canvas_editor`; 6 CPUs, 8,192 MB RAM, 51,200 MB storage; internet disabled. These are supplied settings, not resource measurements or proposed user budgets.
- [Verifier driver](https://github.com/facebookresearch/E2E-SWE/blob/b11ac067b1dfe8ce8b6db245d88756f426007797/tasks/canvas_editor/tests/test.sh): runs generated `setup.sh`, locates the package entry, runs hidden Vitest tests using jsdom and mocked canvas, emits CTRF and binary reward. Exactly 48 passed and no failed/skipped/pending/other tests are required. This establishes grading design, **not browser/native UI correctness**.
- [Host-side agent adapter](https://github.com/facebookresearch/E2E-SWE/blob/b11ac067b1dfe8ce8b6db245d88756f426007797/agents/msw_harbor.py): the actor remains outside the offline sandbox and sends shell commands through Harbor's environment API. Model requests happen on the host.
- GitHub API confirmed `environment/`, `instruction.md`, `solution/`, `task.toml`, and `tests/` for this task. No image was pulled and no solution or verifier was executed.

The current [README](https://github.com/facebookresearch/E2E-SWE/blob/b11ac067b1dfe8ce8b6db245d88756f426007797/README.md) specifies Harbor 0.22.0 / mini-swe-agent 2.4.6 and warns that the separate-verifier path needs `skip_tests_upload=False`; otherwise tests do not arrive and every task scores zero. This is a documented prerequisite, not a patch applied here. Current Harbor documentation may describe a newer behavior, so the exact installed version must be checked rather than patching by line number blindly.

## Concrete integration and evaluation proposal

1. Preserve the immutable task specification, initial empty workspace, reference task revision, hidden verifier, resource limits, and network boundary. The agent receives the specification and tool contract, not the reference solution or a human implementation checklist.
2. Evaluate two matched systems: requested main model without Jev and the same main model with Jev. Keep model version, scaffold, execution tools, budget, initial state, grading, and number of attempts fixed. Jev calls/tokens/latency count in the full system's totals.
3. Main agent creates its own plan and candidate decisions. Jev receives bounded structured decision questions; main reads the recorded response and continues. Defining a generic decision interface or gate is not a human task breakdown. Forcing all internal model reasoning to pass through Jev is not established by either harness.
4. Keep Jev on the host/controlled bridge, so an offline implementation container does not gain general internet access merely to reach Jev. This is an architecture proposal; network restriction and actual tool-call enforcement need a real integration check. Harbor-format task reuse does not make a changed scaffold's score comparable to the paper's model leaderboard automatically.
5. Before paid rollouts, validate infrastructure with a known-good reference and an empty/no-op attempt, including actual hidden-test upload, fresh install, and reward denominators. These were not executed here. The root separately reports the local Docker daemon unavailable, Claude Code logged out, and Harbor/Inspect absent from PATH; those are parent-reported observations, not checks performed by this role.
6. A pilot with one fixed task demonstrates end-to-end plumbing only. Quality/cost benefit requires repeated paired trials across more than one task, reporting success, time, total usage/cost, human interventions, Jev abstention/failure/adoption, and infrastructure failures. Missing USD remains unknown, not zero.

If preserving the official E2E-SWE offline boundary with Claude Code proves awkward, Inspect SWE's host `bridged_tools` offers an explicit design route, but importing tasks and reproducing their fresh-install verifier becomes our integration responsibility. Neither route is currently claimed to work with this project's Jev service.

## Commands, queries, verification level

Local read-only entry reads:

- `sed -n '1,240p' jev-router/docs/agents/LIVE_BENCHMARK_RESEARCH.md`
- `sed -n '1,240p' jev-router/docs/DECISIONS.md`
- `sed -n '1,210p' jev-router/README.md`
- `sed -n '1,230p' jev-router/docs/agents/README.md`
- Targeted memory search/read for prior Inspect/Harbor evaluation controls; current claims were refreshed against official sources above.

Representative web queries:

- `Commit0 benchmark from scratch libraries specifications tests official`
- `DevBench benchmark end to end software development requirements official github`
- `benchmark full stack app generation natural language specification end to end official`

Public-asset verification used authenticated-free read-only HTTPS GETs, after GitHub tree/raw reads in the web tool returned cache misses and sandbox curl could not resolve the host. Unsandboxed public GETs succeeded:

```sh
curl -fsSL --max-time 20 'https://api.github.com/repos/facebookresearch/E2E-SWE/contents/tasks?ref=main' | jq '{task_count: length, names: map(.name)}'
curl -fsSL --max-time 20 'https://api.github.com/repos/facebookresearch/E2E-SWE/commits/main' | jq '{sha, commit_date: .commit.committer.date}'
curl -fsSL --max-time 20 'https://api.github.com/repos/facebookresearch/E2E-SWE/contents/tasks/canvas_editor?ref=main' | jq 'map({name,type,size,download_url})'
curl -fsSL --max-time 20 'https://raw.githubusercontent.com/facebookresearch/E2E-SWE/main/tasks/canvas_editor/task.toml'
curl -fsSL --max-time 20 'https://raw.githubusercontent.com/facebookresearch/E2E-SWE/main/tasks/canvas_editor/instruction.md'
curl -fsSL --max-time 20 'https://raw.githubusercontent.com/facebookresearch/E2E-SWE/main/tasks/canvas_editor/tests/test.sh'
curl -fsSL --max-time 20 'https://raw.githubusercontent.com/facebookresearch/E2E-SWE/main/agents/msw_harbor.py' | sed -n '1,130p'
```

Verification level: official docs/papers plus public source-file/API inspection. No installations, credentials reads, paid inference, benchmark rollout, network-policy test, image pull, app launch/change, commit, or push. Next action belongs to main: integrate this recommendation with the model/service readiness and Personal OS spec findings, then choose a bounded experiment and its spending limits with the user.
