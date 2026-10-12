# D075 복구 실행 제어

담당: `/root/d067_runner`. 시작일: 2026-10-12.

## 목적과 소유권

D074 설계 분기를 실제 opt-in executor에 연결한다. 소유 파일은 `src/orchestration/adaptive-dag-execution.mjs`, 새 `src/orchestration/adaptive-failure-recovery.mjs`, 새 실행 정책 `docs/orchestration/contracts/adaptive-failure-recovery.v1.json`, 해당 집중 테스트다. runner·전송 gate·보존 후보 wrapper·입력 재구성은 다른 담당과 합의한 callback으로 연결한다.

기존 기본 실행과 D073/D074 원본을 보존한다. 유료 API, 키, 실제 장부, Docker, 숨김 검사는 접근하지 않는다. 로컬 토큰·비용 상한이나 자동 SDK 재시도를 추가하지 않는다.

## 시작 시 확인한 문제

기존 executor는 공개 실패 뒤 owner 추론과 repair 선택으로 바로 진행한다. 이전 worker가 파일을 바꾸지 않았거나 실패가 그대로인 경우에도 새 근거를 요구하지 않는다. owner/chooser의 known input-limit 종료는 원인을 기록하지만 입력 재구성 handler가 없다. uncertain 결과는 이미 중단하며 이 경계를 유지한다.

## 확정 실행 계약

- 명시 옵션 `failureRecoveryPolicy: 'evidence-loop-v1'`으로만 활성화한다.
- `recoverFailure(context, metadata)`에는 현재 공개 실패·선택 scope·검증된 source/revision·이전 수리·분기 action을 제공한다. 새 evidence 또는 변경 request proof를 검증한 뒤 다음 동작을 허용한다.
- 결과·정산 불확실은 `reconcile_request`. callback과 새로운 POST를 허용하지 않는다.
- 파일 무변경/무진전은 조사 action. attempt ID·시간·표현만 바뀌거나 profile만 바뀐 것은 새 근거로 인정하지 않는다.
- 일부 실패 해소는 남은 현재 관측 실패로 담당 추론한다. 모든 공개 검사를 다시 수행하는 기존 완료 gate를 유지한다.
- 입력 한도 거절은 새 packet과 coverage proof, 실제 전송 gate가 검증하는 새 request SHA를 요구한다. 같은 request 자동 재전송은 없다.
- 검증 환경 문제와 unknown 선택은 제품 담당 오류로 바꾸지 않고 별도 evidence 요구 상태를 남긴다.

추가 옵션 `repairInputPolicy: 'evidence-v1'`은 owner·chooser·worker 입력의 실제 projection/검증에 전파한다. `historicalRepairHistory`는 현재 run의 round 수에 합치지 않는다. 역사 history seal/source/catalog 및 현재 실패 관측·관련 revision이 정확히 같을 때만 최초 조사 분기로 활성화한다. `repairInputContext`에는 현재 공개 assertion 계약과 runtime binding을 전달하며, 다음 worker의 재생 검증은 선택 당시 context를 사용한다.

`recoverFailure` 반환은 `status: 'ready' | 'needs_evidence'`, `evidence`, 선택적 `input_rebuild: {request, report, recovery}`다. source evidence는 controller가 검증한 `{artifact_id,path,revision,sha256,text}`와 exact line ranges에 연결한다. 기존 프로젝트의 다른 producer를 읽어 새 원인 가설을 찾을 수 있지만 쓰기 후보를 늘리지 않는다. 같은 파일·revision·SHA의 line coverage를 이미 알면 순서 변경·범위 분할/합병·새 설명은 새 근거가 아니다. 같은 파일의 추가 줄은 기존 줄과 합치며 다른 메타데이터는 `prior_observations` 원문으로 보존한다.

실제 source/model 판단 근거는 `failure.recovery_evidence`로 owner·chooser 및 선택 worker에 전달한다. 해시만 모델에 주고 로컬 파일을 읽을 수 있다고 가정하지 않는다. 입력 재구성은 `verifyRepairInputOverride`의 exact source 복원·canonical replay와 coverage hash를 확인한다. chooser callback metadata의 `on_request`는 실패한 실제 전송 본문을 수집하며, `request_override`/`recovery`는 새 본문과 proof를 전달한다. owner helper는 override를 실제 request/result seal에 반영한다. gate는 전송 직전에 실제 SHA·직전 같은 stage의 known 실패·정산 완료를 다시 검증한다.

## 실제 실행 경계

- D074 JSON은 수정하지 않고 SHA로 고정해 읽는다. 기존 설계 transition의 action과 요구 근거를 실제 assessment에서 대조한다. 새 정책에서 부분 진전 중 무변경 범위와 전송 무결성 차단 분기를 보완했다.
- 전역 실패 수가 줄어도 persistent failure와 selected-but-unchanged artifact가 함께 남으면 `inspect_no_write_cause`가 다음 owner/profile보다 먼저 실행된다. 이것은 무변경 파일의 결함 확정이 아니라 추가 조사 필요성이다.
- `adaptiveWorkerRecoveryIdentity`는 해당 작업의 관측 실패·읽기/쓰기·관련 revision·새 source coverage를 해시한다. 정확히 다른 작업에 매핑된 실패가 해결돼도 이 작업의 identity는 바뀌지 않는다. 매핑이 불명확하면 관측을 삭제하지 않는다. 이 값은 Claude 실제 wire SHA가 아니다.
- 전송 policy/source/proof 무결성 오류와 분류되지 않은 terminal 실패는 ready로 떨어지지 않는다. 명시 중단하며 source prose로 우회하지 않는다.
- 결과 불확실·미정산은 recovery callback도 실행하지 않는다. 실제 전송이나 장부를 이 모듈이 자동 정산하지 않는다.
- 검증 환경·계정·연결·독립 검증 복구는 필요한 외부 근거 상태를 기록한다. 이 controller는 환경을 자동 변경하거나 숨김 검사 내용을 수리 입력으로 읽지 않는다.
- 기존 `maxRepairRounds` 의미와 모든 공개 검사 재실행은 유지한다. 토큰/가격 상한은 추가하지 않았다. SDK 재시도는 0이고 새 입력/근거 없이는 추가 호출이 없다.

