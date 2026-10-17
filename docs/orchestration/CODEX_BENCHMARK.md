# Codex 성능 벤치마크 준비

2026-10-14. 사용자 요청: 이번에는 Claude 대신 Codex를 성능 벤치마킹 대상으로 작성. 기존 `feat/d083-skill-gateway` 브랜치에서 별도 모듈을 추가했다. [역할 계약](../agents/R20261014_CODEX_BENCHMARK.md).

**현재 실행 가능한 것은 동일 D083 질문의 Codex/Jev 판단 리플레이다. 전체 개발 E2E 비교는 설계 계약이며 아직 실행기에 연결하지 않았다.** 실제 새 모델 호출·성능 측정 결과는 없다. 현재 범위 질문에 대한 사용자 답을 기다리며, 공통 어댑터·검증·E2E 계획을 작성했다.

## 전체 개발 비교의 고정 조건

[계획 manifest](../../benchmarks/e2e-swe/manifests/codex-comparison.plan.v1.json)는 `planned_not_executable`이다. 기존 OpenAPI Python client generator를 사용한다.

| 조건 | 분해·의존·실패 담당 판단 | 구현·수리 작업자 |
|---|---|---|
| A | Codex | 고정 Codex 모델·노력도 |
| B | Jev | A와 동일한 Codex 모델·노력도 |

로컬 설정에서 확인한 `gpt-6.1-sol`/`high`를 초기 후보로 기록했다. 계정 호출 가능성·실제 모델 identity 검증은 별도다. 첫 비교는 모델 최적화를 끄고 판단 경로만 바꾼다. 이후 C조건으로 Jev 모델/노력도 선택을 추가할 수 있으나 이번 계획에 구현 완료로 넣지 않는다. Claude 전용 spec-review는 양쪽 모두 제외해 숨은 Claude 호출을 없앤다. D066 catalog 재사용은 동일 공통 전처리로 기록하고 과거 생성비를 현재 비용에 다시 넣지 않는다.

순차 조건 실행·조건당3회 이내·작업자 동시2개·최대30명·수리2회. 10분 timeout은 두지 않는다. 순서 AB/BA/AB로 기록하며 완전한 순서효과 제거로 해석하지 않는다. 실패와 불확실 종료도 모집단에 유지하고 자동 재시도하지 않는다. 완료는 같은 후보 hash에 공개93/93 및 독립63/63이 연결돼야 한다. 실패가 짧게 끝났다는 이유로 속도 개선을 계산하지 않는다.

현재 D083는 worker CLI, auth, profile20개, 사용량 집계, spec-review가 Claude에 결합되어 있다. 기존 함수를 command만 바꿔 쓰면 Codex 사용량 누락·Claude 인증 요구·provider 오기록이 발생한다. 새로운 전체 runner에는 Codex worker의 artifact scope transport, Claude 독립 preflight, provider별 회계, 실제 Docker public/independent checker 연결이 필요하다. 기존 gateway를 느슨하게 만들어 우회하지 않는다.

## 지금 작성한 실행 코드

- [Codex adapter](../../src/benchmark/codex-provider.mjs): `codex exec --json --output-schema`, 명시 model/effort, fresh session, 요청·원시 stream·stderr·응답·receipt 저장. 기존 경로 재사용 거부. 입력 검증과 기록 실패 시 후속 결과 반환 금지. 명시적인 모델 불일치 차단, 출력에서 모델 정보가 없으면 identity는 null. 취소/중단은 불확실 상태로 남기며 재시도하지 않는다.
- [판단 benchmark](../../src/benchmark/codex-decision-benchmark.mjs): 같은 canonical request hash와 현재 D083 고정 질문·source/body/response gate를 사용. Codex provider를 Jev로 위장하지 않고 별도 protocol에 기록. Codex은 Jev key·장부를 읽지 않는다. Jev 실행은 기존 mandatory gate·측정·shared ledger를 사용한다. 기존 cloud-only 정책에 따라 이 benchmark CLI의 Codex/Jev live 실행은 모두 Mac에서 차단한다. 일반 Codex 호스트 검증 어댑터와 벤치마크 실행 정책을 구분한다.
- [CLI](../../bin/codex-benchmark.mjs): `check`, `codex`, `jev`, `compare`. `--spend` 없이 live 호출 불가. `check`는 source/질문 검증뿐이며 네트워크0이다. raw POST fallback 없음.

Codex decision에서는 read-only sandbox와 공개 데이터 전용 cwd를 사용한다. 이는 모든 파일 읽기/웹 도구 사용을 OS 수준에서 없애는 보안 경계가 아니다. 도구를 실제 사용한 판단은 사후 거절한다. worker 역할의 generic adapter는 준비했지만 artifact별 권한 통합을 완료한 worker로 주장하지 않는다.

기존 gateway의 `before_reservation`이라는 검사 phase를 Codex dispatch에도 사용하지만 이는 검사 이름일 뿐이다. Codex 실행에는 Jev 예약이 발생하지 않으며 protocol/summary에 `jev_reservations:0`을 별도로 남긴다. 양쪽 provider의 transport는 CLI와 HTTP로 다르므로 측정 구간을 명시한다.

## 사용 예

