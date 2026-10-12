# D067 budget — 무상한 장부와 병렬 잠금 연결

2026-10-11 KST. 담당 `/root/d067_budget`. 상태: 로컬 구현·검증 완료. 실제 장부 이관과 유료 실행은 root 담당이며 이 역할에서는 수행하지 않았다.

최신 사용자는 조건별 토큰 상한과 누적 장부 토큰 상한을 현재 해제하도록 명시했다. 새 v3 정책은 `max_input_tokens:null`을 요구한다. v1 USD1과 v2 누적10M의 검증·한도 의미는 보존한다. `null`을 숫자 0, Infinity 또는 큰 가짜 상한으로 바꾸지 않는다.

## 연결 API

```js
const v3 = {
  schema_version: 'jev-token-budget/v3',
  ledger_path: absoluteExistingLedgerPath,
  max_input_tokens: null,
  reserve_input_tokens: 65536,
};
const migrated = migrateTokenBudget(v2, v3);
const lease = await acquireTokenBudget(v3, {
  timeoutMs: remainingArmTimeMs,
  signal: armAbortSignal,
  onAcquired: ({ wait_ms, lock_contentions }) => recordLocalWait({ wait_ms, lock_contentions }),
});
```

- 이관은 같은 절대 경로의 v2→v3만 추가로 허용한다. 기존 v1→v2도 유지한다. 원본이 없거나 잠겨 있거나 pending/blocked 상태면 정산 이력을 바꾸지 않고 거부한다. `budget_id`, `charged_input_tokens`, `settled_requests`, `last_settlement`를 유지한다. 과거 환불의 미확인 추론 사용량 `null`도 유지한다.
- v3 snapshot은 `schema_version:jev-token-budget-snapshot/v3`, `unlimited:true`, `token_limit:null`, `remaining_input_tokens:null`, `remaining_usd:null`, `limit_usd:null`이다. 사용량·예약량·정산 수·환산 지출은 계속 기록한다. 무상한은 계정 잔액이 무한하다는 뜻이 아니다.
- 계정의 실제 paid balance, reserved tokens, debt/frozen 상태, 토큰 결제 mode·배수·영수증과 실제 정산액 일치 검사는 유지한다. 미정산 예약을 지우거나 유료 POST를 다시 보내지 않는다.
- `acquireTokenBudget`는 `BUDGET_LOCKED`만 전송 전 로컬 대기로 처리한다. `wait_ms`는 경합이 발생했을 때 acquisition 시작부터 획득까지의 구간이며 반복 로컬 open 비용을 포함한다. 경합이 없으면 0이다. 공급자 지연과 구별한다. 취소 또는 획득 콜백 실패 시 아직 사용하지 않은 lease를 닫는다.
- 정수 회계가 JavaScript의 정확한 정수 범위를 벗어나기 전 `BUDGET_ACCOUNTING_OVERFLOW`로 멈춘다. 이는 금액/토큰 예산 상한이 아니라 회계 정확도 경계다.

명시적 무과금 이관 CLI:

```sh
node scripts/migrate-unlimited-token-budget.mjs source-config.json target-config.json
```

각 파일은 전체 실행 config의 `jev_budget` 또는 budget 객체다. 상대 ledger 경로는 해당 config 파일 디렉터리 기준이며, 두 config는 동일한 ledger로 해석돼야 한다. CLI는 v2→v3만 허용하고 기존 이관을 자동 반복하지 않는다. 실제 장부에 이 명령을 실행한 결과는 root의 별도 이관 증거로 확인한다.

## 실제 검증

```sh
node --test test/benchmark-budget-v3.test.mjs test/budget-acquire.test.mjs
node --test test/benchmark-budget.test.mjs test/benchmark-budget-v2.test.mjs test/benchmark-budget-v3.test.mjs test/benchmark-budget-refund.test.mjs test/benchmark-budget-lifecycle.test.mjs test/budget-acquire.test.mjs
```

첫 focused 검증 13/13 통과, 이어서 관련 회귀 84/84 통과, 실패·skip·cancel 0, 두 번째 명령 duration 10501.419291ms. Node syntax 검사도 세 생산 파일 모두 exit0이다. 합성 10M 정산 이력을 이관한 뒤 321토큰을 더 정산해 10,000,321과 다음 예약번호154를 확인했다. 병렬 로컬 contender4개는 사용량705·정산4·서로 다른 예약번호1..4·잔여잠금0을 확인했다. pending/blocked/계정 부족/환불 보존/취소/콜백 실패를 함께 검사했다.

수정 파일: `src/benchmark/budget.mjs`, `src/benchmark/budget-acquire.mjs`, `scripts/migrate-unlimited-token-budget.mjs`, `test/benchmark-budget-v3.test.mjs`, `test/budget-acquire.test.mjs`.

미검증: 실제 Jev API와 외부 계정, 실제 장부 이관, 네 조건 제품 효율. 모델 호출0, 실제 장부 읽기·수정0, 원본 후보·Personal OS 변경0, 커밋·푸시0. 새 소스·테스트·이 문서는 미커밋이다. root/runner에 위 API를 전달했으며 독립 review가 진행 중이다.

## 종료 후 환불 인터페이스 감사

2026-10-11 KST, root의 추가 요청으로 기존 D056/D059 환불 증거, 현재 v3 정산 함수, D067 `jev_all`의 저장된 `jev-0056` 오류 이벤트를 읽었다. [감사 JSON](../../benchmark-runs/d067-review/refund-interface-audit-01.json)에 읽은 원본 10개 해시와 정확한 입력 요구사항을 고정했다. 실제 장부·키·계정 읽기 및 API 요청은 이 감사에서 수행하지 않았다.

저장된 이벤트는 HTTP400 `model_input_limit`와 제공자 문구 `No charge was made.`를 보존한다. 기존 명시 환불 인터페이스는 별도로 인증된 사용 내역의 해당 실패/무과금 행과 fresh GET credits의 예약0·부채0·frozen false를 요구한다. `listCredits()`는 계정 상태만 반환하며 요청별 환불 영수증 GET은 구현/확인되지 않았다. 서버에 그러한 기능이 없다고 단정하지 않는다. D059 일회성 script는 과거 요청 ID·v2 config를 고정했으므로 D067에 실행하면 안 된다.

하위 HTTP 이벤트의 `outcome_uncertain:false`와 상위 어댑터의 `status:uncertain`이 다르다. 확정 HTTP실패, 미확인 추론 사용량, 미정산 예약을 각각 보고하도록 root에 전달했다. 원본 이벤트는 수정하지 않았다. 현재 계정의 정확한 요청 매칭·GET·장부 확인·정산은 root에게 남겼다.
