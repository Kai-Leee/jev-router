# 호출·토큰·비용 대시보드 조사

확인일: 2026-10-09 (Asia/Seoul). 담당: `dashboard_research`.
검증 수준: 공식 문서 조회 + 기존 수집 코드 읽기. 실제 추론·청구 검증은 수행하지 않았다.
이 문서는 계측 계약 제안이며 구현 완료 또는 모델 성능 증거가 아니다.

## 선택한 스킬

로컬 `playwright` 스킬은 실제 브라우저 조작·화면 검증에 적합하다. 읽은 파일은
`/Users/lee/.codex/skills/playwright/SKILL.md`이며, `command -v npx` 결과는
`/opt/homebrew/bin/npx`였다. 스킬 지침은 CLI/wrapper 우선, 조작 전 새 snapshot,
화면 변화 후 snapshot 갱신, 결과물은 `output/playwright/` 보관이다.
명시 요청 없는 `@playwright/test` 전환이나 전역 설치는 필요하지 않다.
이 역할에서는 스킬을 조사했으며 브라우저 실행은 메인 담당이다.

`design-an-interface`의 실제 목적은 모듈 API 대안 비교이고 구현을 하지 않는 스킬이다.
`ara-research-manager`는 작업 완료 후 기록용 스킬이다. 둘 다 이번 화면 구현의 선행
절차로 적용하지 않는다. Superpowers도 실행하지 않았다.

## 공식 문서에서 확인한 의미

