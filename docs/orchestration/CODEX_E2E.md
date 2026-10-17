D092 새 실행 진입점: [모델·노력도·공개 성과 라우팅](D092_MODEL_EFFORT_HISTORY.md). `check`는 v9 추론 없는 점검, `route --spend --execution-host mac --out NEW_PRIVATE_DIRECTORY`는 Jev가 작업자 모델과 제공 노력도를 함께 선택하는 새 전체 개발 경로다. 기존 run/pair/cohort의 v7/v8은 당시 동결 소스에서 재현해야 하며 현재 소스에 맞춰 역사 핀을 변경하지 않았다. 이번 전체 개발 E2E·효율 개선은 미측정이다.

D091 현재: [최신 3조건 결과](D091_CODEX_RESULTS.md). 기본 run/pair는 `pointsman-codex-d091.json`의 고정 6.1-sol/high다. cohort는 고정 Codex → 고정 Jev → `pointsman-codex-d091-adaptive.json`의 Jev 모델 선택을 각 1회 순차 실행한다. 모델 선택 13건은 실제 실행 연결을 통과했으나 개발 완료는 Codex 고정 1/3이며 Jev 조건의 완료 효율 우위는 입증되지 않았다. 판단 소계의 프로필 누락만 실행 후 수정했고 원시 결과와 `source-at-launch/`는 보존했다. 아래는 각 당시 기록이며 종료 원본을 재개하지 않는다.

D090 현재(2026-10-16): 앱 실제 CLI0.162.0-alpha.17.2·gpt-6.1-sol/high 기본 연결과 모델별 참고 정산으로 새 순차1쌍을 종료했다. [결과](D090_CODEX_RESULTS.md) · [기록](../decisions/D090.md). 두 조건 모두 공개93/93·독립63/63으로 제품 완료2/2. Codex24분42.255초·478030토큰·참고$1.749668, Jev22분37.343초·503013토큰·참고$1.5037936: 전체시간8.4272%↓·토큰5.2262%↑·참고액14.0526%↓(Codex분모). 단가 가정/실청구unknown 구분, 초기 판단34.888배는 전체 가속률 아님. Jev실제수리1회·투영감축0B·추가문맥첨부0B. 기본Codex경로D090 manifest/gatewayv6, 역사계약·결과55178파일보존, 소스427불변. 추가자동실행/commit/push없음. 아래는각당시기록이다.

R20261014-CODEX-MAC 결과: Mac 실제 비교1쌍 종료, 두 조건 모두 제품 미완료. [전체 결과](CODEX_MAC_RESULTS.md). Codex23분1.64초/1,084,007토큰/독립57of63; Jev6분42.41초/300,500토큰/독립0of63. Jev는 부분실행 수리binding 오류로 조기종료했으므로 완료절감률 없음. 초기동일210질문 호출구간만243.81초 대9.26초. 스킬환경 변동 한계 포함. 기존결과 보존, 자동재실행 없음. 아래는 각 당시 기록이다.

R20261014-CODEX-MAC: 사용자가 “이번 Codex 비교는 Mac에서 실행”으로 승인했다. 새 codex-e2e 실행기에만 `--execution-host mac` 예외를 적용한다. Codex 판단→Jev 판단 순차 각1회, 동일 Codex 작업자, 기존 결과 보존, 공유 장부 복원 금지. 실제 결과는 `benchmark-runs/codex-e2e-mac-20261014-01/`에 기록한다. 아래 내용은 각 시점의 기록이다.

# Codex 판단과 Jev 판단 — 전체 개발 비교 실행기

2026-10-14. 사용자가 전체 OpenAPI client generator 개발 비교를 선택했다. [이전 준비 기록](CODEX_BENCHMARK.md)은 당시 판단 리플레이 단계이며 소급 수정하지 않는다. 새 구현은 `feat/d083-skill-gateway`의 별도 모듈이다. [역할 계약](../agents/R20261014_CODEX_E2E.md), [검증 기록](../decisions/R20261014_CODEX_E2E.md).

**실행기·파일 권한·공개 검사·수리·독립 채점 연결을 작성했다. 실제 모델로 두 조건을 개발 완료한 성능 결과는 아직 없다.** 무추론 점검은 현재 Mac에서 성공했지만 기존 D082의 클라우드 전용 유료 실행 지침이 남아 있어 실행 호스트를 확인 중이다. CLI와 arm 함수 모두 Mac 유료 실행을 차단한다. 클라우드 세션/호스트 접근은 확인하지 못했다.

## 비교 조건

| 항목 | A: Codex 판단 | B: Jev 판단 |
|---|---|---|
| 단위 사이 관계·분해 입력 판단 | Codex | Jev |
| 실패 assertion의 담당 판단 | Codex | Jev |
| 그룹화·DAG 생성·순서·수리 범위 결정 | 같은 D083 코드 규칙 | 같은 D083 코드 규칙 |
| 구현·수리 작업자 | Codex `gpt-6.1-sol`, `high` | 동일 |
| 전송 형태 | 고정 질문 JSON → Codex structured output | 고정 질문 JSON → 기존 Jev guarded transport |
| 파일 작성·검사 권한 | 같은 controller artifact transport | 동일 |

