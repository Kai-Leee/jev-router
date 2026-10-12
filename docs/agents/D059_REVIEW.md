# D059 independent implementation review

2026-10-10. Role: read-only source audit and offline validation; owner d059_review. No paid service calls, product worker execution, hidden test source, candidate implementation, or old-run mutation performed.

## Checks and evidence

- Read D059 role/experiment, D057 results and D058 decision; examined sequential-allocation.mjs, sequential-planning-runner.mjs, sequential-e2e.mjs, shared execution scheduler, provider identity checks and measured budget decider.
- `node --test test/sequential-allocation.test.mjs test/recursive-execution.test.mjs`: **13/13 passed**, no skips, 338.043375ms. Coverage includes exact obligations, linked tests, <=32 question batches, reserve enforcement, empty/over-selection rejection, invalid profile and dependency cycles, no retry, scheduler read/write exclusion and fail-drain.
- Additional offline simulation with actual public 80-obligation/85-test fixture, actual profile catalog and actual `prepareDecision` wire validator: synthetic count3 then balanced allocations produced9requests, max32questions and165733serialized bytes, below240000 limit. Coverage80exclusive/85linked; mock obligations27/27/26. This is local validation, not an actual Jev choice or product test.
- Mock plan paths12/6/13 overlap, producing worker1 -> worker2 -> worker3 ordering. Parallel execution is possible only when live allocation and read/write leases permit it; multiple workers do not establish parallel speedup.
- With80obligations, count<=5 and32-question batches, maximum count/allocation/profile requests is1+12+5=18, below runner40 and requested64; arbitrary larger fixtures remain subject to40-call stop.

## Verified behavior

Count choices2..5 exclude keep1. Each nonfinal worker receives independent typed include/exclude questions over every remaining obligation. Selection survives across batches, selected IDs leave later workers' candidates. Over-allocation and empty worker stop without truncation. Last worker receives a labeled deterministic remainder; it is not a Jev semantic decision. Profiles follow completed allocation and DAG checks. Shared tests may appear on several workers; source obligations are exclusive. Model probabilities do not gate execution.

Current20-profile catalog contains explicit model/effort pairs; unknown returned IDs fail validation. CLI requested and observed model identity must match exactly; no fallback branch. Effective effort stays null. Profile availability is unverified until actual receipt. Main integration/repair remain fixed Opus medium.

Existing cumulative budget opens requireExisting, reserves before POST, uses actual usage settlement and has no automatic retry. GET model check precedes inference. Worker prompts derive from public source/tests and historical interface contract only. Independent63-test grade runs after candidate freeze; its output is never sent back to workers. Public-smoke-only repairs are bounded3. Completion requires exact independent success, image/provenance/cleanup and unchanged runtime source.

## Findings and remediation

1. **Pre-dispatch review finding, corrected by root:** sequential planning originally treated unspecified error uncertainty as false after a paid dispatch, including local response/journal persistence failures. Root changed catch to infer uncertainty from inference_started unless explicitly false and retain known response usage. Inspected updated code. Do not infer a fresh retry from a missing receipt.
2. **Persistence cleanup edge corrected by root:** receipt saving in finally originally preceded held.close without nested finally. Root added nested finally to close held budget even when receipt save throws and marks post-dispatch save errors uncertain. Current source inspection and `node --check src/benchmark/sequential-planning-runner.mjs` passed. Disk-failure fault injection was not performed.
3. **Generic single-option contract gap, not current fixture blocker:** allocator accepts exactly2obligations or1profile but still asks one-option choice. Existing mock test permits this; actual client requires2..255options. Current80obligations/20profiles avoid it. A future generic API should reject singleton inputs or explicitly record deterministic selection, with real prepareDecision validation tests.
4. Allocation inherits conservative file relevance; three paths (`pyclientgen/ir.py`, `pyclientgen/__init__.py`, `pyclientgen/__main__.py`) remain integration-owned. Broad atoms can serialize every worker. This is a declared experiment property, not evidence of task-level independence.

