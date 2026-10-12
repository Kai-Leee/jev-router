# D071 — 프로필·원인 수리 요청 사전 검사 v3

## 현재 v3 변경 — 2026-10-12 readable JSON

Root의 명시 설계 결정으로 **v3 repair 운영 한도를48,000B**로 변경했다. v1/v2의 소스·계약 및 v2의24,000B는 원본 그대로다. v3 policy/result에는 `inherited_repair_operating_limit`24,000B와 명시적 `repair_operating_override`48,000B를 구분한다. 아래24,000B 동작과 preview 결과는 변경 이전 기록이다.

24,000B는 D069의70,510B 요청이 실제 HTTP400으로 거절된 뒤 둔 engineering ceiling이며 provider 한도가 아니다. D071은34,023B의 readable projected JSON과 실패 history/provenance를 전달하는 쪽을 선택했다. 사전/decoder 표기로24KB를 맞추는 지시 부담을 피하고,64KB를 택하지 않고48KB를 운영 상한으로 두었다. 수락확률을 보정한 실측치나 실제 token 상한은 아니며 보장 여부는 계속false다.

수정 전 v3 module/contract/test 세 파일을 `benchmark-runs/d071-preflight/source-before/`의 같은 상대 경로에 배타적으로 보존했다. 새 source hash·기존4파일 보존 대조·원본 v3 snapshot 대조와 원시 테스트 결과는 `benchmark-runs/d071-admission-readable-01/source-handoff.json` 및 `tests.txt`에 있다. 회귀18/18 통과이며48,000±1B 경계, 과거70,510B 반례 차단,32k/64k 추정 한도, 구v3 policy SHA 거부를 포함한다. 실제 API·Docker·장부 쓰기는0이다.

2026-10-11. 담당: `d071_transport` 후속 역할. 소유한 새 파일은 `src/orchestration/jev-token-admission-v3.mjs`, `docs/orchestration/contracts/jev-token-admission.v3.json`, `test/jev-token-admission-v3.test.mjs`, 이 문서다. Runner의 실제 stage 전달·요청 SHA 재검사·예약·POST는 root 소유다.

## 구현 계약

```js
assessJevTokenAdmission(request, {
  stage, observedModel, expectedRequestSha256, expectedPolicySha256
});
jevTokenAdmissionPolicy();
```

- v1·v2 소스와 계약은 변경하지 않았다. v3 계약은 v2 계약·모듈 SHA를 고정하고, v2는 v1 계약·모듈을 고정한다.
- 신뢰할 controller 문맥에서 전달한 `split`, `relations`, `repair`, `profiles`만 받는다. `request.state`·question ID·phase·provider 응답에서 stage를 추론하지 않는다.
- 모든 stage는 기존 요청 형식·모델 allowlist·정확한 직렬화 bytes·요청 SHA 및 추정식 `ceil(bytes × 2 / 5) + 512`를 유지한다. 전체 요청 추정 한도64,000, 상태+최장문항 추정 한도32,000을 모두 검사한다.
- `repair`는 v2의 전체 요청 **24,000 UTF-8 bytes** 운영 한도를 추가 적용한다. 원인 수리 후보가 늘어도 자동으로 한도를 올리거나 입력을 자르지 않는다.
- `profiles`는 전체/문항 추정 한도를 적용한다. repair 작업자의 모델을 고르는 질문도 controller가 명시적으로 `profiles`를 전달한다. 수리 후보 선택 질문의 `repair`와 별개다.
- v3 API에 v1/v2 policy hash를 전달하면 막힌다. 호출자가 반환 policy 객체를 고쳐도 내부 한도는 바뀌지 않는다.
- `admit_estimated`는 로컬 가정 안에서 시도할 수 있다는 뜻이다. 실제 tokenizer count, provider 수락, 실제 사용량·청구, 선택 품질·수리 성공은 확인되지 않았다. 모듈은 API·장부·batch분할·재시도·입력수정을 하지 않는다.

## 실제 미리보기의 오프라인 측정

명령과 원본 hash가 있는 영수증: `benchmark-runs/d071-admission-preflight-01/receipt.json`.

재현은 기존 영수증을 덮어쓰지 않는 새 경로로 수행한다.

```sh
node benchmark-runs/d071-admission-preflight-01/replay.mjs <fresh-receipt-path>
```

각 입력은 `benchmark-runs/d071-profiles-preview-01/`에 있는 원본 request JSON이다. bytes는 `prepareDecision`의 정확한 UTF-8 직렬화 크기이고, 아래 token 수는 모두 기존 식의 **추정**이다.

