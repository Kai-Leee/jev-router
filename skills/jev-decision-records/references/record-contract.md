# Decision record contract

Keep a readable Markdown explanation and exactly one fenced block tagged `decision-record` containing JSON. Paths in this block are relative to the explicit repository root, not the Markdown file. Link prose paths relative to the Markdown location. Never reference a secret file such as `.env` as evidence.

Required top-level fields:

- `id`, `goal`, `owner`, `next_trigger`: nonempty strings.
- `status`: `planned`, `running`, `complete`, or `blocked`. Complete means this record's stated work is done, not that the hypothesis was confirmed.
- `conditions`: nonempty array of strings defining comparison and limits.
- `sources`: array of `{id, path, sha256}`. Hash the actual source bytes. Empty is allowed before evidence is available.
- `claims`: array of `{id, kind, text, source_ids}`. Kind is `decision`, `hypothesis`, `measured`, `estimate`, `correction`, or `unknown`. Measured/estimate/correction need sources. For a numeric claim include the value, units, denominator and reproducible calculation in `text` or adjacent prose, citing the same source IDs.
- `costs`: array of `{role, basis, usd, source_ids}`. Basis is `actual_billing`, `api_equivalent`, `monthly_allocation`, `conservative_budget`, or `unknown`. USD is nonnegative number or `null`; `unknown` requires `null`. Numeric costs need sources. These categories are not automatically additive: subscription allocation and budget reservation must not be summed as separate provider charges.
- `unresolved`, `side_effects`: arrays of strings; empty means explicitly reviewed and none recorded.

Record current user authorization in prose with the supplied request's meaning. Do not fabricate a file source for a chat instruction. Mutable ledger/state files should be copied to an existing private run evidence directory before pinning a completed measurement, so later legitimate updates do not invalidate old records. Store exact measurement commands and their outputs there as appropriate. No invocation of this skill alone creates permission to run those commands against paid services.

For a correction, preserve the earlier claim text and add a `correction` claim identifying what changed, why, and the validating source. Source hashes establish file identity, not external provenance or scientific validity.
