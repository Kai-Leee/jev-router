# D057 evaluation and completion-time boundary

2026-10-10. Owner: evaluation subagent. Scope: read-only inspection and this report only; no inference, credential access, candidate execution, hidden test/reference implementation reading, or Docker mutation. Root owns actual runs. Read `D057_E2E_MEASUREMENT.md` and current `STATE.md` first. Facts below come from current adapter/helper/scripts and saved result metadata, not a new live grade.

## Exact independent grade entry points

Run from `/Users/lee/workspace/plugins/jev-router`, with fresh output paths:

```sh
python3.14 benchmarks/e2e-swe/adapter.py --manifest benchmarks/e2e-swe/manifests/openapi_python_client.json grade --workspace /absolute/candidate --image-lock benchmark-runs/d040-openapi-image-lock.json --output benchmark-runs/d057-grade-CONDITION
```

This is the smallest independent grade. The adapter default is a different task (pytest-check), so the OpenAPI `--manifest` is mandatory and precedes `grade`. No model calls are made. A completed failed grade still exits 0; inspect the receipt rather than process exit alone.

For a lifecycle-compatible run receipt, the existing stronger wrapper is:

```sh
python3.14 scripts/grade-lifecycle-run.py benchmark-runs/d057-CONDITION benchmark-runs/d057-grade-CONDITION
```

It reads `result.json.candidate_path`, requires status `ready_for_independent_grade` or `stopped`, rejects candidate file symlinks/hardlinks, writes `pregrade.json` exclusively, snapshots SHA-256 before/after, stores `grade-controller.json`, requires grade `result.json`, and appends `grade_finished` to `events.jsonl` with finished timestamp and wrapper wall time. Its image-lock/manifest are fixed to the paths above. It is single-use per run: an existing pregrade/controller file causes failure. Failed or interrupted wrappers should not be blindly replayed; inspect whether grading already ran and preserve its original evidence. The wrapper does not itself assert `resolved=true` or reject an adapter nonzero exit if a result receipt exists.

Read-only source check, without running generated code or Docker:

```sh
python3.14 benchmarks/e2e-swe/adapter.py --manifest benchmarks/e2e-swe/manifests/openapi_python_client.json preflight
```

This verifies pinned source hashes/inventory internally; do not transfer evaluator files or outputs containing test details into worker context.

## Environment and success gate

- Host executables found: `/opt/homebrew/bin/python3.14`, `/opt/homebrew/bin/node`, `/usr/local/bin/docker`. Adapter uses Python standard library. Public smoke invokes host `python3` and modern Node `import.meta.dirname`; host AST validation previously failed on Python3.10/tomllib, so pin/check the Python used by each subprocess rather than assuming the top-level interpreter controls it.
- Docker daemon access and the already installed locked Linux/amd64 image are required. Digest: `ghcr.io/facebookresearch/e2e-swe@sha256:6fff26a8c24b60f855046bc61e657af2112217addbb7d4ac553eb5d449a7dab5`; locked image ID: `sha256:b47cc8871095d567c4f4c6a3116a5a26269fd37a3958b59e8586d6fc6b579eba`. Current sandbox read-only image inspect failed with socket permission denied. This does not establish image absence, daemon failure, or container cleanup. Live identity/access remains root's preflight responsibility.
- Adapter validates upstream commit `b11ac067b1dfe8ce8b6db245d88756f426007797`, manifest hash/inventory, installed digest/image ID/architecture. It never clones/pulls. A fresh verifier starts with empty `/app`, receives only the candidate and evaluator-owned tests, uses network none, 6CPU and8192MiB; declared51200MiB disk allocation is not enforced. Test command timeout is1200s; copy operations allow300s; command output cap is4MiB combined. Grade elapsed time includes verifier creation/copy/test/log export/removal, but starts after source/image preflight and output-directory creation.
- Success evidence: `grading_status=completed`, `resolved=true`, `reward=1`, exactly63 passed/63 records, no failed/skipped/pending/other records, correct task/commit/image/workspace, unchanged frozen candidate. Separately require `container_removed=true` or investigate cleanup; adapter/analyzer do not necessarily turn cleanup failure into failed functional success.
- A fresh output directory is mandatory. Never reuse baseline workspace, previous candidates, independent test files, or reference implementation in the Jev arm. A stopped candidate can be graded diagnostically; that does not make its early stop successful completion.

