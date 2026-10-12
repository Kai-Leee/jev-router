# D066 independent protocol and implementation review

2026-10-11 Asia/Seoul. Owner: `d064_review`, under [the D066 role contract](D066_PARALLEL.md). Status: scoped protocol and local implementation review complete; final root regression/source freeze and measured comparison remain separate. R1 is reproduced and corrected. This role owns this report and private review evidence only. No production edits, provider calls, hidden-grader inspection, historical candidate repair or recursive delegation.

The latest user request authorizes four new fresh conditions on the original OpenAPI task. It supersedes the completed D065 no-new-run tranche without resetting its cumulative 10M Jev input ledger or altering historical evidence. [The repository decision-record skill](../../skills/jev-decision-records/SKILL.md) is applied to distinguish proposals, local verification, observed execution and independent product success.

## Initial protocol assessment

The four proposed arms differ in the engine making typed split, relation and repair choices: Claude/Claude/Claude; Jev/Claude/Claude; Jev/Jev/Claude; Jev/Jev/Jev. One fresh Claude-prepared catalog must be generated only from the original public source and sanitized public requirement ID/text entries, without D065 file names, groups, graph, candidate code, historical failure details or another arm's output. All arms receive identical accepted catalog bytes, schemas, relevant public evidence, worker model/effort, two execution slots, check/image identity and repair opportunity.

The precise proposed claim is recursive partitioning of a fresh source-backed catalog. The catalog still fixes the available implementation units, paths and interfaces. Root is required to split into at least two nonempty children; later nodes may keep or split. This is a declared restriction, not unrestricted architecture generation or a measured improvement over D065. Leaves must become actual multi-file implementation jobs, with one fresh CLI invocation for each dispatched leaf/repair job. A logical worker is not a persistent conversation.

Root proposed limits of 30 units, 60 artifacts/files, 30 leaves, depth 3, 59 nodes, 435 leaf-pair questions, 128 actual decision callbacks, two public repair rounds and 14,400 seconds per arm. Planner subsequently confirmed relation batches of 32 questions, projected exact public evidence and a 240,000-byte request limit. The final experiment/manifest must be the authority; these are handshake values until its source is frozen. An initial runner message mentioned 90 files while planner/root subsequently specified 60, so the final manifest must resolve that discrepancy before spending.

All 435 pair questions at 30 leaves would exceed 128 callbacks if sent separately. Explicit batching addresses that count only if the final implementation retains every pair and atomically rejects a cyclic batch before committing any of its edges. It must not silently force no dependency, omit pairs, trim a chosen tree or discard repair opportunity to fit a budget. Provider questions, actual callbacks and local one-choice transitions need separate counts. Cap termination remains an observed bounded failure.

At initial review, a direct read of `benchmark-runs/jev-usd1-budget.json` found 7,633,742 charged input tokens, 2,366,258 remaining, 384 settled requests, `pending: null`, `blocked_code: null`, and a 65,536-token request reservation. Three proposed 700,000-token Jev arm allowances plus one reservation total 2,165,536, leaving 200,722 tokens against that observation. This arithmetic is not a guarantee that arbitrary valid trees fit 128 calls or 700,000 tokens. The runner must reserve later-arm capacity, check each actual request, record all failed attempts and refuse to reset or expand the shared ledger. Root rechecks it before launch.

The fixed order is `claude_all`, `jev_split`, `jev_split_relations`, `jev_all`, one exploratory observation each. Sequential order and provider/cache variation prevent a general speed or causal claim. Headline condition accounting includes the full shared catalog preparation wall/usage/cost for each arm; actual cohort totals count that preparation once, with amortized figures separately labeled. Per-arm elapsed time must include planning, decision validation, implementation, publication/carry-forward, all checks, repair and failed attempts. Final independent grading remains a separate phase. Success completion time and speedup stay null for failed, ungraded or uncertain products.

## Interface review and required witnesses

The planner proposes exact unit/requirement/path conservation, strictly smaller children, no empty groups, explicit finite tree/call limits and one executable leaf per worker. Pair choices must change producer artifacts, consumer input IDs and exact readable paths together. Unknown relationship decisions block dispatch; cycles and malformed responses fail before plan commit. Both decision providers receive the same prepared typed body and have the same permitted choices. Claude's decision adapter must be tool-free and cannot acquire extra files or architecture context.

The execution API proposes a new graph revision and fresh filesystem runtime for every repair round. Selected repair scopes invoke real workers with their previous output; unchanged complete leaves carry immutable bytes without a model call and are rechecked. Changed producers require the downstream dependency closure to be rerun or explicitly revalidated under the new input vector. No previous public pass may certify a changed candidate. Transport-uncertain work must stop rather than become a new repair attempt.

