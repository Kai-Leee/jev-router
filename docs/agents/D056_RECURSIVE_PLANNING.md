# D056 — recursive task/test planning implementation roles

User authorization: proceed with D055's Jev-guided recursive decomposition into separate task and test lists. Implement and verify the planning loop, then exercise actual Jev planning under the existing cumulative token ledger. This is planning only; executable product generation and an end-to-end efficiency claim are separate stages.

Goal: useful, source-preserving leaf tasks and linked public test specifications; no duplicate parent execution, lost requirements, artificial readiness or blind paid retries.

Roles and ownership:
- Engine builder: `src/orchestration/recursive-task-tests.mjs`, `test/recursive-task-tests.test.mjs`; bounded typed-choice recursion, leaf/test assembly, structural validators.
- Fixture owner: `benchmarks/e2e-swe/manifests/d056-obligations.json`, `scripts/build-d056-obligations.mjs`, `test/d056-obligations.test.mjs`, `docs/orchestration/D056_INPUTS.md`; public source extraction and source-backed test specifications, no hidden tests or prebuilt task groups.
- Client diagnostics owner: `src/client.mjs`, diagnostic fields in `src/benchmark/telemetry.mjs`, targeted client/telemetry tests; preserve safe error classification without exposing secrets or arbitrary reflected upstream text. No paid requests.
- Independent reviewer: review engine/fixture/runtime interactions and add only `test/d056-review.test.mjs` and `docs/agents/D056_REVIEW.md`. No paid requests.
- Root: question v2 contract, CLI runner, experiment limits/manifest, live connection checks and sole paid planning executor, evidence/records/state/report.

Shared proposed input contract (agree changes with root before editing):
`{schema_version, goal, source:{path,sha256}, obligations:[{id,requirement_id,text,source_ref:{path,start_line,end_line},inputs,outputs,write_scope:[paths],depends_on:[obligation_ids],gaps:[]}], tests:[{id,requirement_refs:[obligation_ids],scenario,input,expected,scope:'unit'|'integration'|'e2e',runner_ref:null,status:'not_run'}], constraints:[strings], interfaces:[strings], provenance:{...}}`.

Text and expected behavior must be traceable to the public instruction. Heading and example context can accompany a source segment, but no assigned groups, owners or hidden evaluation answers. Unknown interfaces/dependencies remain gaps or disclosed unasserted facts, never invented independence. Test lists are specifications; `runner_ref:null` is not executable verification.

Engine API: `runRecursivePlanning({input,decide,record=async()=>{},limits,contract})` -> `{status,tasks,tests,metrics,issues}`. `decide({stage,node_id,state,questions})` returns systemone-style `{answers:{key:{type:'choice',choice}}}`. Export input/plan validators. `tasks` include stable node id, parent_id, obligation IDs/refs, goal, inputs/outputs, dependency/write-scope/test links, state and execution eligibility. Split parents aggregate only. Leaves remain test-spec-only until real runners exist; never mark product complete.

Limits are experimental safety bounds, not optimum granularity. Stop with explicit partial plan if any is hit, without converting unreviewed work to ready. Every split must be a nonempty disjoint strict partition. Leaf count limit differs from fanout1..5 and max concurrency. Per-node prompts contain necessary local source/test/interface facts, not full ancestor source copies. Preserve all public obligations even if the model chooses a broad leaf.

Before live inference: negative cases for lost obligation, empty/no-progress split, invalid choice, parent/child duplicate execution, cycles, shared-file writes, invalid test mapping, planning limits, unresolved gaps and failure checkpoints. Freeze source versions and log exact requests/responses. No changes to original Personal OS, prior frozen run artifacts, commits or pushes.

Handoff: each role writes findings and unfinished points to its owned report/test artifacts and returns exact commands and results. Root keeps D055 direction and D056 measurement boundaries visible across compaction.
