# D068 — 수리 입력 투영 담당

2026-10-11 KST. 구현과 로컬 replay 완료. [역할 분담](D068_PARALLEL.md)과 [실험 계약](../orchestration/D068_EXPERIMENT.md)에 따른다. 실제 모델 호출, 장부, 키, Docker, planner/runner 연결은 이 담당이 변경하지 않았다.

## 변경과 연결

- `src/orchestration/adaptive-repair-projection.mjs`: 순수 JSON 입력 투영·복원·실제 client 직렬화 바이트 측정.
- `docs/orchestration/contracts/adaptive-repair-projection.v1.json`: 모델에게도 함께 전달되는 inline 참조 해석 규칙과 보존 경계.
- `test/adaptive-repair-projection.test.mjs`: 증거 보존과 바인딩 불일치, 공개 전 local 실패를 확인하는 7개 focused tests.

```js
const {state, report} = projectAdaptiveRepairState(rawState);
const {failure, report: failureReport} = projectAdaptiveRepairFailure(rawFailure);
const {request, report: wireReport} = projectAdaptiveRepairRequest(rawRequest);
```

Planner에는 `state`, 작업자의 `repair_context.failure`에는 `failure` 전체를 전달한다. 반환 메타데이터 필드명은 `report`이다. `failure.repair_projection`에 공통 runtime 바인딩, 검사 기본값과 참조 규칙이 모두 있으므로 이를 삭제하면 안 된다. Jev가 로컬 파일을 읽는다고 가정하지 않는다. 모델·질문·선택지·명세·단위·원문 인용·공개 case·미실행 ID·오류·환경은 입력 안에 남는다.

## 줄이는 내용과 남기는 내용

공통으로 확인된 검사 필드와 runtime 바인딩만 inline 사전으로 이동한다. 검사별 revision은 부모의 동일 ID·동일 hash와 일치할 때만 ID 참조로 바꾼다. Leaf interface는 같은 요청의 unit 목록으로 정확히 복원할 수 있을 때만 참조로 바꾼다. 일부 unit이 없는 경우 원래 interface를 유지한다.

Root가 승인한 정상 설치 진행 로그의 의미적 생략을 적용했다. 설치 exit code가 0이고 `Successfully installed`가 있으며 모든 stdout 줄이 알려진 pip editable-install 진행 형식과 일치하는 경우에만 stdout을 생략한다. stdout hash·원래 UTF-8 바이트 수·설치 경로·인터프리터·실행 결과·원본 evidence key와 report ref는 남는다. 실패 stdout, 알 수 없는 출력, stderr, traceback, 응용 프로그램의 fixture 생성 실패는 그대로 유지한다. 설치 exit 0 자체를 제품·검사 성공으로 해석하지 않는다.

이 변환은 정상 진행 로그까지 포함한 무손실 변환이 아니다. 따라서 `lossless_roundtrip:false`, `decision_evidence_preserved:true`로 기록한다. 원본 정상 로그가 있으면 `restoreAdaptiveRepairState(projected, {omitted_stdout: {[sha256]: originalStdout}})` 또는 `restoreAdaptiveRepairFailure`로 원문 전체가 정확히 복원되는지 검사한다. 로그가 없으면 `ADAPTIVE_REPAIR_PROJECTION_OMITTED_LOG_REQUIRED`로 멈추며, 경로에서 몰래 읽거나 빈 로그로 채우지 않는다.

공개 export 이전 local readiness 실패에서는 부모 `artifact_revisions`가 비어 있을 수 있다. 이 경우 `local_evidence`의 실제 staged revision map을 그대로 남기고 `task_id`/`attempt_id`가 `failure.task_attempt_ids`와 맞는지, runtime 바인딩과 evidence key가 있는지 검사한다. 이를 공개된 산출물의 revision으로 승격하지 않는다. 같은 ID인데 부모나 원본 보고서의 hash가 다르면 계속 `ADAPTIVE_REPAIR_PROJECTION_BINDING_MISMATCH`로 거부한다. 공개 검사에 부모가 모르는 revision이 있는 경우도 거부한다.

## 실제 원본 replay

근거: `benchmark-runs/d068-projection-01/result.json`. 원본과 변환 결과의 파일 SHA, 생산 소스·계약·검사 SHA, `prepareDecision` 측정값과 보존 검사가 들어 있다. 변환 요청도 같은 디렉토리에 별도 저장했다. D067 원본 파일은 변경하지 않았다.

