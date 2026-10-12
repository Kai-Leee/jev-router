# D049 continuation evaluation

Read `D049_VERIFIER_RECOVERY.md`. New analyzer only: D048 frozen analyzer and artifacts are unchanged. No providers, grader, generated code or further agents executed.

```sh
python3 scripts/analyze-lifecycle-continuation.py benchmark-runs/d049-protocol.json --output benchmark-runs/d049-analysis.json
```

Protocol retains D048 `manifest`, `image_lock`, optional new frozen `sources`. Conditions now contain `{name,path,parent_path}` with `path` the new D049 run and `parent_path` the original D048 run. Optional `parent_evidence:[{path,sha256}]` freezes original receipts/results/events. New `result.json` must contain matching `parent_path`. All matched input fields must be identical between the parent and continuation. New run receipts/events contain only **new dispatches**; reused old artifacts do not create new receipts. Invocation IDs may restart per stage; missing IDs are explicitly namespaced in the combined output.

Candidate and grade contract is inherited from `D048_EVALUATION_STATUS.md`: new candidate path, immutable `pregrade.json`, original pinned task/image grader, `grade_finished` event or grade timing file. Existing D048 analysis is imported for strict provenance, unknown cost handling and full test quality gates.

Combined output schema `lifecycle-continuation-comparison/v1` includes:

- `stages`: complete D048/D049 diagnostic rows.
- `operational`, `categories`, `providers`: additive final-receipt usage/cost/calls; missing cost remains null with known subtotal visible. Prior failed stage costs count once.
- `elapsed_original_start_through_grade_ms`: continuous elapsed from original D048 start through final D049 grade; includes infrastructure investigation pause.
- `verified_total_completion_ms`: same elapsed only if independent full quality gate passes.
- `active_run_and_grade_ms`: sum of original run wall time, continuation wall time and final grader wall time; excludes investigation and queue wait. Null if grade time unavailable.
- `verified_active_completion_ms`: active time only for independent success.
- `intervening_repair_pause_ms`: original finish through new start, must be nonnegative.
- Comparisons include denominator and suppress all savings unless both conditions have matched inputs and independent successful completion.

Verification: `python3 scripts/analyze-lifecycle-continuation.py --self-test` passed repeated per-stage IDs, both-stage spend, missing-total/known-subtotal separation, actual billing null and active-time arithmetic. Base analyzer self-test remains separate. Real D049 compatibility/final quality remains unverified until outputs exist. Continuation is not a fresh independent replicate.