Final pre-execution review: no remaining blocker identified for the current80-obligation/20-profile fixture; sources may be frozen. Generic singleton issue remains outside this execution.

No claim that this condition is causally comparable with D057: forced split, routing and number of model calls differ. Offline success does not establish model availability, live allocation validity, implementation completion or efficiency improvement.

Side effects: this report only; no source modifications, paid calls, containers, commits or pushes by reviewer.

## Actual D059 run02 planning audit (while worker execution continues)

Read-only audit of `benchmark-runs/d059-e2e-02/planning/{inputs,protocol,plan,result}.json`, all eight request/response pairs, `execution-envelope.json` and first worker request. No candidate source or hidden evaluation material read. No runtime source modified during freeze.

**Exact reconstruction verified:** replayed `allocateSequential` locally using the eight stored responses as its `decide` callback, decoded each persisted `request.state` via `decodePlanningState(JSON.parse(state))`, then compared decoded state and questions with the freshly reconstructed request using `isDeepStrictEqual`. All8/8 were identical; reconstructed final plan also exactly equalled saved `plan.json`. This verifies original source/obligation/test context survived the codec and that saved answers produce the recorded plan. It does not prove the model understands the encoding equally well as unencoded JSON.

Observed sequence: count1call -> worker1 allocation3calls(32/32/16questions) -> worker2 allocation1call(15questions) -> profile3calls. Last worker receives deterministic remainder. All8 receipts completed; planner11,562.619458ms,233,455input/3,692outputtokens, informational0.140073USD, actualbillingnull. Prior run01 input-limit400 is separate from run02: root preserved refund/reconciliation under `d059-refund-01`; inspected reconciliation shows0pending reservations and pre-run02 charged6,720,055input. Reviewer did not independently manipulate or recheck provider billing UI.

|Actual allocation|Worker1|Worker2|Worker3|
|---|---:|---:|---:|
|Exclusive obligations /80|65 (81.25%)|13 (16.25%)|2 (2.50%)|
|Linked public test specifications|70|16|4|
|Writable paths|13|11|5|
|Jev-selected model/effort|Opus5.5 high|Opus5.5 high|Sonnet5.5 medium|
|Predecessors|none|worker1|worker1,worker2|

**Coverage preserved; parallelism absent in this plan.** Obligations65+13+2=80 with no duplicates/missing. Linked tests70+16+4=90assignments correspond to85unique specifications; cross-cutting tests legitimately repeat5times. Paths overlap and force worker1 then worker2 then worker3. Max-concurrency2 cannot bypass this DAG. Uncovered ir.py/__init__.py/__main__.py remain the global integration responsibility.

**Allocation is heavily skewed and context is repeated.** Every one of eight Jev states still contains all80obligations,85test specifications and exact19,512-character source. Only the selectable remaining IDs shrink (80 to15); context does not shrink to the remainder. First Claude request also contains full19,512-character public source plus845-character artifact contract and selected65atom details. This is enough context to preserve intent but is not evidence of input reduction. The first worker owns81.25%of obligation count and every one of13covered product paths, so later workers are refinements across existing files. Obligation count is not measured effort or token distribution; do not call it81.25%of runtime.

The structural validator enforces nonempty coverage and reserves one obligation per remaining worker. It imposes no balance objective, no requirement that chosen groups can run concurrently, and no prohibition on assigning almost everything to worker1. Thus the65/13/2answer is valid under current rules. A changed objective favoring independently executable groups or workload balance would be a new experimental condition, not an interpretation of the current plan. Retain this run untouched.

Jev response model strings vary across calls: `typesafe-ai/jev`, `jev-1.13.0`, `typesafe/jev-1.13-20260917`. These are observed provider labels; identical underlying model version is unverified. Worker profiles above are requested selections until each Claude terminal receipt proves served identity. At audit time worker1 is still executing; no completion time, product success or causal speedup is established.

