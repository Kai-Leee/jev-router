# D071 measurement role — fresh controls and actual profile execution

2026-10-11. Owner: `d068_failure`. Governing records: [parallel roles](D071_PARALLEL.md), [experiment](../orchestration/D071_EXPERIMENT.md), and [decision-record skill](../../skills/jev-decision-records/SKILL.md). Status: offline helper implemented and focused checks 6/6 passed; final root integration/source freeze is pending. No D071 live result or efficiency improvement is measured yet.

## Goal and ownership

Prepare a new helper under `benchmark-runs/d071-analysis-tools/` and this role note. Root owns the runner, planner, executor, new manifests, provider calls, Docker, shared ledger, independent evaluation and final experiment records. This role does not edit their common source files, old D070/D067 evidence, original candidates or hidden graders. Source/rate/registry identities are checked against frozen run evidence rather than inferred from condition names.

Apply the existing `jev-decision-records` rules: unknown values stay null; observed, estimated and proposed results stay separate; selected actions are linked to actual execution; earlier evidence is immutable. A shorter failed attempt has no completion speedup. The D070 original 85/63 gates and its later description-diagnostic regression remain distinct historical observations.

## Analysis interface

```sh
node benchmark-runs/d071-analysis-tools/analyze.mjs \
  --cohort benchmark-runs/d071-comparison-01 \
  --rates benchmark-runs/d071-preflight/official-rates.json \
  --public-registry benchmarks/e2e-swe/public-checks/registry.v4.json \
  --output-dir benchmark-runs/NEW_D071_ANALYSIS \
  --preserved-repair benchmark-runs/d071-preserved-repair-01
```

The last option is optional. An explicit frozen registry copy under `benchmark-runs/` can also be supplied. The root-confirmed manifest is `benchmarks/e2e-swe/manifests/d071-adaptive.json` (v7). The cohort contains the three condition subdirectories, each with `result.json`, `execution.json`, `planning.json`, `events.jsonl`, `receipts/*.json`, `source-pins.json`, and the root-created `independent-evaluation.json`. `planning.json` holds the original graph commit; `profiled-planning.json` and `profiles/{initial-0,repair-N}.{result,applied,commit}.json` record profile application separately. The measurement uses the original graph for common goal/catalog identity and actual selected events/worker receipts for model assignment. The output directory must be new and outside every input run. The helper verifies the bytes and receipt listings it consumed before publishing `analysis.json`. It never starts inference, subprocesses, Docker, grading or ledger access. Missing terminal/evaluation evidence remains missing.

Owned files are `benchmark-runs/d071-analysis-tools/{analyze,accounting,profiles,gates}.mjs` and `analysis.test.mjs`. The immutable D070 `Reader`, exclusive-output writer and worker-interval functions are imported; no old helper is edited. Manifest, registry, assertion and profile snapshot contents are verified against their pin hashes. Other common runtime identities are compared as the declared source-pin map, alongside controller source-drift evidence; this does not claim a fresh audit of every source file.

## Conditions and comparison assumptions

The fresh cohort contains `claude_all` with fixed Opus 5.5 medium workers, `jev_all` with the same fixed workers, and `jev_profile` with Jev-selected model/effort. The direct comparisons are fresh `jev_all` versus fresh `claude_all` for judge substitution, and fresh `jev_profile` versus fresh `jev_all` for profile policy. A third fresh dynamic-versus-Claude comparison measures the combined change. Historical D067 Claude is labelled historical and must not replace the new control.

New completion requires the frozen new public registry, including the original 85 cases and 8 description cases as separate reported groups, plus a valid independent 63-case controller summary with no skipped cases. For new development and preserved repair, the grade's `input_result_sha256` and `candidate_path` must match the actual result file and its candidate path. A copied or stale numeric pass cannot certify a different arm. Historical D067 lacks this new explicit grade binding and remains an older controller observation. A prior 85/85 is never relabelled 93/93. Checks must match the pinned version, assertion hash, revision set and runtime binding. Missing, stale or mismatched inputs block a fair comparison rather than becoming zero values.

The same source goal, catalog, public criteria, image, execution slots and relevant common policy must be verified across fresh arms. Intended differences in judge provider or profile policy remain explicit. Missing comparability fields are reported, not assumed. Single observations do not establish a generally optimal profile or a causal effect.

## Measurement and accounting boundaries

- Arm attempt wall, first/final public-ready event, successful public completion wall and arm-to-independent-grade-finish are separate. Grading, preparation, worker interval sums, phase spans and overlapping scopes are not added as interchangeable elapsed times.
- Count actual Jev POSTs, Claude CLI invocations, internal message/turn evidence, profile-decision callbacks, local singleton choices and stopped-before-send attempts separately. Claude transport attempts stay unknown unless actually observed.
- Split initial implementation, repair, normal routing judgment and profile selection costs. Include unsuccessful calls in operational totals and retain missing usage/cost as null with known subtotals.
- Sum uncached input, output, cache creation once and cache reads. Cache 5-minute and 1-hour counts are subdivisions, not additional total tokens. A reported cache token is not another Jev request.
- Use a frozen official model-rate table keyed by observed model identity. Requested profile labels alone cannot price an unverified model. Unmapped models, mixed models without an auditable usage split, or unsupported tier/geography/speed remain incomplete.
- Keep direct reported cost, recomputed official-equivalent cost, actual billing evidence and monthly subscription allocation separate. Haiku prompt tiers cannot be chosen from a whole CLI session's aggregate token count: missing per-request tier evidence makes only the independent recomputation null, while the original CLI-derived `api_equivalent_usd` stays intact. Both cost bases have separate objective fields. The actual/subscription fields remain null when scoped billing evidence is absent. Budget reservations are not charges, and the ledger is not opened by this role.
- A separate preserved D070-candidate repair is repair-only accounting. Preparation, probes and monitor calls also keep separate scopes and never disappear into or silently inflate fresh-development totals.

