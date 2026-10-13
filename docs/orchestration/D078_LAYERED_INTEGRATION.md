# D078 — 직렬 의존 경로 수리·확인된 질문 변경 선택·D076 수리 개선 연결 통합 실측

확인일: 2026-10-13 (Asia/Seoul). 사용자 지시: 4단계 직렬 의존 경로를 먼저 고치고, 효과가 확인된 질문 변경만 골라 D076 개선과 연결한 뒤 통합 실험을 한다. 그 전에 지금까지를 PR로 올린다([PR #1](https://github.com/Kai-Leee/jev-router/pull/1)).

## 직렬 의존 원인

계획 깊이와 실행 시간이 함께 움직였다(`planning.json` 관계에서 최장 경로 계산).

| 실행 | leaf | 관계 | 깊이 | 실행기 시간 |
| --- | ---: | ---: | ---: | ---: |
| D069 jev_all | 10 | 4 | 2 | 2,365 s |
| D073 jev_profile | 15 | 6 | 3 | 1,005 s |
| D071 claude_all | 6 | 10 | 4 | 2,321 s |
| D077 v12 | 6 | 7 | 4 | 2,869 s |

D077 결합도 묶음은 IR·naming 같은 기반 단위를 소비 단위와 섞었고, leaf 관계를 나중에 물어 `n3 → n4 → {n1, n5} → n2` 사슬이 생겼다.

## 수리: 단위 의존 방향 + 2단계 묶음

[layered v1/v2 계약](contracts/adaptive-layered-decomposition.v2.json), [모듈](../../src/orchestration/adaptive-layered-decomposition.mjs). 단위 쌍마다 choice 1개(요청당 ≤64, 공통 판단문은 state에 1회)를 묻고, 코드가 묶는다: 미확정 쌍·순환은 같은 leaf, 최장 경로 인접 쌍 병합으로 깊이를 목표 2(balanced-v2 실행 파동 수) 이하로, 결합도 병합, 목표 leaf 수 병합. leaf 관계는 단위 답에서 코드가 만든다(leaf 관계 질문 없음).

| probe | 질문 | 결과 |
| --- | --- | --- |
| [01 v1](../../benchmark-runs/d078-probe-01-layered/summary.json) | requires 방향 4택 | 사용 관계 68개, 단위 의존 깊이 **8**(패키징→CLI→생성기→endpoint→operation→model→default→property→IR). 용량 상한 때문에 묶어도 leaf 깊이 6. **실패** |
| [02 v2](../../benchmark-runs/d078-probe-02-layered2/summary.json) | 인터페이스로 충분한 사용 / 완성 파일 필요 사용 분리 6택 | 사용 71개 중 파일 필요 3개(생성기→템플릿). 깊이 2 달성, leaf 5개 |

두 probe 모두 4 POST(입력 124,682 / 149,852 토큰), 정산 완료. 요청이 처음 122KB였으나 판단문을 state로 옮겨 87–109KB로 줄였다.

## 붙인 질문 변경 (효과 근거)

| 변경 | 결정 | 근거 |
| --- | --- | --- |
| layered-v2 분해 | 포함 | 위 probe 02 |
| owner 후보 설명 | 포함, v2 | D077 probe 선택 14/14 동일·confidence 12/14 상승. v2는 질문 3,000B 초과 시 짧은 설명→없음으로 축소(D076 budget 예약값, D077 최장 2,960B) |
| 수리 범위 코드 규칙 | 포함 | D077 probe: Jev 선택(0.26)과 동일, 요청 1회 감소 |
| 낮은 confidence 보류 | 포함 | 사용자 정책 |
| 모델·노력도 분리 | **제외** | 선택이 Sonnet high/xhigh로 바뀌었으나 결과 개선 근거 없음, D077 작업 시간 증가와 겹침. v2 단일 choice 유지 |
| D076 `repair_budget`·`repair_feedback`·속도 옵션 | 포함 | D076-03 93/93·63/63 설정 |

manifest: [d078-layered.json](../../benchmarks/e2e-swe/manifests/d078-layered.json) (v12). runner 변경은 v12의 `repair_feedback` 허용과 hook에 manifest 전달 2줄이다. 이 변경으로 transmission policy v4의 runner 해시가 drift하며(전체 테스트 1319/1328, 실패 9개 모두 해당), D076 세션의 v5 재고정이 필요하다.

## 통합 실측 (1회)

원본: [result.json](../../benchmark-runs/d078-comparison-01/jev_profile/result.json) (sha256 `7e5d2b43…`), [independent-evaluation.json](../../benchmark-runs/d078-comparison-01/jev_profile/independent-evaluation.json) (sha256 `89cda043…`). 실행 중 소스 drift 0, 원장 정산 완료.

| 같은 D066 카탈로그 전체 개발 | 공개 | 독립 | 실행기 시간 | Jev POST / 입력 | Claude | API 환산 |
| --- | --- | --- | ---: | --- | --- | ---: |
| D071 Claude 단독 | 93/93 | 63/63 | 39분05초(채점까지) | 0 | — | $16.69 |
| D073 v8 | 79/93 | 60/63 | 16분45초 | 57 / 829,671 | 15 | $7.15 |
| D077 v12 | 81→84/93 | 63/63 | 47분49초 | 13 / 300,800 | 17 | $10.07 |
| **D078 v12** | **93/93 (수리 0)** | 60/63 | **26분21초** | 7 / 193,708 | 13 | $9.03 |

D078 분해: 작업자 6회 $7.352(Opus medium 3, Sonnet medium 2, Sonnet high 1), 보류 Claude 결정 7회 $1.558, Jev $0.116. 계획 120초(그중 보류 약 100초), 구현 122→1,477초, 공개 검사 후 1,581초.

**결과: 제품 완료 아님.** 계획 깊이 2, leaf 관계 1개(n2 → n5)로 D077 대비 실행 시간 −44.9%이고 공개 93/93을 수리 없이 통과했다. 독립 3개 실패(`TestPathParameterEncoding::test_path_params_encoded`, `TestMultipartBody::test_multipart_request`, `TestUrlEncodedBody::test_urlencoded_request`)는 공개 검사가 잡지 못하는 영역이다. 숨김 검사 내용은 계획·수리에 넣지 않으며 원인 코드는 미확인이다. D073(16분45초)보다는 느리다.

**남은 시간 원인(실측):** 생성기 leaf n2가 기다린 n5(IR·operation·model 템플릿·endpoint 템플릿)는 465초에야 시작했다. 2 실행 슬롯이 먼저 준비된 n1·n3에 쓰였기 때문이다. n5 716초(Opus medium) → n2 291초. 임계 경로 생산자를 먼저 시작하는 스케줄이면 줄 여지가 있다(추정, 미측정). leaf가 4–6단위로 커서 작업자 1회가 291–716초였다.

**D076 수리 개선:** 수리 회차가 없어 `adaptive_worker_diagnostics_attached` 0회, `read_scope_expanded` 0회, budget 미작동. 이번 실행으로 측정되지 않았다.

## 남은 일

- 임계 경로 우선 스케줄(준비된 작업 중 후속 의존이 있는 생산자 우선).
- 공개 검사가 놓친 HTTP 요청 인코딩(경로 파라미터, multipart, urlencoded) 영역을 공개 명세에서 재현 가능한 공개 검사로 보강할지 검토. 숨김 검사를 복사하지 않는다.
- 보류 비용(계획 단계 약 100초·$1.558)과 결과 영향 분석, 임계값 보정.
- 반복 측정 없음: 1회 결과다.
