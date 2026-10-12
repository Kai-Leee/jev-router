# 작업 분해·의존성·스케줄링 계약

상태: 2026-10-10 설계 제안. 실행 코드나 로드되는 운영 계약이 아니다.
요청·확정 범위는 [진입점](README.md), 외부 근거는 [조사](RESEARCH.md), 사용 준비는 [역할·준비](PREPARATION_AND_ROLES.md)를 따른다.

## 1. 최적화 대상

주목표는 **동일한 품질 기준을 충족하는 실제 개발 완료까지의 경과 시간**이다.
계획·Jev 호출·작업자 시작·검증·통합·수리를 모두 포함한다. 비용과 기존 예산을 함께 관리한다.
작업자 수, 분할 깊이, Jev 응답 속도만으로 효율 개선을 판정하지 않는다.

`task`는 산출물 단위, `worker`는 실행 주체, `slot`은 동시 실행 자원이다.
작업이 여러 개여도 한 작업자가 순차 처리할 수 있고, 최대 작업자 수와 실제 동시성은 다르다.
현재 D061의 최대 작업자 범위를 이 문서가 바꾸지 않는다. 새 구조에서 유지·분할 선택을 어떻게 노출할지는 별도 정책 버전으로 결정한다.

## 2. 세 가지 관계와 하나의 원본

| 표현 | 질문 | 예 | 실행 영향 |
|---|---|---|---|
| 분해 트리 | 어떤 목표의 하위 작업인가? | 클라이언트 생성 → 타입/전송/직렬화 | 책임·요구사항 추적 |
| 선행 산출물 DAG | 무엇이 검증되어야 시작하는가? | 타입 계약 검증 → 직렬화 구현 | 준비 상태·임계 경로 |
| 충돌·자원 제약 | 동시에 실행할 수 있는가? | 같은 파일 쓰기·공용 테스트 환경 | 슬롯·잠금·통합 순서 |

한 task ID에 연결해 중복 설명을 만들지 않는다. 요약 노드는 실제 실행 노드와 구분한다.
부모와 자식의 시간을 함께 더해 이중 계산하지 않는다.

공유 파일 관계는 바로 영구 DAG 간선으로 만들지 않는다. 안정된 계약 추출, 단일 파일 소유자,
격리된 변경 후 통합, 순차 잠금 중 실제 가능한 방법을 표현한다. 파일이 달라도 같은 스키마나
전역 상태를 바꾸면 충돌할 수 있다. 선언한 read/write 범위는 실행 후 diff와 비교한다.

## 3. 최소 입력 계약

원문 요구사항은 준비 단계에서 한 번 정규화하고 원문 위치·해시를 보존한다.
아래는 제안 필드이며 기존 로더가 읽는 형식이라고 주장하지 않는다.

```json
{
  "task_id": "serialize-enum",
  "parent_id": "python-client",
  "requirement_ids": ["REQ-enum"],
  "source_refs": ["spec:enum-section@revision"],
  "inputs": [{"artifact_id": "type-contract", "revision": "r1", "check_ids": ["contract-check"]}],
  "outputs": [{"artifact_id": "enum-serializer", "acceptance_ids": ["enum-boundary-check"]}],
  "read_scope": ["src/types.py"],
  "write_scope": ["src/serialization.py"],
  "dependencies": [{"predecessor_id": "verify-type-contract", "artifact_id": "type-contract", "evidence_ref": "spec:enum-section@revision"}],
  "public_check_ids": ["enum-boundary-check"],
  "eligible_profile_ids": ["profile-from-existing-catalog"],
  "duration": {"basis": "unknown", "estimate_ms": null, "sample_count": 0, "source_refs": []},
  "status": "proposed"
}
```

위 JSON의 ID와 경로는 형식 설명용 예시이며 실제 Jev 계획이나 실행 결과가 아니다.

출력의 경로와 생성 책임자, 입력 산출물의 준비 조건, 검사 실행 명령이 추가로 연결되어야 실행할 수 있다.
`source_refs`는 추적용이다. 원격 Jev가 로컬 경로를 읽는다고 가정하지 않고 필요한 원문 발췌를 실제 state에 넣는다.
작업자도 접근 가능한 문서 내용·정확한 경로·리비전을 받아야 한다. 같은 명세를 여러 필드로 복제하지 않는다.

## 4. Jev 판단 루프

### 4.1 후보 준비

