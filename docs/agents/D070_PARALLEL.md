# D070 — balanced Jev decomposition and real preserved-candidate repair

2026-10-11. User authorized analysis of n9 concentration, changes so Jev makes finer useful parallel partitions, parallel actual repair of the previous failed candidate, and fresh completion/time/token/cost comparison. The explicit goal is lower completion time AND lower price-equivalent cost than the successful historical Claude-only condition while preserving public85/85 and independent63/63. A forced partition, smaller payload or API success alone is not the goal.

## Conditions and evidence

Keep the OpenAPI Python client generator public specification, checked catalog, Opus5.5 medium workers and original checks. Primary new development retains two execution slots to avoid claiming a worker-count change as a routing gain; maximum logical workers30, two public repair rounds, inherited unlimited spending token caps, original ledger identity/history and no automatic uncertain POST replay. If runtime evidence requires changing this, record a new condition before using it. The separate preserved-candidate repair may run alongside development and its measured contention is reported.

Use new D070 output directories. Never alter D067/D068/D069 candidates, raw requests, outcomes, snapshots, analyses or frozen experiment docs. Source-before snapshot is in `benchmark-runs/d070-preflight/source-before.json`. No hidden grader details or oracle code enter analysis for implementation, model decisions, or workers. Original public requirements and checks must not be relaxed. Preserve failed attempts and unknown costs.

## Roles and owned files

| Role / agent | Owned writes | Required output |
|---|---|---|
| Decomposition / d067_runner | `src/orchestration/adaptive-dag-planner.mjs`, new focused balancing module/contract and tests, `D070_DECOMPOSITION.md` | Trace actual n9 selections, legal split/assignment options and stopping limits; propose then implement workload-aware Jev decisions with useful independent groups and precise conservation. Keep legacy contract v1 behavior by explicit opt-in. Coordinate interface before editing. |
| Real repair / d067_budget | New `src/benchmark/preserved-artifact-repair-runner.mjs` and CLI/tests as needed; `adaptive-dag-execution.mjs` only if necessary after notification; `D070_REPAIR.md` | Fresh copied D068 failure, current evidence bindings, actual new Jev choice and selected Claude worker, inherited-byte proof, unchanged public suite, export for independent grading. Prepare runner offline; root owns actual paid/Docker launch. |
| Measurement / d068_failure | New `benchmark-runs/d070-analysis-tools/` helper and `D070_MEASUREMENT.md` | Read-only baseline/bottleneck decomposition, new development versus separate repair accounting, wall/overlap/actual calls/cache/rates/unknowns; no edits to old analysis or production. |
| Independent review / d067_review | `D070_REVIEW.md` and new private D070 audits | Preserve old evidence inventory, independently inspect decomposition/repair integration, meaningful targeted counterexamples, prelaunch and postrun raw review. Never weaken checks. |
| Single skill maintainer / d067_skills | `D070_SKILLS.md`, maintenance backlog, existing record reference only if needed | Capture reusable scope/efficiency/repair evidence rules without duplicating skills or installing globally. |
| Root | `src/benchmark/adaptive-dag-runner.mjs`, main runner tests/manifest/CLI integration, D070 protocol/decision/state/results | Integrate and freeze; execute provider/Docker/ledger actions, grading and separate numeric-only Opus monitor; final comparison and limitations. |

Each agent reads this contract and applicable AGENTS/skills, writes its role note before substantial changes, sends proposed interfaces early and stops edits to integrated sources before real runs. Changes outside owned files require coordination. No duplicate file writers. Give a handoff file if context becomes insufficient. Root updates state at each boundary.

Root alone performs authenticated provider calls, real ledger writes, Docker and grading. Agents may inspect public source and prior public evidence; no keys. No extra automatic paid loops, commit/push, global installation, unrelated cleanup or Personal OS/Vault changes.
