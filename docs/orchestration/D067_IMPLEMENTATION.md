# D067 — 무상한 장부와 병렬 실행 연결

[프로토콜](D067_EXPERIMENT.md), [역할](../agents/D067_PARALLEL.md), [현재 상태](../agents/STATE.md). 이 문서는 실행 전 검증을 완료한 구현을 설명한다. 제품 품질·비용·속도 결과는 새 cohort가 종료된 뒤 별도로 기록한다.

기존 `jev-token-budget/v2`는 누적 입력10M을 검사했다. [budget 모듈](../../src/benchmark/budget.mjs)에 명시적인 `jev-token-budget/v3`를 추가해 `max_input_tokens:null`만 무상한으로 해석한다. 사용량은 계속 정확한 정수로 누적하고 이전 정책의 의미는 보존한다. 이관은 같은 경로의 기존 장부만 허용하며 사용량·ID·정산 번호·마지막 정산·환불 이력을 복사한다. pending 또는 blocked 상태를 이관으로 지울 수 없다.

[명시 이관 CLI](../../scripts/migrate-unlimited-token-budget.mjs)의 두 설정에서 상대 경로는 각 설정 파일 디렉터리 기준이다. 이번에는 root가 절대 경로를 가진 private 설정을 만들어 혼동을 없앴다. 실제 이관은 사용량9,584,555·정산483을 유지했고 추론 호출은0이었다. [검증 원본](../../benchmark-runs/d067-preflight/migration-validation.json).

[잠금 획득](../../src/benchmark/budget-acquire.mjs)은 일반적인 로컬 lock 경합만 기다린다. 조건의 남은 deadline과 취소 신호를 전달하고 `wait_ms`, `lock_contentions`를 기록한다. 계정 조회·예약·Jev POST·정산이 끝날 때까지 한 lease를 유지하므로 이 구현은 Jev HTTP 병렬 전송기가 아니다. 미정산 오류나 유료 POST를 재시도하지 않는다.

[실행기](../../src/benchmark/adaptive-dag-runner.mjs)의 새 v2 manifest 경로는 공통 preflight 이후 네 arm을 시작하고 `Promise.allSettled`로 전원 종료를 수집한다. 출력·candidate·CLI 세션은 arm별로 분리하며 구현 슬롯은 각각2개다. 시작/종료의 settled snapshot도 lock 아래에서 읽는다. 종료 스냅샷은 다른 조건의 unresolved 예약을 원형 기록하지만, 새 요청을 허용하는 근거로 사용하지 않는다. 공통 preflight는 cohort wall에만 포함한다.

[공통 preflight](../../src/benchmark/dag-runner.mjs)는 v3 schema, `unlimited:true`, 명시null을 함께 검증한다. `null < 65536`이 true가 되는 JavaScript 강제 변환 때문에 무제한을0으로 오차단하지 않는다. v1/v2의 유한 한도 검사는 계속 적용한다.

[D067 manifest](../../benchmarks/e2e-swe/manifests/d067-adaptive.json)는 기존 D066 catalog의 result/request/source 핀을 고정한다. 원본55개 사본 무결성, 원문·요구사항, 생성 prompt/schema와 model/effort가 같아야 재사용한다. 변경 허용은 이번 실행·장부 연결5개 파일로 좁혔다. 판단 질문 생성기·작업자·공개 검사 규칙의 임의 변경은 허용하지 않는다. CLI는 D067에서 새 catalog 준비 요청을 거절한다. 신규 준비 호출은0이며 과거 준비비·시간은 참고 필드다.

[dashboard projection](../../src/dashboard/metrics.mjs)과 [표시](../../dashboard/app.js)는 무상한과 미확인 사용량을 구별한다. 누적 사용량10M 초과도 표시하며 사용량 자체가 없으면 미확인을 유지한다. 이것은 기존 화면의 정책 호환 수정이다. 새 adaptive cohort 전체를8787 실시간 화면에 연결하거나 브라우저 E2E를 수행한 것은 아니다.

## 검증과 수정 근거

- 전체 `npm test`:1,041/1,041,fail/cancel/skip0,29,279.575625ms. [명령·로그 해시](../../benchmark-runs/d067-preflight/regression-summary.json).
- 마지막 실행 경로 호환 수정은 `node --test test/adaptive-dag-runner.test.mjs`9/9 재실행으로 검증했다. 독립 담당도9/9과 strict catalog 재사용을 확인했고 최종14개 source hash를 대조했다. [독립 검토](../../benchmark-runs/d067-review/prelaunch-review-01.json).
- 독립 synthetic measured-decider 세 개의 동시 진입은 장부에서 정확히 직렬 정산돼10M을 넘어 누적됐다. 별도 불확실 응답은 다음 호출을 막고 예약을 유지했다. [합성 증거](../../benchmark-runs/d067-review/budget-transport-witness-01.json). 실제 공급자 동시성·효율을 검증한 것은 아니다.
- 검증기 결함도 보존한다: 기존 runner fixture가 실제 장부 잔액을 읽어 사용량에 따라 결과가 바뀌었다. 테스트 전용 장부로 분리했다. 새 병렬 경로의 종료 snapshot이 다른 조건의 pending을 자기 결과의 불확실성으로 바꾸던 R1도 수정했다. 이 두 수정은 제품 모델의 성능 개선과 별개다.

실제 models GET·Claude OAuth·고정 Docker·공개 control preflight는 ready였다. [실행 전 gate](../../benchmark-runs/d067-preflight/launch-gate.json)에서 source와 문서를 동결한 뒤 `d067-comparison-01`을 시작했다. API 키는 기존 서버 환경 파일에 유지하며 코드·로그·문서에 복사하지 않았다. 실제 결과·독립 채점·토큰/비용/대기 분석은 종료 시 갱신한다. 소스·문서·private 증거는 미커밋이며 전역 설치·Personal OS 변경·Git push는 하지 않았다.
