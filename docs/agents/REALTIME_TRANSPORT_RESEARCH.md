# 실시간 전달·화면 조사 역할

2026-10-09 사용자 요청: 실시간 업데이트 연동을 폭넓게 조사하고 진행 실패를 확인할 수 있어야 한다.
목적은 전송 속도와 실행 상태의 신뢰성을 구별해 설계 근거를 남기는 것이다. 이번은 조사이며 제품 코드를 바꾸지 않는다.

- 담당: dashboard_ui 재배정. 소유 파일: `docs/research/REALTIME_TRANSPORT.md`만.
- 현재 `dashboard/app.js`, `src/dashboard/server.mjs`, reader와 DASHBOARD_CONTRACT를 읽는다.
- 공식 출처로 polling/long polling/SSE/WebSocket을 비교한다. reconnect, replay/cursor,
  backpressure, disconnect/heartbeat, HTTP proxy buffering, browser background timer 한계를 포함한다.
- failure-first 화면의 정보 구조와 사용자의 다음 판단, stale 연결과 실제 작업 실패를 구분한다.
- SSE 변경 자체로 모델 진행·실패를 알 수 없음을 명시한다. 제안과 현재 구현을 구분한다.
- 원천 URL, 조회일, 실제 읽은 내용/접근 실패를 기록한다. 키·실제 추론·패키지 설치·서버 변경은 금지한다.
- source docs를 우선한다. 설정값은 제안으로 표시하고 실측 지연/정확도를 만들지 않는다.
- 완료 시 근거·한계·다음 단계·소유 파일을 메인에 보고하고 쓰기를 종료한다.
