# Mac Codex/Jev 전체 개발 비교

사용자 승인: “이번 Codex 비교는 Mac에서 실행”. 최초 모델 미지원 실패를 보존하고, CLI 목록으로 공통 모델을 수정한 새 조건을 실행한다. 실측 전 완료·절감 주장을 하지 않는다.

실행·감사는 종료됐지만 두 제품은 미완료다. [결과와 남은 구현](../orchestration/CODEX_MAC_RESULTS.md).

```decision-record
{
  "id": "R20261014-CODEX-MAC",
  "goal": "Execute and compare one complete Mac OpenAPI development pair with Codex versus Jev decisions and identical Codex workers.",
  "owner": "root",
  "status": "complete",
  "next_trigger": "Fix partial-execution repair input, owner evidence coverage and CLI context control before a new comparison; no automatic rerun.",
  "conditions": [
    "User explicitly authorized this Codex comparison on Mac; historical D082 cloud policy retained for other runs.",
    "One sequential pair: Codex then Jev, same gpt-5.6-sol/high workers.",
    "Choice-only planner projection; original Jev response retained.",
    "Fresh paths; shared ledger not reset; no automatic retries."
  ],
  "sources": [
    {
      "id": "runner",
      "path": "benchmark-runs/codex-repair-20261015-01/source-before/src/benchmark/codex-e2e-runner.mjs",
      "sha256": "6e33302db47699ab387302396f66abc286b5f787b44c8eced0ac289e72f281a5"
    },
    {
      "id": "cli",
      "path": "benchmark-runs/codex-repair-20261015-01/source-before/bin/codex-e2e.mjs",
      "sha256": "4fe517212780122ff4507fae3e8d060455c0eb8060c3aa2c6ccfdba845cb1189"
    },
    {
      "id": "failed_pair",
      "path": "benchmark-runs/codex-e2e-mac-20261014-01/pair/result.json",
      "sha256": "9e3408c63ca78894d41c7cbe310394b287d8d4eee7b03ab2396f0ce8021299d5"
    },
    {
      "id": "failed_trace",
      "path": "benchmark-runs/codex-e2e-mac-20261014-01/pair/codex/calls/codex-decision-0001/stream.jsonl",
      "sha256": "e2db308fa40eb901a49f8dfa0a97d4b8a101e43a1b167f071c32345f30a57f3c"
    },
    {
      "id": "models",
      "path": "benchmark-runs/codex-e2e-mac-20261014-01/model-list.json",
      "sha256": "061e741c47696f787dedf625fd79c1cd36a9a7a0d80c7d86aa5e13530c9bc757"
    },
    {
      "id": "protocol",
      "path": "benchmark-runs/codex-e2e-mac-20261014-02/PROTOCOL.md",
      "sha256": "de2920cf4a3fa4ebb7efb5f99b1874c073025241bd95a7e2dacbde6a235e6cb6"
    },
    {
      "id": "tests",
      "path": "benchmark-runs/codex-e2e-mac-20261014-01/tests.tap",
      "sha256": "572ab117c944df68c3043b731d4c1c286facdc4a3b76949b195f30e6bba743d0"
    },
    {
      "id": "summary",
      "path": "benchmark-runs/codex-e2e-mac-20261014-02/comparison-summary.json",
      "sha256": "97a3e61b67c440b3f6c4ffa7bcf842b166ae42857a20b25356ff64c010dd550c"
    },
    {
      "id": "codex_audit",
      "path": "benchmark-runs/codex-e2e-mac-20261014-02/codex-arm-audit.json",
      "sha256": "74da200d380d3219b67a2220c12ba049d17b2686d4f602a8ba5aa43e4d722357"
    },
    {
      "id": "jev_audit",
      "path": "benchmark-runs/codex-e2e-mac-20261014-02/jev-arm-audit.json",
      "sha256": "224cdc2689d34ee17d14618be81a7d76ce82e2a7d815e76e662f929b9a547ed6"
    },
    {
      "id": "skills_after",
      "path": "benchmark-runs/codex-e2e-mac-20261014-02/skills-environment-after.json",
      "sha256": "a85d511c4be473aac0c4a6805870c09018a8f364ab330ee7b9c019fb373a6c79"
    },
    {
      "id": "preservation_final",
      "path": "benchmark-runs/codex-e2e-mac-20261014-02/preservation-final.json",
      "sha256": "a85fdce7b13f6ddafbcf8b3e9be2713e2c26bc305ca8626d7173d0d9287f18a8"
    },
    {
      "id": "cleanup",
      "path": "benchmark-runs/codex-e2e-mac-20261014-02/cleanup-final.json",
      "sha256": "e91312b4bc4840d06273bf753eefaa2a5a4d644f23a458424406ae201965c175"
    },
    {
      "id": "tests_final",
      "path": "benchmark-runs/codex-e2e-mac-20261014-02/final-tests.tap",
      "sha256": "8dd2cd409555415c3831142b49f18fd184b35858271f92bc90840be122c9c4da"
    },
    {
      "id": "report",
      "path": "docs/orchestration/CODEX_MAC_RESULTS.md",
      "sha256": "140d16a1b9ffc40235edb6f311bc83022817f41d9f6e17b7eee9f01ecff19015"
    }
  ],
  "claims": [
    {
      "id": "host",
      "kind": "decision",
      "text": "Narrow explicit execution-host mac exception in new full-development CLI and arm; defaults retain cloud policy.",
      "source_ids": [
        "runner",
        "cli"
      ]
    },
    {
      "id": "first_failure",
      "kind": "measured",
      "text": "Pair01: one Codex decision process, zero workers, zero Jev calls. HTTP400 unsupported gpt-6.1-sol with ChatGPT. Usage unavailable; no development completion or speed ratio.",
      "source_ids": [
        "failed_pair",
        "failed_trace"
      ]
    },
    {
      "id": "profile_correction",
      "kind": "correction",
      "text": "Initial gpt-6.1-sol was configured but not capability verified. CLI model/list returns default gpt-5.6-sol with high supported; fresh pair02 uses that identical profile in both arms. Original failure preserved.",
      "source_ids": [
        "models",
        "protocol",
        "failed_trace"
      ]
    },
    {
      "id": "focused",
      "kind": "measured",
      "text": "node --test test/codex-e2e-decisions.test.mjs test/codex-e2e-integration.test.mjs passed8/8. Mock model responses do not establish live completion.",
      "source_ids": [
        "tests"
      ]
    },
    {
      "id": "actual_pair",
      "kind": "measured",
      "text": "Both conditions incomplete: Codex1381638.293375ms,1084007tokens,independent57/63; Jev402412.50375ms,300500tokens,independent0/63. No completed speedup or cost ratio.",
      "source_ids": [
        "summary",
        "codex_audit",
        "jev_audit"
      ]
    },
    {
      "id": "initial_split",
      "kind": "measured",
      "text": "Identical four canonical requests/210questions: provider wall Codex243814.661083ms / Jev9263.180124ms=26.32083775; this is initial decision latency only with CLI context limitations.",
      "source_ids": [
        "summary"
      ]
    },
    {
      "id": "context_drift",
      "kind": "measured",
      "text": "Filesystem skill snapshots: one added, one removed, three content hashes changed. Effective prompt impact unknown, so full context control is not established.",
      "source_ids": [
        "skills_after"
      ]
    },
    {
      "id": "preserved",
      "kind": "measured",
      "text": "42050 immutable oldfiles unchanged; mutable sharedledger excluded.100 own check containers absent;2 grader removal receipts true.",
      "source_ids": [
        "preservation_final",
        "cleanup"
      ]
    },
    {
      "id": "final_tests",
      "kind": "measured",
      "text": "Focused final regression passed9/9; product completion still false.",
      "source_ids": [
        "tests_final"
      ]
    }
  ],
  "costs": [
    {
      "role": "Codex and Jev actual charges",
      "basis": "unknown",
      "usd": null,
      "source_ids": []
    },
    {
      "role": "Jev four decisions historical token-pack equivalent, not monthly billing",
      "basis": "api_equivalent",
      "usd": 0.0899112,
      "source_ids": [
        "summary"
      ]
    }
  ],
  "unresolved": [
    "Both products incomplete; no completion speed/cost savings demonstrated.",
    "Partial execution repair binding rejects missing revisions before Jev owner decision.",
    "Codex owner selections omit implicated template A16; root cause based on public static analysis, no corrective rerun.",
    "Global skill environment drift and unknown effective prompt.",
    "Matching official Codex price and actual monthly allocation unavailable."
  ],
  "side_effects": [
    "No running benchmark driver or active cohort lock. Own check containers100 removed and grader2 cleanup receipts confirmed.",
    "Working tree remains uncommitted; no push.",
    "New evidence, original failed attempt and source-before copies retained. Generated protocol files remain /private/tmp/jev-codex-protocol-20261014.",
    "Shared concurrent ledger legitimately updated by Jev4 calls; not reset or attributed by globaldelta."
  ]
}
```

2026-10-15 근거 경로 정정: 새 구현으로 바뀐 runner/CLI 소스는 실행 당시와 동일한 SHA의 `codex-repair-20261015-01/source-before/` 사본을 가리키도록 변경했다. 기존 결과와 기록된 해시는 변경하지 않았다.
