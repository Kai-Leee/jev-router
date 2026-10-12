# D066 planner — objective, rules and integration contract

2026-10-11 Asia/Seoul. Owner: `d064_adapter`. This additive role owns only the new adaptive planner, its English question contract, focused tests and this record. No provider calls, historical D065 edits, hidden grader inputs, original product edits or recursive delegation.

## Objective and evidence boundary

D065 chose owners for 16 predeclared files and did not measure free recursive splitting, relationship decisions or automatic repair. D066 must expose a different executable mechanism: an ungrouped, freshly prepared catalog of source-backed implementation units; recursive keep/count and membership choices; explicit relationships among the resulting leaves; and a bounded typed repair choice connected by the execution owner to a fresh attempt. Four arms differ only in the injected engine for split, relations and repair. No efficiency or product success is established by this local implementation.

## Agreed shared API

`prepareAdaptiveCatalog({source, requirement_ids, requirement_descriptions, limits})` returns `{prompt,schema,source_sha256}` without calling a provider. `source` is the exact original public source string. Optional `requirement_descriptions` is a complete public mapping `[{id,text,source_refs:[...]}]`, sanitized by runner to exclude historical file boundaries and failures.

`validateAdaptiveCatalog({catalog, source, requirement_ids, limits})` validates a closed JSON catalog against that source string and complete requirement ID set. Catalog preparation is one shared, measured external step owned by root/runner. It contains units, artifact paths and public interface descriptions, with exact source quotes as evidence; it contains no worker groups, task tree, executable commands, predetermined DAG or D065 file architecture. Identical catalog bytes are used by all arms. The exact catalog shape is:

```js
{
  schema_version: 'adaptive-catalog/v1',
  source_sha256,
  evidence: [{id, quote}],
  units: [{id, title, requirement_ids, artifact_ids, interface, evidence_ids}],
  artifacts: [{id, paths, description, evidence_ids}],
}
```

Every source quote must occur exactly in the original string. The validator proves syntactic provenance/ownership/conservation, not semantic adequacy of a generated interface. Paths are exact files using the retained transport's ASCII character grammar, at most 1024 characters, with no spaces, Unicode, reserved `.env`/`.git`/`.claude`/`.codex` segments, aliases, case-fold collisions or ancestor overlap. The catalog additionally excludes `.agents` and `.benchmarks` segments. Every artifact has one unit owner; every unit owns at least one artifact. Requirement ownership is exclusive and complete.

`planAdaptiveDag({catalog, source, requirement_ids, requirement_descriptions, checks, profile_id, goal_revision, limits, max_concurrency:2, decide, record, commit})` calls `decide(request, {stage, decision_id})` with the existing `prepareDecision` wire shape `{model:'jev-latest',state,questions}`. Stages are `split`, `relations` and, for the separate repair helper, `repair`. The normalized response is `{answers:{[questionId]:{type:'choice',choice}}}`. Provider receipts remain with the runner. Fixed English question text comes from [adaptive-dag.v1.json](../orchestration/contracts/adaptive-dag.v1.json).

Successful planning returns `{status:'planned',dispatch_allowed,plan,artifactBindings,leaves,tree,relations,decisions,stats,catalog,catalog_sha256,source_sha256,requirement_descriptions,execution_context}`. `plan` is a validated `artifact-dag/v1` plan; `artifactBindings` is `{[artifactId]:{paths:[...]}}`; leaves retain their unit IDs and interface descriptions for worker context. Tree parentage is separate from the executable leaf-only task list. A single `verify-public` node consumes every artifact and owns all integration checks. Caller-provided checks are trusted versioned definitions. Every nonintegration check must fit one catalog unit, so arbitrary partitioning cannot change check scope; all requirements/artifacts require check coverage before the first decision. Integration checks remain unchanged. The planner never synthesizes a checker command.

