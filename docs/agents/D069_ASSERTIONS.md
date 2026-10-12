# D069 — assertion 근거와 수리 범위

2026-10-11 KST. 담당 d067_runner. [역할 계약](D069_PARALLEL.md), [D068 실제 실패](D068_SCOPE.md#실제-d068-종료-후-공개-실패-분석)를 따른다. 기존 `jev-decision-records`의 실측/제안/미확인 구분을 적용한다.

## 목표와 쓰기 경계

기존 공개 85개 case와 모든 검증 조건·실행 순서를 유지하고, D068에서 드러난 통합 case의 assertion 실패/내부 미도달을 구분한다. 오류 문자열만으로 owner를 선택하지 않는다. 고정 공개 assertion 계약, 검사 hash·runtime binding·artifact revision을 대조한 경우에만 더 작은 수리 산출물을 제안한다. 지원 밖 assertion은 명시적인 case 단위 fallback이다.

소유 파일은 공개 checker harness/extensions/필요한 registry·inventory, `adaptive-repair-scope.mjs`, 관련 tests와 이 문서다. execution/planner/runner는 다른 담당에게 API로 연결한다. provider·키·장부·Docker·숨김 상세·과거 후보/원본 수정은 하지 않는다.

## 합의한 인터페이스

- `public-checks/assertions.json`: `{schema_version:'public-assertion-contract/v1',version:'1',assertions:[{id,check_id,test_id,requirement_ids,artifact_paths}]}`. `artifact_paths`는 수정 원인 확정이 아니라 공개 인터페이스와 기존 책임 배정에 따른 산출물 후보 경로다.
- checker는 parent case의 `assertion_results:[{assertion_id,status}]`에 고정 ID와 passed/failed/not_reached를 기록하고 실제 실패에는 `failed_assertion_id`를 남긴다. 전체 report의 `assertion_contract_sha256`은 계약 bytes의 SHA-256이다. 기존 assertion 수에는 실제 수행 assertion만 포함하며 metadata 선언은 더하지 않는다.
- `buildAdaptiveRepairScope({...existing, assertionContract:{contract,sha256,source_path,source_text},runtimeBinding})` opt-in. `runtimeBinding`은 controller가 읽은 현재 round의 `initialization.root/binding.json`이다. 원문 JSON과 parsed contract·hash를 대조하고 계약이 checker manifest에 pin됐는지 확인한다. plan·artifact bindings·environment로 runtime binding digest를 재계산하며 실제 공개 evidence의 runtime/checker/plan/environment/revision/evidence_key와 대조한다. 원래 D068 호출은 그대로 유지한다.
- assertion-aware `analysis.observed_failures`에는 `assertion_id`, `evidence_level`, `requirement_ids`, `artifact_ids`, `owner_task_ids`, source binding을 남긴다. `not_reached_assertions`는 관측 실패로 승격하지 않는다.
- artifact 담당과 합의: 후보의 `artifact_ids`는 선택 task 출력에 속하며 각 선택 task에 적어도 하나 존재해야 한다. direct는 관측 assertion 산출물 합집합, consumer 확장은 새 consumer의 전체 outputs, 미지원/stale 및 섞인 미확인 실패는 해당 task 전체 outputs를 유지하고 fallback 이유를 명시한다.

## 순서와 검증

1. D068 known incident를 고정 assertion 계약으로 일반화하고 공개 checker 기록 경계를 구현한다. 우선 출력 경로 거부/허용과 그 뒤 누락 hook assertion을 대상으로 하며 나머지는 fallback이다.
2. 실제 runtime/artifact/source binding과 계약 hash를 확인해 scope로 연결한다. stale·가짜 ID·중복/누락 결과·case 내부 미도달 반례에서 잘못 좁혀지지 않아야 한다.
3. 정상/결함 synthetic 공개 control로 기존 조건과 실패 중단 순서를 확인한다. provider/Docker 없이 확인 가능한 targeted 검증을 수행한다. 전체 frozen Docker controls의 source hash는 새 root 검증이 필요하며 과거 receipt를 고쳐 통과시키지 않는다.
4. 통합 API·검증 수·현재 hash·한계를 root와 독립 reviewer에게 인계하고 쓰기를 종료한다. 실측 완료/효율은 root의 새 D069 결과에서만 기록한다.

## 구현과 targeted 검증

공개 계약에는 `T.integration.diagnostics`의 고정 assertion 네 개를 등록했다. `existing-output-refused`/`overwrite-accepted`는 R03.04의 CLI 경계 `pyclientgen/cli.py`, `missing-hook-exit`/`missing-hook-diagnostic`은 R17.01의 `pyclientgen/hooks.py`로 연결한다. 현재 plan에서 해당 요구사항의 implementation owner와 실제 artifact binding path를 교차해 산출물을 찾는다. 경로가 없거나 모호하면 좁히지 않는다. 현재 지원이 네 assertion인 것이지 기존 85개 case의 모든 assertion이 정밀 매핑된 것은 아니다.

원래 통합 검사 끝부분을 `output_policy_checks(h,c,fixture,exercise_sample)`로 추출하고 원래 predicate·subprocess 호출 순서·fixture·assertion count·실패 중단을 유지했다. metadata 기록은 판정 조건을 추가하거나 느슨하게 만들지 않는다. 기존 case ID 85개와 check version3은 유지하며 새 계약 hash와 source pins로 새 scaffolding을 구분한다. 선언만 된 후속 assertion은 `not_reached`이고 실행 수에 포함하지 않는다. 앞이나 중간의 미등록 assertion/생성 코드 검증이 실패하면 `failed_assertion_id`가 없으므로 전체 case의 보수적 fallback이다.

root와 reviewer가 확인한 한계: 경로는 **공개 인터페이스의 수리 후보**이며 실제 잘못된 내부 파일이라는 증거가 아니다. 결과와 후보 설명에 `public_interface_candidate_not_fault_proof`를 남긴다. tracked 실패는 작은 artifact 후보·선언된 consumer·stop을 제공한다. 다른 내부 파일이 원인이면 좁은 수리는 실패할 수 있다. 동일 실패의 지원된 metadata만으로 항상 full-task 후보를 다시 합쳐 큰 입력을 복원하지 않는다. 새 공개 검사 실패를 다음 round에서 다시 평가하며 write scope를 조용히 넓히지 않는다. 지원 밖/변경된 근거는 전체 task outputs fallback이고 토큰 admission에 걸리면 이유를 남기고 멈춘다.

다음 targeted 검증을 수행했다.

- `node --test test/adaptive-repair-scope.test.mjs test/public-assertion-evidence.test.mjs`: **28/28 pass**, fail/skip 0, 1,853.60625ms. 기존 정적 blocker 검증을 유지하고 실제 공개 helper의 정상/기존 빈 디렉터리 허용 결함/hook 문구 결함/앞·중간 미등록 실패 synthetic controls를 실행했다. 제품 후보 생성·설치·Docker 검증은 아니다.
- 같은 검증에서 source bytes·parsed contract·hash 불일치, 누락/중복 assertion, runtime checker·artifact revision 변경, 모호한 artifact path는 좁히지 않았다. 하나의 task에서 정밀 mapped failure와 미등록 failure가 같이 생기면 그 task의 전체 outputs를 유지했다.
- `node --test --test-name-pattern='all 85 public IDs' test/dag-public-checks.test.mjs`: **1/1 pass**, 670.83525ms. 공개 ID/source mapping을 확인했으며 전체 실제 공개 검사를 통과했다는 뜻은 아니다.
- 위 검증 후 테스트의 Python 실행에 `-B`를 추가해 isolated import의 `__pycache__` 생성도 방지했다. 이 변경은 생산 checker와 검사 의미에 영향을 주지 않는다.

변경 파일: `benchmarks/e2e-swe/public-checks/assertions.json`, `run_public_checks.py`, `extensions/cli_config.py`, `src/orchestration/adaptive-repair-scope.mjs`, `test/public-assertion-evidence.test.mjs`, `test/dag-public-checks.test.mjs`, 이 역할 문서. registry/inventory의 기존 85개 매핑은 변경하지 않았다. current controls test는 root가 새로 생성할 `results/d069-local-controls-v3.json`을 읽도록 연결했고 과거 controls receipt는 보존한다. root가 소유한 audit helper의 pin/default 경로 변경과 함께 검증한다.

## 소스 동결과 남은 검증

root의 fresh controls 시작 전에 공개 checker 세 파일을 동결했다.

| 파일 | SHA-256 |
|---|---|
| `public-checks/assertions.json` | `991bcd8c6e88d8a11d607b271e29808442cd6dae66c639210ca4d9a7630fc992` |
| `public-checks/run_public_checks.py` | `f6403fcce0cf0e33646ac2698379d75fcc1e445291515b327fa6948753f64636` |
| `public-checks/extensions/cli_config.py` | `d05a1b86a54b577b4e54f6403be7978492b182f758ba1ecda3515f0aa54db158` |
| `src/orchestration/adaptive-repair-scope.mjs` | `a1d5ca99fd4c3d062b24ecb32d88edf33bc5364e77a9ba4fdec9ee1af5508165` |

진행 상태: targeted 검증 완료, 생산 쓰기 중단. 독립 reviewer의 반례 점검과 root의 새 controls·D068 읽기 전용 후보 재생·새 D069 paid run은 이 역할의 미완료 독립 단계다. 검토 중 생산 변경이 필요하면 root에 먼저 알려 실행 중 영수증을 무효화하지 않는다. 실제 수리 성공·총 완료시간·비용 절감은 아직 이 역할에서 측정하거나 주장하지 않았다.
