# D065 public HTTP/client checks

2026-10-10. Ownership: the HTTP extension, two `d065-http*` fixtures, and the
`d065_http` control emitter. Coordination contract: [D065_PARALLEL](D065_PARALLEL.md).

Status: **all 17 assigned public IDs have executable behavior assertions and
verified positive/targeted defective controls**. This is checker validation, not a
candidate result or independent product grade. The public integration owner owns
the inventory/registry/environment/catalog and final aggregate control run.

## Scope and implementation

- [HTTP extension](../../benchmarks/e2e-swe/public-checks/extensions/http_client.py)
  exports `SUITES`, `RUNNERS`, and `verify_config_models`. It uses the shared
  `Harness`/`Checks`; `httpx` is imported only when running the suite, so `--list`
  does not need third-party runtime libraries.
- [HTTP fixture](../../benchmarks/e2e-swe/public-checks/fixtures/d065-http.json)
  generates actual runtime/client/model/API modules. Five operations cover encoded
  path/query values, JSON, multipart, form and bytes bodies, model/error/list
  responses and undocumented statuses. Both transports execute through
  `httpx.MockTransport`; recording `httpx` subclasses check the real `request`
  call arguments as well as the resulting wire request. Ordinary HTTP transport
  calls are blocked during assertions to prevent an incorrect client from making
  a real service request.
- [Configuration fixture](../../benchmarks/e2e-swe/public-checks/fixtures/d065-http-config.json)
  covers successful/empty/missing hooks, class/module overrides and invalid-name
  prefixes, including a reference to the renamed class. Its reusable helper also
  checks enum/Literal behavior for the integration owner's config-layout suite.
  The fixture includes inline enum and request-body names and a tagged endpoint.
- [Finite control emitter](../../benchmarks/e2e-swe/public-checks/controls/d065_http.py)
  recognizes only the two authored fixture titles. It does not read the checker,
  hidden tests, historical candidates or grader feedback. It exports 16 distinct
  semantic defects; the path defect intentionally witnesses both `T.R16.02` and
  `T.integration.transports`. Control output is not a general OpenAPI generator.

| Public IDs | Executed behavior |
| --- | --- |
| `T.R15.01` | Value equality, constructor defaults and explicit status/auth settings |
| `T.R15.02` | Actual httpx sync/async instances, setter identity, base URL, default/custom authentication headers |
| `T.R15.03` | New client objects, prior-value preservation, merged headers/cookies and timeout on both transports |
| `T.R16.01` | Four keyword-only functions; detailed HTTPStatus/body/header/parsed values; simple parsed values; awaited async functions |
| `T.R16.02`–`03` | Exact encoded path, enum raw value, repeated array query key, UNSET omission |
| `T.R16.04`–`07` | Actual JSON/files/data/content dispatch and wire body, File/scalar multipart tuples, explicit media headers |
| `T.R16.08`–`10` | Selected transport only, documented model/error/list decoding, default and strict unexpected-status policy |
| `T.R17.01`–`03` | Real hook side effect and working directory, missing-command warning, renamed class/reference/module, default/custom prefixes with JSON round trip |
| `T.integration.transports` | All four body modes and response forms through both transports, including detailed/simple and undocumented-status behavior |

Expectations come only from the public instruction's Client, Endpoints and
Configuration clauses and the corresponding unchanged D056 public specifications.
No additional endpoint implementation layout or private request-builder name is
required. Prefix assertions tolerate the brief's unspecified underscore
normalization while requiring a valid identifier, the configured prefix, declared
attributes and original JSON round trip.

## Executed checks and evidence

Focused command from the repository root:

```sh
python3 benchmarks/e2e-swe/public-checks/run_public_checks.py \
  --suite http-client \
  --binding benchmarks/e2e-swe/public-checks/bindings/normal.json
```

Final focused output: exit **0**, **17/17 cases**, **459 assertions**, **0 skipped**,
7 actual generator subprocesses. Environment: Python **3.10.13**, httpx **0.28.1**.

A subsequent focused control batch used the same command with one normal binding
and each of the 16 `CONTROL_CASES` defects. It required the normal run to pass and
every defective run to exit 1 with `error:null`, zero unexecuted IDs, and every
declared expected ID among the failed cases. All **17/17 control executions** met
those conditions (**1 normal + 16 defects**), elapsed **32.494643375s**. This is
checker-control runtime, not product development speed.

Full raw reports, actual interpreter/library versions, source SHA-256 values and
all per-defect failed IDs are preserved in
[/private/tmp/d065-http-controls-v1.json](/private/tmp/d065-http-controls-v1.json).
The public integration owner can reproduce the same declared controls in the
aggregate `audit-dag-public-checks.mjs --controls` command after catalog integration.

Initial validation exposed two authoring issues, both repaired before the recorded
passing control batch: a template f-string brace syntax error, then a hook probe
whose Python startup imported generated `types.py` instead of stdlib `types`.
The latter initially yielded **16/17** passing cases; the authored hook now uses
`python -I -c`, retaining the required output working directory while isolating
Python's import path. No product candidate was edited to obtain a passing control.

## Boundaries and handoff

- The focused run used the authored control binding and host environment. Installed
  candidate setup, YAML configuration and Docker environment verification belong
  to the integration owner's aggregate validation and are not claimed here.
- `artifact_revisions:null` and `product_certified:false` remain honest in these
  local control reports. Candidate revision binding and product success require
  the real runtime/controller path.
- No model/provider call, real external service request, global installation,
  hidden-source read, historical evidence edit, commit or push occurred.
- No existing tests were deleted in this slice. The 17 public ID reports share one
  suite, one main generated package, two small fixtures and common transport
  assertion helpers instead of duplicating orchestration tests.
- API and results were sent to `d064_mapping` and root. Independent review was
  requested from `d064_review`; final aggregate tests and live launch are root's
  responsibility after the source freeze.
