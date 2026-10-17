# D090 — 앱 CLI · GPT-6.1-Sol/high 전환과 같은 조건 재측정

2026-10-16 사용자 요청: 앱 내장 CLI와 gpt-6.1-sol/high로 전환하고 새 모델 비용 정산으로 Codex 판단/Jev 판단의 공개·독립 결과, 전체 시간·캐시 포함 토큰·비용을 다시 비교한다. 기존 Mac·비용 승인을 유지하고 새 실행1쌍만 순차 실행한다. 기존 결과/인증/장부를 초기화하거나 종료 디렉터리를 재개하지 않는다.

새 경로 `/Users/lee/workspace/plugins/jev-router-codex-d090-20261016`, branch feat/d090-app-cli-61-20261016. D089 source overlay를 보존 복사했다. D089 수리·투영·질문·catalog·공개93/독립63·동시2/최대30/수리2 조건을 유지하고 앱 실제 Mach-O/모델/가격만 새 조건으로 고정한다. root만 실제 모델/GET/Docker/장부 작업을 한다. 숨김 검사 상세를 열람하거나 수리 입력에 넣지 않는다.

역할·파일 소유권:

- root: 새 manifest/gateway v6·runner/bin의6.1 기본 연결·사전 검사·새 소스 핀·역사 소스 보존·실제 Codex→Jev1회 실행·전체 집계·문서. 실행 중 소스를 바꾸지 않는다. 구체 입력/수리 정책은 D089와 동일하게 둔다.
- app_environment: src/benchmark/codex-environment.mjs의 새 opt-in 앱 환경 API와 새 앱 binary 계약/집중 테스트만 소유. 실제 Mach-O 경로·SHA·CLI 버전을 최초 discovery 전과 매호출 전후 검증하고 새/서로 다른 바이너리나 앱 업데이트면 차단한다. legacy createFrozenCodexEnvironment 기본 PATH의 역사 테스트는 보존. 실제 모델 호출 없이 mock discovery 검증만 한다. API와 고정할 실제 hash를 root에 전달한다. 인증 원문·환경 전체·raw account응답을 출력/기록하지 않는다.
- pricing: 새 src/benchmark/codex-pricing.mjs·가격 계약·집중 테스트, 필요시 codex-provider.mjs의 opt-in 참고 정산 필드와 codex-e2e-decisions.mjs 집계만 소유. 현재 공식 OpenAI6.1 가격과 문맥/tier/cache-write 조건을 확인해 근거 snapshot/확인일을 남긴다. 요청 모델 정본으로 단가를 선택하고5.6 단가를 잘못 적용하지 않는다. 입력/출력/캐시 미확인/모델미등록은unknown/거부로 구분한다. 실제 구독 청구와 API 참고 환산은 구분하고 월정액 배분은null. 기존 역사 가격/원시결과 변경 금지. root와 provider opt-in API를 합의한 뒤 구현한다. GET 공개문서 외 모델·계정·장부·Docker 접근 금지.
- metrics_audit: 완료 뒤 신규 원시 영수증·공개 고정93ID(관측+명시미실행)·독립63요약·후보 현재 SHA·source/environment/model matching·원장 전후를 독립 재계산한다. 새 모델 단가 계약과 실제 usage 계산을 대조한다. 실행 중엔 스크립트 준비만, root 통지 뒤 실행한다. 생산 소스/실행 파일/후보/장부 수정·추론·Docker·숨김 상세 금지. 감사 가정의 실패도 보존한다.

가설: 새 모델이 코드 품질과 수리량을 개선할 가능성은 있으나 아직 미측정이다. 변경된 CLI/모델/가격이 포함된 조건이므로 D089 차이를 순수 Jev 효과로 주장하지 않는다. 1회 관측, 제품 미완료 시 완료 가속도null, 실제 모델/노력도 독립 확인과 요청 설정을 구분한다.

예산은 원래 `/Users/lee/workspace/plugins/jev-router/benchmark-runs/jev-usd1-budget.json`를 절대 경로로 사용한다. 추가 로컬 토큰/시간 상한을 도입하지 않고 기존 공식·입력 구성·불확실 정산 검사를 유지한다. pending0/blockednull을 실행 직전 확인한다. CLI 인증은 격리 HOME의 private copy만 사용하고 종료 후 제거한다. 생산 소스 동결 후 수정 금지, 문제가 생기면 terminal과 증거를 보존해 새 조건으로 다룬다.
