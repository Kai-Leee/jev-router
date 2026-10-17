# D090 pricing — implementation and source evidence

Owner: pricing. Only the new D090 worktree was modified. No account/model calls, Docker operations, original ledger reads/writes or historical result changes occurred. Applied the OpenAI Docs skill at `/Users/lee/.codex/skills/.system/openai-docs/SKILL.md` to select official documentation and verify the exact requested model.

## Source capture

Official domain search and opened pages confirmed the exact `gpt-6.1-sol` model and Standard pricing. Public-only GET snapshots and SHA values are recorded in `benchmark-runs/d090-codex-20261016-01/pricing/sources.json`:

- `https://developers.openai.com/api/docs/pricing` — raw HTML and Markdown.
- `https://developers.openai.com/api/docs/models/gpt-6.1-sol.md` — model-specific pricing and context threshold.
- `https://developers.openai.com/api/docs/guides/prompt-caching.md` — cache-write accounting and reported token subsets.

Capture checked date:2026-10-16. Initial sandbox curl attempts failed DNS resolution and wrote no snapshots; authorized public GETs outside that network sandbox then succeeded. The four successful requests are documentation-only, not inference/account endpoints.

Exact Standard rates per1M tokens:

| Scenario | Ordinary input | Cached read | Cache write | Output |
| --- | ---: | ---: | ---: | ---: |
| Short Standard | USD2 | USD0.10 | USD2.50 | USD10 |
| Long Standard | USD4 | USD0.20 | USD5 | USD15 |

The model page and Standard table agree. Batch/Flex are separate lower-price tables and are excluded. The context threshold is272K input tokens per request, not accumulated input across CLI turns. Regional and tool premiums are not established by this CLI telemetry and are excluded from reference scenarios.

## Files and API

- `docs/orchestration/contracts/codex-pricing.v1.json` freezes the requested model table, source snapshot hashes, subset semantics and assumptions.
- `src/benchmark/codex-pricing.mjs` exports `codexPricingContract`, `assertCodexPricingSource`, `codexPricingTraceDetails`, `codexReferencePricing`, `summarizeCodexReferencePricing`.
- `src/benchmark/codex-provider.mjs` accepts opt-in `referencePricing:true`; defaultfalse preserves historical receipt field shape. Only opted-in receipts add `reference_pricing`. Existing `api_equivalent_usd` and `actual_billed_usd` remainnull.
- `src/benchmark/codex-e2e-decisions.mjs` conditionally adds `reference_pricing` to usage groups when opted-in records exist. Codex reference scenarios are separated from historical Jev token-pack-equivalent and actual monthly billing.
- `test/codex-pricing.test.mjs` covers cache arithmetic, incomplete/invalid usage, unknown models, contract substitution, multiple turns, opt-in/legacy output, aggregation and app drift.

Cache reads and writes are both subsets of native input. The replacement formula is `(input - cached_read - cache_write) * ordinary_rate + cached_read * cached_rate + cache_write * write_rate + output * output_rate`; cache-write is not an additive fee and reasoning is not added to output twice.

If cache-write counts are absent, `cache_write_tokens` staysnull and strict API equivalent staysnull. The short/long scenarios explicitly assume zero unreported writes while retaining any observed partial write subset. Each also reports the hypothetical all-noncached-input-written endpoint. Unknown/invalid input/output/cache or an unregistered requested model yieldsnull scenario totals. A group containing a missing/unpriced Codex row hasnull full scenario total and a separately labelled known subtotal.

Requested model pricing is a reference proxy, never a verified served-model billing identity. Effective tier, per-request context, region/tool charges and actual ChatGPT subscription allocation remain unverified. No aggregate CLI input heuristic selects one scenario as the actual price.

## Verification and source freeze

Focused verification: `node --test test/codex-pricing.test.mjs test/codex-provider.test.mjs` — **18/18 pass** (`pricing-tests-focused.tap`). The first focused attempt passed16/17; its app-drift mock used `auth:null` and was rejected during environment setup before the intended assertion. The fixture now supplies mock ChatGPT auth/model discovery; both before-dispatch known failure and after-dispatch uncertainty retain correct submission/usage evidence, with retry0. No real authentication was queried.

Broader pre-pin verification across pricing/provider/environment/decisions passed26/29, with three `POINTSMAN_SOURCE_CHANGED` failures against the newly edited pricing module before root refreshed gateway pins. Evidence `pricing-tests-regression.tap` is preserved. Root was told to refresh pins and rerun; those source guard failures were not hidden or reclassified as passed.

Production sources were frozen with hashes:

- pricing module: `c84a89e01d4b125802252de6d40d2e1c9ffa3759aa635764141d98ae3d78e73e`
- pricing contract: `44fd59f4e2ecdf2e8d027a9b46410f20fa1fc301b47aa1cf980e0f01ce2cac45`
- provider: `f0f05a22c39ba3f11f9f2e4f27c478fa88ad1b61e671fd7a0df88bea5b948e2e`
- decisions summary: `cd480fe207942f9934625d1ce05edd245592bab6a9ccaaac695949e24bb84eaf`

Root owns final pin refresh, final integration checks, paid pair and independent outcome analysis. No claim of improved development completion, runtime or actual cost is made by this implementation task. Side effects are new source/test/contract files and documentation snapshots/audits in the new D090 worktree only.