첫 실행 단위는 순차 A→B 한 쌍이다. 조건당 최대3회 정책을 유지하되 자동으로3회를 반복하지 않는다. 작업자 동시2개, 최대30명, 수리2회, 전체10분 제한 없음. 개별 네트워크/검사 프로세스의 기존 timeout은 남는다. 모델·노력도 최적화 및 Claude spec review는 양쪽 모두 끈다. `gpt-6.1-sol`/`high`는 요청 설정이며 실제 모델 identity/effort 확인과 구분한다. 로그인 성공은 해당 모델 호출 성공이 아니다.

공통 D066 공개 catalog를 검증해 재사용한다. 원래 catalog 생성 비용을 현재 비용에 재가산하지 않는다. 역사적 manifest의 Claude 프로필은 catalog 생성 영수증 검증에만 쓰이며 현재 실행 프로필은 별도로 Codex로 지정한다. Codex 기준군은 Jev session, 키, 장부를 초기화하지 않는다.

### 확률 처리의 비교 혼입 수정

기존 `readUnitRelations`는 Jev 확률분포가 있으면 coupling 합을 쓰고, 선택값만 있으면0/1을 쓴다. 기존 Codex schema는 선택값만 반환하므로 그대로 비교하면 판단 주체와 그룹화 수치가 함께 바뀐다. 이번 주 비교는 **양쪽 모두 선택값만 planner에 전달**한다. Jev 원본 응답·확률은 전송/gateway 기록에 보존한다. 확률을 활용하는 기존 Jev 경로와는 별도 조건이며, 이번 비교로 확률 활용 효과를 주장하지 않는다.

## 실제 연결 순서

1. 원본 v13 binding·고정 소스·공개 명세·공통 catalog 및 검사 매핑 검증.
2. Codex 인증/버전과 Docker image ID·Python/라이브러리 버전 무추론 probe.
3. `planLayeredDag`의 단위 관계 질문을 선택한 provider에 전달. Codex는 gateway 직접 연결, Jev는 기존 mandatory gateway/장부 transport 연결. 두 경로 모두 입력·전송 직전·응답 검증과 기록을 거친다.
4. 반환 선택값으로 코드가 그룹/DAG를 만들고 workload 기반 순서를 적용한 뒤 계획을 영속 저장한다.
5. 작업자는 공개 명세와 허용된 파일 내용만 inline packet으로 받고 파일 본문을 JSON으로 반환한다. 허용 경로·중복·빠진 파일·UTF-8·크기를 검증한 controller가 기존 `ArtifactSession`으로 stage 파일을 쓴다. 모델은 shell/test/MCP 도구 사용 없이 출력하도록 요청하고, 도구 사용 trace가 있으면 수락하지 않는다. 이는 OS 수준의 외부 읽기 완전 차단을 증명하지 않는다.
6. 실제 Docker 공개 검사 실패 시 D083 assertion→담당 추론을 같은 provider에 요청한다. 담당 합집합/허용된 추가 범위는 `selectInferredOwnerScope` 코드 규칙으로 선택한다. `repair`라는 가짜 API 호출을 추가하지 않는다. 선택된 작업자만 재호출한다.
7. 후보를 고정하고 독립63개 검사를 별도 실행한다. 숨김 검사 내용/결과는 작업자·수리 입력으로 되돌리지 않는다. 같은 후보의 공개93/93과 독립63/63이 모두 확인돼야 완료다.

## 실행 명령

저장소 root에서 실행한다. 새 경로만 허용하며 기존 시도 재개/덮어쓰기는 거절한다.

```sh
# 소스·catalog·고정 대조 근거 검증. 모델 호출 없음.
node bin/codex-e2e.mjs check

# 무추론 Codex 인증/버전 + 실제 Docker 환경 검사
node bin/codex-e2e.mjs check --probe

# 승인된 실행 호스트에서만: A→B 한 쌍, 조건 사이 동시 실행 없음
node bin/codex-e2e.mjs pair --spend \
  --out benchmark-runs/NEW-codex-e2e-pair \
  --model gpt-6.1-sol --effort high

# 기록된 한 쌍 재집계. 모델 호출 없음.
node bin/codex-e2e.mjs compare \
  --left benchmark-runs/NEW-codex-e2e-pair/codex \
  --right benchmark-runs/NEW-codex-e2e-pair/jev
```

한 조건만 실행하려면 `run --provider codex|jev --spend --out NEW`를 사용한다. 기본 독립 grader는 기존 cloud4cpu manifest이며 양쪽 동일해야 한다. 공통 Codex 프로세스/공급자/모델 오류 또는 불확실 종료가 있으면 다음 조건을 자동 시작하지 않는다. 비정상 종료 뒤 active lock이 남으면 원시 실행·프로세스·정산 상태를 확인하며 자동 삭제/재시도하지 않는다. 다른 서비스가 공유 Jev 장부를 사용 중이므로 원장을 복원하거나 새 장부로 교체하지 않는다. 실행마다 fresh 출력 폴더와 attempt 영수증을 쓴다.

