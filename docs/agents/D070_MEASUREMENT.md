# D070 measurement role — bottleneck evidence and separate accounting

2026-10-11. Owner: `d068_failure`, following [D070 role contract](D070_PARALLEL.md) and [experiment](../orchestration/D070_EXPERIMENT.md). Status: completed read-only postprocessing of root-owned A/B executions. Numeric completion gates and price-equivalent comparisons are measured; broader quality and the second repair's generality remain separate review questions.

## Goal and ownership

Quantify n9 workload and dependency concentration from the actual D068/D069 plans, decision events and receipts, then hand the evidence to the planner owner and root. Prepare a new read-only helper under `benchmark-runs/d070-analysis-tools/` for fresh development versus successful D067 Claude and D068/D069 historical evidence. Preserve a separate accounting scope for the D068 preserved-candidate repair experiment; never compare its repair-only duration with a whole-development baseline.

This role owns this note and new private analysis helper/evidence only. It does not edit old D069 analysis, production code, historical evidence/candidates or frozen experiment documents. No keys, authenticated calls, Docker, live ledger or hidden-test details are accessed. Independent evaluation is read only through the controller's public numeric summary, if available.

## Planned evidence

- Count actual units, requirements, output artifacts, write paths, dependency fan-in/out and deterministic skipped choices; preserve the selections and stopping reasons that produced the largest leaf.
- Separate worker/process time, planning HTTP time, arm/public completion, independent grading and handoff gap. Report concurrent-interval overlap as observation, not additive elapsed time or causal speedup.
- Recompute input/output/cache-creation/cache-read and fixed official-equivalent costs from receipts with model/tier identity checks. Preserve missing usage and failed-call totals as unknown; CLI calls, model messages and provider POSTs are different counts.
- Keep fresh development, preserved-candidate repair, probes/preparation, monitors and historical baselines as distinct accounting scopes. New outputs must use exclusive paths and source hashes; changing active inputs during analysis must be detected.

## Next trigger and side effects

Send the n9 evidence and helper schema to root/planner early. Root owns paid execution and final results. No provider, production, ledger or historical evidence mutation has occurred in this role.

## Measured n9 concentration

The raw D068/D069 `planning.json` files agree. The new [baseline analysis](../../benchmark-runs/d070-baseline-analysis-02/analysis.json) reconstructs counts, actual choices, receipts and elapsed event intervals; the frozen planner source hash is verified separately for each run. The first analysis remains preserved as `d070-baseline-analysis-01`.

| D069 implementation leaf | Unit IDs | Units | Requirements | Output artifacts | Write paths |
|---|---|---:|---:|---:|---:|
| n2 | U19 | 1 | 3 | 1 | 7 |
| n3 | U20 | 1 | 3 | 1 | 1 |
| n4 | U21 | 1 | 1 | 1 | 1 |
| n6 | U16 | 1 | 3 | 1 | 2 |
| n7 | U17 | 1 | 2 | 1 | 4 |
| n8 | U18 | 1 | 12 | 1 | 3 |
| **n9** | **U01–U12** | **12** | **50** | **13** | **16** |
| n10 | U13 | 1 | 1 | 1 | 1 |
| n11 | U14 | 1 | 1 | 1 | 1 |
| n12 | U15 | 1 | 4 | 1 | 2 |
| Total | U01–U21 | 21 | 80 | 22 | 38 |

n9 owns **57.1429% of units, 62.5% of requirements, 59.0909% of artifacts and 42.1053% of paths**. It combines packaging, CLI, document loading, configuration, naming, IR and six schema-processing units. Counts are different proxies for work; these measurements do not establish equal cost per unit or per requirement.

The split sequence was `21 → [18,1,1,1]`, then `18 → [15,1,1,1]`, then `15 → [12,1,1,1]`. The large branch became n9 at depth 3, equal to `max_depth: 3`. The frozen planner sets maximum children to 1 at that boundary. `adaptive-split_count-64` therefore selected `keep` by **`local_singleton` with no Jev call**. It is inaccurate to say Jev considered splitting n9 further and decided to keep it. Jev supplied the earlier uneven memberships; the local depth rule ended further evaluation.

There were **47 actual Jev POSTs** (45 split/membership, 2 relation batches), **90 provider questions**, and **22 local singleton questions**: membership12 and split-count10. All three real split-count calls chose `split_4`. The ten leaves are `[12,1,1,1,1,1,1,1,1,1]`. In contrast, historical Claude's seven initial leaves were `[6,6,2,2,2,2,1]`; its task named n9 has a different scope and must not be matched by ID alone.

## Dependencies, time and cache

