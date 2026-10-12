# D074 역할·범위 — 2026-10-12

사용자 요청: Jev에 적합한 프롬프팅을 스킬로 만들고 고정된 공식 호출 규칙을 스크립트로 확인하게 한다. 실패 시 다음 루프를 설계한다. 성능 향상은 미측정 가설이며 이번에는 공식 문서 조사·로컬 구현·무과금 검증을 수행한다.

## 공통 경계

- D073 종료 결과·후보·장부와 기존 기본 실행 경로를 보존한다. 실제 Jev/Claude 추론, Docker, 키 읽기, 외부 메시지, commit/push는 이번 검증에 필요하지 않다.
- 공급자 API 필수 규칙, TypeSafe의 프롬프팅 권장, 프로젝트 정책과 제안을 구분한다. 새로운 로컬 토큰/예산 상한을 도입하지 않는다.
- 스크립트는 형식·경로·버전·바이트·고정 질문 연결을 검증할 수 있다. 질문의 정답률, 의미 충분성, 정확한 provider tokenizer, 실제 서비스 수락은 보장하지 못한다.
- 실패 루프는 같은 입력의 무조건 재전송이 아니다. 실행 상태·과금 상태·제품 검사 상태를 분리하고 변경 근거를 남긴다.
- 공유 checkout에서 담당 파일만 쓴다. 원문 비밀이나 독립 검사 내용을 입력·보고서로 복사하지 않는다. API/장부 접근은 없다.

## 소유권

1. `d071_transport`: `src/orchestration/jev-prompt-preflight.mjs`, `scripts/validate-jev-prompt.mjs`, `docs/orchestration/contracts/jev-prompt-policy.v1.json`, 해당 집중 테스트와 필요한 최소 `examples/jev-preflight/` 자료. 현재 adapter/입력v4 재사용, 공식 규칙/프로젝트 규칙/미확인을 분리한 무과금 검사. 인터페이스를 먼저 root·skill 담당에 전달한다.
2. `d067_skills`: 저장소 정본 `skills/jev-prompting/`, `docs/agents/D074_SKILLS.md`, `docs/skills/MAINTENANCE.md`의 새 항목. 공식 프롬프팅 조사와 적용 경계, 체크 스크립트 호출 방법, 실패 루프 참조를 간결하게 연결한다. 전역 설치와 기존 skill 변경은 하지 않는다.
3. `root`: 공식 문서 교차검증, `docs/orchestration/D074_PROMPTING_AND_FAILURE_LOOP.md`, 실패 루프 순수 정책/무과금 사례, 역할·결정·상태·호스트 진입점·package scripts. 기존 benchmark runner에 자동 재시도는 연결하지 않는다.
4. 독립 검토자는 구현이 준비되면 위와 분리된 입력으로 스킬을 사용해 검사하고 실패 루프의 미확인/중복 재호출 경계를 검토한다. 검토 범위와 결과를 별도 기록한다.

## 완료 기준

공식 출처와 확인일, 실제 검사 명령·출력, 고정 정책 위치, 스킬 진입점, 실패별 다음 행동과 중단 조건, 구현/제안/미실행 경계를 기록한다. 검사 통과를 실제 Jev 성능 개선이나 제품 완료로 보고하지 않는다.