문서·공개 테스트 설명·현재 파일 구조에서 산출물 경계와 요구사항 단위를 추출한다.
초기 후보 작성에 자유문 생성이 필요하면 준비 담당 모델이 수행하며 그 시간·토큰을 계획 비용에 포함한다.
Jev가 자유문을 생성했다고 표시하지 않는다. 후보 경계가 모두 나쁘면 준비 담당에게 근거를 붙여 재작성 요청한다.

명시된 산출물 참조로 확인되는 관계는 코드가 직접 연결한다. 의미 해석이 필요한 관계만 Jev에 보낸다.
후보 쌍은 산출물 참조·모듈 연결·read/write 교차로 좁히되, 이 필터의 누락도 표본 검토한다.
모든 쌍을 무조건 호출하는 방식과 달리 관계 후보 생성 자체의 재현성과 누락률을 기록한다.

### 4.2 고정 영어 질문과 선택값 → 처리 함수

아래 영어 문장이 초안 정본이다. 이 문서 §4.2의 질문 ID로 참조한다.
운영 전 별도 버전의 JSON 계약으로 옮기고 기존 document-contracts 로더와 연결해야 한다.
변수 값과 후보 설명은 채워 넣되 매 판단마다 LLM으로 질문을 다시 쓰지 않는다.

**`dag.split.v1` — choice**

> Choose the candidate decomposition that best preserves all required outcomes and reduces expected end-to-end completion time, including planning, startup, verification, integration, and likely rework. Use only the supplied candidate IDs. Select need_candidate_revision if none has adequate evidence or valid output boundaries.

- `candidate_<id>`: 원문 의무·검사·경계가 연결된 분할 후보 → `validateAndExpandNode(candidateId)`.
- `keep_scope`: 현재 범위 실행 후보가 정책상 허용되고 실행 계약이 갖춰졌을 때만 노출 → `markLeafCandidate()`.
- `need_candidate_revision` → `requestCandidateRevision(evidenceRefs)`.
- 선택된 분할은 요구사항 보존·진전·순환 검사를 통과해야 반영한다. 운영 후보 정책은 실험 manifest에 고정한다.

**`dag.relation.v1` — choice**

> For tasks A and B, determine whether either task must consume a verified artifact produced by the other before it can execute its stated contract. Use the supplied requirement and artifact evidence. A shared file alone is not an artifact dependency. If the evidence cannot establish a relation, select unknown.

- `a_requires_b` → `proposeArtifactEdge(B, A)`.
- `b_requires_a` → `proposeArtifactEdge(A, B)`.
- `no_artifact_dependency` → `recordRelationNoEdge()`; 자원 충돌 검사는 계속한다.
- `both_require_each_other` → `requestBoundaryRevision()`; 순환 간선을 그대로 실행하지 않는다.
- `unknown` → `requestDependencyEvidence()`; 독립으로 승격하지 않는다.

근거 선택은 입력에 있는 `evidence_<id>`들 중 별도 choice로 받는다. 이미 유일하게 연결된 명시 근거는 코드가 사용한다.
간선 방향 응답만으로 근거가 있다고 주장하지 않는다. 관계 질문과 그 답에 의존하는 근거 질문을 같은 요청 안의 순차 실행처럼 취급하지 않는다.

**`dag.owner.v1` — choice**

> Select one eligible owner for this obligation or indivisible obligation bundle. Consider required artifacts, write ownership, current assigned work, and integration cost. Every listed owner satisfies the current hard capacity checks. Select revise_boundary if assigning this bundle would require an unsupported interface or an unresolved dependency.

- `owner_<id>` → `reserveAndAssign(bundle, ownerId)`.
- `revise_boundary` → `requestCandidateRevision(bundleEvidence)`.

**`dag.profile.v1` — choice**

> Choose an available model and effort profile for this executable task, using observed capability, latency, usage, and tool compatibility. Preserve the required quality bar and optimize total completion time, including expected retries and integration. Select need_profile_evidence when no supplied profile has sufficient support.

- `profile_<id>` → `bindProfile(profileId)`.
- `need_profile_evidence` → 준비 상태 유지 및 프로필 근거 보완. 카탈로그 명칭만으로 가용성을 확정하지 않는다.

**`dag.failure.v1` — choice**

> Classify the observed failure using the provided command result, artifact revision, and public check evidence. Select the next authorized repair action. Do not treat a missing check, an unknown request outcome, or a claimed completion as a successful verification.

