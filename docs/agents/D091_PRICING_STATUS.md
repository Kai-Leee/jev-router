# D091 pricing — candidate profiles and opt-in reference policy v2

Owner: pricing. Only this new D091 worktree was edited. Production edits ended; root and model_routing received exact source hashes before freezing. Public documentation GETs only; no model/account/Docker/ledger operations or old result changes.

## Official evidence and candidates

Applied OpenAI Docs skill from `/Users/lee/.codex/skills/.system/openai-docs/SKILL.md`; checked preserved local v1 pricing, searched/opened official model/pricing pages, then saved seven public GET snapshots in `benchmark-runs/d091-codex-20261016-01/pricing/`. `sources.json` contains source URLs, response status, timestamps, byte sizes and SHA256. Exact model pages all document `high`, context1,050,000, max input922,000 and max output128,000. These are documented API capabilities, not proof of account availability or actually served identity. Parameter counts remainnull.

Prices are USD per1M tokens, Standard only:

| Exact model | Short input/read/write/output | Long input/read/write/output |
| --- | --- | --- |
| gpt-6.1-sol | 2 / 0.10 / 2.50 / 10 | 4 / 0.20 / 5 / 15 |
| gpt-6-sol | 2 / 0.20 / 2.50 / 10 | 4 / 0.40 / 5 / 15 |
| gpt-6-luna | 0.10 / 0.01 / 0.125 / 0.50 | 0.20 / 0.02 / 0.25 / 0.75 |
| gpt-6-astra | 10 / 1 / 12.50 / 50 | 20 / 2 / 25 / 75 |

Short is up to272K input per request; long above272K. Do not select a billed context regime from aggregate multi-turn CLI input. Cache reads/writes are subsets of input; cache-write uses its replacement rate. Batch/Flex/Fast/Ultrafast/regional/tool rates are excluded. Actual subscription charge, strict API equivalent, unreported cache-write and effective tier/served identity remainunknown/null as in v1. Scenario assumptions remain explicit.

The new6.1 scenario object is exactly equal to preserved v1. V1 raw contract SHA remains `44fd59f4e2ecdf2e8d027a9b46410f20fa1fc301b47aa1cf980e0f01ce2cac45`; neither old rates nor raw D090 outputs were changed.

## Files and API

- New `docs/orchestration/contracts/codex-pricing.v2.json` stores exact four price/capability candidates with per-model source refs. It binds inherited v1 source SHA.
- `src/benchmark/codex-pricing.mjs` supports lazy v2 through `codexPricingContract({version:'v2'})`, `assertCodexPricingSource(expectedSHA,{version:'v2'})`, `codexPricingProfileEvidence(model,{policy:'v2'})`, and `codexReferencePricing({...,pricingVersion:'v2'})`.
- Profile evidence is `{model,priced,scenarios,capabilities,source,source_refs,reason}`. Unknown exact models returnpricedfalse/scenariosnull; no fallback. Model router owns the intersection with actual frozen app-discovery models/high.
- `runCodexAttempt({referencePricing:'v2',...})` explicitly selects v2. Defaultfalse stays off, `true` stays v1; exact requested model selects its registered rate.
- Usage summaries include per-model scenario subtotals only for v2 receipts; missing/unpriced rows invalidate full totals with known subtotals separately retained. Strict/actual fields staynull.
- `codex-e2e-decisions.mjs` permits `profiles` only when providerJev, manifest `worker_routing:'jev-model-size-v1'`, and metadata `profile_kind:'codex-worker-v1'`; historical four stages are unchanged.

## Verification

`node --test test/codex-pricing.test.mjs test/codex-pricing-v2.test.mjs test/codex-provider.test.mjs` — initial **24/24 pass, no skips**, evidence `benchmark-runs/d091-codex-20261016-01/pricing-tests-focused.tap`. A subsequent rerun after adding inherited-v1 source-drift coverage could not start three files because the concurrently edited gateway imports the not-yet-created `codex-worker-profile-router.mjs`; this zero-test import failure is preserved in `pricing-tests-final.tap`, and root was notified. Rerun after model-router generation is still required. New tests cover exact rates/high/limits, v1 isolation, missing-model refusal, cache arithmetic, mixed-model totals, both v2 and inherited-v1 source drift, provider explicit opt-in, and conditional profiles-stage guard.

Production hashes sent to root/model_routing:

- v2 contract: `27ce66b15ba0018e290181a62059990091d3288f55e3705a03c46aae0301752d`
- pricing module: `5a0522441a6a3494a85dfbfe37ef5a84301befaff91763c8a77b8da5bab939cc`
- provider: `678a0aa7b0cb2a43249a36e98fb4f00edf07febf160b081d975f9d1ff3b40a0e`
- decisions: `47ca555fdc9163aa22eac388e953a5943927ff5207f4eb8ec47da43799d01ee9`

This role does not claim model-selection quality, actual latency, completion gains or actual billing. Root owns source-pin refresh, app/account profile availability, actual three-condition execution and outcome audit. Side effects are the new v2 contract/test, edits to the three authorized modules, and public source snapshots/status notes in this worktree.

Root follow-up: gateway import was corrected to the model_routing role's actual `codex-worker-profiles.mjs`. Root owns the remaining combined validation after that role finishes its validator. Per root instruction, this role will not rerun overlapping tests or edit the four frozen production files. The initial24-pass and intermediate module-import failure evidence remain intact. `pricing-validation.json` records unchanged v1 bytes against the actual D090 worktree, unchanged6.1 rates, official capability/rate profiles and source hashes; its arithmetic examples are synthetic, not inference usage.
