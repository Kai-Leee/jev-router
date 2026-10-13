# D080 — 기본 설정(보류 끔·임계 경로 우선·공개 명세 검토) 통합 실측

확인일: 2026-10-13 (Asia/Seoul). 사용자 승인: D079 근거로 보류를 끄고, 임계 경로 우선 스케줄을 유지하고, 공개 명세 검토를 공개 검사 뒤 단계로 runner에 넣는다. 브랜치 정책(2026-10-13)에 따라 `research`에 커밋·push한다.

## 구현

- [adaptive-spec-review.v1 계약](contracts/adaptive-spec-review.v1.json), [모듈](../../src/benchmark/adaptive-spec-review.mjs): 공개 검사를 통과한 최종 후보의 복사본을 D079와 같은 문구로 검토하고, 공개 검사 8개를 다시 돌려 93개가 모두 통과할 때만 채택한다. 검토 실패·미통과·오류는 실행을 실패로 만들지 않고 원래 후보를 유지한다. runner는 v12의 `forms.afterPublicGate`만 호출한다.
- manifest [d080-defaults.json](../../benchmarks/e2e-swe/manifests/d080-defaults.json): layered-v2, owner 설명 v2, 수리 범위 코드 규칙, 보류 없음, `schedule_policy`, `spec_review`, D076 `repair_budget`·`repair_feedback`·속도 옵션.
- D076 세션 리뷰 4건 반영: (1) 채택 시 `artifact_revisions_basis: pre_spec_review`와 검토 전후 파일 digest 기록, (2) `usage_including_spec_review`로 검토 비용 포함 합계, (3) 실행 마감(`context.remaining`)을 검토에 전달, (4) 검토자를 저장소 밖 임시 폴더에서 실행하고 저장소 경로 Read/Edit/Write 거부 규칙 추가.
- 격리 확인([probe](../../benchmark-runs/d080-isolation-probe-01/stream.jsonl), Haiku 1회 $0.0011): 작업 폴더 파일은 읽힘, 저장소 `package.json`은 거부 규칙으로 차단, `/etc/hosts`는 승인 주체 없음으로 차단. D079 검토 3회 기록에서도 도구 호출 97건 중 작업 폴더 밖 접근 0건(D076 세션 집계). 이전 D079·D080-01 검토는 (4) 적용 전 코드로 실행됐다.

## 통합 실측 (병렬 부하에서 측정)

| 실행 | 공개 | 수리 | 명세 검토 | 독립 | 실행기 시간 | API 환산 (검토 포함) |
| --- | --- | ---: | --- | --- | ---: | ---: |
| [d080-defaults-01](../../benchmark-runs/d080-defaults-01/jev_profile/result.json) | 83 → 93/93 | 1회 | 채택(4파일, 93/93 유지) | **63/63** | 1,594 s | $8.84 |
| [d080-defaults-03](../../benchmark-runs/d080-defaults-03/jev_profile/result.json) | 54/93 | 0회 | 미실행(공개 미통과) | 60/63 | 845 s | $5.69 |
| d080-defaults-02 | — | — | — | — | — | $0 (시작 점검 `BUDGET_OUTSTANDING`) |

- **01:** 계획 12초 → 0회차 구현·공개 13–1,024초 → owner 1회(10질문, 28,664 추정 토큰으로 budget 안) → 수리 2작업(Sonnet high) → 1회차 93/93(1,205초) → 명세 검토 257초 + 공개 재검사 133초 → 1,594초. 독립 63/63으로 공개·독립 동시 완료. Jev 10 POST 285,854, Claude 작업자 7회 + 검토 1회.
- **03:** 첫 공개 54/93(http-client 준비 단계 실패로 17개 미실행, 22개 실패). owner 요청 state 134,003B, 추정 61,736 토큰으로 budget 목표 28,800 초과, 0회차라 줄일 이력이 없어 `ADAPTIVE_REPAIR_BUDGET_EXCEEDED`로 전송 전 중단. 실패가 많은 첫 후보는 현재 수리할 수 없다.
- **02:** 01의 Jev 호출이 진행 중일 때 시작해 시작 점검이 진행 중인 예약을 거부. 지불 0. 진행 중 예약까지 거부하는 점검은 D076 세션이 다음 정책에서 고칠 예정.

원장: 19,300,596 → 19,781,431 (+480,835), 정산 1,022 → 1,039 (+17), pending 0.

## 판단

- 같은 기본 설정 2회 중 1회 완료, 1회는 첫 후보 품질(54/93)이 낮고 수리 요청이 커서 실패했다. 결과 편차의 주원인은 첫 구현 품질이다.
- 공개 명세 검토는 이번에도 공개 통과 후보의 독립 채점을 63/63으로 만들었다(누적 4/4). 공개 검사를 통과하지 못한 후보에는 적용되지 않는다.
- 다음 개선 대상: 실패가 많은 0회차의 owner 요청을 실패 묶음별로 나눠 보내는 경로(D076 budget의 마지막 단계), http-client 준비 단계 실패 원인.