The final declared implementation DAG has four task edges: n2→n3, n4→n3, n9→n3, and n6→n8. Public verification also waits for every implementation task. **n9 has one direct implementation consumer, n3**, not many downstream worker nodes. n3 receives n9's13 outputs plus A20 from n2 and A22 from n4, for15 input artifacts. Dependency fan-out and number of input artifacts are distinct counts.

| Matching scope | D068 | D069 | Difference |
|---|---:|---:|---:|
| n9 worker adapter time | 769,663.212292 ms | 1,328,417.012167 ms | +558,753.799875 ms |
| n9 official equivalent | $3.1683042 | $5.3706916 | +$2.2023874 |
| n3 worker adapter time | 514,228.515250 ms | 460,845.702166 ms | −53,382.813084 ms |
| n9→n3 observed worker-duration sum | 1,283,891.727542 ms | 1,789,262.714333 ms | +505,370.986791 ms |
| Whole arm attempt | 1,843,397.350542 ms | 2,364,670.661541 ms | +521,273.310999 ms |

The path sum excludes readiness/public checks, scheduling delays and grading. It is a retrospective sum over the declared edges using actual worker durations, not a calibrated critical-path prediction or an achievable speedup. D068 is incomplete, so its shorter attempt is not a faster completed development.

Both runs started n9 sixth despite it having no declared implementation predecessor. D069's provider start occurred **379,411.947834 ms after execution start**. The initial scheduler had unknown durations for every task and a `null` predicted critical path. In the initial D069 worker event span of **2,195,229.113209 ms**, two workers overlapped for **532,106.195959 ms**, while one was active for **1,635,393.195208 ms**; both slots were idle for **27,729.722042 ms**. Provider event boundaries and receipt adapter durations differ slightly and are reported separately. Starting n9 earlier or splitting it may help, but these observations alone cannot quantify the counterfactual improvement.

D069 n9 consumed **3,413,256 tokens including cache**: input44, output156,868, cache creation202,806 (1h), cache reads3,053,538. Its reads are **76.3237%** of all Claude implementation cache reads; output is **49.9545%** of implementation output; its **$5.3706916** is **45.4295%** of Claude implementation cost. The components are input$0.000176, output$3.13736, cache creation$1.622448 and cache read$0.6107076. Cache reads are repeated context processing reported by Claude; they are not additional Jev calls or all new text. The shared task scope does not make the different generated tokens a causal effect of the routing-policy change.

These findings were sent to root and the planner owner before implementation. Useful inputs for a revised choice include group unit/requirement/artifact counts, expected later consumers and the large pending branch at its depth boundary. These are decision features and hypotheses, not forced partitions or invented per-unit durations. Requirements and source-backed interfaces must be conserved.

## Analysis helper contract

New files are `benchmark-runs/d070-analysis-tools/analyze.mjs`, `bottleneck.mjs` and `analyze.test.mjs`. They import the existing D069 cost/cache/public-coverage functions without modifying that source. Default historical rows are D067 Claude success, D068 Jev-all failure and D069 Jev-all success. The frozen [official-rate snapshot](../../benchmark-runs/d068-preflight/official-rates.json) remains the comparison basis; it is not refreshed by a network call and does not estimate monthly subscription allocation.

```sh
node benchmark-runs/d070-analysis-tools/analyze.mjs \
  --development benchmark-runs/NEW_DEVELOPMENT_COHORT \
  --preserved-repair benchmark-runs/NEW_SEPARATE_REPAIR_RUN \
  --output-dir benchmark-runs/NEW_D070_ANALYSIS_DIRECTORY
```

Omit the two run options for baseline-only analysis. The output directory must not exist; the helper creates it exclusively and writes `analysis.json`. It cannot overwrite old evidence or write within an input run. Every read source is hashed and checked again at the end; an active file/receipt set changing during analysis fails instead of producing a mixed snapshot. Missing terminal evidence produces incomplete/null metrics; root can rerun later using another new directory.

`fresh_development` is the new cohort's `jev_all` arm. `preserved_candidate_repair` is the separate runner directory, with its own calls/time/usage and controller-grade summary. Its round0 implementation operations copy bytes and are **not** counted as model workers; only started CLI receipts establish calls. Preserved metrics report copy-task sum, bootstrap round, nested public recheck, repair phase, reproduced failure, source preservation and export inheritance proof events. These nested timings are never added together. `actual_repair_demonstrated` additionally requires reproduced failure, a new selected repair decision, actual repair CLI, original candidate unchanged and final public85/independent63 completion.

