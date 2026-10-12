# D066 public evaluation integration

2026-10-11 Asia/Seoul. Owner: `d064_mapping`. Scope: independent public/evaluation integration review under [D066_PARALLEL](D066_PARALLEL.md). This initial record is a source/API review, not a new candidate run or comparison result. No paid calls, candidate edits, checker edits, global installs or hidden-grader inspection were performed. The repository's `jev-decision-records` skill is applied to separate source claims, local controls, actual candidate outcomes and final independent evaluation.

## Fixed oracle and current evidence

The construction and repair oracle remains `.benchmarks/E2E-SWE/tasks/openapi_python_client/instruction.md` (SHA256 `983112ee5615c227830f968a820bcf3a4b1ef94a80f2efcc57c7d3d6979c5d22`) and the immutable public D056 descriptions in `benchmarks/e2e-swe/manifests/d056-obligations.json` (SHA256 `c5dbaed1cc4eb286299e7606b1f91cf54065e46e3651d6b372e6e99c819f7ef8`). Historical hidden outcomes are not input to catalog generation, decision questions, workers or repairs. Required project entry documents contain historical result summaries; those summaries are not an oracle and are not copied into D066 model inputs.

The public subtree is frozen at check version3, with85 cases in seven suites. Canonical authored-control evidence is `benchmarks/e2e-swe/public-checks/results/d065-local-controls-v3.json`, SHA256 `52e3b35c19cd6ce9d2ef03f2008d3b8900e3cb0740fac4e647da24b942faad11`:85 normal cases,2216 assertions and81 targeted defects. `verifyFrozenControlEvidence()` verifies its31 source pins. `benchmark-runs/d065-postcheck/entrypoint-origin-v3-public-tree-freeze.json` covers all43 public-tree files. Those controls establish checker behavior on authored examples; they are not a D066 product result.

Environment remains `e2e-swe-public-python/v2`, pinned Linux/amd64 image ID `sha256:b47cc8871095d567c4f4c6a3116a5a26269fd37a3958b59e8586d6fc6b579eba`. Existing Docker launch/probe/cleanup must be reused. Candidate containers have network none, read-only candidate/checker/root/binding mounts, executable `/tmp:rw,exec,size=2g`, memory/CPU/PID bounds and dropped capabilities. The checker itself is not a sandbox.

## Fresh catalog compatibility

The frozen checker does not require D065's16 files, module names or producer boundaries. `Harness.install_candidate()` copies the entire supplied candidate directory, runs its root `setup.sh` inside a fresh venv with preinstalled dependencies, then invokes the installed console script. The public source requires the command name `pyclientgen` (lines9–10) and offline editable local installation without build isolation (lines362–368); it does not prescribe a generator package name or a16-file layout. A flat module, another package name or a `src/` layout can satisfy this boundary if its own packaging/entrypoint works. This compatibility conclusion is source-based; no new alternate architecture has yet been executed for D066.

The fresh catalog should therefore provide regular relative file paths, including `setup.sh` and whichever packaging/configuration/code/data files its architecture actually needs. The planner/runtime must validate non-overlapping ownership, complete file coverage and actual file creation. Runtime path rules reject absolute/traversal/alias paths, symlinks, hardlinks and special files. Checker copy rules ignore `.git`, `.venv`, `node_modules`, `__pycache__` and `*.pyc`; these cannot be the sole implementation of required behavior. These are execution compatibility constraints, not an inherited candidate architecture.

Required integration steps:

1. Validate fresh catalog units and source clauses without filling them from D065 code, old file names, failed outputs or worker assignments. Hash one accepted catalog and use exactly those bytes in every arm. Preserve preparation request/output, time and usage once, with root's declared shared/amortized accounting.
2. Derive `artifactBindings` from that catalog's exact paths. Conserving a requirement ID is accountability, not proof of the correct file owner or implementation; do not infer a repair file from a requirement ID alone.
3. Assemble every declared artifact into one complete candidate snapshot before whole-product public checks. Rebind each of the seven check descriptors to the entire current artifact ID set. No descriptor may retain `candidate-source` as an unbound placeholder or the historical16-ID vector.
4. Pin current checker files, environment and candidate artifact revisions in the runtime. A repair uses a fresh round/revision and preserves previous bytes. Rerun the full seven-suite set on every complete new candidate; do not combine passes from different candidate revisions into one readiness claim.

