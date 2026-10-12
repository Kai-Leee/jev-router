# D048–D050 whole-task comparison

User authorization: new configuration and parallel total cost, speed, efficiency evaluation. Whole-task verified quality takes priority over Jev input minimization. Workload: original pinned OpenAPI Python client benchmark; existing Personal OS untouched.

## Actual execution and corrections

- D048 ran both conditions concurrently with fixed Opus5.5 medium workers, scoped per-file MCP writes, identical public brief/frozen plan, max concurrency2, one repair per owned group. Claude chose2 groups; Jev4. Confidence logged without gate.
- Both stopped at our verifier's unconditional `tomllib` import under Python3.10. This is an infrastructure defect, not generated-code quality evidence. Earlier unit tests did not exercise that real callback; preserve this validation gap.
- D049 adds actual Python/TOML preflight and completed-worker reuse. First-group files (Claude8/Jev6) passed syntax/file checks using installed tomli, no package install. Prior receipts/counts/attempts preserved, no regeneration of completed groups. Continuation is not a fresh independent sample.
- D049 Jev stopped before HTTP: serialized request278820 bytes exceeds local256000-byte guard. Same file contents appeared in prior worker evidence, reverified worker evidence, and current workerResult. Outer runner incorrectly marked local rejection uncertain; original log preserved and separate diagnosis required.
- D050 Jev uses lossless exact-string interning:278820→124418 bytes; decoding matches original JSON exactly. No goal, code or evidence omitted. Claude D049 continues its already running unencoded condition: this introduces a representation difference and prohibits attributing any observed difference solely to judgment provider.

## Live decision coverage

Initial group count, ready batch selection, post-worker requirement review, and confirmed-failure repair/stop decisions are executable checkpoints. Singleton options bypass calls. Worker model/effort remain fixed. Runtime recursive repartition and dynamic profile routing are not enabled in this comparison. Original independent hidden tests are never sent to models. Syntax approval is not requirement certification.

## Evidence and reproducibility

- Protocols: `benchmark-runs/d048-protocol.json`, `d049-protocol.json`, `d050-protocol.json` (source hashes).
- Original runs: `benchmark-runs/d048-{claude,jev}-01`.
- Continued runs: `benchmark-runs/d049-claude-01`, `benchmark-runs/d050-jev-01`.
- Rejected no-inference attempt: `benchmark-runs/d049-jev-01`.
- `node --test test/artifact-verifier.test.mjs test/lifecycle-resume.test.mjs`:15/15.
- `node --test test/decision-payload.test.mjs`:7/7.
- Original D048 full suite442/442; final broadened suite pending.

## Measurement policy

Include D048 failed-stage costs plus new decision/worker/recovery receipts once. Monitor and transport smoke separately. Actual billed dollars remain unknown; Claude terminal cost and Jev informational0.6USD/million input valuation are API-equivalent estimates, not subscription charges. Count input, cache creation/read, output separately; missing metrics remain null.

Report continuous original start→independent grade finish, measured active stage time, and investigation pause separately. Neither a shorter failed run nor fewer tokens proves efficiency. Independent full-quality gate required before completion-efficiency claims; representation difference still limits causality. One run per condition is exploratory; shared-account cache and host contention uncontrolled.

Current status: paid workers active; final grade/cost/speed not yet available. Existing10M cumulative Jev input ledger retained. Frozen historical source/results untouched. No commit/push.

## Terminal correction

Both runs are now terminal; above active status is historical. Claude original grade60/63; Jev0/63 with final packaging/CLI group unstarted after HTTP_ERROR. Final evidence: `benchmark-runs/d050-analysis-final.json`. Safe HTTP status preservation implemented after failure; historical exact status unrecoverable. Official docs checked2026-10-10: https://jev-ai.pro/docs#errors and models/limits specify256000byte API maximum and no blind retry; model context limits may differ. Do not infer particular HTTP cause from payload size alone.

Complete tests464/464 before telemetry fix; final targeted40/40 after. MonitorAPIequivalent0.08522USD separately; implementation totals/unknown failedcall as finalresultsdoc. Gradercontainersremoved; no active calls, no retry, no commit/push.
