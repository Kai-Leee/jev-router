# D046 — Live numeric task-count run

2026-10-10. User explicitly requests execution of implemented numeric routing. Run one new OpenAPI trial with the D040 frozen plan, candidate counts1..4, Opus5.5medium, projected inputs and max concurrency2. Jev choice goes directly to selected plan; confidence is recorded, not a gate. Shared cumulative10M-input ledger preserved. D042 artifact output failure remains known and unrepaired. This run tests the selected execution as implemented; no uncertain historical request is replayed. Existing30min phase limit remains; no10min per-call cap.

Command: `node scripts/tree-e2e-pilot.mjs benchmark-runs/d046-count-config.json benchmark-runs/d046-count-01 --spend --routing-mode auto --decision-basis count --plan-source benchmark-runs/d040-claude-01/frozen-plan.json --concurrency 2`.

Source hashes pinned in benchmark-runs/d046-protocol.json. No new planner call. If candidate files complete, freeze and independently grade using the existing pinned OpenAPI evaluator. Otherwise preserve provider receipts and report failed/ungraded, not a numeric model score. No success or cost-reduction claim before measurement. Current status: prepared.

## Terminal result

The command exited1 with run status failed. Jev selected task_count2, confidence0.53; probabilities1:0.07,2:0.65,3:0.20,4:0.08. Requested jev-latest returned jev-1.13.0. HTTP200/1,532ms; measured decider1,534ms; checkpoint2,425.819ms. These timing boundaries are different. One POST settled input31,738/output46 tokens; no automatic retry.

The selected plan contains two groups of8 files. Group2 depends on group1, so this is a serial decomposition, not two parallel workers. Group1 CLI completed after1,234.871seconds with provider exit0, interrupted null, outcome_uncertain false. Stream has2 assistant message IDs and1 CLI continuation user event. Final JSON parse failed at first character. No candidate files were materialized; group2 never started. Whole run1,237.434seconds (20min37.434sec). This is not a timeout. One CLI invocation is not a claim of one underlying model turn.

Claude final usage: ordinary input6, cache creation143,766, cache read15,701, output152,457 tokens; output details include111,448 thinking tokens, already a subset of output and not added again. API-equivalent cost4.2024322USD; actual subscription incremental charge unknown. Jev informational input valuation at0.6USD/M is0.0190428USD, also not verified billing. Combined comparison valuation4.221475USD excludes monitoring and historical planner. There is no successful-task efficiency comparison.

Serialized Jev request122,479 UTF-8 bytes (Python compact JSON, ensure_ascii=False), of which candidatePlans79,852 bytes; original plan20,026 bytes. Bytes are not tokens. Numeric choice construction avoids another planner call but duplicated candidate content increases input size. No token savings claimed.

Shared ledger charged139,322 of10M input tokens, remaining9,860,678, settled52, pending null, blocked null. Delta31,738 matches response. Preserve all prior runs. The complete candidate does not exist, so independent grade was not run and no zero score assigned. Evaluator preflight verified8 pinned files at upstream b11ac067b1dfe8ce8b6db245d88756f426007797 with model_calls0.

Reproduce summary: `python3 scripts/summarize-count-run.py benchmark-runs/d046-count-01 benchmark-runs/d046-protocol.json benchmark-runs/d046-analysis.json`. Source hashes are checked; receipts and final JSON parsing are reconciled without executing generated code. Final analysis explicitly labels grading not_run_no_candidate.

Next work: fix bounded artifact transport/continuation handling before another implementation run, reduce repeated candidate plan content while retaining role/dependency information, and compare valid end-to-end outputs. Numeric routing itself dispatched correctly, but successful software generation remains unverified. No retries or repair calls were added to this trial. Private input/output logs and uncommitted changes remain; no new grader container, commit, push or Personal OS edit.

Separate Opus5.5 monitor completed after terminal result: benchmark-runs/d046-monitor/result.json, API-equivalent0.048044USD excluded from implementation. It confirmed runtime failure and absent grading. Its compact packet did not include group dependency details; main independently verified group2 depends on group1 in selected-plan-split.json and that only group1 has claude_started, so group2 was not dispatched. Monitor report does not override these direct records.