| 원본 미리보기 | 실측 요청 bytes | 실측 state+최장질문 bytes | 요청 token 추정 / 64,000 | state+질문 token 추정 / 32,000 | 사전 검사 |
|---|---:|---:|---:|---:|---|
| `initial.request.json`: 실제 D070 10leaf 구조 | 112,528 | 79,817 | 45,524 | 32,439 | 문항 추정 초과로 차단 |
| `atomic21.request.json`: 과거 오프라인 21단위 분할 구조 | 163,370 | 90,751 | 65,860 | 36,813 | 두 추정 한도 초과로 차단 |
| `repair-shape.request.json`: 실제 failure 없는 1task 형태 | 23,894 | 23,827 | 10,070 | 10,043 | 추정 허용; 실제 수리 검증 아님 |

`initial`의 상태는76,212B, 최장 질문3,605B다. 전체112,528B만 보면 한도 안으로 보이지만 state+질문79,817B가 별도 추정 한도를 넘는다. 따라서 전체 bytes 통과를 모델 입력 통과로 판단해서는 안 된다. 이 결과를 root와 프로필 담당에 전달했다. 원본을 유지하면서 관련 상태까지 작아지는 subset batch를 구성·재검사해야 하며, 질문 개수만 줄이면 상태는 그대로 남을 수 있다.

## 검증과 source 동결

```sh
node --test test/jev-token-admission.test.mjs test/jev-token-admission-v2.test.mjs test/jev-token-admission-v3.test.mjs
```

로컬 **11/11 통과**, 실패·skip0. 테스트 러너 `duration_ms`는102.935459ms다. 기존 7개와 신규4개로, v2 stage별 측정/판정 보존, repair24,000/24,001B 경계, profile 전체/문항별 초과, 가짜 stage 무효, model/request/policy binding, policy 사본 변조 방지를 검사했다. 실제 제품 개발 시간은 아니다.

영수증에는 v1/v2/v3 source·계약과 새 테스트 총7개 SHA가 고정돼 있다. 원본 v1/v2 네 파일은 변경하지 않았다. 역할 소유 구현 파일의 쓰기를 종료했으며 이후 변경은 새 검증·source pin이 필요하다.

실패한 회귀 테스트는 없다. 실제 preview2개가 의도대로 차단됐다는 결과를 별도 보존했다. Provider 수락·실제 모델 token·새 배치 성능은 미측정이다. Root의 runner 연결과 프로필 담당의 배치 수정 뒤 최종 요청을 다시 검사해야 한다. 새 유료 호출·장부 변경·기존 실험 수정은0이며, 새 구현·계약·테스트·문서·영수증은 미커밋으로 남는다.

## 2026-10-12 — 분할된 프로필 입력 및 runner 통합 검사

프로필 담당의 `benchmark-runs/d071-profiles-preview-02/receipt.json`이 가리키는 실제 request9개를 같은 v3 함수에 넣고, 각 저장된 request SHA와 v3 policy SHA까지 대조했다. 결과는 `benchmark-runs/d071-admission-preflight-02/receipt.json`에 별도로 보존했다. 원래 차단된 preview01은 수정하지 않았다.

- D070 10leaf의 initial3배치 실측 bytes는58,209 /55,507 /24,638이고, 요청 추정23,796 /22,715 /10,368, state+문항 추정20,617 /19,536 /9,290이다. **3/3 추정 허용**이다.
- 과거 오프라인 atomic21은6배치이고 **6/6 추정 허용**, 최대 실측41,535B·요청 추정17,126·state+문항 추정13,946이다. 실제 Jev 분할이나 모델 수락을 새로 확인한 결과가 아니다.
- 배치를 나누면 총 입력의 반복이 늘 수 있다. admission 통과를 토큰 절감이나 비용 최적화로 해석하지 않는다. 실제 비교는 root의 provider 영수증으로 수행한다.

후속 역할로 `test/d071-runner-integration.test.mjs`만 추가하여 생산 runner를 변경하지 않고 다음 명령을 실행했다.

```sh
node --test test/d071-runner-integration.test.mjs
```

source를 실행 전후 대조한 최종 결과는 **7/7 통과, 실패·skip0, 1,473.44825ms**, source pin7개 drift0이다. stdout과 영수증: `benchmark-runs/d071-runner-integration-01/output.txt`, `receipt.json`.

검증 범위는 v7의3조건·93공개gate·원본 catalog prompt 재사용, 실제 CLI `--model`/`--effort` 인자와 requested/observed 필드, 잘못된 요청 프로필의0호출 차단, 응답 모델 불일치의 실패 처리, Jev-profile의 선택 누락 차단, 네 trusted stage의 v3 검사→예약→provider 순서다. Provider·예산은 주입한 로컬 어댑터이므로 실제 API POST·Docker 명령·실제 장부 쓰기는0이다. 계정 probe4개는 저장된 결과를 읽기만 했다. 테스트에서 만든 임시 폴더는 정리했다.

통합 결함은 발견하지 않았다. 이번 검사는 실제 E2E 완료·수리 효율·가격 최적화를 측정하지 않으며 최종 유료 실행 결과는 root가 검증한다. 새 테스트·영수증은 미커밋으로 남는다.
