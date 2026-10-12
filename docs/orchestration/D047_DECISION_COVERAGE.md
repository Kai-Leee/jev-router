# D047 — Whole-workflow efficiency and decision coverage audit

2026-10-10. User clarifies that current Jev input volume is acceptable. The objective is whole-task efficiency; reducing Jev input is not the primary optimization target. This corrects the earlier D046 next-step emphasis on shrinking duplicated candidate plans. Preserve sufficient context for useful decisions. Measure verified completion, end-to-end time including recovery/verification, quality and total resource use; input length is a diagnostic and service-limit concern, not success by itself. This clarification does not remove the existing cumulative input budget.

## Verified active scope

Audit target is the D046 numeric pilot, not every historical experiment. AST queries with `sg run --lang javascript --pattern 'router.run($$$ARGS)' scripts/tree-e2e-pilot.mjs` and `decideWithBudget($$$ARGS)` identify the one initial checkpoint call and alternate routing branches. Read actual D046 events and request keys; snapshot in benchmark-runs/d047-coverage-audit.json.

D046 has exactly1 checkpoint_decision_requested,1 Jev inference_started and0 further Jev inference_started events after worker_failed. Its only question is task_count. Selected2 directly dispatches the chosen plan; confidence0.53 is recorded without an approval roundtrip. Once dispatched, work proceeds under fixed code and Claude generation until completion or failure.

| Intended responsibility | Active D046 behavior | Evidence/coverage |
|---|---|---|
| Initial task count1..5 | Jev picks among supplied count candidates | live1 decision; frozen4-task plan offers1..4 |
| Role/task boundaries | Original Claude plan; deterministic contiguous grouping | task-count.mjs; Jev chooses count, not arbitrary alternative role boundaries |
| Model and effort | Fixed claude-opus-5-5/medium; other values rejected | tree-e2e-pilot.mjs config guard |
| Next ready task and priority | Dependency filter and first maxConcurrency entries | live-file-workers.mjs scheduler; no semantic Jev priority |
| Recursive decomposition | No recursive decision call | selected groups execute as leaves |
| Mid-worker progress/intervention | Raw stream saved, no semantic checkpoint | call waits for terminal result; CLI internal continuation proceeds independently |
| Failure diagnosis/recovery owner | WORKER_FAILED recorded; stop | zero postfailure Jev calls; failure_observed deferred |
| Requirements and next verification | File schema checks; separate evaluator if candidate exists | no requirement evidence decision in active pilot |
| Learned evidence/rule update | Not wired into subsequent pilot request | D046 state lacks D044 executionEvidence and failure summaries |

The checkpoint registry explicitly defers ready_set_changed, failure_observed and requirement_evidence_changed. document-router.mjs defines task/worker/failure/requirement question/dispatch contracts but declares simulationOnly and does not itself call models. document-contracts.createWorkerTask only permits simulation/fixture-only profiles. These are reusable building blocks, not proof of live lifecycle integration.

There is a separate historical agent-rule-pilot.mjs using measured Jev decisions for rule creation/update plus Claude evidence extraction. It is not imported or invoked by D046. Therefore do not claim those roles were never prototyped anywhere; they are not integrated into this active coding loop. Separate Opus monitor runs after termination and does not control ongoing execution.

## Material gaps found

1. We implemented an initial count selector, not the originally intended repeated decision offload across the whole task. A successful dispatch is not whole-workflow decision coverage.
2. D044 sent explicit D042 failure evidence, but D046 rebuilds state from brief/plan/model/concurrency and candidatePlans without carrying that evidence forward. This is a concrete cross-run evidence propagation gap. We cannot claim it caused the choice2 or infer what Jev would have selected if supplied.
3. Count coarsening can preserve or reduce dependency width; it cannot invent independent boundaries. More groups need not mean useful concurrency.
4. Output parsing and runtime failures are deterministic controller problems. Fixing them should not require asking Jev to rediscover a known error. Jev should choose among verified recovery/dispatch alternatives where there is a real tradeoff.
5. Claude output token count, including recorded thinking tokens, does not label which tokens were management decisions versus implementation reasoning. Do not assume all of it can be offloaded or saved.

## Proposed integration sequence — not yet implemented

- Establish an evidence snapshot shared across checkpoints: original objective, requirements, task tree, current results, failed attempts, precise errors, ownership, verified executor capabilities and unresolved assumptions. Preserve raw source references and revisions.
- Separate mechanical readiness checks from semantic decisions. Budget/auth/parse/schema/test status is checked in code. Known failures populate evidence without another model call.
- Wire failure_observed to choose documented recovery alternatives and owner; execute only validated handlers. Ambiguous or uncertain billing must not trigger blind replay.
- At task completion or changed ready set, ask next action only where several meaningful alternatives exist: continue, redivide1..5, repair an unmet requirement, or delegate a task. Dependency eligibility remains mechanical.
- Connect model/effort and rule-update decisions separately, using existing contracts but actual enabled adapters. Keep independent evaluation authoritative; Jev's requirement judgment cannot certify tests passed.
- Measure eliminated Claude management calls, added Jev latency, recovery success, end-to-end verified completion time and total cost, including failures. Do not reward fewer tokens when completion gets worse.

Current audit changes documentation only plus a private computed evidence snapshot. No runtime routing edits, new inference, new container, commit or push. D042/D046 artifact failure remains unresolved. Historical result files remain unchanged.
