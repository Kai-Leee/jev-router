# Public failure owner evidence — 2026-10-15

Purpose: retain the inferred owner decision, while preventing a catalog-owned source/template implicated by public import or traceback evidence from silently disappearing from the selected repair union. General source matching; no fixture IDs, module names, hidden grader results, or new model calls.

Owned changes:
- `src/orchestration/adaptive-public-owner-evidence.mjs`
- `test/adaptive-public-owner-evidence.test.mjs`

APIs: `collectPublicOwnerEvidence({planning,failure,candidateDirectory})`, `attachPublicOwnerEvidence(request,evidence)`, `applyPublicOwnerEvidenceScope({candidates,analysis},{plan,evidence,failure})`, `assertPublicOwnerEvidenceCoverage(candidate,evidence)`, `selectPublicOwnerEvidenceScope({candidates})` (returns null without public expansion; caller falls back to existing selector).

Evidence collection reads only catalog-owned Python files/templates under candidate; rejects unsafe paths/symlink components/non-file/oversized/non-UTF8 sources and uncertain public reports. It matches exact owned-source traceback lines, literal missing-module imports, or dynamic absolute Python template imports following public ModuleNotFoundError and observed successful installed-CLI generation. Dynamic matches remain repair hypotheses, not fault proof. README snippets and relative imports do not match that rule. Plan/failure/source hashes and excerpts are recorded. Model answers stay intact; deterministic public candidate union is independently labelled and keeps inferred/causal authorization seals.

Validation:
- `node --test test/adaptive-public-owner-evidence.test.mjs` → 4/4 pass. Tests cover renamed generic IDs, nonmutation, proof drift, no-generation/relative-import exclusions, closure/omission, uncertainty, traceback ownership, symlinks.
- Frozen prior Codex round0 replay: 15 public failure observations, 31 owned Python sources, 65 links. Required candidates **A16 and A19**, selected repair union changes A03/A15/A21 → A03/A15/A16/A19/A21. `validateInferredRepairCandidate` accepted the new sealed union against exact frozen prior plan/failure/bindings. This is authorization/provenance validation, not an actual repaired product test.
- Initial full context exceeded repair budget (`SINGLE_CASE_OVER_TARGET`); preserved `packing.json`. Changed transmitted representation to one copy per source line plus indexed public observation references. Compact context 2949 bytes; exact old canonical request repacks into 6 parts, 6/6 retain evidence; `packing-compact.json` records within_budget true. This remains token-estimate/structure validation, not provider acceptance.
- Full controller evidence is 46615 bytes. Candidate carries a sealed compact evidence projection instead, with reference to the full original SHA; exact final compact scope validation is `frozen-scope-validation-compact.json`.

Evidence directory: `benchmark-runs/codex-repair-20261015-01/owner-evidence/`. Existing old experiment files were read only. New evidence uses exclusive writes.

Integration owner: partial_repair wires executor policy/hook and audit, root wires selector fallback, policy manifests/pins, live pair. No edits to executor/provider by this role. No paid calls, ledger mutation, git commit/push, containers, or global config changes. New local source/test/status and evidence files remain uncommitted.