| 원본 요청 | 원래 wire bytes | 투영 후 wire bytes | 감소 | 공개 증거 |
| --- | ---: | ---: | ---: | --- |
| D067 Jev `jev-0056.request.json` | 188,240 | 114,364 | 73,876 / 39.2456% | 85 cases, 83 passed / 2 failed, 미실행 0 |
| D067 Claude 첫 repair event | 197,459 | 116,694 | 80,765 / 40.9022% | 26 cases, 2 passed / 24 failed, 미실행 59, 오류 객체 4 |

두 요청 모두 29개 검사 바인딩을 1개의 inline runtime 바인딩으로 공유한다. 정상 설치 stdout 7개, 원문 기준 27,692 UTF-8 bytes를 생략했다. 이는 JSON escaping을 포함한 직렬화 필드 크기와 다른 단위다. Jev 요청의 leaf interface 13개, Claude 요청 7개를 unit 참조로 바꿨다.

위 표는 질문·선택지를 변경하지 않은 **투영 단독** 비교다. Root가 수행하는 수리 후보 축소까지 적용한 결합 replay는 별도 결과다. 바이트 감소를 모델 토큰 감소나 provider의 입력 수락·수리 성공으로 계산하지 않는다. 이 담당의 provider 호출은 0회이며 `model_input_tokens:null`, `provider_acceptance:unmeasured`이다.

## 확인한 검증과 남은 경계

- `node --test test/adaptive-repair-projection.test.mjs`: 7 passed, 0 failed, 0 skipped, 99.969625 ms. 실제 소스·바인딩 불일치, 알 수 없는 로그 보존, 복원 참조 충돌, 공개 전 local revision 보존을 검사했다.
- `node --check src/orchestration/adaptive-repair-projection.mjs`: exit 0.
- 실제 D067 replay에서 모든 case와 미실행 ID가 inline으로 동일하며, 원래 정상 stdout을 제공하면 원래 state 전체와 정확히 일치한다. 입력 객체·원본 파일 hash는 변경되지 않았다.
- Scope 담당은 소유 중인 실제 execution의 `known local failure` fixture에 `projectAdaptiveRepairFailure`를 연결하여 local failure → projection → repair context 경계를 통과했다(담당 보고: 1/1, 1,983 ms). 일반 public failure fixture에서도 callback 1회, 전체 inline 사전 전달과 중복 `failed_public_reports` 제거를 확인했다. 실행기 코드는 scope 담당 소유다.
- 독립 reviewer는 local 보강 이전 공개 요청 18개 보존·실패 반례를 통과했다. 당시 113,982-byte 결과와 이후 local provenance 설명이 추가된 114,364-byte 결과를 구분한다. 최종 계약 재검토 결과는 `docs/agents/D068_REVIEW.md`와 새 review 증거를 따른다.

다음 행동은 root의 결합 replay와 동일 계약의 실제 새 실행이다. 정상 stdout 의미적 생략과 최종 runtime 바인딩 문구 증가 이외에 질문·선택지·실패 근거를 자동으로 축소하지 않는다. 실제 Jev context 제한과 품질은 provider 실행 전에는 확인되지 않았다.

## D068 실제 수리 입력 거절 추가 분석

2026-10-11 KST 추가 기록. 새 실행의 `benchmark-runs/d068-comparison-01/jev_all/calls/jev-0058.request.json`은 수리 단계에서 HTTP 400 `model_input_limit`으로 거절됐다. 이는 앞선 D067 incident를 재생한 요청과 다른 실제 입력이다. 분석 근거는 `benchmark-runs/d068-projection-live-failure-01.json`이며, 원본 요청·receipt·events·오프라인 비교 요청·생산 소스의 9개 SHA와 정확한 필드 분해를 남겼다. 이번 분석에서 provider/Docker/장부/키/숨김 검사 접근과 생산 코드·후보 수정은 모두 0이다.

투영은 실제 적용됐다. Events의 projection report를 원본 정상 stdout으로 복원하고 다시 투영하여 정확히 재현했다. 기록된 투영 전 state는 170,395 B, 투영 후는 95,447 B다. Chooser가 이후 추가하는 `contract_source` 필드가 214 B이므로 최종 state는 95,661 B이며, 모델·질문까지 포함한 실제 wire는 **97,071 B**다. 들여쓰기된 요청 파일 크기 145,358 B를 전송 크기로 사용하면 안 된다. 동일 질문을 사용한 투영 전 wire를 복원하면 172,019 B로, **74,948 B / 43.5696% 감소**했다.

