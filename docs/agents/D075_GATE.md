# D075 실제 전송 gate 역할

2026-10-12. 담당: `d071_transport`. 사용자 목표는 D074의 오프라인 검사를 실제 Jev 전송 전에 강제로 적용하고 실패 복구를 새 opt-in 경로에서 검증하는 것이다.

## 소유권과 경계

- 소유: `src/benchmark/adaptive-dag-runner.mjs`, 새 `src/orchestration/jev-transmission-preflight.mjs`, 새 전송 정책, 해당 집중 테스트와 이 기록.
- 기존 client·telemetry·D074 정책은 보존한다. root 승인으로 D074 checker/CLI에 명시 정책 선택만 추가하고 새 prompt v2를 사용한다. 기존 handler의 opt-in 입력 투영은 다른 담당 소유다. 다른 담당의 executor·보존 runner·재구성 모듈·스킬은 수정하지 않는다.
- 기존 생산 파일은 수정 전에 `benchmark-runs/d075-gate-agent-01/source-before/`에 독점 생성으로 복사한다. 과거 실행·검증·장부를 덮어쓰지 않는다.
- 실제 API·키·장부·Docker·hidden 검사 접근은 0. 검증에는 임시 디렉토리와 injected provider/budget만 사용한다. 실제 실행은 root 소유다.

## 적용한 지침

`skills/jev-prompting/SKILL.md`와 `skills/jev-decision-records/SKILL.md`를 읽었다. 영어 고정 질문·typed 선택과 기존 handler의 연결, 공식/프로젝트/미확인 검증 범위, 불확실 결과의 재전송 금지와 원본 보존을 따른다. 의미·정답률·성능·정확한 provider 문맥 적합성은 오프라인 형식 통과로 확인되지 않는다.

## 구현 인터페이스

- 새 manifest: `adaptive-dag-comparison/v10`; 기존 v9의 inferred-v2/v4/profile-v2 설정 상속.
- 필수 opt-in: `transmission_preflight: {mode: "required", contract: "docs/orchestration/contracts/jev-transmission-preflight.v1.json", sha256: "<final policy SHA>"}`.
- 새 모듈: `assessJevTransmission(request, {stage, observedModel, expectedRequestSha256, expectedPolicySha256})`, `jevTransmissionPolicy()`.
- 모든 지원 stage(`split`, `relations`, `repair`, `profiles`, `repair_owners`)는 실제 adapter subset·v4·요청/정책/소스 SHA를 검증한다. projected `repair_owners`의 inferred-v2는 고정 문구·대상·근거·기존 enum 연결도 검증한다. 다른 stage는 고정 prompt 검사가 미지원이다.
- `repair_input`, `repair_input_shared_evidence`, `recovery_source_evidence` 필드가 있으면 repair stage의 `validateRepairInputState`를 호출한다. 공유 참조·고정 규칙·가시적인 relevance 구조만 확인하며, 요약의 원문 동등성·source coverage는 복구 controller가 담당한다. `resolved-unrelated-v1` 요약은 손실 없는 압축이라고 표현하지 않는다.
- 수동 검사: `node scripts/validate-jev-prompt.mjs --request <file> --template inferred-v2 --stage repair_owners --policy v2 --out <new-file>`. `--connection-only`에도 같은 정책 옵션을 적용한다. 기본은 역사 정책 v1이며 현재 handler 변경으로 SOURCE_DRIFT가 발생하면 그대로 차단한다.
- D074 정책 v1과 과거 결과는 소급 수정하지 않는다. 새 prompt v2는 현재 source 10개, 전송 정책은 현재 source 16개를 별도 고정한다. v10 manifest는 전송 정책의 정확한 SHA와 별도의 failure recovery 계약 SHA를 필수로 가진다.

## 실행 경계와 증거

1. provider 호출 전에 직렬화된 요청의 독립 snapshot과 hash를 고정한다.
2. 첫 gate 및 예약 직전 gate 차단은 예약/POST 0으로 기록한다.
3. 실제 decide 경계에서 요청/정책 hash를 다시 검사한다. 예약·decide guard는 동기 함수로 바로 다음 action과 사이에 await를 넣지 않는다. 기존 telemetry는 예약 뒤 비동기 기록을 수행하므로, 그 이후 drift 차단은 POST 0과 이미 생성된 reservation의 상태를 구분한다. 예약을 0으로 허위 보고하거나 임의 정산하지 않는다.
4. 검사 파일은 `calls/<id>.transmission-preflight.<phase>.json`에 동기 저장한 뒤 action을 허용한다. phase는 `initial`, `before_reservation`, `before_post`다. 지연 기록되는 이벤트에는 `report_saved_before_action`과 `event_recording_delayed`를 명시한다.
5. receipt의 `transmission_preflight`는 `request_sha256`, `policy_sha256`, `blocked_phase`, `reservation_called`, `reservation_created`, `provider_decide_called`, `no_post_verified`, `checks`, `recovery`를 가진다. reserve가 던져 확정할 수 없으면 `reservation_created:null`을 유지한다.
6. 기존 `inference_started` 이벤트는 dispatch intent다. v10 receipt의 `inference_started`는 실제 내부 client.decide 진입 여부다. 최종 gate 차단에서는 intent 이벤트가 있어도 `provider_decide_called:false`와 POST 0이 성립한다.
7. stopped 세션 재개는 이전 known failure와 같은 stage, 서로 다른 정확한 body SHA, state evidence SHA, controller source-coverage SHA, fresh gate 통과 및 실제 budget snapshot의 pending 0 / blocked null을 요구한다. 불확실 응답·동일 payload·미정산 예약은 재개하지 않는다. source-coverage SHA 존재 자체를 의미 보존 검증으로 대체하지 않는다.

