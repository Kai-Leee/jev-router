# D085 — 복수 owner(C)와 import·문법 오류 직접 수리 (구현·오프라인 재현, 유료 호출 없음)

사용자 지시: "import 오류는 직접 수정으로 가자. C로 수정을 해서 가보는 걸로 하고, 이후에 동작이 효과적인지 다시 분석." 직접 수정 방식은 사용자가 고른 "수리 작업자 바로 투입"이다. 막힌 검사는 Jev owner 추론을 건너뛰고, 코드 생성 파일(generator + 템플릿)을 고칠 수 있는 수리 작업자를 바로 보낸다. 작업자는 전체 오류와 생성된 파일 내용을 받는다.

manifest: `benchmarks/e2e-swe/manifests/d085-direct-repair.json`. `d083-repair-fixes.json`과 다른 점은 `repair_feedback`의 두 값과 설명뿐이다.

## 1. C — `owner_alternatives: owner-probability-v1`

질문 형식은 바꾸지 않는다. Jev choice 답에는 이미 모든 artifact의 확률이 들어 있다. 이 확률을 그대로 쓴다.

- 실패 하나(추론된 답)마다, 선택되지 않은 artifact 중 확률이 **0.2 이상**이고 **선택 artifact 확률의 0.4배 이상**이면 2차 owner로 본다. `unknown`과 unknown 답은 제외한다.
- 2차 owner 중 union에 없는 artifact를 최대 2개 더한다. 순서는 지목한 실패 수, 그다음 확률 합이다.
- 새 후보 `repair-inferred-owners+owner-alternatives`를 union 뒤에 추가한다. 두 범위 봉인(`inferred_ownership`, `causal`)은 D083 확장과 같은 방식으로 다시 발급한다. 확률은 봉인된 `proof.answers`에서 읽는다.
- 범위 규칙의 우선순위: worker-mentioned 확장 > owner-alternatives > union. worker-mentioned 확장은 owner-alternatives 후보 위에 만든다.
- 구현 위치: `adaptive-inferred-scope.mjs`(`ownerProbabilityAlternatives`)와 `adaptive-dag-execution.mjs`(`withExpandedScope`). `adaptive-inferred-repair.mjs`는 prompt policy v1–v3 pin이라 바꾸지 않았다.

## 2. 직접 수리 — `check_error_repair: generation-direct-v1`

계약은 `docs/orchestration/contracts/adaptive-check-error-repair.v1.json`, 구현은 `src/orchestration/adaptive-check-error-repair.mjs`이다.

1. 공개 검사가 `SyntaxError`·`IndentationError`·`TabError`·`ImportError`·`ModuleNotFoundError`로 테스트 전에 멈추면 발동한다. 실행당 1회.
2. owner 추론(Jev)과 수리 후보 선택을 건너뛴다. 범위는 코드가 정한다. 경로에 `templates/` 디렉터리가 있거나 파일 이름이 `generator.py`인 artifact다. D066 catalog에서는 A16–A21이고, 소유 task는 보통 4개다.
3. 진단: runner가 같은 고정 이미지·후보·고정 검사기로 막힌 suite를 한 번 더 돌린다(`scripts/diagnose-check-error.py`). 예외가 나면 다음을 남긴다.
   - traceback
   - 생성된 파일 목록
   - 오류가 가리키는 생성 파일 내용(파일당 12,000자, 최대 4개)
   - 컴파일되지 않는 생성 파일
   - 없는 모듈의 가장 가까운 부모 `__init__.py`

   같은 오류 메시지는 한 번만 진단하고, 서로 다른 오류는 최대 3개까지 진단한다. 이것은 검사가 아니고 증거로 쓰지 않는다. 공개 fixture만 쓴다. 진단이 실패해도 실행은 계속되고, 작업자는 보고된 오류만 받는다.
4. 후보는 causal 봉인에 추가해 다시 봉인한다. 기존 causal 검증기를 그대로 통과한다. 작업자 packet은 causal 작업자 packet에 `check_error_repair`(오류와 진단)와 고정 지시를 더한 것이다.
5. 이 회차는 수리 2회와 별도로 1회 더한다(최대 3회). 이후 회차는 일반 owner 추론 경로를 탄다.

## 3. 고정·검증

- `adaptive-dag-runner.mjs`가 바뀌어 전송 정책 **v11**을 고정했다. 바뀐 pin은 runner와 기본 경로 파일(`jev-transmission-preflight.mjs`) 둘뿐이다. `d076-preserved-repair.json`은 v11에 묶었다. prompt policy v1–v3 pin은 그대로다.
- `--probe`(d085): ready, 막힘 0, 과금 0.
- 회귀: 1368개 중 통과 1364, 실패 1(root 전용 refund 테스트, 기존과 같음), 건너뜀 3.
- 새 테스트:
  - `test/d085-direct-repair.test.mjs` 7개
  - mock 실행 2개: 2차 owner가 같은 회차에 들어가는지, 막힌 검사가 owner 추론 없이 생성 artifact로 가고 다음 회차에 일반 경로가 이어지는지(진단 실패 포함)

