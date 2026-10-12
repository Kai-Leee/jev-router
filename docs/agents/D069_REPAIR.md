# D069 — 산출물 단위 수리

2026-10-11. 상태: 구현과 로컬 검증 완료, root 통합·실제 실행 대기. [역할 계약](D069_PARALLEL.md), [직전 원인](D068_PROJECTION.md)의 실제 요청 97,071 B와 12-unit leaf 문제를 출발점으로 삼는다. root가 실제 provider/Docker/장부/새 실행을 담당한다. 이 담당은 새 모듈·계약·focused tests와 `adaptive-dag-execution.mjs`/해당 test만 수정한다. 기존 D067/D068 후보와 숨김 검사는 읽거나 변경하지 않는다.

## 구현 전에 정한 경계

- assertion 담당이 검증한 후보 `artifact_ids`와 `task_ids`를 사용한다. 선택된 task가 실제 소유한 outputs에만 쓰기를 허용하며, 각 선택 task는 최소 하나의 선택 artifact를 가져야 한다.
- 실패 assertion→requirement→artifact 근거가 없거나 오래된 경우, 기존 task의 전체 output 범위를 명시적인 conservative fallback으로 유지한다. 요구사항이나 테스트 기대값을 제거해 좁은 성공을 만들지 않는다.
- 수리 판단에는 선택 가능한 artifact의 interface·원문 요구사항·원문 인용과 직접 task-input 의존 계약을 전달한다. artifact 밖의 다른 명세를 경로로 대체했다고 모델이 읽을 수 있는 것으로 가정하지 않는다.
- 수리 worker에는 해당 worker가 변경할 artifact의 경로·계약·요구사항과 실패 근거를 전달한다. 나머지 자체 outputs는 이전 snapshot에서 정확히 복사하고 변경 여부를 manifest로 다시 확인한다. 도구 쓰기 범위도 좁힌다.
- artifact-level 내부 의존 정보가 없는 경우 이를 모르는 것으로 표시한다. task-level input 목록이나 같은 task의 나머지 파일이 자동으로 정밀 artifact 의존 관계가 되는 것은 아니다.
- 외부 callback은 선택된 작업자에만 새 수리 호출을 한다. 나머지 작업자는 파일을 carry-forward하고 새 local 검사 및 전체 공개 검사를 다시 실행한다. 기존 검증 증명서를 재사용하지 않는다.

## 예정 API와 통합

`src/orchestration/adaptive-artifact-repair.mjs`와 `docs/orchestration/contracts/adaptive-artifact-repair.v1.json`을 추가한다.

```js
buildArtifactRepairDecisionContext({planning, failure, candidates, artifactBindings})
// -> {state, report}
buildArtifactRepairWorkerContext({planning, failure, candidate, task, artifactBindings})
// -> {task, context, report}
```

실행기 opt-in은 `artifactRepairPolicy: 'artifact-v1'`로 계획한다. Callback의 task는 좁힌 view이고 내부 DAG 계획·산출물 목록은 유지한다. `repair_context.artifact_repair`에 명시적 packet을 넣는다. Root가 planner와 runner를 연결하며, repair prompt에서 기존 전체 `public_source`/`shared_catalog`를 반복 전달하지 않도록 packet을 사용한다.

## 필요한 검증

산출물/소유자/경로/버전 불일치 거부, 요구사항·원문 인용 보존, 명시적 fallback, 한 task가 여러 파일을 소유해도 비선택 artifact 바이트·실행 권한이 동일한지, 허용 밖 파일을 고치면 실패하는지, 공개 전체 검사 재실행을 확인한다. D068 저장된 공개 요청·계획만으로 새 입력 크기를 replay하고 provider 수락이나 실제 효율이라고 해석하지 않는다. 실제 호출·숨김 검사 없이 확인 가능한 범위를 명확히 남긴다.

## 진행 기록

- 2026-10-11: 역할 문서를 먼저 작성했다. Assertion 담당과 후보 `artifact_ids` 계약을 조정 중이며 root에 API 초안을 전달했다. 생산 구현·검증·실제 실행 결과는 아래에 완료 후 추가한다.

## 최종 구현과 통합 계약

새 모듈과 JSON 계약을 구현했다. 위의 두 export는 모두 순수 입력 변환이다. Decision context는 독자적인 `adaptive-artifact-repair/v1` state이며 **D068 state projector를 다시 적용하지 않는다**. 내부에서는 `projectAdaptiveRepairFailure`를 한 번 사용하여 공개 case 85개, 오류·미실행·assertion metadata와 환경/버전 근거를 그대로 보존한다. 나머지는 후보 artifact의 정확한 unit 계약·요구사항·인용과 해당 task의 선언된 입력 의존 interface, 같은 소유자의 상속 파일 목록이다. 관측 실패의 requirement text도 union하여 다른 실패 문맥이 좁힌 범위에서 사라지지 않게 한다.

Worker export의 반환형은 `{task, context, report}`다. `task`는 외부 callback에만 보내는 좁힌 view이며 내부 DAG 원본은 유지한다. `context`를 `repair_context.artifact_repair`에 넣는다. Root runner가 이를 직접 prompt로 사용하고, 수리 호출에 전체 `public_source`와 `shared_catalog`를 재전달하지 않아야 입력 분리가 실제 적용된다. Transport의 쓰기는 narrowed `task.write_scope`, 읽기는 그 쓰기 경로와 `task.read_scope`를 합친 값이다. 같은 task의 다른 산출물은 read_scope에 들어가지만 쓰기 권한은 없다.