The evaluation owner's source review identifies two additional known-failure report shapes beyond D065's corrections: `Harness` setup failure before assignment (`executed: false`, nonempty error, zero cases, every expected ID unexecuted), and a top-level exception after a valid prefix of cases. The additive D066 validator must preserve these known failures only with exact identity, candidate binding, error/process/cleanup evidence and complete disjoint case/unexecuted accounting. Malformed gaps and uncertain operations remain blocked. A zero-case initialization failure is not seventeen executed failed cases. The public v3 checker remains frozen.

Focused independent witnesses, once sources arrive, will prioritize: recursive choices changing executable leaves while preserving coverage; actual relation input consumption plus cycle/unknown rejection; one selected public repair changing output revisions and downstream work; uncertainty stopping subsequent calls; and candidate report/budget boundary faults. Existing D065 witnesses and broad regression matrices will not be repeatedly rerun without a new reason.

## Current disposition and next trigger

At the initial protocol review no implementation defect had been reproduced. Subsequent concrete findings are listed below. The capacity and report-shape items above were preimplementation requirements. Root owns final protocol/source freeze, live execution, independent grade and the four-arm numerical comparison.

## Concrete protocol and planner witnesses — 2026-10-10 16:46 UTC

[The written experiment](../orchestration/D066_EXPERIMENT.md) and `d066-adaptive.json` settle the file cap at 60. Root depth is 0; nodes at depth 3 keep locally. At a split-eligible depth, disjoint scopes contain at most 30 units. A scope of size n consumes at most one count callback plus n−1 membership callbacks because its first child label is local. Thus split callbacks are at most 90 across depths 0–2, relation callbacks at most 14 for 435 pairs in batches of 32, and repair callbacks at most 2: a conservative total of 106 within 128. These maxima need not be jointly attainable. This is a callback bound, not token feasibility.

Independent command: `node benchmark-runs/d066-review/planner-witness.mjs`. [Retained audit](../../benchmark-runs/d066-review/planner-witness.json) records the exact then-current planner/contract/manifest hashes and five synthetic witnesses, with no external provider or candidate execution:

| Witness | Observed executable result |
| --- | --- |
| 30 units, recursive binary choices to depth 3 | 8 leaves, 15 tree nodes, 90 split callbacks and one 28-question relation batch; one commit |
| 30 singleton leaves | All 435 leaf pairs in 14 batches, plus one root split callback; one commit |
| Three leaves with one selected direction | Consumer receives the producer's exact artifact ID and `unit1.json` read path |
| Three individually feasible directions forming a combined batch cycle | `ADAPTIVE_RELATION_CYCLE`, null plan, no commit and no applied relation batch |
| An unresolved pair | `ADAPTIVE_RELATION_UNRESOLVED`, null plan, no commit and no applied relation batch |

All five passed. The 112 callback invocations across these synthetic cases are local injected deciders, not 112 paid calls. Their small synthetic source does not establish the real catalog's request/token fit or product quality. Planning stats exclude the separate repair helper; the runner's single session counter must include both under the global cap.

After the initial API proposal, root explicitly approved a distinct owners-only repair action. It may carry unchanged consumer bytes into a fresh producer input snapshot and rerun local plus complete public verification, while an owners-plus-consumers action invokes those downstream workers. Therefore only the latter may be described as consumer regeneration. Execution records old and current input revision vectors for carried consumers. Planner's previous mandatory-closure rejection and repair wording were coordinated with this change; final integrated witnesses remain to be reviewed.

## R1 — accepted catalog paths cannot initialize the actual worker transport (corrected)

At 2026-10-10 16:50:08 UTC, an independent direct-call reproduction passed `package/café.py`, `package/my module.py` and `.env` through `validateAdaptiveCatalog()`, then passed the same allowed path to the retained `createArtifactSession()`. All three catalogs were accepted and all three actual transport configurations failed `INVALID_ARTIFACT_CONFIG`. [The preserved before receipt](../../benchmark-runs/d066-review/path-compatibility-before.json) records both source hashes and exact results; no provider or candidate was invoked.

The additive catalog's original `safePath()` permitted paths outside the existing transport's ASCII grammar and omitted its `.env` reservation and 1,024-character limit. Consequently, one accepted shared catalog could make a fresh arm's worker tool impossible to initialize. Planner corrected catalog validation, schema and preparation instructions to match the retained transport boundary. The historical transport was not broadened.

