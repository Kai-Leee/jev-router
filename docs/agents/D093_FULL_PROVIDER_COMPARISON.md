# D093 — Codex·Claude 단독 대 Jev 모델·노력도·성과 라우팅 전체 개발

2026-10-17 KST 최신 사용자 지시: 새 모델·노력도와 실측 공개 성과를 반영한 Jev 경로로 실제 전체 개발을 다시 실행한다. Codex 단독과 완료·재수리·총 시간·캐시 포함 토큰·비용을 비교하고 Claude로 치환한 비교도 수행한다. 현재 로그인된 Mac에서 기존 승인된 공개 OpenAPI generator 합성 과제/생성 코드/공개 실패/공개 성과를 해당 모델에 보내는 전체 개발 실행이다. 앞선 D092의 JSON 한 건 검증 범위를 이번 요청이 새로 확장한다. 인증정보·다른 개인 프로젝트·숨김 검사 상세는 모델에 보내지 않는다.

조건은 각1회, 가족별 짝 비교 총4개로 한다. A Codex판단+Codex작업자, B Jev판단+Codex작업자, C Claude판단+Claude작업자, D Jev판단+Claude작업자. 각 가족 안에서는 같은 모델·노력도 후보와 같은 실행 시작 전 역사 스냅샷을 사용하며 판단 주체가 모델·노력도도 선택한다. 이전 고정 모델 비교와 다른 조건이다. 공개93·독립63·동시작업자2/최대30·수리2회·같은 과제/공개 명세/카탈로그·도구 없는 파일 본문 반환·controller 작성/검사·필수 source/전송/기록/정산을 유지한다. 이전 조건의 결과를 다음 조건의 모델 입력으로 학습하지 않는다. 단일 관측·서로 다른 새 DAG와 코드이므로 통계적 일반화/모델-only 인과 효과는 주장하지 않는다.

과거 D091/D092 결과·계약은 그대로 보존한다. 변경 전 현재 source와 결과 해시를 새 private 폴더에 동결한다. 실험 전체는 Mac 부하와 공유 장부 때문에 순차로 실행하며 준비·감사 역할만 병렬이다. root만 모델/계정/앱/Docker/원장 호출을 한다. 미확정 요청·미정산은 재시도하지 않고 중지한다. user의 기존 무상한 토큰/시간 정책은 유지하되 API 구조·모델한도·환경/소스 검사는 유지한다. 실행 후 source 수정 금지. 새 gateway/manifest를 사용하며 과거 핀을 수정하지 않는다.

## 역할과 파일 소유

- root: Codex/CLaude 공통 전체 실행기·모델 선택·gateway/manifest/바인딩·source동결·실제4조건 실행·정산·보고. 소유 src/benchmark/codex-e2e-runner.mjs, codex-e2e-decisions.mjs, codex-artifact-worker.mjs, pointsman-gateway.mjs 및 새 D093 runner/bin/계약. 인터페이스 변경은 관련 담당에 먼저 통지.
- d086_runner_pair: 새 src/benchmark/claude-provider.mjs, claude-environment.mjs, 관련 집중 테스트. Claude native CLI2.1.299 direct path+SHA/version, 로그인 cli auth(max), --disable-slash-commands/--tools empty/--strict-mcp-config/--setting-sources empty/standalone cwd, ephemeral/no-session, explicit model+effort, strict JSON structured output. Codex attempt와 동일 {answer,receipt} 및 provider/observedmodel/usage(uncached/cacheRead/cacheWrite/output/cost/unknown)/tooltrace, 실패/불확실/기록/환경검증/no fallback. 실제 CLI·키체인·auth·모델·GET는 root만. CLI docs/help source는 root가 제공.
- d086_accounting: Claude 공식 문서 기반 새 가격·모델/노력도 후보 정본과 readonly local capability sources 검토. 새 src/benchmark/claude-pricing.mjs, contracts/claude-pricing.v1.json, tests만 소유. 공식 GET은 허용하되 모델/auth/개인파일 호출금지. Opus5.5/Fable5.1/Sonnet5.5/Haiku5.5 가능목록과 effort, tokencache 포함 의미 명확히. 문서지원과 실제 계정에서의 실행 검증 구분. API환산과 실제월구독액 구분.
- capability_audit: D092 public history를 Claude로 가져갈 수 있는지 읽기 전용 검토, 공통 가족별 publichistory snapshot/allowlist 설계와 새 private 감사만 작성. Codex85원본과 과거Claude worker의 동등입력/산출물/공개revision 연결을 검증할 수 없으면 Claude무표본unknown으로 명시. 숨김/독립결과읽기금지. 기존 모듈/원본변경금지. root와 model-profile API합의.
- metrics_audit: 새 private 결과 감사 코드/집계 준비. 동결 후 실제4조건 원문·공개93/독립63 후보binding·repair rounds/workerrecalls/noop·time boundaries/cacheincltokens/Jev+모든CLIcall/모델effort/가격·원장동일성/보존을 독립 대조. root 완료 통지 전 모델이나 Docker 등을 실행하지 않는다. 이전 D092정산을 이 실험에 중복 가산하지 않는다.

소유하지 않은 생산 파일은 수정하지 않는다. 모든 담당은 exactAPI/검사범위/초기오류/한계를 root에 전달하고 freeze 가능 시점을 알린다. 핵심 문서와 상태를 계속 기록한다. 주목표는 품질을 유지한 전체 시간·단가 감소이며 짧은 실패 종료는 완료 속도 절감이 아니다.
