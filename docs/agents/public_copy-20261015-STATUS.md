# public_copy — 2026-10-15

- Purpose: draft positive, accurately scoped main publication and replace obedience framing with Jev + dependency DAG task routing.
- Output: `docs/release/R20261015_MAIN_DRAFT.md` only publication draft; English/Korean/Chinese taglines, introductions and measured result table.
- Read evidence: `origin/main` commit `8b2da35b419ecb568ca52a44c04c5bd9921aeafd`; D067 result document and raw analysis JSON; Codex Mac 2026-10-14 result document and raw summary.
- Validation: recalculated successful `jev_split_relations` versus `claude_all` time reduction 21.835321123194277% and historical API-rate-equivalent cost reduction 58.52136729280221%; both rows product_success, public passed, independent63/63. `git ls-tree origin/research` confirms D067 result document is already on research; Codex Mac result document is not.
- Scope: one concurrent observation per condition; stage wall excludes shared preparation and independent grading. Public copy labels cost equivalent and measurement scope. No fresh-run improvement claim.
- Remaining: root reviews/updates main in isolated tree, validates links and published code scope, integrates fresh rerun results when available. Root owns commit/push.
- Side effects: two Markdown draft/status files only. No paid calls, ledger change, README edit, commit or push.

## Extended main-copy implementation

Root extended ownership to the isolated tree `/Users/lee/workspace/plugins/pointsman-main-release-20261015`.
Updated three READMEs, package description/version, plugin description/version and CHANGELOG to 0.3.3;
added paired Korean/English `docs/MEASURED_ROUTING.md` and `.en.md`. Preserved usage/security guidance
and labeled research-runner versus released-client scope. Removed stale limitation/status duplication.
No new Codex speed headline included.

Validation: `npm run check:links` reports 46 tracked Markdown files / 227 links / 0 broken;
`node --test test/version.test.mjs` 1/1 passed; `git diff --check` clean. The link checker enumerates
tracked files, so root must stage new measurement documents before its final link check.
No inference, shared ledger change, code-runtime change, commit, push or merge performed.
Only side effects are the listed release file edits/new documents and `/tmp/pointsman-public-copy-20261015.py`.

## Final standalone review and staging

Root authorized staging the eight release files. Staged only `.codex-plugin/plugin.json`, `CHANGELOG.md`,
`README.md`, `README.ko.md`, `README.zh-CN.md`, `docs/MEASURED_ROUTING.md`,
`docs/MEASURED_ROUTING.en.md`, `package.json`. No commit.

Re-read source analysis plus D067_RESULTS and rechecked profile, denominator, time scope, checks and
cost basis. No unsupported complete-development/quality-generalization claim found in the selected
publication wording. The selected comparison is historical D067, not the current Codex rerun.
Source SHA256: analysis `75cd0b53a34447fffbaac5584b2e6136e4425e9a7c83cfbb78ffc93a1914fd05`;
D067_RESULTS `f9095e95f4c0b522ddf7b4503711a23d08938d1cf2d8cfa1172611095fa489d1`.

Post-stage validation: `npm run check:links` 48 Markdown / 241 links / 0 broken;
`node --test test/version.test.mjs` 1/1; `git diff --cached --check` clean.