**Jev.** 원시 입력·출력 토큰과 잔액 차감량은 다르다. 잔액 토큰은 모델 배율 적용 후의
`X-Jev-Paid-Input-Tokens-Used`, credits는 `X-Jev-Credits-Charged`를 따른다.
한 요청은 토큰 잔액 또는 credits 중 하나로 정산된다. 잔액 헤더는 호출 이후 스냅샷이다.
`usage.cost` 누락은 USD 미제공을 뜻하며 0이 아니다. 여러 질문이 한 POST에 들어갈 수
있으므로 질문 수와 요청 수를 분리한다. `GET /api/v1/models`는 추론이 아니다.
불확실한 POST는 자동 재전송하지 않는다. [Jev 공식 문서](https://jev-ai.pro/docs)

**Claude.** `total_cost_usd`와 `modelUsage[*].costUSD`는 클라이언트 가격표 기반 추정이다.
동일 `message.id`의 assistant 메시지는 중복 집계하지 않는다. assistant의 출력 토큰은
placeholder이므로 최종 result/modelUsage에서 읽는다. `modelUsage`는 하위 에이전트까지,
result `usage`는 메인 루프만 포함한다. 입력·cache 생성·cache 읽기는 별도 항목이다.
재개한 세션의 비용은 누적될 수 있으므로 결과들을 단순 합산하지 않는다. crash 결과의
0은 이전 사용량을 지울 근거가 아니다. [공식 계측 문서](https://code.claude.com/docs/en/agent-sdk/cost-tracking)

Claude 구독 OAuth와 API 키는 청구 경로가 다르다. 구독의 별도 usage credits도 존재하므로
OAuth라는 사실만으로 실제 추가 청구액 0을 가정하지 않는다. 이 화면에서 구독 청구 내역을
조회하지 않는 동안 `실제 청구 USD`는 미확인이다.
[공식 비용·구독 안내](https://code.claude.com/docs/en/costs)

## 구현에 권고하는 측정 계약

기존 코드의 `decision-gate.mjs`는 `input` 기록 후 `decide()`를 호출한다. 첫 `decide()`는
`benchmark-mcp.mjs`에서 모델 GET 검사를 먼저 한다. 따라서 `input` 개수만으로 Jev POST
수를 확정할 수 없다. `src/client.mjs`의 전송 지점에 별도 계측을 두거나 수치를 명확히
`판단 시도`로 표시해야 한다. 로컬 validation 실패는 API 호출이 아니다.

| 화면 수치 | 채택할 관측 근거 | 사용하면 안 되는 대체값 |
|---|---|---|
| Jev 전송 시도 / 응답 완료 / 결과 불확실 | 추론 POST 전송 경계 이벤트와 응답 receipt, 오류 상태 | 모든 gate input 또는 모델 조회 GET |
| Jev 질문 수 | 실제 전송 요청의 questions 수 | POST 수와 동일하다고 가정 |
| Jev 입력·출력 | 성공 응답의 `usage` | 잔액 토큰 차감량 |
| Jev 잔액 토큰·credits 차감 | 파싱·검증한 billing 헤더 | 원시 입력 토큰 또는 고정 USD 가격 |
| Claude 관측된 응답 단계 | unique assistant `message.id`, 메인/하위 범위 구분 | stream 줄 수, 도구 호출 수, `num_turns`를 전체 HTTP 요청 수로 간주 |
| Claude 입력·출력·cache | 완료 시 modelUsage 우선, 없으면 범위가 제한된 result usage | 두 출처를 함께 더하거나 assistant 출력 placeholder 합산 |
| Claude 추정 USD | CLI가 보고한 최종 누적 추정값과 costBasis/인증 방식 | 실제 카드 청구 또는 구독 잔액 소진액 |

이 표의 계측 경계와 표시 문구는 이 프로젝트를 위한 설계 제안이다. 전송 직전 이벤트도
서버 수신을 증명하지 않으므로 `전송 시도`라고 한다. provider 내부 재시도·보이지 않는 보조
요청을 관측하지 못한 경우 `전체 HTTP 요청 수: 미제공`을 유지한다.

서로 다른 출처의 비용을 하나의 USD 합계로 합치지 않는다. Jev USD가 없으면 Claude 추정
USD를 전체 시스템 비용이라고 이름 붙이지 않는다. 누락이 있는 합계는 `관측 합계`와
`관측 건수 / 대상 건수`를 함께 표시하고 완전한 총액은 null로 둔다. 빈 기록은 `실행 없음`,
깨진 기록은 `집계 불완전`, 실패 후 미수집은 `미확인`으로 구별한다.

남은 토큰·credits는 계정 전체 스냅샷이라 다른 클라이언트 사용이 섞일 수 있다. 실행별 비용을
잔액 차분으로 역산하지 않는다. receipt run ID와 요청 시간은 내부 대조 근거로 보존하되
브라우저에는 API 키, Authorization, 원문 프롬프트, 쉘 명령, 도구 출력 대신 집계 allowlist만 보낸다.

## 필요한 회귀·브라우저 검사

- 같은 Claude message ID가 여러 번 등장해도 응답 단계와 입력을 중복 합산하지 않음.
- assistant output placeholder를 완료 출력 수치로 쓰지 않음; 미완료면 범위 제한 또는 null.
- modelUsage와 result usage가 함께 있을 때 한쪽만 채택하고 출처·범위를 표시.
- Jev GET, validation 실패, 전송 시도, 완료, timeout을 구분하며 timeout USD를 0으로 만들지 않음.
- billing 문자열 null/빈 문자열/비수치/음수는 0으로 강제 변환하지 않음.
- 정상·실패·비어 있음·일부 누락 run을 전환하고 새로고침해도 수치·단위·상태가 일치.
- 실행 중 파일의 마지막 미완성 줄을 성공 기록으로 처리하지 않음.
- fixture 데이터와 실제 모델 결과를 분리하여 필터와 화면에서 식별 가능하게 함.

## 남은 한계

공식 SDK 의미를 확인했지만 이 로컬 CLI 버전의 실제 stream/result 모양과 계정 청구를
이 역할에서 검증하지 않았다. 메인 실행에서 기록된 원본과 최종 대시보드를 대조해야 한다.
문서 조회는 모델 호출 정확도·실제 USD 비용·절감 효과의 증거가 아니다.
