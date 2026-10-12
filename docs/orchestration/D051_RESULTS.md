# D051 fresh matched lifecycle rerun — final result

**No successful-task efficiency improvement was demonstrated.** Claude produced all16files and passed61/63 original tests; Jev stopped after repairing its first group, retained6/16files and passed0/63. Both independent grades are `resolved=false`, reward0. Unlike D050, all3 Jev API decisions returned HTTP200 and settled; this stop was a lifecycle decision, not transport failure.

User authorized fixing and rerunning the full comparison. D051 is a fresh pair: same public brief, frozen preparation plan, fixed Opus5.5medium workers, scoped MCP writing, decision projection/lossless encoding and concurrency2. [Protocol](../../benchmark-runs/d051-protocol.json) pins **18 source files**. Earlier interim text said19; that count was mistaken and is corrected here. Historical D048–D050 runs and costs remain preserved separately.

## Whole-workflow measurements

Source: [final analysis](../../benchmark-runs/d051-analysis-final.json), reproduced with:

```sh
python3 scripts/analyze-lifecycle-comparison.py benchmark-runs/d051-protocol.json --output benchmark-runs/d051-analysis-final.json
```

Output creation is exclusive; use a new output path when reproducing. Both final candidates were hash-frozen before original independent grading.

| Measurement | Claude judge | Jev judge |
|---|---:|---:|
| Initial selected groups | 1 | 4 |
| Actually dispatched original worker groups | 1 | 1 |
| Additional repair workers | 0 | 1 |
| Frozen files / planned files | 16 / 16 | 6 / 16 |
| Original tests passed / expected | 61 / 63 | 0 / 63 |
| Workflow wall time | 16m30.858s | 18m34.559s |
| Start through independent grade finish | 18m25.071s | 20m5.483s |
| Controller invocations / final receipts | 3 / 3 | 5 / 5 |
| Total operational API-equivalent USD | 4.4716516 | 4.9102542 |
| Decision API-equivalent USD | 0.539516 | 0.0340854 |
| Initial worker API-equivalent USD | 3.9321356 | 3.0837930 |
| Repair worker API-equivalent USD | 0 | 1.7923758 |
| Actual incremental subscription bill | unknown | unknown |

Workflow values derive from `run_wall_ms`:990857.667083 and1114559.230541ms. Through-grade values:1105070.579 and1205483.079ms, including queue/verification time. Formatting divides milliseconds by1000 and rounds seconds to3decimals. Sum of decision invocation times was16456.852042ms Claude versus6182.656791ms Jev, but those represent2and3different questions/stages, not a matched per-question speed experiment. Cheaper decisions did not produce cheaper successful completion; Jev spent an additional repair and stopped unfinished. No savings percentage is claimed.

Public smoke, AST checks, reviews and repair are included in workflow time. Cache counts remain separate: Jev's missing cache fields are null, not zero. Final output usage already includes thinking tokens; no estimate or partial stream usage is added.

## Why Jev stopped

[First review](../../benchmark-runs/d051-jev-01/calls/003-decision.response.json): `repair`, confidence0.58, accept probability0.21, repair0.79. [Second review](../../benchmark-runs/d051-jev-01/calls/005-decision.response.json): `stop`, confidence0.26, accept0.37, stop0.63. Confidence was recorded only; no confidence threshold caused the stop. After the one-repair budget was used, the available review choices were accept/stop. The selected stop ended the lifecycle before other groups were dispatched, so planned parallelism never occurred in this run.

Source AST checks passed. Public smoke was `not_applicable` because the full candidate was incomplete. The repair worker explicitly described no concrete failure report and performed its own specification audit. Jev returned no textual rationale, so an exact model-internal reason for choosing repair/stop is unobserved. The supported structural finding is that review can request repair or stop on incomplete validation evidence; the subsequent worker must infer a repair target. This should be examined before claiming the router evaluates correctness or usefully eliminates work.

Claude's two original failures are in PrefixItems and Defaults cases. Passing public smoke therefore did not establish complete functionality. The expanded preflight smoke had also passed the old Claude candidate that failed3/63 original tests; its coverage limitation was known before D051. No hidden grader feedback was supplied to workers during this run.

## Artifact delivery bottleneck

[Final timing diagnostic](../../benchmark-runs/d051-artifact-timing-final.json), generated from `scripts/analyze-artifact-timing.py`, maps invocation request task/attempt to transport ownership and journal timestamps. It does not read thinking text or infer billed usage.

| Worker | Start→first successful file write | Last successful write→terminal | Successful writes / unique paths |
|---|---:|---:|---:|
| Claude group1 | 423.438s | 18.266s | 19 / 16 |
| Jev group1 initial | 471.768s | 16.913s | 7 / 6 |
| Jev group1 repair | 174.997s | 12.499s | 2 / 2 |

First file delivery took several minutes for both original workers. This includes all pre-write activity and is not a measurement of time spent thinking alone. Last-write→terminal is not necessarily idle time. Repair touched2existing paths, while the candidate retained6original paths. Journal mapping checks and a mismatched-journal rejection control passed. Earlier live snapshot recorded null first-write time because no files had yet been saved; final timestamps supersede that provisional observation.

## Monitoring, budget and remaining work

Separate [Opus monitor](../../benchmark-runs/d051-monitor/result.json) completed: API-equivalent$0.07218,23300.624625ms. It is excluded from both operational columns. Defined fresh pair plus monitor subtotal is **$9.4540858** (`4.4716516+4.9102542+0.07218`), API-equivalent only; historical shared planning and preflight controls are outside this defined subtotal. Actual incremental billing remains unobserved.

Saved [budget-after](../../benchmark-runs/d051-jev-01/budget-after.json):323601charged input tokens,0reserved,0pending,60settled events,9676399remaining under the cumulative10000000-input-token limit. D051 Jev used56809inputtokens (`323601-266792`). Earlier r57 refund reconciliation is separately supported by account/UI evidence and did not invent missing model usage.

Remaining work: concrete repair-target evidence before dispatch, stop/accept behavior when source is not inspected and smoke is incomplete, ownership of cross-task defects, the two Claude correctness failures, and another independently successful matched replicate before efficiency claims. This report does not initiate another API call. Root owns repository-wide tests and final state/worklog updates.

Both independent grader containers were removed, and logs/candidates remain preserved. No evaluator paid calls, ledger edits, commit or push. [D051 decision record](../decisions/D051.md).
