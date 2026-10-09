# Goal/specification-only implementation benchmarks

**2026-10-09 D-019 update:** [paired execution](../docs/PAIRED_RUN.md) now supports explicit unlimited
call counts (`max_decisions:null`), linked Jev/Claude records and a separate exact Opus 5.5 monitor.
The former count-limit question is resolved. Real execution was rejected by automatic approval review,
which separately requires authorization of Jev monetary spend. No new inference has started.
The setup examples and control measurements below are historical; their finite limits are not current user policy.

Updated 2026-10-08. D-014 authorizes both public E2E-SWE and Personal OS preparation/evaluation.
The public clone, real Docker grading controls, goal packets and controlled execution path are ready.
No Claude or Jev inference has run. Claude subscription OAuth is now authenticated; first-run limits remain unresolved.

## What is ready

| Workload | Initial model input | Independent evaluation | Current evidence |
| --- | --- | --- | --- |
| [E2E-SWE pytest-check](e2e-swe/README.md) | Original English specification, isolated initially empty `/app` | Fresh container, exact upstream tests, reward and CTRF | Pinned reference 30/30 pass; no-op missing package fails at collection |
| [Personal OS](personal-os/README.md) | English goal, external record contract, synthetic Markdown only | Authored disk checks plus separate browser/native/artifact rubric | Grader negative controls and real container/MCP smoke; no app built |

The upstream clone is `.benchmarks/E2E-SWE`, pinned to
`b11ac067b1dfe8ce8b6db245d88756f426007797`. Reference code is evaluator-only in
`.benchmarks/pytest-check-oracle`. Neither checkout is exposed to the implementation agent.
Upstream license/provenance and eight source hashes are in `e2e-swe/manifest.json`.
This uses a standalone Docker adapter, not an installation of Harbor or a reproduction of its published leaderboard.

## Decision-controlled implementation

`bin/benchmark-run.mjs` launches Claude Code with `claude-opus-5-5`, no built-in tools, an explicit
MCP allowlist and no other MCP servers. `bin/benchmark-mcp.mjs` runs the existing Jev client on the
host and sends only the selected shell command into the offline container. The model sees only
`act`, `finish`, `status`. It creates its own plan, questions and candidate commands.

`mode=baseline` means **structured Opus baseline B**, where Opus supplies `selected_id`.
`mode=jev` means **condition C**, where Jev chooses or abstains and Opus cannot supply the selection.
This is a matched structured scaffold; it is not the unrestricted native Claude condition A.
In this pilot every external shell operation uses the decision gate, including inspection. That conservative
policy may add overhead; selecting only important checkpoints is a later measured optimization.
Commands may bundle a bounded operation. No human-written implementation task list is supplied.

The host journal binds input → decision → selected action → observed result. It is created exclusively;
restarting a server with the same journal fails instead of resetting its budget. Uncertain POSTs or commands
stop the gate without replay. An execution timeout quarantines the exact container. Terminal Claude exit
stops that container even on success; the artifact can then be exported from the stopped container.
Jev completion approval is only a claim, never evaluator success.

## Prepare and run

Use fresh names, output folders and workspaces for every condition. Commands below are preparation
examples; paid execution remains gated by the explicit `--spend` flag and agreed limits.

```sh
# Repo root. Docker images have already been pulled and the E2E image lock exists locally.
/opt/homebrew/bin/python3.14 benchmarks/e2e-swe/adapter.py preflight
/opt/homebrew/bin/python3.14 benchmarks/e2e-swe/adapter.py start-agent \
  --name jev-e2eswe-jev \
  --image-lock benchmark-runs/image-lock-pytest-check.json \
  --output benchmark-runs/e2eswe-jev-container.json

node bin/personal-os-container.mjs jev-personal-jev benchmark-runs/personal-jev-container.json

# Validates input/limits only: no Docker, authentication or model requests.
node bin/benchmark-run.mjs --config benchmarks/e2e-swe/jev.example.json
node bin/benchmark-run.mjs --config benchmarks/personal-os/jev.example.json
```

There are separate `baseline.example.json` files. Copy/edit a manifest before execution. The examples
contain **illustrative, unapproved** per-run values ($2.50 Claude, 5 decision operations, 900 seconds).
They are not estimates of completion cost or a claim that a full app fits those limits. A main comparison
has four independent attempts: two tasks × B/C. No automatic suite loop spends across the four.
After authentication and limits are settled, adding `--spend` to the runner command starts that one attempt.