## Candidate invocation is a trusted projection

The frozen registry's argv deliberately targets the authored normal control binding. Running it verbatim would test local controls instead of a real candidate. The runner must project each registered suite to:

```text
python3 /checker/benchmarks/e2e-swe/public-checks/run_public_checks.py
  --suite <registered-suite> --binding /run/binding.json
```

`runDagDockerCheck()` writes the controller-owned binding:

```json
{
  "schema_version": "dag-public-command/v2",
  "kind": "candidate",
  "candidate_root": "/candidate",
  "environment_ref": "e2e-swe-public-python/v2"
}
```

No model-supplied command, `control_setup_overlay`, authored-control kind or `--only-test-id` may enter a live candidate check. Preserve registered ID, version3, complete ordered test IDs, public source reference and environment; rewrite only the trusted invocation/binding and current artifact scope. Report validation must require `binding_kind: candidate` in addition to the existing identity fields. The Python report intentionally has `artifact_revisions: null`; the filesystem runtime binds the actual vector after checking its pinned inputs, never accepting model-invented revisions.

## Collect all public outcomes before a known-failure repair

| Suite | Case IDs |
| --- | ---: |
| `runtime-model-core` | 15 |
| `enums-defaults` | 10 |
| `cli-layout` | 6 |
| `diagnostics` | 5 |
| `schema-models` | 17 |
| `http-client` | 17 |
| `cli-config-environment` | 15 |

Use the same suite order/concurrency policy in all arms. A known failed report should not prevent the other suites from running on that unchanged snapshot. This is evaluation collection, not publication of a failed candidate. An uncertain provider/check process, timeout, invalid report, changed source/revision or unconfirmed cleanup stops the condition without automatically retrying or launching repair.

Retain raw process output and the unmodified full report for every suite: check ID/version, environment, binding kind, status/exit code, cases and their assertion counts, errors, skipped/unexecuted IDs, candidate invocation statuses, setup/environment evidence and cleanup. A failed case can have zero assertions if candidate code raises before its first assertion. A suite initialization failure can have zero cases and all IDs unexecuted; this is one observed initialization failure, not a failure observation for every skipped ID. Report passed/failed/unexecuted counts separately with denominator85. Verification completion and case coverage are separate measures.

The frozen checker has its own subprocess limits: ordinary generator invocation20s, venv creation60s, setup120s and metadata probes20s. These are existing checker execution bounds shared by all arms, not a new per-worker10-minute limit. Root/runner still supplies the predeclared overall condition deadline and remaining-time bounds.

### D066 report adapter issues raised before implementation

The existing D065 validator accepts a known initialization failure only after `Harness` has been assigned. A fresh candidate whose actual `setup.sh` fails can raise inside `Harness(...)`; the frozen runner then emits exit1, `outcome_uncertain:false`, `executed:false`, `cases:[]`, all IDs unexecuted, `setup_evidence:null` and a nonempty error. The existing validator rejects `executed:false` before its initialization branch. That would hide a repairable setup failure behind an invalid-evidence classification. Likewise, a known top-level exception after a prefix of completed cases can retain those cases plus an unexecuted suffix; D065's validator currently only accepts the zero-case error form.

Runner/execution owners were notified. The additive D066 adapter should validate exact report identity, full expected ID accounting, observed process/cleanup and well-formed errors while preserving `executed:false` or partial coverage as reported. It must not manufacture executed cases, reinterpret malformed/controller failures as candidate success, or turn an uncertain operation into a repair opportunity. The precise accepted known-failure shapes and one focused local/contained witness belong in the D066 runner tests before paid launch. No change to the public v3 checker is required for preserving its existing output faithfully.

