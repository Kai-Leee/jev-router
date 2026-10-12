# D073 — 실패별 기존 담당 추론

## 입력 v2 후속 역할 — 2026-10-12

두 최초 유료 조건이 종료하고 원본 보존 감사를 완료한 뒤 root가 아래 소유 파일의 동결을 해제했다. 기존 `inferred-v1` 기본값과 직렬화된 요청은 유지하며, 새 `ownerInputPolicy: 'inferred-v2'`만 전체 실패를 한 번에 담는 `single_target_state` 투영을 사용한다. 새 모듈은 `src/orchestration/adaptive-inferred-repair-projection.mjs`, 새 정본은 `docs/orchestration/contracts/adaptive-inferred-repair.v2.json`이다. 공용 inferred 모듈과 실행기, 집중 검사를 함께 소유한다. 수정 전 기존 파일은 `benchmark-runs/d073-input-v2-preflight/source-before/`에 처음 한 번 저장한다.

모든 기존 artifact/owner/경로/원문 interface/의존 계약을 inline으로 유지한다. 실제 실패 case 원문과 연결된 원문 요구·미도달 assertion도 유지한다. 알려진 성공 case는 전체 공개 gate 식별자·결과로 요약하고 중복 설명·controller 검증 metadata만 별도 보존한다. 해석하지 못한 의미 필드는 원문으로 유지하거나 명시적인 원문 전체 fallback을 사용한다. 요구 mapping이 불명확하면 원문 요구 전체를 남긴다. 실제 전송 v2 request SHA를 완전한 답·담당·다음 후보와 연결하며 실패/불확실 envelope·부분 답·발명한 담당은 적용하지 않는다.

실행기 옵션은 `public-inferred-owner-v2` / `inferred-v2`이며 기존 지출 전 `beforeRepairDecision` gate 순서를 유지한다. root가 runner/planner/manifest 및 실제 호출을 소유한다. D07126실패와 D07314실패를 오프라인 재생하고 v1 요청 바이트 동일성, v2 의미 보존 및 fail-closed 경계를 검증한다. 실제 API·Docker·장부·숨김 검사는 호출하지 않는다. 로컬 토큰/48KB 상한을 복원하지 않으며 공식 질문64/body256000과 재시도0을 유지한다.

### 입력 v2 완료·동결 및 인계

공용 export에는 `ownerInputPolicy: 'inferred-v2'`를 명시한다. 생략 시 기존 `inferred-v1`이다. `loadInferredRepairContract(ownerInputPolicy)`도 같은 값을 받는다. 실행기는 두 v2 flags가 정확히 짝을 이루고 owner callback이 있을 때만 활성화한다. raw corpus를 먼저 v1 body 제한으로 검사하지 않고, 투영 후 실제 전송 body만 `prepareDecision`에 넣는다. `request_sha256`은 실제 v2 전송값이며 `owner_input_projection.input_request_sha256`는 보내지 않은 원본형 corpus다. 적용 및 candidate validator는 같은 입력에서 실제 request/projection SHA를 재생 확인한다.

생산 파일과 집중 테스트는 [source-handoff.json](../../benchmark-runs/d073-input-v2-preflight/source-handoff.json)의 SHA로 동결했다. 이전 v1 계약은 변경하지 않았다. 새 모듈은 알려진 성공 상태만 요약하며 실패/error·unexecuted·알 수 없는 상위 의미 필드·정상임을 확인하지 못한 local evidence는 원문 전체 요청으로 fallback한다. 실패 case의 알 수 없는 필드는 원문 그대로 유지한다. 성공 case의 추가 진단도 별도 inline 객체로 유지한다. 요구 연결이 모호하면 원문 요구 전체를 유지한다. shared-default 충돌, 실패 본문 hash 불일치, 잘못된 투영 proof는 거부한다.

검증: `node --test test/adaptive-inferred-execution.test.mjs test/adaptive-inferred-repair.test.mjs test/adaptive-causal-execution.test.mjs` — **16/16**, 실패0, **8,509.309917 ms**. v2 추가 검사는 원문 보존·정확한 artifact authority·실제 request/projection binding, 실패/불확실/부분/발명 응답 거절, unknown, 보수적 fallback, 지출 전 gate→owner→repair→profile→선택 worker→immutable overlay/상속→모든 공개 재검사를 확인한다. 기존 v1/causal 실행 검사도 포함한다.

[실제 두 실패 오프라인 재생](../../benchmark-runs/d073-input-v2-preflight/replay-01/result.json), [재생 코드](../../benchmark-runs/d073-input-v2-preflight/replay-01/replay.mjs): 두 saved v1 request의 전송 바이트와 metadata가 현재 기본 builder 결과와 정확히 일치했다. 모든93 case의 ID/상태, 실패 원문, 미도달 각4개, 기존22 artifact의 의미·경로·담당,21 unit interface, 원문 인용과 작업 의존 계약을 보존했다. 전체 원문은 bound controller report로 복원된다.

