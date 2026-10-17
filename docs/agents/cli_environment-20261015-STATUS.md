# cli_environment — 2026-10-15

Status: implemented; no inference executed. Root owns runner integration, source pins and paid pair.

## Implemented ownership

- `src/benchmark/codex-environment.mjs`: fresh temporary HOME/CODEX_HOME, private copied ChatGPT auth (not symlinked), isolated config, supported app-server skills discovery/config disable, model/account no-inference probe, fail-closed drift verifier, deterministic evidence fingerprint excluding credentials/paths, cleanup on setup failure and explicit close.
- `src/benchmark/codex-provider.mjs`: optional `cliEnvironment`; frozen invocations load the isolated strict config, controlled child env and resolved pinned executable. Verify immediately before dispatch and after process completion before accepting output. Record fingerprint in request and completed/failed receipt. Legacy invocations retain previous flags.
- `test/codex-environment.test.mjs`: private isolation/cleanup, credential omission, model admission, discovered/config drift fail-before-dispatch, controlled provider options.

## Verified local capabilities and evidence

Actual installed CLI `codex exec --help` documents `--ignore-user-config` as ignoring config only, while auth still uses CODEX_HOME. `codex app-server generate-json-schema --out /tmp/jev-cli-schema-20261015` supplies local methods `skills/list`, `skills/config/write`, `account/read`, `model/list`.

Actual no-inference app-server runs inside isolated home found exactly 5 bundled system skills and no inherited user/plugin skills. Supported `skills/config/write` disabled all five. The second discovery and per-call-style verification found all five disabled, same file hashes/config/binary. Config disables plugins/apps/hooks/memories/multi_agent, sets `project_doc_max_bytes=0`, and explicitly empties custom developer instructions. It does not disable or replace built-in model instructions.

Evidence: `benchmark-runs/codex-repair-20261015-01/cli-environment/discovery.json`: ChatGPT login=true, default model gpt-5.6-sol, high among advertised efforts; model_calls=0, enabled_skills=0, temporary_home_removed=true. Model listing is advertised availability, not inference success. No actual auth contents, email, source auth hash or token is recorded.

`node --test test/codex-environment.test.mjs test/codex-provider.test.mjs`: 13/13 passed; output `benchmark-runs/codex-repair-20261015-01/cli-environment/tests.tap`. Last failure-receipt fingerprint-only addition followed by repeat of focused tests. `node --check` both implementation modules passed.

## Integration API

```js
const cliEnvironment = await createFrozenCodexEnvironment({model, effort});
try {
  const runCodex = options => runCodexAttempt({...options, cliEnvironment});
  // Use this same object for both arms, decision provider and artifact worker.
  // Persist cliEnvironment.evidence and include fingerprint in environment parity.
  // Optional explicit per-arm await cliEnvironment.verify().
} finally {
  const cleanup = cliEnvironment.close();
  // Persist cleanup receipt.
}
```

Pass `runCodex` to both `createCodexE2EDecisions` and `createCodexArtifactWorker`. Pair duration includes common preparation if measured by root. Provider receipt wall_ms includes mandatory before/after environment verification, not pure remote inference latency.

## Boundaries

This removes dynamic installed skill/plugin/instruction discovery from benchmark calls; it is not an OS-level no-external-read claim. Root's existing read-only CLI sandbox and no-tool output rejection remain. A private auth copy may refresh locally; the original global auth file is not updated, so refresh failure is a real failure rather than permission to alter global auth. No keychain fallback is attempted if source auth.json is missing. Cleanup requires root's finally (normal exceptions covered); a SIGKILL can leave a private temporary home requiring explicit cleanup. Discovery helper uses 25-second bound only for no-inference app-server control requests, not model execution.

No source pins, main README, global setup, shared ledger or existing results edited. The generated protocol schemas remain under `/tmp/jev-cli-schema-20261015`; all temporary auth copies from this role's probes were removed. Source changes uncommitted.

## Runner integration follow-up

Root delegated runner lifecycle edits after original module completion. `src/benchmark/codex-e2e-runner.mjs` now creates one frozen environment for the sequential pair, passes a bound provider to both decision and artifact-worker adapters, writes the environment into protocol/runtime parity and persists cleanup in `finally`. Standalone runs own and clean their environment. Pair setup wall time is reported separately and included once in pair total; standalone setup is added to arm total/completion time. Arm totals in a pair exclude shared preparation. Per-arm and per-attempt drift checks remain mandatory.

Requested repair hooks are connected: `partialRepairPolicy: local-readiness-v1`, `publicOwnerEvidencePolicy: public-source-v1`, `selectPublicOwnerEvidenceScope(input) ?? selectInferredOwnerScope(input)`. Root retains source pin/registry updates. `node --check src/benchmark/codex-e2e-runner.mjs` passed; full integration tests pending refreshed registry/source pins.

## Reviewer correction: actual invocation cwd

Review found initial verify() inspected only the empty cohort work directory, while a provider caller could supply a directory with local/ancestor skills. This was an actual gap in the environment check. `verify({cwd})` now discovers at the canonical actual invocation directory; provider passes its `work` both before and after invocation. No source pin changes in this role.

Regression: `node --test test/codex-environment.test.mjs test/codex-provider.test.mjs` now 14/14 passed (`cli-environment/tests-actual-cwd-final.tap`). The first added test failed on macOS `/var` versus `/private/var` canonical path expectation; fixed the test to assert canonical paths and preserved its failure output separately.

Actual no-inference control (`cli-environment/actual-cwd-discovery.json`) verified a clean caller cwd, then placed a local `.agents/skills/inherited-probe/SKILL.md`; the same verifier rejected it with `CODEX_ENV_SKILLS_NOT_FROZEN`. The probe skill, workspace and auth copy were removed. Model calls=0.
