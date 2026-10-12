# D048 — Live paired lifecycle experiment

2026-10-10. User authorizes new workflow and parallel cost/time/efficiency comparison. Main integrates three role-owned modules documented in docs/agents/D048_LIFECYCLE.md. Primary objective is verified whole-task efficiency; large Jev inputs are acceptable within technical/budget limits.

Both cohorts reuse D040 frozen public OpenAPI plan and full brief. Fixed Opus5.5medium workers, scoped per-file MCP writes, same verification, per-task recovery limit1, concurrency2. Only decision provider differs: Claude vs Jev. Start cohorts concurrently in separate candidate directories. Shared account/cache/host contention means concurrent-load comparison, not isolated latency. One pair is exploratory.

Initial count, ready-task batch choice, post-worker review and confirmed-failure recovery use the chosen decision provider. Singleton options and fixed-profile selection bypass model calls with logs. Goal, full brief, historical failure evidence and new partial/full file outcomes propagate across decisions. Unknown provider outcome stops new work without replay. Deterministic file/syntax checks are not requirement proof; final independent original grader is authoritative. No hidden grader feedback is sent to workers.

New artifact MCP transport was verified by actual Opus call: smoke.py exact content saved, response success, API-equivalent0.018532USD. This preflight cost is outside paired operation and reported separately. Scoped paths and journal records are authoritative; final summary need not be JSON. Each file cap262144 bytes; project cap4194304 bytes same across task counts. Existing PersonalOS/Vault untouched. No compile/import execution of generated source on host; ast/toml parsing only before isolated grading.

Overall deadline uses the existing benchmark config14400seconds, not the old10min call cap or prior30min phase cap. No extra paid planner. Worker/model profile remains fixed to isolate decision provider. Recursive repartition and dynamic model/effort selection remain future work; this experiment does not claim every intended role is implemented.

Commands: `node scripts/lifecycle-e2e-pilot.mjs benchmark-runs/d048-CONDITION-config.json benchmark-runs/d048-CONDITION-01 CONDITION --spend`, CONDITION=claude or jev. Immutable source hashes: benchmark-runs/d048-protocol.json. Each call has invocation_started, terminal receipt and usage or explicit unresolved evidence. Rates are API equivalents/informational; actual subscription billed amounts unknown. Separate final Opus monitor excludes implementation cost. Preserve failed attempts and partial files. No commit/push requested.

Validation before paid pair: transport7/7, lifecycle11/11, prior full440/440 before last failure-evidence tests; analyzer --self-test PASS; actual MCP smoke PASS; original evaluator preflight8/8. Full updated suite pending independent run.
