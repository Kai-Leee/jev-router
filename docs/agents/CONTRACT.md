# contract 역할

목적: 결측·중복·허용되지 않은 라벨·상태 모순이 지표를 왜곡하지 않도록 입력 계약을 구현한다.
먼저 [운영 규칙](README.md), [공통 계약](../EVALUATION_CONTRACT.md), [평가 조사](../EVALUATION_RESEARCH.md)를 읽는다.

소유 파일: `src/evaluation/contract.mjs`, `test/evaluation-contract.test.mjs`,
`docs/agents/contract-STATUS.md`. 공통 계약 문서 수정은 메인에게 제안한다.

export: `EvaluationInputError`, `validateEvaluation(manifest, records)`.
유효하면 `{ manifest, records }`를 반환하며 입력을 수정하지 않는다. 부적합하면 code
`INVALID_EVALUATION`인 오류를 던진다. 오류에 입력 값·원문·비밀을 복제하지 말고 고정 설명/필드 경로만 사용한다.
Node built-in만 사용한다. 기존 API 클라이언트는 변경하지 않는다.

완료 조건: 공통 계약에 따른 검증, 중복/미등록 ID/확률/결측/상태 모순/예상 요청 수의 의미 있는
회귀 테스트. 본인 테스트 명령과 결과를 상태 파일에 남긴다. 컨텍스트 한계 때 운영 규칙의 인계 절차를 따른다.
