---
name: jev-skill-maintenance
description: Audit, improve, and create repository-owned Jev Router skills when a workflow gap, source drift, or skill-maintenance request needs an evidence-backed change.
---

# Jev skill maintenance

Maintain the skills under the Jev Router repository's `skills/`. Resolve project paths from that repository root, even when reading an installed copy of this skill. Start with `AGENTS.md`, the current role contract and state, and the inventory/backlog at `docs/skills/MAINTENANCE.md`. Keep the existing assigned skills maintainer as the owner; loading this skill does not create another agent or authorize installation.

## Choose the smallest useful change

- Tie the issue to a current user request, observed failure, or concrete repeated workflow. Record the source and what decision the skill should improve. A possible future feature alone is a backlog candidate.
- Update an existing skill when its trigger and responsibility already cover the issue. Add a new skill only for a distinct reusable workflow; keep project runtime contracts in their authoritative documents and link them where needed.
- Read the available `skill-creator` instructions before creating or substantially revising a skill. Preserve invocation policy and unrelated metadata. Keep normal discovery unless the user explicitly requests otherwise.
- Record the issue, affected source files, intended behavior, evidence, validation, owner, and next trigger in the existing maintenance backlog. Preserve superseded findings with a correction instead of silently replacing them.

## Inventory source and copies

Use the read-only helper from the repository root:

```sh
python3 skills/jev-skill-maintenance/scripts/inventory_skills.py \
  --source-root skills \
  --installed-root "${CODEX_HOME:-$HOME/.codex}/skills" \
  --installed-root "$HOME/.agents/skills"
```

The helper requires `fd`, inventories each immediate source skill directory, hashes all discovered regular files (including caches) and symlink target strings, and emits JSON to stdout. It does not read nested symlink target contents. It compares matching skill names only in the explicitly supplied installation roots. It does not scan plugin caches or prove host discovery, invocation, or task benefit. Missing paths and inspection errors are different results; errors produce a nonzero exit.

Work on repository source by default. Report an installed-copy difference and its affected paths; a difference alone is not an instruction to overwrite it. If installation was requested, inspect current target changes and use the installation workflow within that authorization. Do not edit installed copies as a side effect of source maintenance.

## Verify the changed behavior

When a skill update concerns test pruning, link the project's existing before-change snapshot and removal map. Identify the surviving behavior or known-incident witness for each removed case and compare its actual fault conditions and assertions; a lower test count alone is not evidence of better coverage or speed. Consolidate redundant guard cases while preserving distinct failure witnesses. Verify the affected behavior once and broaden only for a new failure or unresolved concern, without adding replacement matrices that mirror implementation branches.

Run `skill-creator/scripts/quick_validate.py` on each changed skill using the actual available skill-creator path. Run every new or changed helper with representative input; for the inventory helper:

```sh
python3 skills/jev-skill-maintenance/scripts/test_inventory_skills.py
```

For a rule change, exercise a realistic request using permitted local artifacts. Check the decision the rule should change, including a relevant failure or non-applicable case. Report exactly which validation ran: structure, helper execution, manual scenario review, independent agent behavior, host invocation, or measured user outcome. A structure check cannot establish the later levels. Do not add model calls, paid runs, or extra agents merely to claim validation.

Finish the maintenance entry with concrete results and remaining limitations. Give the main owner the entrypoint and state changes needed under the role contract; avoid concurrent edits to another role's files. Re-inventory after edits so source and installed-copy status remains explicit.