| 보존 후보 | 질문 | v1 wire | v2 wire | inline 원문 요구 | v4 관측 |
| --- | ---: | ---: | ---: | ---: | --- |
| D071 후보를 D073에서 재검사 | 26 | 187,728 B | 91,569 B | 28/80 | admit_observed |
| D073 새 개발 종료 후보 | 14 | 158,187 B | 76,748 B | 12/80 | admit_observed |

모의 응답은 typed 기존 담당 변환·독립 unknown과 완전한 답 검증만 확인한다. provider·Docker·장부·숨김 접근0이며 실제 수락/정확한 모델 토큰/사용량은 여전히 미측정이다. 원문의 HTTP400·usage null은 그대로 남아 있다. 새 두 preserved repair의 실제 담당 선택·수리·공개/독립 성공 여부는 root의 별도 새 실행으로 판단한다. 이 바이트 절감을 모델 성능이나 E2E 효율 개선으로 보고하지 않는다.

2026-10-12. [D073 역할](D073_PARALLEL.md)·[실험](../orchestration/D073_EXPERIMENT.md)에 따라 담당 추론 모듈, 고정 영어 계약, 집중 검사와 공유 실행기 연결을 소유한다. 실제 provider·Docker·장부·숨김 검사 호출은 root만 수행한다. 기존 D071/D072 실행·후보·계약은 불변이다. Jev decision records 스킬의 원문·판단·실행·측정 분리 원칙을 적용한다.

## 구현 계약

- `docs/orchestration/contracts/adaptive-inferred-repair.v1.json`의 영어 질문을 그대로 읽는다. 실제 실패한 공개 case별 choice를 만들고 기존 artifact ID 또는 `unknown`을 받는다. 하나의 primary artifact는 다음 수리/조사 담당 가설이며 복수원인 해결이나 실제 결함 확정이 아니다.
- 모델이 task ID, owner, 파일 경로 또는 새로운 산출물을 쓰게 하지 않는다. controller가 현재 산출물·소유자·경로·revision을 검증하고 artifact 선택을 기존 owner로 변환한다. 답 전체가 형식·질문·현재 binding과 일치한 후에만 적용한다.
- 실패 본문, 실제 미도달 assertion, 현재 작업·산출물·원문 요구·의존성·수리 이력을 판단에 제공한다. 질문의 키만 읽는다고 가정하지 않고 본문에 해당 case 식별자를 넣는다. unknown은 미해결로 남기며 미도달을 실패로 승격하지 않는다.
- 기존 broad case-owner fallback은 active 후보에서 제외하고 추론된 artifact union/개별 artifact 후보와 현재 bound causal 후보를 연결한다. 추론 전 fallback 근거는 원문 기록에 보존한다. 미선택 worker는 기존 snapshot을 그대로 상속한다.
- 상세 수리 packet은 선택 artifact unit·해당 inferred/causal 실패의 원문 요구를 포함한다. 다른 실패 관측과 미해결 목록은 유지하고 관련 없는 요구의 생략은 controller에 원문과 사유를 기록한다. unknown은 요구 삭제의 근거가 아니다.
- 새 v4 입력 정책은 root/transport가 주입한다. 이 모듈은 로컬 토큰·48KB 차단을 추가하지 않는다. 공식 body 한도, request schema, unknown/실패 보존, 재시도0은 유지한다.

## API 및 통합

신규 module `src/orchestration/adaptive-inferred-repair.mjs`:

- `loadInferredRepairContract()`
- `buildInferredRepairOwnerRequest({planning, failure, candidates, artifactBindings})`
- `inferAdaptiveRepairOwners({...input, decide, record})`
- `applyInferredRepairOwners({...input, inference})`
- `validateInferredRepairCandidate({planning, failure, candidate, artifactBindings})`
- `buildInferredRepairDecisionContext(input)` / `buildInferredRepairWorkerContext(input)`

실행기 opt-in: `repairScopePolicy: 'public-inferred-owner-v1'`, `artifactRepairPolicy: 'inferred-v1'`, `decideRepairOwners(request, meta)` (`stage: 'repair_owners'`). 기존 causal history/read overlay/carry-forward를 유지한다. `beforeRepairDecision(input, context)`는 담당 추론/수리 선택보다 먼저 실행해 보존 후보의 원본·실패 재현을 지출 전에 검증한다. root는 planner의 별도 `repairPolicy: 'inferred-v1'` 및 신규 validator/계약/builder를 연결한다.