The helper reports A/B arm overlap and cross-scope worker overlap from UTC timestamps, not a sum of phase durations. Shared ledger waits come from recorded per-request receipts and separate initial/terminal lock events; no ledger is opened or balance interpreted. Observed overlap does not isolate causal contention. Diagnostic probes, preparation and numeric-only monitors are explicitly outside A/B receipt accounting and require their own records rather than being silently merged.

The primary objective has separate `faster_than_claude` and `cheaper_than_claude` fields plus their conjunction, gated on product completion. Missing time/cost remains `null`, including on the baseline side. There is no arbitrary weighted score, and repair-only time is never compared with full-development Claude time.

## Verification and review corrections

`node --test benchmark-runs/d070-analysis-tools/analyze.test.mjs`: **4/4 pass**, 0 failure/skip, 71.769208 ms. Cases cover overlap versus summed time, null objective inputs, duplicated event IDs masking missing calls, and immutable output boundaries. Initial helper review found the first null-comparison and duplicated-start bugs; both were corrected with these meaningful counterexamples. Missing/incomplete interval or wait collections now remain null, and initial/terminal lock events are separate from receipt waits. Baseline01 predates these corrections and remains preserved; its historical numeric rows were complete and were not changed by the fixes.

Baseline02 recomputes **D067 Claude 6,772,666 tokens/$21.1351716**, **D068 overall tokens/cost null**, and **D069 5,809,782 tokens/$12.3604662** from391 pinned sources. These are preserved historical facts, not D070 results. The new actual A/B runs remain root-owned and unmeasured in this note until fresh terminal evidence arrives.

## Ready for actual-run postprocessing

The final runner interface was confirmed with the repair owner. Bootstrap/repair timings and reproduced failure are under `result.metrics`; original preservation is `result.original_candidate_unchanged`. The helper retains `bootstrap_proof.exact_original_bytes_modes_and_revisions`, verified `inherited_export_proofs[*].exact_bytes_modes_and_revisions`, and separate `incomplete_export_proofs`. An incomplete export is not a verified inheritance proof. The mechanism-level `actual_repair_demonstrated` additionally requires complete bootstrap/export proofs; product completion remains its separate public85/independent63 gate.

[Baseline03](../../benchmark-runs/d070-baseline-analysis-03/analysis.json) preserves the same historical totals and adds automatic D068→D069 n9 scope matching, full planning-file hash equality and worker/cache/cost deltas. It does not match Claude's different n9 by identifier. The subsequent final proof-field mapping changes only future preserved-repair evidence interpretation. Earlier analyses remain unchanged.

Helper source at handoff: `analyze.mjs` SHA-256 `1dd56a8a2cd127e2212c7a11f70d24d7b9a7002a2215b2480731db8dd7861f7c`; `bottleneck.mjs` SHA-256 `afa51385d69fb35319424984d580ecf4e226b535828141d553891b6ab9fcc463`. The unchanged imported D069 helper is `9c61c622813711e07dace76475591566f8b9a81e4e3840811469447bdcbaad90`. Final syntax validation passed. Final focused test after proof-field mapping was4/4,67.750792ms; no broad product suite was repeated by this analysis-only role.

All current role writes are complete. Root may invoke the helper while runs are stable or after they terminate, always using a fresh output directory. No D070 provider call, actual repair, new development completion or efficiency result is claimed by this role. No authenticated access, ledger read/write, candidate content read, Docker operation, hidden-test read, original evidence edit or D069 helper edit occurred.

## Actual-run postprocessing — 2026-10-11

The preceding handoff describes the state before root launched A/B. Both root-owned runs have now terminated, and their controller numeric independent summaries exist. The frozen helper was run once into [D070 analysis01](../../benchmark-runs/d070-analysis-01/analysis.json), explicitly using `benchmark-runs/d070-preflight/official-rates.json`. It pins625 sources and reports no accounting issues or missing usage for A/B. This analysis role made no model call. The D070 numeric rates equal the earlier D068 snapshot rates; their evidence files remain separate.

| Scope | Observed public / independent gate | Arm time | Tokens including cache | Official equivalent |
|---|---|---:|---:|---:|
| D067 Claude whole development | 85/85 and63/63 | 2,180,703.603375 ms | 6,772,666 | $21.1351716 |
| D069 Jev whole development | 85/85 and63/63 | 2,364,670.661541 ms | 5,809,782 | $12.3604662 |
| D070 A fresh development | 85/85 and63/63 | 2,064,734.652875 ms | 4,267,230 | $12.1814126 |
| D070 B preserved-candidate repair | 85/85 and63/63 | 533,346.788666 ms | 125,964 | $0.2762162 |

