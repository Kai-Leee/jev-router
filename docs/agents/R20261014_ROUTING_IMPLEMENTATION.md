# R20261014 Routing implementation ownership

User authorized implementation on a new branch, D083 decomposition/profile/repair-owner integration, non-bypassable preflight and recording, real Claude/Codex host verification, preserving old results.
Branch: feat/d083-skill-gateway, base2b3c9ac. Existing local research/design files belong to prior turns; preserve them.

- root: runner/manifest integration, common records, preservation snapshot, tests and final host execution. Do not replay stopped/terminal benchmarks or reset the cloud ledger.
- gateway: new src/orchestration/pointsman-gateway.mjs plus focused new tests only. Own request validation, record-before-send, immutable bytes and response membership. Coordinate interface with root. No edits to old policies/results, no paid calls.
- host-skills: skill source, self-contained host bundle materializer/CLI transport design and focused tests. Inspect real Claude/Codex executable availability/auth status without secret output. No paid calls until root dispatches explicit bounded verification; no global configuration changes. Do not edit runner/gateway/common indexes.

Design requirements: existing fixed English contracts; no second model reinterpretation; validate and record before reservation/POST; no silent fallback if recorder fails; receipt binds stage/skill/request/result; no assertion of paid inference or product completion from mocked provider. New outputs exclusively in a new run directory.