## 4. 효과 재분석 (기록된 실행 오프라인 재현)

### 4.1 직접 수리 — 막힌 검사가 있었던 3개 실행

진단 스크립트를 각 실행의 회차0 후보와 고정 검사기에 실제로 돌렸다(Docker, 공개 fixture, 과금 없음). 3건 모두 오류가 재현됐다.

| 실행 | 당시 결과 | 진단이 보여 준 것 | 원인 artifact | 직접 범위 안? | 당시 owner |
|---|---|---|---|---|---|
| d082-cloud-02 | 실패(owner 요청 예산 초과) | `models/__init__.py` 2행에 import 18개가 한 줄로 붙음 (템플릿 공백 제어) | A18 `models_init.py.jinja` | 예 | A02·A03 (오지정, 변경 없음) |
| d080-defaults-03 | 실패(예산 초과) | `list_records.py` 43행 매개변수 없는 `*,` | A19 `endpoint_module.py.jinja` (또는 A21) | 예 | 요청 전 중단 |
| d082-cloud-01 | 완료(1회 수리) | `api/__init__.py`만 있고 `api/<tag>/` 패키지 없음 | A21 generator (실제 수정도 A21만) | 예 | 6개 union |

- 원인 artifact는 3건 모두 직접 범위 안에 있었다. 실패한 2건(02, 03)은 owner 추론 단계가 원인이었다(오지정 또는 예산 초과). 이 경로는 그 단계를 지나지 않는다.
- 비용: 직접 범위가 넓다(artifact 6개, task 4개). 작업자 4명이 한 회차를 돈다. d082-01처럼 일반 경로로 1회 만에 끝난 실행은, 직접 회차가 먼저 돌아 회차가 하나 늘 수 있다.
- 미확인: 작업자가 진단 내용으로 실제로 고치는지는 유료 실행 전에는 알 수 없다.

### 4.2 C — 과거 owner 결정 12개 (확률이 기록된 inferred 결정)

| 분류 | 결정 | 내용 |
|---|---|---|
| 다음 회차에 필요했던 artifact를 한 회차 먼저 넣음 | 2 | d082-04 r0 +A19, d083-03 r0 +A19(+A13). 두 실행 모두 실제로 r1에서 A19를 고쳐 끝났다. 각각 수리 1회를 줄였을 수 있다. |
| 필요 후보를 넣었으나 결과 미상 | 1 | d082-06 r1 +A21·A14. D084에서 필요하다고 본 A21이 들어간다. 실행은 실패했다. |
| 필요 없던 artifact 추가 | 6 | d080-01 r0 +A09·A11(선택 확률 0.23인 평평한 답 1개에서), d082-01 r0 +A14, d082-05 r0 +A19, d083-02 r0 +A19, d083-03 r1 +A14, d082-02 r0 +A19(실제 원인은 A18) |
| 추가 없음 | 2 | d082-04 r1, d082-06 r0 |

- R10.02 반복 실패(A14 선택, A19 약 0.2–0.4)에서는 A19가 거의 항상 같이 들어간다. 그래서 "A14만 고쳐 1회에 끝난" 실행(d082-05, d083-02)에서도 A19 작업자가 추가로 돈다. 불필요한 수정이 회귀를 만드는지는 미측정이다.
- 약점: 확률이 평평한 답(d080-01, 0.23/0.22/0.20)은 비율 조건을 쉽게 통과해 잡음 artifact를 더한다.

## 5. 결론과 다음

- 직접 수리는 기록된 실패 2건(d082-02, d080-03)의 원인이었던 단계를 피하고, 원인 artifact를 범위에 넣고, 원인 파일 내용을 작업자에게 준다. 오프라인 근거로는 효과가 있을 가능성이 높다. 실제 수리 성공은 미측정이다.
- C는 필요한 artifact를 한 회차 일찍 넣는 경우가 12번 중 2번(+1번 미상)이다. 필요 없는 추가는 6번이다. 이득은 회차 절약, 비용은 작업자 추가와 회귀 위험이다. 효과는 섞여 있다.
- 유료 측정은 조건당 3회 이하로만 한다(사용자 지시). 아직 실행하지 않았다. 막힌 검사는 실행 15개 중 3개에서만 나왔다. 그래서 3회로는 직접 수리가 한 번도 발동하지 않을 수 있다. C는 R10.02가 7/13 빈도라 발동할 가능성이 높다.
