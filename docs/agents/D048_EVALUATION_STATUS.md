# D048 evaluation handoff

Purpose: measure verified whole-task completion, including every decision and recovery; do not reward cheap failed runs. This agent owns only this file and `scripts/analyze-lifecycle-comparison.py`. No providers, generated code, grader, or real Personal OS executed.

## Reader contract (agreed with main)

```sh
python3 scripts/analyze-lifecycle-comparison.py benchmark-runs/d048-protocol.json --output benchmark-runs/d048-analysis.json
```

All paths are absolute or repository-root-relative. Output creation is exclusive; never overwrites an earlier analysis.

- Protocol: `manifest`, `image_lock`, `conditions:[{name,path}]`, optional `sources:[{path,sha256}]`. Conditions expected `claude`, `jev`; first is baseline. Sources, if supplied, must still match.
- Each condition `result.json`: `schema_version:"lifecycle-run/v1"`, `condition`, `status`, ISO timezone-bearing `started_at`, `finished_at`, `wall_ms`, `candidate_path`, optional `grade_path`, and `inputs`.
- Inputs matched exactly: `brief_sha256`, `plan_sha256`, `worker_model`, `worker_effort`, `worker_transport_sha256`, `max_concurrency`. Routing provider is intentionally not matched. Missing match fields invalidate comparative claims.
- `events.jsonl`: one `event:"invocation_started"` per dispatch, with unique `invocation_id`, `provider`, and `category` (`planner`, `decision`, `worker`, `recovery`, `monitor`). Controller invocation is not the count of internal provider continuation turns.
- `receipts/*.json`: each has the same invocation identity plus `status`, `wall_ms`, `usage`, `api_equivalent_usd`, `actual_billed_usd`. All final usage comes from terminal provider receipts only. Usage fields: `input_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`, `output_tokens`. Missing cache fields stay unknown; Jev is not coerced to zero cache. Jev informational price basis is a receipt annotation, never actual billing.
- Before grade: write `pregrade.json` as relative regular-file path to SHA256 map. After grade: `grade-timing.json` `{finished_at,wall_ms}`, or a `grade_finished` event with those fields and `grade_path`. The event permits adding grade evidence without rewriting the runner result. Candidate hashes must remain unchanged; symlinks rejected.
- Grader result retains original pinned adapter structure: task ID, upstream commit, image digest, workspace, grading status, resolved flag, summary. A quality gate requires completed, resolved, and exactly the manifest's expected number of passed tests. Grade finish cannot precede run finish.

## Metrics and boundaries

Primary metric `verified_total_completion_ms` is condition start through independent grade finish. It is null unless quality passes. `elapsed_through_grade_ms` remains diagnostic for failures. Grade queue wait is included, so run grades promptly and disclose shared-machine contention.

Operational cost includes new planner, every decision, worker, and recovery receipt. Monitoring is reported separately. Historical shared planner cost is excluded from new spend and should be documented separately, not inserted as a new invocation. Category and provider rollups retain their own counts/usage/costs. Unknown invocation or cost makes the total null; known subtotal remains visible. Summed invocation wall time is explicitly separate from parallel wall time.

Comparative reductions have baseline denominator and are null unless matched inputs and both independent quality gates pass. Cost comparison additionally needs both known totals and nonzero baseline. One paired run is exploratory; shared account cache and concurrency are not isolated.

## Verification, 2026-10-10

`python3 scripts/analyze-lifecycle-comparison.py --self-test` passed. Actual checks: missing receipt remains unknown, empty call set is zero, unknown billed amount remains null, final usage counted once, duplicate/unstarted receipts rejected, timestamp arithmetic, full two-condition synthetic fixture with grade event, quality-failing condition suppresses reductions, post-snapshot candidate mutation rejected. Temporary fixture directory automatically removed.

Not verified yet: real D048 output compatibility and paired runtime outcome. Main owns provider dispatch, pinned original grading, final analysis, and documentation. No new public pricing assertion is made by this offline reader.
