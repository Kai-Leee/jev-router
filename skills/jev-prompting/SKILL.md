---
name: jev-prompting
description: Draft or revise Jev Router typed decision questions and evidence packets, and use its offline and required pre-send checks with the applicable recovery policy.
---

# Jev prompting

Current D083 integration: use `benchmarks/e2e-swe/manifests/pointsman-d083.json` for the required skill/gateway path and read `skills/pointsman-routing/SKILL.md`. D083 uses layered-v2 planning, profile v3, inferred owner v3 and repair-budget-v3; its question wording is loaded from those contracts. The new gateway checks registered wording/structure and records each request before sending. Historical D075/inferred-v2 commands below remain reproducibility guidance for that path, not a validator for all D083 questions. The old D083 manifest remains preserved; do not silently select it as a fallback when the opted-in gateway blocks.

Resolve project paths from the Jev Router repository root, including when reading an installed copy. Read `AGENTS.md` and the current role contract. This skill prepares bounded decisions that code can execute; it does not turn a proposed prompt into measured routing quality.

Use the current question contract instead of generating a new question on each loop. For projected owner inference, the fixed English text is in `docs/orchestration/contracts/adaptive-inferred-repair.v2.json`; its baseline builder is `src/orchestration/adaptive-inferred-repair-projection.mjs`. D075 uses `docs/orchestration/contracts/jev-prompt-policy.v2.json` and its separately pinned transmission/recovery policies. Read [official guidance](references/official-guidance.md) when authoring or changing a question or connection rule.

## Put the judgment in the right place

| Responsibility | Use |
| --- | --- |
| Parsing, membership, current artifact/owner bindings, permissions, known error handling, answer combination | Deterministic code and existing contracts |
| A bounded interpretation with supplied evidence and enumerated existing alternatives | Jev typed question |
| New hypotheses, missing-evidence investigation, substantial prompt redesign, code implementation | Claude or the assigned development agent; verify the resulting artifact with public checks |

This division is project policy. After a valid Jev choice, execute its documented handler without asking Claude to repeat the same judgment. Missing, invalid or unresolved answers and new evidence follow their explicit next action.

## Write a complete, focused question

- Put the full judgment and target in `instructions`. Question IDs are code keys, not model-visible meaning. Name the relevant case/task/artifact and point to precise state paths in backticks.
- Give each question one decision. Describe option boundaries in `criteria`; do not ask one label to encode a new plan, proof of cause and execution approval together.
- Use `choice` for a known alternative, `score` for an ordered rubric, and `noul` for a stated yes/no proposition. A score can be fractional; it is not a worker count or a multi-select result. Keep action mappings explicit and use the current policy rather than adding a new threshold.
- Independent questions can share one state. A question cannot use another answer from the same request. Make a later request when the actual earlier answer is needed to construct its state or alternatives.
- Keep English as the project's default for questions and criteria; preserve source clauses, code and identifiers in their original meaning. The manufacturer's English recommendation is not a project-specific accuracy measurement.
- TypeSafe supports structured instructions, but the current repository adapter accepts a string. Do not copy an object-valued instruction into this adapter or silently stringify a new format without a supported contract.

For a fixed runtime template, fill only its documented variables and candidates. A deliberate wording change is a contract change requiring its own local validation; it is not an ad hoc edit to make one checker pass.

## Supply sufficient evidence once

For failure ownership, include the actual observed failure, expected behavior, relevant original requirements, and the existing artifacts' interfaces, paths and owners. Preserve dependency observations, attempted changes and unresolved or unexecuted checks when they affect the decision. A chosen owner is the next investigation/repair hypothesis, not a proven defect location or a claim that all causes were found.

Use structured state to keep related material together. Remove repeated framing only when the remaining input preserves the decision's meaning. A local path, hash or controller-side restoration proof does not let Jev read omitted source text. Keep relevant excerpts inline and retain provenance separately. Preserve unfamiliar failure fields or use the documented fallback instead of silently dropping them.

For current owner inference, keep `unknown` and the complete current artifact allowlist. Unknown remains unresolved; an unexecuted assertion is not a failed owner. Bind a returned artifact through the existing `applyInferredRepairOwners` handler to the verified current task, worker and allowed paths. Validate the complete answer envelope and bindings before applying any answer. Do not invent a worker, file or permission from model text.

