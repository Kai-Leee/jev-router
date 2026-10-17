# Pointsman 스킬 분류·라우팅과 사용 전제

2026-10-14, 설계안. 사용자 요청: 스킬을 통한 분류·라우팅 방법과 플러그인 사용 전제 고안.
기준: research `2b3c9ac` / main `8b2da35`(v0.3.2). 런타임 기본값 변경·설치·새 유료 실행은 포함하지 않는다.

## 1. 권장 구조

**호스트가 Pointsman 진입 스킬을 발견 → 코드가 실행 가능한 후보를 좁힘 → 필요한 선택만 Jev → 선택 ID에 연결된 실행기 → 산출물 검사**로 구성한다.

스킬은 호출 시점·자료 위치·규칙을 안내한다. MCP/CLI는 전송 수단이고 실행 강제는 controller 책임이다. `SKILL.md`만으로 매번 호출되거나 검사가 강제된다고 간주하지 않는다. 자동 모드는 controller의 정해진 이벤트에 연결한다. 스킬 호출 여부를 또 Jev에게 물어보는 재귀 라우팅은 만들지 않는다.

```text
목표/명세 + 현재 이벤트 + revision이 연결된 근거
 → 전제조건·권한을 충족한 등록 후보
 → 0개: 부족한 입력 보완 / 미지원 처리 (유료 호출 없음)
 → 1개: 적용 가능성이 확정된 경우 바로 연결 (유료 호출 없음)
 → 복수: 고정 영어 질문 → Jev 선택
 → 응답·현재 revision·등록 handler 검증
 → 선택 스킬/참고문서 로딩 → 실행 → 공개 검사
 → 실패가 남으면: 새 근거 → 담당 판단 → 범위가 정해진 수리
```

후보가 하나여도 그 절차가 요구에 적용되는지 미확정이면 바로 실행하지 않는다. 후보0은 전체 작업의 중단이 아니라 자료 수집이나 일반 에이전트의 미지원 처리로 돌아가는 조건이다.

## 2. 무엇을 분류하는가

스킬과 모델 선택은 분리한다. 같은 수리 스킬도 난도·실증된 지원 범위에 따라 다른 모델/effort를 사용할 수 있다. 전체 스킬 본문 대신 짧은 후보 설명과 이번 판단 근거를 Jev에게 준다.

| 판단점 | 스킬·코드가 먼저 처리 | Jev가 판단 | 실행 연결 |
|---|---|---|---|
| 의뢰 진입 | 명시 스킬 지정을 존중하고 권한·자료·도구로 후보 필터 | 복수의 적합한 절차 중 요구에 맞는 것 | 등록 skill ID → 필요한 본문 로딩. 범용 연결기는 신규 구현 대상 |
| 작업 분해 | 목표·요건·테스트·산물 후보 준비 | 분리 방식·담당·관계 | 기존 D083 layered planner 연결 |
| 모델/effort | 실제 이용 확인된 조합 등록 | 이번 작업을 충족하는 조합 | 기존 profile selection → worker dispatch |
| 실패 후 | 공개 실패·미실행·환경 실패 구분 | 수리 대상인 기존 산물 | inferred owner → 현행 scope 규칙 → 선택 worker |
| 다음 작업 | 의존 충족·쓰기 충돌·가용 슬롯 검사 | 의미 판단이 남는 우선순위만 비교 | ready queue. 코드로 정해진 순서는 다시 묻지 않음 |
| 검증 | 공개 검사 실행, revision과 결과 대조 | 명시된 기준의 의미 판단이 필요한 경우 | review 기록. 실제 테스트나 완료 판정 대체 불가 |

초기에는 등록된 프로젝트의 구체적인 절차에 한정한다. 미등록 영역의 후보는 메인이 한 번 만들고 검증해 등록한다. 매 루프 같은 질문·후보 설명을 다시 생성하지 않는다.

## 3. 등록 자료와 최소 입력

제안하는 `project manifest`는 스킬과 코드의 공유 정본이다. 다음은 논리 필드이며 아직 기존 API가 받는 JSON 형식이 아니다.

- 프로젝트: `root`, `goal`, 요구 ID·원문 참조, `public_checks`, 실행 환경, 수정 가능한 범위.
- 스킬 등록: `id`, `path`, 내용 hash, 적용/제외 기준, 필수 입력, 기대 출력, `handler_id`, 필요한 도구·권한.
- 실행자 등록: CLI/API 구분, adapter ID, 이용 확인된 모델/effort와 확인일, 실제 목적지. 별칭과 응답 identity를 구분.
- 판단 등록: event → 질문 계약/path/hash → 허용 후보 → 응답 schema → handler → 성공/실패 다음 이벤트.
- 실행 방침: mode, 비용 장부, 모델 최적화 여부, 최대 worker와 동시 실행 수, 복구 방침. 기존 실험 상한을 일반 제품의 고정 제한으로 옮기지 않음.

