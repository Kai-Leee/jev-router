# D071 — 공개 실패 연결과 Jev 모델·노력도 선택

2026-10-11 사용자 요청: 추가 공개 검사 실패 원인과 수리 후보에서 빠진 담당 연결을 병렬 수정하고 실제 재실행한다. 기존 결과를 보존하고 Claude 단독 대비 완료·총 시간·토큰·비용을 비교한다. 작업별 모델과 추론 노력도도 실제 Jev 선택에 연결한다.

## 목적과 현재 상태

동일 품질의 개발 완료 시간과 환산비용을 줄이는 것이 목표다. 병렬 구현·실제 실행·채점·독립 감사는 종료했고 [최종 결과](../orchestration/D071_RESULTS.md)에 기록했다. 새 Claude만 공개93+독립63 완료, Jev 고정/프로필은 미완료다. 기존 설명 누락 후보의 producer1파일 수리는 별도 성공했다. D070의 과거 결과는 원본 그대로 보존한다. 모델 선택10/10 실행 연결을 최적성이나 전체 개발 완료로 확대하지 않는다. 아래 파일 소유권은 이번 분업 과정과 후속 역할의 기록이다.

## 담당과 파일 소유권

- Root: runner/planner/execution 통합, 새 manifest·실험 계약·공유 상태, 기존 증거 보존, 실제 환경 확인·유료 실행·독립 채점·종료 기록. `adaptive-dag-runner.mjs`, `adaptive-dag-planner.mjs`, `adaptive-dag-execution.mjs`, `dag-runner.mjs`, CLI entrypoints는 root만 편집한다.
- 기존 `d067_review` → 공개 실패·검사: `benchmarks/e2e-swe/public-checks/` 안 새 assertion/description 검사 및 필요한 공개 registry/runner 연결, 관련 집중 테스트, `D071_PUBLIC_CHECKS.md`. 기존 후보는 읽기 전용이며 수동 수정하지 않는다. 원래85개 검사와 추가8개 기준을 버전으로 구분하고 API/Docker 실행은 root에 맡긴다.
- 기존 `d067_budget` → 수리 담당 연결: 새 `adaptive-causal-repair.mjs`와 계약·집중 테스트, 필요한 기존 repair v2/scope/projection 모듈. producer→IR→renderer 후보·읽기 범위·반복 실패 이력 연결을 구현하고 root에 명시 API를 전달한다. 소유 기존 파일은 변경 전 D071 snapshot을 보존한다. `D071_REPAIR.md`를 기록한다.
- 기존 `d067_runner` → 모델·노력도 선택: 새 `adaptive-profile-selection.mjs`와 문서 질문/후보 계약·집중 테스트, `D071_PROFILES.md`. 실제 지원 model/effort를 공식 문서·CLI 근거로 조사하고 typed choice→프로필을 만든다. 가격·지원·계정 검증을 구분한다. runner/planner/execution은 제안 patch 위치만 root에 전달한다.
- 기존 `d068_failure` → 측정: 새 D071 분석 helper와 `D071_MEASUREMENT.md`. 각 실행·판단·profile 선택·수리·검사·준비/캐시·별도 모니터를 구분한다. 원시 결과 읽기만 하며 후보/숨김 검사·장부·provider를 조작하지 않는다.
- 기존 `d067_skills` → 단일 스킬 관리: `skills/jev-decision-records/`, `docs/skills/MAINTENANCE.md`, `D071_SKILLS.md`. 요청·후보·실제 모델/effort·원인 연결·공개 실패 경계를 갱신한다. 전역 설치 및 유료 호출 없음.
- `d071_transport` → 수리 읽기 연결: `src/orchestration/artifact-transport.mjs`, `bin/artifact-worker-mcp.mjs`, 해당 집중 테스트 및 `D071_TRANSPORT.md`. 실패 round의 해시로 고정된 추가 causal 파일을 읽기 전용 overlay로 제공한다. 기존 stage 파일·쓰기 권한을 확대하지 않는다. root가 신뢰할 snapshot 경로/sha256를 구성하며 작업자가 경로나 hash를 변경할 수 없다.
- `d071_preflight` → 공개 gate 사전 검증: `scripts/audit-dag-public-checks.mjs`, `src/benchmark/dag-runner.mjs`의 공개 audit/preflight, 새 v4 audit helper와 집중 테스트 및 `D071_PREFLIGHT.md`. 이 두 파일은 root에서 해당 역할로 소유권을 이전한다. 기존 v3 정상/결함 검증을 유지하고 opt-in v4의93개 실행·고정 증거를 검증한다. 실제 Docker controls/네트워크 확인은 root가 실행한다.
- 독립 검토 담당: 별도 D071 리뷰 문서·오프라인 감사 결과만 소유한다. 구현 담당과 분리하고 최종 source pin·계약·실행 결과를 검토한다. root가 구현 안정 후 배정한다.
- `d071_transport`의 후속 역할 → 새 `jev-token-admission-v3.mjs`와 v3 계약·집중 테스트. v1/v2를 보존하고 profiles 단계와 causal repair 크기 한도를 명시 연결한다. 유료 호출 없음.
- `d067_review`의 후속 역할 → `preserved-artifact-repair-runner.mjs`, 해당 CLI와 집중 테스트. D070의 보존 후보를 새 v4 공개 gate에서 검사하고 causal 수리를 실행할 준비를 한다. 실제 실행은 root. 공개 검사 구현 담당이므로 최종 독립 검토 역할은 맡지 않는다.
- `d067_budget`의 통합 역할 → `adaptive-dag-execution.mjs`를 root에서 인계받아 causal history·검증된 read overlay·round 전 프로필 선택 callback을 연결하고 집중 검증한다. Root는 runner·planner·manifest 연결에 집중한다.
- `d071_preflight`의 후속 역할 → 새 causal 판단 입력 압축 모듈·집중 테스트. 원인·요구·실패 증거를 보존하면서 반복된 문장·객체를 사전/참조로 연결해 24,000 wire-byte 수리 guard를 준수한다. `adaptive-causal-repair.mjs` 직접 편집은 담당과 조율한다.
- `d071_transport`의 최종 통합 검사 → 새 `test/d071-runner-integration.test.mjs`에서 v7 manifest·실제 CLI model/effort 인자·영수증·예외·profile stage 연결을 무과금 어댑터로 검증한다. 생산 runner 수정은 root에 요청한다.

## 공통 규칙

영어 질문을 사전에 문서화하고 그대로 사용한다. hidden grader 내용은 질문·작업자·공개 수리에 전달하지 않는다. 과거 run/후보/계약을 덮어쓰지 않는다. 새 실행 디렉터리만 사용하며 기존 무상한 장부의 ID·정산·누적 사용량은 유지한다. API 키나 인증 헤더를 출력하지 않는다. 불확실 POST는 자동 재전송하지 않는다.

모델·effort는 구현에 필요한 실제 후보만 허용하고 반환된 프로필이 CLI 인자로 전달됐는지 확인한다. 지원하지 않거나 실제 실행 모델이 다른 경우 명시 실패/미검증으로 남기고 조용한 대체를 금지한다. 비용은 공식 환산과 실제 월정액 청구 배분 미상을 구분한다.

각 담당은 역할 문서에 목적·규칙·검증 명령·실패·미완료·다음 행동을 기록한다. 문맥 한계가 오면 안전한 경계에서 handoff를 작성하고 쓰기를 멈춘다. root는 압축 후 이 계약과 최신 STATE로 방향을 복원한다. 파일 소유권 변경은 서로 알린 뒤 진행한다.
