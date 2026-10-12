# D068 — 수리 경로 수정과 Jev 전체 판단 재실행

2026-10-11 KST. 사용자는 수리 입력 축소, 실패 원인 전달, 불필요한 작업자 재호출 수정을 병렬로 진행하고 Jev 전체 판단 조건을 새로 실행해 기존 결과와 완료·총 시간·토큰·비용을 비교하도록 승인했다. D067 원본은 읽기 전용이다. [실험 계약](../orchestration/D068_EXPERIMENT.md)을 따른다.

## 공통 규칙

AGENTS.md, STATE.md, D067_RESULTS.md와 `benchmark-runs/d067-review/repair-failure-analysis-01.md`를 먼저 읽는다. 자기 파일만 수정한다. 다른 담당 변경을 되돌리지 않는다. 모델 호출·키·실제 장부·Docker 실행과 새 실행 시작은 root만 담당한다. 숨김 채점의 상세 내용은 읽거나 수정·수리에 전달하지 않는다. 원본 실험 결과, 기존 개인 프로젝트, 전역 스킬 설치는 변경하지 않는다. 수치는 명령과 근거 경로로 남기고 미측정은 미측정으로 쓴다.

## 소유권

- **projection / 기존 d067_budget**: `src/orchestration/adaptive-repair-projection.mjs`, 해당 focused test, `docs/orchestration/contracts/adaptive-repair-projection.v1.json`, `docs/agents/D068_PROJECTION.md`. 보존 검증을 포함한 수리 입력 투영을 구현한다. 공개 case·실패·미실행·오류·artifact/environment/revision 연결과 원문·질문·선택지는 보존하고 중복 출력/인터페이스만 줄인다. Planner 연결은 root가 한다.
- **scope / 기존 d067_runner**: `src/orchestration/adaptive-repair-scope.mjs`, `src/orchestration/adaptive-dag-execution.mjs`, 관련 focused tests, `docs/agents/D068_SCOPE.md`. 실제 실패와 fixture blocker의 소유자를 근거로 좁힌 후보를 만들고, 미실행 검사만으로 전원을 재호출하지 않는다. 원인 불명 fallback을 명시하고 모든 공개 검사를 다시 실행한다. 실행기에서 repair terminal cause를 전달하는 연결도 맡고 failure 담당과 계약을 공유한다.
- **failure / 새 d068_failure**: `src/benchmark/adaptive-dag-runner.mjs`의 provider 오류/최종 결과 전달 부분, `src/orchestration/adaptive-dag-planner.mjs`의 오류 전달 부분, 필요 시 `src/orchestration/adaptive-failure.mjs`, 관련 focused tests, `docs/agents/D068_FAILURE.md`. 알려진 HTTP 실패와 전송 불확실성을 분리하고 structured terminal cause를 최상위까지 전달한다. 미정산 예약과 자동 retry0은 보존한다. manifest/reuse와 projection 연결 부분은 root 소유이며 쓰기 종료 후 순차 통합한다.
- **review / 기존 d067_review**: 새 `benchmark-runs/d068-review/`와 `docs/agents/D068_REVIEW.md`만 작성한다. 세 경로의 실제 incident replay, 누락/잘못된 축소·예외 처리·범위 제한 반례를 검토한다. 생산 파일은 읽기 전용이며 root에게 수정 사항을 전달한다.
- **skills / 기존 d067_skills**: `docs/agents/D068_SKILLS.md`, `docs/skills/MAINTENANCE.md`, 기존 기록 스킬 reference만 소유한다. 기존 단일 담당을 유지한다. 새 스킬을 늘리지 않고 필요할 때만 이번 변경의 증거 규칙을 보완한다. 전역 설치/유료 호출 없음.
- **root**: 충돌 없는 순차 통합, manifest/CLI/reuse/freeze, preflight, 실제 Jev/Claude 실행, 독립 제품 채점, 실제 장부·모니터, 비교 산식, 결과·결정·STATE/색인 기록. 단일 새 `jev_all` 실행과 과거 D067 비교를 구분한다.

## 인계

역할 문서에 진행·변경 파일·실행 명령·검증 수준·남은 일·다음 행동을 기록한다. 문맥 한계 시 정확한 파일/프로세스/의미 상태를 남기고 쓰기를 종료한 다음 후임에게 역할 문서를 전달한다. 개발 완료만으로 실제 모델 수리 성공·제품 완료·성능 개선을 선언하지 않는다.
