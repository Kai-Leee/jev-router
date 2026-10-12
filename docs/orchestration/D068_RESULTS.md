# D068 — 병렬 수정 후 Jev 전체 판단 재실행

2026-10-11. **수정·새 실제 실행·독립 채점은 끝났지만 제품은 미완료다.** 공개 검사는84/85, 독립 채점은63/63이다. 수리 질문의 전송 본문은43.57% 줄었지만 Jev가 다시 `HTTP400 / model_input_limit`로 거절했다. 수리 답변과 수리 작업자 호출은0이다.

[최종 분석02](../../benchmark-runs/d068-analysis-02.json), [비교 산식과 표](../../benchmark-runs/d068-comparison-summary-01.json), [실제 arm 원본](../../benchmark-runs/d068-comparison-01/jev_all/result.json), [실험 계약](D068_EXPERIMENT.md), [구현](D068_IMPLEMENTATION.md), [역할](../agents/D068_PARALLEL.md)을 연결한다. 분석01·과거 D067 원본은 보존하고02에 후속 환불 정산만 첨부했다. 새 조건을 기존 실행에 이어 쓰지 않았다.

## 무엇을 바꿨고 어디까지 검증했는가

| 항목 | 이전 문제 | D068 결과와 검증 범위 |
|---|---|---|
| 수리 입력 | 반복 runtime/revision/check, 정상 설치 stdout, 중복 leaf 인터페이스 | inline 참조와 정상 stdout 해시로 축소. 실제 wire172,019→97,071B. 모델 수락에는 실패 |
| 실패 원인 전달 | 확정 HTTP400이 response 부재 때문에 uncertain으로 바뀌고 공개 실패로 가려짐 | 실제 최종 원인 `repair / HTTP_ERROR / 400 / model_input_limit / outcome_uncertain:false` 보존. 앞선 공개 실패와 정산 상태 분리 |
| 작업자 재호출 | 미실행 검사 소유자까지 전원 수리 후보로 확대 | 관측 실패 owner3명 또는 downstream 포함4명만 후보. 전원10명 후보 없음. Jev 선택 실패로 실제 수리 호출 절감은 미측정 |

수리 worker 입력에도 같은 실패 투영을 라운드당 한 번 적용하도록 연결했다. 선택되지 않은 산출물은 이어 받고 공개85개를 다시 검사하는 경로는 로컬 회귀로 검증했다. 이번 유료 시도는 해당 worker 경로까지 도달하지 않았다. 정상 stdout을 생략하므로 전체 투영은 `lossless_roundtrip:false`; 원본 정상 로그를 제공한 정확한 재구성·재투영은 검증했다.

## 완료·시간·토큰·비용 비교

아래 시간은 각 조건의 **분해 시작부터 최종 실행기 결과까지**다. 공통 사전 점검, 과거 후보 준비, 후속 독립 채점과 모니터를 제외한다. 성공 조건은 개발 완료시간, 실패 조건은 중단까지 걸린 시간이다. 총 토큰은 Claude 비캐시 입력·출력·캐시 생성·캐시 읽기와 Jev 입력·출력을 더한다. 미제공 사용량은0으로 채우지 않는다.

| 조건 | 공개 / 독립 | 전체 완료 | 실행기 시간 | Claude CLI / Jev POST | 토큰 합계, 캐시 포함 | 공식단가 환산 USD |
|---|---|---|---:|---:|---:|---:|
| D067 Claude 전체 판단 |85/85 ·63/63|완료|36분20.704초|57 /0|6,772,666|21.135172|
| D067 Jev 분해 |85/85 ·63/63|완료|25분54.036초|12 /45|3,967,289|9.864863|
| D067 Jev 분해·관계 |85/85 ·63/63|완료|28분24.540초|10 /47|3,623,150|8.766580|
| D067 Jev 전체 판단 |83/85 ·63/63|미완료|33분44.619초|13 /43|관측분3,327,300; 전체 미상|관측분10.911882; 전체 미상|
| **D068 수정 후 Jev 전체** |**84/85 ·63/63**|**미완료**|**30분43.397초**|**10 /48**|**관측분4,350,647; 전체 미상**|**관측분10.569204; 전체 미상**|

