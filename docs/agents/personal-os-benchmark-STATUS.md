# Personal OS benchmark author status

Date: 2026-10-08 (Asia/Seoul). Role: `PERSONAL_OS_BENCHMARK.md`.
Status: complete for offline packet/scaffold authoring; app execution unverified.
Decision link: D-012 role ownership, D-013 goal/specification-only evaluation,
and the current user's authorization to evaluate Personal OS alongside E2E-SWE.
The root agent owns dependency installation, model authentication/budget, runner
integration, real execution, and shared decision/work/verification documents.

## Delivered within ownership

- [Benchmark entrypoint](../../benchmarks/personal-os/README.md).
- [Agent product specification](../../benchmarks/personal-os/agent/GOAL.md),
  [external Markdown format](../../benchmarks/personal-os/agent/RECORD_FORMAT.md),
  and 13 synthetic Markdown input files (12 records and one Focus log).
- [Evaluator-only contract](../../benchmarks/personal-os/evaluator/CONTRACT.md),
  [30-criterion rubric](../../benchmarks/personal-os/evaluator/rubric.json),
  [executable evaluator](../../benchmarks/personal-os/evaluator/evaluate.py),
  independent reader, synthetic fixture generator, deliberate no-op control,
  and grader self-tests. No app/reference implementation was written.
- `packet-manifest.json` records the sanitized agent file hashes and evaluator
  revision. The root runner must expose only `agent/` to the implementation model.

The complete macOS scope is preserved. The fixed rubric separates 12 deterministic
disk/output groups, 12 browser groups, 4 native groups (folder connection, reopen/
Focus restoration, menu-bar control, new-folder onboarding), and 2 artifact groups.
No weights or overall numerical quality score are invented. Unexecuted evidence
stays `not_run` with null tier fractions when a tier has no executed checks.

## Explicit experiment assumptions

- New one-record-per-file Markdown format; not old byte-level compatibility.
  Fields use JSON values inside a flat YAML frontmatter subset; notes/reviews are
  ordinary Markdown bodies. Focus logs append independently identifiable blocks.
- Stable IDs, separation of contexts/categories/tags, state-transition table,
  selected-day planned-total inclusion, ISO weekdays and monthly missing-day skip
  are public format choices. They are not asserted as earlier user decisions.
- The absent-next-date recurrence policy remains declared by each implementation;
  no hidden preferred policy/visual design or after-the-fact penalty is introduced.
- Generic evaluator actions are mapped by an independently reviewed post-submission
  adapter to the real app. They are not API/function/task requirements in the
  agent packet. `view.read` explicitly normalizes a selected-day slice, without
  requiring Week/Calendar to hide their other dates.
- `setup.sh`, start/build documentation and a configurable local browser port are
  output/environment requirements agreed with root, not an implementation plan.

## Actual validation

From `jev-router/`:

```sh
python3 -B benchmarks/personal-os/evaluator/selftest.py
```

Result: 10/10 grader self-tests passed, exit 0. They cover fixture and packaged
input agreement, strict malformed/duplicate parsing, invalid task metadata and
references, duplicate/truncated Focus logs, symlink refusal, empty submission,
missing adapter, deliberate false-success no-op, and the fixed rubric map.
These tests validate selected grader properties, not app correctness. No positive
end-to-end app control exists yet; a real submission and reviewed mapping are
needed before interpreting an app result.

Actual standalone CLI controls used evaluator-created temporary folders:

| Control | Exit | Report result |
|---|---:|---|
| Empty submission, no adapter | 1 | `overall_status: fail`; artifact presence fails; disk/browser/native not run |
| Nonempty placeholder, no adapter | 0 | `overall_status: incomplete`; only artifact presence passes; all behavior unverified |
| Nonempty placeholder + no-op claiming success | 1 | All 12 deterministic behavior groups fail; browser/native not run |

All three reports have `full_product_verified: false`. Exit 0 alone is explicitly
documented as no executed failure, not successful/full evaluation. Evidence:
`/private/var/folders/94/bplpl5gn4s35h173sgd6dbch0000gn/T/personal-os-grader-validation-xuo691rx/`
contains `empty.json`, `missing-adapter.json`, `noop.json`, and the two synthetic
placeholder directories. This path is evaluator evidence only, outside `agent/`.

Agent-packet `rg` check found no private absolute path, original app/task ID,
existing-code reference or external URL. A broad scan matched ordinary product
phrases containing “task list” and “implementation sequence”; these describe
task-list behavior and absence of a prescribed implementation sequence.
The final independent file check covered 25 visible files: local Markdown links,
fence pairing, trailing newlines, per-file `git diff --no-index --check`, and the
15-file agent packet's SHA-256 manifest all passed with zero errors, exit 0.

During refinement one multi-file patch had a stale README context and was rejected
without applying. It was reapplied with correct file contexts. Subsequent tests
passed. There was no test failure or app-source modification to conceal.

## Remaining limits and next integration action

- No app implementation, real adapter, browser/native app run, paid model call,
  personal Vault access, dependency install, service operation, commit or push.
- Real adapter authenticity is not established by its JSON `ok`; the evaluator
  reads files, while mapping review and representative UI traces are still needed.
- Runner fresh folders are not a sandbox. Root must use actual isolation with no
  private mounts/credentials; arbitrary adapters can otherwise touch the host.
- Disk checks are a subset: context/category CRUD, recurrence, multi-item partial
  failure, pointer actions, timer state, concurrency and publication failures
  remain in the full rubric awaiting independent execution.
- Root should record exact packet/evaluator hashes, runtime/model/budget/config,
  copy only `agent/` to the empty workspace, retain evaluator code separately, and
  run the evaluator after a real submission and independent adapter are available.
  Linux/browser success cannot fill any native result.

Writing complete. No context-limit replacement was required. This status is the
handoff checkpoint; root may integrate and update shared records.
