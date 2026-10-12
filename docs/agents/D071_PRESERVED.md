# D071 보존 후보의 새 공개 gate·원인 경로 수리

담당: `/root/d067_review`. 상태: 구현·집중 검증 완료, 담당 소스 동결. 실제 API/Docker 수리는 root 실행 전이다.

D070의 마지막 후보는 기존85개 공개 검사를 통과했으나 description 추가8개는 실패했다. 해당 원본 후보·실행 결과를 변경하지 않고 새 디렉터리의 runtime에 복사한다. 기존 plan/catalog/ownership을 보존하고 실행 공개 gate만 명시적으로 v4/93으로 갱신한다. 새 gate에서 기존85 통과와 추가8의 안정 assertion 실패를 확인하기 전에는 Jev 판단이나 수리 worker를 호출하지 않는다.

소유 파일은 `src/benchmark/preserved-artifact-repair-runner.mjs`, `scripts/preserved-artifact-repair.mjs`, 관련 집중 테스트와 이 문서다. root의 `source-before` 사본을 확인하고 테스트 파일 사본도 보존했다. 공유 runner/planner/execution은 별도 담당이 수정한다.

새 경로는 `adaptive-dag-comparison/v7`에서만 `public-causal-v1`/`causal-v1`을 선택한다. producer·IR·renderer 후보와 실패 baseline의 읽기 전용 overlay를 shared executor에 전달한다. 작업자는 Opus5.5 medium 고정, profile 선택0이다. 기존 D070 v5 보존 실패 수리 경로는 기존 동작을 유지한다.

## 실행 계약

`inspectPreservedRepairSource`는 v7에서 D070의 `completed/public_status:passed` 후보만 받는다. 원본 38개 파일·22개 산출물의 불변 mode·SHA·revision과 마지막 실행의 7개 공개 검사/85개 사례 통과를 대조한다. 역사적 registry는 현재 파일이 아니라 기존 run의 source snapshot과 pin에서 읽는다. 원본 catalog·소유 task·읽기/쓰기 범위·원래 명세는 그대로 둔다.

새 runtime plan은 `plan.checks`, verification task의 `check_ids`, `graph_revision`만 바꾼다. `historical-planning.json`과 `public-gate-upgrade.json`에 이전/현재 plan·check hash, 추가 8개의 안정 assertion ID와 변경 경계를 남긴다. 과거 85개 검사와 readiness 의미가 달라지거나 추가 protocol/source가 맞지 않으면 중단한다.

round0는 기존 산출물을 복사하고 현재 local 검사 및 공개 93개를 실행한다. 복사는 provider 호출이 아니다. 기존 85개 모두 통과하고 추가 8개가 해당 assertion·scenario·함수에 연결된 알려진 실패일 때만 새 Jev 판단을 허용한다. legacy 회귀·누락·not_reached·stale assertion·불확실 검사는 통과시켜 추정하지 않는다.

새 선택은 `repairPolicy:causal-v1`과 `buildCausalRepairDecisionContext`에 연결한다. 공유 executor의 `public-causal-v1`/`causal-v1`이 producer·IR·renderer 후보 및 수리 이력을 만들고, 선택한 산출물만 worker에 쓰기 허용한다. 추가 읽기는 실패 round의 SHA로 고정된 overlay다. 비선택 산출물은 바이트·mode·revision이 동일해야 하며 모든 공개 검사를 다시 실행한다. 원인 경로는 수리 후보이지 잘못된 위치의 확정 증명이 아니다.

실제 worker는 `arm:jev_all`로 고정 Opus5.5 medium을 쓴다. 이 보존 수리 조건의 profile 선택 호출은0이며, Jev 모델·노력도 비교 조건과 분리한다. `metrics.initial_failure_basis`는 `new_public_gate_on_preserved_legacy_passed_candidate`로 기록한다. 기존 v5 실패 후보 수리 조건은 과거처럼 동일 검사·동일 실패 재현을 요구한다.

## 검증과 보존 증거

- [집중 검증 결과](../../benchmark-runs/d071-preserved-01/result.json): **17/17 통과**, 실패/skip/cancel0, 7,564.786459ms. [원시 TAP](../../benchmark-runs/d071-preserved-01/focused-01.tap).
- 새 causal 통합 fixture는 85 통과+8 실패 재검사 → producer 산출물 하나 선택 → 두 불변 overlay 읽기/쓰기 차단 → 선택 worker1 → 비선택 산출물2의 exact 상속 → 공개93 재검사 통과를 실제 로컬 executor로 확인했다. provider/Docker0이다.
- [실제 보존 후보의 읽기 전용 검사](../../benchmark-runs/d071-preserved-01/source-inspection-01.json): `inspected_no_inference`, 38files/22artifacts, 원본 후보 snapshot `7aa6fe4e1f3ee5f279a36b6d3d6acda001596db1098fe6a431fbe0ca7c1bac0c`. 원본 파일·기존 실행 결과를 바꾸지 않았다.
- module/CLI `node --check`와 소유 파일 `git diff --check` 통과. 기존 세 파일은 `benchmark-runs/d071-preflight/source-before/` 아래 같은 경로로 수정 전에 보존했다.

초기 fixture 실패도 결과 JSON에 남겼다. 첫 pure gate fixture는 R10.02 local-check 대응 누락으로2개 실패했고, 다음 반례는 얕은 복사의 공유 배열 때문에 예상보다 이른 validation에 걸렸다. 새 causal fixture는 실제 packet schema(`adaptive-artifact-repair/v3`)와 overlay2개를 잘못 기대해 callback assertion이 실패했다. 모두 테스트 구성만 고쳤으며, 이를 제품·provider 실패로 계산하지 않는다. 초기 개별 raw log는 저장하지 않았고 최종 TAP만 원시 파일로 보존했다.

담당 생산 소스 SHA256:

| 경로 | SHA256 |
|---|---|
| `src/benchmark/preserved-artifact-repair-runner.mjs` | `7ad91414aa49564875b0e9a747db40145da745955366fc6dd2360ab875410bac` |
| `scripts/preserved-artifact-repair.mjs` | `994af9983513db29216b4121ae5bb9a471ba53d75c286d5df974edf77c4841db` |
| `test/preserved-artifact-repair-runner.test.mjs` | `a9f1507053e34afa7cee9280eb831d416dbd6bbc8079515fd1aba02158894a32` |

## root 실행 연결

읽기 전용 검사 명령:

```sh
node scripts/preserved-artifact-repair.mjs --manifest benchmarks/e2e-swe/manifests/d071-adaptive.json --source-run benchmark-runs/d070-comparison-01/jev_all
```

root의 전체 회귀·새 v4 controls·동결 gate 후 새 디렉터리 실행:

```sh
node scripts/preserved-artifact-repair.mjs --spend --manifest benchmarks/e2e-swe/manifests/d071-adaptive.json --source-run benchmark-runs/d070-comparison-01/jev_all benchmark-runs/d071-preserved-repair-01
```

기존 디렉터리는 다시 쓰지 않는다. 원본 후보·catalog/명세·고정 checker는 직접 수리하지 않는다. 이 역할에서는 provider, Docker, 실제 장부, hidden grader에 접근하지 않았다. fixture 통과는 실제 제품 수리 성공이 아니며, 실제 Jev 선택·Claude worker·93 공개 검사·독립 채점의 최종 결과가 남아 있다. 보존 수리 시간은 신규 개발 완료 시간에 합치거나 speedup 분자로 사용하지 않는다.
