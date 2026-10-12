# 사용 안내

README에 있던 실행·연결·운영 안내를 그대로 옮긴 문서다.
원래 위치는 [README.md @ 80eb79a](https://github.com/Kai-Leee/jev-router/blob/80eb79ae43ac5ba05c181447f25bd8112aed1aad/README.md)다.
모든 명령은 저장소 루트에서 실행한다. 키 파일 경로를 바꾸려면 `JEV_AI_ENV_FILE`을 사용한다.

## 저장된 기록 평가

```sh
npm run eval:demo
npm run eval -- --manifest examples/evaluation/manifest.json --records examples/evaluation/records.jsonl --output /tmp/jev-evaluation-report.json
```

예제는 `synthetic`이며 정답·오답·보류·실패·누락 비용을 포함합니다. 이 명령은 키를 읽거나
API를 호출하지 않습니다. 출력 파일이 이미 있으면 덮어쓰지 않습니다. 사례/trial 분모, 정확도와
coverage, 상태별 지연, 운영/평가 비용, 분류·확률 지표를 계산하며 없는 비용은 `null`로 유지합니다.
실제 모델 응답 수집, 모델별 비교 실행, 순위/Oracle regret/신뢰구간은 아직 구현하지 않았습니다.

## 연결 대상

- Base URL: `https://jev-ai.pro/api`
- 추론 없는 확인: `GET https://jev-ai.pro/api/v1/models`
- 결정 호출: `POST https://jev-ai.pro/api/v1/systemone`
- 인증: 서버 환경변수 `JEV_AI_API_KEY`를 Bearer 헤더에 사용
- 기본 모델: `jev-latest`; 실제 응답의 resolved model도 결과에 보존

URL은 [src/config.mjs](../src/config.mjs)에 고정돼 있습니다. 다른 서비스로의 자동 전환과
HTTP 리다이렉트를 허용하지 않습니다. 진단 출력에는 키나 Authorization 헤더가 없습니다.

## 로그인

`npm run login`은 Jev AI 키를 대화형으로 설정합니다. iTerm 같은 터미널이나 Claude 터미널 탭에서 실행합니다.

1. Jev AI [이용약관](https://jev-ai.pro/terms)과 [개인정보 처리방침](https://jev-ai.pro/privacy) 동의를 묻습니다. 동의하지 않으면 아무것도 저장하지 않습니다.
2. 브라우저로 [키 페이지](https://jev-ai.pro/jev-api)를 엽니다. 사용자가 여기서 로그인하고 키를 만듭니다. `--no-browser`를 주면 브라우저를 열지 않습니다.
3. 키를 숨김 입력으로 받습니다. 화면, 명령행 인수, 셸 기록에 키가 남지 않습니다.
4. 추론 없는 모델 목록 GET 1회로 키를 확인합니다. 확인에 성공한 경우에만 키 파일(`JEV_AI_ENV_FILE` 또는 `~/workspace/.env`)의 `JEV_AI_API_KEY` 줄만 바꾸고 권한 `0600`으로 저장합니다. 다른 줄은 유지합니다.

파이프 같은 비대화형 입력에서는 실행을 거부합니다. 저장 후 Claude Code를 다시 시작하거나 jev-ai MCP 서버를 다시 연결합니다.

Claude Code에서 이 저장소를 열면 SessionStart 훅([.claude/settings.json](../.claude/settings.json))이 `node bin/jev.mjs login-check`로 키 유무만 확인합니다. 네트워크는 쓰지 않습니다. 키가 있으면 아무것도 출력하지 않습니다. 키가 없으면 Claude에게 브라우저 패널로 키 페이지를, 터미널 탭으로 `npm run login -- --no-browser`를 띄우도록 안내합니다. 키는 채팅으로 받지 않습니다.

## 로컬 키 설정

기본 읽기 경로는 **`~/workspace/.env`**입니다. 최초 작업에서는 빈 키 항목을 담은 파일을
권한 `0600`으로 만들었고, 2026-10-08 상태 조회에서는 키 설정과 인증 모델 목록 조회를 확인했습니다.
새 환경에서는 사용자가 로컬 편집기에서 실제 키를 입력합니다.

1. [Jev AI 키 페이지](https://jev-ai.pro/jev-api)에서 이 서비스용 키를 생성합니다.
2. 로컬 편집기로 `~/workspace/.env`를 열고 `JEV_AI_API_KEY=` 뒤에 키를 넣습니다.
3. 키는 채팅, 브라우저 코드, Git, 명령행 인수, 로그에 넣지 않습니다.

입력 형식만 표시한 예:

```dotenv
JEV_AI_API_KEY=<로컬 편집기에서만 입력>
```

파일을 셸로 실행하지 않고 dotenv 데이터로 파싱하며, 그중 Jev 키만 읽습니다.
이미 설정된 프로세스 환경변수의 키가 파일보다 우선합니다.
다른 파일을 쓰려면 비밀이 아닌 경로만 `JEV_AI_ENV_FILE`로 지정합니다.

```sh
npm run config
npm run models
```

`config`는 실제 사용 설정과 키 존재 여부만 출력하며 네트워크를 사용하지 않습니다.
`models`는 인증한 GET만 보냅니다. 목록 조회 성공은 이후 추론이나 잔액 사용의 성공을
보장하지 않습니다. 키가 없으면 HTTP 요청 전에 종료합니다.

## 잔액을 사용하는 작은 결정 호출

키 설정과 모델 목록 조회가 성공한 뒤 다음을 실행합니다.

```sh
npm run demo -- --spend
```

이 명령은 먼저 모델 목록을 조회하고 `jev-latest`가 있는지 확인한 다음,
[examples/decision.json](../examples/decision.json)의 짧은 예제를 **한 번 POST**합니다.
버튼 오류 설명을 `coding`/`research`로 분류합니다. 실제 작업 배분은 하지 않습니다.
`--spend` 없는 실행은 요청하지 않으며, 자동 재시도도 없습니다.

결과는 `answers`, 실제 `model`, 토큰 `usage`, 청구 헤더 `billing`, 목적지와 소요 시간
`receipt`를 보여 줍니다. 청구 헤더 값은 원래 문자열로 보존하고 없는 값은 `null`입니다.
USD 비용이 제공되지 않으면 `usage.cost`는 **`null`**, 즉 미제공입니다.
한 번의 호출은 연결 확인이며 성능 벤치마크가 아닙니다.
실행 후 [Jev AI 사용 내역](https://jev-ai.pro/jev-api)에서 차감 내역을 대조합니다.

## 다른 서버 코드에서 사용

```js
import { loadConfig } from './src/config.mjs';
import { createJevClient } from './src/client.mjs';

const client = createJevClient(loadConfig());
const result = await client.decide({
  state: 'The checkout button shows a blank screen.',
  questions: {
    needs_code: { type: 'noul', instructions: 'Does this require inspecting or changing code?' },
  },
});
// result.answers.needs_code.noul is a probability, not a verified success rate.
```

이 모듈은 서버 또는 CLI에서만 import합니다. 브라우저에 번들링하지 않습니다.
현재 어댑터가 받는 요청 필드는 `model`, `state`, `questions`이며 `choice`, `score`,
`noul`을 지원합니다. Saved judges, metadata, 웹 검색 API는 이 초기 연결 범위에 없습니다.

## 실패 처리와 제한

공식 서비스 문서의 오류 규칙을 따릅니다. 모든 호출은 자동 재시도하지 않습니다.
기본 타임아웃은 30초이며 서버에서 `createJevClient({ ...loadConfig(), timeoutMs })`로 바꿀 수 있습니다.

- `401`: 키와 목적지 확인. `402`: 잔액 또는 지출 정지 상태 확인.
- `404`: URL 경로 확인. `409`: 저장된 judge 버전 확인. `422`: 입력 수정 후 새 요청.
- `429`: `retryAfterMs` 이상 대기. `502`/`503`: 실패가 확인된 후에만 제한된 횟수로 지연 재시도.
- `504`, 연결 단절, 응답 파싱 실패: 결과가 불확실하므로 사용 내역과 실행 상태를 먼저 확인.
- 상위 서비스의 원시 오류 본문과 전송 예외는 출력하지 않습니다.

수동 재시도 시에도 횟수를 제한하고 `Retry-After`보다 일찍 보내지 않습니다.
상태 확인 API는 문서에서 확인되지 않아 자동 복구·환불·재시도를 구현하지 않았습니다.

클라이언트는 요청 JSON 256000 UTF-8 바이트, 질문 1–64개, 질문 ID 64자 이내,
choice 2–255개, score 2–10단계를 검사합니다. 문서의 계정 API 한도는 분당 1000회이며,
이 초기 모듈에는 공유 계정 사용량을 추적하는 분산 제한기가 없습니다.
모델 고유의 컨텍스트 제한은 이 JSON 크기 검사와 별개입니다.

## 배포 설정

배포 플랫폼의 **서버 런타임 Secrets / Environment Variables**에 `JEV_AI_API_KEY`를 넣습니다.
`NEXT_PUBLIC_`, `VITE_`, `PUBLIC_` 같은 브라우저 공개 변수 접두사를 붙이지 않습니다.
로컬 `.env`를 이미지나 저장소에 복사하지 않고, 실행 환경에서 비밀을 주입합니다.
배포 후 프로세스를 재시작하고 서버에서 `node bin/jev.mjs config`,
`node bin/jev.mjs models`를 실행해 동일한 목적지를 확인합니다.
배포 플랫폼은 아직 정하지 않았으며 실제 배포는 수행하지 않았습니다.

## TypeSafe SDK를 나중에 사용하는 경우

현재는 SDK를 설치하거나 사용하지 않았습니다. TypeSafe가 배포하는 `@typesafe-ai/sdk`와
Jev AI가 제공하는 호환 API는 별개입니다. 문서의 SDK 설정은 다음과 같습니다.

```js
const client = new TypeSafeClient({
  apiKey: process.env.JEV_AI_API_KEY,
  baseURL: 'https://jev-ai.pro/api',
  retry: { maxRetries: 0 },
});
```

전환 시 기존 클라이언트를 재사용하고 최종 경로가 `/api/v1/systemone`인지 검증합니다.
키만 바꾸거나 기본 URL에 `/v1`을 추가하지 않습니다.

## 검증

```sh
npm test
```

테스트는 가짜 키와 모의 HTTP 응답만 사용하며 실제 추론이나 잔액 차감이 없습니다.
목적지/인증/리다이렉트 설정, 오류 시 단일 요청, 응답 검증, 누락 비용,
청구 헤더 보존, 입력 제한, 환경변수 우선순위, CLI의 잔액 사용 경계를 확인합니다.

참조 문서: [SDK와 연결 확인](https://jev-ai.pro/docs#official-sdk),
[오류 처리](https://jev-ai.pro/docs#errors), [모델과 제한](https://jev-ai.pro/docs#models).
문서 확인일: 2026-10-07 (Asia/Seoul).

## 기존 MCP 재사용

공개 Jev MCP를 재사용하는 실행 연결을 추가했습니다. 설정·호스트 연결·검증 범위는 [MCP 안내](../MCP.md)를 확인합니다.
