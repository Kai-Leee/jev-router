# Token prices and current subscription

Verified 2026-10-09, read-only official documentation and authenticated account UI. Prices are USD estimates, never proof of incremental billing.

## Jev monthly allocation

The official [pricing page](https://jev-ai.pro/pricing), with Monthly selected, lists Creator at USD29/month with60,000,000 input balance tokens. The account page independently showed Creator, monthly billing active, USD29/month. No account settings or purchases were changed; no identity details are copied here.

Allocation estimate = confirmed `paidInputTokensUsed` ×29 /60,000,000. Thus1000000 balance tokens represent USD0.483333333333… of the monthly allowance. Use the exact ratio, not the rounded USD0.483 UI label. Output tokens are free. Raw model inputs and balance tokens can differ by model multiplier; use the billing receipt. Missing paid-token receipts remain unknown, including credits fallback. Cache categories are not separately billed by this endpoint.

This assumes allocation of the monthly fee across the entire included allowance. It does not measure actual incremental charges, unused allowance, rollover economics or purchased packs. The source and check date are included in the dashboard response. The current plan is an explicit local pricing profile, not an automatic account subscription sync.

The pre-existing USD1 shared safety ledger remains at the more conservative USD0.60/M. It is displayed separately and is not reset or loosened by this UI change.

## Claude official API equivalent

[Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing) lists Claude Opus5.5 per million tokens: uncached input USD4, output USD20, cache reads USD0.20,5-minute cache writes USD5,1-hour cache writes USD8. Thinking tokens are part of output, not an additional charge category.

Estimate = `(input×4 + output×20 + cache_read×0.20 + cache_write_5m×5 + cache_write_1h×8) /1000000`.

Unknown model rates or missing cache TTL stay unknown, with known partial sums preserved. Final model usage takes precedence; per-model TTL is assigned only when its usage can be matched without ambiguity. This standard API list-price equivalent does not assert the actual charge for an OAuth subscription.

Actual attempt04 cross-check: input52, output52563, cache-read1488059,1h cache-write84670 and5m cache-write0 produce USD2.0264398, exactly matching the CLI's reported list-price estimate. Source: `benchmark-runs/e2eswe-d020-04/result.json`. This amount excludes the independent monitor processes.

## Failure and test boundaries

[Failure analysis](research/D020_FAILURE_ANALYSIS.md) preserves the original outcome and separately labels any diagnostic installation intervention. No new paid inference is needed to calculate prices or independently grade a frozen artifact.
