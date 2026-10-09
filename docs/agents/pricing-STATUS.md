# Pricing implementation status

2026-10-09 (Asia/Seoul). Role: [pricing/failure update](PRICING_FAILURE_UPDATE.md).
Owned: `src/dashboard/pricing.mjs`, pricing integration in `src/dashboard/metrics.mjs`,
`test/dashboard-pricing.test.mjs`, and this status. No other implementation files were changed by this role.

## Implemented calculation

- Each provider exposes `pricing` with basis, source URL/verified date, currency, per-million rates,
  token basis, optional plan, fixed notes, and category `estimated_usd` values in the existing Metric shape.
- Claude Opus 5.5 standard official rates per million are input 4, output 20, cache read 0.20,
  5-minute cache creation 5, and 1-hour cache creation 8 USD. Source verified by main this turn:
  <https://platform.claude.com/docs/en/about-claude/pricing>.
- Input/output/cache read/cache creation are disjoint cost categories. Cache TTL split is shown separately
  and included once in total. Thinking tokens are already part of output; they are not added again.
- Final `modelUsage` remains authoritative. Its missing cache TTL may use final main-loop `usage.cache_creation`
  only for a single model row whose full input/output/cache read/cache creation token vector matches.
  Multi-model or mismatched scopes never borrow the narrower TTL. Unknown positive TTL leaves cache price null.
- Live assistant output placeholders do not become prices. Input/cache observed costs may appear as partial
  estimates, while full totals remain null. Unknown models are not priced using Opus rates.
- Category coverage counts model rows. Claude total coverage counts four disjoint model-token-category cells
  per row. Its observed subtotal may remain available while one category is unknown; value requires full coverage.
- Main verified the current Jev Creator monthly plan through `/pricing` and account UI: 29 USD/month and
  60,000,000 included input allowance. Source metadata: <https://jev-ai.pro/pricing>, verified 2026-10-09.
  Displayed allocation is `paidInputTokensUsed × 29 / 60,000,000`, not raw input tokens or an actual per-call bill.
- Output allocation is zero only for observed output usage. Cache prices remain not applicable/unknown.
  Positive or incompletely observed credits make total price null; the known paid-token allocation can remain
  an observed subtotal. Credits are not converted to USD or added to the allocation estimate.
- Existing reported/billed USD fields and the separate conservative shared USD1 execution budget are unchanged.

## Actual verification

Run from `jev-router`:

```sh
node --test test/dashboard-pricing.test.mjs test/dashboard-metrics.test.mjs test/dashboard-reader.test.mjs
```

Result: **73/73 passed**, failures 0, skipped 0. This includes 13 new pricing tests, 51 current metrics tests,
and 9 reader tests. Cases cover mixed TTL, one-hour usage, scope mismatch, unknown TTL/model, live output,
invalid tokens, subscription allocation, missing paid billing, positive/incomplete credits, privacy and partial sums.

An additional read of `benchmark-runs/e2eswe-d020-04/result.json` projected only usage/model/cost fields and fed
the receipt through `summarizeRun`. Its observed 52 input, 52,563 output, 1,488,059 cache-read and 84,670
one-hour cache-write tokens give:

```text
52 × 4 / 1,000,000              = 0.000208
52,563 × 20 / 1,000,000         = 1.051260
1,488,059 × 0.20 / 1,000,000    = 0.2976118
84,670 × 8 / 1,000,000          = 0.677360
sum                            = 2.0264398 USD estimate
```

This exactly matches its recorded `claude_reported_cost_usd: 2.0264398`; the same vector is a regression test.
The independent wrapper gate-completion failure does not discard valid completed provider usage or turn this
reconciled provider price into an incomplete subtotal. Actual billed USD remains null.

Review found that zero paid tokens can coexist with positive credit charging. The first implementation's
subscription-only total could incorrectly display zero in that case; the credit-completeness guard and tests
now keep total unknown. Main separately corrected an older privacy test that searched raw substring `333`:
the new legitimate recurring-decimal subscription rate also contains those digits. This role did not change
that metrics test or weaken its structured PID-leakage intent.

## Limits and side effects

Price-list calculation and monthly fee allocation are estimates, not invoice reconciliation or proof of marginal
subscription charges. No new paid inference, replay, budget change, key/config access, Docker operation, server
operation, existing Personal OS change, commit or push was performed. Main owns full-suite and live UI checks.