## Public smoke is useful but narrower

Current `src/orchestration/public-smoke.mjs` exports `runPublicSmoke({root,outputDir,imageLock,requiredPaths=[],timeoutMs=180000})`. It copies the candidate into a separate offline container, runs `setup.sh`, generates JSON/YAML and literal-enum variant clients, checks layout/Python syntax, imports generated models and checks a public authored sample's round trips and typed defaults. The older initial report saying imports are not performed is superseded by its expanded-smoke section.

It uses2CPU/2GiB/128pids, no host mounts, default180s total and4MiB candidate source cap. It reports `passed`, `artifact_failed`, `environment_error`, or `not_applicable`. Missing setup/packaging/requiredPaths yields `applicable=false,ok=null`: never count this as validation success. Cleanup failure becomes an environment error here. Public results can guide workers only under identical predeclared feedback/repair policy; independent grade remains terminal and private.

Saved authored positive/negative public smoke controls exist under `benchmark-runs/d051-public-smoke-controls/v2-good-result` and `v2-bad-result`; they prove narrow checker behavior, not product completeness. Saved D040 independent control receipts show empty0/63 and reference63/63, both with cleanup true. Only these aggregate receipt files were read; no reference implementation or hidden test bodies were inspected. No fresh controls were run.

## Timing and fairness proposal for root

Measure the primary endpoint from the new arm's original start, before planning/preparation needed by that arm, through final independent grade finish. Separately publish preparation/planning, implementation, integration/public smoke/repair, grade, and waiting/gaps. `run_wall_ms` ends before independent grading. Existing analyzer derives `elapsed_through_grade_ms` from original `started_at` to grade event `finished_at`; successful `verified_total_completion_ms` is null for unresolved arms. The grade wrapper duration includes Python subprocess startup/source/image preflight; adapter `elapsed_sec` excludes that preflight. Keep both, without substituting one for the other. Summed overlapping worker durations are not workflow elapsed time.

For a continuation include all retained original planning/worker receipts once and include the repair pause in continuous elapsed time. Do not supply D056 partial planning free to one arm. Report any common prebuilt scaffold/setup outside per-arm time explicitly; if claiming cold-start development, include necessary planning rather than quietly amortizing it away. Final review/monitor cost and time can be reported separately, with its concurrency/contention disclosed.

Match and freeze: public instruction and artifact contract hashes; worker model/effort/transport; input representation, architecture availability, task/test planning rules; same initial empty workspace; repair feedback and limits; actual concurrency; timeout/remaining-budget policy; public smoke source/options; adapter/manifest/image lock; controller source hashes. Authority must be checked in actual runner/protocol: both historical D051 config files say `mode=jev`, including the Claude-named config, so filename/config mode alone does not prove judge identity. Preserve different judge behavior as outcome, not a post-hoc reason to repair one arm more generously.

Historical analyzer matches brief/plan/model/effort/transport/concurrency. For new independently generated plans, equal plan hash cannot be expected; record common planning-input/algorithm hash and each output plan hash separately, and disclose that this measures whole planning-plus-development paths rather than a judge-only substitution. Do not reuse the old match predicate mechanically.

Only report a successful completion-time reduction if both arms independently resolve under these matched conditions. If one or both fail, report elapsed-to-stop/grade and completion status with null completion-time improvement. One pair is exploratory and does not establish a stable general speedup. Missing usage/cost remains null and refunded net charge is distinct from unknown model usage.

## Prior evidence and pitfalls

`docs/orchestration/D051_RESULTS.md`: Claude61/63, Jev0/63; run990857.667083/1114559.230541ms; original start through grade1105070.579/1205483.079ms. Public smoke passed an incomplete-quality candidate; Jev requested speculative repair with no concrete failure target then stopped before planned parallel work. These are not successful completion comparisons.

`docs/orchestration/D052_D053_RESULTS.md`: prepared62/63, D053+D0540/63; original-start through final grade1148150.164/1095383.928ms, including260814.267208ms continuation gap. A local payload-size rejection and a later HTTP400 are separate failures; the latter missing raw body cannot establish a provider context-limit cause. Unknown failed-call valuation stays unknown despite refund evidence. Planning success and worker overlap did not establish product completion.