The optional `commit(snapshot,{graph_revision,catalog_sha256})` finishes before a dispatchable result is returned. Without it the returned plan is explicitly in-memory and `dispatch_allowed:false`. Commit rejection returns no executable plan. Unknown commit outcomes stop as uncertain. The catalog hash is explicitly over `JSON.stringify(validated_catalog)`; the runner separately retains the raw shared catalog bytes/hash.

`chooseAdaptiveRepair({source, planning, failure, candidates, limits, decide, record})` selects only an explicit trusted candidate `{id,task_ids,reason,evidence_refs}` or stop. Successful selection returns `{status:'selected',candidate_id,candidate,decision,stats,action:'fresh_repair_scope_selected',dispatch_allowed:false}`. It authorizes no execution itself. Limits here are `{max_repair_attempts:2,repair_attempts_used}`; the runner maintains the aggregate provider-call/input limits across planning and repair. Failure must explicitly have `status:'failed',outcome_uncertain:false`. Unknown outcomes or exhausted rounds stop before a provider call.

Execution owns exact candidate construction, attempt identity, fresh workspace/revision, public-only failure content and actual repair dispatch. The selected task IDs are not expanded. Per the final root/execution agreement, owner-only is distinct from owners plus consumers: unselected consumer bytes can be carried into a fresh stage with current input revisions, but old certificates are not reused and all local/public checks must rerun. The fixed repair question states that behavior. Earlier proposed mandatory consumer closure was removed before integration; identical scope candidates are deduplicated by execution.

## Recursive and relation grammar

- Root must split into 2..30 nonempty children within the declared global leaf/node/depth/call limits. A nonroot node may keep its scope or split again. Singleton or bound-exhausted keep is a local deterministic transition, explicitly recorded.
- After choosing count, each source unit is assigned exactly once to a child. Choices preserve enough remaining units to fill every empty child. Canonical child numbering removes only equivalent label permutations; it does not pre-group units. Each real split strictly reduces child scope and preserves the exact parent unit set.
- The final implementation jobs are the leaves, with one worker per leaf. Unit count, tree node count and logical worker count are separate. All root and recursive membership decisions are retained.
- Every unordered final leaf pair receives an explicit relation decision: A requires B, B requires A, no artifact dependency, or unresolved. Each direction binds all the producer's declared artifacts and exact file paths. Directions that conflict with previously accepted edges are excluded. Up to 32 pair questions share a request; their combined selected edges are validated atomically. A cycle or unresolved answer stops the batch before any of its edges are applied or committed. No partial acceptance, fallback or retry occurs.
- All artifact paths have one catalog unit owner. Requirement IDs are conserved exactly once across units/leaves. No completed runtime revisions are edited by planning. Planning finishes and the caller commits its snapshot before implementation dispatch.
- No automatic retry after provider invocation. Confirmed returned malformed choices are known blocked results with `response_received:true`; explicit provider uncertainty and unclassified thrown errors are uncertain. This preserves the difference between an invalid decision and an unknown paid-request outcome. One offered choice is resolved locally without claiming a provider call.

Every split/membership/relation state carries `execution_context`: selected profile ID, actual concurrency, one fresh implementation session per leaf, no session reuse, no per-file call, multi-file leaves allowed and the root minimum of two. Choices can therefore account for the experiment's two simultaneous execution slots.

Provider state uses exact relevant catalog units, artifact interfaces and their materialized verbatim source quotes, relevant public requirement descriptions, accepted graph state and the full source/catalog hashes. The original source stays pinned and remains available to workers. This deterministic projection never rewrites or truncates the selected text. Claude and Jev receive the same prepared body.

## Declared limits and validation

Root accepted these exact limits before paid preparation: `max_units:30,max_artifacts:60,max_files:60,max_leaves:30,max_depth:3,max_nodes:59,max_relation_pairs:435,max_decisions:128,relation_batch_size:32,max_request_bytes:240000`. Root is depth 0; nodes at depth 3 keep locally. These are explicit bounds on free worker partition within a fresh catalog, not free-text architecture generation or an unrestricted decomposition claim. Candidate choice limits are computed before asking; an oversized supplied catalog/request is rejected without trimming.

