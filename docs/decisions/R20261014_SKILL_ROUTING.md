# R20261014-SKILL-ROUTING — 스킬 라우팅과 사용 전제 설계

사용자의 두 설계 요청을 [설계안](../skills/POINTSMAN_ROUTING_DESIGN.md)과 [저장소 스킬 초안](../../skills/pointsman-routing/SKILL.md)에 반영했다. 완료는 설계·초안 작성 범위다. 새 runtime이나 설치 완료를 뜻하지 않는다.

```decision-record
{
  "id": "R20261014-SKILL-ROUTING",
  "goal": "Design skill-based Pointsman routing and prerequisites; prepare a repository-only operational draft without changing runtime behavior.",
  "owner": "root",
  "status": "complete",
  "next_trigger": "Implement project manifest, capability checks and a single validated dispatch path, then test actual host discovery and routing.",
  "conditions": [
    "User requested design of skill routing and prerequisites, not a new live experiment.",
    "Inspected research2b3c9ac and main8b2da35. Source draft only; operational proposals are not deployed decisions."
  ],
  "sources": [
    {
      "id": "design",
      "path": "docs/skills/POINTSMAN_ROUTING_DESIGN.md",
      "sha256": "10df699fabf67099c2a13c0901ff87e070987171c5d7bae06d6c454a1c8802af"
    },
    {
      "id": "skill",
      "path": "docs/skills/routing-evidence-20261014/pointsman-routing-draft.md",
      "sha256": "16c735fdc345d198869cdb739dd223eb8ab881239a9b0e75925c3a51bfa0f3e3"
    },
    {
      "id": "verification",
      "path": "docs/skills/routing-evidence-20261014/verification.json",
      "sha256": "3993d07eff4f56662992d438c70d950b979aa562dff9cd6164d8532da5ac56e4"
    }
  ],
  "claims": [
    {
      "id": "design",
      "kind": "hypothesis",
      "text": "A thin host entry skill, deterministic eligibility filter and Jev selection bound to registered handlers may remove repeated main-model comparison. Efficiency is unmeasured.",
      "source_ids": [
        "design",
        "skill"
      ]
    },
    {
      "id": "validation",
      "kind": "measured",
      "text": "Offline fallback structural assertions and one explicit relative Markdown file link passed. The three inspected personal installation roots have no pointsman-routing copy. Command: node docs/skills/routing-evidence-20261014/check.mjs. This is not host discovery or semantic evaluation.",
      "source_ids": [
        "verification"
      ]
    },
    {
      "id": "validator-failure",
      "kind": "measured",
      "text": "The official quick_validate.py failed before validation in both system and bundled Python because yaml was missing. Used an existing Node YAML package for a separately labelled structural check, without installing dependencies.",
      "source_ids": [
        "verification"
      ]
    },
    {
      "id": "integration-gap",
      "kind": "unknown",
      "text": "Universal skill registry, doctor and skill dispatcher are not implemented. Native host automatic invocation and efficiency gains are unmeasured.",
      "source_ids": [
        "design"
      ]
    }
  ],
  "costs": [],
  "unresolved": [
    "Implement and test the proposed gateway and project registry.",
    "Refresh D075-specific prompting guidance against the chosen D083 runtime.",
    "Validate deployment bundle and Claude/Codex host behavior."
  ],
  "side_effects": [
    "Local design/skill/evidence/index documents remain uncommitted.",
    "Two /tmp diagnostic JSON files retained. No installs, paid calls, Docker, ledger changes, commit or push."
  ]
}
```

2026-10-14 구현 후 정정: 위 skill source는 당시 바이트와 SHA가 같은 `pointsman-routing-draft.md` 스냅샷으로 연결했다. 현재 스킬 변경을 역사적 초안 검증으로 소급하지 않는다.
