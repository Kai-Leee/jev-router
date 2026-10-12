# D064 observation — P4 implementation status

Date: 2026-10-10 (Asia/Seoul). Owner: `d064_observation`.
Contract: [D064 roles](D064_PARALLEL.md); design acceptance: [D063](../orchestration/D063_DAG_PLAN.md).

Implemented the separate opt-in event projection and standalone HTML view. Existing dashboard app,
reader, server, and metrics files were not edited by this role. Root owns runner integration, final
regression, shared decision records, and the saved reviewable artifact.

## Owned files and API

- `src/dashboard/dag-metrics.mjs`: `projectDagEvents(events)` returns
  `{schema_version:'dag-event-projection/v1',event_count,duplicate_count,runs}`.
- `src/dashboard/dag-view.mjs`: `renderDagView(projection)` returns a full script-free HTML document.
- `test/dag-metrics.test.mjs`: 20 focused tests.
- This status file.

Projection groups are independent `(run_id, graph_revision)` pairs. Groups and task rows use a
deterministic sort. Chronological order inside each group is validated, not silently repaired by
sorting. Every event requires the common envelope. Task/check lifecycle requires matching IDs and
attempts, terminal identity, and consistent check version, environment, phase, and revision vector.
Additional JSON metadata is accepted at the input boundary but is not copied wholesale to the view.

Receipt identity is `(run_id, event_id)`. A structurally identical duplicate is counted once; different
content, including a different graph revision, throws `DAG_EVENT_DUPLICATE_CONFLICT`. Other malformed
input or invalid transitions throw coded errors instead of returning a seemingly successful partial
projection. Identical IDs in different runs remain independent.

Each run exposes:

- `estimated_critical_path_ms`, `critical_path_basis`, `dependency_model_complete`, and
  `unknown_duration_ids` from the supplied analysis. Unknown durations or explicitly unresolved
  relationships cannot produce a complete numeric CP. The projector does not certify the analyzer.
- `measured_completion_ms` only for a completed run with its observed `dag_plan_analyzed` boundary.
  The end is `dag_run_completed`; `preparation_observed:false` explicitly excludes preparation before
  analysis. Failed, blocked, and nonterminal runs retain `null` successful completion.
- `observed_span_ms`, peak observed task concurrency, attempts, check spans, and exclusive
  pre-dispatch wait intervals. Open span durations remain `null`, with a separate bounded
  `observed_ms`. Unreleased waits/checks at failure or run stop are marked censored.
- Dependency, resource, slot, unknown-relationship, run-failure, and check wait summaries.
  Summaries sum task intervals and can overlap across tasks. Check spans are already inside task/run
  time and are not added into elapsed time. Check wait here means an observed validation span, not a
  separately instrumented queue before the check.
- Usage and cost are `null` with `source:'not_observed'`. This event contract has no usage receipt;
  empty/missing accounting does not imply zero tokens or a free run.

The view escapes every dynamic label, includes no scripts or external resources, and has a restrictive
Content Security Policy. It labels estimated, observed, failed, censored, and unknown values. Its
completed state is controller telemetry; it is not independent product correctness evidence.

## Verified evidence

Executed locally, without model or network calls:

```sh
node --test test/dag-metrics.test.mjs test/dashboard-metrics.test.mjs
```

Result: **72/72 passed, 0 failed, 0 skipped** — 20 new DAG tests and 52 existing dashboard-metrics tests.
Cases include invalid identifiers/times/JSON, ordering and attempt mismatch, cross-run/revision
contamination, replay/conflicting duplicates, failed-not-completed, incorrect terminal task lists,
check identity and uncertain checks, exclusive/open waits, unknown duration and unknown relationship
CP, peak task concurrency, explicit retry attempt distinction, caller input preservation, and HTML
escaping. No existing dashboard source was edited to achieve this result.

An additional local in-memory integration imported `analyzeDag`, `runDag`,
`executeArtifactTask`, `projectDagEvents`, and `renderDagView` with
`examples/dag/contract-fixture.json`. `execute` and `runCheck` were explicit mock callbacks; revisions
were an in-memory map and time was an incrementing synthetic clock. The observed receipt shapes from
P2/P3 produced **15 events, 3 completed tasks, peak concurrency 2**. The supplied CP estimate was 40 ms;
synthetic completion was 15 ticks presented as milliseconds by that test clock. These differ by design
and are separate projection fields. The integration did not execute product assertions, model calls,
or real workload timing. It rendered a 4,572-character HTML string before the later dependency-model
label was added; HTML length is diagnostic, not a visual correctness or performance result.

P3 event coordination: invalid negative assertion/skipped counts are now normalized to `null` in gate
events while retaining evidence failure, so a failed callback cannot invalidate the telemetry count
schema. That gate change and its tests belong to the verification role.

## Limits and next action

No browser rendering inspection, real provider use, actual billing, product success, causal performance
improvement, or exactly-once external execution was established. The projector is an offline, trusted
controller journal reader, not a scheduler, revision verifier, or account reconciler. Local event
deduplication does not authorize or retry an uncertain external request.

Root can import both APIs in the opt-in local pilot, preserve raw events beside the projection and
HTML, then run integration/regression and independent review. Any preparation-start metric needs an
explicit additional start boundary; it must not be inferred from the first available event.
