# metrics 역할

목적: 기록을 재사용해 분모·결측·단위가 명확한 평가 결과를 계산한다.
먼저 [운영 규칙](README.md), [공통 계약](../EVALUATION_CONTRACT.md), [평가 조사](../EVALUATION_RESEARCH.md)를 읽는다.

소유 파일: `src/evaluation/metrics.mjs`, `test/evaluation-metrics.test.mjs`,
`docs/agents/metrics-STATUS.md`. export `evaluateMetrics(manifest, records)`는 검증된 입력을 받고
JSON 직렬화 가능한 report를 반환한다. 부수 효과·네트워크·파일 접근 없음. Node built-in만 사용한다.

구현: manifest 분모 기반 coverage/risk/accuracy/yield, 상태·자동채택·제약 위반,
trial 성공, 성공/실패 시간 n/p50/p95, phase·단위별 비용과 완전성/성공당 비용,
categorical confusion/per-class/macro-F1, binary/multiclass Brier/log-loss/reliability bins.
순위·Oracle regret·신뢰구간·온라인 기록기는 이번 구현 범위 밖으로 명시한다.
다중 허용 답은 accuracy에는 허용하되 단일 gold가 필요한 지표에서는 제외 건수/이유를 보고한다.
schema_version `jev-eval-report/v1`, provenance와 metric convention을 보존한다.

비용 누락은 0으로 만들지 않는다. 예상 요청 수를 모르면 완전 총액을 주장하지 않는다.
실패 비용도 포함하고 evaluation phase 비용은 operational과 분리한다. 다중 질문 청구는 request당 한 번.
손계산/독립 식, 빈/전부 보류, 0확률, 누락 비용, 중복 없는 여러 질문의 단일 청구, 미실행 분모를
검증한다. 출력 계약과 명령/결과를 상태 파일에 남기고 문맥 한계 시 인계한다.
