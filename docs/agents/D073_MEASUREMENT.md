# D073 measurement role — inferred owners and actual repair execution

2026-10-12. Owner: `d068_failure`. Status: offline wrapper implemented, focused3/3 passed and historical D071 receipts reproduced; final integration/source review is pending. No D073 product execution or efficiency result has been measured by this role. Governing documents: [parallel roles](D073_PARALLEL.md), [experiment](../orchestration/D073_EXPERIMENT.md), and the repository [decision-record skill](../../skills/jev-decision-records/SKILL.md).

## Ownership and goal

This role owns only this note and new files under `benchmark-runs/d073-analysis-tools/`. D071/D072 helpers, old evidence, production runners and candidates remain unchanged. Root owns model/account/rate checks, inference, Docker, ledger settlement, independent grading and final reporting. The objective is to measure whether public-failure owner inference reaches the selected existing repair worker and whether the resulting product passes the same public93 and independent63 gates. Inferred responsibility is not a verified defect location.

Reuse frozen D071 quality/time/profile analysis and its pure invocation-scope accounting; add only D073 stage classification and owner→selection→worker evidence. A copied candidate, a controller callback, a model choice, a started CLI, a passed public check and independent product completion remain different observations.

## Root command after terminal results

```sh
node benchmark-runs/d073-analysis-tools/analyze.mjs \
  --development benchmark-runs/d073-comparison-01/jev_profile \
  --preserved-repair benchmark-runs/d073-preserved-repair-01 \
  --historical-cohort benchmark-runs/d071-comparison-01 \
  --rates benchmark-runs/d073-preflight/official-rates.json \
  --historical-rates benchmark-runs/d071-preflight/official-rates.json \
  --public-registry benchmarks/e2e-swe/public-checks/registry.v4.json \
  --output-dir benchmark-runs/d073-analysis-01
```

Root confirmed these run/rate paths; their specification is not evidence that terminal runs already exist. The actual arm directory is explicit so the wrapper does not assume a three-arm D073 cohort. The output directory must be new. Only terminal result, controller journal, provider receipts, public-check evidence, pinned controller contracts, plans and root-created numeric independent summaries are read. No candidate files or hidden-test contents are opened. Input hashes and receipt listings are rechecked before writing `analysis.json`.

The command also writes `observation.json` for the separate Opus monitor and `observation-provenance.json`. The monitor projection explicitly selects numeric/bool/null values and constant condition/model/effort identifiers; raw errors, paths, logs, test/assertion IDs, owner IDs, source hashes and candidate contents cannot pass through. Full input hashes remain outside the monitor packet in analysis/provenance. The monitor itself is root-owned and is not invoked by this helper.

Exports: `analyze(options)`, `summarizeD073Run(reader, directory, options)`, `historicalComparison(current, historical)`, `writeD073Analysis(output, newDirectory, inputDirectories)`; pure additions `decisionStages(...)`, `repairOwnerChain(...)` and `numericObservation(analysis)`. Output schema: `d073-measurement/v1`; numeric monitor schema: `d073-numeric-observation/v1`.

## Stage and attribution contract

- Keep `split`, `relations`, `profiles`, `repair_owners` and `repair` separate. Count decision callbacks, individual typed questions, actual Jev POST dispatches, completed responses and local choices separately. `repair_owners` is post-failure work, not ordinary initial planning.
- Owner inference uses `adaptive_repair_owner_inference_requested` with `decision_id`, `round_index`, request hash and `failure_questions`. The completed event reports `inference_id` and per-failure assignments (`inferred` or `unknown`, existing artifact/task IDs). Its Jev receipt and POST start/finish, executor commit and `round.owner_inference` must corroborate it. Because the commit occurs before scope application, `round.repair_scope.inferred_ownership` must also contain the same inference/assignments/request/response hashes before the helper labels ownership applied. A saved stopped result or completed provider response alone is not applied ownership.
- Join the inferred assignment to the selected repair candidate's `owner_inference_id`, then to actual `adaptive_leaf_operation`, Claude start and receipt by round, task and attempt. Selection after failed round N applies to worker round N+1. Report unselected owners, unknown assignments, selected-but-uninvoked tasks, unexpected workers and broken links; never replace their counts with assumed execution.
- A worker may address several failures. Charge its receipt once in totals and once per unique task/attempt group. Per-failure references may overlap and are not additive cost allocations.
- Count deterministic bootstrap copying and carry-forward separately from model work. The preserved D071 profile candidate starts with its existing 10-worker profile plan; inherited profile history is not a new Jev call. New repair/profile receipts alone enter current repair accounting.

