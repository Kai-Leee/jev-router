# R20261014 — D083 스킬 실행 연결

[상세 구현·명령·한계](../orchestration/POINTSMAN_D083_GATEWAY.md). 사용자가 승인한 구현과 호스트 검증 중 Claude 실행과 장부 보존 확인은 미완료다.

```decision-record
{
  "id": "R20261014-ROUTING-IMPLEMENTATION",
  "goal": "Connect guarded D083 decisions to host skills and verify real Claude/Codex behavior while preserving prior results.",
  "owner": "root",
  "status": "blocked",
  "next_trigger": "Claude weekly quota restored; identify original ledger bytes and change provenance before claiming complete preservation.",
  "conditions": [
    "User authorized implementation, new branch and actual host verification.",
    "New branch feat/d083-skill-gateway. Existing cloud-only paid benchmark policy retained.",
    "Local real executor uses deterministic Jev/worker fixture providers; host model inference is accounted separately."
  ],
  "sources": [
    {
      "id": "implementation",
      "path": "docs/orchestration/POINTSMAN_D083_GATEWAY.md",
      "sha256": "c7606bbb8403405428321a10f91b8c2d52a8d2109ca4f58c7390a72e51d430cf"
    },
    {
      "id": "gateway",
      "path": "benchmark-runs/codex-repair-20261015-01/source-before/src/orchestration/pointsman-gateway.mjs",
      "sha256": "4a733661e1697b58e8deca019a02ce5f427d48a43aec2cd8539d4ee23a3ce202"
    },
    {
      "id": "runner",
      "path": "src/benchmark/adaptive-dag-runner.mjs",
      "sha256": "14ea4e3bd7af37dfbfa5f9d0bb7f82783d67dadd08dcf48e8acb11fe07834011"
    },
    {
      "id": "manifest",
      "path": "benchmarks/e2e-swe/manifests/pointsman-d083.json",
      "sha256": "8d089d353b7724d0eef8d4fcbb65c4eacc8f2b9543a6d0b776ab64550da7667d"
    },
    {
      "id": "verification",
      "path": "benchmark-runs/routing-20261014-01/verification.json",
      "sha256": "c05ea0a80ddefa2806f9a9be3fe6282b308a25a0a8776a2bf8b9f0bb7e3cb6b8"
    },
    {
      "id": "focused",
      "path": "benchmark-runs/routing-20261014-01/focused-02.tap",
      "sha256": "10f5a931e118f149583091d9ff28e1b2a4dee999ad239f36de8ba5cc478f7ed2"
    },
    {
      "id": "runner_final",
      "path": "benchmark-runs/routing-20261014-01/runner-final.tap",
      "sha256": "bc0b5aa32b5bd3413f5ddd84ab4073a5f0c5167aebdf7aec7544770a5978adc1"
    },
    {
      "id": "regression",
      "path": "benchmark-runs/routing-20261014-01/regression-01.tap",
      "sha256": "4c3dd3690284cada5d13fc3f4d817220716af52858e34874fdb36a4c804c3cc9"
    },
    {
      "id": "server",
      "path": "benchmark-runs/routing-20261014-01/dashboard-host-01.tap",
      "sha256": "a0de12c0ae05b92e909a8e7acf6bd0f5edb2a6662837140a8d31fd3530ad7943"
    },
    {
      "id": "transport",
      "path": "benchmark-runs/routing-20261014-01/transport-host-01.tap",
      "sha256": "fc7ed5c625b10b993466e303f6598c5c396dc4b603facbf3fdc1c7d5656d4b68"
    },
    {
      "id": "preservation",
      "path": "benchmark-runs/routing-20261014-01/preservation-after.json",
      "sha256": "89717e9efd5993eec7d8291586fcba5e9393e9dc05db97312b5d9e04cc46d1dd"
    },
    {
      "id": "investigation",
      "path": "benchmark-runs/routing-20261014-01/preservation-investigation.json",
      "sha256": "75b9aad33b3a4bcf83c5a798402283f099bd7f3012e7f4d75693a3e3f9a0e5be"
    }
  ],
  "claims": [
    {
      "id": "gateway",
      "kind": "measured",
      "text": "Focused gateway/session/install/transmission tests 36/36. Final runner tests8/8 include one added workflow replacement rejection. Test logs contain commands in implementation doc.",
      "source_ids": [
        "focused",
        "runner_final",
        "implementation"
      ]
    },
    {
      "id": "regression",
      "kind": "measured",
      "text": "Full run1374/1385 passed;11 localhost EPERM failures. Targeted host server10/10 and transport11/11 passed. Not a one-pass full-green suite.",
      "source_ids": [
        "regression",
        "server",
        "transport"
      ]
    },
    {
      "id": "hosts",
      "kind": "measured",
      "text": "Real Codex invoked installed skill and fixture workflow,2952.832041ms within smoke; five fixture decisions, four workers, eight checks. Actual Claude host rejected429 before skill execution; wrapper-only smoke passed.",
      "source_ids": [
        "verification"
      ]
    },
    {
      "id": "auth-correction",
      "kind": "correction",
      "text": "Sandbox auth false was not logout. Host auth true; Claude blocked by weekly quota. Codex fixture zero-cost statement excludes real host usage.",
      "source_ids": [
        "verification"
      ]
    },
    {
      "id": "preservation",
      "kind": "measured",
      "text": "SHA audit42050/42051 unchanged, denominator1308175717bytes. Only existing ledger differs. No original-byte backup; cause unknown and ledger not restored. Full preservation not achieved.",
      "source_ids": [
        "preservation",
        "investigation"
      ]
    },
    {
      "id": "efficiency",
      "kind": "unknown",
      "text": "No live Jev development, independent product grade or matched efficiency comparison in this change.",
      "source_ids": [
        "implementation"
      ]
    }
  ],
  "costs": [
    {
      "role": "host_inference",
      "basis": "unknown",
      "usd": null,
      "source_ids": [
        "verification"
      ]
    }
  ],
  "unresolved": [
    "Claude actual skill invocation after quota resets.",
    "Ledger difference provenance and original bytes; no speculative restore.",
    "Real Jev/worker cloud development measurement and portable runtime distribution remain unverified."
  ],
  "side_effects": [
    "Source and documentation remain uncommitted; no push.",
    "Isolated host skill copies and new ignored evidence directories remain.",
    "Actual CLI hosts may write their own session/state files. No new Docker container started."
  ]
}
```

2026-10-15 근거 경로 정정: 변경된 소스는 기록 당시 SHA와 일치하는 source-before 사본으로 연결했다. 결과·기존 해시는 수정하지 않았다.