The local `claude` command now links to Desktop-managed CLI 2.1.293. The old npm-global CLI was removed
at the user's request. Subscription OAuth returned `loggedIn:true`; see [CLI evidence](../docs/CLAUDE_CLI_DISCOVERY.md).
The versioned app path may need relinking after an app update. For future authentication use
`claude auth login --claudeai` in the user's terminal. `auth=cli` uses restricted
mode, disabled skills, an isolated session cwd and explicit tools. Actual runtime/context isolation in this
authentication mode still needs a live check. For stronger context isolation choose `auth=api-key` and
provide `ANTHROPIC_API_KEY` in the launcher environment; it uses Claude `--bare`, which skips automatic
CLAUDE.md/memory discovery and accepts API-key authentication rather than CLI OAuth. Do not place keys
in manifests or command-line arguments. The runner does not source dotenv as shell code.

The Jev server reuses `JEV_AI_API_KEY` from its process environment or `~/workspace/.env`; the Docker
container never receives this file/key. Before the first decision the server makes the authenticated,
non-inference model GET and requires `jev-latest`. Actual resolved Jev model/usage/billing are journaled.
Missing USD stays null. The CLI's USD setting does not limit Jev billing. Jev has its own reserved-before-send
call-count limit. These controls are not a guarantee against provider billing exceeding a quoted total.

Keep the exact actual Claude model IDs, CLI version, prompt hashes, effort, image IDs, limits and output.
Requested model ID alone does not prove the served model; `result.json` preserves that verification status.
`claude.stdout.json` and `decisions.jsonl` are private local traces, not files to publish automatically.

After E2E implementation, use `adapter.py export` and `grade` as in its README. Personal OS needs an
independently reviewed adapter mapping the generated app's actual API/CLI to evaluator operations;
an adapter must not implement missing app behavior. Browser and native evaluation remain separate.

## Actual verification in this turn

Run all commands from the repository root:

- `npm test`: **118/118 passed**, failures/skips/cancelled 0. Includes 28 gate and 8 transport tests;
  existing MCP integration uses a localhost mock, not a paid endpoint.
- `/opt/homebrew/bin/python3.14 -B -m unittest discover -s benchmarks/e2e-swe -p 'test_*.py' -v`:
  **16/16 passed**.
- `python3 -B benchmarks/personal-os/evaluator/selftest.py`: **10/10 passed**. These test the grader,
  not a reconstructed application.
- Final real E2E oracle and no-op receipts:
  [oracle](../benchmark-runs/grade-oracle-v2/result.json), [no-op](../benchmark-runs/grade-noop-v2/result.json).
  Both used fresh offline verifiers with fixed digest, and both reported container removal.
  The no-op collected zero tests due to missing `pytest_check`; it is not thirty failed assertions.
- Real MCP protocol → chosen command → Docker → journal smoke, with no models:
  [E2E environment](../benchmark-runs/mcp-smoke-xA5b78/result.json),
  [Personal OS environment](../benchmark-runs/mcp-smoke-6vJik1/result.json).
  Selected marker present, unselected action absent, hidden tests absent.
- Personal OS negative control CLI reports:
  [empty](../benchmark-runs/personal-os-controls/empty.json), [no-op](../benchmark-runs/personal-os-controls/noop.json).
  Both exit 1 and `full_product_verified:false`. A missing adapter is incomplete, even if process exit is 0.

The reports above are ignored local artifacts, not committed dependencies. Regenerate them with the
documented scripts in a fresh checkout. Independent review found and fixed process-tree deadline,
role/resource admission, terminal cleanup and unbounded verifier-output defects; see
[review evidence](../docs/agents/benchmark-runner-review-STATUS.md).

## Remaining boundaries

Claude was logged out in the initial checks; after the user's OAuth login, permitted host checks confirmed
`loggedIn:true` with `authMethod:claude.ai`. Subscription use and API-key billing are distinct; earlier dollar
proposals are not approved API budgets. First-run and Jev limits remain pending. No live Opus/Jev result,
speedup, savings or full reconstruction is claimed. The old offline metrics CLI remains available;
automatic conversion from these raw traces to that statistical contract is not implemented yet.

The E2E image is linux/amd64 on an arm64 host; Personal OS uses a pinned linux/arm64 Node image.
Compare B/C within each workload; cross-workload timing is not a model comparison. Personal OS Linux
preparation cannot validate macOS packaging/lifecycle. Its container is offline and does not preinstall
arbitrary frontend/desktop dependencies. Missing dependencies must be recorded rather than silently
enabling internet or omitting native requirements. The authored record format is not old-app byte parity.

Upstream setup/tests run as root in the verifier; output/reward consistency checks are not adversarial
tamper resistance. Container CPU/memory/time/output controls exist, but no per-container disk quota or
resistance to independently detached host processes is claimed. Logs note these limits.

All smoke and verifier containers created for this turn were removed; no benchmark containers remain.
The two downloaded images, two public clones, ignored local receipts, temporary synthetic grader data,
and uncommitted project files remain. No existing Personal OS/Vault/service, global Python environment,
Claude settings, or Git remote content was modified. No commit/push.
