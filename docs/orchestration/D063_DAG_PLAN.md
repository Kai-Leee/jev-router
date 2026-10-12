# D063 — Jev 작업 분해·산출물 DAG·임계 경로 개발 계획

2026-10-10. 사용자 요청: 사이드 설계 진입점과 연결 문서를 검토하고 현재 개발 계획에 반영한다.
상태: **설계 검토와 개발 계획 반영 완료. 아래 새 DAG 런타임·질문 계약·제품 검사 연결은 미구현.**
정본 연결: [사이드 설계](jev-dag-design/README.md), [상세 질문 초안](jev-dag-design/ARCHITECTURE.md), [준비·역할](jev-dag-design/PREPARATION_AND_ROLES.md), [실험 제안](jev-dag-design/RESEARCH.md), [D062 실제 실패](D062_LIVE_PLAN.md).
사이드 문서는 당시 전달 실패까지 포함한 고정 근거로 보존한다. 이번 사용자 요청으로 메인이 실제 읽고 아래 범위를 반영했다. 당시 기록을 소급 수정하지 않는다.

## 1. 유지할 목표와 채택 범위

목표는 같은 품질 기준을 충족하는 **개발 완료까지의 전체 시간**을 줄이는 것이다. Jev 호출 속도, 많은 작업자, 작은 입력만으로 개선을 판정하지 않는다.

이번 개발 방향에 반영한다:

- 목표 분해 트리, 검증 산출물 의존 DAG, 파일/자원 충돌 관계를 분리한다. task/worker/slot도 별도 ID와 개수다.
- Jev는 문서의 고정 영어 질문으로 분할 후보·모호한 관계·담당자·프로필·수리 행동을 고른다. 코드는 용량·보존·순환·준비 상태·임계 경로·자원 예약을 계산한다.
- 용량을 지킬 수 있는 후보만 제시하고 선택마다 예약을 갱신한다. 결과를 임의 절삭하지 않는다.
- 후속 실행은 작업자 종료가 아니라 필요한 **검증된 산출물 버전**에 연결한다. 지역 검사와 통합 검사를 분리한다.
- 기존 client/예산/계측을 재사용하되 새로운 opt-in 계획·실행 경로로 개발한다. 과거 질문·실험·소스는 보존한다.
- 동일 실행기에 Claude/규칙/Jev 판단기를 연결하는 비교를 준비해 구조 변화와 Jev 효과를 구분한다.

상세 알고리즘과 실험 파라미터는 아래 제안이다. D061 최대 작업자30, 실행 동시성 기본2, 누적10M 입력 장부와 자동 유료 재시도0은 유지한다. task 수/검증 노드 수에 작업자30 상한을 그대로 적용하지 않는다. 장부 잔여는 다음 실행 직전 다시 읽으며 D062 스냅샷을 현재 잔액으로 가정하지 않는다.
과거 사용자 요구로 루트 count1은 제외되어 있다. 사이드 초안의 `keep_scope`를 루트1명 선택으로 몰래 복원하지 않는다. 재귀 leaf의 유지와 루트 작업자 수는 별개 계약으로 명시하고 정책을 동결한다.

## 2. 현재 코드와 제안의 차이

| 영역 | 현재 확인한 코드 | 새 계획에서 필요한 변경 |
|---|---|---|
| 배정 | `sequential-allocation-v3.mjs`: 개수 선택 후 항목별 include/exclude, 전체 합계 사후 거부 | 항목/불가분 묶음→가용 담당자 선택, 매 선택 전후 용량 예약 및 잔여 배정 가능성 검사 |
| 작업/실행자 | `sequential-envelope-v3.mjs`: 배정 task 수를2..30으로 검사 | task graph와 worker pool 분리; 요약·검증 노드가 작업자 생성으로 연결되지 않도록 구분 |
| 관계 | allocator와 envelope 모두 이전 공유 writer를 `depends_on/after`에 합침 | 산출물 의미 간선과 충돌 lease 별도 저장; 기존 간선을 일괄 삭제하지 않고 근거/종류를 재구성 |
| 후속 해제 | `worker-verification-gate.mjs`: 한 작업의 전체 test_ids와 단일 revision을 검증 | 입력/출력 artifact revision 벡터, 필요한 검사 집합과 검증 노드; 소비 버전별 해제 |
| 검사 | `public-check-registry.mjs`: runner_ref 문자열·test mapping 검사 및 callback 결과 확인 | 실제 argv/cwd/환경/파서·의존 산출물 연결과 정상/결함 대조; 문자열 존재만으로 준비 완료 처리 금지 |
| 실행 전 차단 | `bounded-verified-workflow-v3.mjs`: public mapping 누락이면 계획 전 차단 | 제품 실행 차단 유지. planning-only/shadow 모드는 제품 실행 불가임을 명시 |
| 시간/관측 | 기존 계획/실행 usage·events 기반 | 준비·검증·통합 span, 배타적 대기 사유, 추정 CP와 실측 완료시간을 별도 표시 |

