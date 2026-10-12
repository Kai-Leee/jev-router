# 현재 강제 검사·복구 계약 — D075

- [jev-transmission-preflight.v1.json](jev-transmission-preflight.v1.json): v10 실제 전송의 필수 초기·예약 직전·POST 직전 검사와 정책/소스 해시. 예약0과 예약 후 POST0을 구별한다.
- [jev-prompt-policy.v2.json](jev-prompt-policy.v2.json): 현행 고정 질문 검사. 수동 CLI는 `--policy v2`를 명시한다. 역사적 v1은 원래 핀을 보존해 새 코드에서 SOURCE_DRIFT가 발생할 수 있다.
- [adaptive-failure-recovery.v1.json](adaptive-failure-recovery.v1.json): 실제 복구 실행 정책 `evidence-loop-v1`. 같은 실패·범위의 재호출에는 새 관련 근거가 필요하며 미정산/불확실/무결성 실패는 중단한다.
- [adaptive-repair-input.v1.json](adaptive-repair-input.v1.json): 중복 공유, 명시적인 관련성 선별, 실제 소스 근거의 단계별 전달 규칙. 의도적 선별을 무손실 변경으로 표시하지 않는다.
- 사용법·검증 경계는 [D075](../D075_FORCED_PREFLIGHT_AND_RECOVERY.md), 실제 실행 여부는 [STATE](../../agents/STATE.md)를 따른다.

# 이전 사전 검사·설계 계약 — D074

- [jev-prompt-policy.v1.json](jev-prompt-policy.v1.json): projected `repair_owners` / `inferred-v2`의 고정 질문·근거·선택값·handler 연결과 기존 adapter/v4 규칙. `node scripts/validate-jev-prompt.mjs --request <json> --stage repair_owners --template inferred-v2`로 검사한다. 다른 stage의 의미 검사는 미지원이다.
- [jev-failure-loop.v1.json](jev-failure-loop.v1.json): 실패 원인별 다음 행동 설계. `dispatch_enabled=false`이며 현재 runner가 읽거나 자동 복구를 실행하지 않는다.
- 작성 전 [jev-prompting 스킬](../../../skills/jev-prompting/SKILL.md)과 [사용법·공식 근거·실패 루프](../D074_PROMPTING_AND_FAILURE_LOOP.md)를 읽는다. 새 로컬 토큰 한도는 없다. 검사 통과와 실제 문맥 수락·정답률·제품 성능을 구분한다.

# 직전 실행 계약 — D073

[결과·한계](../D073_RESULTS.md) · [결정](../../decisions/D073.md). opt-in manifest v8/v9에서 다음 정본을 사용하며 기존 기본값은 유지한다.

- `adaptive-inferred-repair.v1.json`/`adaptive-inferred-repair.v2.json`: 영어 실패별담당 질문과 기존artifact/unknown 선택. v2 model-visible state와 controller의 원문복원/proof를 구분하며 선택ID를 기존owner/쓰기경로로 연결한다.
- `jev-token-admission.v4.json`: 로컬token/repair·profile추정을 비차단관측으로 전환한다. 공식body/schema/모델제한은 남는다.
- `adaptive-profile-selection.v2.json`: provider-limits-v2 모델/effort 선택. 실제 정본/hash는 manifest와 call metadata에서 확인한다.

실제owner26/14문항 수락과2worker 수리를 확인했으나 chooser 및 round2 ownerHTTP400이 남았다. 64초과문항 자동분할은 미구현이다. 아래는 각 버전 당시 기록이다.

# 실행기가 읽는 정본 위치 — D028

저장소 기준 경로는 `docs/orchestration/contracts/`다. 현재 절대 경로는 `/Users/lee/workspace/plugins/jev-router/docs/orchestration/contracts/`다. 코드가 import.meta.url 기준으로 해석하므로 터미널 작업 폴더가 달라도 같은 정본을 읽는다.

- `questions.v1.json`: 판단 종류별 영어 질문 원문, type, 답 선택지와 의미. 실행 시 문장을 새로 생성/요약하지 않는다. requirementId 자리만 치환한다. task/worker/failure의 동적 선택지는 해당 작업/프로필/오류 문서에서 그대로 붙이고 unknown을 유지한다.
- `profiles.v1.json`: 모델+effort+adapter+활성 여부+검증 수준. 활성 모의 프로필 2개, 과거 D025 Opus5.5 medium 프로필 1개는 disabled. 실제 프로필의 현재 가용성 검증 및 live adapter는 미연결이다.
- `worker-task.v1.json`: 작업자에게 줄 고정 지시문과 반환 필드. 프로그램이 task card, 목표 원문, 관련 요구사항과 근거를 붙인다. 새 작업 계획을 LLM으로 생성한 것으로 표시하지 않는다.

