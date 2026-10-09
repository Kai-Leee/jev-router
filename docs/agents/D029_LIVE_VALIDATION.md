# D029 — 2026-10-09 역할과 실행 경계

사용자 요청: Opus/Fable/Sonnet/Haiku 및 노력도 목록, 조사 기반 작업자 지시, Claude/Codex 문서 진입점 보강, 생성 커밋 후 E2E 효율 및 분할 확률 검증. 기존 Jev USD1 공유장부 유지. 모델 지원은 공식 문서/설치 CLI/실제 계정 호출을 구분. 원래 PersonalOS/Vault/기존 결과 변경 금지.

- main: 기존 코드/인증/장부 확인, 변경 통합·commit, 실험 계획과 유료 실행/채점·분석·최종 기록 소유. paid 요청의 유일한 실행 담당.
- model_docs: 공식 모델/effort 및 Claude/Codex instructions 조사. docs/orchestration/contracts/models.v2.json, worker-task.v2.json, docs/orchestration/D029_MODEL_HOST_RESEARCH.md, CLAUDE.md 소유. 기존 v1 변경 금지. 실제 API 호출 금지.
- live_runner: 기존 CLI 및 격리 E2E 연결 조사와 새 라이브 실행 모듈/테스트 소유. 상세 소유파일은 main 메시지 지정. provider/CLI 유료 실행 및 git mutation 금지. 새 런타임에서 정본문서 기반 질문/worker 프로필 direct dispatch, baseline과split 조건 비교. 성능 사실은 실행 후 기록.
- review: 코드/비교 설계/비밀 유출·커밋 범위 읽기 전용 독립 검토.

모든 담당은 AGENTS 및 jev-decision-records 스킬을 읽는다. 조건 변경/미검증/실패를 숨기지 않는다. native Claude worker와 Codex 개발 서브에이전트는 별개다. 최종 산출물과 새로운 live 원본은 덮어쓰지 않는다. 작업 인계 시 역할·변경 파일·검증·남은 일·원본 경로 기록.