저장소 root에서 새 출력 경로만 사용한다. 실제 비교용은 같은 `--request` 파일과 stage를 두 provider에 전달한다. 다음 원문은 D081 실제 분해 요청이며 현재 D083 layered-v2 고정 계약에 맞는지 새 gateway로 확인한다. **D083에서 새로 생성한 실제 실행 요청이라고 표시하지 않는다.**

```sh
node bin/codex-benchmark.mjs check \
  --request benchmark-runs/d081-defaults-01/jev_profile/calls/jev-0001.request.json \
  --stage split --out benchmark-runs/NEW-check

# 설정된 실행 호스트에서 명시적인 새 시도. 아래 live 명령은 이번 작업에서 실행하지 않음.
node bin/codex-benchmark.mjs codex \
  --request benchmark-runs/d081-defaults-01/jev_profile/calls/jev-0001.request.json \
  --stage split --out benchmark-runs/NEW-codex \
  --model gpt-6.1-sol --effort high --spend
node bin/codex-benchmark.mjs jev \
  --request benchmark-runs/d081-defaults-01/jev_profile/calls/jev-0001.request.json \
  --stage split --out benchmark-runs/NEW-jev --spend
node bin/codex-benchmark.mjs compare \
  --left benchmark-runs/NEW-codex --right benchmark-runs/NEW-jev
```

`compare`는 request/registry/benchmark source/stage 일치와 두 완료 provider를 확인한다. 일치율은 정답률이 아니며 작업자 실행·개발 완료·비용 절감은 null이다. 임의 후보가 schema에 맞는다고 정확한 분해라고 평가하지 않는다.

## 토큰·가격 계산과 검증

Codex 총 토큰=`input_tokens + output_tokens`. cached_input은 input의 부분집합, reasoning_output은 출력의 별도 보고 항목으로 다시 더하지 않는다. 필드 누락은0이 아닌null. 확인된 공식 가격표와 일치 모델이 없으므로 `api_equivalent_usd`와 구독 실제 청구 `actual_billed_usd` 모두null로 둔다. 후속 가격환산을 넣을 때는 `(input-cached)*입력단가 + cached*캐시단가 + output*출력단가`/1e6이며 실제 구독 청구와 구분한다.

검증 명령과 원시 근거는 [codex-benchmark-20261014-01](../../benchmark-runs/codex-benchmark-20261014-01/)에 있다.

- `node --test test/codex-provider.test.mjs`: 9/9 통과. 캐시 중복, 누락 사용량, 실패·도구 사용·모델 불일치, 기록 선행, 기존 경로 보존, 질문/후보 binding, 잘못된 pair 거절을 확인한다. mock provider 사용.
- `node bin/codex-benchmark.mjs check ...`: D081 분해 요청을 현재 D083 gate로 검증. 실제 provider0, [check-03](../../benchmark-runs/codex-benchmark-20261014-01/check-03/result.json).
- 이전 실제 Codex 호스트 trace를 새 parser로 오프라인 재검사: input190881 중 cached157824, uncached33057, output1610, total192491. reasoning138은 합계에 재가산하지 않음. 모델 identity는 미관측. [원시 trace 재검사](../../benchmark-runs/codex-benchmark-20261014-01/prior-real-trace-audit.json). **이번 새 benchmark 실측이 아니다.**

공식 확인(2026-10-14): [Codex 비대화식 모드](https://learn.chatgpt.com/docs/non-interactive-mode), [스킬 평가에서 JSONL과 schema 사용](https://developers.openai.com/blog/eval-skills). 로컬 CLI0.144.1 help도 확인했다. 문서의 명령 예시와 현재 CLI 옵션을 대조했으며 자동 approval bypass 옵션은 넣지 않았다.

남은 것: 전체 runner의 Codex artifact-worker·Docker 검사·독립 채점 연결 및 실제 paired 실행. 새 Jev 호출·Claude 호출·장부 수정·commit·push 없음. 이전 작업의 장부 hash 차이도 해결됐다고 주장하지 않는다. 새 소스·계획·오프라인 근거는 미커밋 상태로 남는다.

## 공유 장부 변동 원인 정정

직전 작업에서는 장부 hash 차이를 원인 미확인으로 남겼다. 이번에는 별도 채팅 「Jev 시스템 트레이딩 앱 기술 조사」에서 사용자가 승인한 모의 서비스가 같은 장부를 사용함을 확인했다. 관측된 이전/현재 마지막 정산 run ID 두 건이 해당 서비스 journal의 `router_response.billing.runId`와 일치하며 input8321/8269도 일치한다. [비밀·거래 본문을 제외한 연결 근거](../../benchmark-runs/codex-benchmark-20261014-01/shared-ledger-provenance.json).

따라서 장부를 고정 benchmark artifact로 취급해 이전 값으로 복원하지 않는다. 보존 감사 원본은 그대로 유지한다. 기존 실험 파일42,050개의 SHA는 일치하며, 나머지1개는 계속 갱신되는 공유 장부다. 중간 모든 정산의 원인·합계를 독립 감사한 것은 아니다. 비용은 해당 benchmark run/attempt/request receipt로 집계해야 하며 전역 장부 증감을 벤치마크 비용으로 사용하지 않는다. 별도 서비스에 메시지 전송·설정 변경·중단은 하지 않았다.