새 실행은 과거 Jev 전체 시도보다181.222초 짧다. 분모2,024,619.170541ms에 대해8.9509% 감소지만 **완료 속도 개선율은null**이다. 두 시도 모두 수리 판단에서 실패했다. 관측 토큰 합은1,023,347 증가했고, 관측 비용 부분합은$0.342678 감소했다. 실패 요청의 사용량이 없어 정확한 전체 토큰·환산 비용 증감은 계산하지 않는다.

조건당1회 탐색 측정이며 D067은4조건 동시, D068은1조건 단독 실행이다. 둘 다 조건당 작업자 슬롯2개지만 호스트·계정 경합은 다르다. 실제 분해·산출물·실패 사례도 달라 이번 수정의 인과 효과나 통계적 개선으로 해석하지 않는다. Claude 기준선은 수리7명까지 수행해 완료했으며 D068은 수리 worker0에서 중단됐다.

신규 catalog 생성 호출은0이다. D066의 기존 생성 결과를 prompt/schema/hash 검증 후 재사용했다. 과거 준비187.283초/$0.481984를 이번 지출에 다시 넣지 않는다. 생성 관련 source 일부는 새 수리 계약 통합으로 바뀌었고 허용 목록·동결 해시로 관리했으므로 생성 코드 전체가 동일하다고 주장하지 않는다.

## 이번 시도의 시간·호출 경계

- 실행기:1,843,397.350542ms. 그중 계획83,099.971917ms; 실제 구현10개, 최대 동시2개.
- 사전 점검 포함 cohort:1,886,100.180375ms, 그 안의 사전 점검42,645.319875ms.
- 독립 채점:14,592.309666ms. 실행기+독립 채점 단계 합1,857,989.660208ms. cohort+독립 채점 단계 합1,900,692.490041ms. 호출 사이의 수동 인계 대기시간을 단계 실행시간에 넣지 않는다.
- Jev48 POST: 분해45, 관계2, 수리1. 앞47개 성공, 마지막 수리1개 실패. 구현 Claude10 CLI는 모두 완료. 자동 재시도0, 수리 worker0, carry-forward 실행0.
- 별도 Opus5.5 medium 모니터:21,208.817375ms,7,542토큰,환산$0.083824. 결과 `failed`. 수치 패킷만 읽었고 원시 감사·제품 채점 역할은 아니다. 모니터 포함 관측 환산 부분합은$10.653028이며 전체와 실제 월 청구 배분은미상이다. [모니터 원본](../../benchmark-runs/d068-monitor-01/result.json).

작업자 n9는12 units·13 artifacts·16 paths·50 requirements를 맡았다. n9 CLI 내부 보고시간767.831초, 최종 generator n3는512.046초였다. 두 작업의 단위가 달라 단순 per-worker 평균으로 생산성을 비교하지 않는다. 큰 묶음과 마지막 의존 작업이 남는 구조를 기록했고, 추가 분해 효과는 별도 미측정이다.

## 토큰과 가격의 구성

