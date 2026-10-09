# Jev Router 개발 에이전트 운영

시작: 2026-10-08 (Asia/Seoul). 사용자 지시 D-012에 따른 개발 분업이다.
제품이 Jev 판단마다 세션을 전환하는 H-001과 이번 개발 에이전트의 인계는 구분한다.

## 변하지 않는 목적

Jev Router는 메인 에이전트의 모델 선택과 반복 판단을 지원한다. 영어 질문과 자동 호출을 기본으로
설계하며, 판단 불가를 보존한다. 품질·전체 시간·비용 개선은 실측 전까지 목표다.
첫 구현의 완료 조건은 평가 조사에서 제안한 P0와 기본 분류/확률 지표를 **오프라인에서 재계산 가능한
코드·CLI·fixture·검증 기록**으로 만드는 것이었으며 완료했다. 후속 조사 범위는 아래 별도 항목을 따른다.

## 최신 작업: D-021 공식 가격과 실패 분석

[역할 계약](PRICING_FAILURE_UPDATE.md)에 따라 pricing/실패 감사와 main UI·독립 채점을 분리했다.
[가격 상태](pricing-STATUS.md), [최신 STATE](STATE.md), [실패 분석](../research/D020_FAILURE_ANALYSIS.md)을 먼저 읽는다. 아래 승인 대기/실행 전 설명은 과거 단계다.

## 역할과 소유권

### 현재 구현: D-019 paired development와 Opus 모니터

[공유 역할/계약](PAIRED_RUNTIME.md)에 따라 gate/runner/metrics/SSE를 분업했고 모두 쓰기를 종료했다.
main은 [독립 Opus 모니터](OPUS_BENCHMARK_MONITOR.md), paired CLI, 실제 준비·통합 검증을 맡았다.
[독립 검토](paired-review-STATUS.md)의4건을 수정했다. 호출 횟수 상한은 사용자 지시로 해제됐으며
실제 실행은 금액 지출 승인에 대한 자동 심사 차단으로 대기다. 이전 한도 질문은 다시 묻지 않는다.

### 이전 조사: 실시간 연동과 진행 실패 확인

D-018: [전송·화면](REALTIME_TRANSPORT_RESEARCH.md), [관측 도구](REALTIME_TOOLS_RESEARCH.md),
[현재 실패 감사](REALTIME_FAILURE_AUDIT.md) 역할을 먼저 문서화하고 기존 담당자를 재배정했다.
각 담당은 `docs/research/`의 지정 문서만 수정한다. main은 [통합 조사](../REALTIME_FAILURE_RESEARCH.md),
공유 기록과 읽기 전용 상태 검증을 맡는다. 제품 코드·실행 중 서비스·유료 모델은 이번에 변경/실행하지 않는다.

### 이전 구현: 호출·토큰·비용 대시보드

D-017에 따라 [research](DASHBOARD_RESEARCH.md), [metrics](DASHBOARD_METRICS.md),
[UI](DASHBOARD_UI.md), [review](DASHBOARD_REVIEW.md) 역할을 먼저 기록했다.
조사/순수 집계/화면/독립 검토를 나누고 main은 reader/server, 실행기 스트림·전송 경계,
회귀·실제 브라우저 검사와 공유 문서를 소유한다. 모두 구현·검토 후 쓰기를 종료했다.
결과·다음 단계는 [현재 상태](STATE.md), [사용법](../DASHBOARD.md)을 따른다.

### 이전 구현: 공개 벤치마크와 Personal OS 병행 준비

D-014에 따라 [bootstrap](BENCHMARK_BOOTSTRAP.md), [Personal OS benchmark](PERSONAL_OS_BENCHMARK.md),
[decision gate](BENCHMARK_DECISION_GATE.md) 역할을 문서화한 후 생성했다.
main은 clone/공유 실행 환경, `src/benchmark/`의 gate 외 transport와 Docker/Claude runner,
`bin/benchmark*.mjs`, 통합 테스트·문서·검증을 소유한다. 각 agent는 역할 문서의 파일만 수정한다.
유료 인증/상한 답변과 무관한 clone·평가기 검증·코드 준비는 계속한다.

### 후속 조사: 목표·명세만으로 실제 구현 실험