- `repair_local` → 같은 책임 범위의 새 수리 시도.
- `repair_contract` → 영향받는 산출물 계약·미실행 후속 계획 갱신.
- `revise_dependency` → 근거 있는 간선 재검토.
- `repair_verifier` → 실행기를 검토하며 제품 실패와 검증기 실패를 구분.
- `need_evidence` → 부족한 근거 수집. 추가 호출은 사건과 입력 변경 여부로 결정한다.

선택값에는 실제 등록된 handler만 연결한다. 조건 위반이면 invalid로 남기고 원 응답과 이유를 보존한다.
Jev 판단을 메인이 반복 재판단하는 단계를 기본으로 추가하지 않는다. 최종 제품 성공은 독립 검증기로 결정한다.

### 4.3 D062 용량 위반을 피하는 선택 구조

항목별 포함/제외 응답을 한 번에 모으면 각 답이 형식상 유효해도 전체 용량은 위반할 수 있다.
제안은 **현재 용량 내 후보 중 소유자 하나를 선택 → 예약을 갱신 → 다음 선택**이다.

1. 분리 불가능한 산출물 묶음은 먼저 확인한다. 용량에 맞추기 위해 무조건 쪼개지 않는다.
2. 후보별 배정 후 남은 항목을 다른 작업자 용량에 담을 수 있는지 검사한다.
3. 제한을 넘는 소유자는 choice 후보에서 제외한다. 남은 최소 배정 조건도 확인한다.
4. Jev 선택을 받아 원자적으로 용량을 예약한다. 예약 이전 state를 재사용하지 않는다.
5. 후보가 없으면 용량/경계가 불가능한 상태로 남긴다. 선택 결과를 상위 몇 개로 몰래 잘라내지 않는다.

단순 개수만 제한하면 난이도·시간 균형은 보장되지 않는다. 추정 소요 가중치는 이력 확보 후 비교한다.
여러 독립 항목을 묶어 호출할 때는 용량 예약을 사전에 분리하거나 결합 결과를 검증한다.
모든 질문이 같은 state를 평가하므로 한 요청 안에서 앞 답이 뒤 답의 남은 용량을 갱신한다고 가정하지 않는다.
순차 선택은 호출 수를 늘릴 수 있다. 독립된 후보 블록만 묶는 방식을 비교하되 품질·총 계획비용을 함께 측정한다.

### 4.4 재귀 분할과 재계획

분할 후 자식들의 담당 의무 합집합은 부모와 같아야 하며 단일 책임 의무는 중복되지 않아야 한다.
검사는 여러 자식을 검증할 수 있지만 테스트 명세의 정본은 하나다.
부모의 모든 간선을 모든 자식에 복제하지 않고 실제 소비·생산 산출물에 따라 다시 연결한다.
반복 state/후보 해시, 진전 없는 분할, 비어 있는 자식, 실행 계약 없는 leaf를 탐지한다.

재판단은 검증 실패·새 요구·새 산출물 의존성·관측 소요의 의미 있는 변화에서만 수행한다.
매 heartbeat나 후속 작업 하나가 끝날 때마다 Jev를 호출하지 않는다.
실행 중 task의 입력과 소유권은 고정하고, 미실행 영향 부분만 새 graph revision으로 재계획한다.
깊이·노드·호출·소요 한계와 시간 추정 갱신 조건은 실험마다 명시하며 이 문서에서 임의 확정하지 않는다.

## 5. DAG 검증과 이벤트 기반 실행

실행 전 검사: ID 유일성, 요구사항 보존, 존재하는 산출물/검사 참조, 용량, 프로필, 자기 간선,
순환, 미해결 입력, 실행 가능한 검사 계약, 파일 소유권과 통합 경로.
순환이 나오면 관련 경로와 근거를 보여준다. 순환 제거를 위해 임의 간선을 버리지 않는다.

`ready`는 필요한 선행 산출물의 정확한 리비전이 검증됐고 지역 검사 실행 준비가 된 상태다.
`dispatchable`은 ready에 슬롯·파일 잠금·예산·도구 가용성까지 만족한 상태다.
준비 상태와 실제 시작을 분리해야 “의존성 대기”와 “자원 대기”를 구분할 수 있다.

