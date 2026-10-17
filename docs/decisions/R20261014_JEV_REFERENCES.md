# R20261014-JEV-REFERENCES — Jev 활용·평가 참고와 최신 Pointsman 확인

사용자는 pg-jev 유사 벤치마킹 조사를 요청한 뒤 **구현 참고와 성능 평가 모두**로 범위를 확정하고 **우리 최신 버전을 가져와 확인**하도록 지시했다. [조사·최신 코드 연결점](../research/JEV_REFERENCE_BENCHMARKS_2026-10-14.md)과 [동기화/검사 영수증](../../benchmark-runs/reference-research-sync-20261014-01/verification.json)을 따른다. 연구 제안 채택이나 새 유료 실험은 수행하지 않았다.

최초 로컬 D081 확인 뒤 원격 research의 D082/D083 추가10커밋을 발견해 반영했다. 조사에 임시 사용한 D082 번호는 원격 클라우드 기록과 충돌해 이 날짜 기반 ID로 변경했으며, 첫 문서4개의 원문을 보존했다. 현재 실행 정본은 D083, 공개 릴리스 main은 v0.3.2다. 공개 소스·문서 열람과31/31 오프라인 검증을 실제 모델 성능 재현으로 확대하지 않는다.

```decision-record
{
  "id": "R20261014-JEV-REFERENCES",
  "goal": "Research Jev implementation references and evaluation harnesses, update the local Pointsman repository to its latest remote development/release refs, and verify the mapping against the fetched D083 source without a new paid benchmark.",
  "owner": "root",
  "status": "complete",
  "next_trigger": "Choose the primary reference and freeze its source and comparison protocol before any implementation or new measurement. Recommendations remain proposals.",
  "conditions": [
    "User requested research into better benchmarking references like pg-jev.",
    "The user explicitly confirmed both implementation references and evaluation benchmarks, then requested fetching and checking our latest version.",
    "Initial local inspection was D081. Fetch revealed ten missing research commits; the worktree was fast-forwarded to D083 at 2b3c9ac and the main ref to release v0.3.2 at 8b2da35, preserving local research edits.",
    "Verification is primary documentation and selected source inspection on 2026-10-14, not local reproduction.",
    "Executed Git synchronization and focused offline regression; no new clone, dependency installation, credential read, provider inference, Docker run or completed-result replay.",
    "A local document hash pins this research report, not the mutable external websites or a specific remote commit."
  ],
  "sources": [
    {
      "id": "research",
      "path": "docs/research/JEV_REFERENCE_BENCHMARKS_2026-10-14.md",
      "sha256": "980fd779b3c92726509276ff968d0ee378abcde440127992827784cc5aea7501"
    },
    {
      "id": "latest-sync",
      "path": "benchmark-runs/reference-research-sync-20261014-01/verification.json",
      "sha256": "e1e1083de3efd2f89a2e57029fe0c1ac0ae4bf6c01b1df876d3f3c0eebb8a5b4"
    }
  ],
  "claims": [
    {
      "id": "references",
      "kind": "measured",
      "text": "Reviewed primary repository/documents for pg-jev, jev-kit, jev-ultrafast, JevSpawn, jev-route, JevBench and ReflexBench, plus the REFLEX paper. Report links the source pages, observations and limits. Author-reported measurements are not our own runs.",
      "source_ids": [
        "research"
      ]
    },
    {
      "id": "priority",
      "kind": "hypothesis",
      "text": "jev-kit and jev-ultrafast are the closest implementation references; JevSpawn is a branching/action-space design reference. JevBench and ReflexBench are the strongest immediate candidates for evaluating typed decisions and deterministic policy effects. This is a fit judgment, not a measured speed ranking or an adopted runtime change.",
      "source_ids": [
        "research"
      ]
    },
    {
      "id": "comparison",
      "kind": "hypothesis",
      "text": "A useful future comparison fixes workers/tools/slots/checks and tests strong judgment, code filtering plus strong judgment, the same filtering plus a cheap generative decider, and the same filtering plus Jev. Worker model/effort optimization is a separate experimental factor.",
      "source_ids": [
        "research"
      ]
    },
    {
      "id": "limits",
      "kind": "unknown",
      "text": "Local reproducibility, Jev AI endpoint compatibility, complete workflow gains, actual billed costs and optimal batching sizes are unmeasured in this research. REFLEX paper code distribution was not verified.",
      "source_ids": [
        "research"
      ]
    },
    {
      "id": "latest-correction",
      "kind": "correction",
      "text": "The first report treated local D081 as current and assigned research ID D082. Fetch found research ten commits ahead with pre-existing cloud D082/D083 records. Preserved four exact local files, renamed this research record to R20261014-JEV-REFERENCES, fast-forwarded research0fda933->2b3c9ac and mainbfdaefe->8b2da35(v0.3.2); fetched cloud decision records remain byte-identical.",
      "source_ids": [
        "latest-sync",
        "research"
      ]
    },
    {
      "id": "offline-checks",
      "kind": "measured",
      "text": "After synchronization,31/31 focused tests passed,fail/cancel/skip0,duration16943.006291ms. Command and log hash are in latest-sync. AST inspection confirms planRepairOwnerRequest, workerMentionedExpansion and selectInferredOwnerScope call edges; initial limited-path misses are preserved. This is not full-suite or live E2E validation.",
      "source_ids": [
        "latest-sync",
        "research"
      ]
    },
    {
      "id": "cloud-evidence-boundary",
      "kind": "measured",
      "text": "Fetched D083 documentation reports public+independent completion2/3; new raw compaction and scope expansion each fired0/3 trials. Original cloud run directories are absent locally, so the report was not reaudited against raw receipts and no improvement is attributed to the untriggered changes.",
      "source_ids": [
        "latest-sync",
        "research"
      ]
    }
  ],
  "costs": [
    {
      "role": "new local benchmark and actual invoice",
      "basis": "unknown",
      "usd": null,
      "source_ids": []
    }
  ],
  "unresolved": [
    "External repository source commits have not been frozen or locally executed.",
    "Jev AI adapter compatibility and quality-preserving whole-workflow gains need later measurements.",
    "D083 new recovery paths need targeted triggering cases; existing cloud success counts do not measure their effects."
  ],
  "side_effects": [
    "Advanced active research to2b3c9ac and local main to v0.3.2 without switching the worktree; preserved local document edits and four before-sync copies.",
    "Renamed the colliding local research D082 record; original fetched D082/D083 cloud records are unchanged.",
    "Added ignored synchronization/AST/test receipts and local research/work-log/decision-index edits; no new commit or push.",
    "No new provider inference, ledger access, Docker call, dependency installation or external benchmark execution."
  ]
}
```
