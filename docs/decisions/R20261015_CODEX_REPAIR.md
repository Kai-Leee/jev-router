# R20261015 — 수정·실측·공개와 검증 차단

사용자가 병렬 수정, Mac 실제 비교, 기존 결과 보존, 메인 긍정적 실험 공개를 승인했다. 실행·감사 보고는 끝났으나 제품 성공과 Jev 최종 재채점은 미완료다. [결과](../orchestration/CODEX_REPAIR_RESULTS.md).

```decision-record
{
  "id": "R20261015-CODEX-REPAIR",
  "goal": "Implement repair/context controls, execute a preserved Mac comparison and audit actual outcomes; publish scoped historical positive DAG routing evidence.",
  "owner": "root",
  "status": "complete",
  "next_trigger": "Keep Docker available and run a new no-inference final-candidate validation path; do not retry the paid pair automatically.",
  "conditions": [
    "User authorized parallel fixes, Mac Codex vs Jev runs and positive main publication.",
    "Same requested gpt-5.6-sol/high workers and frozen CLI for new pair; source/catalog/environment fingerprints match.",
    "One sequential pair, maximum2repair rounds; no overall10minute limit, no uncertain paid retries.",
    "Original outcomes and previous result files preserved. Independent grade never fed into model repair.",
    "Record complete means implementation/run/audit report completed; product and final Jev grading remain incomplete."
  ],
  "sources": [
    {
      "id": "summary",
      "path": "benchmark-runs/codex-repair-20261015-01/summary.json",
      "sha256": "38addda32f4e4b3651c2ea766b25da25cdc70f4c8114c5de05f87d75b62dfe3b"
    },
    {
      "id": "protocol",
      "path": "benchmark-runs/codex-repair-20261015-01/PROTOCOL.md",
      "sha256": "bc6ef74da065aae4b3f28fbb7784f7360a803bdd53ad44e999e16f0115cfa922"
    },
    {
      "id": "preservation",
      "path": "benchmark-runs/codex-repair-20261015-01/preservation-final.json",
      "sha256": "3e85bc8e01ea3d3e5adcbc37a5866c06e6769385ce9b687354a794cd05a95d02"
    },
    {
      "id": "source",
      "path": "benchmark-runs/codex-repair-20261015-01/source-final.json",
      "sha256": "c1f7470bb8955f4b03404680c78d4029eb5cab6c149dd3f788787d3aa8734e06"
    },
    {
      "id": "cleanup",
      "path": "benchmark-runs/codex-repair-20261015-01/cleanup-partial.json",
      "sha256": "f0e7f54a4427527e25be3a99aa1597aaa448215c5d1af2a3cd9f116a39895fe5"
    },
    {
      "id": "incident",
      "path": "benchmark-runs/codex-repair-20261015-01/environment-incident.json",
      "sha256": "4eb8f149aa426cb63f106aa4f77da165cecf311ba3a892e5eeaf86f5ca8fdf22"
    },
    {
      "id": "recovery",
      "path": "benchmark-runs/codex-repair-20261015-01/recovery-final-jev/validation-result.json",
      "sha256": "2f8d1ad6f9b6e8c55482d834d91ace968f1b37a32d54992028b6ebf77937bd55"
    },
    {
      "id": "recovery_binding",
      "path": "benchmark-runs/codex-repair-20261015-01/recovery-final-jev/provenance.json",
      "sha256": "585a5b14e90e0fb7ada374b3879b934ecb3eab29e94bf16a6c8281ecfb59b87b"
    },
    {
      "id": "checker_binding",
      "path": "benchmark-runs/codex-repair-20261015-01/recovery-final-jev/checker-original-binding-audit.json",
      "sha256": "a116a7ff818382a44319138c6bab1f8c356f021d1a32d62e3fda506187b574dd"
    },
    {
      "id": "owner",
      "path": "benchmark-runs/codex-repair-20261015-01/jev-final-owner-audit.json",
      "sha256": "fe9cd00820853bef2fcc0750697f3a92d00b7ff98c1150c4ad8f2589cda2cc71"
    },
    {
      "id": "codex_diagnostic",
      "path": "benchmark-runs/codex-repair-20261015-01/codex-final-repair-audit.json",
      "sha256": "b09c9457c4275674e38fef877cc7d188dc5ad23a9dac2cd155a80f7cf12a625c"
    },
    {
      "id": "tests",
      "path": "benchmark-runs/codex-repair-20261015-01/integration-tests-final.tap",
      "sha256": "32f338342aff1ba71dcd90695abfe924b495ed51b7ce1c903f36fef58c82e187"
    },
    {
      "id": "publication",
      "path": "benchmark-runs/codex-repair-20261015-01/main-publication.json",
      "sha256": "33f720b1f19e6d3194c0901a208764e4657ef0baeef93434afb4a1098e4464a2"
    },
    {
      "id": "report",
      "path": "docs/orchestration/CODEX_REPAIR_RESULTS.md",
      "sha256": "88e645fafc81ebd03b44dc9a68401044610e065879d778964dcc0fa608983198"
    }
  ],
  "claims": [
    {
      "id": "run",
      "kind": "measured",
      "text": "One sequential Mac pair: Codex failed at 1677019.052541ms,902725tokens,92/93public,59/63independent. Jev uncertain at1441260.467833ms,1194346tokens,no final candidate public result or independent grade.",
      "source_ids": [
        "summary"
      ]
    },
    {
      "id": "split",
      "kind": "measured",
      "text": "Canonical210questions/4calls identical. Adapter wall Codex245919.542166ms / Jev6497.730124ms=37.84699233. Not completion speedup.",
      "source_ids": [
        "summary"
      ]
    },
    {
      "id": "preserve",
      "kind": "measured",
      "text": "43920 prior files and119 pinned sources unchanged;25 worker temporary folders and temporary CLI home removed. Final Docker residue audit unavailable.",
      "source_ids": [
        "preservation",
        "source",
        "cleanup"
      ]
    },
    {
      "id": "fixes",
      "kind": "measured",
      "text": "Focused62/62 passed; actual partial readiness activation0, public source collections2 eacharm but addedartifact0/expanded dispatch0. Targeted repairs proven by previous failure replay, not activated live fixes.",
      "source_ids": [
        "tests",
        "summary",
        "report"
      ]
    },
    {
      "id": "owner",
      "kind": "measured",
      "text": "30 then9 failures retained; A13 omitted initially, chosen by next Jev using raw worker text; round2 exact writable input verified.",
      "source_ids": [
        "owner"
      ]
    },
    {
      "id": "environment",
      "kind": "measured",
      "text": "Docker socket absent; restored pinned image unchanged, two exit137 OOMKilledfalse containers removed. Docker absent again during recovery; cause unknown, no inference retry.",
      "source_ids": [
        "incident",
        "cleanup",
        "recovery"
      ]
    },
    {
      "id": "verification_defect",
      "kind": "correction",
      "text": "Public section parser confuses return type with section heading; does not override score. Recovery optional checker pin field mismatch was supplemented with explicit60file checker_manifest hash audit.",
      "source_ids": [
        "codex_diagnostic",
        "checker_binding",
        "report"
      ]
    },
    {
      "id": "publish",
      "kind": "measured",
      "text": "PR14 merged7310cc4 with4CIchecks success. Positive historical D067 time21.84percent/API-equivalent58.52percent scoped to one completed pair, not current Codex results.",
      "source_ids": [
        "publication",
        "report"
      ]
    }
  ],
  "costs": [
    {
      "role": "Jev new9calls historical token pack equivalent",
      "basis": "api_equivalent",
      "usd": 0.1853106,
      "source_ids": [
        "summary"
      ]
    },
    {
      "role": "Codex and complete pair billing",
      "basis": "unknown",
      "usd": null,
      "source_ids": [
        "summary"
      ]
    },
    {
      "role": "Current subscription allocation",
      "basis": "monthly_allocation",
      "usd": null,
      "source_ids": [
        "summary"
      ]
    }
  ],
  "unresolved": [
    "Jev final93public and63independent checks blocked by repeatedly unavailable Docker; last full round84/93 is not final score.",
    "Exact-path feedback extraction misses shortened paths; repeated causal failure may select unrelated workers.",
    "Public section diagnostic ambiguous; existing scores preserved.",
    "Codex actual model identity/unitprice and monthly allocation unverified; no completed efficiency claim.",
    "No future paid rerun authorized by this record."
  ],
  "side_effects": [
    "Research source/docs remain uncommitted on feat/d083-skill-gateway; main publication merged separately.",
    "Raw old/new results, final candidate recovery copy and release worktree retained.",
    "Temporary auth HOME and25worker folders removed; two known stopped containers removed, final global Docker state unavailable.",
    "Docker opened once then process/socket disappeared again; asked user whether manually stopped."
  ]
}
```