판단 입력은 `event, goal_ref, task_id, requirements, artifact_revision, evidence, candidate_ids, constraints, contract_version`이다. controller의 원문 참조와 Jev에게 전송하는 본문은 다르다. **Jev에는 필요한 원문 발췌를 inline으로 준다.** 경로·hash만으로 API가 파일을 읽을 수 없다. 같은 명세를 여러 필드에 반복하지 않되 원인·기대 결과를 삭제하지 않는다.

단일 선택은 `choice`, 순서 척도는 `score`, 명제는 `noul`이다. 작업자 수를 소수 score 반올림으로 만들지 않는다. 복수 선택은 항목별 독립 명제 또는 선택된 항목을 제외한 순차 선택으로 별도 설계한다. 순차 방식은 호출 수가 증가한다. 앞선 응답에 의존하는 질문을 같은 POST에 넣지 않는다.

진입 분류용 고정 영어 초안(미구현·미측정):

> Select the registered workflow that best matches the requested outcome in `state.goal` and the observed event in `state.event`. Compare the supplied applicability criteria, required inputs, and expected outputs. Use only the evidence in `state.evidence`. Select `needs_context` when a named missing input prevents a justified selection; select `unsupported` when none of the workflows covers the request.

criteria에는 구체적인 절차와 제외 조건을 넣는다. `needs_context`는 입력 보완, `unsupported`는 일반 에이전트로 반환하는 제안값이다. 기존 D083 선택지를 변경하지 않는다. 새 수치 임계값이나 포괄적인 보류 루프를 도입하지 않는다.

## 4. 선택값을 실행으로 바꾸는 계약

Jev 문자열을 shell에 전달하지 않는다. 등록 ID를 검증된 입력을 받는 함수에 연결한다. 스킬 선택은 고정된 파일을 읽고 담당 에이전트가 그 절차를 수행하는 연결이다. 자유서술 지침 전체가 결정적 함수가 되는 것은 아니다.

예: `repair_owner → 기존 artifact ID → 현재 owner → 허용된 수리 경로 → worker adapter`. 재사용 후보는 `src/orchestration/adaptive-dag-execution.mjs`와 `adaptive-inferred-scope.mjs`다. 범용 `route_skill` handler는 아직 없다.

후보 membership·입력 schema·근거 revision·쓰기 범위·의존 충족을 실행 전에 검사한다. 변경되었다면 stale로 재구성한다. decision ID와 실행 receipt를 연결해 동일 결과의 중복 실행을 막는다. 중간 실패로 실행 결과가 불명확하면 상태를 확인하며 무조건 재송신하지 않는다. 이는 신규 controller 요건이며 모든 현행 경로의 내구성 있는 재시작을 보장한다는 뜻이 아니다.

유효한 선택 뒤 Claude/Codex에게 같은 후보 비교를 다시 요청하지 않는다. 구조 검사·구현·테스트는 유지한다. 새로운 반증이나 전제 변경이 있을 때 별도 판단을 만든다.

## 5. 사용하기 위한 전제

사용자가 먼저 줄 것은 **대상 폴더, 목표/명세, 완료 기준, 허용 실행자와 수정 범위**다. DAG·worker 수·전체 질문을 수작업으로 준비할 필요는 없다. README·테스트·설정에서 찾을 수 있는 정보는 플러그인이 읽고, 실행에 영향을 주는 부족한 정보만 확인한다.

1. **호스트 연결:** Claude/Codex가 스킬을 발견하고 선택한 transport·worker adapter를 호출할 수 있어야 한다. 파일 존재, tools/list 성공, 실제 작업 실행은 서로 다른 확인이다.
2. **실행 환경·키:** Node 요건은 배포판 기준으로 확인한다(main v0.3.2는22 이상). 키는 서버의 `JEV_AI_API_KEY`, 로컬 기본 위치는 `~/workspace/.env`, 배포는 프로세스의 secret 설정이다. 본문·브라우저·스킬에 값을 넣지 않는다.
3. **목적지·인증:** base `https://jev-ai.pro/api`, POST `/v1/systemone`, 초기 모델 `jev-latest`. 설정 검사 → 인증된 GET `/v1/models` → 허용된 작은 POST를 구분한다. GET 성공은 추론 성공이 아니다. 실제 입력 제약을 전송 전에 검사한다.
4. **실행자 능력:** 모델/effort와 CLI/API 인증을 실제 실행 호스트에서 확인한다. Jev key가 Claude/Codex 인증을 대체하지 않는다. D083 최대 worker30과 동시 슬롯2는 다르다. 클라우드가 로컬 스킬·인증을 자동 상속한다고 가정하지 않는다.
5. **완료 관측:** 산출물과 공개 검증 명령/기대 결과가 필요하다. 없으면 메인이 검증 명세를 먼저 준비한다. 숨김 채점 내용은 계획·수리 입력에 넣지 않는다.
6. **회계·복구:** 판단/worker/검증을 별도 기록하고 미확정 비용은 unknown으로 둔다. 불명확한 POST를 자동 재전송하지 않는다. 본 프로젝트 실험은 기존 클라우드 장부·순차 실행·조건3회·D082-08 재실행 금지를 유지한다. 이를 외부 사용자의 설치 전제와 혼동하지 않는다.

