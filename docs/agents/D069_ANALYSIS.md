# D069 — read-only postprocessing

2026-10-11. Root delegated this additional role after the artifact-repair implementation handoff. Owned files are this note and `benchmark-runs/d069-analysis-tools/analyze.mjs` only. Production code is frozen for this role.

## Purpose and boundaries

Build a read-only arithmetic helper for the fresh D069 Jev-all run and historical D067 four-arm / D068 Jev-all evidence. Keep fresh development, preserved-candidate public recheck, one admission probe, independent grading and separate monitoring apart. Read original results, public execution events and provider receipts; do not invoke providers, Docker, a grader, ledger access, candidate mutation or hidden-test inspection. Requests/responses/receipts remain immutable.

The helper will accept an explicit `--output` path, reject existing paths and input-directory destinations, and write one new JSON file with `wx`. Missing or unfinished evidence remains incomplete; a dry run may inspect and summarize but never starts inference. Provider receipt totals, failed/unreported usage, cache 5m/1h/read tokens, official API-equivalent costs, monthly subscription allocation and actual bills remain separate.

## Planned interface and checks

`node benchmark-runs/d069-analysis-tools/analyze.mjs --run <fresh cohort directory> [--preserved-recheck <directory>] [--admission-probe <directory> ...] [--independent-grade <file>] [--monitor <directory>] --output <new JSON file>`

Historical inputs default to immutable D067 and D068 run directories, with explicit overrides. Output includes source paths/hashes, per-phase completeness and timing, raw receipt-derived accounting, actual POST/CLI/repair dispatch, assertion scope and unchanged-artifact proofs, public/independent completion, comparison denominators and limits. Product completion requires public85/85 and independently accepted63/63 with no skips; a chosen scope or an accepted decision alone is not completion.

Validate the helper locally using historical evidence, current incomplete D069 phase evidence and focused synthetic checks. No final D069 result is claimed before root's full execution and independent grade arrive. Source changes and final commands/results will be recorded below at handoff.

## Implemented interface and output

The helper imports only Node built-ins. `--validate-only` performs the same read-only aggregation and prints a compact summary without creating any file. `--self-test` runs focused accounting/path assertions without writes. Ordinary output requires an existing parent under `benchmark-runs/`, a `.json` suffix, no existing destination, and a destination outside all selected evidence directories. It uses an exclusive `wx` write. The helper verifies every read source hash and receipt-directory listing again before producing output; a changing run fails the snapshot instead of mixing two states.

Defaults are `d069-comparison-01`, `d069-preserved-recheck-01`, both admission probes `01` and `02`, and `d069-monitor-01`. Repeat `--admission-probe` to explicitly supply the complete diagnostic list when a later v2 probe exists; supplying the option replaces the default list. Probe discovery is intentionally not automatic. `--d067`, `--d068` and `--rates` accept explicit alternative evidence locations. The only permitted grade input is the current arm's `independent-evaluation.json`; no raw hidden grade files are read. Historical arms are recalculated from raw receipts/events rather than copied from old analysis JSON.

```sh
node benchmark-runs/d069-analysis-tools/analyze.mjs --validate-only

node benchmark-runs/d069-analysis-tools/analyze.mjs \
  --run benchmark-runs/d069-comparison-01 \
  --preserved-recheck benchmark-runs/d069-preserved-recheck-01 \
  --admission-probe benchmark-runs/d069-admission-probe-01 \
  --admission-probe benchmark-runs/d069-admission-probe-02 \
  --admission-probe benchmark-runs/d069-admission-probe-03 \
  --monitor benchmark-runs/d069-monitor-01 \
  --output benchmark-runs/d069-analysis-01.json
```

The second command is a future root-owned invocation, not a record that probe03 or the full run has happened. Add only intended diagnostic directories; a missing one remains incomplete.

`d069-analysis/v1` output contains:

- `phases.fresh_development`: current cohort/preflight metadata and one Jev-all arm, completion gates, actual receipt accounting, stage spans, CLI observations and direct HTTP timing.
- `phases.preserved_candidate_recheck`: new public recheck of unchanged historical bytes. Deterministic implementation callbacks and the mocked planner stop are not counted as model calls.
- `phases.repair_admission_probes.runs`: independent diagnostic rows, request/policy hashes, admission data, actual POST counts and terminal outcomes; the containing object sums diagnostic time and observed inference usage separately.
- `phases.independent_grade` and `phases.separate_monitor`: their own evidence, duration and monitor usage. A grade does not become development time or provider inference.
- `historical_comparison`: all four D067 arms and D068 Jev-all, receipt-recomputed totals and explicitly labelled attempt/completion comparisons.
- `current_provider_activity_excluding_historical_preparation`: optional cross-phase activity sum. It is distinct from the fresh arm total; missing terminal evidence makes its exact totals null.
- `phase_times`: each measured phase and an optional arithmetic phase sum. It does not infer elapsed user wait from unrelated clocks or silently add preflight twice.
- `sources` / `missing_optional_or_unfinished_evidence`: immutable SHA-256/byte provenance, including this helper, and missing evidence paths. No balance/ledger file is read.

