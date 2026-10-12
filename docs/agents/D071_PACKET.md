# D071 — 수리 판단 입력의 범위와 전송 형식

담당: `d071_preflight`. 2026-10-12. 목적은 공개 실패의 실제 값·요구 원문·원인 경로·수리 이력을 유지하면서 Jev의 반복 판단 입력을 명확하게 만드는 것이다. 실제 호출·Docker 실행·최종 비용 비교는 root 담당이다. 기존 D070 및 D071 실패 영수증을 수정하지 않는다.

## 최종 전송 방향

**D071의 실제 선택기는 읽을 수 있는 projected JSON을 전송한다.** `adaptive-causal-repair.mjs`의 `buildCausalRepairDecisionContext`가 판단용 투영만 적용한다. 아래 dictionary/fragment codec은 입력 크기를 조사한 오프라인 실험으로 보존하며 실제 선택 경로에 적용하지 않는다. 코드에서 정확히 복원된다는 사실은 Jev가 추론 중 그 사전을 올바르게 해석한다는 증거가 아니다.

24,000 wire bytes는 기존 내부 운영 기준이었으며 제공업체의 토큰 상한으로 확인된 값이 아니다. Root는 읽기 쉬운 입력을 유지하면서 v3의 byte guard만 **48,000 B**로 조정했다. 기존 v1/v2 및 per-question 32,000/global 64,000 token 추정 한도는 별개로 유지한다. Preview04는 전체 serialized request hash에 연결한 v3 `admit_estimated` 결과를 기록한다. 정확한 모델 tokenizer·provider 수락·실제 사용량은 아직 측정하지 않았으며 이 로컬 admission을 수락 보장으로 부르지 않는다. Byte 감소를 실제 토큰·비용·응답 속도 절감으로 환산하지 않는다.

## 의미 투영과 보존 범위

`src/orchestration/adaptive-causal-packet-encoding.mjs`의 `projectCausalChooserPacket`은 의미 투영을 명시적으로 `lossless: false`로 기록한다. 판단에 넣지 않은 원문은 controller 보고서에 정확한 JSON pointer, 원래 값, canonical SHA-256, UTF-8 bytes, 이동 이유와 함께 보존한다. 이 보고서는 모델 입력이 아니다.

- 실패·혼합·불확실·미실행 공개 관측은 본문을 그대로 유지한다. 알려진 성공 suite만 각 test ID와 assertion 수, 통과/실행/skip/미실행 상태 및 원본 report 참조로 요약한다. 원래 85개 통과와 추가 8개 실패를 없애지 않는다.
- 원인 경로의 artifact ID, 소유 task, 실제 경로, 역할, 근거 문장은 유지한다. 비원인 read-only dependency의 전체 파일 binding은 worker/controller에 남기고 ID 목록을 판단 입력에 둔다. 인과 후보 관계를 DAG 의존성으로 변경하지 않는다.
- 실패 assertion 또는 causal-chain의 `requirement_ids`에 연결된 요구사항 원문은 모두 유지한다. 연결되지 않은 **알려진 unit 요구사항**만 worker/controller로 옮긴다. unit에 연결되지 않은 요구사항은 남긴다. 누락·미해결·불확실 관측, 원문이 없는 requirement ID, 현재 실패와 연결되지 않은 과거 이력이 있으면 전체 요구사항을 유지한다. 이때 크기가 커지면 admission이 거절해야 하며 자동으로 내용을 버리지 않는다.
- 전체 구현 interface는 worker 입력에 유지한다. chooser는 unit/artifact/요구/근거/원인 경로와 명시적인 worker-only 참조를 받는다. 이 참조는 조회 또는 쓰기 권한을 주지 않는다.
- 현재 profile은 법적 후보 task와 causal owner의 worker에 연결된 것만 유지할 수 있다. task→worker 연결이 불완전하면 전체 profile을 유지한다. binding에 없는 worker ID도 지우지 않는다. 다른 작업자의 원문 profile은 controller 보고서에 보존한다.
- 현재 결정의 후보·근거·허용 쓰기/읽기 범위, 앞선 수리 선택, 실제 변경 파일, before/after 관측, persistent/resolved/unobserved failure를 유지한다. SHA-256만 `hN`으로 바꾸는 경우 같은 원문 hash에는 같은 alias를 써서 동일/변경 관계를 유지한다. 원문 hash와 정확한 field path는 controller 보고서에 있다. 요구사항·실패 문장에 우연히 64자리 hex가 있어도 임의로 hash로 바꾸지 않는다.
- before/after 관측이 현재의 유일한 failed public case와 **check/test/assertion ID 및 전체 관측 값**까지 정확히 같을 때만 `same_as_current` 참조로 바꾼다. 현재 공개 case 본문은 원문 그대로 inline에 남으며 외부 조회가 필요 없다. 오류·메시지·전체 provenance 중 하나라도 달라지거나 역사 관측에 새 필드가 있으면 그 원문을 유지한다. 같은 test라도 과거 assertion ID가 달라지면 요구 연결을 확인했다고 간주하지 않고 전체 요구사항을 유지한다. 이 참조는 관측이 같다는 뜻이며 파일 변경이 없었다거나 수리가 성공했다는 뜻이 아니다.
- 중복 `context_ref`, `causal_contract`, `contract_source` 및 후보 허가용 cryptographic binding은 controller 보고서로 옮긴다. 실행기는 여전히 원본 계약·candidate binding·현재 revision을 검증한다. 선택 결과가 쓰기 권한을 확장할 수 없다.

