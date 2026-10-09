# metrics 상태

갱신: 2026-10-08 (Asia/Seoul). 담당 구현 완료, 메인 통합 검사 대기.

## 목적과 범위

정본: [역할](METRICS.md), [구현 계약](../EVALUATION_CONTRACT.md),
[평가 조사](../EVALUATION_RESEARCH.md), [D-012](../DECISIONS.md).
검증된 manifest/records를 입력으로 받아 분모·제외·결측·단위를 보존하는
`evaluateMetrics(manifest, records)` 순수 함수를 구현했다. Node built-in만 사용한다.

수정한 소유 파일:

- `src/evaluation/metrics.mjs`
- `test/evaluation-metrics.test.mjs`
- `docs/agents/metrics-STATUS.md`

다른 담당자의 파일은 수정하지 않았다. 키 접근, 실제 API, 파일 쓰기/네트워크를 하는
런타임 동작, 패키지 설치, 원격 push는 없다.

## 출력 계약

최상위 `schema_version`은 `jev-eval-report/v1`이다.

- `dataset`: dataset_id, dataset_version, provenance를 보존한다.
- `conventions`: manifest 분모, 분류/확률 규칙, 1e-6 확률 합 허용오차,
  argmax 보정, nearest-rank 분위수, request별 청구/완전성/성공당 비용 규칙을 기록한다.
- `cases`: counts, execution_status, decision_status, coverage, scorable_coverage,
  selective_risk, accuracy, verified_correct_yield, no_reference_rate, auto_acceptance.
- `requests`: 기록 수와 completed/failed/unknown 상태, response_received 수,
  받은 응답의 schema passed/failed/unknown 및 pass_rate.
- `trials`: 예정/기록 수, 고유 task 수, outcome과 missing 수, 예정 trial 기준 success_rate,
  success/failure 판정이 있는 trial 기준 conditional_success_rate.
- `latency`: decision_e2e_ms/api_ms/task_e2e_ms. 각 `by_status`에서
  execution status/request status/trial outcome별 n, population_n, missing_count, p50/p95를 반환한다.
  `missing_records`는 decision/trial의 미기록 수이고 request는 예상 수 미상 가능성 때문에 null이다.
- `costs`: request_completeness, total, operational, evaluation, by_phase,
  by_request_status, by_trial_outcome. 실패/불명 비용을 포함하며 evaluation을 운영비와 분리한다.
  `operational.cost_per_success`는 같은 전체 trial cohort의 운영비/성공 trial 수다.
- `classification.groups`: kind와 **순서까지 같은 labels**별 그룹. binary labels는 false,true다.
  manifest_n/n/exclusions, confusion_matrix(reference 행/selected answer 열),
  per_class precision/recall/F1, macro_f1과 제외 클래스를 반환한다.
- `probability.groups`: 같은 그룹별 binary/multiclass Brier, natural log loss,
  최대확률/argmax 정오 기반 reliability 10개 bin, argmax_accuracy, ECE.
  실제 selected answer 정확도와 보정의 정오 기준은 다를 수 있다.
- `limitations`: 합성/작은 표본/채점 결측의 해석 한계와 v1 미포함 기능을 명시한다.

일반 비율은 `{value,n,numerator,denominator,unit:'ratio',reason,exclusions}`다.
`n`은 해당 비율의 분모다. 분모 0이면 value=null/reason=zero_denominator,
분모 미상이면 value=null/n=null/denominator=null/reason=unknown_denominator다.
다중 허용 정답은 전체 accuracy에 포함하지만 단일 gold가 필요한 분류/확률에서는
multiple_accepted_answers로 제외한다. 해당 그룹의 제외 사유는 먼저 적용되는 사유 하나씩만
세므로 n+exclusions 합이 manifest_n이다.

분류의 support 0 클래스는 false positive가 있어도 F1=null/zero_support다.
macro-F1은 정의된 클래스만 동일 가중 평균하며 excluded_classes를 반환한다.
확률 gold 값이 0이면 log_loss.value=null, reason=infinite_loss,
infinite_loss=true와 해당 수를 기록하고 clipping하지 않는다.

