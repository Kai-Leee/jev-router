# R20261014 — Codex 벤치마크 준비

[명령·실측 범위·미완료](../orchestration/CODEX_BENCHMARK.md). 이 기록의 complete는 어댑터·판단 benchmark 작성 범위이며 전체 E2E 비교 완료가 아니다.

```decision-record
{
  "id": "R20261014-CODEX-BENCHMARK",
  "goal": "Prepare Codex-specific measurement adapter and runnable matched decision replay, with explicit E2E plan and limitations.",
  "owner": "root",
  "status": "complete",
  "next_trigger": "Integrate Codex artifact workers, provider-neutral preflight and grading for the planned full-development comparison.",
  "conditions": [
    "User requested Codex performance-benchmark preparation instead of Claude login verification.",
    "Existing branch preserved; new modules do not modify the pinned D083 implementation.",
    "Actual model/effort availability and full-development performance remain unmeasured."
  ],
  "sources": [
    {
      "id": "adapter",
      "path": "benchmark-runs/codex-repair-20261015-01/source-before/src/benchmark/codex-provider.mjs",
      "sha256": "56e34bb60b3743f59ea784f230d69e7cf22d6e7b1bfdb7828f3b800035cfa55d"
    },
    {
      "id": "benchmark",
      "path": "src/benchmark/codex-decision-benchmark.mjs",
      "sha256": "fa994368217702bf7348f87af00ccf31f87f3ddcf4a492bc8aa9a8a8aa21eb38"
    },
    {
      "id": "cli",
      "path": "bin/codex-benchmark.mjs",
      "sha256": "fb08f27ad6ae43c9cd385cf4be1650a3f8713ea3bb34f1912a26d887a13166f7"
    },
    {
      "id": "plan",
      "path": "benchmarks/e2e-swe/manifests/codex-comparison.plan.v1.json",
      "sha256": "27db7af2b29359dc94321b53c5fef77ddd0d21c31346ad455c27b36b3c09d82a"
    },
    {
      "id": "report",
      "path": "docs/orchestration/CODEX_BENCHMARK.md",
      "sha256": "32a2ae5231c49ae325a8bc4d2300a3390042e21252585cdbff47d502d52f929f"
    },
    {
      "id": "tests",
      "path": "benchmark-runs/codex-benchmark-20261014-01/tests-03.tap",
      "sha256": "3985eff89ae5e5a513a134c03f501cde8d0efcf7744fa4f65ea051ba5822cfca"
    },
    {
      "id": "check",
      "path": "benchmark-runs/codex-benchmark-20261014-01/check-03/result.json",
      "sha256": "9a4691dbc7473c5cf77ac375ccda77de0cd2c96a88e25a00d80ac0b7e3450f7a"
    },
    {
      "id": "trace",
      "path": "benchmark-runs/codex-benchmark-20261014-01/prior-real-trace-audit.json",
      "sha256": "8d4eed0963d1d04a7486ebc18480e258a659ba32c12d05c7c98aa87062c0fdd3"
    },
    {
      "id": "preservation",
      "path": "benchmark-runs/codex-benchmark-20261014-01/preservation.json",
      "sha256": "644e2b8826d05a45fdb2417a70be799017d7dac44d49bb7634c51857c19b52c3"
    },
    {
      "id": "ledger_provenance",
      "path": "benchmark-runs/codex-benchmark-20261014-01/shared-ledger-provenance.json",
      "sha256": "860c22df72ddcf873a58cc39bd18f1d5e6c6f01f957fb3e10816af0906c47ea7"
    }
  ],
  "claims": [
    {
      "id": "tests",
      "kind": "measured",
      "text": "node --test test/codex-provider.test.mjs passed9/9 using mocked process responses.",
      "source_ids": [
        "tests"
      ]
    },
    {
      "id": "check",
      "kind": "measured",
      "text": "Historical D081 actual public split request passes the current D083 fixed-question gate, provider calls0. No claim it is newly generated D083 output.",
      "source_ids": [
        "check"
      ]
    },
    {
      "id": "accounting",
      "kind": "measured",
      "text": "Offline parser on earlier real Codex trace: input190881 including cached157824; uncached33057; output1610; total192491. Reasoning138 is not re-added. Not a new benchmark run.",
      "source_ids": [
        "trace"
      ]
    },
    {
      "id": "ledger",
      "kind": "correction",
      "text": "Earlier unexplained ledger drift includes independently authorized paper-trading service settlements. Two observed billing IDs and input usages match service journals.42050 immutable files unchanged; shared ledger changes are retained, not reset. Not an audit of all intermediate settlements.",
      "source_ids": [
        "ledger_provenance",
        "preservation"
      ]
    },
    {
      "id": "e2e",
      "kind": "unknown",
      "text": "Full Codex-vs-Jev-directed-Codex development comparison is planned, not implemented or measured.",
      "source_ids": [
        "plan",
        "report"
      ]
    }
  ],
  "costs": [
    {
      "role": "future_codex_benchmark",
      "basis": "unknown",
      "usd": null,
      "source_ids": [
        "report"
      ]
    }
  ],
  "unresolved": [
    "Full E2E worker scope/transport, Docker grading and provider-neutral preflight integration.",
    "Codex model/effort capability and official price matching.",
    "No new actual paired runs or speed/cost savings measured."
  ],
  "side_effects": [
    "Uncommitted new source, docs, tests and ignored evidence directory. No commit/push.",
    "No provider calls, Docker start, credential reads or ledger writes by this task; separate authorized service remains running."
  ]
}
```

2026-10-15 근거 경로 정정: 변경된 소스는 기록 당시 SHA와 일치하는 source-before 사본으로 연결했다. 결과·기존 해시는 수정하지 않았다.
