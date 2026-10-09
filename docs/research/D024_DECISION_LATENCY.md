# D-024 고정 질문 판단 전달 측정

2026-10-09. E2E 코드생성 시간을 제외하고, 성공 실행의 저장 질문 1/첫 finish/마지막 finish를 그대로 재사용했다. 각 질문은 Claude와 Jev에 한 번씩 전달했다. 명령 실행 없음. 순서 C→J, J→C, C→J. 서로 다른 질문 3개이며 반복 안정성 표본이 아니다.

| 질문 | Claude 새 CLI 전체 ms | Jev 호출 전체 ms | Jev HTTP ms | Claude / Jev 선택 |
|---|---:|---:|---:|---|
| 첫 행동 |4189.232|1128.726|444|a / a|
| 첫 완료 요청 |3596.583|725.730|453|finish / continue|
| 마지막 완료 요청 |3892.038|882.933|432|finish / finish|
| 산술평균 |3892.618|912.463|443|정답률 아님|

평균 전달시간 비=3892.618/912.463=4.266배. 감소율=(3892.618−912.463)/3892.618=76.56%, 분모 Claude 새 CLI 전체 시간. 현재 전송 구조의 측정이며 순수 모델 추론 비교가 아니다. Claude CLI에는 프로세스 시작/인증/250ms 종료 정리도 포함되고, Jev에는 재사용 HTTP client, 잔액 GET/예산/기록, 첫 호출의 models GET이 포함된다. Claude 보고 duration_api_ms는1658/1639/1866으로 별도 저장하지만 Jev HTTP와 같은 계측 정의라고 가정하지 않는다.

동일 state/questions를 사용하되 Claude에는 JSON 출력용 system prompt가 추가된다. 서빙 조건도 다르다. 실제 모델은 claude-opus-5-5와 jev-1.13.0. 두 번째 질문의 판단이 다르므로 속도 개선을 품질 개선으로 해석할 수 없다. 정답 라벨/교정 정확도는 측정하지 않았다.

명령 (유료 실행, 기존 공유 예산 재사용, 새 출력 경로 필수):

```sh
node scripts/decision-latency.mjs benchmark-runs/d022-e2eswe-run-05.json benchmark-runs/e2eswe-d022-05/decisions.jsonl benchmark-runs/d024-fixed-01 --spend
```

이미 수행한 실행을 위 경로로 재실행하지 않는다. [전체 결과](../../benchmark-runs/d024-fixed-01/result.json), [요청·응답](../../benchmark-runs/d024-fixed-01/events.jsonl), Claude 원본 stream은 같은 디렉터리에 있다. Jev 신규3회/1756입력토큰, 보수적 예산환산USD0.0010536. 기존 장부 누적40회39630토큰 시점의 결과다. 가격은 청구액이 아니다.

전체 E2E 기존 결과는 Claude197.515초/Jev250.725초로 반대 방향이었다. [구조 분석](D024_SYSTEM_ANALYSIS.md)과 함께 읽어야 한다. 새 규칙 흐름의 E2E 속도 개선은 별도 재측정 전까지 미검증이다.