### 비용 관측과 완전성

각 scope에는 `units.usd/jev_tokens/jev_credits`, `token_usage.input/output`이 있다.
각 단위에는 total, observed_subtotal, observed_request_count, recorded_request_count,
missing_value_request_count, expected_request_count, complete, reason/reasons가 있다.

- `observation_rate`: **값이 관측된 요청 수 / 예정 요청 수**. total과 trial outcome별 scope는
  예정 요청 수가 알려져 있으면 기록이 부족해도 그 분모를 유지한다.
- `recorded_value_observation_rate`: **값이 관측된 요청 수 / 기록된 요청 수**.
  두 값은 요청 기록이 누락되면 서로 다르다.
- phase/status scope는 요청이 하나라도 누락됐거나 trial 예정 수가 미상이면 누락 요청의
  phase/status를 알 수 없어 expected_request_count와 observation_rate 분모를 null로 둔다.
- 비용이 전부 미관측이면 subtotal도 null이다. 완전한 요청 ledger로 요청이 없음을 확인한
  scope에 한해서 total/subtotal을 실제 0으로 계산한다.
- total은 해당 cohort의 모든 예정 요청 수가 알려져 기록 수와 맞고, scope 내 단위 값이
  전부 관측된 때만 유효하다. evaluation 비용만 누락됐다면 요청 ledger가 완전한
  operational 단위의 완전 총액/성공당 비용은 유지할 수 있다.
- finite 입력의 합이 overflow되면 numeric_overflow와 null을 반환한다. 합산 token usage나
  expected request count가 safe integer 범위를 벗어나도 명시적 사유와 null을 반환한다.
  JSON.stringify의 암묵적 Infinity→null에 의존하지 않는다.

## 실제 검증

실행 명령: `node --test test/evaluation-metrics.test.mjs`.

- 최초 실행: tests 20, pass 20, fail 0, skipped 0, exit 0.
- 독립 review 지적 반영 후 동일 명령: tests 20, pass 20, fail 0, skipped 0, exit 0.
- `node --check src/evaluation/metrics.mjs`: exit 0, 구문 오류 없음.
- 소유한 세 파일에 각각 `git diff --no-index --check /dev/null <file>` 실행:
  공백 오류 출력 없음. 신규 파일과 /dev/null의 차이 때문에 각 exit 1이며 테스트 실패가 아니다.
- 손계산으로 검증: coverage/risk/yield, 혼동행렬과 macro-F1, binary/multiclass Brier,
  natural log loss, ECE, nearest-rank, phase별/실패 비용, 성공당 비용.
- 경계 사례: 빈 manifest, 전부 보류, 실패/불명/미실행/미기록, 참조 없음,
  다중 정답, support 0, 0확률, tie break, prototype-like ID/label,
  하나의 요청에서 여러 판단을 받아도 청구 1회, 미상/부족 요청 수,
  단위별 누락, evaluation 비용 누락, overflow, frozen input, JSON 왕복.

테스트 실패는 없었다. 독립 검토에서 초기 observation_rate가 기록된 요청만을 분모로
사용해 예정 3건/기록 2건/값 2건을 2/2로 표시하는 문제를 발견했다. 이를 예정 분모인
2/3으로 수정하고 기존 비율을 recorded_value_observation_rate로 분리했다.
요청 부족/미상과 phase 미상 분모의 회귀 단언을 추가해 재검증했다.
review 담당자와 메인에게 수정 결과를 전달했다.

## 남은 일과 다음 행동

- main: validate→metrics entrypoint, CLI 예제와 전체 `npm test` 통합 검증.
- review: 수정된 비용 관측률과 전체 최종 소스를 독립 확인.
- 순위, routing/Oracle regret, 신뢰구간, online collector, 실시간 어댑터는 범위 밖이다.
- 실제 모델 성능·시간/비용 절감·사용자 효과·실제 유료 청구의 완전성은 검증하지 않았다.
- 문맥 인계는 발생하지 않았다. 장기 작업으로 전환되어 한계 징후가 생기면 이 파일을
  먼저 갱신하고 운영 규칙의 handoff 절차를 따른다.
