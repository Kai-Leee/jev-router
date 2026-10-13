# D083 — 클라우드 실패 2건의 원인과 수정 (구현·오프라인 검증, 유료 실행 전)

사용자는 반복 측정을 멈추고 D082 실패 2건을 고치도록 지시했다. 아래 원인 분석 뒤 두 수정을 구현했다(맨 아래 '구현'). 아래 사실은 `benchmark-runs/d082-cloud-02`, `d082-cloud-06`의 journal·result와 저장소 코드에서 읽었다. 숨김 검사 내용은 읽지 않았다. 유료 호출은 없었다.

## 1. d082-cloud-02 — `ADAPTIVE_REPAIR_BUDGET_EXCEEDED`

**측정 사실**
- `adaptive-repair-budget.v2.json`: `state_plus_longest_question_tokens` 32,000 × 0.9 = 목표 28,800 추정 토큰(`bytes_per_token` 2.25, 질문 예약 3,000B). 계산은 `src/orchestration/adaptive-repair-budget.mjs:24-29`.
- 수리 1회차 owner 요청: state 114,072B, 추정 52,933 토큰. packer 결과 `split:false`, `SINGLE_CASE_OVER_TARGET`(`adaptive-repair-budget.mjs:369`). 차단 위치는 `adaptive-dag-execution.mjs:956-958`, 전송 전이다.
- projected 표현이 `PUBLIC_ERROR_OR_UNEXECUTED_EVIDENCE`로 raw 표현에 fallback했다. raw state의 큰 부분: failure 40,093B, requirement_descriptions 29,385B, units 15,550B.
- 오프라인 재현: 질문을 하나씩 나눠도 `public.cli-config-environment/T.integration.config-layout`(요구사항 19개) 한 건이 29,213 토큰으로 목표보다 413 크다. 같은 건이 0회차에는 28,497이었다.
- 1회차에 늘어난 부분: repair_history +2,224B, worker_diagnostics +2,512B. raw 단계(`RAW_STEP_IDS`, `adaptive-repair-budget.mjs:179`)에는 이 두 필드를 줄이는 단계가 없다. `history_delta`는 projected 표현에만 있다.
- `raw_compact_unfocused_quotes` 단계가 이 건을 7 토큰 키웠다(29,206→29,213).
- 0회차 수리는 owner가 `pyclientgen/__init__.py`(A02)를 골라 아무것도 바뀌지 않았다. 작업자 보고는 `models_init.py.jinja`(A18)와 `generator.py`의 `trim_blocks`를 지목했다(가설: 파일 이름 `__init__.py`로 owner를 고름).

**수정 방향**
1. raw 표현 단계에 worker_diagnostics·repair_history 압축을 추가한다(발췌 길이 상한, artifact ID만 유지). 어떤 단계도 요청을 키우지 않게 한다(키우면 그 단계 결과를 버림).
2. 단일 사례가 목표를 넘으면 requirement_descriptions를 그 사례의 요구사항 ID로만 줄인다.
3. 새 단계는 계약 의미가 바뀌므로 `adaptive-repair-budget.v3.json` + `repair-budget-v3` 정책 + 새 manifest(sha 변경)로 opt-in한다. v2는 재현용으로 둔다.

**고정 영향**: `adaptive-repair-budget.mjs`와 그 계약은 전송 정책 v9 pin과 D066 catalog 재사용 허용 목록 어디에도 없다. `adaptive-dag-execution.mjs`는 허용 목록에 있고 v9 pin은 아니다. 허용 목록 밖 소스가 catalog 재사용을 막는지 구현 전에 확인해야 한다.

**별도 소수정 후보**: 공개 검사 증거의 SyntaxError가 `__init__.py, line 2`만 보고하고 생성 파일 경로가 없다. `run_public_checks.py`(허용 목록)에 상대 경로를 넣으면 owner 선택 근거가 좋아진다(가설).

## 2. d082-cloud-06 — 수리 2회 뒤 `ARTIFACT_CHECK_NOT_PASSED`

**측정 사실**

| 회차 | 수리 전 실패 | 선택 owner(쓰기) | 수리 후 실패 |
|---|---|---|---|
| 0 | 11 (`schema-models/T.R10.02`, `http-client` 2, `description-provenance` 8) | A14 `schema/operations.py`, A19 `endpoint_module.py.jinja` | 9 (http-client 2 해결, 새 실패 없음) |
| 1 | 같은 9 | A07 `ir.py`만 | 같은 9, 변화 없음 |

- 남은 실패 예: `Args description for body: expected 'The item body.', got ''`.
- 작업자 진단은 1회차 owner 요청에 들어갔다(`state.worker_diagnostics` 2,520B, 압축으로 잘리지 않음). 진단은 A07·A21·A19를 함께 지목했지만 Jev는 9개 질문 모두 A07 하나를 골랐다.
- 1회차 작업자(n3)는 `generator._OperationBuilder`(A21)가 `requestBody.description` 없이 `BodyIR`을 만든다고 보고했다. A21은 읽기만 가능했고 쓰기 범위에 들어간 적이 없다.
- owner 질문(`adaptive-inferred-repair.v3.json`)은 실패마다 artifact 하나만 고르게 하고, 범위는 그 답들의 합집합이다(`adaptive-inferred-scope.mjs:8-15`).

**판단(가설)**: 근거 부족이나 작업자 무응답이 아니라 수리 범위가 좁아서 수렴하지 못했다. 한 원인이 A07·A21·A19 동시 수정을 요구했다.

