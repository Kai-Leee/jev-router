# D073 — 담당 입력 중복 축소 후 두 후보 보존 수리

담당 `/root/d067_review`. 상태: v9 연결·집중 검증 완료, 생산 소스 동결. 앞선 v8 source와 결과를 보존했다. 실제 API·Docker·장부·숨김 채점은 root만 실행한다.

목적은 원본 D071 `jev_profile`의26공개실패와 D073 `jev_profile`의14공개실패를 각각 새 디렉터리에 복사해 동일한 실패를 먼저 재현하고, semantic 중복을 줄인 inferred-v2 담당 판단을 실제 수리 선택·작업자 모델 선택·실행에 연결하는 것이다. 원문 요구/실패/소유권·쓰기 범위와 공개93 gate는 유지한다. 앞선 D073 두 조건의 담당 판단은 HTTP400으로 종료됐고 수리 답·작업자는0이다. 직접 보존하는 D071 원본의 종료 원인은 이전 로컬 guard이며, D073 원본은 HTTP400이다. 과거 실패 사용량null을 새비용0으로 바꾸지 않는다.

소유는 `src/benchmark/preserved-artifact-repair-runner.mjs`, `scripts/preserved-artifact-repair.mjs`, 해당 집중 테스트와 이 역할 문서이다. 기존 세 파일을 `benchmark-runs/d073-preserved-v2-preflight/source-before/`에 동일 경로로 사본·SHA 보존한 뒤 수정한다. v8 기존 inferred-v1 경로와 그 과거 증거는 유지한다. v9 manifest는 root, 새 compact owner 모듈/공유 executor는 `d067_budget` 담당이다.

v9 manifest는 `benchmarks/e2e-swe/manifests/d073-inferred-v2.json`, scope는 `public-inferred-owner-v2`, artifact/repair policy는 `inferred-v2`이다. 토큰 admission v4·profile provider-limits-v2·공식 request256000B는 그대로다. source schema v7/v8 각각에 맞는 historical profile 계약을 검증해 실제 기존 모델과 영수증을 보존하고, bootstrap에서 모델을 재호출하지 않는다. 숨김 채점 성적은 새 판단/작업자 입력에 쓰지 않는다.

## 원본 사전 감사

| 원본 | 과거 schema / profile policy | 파일 / 산출물 | 공개 실패 | 실제 작업자 identity |
|---|---|---:|---:|---|
| D071 `jev_profile` | v7 / bounded-v1 | 38 / 22 | 26 | Opus4 + Sonnet6, 10/10 |
| D073 `jev_profile` | v8 / provider-limits-v2 | 38 / 22 | 14 | Opus6 + Sonnet8 + Haiku1, 15/15 |

D073의 Haiku는 low, 나머지14명은 medium 인자가 실제 CLI 영수증과 일치한다. provider 내부 effort 확인은 모든 영수증에서null이므로 인자 확인과 구분한다. 원본 profile 계약은 역사 protocol의 버전으로 선택하고, 해당 계약·candidate catalog의 저장 snapshot SHA와 현재 원문을 대조한다. `applyAdaptiveProfileSelections`에도 이 역사 policy를 명시 전달한다.

`benchmark-runs/d073-preserved-v2-preflight/d071-inspection-01.json`은65개 원시·snapshot hash, `d073-inspection-01.json`은70개를 보존했다. candidate 파일은 각38개다. 현재 검사93 정의·checker 원문·assertion 계약·원본 요구·소유권이 그대로다. 기존 targetv8이 sourcev8을 허용하지 않던 경계도 `legacy-source-guard-01.json`에 known local rejection으로 확인했다.

## 연결 계약

별도 inferred-v2 모듈을 import하지 않는다. 기존 `adaptive-inferred-repair.mjs`의 `buildInferredRepairDecisionContext`에 `ownerInputPolicy:'inferred-v2'`를 명시해 새 projection/계약을 선택한다. typed repair 선택의 `repairPolicy`와 executor의 scope/artifact flags는 v2로 맞춘다. root의 profile 준비 factory·shared selected-profile Map은 그대로 사용하며, initial 모델을 재호출하지 않는다.

새 실행의 `preserved-source.json.sources[<원본 run>/result.json]`은 원본 결과 SHA이다. source profile/원본영수증은 같은 sources map과 `historical-profile-evidence.json`에 연결한다. `bootstrap_proof.initial_failed_cases` 및 `recheck.failed_cases`가 새 검사에서 원래 실패를 재현한 증거다. 미선택 상속과 새 호출 metrics 형식은 v8과 동일하다. 과거 usage와 독립 성적을 질문에 넣거나 새 사용량에 합산하지 않는다.

## 집중 검증과 인계

`node --test test/preserved-artifact-repair-runner.test.mjs`:24/24 PASS, fail/skip/cancel0,9504.699584ms. 이후 owner 결과·repair 요청·worker packet의 실제 v1/v2 계약 경로 단언을 추가하고 관련6개만 재검사해6/6 PASS(3195.451625ms)했다. 이6개는24개와 겹치므로30개 고유 검사로 합산하지 않는다. 최종 생산 소스 변경 후 root 전체 회귀에 포함한다.

새 v9 fixture는 원본 복사→정확한 공개 실패→owner typed choice→수리 범위 선택→root profile factory의 Sonnet medium 선택→작업자1→전체 공개 재검사까지 연결한다. metadata/UI는 bytes·mode·revision 그대로 상속한다. 실패 메시지가 달라진 반례는 `PRESERVED_FAILURE_CHANGED` known failed이며 owner/repair/profile/worker0이다. 기존 v5/v7/v8 검사도 통과했다. 문법3파일·diff 검사도 통과했다.

근거는 `benchmark-runs/d073-preserved-v2-preflight/owned-tests-01.tap`, `policy-dispatch-tests-02.tap`, 두 원본 inspection과 `result.json`이다. 실제 provider/Docker/장부/hidden 접근은0이다. 이 검증은 fixture와 read-only inspection이며, 새 서버 수락·수리 성공·효율 절감을 증명하지 않는다.

root의 새실행은 `--manifest benchmarks/e2e-swe/manifests/d073-inferred-v2.json`과 각 원본 `--source-run`을 명시하고, 서로 다른 새 `benchmark-runs/d073-*` 디렉터리를 사용한다. 원본 결과·후보는 덮어쓰지 않으며 두 보존 수리 시간과 기존 전체 개발 시간을 합쳐 가속률을 만들지 않는다. 검증 가능한 다음 결론은 실제 응답·선택·새 작업자·공개93·독립63 결과가 남은 뒤 root가 판정한다.
