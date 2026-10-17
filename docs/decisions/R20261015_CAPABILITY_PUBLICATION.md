# R20261015 — 기능 경계·스킬 분해·시간/토큰 공개

사용자 요청에 따라 읽기 전용 기능/수치 감사를 분업하고 공개 문서와 저장소 토픽을 갱신했다. [PR15](https://github.com/Kai-Leee/pointsman/pull/15), main02ace1d/v0.3.4. Docker 재채점 보류는 유지한다. 실측 원본은 변경하지 않았다.

```decision-record
{
  "id": "R20261015-CAPABILITY-PUBLICATION",
  "goal": "Publish code-verified capability boundaries, skill decomposition and reproducible measured time/token effects.",
  "owner": "root",
  "status": "complete",
  "next_trigger": "Use published capability matrix for release scope; require separate authorization to resume held Jev final grading.",
  "conditions": [
    "User requested main/research capability separation, skill split guidance, measured token/time publication and jev/jev-router/dag topics.",
    "Documentation-only0.3.4; no research code promotion or new paid experiment.",
    "Preserve previous results and user regrading hold.",
    "Use separate reported provider token buckets without adding cacheTTL/reasoning subsets again.",
    "CompletedD067 workflows and local initialdecisionstage are distinct; no statistical/general performance guarantee."
  ],
  "sources": [
    {
      "id": "capabilities",
      "path": "benchmark-runs/capability-publication-20261015/capabilities.json",
      "sha256": "3842e98cc4b7d7c8b529e6d42a82ecfc1829a0596086b0b5c970d05f4cfa6ffd"
    },
    {
      "id": "skills",
      "path": "benchmark-runs/capability-publication-20261015/skills.json",
      "sha256": "494e234407278e7dda653e638744b52de876b5edaf05064a7c8945a9bba6a297"
    },
    {
      "id": "metrics_audit",
      "path": "benchmark-runs/capability-publication-20261015/metrics.source-audit.json",
      "sha256": "76ff69d64fc07186961537f7e1793aa3aa7b0c1f2713b3de7f502e39a86a2b41"
    },
    {
      "id": "metrics",
      "path": "benchmark-runs/capability-publication-20261015/metrics.aggregate-public.json",
      "sha256": "1a8c0436dc9d77f94b9a2753ff5a54a8d92fd06b85f33258bf98cb09ffa75dcb"
    },
    {
      "id": "published_manifest",
      "path": "benchmark-runs/capability-publication-20261015/published-manifest.json",
      "sha256": "74b92258f1601398b830b05da43795af53649e7ffaf04ef3e5fa91bf445812a2"
    },
    {
      "id": "tests",
      "path": "benchmark-runs/capability-publication-20261015/main-tests.tap",
      "sha256": "97677bb2465146a31ba7fe41ebe8f6b66526556acaa1a6d22c7f06421806f992"
    },
    {
      "id": "links",
      "path": "benchmark-runs/capability-publication-20261015/links.txt",
      "sha256": "623f7b40429f92831431f812f2ab646439f9ba6e1f21b504f03b0d3722b4baed"
    },
    {
      "id": "publication",
      "path": "benchmark-runs/capability-publication-20261015/publication.json",
      "sha256": "ec9ced678800739da151ae2636a02223cb65e538ed330d2c44b44cccb6dfa680"
    },
    {
      "id": "topics",
      "path": "benchmark-runs/capability-publication-20261015/topics.json",
      "sha256": "e4795cf6be920ba85624eb845fedaf63015a10cd8b9cf09b0e876281b6e31700"
    }
  ],
  "claims": [
    {
      "id": "capabilities",
      "kind": "measured",
      "text": "Read-only audit main7310cc4, origin/research5f9b668 and local2b3c9ac+uncommitted:15capabilities/42sourcepaths; basic main experiments distinguished from advanced research and local gateway/Codex runtime.",
      "source_ids": [
        "capabilities"
      ]
    },
    {
      "id": "skills",
      "kind": "measured",
      "text": "Tracked main1skill,research3skills,local4skills;23sourcehashes matched. D083 reuses D066 atomiccatalog and pairrelations drive code clustering; generic skill classification not implemented.",
      "source_ids": [
        "skills"
      ]
    },
    {
      "id": "tokens",
      "kind": "measured",
      "text": "D067 three completed rows:6772666/3967289/3623150reportedtokens; Jevsplit41.42204857percent and splitrelations46.50334152percent reductions vs6772666baseline. Time reductions28.73694290/21.83532112percent vs2180703.603375ms. Each n1,public85/85,independent63/63.632sourcehashes agree.",
      "source_ids": [
        "metrics",
        "metrics_audit"
      ]
    },
    {
      "id": "split",
      "kind": "measured",
      "text": "Separate local initialsplit210questions/4calls:245919.542166ms vs6497.730124ms,37.84699233ratio;182215vs167726tokens,7.95159564percent.40comparison-sourcehashes match. Not whole-development completion.",
      "source_ids": [
        "metrics",
        "metrics_audit"
      ]
    },
    {
      "id": "test",
      "kind": "measured",
      "text": "Main394/394tests passed;269links zero broken; fourCIchecks success. No new paid model call,Docker start or held regrade.",
      "source_ids": [
        "tests",
        "links",
        "publication"
      ]
    },
    {
      "id": "publish",
      "kind": "measured",
      "text": "PR15 merged main02ace1dc94b1dcd29809ea4c407417c7c0c836ce; v0.3.4 pushed onmergecommit. Requested repositorytopics jev,jev-router,dag present.",
      "source_ids": [
        "publication",
        "topics",
        "published_manifest"
      ]
    }
  ],
  "costs": [
    {
      "role": "historical D067 reported equivalent; not current monthly allocation",
      "basis": "api_equivalent",
      "usd": 8.7665802,
      "source_ids": [
        "metrics"
      ]
    }
  ],
  "unresolved": [
    "pointsman-routing/gateway/Codex full comparison remain local uncommitted; not main/research released.",
    "No measured benefit attributable solely to skill packaging.",
    "Latest Jev final grading stays on user hold.",
    "Single observation per completed D067 condition; provider tokenizers differ, true monthly cost unknown."
  ],
  "side_effects": [
    "Main13documentation/evidence/versionfiles committed and published viaPR15;v0.3.4tag.",
    "Repositorytopics added without removing other topics.",
    "Local audit evidence and releaseworktree retained.",
    "Research checkout has preexisting uncommitted implementation plus new auditrecords; no researchpush."
  ]
}
```
