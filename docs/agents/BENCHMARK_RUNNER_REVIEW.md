# Benchmark runner review role

Date: 2026-10-08. Review current controlled Claude/Jev runner and real benchmark preparation independently.
Own only `docs/agents/benchmark-runner-review-STATUS.md`; do not edit others' implementation files.
Read src/benchmark/{docker,launch,protocol,decision-gate}.mjs, bin/benchmark-{mcp,run}.mjs,
benchmarks/e2e-swe/{adapter.py,README.md}, and relevant tests. Main owns fixes and live Docker.
Focus on actual action binding, no hidden host execution, no credential logs, fail-closed uncertain POST/command,
budget/process limits, model identity, comparator validity, evaluator failure-vs-zero distinctions. Verify meaningful offline tests if useful.
No paid requests, credentials, container operations or project settings. Provide concrete defects with file/line and reproduction,
distinguishing unimplemented prerequisites from vulnerabilities. Record findings and validation. Before limits write OS-temp handoff.