코드는 파일 본문과 호출 연결을 읽어 확인했다. 이번에는 새 런타임 테스트를 실행하거나 위 제안의 작동을 입증하지 않았다. D062의13회 API 성공과 배정 실패는 과거 보관 결과이며 이번 재측정이 아니다.

## 3. 구현 전에 보완할 설계 조건

### 용량과 불가분 묶음

`ceil(1.25*N/worker_count)`는 기존 개수 상한이며 시간 균형이나 최적 분할의 근거가 아니다. 초기 비교에서 정책을 고정하고 시간 가중치는 별도 요인으로 둔다.
단순 잔여 합계 검사만으로 불가분 묶음의 배정 가능성을 증명할 수 없다. 예: 남은 용량[3,3], 묶음 크기[2,2,2]는 합계6이지만 배정 불가능하다.
소규모 fixture는 정확 탐색으로 검증한다. 큰 입력에서 탐색 한도에 걸리면 `feasibility_unknown`으로 남기고 valid로 승인하지 않는다. 과도한 보수성으로 거절한 후보 수도 기록한다.
후보 하나이면 로컬 강제 선택으로 기록하고 Jev 판단으로 세지 않는다. 후보0개는 경계/용량 수정 요청이다. `revise_boundary`가 실제 유효 행동일 때만 선택지로 제공하며 API 최소 후보 수를 맞추려 무의미한 선택지를 만들지 않는다.
병렬 질문은 예약을 공유하지 않는 블록만 묶거나 결합 용량 검증을 거친다. 앞 답이 같은 요청의 뒤 질문 state를 갱신한다고 가정하지 않는다.

### 산출물·검사·관계

계약에 최소 `goal_revision`, `graph_revision`, `task_id`, `parent_id`, requirement refs, input/output artifact IDs, producer, revision, check IDs, read/write scopes, profile allowlist, duration basis를 둔다.
여러 산출물을 검사할 때는 하나의 문자열 hash만으로 무엇이 검증됐는지 생략하지 않는다. check evidence key는 검사 버전+입력 artifact revision 벡터+환경을 포함한다.
검사 중 입력/출력이 변하면 증거를 폐기하고 영향받는 소비자를 다시 평가한다. 이미 실행 중인 작업의 입력 snapshot은 고정하며 결과 통합 전에 유효성을 재검사한다.
통합 검사는 별도 verification node로 둔다. 선행의 지역 통과에 아직 없는 후속 산출물을 요구하는 교착을 금지한다. 최종 목표 terminal은 필요한 통합/독립 검사까지 포함한다.
`unknown`은 독립이 아니다. 근거가 부족한 관계에 걸린 dispatch만 막고, 관계 검토가 끝난 다른 가지까지 무조건 전역 정지시키지 않는다. 모든 쌍을 검사하지 않는 필터의 누락 감사도 필요하다.
공유 파일은 의미적 간선으로 자동 치환하지 않는다. 그러나 write/write뿐 아니라 read/write, 공유 스키마·환경 충돌도 검사한다. 격리 snapshot/단일 소유자/lease/명시 통합 중 어느 방식을 썼는지 기록한다.

### 임계 경로와 스케줄

