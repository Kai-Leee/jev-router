# D070 — useful, workload-aware Jev decomposition

2026-10-11. Owner: `d067_runner`. Read `D070_PARALLEL.md` and `D070_EXPERIMENT.md` before implementation. This role owns the planner, a new opt-in balancing module/contract and focused tests. Root owns runner/manifest integration and every provider, Docker, grading and real-ledger action. Historical D067–D069 candidates, requests and outcomes remain immutable.

## Goal and current hypothesis

Analyze why D069 n9 accumulated 13 artifacts / 16 write paths / 50 requirements, then expose useful independent partition choices and their workload/wait tradeoffs to Jev. The goal is faster complete public85/85 plus independent63/63 with lower equivalent cost; a smaller leaf or more workers alone is not improvement. Keep the exact source-backed catalog, Opus medium, two execution slots, maximum30 workers and original checks.

The initial hypothesis is that sequential assignment plus interface-coupling guidance allows a large final group and `keep` without an explicit workload or downstream-wait view. Verify the actual trace, legal alternatives, node/depth/leaf/relation limits and catalog unit sizes before calling this the cause. Dependency costs derived from catalog text are only transparent structural signals, not known runtime edges or measured durations.

## Proposed interface and work order

Proposed planner option: `decompositionPolicy: 'balanced-v2'` (omitted keeps v1 exactly). A separate versioned contract supplies only v2 split/membership guidance; relation and repair semantics remain unchanged. A pure module builds workload summaries and feasible capacity-aware assignment options from the existing catalog and frontier. No model text creates shell commands or arbitrary writes. Jev's offered choice still selects count and membership; any capacity restriction is explicit in state and evidence rather than a hidden regrouping.

1. Record actual n9 decision ancestry and stopping condition, all legal split/membership alternatives, unit/requirement/file distribution and measured successor inputs.
2. Agree the option/API, capacity behavior, bounded structural workload signals and conservation rules with root before planner edits.
3. Implement opt-in only; preserve units, requirements, artifact ownership, public checks, model/effort and two slots.
4. Verify a concentrated-choice counterexample, capacity feasibility, exact source/ownership preservation and v1 compatibility. Replay old public planning inputs offline into new state/criteria without provider calls.
5. Freeze sources, record tests/hashes/limitations and hand off to root. Byte/workload proxies are not model tokens or runtime speed claims.

## Actual D069 concentration and stopping cause

Read only `benchmark-runs/d069-comparison-01/jev_all/planning.json`, `events.jsonl` and `public-input.json`; source hashes are recorded in `benchmark-runs/d070-decomposition-preview-01/receipt.json`.

- Jev chose `split_4` at n0, n1 and n5. Actual child sizes were **21→[18,1,1,1]**, **18→[15,1,1,1]**, **15→[12,1,1,1]**. The sequential membership algorithm offered alternatives but only enforced nonempty groups and equivalent empty-label canonicalization. It had no workload capacity constraint.
- n9 held U01–U12: **12/21 units, 50/80 requirements, 13/22 artifacts and 16/38 paths**. Its depth was3, equal to `max_depth:3`.
- **n9 did not receive a Jev split/keep call.** The depth guard removed all split counts, leaving `keep`; `createChooser` recorded `adaptive-split_count-64` as `local_singleton`. This controller stop is distinct from the earlier paid concentration choices. Neither the typed answer nor its confidence supplies an explanation of Jev's internal reason.
- The root originally offered split2…21, with additional assignment choices throughout its prefix. The same concentration repeated under source order, so merely mentioning workload in a prompt would leave the hard depth stop unresolved.
- The measured later dependency connected n3 to all13 n9 outputs plus A20/A22. Measurement agent's separate public-evidence report records n9 as dependency-free but starting sixth, 379,411.948ms after execution began. This revision keeps ready-dispatch order unchanged; new decomposition alone does not fix every queueing effect.

## Accepted v2 policy and implementation

Root accepted `decompositionPolicy:'balanced-v2'`. `src/orchestration/adaptive-decomposition-balancing.mjs` loads `docs/orchestration/contracts/adaptive-decomposition.v2.json`; only opt-in planning combines its split/membership questions with the unchanged relation/repair contract. `prepareAdaptiveCatalog()` and `loadAdaptiveDagContract()` still use v1, preserving exact catalog reuse. Omitting the option preserves legacy state/choices; unsupported values fail before a decision.

The target leaf count is `min(units,max_leaves,slots×2waves)=4`. Each terminal capacity is `max(ceil(total/4),largest atomic unit)` for units, requirements, artifacts and paths, giving **6 / 20 / 6 / 10** here. This is an **experimental operating policy based on structural counts**, not measured duration, tokens, optimal worker count or a speed prediction. The final number of leaves is not fixed at4. An indivisible large catalog unit raises its dimension's bound rather than being split or omitted.

An oversized scope cannot select `keep`. Jev chooses among the legal split counts; subsequent Jev membership decisions choose semantic groups. Each child may contain at most `ceil(parent units/selected child count)` units, with the existing nonempty feasibility rule. No multi-dimensional bin-packing arrangement is imposed. Remaining work, proposed requirement/artifact/path counts and capacity are explicit for each child. If a resulting child still exceeds a terminal dimension, a later split is required.

