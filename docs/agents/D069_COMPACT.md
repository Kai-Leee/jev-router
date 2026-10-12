# D069 — compact artifact repair v2

2026-10-11. Owner: `d067_runner`. Root delegated this new module after the preserved v1 request of 70,510 UTF-8 bytes received HTTP 400 `model_input_limit`. That failed request and v1 implementation remain immutable. This is a separate offline implementation; root owns integration, provider calls, Docker and the real ledger.

## Goal and contract

Keep the exact selected requirements, selected artifact interfaces, candidate artifact/write authority, public failure and all 85 case results. Move repeated runtime/revision/check metadata and detailed read-only dependency contracts out of the decision wire into controller-held hash-bound evidence. One `context_ref` identifies that material; the model cannot fetch it. Direct dependency IDs, owners, paths and the unknown internal-dependency boundary remain inline. Worker packets keep their selected requirements/interfaces and necessary read-only dependency interfaces without copying the whole decision state.

The APIs remain `buildArtifactRepairDecisionContext(input) -> {state, report}` and `buildArtifactRepairWorkerContext(input) -> {task, context, report}` in the new `src/orchestration/adaptive-artifact-repair-v2.mjs`. The existing v1 builder supplies source/catalog/ownership/path validation; no v1 source is changed. The new contract is `docs/orchestration/contracts/adaptive-artifact-repair.v2.json`.

## Plan and limits

1. Preserve all original public cases, including failed assertion text and internal `not_reached` states. Never turn unexecuted into failed or passed.
2. Externalize only identified provenance/duplicate fields; retain unknown semantic fields and full failed setup/error evidence. Record every omission by pointer, hash, byte count and reason.
3. Retain original candidates, requirements, ownership and execution authority. Compactness does not prove root cause, independence or repair success.
4. Compare exact serialized decision requests from the immutable D069 recheck/probe with new packets. Target at most 24,000 bytes; report bytes separately from unknown model tokens. Oversize packets are not truncated or automatically expanded; the controller must locally block them before inference.
5. Run focused semantic preservation, provenance, scope and worker tests; save a new replay receipt with unchanged input hashes. No provider, Docker, key, hidden grader or real-ledger access.

## Implementation and offline result

The decision packet is **23,715 bytes for the complete serialized request**, including the unchanged original question and planner contract source. The preserved v1 request is 70,510 bytes, so the measured reduction is 46,795 bytes (66.366%). State alone is 21,779 bytes. This does not measure model tokens or establish provider acceptance.

All 85 original public case records restore exactly from inline tables; the result remains 84 passed and one failed. The failed `A.integration.diagnostics.existing-output-refused` assertion and three `not_reached` assertions remain unchanged. Candidate invocation numbers/exit codes and local statuses/assertion counts also restore exactly. Repeated table keys use explicit `columns`, `rows` and untouched `details`; exact common check values are provided as inline defaults. These are model-readable values, not controller-only references. A raw field colliding with a generated defaults field causes the known local error `ADAPTIVE_ARTIFACT_REPAIR_ENCODING_COLLISION` before any call, without overwriting that field.

The controller report records 646 provenance/duplicate/worker-only omission entries and 15 inline encodings. Every omitted input or legacy-packet pointer resolves to its original SHA and byte count. The single context hash binds the full planning/failure/candidate/binding input hashes, original v1 packet hash and v2 contract. The 14 detailed dependency interfaces and their source quotes leave the **decision** packet but remain in the relevant **worker** packet. This is a documented move of worker-only information, not a claim that every removed byte was redundant.

The offered scopes are unchanged: `repair-failure-owners` permits only A03 / `adaptive-leaf-n9`; `repair-failure-owners-and-consumers` permits A21+A03 / `adaptive-leaf-n3`+`adaptive-leaf-n9`. Public-interface attribution remains a candidate for repair, not fault proof. Unselected artifacts still retain prior bytes and all public checks rerun. Worker packet sizes are 17,834 bytes for the owner-only option; 29,616 and 17,820 bytes for the two consumer-option workers. The generator worker keeps 14 full dependency interfaces. The 24,000-byte target applies to the Jev decision wire, not this Claude worker context.

Evidence: `benchmark-runs/d069-compact-replay-01/receipt.json` with replay source, v2 request/state/report and worker packets in the same directory. Its 14 gates passed, including exact v1 reconstruction, original input/v1 source hashes unchanged, case/authority/requirement preservation, all omission pointer/SHA verification and full-wire size. The private replay writes new files with exclusive creation and never overwrites prior evidence.

Validation command: `node --test test/adaptive-artifact-repair.test.mjs test/adaptive-artifact-repair-v2.test.mjs` — **8/8 passed** (four v1 compatibility cases and four v2 semantic/provenance/authority/overflow cases). Missing fields remain missing, explicit null remains null, unknown nested semantics and failed setup/error payloads remain exact. An oversized unfamiliar payload is preserved; the builder reports `wire_guard_required:true`, while the caller must measure and locally guard the complete request. Neither `wire_target_met` nor model tokens is guessed by this state-only builder.

Production source freeze:

- `adaptive-artifact-repair-v2.mjs`: `3e4114e19dab56766b2daf15a2e54feadccf1d4646992cbf6613b4eaf3716b6c`
- `adaptive-artifact-repair.v2.json`: `fd715ffcd942c5abf2ecb09f5736f4af6b2bd67a663a91b028e527c7c863f337`
- `adaptive-artifact-repair-v2.test.mjs`: `b1e1f65f32b99d6481700c19738f73c1935bdd8de0edec0dc635803bfa421269`

Status: implementation and offline verification complete; source frozen pending independent review. This subagent performed **0 provider calls, 0 Docker calls and 0 real-ledger writes**. Root owns the separate integration, complete-wire admission and any new actual inference. Actual v2 provider acceptance and end-to-end repair remain unmeasured in this handoff.