Sources inspected: `scripts/grade-lifecycle-run.py`, `scripts/analyze-lifecycle-comparison.py`, `benchmarks/e2e-swe/adapter.py`, OpenAPI manifest, D040 image lock/control result receipts, `src/orchestration/public-smoke.mjs`, `docs/agents/D051_PUBLIC_SMOKE_STATUS.md`, D051 paired configs/results, D052–D054 result summaries. Next: root freezes D057 conditions, verifies Docker access/image, runs each new arm and private grade, then evaluates success before calculating improvements. This report does not initiate those actions.

## New runner audit — pre-execution follow-up

Read `scripts/recursive-e2e-comparison.mjs` at its initial grade predicate revision. The predicate checked only `grading_status`, `resolved`, `reward`. The actual saved reference receipt and adapter provide these exact fields for successful OpenAPI grading:

```json
{
  "grading_status": "completed",
  "resolved": true,
  "reward": 1,
  "summary": {"tests": 63, "passed": 63, "failed": 0, "skipped": 0, "pending": 0, "other": 0},
  "observed_test_records": 63,
  "expected_test_count": 63,
  "expected_test_count_observed": true,
  "verifier_process_returncode": 0,
  "container_removed": true,
  "task_id": "openapi_python_client",
  "upstream_commit": "b11ac067b1dfe8ce8b6db245d88756f426007797",
  "network": "none",
  "fresh_verifier": true,
  "model_calls": 0
}
```

Additionally verify `workspace` resolves to the frozen candidate and `image.image_digest`/`image.image_id` equal the frozen lock. Require controller `exit_code===0` and `outcome_uncertain!==true`. Keep candidate hash equality and source-drift checks. This strengthens receipt validation; adapter already performs CTRF record consistency checks internally. Functional pass and cleanup can be represented separately, but a clean successful comparison should require both.

Meaningful predicate tests: valid saved-shape synthetic receipt accepted; 62/63 rejected even with inconsistent resolved/reward flags; skipped or missing counts rejected; cleanup false/missing rejected; wrong task/image/workspace rejected; controller exit nonzero or uncertain rejected; immutable candidate/source drift invalidates comparison. These tests need no generated-code execution, Docker or hidden test bodies.

The runner's public-check policy is symmetric: syntax and smoke must both pass to avoid repair; both conditions get one global integration call and up to three public repairs; smoke environment error stops the run. After the public-repair budget is exhausted, private grading still runs, which is useful to separate public-check defects from benchmark success. Under that policy, independent success with `public_check_passed=false` is possible and must be disclosed rather than silently relabeled. Independent grade feedback never returns to workers.

Remaining pre-run points sent to root: the actual MCP executable `bin/artifact-worker-mcp.mjs` was absent from initial `sourcePaths`; freeze it too. `check()` checks remaining time only before syntax, then uses a fresh180s smoke allowance; the planner likewise gets its own4h budget. Bound stages to remaining arm time if claiming a strict total4h cap. Baseline single implementation versus recursive Jev planning/leaves is correctly labeled a whole-workflow comparison, not isolated judge substitution. Shared historical interface design and excluded controller/fixture preparation are explicitly disclosed. These findings describe the read revision and do not certify later root edits.

## Live outcome boundary — A completed, B chose no split

Read-only follow-up after A finished, while B had no terminal `result.json`. No live candidate, execution source, input or plan was modified. Only aggregate grade metadata, protocols, planning metadata/plan and artifact transport scopes were inspected; no private grader test bodies were read.

A `benchmark-runs/d057-claude-01/result.json` confirms `completed`, original63/63, reward1, cleanup true, source changes empty, public check passed, two Claude calls. Its completion time through independent grade is **1768517.547542ms (29m28.518s)**; total run wall1768522.755209ms includes final bookkeeping. A success alone does not establish a comparison or speedup.

B `planning/result.json` reports complete planning in1979.471958ms: exactly one attempted/answered inference, zero deterministic/reused choices, zero splits, one ready leaf, depth0. The sole root review in `planning/plan.json` is choice`1`, method`typed_choice`, provider`typesafe/jev-1.13-20260917`, `adequacy_assessed_by_model:true`. This is observed model selection to keep the root whole under the offered question, not evidence that keeping it whole was optimal or a calibrated adequacy judgment. It is not a forced-capacity termination. Planning consumed25041 input/53 output tokens, informational API-equivalentUSD0.0150246; actual billing remains unknown.

