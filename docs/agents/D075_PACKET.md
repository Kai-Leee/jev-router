# D075 — 수리 입력 재구성·실제 소스 근거

## 목적과 소유권

2026-10-12. 담당 `d067_budget`. D073의 큰 수리 선택 입력, 두 번째 owner 요청 실패, 선택 A10 무변경 수리를 공개 근거로 대조한다. 원문 실패·관련 요구·전체 기존 artifact 선택/인터페이스·의존 계약을 유지하면서 정확한 중복은 같은 입력 안의 명명된 참조로 바꾼다. 별도 승인된 의미 선별은 아래 조건으로만 적용한다. 로컬 토큰 상한은 추가하지 않는다.

신규 소유 파일은 `src/orchestration/adaptive-repair-input.mjs`, `docs/orchestration/contracts/adaptive-repair-input.v1.json`, 집중 테스트와 새 private replay 기록이다. Root가 승인한 최소 확장으로 `adaptive-inferred-repair.mjs`의 명시 opt-in hook과 `adaptive-dag-planner.mjs`의 옵션·실제 전송 callback도 소유한다. 기존 옵션 없는 v1/v2 전송 bytes와 의미는 보존한다. 실행기/runner/gate는 각 담당이 소유한다. 기존 파일의 첫 사본은 `benchmark-runs/d075-packet-01/source-before/`에 보존했다.

## 연결 계약

- `repairInputPolicy: 'evidence-v1'`를 `ownerInputPolicy: 'inferred-v2'`와 함께 명시한다. owner 요청 생성→응답 검증→scope 적용→candidate/worker 검증이 실제 전송 request SHA를 재현한다. 전송 단계에서만 내용을 바꾸지 않는다.
- `projectRepairDecisionRequest(request, {stage, recoveryEvidence, relevanceContext})`는 `{request, report}`를 반환한다. `restoreRepairDecisionRequest`는 controller 보존 원문과 정확히 대조한다. `verifyRepairInputOverride`는 원문 복원과 정본 정책 재적용까지 검증한다. 모델이 로컬 evidence 경로를 읽는다는 가정은 하지 않는다.
- `collectRepairSourceEvidence({sourceFiles, planning, artifactBindings, failure, previous_action, repair_history})`는 controller가 이미 읽기 권한·immutable snapshot을 확인한 `{artifact_id,path,revision,sha256,text}`만 받는다. bytes/hash/current artifact 연결을 다시 검증하며, 파일 실행·네트워크·키 접근은 없다. 모델에는 선정한 실제 source line 범위와 선정 근거를 inline 전달한다. 정적 관계는 런타임 결함 증거로 승격하지 않는다.
- `createRepairInputRecovery()`는 executor의 `recoverFailure(context, {round_index})` callback이다. 같은 projection/request 또는 새 원인 근거 없는 재호출은 `needs_evidence`다. input-limit 복구 proof는 actual serialized body SHA, state SHA, 보존 report SHA를 연결한다.
- 소스 근거는 `failure.recovery_evidence`에 남기고 owner/chooser/선택 worker 입력에 연결한다. 기존 body/context guard나 불확실 지출 정산 규칙을 우회하지 않는다.
- `repairInputContext: {assertionContract, runtimeBinding}`는 controller 전용 연결 검증 자료다. 실제 assertion 원문 SHA·parsed contract·checker manifest·plan/environment/binding·현재 artifact revisions가 일치할 때만 의미 선별을 허용한다. 이 객체를 모델에 반복 전송하지 않는다.
- `chooseAdaptiveRepair`는 `repairInputPolicy`, `requestOverride`, `recovery`, `onRequest`를 받는다. override 검증 후 actual request를 `onRequest`·이벤트·최종 decide에 동일하게 전달한다. owner build→infer→apply→candidate→worker 검증도 실제 wire SHA를 사용한다.
- `validateRepairInputState`는 전송 packet 내부 참조·규칙·형식만 검증한다. report 없는 wire gate가 원문 복원·관련성·실제 source bytes를 입증한다고 하지 않는다. 전송 gate는 새 D075 prompt-policy v2로 pin하며 D074 정책은 유지한다.

## 세 단계의 보존 차이

