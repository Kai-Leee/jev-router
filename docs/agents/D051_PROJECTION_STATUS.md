# D051 routing evidence projection

`projectLifecycleDecision(request)` in `src/orchestration/decision-projection.mjs` produces a separate cloned management-decision input. Apply it before `prepareDecisionPayload` identically for Claude and Jev. Original recorded requests and worker inputs remain complete.

Only `content` strings within known worker file collections are removed: current `workerResult.files/artifacts`, historical worker-result evidence collections, and confirmed-failure artifact snapshots. Path, existing SHA-256, bytes and all other file metadata are preserved. Missing hashes/sizes are computed before removing content. Arbitrary message content, goal, complete public specification, plan, worker summaries, failure messages, verification observations and questions are unchanged.

Every projected file has `source_not_in_decision_context:true`; state includes an explicit source-access explanation. This changes the judge's access: it routes observed evidence and can request bounded repair, but cannot claim it reviewed omitted source or established functional requirement satisfaction. Complete source remains local and available to scoped implementation workers. Independent grading is still required.

Verification: `node --test test/decision-projection.test.mjs` passed5/5. Tests check original input non-mutation, full noncontent field retention, precise known-context selection, arbitrary message content retention, computed missing metadata, and explicit access boundary.

Reproduced against `benchmark-runs/d050-jev-01/calls/005-decision.request.json`: decode existing lossless string table, project, encode again. Projected JSON70810 bytes; after lossless interning61643 bytes. Removed17 file-content occurrences totaling199961 UTF-8 bytes. These are byte counts, not measured model tokens; no claim of proving the upstream context limit or token usage. Original frozen source and receipts untouched. No API calls.