`stats.provider_calls` counts callback requests, `provider_questions` counts their questions, and `local_questions` counts forced transitions. Repair returns separate stats; runner aggregates actual provider receipts across stages. At most 90 split callbacks plus 14 relation batches plus 2 repair callbacks fit the conservative 106-request bound under this geometry; this is not a token-fit guarantee. Runner separately owns the declared input ledger and 700k Jev-input cap per Jev arm. Preparation time/usage/cost is recorded once and reported as shared/full plus amortized, without inventing missing usage or cost.

Implementation: [adaptive-dag-planner.mjs](../../src/orchestration/adaptive-dag-planner.mjs). Focused command: `node --test test/adaptive-dag-planner.test.mjs`. Result: **5/5 passed**, 0 failed/skipped, 526.179459 ms. The witnesses cover recursive membership changing leaf jobs; multi-file ownership; actual relation inputs/read scopes and callback workflow order; source/check/conservation faults before decisions; all 435 pairs in 14 batches; combined cycle/unknown rejection before commit; known-invalid versus uncertain outcomes; request/call/commit stops; and exact owner-only repair scope with immutable prior plan. Callback workflow completion is not filesystem/provider/product completion.

The independent reviewer also exercised 30-unit depth-3 recursion (8 leaves, 90 split plus 1 relation callback), the 30-leaf/435-pair batching boundary, exact relation bindings and atomic cycle/unknown rejection. Its evidence is owned at `benchmark-runs/d066-review/planner-witness.json`; that independent run used the source hash recorded there, before the subsequent clarified malformed-answer and repair-scope changes. No model calls were made.

Current handoff: API ready for runner/execution integration; five focused tests pass. Root owns the full regression, final shared snapshot and live launch. Historical files, tests, ledger and D065 evidence remain unchanged by this role. No provider, container, hidden grader, commit or push was invoked.

## Independent path compatibility correction

The reviewer reproduced a preflight gap: the initial catalog accepted `package/café.py`, `package/my module.py` and `.env`, while the retained `createArtifactSession` rejected them as `INVALID_ARTIFACT_CONFIG`. The before evidence is `benchmark-runs/d066-review/path-compatibility-before.json`. This was a real integration defect; successful prior catalog fixtures did not cover the worker transport grammar.

The additive validator, generated catalog JSON schema and preparation instructions now enforce the retained ASCII/length/reserved-segment boundary without changing shared transport. The existing catalog fault witness was extended to invoke the actual retained transport on the three reproductions, a nested `.env` path and a 1025-character path, plus a valid-path control. The root also requested self-contained directional choices: every offered relation direction now names its actual consumer, producer, producer artifact IDs and exact paths, and states that producer checks finish before consumption. Opposite choices have distinct descriptions.

One focused rerun after both corrections: **5/5 passed**, 0 failed/skipped, **288.839958 ms**. Current source hashes: planner `395db3bad6e4b8ef3038c2e5ea57596999a2ecbd2ffbea3bf50f079e0334e578`; question contract `f404bb421cd93f6160be5e99cc075b2ce0a04761086332afb6cc6f89cab3f16b`; focused test `ec8ca20cd989b546bda5b783b2cc57734837c5716550b306988675bf7bbf8ee5`. Reviewer and runner received the updated hashes. API shapes are unchanged. No paid calls.

Independent recheck passed against these hashes: the original Unicode/space/`.env` cases now reject at catalog validation, `src/client.py` is accepted by both catalog and actual transport, and the emitted schema rejects the incident strings and enforces the 1024 limit. Evidence: `benchmark-runs/d066-review/path-compatibility-after.json`. The reviewer marked R1 corrected with no additional planner blocker. Owned source/contract/tests are frozen at the hashes above.