사이드 문서의 ES/EF/rank 계산을 사용하되 **추정 시간 모델의 의존성 하한**으로 표시한다. 자원 제약·모델별 실행시간·실패가 포함된 최적해라고 부르지 않는다.
준비·검사·통합 시간을 노드 시간에 포함할지 별도 노드로 둘지 manifest에 하나로 정하고 중복 합산하지 않는다. 부모 요약 노드도 실행 시간에 더하지 않는다.
unknown duration은0이 아니다. 알려진 조건만으로 계산한 값은 부분/조건부로 표시하고, 첫 구현의 우선순위는 unknown 포함 시 결정론적 FIFO(task ID tie-break)로 대체해 정책을 기록한다. 예측값이 있는 경우 긴 잔여 경로 우선은 비교할 휴리스틱이다.
`ready`와 슬롯/lease/예산까지 확보한 `dispatchable`을 분리한다. 각 가지의 필요한 검증이 끝나면 해제하며 전역 level barrier를 도입하지 않는다.
현재 `recursive-execution.mjs`도 `Promise.race`로 완료된 작업의 후속을 해제한다. 전역 barrier 부재는 유지할 조건이며 새로 얻은 성과가 아니다. 현재 완료된 모든 작업의 경로를 읽기 범위에 넣는 보수적 충돌 검사와 거친 작업 경계가 만드는 대기는 별도 측정한다. 선언 read_scope와 실제 허용 범위, 경로 정규화/alias 처리를 함께 검증한다.
재시작에는 durable event/attempt/reservation ID를 사용한다. 로컬 event 중복 제거가 외부 유료 실행 exactly-once를 보장하지 않으므로 결과 불확실 요청은 정산/확인 전 재전송하지 않는다.

## 4. 구현 묶음과 순서

아래 파일은 **예정 경로**이며 이번에 생성·구현하지 않는다. 실제 개발 시작 시 역할 소유권을 고정한다.

| 묶음·담당 | 산출물/연결 지점 | 선행 조건 | 통과 조건 |
|---|---|---|---|
| P0 계약·검증 준비 | artifact/task/edge/check/event schema와 공통 fixture; 공개 검사 registry와 실제 실행 명령 | 목표/원문 명세 고정 | 요구사항·85 테스트 설명의 mapping audit, 지역/통합 분류, 정상·결함·stale 대조. 설명85개를 억지로 명령85개에1:1매핑하지 않음 |
| P1 판단 어댑터 | 예정 `contracts/dag-routing.v1.json`, `src/orchestration/dag-decision-adapter.mjs` | P0 schema/fixture | 문서 질문→request→handler 추적, 용량·불가분 묶음·빈 후보·단일 후보·unknown 재생 |
| P2 그래프·스케줄러 | 예정 `src/orchestration/artifact-dag.mjs`, `dag-scheduler.mjs` | P0 schema/fixture | 순환·dangling·unknown 차단, CP 손계산, 가짜 시계 병렬/lease/후속 해제 |
| P3 검증 연결 | 예정 `src/orchestration/artifact-verification-gate.mjs`; 기존 registry/worker gate는 재사용 가능 부분만 연결 | P0 실제 검사 계약 | revision 벡터·지역/통합 준비·검증기 오류·소비 무효화·제품 실패 구분 |
| P4 관측 | 예정 DAG event projector; 기존 dashboard metrics/app 연결 | P0 event fixture | 계획/의존/자원/검증/수리 대기 원인, 추정/실측 분리, 영수증 중복 방지 |
| P5 통합·독립 검토 | 새 opt-in runner와 사전 등록 비교 manifest | P1/P2/P3 및 P4 필수 집계 | 오프라인 반례→원본 trace 감사→새 질문 mock→shadow→동결된 실제 비교 |

P0의 최소 공통 계약과 fixture가 고정되면 P1/P2/P3/P4 개발을 병렬화할 수 있다. 전체 제품 실행은 P0의 실제 검사 mapping과 나머지 gate가 모두 통과할 때까지 차단한다. 준비 담당이 기대값을 만들고 구현 작업자가 실패를 피하려 그 기대값을 바꾸는 역할 혼합을 허용하지 않는다.
현재 D062에서 사용한85 테스트 설명은 실행 mapping이 미완료다. 이 계획 반영을 완료했다는 말은 그 mapping을 완료했다는 뜻이 아니다.