공식 가격 확인일2026-10-11. [Claude 공식 가격](https://platform.claude.com/docs/en/about-claude/pricing)의 Opus5.5 기준100만 토큰당 입력$4·출력$20·캐시1시간 생성$8·5분 생성$5·캐시 읽기$0.20을 적용했다. 이번 Claude 캐시 생성은 전부1시간이다. [Jev 공식 가격](https://jev-ai.pro/pricing)의15M/$9를 입력100만 토큰당$0.60으로 환산했고 출력은무료다. Jev 월 구독의 실제 비용 배분이나 별도 청구서를 뜻하지 않는다. [가격 근거 스냅샷](../../benchmark-runs/d068-preflight/official-rates.json).

| D068 사용 항목 | 관측 토큰 | 공식단가 환산 USD |
|---|---:|---:|
| Claude 비캐시 입력 |108|0.000432|
| Claude 출력 |257,410|5.148200|
| Claude 캐시 생성,1시간 |544,097|4.352776|
| Claude 캐시 읽기 |2,646,782|0.5293564|
| Jev 성공47회 입력 |897,399|0.5384394|
| Jev 성공47회 출력 |4,851|0|
| Jev 실패 수리1회 입력·출력 |미상|추론량 환산 미상; 확인된 실패 청구0|

관측 토큰이 늘어난 가장 큰 항목은 캐시 읽기다. 과거 Jev 전체1,689,929→이번2,646,782로956,853 늘었다. 캐시 생성은20,691, Claude 출력은21,739 감소했고 Jev 성공 입력은110,459 늘었다. 값은 각 호출 영수증 합계이며 토큰 수 증가와 가격 증가는 같은 비율이 아니다. 내부 CLI turn과 도구 결과가 포함돼 CLI 호출 수13→10만으로 전체 토큰 감소를 예측할 수 없다.

## 다시 실패한 지점

공개 검사 `T.integration.diagnostics`의37번째 assertion에서 `existing output refused`가 실패했다. 검사 내용은 **빈 기존 출력 디렉터리를 `--overwrite` 없이 주면 거부해야 한다**는 조건이다. 별도 `T.R03.04`는 기존 파일이 있는 디렉터리로3/3 통과했다. 입력 fixture도 달라 빈 디렉터리 여부만의 통제 실험은 아니다. 실제 후보를 사후 수정하거나 숨겨진 검사 내용을 이용하지 않았다.

이 통합 case는9개 요구사항에 연결돼 owner n4/n9/n11의3명, consumer n3 포함4명을 후보로 만들었다. 전원10명을 부르는 fallback은 없었다. 실패 뒤 case 내부의 overwrite/hook assertion은 도달하지 못했지만 현재 case 단위 `unexecuted=[]`에는 드러나지 않는다. 이 검증 기록의 해상도 부족을 별도 발견으로 남긴다. [실제 범위 분석](../../benchmark-runs/d068-scope-live-failure-01.json), [담당 기록](../agents/D068_SCOPE.md).

입력은 실제로 축소됐다. 전송 직렬화 기준172,019→97,071B,74,948/172,019B=43.5696% 감소다. 저장된 들여쓰기 JSON145,358B와 다르다. 투영 시점 state170,395→95,447B이고 이후 contract_source214B가 양쪽에 추가된다. 실패 보고서107,776→40,769B, 정상 stdout7개27,692B가 해시 참조로 대체됐으며 공개85case는 유지됐다. [실제 요청](../../benchmark-runs/d068-comparison-01/jev_all/calls/jev-0058.request.json), [재구성 측정](../../benchmark-runs/d068-projection-live-failure-01.json).

과거 D067 사건의 오프라인 재생에서는188,240→80,448B였지만 그 요청은 provider에 보내지 않았다. 이번에는15 units·55 requirements, 과거 재생은2 units·15 requirements였다. requirement 본문15,200B·unit 본문9,373B가 더 포함됐고 failure 객체 증가는32B에 그쳤다. 따라서 과거80,448B를 이번 실제 입력이나 수락 가능한 크기로 보고하지 않는다. **축소만으로 수리 입력 한도를 해결할 것이라는 기대는 이번 실측으로 확인되지 않았다.**

로컬240,000-byte 검사는 통과했지만 provider는 모델 입력 한도를 적용했다. [공식 API 안내](https://jev-ai.pro/jev-api)는 Jev 전체 context64k와 별도로 **state+가장 긴 질문32k tokens** 제한을 명시한다. [docs](https://jev-ai.pro/docs#models-and-limits)의256,000-byte HTTP body 제한과 다른 조건이다. 실패 응답에는 숫자 토큰 한도와 사용량이 없으므로97,071B를 정확한 모델 토큰 수로 환산하거나 안전한 바이트 상한을 주장하지 않는다.

## 확정 실패와 정산을 분리

이번 원본은 `failed`, `stop_code:HTTP_ERROR`, `outcome_uncertain:false`다. `terminal_cause`가 모델 입력 초과를 전달하고 `prior_public_failure`가 앞선 공개 실패를 남겼다. 원본 `settlement_status:pending`도 변경하지 않았다.

그 뒤 authenticated usage UI의 failed/refunded 행, 연결된 HTTP400의 no-charge 응답과 fresh credits GET으로 r666만 정산했다. 장부ID를 유지하며 누적12,096,997→12,994,396입력,618→666정산,최종pending/blocked없음이다. 실패 요청 차감·청구는0이고 추론 입력·출력은여전히null이다. UI는 run UUID를 노출하지 않아 최신 실패시각·질문 수·인접 성공행을 대조했으며 provider run ID는 로컬 HTTP 기록에 연결돼 있다. [정산 증거](../../benchmark-runs/d068-refund-01/evidence.json), [결과](../../benchmark-runs/d068-refund-01/reconciliation.json). 잔액 조회·정산은 새 추론이나 수리 재개가 아니다.

## 검증 중 발견한 구현·검증기 문제

- 첫 전체 회귀14개 실패 중12개는 sandbox localhost 권한,2개는 mock 검사가 실제 기존 장부 정책에 의존한 결함이었다. 허용 환경에서2개가 남았고 임시 격리 장부로 수정 후 **1072/1072** 통과했다. 과거 실패 로그도 보존했다.
- 새 정적 범위 진단이 `AugAssign`을 무시해 잘못된 소유자를 만들 수 있던 결함을 검토 중 수정했다. 실패 조건의 수집 완료를 성공 exit로 반환하던 경로도 수정해 이번 driver exit2와 일치시켰다.
- 새 비교 helper의 결측→0 변환과 독립 감사의 분석 파일 미결합 문제도 실행 전 검토에서 수정했다. 후처리19/19 합성 검증은 산술·파일 결합 검사이며 제품 성공 근거가 아니다.
- 독립 채점 전후38개 후보 파일은 동일했고63/63·skip0이었다. 실행 당시 고정 소스 변경0. [최종 감사](../../benchmark-runs/d068-review/final-analysis-audit-01.json)는510개 검사와424개 근거 해시를 대조했고, 공개 원시 감사654개 검사도 통과했다. D067 원본797개 변경0, 환불 후처리 반례16/16 통과를 별도로 확인했다. 이는 기록·실행 연결 검증이며 제품 실패를 성공으로 바꾸지 않는다. [검토 기록](../agents/D068_REVIEW.md), [종료 검증01](../../benchmark-runs/d068-preflight/closeout-validation-01.json).

## 실행 및 분석 재현 명령

기준 디렉터리는 `jev-router/`다. 다음 첫 명령은 **이미 종료한 유료 호출 기록**이다. 원래 출력 경로에 재실행하지 않는다.

```sh
node scripts/adaptive-dag-comparison.mjs --manifest benchmarks/e2e-swe/manifests/d068-adaptive.json --spend --catalog-preparation benchmark-runs/d066-catalog-01 benchmark-runs/d068-comparison-01
node benchmark-runs/d068-preflight/grade-condition.mjs --grade benchmark-runs/d068-comparison-01/jev_all
node benchmark-runs/d068-preflight/analyze.mjs
node benchmark-runs/d068-preflight/comparison-summary.mjs benchmark-runs/d068-analysis-02.json benchmark-runs/d068-comparison-summary-01.json
python3 skills/jev-decision-records/scripts/check_record.py docs/decisions/D068.md --root .
node benchmark-runs/d068-preflight/closeout-validation.mjs benchmark-runs/d068-analysis-02.json benchmark-runs/d068-review/final-analysis-audit-01.json benchmark-runs/d068-preflight/closeout-validation-01.json
```

분석/summary/검증 helper는 기존 결과를 덮어쓰지 않으므로 재검산 출력에는 새 파일명을 써야 한다.01 분석 이후02는 환불 증거와 해시를 첨부한 버전이며 추론량을 새로 추정하지 않았다. 실제 명령 출력·source pins·호출별 질문/답/실패 원문은 private `benchmark-runs/`에 보존한다.

## 남은 일과 부수 효과

다음 구현 후보는 안정 assertion ID→요구사항 연결과 case 내부 미도달 기록, 큰 leaf의 전체 명세 대신 실패한 산출물·의존 계약을 전달하는 수리 질문 계약, 실제 모델 토큰 한도 검증이다. 이는 제안이며 이번 원본에 소급 적용하지 않았다. 실제 Jev 수리 선택·worker 실행·전체 완료와 반복된 동일 조건 효율은 남았다.

단일 스킬 담당이 기록 계약과 [관리 목록](../skills/MAINTENANCE.md)을 갱신했다. 신규 유료 자동 반복·전역 설치·commit/push는 없다. 새 후보·증거·소스·문서는 로컬 미커밋 상태로 남는다. 실험/채점 컨테이너는 제거했고 기존22개·실행3개 및 상태는 유지됐다. [컨테이너 대조](../../benchmark-runs/d068-preflight/container-cleanup-audit-01.json). 정산 확인용 임시 탭은 닫았으며 기존 Personal OS/Vault는 변경하지 않았다.
