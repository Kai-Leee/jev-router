# Jev / Claude 사용량 대시보드

구현·확인일: 2026-10-09. D-017에 따라 로컬 실행 기록을 읽는 화면이다.
Jev와 Claude의 실제 모델 비교·청구 검증은 아직 수행하지 않았다.

D-018 감사의 도구 실패·gate 정지·조기 완료 판정을 D-019에서 보완했다.
같은 개발 그룹의 구현/모니터, 안전한 오류 코드, 독립 heartbeat와 모니터 해석을 표시한다.
[개발 연결 안내](PAIRED_RUN.md)를 따른다. 실제 모델 연동은 자동 승인 심사의 금액 승인 요구로 아직 시작되지 않았다.
호스트 전체 장애 감지·독립 process supervisor·내부 HTTP 계측은 여전히 미검증/미연결이다.

## 실행

저장소 루트에서 `npm run dashboard`를 실행한 뒤 `http://127.0.0.1:8787`을 연다.
`benchmark-runs/`와 `../personal-os-jev-lab/runs/`의 기록을 기본으로 읽는다.
호스트에서 실행하며 SSE 전체 snapshot으로 갱신한다. 서버 수집 주기는 기본1초, GET fallback은3초다.
이는 설정값이며 표시 지연의 실측 보장이 아니다. 서버 종료는 해당 터미널에서 Ctrl-C다.

```sh
npm run dashboard
# 표시·집계 검증용 합성 예제만 별도 포트에서 열기
npm run dashboard -- --port 8788 --runs-root examples/dashboard
# 다른 실행 기록 폴더는 반복 지정 가능
npm run dashboard -- --port 8788 --runs-root /path/to/runs
```

서버는 `127.0.0.1`에만 바인딩한다. 읽기 전용이며 실행·유료 호출 버튼은 없다.
Jev 키는 기존처럼 서버 환경변수 또는 `~/workspace/.env`에서 실행기만 읽는다.
대시보드 서버는 키를 읽지 않는다. 브라우저 API에는 집계된 허용 필드만 전달하며
프롬프트·명령·원본 로그·계정 정보·인증 헤더를 전달하지 않는다.

## 수치의 의미

- Jev 전송 시도: 검증과 모델 GET 후 추론을 호출하기 직전에 내구 기록한 횟수.
  질문 개수나 GET 개수가 아니며 서버가 실제 수신했다는 보장은 아니다.
  완료·실패·불확실을 별도로 표시하고 불확실한 POST는 재전송하지 않는다.
- Claude 관측 응답: 중복 `message.id`를 제외한 응답 단계. 전체 HTTP 요청 수와 내부
  재시도 횟수는 현재 stream 집계에서 제공하지 않으므로 미확인이다. 선택적 native OTel은 후속
  조사에서 확인한 추가 계측 경로이며 아직 연결하지 않았다. 표의 완료/실패는 CLI 프로세스 단위다.
- Claude 토큰: 최종 `modelUsage` 우선이며 없으면 메인 루프 `usage`로 범위가 제한된다.
  입력·출력·캐시 읽기·캐시 생성을 구분한다. 진행 중 assistant 출력 placeholder는 합산하지 않는다.
- Jev 비용: 원시 토큰, 잔액 토큰 차감, credits, 공급자 보고 USD를 구분한다.
  구매 단가가 없는 토큰·credits를 임의로 USD로 환산하지 않는다.
- Claude `total_cost_usd`: CLI 가격표 기반 API 환산 **추정** 비용이다. OAuth 구독의 실제
  추가 청구액을 조회한 값이 아니다. 실제 청구 USD는 별도 근거 없이는 미확인이다.
- 누락·중단: 완전한 합계는 미확인, 보존할 수 있는 값은 관측 부분합과 관측 분모를 표시한다.
  명시적으로 모델을 쓰지 않은 대조 실행의 0과 미확인을 구별한다.
- 실행 종료와 구현 평가 통과는 다르다. 과거 grader 결과는 원래 평가 범위대로 표시하며
  Personal OS의 미검증 browser/native 항목을 통과로 승격하지 않는다.

시간 한도와 관측 시각이 있는 진행 기록은 한도+30초 이후 종료 기록이 없으면 불확실해진다.
그 이전의 실행 중 표시는 기록과 시간에 근거한 추정이며 프로세스 생존 확인은 아니다.
컨테이너 정지 실패 역시 불확실로 표시한다. 과거 기록에 전송 경계가 없으면 호출 수는 소급 추정하지 않는다.

## 계측 경로와 검증

실행기는 `claude.stream.jsonl`에 스트림을 저장하고, 최종 요약은 `result.json`에 남긴다.
Jev의 전송 전/후 이벤트는 `decisions.jsonl`이다. 권한 0600의 원본 기록은 로컬에만 보존한다.
기존 `claude.stdout.json`은 하위 호환으로 읽지만 두 결과를 중복 합산하지 않는다.
줄 중간·UTF-8 중간에서 쓰기가 멈추어도 앞선 완전한 줄은 부분 관측으로 유지한다.

```sh
npm test
node --test test/benchmark-telemetry.test.mjs test/dashboard-metrics.test.mjs test/dashboard-server.test.mjs
```

브라우저 검사는 설치된 Playwright 패키지와 Chrome 실행 파일을 사용한다. 런타임 패키지는
제품 의존성이 아니다. 먼저 합성 예제 서버를 열고 실제 경로를 넣는다.

```sh
JEV_PLAYWRIGHT_PACKAGE=/path/to/node_modules/playwright/package.json \
JEV_CHROME_EXECUTABLE=/path/to/chrome \
node scripts/check-dashboard-browser.mjs http://127.0.0.1:8788
```

명령은 자체 새 브라우저 프로필을 만들며 실제 모델을 호출하지 않는다.
`output/playwright/browser-check.json`, desktop/mobile PNG, 접근성 snapshot을 남긴다.
샘플의 2회/205·420토큰/$0.1234 등은 합성 값이며 실제 사용 결과가 아니다.
최종 측정·실패 이력은 [검증 기록](../VERIFICATION.md), 공식 의미는
[조사](DASHBOARD_RESEARCH.md), 필드 계약은 [계약](DASHBOARD_CONTRACT.md)을 참조한다.

현재 모델 호출·토큰이 이 계측에 실제로 들어오는지와 공급자 청구 일치는 다음 실험에서 확인한다.
실제 모델 간 비교, Codex 계측, 장기 저장 DB, 사용자 인증이 있는 원격 배포는 이번 구현 범위에 없다.

## 2026-10-09 — 공식 단가를 토큰 옆에 표시

입력·출력·캐시 토큰 수 옆에 환산 추정 USD와 제공자 총액을 표시한다. Jev Creator 월간 구독료
배분과 Claude Opus5.5 API 가격표 환산을 구분한다. 각 패널의 공식 출처/확인일 및 펼침 설명으로
산식과 결측 조건을 확인할 수 있다. 가격은 자동 갱신되지 않는2026-10-09 확인 프로필이다.
상세 [가격 계약](DASHBOARD_PRICING.md). D-020 공유 예산은 별도 보수적 기준을 유지한다.
