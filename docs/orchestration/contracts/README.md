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
