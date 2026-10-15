# Results after D067

[한국어](POST_D067_RESULTS.md) · [Completed D067 comparison](MEASURED_ROUTING.en.md) · [Capabilities](CAPABILITIES.en.md)

Checked2026-10-16. D067 was not the last experiment. The previous main summary highlighted its three completed comparison rows without a follow-up timeline. This page corrects that omission.

The table was checked against public research `5f9b668` result documents and preserved local Codex reports. This is a document-level results inventory, not a new aggregation of every later raw receipt. Sources are linked per row. Changed check versions and execution boundaries must not be combined into one savings claim.

## D068–D071: inputs, decomposition, repair and profiles

| Stage | Work performed | Observed outcome | Time/tokens and interpretation |
|---|---|---|---|
| [D068](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D068_RESULTS.md) | Smaller repair input, failure propagation and avoiding unselected worker calls | Public84/85, independent63/63; incomplete after repair input rejection | Failed attempt30m43.397s; observed4,350,647tokens, full usage unknown because failed request usage was unreported |
| [D069](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D069_RESULTS.md) | Assertion ownership and artifact-scoped repair inputs; Jev full decisions | **Completed85/85 public and63/63 independent**; first candidate passed, no repair invocation | **39m24.671s;5,809,782tokens**. Lower cost than D067 Claude baseline, longer duration |
| [D070 fresh development](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D070_RESULTS.md) | Reduce overloaded clusters, force subdivision and balance allocation | Passed original85/85 and63/63; additional description-provenance diagnostics0/8 exposed a quality regression | 34m24.735s;4,267,230tokens. Not equivalent quality under the later93-check gate |
| [D070 preserved repair](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D070_PRESERVED_REPAIR_RESULTS.md) | Repair only writable artifact A03 in a failed candidate | **Completed85/85 and63/63**;1JevPOST+1ClaudeCLI, no model recalls for9other workers | **8m53.347s;125,964tokens**. Repair of an existing candidate, not development from scratch |
| [D071](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D071_RESULTS.md) | Add8description checks; Claude/Jev/flexible-profile comparison | Claude93/93+63/63 completed; fixed Jev93/93+60/63 and Jev profiles67/93+49/63 incomplete | Start through independent grading39m05.048s/30m52.044s/22m54.804s;4,589,913/3,648,801/2,874,640tokens. No equal-quality completed savings comparison |

D069/D070 development time excludes separate independent grading. D070 preserved repair also has18.744s separate grading. D071 includes independent grading, a different boundary. Token totals include reported ordinary input/output/cache creation/cache reads and Jev usage; known subtotals remain subtotals.

## D072–D085: recovery and repeated runs

| Stage | Work performed | Actual result and scope |
|---|---|---|
| [D072](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D072_INPUT_VALIDATION.md) | Input validator and historical request audit | Not a new full-development run; validation does not establish model acceptance |
| [D073](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D073_RESULTS.md) | Existing-owner inference and scoped real repair | Public79→91/93, independent60→61/63; actual repair but incomplete after subsequent owner rejection |
| [D074](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D074_PROMPTING_AND_FAILURE_LOOP.md) | Prompting skill, fixed-question checks and recovery design | Local verification; no new full-development completion comparison at this stage |
| [D075](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D075_RESULTS.md) | Enforced pre-send checks and recovery; preserved-candidate repair | Public88/93, independent60/63; incomplete after a later request rejection |
| [D076 / D081 §2](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D081_REPAIR_PATH_AND_RESULTS.md) | Broader repair-worker read access | Same79/93starting candidate: before88/93+60/63 in527.7s; after **93/93+63/63 in270.4s**. Two repair rounds became one; one observation each |
| [D077](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D077_QUESTION_FORMS.md) | Redesign unit relations, profile and ownership questions | Public84/93, independent63/63; incomplete |
| [D078](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D078_LAYERED_INTEGRATION.md) | Separate interface use from finished-file dependency; bounded-depth clusters | Public93/93, independent60/63; incomplete |
| [D079](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D079_EVALUATION.md) | Critical-path scheduling, no-deferral and public-spec review | One full development **93/93+63/63 in25m16s**; three separate candidate reviews reached63/63. Scheduling simulations are separate from live results |
| [D080](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D080_DEFAULTS.md) | Integrated defaults and post-public-gate review | Of2started runs,1completed and1blocked on repair input; a separate attempt was blocked before start |
| [D081](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D081_REPAIR_PATH_AND_RESULTS.md) | Packing, read scope, ledger locks and GET handling | 01completed;02independent62/63;03GET502stop;04preflightblock;05userstop. Earlier blanket claims about review benefit were corrected |
| [D082](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D082_CLOUD_RUNS.md) | Sequential cloud execution | **5of7terminal runs completed**,2failed. Separate08was user-stopped. All5completed93/93+63/63;21m44s–31m42s |
| [D083](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D083_REPAIR_DIRECTION.md) | Repair-input v3 and worker-mentioned scope expansion | **2of3completed**. Both newly added mechanisms were untriggered; their actual effect remains unmeasured |
| [D084](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D084_STRUCTURE_AND_FAILURE_ORIGINS.md) | Structure and failure-origin analysis | Reanalysis of saved runs, no new paid full development; separates cross-artifact integration, scope and test gaps |
| [D085 §9](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D085_MULTI_OWNER_AND_DIRECT_REPAIR.md) | Multiple owners, re-asks and direct generation-error repair | **2of3completed**. Run03actually triggered direct repair and worker-mentioned expansion;26.6–27.7minutes/run. No demonstrated reduction in rounds attributable to multiple owners |

D082/D083/D085 completion requires both93/93public and63/63independent. Each denominator applies only to its own sample; do not pool changed conditions. D082 independent grading used4CPUs. Later documents often report **Jev input tokens only**; these must not be presented as full token totals including Claude output and caches.

## Later local Codex comparison

A comparison with common Codex workers was also executed. The new Codex arm ended92/93public and59/63independent, incomplete. The Jev arm lost Docker during final checking; final grading remains on user hold. No additional inference or Docker restart was performed.

Only the matched initial210questions/4calls produced the separately scoped37.85xadapter-time ratio and7.95%reported-token reduction in [measurement notes](MEASURED_ROUTING.en.md#separate-observation-codexjev-initial-decomposition). This is not completed-development performance. Full runtime and results remain in local development.

## Why main still highlights D067

D067 supplies completed Claude and Jev rows within a common cohort, worker profile and check version. Later runs changed85→93public checks, model/effort selection, review/repair policies, host concurrency or grading resources. Some repeated only Jev without a fresh Claude baseline.

Later successes therefore exist. Read **feature activation, completion reliability and controlled efficiency comparison** as different outcomes. The previous main summary omitted this history; this page restores it. There is no established conclusion that every newer version is faster or uses fewer tokens than D067.
