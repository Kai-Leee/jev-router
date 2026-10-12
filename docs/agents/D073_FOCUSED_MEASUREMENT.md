# D073 focused preserved-candidate measurement

2026-10-12. Owner: `d068_failure`. Both first follow-up repairs and the separately started `new-02` attempt are terminal and graded. Their analysis is complete; none passes both completion gates. Follow [the focused protocol](../orchestration/D073_FOCUSED_OWNER_EXPERIMENT.md). This role owns new analysis helpers/tests and this note. Existing D071/D073 analysis, receipts, failed runs, production sources and pricing remain immutable. Root alone executes providers, Docker, ledger changes and independent grading.

The two fixed original sources are `benchmark-runs/d071-comparison-01/jev_profile` and `benchmark-runs/d073-comparison-01/jev_profile`. Follow-ups are `benchmark-runs/d073-focused-old-01` and `benchmark-runs/d073-focused-new-01`. Both follow-ups have accounting scope `preserved_candidate_repair`. Each report retains the original development and new repair as separate rows. Their sum is not an observed automatic E2E duration: analysis, code changes, human work and offline gaps are omitted. Successful-development speedup and causal profile improvement remain null, even if a repaired product later passes both gates.

The new wrapper imports frozen `summarizeD073Run`, invocation accounting, public coverage and completion gates. The frozen D071 manifest discovery accepts only `dNNN-adaptive*.json`; the new v9 manifest is `d073-inferred-v2.json`. The wrapper explicitly verifies this new pinned manifest, protocol, registry/assertion/profile snapshots and computes the current gate with the imported gate functions. It retains the legacy discovery limitation separately rather than altering the frozen helper or inventing a pin alias.

Before attributing follow-up work, bind `preserved-source.json` to the exact original result, plan, profile application and historical worker receipts. Confirm that `planning.json` is the original applied profile plan, historical profile evidence agrees across producer records, deterministic copying has zero provider calls, the same public failures were reproduced, and controller inheritance proofs preserve original bytes/modes/revisions. Verify that verification tasks remain without worker dispatch, output artifacts or write scope. Candidate contents and hidden tests are not read; producer byte-preservation proofs are identified as such, rather than relabeled independent byte audits by this role.

Owner v2 is still one request for all failed questions. Existing requested/completed/committed events and scope IDs remain compatible. Record `owner_input_policy`, actual transmitted request SHA and projection integrity separately from the original v1-form corpus SHA. Preserve unanswered owner requests, unknown model answers, selected owners, actual repair CLI starts, and successful current public/independent evidence as different observations.

The planned command is:

```sh
node benchmark-runs/d073-analysis-tools/focused-preserved.mjs \
  --old-run benchmark-runs/d073-focused-old-01 \
  --new-run benchmark-runs/d073-focused-new-01 \
  --rates benchmark-runs/d073-preflight/official-rates.json \
  --old-source-rates benchmark-runs/d071-preflight/official-rates.json \
  --new-source-rates benchmark-runs/d073-preflight/official-rates.json \
  --public-registry benchmarks/e2e-swe/public-checks/registry.v4.json \
  --control-flow-evidence benchmark-runs/d073-review-01/control-flow-v2-evidence.json \
  --output-dir benchmark-runs/d073-focused-analysis-01
```

Execution requires terminal results, current numeric grades, and a new output directory. Unknown submitted usage remains null; controller callback counts do not replace actual POSTs. Inherited receipt IDs may equal newly allocated local IDs, so history exclusion is based on run directory, start events and attempt identities, not an ID-only comparison. Separate refund/tier supplements never overwrite raw totals. Output includes a numeric-only monitor projection; provenance remains outside that packet.

After focused terminal analysis, prepare the combined packet for root's separate Opus monitor:

```sh
node benchmark-runs/d073-analysis-tools/focused-monitor.mjs \
  --first-analysis benchmark-runs/d073-analysis-01/analysis.json \
  --focused-analysis benchmark-runs/d073-focused-analysis-01/analysis.json \
  --refund-report benchmark-runs/d073-fresh-refund-join-01/joined-report.json \
  --haiku-tier-evidence benchmark-runs/d073-haiku-tier-evidence-01/evidence.json \
  --output-dir benchmark-runs/d073-focused-monitor-input-01
```

Only the resulting `observation.json` is monitor input. `provenance.json` stays outside it. The projection explicitly whitelists numeric/bool/null values and constant condition/model/effort strings. It combines first-run numbers, original refund and Haiku supplements, each original→follow-up preserved pair, and historical Claude. No raw paths, failure text, candidate code, test/assertion IDs, logs or source hashes enter the packet. Changed artifact/file and persisted/resolved/new failure counts are controller observations; no proven fault location is claimed. This helper never invokes Opus.

