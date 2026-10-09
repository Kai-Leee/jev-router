# 현재 진행·실패 탐지 감사 역할

2026-10-09 사용자 요청: 현재 진행 실패를 확인할 수 있는 실시간 연동을 조사한다.

- 담당: benchmark_runner_review 재배정. 소유 파일: `docs/research/CURRENT_FAILURE_AUDIT.md`만.
- 현재 runner/telemetry/gate/reader/metrics/UI를 읽고 어느 실패가 즉시/종료 후/시간 제한 이후/
  전혀 안 보이는지 명령·파일 줄 근거로 조사한다. 정상 도구 오류를 실행 전체 실패와 구별한다.
- 연결 건강, process/container liveness, 실제 진행, provider 결과, evaluator 결과와 비용 완전성을 구별한다.
- deterministic synthetic 재현은 OS tmp의 새 파일에서만 한다. 필요하면 현재 localhost snapshot을 읽되
  원문 로그/명령/키/사용자 콘텐츠를 출력하지 않는다. 실행 중 서버·기존 기록을 바꾸지 않는다.
- 해제되지 않는 pending, idle/hang, 중복/누락 event, 후행 오류, evaluator 입력 모호성 등의 빈틈을
  실제 소스 근거와 재현한 범위로 기록한다. 과거167 tests를 이번 실행 결과로 사용하지 않는다.
- 제품 수정·유료 추론·Docker 실행/정지·인증 변경 없이 문서·검증 코드 조각만 제시한다.
- 실패 주입 matrix와 탐지지연/오탐·미탐/복구 검증 제안을 남기고 메인에 완료 보고 후 쓰기를 종료한다.