## Run the supported offline check

From the repository root, inspect the actual serialized request with:

```sh
node scripts/validate-jev-prompt.mjs --request REQUEST.json --stage repair_owners --template inferred-v2 --policy v2
node scripts/validate-jev-prompt.mjs --connection-only --policy v2
```

For a credential-free example, replace `REQUEST.json` with `examples/jev-preflight/inferred-v2.request.json`. Its inline evidence is synthetic, not a benchmark result.

`--out NEW.json` optionally saves a new report. Exit `0` means the supported checks passed, `2` means blocked, and `1` means a CLI/I/O error. The prompt checker supports **projected inferred-v2 owner attribution only**. Other stages and `raw_request_fallback` are unsupported, not validated by analogy. It reuses the adapter and v4 input checks; it does not add a local token budget.

The CLI still defaults to historical policy `v1`; use explicit `--policy v2` for D075. A legacy `SOURCE_DRIFT` against changed handler code is a pin mismatch, not a reason to rewrite the old policy or past passing results. Follow the current source freeze and policy pins; an earlier standalone pass does not authorize a later changed request.

The prompt check covers fixed wording, structural evidence links and handler bindings. It neither executes the handler nor verifies runtime revision authorization. It cannot establish English quality, free-text meaning, evidence truth/sufficiency, judgment accuracy or exact model context fit. The connection check uses a mock transport, not the user's credentials, deployment environment or live account. Neither command performs a live model lookup or inference.

## Follow the actual gate and recovery path

Use `docs/orchestration/D075_FORCED_PREFLIGHT_AND_RECOVERY.md` for current execution. The preserved CLI defaults to `benchmarks/e2e-swe/manifests/d075-preserved-repair.json` (v10), requires an explicit source run, and uses required transmission preflight plus `evidence-loop-v1` recovery and `evidence-v1` input reconstruction. Explicit legacy manifests retain their own behavior. A later improved candidate is a different starting condition; terminal repair history must pass the runner's supported binding checks rather than being reset.

The v10 gate uses `docs/orchestration/contracts/jev-transmission-preflight.v1.json` and prompt policy v2. It checks exact request serialization, policy/source pins and adapter/v4 constraints for covered stages; only projected inferred-v2 owner questions receive the fixed-prompt check. Reconstructed repair inputs also use their wire validator. Do not report generic stage checks as question-meaning or reconstruction-quality certification.

Inspect the `initial`, `before_reservation` and `before_post` reports and the receipt's actual reservation/send fields. A block before reservation has no reservation or POST; a later block can leave a reservation with POST0. Preserve that outstanding state for reconciliation. An `inference_started` event is dispatch intent, not proof of a provider call.

Recovery follows `docs/orchestration/contracts/adaptive-failure-recovery.v1.json`. No progress requires new relevant, controller-verified source observations before another owner/profile/worker attempt. Reordering or merging the same source ranges, a new attempt ID, wording or model/effort alone is not new evidence. Even partial overall improvement can leave an unchanged failed artifact needing investigation. Request rebuilding must preserve the applicable choices/authority and pass its changed-input proof and actual transmission gate.

Uncertain outcomes or outstanding settlement stop at reconciliation without a recovery callback. Policy/source integrity failures are not bypassed by repackaging. Account, connection, verification-environment and independent-check states need their external evidence; this path does not automatically fix them or configure paid transport retries. Record recovery assessment, callback completion and actual worker/provider execution separately.

## Record the next action and its evidence

`docs/orchestration/D074_PROMPTING_AND_FAILURE_LOOP.md` preserves the original design and offline validation. Its unimplemented-at-the-time branches are not D075 execution receipts. Preserve known failure, uncertain request outcome, billing settlement and product validation as distinct states; use the current run evidence to say which recovery branches actually ran.

Report the question/contract, model-visible evidence, typed answers and handler, the exact offline command and its supported scope, and any remaining unknowns. Use the existing `jev-decision-records` workflow for measured runs. Keep prompt proposals, mock checks, actual provider acceptance, worker changes, public/independent quality and total time/cost in separate evidence layers. This skill does not install itself or initiate paid calls.