The independent exact rerun at 16:53:27 UTC rejected all three incident paths with `ADAPTIVE_ARTIFACT_INVALID`; the actual transport continued to reject them. A valid `src/client.py` control passed both, and the generated schema rejected the incident strings and enforced `maxLength:1024`. [The after receipt](../../benchmark-runs/d066-review/path-compatibility-after.json) pins planner `395db3ba…`, question contract `f404bb42…` and unchanged transport `726d5a23…`. This closes the reproduced mismatch without a model call.

## Execution, adapter and uncertainty verification

Independent focused command:

```sh
node --test --test-name-pattern='Claude and measured|candidate setup|multi-file leaves|owner-only choice|uncertain worker' test/adaptive-dag-runner.test.mjs test/adaptive-dag-execution.test.mjs
```

[Retained transcript](../../benchmark-runs/d066-review/focused-integration.tap): **7/7 passed**, failure/skip 0, 16,572.935041 ms. Five selected top-level witnesses include two worker/check uncertainty subcases. They establish identical prepared Claude/Jev decision bodies, Claude's empty tool/MCP/cwd scope, measured reservation/receipt plumbing, known setup/prefix failures versus forged/incomplete/uncertain reports, actual multi-file dependency publication, a selected repair and consumer rebuild, and owners-only carry with fresh inputs and failing cross-boundary checks. All seven public child checks are collected after a known failure and rerun against one current vector. Public child evidence is separately runtime-bound; cached child results at the final gate do not trigger duplicate checker invocations. Injected providers/Docker transports and authored local Node checker subprocesses do not establish live provider, contained product or speed evidence.

An additional independent fault did not reuse an existing test body. [The repair-drift witness](../../benchmark-runs/d066-review/repair-drift-witness.json), at 16:52:43 UTC, altered the retained round-0 producer seed from 7 to 999 immediately after repair selection and before the next round. The immutable published candidate stayed at 7. The next round invoked **zero** implementation callbacks and stopped on `ADAPTIVE_EXECUTION_PRIOR_REVISION_DRIFT`; no second repair decision or replay occurred. Its reused D065 execute-callback boundary conservatively marked the journal uncertain. This records rejection before model dispatch, not a real provider uncertainty. Execution source `df762fb3…` remained identical throughout this witness.

Source review confirms the fresh catalog and public requirement projection do not import the old 16-file groups; leaves become actual jobs; relation criteria name the producer, consumer and exact bound files; owner-only and owner-plus-consumer scopes remain distinct; successful certificates are not carried across changed vectors; all arms use the same fixed worker profile and public repair opportunities. Per-arm 128 callback accounting includes repairs, while planner question/local-transition stats are separately retained. Current runner adds unique UUID-suffixed run IDs and an overall abort timer, preserving fresh arm/attempt identity and remaining-time bounds.

The automatic cohort driver stops on an uncertain arm. The protocol permits root to consider a later independent arm only after checking ledger and environment health. The runner documentation now distinguishes this manual fresh-arm continuation from a completed original cohort; uncertainty cannot cause automatic replay or be silently dropped from comparison totals.

## Prelaunch disposition and remaining evidence

No reproduced implementation blocker remains after R1's exact correction. The new planner, execution and runner have meaningful local witnesses, with the limits stated above. Root still owns the frozen source list, full regression, paid source-only catalog preparation, all fresh measured arms, budget settlements, independent final grade and numeric comparison. The reviewer has not invoked those providers or inspected hidden grader content.

The measured comparison must still verify the accepted shared catalog's exact bytes/provenance, request/input fit, real typed selections and actual dispatch/repair effects, source/image/revision identity, observed worker concurrency, truthful failed/unexecuted public coverage, complete provider usage/cost and stopping behavior. Fixed-order n=1 arms permit an exploratory comparison only. A passing local harness, authored public controls, successful CLI exit, or all public checks passing does not by itself establish independently successful product completion or a speed improvement.

Final selected-source reconciliation at **2026-10-10 16:56:27 UTC**: [prelaunch closure receipt](../../benchmark-runs/d066-review/prelaunch-closure.json) independently matches seven owner-frozen implementation/contract/CLI/manifest/test hashes, including runner `4927d88e…`, planner `395db3ba…` and execution `df762fb3…`. The runner owner reports its final focused 5/5 pass (12.052 seconds); that is owner evidence, separate from the reviewer's selected 7/7 transcript above. The original public v3 receipt remains `52e3b35c…`; the shared ledger still has 7,633,742 charged input tokens, 384 settled requests and no pending/blocked reservation. Root's full regression was in progress at this observation. This reconciliation is not a replay of the full public control matrix or a live comparison.