읽기/구성 코드는 `src/orchestration/document-contracts.mjs`의 loadDocumentContracts → prepareDocumentRequest → createWorkerTask다. 기존 D027의 동결 비교 코드/실험 CLI는 그대로 유지한다. 새 경로 사용 여부는 request.state.contractSources에서 절대 경로/버전/JSON 내용 hash로 확인한다. 해시는 raw file hash와 다르며 JSON 내용 해시다.

```sh
node bin/check-document-link.mjs benchmark-runs/d028-document-link-NEW.json
node --test test/document-contracts.test.mjs test/document-router.test.mjs
```

연결: 문서 로딩 → 등록 worker 질문 붙이기 → 모의 sim_high 응답 → spawn_worker → 문서의 fixture-model/high + ui 작업/근거/반환 계약을 담은 생성 인자. 이 검사는 실제 프로세스나 모델을 생성하지 않는다. 실제 Claude API/CLI 호출과 자동 목표→작업 계획 생성은 별도 연결 단계다. live adapter를 잘못 넣으면 현재 factory는 거절한다.

2026-10-09 검증: 22/22 test pass. 실제 모의연결 로그 benchmark-runs/d028-document-link.json. 문서 질문이 그대로 붙는지, 문서 변경 반영, 모델/effort 보존, disabled profile/unknown enum/live adapter 차단을 확인했다. 전체 회귀는 이번 독립 모듈 변경에서 반복하지 않았으며 D027 361/361 기록을 현재 재실행 결과로 주장하지 않는다.

기존 질문 type/answer enum을 임의로 바꾸면 실행 handler 계약과 충돌하므로 거절한다. 새로운 답 유형을 추가하려면 문서와 handler 계약을 함께 갱신하고 테스트한다. 질문 자연어 내용은 문서에서 수정한다. 결과는 자동 정답/실행 권한 보증이 아니다.

## D029 현재 모델 목록과 작업자 지시

새 실험에서는 `models.v2.json`(Opus/Fable/Sonnet/Haiku × 5 effort)과 `worker-task.v2.json`을 사용한다. `questions.v1.json`의 사전 질문 원문은 그대로 유지한다. 과거 v1 profile/worker 파일은 D028 기록을 재현하기 위해 남긴다. 현재 유효한 버전은 각 실행 manifest의 실제 로딩 기록을 확인한다.

- Claude 진입점: 저장소 `CLAUDE.md`에서 `@AGENTS.md` import.
- Codex 진입점: 저장소 `AGENTS.md`.
- 격리 worker: 자동 파일 발견을 기대하지 않고 controller가 정본 내용을 실제 prompt에 넣는다. 읽었다는 주장 대신 raw 입력과 source hash를 남긴다.
- 열람 명령: `node bin/show-routing-contracts.mjs`. 모델 ID/effort와 문서 절대 경로, 질문 원문 및 worker 지시를 출력하며 모델 호출은 없다.
- 모델 선택 검증: `src/orchestration/model-catalog.mjs`; 문서상 조합과 해당 실행의 allowlist를 둘 다 확인한다. 카탈로그의 unverified와 실제 호출 모델 확인은 다르다.
- 현재 E2E pilot: `scripts/tree-e2e-pilot.mjs`. 처음에는 Opus5.5 medium으로 양쪽 작업 모델을 고정해 분할 효과만 비교한다. 다른 모델은 목록에 있지만 이 실험에서 전부 호출하지 않는다.

[조사 출처](../D029_MODEL_HOST_RESEARCH.md) · [사전 실험 조건](../D029_EXPERIMENT_PLAN.md)

## D031 현재 worker

새 pilot은 `worker-task.v3.json`과 projected 입력을 기본 사용한다. `--input-mode legacy`만 v2를 사용한다. questions.v1/models.v2는 유지. `node bin/show-routing-contracts.mjs`는 현재 v3를 보여준다. 전체 명세는 한 번 보존하고 의존 evidence만 선별한다. 실제 토큰/비용 효과는 미측정. [구현 및 옵션](../D031_IMPLEMENTATION.md).

## D036 checkpoint contract

`checkpoints.v1.json` maps plan_ready to the existing split questions and registered execution handlers. auto/force_jev are implemented in checkpoint-router/split-checkpoint; other event types remain deferred. See ../D036_IMPLEMENTATION.md.


## D043 — confidence 기준 (2026-10-10)

현재 pilot 기본 판단 기준은 confidence다. `split-confidence.v1.json`의 execution choice(split/single/defer)에 붙은 confidence를 명시 `--confidence-threshold`와 비교한다. 낮으면 needs_evidence, 충분하면 선택된 실행으로 직접 연결한다. `--decision-basis probability --split-threshold`는 과거 재현용이다. 정본 설명: `docs/orchestration/D043_CONFIDENCE.md`. 회귀 419/419, 유료 호출 없음. D042 산출물 JSON 실패는 아직 미수정. 임계값은 미보정이며 확정 최적값 없음.


