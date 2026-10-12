# D064 mapping role status — 2026-10-10

Scope: P0 independent executable public checks and all-ID audit from
[D063](../orchestration/D063_DAG_PLAN.md) and
[D064 role agreement](D064_PARALLEL.md). Source authoring uses only the original
OpenAPI public instruction and D056 public specifications. No hidden grader/test,
prior hidden failure output, paid provider request, original Personal OS change,
budget change, commit, or push was used/performed.

## Delivered slice

- `benchmarks/e2e-swe/public-checks/`: canonical registry, all-85 inventory with source
  spans and explicit missing reasons, executable Python checker, two public input
  documents, separate positive/defective control generator, environment/binding
  declarations, README, and observed local-control evidence.
- `scripts/audit-dag-public-checks.mjs`: source/manifest hash pins, all-ID accounting,
  runner/registry/source consistency checks, contract mapping, concrete argv control
  execution, exact per-ID defective-control validation. Default audit is read-only
  apart from normal Python imports and executes no generator. `--controls` writes
  temporary candidate outputs and removes them.
- `test/dag-public-checks.test.mjs`: source inventory integrity, false/missing mappings,
  targeted-control coverage, blocked CLI exit behavior, and real normal/defective
  executable controls.

Result: **36/85 IDs implemented, 49 IDs explicitly blocked**. Coverage is 35/80
atomic obligations plus one combined default integration case. Four concrete suites
are phase `integration`; a generated package crosses generator/runtime boundaries.
Every mapped ID is targeted by at least one of 35 semantic defective controls.

## Actual evidence

`node scripts/audit-dag-public-checks.mjs`: exit 2, `status: blocked`, 85 inventoried,
36 implemented, 49 missing, 45 missing atomic obligations. Original source and
manifest SHA-256 verified; no generator/model call in this mode.

`node scripts/audit-dag-public-checks.mjs --controls`: exit 2 because coverage remains
incomplete; `controls.status: passed`. Four positive controls passed **290 substantive
assertions across 36 IDs**, with zero skipped cases. All **35** semantic defective
controls were rejected in their expected public IDs, with zero skipped cases and
no infrastructure-error substitution for an expected assertion failure.

| Suite | IDs | Positive assertions | Defective controls rejected |
| --- | ---: | ---: | ---: |
| Runtime/model core | 15 | 93 | 15 |
| Enums/defaults | 10 | 71 | 9 |
| CLI layout | 6 | 91 | 6 |
| Diagnostics | 5 | 35 | 5 |

The boolean-default defect targets both its atomic ID and the combined defaults
integration ID; counts are not fabricated into 36 independent faults. Saved
[control evidence](../../benchmarks/e2e-swe/public-checks/results/d064-local-controls.json)
contains individual results. Full raw tool-run JSON also exists in the working
session at `/tmp/d064-public-controls.json`.

`node --test test/dag-public-checks.test.mjs`: **7/7 passed**, zero skipped/cancelled,
including a fresh execution of all four normal and 35 defective controls. Observed
local duration was 22.838 seconds; this is test-run duration, not an efficiency
comparison or product implementation time.

Initial normal-control runs exposed two checker defects: macOS `/var` versus
`/private/var` temporary-path comparison and a missing explicit `importlib.util`
import. The checker now resolves its scratch root and imports that module explicitly.
All four normal suites and all 35 defects were rerun afterward and passed their
respective pass/reject criteria. The canonical registry initially included extra
metadata rejected by strict P0 field validation; metadata was moved to sidecars,
and the actual `publicCheckMapping` import now returns the expected blocked mapping.

Original D056 manifest SHA-256 remains
`c5dbaed1cc4eb286299e7606b1f91cf54065e46e3651d6b372e6e99c819f7ef8`.
Original public instruction SHA-256 remains
`983112ee5615c227830f968a820bcf3a4b1ef94a80f2efcc57c7d3d6979c5d22`.

## Remaining scope and boundary

Exact missing IDs and per-ID reasons are authoritative in
[inventory.json](../../benchmarks/e2e-swe/public-checks/inventory.json) and the audit
JSON. Missing areas include installed CLI/offline setup, JSON/YAML parser and config
behavior, typed/false additional properties, inline/ref-chain/allOf/union/prefixItems
features, nullable/literal enums, client behavior, endpoint transport/docstring and
response behavior, hooks/overrides/prefixes, metadata content and the other four
combined integration cases. Related partial checks are not promoted to complete
coverage of those IDs.

The authored positive control is finite and deliberately incomplete. It proves the
public checker can execute and reject the declared faults, not that a production
generator passed. No actual historical or new benchmark candidate was run. The
host's Python is 3.10.13; `ruamel.yaml` is unavailable, and no dependency was installed.
The runner is not an OS/network sandbox. Candidate code imports require an external
isolated environment before use with untrusted implementations.

Product readiness remains false for three independent reasons: 49 missing mappings,
no validated real-candidate environment/binding, and no artifact-revision adapter
connection. The Python evidence has `artifact_revisions: null`; a DAG integration
must bind exact candidate/checker/fixture/environment revisions itself. Existing
D056 manifests, planning defaults and budget/history records were left unchanged.

Next action: root runs final regression and independent review. Missing mappings
remain future work; do not expand this initial slice or label the product ready.