준비 상태를 `skill discovered → tool callable → auth verified → decision accepted → handler executed → public check observed`로 표시한다. 이는 향후 doctor의 단계별 출력 설계이며 해당 명령은 아직 없다. 실패한 단계만 보완한다.

## 6. 호스트 배포 방식

정본은 `skills/pointsman-routing/`에 두고 배포 시 필요한 계약까지 담는 bundle을 생성한다. Codex 프로젝트용은 `.agents/skills/pointsman-routing/`, Claude Code는 `.claude/skills/pointsman-routing/`를 사용한다. 다른 프로젝트에서 사용할 때는 호스트의 plugin 배포 방식과 명시적 대상 root를 사용한다. 배포 사본과 정본 hash를 대조한다.

Codex는 이름·설명으로 스킬을 선택한 후 본문을 읽으며 명시 호출도 지원한다. [공식 스킬 문서](https://learn.chatgpt.com/docs/build-skills). Claude Code도 프로젝트·개인·plugin 경로를 지원하며 cloud/Cowork와 로컬의 검색 위치는 다르다. [Claude 공식](https://code.claude.com/docs/en/skills). 문서상 지원을 이 기기의 설치 성공으로 간주하지 않는다.

`AGENTS.md`와 `CLAUDE.md`에는 프로젝트 설정 위치와 자동 checkpoint 방침의 짧은 입구만 둔다. 질문은 계약에서 읽는다. 격리 worker에게는 자동 발견을 기대하지 않고 선택한 지침·할당·수정 범위·검사를 명시한다.

main의 `.codex-plugin/plugin.json`은 MCP 연결을 선언한다. `MCP.md`에는 native 도구 직접 호출에 로컬 validator가 강제되지 않는다는 한계가 있다. **자동 운용은 단일 검증·기록 gateway를 통하도록 연결해야 한다.** 스킬을 추가하는 것만으로 이 공백이 해결되지는 않는다.

## 7. 개발 순서와 평가

- 이번 산출물: 저장소의 입구 스킬 초안과 이 설계. 기존 prompting/records/maintenance와 책임을 나눈다.
- 다음 구현: manifest/registry·offline doctor → 후보 filter·고정 분류 질문·ID dispatcher → 모든 transport의 전송 gate/receipt → Claude/Codex의 실제 스킬 발견·실행 검사.
- 먼저 연결할 대상: 기존 D083 분해·profile·owner 판단. 범용 스킬 분류는 별도 평가한다. 매번 외부 스킬을 탐색·설치하는 구조로 만들지 않는다.
- 분류 평가: 명시 지정, 복수 후보, 후보 없음, 자료 부족, stale, 미허용 경로, 불명확한 POST, 공개 검사 실패를 포함한다. 발견율은 해당 요청 중, 오발동률은 비해당 요청 중, 올바른 handler 연결률은 실제 선택 중으로 분모를 고정한다. 분기 도달 수·중복 판단·POST/worker/검증 호출도 기록한다.
- 효율 평가: 목표·worker 모델/effort·도구·병렬 슬롯·검사를 고정해 기존 판단과 Jev 판단을 비교한다. 코드만으로 생략된 판단은 별도 집계한다. 성공 완료 벽시계 시간, cache를 포함한 토큰 종류, API환산 비용을 기록한다. 월정액 실제 배분이 없으면 미확인으로 둔다.

## 8. 확인과 미완료

Git ref, main의 README/MCP/plugin/package, research의 STATE/D083 manifest, 기존 스킬·설정 소스를 읽었다. 외부 사양은2026-10-14에 위 두 공식 문서와 [Jev 공식](https://jev-ai.pro/docs)을 확인했다. `jev-prompting`의 D075 현재 경로 안내는 D083 사용 시 갱신할 항목이다.

스킬 형식·상대 링크·설치 사본 확인 결과는 `docs/skills/routing-evidence-20261014/verification.json`에 기록한다. 실호스트 자동 선택·분류 정확도·API/worker 실행·효율은 미측정이다. 신규 gateway/registry/doctor/범용 handler는 미구현이다. 설치나 기존 prompting 스킬 개정은 하지 않았다.
