# D077 — 역할별 Jev 질문 유형 재설계와 낮은 confidence 보류

확인일: 2026-10-12 (Asia/Seoul). 사용자 목표는 작업을 가능한 빠르고 효율적이며 안전하게 완료하는 라우터다. 이번 요청은 역할별 질문 유형·프롬프트 형태를 맞추고, 빠진 설명을 보강하고, 우선순위 순서대로 로컬에서 실제 Jev 응답을 확인한 뒤 통합 실험을 하는 것이다. 낮은 confidence 답은 보류하고 새 Claude 세션에 같은 판단을 맡긴다. 임계값은 이후 데이터로 조정한다.

## 출발점 (변경 전 분석)

저장된 실제 응답 880개(`billing.runId` 있음, mock 9개 제외)를 질문 ID로 역할별 집계했다. 현재 경로의 모든 역할은 코드에 `choice`가 고정돼 있었고 응답의 `confidence`·`probabilities`는 범위 검사만 하고 판단에 쓰지 않았다.

| 역할 | 질문 | confidence 중앙값 | <0.5 | 문제 |
| --- | ---: | ---: | ---: | --- |
| relation | 474 | 0.79 | 85/474 | 적합: 배치, 구체 설명 |
| owner | 68 | 0.61 | 14/68 | 후보 A01..A22 설명 `null` |
| profile | 29 | 0.40 | 23/29 | 모델×노력도 21개 단일 choice |
| membership | 432 | 0.28 | 377/432 | v1 297/297 첫 후보 선택, 입력 토큰 62.7–85.9% |
| split_count | 71 | 0.17 | 67/71 | 순서 있는 개수를 choice로 질문 |
| scope chooser | 5 | 0.23–0.31 | 5/5 | 겹치는 후보, owner 판단 반복 |

## 변경 (모두 새 파일·새 계약, 과거 계약 불변)

| 순서 | 역할 | 이전 | D077 | 계약·코드 |
| --- | --- | --- | --- | --- |
| 1 | membership | 단위마다 `child_k` choice 1 POST | 단위 쌍 `noul` 배치(요청당 ≤64) + 코드 평균 연결 묶음 | [adaptive-cohesion.v1](contracts/adaptive-cohesion.v1.json), [adaptive-cohesion.mjs](../../src/orchestration/adaptive-cohesion.mjs) |
| 2 | owner | 후보 설명 `null` | 후보 설명 = 인라인 경로 + 설명, 키·state 불변 | [adaptive-owner-criteria.v1](contracts/adaptive-owner-criteria.v1.json), [adaptive-owner-criteria.mjs](../../src/orchestration/adaptive-owner-criteria.mjs) |
| 3 | profile | 21개 choice | 모델 `choice` + 노력도 `score`(상황 서술 5단계), 코드가 v2 profile ID로 결합 | [adaptive-profile-selection.v3](contracts/adaptive-profile-selection.v3.json), [adaptive-profile-split.mjs](../../src/orchestration/adaptive-profile-split.mjs) |
| 4 | 수리 범위 | Jev choice | 코드 규칙: owner 답 합집합 후보, 없으면 stop | [adaptive-inferred-scope.v1](contracts/adaptive-inferred-scope.v1.json), [adaptive-inferred-scope.mjs](../../src/orchestration/adaptive-inferred-scope.mjs) |
| 5 | split_count | 개수 choice | 질문 제거. 결합도 ≥0.5 병합 후 balanced-v2 목표 leaf 수까지 용량 안에서 코드 병합 | 1번 계약 `count_rule` |
| 6 | 전 역할 | confidence 미사용 | certainty < 0.5 (`noul`은 `abs(2p-1)`) 보류 → 같은 state·해당 질문만 새 Claude 결정 세션 | [jev-confidence-deferral.v1](contracts/jev-confidence-deferral.v1.json), [jev-confidence-deferral.mjs](../../src/orchestration/jev-confidence-deferral.mjs) |

relation 질문은 그대로다. 통합 경로는 manifest v12([d077-question-forms.json](../../benchmarks/e2e-swe/manifests/d077-question-forms.json))와 [adaptive-question-forms.mjs](../../src/benchmark/adaptive-question-forms.mjs)이며, runner에는 v12 분기 hook만 추가했다. v1–v11 경로의 동작은 바꾸지 않았다. v12는 D075 transmission gate를 쓰지 않는다. 각 Jev POST 전 adapter·공식 256000B·v4 admission 검사와 원장 예약/정산은 유지한다.

## 로컬 실제 응답 확인 (순서대로)

