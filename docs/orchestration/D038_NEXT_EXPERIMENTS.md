# D038 — D037 이후 실험 조사와 우선순위

2026-10-10. 사용자 요청은 다음 실험 조사다. 새 유료 호출·모델 설치·실험 실행은 하지 않았다. 아래 조건/횟수/통과 기준은 **제안**이며 실행 승인이나 확정 임계값이 아니다. main + 읽기 전용 연구 subagent, [역할](../agents/D038_RESEARCH.md). 문서 스킬 jev-decision-records 적용.

## 출발점과 해결할 질문

[D037](D037_RESULTS.md)은 같은 고정 계획에서 Claude가 single, Jev가 split을 골랐다. 판단기뿐 아니라 실행 방식이 달랐고 자동에서도 cache/bypass가 없었다. 따라서 다음은 같은 3모드 반복만이 아니라 ① 분할/병렬화 효과, ② 질문/정책의 품질, ③ 반복 호출/계획의 실제 생략을 구분해야 한다. [D033](D033_RESULTS.md)의 output_dedup은 packaging 하위과제에서만 검증돼 전체 과제에 효과가 전이됐다고 볼 수 없다.

## 확인한 공개 근거

- **S1 [Anthropic infrastructure noise](https://www.anthropic.com/engineering/infrastructure-noise)**: 실행 자원·timeout·시간대는 agent 평가 결과를 바꿀 수 있다. 조건별 자원과 환경을 기록하고 반복 측정해야 한다. 본문 확인, 자체 재현 없음. D037 grader 시간 차이의 원인이 이 자료로 증명되는 것은 아니다.
- **S2 [Anthropic prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)**: 동일 prefix가 필요하며 병렬 요청은 첫 응답이 시작돼야 cache entry를 이용할 수 있다. cache-control API 설명을 현재 OAuth CLI에서 제어할 수 있다고 가정하면 안 된다. 내부 breakpoint 미확인 상태에서 TTL 변경 효과를 주장하지 않는다.
- **S3 [E2E-SWE 원저자 저장소](https://github.com/facebookresearch/E2E-SWE)**: 목표/명세에서 전체 프로젝트를 만들고 별도 환경의 숨겨진 테스트로 채점한다. 서로 다른 과제로 확대하기 적합하다. 공개 leaderboard scaffold와 우리 no-tools file-generation scaffold는 다르다. 저장소 문서는 benchmark 평가용 자료이며 모델 학습에 쓰지 말 것을 명시한다. 현 로컬 adapter는 pytest-check에 묶여 있어 새 과제마다 일반화/검증이 필요하다.
- **S4 [TwinRouterBench v4](https://arxiv.org/abs/2605.18859v4)**: 저장된 중간 단계 prefix의 정적 평가와 실제 workflow를 진행하는 동적 평가를 분리한다. 우리에게 유용한 것은 이 평가 구조다. 원래 model-tier 정답을 split/repair의 정답으로 옮길 수 없다. 모델 pool도 우리 고정 Opus 조건과 다르다. 논문 초록 확인 및 subagent의 원저자 repo 검토, 로컬 재현 없음.
- **S5 [Planner-as-Router](https://arxiv.org/abs/2609.32917)**: 계획 생성과 배정을 한 번에 처리하는 구조를 비교한다. 우리 baseline도 Claude에게 불필요한 별도 선택 호출을 요구하지 않는 조건이 필요하다. 논문 초록 확인; enterprise query 평가를 SWE 정확도로 전이하지 않는다.
- **S6 [Jev 공식 API 문서](https://jev-ai.pro/docs)**: 고정 버전 요청, typed question, revision 관리가 가능하다고 설명한다. D037의 반환 model 문자열 차이는 아직 내부 모델 동일성 확인이 아니다. 고정 요청 ID와 실제 응답 ID를 함께 기록하고 매핑 미확인 상태에서 동일모델 실험으로 묶지 않는다.

추가 확인: [TwinRouterBench DATA_GENERATION](https://github.com/CommonstackAI/TwinRouterBench/blob/main/docs/DATA_GENERATION.md)의 CommonStack live transport smoke는 실제 provider를 호출하지만 deterministic fixture oracle을 유지한다. 따라서 API 연결 검증과 공식 benchmark 점수는 다르다. 앞 단계 선택이 바뀌면 이후 prefix를 실제 실행으로 다시 구성해야 하며 기존 trajectory의 미래 응답을 그대로 붙여 성공 증거로 삼지 않는다.

모든 외부 자료 확인일은 2026-10-10. 외부 논문의 성능 수치를 우리 예상 절감률로 사용하지 않는다.

## 추천 순서

| 순서 | 실험 | 비교 | 답하려는 질문 | 준비 상태 |
|---|---|---|---|---|
| 0 | 무과금 계측/자료 감사 | 기존 receipt·request·usage·모델 ID 대조 | 정말 같은 조건을 비교하는가 | 기존 자료 이용 가능 |
| 1 | 분할·병렬화 분리 | single / 같은 4작업 serial / 같은 4작업 parallel | 빨라진 원인과 비용 증가 원인은 무엇인가 | 동시성 옵션 존재, 별도 집계 필요 |
| 2 | 분할 입력 축소 전이 | 기존 v3 / output_dedup / 검증된 task별 최소 입력 | 분할의 입력 비용을 낮춰도 품질이 유지되는가 | dedup 후보 있음, 요구사항 투영은 준비 필요 |
| 3 | 비용 제한이 있는 분할 정책 | always-single / script / 현재 Jev / 비용제약 Jev | 어떤 과제에서는 분할하지 않아야 하는가 | 단일 과제 결과만으로 선정 불가 |
| 4 | 반복 판단 생략 | force_jev / auto(rule+exact cache) | Jev까지 생략하면서 실행 정확성을 유지하는가 | core 구현, 다중 checkpoint harness 필요 |
| 5 | 계획 생성 대체 | Claude 계획+선택 통합 / Claude계획+Jev / template+Jev | 반복 계획 호출을 실제로 없앨 수 있는가 | template catalog/신규 계획 fallback 미구현 |
| 6 | 실패·요구사항 후속 행동 | script / Claude / Jev+직접 handler | 분류 정답이 실제 복구와 연결되는가 | live failure/requirement handler 미연결 |

작업자 모델/effort는 모두 Opus medium 고정. 싼 모델로 바꾼 효과와 판단 구조 효과를 섞지 않는다. Personal OS 확장은 이 순서와 별도로 준비하되 실제 기존 앱/자료는 변경하지 않는다.

## 실험 1: 먼저 분할 효과를 분해

같은 전체 목표와 frozen plan에서 A=한 작업자, B=같은 4작업을 concurrency1, C=같은 4작업을 concurrency2. Jev/Claude 라우팅을 호출하지 않고 controller가 조건을 지정한다. B↔C는 병렬화 효과, A↔B는 작업 분해/분리 문맥 효과, A↔C는 총변화를 본다. 기존 compare-routing-runs는 concurrency 불일치를 거절하므로 이 실험에는 별도 cohort 집계가 필요하다.

**제안 규모:** 각조건4회, 총12workflow/36worker calls = 4×(1+4+4). 새 Jev0. 이전의20회 packaging 실험과 별도이며 자동 실행하지 않는다. 이는 초기 변동성 확인이지 통계적 검정력이 확보된 표본수라는 뜻은 아니다. 4개 block 안에서 조건 순서를 사전 무작위화하고 seed/순서를 기록한다. 전반부/후반부 및 관측 cache 상태도 나눠 본다.

고정되는 것은 명세·계획·작업 경계·모델·프롬프트다. live trial에서 생성된 의존 파일은 서로 달라질 수 있으므로 각 worker의 실제 input hash/bytes/usage를 남긴다. 순수 실행 대기 차이를 보려면 별도 microbenchmark에서 동일한 의존 산출물 packet을 고정해야 한다. 이 packet 실험은 새 프로젝트 완성 결과와 분리한다.

측정: 독립 task success, 전체/worker/대기 시간, 작업자별 입력·cache write/read·출력, 비용, 실패/복구 포함 성공당 비용. parallel의 품질 저하나 비용 증가도 결과다. 성공 조건은 임의의 배수 속도 목표가 아니라 관측된 품질·시간·비용의 tradeoff를 재현하는 것이다.

## 실험 2: 입력 축소가 전체 작업으로 전이되는가

먼저 같은 split 스케줄에서 system output_dedup 하나만 바꾼 A/B를 실시한다. task별 요구사항 삭제나 cache 배치를 동시에 바꾸지 않는다. D033의 packaging 효과를 전체4작업과 독립 grader로 확인한다.

그다음 검증된 requirement ID→task 매핑이 있는 경우에만 task별 원문 투영을 비교한다. 원문 요구사항 coverage와 공통 interface/공유제약은 유지한다. mapping 구축/검토 비용도 포함한다. 의미 매핑 없는 요약 삭제는 실험 후보로 넣지 않는다.

별도 cache 연구는 공통 prefix 배치와 worker별 suffix를 비교할 수 있으나 API의 cache-control을 CLI 기능이라고 가정하지 않는다. 먼저 실제 wire/지원 옵션을 확인해야 한다. warm-up을 추가하는 경우 호출·비용·대기시간까지 포함한다. read 증가만 성공 지표로 삼지 않고 총비용과 전체시간을 평가한다. API로 옮기면 인증·요금·harness가 달라진 새 조건이며 CLI 결과와 합치지 않는다.

## 실험 3: 비용을 고려하는 분할 선택

질문의 목적을 한 확률에 모두 숨기지 않는다. 고정 질문은 영어로 분리한다: (a) 필요한 근거가 충분한가, (b) 품질을 유지하면서 병렬화가 시간을 줄일 가능성은, (c) 누락된 의존/통합 위험 범주는. 입력 토큰·작업자 수·가격 계산은 코드가 맡는다. Jev에게 측정하지 않은 비용을 확정 숫자로 만들게 하지 않는다.

정책 후보는 시간우선(현재), 비용 증가 허용0%, 허용10% 같은 **제안 제약**으로 구분할 수 있다. 실제 사용자의 tradeoff 선택 전 운영 기본으로 확정하지 않는다. 후보별 예상 비용은 개발 자료의 prior만 사용하고 결과를 본 뒤 끼워 넣지 않는다. 출력 토큰은 미지수이므로 추정 오차/범위를 함께 기록하고 추정 불가 상태를 둔다.

0.5/0.65/0.8 임계값 비교 합의는 유지한다. 이미 저장된 Jev 확률을 정책별로 재생할 때 추가 Jev 호출은 불필요하다. 다만 선택될 반대 arm의 outcome이 없으면 그 정책의 task 성공·비용은 unknown이다. forced 양쪽 실행으로 자료를 수집한 비용은 운영 비용과 구분한다.

개발 자료로 정책을 고른 뒤 **다른 과제**에서 평가한다. 시간·비용·품질 중 다른 후보보다 모두 열등한 정책은 제외하고 tradeoff가 남으면 그대로 제시한다. 예산 제한 위반/잘못된 분할/판단 보류 비율도 보고한다. p가 높은지만 평가하지 않는다. calibration은 실제 양쪽 결과/반복으로 정의된 label이 있는 경우에만 하며, .65를 관측 성공률65%로 해석하지 않는다.

## 실험 4: 자동이 실제로 호출을 줄이는 상황

현재의 다중 작업1checkpoint 대신 event sequence를 만든다: 단일 작업, 동일 근거의 새 실행, 같은 실행의 중복 이벤트, 파일 변경, 목표/질문/임계값 변경, 모델 변경, timeout. 정상반복/변경/불확실성 사례 모두 넣는다.

먼저 saved response fixture로 stale 선택·중복 실행이 차단되는지 확인한다. 통과 후 live의 force_jev와 auto를 같은 sequence에서 비교한다. 동일 실행 중복 억제와 별도 실행의 결정 재사용을 서로 다른 지표로 둔다. 모델 별칭 매핑을 확인 못하면 cache를 끈 채 rule bypass만 시험한다.

핵심은 Jev요청수/eligible events, 잘못된 재사용수/재사용수, 중복 부수효과수/중복events, 실패 뒤 자동 재호출수다. 캐시 hit가 늘어도 최신 근거를 놓치면 실패다. process restart 복구는 현재 프로세스내 cache와 별도 과제다. 호출 절감의 비교상대는 Claude가 아니라 force_jev라는 점을 명시한다.

## 실험 5: 사용자 목표에 가장 직접적인 계획 비용 실험

A=Claude가 목표를 보고 계획과 실행방식을 한 번에 결정. B=Claude 계획 생성+Jev 선택. C=검증된 generic template 후보를 Jev가 선택하고 필요한 부분만 확장. 모든 조건은 같은 목표에서 시작하고 작업자 모델은 유지한다.

A의 계획+선택이 한 응답이면 합쳐진 호출 시간을 측정한다. 별도 계측 근거 없이 판단 시간만 분리해 절감률을 만들지 않는다. 이 실험은 사용자의 원래 목표인 Claude 계획/판단 생략을 직접 검증한다. 먼저 실험1·2로 비용 증가를 진단하되 이를 계획 대체 검증으로 오인하지 않는다.

반복 유형과 template에 없는 새로운 유형을 모두 포함한다. C가 지원하지 못하면 Claude 계획 생성으로 전환하며 이 비용을 제외하지 않는다. template 제작/수정 비용은 일회성 비용으로, 반복 사용 비용은 별도로 제시한다. N회 사용 시 평균비용=(template구축비+N회 실제운영비)/N. 관측하지 않은 N의 손익분기는 추정이다.

서로 다른 계획을 생성하므로 frozen-plan 비교와 섞지 않는다. 최종 품질·전체 목표부터의 latency·계획/질문/실행/복구별 비용으로 비교한다. 공개 benchmark 숨겨진 테스트나 정답구현을 template에 넣지 않는다.

## 실험 6: 실패 원인과 다음 행동

과거 원본 실패나 evaluator-owned fixture로 타입오류, interface불일치, 환경문제, 근거부족 등을 구성한다. ground truth는 주입 원인/독립 재현으로 정의하고 Jev의 답으로 라벨을 만들지 않는다. 분류 정답뿐 아니라 선택한 repair/evidence handler가 원인을 해결했는지 실제 후속 테스트로 평가한다.

정답이 명령 규칙으로 정해지는 오류는 script baseline이 우선이다. Claude 재판정, Jev→직접 수리, Jev→새 근거 수집을 비교한다. 숨겨진 최종 grader는 작업자에게 노출하지 않고 공개된 개발용 검사만 복구 입력으로 쓴다. 요구사항 판정은 supported/contradicted/insufficient/needs_execution/blocked를 유지하며 finish는 추가하지 않는다. 현재 live handler 구현이 선행돼야 한다.

## 과제 확대와 채점 준비

우선 자기완결 작업, 의존성이 강한 작업, 독립 모듈이 많은 작업의 세 범주를 나눈다. 명세·dependency 특성으로 미리 분류하고 결과를 본 뒤 유리한 과제만 고르지 않는다. 기존 pytest-check는 회귀용으로 유지하고 새로운 E2E-SWE 과제는 별도 holdout으로 사용한다. 개발용 질문/template 조정은 자체 fixture에서 하고 평가 자료와 분리한다.

Personal OS는 `benchmarks/personal-os/agent`의 목표/형식과 synthetic-vault를 사용해 새 디렉터리에서만 진행한다. 이번 로컬 확인에서 evaluator/rubric.json에 저장·이동·상태·읽기 비변경·재실행 등의 검증 계약이 있다. 실제 앱 adapter와 UI/재시작 지속성 검사는 별도 확인이 필요하다. 모델이 task breakdown을 직접 받을 필요는 없지만 evaluator는 명세에 근거한 성공조건을 미리 고정한다. fixture evaluator 통과를 실제 앱 통과로 바꾸지 않는다.

## 공통 통과·중단·보고 기준

- 요청/응답 model ID 불일치·알 수 없는 버전 mapping이면 해당 model-controlled 비교 해석을 중단/별도층으로 보고한다. 데이터를 지우지 않는다.
- 모델 실패, 근거 부족, 중단, grader 오류를 denominator에서 제거하지 않는다. 인프라 오류와 모델 실패를 별도 표시한다.
- 유료 POST 결과가 불확실하거나 shared ledger pending이면 후속 호출 전에 정산을 확인한다. USD1 공유 Jev 한도는 유지한다. 실험별 미래 지출액은 payload/토큰/Claude횟수가 확정되기 전 알 수 없다.
- grader workspace/image/task/소스·candidate pregrade/postgrade hash, 실행 모델/effort, prompt/request hash, 시간 경계, cache usage, 결과/비용 결측을 기록한다.
- 결과가 보일 때까지 무작정 반복하지 않고 실행 횟수와 중단 기준을 사전 고정한다. task단위로 묶은 paired 차이와 분산을 보고하며 같은 task의 반복을 독립 과제수로 세지 않는다.
- 고정된 필수 검사 회귀나 잘못된 실행 권한·stale dispatch가 하나라도 나타나면 해당 변경을 운영 채택하지 않고 원인을 기록한다. 품질 미열화의 통계적 증명은 작은 smoke 표본만으로 주장하지 않는다.

**권장 첫 묶음:** 계측/모델 동일성 점검 → 실험1 분할분리 → 실험2 output_dedup 전이. 다음에 비용제약 정책을 만들고, 반복 workflow의 이득이 큰 실험4·5를 진행한다. 실험1 비용이 부담되면 우선 각조건1회 smoke로 harness만 확인하고 성능 결론은 유보한다. 이번 조사에서는 어느 유료 묶음도 실행하지 않았다.

부수효과: 조사/역할/결정 문서만 추가. 기존 미커밋 작업 유지. 새 API 호출·설치·컨테이너·PersonalOS 수정·commit/push 없음.