Each usage summary contains raw input/output, cache creation total and its5m/1h subdivisions, cache reads, receipt statuses, known subtotals and exact values only when complete. The total token definition adds cache creation once. Official per-component equivalents use the dated `d068-preflight/official-rates.json` snapshot; Claude model/tier and cache-split consistency are checked. CLI-reported equivalents are separate. Actual invoice USD and monthly allocation stay null. Unknown failed POST usage remains null, including after a refund or a provider no-charge statement; the helper does not read reconciliation data.

Actual repair records retain chosen task/artifact IDs, public assertion attribution and not-reached assertions, prepared worker write paths, inheritance proof hashes/bytes and exported revision deltas. `adaptive_leaf_operation.write_scope` is original DAG ownership; the helper reports the narrowed `allowed_write_paths` separately. Scope/proof event presence alone never establishes public or independent completion.

## Current diagnostic corrections

Probe01 finished with local `INVALID_CONFIG`:37.840833ms, POST0, worker0, explicit `inference_started:false`, original usage null. Its `confirmed_no_inference` derived field permits a separately labelled inference-spend0 while retaining that original null receipt. This local overhead remains in diagnostic time.

Probe02 finished with known HTTP400 `model_input_limit`:3,293.459ms, POST1, usage/cost null. Its70,510-byte request did not establish admission. The original fixed `acceptance_boundary` text incorrectly says accepted in both failed probes. The helper retains it as `recorded_acceptance_boundary`, flags the contradiction, and derives `provider_accepted` from status, receipt and HTTP200/POST evidence. It does not repeat that fixed text as a success claim.

Root announced a separate artifact-v2 and token-policy-v2 follow-up. Those files and execution are owned by other roles. The analysis helper accepts additional probes without replacing01/02 and keeps new generation/request/policy sources apart from the preserved recheck.

For that follow-up the agreed protocol fields are `historical_input`, `packet_source`, `packet_source_sha256` (the new packet `result.json` file hash), `request_sha256` and `manifest_sha256`. The helper reads and hashes only that separately named packet result, preserves its projection timing/exact-token-null/raw-source-hash evidence, and reports whether the protocol hash matches. This is separate offline packet generation, not a second public recheck or a provider call. The new packet directory is also excluded as an analysis-output destination. No refund/balance file is read: root's separate reconciliation of rejected POST02 does not change its original usage:null in this analysis.

## Verification and handoff

Completed locally with no inference, Docker, grader or ledger action and no analysis-output write:

- `node --check benchmark-runs/d069-analysis-tools/analyze.mjs`:pass.
- `node benchmark-runs/d069-analysis-tools/analyze.mjs --self-test`:15 focused assertions passed: cache subdivision/cost arithmetic; failed usage null; missing versus proven-empty collections; wrong model and invalid cache split; no failed-completion speedup; output scope protection.
- `--validate-only`:historical5 rows reconstructed; missing D069 arm/grade/monitor remained incomplete with null calls/tokens/exact costs. Probe01 and02 stayed separate. All811 then-read evidence files remained byte-identical during the read-only pass. The helper subsequently added its own source hash to the output provenance.
- An independent local arithmetic assertion script compared historical wall times, completion and exact/known official equivalents with `d068-analysis-02.json`:all5rows matched within1e-9USD. It also checked probe01 zero-inference evidence, probe02 missing usage, missing fresh totals and rejection of duplicate/wrong public case IDs.
- A second local assertion script confirmed the two failed acceptance texts are not trusted, probe02 stays null, an existing output is rejected and a foreign arm's grade summary is refused.

These checks validate postprocessing, not D069 product completion or provider-context acceptance. Root must invoke the helper against final frozen evidence and a fresh output path, review completeness and include the actual probe list. Production code was not changed for this role.

Final no-write verification repeated after the protocol-source addition:syntax pass, self-test15/15 pass,812source hashes/listings stable (including the helper), forbidden ledger/grade-detail/hidden/env sources0. Diagnostic01+02 time sum is3,331.299833ms with one actual POST, no successful acceptance and null reported inference cost. Fresh development remained not reported; it was not coerced to0calls. Helper SHA-256 at handoff:`9c61c622813711e07dace76475591566f8b9a81e4e3840811469447bdcbaad90`.