## Public-only repair packet

The execution owner's repair chooser should receive a structured packet built from retained public receipts, not a prose replacement for them:

- `run_id`, round/graph revision, attempt IDs, catalog/source/checker/environment hashes and the complete current artifact revision vector.
- All seven suite statuses and receipt references. Include exact failed case IDs, assertion counts, error types/messages; separately include initialization errors and unexecuted IDs. Mark unfinished collection explicitly.
- Exact public requirement/test specifications and source references for affected IDs. For an initialization failure without executed cases, include its suite's requirement scope with that uncertainty preserved.
- Current leaf ownership, catalog/interface descriptions, declared producer/consumer edges and available candidate files/revisions. Failure in a generated filename is not automatically ownership of an identically named generator source file.
- Allowed repair actions and exact proposed file/leaf scope. Owner-only, downstream closure and all-leaf scopes are controller-validated candidates; the selected engine chooses among them. A candidate decision is not an instruction to alter the checker or its expectations.

Raw setup/diagnostic text is untrusted candidate output. Pass it as evidence data; it cannot issue controller commands or expand writable scope. Do not include hidden grader paths/results, historical product failure details, D065 source, other arms' outputs or an evaluator-derived target patch. If public fixtures or checker source are exposed for diagnosis, root must predeclare that allowance and supply the same pinned material to every arm; do not selectively add information after seeing one arm fail.

Execution must connect the chosen repair action to an actual new worker attempt, record previous/new revisions and rerun checks on the resulting complete candidate. Carry-forward artifacts require no model call but their transfer/validation time remains in total elapsed time. A repair round that chooses stop, cannot construct a valid scope, hits a declared bound or becomes uncertain remains a failed/stopped observation, not an excluded trial.

## Final evaluation and comparison firewall

Root owns independent final grading of each terminal candidate only after that condition's public implementation/repair process ends. Pin the exact submitted candidate and retain separate grading receipts. Final grading must not become a repair input, drive another attempt on the same condition or retroactively change its public expectations. Unknown/missing grade remains unknown. This role does not inspect hidden tests.

Keep shared catalog preparation, split choices, relation choices, implementation, public verification, repair choices/work and final evaluation as separately timed/accounted phases. Include failures and every real provider attempt; parallel worker durations do not sum to elapsed workflow time. Record split counts/depth/leaves, actual relation choices/edges, repair scope/changed artifacts, calls/tokens/cache fields and known/unknown costs. One condition per arm is exploratory; successful completion-time comparisons require independently successful products. Failed or ungraded arms retain failure elapsed time and null success-time/speedup values. The four arms share all information, checker/image, worker model/effort, execution slots and declared repair opportunity; only the decision-provider assignment differs.

## Current handoff and remaining checks

- Planner/API reviewed: fresh catalog and recursive leaves, full-artifact integration node, typed repair choice; no fixed16-file reuse required.
- Runner/execution handshake delivered: trusted candidate argv projection, complete artifact vector, all-seven known-outcome collection, explicit candidate binding kind and constructor/partial-error report gap.
- No private helper was added yet; the additive runner owns invocation/report adaptation, while execution owns aggregation and repair. A new `scripts/d066-*` helper will only be added after coordination if those owners need independent support.
- Before launch: demonstrate arbitrary fresh catalog binding, legitimate setup failure versus uncertainty, all-suite collection after known failure, real selected repair scope, fresh-revision full recheck, and rejection of a normal-control report presented as candidate evidence. Root owns numeric limits, current ledger/model verification, final protocol/source freeze and live launch.

Read-only integrity verification during this review matched all43 whole-tree files and all31 source pins, with seven registered version3 suites and85 test IDs. Documentation whitespace validation passed. No candidate suite, authored-control matrix, Docker container or provider was run by this evaluation review; the runtime witnesses listed above remain assigned to the additive runner/execution owners.
