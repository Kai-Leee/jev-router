# D036 implementation ownership

Goal: implement D035's first vertical slice: checkpoint → deterministic bypass → exact decision reuse → injected Jev decider → validated handler → receipt. Preserve fixed workers, existing shared budget and historical forced evaluation. No paid inference in this work.

Main owns src/orchestration/checkpoint-router.mjs, split-checkpoint.mjs, contract, replay CLI, tests, optional tree pilot integration and shared documentation.

Independent reviewer: read implementation/tests when main supplies paths; inspect stale state, malformed answers, duplicate events/concurrency, cache invalidation and uncertain failures. Run offline tests only; report findings without edits. Do not call providers or touch existing benchmark evidence.

Complete requires offline scenario evidence, targeted and regression tests, structural receipt checks, explicit runtime/host integration limits. Context handoff: read D035 research, this file, implementation doc and latest WORK_LOG before continuing.