| 실제 요청의 state 필드 | JSON 값 bytes | 내용 |
| --- | ---: | --- |
| failure | 40,769 | 공개 검사 7개, local 검사 22개, 환경·파일 버전·작업자 시도 바인딩 |
| requirement_descriptions | 20,615 | 요구사항 55개 |
| units | 11,252 | 작업 단위 15개 |
| leaves | 7,421 | 전체 leaf 10개; 4개는 unit interface 참조 사용 |
| relations | 5,820 | 관계 45개 |
| evidence | 3,657 | 원문 인용 48개 |
| artifacts | 2,552 | 산출물 16개 |

표의 값은 필드명·콜론·구분자를 제외한 JSON 값 크기다. 합산 가능한 정확한 `entry_bytes`와 framing은 증거 JSON에 별도 기록했다. 질문 전체는 1,366 B이므로 이번 큰 입력의 중심은 질문 문장이 아니라 판단 state다.

이전 D067 오프라인 결합 replay는 80,448 B였지만 **provider 호출 0회, 모델 수락 미측정**이었다. 이번 97,071 B보다 16,623 B 작았다는 사실을 모델이 허용하는 한도로 해석할 수 없다. 두 요청의 차이는 주로 다음과 같다.

- D067은 수리 후보가 작업자 1명/2명이어서 units 2개·요구사항 15개를 포함했다. 이번 후보는 3명/4명으로 units 15개·요구사항 55개를 포함한다.
- 이번 유일한 공개 실패 `T.integration.diagnostics`의 `existing output refused` assertion은 공개 매핑상 요구사항 9개와 소유자 3명에 연결된다. 그중 `adaptive-leaf-n9`가 12개 unit·요구사항 50개를 묶고 있다. 소비자까지 합친 후보 union이 15개 unit·55개 요구사항을 전달하게 했다.
- 기존 replay 대비 요구사항 텍스트가 15,200 B, units가 9,373 B, 원문 인용이 2,594 B, artifacts가 2,106 B 늘었다. 반대로 leaves는 8,479 B, relations는 4,301 B 줄었다. failure 자체의 증가분은 32 B에 불과하므로 로그가 다시 커진 것이 주원인은 아니다.

공개 case 85개는 84 passed / 1 failed이며 미실행 0개다. 모든 case 객체와 질문·선택지가 원문과 일치하고, 원래 정상 stdout을 제공하면 실패 객체 전체가 정확히 복원된다. 정상 설치 stdout 7개 27,692 B의 생략도 실제 적용됐다. 공개 case 값의 합은 4,960 B로, 이를 지워도 주요 원인을 해결하지 못하며 기존 보존 계약에 어긋난다.

로컬의 `max_request_bytes:240000` 검사는 통과했다. 이 값은 직렬화 바이트 검사이며 모델의 입력 토큰 한도가 아니다. 실제 오류의 `reported_limits`는 빈 배열이고 receipt의 `usage`는 null이다. 이미 기록된 models 조회도 name/description만 포함하므로 숫자 입력 한도나 정확한 토큰 수를 얻지 못했다. 따라서 97,071 B의 거절을 바이트 한계, 특정 토큰 수, 또는 80,448 B의 수락 가능성으로 단정하지 않는다. 오류의 `No charge was made` 문구는 provider 응답이며, 이 분석에서 장부 정산이나 실제 청구 확인을 수행했다는 뜻이 아니다.

다음 방향은 **제안만 기록**한다. 첫째, 모델이 사용하는 입력 형식·토큰 계산·공식 상한을 확인한 뒤 전체 state/instructions/criteria를 검사하는 경계가 필요하다. 둘째, 수리 후보를 바꾸거나 명세를 삭제하지 않으면서 실패 assertion에 필요한 요구사항·interface를 먼저 연결하는 별도 수리 계약을 검토할 수 있다. 큰 leaf 하나가 넓은 명세 전체를 다시 끌고 들어오는 문제가 핵심이다. 이는 새로운 설계와 검증이 필요하며 이번 실행의 선택지를 사후 수정하지 않는다. 셋째, state/failure에 반복된 inline 참조 규칙 1,195 B와 local 검사 metadata 11,147 B에서 되돌릴 수 있는 공통 표현을 검토할 수 있다. 이 수치는 검토 대상의 크기이며 실현 가능한 순감소량이 아니다. 설치 metadata는 경로·인터프리터 값이 검사별로 달라, 전체 7개 setup에 정확히 공통인 필드의 반복분은 참조 overhead 전에도 312 B뿐이다. 추가 로그 삭제만으로 충분해질 것이라고 주장하지 않는다.