`restoreCausalChooserPacket(projected, report)`는 report 자체 hash와 projected identity를 검증한 뒤 alias를 되돌리고 omission을 역순으로 복구한다. 추가한 참조 marker를 제거한 최종 값이 원래 입력 hash와 같아야 한다. 이 self-integrity 검사는 우발적 누락·변조를 잡기 위한 것이며 외부 인증 서명은 아니다.

## API와 소유권

```js
projectCausalChooserPacket(state, {
  originalPublicEvidence,  // 원본 공개 report hash와 test ID/assertion 수 대조
  workerTaskBindings,     // [{ task_id, worker_id }], 원래 plan에서 제공
}) // { state, report }

restoreCausalChooserPacket(projectedState, projectionReport)
// 정확한 투영 전 chooser state. worker/provider 호출 없음.

// 아래 두 함수는 오프라인 전송 형식 실험에만 사용한다.
encodeCausalRepairPacket(state) // { state: encodedEnvelope, report }
decodeCausalRepairPacket(encodedEnvelope) // 정확한 원래 state
```

`buildCausalRepairDecisionContext`와 worker 연결은 `d067_budget`, 실제 chooser·입력 admission은 root 및 `d071_transport`가 담당한다. 이 역할은 packet 모듈, 집중 검증, 이 문서만 편집한다. 공개 audit의 별도 완료 기록은 [D071_PREFLIGHT.md](D071_PREFLIGHT.md)에 있다.

## 현재 확보한 검증

`node --test test/adaptive-causal-packet-encoding.test.mjs test/adaptive-causal-repair.test.mjs`는 최종 projection source에서 **21/21 통과**, 실패·skip 0, 총 258.908625 ms였다. 영수증: `benchmark-runs/d071-packet-preview-01/packet-tests-03.log`. 기존 18/18 및 19/19 로그도 각각 `packet-tests-01.log`, `packet-tests-02.log`에 보존했다. 이 시간은 로컬 집중 검증 시간이며 실제 개발·Jev 응답 시간과 관계없다.

검증은 93개 관측 및 실패/이력의 lossless codec roundtrip, 각 ref의 무효·누락·순환 거부, 음수 0·Unicode·literal marker·prototype-shaped field 보존, accessor/비 JSON 거부, 알려진 성공 요약의 정확한 ID/분모, 원인 경로 보존, 요구 연결이 불명확할 때 전체 유지, profile의 보수적 선별, controller 복원과 report 손상 거부를 포함한다. 독립 검토가 발견한 같은 test/다른 과거 assertion의 요구 누락 반례를 수정했고, history의 값 변경·알 수 없는 추가 필드·중복된 현재 ID·불확실 결과에는 참조를 적용하지 않는 검증을 추가했다. Worker의 실제 파일 수정 성공, Jev 응답 품질, 개발 완료는 이 테스트로 검증하지 않았다.

동결 source: `src/orchestration/adaptive-causal-packet-encoding.mjs`, SHA-256 `44b3bdb5b60d47de425d40fea67f0e1dfe6b2f56d6df541f215885aa3e84b9d1`. 앞선 scope-only source `6d5b...14ce`와 assertion-identity 수정 source `16c3...a78c`의 측정은 그 source에 한정한다.

