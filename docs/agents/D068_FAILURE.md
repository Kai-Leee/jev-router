# D068 failure propagation — local implementation and handoff

2026-10-11 KST. Owner: `d068_failure`. Role/rules: [parallel ownership](D068_PARALLEL.md), [experiment](../orchestration/D068_EXPERIMENT.md), [Jev decision records](../../skills/jev-decision-records/SKILL.md). Goal: preserve a known rejection and the actual terminal repair cause without clearing pending billing or retrying the request.

## Implemented contract

- [adaptive-failure.mjs](../../src/orchestration/adaptive-failure.mjs) exports `adaptiveOutcomeUncertain(value, {fallback})`. Explicit true/uncertain status remains uncertain; an explicit snake/camel-case false remains known. Only absent evidence uses the fallback. Missing a normalized answer alone no longer overwrites a known HTTP rejection.
- `adaptiveTerminalCause(value, {stage, fallbackCode, outcome_uncertain})` carries only `{stage, code, http_status, category, outcome_uncertain}`. Stage/category use fixed allowlists and codes use the bounded existing code grammar. Raw messages, bodies, headers and diagnostic excerpts are excluded. A prior nested cause retains its original decision stage.
- [provider session/arm](../../src/benchmark/adaptive-dag-runner.mjs) adds this cause to failed provider receipts and thrown errors. [Planner](../../src/orchestration/adaptive-dag-planner.mjs) preserves it through the chooser event and repair/planning return. `response_received:false` means no returned decision answer; `terminal_cause.http_status:400` independently proves an HTTP response.
- Final arm result carries `terminal_cause`, `prior_public_failure` supplied by execution, and a separate `settlement_status` (`pending`, `blocked`, `settled`, `unavailable`). A missing accounting snapshot is recorded under `settlement_status.observation_error`; it does not replace an existing known provider failure. Failed execution is not overwritten by an immediately subsequent deadline check. Source drift is still recorded.
- No reservation release/refund, model retry or additional worker dispatch is added. Missing usage and actual billed cost remain null. An outstanding reservation still blocks a later run via existing budget preflight.

The execution owner `d067_runner` separately integrates the same cause into `execution.terminal_cause`, `stop_code`, and `prior_public_failure`. Root owns source freeze, manifest/reuse changes and projection integration after this role stops writing shared files.

## Verification

Command from repository root:

```sh
node --test test/adaptive-dag-runner.test.mjs test/adaptive-dag-planner.test.mjs
```

Result: **17/17 passed**, 0 failed/cancelled/skipped; reported duration **8,223.736625 ms**. The client→telemetry→provider-session test uses mocked fetch with the D067 rejection message, HTTP 503, and a transport throw. Each case submits one mocked POST, preserves the correct known/uncertain status, rejects a second dispatch and performs zero automatic settlements. These are local transport tests, not live model calls.

After limiting the final deadline check to completed execution, `node --test --test-name-pattern='known provider cause|arm terminal' test/adaptive-dag-runner.test.mjs` passed **2/2**, 0 failures/skips, **4,691.937083 ms**. `node --check` passed for the three changed production modules; the owned-file `git diff --check` reported no whitespace errors.

The runner test drives a known HTTP 400 through a real planner call into a failed arm result while its mock reservation remains pending. The planner repair test separately verifies camel-case false, repair-stage classification, no selected candidate, no dispatch permission and no copied provider excerpt. Existing successful preparation/recursive planning/file publication/selected repair and parallel accounting tests also pass.

[D067 stored-incident replay](../../benchmark-runs/d068-failure/incident-replay-01.json) reads the original repair request, planning/public input and failed event. One local callback replays the saved `HTTP_ERROR / 400 / model_input_limit / false` through `chooseAdaptiveRepair`: `stopped`, known false, candidate null, automatic retries 0. All **4/4** source hashes remain identical. Actual provider calls: **0**. This demonstrates failure propagation only; it does not establish live repair success or savings.

## Remaining and side effects

Root must complete execution integration review, freeze all new helpers, run the combined regression and launch the authorized new `jev_all` condition. Production model acceptance, completion, elapsed time and token/cost changes are unmeasured by this role. Original D067 artifacts, actual budget ledger, keys, Docker state, hidden tests and Personal OS were not changed. New local replay evidence and uncommitted source/test/document changes remain. Temporary test directories were removed by test teardown.