Verification: `node --test benchmark-runs/d073-analysis-tools/focused-preserved.test.mjs`, 3/3 passed. The tests replay actual D071 history with10 inherited workers/26 exact public failures; reject wrong source SHA, added auditor write authority and recounted historical attempts; verify the explicit v9 filename and loader metadata against source bytes; preserve unrelated source-pin errors as completion-blocking; and check denominator/null preservation and numeric monitor source binding/sentinel exclusion. Review found and corrected the two v9 compatibility errors in this new helper only. Previous sources and raw outputs were untouched.

Public metadata-only schema inspection of active v9 protocols is permitted. Terminal analysis requires results and numeric grades. No new provider calls, Docker actions, ledger reads or hidden/candidate reads are performed by this role.

## Terminal follow-up results

The frozen helper produced `benchmark-runs/d073-focused-analysis-01/analysis.json` for the first pair and `benchmark-runs/d073-focused-analysis-02/analysis.json` with `--new-run benchmark-runs/d073-focused-new-02`. Analysis02 repeats the old result for reference; it is the same invocation, not additional spending. Root cleared the intervening outstanding reservation before starting new-02. New-01 stays in the record as a separate failed attempt with different runtime preconditions.

| Preserved repair attempt | Arm / observed through grade | Public / independent | Jev POST / Claude CLI | Known inference token subtotal | Separate refund-adjusted official equivalent |
| --- | --- | --- | --- | --- | --- |
| old-01, original D071 profile | 164.719s / 183.756s | 67/93 / 49/63 | 2 / 0 | 44,829 | $0.023163 |
| new-01, original D073 profile | 191.646s / 207.880s | 79/93 / 60/63 | 0 / 0 | Raw unresolved | $0 inference, separate semantic proof |
| new-02, same original D073 profile, separate start | 339.993s / 355.366s | 91/93 / 61/63 | 5 / 2 | 803,431 | $0.7062281 |

All three raw full usage and cost totals remain null. For old-01/new-02, the final HTTP400 inference usage was not returned; confirmed no charge is a separate billing observation. For new-01, the frozen invocation helper does not recognize `BUDGET_OUTSTANDING` as a proven local stop. Its unresolved/null result remains intact. Independent source-bound evidence in `benchmark-runs/d073-review-01/budget-outstanding-new01-proof.json` proves the reserve function was entered but stopped before a new reservation was persisted or inference was sent. This yields a separate inference count/cost of zero. One model metadata GET occurred; this is not zero HTTP activity. Monthly subscription allocation remains null for every attempt.

In new-02, the first owner request had14 questions and returned14 inferred assignments across2 existing tasks/3 artifacts. The linked Jev repair selection and2 profile decisions dispatched exactly2 repair workers, Sonnet5.5 high and medium. Model identities and effort arguments match; internal effective effort is unreported. No selected-but-uninvoked or unlinked actual repair workers were observed. Two files/artifacts changed, one selected artifact stayed unchanged;12 public failures resolved,2 persisted, none newly appeared. One inherited export proof passed, with no incomplete exports. Original candidate preservation and auditor/write-authority checks passed. Owner hypotheses are not proven fault attribution.

`benchmark-runs/d073-focused-analysis-02/terminal-facts.json` binds the unchanged artifact to its actual worker: Sonnet medium spent21,011.792ms,272,208 tokens and$0.2327256 official equivalent ($0.2549152 reported). Its selected artifact stayed unchanged and both linked failures persisted. Zero nonselected recalls therefore does not demonstrate elimination of selected-but-unproductive repairs. Unchanged output alone is not proof that the worker's reasoning was useless.

The second owner request contained2 remaining failure questions and ended in HTTP400 `model_input_limit`. It returned no answer and dispatched no more workers. The raw owner-committed event count includes the stopped outcome; successful applied owner inference count is1, not2. New-02 still fails both product gates.

New-02 public checks consumed182,405.178ms in16 suite executions, about53.65% of the339,993.346ms arm. Bootstrap public recheck was90,486.542ms; the following public recheck used the remaining91,918.636ms. Actual repair worker interval span/union was69,682.805ms versus summed intervals90,687.108ms, with21,004.303ms overlap and maximum concurrency2. Receipt adapter wall times are69,690.722ms and21,011.792ms; they have a different boundary. Repair-phase wall189,450.082ms contains decisions, workers, carry-forward and rechecking, so none of these overlapping scopes should be added to obtain E2E elapsed time.

