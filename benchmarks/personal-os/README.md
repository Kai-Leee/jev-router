# Personal OS reconstruction benchmark

Version: `personal-os-v1-experimental`, 2026-10-08. This is an authored workload,
not an official E2E-SWE task or a validated reference app.

Only `agent/` belongs in the implementation agent's initial workspace. It contains
the product goal, external record format, and synthetic records. There is no
implementation source, architecture, ordered task list, previous app code, or
private data in that packet. The implementation agent chooses its own plan.

`evaluator/` is a separate, evaluator-owned acceptance contract and executable
scaffold. Keep it outside the implementation agent's visible/mounted paths. An
independent evaluator maps the submitted application's real commands to the
semantic adapter protocol after submission. The adapter must not implement
missing product behavior or write records instead of invoking the app.

The workload retains the full macOS product scope. Deterministic disk checks,
browser interaction, native lifecycle/menu actions, and artifact/privacy review
have separate evidence statuses. A Linux run cannot earn native credit. There is
no default weighted total or inferred pass for an unexecuted criterion.

## Local commands

From the Jev Router root, with Python 3.10 or newer (standard library only):

```sh
python3 benchmarks/personal-os/evaluator/selftest.py
python3 benchmarks/personal-os/evaluator/evaluate.py --submission /tmp/empty-submission --output /tmp/personal-os-empty.json
python3 benchmarks/personal-os/evaluator/evaluate.py --submission /tmp/submission --adapter /tmp/evaluator-adapter.py --output /tmp/personal-os-result.json
```

The submission directory must exist. The first evaluation needs no app or
adapter and records an empty submission as failed. Exit `0` means no executed
check failed; this also covers incomplete/no-adapter runs and **does not mean the
automatic checks ran**. Exit `1` means at least one executed check failed, and
`2` means invalid invocation/configuration.
Read `overall_status`, `full_product_verified`, the per-tier summary, and each
criterion in the JSON; shell exit zero is never a full-app success signal.

The harness creates only fresh temporary synthetic folders and launches only
the explicitly supplied evaluator adapter. It does not launch the submitted app
automatically, install anything, call models, open a real Vault, or sandbox the
adapter. Use a genuinely isolated evaluation host/container with credentials and
personal paths unavailable before evaluating untrusted submissions. The native
checks require a separate disposable macOS app identity and synthetic folder.

## Frozen assumptions and pending execution

The one-record-per-Markdown-file format and Seoul reference time are experimental
choices. Byte compatibility with the old app is not a requirement. The unresolved
recurrence policy for a previously absent date is declared by the implementation
agent and reported separately; no evaluator may invent a penalty afterward.
Native scope, recurrence rules, and privacy are not optional just because the
current automatic checks cover only a subset.

No app has been implemented or evaluated here. Self-tests establish grader
sensitivity to selected negative controls and fixture/parser validity only.
Before comparing runs, freeze packet/evaluator hashes, model/runtime revisions,
budgets, adapter mapping and environment, and preserve all outcomes and costs.
The implementation agent's own tests and completion claims are separate evidence.
