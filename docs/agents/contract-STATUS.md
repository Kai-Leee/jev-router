# contract 상태

갱신: 2026-10-08 (Asia/Seoul). 상태: 담당 구현 완료, 메인 통합 검증 대기.

## 목적과 구현

[역할](CONTRACT.md)과 [입력 계약](../EVALUATION_CONTRACT.md)에 따라 결측·중복·미등록 ID·
확률 오류·상태 모순이 평가 분모와 집계를 왜곡하지 않도록 입력을 검사한다.

- `src/evaluation/contract.mjs`: `EvaluationInputError`, `validateEvaluation(manifest, records)`.
  성공 시 입력 객체 참조를 그대로 반환하고 수정·정규화하지 않는다.
- `test/evaluation-contract.test.mjs`: 합성 입력의 정상·오류·경계 사례 회귀 검사.
- `docs/agents/contract-STATUS.md`: 이 담당 기록. 공통 계약/상태/검증 문서는 수정하지 않았다.

명시적 null과 필드 누락을 구분하고 객체의 추가 필드와 비 JSON 속성을 거부한다.
미실행 decision/trial, 부족하거나 미상인 예상 요청 기록은 허용하여 후속 집계에 남긴다.
trial별 예상 요청 수는 evaluation phase를 포함하며 초과 기록만 오류다.
모든 ID/version/label의 공백 검사와 expected_request_count의 safe integer 검사는
메인이 공통 계약에 보강한 내용에 맞췄다. 문자열의 원형은 유지한다.

오류 code는 `INVALID_EVALUATION`이며 고정 설명과 구조 경로만 포함한다.
미등록 ID, 라벨, 알려지지 않은 필드 이름, 입력 값, cause를 오류에 복사하지 않는다.
`__proto__`/`constructor` 라벨은 허용하고 Map/own property로 처리한다.

## 실제 검증

- 첫 실행: `node --test test/evaluation-contract.test.mjs` → 25 passed, 0 failed,
  0 skipped, exit 0. 입력 freeze, 여러 허용 답, 빈 manifest, 명시적 null, 중복/미등록 ID,
  확률 범위·합 허용오차·비정규화, 상태 관계, 각 단위 숫자, 요청 수 완전성, 오류 비노출을 검사했다.
- 후속 보강: JS API로 직접 전달한 배열의 getter/희소 원소/추가 메타데이터도 거부하도록 추가했다.
  최종 `node --test test/evaluation-contract.test.mjs` → 26 passed, 0 failed, 0 skipped, exit 0.
- 소유 파일 3개 각각에 `git diff --no-index --check /dev/null <file>` 실행 → 공백 오류 출력 없음.
  세 파일이 untracked여서 `/dev/null` 대비 검사했으며 diff 존재를 나타내는 exit 1이다.
- 실행된 테스트 실패는 없었다. 네트워크·키 조회·실제 API·패키지 설치·원격 push는 하지 않았다.

## 한계와 다음 행동

- 검증은 v1 JSON 입력 구조와 내부 일관성을 다룬다. 기록이 실제 호출에서 왔는지,
  독립 grader의 판정인지, 기록 비용이 실제 청구인지 증명하지 않는다.
- supplied JSON 객체 밖의 실행 가능한 Proxy 코드를 위한 sandbox가 아니다.
- 지표·CLI·통합 entrypoint 및 전체 테스트 검증은 메인과 해당 담당 영역이다.
  메인은 통합 후 전체 테스트·예제 실행과 공통 문서 현행화를 진행한다.
- 컨텍스트 한계 징후 없음. 인계 문서 작성과 후속 작성자 전환은 아직 발생하지 않았다.