## D045 — 1~5 작업 개수 (2026-10-10)

현재 pilot 기본은 count. task-count.v1.json에서 실제 후보1..N(최대5)을 선택하고 confidence는 기록만 한다. 1은 유지, 2~5는 해당 개수로 역할·작업 묶음 실행. 동시 실행 수와 별개다. 단일 후보는 Choice API 최소2개 제한 때문에 force_jev 포함 무호출로 진행한다. 과거 confidence/probability 정책은 명시 옵션으로 유지. 문서: docs/orchestration/D045_TASK_COUNT.md. 전체424/424 검증, 유료 호출 없음. D042 출력 실패는 미수정.

## D053 current decomposition contract

`decomposition.v2.json` provides the fixed English questions and worker instructions for
`src/orchestration/task-decomposition-v2.mjs`. Requirements and shared file/interface facts come from
`benchmarks/e2e-swe/manifests/d052-requirements.json`. Jev chooses count, anchors, artifact owners and
requirement accountability; code filters infeasible choices and derives known dependencies. Instructions
are assembled from exact requirement records and owned artifact purposes. Both Claude and Codex entry
points link AGENTS.md; isolated workers receive explicit instruction content, not host discovery assumptions.
D052 v1 is preserved as the failed simultaneous-assignment experiment. See ../D053_DESIGN.md.

## D055 recursive task/test draft — not runtime connected

`recursive-task-tests.v1.json` is a proposed fixed English question and worker contract for task/test-list recursion. Read [design](../D055_RECURSIVE_TASK_TESTS.md). Existing runners still use their frozen/current explicit contracts; this file does not automatically enable recursion. Source-backed text preparation, typed choice, deterministic assembly and real test execution are separate stages.
# D056 runtime contract

`recursive-task-tests.v2.json` is used by the separate recursive planning pilot. Active questions are
`child_count`, `anchor`, and `assign_obligation`; `test_scope` remains reserved because this pilot derives
participants and integration scope deterministically. See `../D056_IMPLEMENTATION.md` for manifests,
state representations and the test-specification-only boundary. v1 remains the unmodified D055 draft.

## D060 sequential-allocation.v2.json

새 opt-in allocator가 이 파일의 영어 질문·배정기준·임시상한을직접읽는다. `src/orchestration/sequential-allocation-v2.mjs`와 [구현문서](../D060_BOUNDED_VERIFICATION.md). 역사적 D059질문/실행기자동교체아님.

## D061 sequential-allocation.v3.json

새v3allocator의기본작업자수2..30. 실행동시성기본2와별개이며[검증및경계](../D061_MAX_WORKERS.md)참조. v2는역사적재현용으로보존.

## D063 DAG 질문 — 개발 계획, 런타임 미연결

[반영 계획](../D063_DAG_PLAN.md)을 따른다. 현재 영어 초안은 [ARCHITECTURE §4.2](../jev-dag-design/ARCHITECTURE.md#42-고정-영어-질문과-선택값--처리-함수)다. `dag-routing.v1.json`은 예정 경로이며 존재하거나 로드된다고 가정하지 않는다. 새 질문/handler/loader와 검증을 함께 구현한다. 기존 질문/모델 정본과 과거 재현 경로를 덮어쓰지 않는다.

## D064 로컬 DAG 계약 — 별도 opt-in 경로

`artifact-dag.v1.schema.json`과 `src/orchestration/dag-contracts.mjs`가 task/artifact/check/worker 계약을 검증한다. 영어 질문 정본은 [dag-routing.v1.json](dag-routing.v1.json); `dag-decision-adapter.mjs`가 실제 client 요청 형식으로 읽는다. 소유자 용량 배정은 로컬 예약으로 구현됐고, 분할/관계/profile/수리 handler는 proposed/executable:false 상태다. 기존 document-contracts loader를 자동 교체하지 않는다. [D064](../D064_IMPLEMENTATION.md)의 검사·제품 실행 경계를 확인한다.

## D065 의미 핸들러 v2

[dag-routing.v2.json](dag-routing.v2.json)과 `src/orchestration/dag-semantic-handlers.mjs`는 분할·관계·프로필·실패 선택을 제한된 상태 변경에 연결한다. 후보, 그래프 revision, 근거, 실제 파일 binding을 검증하고 저장이 끝난 뒤 action을 반환한다. v1의 역사적 제안 상태는 보존한다. [핸들러 명세](../../agents/D065_HANDLERS.md)와 [실제 실행 범위](../D065_IMPLEMENTATION.md)를 함께 읽는다. action 반환과 모델/제품의 실제 성공은 별도 증거다.
