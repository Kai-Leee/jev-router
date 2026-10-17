# Codex artifact worker — 2026-10-14

Role contract: [R20261014_CODEX_E2E.md](R20261014_CODEX_E2E.md). Goal: identical Codex implementation workers for the Codex-decides and Jev-decides full-development comparison. This role made no paid calls and changed no pinned D083 source.

## Implemented

- `src/benchmark/codex-artifact-worker.mjs` exports `createCodexArtifactWorker({directory,input,catalog,manifest,model,effort,spend,signal,runCodex,record,onReceipt})`, returning the existing `executeTask(task, worker)` callback.
- The model returns `{files:[{path,content}],summary}`. Entire answer must contain exactly each writable path once, with no extra keys, valid string contents, and existing file/total byte limits. The controller writes through `createArtifactSession`; the model never receives the staging directory as its working directory.
- Authorized existing files and SHA-pinned read-only sources are read through ArtifactSession and inlined with public requirements. Repair uses the existing artifact repair packet. Missing/changed pinned sources and writable symlinks stop before model dispatch. Inherited files remain outside the returned write scope.
- Provider runs with adapter `role: decision` to select read-only sandboxing and reject tool-using answers, while wrapper receipts explicitly record `logical_role: worker`. This rejects tool-using output after execution; it is **not** proof that the OS prohibits all external reads or network activity.
- Every wrapper has an immutable directory, transport manifest, artifact journal, accepted output and receipt. `onReceipt` receives wrapper receipts (nested `provider` receipt includes usage) for successful and failed calls. Uncertain provider outcomes propagate and never retry. Callback or recording failures do not yield accepted worker output.
- Worker cwd is now a fresh OS temporary directory outside the repository, recorded in the receipt. Only an empty owned directory is removed after the attempt; unexpected files are preserved with a separate cleanup diagnostic. The receipt's provider/transport completion is not executor acceptance if later recording fails.
- Return value contains the actual artifact journal reference and the executor's expected diagnostic format `{denied_read_paths:[],final_response}`. Worker statements remain unverified evidence for downstream repair attribution.

## Verification

Command: `node --test test/codex-artifact-worker.test.mjs test/codex-provider.test.mjs` from the repository root. Final result: **16/16 pass**, including seven new artifact worker tests. Earlier 15/15 result preceded the added post-recording/cleanup test. Fixtures exercise the real Codex adapter with a simulated child process; they do not measure live Codex development quality or cost.

Command: `git diff --check`. Result: exit 0.

Validation covers exact scoped write persistence, provider usage attribution, duplicate/unauthorized/oversized bodies, tool-using output rejection, repair read-only sources, inherited preservation, symlink and SHA drift before dispatch, and uncertain outcomes without writes/retry. No previous run output or shared ledger was edited.

## Remaining integration checks

- Root must connect callback/receipt aggregation, real planner, real public checks and independent grader before full-development completion can be claimed.
- During review the original fresh cwd inside the run directory was found still susceptible to ancestor repository AGENTS.md discovery. Root agreed to external temporary cwd isolation; implemented and fixture verified. `--ignore-user-config` alone is not claimed to disable ancestor AGENTS.md discovery.
- Complete-file JSON output is a new common worker transport for both Codex arms. It differs from historical Claude MCP file-by-file writes and must be declared when comparing old results.
- Actual model identity, effective effort and cost remain governed by provider receipts; missing values must remain unknown.

Side effects: three new uncommitted owned files (module, focused test, this document). Fixture temporary directories were cleaned up; no live model calls, containers or background services were started.
