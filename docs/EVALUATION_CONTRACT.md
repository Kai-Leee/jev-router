# 오프라인 평가 입력 계약 v1

상태: D-012에 따른 첫 구현 계약. 확정된 제품 성능 기준은 아니다.
모든 JSON 객체는 아래 정의한 필드만 허용하고, 기록에 prompt·state·인증 값은 넣지 않는다.
입력/결과는 영어 식별자를 사용한다. null은 미제공이며 0과 구분한다.
모든 ID·dataset version·label 문자열은 trim 결과가 비어 있지 않아야 하며 원래 값을 변경하지 않는다.
`__proto__` 같은 라벨도 허용하므로 딕셔너리는 own property/Map 등으로 안전하게 처리한다.

## Manifest

필수: `schema_version: "jev-eval/v1"`, `dataset_id`(비어 있지 않은 문자열),
`dataset_version`(문자열), `provenance: "synthetic" | "observed"`, `trials` 배열, `cases` 배열.

- trial: `trial_id`, `task_id`(각 문자열), `expected_request_count`(0 이상 안전한 정수 또는 null).
  trial_id는 고유. expected_request_count는 evaluation phase까지 포함한 실제 HTTP 요청 예상 총수다.
  null은 요청 기록의 완전성을 모른다는 뜻이다. 실제 기록이 예상보다 많으면 계약 오류다.
- case: `case_id`, `trial_id`, `kind: "categorical" | "binary"`, `labels`, `reference`.
  case_id는 고유이며 trial_id는 등록된 trial이어야 한다.
  categorical labels는 중복 없는 2개 이상 문자열 배열; binary labels는 null이다.
  reference는 null 또는 `{ accepted_answers: [...] }`. 비어 있지 않은 중복 없는 허용 답 집합이며
  categorical은 labels 안의 문자열, binary는 boolean이다. 답이 여러 개일 수 있다.

빈 manifest 배열은 허용한다. 사례 없는 trial도 허용한다. 입력이 누락된 사례/trial도 분모에 남는다.
정답/허용 집합은 평가 전용이며 모델 호출 state와 분리한다.

## JSONL records

각 행은 다음 중 하나다. 나열된 필드는 모두 필수이며 nullable 표시는 명시적 null을 허용한다.

### decision

`type: "decision"`, `case_id`, `execution_status`(completed/failed/unknown/not_called),
`decision_status`(decided/abstained/not_evaluated), `answer`(문자열/boolean/null),
`probabilities`(확률 map 또는 null), `auto_accepted`(boolean), `constraint_pass`(boolean/null),
`decision_e2e_ms`(0 이상 유한 숫자 또는 null).

- case당 최대 하나. 미등록 case는 오류.
- decided는 completed이고 유효 answer가 있어야 한다. abstained는 completed이며 answer/probabilities는 null.
  not_evaluated는 completed가 아니며 answer/probabilities는 null. 이 제한은 v1의 단순화다.
- auto_accepted는 decided일 때만 true. constraint_pass는 auto_accepted일 때만 boolean 가능.
- probabilities는 decided일 때만 가능. categorical은 labels 전체를 정확히 포함하고,
  binary는 `"true"`, `"false"`를 정확히 포함한다. 각 값은 [0,1]의 유한 숫자,
  합 오차는 1e-6 이내. 자동 정규화 금지. 선택된 answer가 최대확률 라벨이어야 한다고 강제하지 않는다.

### request

`type: "request"`, `request_id`, `trial_id`,
`phase`(question_generation/decision/execution/recheck/evaluation),
`status`(completed/failed/unknown), `response_received`(boolean), `schema_valid`(boolean/null),
`duration_ms`(0 이상 유한 숫자/null),
`cost: { usd, jev_tokens, jev_credits }`(각 0 이상 유한 숫자/null),
`tokens: { input, output }`(각 0 이상 안전한 정수/null).

- request_id 고유, trial_id 등록 필수. 다중 질문 요청도 한 행만 쓴다.
- 응답이 없으면 schema_valid는 null. completed는 response_received=true와 schema_valid=true다.
  failed는 HTTP 오류/응답 부적합을 포함하며, unknown은 결과 불명을 보존한다.
- 평가용 judge 요청은 evaluation phase. 나머지는 운영 비용.
- 한 단위의 해당 없음/실제 0을 확인했으면 0, 확인하지 못했으면 null.
  단위를 자동 환산하지 않는다. 예상 요청 수 미상/부족은 total 완전성에 반영한다.

### trial

`type: "trial"`, `trial_id`, `outcome`(success/failure/unknown/not_run/grader_error),
`duration_ms`(0 이상 유한 숫자/null). trial당 최대 하나, 미등록 trial은 오류.
success/failure는 독립 검증기의 결과이며 메인 에이전트 자기 주장을 대신 기록하지 않는다.

## API와 출력

- `validateEvaluation(manifest, records)` -> `{manifest, records}`; 입력 변경 없음.
- `evaluateMetrics(manifest, records)` -> JSON report; 검증된 입력을 받는 순수 함수.
- `evaluate({manifest, records})` -> validate 후 metrics 호출.
- report는 schema_version `jev-eval-report/v1`, dataset provenance, manifest 분모/결측/상태,
  metric별 n·비율 분자/분모·convention·null 사유를 보존한다.
- 0 분모는 null, 0 확률 log-loss는 null+infinite_loss, 미관측 비용은 null+관측 부분합.
  예상 요청과 기록의 수가 맞지 않거나 예상 수가 null이면 완전 비용을 주장하지 않는다.
- 비용 `observation_rate`는 값 관측 요청/예정 요청이다. 누락 요청의 phase 등으로 분모를
  알 수 없으면 null+unknown_denominator. `recorded_value_observation_rate`는 값 관측 요청/기록된 요청으로
  구분한다. 기록 자체가 빠져도 100%로 보이는 관측률을 전체 관측률로 사용하지 않는다.
- latency 분위수는 nearest-rank(ceil(p*n)-1, 정렬된 0-based index)를 사용한다.
  과제 성공/실패 시간과 unknown elapsed는 구분한다.
- probability reliability는 고정 10개 동일 폭 bin, confidence=max(p), 정답 여부는 argmax와 단일 gold 비교.
  동률 argmax는 manifest labels 순서(binary false,true)로 결정하며 정책을 출력에 기록한다.
  실제 선택 answer 정확도와 이 확률 분류의 보정 결과는 구분한다.
- 기본 클래스 지표는 단일 gold 사례에서 계산한다. 0 support 클래스/0 분모 F1은 null로 두고,
  macro-F1은 정의된 클래스만 평균하며 제외 클래스와 수를 함께 남긴다.

원래 출력 계약을 확장하는 ranking·routing regret·CI·실시간 수집기는 후속 단계다.
비교하는 모델 ID·설정·원시 trace는 추후 실제 실행 어댑터 계약으로 추가하며 v1 파일에 임의 삽입하지 않는다.
