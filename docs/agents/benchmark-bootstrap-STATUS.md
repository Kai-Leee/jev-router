# Benchmark bootstrap status

Updated: 2026-10-08. Owner: `/root/benchmark_bootstrap`.

## Purpose and owned assets

Prepare an independently gradable real E2E-SWE task for the authorized Opus 5.5 + Jev evaluation.
Owned files: `benchmarks/e2e-swe/{manifest.json,adapter.py,test_adapter.py,README.md}` and this status.
Upstream and other agents' source files are unchanged. No paid calls or Docker commands executed
by this role. The coordinator owns image pull, oracle clone and all container executions.

## Implemented

- Selected `pytest-check` from its declared Python/offline/no-service requirements before observing
  scores. Full plugin/package/reporting specification remains intact; 30 hidden tests, CPU 6,
  memory 8192 MiB. Upstream commit and all selected source/evaluator hashes pinned.
- Standalone stdlib Python Docker adapter: image lock, spec-only fresh agent container, artifact
  export, no-op/oracle preparation, fresh offline verifier, exact upstream script/test upload,
  binary reward plus CTRF agreement checks, receipt logs and verifier cleanup.
- Agent/verifier labels include `org.jev-router.benchmark=true`; no bind mounts or network.
  Agent receipt contains container name/id, immutable image identity, cwd, visible input files.
- Post-review hardening adds `org.jev-router.benchmark.role=agent|verifier` so the host shell gate
  can explicitly reject verifier containers. Existing source-specific role labels remain. CPU and
  memory bounds are unchanged and positive. Coordinator will recreate its smoke-test container.
- Source/license, task selection, evaluator exposure and adapter-vs-Harbor boundaries documented.
  Known-good source is the exact public commit declared by upstream `solution/solve.sh`.
- Independent review P2 addressed: host command capture now uses `Popen`/selectors with a 4 MiB
  combined stdout/stderr cap and monotonic deadline. Overflow or timeout kills its isolated client
  process group and raises an error; grading stays `error`/`resolved: null`, never silently truncated
  and completed. The exact verifier is removed in `finally`; cleanup errors remain in the receipt.

## Validation and outstanding work

- `python3.14 benchmarks/e2e-swe/adapter.py preflight`: passed, exact pinned commit and 8 hashes.
- CLI help: passed.
- `python3.14 -B -m unittest discover -s benchmarks/e2e-swe -p 'test_*.py' -v`: 16/16 passed;
  protects binary result against forged/incomplete reward/CTRF, skipped or missing test records.
  Includes mocked creation checks for both generic roles, positive CPU/memory, offline network
  and no host mounts. Actual control grading was not repeated for this label-only change.
- Output hardening checks use real local subprocesses for combined noisy output and timeout,
  assert client termination, preserve CompletedProcess stdout/stderr/returncode, and use a mock
  Docker boundary to verify grading records the cap error and removes the exact verifier. No Docker
  was executed by this role. Source preflight still passes after the command-runner change.
- The prior actual control receipts below precede output-capture hardening. No container rerun was
  performed for this follow-up; local subprocess/error-cleanup tests establish that change's scope.
- Coordinator ran actual Docker controls; this role reviewed their receipts/log and reread both
  using the stricter final `check-result` parser without rerunning containers:
  - `benchmark-runs/grade-noop/result.json`: reward 0, unresolved; 0 tests collected/recorded,
    caused by `ModuleNotFoundError: No module named 'pytest_check'` during test-module import.
    This is an expected empty-package collection failure, not 30 failing tests. Elapsed 1.813 s.
  - `benchmark-runs/grade-oracle/result.json`: reward 1, resolved; 30/30 passed, zero failed/skipped/
    pending/other. Offline installation and execution worked. Elapsed 5.143 s.
  - Both receipts: fresh verifier, network none, successful container removal, zero model calls.
- Image locked and now fixed in manifest:
  `sha256:9fecce0ca4de6423bbb469149f3a70058e74ae3a912a4c213ef12026aefc5756`, linux/amd64,
  229168503 bytes. See `benchmark-runs/image-lock-pytest-check.json` for local image ID.
- Initial image-lock output failed for missing parent `benchmark-runs/`; coordinator created it
  and then succeeded. README now includes that parent-directory step.
- No model implementation, Claude authentication or Jev decision behavior evaluated here.
- 50 GiB storage declaration is recorded but not individually enforced by Docker; agent deadline
  belongs to host runner. This adapter is not a Harbor/leaderboard reproduction.

## Exposure

Read task specs, metadata, generic scaffold, `tests/test.sh` and the 18-line solution clone/install
bootstrap. Did not read target implementation or hidden test bodies. Source files were hashed
without displaying contents. No-op log exposed the evaluator test module's top-level import
`import pytest_check` at line 16, not test assertions. Measured implementation must use a fresh
context and spec-only input. Candidate `setup.sh` runs as root and can tamper with evaluator files
under the upstream trust model; parser consistency checks do not constitute tamper resistance.

## Next coordinator action

Source/image pin and control checks are ready. Coordinator can create the spec-only agent sandbox
and integrate its controlled shell, then export and independently grade a model-produced artifact
once model authentication and paid execution conditions are resolved. Do not label these controls
as an agent-performance result or a Harbor leaderboard reproduction.
