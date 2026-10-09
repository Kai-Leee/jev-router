# 관측 도구·실패 진단 조사 역할

2026-10-09 사용자 요청: 실시간 업데이트 연동을 폭넓게 조사하고 진행 실패를 확인해야 한다.

- 담당: dashboard_research 재배정. 소유 파일: `docs/research/OBSERVABILITY_TOOLS.md`만.
- Langfuse, Arize Phoenix, LangSmith, OpenTelemetry/Grafana 계열, Temporal/Prefect/Dagster 중
  관련 사례를 공식 문서로 조사한다. 목록 나열보다 agent step/call/tool 실패와 실행 생존/정체,
  self-host/local/privacy, 외부 CLI 연동, live ingestion 지연/flush, 운영 부담을 비교한다.
- 현재 Jev+Claude CLI JSONL와 단일 호스트/Docker 실험 구조에 도입할 가치와 한계를 판단한다.
- 문서상 기능과 직접 실행 검증을 분리하고 오류 상태가 정확도·업무 성공을 보장하지 않음을 명시한다.
- OAuth 구독/CLI 내부 HTTP 수·실제 청구액은 tracing 도구만 붙여 알 수 있다고 주장하지 않는다.
- URL/확인일/실제 읽은 증거와 실패 접근을 남긴다. 가격은 조사 필수가 아니며 추정하지 않는다.
- 외부 서비스로 사용자 데이터 전송, 모델 호출, 설치, 제품 소스 변경은 하지 않는다.
- 완료 후 메인에 핵심 비교·추천·한계와 파일을 보고하고 쓰기를 종료한다.
