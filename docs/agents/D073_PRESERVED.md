# D073 — 실패 프로필 후보 보존·기존 담당 추론 수리

담당 `/root/d067_review`. 상태: 구현·집중 검증 완료, 생산 소스 동결. 이 역할의 provider/Docker/실제 장부 접근은0이다. 실제 실행과 완료93+독립63 판정은 root가 이어 수행한다.

목적은 D071 `jev_profile` 실패 후보를 새 runtime에 정확히 상속하고 공개26실패를 재현한 뒤, Jev가 기존 소유권 안에서 담당과 수리 작업자 모델·effort를 선택하도록 연결하는 것이다. 원본 후보38파일·22산출물, 기존 공개93 gate, catalog와 소유권은 바꾸지 않는다. 기존10개 작업자 선택·실행 identity는 역사 증거로 보존하며 새 수리 선택/실행 비용과 구분한다.

소유: `src/benchmark/preserved-artifact-repair-runner.mjs`, `scripts/preserved-artifact-repair.mjs`, 해당 집중 테스트와 이 문서. 세 기존 파일은 `benchmark-runs/d073-preflight/source-before/`에 같은 경로로 snapshot 후 작업한다. 공유 runner/profile callback은 root, inferred scope/executor는 `d067_budget`, admission v4는 `d071_transport` 담당이다.

v8에서만 새 경로를 사용한다. 기존 v5/D070 실패 보존 수리와 v7/D071 85→93 gate 업그레이드는 유지한다. D071 프로필 run의 `planning.json`은 선택 전 기본 프로필이므로 `profiled-planning.json` 및 마지막 실행 plan·선택/적용/작업자 영수증을 대조한 실제 plan을 runtime에 사용한다. bootstrap 복사 시 모델/프로필 선택은0이다. 수리 시에만 selected task들의 새 Jev profile callback을 공유 worker Map과 연결한다.

실제 API, 장부, Docker, 독립 hidden 채점은 root만 수행한다. 이 역할은 코드/fixture·읽기 전용 공개 원본 검증만 수행하며 자동 재시도나 원본 수동 수리를 하지 않는다. 담당 추론을 실제 결함 확정으로 쓰지 않고, 성공한 callback을 수리 완료로 쓰지 않는다. 보존 수리 시간은 새 개발 시작점과 분리한다.

## 최종 연결과 권한

- v8 source는 D071 v7의 terminal `jev_profile` 원본이다. `planning.json`의 기본 Opus 가정을 실제 실행 모델로 취급하지 않는다. `profiled-planning.json`, initial 선택·commit·applied, round0 실행 계획, task/attempt별 Claude 영수증을 대조한다. 기존 Opus4명·Sonnet6명 모델 identity10/10을 확인했다. `effective_effort_verified:null`은 그대로 유지한다.
- executor의 정당한 round0 aggregate 공개 check 추가와 graph revision suffix만 재구성해 허용하고, 다른 task 권한·DAG·모델은 정확히 같아야 한다. 프로필 답변만으로 실행 identity를 대신하지 않는다.
- 공개93 registry/runner/assertions 및 당시 공개checker42파일의 현재 원문·저장 snapshot SHA가 일치해야 한다. catalog·요구·artifact ownership은 그대로이며, 이번 경로는85→93 gate 업그레이드가 아니다.
- bootstrap은 10개 기존 task의 deterministic copy이다. 새 모델·프로필 호출0. round0 공개 실패의 case ID·오류 유형·메시지와 원본38파일의 bytes/mode/revision을 대조한 뒤에만 다음 호출을 허가한다.
- `executePreservedArtifactRepair`는 `repairScopePolicy:'public-inferred-owner-v1'`, `artifactRepairPolicy:'inferred-v1'`에서 공유 executor의 `beforeRepairDecision` hook을 사용한다. 검증→`decideRepairOwners(request,meta)`→`decideRepair`→`prepareRoundPlan`→선택 작업자 순서다. owner 단계의 신뢰된 stage는 `repair_owners`이다.
- typed repair 선택은 `chooseAdaptiveRepair({repairPolicy:'inferred-v1',buildRepairState:buildInferredRepairDecisionContext,...})`로 연결한다. owner 추론은 기존 artifact ID를 기존 task에 연결하는 가설이며 쓰기 권한을 새로 만들지 않는다.
- root의 `createAdaptiveProfilePreparer({rootDir,manifest,context,session,input,catalog,profileSelections})`를 사용한다. 새 Map을 공유 worker callback에 연결하고 selected repair task만 다시 결정한다. 과거 initial 선택 답변을 새 수리의 선택으로 재사용하지 않는다. 선택하지 않은 산출물은 bytes·mode·revision 단위로 상속한다.

