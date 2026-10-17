# D067 이후 결과 누락 정정

메인에는 D067 완료 비교만 강조했고 이후 결과 연혁을 연결하지 않았다. 후속 성공·실패·수리·반복 결과를 확인해 [PR16](https://github.com/Kai-Leee/pointsman/pull/16)으로 공개했다. 전체 raw재집계가 아닌 공개 문서 감사다.

```decision-record
{
  "id": "R20261016-POST-D067-RESULTS",
  "goal": "Correct the omission of post-D067 experimental outcomes from the main results navigation.",
  "owner": "root",
  "status": "complete",
  "next_trigger": "Later full-token aggregation requires saved receipts and consistent boundaries; held regrading remains stopped.",
  "conditions": [
    "User challenged why post-D067 results were absent; this corrects the preceding publication task.",
    "Document-level inventory of18public research result sources at5f9b668; not a new audit of every raw receipt.",
    "No paid model inference, localDocker start or regrading.",
    "Keep full development, repair, feature activation, partial/final quality and denominators distinct."
  ],
  "sources": [
    {
      "id": "sources",
      "path": "benchmark-runs/post-d067-publication-20261016/source-manifest.json",
      "sha256": "350074d9a7d939f6534affe2bc9fd3b3ed2b4a6b98d6adefd26c2ba54a72dc78"
    },
    {
      "id": "timeline",
      "path": "benchmark-runs/post-d067-publication-20261016/POST_D067_RESULTS.md",
      "sha256": "dd989c54dda4241d4a8eba7567574bafc5e8af7950670741fcbc9d8e251b0483"
    },
    {
      "id": "timeline_en",
      "path": "benchmark-runs/post-d067-publication-20261016/POST_D067_RESULTS.en.md",
      "sha256": "ac343818a4cdd7aeac87fb558e02ec3cddd329eb628aa564e3dbaab72961aff9"
    },
    {
      "id": "tests",
      "path": "benchmark-runs/post-d067-publication-20261016/tests.tap",
      "sha256": "7715045b27b57bc73262f99833528f79c31381c4687e5eede0d9c23b988e326f"
    },
    {
      "id": "links",
      "path": "benchmark-runs/post-d067-publication-20261016/links.txt",
      "sha256": "ac5bf5c03fb7fcbc3b5317fcbb3840db2d307278fcf4cacb8c15772fc411ed44"
    },
    {
      "id": "publication",
      "path": "benchmark-runs/post-d067-publication-20261016/publication.json",
      "sha256": "6611990990a1ae6a77b9467ac727ffbce141820b2be8920445114038a043bb59"
    }
  ],
  "claims": [
    {
      "id": "omission",
      "kind": "correction",
      "text": "Main highlighted D067 completed comparison but omitted the later results timeline. D069/D070 repair/D076/D079/D082/D083/D085 include real successful results; later successes are not absent.",
      "source_ids": [
        "timeline",
        "sources"
      ]
    },
    {
      "id": "later_runs",
      "kind": "measured",
      "text": "Published D082 document:5of7terminalrunscomplete, separate08userstop; D0832of3complete but newfixes untriggered; D0852of3complete, directrepair and workermentioned expansion triggered03. Documentary evidence level.",
      "source_ids": [
        "timeline",
        "sources"
      ]
    },
    {
      "id": "publication",
      "kind": "measured",
      "text": "PR16 mergedmainbaab3d16e47699daaa92067e1e05821db9f77fe0;v0.3.5posted. Local394/394tests,320links0broken,4CIchecks pass.",
      "source_ids": [
        "tests",
        "links",
        "publication"
      ]
    }
  ],
  "costs": [],
  "unresolved": [
    "Later experimental conditions differ and do not establish every newversion outperformingD067.",
    "Later Jev input-only counts are not full cache-aware workflow totals; no full late-generation token aggregation performed.",
    "LocalCodexfinalJevgrading remains on userhold."
  ],
  "side_effects": [
    "10main documentation/versionfilespublished;rawresults unchanged.",
    "Newlocal evidence snapshots and researchdecisionrecord retained;researchimplementation remains uncommitted."
  ]
}
```