D068 remains an incomplete attempt with unknown overall tokens/cost and is not a completed-development speed baseline. D070 A uses50 actual Jev POSTs:48 planning and2 repair decisions. Its12 Claude CLI calls comprise10 initial implementations and2 repairs. Relative to D067's observed completion, A takes115,968.9505 ms less time (**5.31796%**), uses36.99335% fewer tokens and has42.36426% lower equivalent cost. Relative to D069, A takes12.68405% less time and costs1.44860% less. These are single historical/new observations, not randomized causal estimates. The helper's `objective.quality: true` means the recorded public85/independent63 gates passed; it does not settle the independent review's concern about the second repair's generality or overfitting.

B starts from an existing failed candidate. It has1 new Jev POST and1 actual Claude repair CLI; bootstrap copying made0 worker-provider calls. Reproduced failure, original preservation, complete byte/mode/revision inheritance proofs and both final numeric gates make `actual_repair_demonstrated: true`. B's time and price remain separate from fresh-development efficiency. Subscription allocation and actual paid invoices remain unknown.

## Planning and same-scope counterevidence

[Planning analysis01](../../benchmark-runs/d070-planning-analysis-01/analysis.json) pins the completed planning event prefixes and fixed plan/receipt/response sources. D069→D070 A has47→48 POSTs,90→91 provider questions and22→18 local questions. Planner wall falls76.135→61.647 seconds, direct HTTP duration sum40.708→32.697 seconds, adapter duration sum74.292→58.746 seconds,902,250→723,998 tokens and$0.5384394→$0.4314708. These boundaries are not added together. The arm elapsed time at planning completion rises76.569→100.890 seconds because work outside the planning phase differs.

The observed initial lock wait is37,754 ms in A; each planning receipt's lock wait is0. Root confirmed that full preflight runs inside the shared budget lock. The event establishes a real starting delay, but does not by itself prove every millisecond was caused by B. It is not subtracted from measured completion time.

The new ten leaves have unit counts `[3,3,3,3,2,2,1,1,2,1]`, eliminating the former12-unit leaf. That structural balance does not imply runtime balance. [Template-scope analysis01](../../benchmark-runs/d070-template-scope-analysis-01.json) matches U15/U16/U17 using identical unit, requirement, artifact, path, interface, source and catalog data. It pins11 sources and preserves formulas and event-prefix hashes. D069's three separate calls have450.152 seconds of summed adapter work,452,340 tokens and$1.9401218; D070's single n6 call has556.899 seconds,747,961 tokens and$2.074378. Fewer calls coincided with **23.7137% more worker time,65.3537% more tokens and6.9200% more equivalent cost**. Cache creation fell19.0821%, but cache reads rose104.0644% and output rose23.8933%. The old calls' span/union/overlap are retained separately, not equated with the summed duration or whole-development time.

## Phase boundaries and remaining time

[Phase analysis01](../../benchmark-runs/d070-phase-analysis-01.json) pins515 sources. Public callbacks, container lifecycles, repair decisions and round boundaries have complete unique start/end pairs. Historical and new runs are measured with the same pairing rules.

- **A:** initial implementation provider span/union is1,288.093 seconds; summed adapter work is2,241.059 seconds because workers overlap. The two repair workers add244.938 seconds of adapter work. Public checks run21 groups across3 rounds, taking353.345 seconds of interval union. Artifact readiness has66 container lifecycles with91.646 seconds of union. The combined nonduplicated verification union is444.990 seconds, **21.552% of arm wall**. The558.684-second window from initial failed round completion to final execution completion includes repair decisions, workers, readiness and public rechecks; adding it to those phases would double count.
- **B:** public checks have14 groups and291.082 seconds of union;44 readiness lifecycles have77.527 seconds of union. Combined verification union is368.609 seconds, **69.112% of arm wall**, while the actual repair worker takes42.373 seconds. Deterministic copy task time, bootstrap round, nested bootstrap public recheck and repair phase remain distinct reported metrics.
- Independent grading is outside the arm: A17.799 seconds and B18.744 seconds. Observed arm-to-grade-finish is2,082,992 ms for A and552,486 ms for B, including recorded handoff gaps. A/B arm overlap is492.764 seconds; their workers overlap42.365 seconds. Their costs and elapsed times are not summed into a completion-speed comparison.

The frozen helper's `maximum_depth_reached` wording is a depth-boundary observation under balanced-v2, not an unconditional hard stop. Actual balancing events are included in the phase record. The four depth3 leaves in A have `capacity_escape: false`, `keep_allowed: true` and only`keep` offered; none exceeds the structural capacity. Sources, helper implementations and old evidence were preserved throughout postprocessing. Candidate file contents and hidden evaluator details were not read.