명령: `node scripts/d077-question-probe.mjs --item <cohesion|owner|profile|scope> --out <새 디렉터리> --spend`, 보류는 `--defer-from <probe 디렉터리...> --out <새 디렉터리>`. 입력은 보존된 D073 계획·카탈로그, D073/D075 실제 요청이다. 모든 요청은 전송 전 `validate-jev-input --policy v4`를 통과했다.

| probe | POST | Jev 입력 토큰 | 결과 |
| --- | ---: | ---: | --- |
| [01 cohesion D077.1](../../benchmark-runs/d077-probe-01-cohesion/summary.json) | 4 | 94,040 | 210쌍 모두 noul ≤0.35, ≥0.5 0개 → 병합 0, leaf 21개. **질문 실패** |
| [02 cohesion D077.1b](../../benchmark-runs/d077-probe-02-cohesion/summary.json) | 4 | 93,960 | 직접 코드 사용 명제로 변경. ≥0.5 75/210, 분포 [51,62,43,30,24]. 묶음 5개 |
| [03 owner](../../benchmark-runs/d077-probe-03-owner/summary.json) | 1 | 40,112 (이전 30,564) | 선택 14/14 동일, confidence 12/14 상승, <0.5 2개 |
| [04 profile](../../benchmark-runs/d077-probe-04-profile/summary.json) | 10 | 135,669 (이전 139,901) | 17작업 중 12개 선택 변경(전부 Sonnet, 수리 2건 xhigh). 보류 대상 1/34 (같은 17질문 이전 <0.5 13/17) |
| 4번 scope (offline) | 0 | 0 | 코드 선택 = 이전 Jev 선택(confidence 0.26) `repair-inferred-owners` |
| [05 보류](../../benchmark-runs/d077-probe-05-deferral/summary.json) | Claude 6 | — | 보류 104문항 중 29개 판단 변경, Claude 86.3초, API 환산 USD 1.488 |

원장: `jev-usd1-budget.json` 입력 17,359,776 → 17,723,557 (+363,781 = 위 네 probe 합), 정산 946 → 965 (+19 POST), pending 0. 원장은 실험 도중 다른 세션이 v3 → v4로 이전했다(01 probe는 v3, 이후 v4).

**빗나간 예상(보존):** 첫 cohesion 문장("따로 만들면 맞지 않을 것")은 Jev가 거의 항상 아니라고 답해 21개 단일 leaf가 되었다. D073보다 나쁜 분할이다. 사실 판단형 문장(직접 코드 사용)과 기존 balanced-v2 목표 leaf 수로 바꾼 뒤 02 결과를 얻었다. 02 묶음: CLI·로더·설정·진단·생성기·hook / naming·refs·enum·union·operation / IR·property·default·model·model템플릿 / runtime·client·endpoint 템플릿 / 패키징·메타데이터(0.22 목표 수 병합).

**보류 비용:** cohesion은 보류 101/210(48%)로 Claude 호출당 USD 0.25–0.32였다. 임계값 0.5가 noul에서는 p 0.25–0.75 전체를 보류한다. 보정 데이터 없이 정한 잠정값이다.

## 검증

- 집중 테스트: [adaptive-cohesion](../../test/adaptive-cohesion.test.mjs) 3, [d077-question-forms](../../test/d077-question-forms.test.mjs) 4, [d077-runner-question-forms](../../test/d077-runner-question-forms.test.mjs) 3, [d077-runner-mock-arm](../../test/d077-runner-mock-arm.test.mjs) 1 (실제 D066 카탈로그, mock Jev/Claude/Docker로 v12 arm 완료).
- 전체 `npm test` 1302/1310. 실패 8개는 `test/jev-transmission-preflight.test.mjs`이며 runner 수정으로 transmission policy v2의 runner 해시 고정이 drift한 결과다. 다른 세션(D076 소유)이 새 정책 고정으로 처리할 예정이며 v11/d076은 그 전까지 drift로 차단된다.
- 4번 수리 범위와 2번 owner 설명은 단위 테스트와 probe로 확인했고, mock arm에서는 공개 검사가 통과해 수리 경로를 실행하지 않았다.

## 통합 실험 (실측 1회)

명령: `node benchmark-runs/d077-preflight/run-experiment.mjs --spend` → `scripts/adaptive-dag-comparison.mjs --manifest benchmarks/e2e-swe/manifests/d077-question-forms.json --spend --catalog-preparation benchmark-runs/d066-catalog-01 benchmark-runs/d077-comparison-01` → 독립 채점 1회. 원본: [result.json](../../benchmark-runs/d077-comparison-01/jev_profile/result.json) (sha256 `cdea367a…`), [independent-evaluation.json](../../benchmark-runs/d077-comparison-01/jev_profile/independent-evaluation.json) (sha256 `cd31c1b3…`). 실행 중 소스 drift 0.