Known new-02 Jev usage is122,440 tokens (118,279 input +4,161 output); the final failed request is unknown. Claude usage is680,991 tokens, including117,437 cache creation and552,507 cache read. Reported known equivalent is$0.7614788, versus official recalculation$0.7062281 after the failed request's confirmed no-charge adjustment. The$0.0552507 difference exactly equals552,507 cache-read tokens ×$0.10/M. This is numerical compatibility with a cache-read rate difference, not an independently verified CLI pricing implementation.

## API balance provenance and numeric monitor v2

Frozen refund v1 requires a balance read directly from the UI. Refund04 correctly records `visible_paid_input_tokens_remaining:null`; only the authenticated credits GET and the last successful inference billing confirm42,809,333. The v1 failure output is preserved at `benchmark-runs/d073-focused-new-refund-analysis-02`. New `refund-billing-v2.mjs` retains all14 non-balance validations, verifies the saved GET timing and last-success balance, and records the root-authenticated account provenance and lack of an independently visible account identifier. It never invents a UI balance. Refund03's original balance attribution is retracted by its SHA-bound `ui-observation-correction.json`; the failed/refunded row itself is unchanged.

Corrected views are `benchmark-runs/d073-focused-old-refund-analysis-02/refund-accounting.json` and `benchmark-runs/d073-focused-new-refund-analysis-03/refund-accounting.json`. Raw HTTP/usage, original v1 helper/output and old analyses are unchanged. Confirmed refunded input charge and actual bill are zero only for the identified failed request. Successful monthly-plan calls retain unknown actual bill/allocation.

Reproduction:

```sh
node benchmark-runs/d073-analysis-tools/refund-billing-v2.mjs \
  --run benchmark-runs/d073-focused-old-01 --refund-evidence benchmark-runs/d073-refund-03 \
  --rates benchmark-runs/d073-preflight/official-rates.json \
  --ui-correction benchmark-runs/d073-refund-03/ui-observation-correction.json --output-dir <new-old-refund-directory>
node benchmark-runs/d073-analysis-tools/refund-billing-v2.mjs \
  --run benchmark-runs/d073-focused-new-02 --refund-evidence benchmark-runs/d073-refund-04 \
  --rates benchmark-runs/d073-preflight/official-rates.json --output-dir <new-new-refund-directory>
```

The completed combined packet is `benchmark-runs/d073-focused-monitor-input-02/observation.json`; its `provenance.json` must stay outside the monitor. `focused-monitor-v2.mjs` retains the first pair, adds the later standalone attempt and separate no-inference/refund supplements, and reports public/worker timing and owner-round response/application counts. It explicitly excludes the old chooser projection prototype from measured deployment; that prototype had zero actual application. Source hashes, private paths, failure text, test/assertion IDs and candidate contents are not projected.

```sh
node benchmark-runs/d073-analysis-tools/focused-monitor-v2.mjs \
  --first-analysis benchmark-runs/d073-analysis-01/analysis.json \
  --first-focused-analysis benchmark-runs/d073-focused-analysis-01/analysis.json \
  --later-focused-analysis benchmark-runs/d073-focused-analysis-02/analysis.json \
  --refund-report benchmark-runs/d073-fresh-refund-join-01/joined-report.json \
  --haiku-tier-evidence benchmark-runs/d073-haiku-tier-evidence-01/evidence.json \
  --focused-old-refund benchmark-runs/d073-focused-old-refund-analysis-02/refund-accounting.json \
  --later-refund benchmark-runs/d073-focused-new-refund-analysis-03/refund-accounting.json \
  --noninvocation-proof benchmark-runs/d073-review-01/budget-outstanding-new01-proof.json \
  --output-dir <new-monitor-directory>
```

New focused validation: `node --test benchmark-runs/d073-analysis-tools/refund-billing-v2.test.mjs benchmark-runs/d073-analysis-tools/focused-monitor-v2.test.mjs`,5/5 passed in323.87725ms. It covers actual saved-evidence replay, UI/API provenance correction, rejection of wrong account balance/source hashes/attempt reuse/refund invocation mismatches, null preservation and numeric projection sentinel exclusion. No production or prior analysis code was edited. Single attempts, different starting candidates, changed shared account state, omitted human/offline effort and shared-host contention prevent a causal whole-development efficiency claim.

Independent review completed after packet02 creation: `benchmark-runs/d073-review-01/refund-view-review-02.json` (SHA `40c419bf6e4021d64f1fc1f697c921184fc90c283e72db77976a73227a6cc50d`). Both corrected sidecars were independently recalculated with exact correction equality, the reviewer reran2 billing tests, and found no additional blocker. Packet02 source pins and numeric/constant-string boundary passed. `focused-verification-02.json` records5 local tests and19 unchanged earlier helper hashes; its earlier pending-review field is superseded by this append-only review evidence. The preparation helper did not run the Opus monitor; root owns that separate invocation and its cost.
