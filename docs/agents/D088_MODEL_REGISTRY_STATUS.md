# D088 model registry — implementation and offline evidence

Owner: model_registry. Production edits ended and root was notified before source freezing. No paid calls, GETs, shared ledger reads/writes, original result modifications or hidden-test reads occurred in this task.

## Files

- `docs/orchestration/contracts/jev-models.v1.json`: canonical documented request names and exactly four observed response labels. Generic provider alias has null version; no prefix/future matching.
- `src/jev-model-registry.mjs`: validates and serves cloned metadata, frozen exact labels, exact requested/observed lookup and on-disk registry/loader source assertion.
- `src/benchmark/budget.mjs`: replaces its local label table with the canonical loader; registry source is checked before settlement. Existing token-mode/multiplier/credits/receipt/usage/reservation checks remain mandatory.
- `docs/orchestration/contracts/jev-token-admission.v5.json`: explicit v4 inheritance plus registry/loader hashes. Does not modify v1-v4.
- `src/orchestration/jev-token-admission-v5.mjs`: preserves v4 measurement/schema/wire/stage/request-hash and nonblocking local estimates, replacing only its historical model gate with the shared registry. Expected policy and registry hashes remain mandatory when provided. Unknown model or source drift blocks.
- New tests: `test/jev-model-registry.test.mjs`, `test/jev-token-admission-v5.test.mjs`.

## API handed to runner

`jevModelRegistry()` returns cloned metadata plus `source:{path,sha256}` and `module_source:{path,sha256}`. `JEV_OBSERVED_MODEL_LABELS` is frozen. `resolveJevObservedModel(label)` returns exact record or null. `isJevRequestedModel` and `isJevSettlementModel` never use prefix matching. `assertJevModelRegistrySource(expectedSha256=null)` checks loaded registry and loader bytes and fails on drift.

v5 exports `jevTokenAdmissionPolicy()` and `assessJevTokenAdmission(request,{stage,observedModel,expectedRequestSha256,expectedPolicySha256,expectedModelRegistrySha256})`, with the same v4 runtime shape plus `model_registry_source`. It uses module-relative URLs and requires no caller rootDir. A generic `typesafe-ai/jev` response records null context/revision; observed dated1.14 records1.14.0 rather than the inherited false1.13 assumption.

## Verification

`model-registry-tests.tap`: **83/83 pass, zero skipped**, including existing native budget/v2/v3 and admission/v1-v4 regressions. `git diff` against all eight historical admission modules/contracts was empty.

`model-registry-replay.json` binds the preserved D087 third request and failed admission file by SHA. The request is107,729bytes and request SHA `d2bd46bac5afc6eb18d37e163e76839a2a8c9ed51b4cdbe7492f9576d0b26b09`. Existing v4 rejects only `JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED`; explicit v5 admits the same request/model with identical measurements and request SHA. This is an offline admission replay, not a successful actual third POST.

Cross-consumer tests exercise all four observed labels through both v5 and native budget settlement on temporary fixture ledgers. Future dates, aliases used as observed labels and prefix extensions are rejected. A temporary copied registry modified after loading causes actual v5 assessment and native settlement to block; no original source or shared ledger is modified by those tests.

Source pins for all five production files are recorded in the replay JSON and were sent to runner. Root owns production execution and any later ledger actions. Remaining verification is the runner's final integration fixture and the root-owned actual matched pair; no new completion/speed/cost effect is claimed here.