## Time, usage and quality boundaries

Arm wall, public-ready elapsed time, HTTP duration sum, adapter duration sum, callback span, worker union/span/sum, public checks, independent-grade phase and observed start→grade end are distinct. Preserve measured lock waits and simultaneous workload overlap without attributing every delay to a sibling run. Never add overlapping spans to manufacture completion time.

Use the existing exact token definition: uncached input + output + cache creation once + cache read; 5m/1h are subdivisions. Keep CLI-reported equivalent, frozen official-rate recomputation, known subtotals, actual billing and monthly allocation separate. Haiku missing per-request tier evidence makes independent recomputation unknown, not the original CLI-reported cost. Unreported/uncertain submitted calls stay in scope with null totals where needed.

Exclude a known local refusal only after corroborating terminal event coverage, explicit not-started receipt, matching admission evidence, absence of its POST/reservation/lease events, and reviewed D073 source ordering. D071's hardcoded reviewed source hash is not a D073 proof. Optional `--control-flow-evidence <review JSON>` requires schema `d073-invocation-control-flow-review/v1`, `reviewed: true`, nonempty `reviewed_by`, ISO `reviewed_at`, `guard_before_budget_reservation: true`, `guard_before_provider_invocation: true`, and `source_files` containing exactly matching reviewed hashes for `src/benchmark/adaptive-dag-runner.mjs` and `src/benchmark/telemetry.mjs`. The hashes must match that run's frozen source pin and actual snapshot bytes. A reviewer assertion is a source semantic claim; hash matching alone is not semantic proof. Without final reviewed matching hashes, local-exclusion certification remains disabled and a refusal produces accounting attention rather than zero usage. Raw excluded receipt nulls are preserved.

Public93 and independent63 remain bound to current exported revisions and the result/candidate hash. A failed or missing completion gate has no successful-development speedup. D071 Claude/fixed/profile are historical single runs, not fresh matched controls. Their task counts6/12/10 and concurrency/repair paths differ. Report historical differences as descriptive only; profile causality and universal ranking are unidentified. Preserved repair starts from a terminal candidate and never shares a whole-development denominator.

## Focused verification and next trigger

`node --test benchmark-runs/d073-analysis-tools/analysis.test.mjs`: 3/3 passed. Checks cover two failures→one selected/invoked worker without double charging, changed attempts and selected-but-uninvoked/unknown assignments; separate owner-stage accounting with known local refusal versus unknown submitted usage; and failed/preserved denominator exclusion plus a malicious-string/path/ID sentinel rejected by the numeric whitelist. Existing D071 arithmetic is imported rather than duplicated or retested exhaustively.

`historical-smoke-01.json` records a read-only replay of D071 controller evidence. It reproduces Claude 93/93+63/63, 4,589,913 tokens/$16.6926398; fixed Jev93/93+60/63, 3,648,801/$12.6353014; profile67/93+49/63, 2,874,640/$6.884842. All three have zero source/accounting issues. The original profile's single local refusal is excluded only using the historical frozen source proof and its raw null fields remain null. This is a regression check of the measurement wrapper, not a D073 performance result.

Files owned: `benchmark-runs/d073-analysis-tools/{analyze,repair-owner-chain,stages,observation,analysis.test}.mjs` plus private evidence in that directory. `imported-source-before.json` preserves seven D071 helper hashes; the command fails if any changes. All source files and receipt listings used by an analysis are checked again before publication.

Remaining: independent review of final source integration and control-flow proof; root freezes hashes and executes this helper after terminal evidence exists. Confirmed owner event/result fields match the implementation owner's current module, including stopped and committed results. D073 still has no measured live outcome in this role. No API/Docker/ledger execution is authorized to this role.