Scope에 넘기는 최종 옵션은 `assertionContract:{contract,source_text,sha256,source_path}`다. 실행기는 현재 round의 `runtime/binding.json`을 controller가 읽어 `runtimeBinding`으로 함께 전달한다. 후보의 `artifact_ids`는 assertion 담당이 검증하며, `attribution_basis:public_interface_candidate_not_fault_proof`를 그대로 유지한다. 공개 인터페이스가 고장난 구현 위치의 확정 증명이라는 뜻은 아니다. 모델이 필요한 변경 범위를 벗어난다고 판단하면 임의로 쓰기를 확장하지 않는다.

`artifactRepairPolicy:'artifact-v1'`에서 후보에 artifact mapping이 없으면 선택 task의 모든 output을 사용하는 `ASSERTION_ARTIFACT_MAPPING_UNAVAILABLE` fallback을 명시한다. 선택하지 않은 task에 검증된 snapshot이 없으면 `ADAPTIVE_ARTIFACT_REPAIR_UNREADY_UNSELECTED_TASK`로 worker 호출 전에 정지한다. 기존 D068의 미생성 task 최초 implementation 동작은 opt-in 밖에서 유지한다. 선택 scope 외 신규 worker 호출을 조용히 추가하지 않는다.

새 round에서 상속 산출물을 이전 snapshot으로 복사한 후, 실제 worker callback 뒤에 파일 내용 SHA·크기·실행 권한·디렉토리 목록을 원래 manifest와 대조한다. 다르면 `ADAPTIVE_ARTIFACT_REPAIR_CARRY_DRIFT`로 알려진 실패를 기록하고 추가 수리 전에 중단한다. 내부 DAG의 원래 output 목록과 local/public checks는 유지하므로 비선택 산출물도 사라질 수 없다.

## 실행 기록 해석

- `adaptive_leaf_operation.write_scope`는 원래 DAG가 소유한 runtime 범위다. 이를 실제 narrowed worker의 쓰기 허용 범위로 해석하지 않는다.
- 실제 선택·허용 범위는 `adaptive_artifact_repair_prepared.artifact_ids`, `allowed_write_paths`와 실제 worker request의 `task`에서 확인한다.
- `adaptive_artifact_repair_inheritance_verified.inherited_artifacts`에 artifact ID, 이전 revision, 다시 계산한 manifest SHA, 파일 개수·바이트 수를 남긴다. `original_dag_outputs`로 전체 산출물 보존도 확인한다.
- `adaptive_artifact_repair_rejected`는 바이트/권한/구조 보존 실패를 나타낸다. Worker 결과나 모델 선택을 검사 성공으로 승격하지 않는다.

## 검증과 D068 공개 기록 재생

명령 `node --test test/adaptive-artifact-repair.test.mjs test/adaptive-dag-execution.test.mjs` 결과 **20 passed / 0 failed / 0 skipped, 20,359.119625 ms**. 두 생산 모듈의 `node --check`도 exit 0이다.

Fresh Node filesystem fixture에서 core worker가 core+metadata를 원래 소유해도 core만 수정하도록 전달했다. 선택된 core/ui 두 worker만 수리 호출하고 tools는 호출 없이 상속했다. metadata의 바이트와 전체 파일 permission mode가 이전 후보와 같으며 revision도 같았다. 공개 검사 7개를 두 round에서 모두 실행했다. 비선택 metadata 내용 또는 실행 권한 변경은 공개 검사 전에 알려진 실패로 거부했고, 아직 생성되지 않은 비선택 task는 추가 callback 0회로 정지했다. 이는 로컬 실행기 검증이며 Claude/Jev 모델 호출 증거는 아니다.

`benchmark-runs/d069-repair-01/result.json`에 소스·테스트·D068 공개 입력 10개 SHA, 입력 보존, 85 case 원문 보존과 정확한 실패 객체 복원 검증을 기록했다. D068의 실제 후보 파일은 읽지 않았다.

| 재생 수준 | Decision state / wire | Worker packet | 의미 |
| --- | ---: | ---: | --- |
| D068 원래 3/4-task 후보 + 명시적 전체-output fallback | state 83,872 B; 같은 역사적 질문을 붙인 wire 85,282 B | 미측정 | D068에는 새 assertion pin이 없으므로 15 units·55 requirements 유지 |
| 향후 CLI artifact `A03` 선택의 명시적 packet fixture | state 51,362 B | 52,210 B | 모델 선택·역사적 attribution으로 주장하지 않는 prospective rehearsal |

두 번째 fixture는 과거 실패 case의 요구사항 9개를 좁혔다고 조작하지 않는다. 선택 unit의 5개 원문과 union하여 총 12개 요구사항을 보존했다. 원래 큰 leaf의 50개 요구사항·16개 쓰기 경로 전체를 반복 전달하지 않으며, `pyclientgen/cli.py`와 `pyclientgen/__main__.py` 두 경로만 쓰기 대상으로 제공한다. 다른 자체 산출물 12개는 읽을 수 있는 상속 목록으로 남긴다. 이는 새 assertion 근거로 실제 선택한 결과가 아니며, root가 새 runtime/public recheck에서 얻는 assertion report를 사용한 최종 replay와 구분한다.

실제 provider 호출, Docker, 실제 장부·키·숨김 검사·과거 후보 파일 접근은 0이다. 모델 토큰·수락·실제 수리 성공·효율은 미측정이다. 다음 단계는 root의 새 공개 assertion recheck, token admission 통합, exact final request 검사와 승인된 실제 실행이다.
