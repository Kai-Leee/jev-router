# D069 — assertion 담당 연결과 산출물 수리의 실제 재실행

2026-10-11 KST. [역할과 경계](../agents/D069_PARALLEL.md)에 따라 병렬 구현 후 새 `jev_all` 한 조건을 실행한다. [D067](D067_RESULTS.md)·[D068](D068_RESULTS.md)의 원본 결과, 실패, 후보, 영수증, source snapshot은 그대로 보존한다. 이 문서는 사전 계약이며 효율 개선의 실측 결과가 아니다.

## 고정 조건

기존 OpenAPI Python client generator 공개 과제와 D066 source-only catalog를 재사용한다. 원문 요구사항80개, catalog21단위·22산출물·38파일이며 새 catalog 생성 비용은 없다. 작업자는 Opus5.5 medium, 실행 슬롯2, 논리 작업자 최대30, 공개 수리 최대2회, arm 전체 deadline14,400초다. 누적 및 조건별 지출 토큰 상한은 null이며 기존 장부 ID·이력을 유지한다. 모델 문맥 제한은 지출 상한과 별개다.

Jev가 재귀 분할, 관계, 필요한 공개 실패 수리를 선택한다. 구현·수리마다 새 Claude CLI 세션을 사용한다. 기존 생성 입력은 유지하고 수리 입력만 산출물 중심으로 조립한다. D067은 네 조건 동시 실행, D068·D069는 각각 한 조건이므로 실행 경합 차이와 표본1회의 한계를 명시한다.

## 변경과 검증 경계

- 공개 case의 assertion마다 안정 ID·요구사항·public-interface 산출물 경로를 붙이고, 실패 이후 미도달 assertion을 `not_reached`로 기록한다. `실패 assertion → 요구사항 → 산출물 → 실제 task owner`를 현재 plan·검사 계약·revision에 연결한다. 공개 경계 경로는 실제 원인 파일의 확정 증거가 아니다.
- 실제 관측한 assertion의 산출물, 또는 선언된 consumer를 포함하는 수리 후보를 만든다. 미매핑·stale 증거는 명시적인 task 범위 fallback이다. 미도달 항목만으로 담당을 추가하지 않는다. 동일 assertion의 실제 원인이 선택된 write scope 밖이면 수리가 실패할 수 있으며 이를 숨기지 않는다.
- 수리 작업자는 선택된 산출물의 원문 요구사항·인터페이스·실패·revision을 받는다. full source와 shared catalog를 중복 전달하지 않는다. 원래 task의 나머지 산출물은 기존 바이트를 상속하고 쓰기를 금지한다. 내부에 선언되지 않은 의존 관계는 unknown이며 읽을 수 있는 기존 파일과 쓰기 권한을 구분한다.
- 공개85개 검사 의미와 독립63개 채점은 유지한다. assertion metadata는 새 계약/hash로 구분한다. 정상·결함 공개 controls를 현재 소스에서 다시 실행해 새 영수증을 만들고, 과거 control 영수증은 바꾸지 않는다. 숨김 검사 내용은 어떤 결정·작업자 입력에도 넣지 않는다.

## 입력 토큰 사전 검사