## Profile evidence contract to coordinate

Agreed worker-receipt linkage is `profile_selection.{decision_id,choice_id,profile_id}`, `requested_model`, `requested_effort`, `executed_model_arg`, `executed_effort_arg`, `observed_models`, `model_identity_verified` and optional `effective_effort_verified`. Requested fields may use `requested_profile` for compatibility; executed arguments cannot be inferred from requested values. A selected task must match a requested batch's `question_tasks`, its completed `choices[question_id]`, one Jev profile receipt and the worker receipt. Batch sizing is an execution-policy detail, not a constant in the analysis. Every actual batch retains its distinct decision ID. Completed batches in an atomic multi-batch failure are still billed evidence even when no selection is committed and no worker runs.

2026-10-12 preparation update: the earlier maximum-four-task batch description belongs to an older offline revision. Its 4/2/14-request preview results remain preserved; they are not actual provider selections. Root is reducing the final projected profile request to up to two tasks per initial batch and one selected task per repair batch; total batch count comes from task count and serialized sizing. The projection uses readable JSON, typed usage and model-level aggregates. This is a preparation target pending the final frozen contract, not a measured call count. The analyzer counts observed `adaptive_profile_decision_requested`/`completed` events and links by `decision_id`, `question_id` and task; it neither assumes four tasks per batch nor four total requests. Its `length === 1` checks require a unique request/completion/receipt **per decision ID**, not one total batch. The existing helper was inspected read-only; no analysis code or previous evidence was changed.

The same root update reports a separate v4 candidate recheck: the legacy 85 cases passed, the added 8 failed, 117.785 seconds, 0 inference calls (`benchmark-runs/d071-public-candidate-recheck-01`). This is public-gate failure evidence, not an actual Jev repair or full-development timing. The readable causal-repair preparation now has a separate 48 KB engineering cap; the historical 24 KB evidence, official 32k/64k token limits and heuristic admission estimates remain distinct records. No live D071 profile choice or development result is available at this update. Final contract/receipt compatibility will be rechecked after root freezes the new projection.

Record declaration, selection, accepted dispatch, CLI invocation and observed model as different stages. A valid typed choice with no subsequent worker call is an unexecuted selection. A silent model/effort substitution must be visible as a mismatch. CLI argument evidence confirms what was sent; it does not by itself prove an unreported provider-internal effort setting. Report profile grouping and exact observed model grouping side by side. If several decisions point to one model invocation, never multiply the receipt cost by the decision count.

The separate preserved-candidate repair may start from a legacy 85/85 success that fails the added eight description cases. `metrics.initial_failure_basis` and `bootstrap_proof.recheck` distinguish this observed new-gate failure from a copied historical failure. Bootstrap copying has zero provider calls; new repair invocations come only from receipts.

## Verification and next trigger

`node --test benchmark-runs/d071-analysis-tools/analysis.test.mjs` passed 6/6 on 2026-10-11; after adding stale-grade result/candidate binding counterexamples it passed again (112.013 ms reported test duration). These cover cache TTL accounting, tier-unknown versus reported cost, unknown failed usage, duplicate/missing starts, profile batch/argv bindings and unexecuted selections, public93/version/revision/assertion gates, failed/null-time/historical comparison refusal, and common-identity/treatment mismatch. Synthetic tests are explicitly not live experiment results.

An additional read-only replay of `benchmark-runs/d067-comparison-01/claude_all` with the existing D070 official rates reproduced its historical public85/85, 6,772,666 tokens and independently recomputed $21.1351716, with zero accounting/source issues. The older grade handoff gap stays in the observed arm-to-grade span and is separate from arm-plus-grade phase sum. This replay neither upgrades historical coverage to93 nor measures fresh D071 savings.

Next: check the final root manifest/rate/receipt layout and independent-grade binding, freeze the helper, then analyze root-owned terminal results in a new output directory. If integration changes a field, update this note and the new helper before source freeze; preserve all generated analyses. No live D071 arm is claimed complete here.

Final format check: `benchmark-runs/d071-preflight/official-rates.json` is compatible. All four models' prompt-tier definitions match the frozen profile catalog; Opus/Sonnet/Fable permit single-tier independent recomputation and Haiku correctly remains tier-unknown from aggregate-only receipts. Synthetic cost reports remain preserved for all four. The registry contains93 cases, all version4, and root's new grade wrapper emits the required result hash/candidate path. Evidence is saved separately in `benchmark-runs/d071-analysis-validation-01/{verification,rate-format-check}.json`. The helper is ready for root's terminal-result follow-up; preparation probes, including root's reported $0.0194212 model probes, remain a separate scope and are not silently added to arm totals.
