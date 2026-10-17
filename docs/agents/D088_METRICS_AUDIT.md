# D088 종료 후 수치 감사 역할

root가2026-10-16 실제 두 조건 종료 뒤 지정한 읽기 전용 역할이다. 대상은 새 D088 결과이며 역할 소유자는 기존 metrics_audit 에이전트다.

목적은 root의 집계가 실제 영수증·공개 검사 revision·독립 채점과 일치하는지 별도로 확인하는 것이다. 결과 정본·코드·계약·장부·검사기·후보는 수정하지 않는다. 모델 호출·GET·Docker 실행·기존 시도 재개는 하지 않는다. 숨김 검사 내용은 열람하거나 개발 입력으로 전달하지 않으며 독립 grade-summary의 건수와 후보 연결만 확인한다.

입력은 `benchmark-runs/d088-codex-20261016-01/result-audit.json`, 두 arm의 result/execution/grade-summary와 per-attempt 영수증, protocol, ledger-before/after 스냅샷, captured-rates, 보존 검사다. 빈 배열이 통과한 것처럼 처리하지 않는다. 캐시는 input에 포함된 부분량이며 reasoning도 output에 재가산하지 않는다. 실제 구독 비용은 null, 요청 모델 기준 단가 시나리오와 Jev 역사적 토큰팩 환산액은 추정이다. 실패 시간의 차이는 완료 가속이 아니다.

산출물은 root에 수치·계산·근거 경로 및 발견된 오류를 보고하는 것이다. 새 감사 파일이 필요하면 같은 D088 private 폴더에 새 이름으로 생성할 수 있지만 원본을 덮어쓰지 않는다.
