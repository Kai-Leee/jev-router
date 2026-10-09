# E2E-SWE single-task evaluator bootstrap

This is Jev Router's standalone Docker adapter for a real E2E-SWE task. It is **not**
the upstream Harbor harness or a reproduction of the published leaderboard. It makes no model
calls. Agent performance is unmeasured until an independently generated candidate is graded.

## Source and selection

- Upstream: [Meta E2E-SWE](https://github.com/facebookresearch/E2E-SWE), pinned commit
  `b11ac067b1dfe8ce8b6db245d88756f426007797`, observed 2026-10-08.
- License: [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/); the pinned
  upstream README states benchmarking use, including commercial-model evaluation and result
  publication, and asks that the data not be used for training. No benchmark contents are
  copied into these checked-in adapter assets; see upstream `LICENSE` for the full terms.
- Task: `pytest-check`, Python, devtools and analysis. Selection was based on the declared
  offline Python dependencies and absence of external services. Its specification includes
  package installation, pytest plugin registration, fixtures, soft assertions and reporting.
  It is a manageable infrastructure pilot, not a representative sample of all 186 tasks.
  No observed model score or hidden-test result was used to select it.
- Unmodified upstream requirements: 6 CPUs, 8192 MiB RAM, 51200 MiB storage declaration;
  14400-second agent timeout, 900-second verifier timeout, 30 expected tests. Docker enforces
  CPU and memory; this adapter does **not** enforce the declared per-container disk allocation.
  The host runner must enforce the agent deadline. The verifier deadline is enforced here.
- `manifest.json` pins eight source files by SHA256. The exact image is pinned at runtime by
  repository digest plus local image ID, OS and architecture, after the coordinator pulls the
  declared tag `ghcr.io/facebookresearch/e2e-swe:pytest-check`. The validated digest is now fixed
  in the manifest; future tag drift is rejected. Receipts record those values.

## Boundaries

Agent input is only the original `instruction.md` in an empty `/app` in the pinned image,
plus the upstream-neutral installation rules: provide `/app/setup.sh`, use existing system
dependencies, install the candidate offline, and expect a fresh verifier. The agent must not
receive this evaluator directory, upstream checkout, oracle source, test bodies, or verifier logs
while a measured attempt is running. The controlled shell runner may enter only the labelled
agent container. No host folder, socket, credential, test directory or solution is mounted there.

The evaluator alone reads the pinned task metadata and `tests/test.sh`, uploads the upstream
`tests/` to a **new** offline verifier, and copies the submitted `/app` into it. It runs the exact
upstream shell script without changing its tests, expected count or install behavior. Binary
reward 1 requires all 30 tests passed, no other status, matching CTRF records and upstream reward.
Partial pass fractions are diagnostic evidence, not the upstream resolved-task score.

The bootstrap author read the original task specification, task metadata, generic scaffold,
`tests/test.sh`, and `solution/solve.sh`. The latter is only a clone/install bootstrap pointing at
the public `okken/pytest-check` repository commit below. No target implementation or hidden test
bodies were read. The author remains an evaluator and must not become a measured implementer;
the implementer gets fresh context with only the task instruction and execution contract.

Upstream documents a Harbor 0.22.0 separate-verifier test-upload bug. Harbor is not installed,
patched or used by this adapter; the explicit test copy addresses this adapter's own workflow.
This is not evidence about an installed Harbor version. Grading code executes as root in the
benchmark image just as upstream does; this is a conventional coding benchmark, not an adversarial
tamper-proof verifier. In particular, a malicious candidate `setup.sh` could alter `/tests`,
the Python/pytest executable or `/logs/verifier`; counter checks do not prevent fabricated
receipts. No claim of resistance to deliberate evaluator tampering is made. A successful oracle
check validates the plumbing, not model quality.

## Coordinator commands

From the Jev Router root, use Python 3.14 at `/opt/homebrew/bin/python3.14` (standard library only).
Create the `benchmark-runs/` parent first. Individual output folders and image-lock files must not
already exist. Docker and network provisioning are
coordinator-owned; the adapter never pulls images or clones repositories.

```sh
python3.14 benchmarks/e2e-swe/adapter.py preflight
mkdir -p benchmark-runs
docker pull ghcr.io/facebookresearch/e2e-swe:pytest-check
python3.14 benchmarks/e2e-swe/adapter.py lock-image --output benchmark-runs/image-lock-pytest-check.json
```

Prepare and grade the empty control. It creates only a no-op `setup.sh`; no fake plugin or
test replacement is provided.

```sh
python3.14 benchmarks/e2e-swe/adapter.py prepare-control noop --output benchmark-runs/control-noop
python3.14 benchmarks/e2e-swe/adapter.py grade --workspace benchmark-runs/control-noop --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/grade-noop
```

For the known-good control, the coordinator clones `https://github.com/okken/pytest-check.git`
and checks out `c356b52493e6d65f4b5adc68fb7b675f14a707d8` in an evaluator-only folder. This
network preparation follows the upstream solution bootstrap. The adapter checks the exact commit
and a clean worktree before copying it, then writes the identical offline editable-install command.
The preparation copy includes the reference project's `.git`, matching upstream behavior.

```sh
python3.14 benchmarks/e2e-swe/adapter.py prepare-control oracle --oracle-source .benchmarks/pytest-check-oracle --output benchmark-runs/control-oracle
python3.14 benchmarks/e2e-swe/adapter.py grade --workspace benchmark-runs/control-oracle --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/grade-oracle
```

Only after no-op is unresolved and known-good is resolved, create the agent sandbox. Shell
execution is provided by the host runner, not by this evaluator CLI. The runner must inspect the
container's labels, absence of mounts and network mode before enabling shell access.

```sh
python3.14 benchmarks/e2e-swe/adapter.py start-agent --name jev-pytest-check-attempt-1 --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/agent.json
python3.14 benchmarks/e2e-swe/adapter.py export --container jev-pytest-check-attempt-1 --output benchmark-runs/candidate-app
python3.14 benchmarks/e2e-swe/adapter.py grade --workspace benchmark-runs/candidate-app --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/candidate-grade
docker rm -f jev-pytest-check-attempt-1
```

`grade` returns exit 0 for a completed pass **or fail**; inspect `resolved`. It returns exit 2
for infrastructure/receipt errors, where `resolved` is null. Receipts include stdout, stderr,
upstream reward/CTRF and `result.json` with immutable image/source identity and elapsed time.
The verifier is removed after grading; the agent is retained until the coordinator removes it.
Every host client command streams stdout and stderr under a **4 MiB combined byte limit** and
its monotonic deadline. An output overflow or timeout terminates the spawned client process
group and is recorded as a grading error with `resolved: null`; truncated output is never accepted
as completed grading. The grading cleanup still removes its exact verifier container, because
terminating a `docker exec` client alone does not stop a process running inside Docker. A cleanup
failure is recorded explicitly in the result receipt.

Offline adapter checks:

```sh
python3.14 -m unittest discover -s benchmarks/e2e-swe -p 'test_*.py' -v
```

Current execution evidence is in [the role status](../../docs/agents/benchmark-bootstrap-STATUS.md).

## Observed control checks, 2026-10-08

The coordinator executed the exact control commands above. The first lock attempt failed because
the parent output folder did not exist; creating `benchmark-runs/` resolved that local path issue.
No paid model was called. Evaluator review read the output receipts and logs afterward.

| Control | Upstream reward / resolved | Actual execution | Adapter elapsed time |
|---|---|---|---:|
| Empty/no-op package | 0 / false | 0 tests collected; import-time `ModuleNotFoundError: No module named 'pytest_check'` | 1.813 s |
| Pinned upstream reference | 1 / true | 30 passed, 0 failed/skipped/pending/other | 5.143 s |

Both used a fresh offline verifier and reported successful removal. The no-op result is a
collection failure, not 30 failed assertions. Reference success confirms that tests are actually
uploaded and can execute, avoiding the all-zero broken-verifier failure mode described upstream.
These are harness control checks and do not evaluate Opus, Jev, or their combined agent.

Validated image digest:
`ghcr.io/facebookresearch/e2e-swe@sha256:9fecce0ca4de6423bbb469149f3a70058e74ae3a912a4c213ef12026aefc5756`;
platform `linux/amd64`, local image size 229168503 bytes. Local evidence:
[image lock](../../benchmark-runs/image-lock-pytest-check.json),
[empty control](../../benchmark-runs/grade-noop/result.json),
[reference control](../../benchmark-runs/grade-oracle/result.json).
These ignored run artifacts must be retained with any future published experiment bundle.