**수정 방향**
1. (권장, 작음) 실패 집합이 이전 회차와 같고 그 회차 작업자가 쓰기 범위 밖 artifact를 지목했다면(`mentioned_artifact_ids`), 다음 회차 쓰기 범위에 그 artifact를 더한다. `adaptive-inferred-scope.mjs`(pin·허용 목록 밖) 또는 `adaptive-dag-execution.mjs`(허용 목록). 주의: n4의 지목에는 실제로 안 쓰는 경로 A14도 들어 있어 범위가 불필요하게 넓어질 수 있다. 상한(예: 회차당 추가 2개)과 기록 이벤트가 필요하다.
2. (큼) owner 질문을 복수 선택으로 바꾼다. `adaptive-inferred-repair.v3.json`·`adaptive-inferred-repair.mjs`가 v9 pin이라 v4 계약과 새 고정 정책 파일이 필요하다.
3. (비권장) 수리 회차를 늘린다. `adaptive-dag-runner.mjs`(v9 pin) 변경이고, 1회차에 진전이 없었으므로 같은 종류의 회차를 늘려도 이득 근거가 없다.

## 측정 계획 (구현 뒤)

- 반복은 조건당 3회만 한다(사용자 지시).
- 같은 실패를 오프라인으로 먼저 재현한다: 02의 기록 요청을 새 packer로 다시 포장해 목표 안에 드는지 확인한다. 06은 기록된 회차 상태로 범위 확장 규칙이 A21을 포함하는지 확인한다. 유료 호출 없이 한다.
- 그 뒤 새 manifest로 순차 3회를 돌려 D082(같은 클라우드 조건)와 비교한다. n=3이므로 차이를 분산 통제 결론으로 쓰지 않는다.

## 구현 (opt-in, manifest `benchmarks/e2e-swe/manifests/d083-repair-fixes.json`)

`d083-repair-fixes.json`은 `d082-cloud-defaults.json`과 같고 `repair_budget`(v3), `repair_feedback.scope_expansion`, `session_semantics`만 다르다. 과거 manifest 동작은 그대로다.

**1. repair-budget-v3** (`docs/orchestration/contracts/adaptive-repair-budget.v3.json`, `src/orchestration/adaptive-repair-budget.mjs`)
- v2 단계 뒤에 `raw_compact_worker_diagnostics`(발췌만 400자로, 모든 artifact ID 유지)와 `raw_compact_repair_history`(failures_before/after·relevant_revisions를 controller 전용 omissions로 이동, 실패 key·artifact ID 유지)를 둔다.
- 어떤 단계든 결과가 커지면 되돌리고 applied_steps에 넣지 않는다.
- v2 동작·계약은 바뀌지 않았다.
- 오프라인 재현(d082-cloud-02의 실제 차단 요청): v2 `SINGLE_CASE_OVER_TARGET`(재현), v3 4개 part 28,483·28,129·27,186·28,107 추정 토큰(목표 28,800 이하). 공급자 수락은 미측정이다.

**2. scope_expansion worker-mentioned-v1** (`src/orchestration/adaptive-inferred-scope.mjs`, `adaptive-dag-execution.mjs`)
- 직전 수리 회차의 실패가 남아 있고(`persistent_failure_keys`), 그 회차 작업자들이 자기 수리 artifact 밖에서 같은 artifact를 지목했으면(min(2, 작업자 수)명 이상), 최대 2개를 union 범위에 더한 후보 `repair-inferred-owners+worker-mentioned`를 만든다.
- 수리 결정 전에 후보 목록에 넣고, owner 추론 기록과 causal 범위 기록의 봉인(sha256)을 확장 후보를 포함해 다시 발급한다. 확장 내용과 이전 봉인 값은 `inferred_ownership.scope_expansion`에 남긴다. 결정 뒤에 범위를 바꾸면 다음 회차 검증(`ADAPTIVE_INFERRED_SCOPE_BINDING`)에서 거부되는 것을 mock 실행으로 먼저 확인했다.
- `adaptive-inferred-repair.mjs`는 바꾸지 않았다. 과거 prompt policy v1–v3가 이 파일을 pin하고 있어 바꾸면 세 정책이 모두 `JEV_PROMPT_SOURCE_DRIFT`가 된다(시도 후 되돌림).
- 범위 규칙은 확장 후보가 있으면 그것을, 없으면 기존 union을 고른다. 선택 시 `adaptive_repair_scope_expanded` 이벤트를 남긴다.
- 오프라인 재현(d082-cloud-06 회차1 진단): A07 범위에 A21(지목 2회)을 더한다. A14(작업자 자기 범위 제외 후 1회)는 더하지 않는다.
- mock 전체 실행: 회차2 쓰기 범위에 지목 artifact가 들어가고 봉인 검증을 통과한다.

**고정 정책**: `adaptive-dag-runner.mjs`(v9 pin)를 바꿔 전송 정책 v10(`jev-transmission-preflight.v10.json`)을 새로 고정했다. 바뀐 pin은 이 파일과 기본 경로를 바꾼 `jev-transmission-preflight.mjs` 둘뿐이다. prompt policy v1–v3 pin은 그대로다. `d076-preserved-repair.json`은 v10에 묶였다. D066 catalog 재사용: 바뀐 pin 12개 모두 허용 목록 안이다. `d083-repair-fixes --probe`: ready, 막힘 0, 과금 0.

**측정**: 아직 유료 실행 없음. 사용자 지시대로 순차 3회만 한다.
