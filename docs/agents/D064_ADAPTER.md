# D064 P1 — DAG decision adapter

2026-10-10. Owner: `d064_adapter`. Status: local implementation and focused offline verification complete; root integration and independent review remain separate gates.

Scope follows [D064 roles](D064_PARALLEL.md), [D063 plan](../orchestration/D063_DAG_PLAN.md), and the fixed English questions in [ARCHITECTURE §4.2](../orchestration/jev-dag-design/ARCHITECTURE.md#42-고정-영어-질문과-선택값--처리-함수). The repository [decision-records skill](../../skills/jev-decision-records/SKILL.md) was applied to separate implemented local behavior from proposed semantic handlers and unmeasured benefits.

## Owned files

- [dag-routing.v1.json](../orchestration/contracts/dag-routing.v1.json): five fixed questions, registered choice-to-handler mappings, local singleton/no retry/maximum30 policy.
- [dag-decision-adapter.mjs](../../src/orchestration/dag-decision-adapter.mjs): separate opt-in loader, typed choice adapter, bounded exact owner allocator.
- [dag-decision-adapter.test.mjs](../../test/dag-decision-adapter.test.mjs): 19 offline tests, including 2,916 exhaustive small allocation fixtures and a 30-owner/80-bundle fixture.
- This status document.

No historical question/loader/runner, budget ledger, product source, shared status index, or other role's implementation was changed by this role.

## Interface and implemented behavior

`loadDagRoutingContract()` synchronously loads the new JSON contract and returns its `kinds`, policy, version and `source:{path,version,sha256}`. SHA-256 identifies raw contract bytes. The original five English question strings are copied exactly from §4.2 and tested against that source. Existing `document-contracts.mjs` remains the loader for historical paths.

`makeDagDecision({kind,state,criteria,decide,record})` accepts either the short kind or full `dag.<kind>.v1` ID. Candidate keys must match that kind's registered fixed keys or dynamic prefix. With zero candidates it returns `status:'blocked',reason:'no_candidates'`. A single candidate is selected locally, with `selection_method:'local_singleton'`, no fabricated request/response and no model callback. Two or more candidates are validated using the existing `prepareDecision` before calling `decide` once.

The callback receives the actual wire shape:

```js
{
  model: 'jev-latest',
  state: {input: originalState, decision_kind: 'owner', contract_source: source},
  questions: {'dag.owner.v1': {type: 'choice', instructions: fixedEnglish, criteria}}
}
```

Its answer is `answers[question_id]:{type:'choice',choice:<offered key>}`; native confidence/probabilities, when supplied, are validated without establishing a routing threshold. Extra/missing answers, unsupported answer fields, unknown choices, failed status, explicit error and uncertain outcomes are rejected. The raw JSON response and request are attached to rejection errors and recorded. Callback exceptions stop without retries; absent certainty metadata defaults to `outcome_uncertain:true` after invocation. Explicit `outcome_uncertain:false`, `outcomeUncertain:false`, or `uncertain:false` from a trusted callback marks a known failure separately. `response_received` distinguishes returned data from thrown invocation failures. Error prose is not copied into event logs.

Generic choices return only `status:'proposed'` and `handler:{id,status:'proposed',executable:false}`. They do not expand tasks, alter dependency edges, bind a live model or repair a product. A split `keep_scope` proposal requires `state.split_policy:{scope:'leaf',allow_keep_scope:true}`; this cannot silently restore the excluded root count1 option.

`allocateDagOwners({bundles,owners,decide,record,maxSearchNodes})` validates unique bundle/owner/obligation IDs, eligibility references, integer capacities/minimum final loads and at most30 owners. Bundle count is independent of that worker bound. Inputs and callback arguments are cloned; JSON values that would be silently discarded or changed are rejected.

For each bundle in input order, the allocator tentatively reserves each eligible fitting owner and runs exact residual packing with all remaining bundles, eligible owners and minimum final loads. Iterative DFS deduplicates equal residual states and only merges owner branches with equal capacity, minimum, load and all future eligibility. A complete residual assignment is independently checked before being accepted as a witness. Total remaining capacity alone is never a feasibility proof.

The default search limit is50,000 visited states **per candidate**, configurable by `maxSearchNodes`. Search exhaustion remains `feasibility_unknown`; it never becomes infeasible or valid. Every candidate status, witness and excluded-unknown count is retained in result decisions and candidate events. The request contains candidate status/witness hash while full exact witnesses remain in local evidence; original bundle inputs appear once in the request. This is explicit derived-state projection, not a claim that the remote model can read local evidence files.

Only proven feasible owners are offered. A sole feasible owner is locally selected even if other candidates remain unknown, with those exclusions retained. No feasible owner returns `status:'blocked'`; the reason distinguishes unknown feasibility from proven absence of a feasible owner. `revise_boundary` is not padded into allocator choices because this module has no executable boundary revision operation. Semantic interface/dependency assessment remains outside packing validity.

Each accepted answer reserves the whole indivisible bundle before the next decision is built. The next request sees current owner loads, earlier assignments and the incremented reservation revision. There is no response trimming, invented remainder, reallocation fallback or retry. Successful results return `status:'completed'`, assignments, final loads, all decision evidence and an exact whole-allocation witness. Failures attach `partial_allocation` and current feasibility evidence. These are **in-memory ownership reservations only**; no worker is dispatched and no persistent/exactly-once recovery claim is made.

## Actual verification

Commands executed from the repository root with no model/network calls:

```sh
node --test test/dag-decision-adapter.test.mjs
node --test test/dag-decision-adapter.test.mjs test/document-contracts.test.mjs test/document-router.test.mjs test/decision-payload.test.mjs test/sequential-allocation-v3.test.mjs
git diff --check -- docs/orchestration/contracts/dag-routing.v1.json src/orchestration/dag-decision-adapter.mjs test/dag-decision-adapter.test.mjs docs/agents/D064_ADAPTER.md
```

- Focused adapter run:19/19 passed,0 failed/skipped,2,320.967458ms test-process duration.
- Related regression run:60/60 passed,0 failed/skipped,2,229.760166ms test-process duration. This includes existing document loading/router, wire payload and historical v3 allocator tests.
- Exact-vs-independent enumeration:2,916 two-owner/two-bundle cases varying sizes, eligibility, capacities and minimum loads; offered first-owner sets and completion/blocking agree with terminal-only brute-force enumeration.
- Packing counterexample `[3,3]`/`[2,2,2]` blocks with zero callbacks. A locally fitting but globally impossible candidate is excluded on capacities `[3,4]` and bundles `[2,3,2]`; all three remaining choices are local singletons.
- 30 owners/80 bundles complete, with every offered residual witness independently replayed and whole-allocation coverage checked. This is a synthetic algorithm/wire validation, not a live Jev result or runtime speed improvement.
- Failed/uncertain/unclassified callbacks, malformed responses, unknown choices, oversized/non-JSON input, search exhaustion, reservation sequencing, caller mutation and no silent trimming are covered.

## Remaining boundaries and next action

Root owns integration, shared decision/index updates and the full repository regression. An independent reviewer should inspect candidate-proof boundaries and rejected/uncertain-response preservation before operational use. Live semantic quality, response distribution, total planning cost, product checks, worker/profile availability and end-to-end efficiency remain unmeasured. No Jev/Claude call, budget mutation, commit or push occurred in this role.