## 영수증

결과 `failure_recovery`에는 `policy`, `actions`, `terminal`, `historical_repair_history`를 남긴다. 이벤트는 `adaptive_failure_recovery_assessed`, `adaptive_failure_recovery_requested`, `adaptive_failure_recovery_completed`, `adaptive_failure_recovery_blocked`, `adaptive_worker_input_committed`, `adaptive_worker_duplicate_blocked`다. action에는 round/stage/condition/failure identity, 조사 input hash, 새 evidence hash/count, 변경 request/coverage proof가 들어간다. 기존 hash-chain journal에 순서와 시간이 남는다.

## 오프라인 근거와 남은 검증

`benchmark-runs/d075-recovery-01/source-before/manifest.json`에 수정 전 source를 보존했다. `d073-public-replay.json`은 D073 `focused-new-02`의 공개 원문을 읽어 다음 세 시점을 구분한다.

1. 공개 검사 직후: 12개 실패 해소, 2개 persistent failure, A10 무변경 → `repair_remaining_scope_no_change / inspect_no_write_cause`.
2. 이후 실제 HTTP400 model_input_limit 종료 시점 → `rebuild_relevant_input`.
3. 동일 공개 관측·revision의 역사 이관 → 첫 owner 호출 전 `inspect_no_write_cause`.

원본 SHA는 읽기 전후 동일하다. 이 담당의 provider/Docker/장부/hidden 접근은 0이다. 실제 새 수리 성공, 속도, 비용은 root의 새 실행과 공개/독립 검사 이후에만 보고한다.

최종 집중 검사: `node --test test/adaptive-failure-recovery.test.mjs test/adaptive-dag-execution.test.mjs` → **31/31 통과**, 실패 0, 약 33.69초. 기존 기본 실행 검사 17개를 포함한다. 추가 검사는 부분 진전 중 무변경 scope 차단, task별 동일 입력, 실제 gate 오류 3종·미분류·outstanding의 callback 1회 종료, uncertain 복구 callback 0회, exact source/history binding, 범위 재포장 우회, 임의 request/proof 거부에 집중했다. 결과 원문은 `benchmark-runs/d075-recovery-01/focused-tests.txt`다.

독립 검토에서 발견한 source 범위 순서/재묶음 우회는 line coverage 정규화로 수정했고, 알 수 없는 전송 실패가 정상 first-choice 분기로 돌아가는 경계는 명시 terminal 중단과 failed-decision 방어로 수정했다. 모의 fixture의 artifact 목록이 없는 task 단위 후보는 실제 task outputs로 scope를 해석한다. 이 fallback이 기존 실제 inferred artifact 후보를 확장하지 않는다.

생산 source와 테스트는 이 검사 뒤 동결했다. 예외는 독립 검토에서 확인한 결함 수정뿐이며, 변경 시 새 검증/해시를 남긴다. 반환 상태 `needs_evidence`는 완료도 provider 수락도 아니다. 연결·계정·검증 환경 복구는 외부 근거가 필요하고, 자동 입증이나 무조건 재호출을 제공하지 않는다.

## 독립 검토 후 인계 02 — callback 검증 기준 격리

검토에서 `sourceFiles`만 callback과 controller 검증이 같은 배열을 공유한다는 결함을 확인했다. callback이 사본이 아닌 그 배열의 text와 SHA를 함께 바꾸면 실제 파일 변경 없이 가짜 근거가 통과했다. 수정 전 반례는 추가 round까지 진행해 실패했으며 `callback-mutation-before-02.txt`에 보존했다.

`recoverFailure` 입력 객체 전체를 한 번 `structuredClone`하여 callback에 제공한다. controller의 sourceFiles·failure·planning·bindings·candidates·현재/역사 history·실패 request는 callback 입력과 공유참조가 없다. 반환 근거는 controller 원본으로 검증한다. 수정 전 소스는 `source-before-02/manifest.json`에 별도 보존했다.

변조 회귀와 정상 대조는 **3/3 통과**했다. 가짜 text+SHA는 `ADAPTIVE_RECOVERY_EVIDENCE_BINDING`으로 차단되어 두 번째 수리 선택/worker가 없다. 정상 원문 근거는 다음 수리와 모든 공개 검사까지 완료하며, callback 안의 planning/write scope/bindings/candidates/failure 변경은 실행 권한이나 공개 결과에 영향을 주지 않는다. 결과는 `callback-mutation-after-02.txt`다.

업데이트된 두 집중 테스트 파일 전체는 **34/34 통과**, 실패 0, 약 37.97초다. 새 원문은 `focused-tests-02.txt`, 현재 인계는 `source-handoff-02.json`이다. 기존 01 결과를 덮어쓰지 않았고 유료 호출·실제 후보 변경은 수행하지 않았다. 이 수정 뒤 담당 생산 소스는 다시 동결했다.