## 측정 경계와 실패 처리

- 완료 시간: 공통 입력 검증 뒤 arm 시작부터 환경 probe·계획·작업·공개 수리·독립 채점까지. 독립 채점 파일 snapshot 시간도 포함한다. 양쪽 완료 전 속도비는null이다.
- 토큰: 호출 영수증의 input+output. cache는 input에 포함되어 재가산하지 않는다. 실패 호출에서 usage가 없으면 전체 합계를null로 두고 `known_total_tokens`만 별도로 보여준다.
- 가격: 확인된 공식 단가와 모델이 없으므로 Codex API 환산/월 구독 청구는null. Jev의 기존 영수증 환산은 역사적 토큰팩 환산이며 현재 월정액 청구가 아니다. 전역 공유 장부 증감은 이 실험 비용으로 쓰지 않는다.
- 호출 수: `decision_callbacks`와 provider 영수증으로 센다. 기존 `planning_stats.provider_calls`에는 scripted planner 내부 callback이 포함된다. 이를 실제 HTTP/CLI 호출 수로 보고하지 않는다.
- 비교기는 worker 설정·catalog·실행기/검사 source hash·grader manifest/image·Codex CLI/CPU/Node/검사 의존성 환경 동일 여부를 확인한다. 실패·불확실 시도도 남기고, 짧은 실패시간을 완료 가속률로 환산하지 않는다. 한 쌍은 안정적인 성능 우위를 증명하지 않는다.

## 수행한 검증과 미수행

`node --test test/codex-e2e-decisions.test.mjs test/codex-e2e-integration.test.mjs test/codex-artifact-worker.test.mjs test/codex-e2e-checks.test.mjs test/codex-provider.test.mjs test/pointsman-gateway.test.mjs test/pointsman-runner.test.mjs test/pointsman-skill-install.test.mjs` → **58/58 통과**, [원문](../../benchmark-runs/codex-e2e-20261014-01/tests-final-02.tap).

실제 파일 기반 통합 fixture에서는 최초3작업자 이후 실패한1작업자만 재호출하고 나머지2작업자는 carry-forward했다. provider는 mock이며 실제 모델 품질/속도 결과가 아니다. 고정 문구 변조는 dispatch 전에 차단했고, 불확실 receipt가 오류/집계까지 전파됨을 확인했다.

[실제 환경 probe](../../benchmark-runs/codex-checks-20261014-01/result.json): Codex0.144.1/ChatGPT 로그인, 고정 Docker 이미지, Python3.11.2, 의존성7/7 일치, 검사 컨테이너 제거. 최초 sandbox에서 Docker socket 접근 실패 후 해당 무추론 점검만 escalation해 통과했다. 요청 모델 가용성/실제 추론은 확인하지 않았다.

발견해 수정한 구현 문제: 저장소 안 cwd의 상위 AGENTS 상속 가능성, 비교 시 grader identity 누락, 불확실 Codex receipt가 오류 flag로 전파되지 않는 경로. 저장소 밖 빈 cwd, grader 소스 pin/비교, receipt 기반 uncertainty 전파를 추가했다. fixture 초기에 `/tmp` alias가 checker 경로 검증에서 거절됐으며 realpath로 수정했다.

추가 실제 검사 연결: `node benchmark-runs/codex-checks-20261014-02/run-validation.mjs`로 **과거 D079 성공 후보 복사본**을 새 callback/wrapper에 넣어 공개8/8묶음·93/93검사 및 독립63/63 통과를 확인했다. [검증 결과](../../benchmark-runs/codex-checks-20261014-02/validation-result.json), [원본/복사본 근거](../../benchmark-runs/codex-checks-20261014-02/provenance.json). 원본38파일242,762바이트와 복사본·검사 소스의 hash가 전후 동일하며 공개8개/독립1개 컨테이너를 모두 제거했다. 모델 호출0회다. 공개검사783,226.464ms + 독립122,354.039ms = 905,580.503ms는 **검사 연결 검증 시간**이며 새 개발 완료시간이 아니다. 로컬 AMD64/Rosetta 조건이므로 과거 클라우드 시간과 비교하지 않는다.

미수행: 실제 모델 A/B 개발, 신규 생성 후보의 공개/독립 채점, 전체 시간·토큰·비용 절감 측정, 원격 클라우드 접근. 남은 결정은 이번 비교의 실행 호스트다. 기존 cloud-only 지침 유지 또는 이번 Codex 비교의 Mac 실행 변경을 사용자에게 확인했다.

부수 효과: 신규 소스·테스트·문서·비공개 검사 근거는 미커밋이다. 기존 후보·결과 및 공유 장부를 덮어쓰지 않았다. 무추론 검사 컨테이너는 제거했고 유료 호출·commit·push는 수행하지 않았다.