| 같은 D066 카탈로그 전체 개발 | 공개 | 독립 | 실행기 시간 | Jev POST / 입력 토큰 | Claude 호출 | API 환산 |
| --- | --- | --- | ---: | --- | --- | ---: |
| D071 Claude 단독 (기준선) | 93/93 | 63/63 | 39분05초(채점까지) | 0 | — | $16.69 |
| D073 Jev 프로필 (v8) | 79/93, 수리 0 | 60/63 | 16분45초 | 57 / 829,671 | 15 | $7.15 (result.json 소계, D073 문서 보정값 $7.12) |
| **D077 v12** | 81 → 84/93, 수리 1 | **63/63** | **47분49초** | 13(실패1) / 300,800 | 17 (작업자 9 + 보류 결정 8) | $10.07 |

D077 비용 분해: 작업자 9회 $7.757(Sonnet high 6, Haiku medium 1, Sonnet xhigh 2), 보류 Claude 결정 8회 $2.134·117.7초, Jev 알려진 $0.180. 실패 POST 1건의 사용량은 미보고라 Jev 총 사용량은 null이다. 채점까지 관측 48분07초.

**결과:** 제품 완료 아님. 독립 63/63은 D073(60/63)보다 좋고 기준선과 같지만 공개 84/93이다. 남은 9개는 `schema-models:T.R10.02`와 `description-provenance` 8개(요청 본문 설명 출처)로 D070 이후 반복된 실패군이다. 2회차 owner 요청(질문 9, 115,670B, state 88,931B)이 HTTP 400 `model_input_limit`으로 거절돼 수리 2회차 전에 멈췄다. 이 경로에는 D075 복구 루프를 연결하지 않았다.

**시간 악화 원인(실측):** 계획 118초 이후 0회차 구현이 120→1,799초(28분)였다. 묶음 6개 사이 관계 7개가 `n3 → n4 → {n1, n5} → n2` 4단 직렬 경로를 만들었고, 각 단계가 Sonnet high 294–557초였다. 1회차 n1 수리(Sonnet xhigh) 653초. D073의 15 leaf 계획보다 Jev 입력은 64% 적지만 직렬 깊이와 작업당 크기가 커졌다. 결합도 묶음이 의존 관계 깊이를 고려하지 않는 것이 이번에 드러난 한계다.

**owner 거절 원인:** 1회차 owner(state 67,961B, state+최장 질문 70,921B)는 수락, 2회차(state 88,931B, 91,891B)는 거절. 후보 설명이 없었어도 state+최장 질문 89,610B로, D075에서 거절된 state 89,455B와 같은 범위다. 설명 추가가 아니라 수리 이력·관측 누적으로 커진 owner state가 원인으로 보이며, 정확한 tokenizer 한도는 미측정이다.

**원장 정산:** 실패 POST의 예약 `…:r978`(65,536)은 `BUDGET_OUTSTANDING`으로 남았다가, 사용자 로그인 후 공급자 사용 기록(Oct 12 09:44 PM, 질문 9, failed, `Refunded · no charge`), 저장된 HTTP 400 본문("No charge was made"), 새 credits GET(`paidInputTokensRemaining` 41,975,342 = D075 refund-02 42,639,923 − D077 알려진 입력 664,581, `tokensReserved` 0)으로 `reconcileConfirmedRefund` 정산했다. 청구 +0, 원장 입력 18,024,357·정산 978·pending 0. 근거: [d077-refund-01](../../benchmark-runs/d077-refund-01/evidence.json). 자동 재전송·재개는 하지 않았다.

## 남은 일

- owner state의 수리 회차별 증가를 질문별 관련 근거로 줄이는 표현(D075 남은 일과 같음). v12에 실패 복구 루프 연결 여부.
- 결합도 묶음에 relation 깊이·임계 경로 비용을 반영. 목표 leaf 수 4와 묶음 5–6개가 2 실행 슬롯에서 직렬 4단을 만들었다.
- 노력도 score가 초기 작업 대부분을 high로 올렸다(score 1.6–1.8). 작업 시간과의 관계는 1회 관측이며 보정 필요.
- 보류 임계값 0.5 보정: 이번 실행 보류 결정 8회 $2.134. 보류 답이 결과를 바꿨는지 별도 분석 필요.
- D075 transmission gate의 v3 정책 고정(다른 세션 담당, 사용자 승인 대기)과 v12 연결 여부.
