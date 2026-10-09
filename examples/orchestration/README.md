# D027 offline routing experiment

These documents are **synthetic fixtures**, not a generated Personal OS plan or live Jev response. No secret, provider transport, model CLI, or container is used.

Run from repository root with a new directory:

```sh
node bin/document-routing-experiment.mjs benchmark-runs/d027-offline-NEW
node --test test/document-router.test.mjs
```

The CLI refuses to replace an existing experiment directory. `document-bundle.json` is the materialized goal/requirements/task tree/evidence/profile/failure catalog. `synthetic-answers.json` is clearly separated scripted decision data. Production threshold remains null. Compare thresholds 0.5/0.65/0.8 as the user requested; don't choose a production threshold based on these fabricated probabilities.

The root split probability is scripted as 0.72 and the backend child as 0.6. Expected topology: threshold 0.5 splits both (7 nodes, 5 leaves); 0.65 splits root only (5 nodes, 4 leaves); 0.8 keeps one leaf. The simulated integration leaf waits for backend and UI; no real integration verification is run. Tasks with disjoint leaf ownership can overlap, while dependencies and overlapping ownership serialize. A 5ms fixture delay only makes overlap observable; it is not an estimate of real worker latency.

Each request is assembled BEFORE its response is consumed. `requests-responses.jsonl` contains question text/type/options, full input documents, scripted raw answers, applied threshold, selected handler and its result. `report.json` includes topology, simulated worker events, paired model/effort profile receipts, all requirement status mappings and failure classification mappings. Profile `fixture-model` is not a callable provider model. A recorded task-selection example uses caller-supplied ready IDs and is separate from scheduler ordering; dynamic Jev priority scheduling is not integrated.

Current limits: no Claude generation of task cards/questions, no live Jev decisions or native agents, no durable recovery/idempotent live dispatcher, no profile capability discovery, no automatic handling of >254 catalog entries via hierarchical selection, no performance gain or calibration evidence. Protocol format/size guards do not prove instruction-injection resistance or semantic correctness.

Read the [contract](../../docs/orchestration/D027_CONTRACT.md) for the target architecture and [experiment report](../../docs/orchestration/D027_EXPERIMENT.md) for verified scope, defects found, and remaining work.
