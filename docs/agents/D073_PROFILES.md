# D073 — provider-limits-only profile selection

Owner: `/root/d067_runner`. Started: 2026-10-12. Status: profile implementation and offline verification complete; owned production sources frozen.

## Purpose and scope

The user authorized proceeding without local token limits. Add an explicit D073 profile policy that does not reject a valid Jev profile request for the D071 48,000-byte engineering ceiling or a local token estimate. Preserve the official 256,000-byte request envelope, request schema, typed legal profile choices, literal English target questions, source bindings, zero automatic retries and atomic selection before dispatch. This does not remove the provider's actual context limits or establish provider acceptance.

Owned files: `src/orchestration/adaptive-profile-selection.mjs`, new `docs/orchestration/contracts/adaptive-profile-selection.v2.json`, focused profile tests and this document. Existing D071 v1 contract, candidate catalog and historical evidence remain unchanged. The module and original contract/test/doc bytes are preserved under `benchmark-runs/d073-profiles-01/source-before/manifest.json` before edits. Root owns integration, real requests, Docker, ledger and final comparison.

## Integration API

Use `profilePolicy: 'provider-limits-v2'` consistently in:

- `loadAdaptiveProfileContract({profilePolicy})`.
- `resolveAdaptiveProfile(id, {...options, profilePolicy})`.
- `buildAdaptiveProfileRequest`, `buildAdaptiveProfileRequests` and `selectAdaptiveProfiles` input.
- `applyAdaptiveProfileSelections({plan, selection, profilePolicy})`.

Omitting the option retains `bounded-v1` and the original D071 contract/48,000-byte behavior. V2 reads the new contract and ignores caller-local `limits.max_request_bytes` as a blocking limit; only the official body limit remains. Initial batches still contain at most two tasks and repair batches one task. The existing `admitBatch(request, {stage: 'profiles', ...metadata})` callback accepts the root's v4 admission injection; the profile module does not import a token estimator. Root must pin the matching v2 question contract and pass the policy when resolving and applying profiles. A mismatched contract/source must block dispatch.

V2 batch/result metadata records `profile_policy:'provider-limits-v2'`, `local_wire_byte_limit:null`, `local_token_estimates:'observation_only'` and `provider_max_wire_bytes:256000`. Per-batch `ignored_local_max_request_bytes` records the caller's former limit without enforcing it. Initial pairs above the official body limit may still be prepared as two single-task batches before any callback; a single task above256000B is blocked. This is a request-schema boundary, not a restored local token budget.

## Completed verification and handoff

`node --test test/adaptive-profile-selection.test.mjs`: **9 passed, 0 failed**. The original eight D071 checks remain. One D073 test verifies unchanged English question/candidate catalog, unknown-policy rejection, a245000B request despite a caller-local50B value, observational admission injection, typed selection/commit/apply, explicit-policy source binding, inclusive256000B acceptance and256001B rejection before a callback. Callbacks are local fixtures, not provider calls.

`node benchmark-runs/d073-profiles-01/verify-v1-compatibility.mjs` reproduced all **58 historical D071 request bodies and metadata exactly** using the default path. `v1-compatibility.json` preserves both the historical source hashes and current source hashes without changing the D071 files.

`node benchmark-runs/d073-profiles-01/replay-v2-admission.mjs` used the actual new v4 admission implementation on a245000B profile request. The underlying public plan/catalog/requirements stayed unchanged; an explicitly synthetic ASCII runtime-evidence field exercised the large-body boundary. V4 returned `admit_observed` with `inference_allowed:true`; the estimated question/request limit codes were warnings only. Default v1 rejected the same245000B body at48000B. V2 rejected256001B at the official256000B boundary. The request, metadata, v4 result and all source hashes are saved in this directory, with `v2-admission-replay.json` as the summary.

Source handoff: `benchmark-runs/d073-profiles-01/source-handoff-01.json`, with `source_files:[{path,sha256}]`. The original v1 question contract and model/effort catalog have unchanged hashes. Root must complete manifest/runner/preserved-repair integration, full regression and real execution. Provider calls, Docker calls and real ledger access by this role: **0**. Actual provider acceptance, actual profile choice/CLI identity and total time/cost benefit remain unmeasured by these local checks. Provider context errors and uncertain responses must remain terminal evidence; no automatic retry was added.
