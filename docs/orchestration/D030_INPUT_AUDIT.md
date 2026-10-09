# D030 — 입력 중복과 Jev 판단 소유권 조사

2026-10-09. 사용자 요청: 현재 전달 필드를 확인·조사하고 Jev가 줄일 역할을 함께 확인한다. 런타임 변경/새 유료 실험이 아닌 근거 감사와 개선 제안이다.

## 현재 코드와 실측

- 실제 D029: `src/orchestration/live-file-workers.mjs:51`에서 brief/goal/requirements/acceptanceCriteria.originalBrief 같은 원문 4회, evidence/completedFiles 같은 완료 파일 2회. context는 전체 완료 파일이며 직접 의존만 필터링하지 않는다. plan/task에도 담당 task 내용이 겹치지만 별도 의미 검토가 필요하여 아래 제거량에 넣지 않았다.
- `scripts/tree-e2e-pilot.mjs`: Claude가 2–4개 후보 task를 먼저 생성한다. Jev split 평가 후에도 single/split 둘 다 강제 실행한다. 프로필은 Opus medium 고정. D029에서 Jev 때문에 실제 생략한 Claude 판단 호출은 입증되지 않았다.
- 모의 경로 `document-contracts.mjs:createWorkerTask`는 requirementIds/evidenceIds로 이미 필터링하지만 simulation-only이며 live에 적용되지 않았다.
- 모의 Jev 경로 `document-router.mjs:buildDecisionRequest`는 모든 판단에 전체 bundle을 넣는다. `prepareDocumentRequest`는 worker template까지 추가한다. 종류별 evidence projection이 필요하다. 이 경로는 D029 live request와 다르다.

재현: `node scripts/audit-worker-inputs.mjs benchmark-runs/d029-tree-01/events.jsonl benchmark-runs/d030-input-audit.json` (새 출력 경로 필요).
원본은 변경하지 않고 동일값 여부를 검증한 뒤 가상 복사본에서 goal/requirements/acceptanceCriteria.originalBrief/evidence만 삭제했다. brief/completedFiles에 원문 전부 남김.

| 대상 | 원본 request UTF-8 bytes | 중복 제거 복사본 bytes | 감소율(원본 분모) |
|---|---:|---:|---:|
| 단일 | 52975 | 23220 | 56.168% |
| 분할 4회 합계 | 285625 | 136897 | 52.071% |

[원본 감사 JSON](../../benchmark-runs/d030-input-audit.json). system은 요청당3571bytes로 위 분모에서 제외. 바이트는 공급자 토큰/캐시/가격이 아니다. 현 worker v2 필수 필드를 삭제한 복사본은 아직 유효한 런타임 계약이 아니다. 적용하려면 버전 갱신과 생성기/검증기 동시 변경 필요.

## 제안 입력 계약

| 현 필드 | 제안 | 책임 |
|---|---|---|
| brief/goal/requirements/originalBrief | 원문 저장소 1개 + 목표/요구사항 ID; 실행 요청에는 참조를 해석한 본문 1회 | 실행기, 최초 요구사항 매핑은 Claude |
| plan/task | 전체 계획은 오케스트레이터에 보관; 담당 task와 공통 인터페이스만 worker에 전달 | 실행기 |
| evidence/completedFiles | artifact map 1개, 필요한 dependency IDs만 전달 | 실행기; 전이 의존/공통 제약 누락 검사 |
| taskId/writeScopes/dependencies | 유지, 서로 다른 실행 제약이며 작은 중복을 먼저 최적화하지 않음 | 결정적 검증 |
| model/effort | 확정 프로필 1개 전달; 전체 후보는 worker에게 불필요 | Jev 선택 + 실행기 allowlist |
| outputContract/worker instructions | 공통 고정 본문으로 묶고 가변 task를 뒤에; 정렬/직렬화 안정화 | 실행기 |
| source path/hash/trace | 원본 추적은 로컬 manifest; 모델에는 필요한 evidence ID/버전만 | 실행기 |

도구 없는 worker에 경로만 보내면 읽지 못하므로 필요한 본문은 실행기가 해석해 반드시 넣는다. 공통 제약은 모든 관련 worker에 유지한다. 의미 요약보다 동일 본문 중복 제거를 먼저 검증한다.

## Jev가 줄일 역할과 줄이지 못하는 역할

| 판단 | Claude에서 생략할 후보 | Jev 최소 근거 / 답 | 실행과 남는 역할 |
|---|---|---|---|
| 분할 여부 | 매번 병렬화 장단점 재검토 | task 경계/의존/검사/오버헤드, noul+evidence | threshold와 충분근거 통과 후 실행; 후보 계획 생성은 Claude 또는 사전 template |
| 작업 우선순위 | 여러 준비 작업 비교 | scheduler가 걸러낸 ready tasks, choice ID | ready 판정/잠금은 코드; 후보1개면 Jev 호출도 생략 |
| 모델+effort | 작업마다 모델 장단점 추론 | 작업 특성/제약/실측 profile, choice ID | 실행기가 유효·가용 profile로 생성; 현재 live는 고정 Opus |
| 실패 담당 | 반복 오류의 담당자 분류 | 실제 오류+관련 변경+ownership catalog, choice ID/unknown | handler로 위임; 새로운 근본 원인 분석/수정은 Claude |
| 요구사항 근거 | 근거와 요구사항 반복 대조 | 정확한 요구문장+연결된 관측, 5상태 choice | test 실행과 독립 grade는 유지, finish 판정 아님 |

단순 ID 선별/중복 제거/의존 해석/캐시 키 생성은 모델 판단이 필요 없으므로 Jev에 보내지 않는다. 미지정 요구사항 작성, 새로운 코드 생성, 모호한 인터페이스 설계는 Jev의 닫힌 choice만으로 대체했다고 주장하지 않는다. unknown에는 자동 유료 재질문 대신 명시적 자료 수집/상위 판단 경로를 둔다.

## 공식 조사와 실험 제안

- https://jev-ai.pro/docs (2026-10-09): 한 state에 여러 typed 질문을 평가할 수 있다. 독립적인 질문만 묶는다. 작업 선택 결과에 따라 달라지는 모델 선택은 단계 분리 또는 각 후보 task의 질문을 명시한다. local path의 내용 자동 열람을 가정하지 않는다.
- https://platform.claude.com/docs/en/build-with-claude/prompt-caching (2026-10-09): 공통 prefix 일치가 중요하므로 고정 규칙/공통 내용 먼저, 가변 task/근거 뒤. CLI가 실제 breakpoint를 어떻게 설정하는지는 wire 기록으로 확인하지 못했으므로 byte 재배치만으로 cache hit 보장하지 않는다.

후속 비교 제안: A 기존 보존 → B 동일 본문만 중복 제거 → C 요구사항/의존 evidence 선별 → D Jev direct dispatch. B/C는 먼저 같은 모델/계획으로 비교하고 D에서 실제 생략된 Claude decision 호출수를 기록한다. 필요한 전이 의존 및 원문 coverage 검사, 주입 누락 부정 대조, 독립 E2E, 입력/생성/재사용 토큰, CLI 환산 비용, 준비/판단/실행/채점 시간을 따로 기록한다. 이번 byte 감소를 token/가격 감소율로 사용하지 않는다.

부수 효과: 오프라인 감사 script, private JSON, 조사 문서. runtime/worker 계약/장부/Personal OS 미변경. paid 호출0, commit/push 없음.
