# Jev Router

[English](README.md) | **한국어** | [简体中文](README.zh-CN.md)

> 연구·분석 기록은 [`research` 브랜치](https://github.com/Kai-Leee/jev-router/tree/research)에 있습니다.

Jev Router는 메인 코딩 에이전트의 모델 선택과 작업 중 판단을 지원합니다. 방법은
[Jev AI](https://jev-ai.pro)에 고정된 구조화 질문을 보내는 것입니다. 이 저장소에는 서버 전용
Jev 클라이언트, 오프라인 평가 CLI, 격리 벤치마크 실행기, 로컬 사용량 대시보드가 있습니다.
연구 프로젝트입니다. 실측 결과는 적으며, 각 결과는 근거와 함께 기록합니다.

[현재 상태](#현재-상태) · [왜 필요한가](#왜-필요한가) · [빠른 시작](#빠른-시작) · [한계](#한계) ·
[문서](#문서) · [보안](#보안) · [라이선스](#라이선스)

## 현재 상태

| 항목 | 상태 | 근거 |
|---|---|---|
| Jev 연결 (`GET /v1/models`, `POST /v1/systemone`) | 구현. 2026-10-08 키 설정과 인증 모델 목록 조회 확인 | [사용 안내](docs/USAGE.md#로컬-키-설정) |
| 오프라인 평가 CLI | 구현. 포함된 예제는 합성 데이터 | [평가 CLI](docs/EVALUATION_USAGE.md) |
| 실제 단일/분할 E2E 실행 (D029) | 조건별 1회. 독립 채점 둘 다 30/30. 분할: 단계시간 합계 22.829% 감소, 비용 추정 64.112% 증가 | [D029 결과](https://github.com/Kai-Leee/jev-router/blob/research/docs/orchestration/D029_RESULTS.md) |
| 입력 투영 v3 (D031) | 오프라인 재생만 수행, 새 유료 호출 없음, 회귀 테스트 390/390 | [D031 구현](https://github.com/Kai-Leee/jev-router/blob/research/docs/orchestration/D031_IMPLEMENTATION.md) |
| 자동 라우팅 효과, 제품 완성도 | 미검증 | [STATE](https://github.com/Kai-Leee/jev-router/blob/research/docs/agents/STATE.md) |

최신 체크포인트는 항상 [research 브랜치의 STATE](https://github.com/Kai-Leee/jev-router/blob/research/docs/agents/STATE.md)입니다. 이 표는 그보다 늦게 갱신될 수 있습니다.

## 왜 필요한가

메인 에이전트는 작업 중 작은 판단을 많이 합니다. 어떤 모델과 effort를 쓸지, 작업을 나눌지,
근거가 충분한지 등입니다. Jev Router는 이런 반복 판단을 고정 영어 질문과 구조화 답
(`choice`, `score`, `noul`)으로 Jev AI에 맡길 수 있는지 검증합니다.

```text
메인 작업의 판단 지점
→ 목표·근거·필요한 출력 확인
→ 후보 구성(필요한 경우)
→ 영어 질문 구성 및 API 입력 검증
→ Jev 호출
→ 응답 검증·판단 상태·사용량 기록
→ 메인 세션의 후속 행동
```

메인 세션이 목표를 유지하고 행동합니다. Jev 답은 실행 권한이나 테스트 통과의 증거가 아닙니다.
정확도·속도·토큰·비용 개선은 실측 전까지 가설입니다. Jev의 확률은 작업 성공률이 아닙니다.
상세: [기술 명세](docs/TECHNICAL_SPEC.md).

## 빠른 시작

Node.js 22 이상이 필요합니다. 외부 패키지는 없습니다.

```sh
git clone https://github.com/Kai-Leee/jev-router.git
cd jev-router
npm test            # 가짜 키와 모의 HTTP만 사용. 추론·잔액 사용 없음
npm run eval:demo   # 합성 기록의 오프라인 평가
```

MCP 테스트 3개는 `vendor/jev-mcp/0.3.1/`의 고정 `jev-mcp` 바이너리(macOS ARM64)가 필요합니다.
바이너리는 커밋하지 않았습니다. [vendor/jev-mcp/SOURCE.json](vendor/jev-mcp/SOURCE.json)의
아카이브 URL에서 받고 SHA-256을 확인합니다. 바이너리가 없으면 새 클론에서 390개 중 387개가 통과합니다.

Jev 연결에는 Jev AI 계정과 키, Jev AI 이용약관 동의가 필요합니다 ([로그인](docs/USAGE.md#로그인)).

```sh
npm run login            # 약관 동의, 키 페이지에서 로그인, 키 숨김 입력
npm run config           # 설정과 키 존재 여부만 출력. 네트워크 없음
npm run models           # 인증 GET 1회
npm run demo -- --spend  # 유료 POST 1회. Jev 잔액 사용
```

더 보기: [전체 사용·실패 처리·배포 안내](docs/USAGE.md) ·
[MCP 실행 연결](MCP.md) · [대시보드](docs/DASHBOARD.md) (`npm run dashboard`) ·
[벤치마크](benchmarks/README.md).

## 한계

다음이 필요하면 Jev Router를 쓰지 마세요.

- **운영용 라우터.** 실제 배포를 하지 않았습니다. 분산 호출 제한기가 없습니다.
- **자동 복구.** 호출을 자동 재시도하지 않습니다. 결과가 불확실한 유료 POST는 다시 보내지 않고
  사용 내역부터 확인합니다 ([실패 처리](docs/USAGE.md#실패-처리와-제한)).
- **강한 근거.** 유일한 실제 분할 비교(D029)는 조건별 1회입니다. 임계값은 보정하지 않았고
  운영 임계값은 `null`입니다.
- **호스트 연동.** 호스트의 플러그인 자동 로딩, Claude/Codex 실행자 선택, 로드 밸런싱은
  검증하지 않았습니다.
- **유료 키 없는 실제 판단.** 키 없이 동작하는 것은 오프라인 도구와 테스트뿐입니다.

## 문서

`main`에는 코드, 실행 계약, 사용 문서를 둡니다. 실험·결정·작업 기록은
[`research` 브랜치](https://github.com/Kai-Leee/jev-router/tree/research)에 있습니다.

- **시작:** [기술 명세](docs/TECHNICAL_SPEC.md) · [실행 계약](docs/orchestration/contracts/README.md)
- **사용:** [사용 안내](docs/USAGE.md) · [평가 CLI](docs/EVALUATION_USAGE.md)와
  [입력 계약](docs/EVALUATION_CONTRACT.md) · [대시보드](docs/DASHBOARD.md) ·
  [개발 연결과 별도 Opus 모니터](docs/PAIRED_RUN.md) · [벤치마크](benchmarks/README.md) ·
  [MCP](MCP.md)
- **research 브랜치:** [현재 상태](https://github.com/Kai-Leee/jev-router/blob/research/docs/agents/STATE.md) ·
  [문서 찾아보기](https://github.com/Kai-Leee/jev-router/blob/research/docs/orchestration/README.md) · [결정 기록](https://github.com/Kai-Leee/jev-router/blob/research/docs/DECISIONS.md) ·
  [작업 기록](https://github.com/Kai-Leee/jev-router/blob/research/docs/WORK_LOG.md) · [검증 기록](https://github.com/Kai-Leee/jev-router/blob/research/VERIFICATION.md) ·
  [평가 방법](https://github.com/Kai-Leee/jev-router/blob/research/docs/EVALUATION_RESEARCH.md) ·
  [실제 구현 평가 가능성](https://github.com/Kai-Leee/jev-router/blob/research/docs/LIVE_EXPERIMENT_FEASIBILITY.md) ·
  [실시간 실패 표시](https://github.com/Kai-Leee/jev-router/blob/research/docs/REALTIME_FAILURE_RESEARCH.md)
- **릴리스:** [변경 기록](CHANGELOG.md)
- **기여자·에이전트:** [AGENTS.md](AGENTS.md) (Codex 진입점) ·
  [CLAUDE.md](CLAUDE.md) (Claude 진입점, AGENTS.md import) ·
  [개발 에이전트 역할·인계](https://github.com/Kai-Leee/jev-router/blob/research/docs/agents/README.md)

## 보안

- `JEV_AI_API_KEY`는 서버에만 둡니다. 프로세스 환경변수 또는 `~/workspace/.env`를 사용합니다.
  다른 파일 경로는 `JEV_AI_ENV_FILE`로 지정합니다.
- 키를 채팅, 브라우저 코드, Git, 명령행 인수, 로그에 넣지 않습니다. `NEXT_PUBLIC_`, `VITE_`,
  `PUBLIC_` 같은 공개 접두사를 쓰지 않습니다.
- 목적지 URL은 [src/config.mjs](src/config.mjs)에 고정돼 있습니다. 리다이렉트를 거부합니다.
  진단 출력에는 키나 Authorization 헤더가 없습니다.

## 라이선스

[Apache License 2.0](LICENSE).

이 라이선스는 이 저장소의 코드에만 적용되며 Jev AI 서비스 이용 권한을 주지 않습니다.
실제 Jev 기능에는 본인의 Jev AI 계정과 키가 필요하고, Jev AI
[이용약관](https://jev-ai.pro/terms)과 [개인정보 처리방침](https://jev-ai.pro/privacy)에 동의해야 합니다.

재사용하는 `jev-mcp` v0.3.1 바이너리는 Apache-2.0이며 저장소에 커밋하지 않았습니다. 출처와
체크섬은 [vendor/jev-mcp/SOURCE.json](vendor/jev-mcp/SOURCE.json)에 있습니다.
