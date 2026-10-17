---
name: pointsman-routing
description: Connect an opted-in Pointsman project to guarded D083 task decomposition, worker model selection, and failed-assertion ownership. Use at these registered checkpoints or for explicit host integration verification.
---

# Pointsman routing

Read [the execution contract](references/routing-contract.md). In a materialized bundle, `runtime.json` identifies the source checkout and wrapper; project paths and source paths are different. The source skill itself can use `node bin/pointsman.mjs` from the Pointsman repository.

## Registered decisions

- **Decomposition:** retain original requirements, artifact interfaces and public tests. Use the D083 fixed English questions to split work and bind dependencies; do not preselect the answer in prose.
- **Worker profile:** filter to actually available model/effort candidates. Use the fixed profile contract and apply the selected registered profile without asking the main model to repeat the comparison.
- **Failure ownership:** provide the failed public assertion, expected/actual result, existing artifacts/owners and prior attempts. Apply the returned artifact through existing ownership and scope handlers; attribution is a repair hypothesis, not proof of cause.

The opted-in runtime is `benchmarks/e2e-swe/manifests/pointsman-d083.json`. It requires the Pointsman gateway for these judgments. Keep question text in its authoritative contract and fill only supported variables. The gateway must validate and record before sending, and validate the response before an execution handler can consume it. If checks or recording fail, report the blocked decision. Do not fall back to native MCP, raw HTTP, or an older unguarded manifest.

Honor an explicit user model/workflow choice and existing write permissions. A label cannot create a worker, path or permission. Keep sufficient evidence inline: a local path or hash alone does not let Jev read the source. Preserve old runs; write each attempt to a new output directory. Do not supply hidden grader contents to planning or repair.

## Explicit host integration verification

When the user asks to verify this skill in Claude or Codex, run the bundle's commands from the target project:

```sh
node PATH_TO_THIS_SKILL/scripts/pointsman.mjs doctor
node PATH_TO_THIS_SKILL/scripts/pointsman.mjs smoke --out NEW_OUTPUT_DIRECTORY
```

Replace `PATH_TO_THIS_SKILL` with `.claude/skills/pointsman-routing` on Claude, or `.agents/skills/pointsman-routing` on Codex. Read the emitted report and evidence files; report the actual exit status and decision phases. A successful smoke uses real local D083/gateway code with deterministic mock Jev transport. It is **not live Jev inference, real Claude worker execution, product completion, or a speed/cost benchmark**. The host model's own inference is a separate event. Do not use the smoke to satisfy a request for a live development run.

For authorized live development runs on the configured cloud execution host, read the source checkout's latest `AGENTS.md`, `docs/agents/STATE.md` and the execution contract, then use `node PATH_TO_THIS_SKILL/scripts/pointsman.mjs run --out NEW_OUTPUT_DIRECTORY --spend`. This entrypoint pins the guarded manifest; it does not accept a manifest/provider override. Existing cloud-only ledger, sequential execution and stopped-run rules remain in force, and macOS live execution is blocked. Do not automatically retry an uncertain POST. Keep secrets in the server environment; never read key files into chat or copy them into a skill.