In this mode, depth3 is **soft only for capacity escape**. Oversized nodes can continue splitting, but original hard max30 leaves, max59 nodes, max435 relation pairs and max128 provider calls remain. When these prevent a legal split, the planner returns known `ADAPTIVE_BALANCE_CAPACITY_INFEASIBLE`, `dispatch_allowed:false`; it never silently finalizes an oversized leaf. Every new options event records the offered choices and whether a model decision is possible, separating controller constraints/local singleton transitions from actual typed choices.

Literal file/module references in the exact catalog interface text are explicit coupling hints with source field/literal and `dependency_status:'unconfirmed'`. They provide possible cross-child read/wait concerns without fabricating runtime edges, durations or a critical path. The original relation question, atomic relation batch and cycle/unknown gates still determine executable dependencies; a real invalid relationship can still stop planning. Avoiding those outcomes is not established by this offline implementation.

## Validation and complete-wire preview

`node --test test/adaptive-decomposition-balancing.test.mjs test/adaptive-dag-planner.test.mjs` passed **9/9**: seven existing planner cases and two new semantic cases. The new cases show the same greedy-first selection concentrating v1 into[7,1] while v2 conserves every unit/requirement/check and respects all terminal dimensions, including splitting beyond the configured soft depth; a hard node limit blocks instead of committing. Literal references are never automatically promoted to relations, and unknown policies make zero calls.

Four deterministic mock strategies over the exact D069 public catalog passed conservation and capacity checks. These are **offline callback witnesses**, not actual Jev choices or proof of useful parallel execution:

| Mock strategy | Final leaf units | Mock callback count | Largest complete request |
|---|---|---:|---:|
| First legal child, keep when offered | 5,3,3,3,2,2,2,1 | 35 | 122,297B |
| Split4 where possible, then keep | 3,2,2,1,1,2,2,1,1,2,2,1,1 | 35 | 127,812B |
| Split2 whenever offered | 3,3,3,2,3,2,2,2,1 | 38 | 127,891B |
| Root split21 | 21 singleton leaves | 8 | 123,991B |

The third strategy is named `recursive_two_until_atomic` in the first private receipt, but that label is broader than its actual policy-limited behavior: it chooses split2 only while offered, and below-cap scopes stop at the soft depth. Its recorded nine leaf sizes above are authoritative; it does not produce21 atomic leaves.

The old actual maximum was127,093B (`adaptive-relation-68`). The new mock maximum is127,891B, also a relation request. New split-count maximum is**63,451B** and membership maximum is**61,852B**. Their exact bodies are saved separately as `split_count.max.request.json` and `membership.max.request.json`, with hashes in `per-kind-receipt.json`; root must apply admission to these as well as the relation maxima. Byte sizes do not prove fit within a32k/64k model token limit; model input tokens and provider acceptance remain unknown here.

`max_decisions:128` counts provider **calls**, not questions. For this21-unit catalog, a conservative call bound is `N*ceil(log2 N)+floor(N/2)+ceil(N(N-1)/2/batch)=105+10+7=122`. At any chosen split the child-unit cap halves the largest scope up to rounding; total units per internal level are at mostN. A split count plus at mostN−1 membership calls is at mostN (first unit is local). Adding all possible non-atomic terminal keep calls and all210 pair questions in32-question batches deliberately overcounts. This bound is specific to the fixed catalog and v2 cap; it is not a measured call count or a universal guarantee for any30-unit catalog.

Evidence directory: `benchmark-runs/d070-decomposition-preview-01/`. Historical public-file hashes were unchanged. Model profile, effort, checks and two execution slots remain fixed. This role performed **0 provider calls, 0 Docker calls, 0 ledger writes, 0 hidden-detail reads**.

## Relation input correction before launch

Root's real admission heuristic found a legal preview branch that the byte maximum alone did not expose: `root_atomic` had123,991B total but a per-question estimate of32,116 against the configured32,000 policy. It was blocked **before POST**. This is an estimate/admission result, not actual charged/model tokens. The initial preview01 and root admission receipt remain preserved.

The balanced-v2 relation state now removes only the duplicate `leaves[].interfaces` after proving exact equality with `{unit_id,title,interface}` rebuilt from the same inline `state.units` in its original order, selected by each leaf's `unit_ids`. One inline resolution sentence supplies that rule to the model; no external/controller file is needed. Every original unit interface, requirement, source quote, artifact, pair, accepted relationship and question remains available. The controller report records old field pointers/hashes/bytes. Missing units, mismatched interface text or an existing conflicting resolution field cause known `ADAPTIVE_BALANCE_RELATION_PROJECTION_INVALID`; data is never silently shortened. Legacy v1 is unchanged.

After this correction, the focused command passed **10/10** (seven existing planner cases plus three v2 cases). The additional case proves exact inline reconstruction and rejection of missing/conflicting/colliding references while preserving original inputs and unknown metadata.

New immutable preview output is `benchmark-runs/d070-decomposition-preview-02/`. All four mock scenarios retain the same partitions and callback counts, with a maximum complete request of **114,854B**; root_atomic falls to **110,947B**. Every strategy's exact split-count, membership and relation maxima are saved separately for root's per-question admission. The split/membership maxima remain63,451B/61,852B. Root must validate the new bodies with the same admission policy; no limit was increased. Preview02 uses the accurate strategy label `split_two_when_offered`.

Status: implementation and focused validation complete; final production writes stopped pending independent review. Root owns the new actual run and any claims about completion, real time, actual tokens or cost.