공식 [TypeSafe models](https://docs.typesafe.ai/models)·[Jev API](https://jev-ai.pro/jev-api) 문서에서 확인한 기준은 state+가장 긴 질문32k, state+모든 질문64k다. HTTP body byte 제한과 분리한다. 공개 SDK에서 해당 모델의 exact tokenizer/count endpoint를 확인하지 못했다. 따라서 `ceil(serialized bytes / 2.5) + 512`는 실행 전 거르는 **정책 추정치**이며 입증된 토큰 상한이나 공급자 수락 보장이 아니다. 32,000/64,000을 정책 비교값으로 사용하고, exact token count는 null로 둔다. 정책 근거·해시·원문 request 해시·실제 공급자 usage를 함께 남긴다.

과거 D068 입력거절 request는 로컬에서 차단되는지, 성공 요청들의 aggregate usage와 추정치가 얼마나 다른지 따로 확인한다. 과거 과금 usage 적합성이 개별 질문의 문맥 적합성을 증명하지 않는다. 사전 검사 뒤 request 해시를 다시 대조하고 동일한 본문만 POST한다. block이면 reserve/POST를 하지 않는다. 네트워크·모델 제한 실패 자동 재전송은0이다.

새 전체 생성 전에 보존된 D068 후보를 읽기 전용으로 새 assertion checker에서 확인하고, 그 공개 실패로 조립한 새 산출물 수리 질문을 **별도 진단1회** 실제 전송한다. 원본 후보는 변경하지 않고 이 진단의 비용·시간을 새 arm과 별도 집계한다. 이 호출은 해당 요청의 실제 수락·usage를 확인하는 것이며 작업자 수리나 전체 완료 증거는 아니다. 새 run의 매 요청에도 같은 사전 검사를 적용한다.

## 실행과 판정

targeted 회귀·독립 코드 리뷰·현재 public controls·모델 GET·목적지·OAuth·장부 상태를 확인하고 소스를 동결한 뒤 fresh D069 디렉터리에서 실행한다. `public85/85 AND independent63/63, skipped0`일 때만 제품 완료다. 자연적으로 수리가 없으면 실제 수리 성공은 미측정으로 적는다. 수리가 발생하면 후보 수·선택 task/artifact·실제 호출·상속/변경 바이트·수리 후 전체 검사·실패 원인을 측정한다.

arm, preflight, 독립 채점, 사전 진단, 별도 숫자 전용 Opus5.5 monitor 시간을 구분한다. 토큰은 입력·출력·캐시 생성·캐시 읽기와 stage별 호출을 함께 집계한다. 공식 단가 환산과 월 구독 실제 청구 배분을 구분하며 미보고 usage는 null로 둔다. 완료한 후보끼리만 완료 시간 비율을 계산하고, 실패 후보와는 시도 시간/비용을 비교한다.

종료 시 이전 원본 해시 불변, source drift, 후보 동결, 장부 pending, 새 컨테이너 정리, 기존 컨테이너 상태, 남은 로컬 파일과 미커밋 변경을 확인한다. 결과는 새 D069 문서와 evidence에 남기고 실패한 검증·수정한 원인도 보존한다.

## 실제 사전 진단이 뒤집은 결과 — 2026-10-11 후속

원본 D068 후보38파일을 새 런타임에 복사하여 공개 검사를 다시 수행했다. 111,691.192ms, provider/worker 호출0, public84/85이며 같은 `existing-output-refused` assertion이 실패했다. 뒤의 assertion3개는 `not_reached`다. 원본38파일은 불변이다. v1 수리 전송량은97,071→70,510B로 줄었으나, 추정28,690 tokens로 허용한 뒤 **실제 HTTP400 model_input_limit**로 거절됐다. 이것은 사전 추정의 실제 오허용 사례이며 기존 성공 자료와의 일치가 수락을 보장하지 않음을 확인했다.

진단01은 root helper가 소수 timeout을 전달한 구현 결함으로 POST 전 `INVALID_CONFIG`였다(POST0,37.841ms). 정수로 수정한 진단02는 POST1,3,293.459ms,추론 usage null이다. 원본 두 result의 고정 `acceptance_boundary` 성공 문구는 잘못된 보고 구현이다. 원본을 덮지 않고 status/HTTP/영수증이 실패임을 여기 정정한다. 이후 helper는 성공 여부에 따라 문구를 생성한다.

계정의20:00 KST 실패1질문 행 `Refunded · no charge`, 정확한 provider/local attempt 연결을 가진 원시HTTP400, fresh credits GET(tokensReserved0)을 대조했다. `d069-refund-01`에서 r667만 명시적으로 정산했다. charged input12,994,396은 불변이고 settled667,pendingnull이다. 실제 해당 실패 청구는0, 추론 토큰은 여전히 null이다.

새 v2는 실패 의미/85개 case/실패 후 미도달/선택 권한/원문 요구사항을 보존하며 반복 revision·검사 메타데이터를 controller의 hash 연결 기록으로 옮긴다. 작업자에는 필요한 의존 인터페이스와 읽기권한을 유지한다. repair stage에만24,000B 운영 상한을 추가한다. 초과하면 사실을 잘라내거나 부분 질문으로 바꾸지 않고 reserve/POST 전에 명시 차단한다. planning은 기존 추정을 유지한다. v1 계약과 실패 원본은 보존하고 `d069-adaptive-v2.json`(v5)과 새 계약으로 구분한다.

따라서 기존 ‘별도 진단1회’ 계획은 실제 실패로 변경되었다. 새 입력을 검토·회귀 검증한 뒤 변경된 수리 질문을 진단03으로1회 보내고, 각 진단 시간/POST/비용은 전체 개발 arm과 분리한다. 동일 실패 요청의 자동 재전송은 하지 않는다. 전체 개발 재실행은 아직 시작하지 않았다.