The single leaf's initial write scope contains13 paths, while A's initial implementation transport permits16. B's execution envelope explicitly leaves `pyclientgen/ir.py`, `pyclientgen/__init__.py`, and `pyclientgen/__main__.py` uncovered by the leaf; both conditions' subsequent global integration stage permits all16 paths. This verifies a scope difference before integration, not missing final files: B is still running and global integration is responsible for uncovered paths. No implementation completeness conclusion follows from the planning artifact.

A/B `protocol.json` checks matched worker model, effort, public source/brief/input/architecture hashes, all_paths, full image lock and limits. Their24 source path-to-SHA256 maps are identical, and hashes recomputed against current source showed no drift at this audit. Matching source and common inputs does not erase differences in role/task prompts, initial write scope, Jev planning and resulting artifact state.

Because B selected one leaf, the configured max concurrency2 is unused for its leaf stage. It cannot demonstrate recursive splitting, multi-worker overlap, or parallelization speedup. If B later independently passes63/63, the legitimate comparison remains an exploratory whole-workflow result: A single full-scope implementation plus global integration versus B Jev keep decision plus narrower single-leaf implementation plus global integration, including any public repairs and independent grading. A duration difference cannot isolate Jev decision latency or prove planner benefit; worker stochasticity, differing scope/prompt and integration work remain alternative explanations. If B fails, successful completion-time reduction remains null. Root must refresh B terminal receipt and both final source hashes before reporting the paired outcome.

## Final terminal audit — both attempts closed

Read `benchmark-runs/d057-comparison.json`, both terminal arm result receipts, `benchmark-runs/d057-contract-hash-audit.json`, and `benchmark-runs/d057-monitor-01/result.json`. The monitor object in the comparison exactly matches its standalone result. No result, frozen candidate, execution source or input was changed; no inference or container operation was performed.

A remains complete63/63 with **1768517.547542ms** verified completion. B is **unresolved62/63**, reward0, with **1405733.631709ms (23m25.734s)** failed-attempt run time, one public repair and final public smoke pass. Both independent grader containers report removed; both source-change lists are empty. B's `completion_wall_ms=null`, paired `valid_completion_comparison=false` and `completion_comparison=null` are correct. The shorter unsuccessful attempt must not be presented as a development completion improvement. Public smoke pass demonstrably did not guarantee independent success.

Root supplied the controller-only failure observation: union default expected3, actualTrue. This audit did not read hidden test bodies or independently reconstruct the defect from implementation code. The observation supports a default-value correctness failure; it does not establish that selecting one leaf caused the defect, or that more splitting would fix it. Preserve that distinction and keep independent feedback out of any worker context in this frozen comparison.

Recomputed cost arithmetic agrees with the comparison: AUSD7.6330826; BClaudeUSD8.4424046 plus JevUSD0.0150246 = **USD8.4574292**; paired operational equivalent **USD16.0905118**. Separate monitorUSD0.125336 yields **USD16.2158478** including monitor. These aggregate different disclosed API/token-pack valuation bases, not actual invoiced spend. Actual billing and controller/fixture development cost stay unknown. B's known equivalent exceeds A byUSD0.8243466 despite failing; no successful-cost efficiency claim follows. Monitor time28940.692125ms remains outside both arm intervals. CLI invocations2/3 and observed assistant message IDs24/33 are distinct units, neither an exact count of provider API requests.

The monitor flagged `contract_sha256` versus file hash as unexplained. Recomputed independently using the source's recursively key-sorted JSON serialization: raw contract file hash `a83da03bcfc5f07804d080ed9bba33b86a48538fab6217d8d5cf16b042c8f10d`; canonical content hash `e6e76f9c0f81eb9f12b7a5743d1979bdeaacb8dea96f3d70a65c71032472e440`, matching planning's recorded contract hash and the audit artifact. This is representation difference, not observed source drift. Current rehashing of both arm source lists returned no drift. The monitor's earlier uncertainty is superseded by this check; its original report should remain intact.

Final limitations remain: one sequential attempt each, A first; no replicated causal latency result; shared historical interface design and unmeasured common preparation; actual B execution was one leaf, zero splits, initial13-path scope followed by global16-path integration versus A16-path initial scope. No recursive/parallel speedup was exercised. These actual-path details should appear directly in final reporting, rather than only inside the embedded monitor narrative. The monitor's suggestion to rerun is not execution authorization and was not acted upon. No successful paired speedup was demonstrated; the current task's measured outcome is A completion and B failed completion under the declared whole-workflow conditions.
