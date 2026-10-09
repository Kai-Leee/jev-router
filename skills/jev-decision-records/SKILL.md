---
name: jev-decision-records
description: Maintain evidence-linked Jev Router decision, experiment, cost, and handoff records when routing rules change or Claude/Jev runs are evaluated.
---

# Jev decision records

Keep the goal visible: replace repetitive Claude judgment with Jev where measured useful; adding approvals is not an efficiency result. Read the project's current decisions, role contract, and state before updating a record. User instructions remain authoritative; this skill does not authorize API spending, retries, deployment, or expanding agent permissions.

Use one `docs/decisions/<decision-id>.md` per material experiment or architecture decision. Read [the record contract](references/record-contract.md) when creating or updating its structured section. Keep raw request/response and execution artifacts in their existing private locations; link them without copying secrets into the decision document.

Before running, record the user request, owner roles, hypothesis, conditions, budget ledger, intended comparisons, and next trigger. Mark intended results as unmeasured. A proposal is not an accepted decision. A successful Jev response is not a successful task or independent grade.

After evidence arrives:

- Separate measured facts, estimates, hypotheses, decisions, corrections, and unknowns. Cite exact run/attempt and immutable evidence snapshots for numeric claims. Preserve failures and superseded claims with a correction entry rather than silently replacing them.
- Record latency boundary (HTTP, CLI/process, workflow, grading), sample size, denominator for percentages, exact model/effort/brief/image matching, and failed or excluded attempts. Changed scaffolding is a new condition. Explain mismatches before comparing.
- Keep role generation, implementation, Jev judgment, monitoring, grading, and failed attempts distinct in cost calculations. Identify actual billing, API-equivalent estimate, monthly subscription allocation, and conservative budget accounting separately. Unknown usage/cost remains `null`; never coerce it to zero. Reuse the shared budget ledger.
- For rule changes, link rule revision/hash, the evidence version, who generated it, Jev's typed decision, deterministic validation, and effective revision. A rejected artifact stays rejected even if delegation itself succeeded. Record which Claude work was actually skipped versus merely intended to be skipped.
- Finish with unresolved work, owner, next trigger, and side effects. Update the existing state/decision indexes by reference, without duplicating all raw results.

Validate the structured record from the repository root:

```sh
python3 skills/jev-decision-records/scripts/check_record.py docs/decisions/D025.md --root .
```

This check verifies required fields, source IDs, in-repository evidence files and SHA-256 consistency. It does **not** validate truth, arithmetic, the content's support for a claim, secret absence, or semantic agreement between prose and JSON. Inspect cited evidence and recompute numeric claims independently. Do not modify historical evidence to make a hash pass; a changed artifact needs a new source ID and explanation.