```text
on verified_artifact | worker_exit | resource_release | graph_revision:
    accept event only once using event_id and attempt_id
    invalidate checks whose input artifact revision changed
    ready = tasks with all required artifacts verified
    eligible = ready filtered by valid profile, checks and resource feasibility
    for task in longest_remaining_path_priority(eligible):
        atomically reserve slots, scope leases and budget
        dispatch the recorded task contract and artifact revisions
    on worker result:
        collect diff and immutable outputs
        execute registered public checks on those exact revisions
        publish verified artifacts only after required checks pass
```

이 코드는 설명용 의사코드다. 스케줄러 전체를 구현한 것이 아니다.
같은 층의 다른 작업을 기다리는 전역 barrier는 두지 않는다. 필요한 선행만 충족하면 다음을 실행한다.
선행 작업 종료와 산출물 검증 성공을 구분한다. 검사가 실패하면 그 결과를 소비하는 후속은 열지 않는다.
정리·로그 수집 같은 작업은 성공 의존과 구분된 별도 종료 이벤트로 실행할 수 있다.

## 6. 시간 추정과 임계 경로

각 작업 소요 `d(v)`는 추정값이다. 작업 유형, 모델·노력도, 입력 규모, 환경, 측정 경계, 표본 수를 보관한다.
기록이 없으면 unknown을 유지하거나 명시한 임시 추정으로 시나리오를 계산한다. 임시값을 실측으로 저장하지 않는다.
작업자 생성·컨텍스트 전달·지역 검사를 작업 시간에 포함했다면 별도 노드로 또 더하지 않는다.
통합·전체 검사·필수 초기 준비도 완료 시간 산정에 포함한다.

고정된 DAG, 동일한 시간 추정, 자원·전달 비용을 제외한 기본 계산:

```text
ES(v) = max(EF(u) for each predecessor u), or 0 for a root
EF(v) = ES(v) + d(v)
CP = max(EF(v) for each terminal node v)
rank(v) = d(v) + max(rank(s) for each successor s), or d(v) for a leaf
```

`CP`는 그 추정 시간 모델에서 의존성만 고려한 완료 시간 하한이다. 실세계 완료 시간의 보장값은 아니다.
순방향·역방향 계산으로 여유 시간을 구할 수 있지만 자원 경쟁으로 바뀐 지연과 구분한다.
unknown 소요가 경로에 있으면 정확한 숫자 대신 미확인 구간과 조건부 범위를 표시한다.

실제 배정은 준비된 작업 중 남은 경로가 긴 작업을 우선하고, 가능한 실행자별 대기·전달·시작·수행 시간을 합친 예상 종료가 빠른 후보를 검토한다.
이는 휴리스틱이다. 이질적 모델 품질, 실패, 공유 파일 통합까지 포함하는 최적해를 보장하지 않는다.
모델별 시간 정보가 없을 때는 고정 프로필로 스케줄링 효과부터 분리해서 비교한다.

## 7. 단순한 화면과 추적

기본 화면은 실행 가능 / 실행 중 / 대기 / 실패·근거 부족으로 보여준다.
대기 이유에는 필요한 artifact와 담당 task, 슬롯, 파일 잠금, 검사 준비 중 무엇이 막는지 표시한다.
“예상 임계 경로”와 “실제로 관측된 지연 원인”을 별도로 둔다. 전체 DAG는 펼쳐서 볼 수 있다.

모든 이벤트에 run_id, graph_revision, task_id, attempt_id, decision_id, 시간과 입력·출력 해시를 연결한다.
질문 원문·state·응답·후속 handler·검사 결과·사용량은 하나의 결정에서 추적할 수 있어야 한다.
비밀을 제외한 원본은 비공개 실행 기록에 보존하고 공개 문서에는 참조만 남긴다.
토큰 옆 비용은 실제 청구/환산/구독 배분을 구분하고 모르는 금액은 null로 둔다.

## 8. 제안 상태와 한계

Jev가 정확한 의존성을 발견하는지, 후보 준비 비용을 상쇄하는지, 분할이 전체 개발을 빠르게 하는지는 미측정이다.
현재 이 문서의 질문은 운영 로더에 연결하지 않았으며, DAG·소요 추정·화면·스케줄러도 새로 구현하지 않았다.
후속 구현은 역할 문서와 입력 계약을 먼저 고정하고 [실험 계획](RESEARCH.md#5-검증과-비교-설계)을 따른다.