1. Exact 참조는 같은 attribution과 description 관측만 공유한다. 다른 필드는 literal override로 남기며 controller 복원 결과가 원문과 같아야 한다.
2. `resolved-unrelated-v1`는 별도 의미 선별이다. 같은 현재 revision에서 실제 passed이고 일치하는 이전 failure가 resolved이며, bound assertion 요구가 현재 실패·causal·새 source 요구와 무관하다고 확인된 경우에만 description 상세를 요약한다. check/test/assertion·이전 error/message·현재 passed 상태와 전체 공개 case coverage/count는 inline 유지한다. 제거한 상세·원문 SHA·근거·binding은 report에 보존한다. 현재 실패, unknown, not-reached, 불명확한 관계, 빈 requirement/path 매핑, stale revision은 원문을 유지한다.
3. Source evidence는 단계별로 다르다. owner에는 실제 import·공개 signature·export 경계만 보이며 생략한 body를 읽었다고 주장하지 않는다. chooser/worker는 collector가 선정한 전체 범위를 받는다. 선정된 범위 자체도 전체 파일은 아니다. line text는 현재 파일 bytes와 정확히 일치하고 정적 import/의존 관계는 결함의 확정 증거가 아니다. 읽기 추가는 쓰기 권한을 늘리지 않는다.

`semantic_values_removed`는 요약된 description 필드 개수다. `source_evidence_projection.omitted_line_count`는 owner에서 제외한 source 줄 수로 별도 기록한다. 둘 중 하나라도 생략되면 `lossless_model_input: false`다. Controller 원문 복원이 가능하다는 사실과 모델 입력이 무손실이라는 주장을 구분한다.

## 검증 계획과 경계

D073 old chooser, new02 round2 owner 원본은 읽기 전용으로 재생한다. 원문 실패·not-reached 구분·요구·candidate 권한·모든 artifact/owner/인터페이스와 차이가 있는 이력은 그대로 유지하고, 실제 wire bytes와 exact restore를 기록한다. source evidence는 generic producer/consumer 선택, 틀린 hash·없는 artifact·무관한 source·변경 없는 evidence 반례로 검증한다. 숨김 grader/정답 패치/실제 provider·Docker·장부 접근은 0이다. 형식·복원 통과는 provider 수락이나 개발 완료 증거가 아니다.

## 최종 오프라인 검증과 상태

입력/owner/planner 집중 검증 `focused-tests-07.log`: 20/20, 307.252042ms. 이전 planner/executor 연결 검증 `planner-execution-tests-01.log`: 11/11, 4,485.95425ms. Source body가 owner에는 없고 chooser/worker context에는 있으며, candidate의 정확한 쓰기 범위는 유지되는 fixture를 확인했다. 아직 실제 CLI worker가 새 근거를 소비한 실험은 아니다.

정본 재생은 `benchmark-runs/d075-packet-01/replay-06/result.json`이다. 각 request/report에 input/output SHA·보존 proof·inline source 범위가 있다.

| 실제 저장 입력 | 원래 wire | Exact 참조 | 관련성 선별 | 새 source 포함 owner |
| --- | ---: | ---: | ---: | ---: |
| D073 old 수리 선택 | 91,861B | 75,101B | 75,101B | 해당 없음 |
| D073 new 최초 owner 14문항 | 76,748B | 72,567B | 72,567B | 해당 없음 |
| D073 new round2 owner 2문항 | 76,562B | 68,416B | 63,449B | 86,580B |

Round2는 새 source가 없을 때 resolved description 16필드를 요약한다. 현재 collector의 9개 파일/30,015B source evidence를 추가하면 일부 artifact의 requirement 관계가 불명확해 `UNKNOWN_NEW_SOURCE_REQUIREMENT_RELATION`으로 과거 상세를 유지한다. owner에 보이는 source는 18,136B, 제외된 body는 196줄이다. 그 결과 86,580B는 원래 실패 입력보다 크다. 이를 context 적합성 또는 효율 개선으로 승격하지 않는다. 전체 source를 owner에 넣었던 중간 93,306B 결과도 `replay-03/`에 불변 보존했다. Chooser/worker에는 선정된 30,015B 범위가 inline으로 유지된다.

기존 옵션 없는 request 재생은 v1 26문항 187,728B / 14문항 158,187B와 metadata 모두 동일하다. 기존 v2는 저장한 request와 각각 91,569B / 76,748B wire 동일이다. 이 검증은 신규 opt-in이 역사 request를 바꾸지 않는다는 경계다.

생산 소스는 최종 `source-handoff.json`의 SHA에서 동결한다. 정확 모델 토큰·실제 provider 수락·개발 속도 효과는 미측정이다. API·키·장부·Docker·hidden 접근은 0이며 실제 실행은 root가 담당한다. 추가 입력 최적화는 이번 동결 후 임의로 진행하지 않는다.
