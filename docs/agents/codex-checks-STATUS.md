# Codex E2E checks — 2026-10-14

Role: `codex_checks`, governed by `R20261014_CODEX_E2E.md`. Existing D083 files/results and the shared ledger were not edited. New files: `src/benchmark/codex-e2e-checks.mjs`, `test/codex-e2e-checks.test.mjs`, this status.

## Implemented API

- `inspectCodexE2EChecks({rootDir, manifest, probe=false, runCommand?, record?, signal?, evidenceDirectory?})`: validates public mapping, pinned frozen controls, image/environment contract. Static mode performs no provider process or ledger/key access. `probe:true` checks sanitized Codex version/login, pinned Docker image, actual Python and all seven pinned module versions in one no-network read-only container. Returns `{status, live_ready, blockers, registry, mapping, frozen_controls, image, environment, auth}`. Throws safe errors; host login does not establish requested model availability. The root runner owns cloud/Mac policy.
- `probeCodexBenchmarkHost({runCommand?, signal?})`: no inference; returns version, logged_in, auth_kind, model_availability_verified=false. Raw auth text is never saved or returned.
- `createCodexE2EChecks({rootDir,manifest,context,registry,preflightEnvironment,runCommand?})`: returns `{checkTask,probeEnvironment}` for `runAdaptiveDagExecution`. Reuses `runDagDockerCheck` and `validateAdaptivePublicReport`; contract checks reject zero-assertion passes. Both arms use identical single-check Docker execution; no readiness batching. Check envelopes bind attempt, round, artifact revisions, process/report paths and confirmed container cleanup. Context requires durable `record`; `save` may be supplied or defaults to exclusive fsync JSON writes.
- `gradeCodexE2ECandidate({rootDir,runDirectory,candidateDirectory,publicPassed,developmentWallMs,gradeManifest?,imageLock?,runCommand?,signal?})`: starts evaluator-only adapter once in a fresh grade directory. Defaults cloud4cpu manifest. Records candidate and grader/upstream source hashes before/after; refuses links/hardlinked candidate files and overwrite. Requires unchanged identities, valid offline grade, cleanup and 63/63 plus publicPassed for product_success. `completion_wall_ms` and `successful_completion_wall_ms` include development **and** independent grading. Hidden output stays root-owned and must never enter repair prompts. Returns null completion time on missing evidence/failure.
- `snapshotCodexCandidate(directory)` returns sorted file hash inventory and its aggregate sha256.

## Evidence

Command: `node --test --test-reporter=tap test/codex-e2e-checks.test.mjs` — **7/7 pass**. Output: `benchmark-runs/codex-checks-20261014-01/tests.tap`. Includes no-process static mapping, sanitized host status, actual Docker-command adapter wiring via fake subprocess, malformed public/readiness rejection, grade total wall and no overwrite, candidate/source mutation rejection, missing output and symlink rejection. These fixtures do not certify generated product completion.

Actual no-inference environment probe: `inspectCodexE2EChecks({probe:true,...})`, run through Node from repo root with scoped sandbox escalation. Evidence directory: `benchmark-runs/codex-checks-20261014-01/` (`result.json`, `codex-host.json`, `image-inspect.json`, `probe-process.json`, `environment.json`, `events.json`). Result ready; Codex **0.144.1**, ChatGPT login true; Python **3.11.2** and all seven pinned dependencies match; Docker image ID matches D040 lock; temporary container removed. Model availability remains unverified.

Initial read-only Docker CLI attempt inside sandbox was socket permission denied. Scoped escalation enabled the actual probe; this is not a Docker outage.

## Cloud findings and remaining boundaries

Current shell `uname -s` is Darwin and Docker context is desktop-linux. This probe is local Docker readiness, not proof of access to the earlier Claude Code cloud host. `scripts/cloud-env-up.sh` starts Linux dockerd and requires root/bind mounts, so was inspected but not run. Cloud prerequisites remain the exact Mac catalog path bind, containerd-snapshotter:false, NODE_USE_ENV_PROXY=1, pinned image and cloud4cpu independent grade. Current cloud access must be established by root separately.

Historical `scripts/grade-adaptive-arm.mjs` sets successful completion wall to arm wall and omits grade wall. New wrapper deliberately includes grade wall; historical evidence was preserved.

No paid calls, no existing candidate grading, no commits/pushes, no remaining containers from this probe. New private evidence and uncommitted source/test/status files remain. Full development, generated candidate public checks and independent product grade remain for the root runner.

## Additional actual checker integration — preserved candidate copy

Root subsequently authorized a single no-inference integration validation using an isolated copy of a verified historical success. Command: `node benchmark-runs/codex-checks-20261014-02/run-validation.mjs` (scoped Docker escalation). The original candidate and its original results were never modified.

- Historical source: `benchmark-runs/d079-no-deferral-03/jev_profile/result.json` (completed/public passed), confirmed against that arm's `independent-evaluation.json` (63/63, product_success=true).
- Fresh evidence: `benchmark-runs/codex-checks-20261014-02/`. `provenance.json` pins original result/grade files and all candidate files. The new candidate and pinned checker files are copies inside this directory.
- Actual new public callback: **8/8 suites**, **93/93 tests passed**, no retry. `public-evaluation.json` links eight durable per-check receipts and raw processes.
- Actual new independent wrapper: **63/63 tests passed**, model_calls=0, offline fresh verifier, cloud4cpu manifest. `independent-evaluation.json` and `grade/result.json` contain the full grading evidence.
- Preservation: original **38 files / 242,762 bytes**, aggregate SHA-256 `a2908fc07a7ec8e3d86ee40c69730f8d0397bd68f6b23faf5e604cbcb6f7f705`, identical before/after. Copied candidate, copied checker tree and grader/upstream source hashes also unchanged. `validation-result.json`, candidate snapshots and grade source snapshots record each comparison.
- Cleanup: **8/8 public containers** have successful removal events; the one independent verifier reports `container_removed:true`. No inference or new model generation occurred.
- Measured checker wall: public **783,226.464 ms** (13m03.226s), independent **122,354.039 ms** (2m02.354s), phase sum **905,580.503 ms** (15m05.581s). This is a local Docker amd64/Rosetta checker integration run, **not** Codex development latency, a fresh model-quality result or a cloud timing comparison. `development_wall_ms` in this wrapper invocation deliberately receives public validation wall; the enclosing `scope` labels identify its fixture-only use.

No additional executions or broader repeats were launched. New candidate/checker copies, private receipts and the validation script remain in the evidence directory; existing results remain preserved. Full Codex-versus-Jev development comparison is still the root runner's next step, subject to execution-host selection.
