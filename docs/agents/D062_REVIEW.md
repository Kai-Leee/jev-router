# D062 independent measured-planning review

Reviewed 2026-10-10. Scope: `benchmark-runs/d062-live-01`; no inference, retry, ledger write, candidate change, or runtime edit by reviewer. The reviewer's only saved file is this document.

## Result

API transport and typed answers succeeded for **13/13 requests**, but allocation **failed** with `ALLOCATION_REFINEMENT_EXHAUSTED`. Count selected was **2** from the offered 2..30 range, not 30. Model/effort selection was never reached. There were **0 implementation workers and 0 executable product tests**; this is measured planning, not completed development or a speedup experiment.

Independent receipt sum: **450,692 input tokens**, **10,077 output tokens**. At the protocol's input-token valuation, `450692 / 1000000 * 0.6 = $0.2704152`; this is token-pack equivalent, not actual billed USD (null). `result.json` reports **19,782.650208 ms** elapsed; this review did not independently time the original live process.

| Membership round | Selected obligations / 80 | Allowed total | Outcome |
|---|---:|---:|---|
| Initial | 73 / 80 | 30..50 | Rejected |
| Refinement 1 | 79 / 80 | 30..50 | Rejected |
| Refinement 2 | 78 / 80 | 30..50 | Rejected |
| Refinement 3 | 77 / 80 | 30..50 | Rejected and stopped |

These counts came from event records and were independently reproduced from the 13 stored responses. The run contains 1 count request + 4 rounds × 3 membership batches. No accepted worker assignment, final remainder, profile selection, or plan file exists.

The batch questions are independent typed include/exclude choices with natural-language cross-question limits. There is no joint cardinality-constrained output mechanism. Current code checks cardinality only after a full round and repeats all 80 candidates upon rejection. Evidence shows those instructions did not enforce the 30..50 bound in this run. The specific reason Jev preferred individual include answers is not observable from these responses; do not describe an inferred model motivation as measured fact. The guard correctly rejected all four invalid assignments rather than silently truncating them.

## Integrity and budget

Before root's announced post-run identifier fix, **11/11 source snapshots and 11/11 current files** matched protocol SHA-256 values. `result.json` also reports no source changes during the live run. A subsequent runtime-only identifier fix must be labeled post-run and must not rewrite snapshots or original events.

Budget before: **6,953,510** charged input tokens. After: **7,404,202**. Delta **450,692** matches the independent receipt sum exactly. Remaining **2,595,798 / 10,000,000**, pending reservations **0**. No ledger reset or reviewer mutation occurred.

Found metadata defect: all top-level `run_id` / `attempt_id` values are `benchmark-runs` because the runner used the output directory's parent basename. These are not unique run identifiers. Folder-scoped raw requests, receipts, and provider billing IDs remain available. This defect can collide in aggregate dashboards; future identifier correction does not repair historical event IDs automatically.

## Replay verification

Executed an in-memory Node replay from repository root. It imported `allocateSequentialV3`, `encodePlanningState`, and `decodePlanningState`, loaded `inputs.json` and protocol profiles, then substituted the stored response for each `decide` call. **13/13 requests** matched the stored encoded state string, question definitions, stage, and node ID exactly. Every codec roundtrip matched the requested state. Replayed rejection event tuples matched recorded rejection tuples exactly. Expected terminal error was reproduced. No network API was imported or called in this replay.

Reproduction command (read-only, no inference; current allocator/codec must still match pinned versions):

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {allocateSequentialV3} from './src/orchestration/sequential-allocation-v3.mjs';
import {encodePlanningState,decodePlanningState} from './src/orchestration/planning-state-codec.mjs';
const d='benchmark-runs/d062-live-01/';
const read=p=>JSON.parse(fs.readFileSync(d+p));
let n=0;
await assert.rejects(allocateSequentialV3({
  input:read('inputs.json'), profiles:read('protocol.json').profiles,
  decide:async req=>{
    const id=String(++n).padStart(3,'0');
    const stored=read(`calls/${id}.request.json`);
    const encoded=encodePlanningState(req.state);
    assert.deepEqual(decodePlanningState(encoded),req.state);
    assert.equal(stored.state,JSON.stringify(encoded));
    assert.deepEqual(stored.questions,req.questions);
    assert.equal(stored.stage,req.stage);
    assert.equal(stored.node_id,req.node_id);
    return read(`calls/${id}.response.json`);
  }
}),{code:'ALLOCATION_REFINEMENT_EXHAUSTED'});
assert.equal(n,13);
console.log('13 exact requests; expected allocation failure reproduced');
NODE
```

## Evidence and limits

- [Live result](../../benchmark-runs/d062-live-01/result.json), [events](../../benchmark-runs/d062-live-01/events.jsonl), [protocol and pins](../../benchmark-runs/d062-live-01/protocol.json).
- [Budget before](../../benchmark-runs/d062-live-01/budget-before.json), [budget after](../../benchmark-runs/d062-live-01/budget-after.json), [root analysis](../../benchmark-runs/d062-live-01/analysis.json).
- Independent sum used all files `receipts/001.json` through `receipts/013.json`; replay used corresponding `calls/*.request.json` and `calls/*.response.json`.
- No full product benchmark, boundary-test execution, Claude implementation, or model-profile outcome was measured. The executable public-test mapping remains a separate blocker even if allocation later succeeds.
- There is no matched baseline or completion-time saving to report. Replaying recorded answers validates deterministic processing; it does not demonstrate another live model run would make the same choices.

Side effects: only this review document was created. No external messages, paid calls, candidate changes, ledger changes, commits, pushes, or containers were created by this reviewer.
