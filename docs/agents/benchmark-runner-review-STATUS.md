# Benchmark runner independent review status

Date: 2026-10-08. Scope: `BENCHMARK_RUNNER_REVIEW.md`; reviewer owns this file only.
This is a bounded code/offline-test review. No model requests, credentials, container commands,
project settings, hidden test bodies, or reference implementation were accessed by this reviewer.

## Findings and coordinator follow-up

1. **P1 — wall deadline did not cancel the host process tree.** Original
   `src/benchmark/docker.mjs` `processResult()` killed only its direct child and awaited `close`.
   A grandchild retaining stdout/stderr kept the promise pending; the runner's subsequent Docker
   quarantine therefore could not run at the deadline. Offline reproduction: a Node subprocess
   spawning a 1.6-second grandchild with inherited stdio, with `timeoutMs: 300`, returned after
   **1726 ms**. The coordinator added the `killProcessTree` option and enabled it for Claude;
   the same reproduction with that option returned after **309 ms**, marked uncertain. This
   verifies ordinary POSIX process-group cancellation, not resistance to independently detached
   descendants. The added regression also passes. **Resolved for the declared POSIX runner.**
   No paid inference was involved.

2. **P2 — sandbox admission did not distinguish implementer from evaluator or enforce resources.**
   Initial `assertSandbox()` accepted an object labelled `org.jev-router.benchmark=true` with
   `org.jev-router.e2e-swe.role=verifier`, `Memory: 0` and `NanoCpus: 0`. The actual evaluator
   creation code assigns the shared benchmark label to verifier containers too. This permits a
   wrongly configured verifier to expose hidden assets, or a labelled unbounded container to
   bypass the documented CPU/memory envelope. The coordinator added an agent-only label,
   positive CPU/memory checks, and rejection of added capabilities and unconfined security
   options. The strengthened admission regression passes. **Resolved in offline checks.**

3. **P2 — terminal runner cleanup was conditional on uncertainty.** Initial
   `bin/benchmark-run.mjs` stopped its validated sandbox only when `result.outcome_uncertain`.
   A normally returning shell command can leave a background child with redirected stdio;
   that child can continue changing `/app` after the main process exits or its budget ends.
   The prompt's prohibition is not enforcement. Stop the exact validated container on every
   terminal run path and record whether cleanup succeeded; stopped containers can still be
   exported. The same lifecycle consideration applies to host descendants whose stdio has
   already disconnected. The coordinator now stops the validated container on normal and
   exceptional termination, records cleanup status, and refuses exit 0 when cleanup is unconfirmed.
   `processResult()` also kills its POSIX group on normal parent completion. A bounded local
   reproduction with an unreferenced, stdio-disconnected 1.5-second child observed parent exit
   at 44 ms and no remaining child after a further 100 ms. **Resolved by code inspection plus
   host-process reproduction; live container cleanup is coordinator-owned and unverified here.**

4. **P2 — verifier output was buffered without a byte bound in host RAM.**
   `benchmarks/e2e-swe/adapter.py:24` uses `subprocess.run(capture_output=True)`; `grade()` invokes
   it for candidate-controlled setup/test execution for up to 900 seconds. A faulty package
   import or setup that prints continuously can exhaust the host Python process despite
   container memory limits. The adapter now drains both streams with `selectors`, enforces a
   combined 4 MiB cap and wall deadline, kills the subprocess group on interruption, and marks
   grading `error` with `resolved: null` before verifier cleanup. Independent tests exercise a
   6 MiB mixed-stream producer, timeout, and persisted error plus the selected verifier's
   cleanup. **Resolved in offline checks.** This is distinct from intentionally fabricated
   evaluator receipts, which the README already disclaims.

The coordinator received findings as they were discovered. **All four reported defects have
been addressed and independently rechecked within the offline scope. No open actionable
defect remains from this bounded review.** The runtime/evaluator limitations below remain;
this is not a proof of live Claude isolation, billing behavior, or task performance.

## Validation performed

- `node --test test/benchmark-decision-gate.test.mjs test/benchmark-transport.test.mjs`:
  Initially **35/35 passed**; after the process/sandbox changes **36/36 passed**, no failures/skips.
  This includes decision/action binding, uncertain POST
  stopping, callback-error redaction, input snapshots, journal-failure stopping, serialization,
  call-count limits, baseline routing and completion gating.
- `/opt/homebrew/bin/python3.14 -m unittest discover -s benchmarks/e2e-swe -p 'test_*.py' -v`:
  Initially **11/11 passed**; after the output/deadline/admission fixes **16/16 passed**.
  The test contract rejects reward/CTRF disagreement and preserves a zero-test
  collection failure as unresolved, while missing receipts remain unknown/invalid.
- Separate bounded local Node reproductions before/after the process-group fix and for normal
  completion cleanup, as described above.

## Correct boundaries observed / unverified prerequisites

- The gate snapshots the selected exact command and durably records its decision before execution.
  Malformed/uncertain paid results stop queued work, with no automatic retry or leaked callback text.
- The launcher disables built-in execution tools, selects only the benchmark MCP tools, and uses
  an isolated session directory. Actual Claude runtime enforcement and account/model access still
  require a controlled live run; argument inspection is not proof of those properties.
- Request-count limits are enforced separately from Claude's reported USD limit. Jev USD cost
  remains unknown when no source provides it; no combined hard USD cap is claimed by this review.
- The baseline uses the same candidate-selection scaffold. It is not the unrestricted native
  Claude baseline, and successful control fixtures are not model-performance evidence.
- The launcher now preserves image/container identity, the exact combined brief plus SHA256,
  individual instruction hashes, CLI version, effort, limits and receipts. Actual comparable
  attempts must retain those artifacts; this review did not execute a paid attempt.
- The independent reviewer did not rerun Docker oracle/no-op controls. Their current results are
  coordinator evidence, and must remain separate from this review's offline checks.

Review complete; writing ownership relinquished after this final status update. No implementation
files were edited by this reviewer.
