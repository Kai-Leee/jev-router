# D073 independent integration review

Reviewer: `/root/d071_review`. Started 2026-10-12 Asia/Seoul.

Purpose: independently verify that the opt-in D073 path turns Jev's public-failure ownership hypotheses into repair of existing artifacts without widening authority, while removing only local token/byte operating ceilings requested by the user. Product quality, service acceptance, time and cost improvement remain unmeasured until root's actual runs finish.

Read: current repository `AGENTS.md`, `D073_PARALLEL.md`, `D073_EXPERIMENT.md`, current decision/state records, and `skills/jev-decision-records/SKILL.md`. User instructions and the D073 role contract take precedence over historical D071/D072 ceiling descriptions.

Scope: manifest v8 and runner dispatch; admission v4; inferred-owner contract/result validation and executor integration; profile v2 opt-in behavior; preserved D071 profile candidate repair; source pins and pre-POST reservation order. Check historical v7/v3 behavior and contracts remain available, official request/schema bounds remain, typed IDs resolve only to current artifact/owner/path allowlists, public failure and unknown observations survive, immutable reads stay revision-bound, and no paid owner callback precedes a valid public baseline.

Ownership: only this record and new `benchmark-runs/d073-review-01/` evidence. No production edits, provider calls, Docker, real ledger access, hidden-grader contents, candidate edits, or additional agents. Root alone runs the actual experiment. Blockers go to root and the implementing owner with exact evidence; this reviewer does not patch their files.

Status: structure review in progress; no launch approval. Implementers are still integrating. After the final source freeze, run only needed focused offline checks and preserve source hashes plus control-flow proof. Fixture success is not provider acceptance or completed repair. Keep all D071/D072 evidence immutable.

Next: review current interfaces and failure/authority boundaries, receive final source handoffs, verify focused checks against frozen bytes, then issue a machine-readable prelaunch review result. Closeout requires actual invocation/model identity, public93 + independent63, and separate accounting for preserved repair versus new development.

## Structure review before final freeze

No blocking finding in the reviewed current path. The independent review covers the following actual call chain, not an assumption based on file names:

1. Explicit manifest v8 selects admission v4, inferred-owner repair, and profile `provider-limits-v2`. Historical v7 and default bounded profile v1 remain separate branches. The catalog generation prompt/schema is rechecked against the preserved D066 request.
2. Current public failures and revision-bound existing artifacts form one typed owner question per observed failed case. Answers can name only an existing artifact or `unknown`; the controller resolves the existing producer task. Complete answer coverage, original task/read/write contracts, artifact paths/revisions, source/catalog, public/local evidence and original requirements are checked before application.
3. A preserved candidate must reproduce the original complete public failure and exact original bytes, modes and revisions before the first owner callback. The executor invokes `beforeRepairDecision` before owner inference or repair selection. Inference is durably recorded before its narrowed candidates are used.
4. Selected artifact writes stay narrow; additional causal reads come from immutable, revision-bound snapshots. Unselected outputs are carried forward. Unknown and other observed failures remain explicit; not-reached assertions do not become observed failures. Controller-only authorization metadata has a reconstruction record, while original public failure values remain inline.
5. Jev selects a new model/effort only for selected repair tasks. Committed selection updates the current plan, dispatch map and worker context; CLI receives the resolved allowlisted model and effort. Effective internal effort is still unknown.
6. `prepareDecision` and v4 admission precede the budget lease, reservation and inference invocation. Only local estimate/operating byte ceilings become warnings; official 256000-byte body/schema, model/stage/hash checks and zero automatic retries remain. New `repair_owners` error classification is included in the root's frozen source set.

Root launch helpers also require independent review and exact source hashes, preserve historical files, keep the two starting states separate, and make success time conditional on public93 plus independent63. Historical D071 comparisons remain descriptive single-run observations; neither provider acceptance nor repair quality has been established by this review.

## Frozen prelaunch result

Independent structural approval is recorded in `benchmark-runs/d073-review-01/prelaunch-final.json`: `status: passed`, no failed checks, 56 final source hashes. `control-flow-evidence.json` records the reviewed source-bound guard ordering required by the accounting helper. Neither artifact asserts provider acceptance or product completion.

- Focused existing tests: 47/47, no failures, skips or cancellations; 13,759.53 ms. Production sources stayed fixed throughout.
- Whole regression: the original 1,217-case run passed 1,205 and hit localhost `listen EPERM` in 12 cases. Root preserved that TAP and reran only the affected three files in the permitted environment. The reviewer independently matched every original failed test name to a passing recheck and verified the log hashes; the combined denominator is 1,217/1,217, without counting duplicate passes. Only the launch helper changed afterward to require this reconciled evidence; its new bytes were reviewed and pinned.
- Historical admission v1/v2/v3, bounded profile v1/catalogs, causal sources, D071 manifest, public registry and assertion contract: 15 selected prior source hashes unchanged.
- Actual saved D071 input: independently rebuilt owner request and repair state, applied the saved mock inference without a callback, restored every original public observation, and verified three selected workers' narrow artifact writes. All 93 cases, 26 failed cases and four not-reached assertions remain exact. This is an offline replay, not a live decision.

The exact owner request is 187,715 bytes with 26 questions. Its heuristic total is 75,598 tokens and state-plus-longest-question is 56,836. The repair choice request is 91,369 bytes, with heuristic state-plus-longest-question 37,030. Both are `admit_observed` under explicit v4 policy, with warnings. These values exceed historical local references; provider rejection remains possible. No local ceiling was reintroduced and no provider acceptance, successful repair, speedup or saving is claimed.

One reviewer helper comparison initially omitted the planner-added `contract_source` field. The comparison was corrected by verifying that exact field separately and then comparing all remaining fields. The correction is preserved in `actual-input-verification-initial.json`; no production source changed.

Prelaunch review is complete. Root owns launch, real balance/settlement, public and independent verification, and the eventual comparison. A later source change invalidates approval for that changed byte sequence until re-reviewed.

Launch-only follow-up: root's helper initially read `original.pins` from a preserved manifest whose actual key is `files`, so it stopped before inference. The reviewer verified the exact three key replacements and two references to the new approval file, all 4,439 manifest rows' `{path, sha256, mode}` shape, unchanged other 55 source pins, and unchanged control-flow proof. Latest approval is `benchmark-runs/d073-review-01/prelaunch-final-02.json`; original approval and helper remain preserved. Only syntax was checked in this follow-up; no regression rerun, production changes, ledger access or model invocation occurred. Details: `launch-only-correction-02.json`.