## 정책 동결 순서

다른 담당의 source가 모두 동결된 뒤 repo root에서 `node benchmark-runs/d075-gate-agent-01/refresh-policy-pins.mjs --reviewed-source-freeze`를 실행한다. helper는 현재 D075 정책 사본을 새로운 private 디렉터리에 보존하고 prompt v2 source pins → 전송 정책의 prompt SHA → 전송 source pins 순서로 계산한다. 역사 v1 SHA `3c6cb90d56d8e8d433ed57d23548c977174056177348b7e315544f834d787ebc` 불변을 강제한다.

출력 receipt의 transmission SHA를 v10 manifest에 넣고 별도로 동결된 recovery 계약 SHA를 넣는다. 그 뒤 manifest/runtime/driver 전체 source snapshot을 생성하고 launch gate를 고정한다. 정책을 캐시하므로 모든 갱신 후 검증과 실행은 새 프로세스여야 한다. live 실행 동안 source와 policy는 불변이다.

`policy-helper-validation-01.json`은 helper를 전체 관련 소스/정책의 임시 사본에서 실행한 결과다. JSON parse, prompt 10핀·전송 16핀, nested prompt SHA, 실제 repo의 세 정책 불변을 확인했다. 이 검사는 실제 repo 정책 갱신이나 gate 통과 증거가 아니다.

## 현재 상태

구현과 관련 무과금 검증을 완료했고 담당 생산 소스를 동결했다. 무과금 fixture는 다섯 stage의 정상 전송, 최초/예약 직전/최종 차단, caller mutation, source drift, HTTP 400 후 증거 재구성과 미정산/불확실 재진입 차단, 실제 client의 injected fetch URL/auth 형식/redirect/retries/직렬화 SHA를 검사한다.

- `focused-development-02.tap`: 새 gate 초기 7/7 통과.
- `related-development-03.tap`: gate/prompt/D071 runner/기존 runner의 관련 39개 중 38개 통과. 새 HTTP mock에서 required probabilities가 빠진 fixture 오류 1개였다.
- `http-development-04.tap`: 해당 fixture에 probabilities를 추가한 뒤 동일 실제 client case 1/1 통과. 이 시점의 단독 실행을 전체 39개 통과로 승격하지 않았다.
- `final-related-05.tap`: 최종 동결 정책과 새 프로세스에서 관련 39/39 통과, 실패·skip 0, 36,445.127041 ms. 명령: `node --test test/jev-transmission-preflight.test.mjs test/jev-prompt-preflight.test.mjs test/d071-runner-integration.test.mjs test/adaptive-dag-runner.test.mjs`. 로그 내용은 Node 기본 spec reporter다.
- `preserved-final-01/receipt.json`: 기존 실제 요청 `jev-0001`·`jev-0007`은 명시 v2에서 CLI exit 0, 원본 파일 SHA 불변. 같은 `jev-0001`의 정책 생략(default v1)은 SOURCE_DRIFT exit 2다. 과거 0007의 실제 HTTP 400 결과를 성공으로 변경하지 않는다.
- `projected-final-01/receipt.json`: 입력 담당의 최종 replay-06 9개 요청을 exact/relevance/sources와 실제 stage로 재검사했다. 모두 pass이고 파일 불변이다. round2 relevance 63,449 B는 `resolved-unrelated-v1`, 새 source로 관련성이 확대된 86,580 B는 relevance 요약 없이 원문 복원된 구조로 통과했다.

모든 로그는 `benchmark-runs/d075-gate-agent-01/` 아래 새 파일이다. source freeze 인계는 `source-handoff-01.json`이다. 실제 API·장부·Docker 접근은 0이며 provider 수락·context fit·효율은 미측정이다. 독립 reviewer의 추가 fake-fetch 검증과 root의 실제 실행은 별도 증거다.

최종 정책: prompt v2 `c491d1b9d8fa2838a1ec0a3fcca68fe5da5f38eddb2d40a76d861c7d3bc3f37d`, transmission v1 `4f23d874e04338b3ff674b24481784fb64ee9b37257272f26fb84f40a83d4123`. 기존 prompt v1 SHA는 위 불변 값 그대로다. 정책 재핀 영수증은 `policy-refreezes/2026-10-12T06-14-28.118Z-5f28692c-e8bf-4a5f-95dc-7b20f8028d94/receipt.json`이다.
