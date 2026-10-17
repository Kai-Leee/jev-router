# Codex benchmark implementation role contract

User request: replace the Claude-focused verification with Codex performance-benchmark preparation. Owner root: new Codex adapter, decision replay/comparison entrypoint, metrics and documentation. Reviewer `codex_benchmark_review`: read-only D083 integration and adapter correctness audit. No shared file edits from reviewer. Existing `feat/d083-skill-gateway` branch continues; existing pinned D083 files, prior runs and shared ledger are not rewritten.

Current implementation boundary: runnable decision-replay benchmark using the D083 fixed-question gateway; separate proposed E2E protocol for Codex-only vs Jev-directed Codex. Do not label decision replay, a fixture, or re-parsing an old host trace as a completed E2E comparison. Hand off through CODEX_BENCHMARK.md with current source and evidence paths; do not repeat a paid attempt automatically.