Side effects of follow-up audit: this report append only; local replay did not call Jev/Claude, execute product tests, write candidate files, change the ledger or modify frozen runtime sources.

## Terminal audit — unresolved57/63

Read terminal result, all4Claude receipts, protocol, pregrade hashes, public-check0, grade result/controller and failed CTRF categories. No source/candidate change, hidden test source read, model feedback or paid call. Hashed candidate files only to compare frozen identity; did not inspect implementation content for repairs.

Verification used Node `createHash('sha256')` for each of29protocol source entries and stored snapshot paths; **29/29 current and snapshot hashes match**. `isDeepStrictEqual(pregrade,candidateSnapshot(candidate_path))` istrue; independent_grade embedded inresult exactlyequals grade/result.json. Receipt sums equal result aggregates: input66, cachecreation596092, cacheread4410715, output193550. All4terminal receipts confirm requested model identity; effectiveeffort remainsnull. No public repair receipts exist.

Terminal status `unresolved`; elapsed1,790,166.063375ms (29min50.166s), completion_wall_msnull, valid_completion_comparisonfalse. Independent63records:57passed/6failed,0skipped/pending/other, fresh pinnedimage/networknone, container_removedtrue, controllerexit0/outcome_uncertainfalse. Successful verifier execution is not product completion.57/63 is a test pass count, not the benchmark reward (reward0).

Failed categories from CTRF (diagnostic only; not fed to any worker):

- LiteralEnums4failures: literal_aliases, roundtrip, type_hints, invalid_values. Reported missing `MyStrEnum` or `MyModel` attributes from generated models package. Shared initial failure can account for several tests; this does not prove four separate root causes.
- Defaults1failure: union_with_valid_default observedTrue versus expected3.
- MultipartBody1failure: requested multipart header Content-Type unavailable in captured request.

**Public verification gap is confirmed.** public-check0 passed, so repairloop never ran. Public smoke checks its own Status/Widget/Defaults JSON/YAML/literal fixture and basic exports, nullable/enum roundtrip, scalar/list default types. It does not exercise uniondefault coercion or multipart request headers; its successful literal scenario does not cover the failing independent literal configuration/schema combination. It would be inaccurate to say exports or literal mode were never checked at all. Additional public checks derived from public requirements should be a new condition; do not retrofit hidden diagnostic assertions into this preserved run.

|Terminal call|Elapsedms|API-equivalentUSD|
|---|---:|---:|
|Worker1 Opushigh|1356696.507750|5.981891|
|Worker2 Opushigh|210039.347125|1.544576|
|Worker3 Sonnetmedium|13247.844625|0.230656|
|Integration Opusmedium|135898.456792|1.547612|
|Jev planning8calls|11562.619458|0.140073|

Four Claude receipts sum9.304735USD; plus Jev0.140073 = **9.444808USD** informational equivalent, excluding separate monitor, controller development and refunded run01. Actual invoice/allocated subscription cost remainsnull. Claude CLI calls are not underlying API request count. Worker1 consumed79.067%of summed Claude invocation elapsed1,715,882.156292ms; Jev planning consumed0.6459%of overall1,790,166.063375ms. These denominators differ intentionally.

Descriptive historical comparison: D059attemptelapsed exceeds D057Claude-only attemptelapsed1,768,522.755209ms by21,643.308166ms. D059cost9.444808 versus D057Claude7.6330826 differs1.8117254USD,23.73517% using7.6330826 asdenominator. Neither number is a successful-completion speed/cost improvement. Conditions differ in forcedsplit, high-effort routed workers versusmedium, profiles, sequential workflow and runorder; n1 each. D059 did not complete and cannot support a completiontime ratio. Allocation65/13/2 and sharedpaths caused serialwork; quality failure persists despite each agent returning successfully.

Side effects of terminal audit: appended this document only. Preserved failed candidate and all logs unchanged; no fixes, model feedback, calls, containers, ledger changes, commits or pushes by reviewer.
