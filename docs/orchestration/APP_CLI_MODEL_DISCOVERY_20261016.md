# ChatGPT 앱 내장 CLI의 새 모델 연결 확인 — 2026-10-16

사용자가5.6보다 새 모델을 앱 내장 CLI에 연결해 확인하도록 요청했다. **같은 ChatGPT 로그인에서 Homebrew CLI와 앱 내장 CLI의 모델 목록이 다르며, 앱 CLI의 gpt-6.1-sol/high 소규모 실제 요청이 성공했다.** 기존 D089 실패 결과나 기본 실행 경로는 바꾸지 않았다.

[모델 목록 원본](../../benchmark-runs/app-cli-model-discovery-20261016-01/models-no-cache.json) · [실제 요청 결과](../../benchmark-runs/app-cli-model-discovery-20261016-01/smoke-result.json) · [실행 환경](../../benchmark-runs/app-cli-model-discovery-20261016-01/smoke-environment.json) · [구조화 기록](../decisions/R20261016_APP_CLI.md).

| 항목 | 기존 PATH CLI | ChatGPT 앱 CLI |
|---|---|---|
| 경로 | /opt/homebrew/bin/codex | /Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex |
| 버전 | 0.144.1 | 0.162.0-alpha.17.2 |
| 모델 목록 기본값 | gpt-5.6-sol | gpt-6.1-sol |
| 확인된6계열 | 없음 | gpt-6.1-sol, gpt-6-astra, gpt-6-sol, gpt-6-luna |
| 인증 | chatgpt · logged_in | 같은 인증 사본 · chatgpt · logged_in |

6.1-sol/6-astra/6-sol의 노력도 목록은 low,medium,high,xhigh,max,ultra이며6-luna는ultra가 없다. 목록은 모델 선택 가능성 확인이며 모델 간 품질 순위나 성능 측정이 아니다. Astra의 추론 요청은 실행하지 않았다.

기존 환경 생성기의 `command='codex'`가 PATH에서 Homebrew 바이너리를 선택했다. 이전의6.1 사용 불가 관측은 이 구형 경로에 한정되며 계정 전체의 제한이라는 설명으로 확대할 수 없다. 앱 CLI를 먼저 확인하지 않았던 범위를 정정한다. 두 목록 조회는 새 임시 HOME·기존 인증의 private copy로 실행했고 과거 models_cache는 복사하지 않았다. initialize/account-read/model-list만 사용해 추론0·대화 생성0이었다.

그다음 기존 createFrozenCodexEnvironment에 앱 경로·gpt-6.1-sol·high를 명시하고 기존 runCodexAttempt 어댑터로 JSON schema 요청1회를 실행했다. 도구를 사용하지 않고19+23의 sum42와 status ok를 반환했다. 호출 영수증 구간5005.837334ms, 입력13391+출력19=13410토큰, 캐시0이다. 자동 재시도0·정상 종료·결과 불확실성false다. 실제 served 모델 이름과 노력도는 CLI stream이 독립적으로 보고하지 않아 해당 검증 필드는null이다. 이는 요청 설정의 수락과 정상 응답 확인이고 실제 모델 identity 증명이나 개발 벤치마크는 아니다. 실제 구독 비용도null이다.

재현에 사용한 스크립트(각각 결과를 덮어쓰지 않음):

```sh
node benchmark-runs/app-cli-model-discovery-20261016-01/probe.mjs
node benchmark-runs/app-cli-model-discovery-20261016-01/smoke.mjs
```

새 정식 벤치마크에는 앱 CLI의 실제 Mach-O 경로/해시를 고정하는 새 환경 조건이 필요하다. 현재 앱 bin/codex는 같은 bundle의 CodexCLI.app/Contents/MacOS/codex로 exec하는 shell launcher다. 소규모 확인은 기존 어댑터의 launcher 해시 검증을 사용했으며 실제 Mach-O 해시는 종료 후 별도 기록했다. 새 정식 실행에서는 launcher만 고정했다고 실제 바이너리까지 고정됐다고 보고하지 않는다. 코드 소스·gateway pins·새 모델 가격 가정도 새 조건으로 버전 관리해야 한다. 기존 bin/codex-e2e.mjs의 기본 PATH 연결과5.6 실험 manifest/평가 결과는 유지했고 새 전체 비교는 시작하지 않았다.

부수 효과: 새 private 조회/호출 증거와 이 문서, 기존 모델 사용량1회가 남는다. 원래 인증·앱 설치·Homebrew·Jev 장부는 수정하지 않았고 모든 임시 인증 HOME·작업 폴더는 제거했다. commit/push 없음.
