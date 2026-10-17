# Guarded D083 execution contract

The generated bundle's `runtime.json` identifies `sourceRoot`, `cli` and `manifest`. The bundled wrapper loads that file and invokes the source CLI directly as a Node subprocess; it does not load credentials or call a provider. The deployment retains an explicit dependency on the source runtime. The instructions and this reference travel with the skill; a bare pointer to an unavailable design document is insufficient.

Registered checkpoint mapping:

| Event | Existing source path | Application |
| --- | --- | --- |
| Decomposition and relations | `src/orchestration/adaptive-dag-planner.mjs` | Fixed D083 questions → validated task/artifact DAG |
| Model and effort | `src/orchestration/adaptive-profile-selection.mjs` | Fixed profile questions → registered worker profile |
| Failed public assertions | `src/orchestration/adaptive-dag-execution.mjs` | Inferred artifact owner → existing worker and allowed repair scope |

The gateway is `src/orchestration/pointsman-gateway.mjs`; its registry/pins are `docs/orchestration/contracts/pointsman-routing.v1.json`. Use `benchmarks/e2e-swe/manifests/pointsman-d083.json`, preserving the old `d083-repair-fixes.json` for historical reproduction. The registered path requires the gateway and uses the common decision transport in `src/benchmark/adaptive-dag-runner.mjs`. External raw HTTP and historical runners are outside this gateway's enforcement boundary; skill instructions are not an operating-system sandbox.

The skill's live entrypoint is its wrapper `run --out NEW_DIRECTORY --spend`, which invokes `bin/pointsman.mjs` with a fixed guarded manifest and catalog. Manifest/provider overrides are not exposed. The old `scripts/adaptive-dag-comparison.mjs` remains a historical runner; do not use it to bypass a block in the plugin entrypoint. This command reference is not permission to spend or bypass the project's cloud-only execution policy; macOS live runs are rejected. Check actual model availability and server authentication separately from the credential-free doctor/smoke.

Decision evidence must connect stage, skill/contract identity, exact request, gate phases, selected typed response and later handler/worker result. Request validation does not establish question quality or provider acceptance. A selected profile is not a worker completion. Public checks and independent grading remain distinct; hidden test contents never enter repair inputs.

Jev base URL is `https://jev-ai.pro/api`, decision path `/v1/systemone`, default model `jev-latest`. Keep `JEV_AI_API_KEY` server-side: local `~/workspace/.env` or deployment runtime secrets. The wrapper and smoke neither read that file nor authenticate. Never treat deterministic smoke responses as live provider receipts.

General-purpose workflow/skill classification is not implemented by this D083 integration. Source design context is `docs/skills/POINTSMAN_ROUTING_DESIGN.md`; current implementation and evidence belong to the dated implementation record, not older design completion statements.
