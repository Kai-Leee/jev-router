# R20261014 host skill implementation

Date: 2026-10-14 (Asia/Seoul). Owner: `host-skills`, under [role contract](R20261014_ROUTING_IMPLEMENTATION.md). New branch: `feat/d083-skill-gateway`. Scope: repository-owned skill, isolated host bundle, read-only CLI availability/auth checks. Root owns live host dispatch and integrated result record.

## Changes

- `skills/pointsman-routing/SKILL.md`: actionable D083 decomposition, profile, failure-owner checkpoints; required gateway and no silent raw transport fallback; explicit integration smoke vs live provider/product boundary.
- `skills/pointsman-routing/references/routing-contract.md`: self-contained checkpoint and executable contract. Bound runtime remains a dependency; this bundle is not a copied runtime distribution.
- `skills/pointsman-routing/scripts/pointsman.mjs`: fixed doctor/smoke/guarded-run Node subprocess wrapper using generated runtime.json; no shell interpolation or credential loading. Run requires exact `run --out NEW_DIRECTORY --spend` and exposes no manifest/provider override. Other commands rejected. Existing source CLI performs runtime preflight and cloud-only live policy checks.
- `scripts/install-pointsman-skill.mjs`: explicit `--target NEW_DIRECTORY --host claude|codex|both`. Copies selected regular source files with SHA receipts to `.claude/skills` / `.agents/skills`. Requires existing runtime CLI and manifest before target creation. Exclusive target directory creation refuses existing projects/symlinks; no global config, no implicit replacement. Errors can leave a new incomplete isolated target; receipt exists only after all writes finish, and retry must use another new target.
- `skills/jev-prompting/SKILL.md`: prepend current D083 path, retaining all historical D075/inferred-v2 instructions as historical.

## Host inspection

Commands are local, read-only, and do not execute model inference:

```sh
command -v claude codex
claude --version
claude auth status
codex --version
codex login status
codex exec --help
claude --help
fd -H -t f '^claude$|^claude-code$' '/Users/lee/Library/Application Support/Claude' /Users/lee/.local/share /Users/lee/.claude
'/Users/lee/Library/Application Support/Claude/claude-code/2.1.295/9d6405864fdc/claude.app/Contents/MacOS/claude' --version
'/Users/lee/Library/Application Support/Claude/claude-code/2.1.295/9d6405864fdc/claude.app/Contents/MacOS/claude' auth status
```

| Host | Observed CLI | Authentication result |
| --- | --- | --- |
| Claude PATH | `/opt/homebrew/bin/claude`, 2.1.293 | `loggedIn:false`, `authMethod:none`, status exit1 |
| Claude desktop cached | application-support CLI above, 2.1.295 | `loggedIn:false`, `authMethod:none`, status exit1 |
| Codex PATH | `/opt/homebrew/bin/codex`, 0.144.1 | `Logged in using ChatGPT`, status exit0 |

Codex emitted a PATH alias creation sandbox warning but version, login status and help returned exit0. `/Applications/Codex.app/Contents` did not exist; no desktop Codex CLI availability claim. Claude application-support cache had native2.1.293/2.1.295 and VM2.1.295; only native cached2.1.295 inspected. Keys, credential stores and private archives were not read. These auth checks establish reported local state only; keychain availability may differ outside the sandbox. Root must distinguish an actual host attempt from this status inspection.

## Verification

```sh
node --test test/pointsman-skill-install.test.mjs
python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/pointsman-routing
python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/jev-prompting
```

Installer test: 1/1 passed, fail0, duration488.122208ms. It executes both host wrappers against a synthetic local CLI; verifies command/cwd dispatch, rejects unsupported commands before CLI execution, rejects reinstall and preserves existing receipt byte-for-byte. It is not host-model discovery or real Jev inference. Initial test failed because macOS resolved `/var` to `/private/var`; the assertion now compares real paths. No runtime defect was masked by that correction.

Root follow-up requested the guarded live command in the wrapper. After adding exact run argument forwarding, the same meaningful test passed1/1, fail0, duration777.562625ms. Its synthetic CLI accepts run only to inspect forwarded arguments; no provider or benchmark runs during this test. Actual live cloud guards belong to root's source CLI tests.

Both official skill validators stopped before inspection with `ModuleNotFoundError: No module named 'yaml'`. Do not report official validation success. No package installed. `git diff --check` for owned paths returned no diagnostics.

## Root handoff

Once source CLI and manifest exist:

```sh
node scripts/install-pointsman-skill.mjs --target /absolute/new-isolated-project --host both
```

Prompt each real host to use `pointsman-routing`, run its project-local wrapper `doctor` and `smoke --out NEW_OUTPUT_DIRECTORY`, then inspect actual evidence and state the mock-provider boundary. This preserves real host inference/tool-execution evidence separately from deterministic Jev fixtures. Do not add raw Jev calls to bypass unavailable host auth.

Codex supported candidate command (root selects model/config and new output paths):

```sh
codex exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox workspace-write -C /absolute/new-isolated-project --json 'Use $pointsman-routing to verify this integration. Execute doctor and smoke through the installed skill; inspect results and report actual evidence with mock-provider limitations.'
```

Claude supported candidate invocation: cached native CLI `--print --output-format stream-json --verbose --setting-sources project --strict-mcp-config --tools Read,Bash,Skill --allowedTools Read,Bash,Skill` from the new isolated project, with explicit `/pointsman-routing` or a skill-use prompt. Do not use `--bare` for OAuth testing: help states it disables OAuth/keychain reads. Auth false currently blocks claiming real Claude execution. These commands are proposals for root execution, not receipts.

## Remaining boundaries

No host inference, provider call, worker execution, paid ledger, Docker, global install, commit or push performed by this role. Old experiment results unchanged. New source files are uncommitted. Unit-test temporary directories removed by the test. Root records actual installation/host evidence and final status separately.