## 크기 실험과 실패 보존

모두 `prepareDecision` 이후의 **전체 request UTF-8 byte**를 분모로 한다. API 호출 없이 현재 chooser callback을 대체한 로컬 preview다. 과거 D070의 실제 관측값을 사용한 preview에는 새 assertion labels/runtime metadata를 붙인 합성 envelope가 있으므로 현재 v4 실행 증거라고 부르지 않는다.

| 조건 | 첫 요청 | 과거 수리 1회 포함 | 경계 |
|---|---:|---:|---|
| 처음 전체 입력 preview01 | 50,352 B | 미측정 | 원본 영수증 보존 |
| 요구 범위 축소 전 dictionary codec, 실제 chooser preview02 | 23,909 B | 25,948 B | 24KB에서 첫 요청만 통과 |
| 승인된 요구 범위 투영 후 readable JSON, 과거 합성 envelope | 34,023 B | 별도 v4로 재측정 | R10.02 원문 유지, 비실패 unit 요구 15개 worker/controller 보존 |
| 같은 과거 envelope의 dictionary codec | 20,590 B | 별도 v4로 재측정 | 실제 전송에 사용하지 않음 |
| 실제 v4 관측 + 현재 profile metadata, readable preview03 | 38,866 B | 61,988 B | 48KB에서 첫 요청 통과·history 요청 거절; 현 source 이전 |
| 같은 실제 v4 자료 + exact-current history 참조, readable preview04 | 38,866 B | 44,542 B | 두 요청 모두 v3 `admit_estimated`; 현재 동결 source |
| preview04의 과거 실패 값 하나 변경 | 해당 없음 | 45,737 B | 다른 값은 원문 유지·정확 복원 확인; v3 `admit_estimated` |

`benchmark-runs/d071-repair-preview-01/`와 `benchmark-runs/d071-repair-preview-02/`는 변경하지 않는다. 추가 shared-record-constant prototype은 첫 요청 617 B, history 요청 699 B만 더 줄였고 별도 해석 규칙이 필요해서 production에 넣지 않았다. 영수증: `benchmark-runs/d071-packet-preview-01/layout-constants-prototype.json`.

`benchmark-runs/d071-repair-preview-04/result.json`에는 root의 실제 v4 공개 관측(`benchmark-runs/d071-public-candidate-recheck-01/public-evidence.json`)과 현재 per-task profile을 사용한 세 요청의 source/request/policy hash 및 admission이 있다. 원래 실패 관측 8개는 모두 남고, 같은 관측의 history 1회 요청은 61,988→44,542 B로 **17,446 B, 28.14%** 줄었다(분모 61,988 B). 이전 값 하나가 다른 조건도 그 원문을 보존한 채 원래 history와 deep equality를 확인했다. API 호출은 0이다.

History round 자체는 크기와 의미 보존을 위한 합성이며 실제 수리 성공 관측은 아니다. 더 많은 이력이나 다른 요구/실패는 입력을 다시 키울 수 있다. Admission은 매번 전체 요청을 재측정하고 넘으면 거절하며, 이를 피하려고 실패 원문을 버리지 않는다. 실제 provider/worker 실행 및 완료·총 시간·토큰·비용 비교는 root의 후속 실행 결과로 확인한다.

이번 manifest의 `max_repair_rounds`는 2다. 실행기는 `roundIndex=0..2`를 실행하지만 마지막 round에서는 history를 저장한 뒤 `roundIndex === maxRepairRounds` 조건으로 종료하며 `decideRepair`에 도달하지 않는다(`src/orchestration/adaptive-dag-execution.mjs`: 292, 518, 532, 566행). 따라서 이번 실제 chooser에 필요한 경계는 history 0회와 1회다. history 2회 이상을 추가로 호출하도록 확장하는 실험에는 별도의 크기·의미 보존 검증이 필요하다. 이를 위해 이번 동결 후에 추가 표나 codec을 넣지 않는다.

완료 산출물: `validation-02.json`은 최종 source와 21개 집중 검증 영수증을, `wire-validation-01.json`은 preview04 원본 report hash와 세 요청의 크기·admission·변경 관측 복원을 연결한다. 두 파일은 `benchmark-runs/d071-packet-preview-01/`에 새로 기록했다. 이 역할의 provider 호출·Docker 실행은 모두 0이며 과거 결과를 덮어쓰지 않았다.
