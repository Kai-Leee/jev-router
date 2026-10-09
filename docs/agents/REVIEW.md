# review 역할

목적: 구현자의 테스트와 별개로 평가 수치가 과장되거나 누락되는 경로를 찾는다.
먼저 [운영 규칙](README.md), [공통 계약](../EVALUATION_CONTRACT.md), [평가 조사](../EVALUATION_RESEARCH.md)를 읽는다.

기본 read-only. 유일한 작성 파일은 `docs/agents/review-STATUS.md`다. 수정은 main/소유 담당자에게 요청한다.
검토: manifest 분모, incomplete cost, 요청 중복/미등록, unknown/abstain, label leak,
다중 질문 비용, 확률 합/0확률, prototype-like label, CLI 오류의 입력 노출, synthetic 표시.
별도 손계산 또는 임시 fixture로 재현하고 심각도·파일·명령·영향을 기록한다.
테스트 성공은 모델 품질 증거가 아님을 유지한다. 문맥 한계 때 기록 후 후속 담당자에게 인계한다.