증거: `adaptive_repair_owner_inference_requested/completed/stopped`, 실행기 `adaptive_repair_owner_inference_committed`; 질문별 실패 ID·선택 artifact·controller owner·unknown·request/response/inference hash를 남긴다. callback 수는 실제 POST와 별도로 기록한다. `round.owner_inference`와 후보 `owner_inference_id`를 실제 선택/worker round에 연결한다. commit에는 전체 결과를 `inference` 필드에 저장한다. 성공 결과의 `status: inferred`는 담당 가설 검증 완료이고 실행 허가는 아니다. 중단 결과의 `status`는 `stopped` 또는 `uncertain`이며 원인을 보존한다.

실행 순서: 모든 공개 검사 → base causal scope → `beforeRepairDecision` 원본/실패 재현 gate → 실패별 owner 질문 → 완전한 답 전체 검증과 durable commit → inferred/causal 후보 선택 → 선택된 task만 profile 선택 → 정확한 artifact 쓰기/기존 snapshot read overlay → 비선택 bytes/mode 상속 → 모든 공개 검사. gate 실패 시 owner·repair·profile·수리 worker callback은 모두 0이다.

모델 입력에는 공개 case 본문을 한 번 유지하고 assignment가 해당 check/test/assertion identity를 참조한다. controller의 request/response/choice hash와 검증 proof는 projection report에 보존한다. 알 수 없는 새 필드는 유지한다. 기존 causal semantic projection과 새 inferred metadata projection은 각각 자기 원문·출력 hash 및 생략값을 남긴다. 이 인코딩은 문맥 제한 통과나 모델 이해를 증명하지 않는다.

## 검증 계획과 현재 상태

생산 구현은 동결했다. 변경 파일은 신규 module/contract와 `src/orchestration/adaptive-dag-execution.mjs`이며 변경 전 실행기는 `benchmark-runs/d073-preflight/source-before/src/orchestration/adaptive-dag-execution.mjs`에 보존했다. `repair_owners` terminal stage allowlist는 root 소유 `adaptive-failure.mjs`에서 별도 snapshot 후 추가했다.

`node --test test/adaptive-inferred-repair.test.mjs test/adaptive-inferred-execution.test.mjs test/adaptive-causal-execution.test.mjs`: **12/12 통과**, 9,089.317167 ms. 새 집중 검사 7개는 정확한 기존 artifact/owner 권한, metadata 복원, unknown·미도달 구분, 발명/부분 답 거부, 기존 task dependency drift, 공식 65질문 거부, 실제 파일 수리/immutable overlay/상속/프로필/이력, 지출 전 gate, 알려진 HTTP 실패 보존을 다룬다. 기존 causal 실행 회귀 5개도 통과했다. 초기 테스트의 default-encoded evidence 접근 및 fixture 복사 실수는 테스트에서 수정했고, `repair_owners` stage 분류 누락은 root가 생산 공통 helper에서 수정했다.

실제 D071 원문 재생: [result.json](../../benchmark-runs/d073-inferred-repair-01/result.json), [replay.mjs](../../benchmark-runs/d073-inferred-repair-01/replay.mjs). 새 파일에만 기록했고 실제 provider·Docker·장부·숨김 검사 호출은 **0**이다. source pins와 읽은 원문들의 전후 hash가 결과에 있다.

- 원문 공개 case 93개, 실제 실패 26개, 미도달 assertion 4개를 보존했다. 질문은 실제 실패별 26개이며 미도달을 별도 실패 질문으로 만들지 않았다.
- owner wire **187,715 B**, 실제 production `chooseAdaptiveRepair(repairPolicy: inferred-v1)`의 모의 repair wire **91,369 B**. 둘 다 v4 `admit_observed`이며 실제 provider 수락·토큰·사용량은 미측정/null이다. 로컬 제한을 해제했어도 모델 문맥 한도가 사라진 것은 아니다.
- 모의 답은 A13/A14/A19를 가설로 선택했다. 기존 broad19 산출물 후보는 비활성화되고 추론3개와 bound causal 대안 합집합5개로 연결됐다. 상세 수리 원문 요구는 기존75개에서37개로 줄었지만 새로운 담당 추론/근거 필드가 있어 전체 repair wire는 이전86,809 B보다 컸다. 이를 입력량 절감이나 실제 수리 효율 개선으로 주장하지 않는다.
- A13 worker는 `pyclientgen/schema/models.py`만 쓸 수 있다. 세 mock worker 모두93 case 본문을 유지했다. 원문 case 전부를 정확하게 복원했고 unknown 분기에서는 R11.05 원문 요구가 남았다.

현재 v1은 공식 질문 상한64를 넘으면 provider callback 전에 `ADAPTIVE_INFERRED_OFFICIAL_QUESTION_LIMIT`로 중단한다. 삭제·부분 적용·자동 재시도는 없다. 더 큰 실패 집합을 위한 deterministic request batching은 미구현이며 이번26실패 실험의 결과로 일반화하지 않는다. 공식256000-byte body/schema 한도도 유지한다. 실제 Jev 선택·선택 worker 실행·공개/독립 성공·총비용/시간은 root의 별도 새 실행 증거가 필요하다.