오프라인 평가 구현 이후 사용자는 Opus 5.5 메인 + Jev 판단 구성을 실제로 시험할 기존 방법을
조사하고, 맞는 방법이 없으면 Personal OS를 목표·명세만으로 재구현하는 방안을 요청했다.
이번 완료 조건은 기존 평가 환경과 실제 실행 가능성의 근거, 역할 한계, 재현 가능한 실험 설계다.
유료 장기 실행이나 실제 Personal OS 수정은 아직 수행하지 않는다.

- [live-benchmark](LIVE_BENCHMARK_RESEARCH.md): 기존 harness/benchmark 조사.
- [personal-os-spec](PERSONAL_OS_SPEC_RESEARCH.md): 실제 제품 문서의 읽기 전용 요구사항 추출.
- main: Claude/Jev 연결·판단 강제 범위, 로컬 준비 상태, 통합 실험 설계·기록.

### 완료한 오프라인 평가 구현

- [contract](CONTRACT.md): 입력 검증과 계약 설명.
- [metrics](METRICS.md): 지표 집계와 손계산 검증.
- [cli](CLI.md): 오프라인 명령, 예제, 사용 문서.
- [review](REVIEW.md): 독립 검토와 실패 사례 재현. 구현이 준비되면 생성한다.
- main: 공통 인터페이스, 통합 entrypoint/package scripts, 전체 검사, 상태·결정·사용자 보고.

각 에이전트는 자기 역할 문서를 읽고 시작한다. 공유 checkout을 사용하므로 담당 파일 외 변경은
메인과 조율한다. 다른 에이전트 변경을 되돌리지 않는다. 원격 push, 키 읽기, 실제 모델 요청은 이번 업무에 없다.
공통 형식은 [구현 계약](../EVALUATION_CONTRACT.md)이다. 계약 변경 제안은 메인에게 먼저 알린다.

## 기록과 완료

각 담당자는 `docs/agents/<role>-STATUS.md`에 목적, 진행 상태, 수정 파일, 실제 검증 명령/결과,
남은 문제, 다음 행동을 기록한다. 합성 fixture 통과와 실제 모델 성능을 구분한다.
완료 보고에 테스트 실패·수정 사항·미검증 범위를 포함한다. main이 전체 검증 전 완료로 승격하지 않는다.

## 문맥 한계와 인계

정확한 context 잔량 계측 API가 없으므로 퍼센트나 자동 감지를 구현했다고 하지 않는다.
큰 작업 단위 종료 때 상태를 갱신하고, 압축/한계 징후 또는 기억 의존이 커지면 작업을 안전한 경계에서 멈춘다.

1. 담당 상태와 현재 파일을 먼저 기록한다. 진행 중 명령·파일 소유권·불확실한 결과를 남긴다.
2. `handoff` 스킬에 따라 OS 임시 디렉터리에 역할·정본 문서 경로·변경 파일·검증·미완료·첫 행동·
   suggested skills를 담은 인계 문서를 쓴다. 기존 명세를 복사하지 않고 참조한다. 비밀·개인정보는 제외한다.
3. 메인에 인계 경로를 알리고 쓰기를 중지한다. 메인은 기존 담당자가 idle 또는 interrupted임을 확인한 뒤
   새 에이전트를 `fork_turns="none"`으로 생성하고 역할 문서와 인계 파일을 전달한다. 동일 파일의 동시 작성자를 두지 않는다.
4. 후속 담당자는 문서만으로 목표·남은 일·첫 검증을 재진술하고 실제 파일 상태를 확인한 뒤 이어간다.
5. 메인은 세션 압축 후 이 문서, [결정 기록](../DECISIONS.md), [현재 상태](STATE.md)를 다시 읽고
   목표·허용 범위·완료 조건을 대조한다. 이미 합의된 내용을 재질문하지 않는다.

자동 desktop chat 생성/이동이나 스케줄러를 설치하는 기능은 이 운영 규칙에 포함되지 않는다.

## D-025 현재 작업

[역할 계약](D025_REMEASURE.md)에 따라 checkpoint gate, 문서 스킬, main 통합·실험을 분업한다. [문서 스킬](../../skills/jev-decision-records/SKILL.md)을 실제 판단 기록에 적용하고 [D025](../decisions/D025.md)를 문서 담당자가 관리한다. 별도 [독립 스킬 검증](D025_SKILL_REVIEW.md)은 /tmp의 원시 영수증만 사용한다. 과거 미실행/금액 승인 대기 설명은 현재 상태를 뜻하지 않는다.