## 5. 질문과 지시문 위치

현재 읽을 영어 초안 정본: [ARCHITECTURE §4.2](jev-dag-design/ARCHITECTURE.md#42-고정-영어-질문과-선택값--처리-함수).
후속 운영 정본 예정: `docs/orchestration/contracts/dag-routing.v1.json`. 기존 `document-contracts.mjs`는 고정 enum/handler 검증을 하므로 새 파일 링크만으로 연결되지 않는다. P1에서 loader와 등록 handler를 함께 확장하고 기존 계약 테스트를 유지한다.
`dag.split.v1`, `dag.relation.v1`, `dag.owner.v1`, `dag.profile.v1`, `dag.failure.v1`을 등록한다. 관계 방향과 답에 의존하는 근거 선택은 별도 단계다. 코드로 확정 가능한 관계에는 호출하지 않는다.
원문은 한번 전달하고 refs/hash를 붙인다. 원격 Jev가 로컬 문서 경로를 읽는다고 가정하지 않는다. worker에게도 필요한 내용·경로·버전을 materialize한다.
Codex는 AGENTS.md, Claude는 CLAUDE.md의 AGENTS import와 이 계획 링크를 사용한다. 격리 worker에는 controller가 명시 전달한다.

## 6. 검증·실험 계획

먼저 [사이드 반례12종](jev-dag-design/RESEARCH.md#5-검증과-비교-설계)에 다음을 추가한다: 불가분 packing 반례[3,3]/[2,2,2], read/write 충돌, 여러 artifact 중 하나만 stale, unknown-duration 우선순위, 작업30개 초과/작업자30이하, 서로 다른 run event ID 충돌, 불확실 외부 실행 이후 재시작.
D062 응답은 기존 질문의 실패 재현에만 쓴다. 새 owner 질문의 실제 응답인 것처럼 재해석하지 않는다. 새 질문은 mock 또는 별도 live condition으로 구분한다.

첫 비교 제안: A Claude / B 규칙 / C Jev 계획, 동일 DAG executor·후보 입력·public checks·작업자 프로필·동시성·환경·예산·독립 grader. 순차 owner 선택을 한다면 동일 정보/호출 단계도 맞추고, Claude 일괄 자유계획은 별도 native 참고 조건으로 분리한다. 후보 준비 모델 비용을 Jev 밖으로 숨기지 않는다.
작업자 profile routing 효과는 고정 profile 비교 이후 별도 요인으로 둔다. 반복 수·캐시 정책·조건 순서·한도는 실제 실행 전 manifest에 동결한다. 과거20회 실험이나 D062의120회 phase ceiling을 새 실험 승인/횟수로 자동 복사하지 않는다.

주 지표: 제품 성공 trial/사전 등록 trial, 유효 계획/계획 시도, 준비 시작→독립 성공까지 wall time. 실패 trial은 중단 시간·사유를 보존하고 완료시간/속도비는 null이다. 성공 쌍 속도비만 보고하면 선택 편향이 생기므로 전체 실패 분포도 함께 제시한다.
보조 지표: 준비/판단/검증/통합/수리 시간·토큰·환산 비용, 의존/파일/슬롯/검증 대기, 후보 필터 누락과 관계 방향 정확도, 실행 가능한 병렬 폭과 slot 이용률, 실제 생략한 판단 ID. CP 추정값과 실제 완료시간은 별도 열이다.

## 7. 이번 완료 범위·다음 행동

메인이 사이드 연결 문서와 현재 allocator/envelope/workflow/gate/registry를 읽고 계획에 반영했다. [독립 검토](../agents/D063_REVIEW.md)와 [결정 기록](../decisions/D063.md)을 연결한다.
다음 구현 시작점은 P0: 공개 요구사항→검사→산출물 계약을 먼저 고정하고 정상/결함 fixture를 준비하는 것이다. 이후 공통 계약을 공유해 P1/P2/P3/P4를 분업한다.
현재 새 DAG 구현·실제 Jev/Claude 요청·성능 측정은 없고 효율 개선은 미확인이다. 문서 변경은 미커밋이며 원본 Personal OS, 기존 실험·장부·제품 소스·실행 프로세스는 변경하지 않았다.
