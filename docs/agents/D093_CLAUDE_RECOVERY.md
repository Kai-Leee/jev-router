# D093 Claude 회복 실행 — 경로 정규화만 변경

원래 cohort는 Codex 두 조건을 종료하고 Claude native가 모델 전송 전에 `CLAUDE_ENV_WORKSPACE_NOT_EMPTY`로 중단했다. 원인은 빈 macOS 임시 폴더의 `/var/folders`와 `/private/var/folders` 실제 경로 차이를 외부 verify가 내용 오류로 분류한 것이다. Claude 실제 개발 호출0, Jev+Claude 미시작이었다. 원래 150소스/4297보존/컨테이너5동일·자체0·토큰·가격은 root와 독립 감사로 확정했고 원문을 수정하지 않는다.

새 v12 gateway와 pointsman-claude-d093-recovery manifest로 Claude native 및 Jev+Claude를 각1회 순차 실행한다. 같은 실제 native CLI2.1.299 SHA, 원래 OAuth,20후보/4모델/5노력도, 동일 D092 고정 공개 이력(호환 Claude 관측0), 공개93/독립63, 작업자동시2/최대30,수리2회,동일task/catalog와 코드 출력/기록/사전검사/정산을 유지한다. 변경은 검증된 macOS OS별칭만 같은 빈 canonical 디렉터리로 받아들이는 환경 guard와 새 계약 등록/회복 실행 진입점이다. 다른 symlink와 비어 있지 않은 디렉터리는 거부한다. 외부 도구/스킬0, native builtin3개 보고와 formatter는 별도 기록한다. 전체 source를 다시 별도 동결하고 paid 중 수정하지 않는다.

root만 실제 CLI/모델/계정/장부/Docker에 접근한다. d086_runner_pair는 claude-environment와 관련 테스트의 경로 수정 담당(실제 모델 호출0), metrics_audit는 원래 감사 보존 후 새 phase 별도 감사와 최종 네 조건 연결, capability_audit는 원래 Codex 쌍 공개 실패/no-op·담당 연결 분석(숨김 상세 접근 금지) 담당이다. source phase가 다르므로 Codex 대 Claude 모델만의 인과 비교는 하지 않는다. 각 가족 내의 native 대 Jev를 비교한다. 준비 실패를 완료 시간으로 계산하거나 재실행 원문에 덮지 않는다. 불확실 결과 자동 재시도·fallback·장부 초기화 없음. 최신 사용자 지시의 Mac 전체 개발 비교 권한을 유지한다.
