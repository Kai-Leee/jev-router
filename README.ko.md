<p align="center"><img src="docs/brand/pointsman-256.png" width="160" height="160" alt="Pointsman 마스코트: 혀로 선로 전환 레버를 당기는 개구리"></p>
<p align="center"><a href="https://m8ven.ai/mcp/kai-leee-jev-router-1k0heh?s=readme"><img src="https://m8ven.ai/badge/mcp/kai-leee-jev-router-1k0heh?v=048f027e982892c5acfd612cc732a9bb" alt="M8ven Score"></a></p>

<h1 align="center">Pointsman</h1>

<p align="center"><em>Jev와 의존성 DAG로 빠르게 연결하는 작업 라우팅.</em><br><sub>이전 이름 Jev Router</sub></p>

[English](README.md) | **한국어** | [简体中文](README.zh-CN.md)

Pointsman은 Jev와 의존성 DAG를 활용하는 코딩 에이전트 작업 라우팅 프로젝트입니다.
구조화된 판단을 작업 분해·선행 관계·실행 순서에 연결하고, 준비된 작업을 코딩 작업자에게 배정합니다.
연구 실행기는 라우팅 결과를 담당 산출물, 공개 검사, 실행 기록까지 연결합니다.

이번 배포는 Jev 클라이언트·평가 도구·실행 계약·사용량 대시보드를 제공합니다.
[main·research·로컬 기능 구분과 스킬 분해 방법](docs/CAPABILITIES.md)을 먼저 확인하세요.
고급 DAG 실험은 [research 브랜치](https://github.com/Kai-Leee/pointsman/tree/research)에서 확인할 수 있습니다.

[실측 결과](#실측-결과) · [라우팅 과정](#라우팅-과정) · [빠른 시작](#빠른-시작) ·
[문서](#문서) · [보안](#보안)

## 실측 결과

완료된 D067 비교에서 Jev 분해·관계 판단 조건은 Claude 기준선 대비 **개발 시간 21.84%, 보고 토큰 합계 46.50% 감소**를 기록했습니다. 분해만 Jev로 옮긴 조건은 **시간 28.74%, 토큰 41.42% 감소**였습니다. 아래 세 조건 모두 **공개 85/85·독립 63/63 검사**를 통과했습니다.

| OpenAPI Python client generator 조건 | 개발 단계 시간 | 보고 토큰 합계 | 당시 API 단가 환산 비용 |
|---|---:|---:|---:|
| Claude 구조화 판단 + Claude 작업자 | 36분 20.704초 | 6,772,666 | $21.135172 |
| Jev 분해 판단 + Claude 작업자 | 25분 54.036초 | 3,967,289 | $9.864863 |
| Jev 분해·의존 관계 판단 + Claude 작업자 | 28분 24.540초 | 3,623,150 | $8.766580 |

조건별 1회이며 같은 비교군에서 동시에 실행했습니다. 공통 작업자는 Opus 5.5 medium,
조건당 동시 작업자는 2개입니다. 시간은 판단·구현·수리·공개 검사를 포함하고 공통 준비와 독립 채점은 제외합니다.
토큰은 Claude 입력·출력·캐시 생성·읽기와 Jev 입력·출력의 합이며, 공급자별 토크나이저는 다릅니다.
세 조건의 총 외부 호출은 모두 57회입니다. 감소율의 분모는 Claude 기준선입니다.
분해·관계 조건의 역사적 API 환산 비용은 58.52% 감소했으며, 월 구독 청구액이 아닙니다.
[측정 방법·토큰 내역·추가 판단 구간](docs/MEASURED_ROUTING.md) ·
[공개 집계 JSON](docs/evidence/measured-results-20261015.json) ·
[전체 실험 기록](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_RESULTS.md).

## 라우팅 과정

메인 에이전트가 목표·공개 명세·산출물 계약을 제공합니다. 고정된 영어 질문으로 Jev가 작업 분해와
의존 관계를 판단합니다. 연구 실행기는 검증된 답을 실행 가능한 DAG로 연결하고, 준비된 작업을
각 작업자의 허용 파일 범위 안에서 실행합니다.

```text
목표 + 명세 + 산출물 계약
→ 구조화 Jev 질문과 입력 검증
→ 분해·의존 관계 판단
→ 의존성 DAG와 실행 가능한 작업 목록
→ 담당 범위가 지정된 코딩 작업자
→ 산출물 버전에 연결된 공개 검사
→ 결과 기록과 실패 근거 기반 수리 라우팅
```

- **의존 관계를 따라 실행합니다.** 준비된 작업은 병렬로 진행하고, 후속 작업은 검증된 선행 산출물을 받습니다.
- **판단을 실행에 연결합니다.** 구조화 답변이 작업자의 담당 범위와 실행 핸들러로 이어집니다.
- **판단마다 근거를 남깁니다.** 질문·답변·사용량·산출물 버전·검사 결과를 연결해 기록합니다.

제어기가 권한과 검증을 적용하고 Jev는 그 계약 안에서 선택합니다. 완성한 산출물의 요구사항 충족은
검사로 확인합니다. [기술 명세](docs/TECHNICAL_SPEC.md)와
[연구 상태](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md)를 참고하세요.

## 빠른 시작

Node.js 22 이상이 필요합니다. 외부 패키지는 없습니다.

```sh
git clone https://github.com/Kai-Leee/pointsman.git
cd pointsman
npm run mcp:fetch   # MCP 테스트용 고정 jev-mcp 바이너리. 체크섬 확인
npm test            # 가짜 키와 모의 HTTP만 사용. 추론·잔액 사용 없음
npm run check:links # 상대 링크, 제목 앵커, research 브랜치 링크 검사
npm run eval:demo   # 합성 기록의 오프라인 평가
```

`mcp:fetch`는 macOS ARM64, Linux x64, Linux arm64를 지원합니다([SOURCE.json](vendor/jev-mcp/SOURCE.json)).
바이너리가 없으면 MCP 테스트 3개가 실패합니다. CI는 macOS(Node 22)와 Docker(Node 24, 26)에서 테스트합니다.

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

## 문서

`main`에는 코드, 실행 계약, 사용 문서를 둡니다. 실험·결정·작업 기록은
[`research` 브랜치](https://github.com/Kai-Leee/pointsman/tree/research)에 있습니다.

- **시작:** [기술 명세](docs/TECHNICAL_SPEC.md) · [실행 계약](docs/orchestration/contracts/README.md)
- **사용:** [사용 안내](docs/USAGE.md) · [평가 CLI](docs/EVALUATION_USAGE.md)와
  [입력 계약](docs/EVALUATION_CONTRACT.md) · [대시보드](docs/DASHBOARD.md) ·
  [개발 연결과 별도 Opus 모니터](docs/PAIRED_RUN.md) · [벤치마크](benchmarks/README.md) ·
  [MCP](MCP.md)
- **research 브랜치:** [현재 상태](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md) ·
  [문서 찾아보기](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/README.md) · [결정 기록](https://github.com/Kai-Leee/pointsman/blob/research/docs/DECISIONS.md) ·
  [작업 기록](https://github.com/Kai-Leee/pointsman/blob/research/docs/WORK_LOG.md) · [검증 기록](https://github.com/Kai-Leee/pointsman/blob/research/VERIFICATION.md) ·
  [평가 방법](https://github.com/Kai-Leee/pointsman/blob/research/docs/EVALUATION_RESEARCH.md) ·
  [실제 구현 평가 가능성](https://github.com/Kai-Leee/pointsman/blob/research/docs/LIVE_EXPERIMENT_FEASIBILITY.md) ·
  [실시간 실패 표시](https://github.com/Kai-Leee/pointsman/blob/research/docs/REALTIME_FAILURE_RESEARCH.md)
- **릴리스:** [변경 기록](CHANGELOG.md)
- **기여자·에이전트:** [AGENTS.md](AGENTS.md) (Codex 진입점) ·
  [CLAUDE.md](CLAUDE.md) (Claude 진입점, AGENTS.md import) ·
  [개발 에이전트 역할·인계](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/README.md)

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