## 기록 계약

기존 `adaptive-arm-result/v1`, `kind:'preserved_artifact_repair'` 형식을 유지하며 새 경로의 `arm`은 `jev_profile`이다. `planning.json`은 실제 프로필 적용 계획이고, 적용 전 계획은 `historical-planning.json`에 보존한다. `historical-profile-evidence.json` 및 `result.source_profile_history`는 이전 실행 증거이며 `current_run_provider_calls:0`이다. 과거 토큰·비용을 새 사용량에 합산하지 않는다.

`metrics.new_owner_decision_callbacks`, `new_repair_decision_callbacks`, `repair_profile_preparation_callbacks`, `repair_worker_callbacks`를 분리한다. callback 수는 실제 HTTP POST/질문/Claude receipt 수가 아니며, root 분석은 각 영수증을 따로 센다. `bootstrap_copy_worker_provider_calls:0`, `initial_failure_basis:'historical_profile_public_failure'`를 명시한다. 초기 실패가 재현되지 않으면 기존 후보가 통과하더라도 수리 성공으로 승격하지 않는다.

## 검증과 교정

`node --test test/preserved-artifact-repair-runner.test.mjs`: 21/21 PASS, fail/skip/cancel0, 8257.915833ms. 기존 v5/v7, 비용 허가, alias·원본 drift·비선택 변경·알려진 HTTP 오류 보존 검증에 이어 다음 두 사례를 확인했다.

1. 원본 복사→정확한 공개 실패→Jev mock owner→typed repair choice→root의 실제 profile factory mock(Sonnet medium 한 task)→작업자1→모든 공개 검사 재실행. metadata/UI 파일은 상속되고 원본은 그대로다.
2. 같은 공개 case의 실패 메시지가 원본과 달라지면 `PRESERVED_FAILURE_CHANGED`, known failed. owner/repair/profile/worker callback은 모두0이다.

프로필 감사는 commit/적용 계획/실제 모델 불일치, effort 인자 불일치, 영수증 누락, 권한 변경, aggregate checker 변경 반례를 차단한다. fixture의 최초 실행에는 원래 execution_context가 빠져 있어 추가 후 재검증했다. 최초 실제 inspect는 aggregate 실행 계획을 원계획과 그대로 비교해 차단됐으며, 정확한 허용 변환 검증을 추가해 통과했다. 과거 원본을 수정한 것이 아니다. 실패 출력도 별도01 기록에 보존한다.

실제 read-only source 검사:38파일·22산출물·26공개실패·10개 모델 identity, 공개checker42개를 포함한63개 원시 snapshot hash 확인. `source-inspection-03.json`의 SHA는 `54fe21b8587e58d244772c5e500238f8592ff4347c416d203ea28cde3f823bf1`이다. 상세 로그·최종 소스 해시는 `benchmark-runs/d073-preserved-01/result.json`에 연결한다. fixture 통과를 실제 Jev 수락·수리 성공·시간 절감으로 해석하지 않는다.

## root 인계

읽기 전용 검사:

```sh
node scripts/preserved-artifact-repair.mjs --manifest benchmarks/e2e-swe/manifests/d073-adaptive.json --source-run benchmark-runs/d071-comparison-01/jev_profile
```

root가 동결·사전검증 후 새 디렉터리에서 실행:

```sh
node scripts/preserved-artifact-repair.mjs --manifest benchmarks/e2e-swe/manifests/d073-adaptive.json --source-run benchmark-runs/d071-comparison-01/jev_profile --spend benchmark-runs/d073-preserved-repair-01
```

이 역할은 두 번째 명령을 실행하지 않았다. API/모델 한계와 현재 입력 크기는 v4 admission·실제 서비스 응답으로 별도 검증한다. 전체 개발 조건과 보존 수리 조건의 시작점·시간·비용을 섞지 않는다.
