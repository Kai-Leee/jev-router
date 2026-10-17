연구 마무리(2026-10-17): 사용자 요청으로 D095까지를 `research-d095-final-20261017`에 보관한다. [보관 범위·공개 요약·검증과 남긴 일](docs/research/D095_CLOSEOUT.md). 기존 원격 research의 별도 D085 변경과 측정 소스 결속을 보존하기 위해 독립 연구 브랜치를 사용한다. 추가 개발·유료 실행·자동 재개는 시작하지 않는다. 아래 commit/push 미수행 문구는 각 실험 종료 당시 기록이다.

D095 종료(2026-10-17): 공개 v5 검사와 실제 담당 연결·v16 회차 결속 수정 후 공개 93/93·독립 63/63 완료. 수리 2회차/작업자 7회, 34분 16.680초, 캐시 포함 2,101,095토큰, 참고 비용 추정 $14.8056879. 과거 Claude 단독 대비 시간·토큰·비용 절감은 미달했다. 첫 실행기 실패 643,247토큰/추정 $4.1821504도 보존했다. [상세 결과](docs/orchestration/D095_PUBLIC_BOUNDARIES_RESULTS.md). 기존 결과 12,817파일 변경 0, 실제 청구 미확인, commit/push 없음.

D094 종료(2026-10-17): [잠정 선택·blocked 복구 결과](docs/orchestration/D094_CLAUDE_PROVISIONAL_RESULTS.md). 새v4질문/v14계약에서실측0의모델·노력도잠정선택7회가실제Claude로연결됐다. 공개93/93·독립59/63으로미완료,수리2회차/작업자2회·22분22.232초·950634캐시포함토큰·참고6.8788884USD/실청구unknown. 실제unknown/복구발동0,복구흐름은79검사에서검증했다. 기존완료Claude보다소모는낮지만동일완료품질효율우위없음. source162/이전9941불변,컨테이너기존5동일·자체0. 추가실행/commit/push없음. 아래는각당시기록이다.

D093 실제 비교 종료(2026-10-17): [결과](docs/orchestration/D093_FULL_PROVIDER_RESULTS.md) · [기록](docs/decisions/D093.md). 모델·노력도·공개 성과를 연결해 네 조건을 측정했다. Codex 판단과 Claude 판단은 공개93/93·독립63/63 완료, Jev+Codex는91/93 미완료, Jev+Claude는 unknown2로 작업자0·검사미실행이다. 전체 완료 가속 우위는 입증되지 않았다. Claude 최종 새 opt-in은 bin/claude-classifier-cohort.mjs + v13이며, 기존 기본 route/v9와 원래 v10 Codex 조건은 당시 source snapshot으로 재현해야 한다. 역사 source pin을 현재 코드에 재고정하거나 종료 출력을 재개하지 않는다. 다음 유료 실행은 시작하지 않았다. 아래는 각 당시 기록이다.

D092 현재(2026-10-17): [모델·노력도·공개 성과 라우팅](docs/orchestration/D092_MODEL_EFFORT_HISTORY.md) · [기록](docs/decisions/D092.md) · [과거 실패·수리 이력](docs/orchestration/D092_FAILURE_HISTORY.md). 새 `node bin/codex-e2e.mjs route` 경로는 v9와 프로필 v2를 사용해 현재 제공 모델×노력도 23개 중 Jev가 함께 선택한다. high는 고정이 아니다. 선택 입력은 source-bound 공개 성과 85개이며 독립·숨김 결과는 제외한다. 무표본 노력도는 unknown, 인과 성공률·전체 개발 절감은 미측정이다. `check`는 새 경로의 추론 없는 점검이며 실제 개발은 명시 --spend/새 출력 경로를 요구한다. 기존 v7/v8·D091 결과는 보존하고 변경된 현재 코드에 재고정하지 않는다. 아래는 각 당시 기록이다.

D091 현재(2026-10-16): [새 3조건 결과](docs/orchestration/D091_CODEX_RESULTS.md) · [기록](docs/decisions/D091.md). Codex93/93·63/63 완료, Jev고정93/93·60/63 미완료, Jev모델선택82/93·57/63 미완료. 종료시간27분44.01/26분44.74/29분59.71, 토큰529592/527950/1435202, Short참고USD1.893192/1.6005356/2.1076985. 모델선택13회는 초기Luna4+Sol1/수리Sol8로 실제 연결됐지만 효율개선 미입증이다. 기본Codex run/pair는D091 v7 고정모델, 모델선택은v8/adaptive opt-in이다. 실행중439소스·기존57143파일불변, 이후 집계소계1줄과새핀4개만수정/검증했으며원본보존. 종료원본을재개하지않는다. 아래는각당시기록이다.

D090 현재(2026-10-16): 앱 실제 CLI0.162.0-alpha.17.2·gpt-6.1-sol/high 기본 연결과 모델별 참고 정산으로 새 순차1쌍을 종료했다. [결과](docs/orchestration/D090_CODEX_RESULTS.md) · [기록](docs/decisions/D090.md). 두 조건 모두 공개93/93·독립63/63으로 제품 완료2/2. Codex24분42.255초·478030토큰·참고$1.749668, Jev22분37.343초·503013토큰·참고$1.5037936: 전체시간8.4272%↓·토큰5.2262%↑·참고액14.0526%↓(Codex분모). 단가 가정/실청구unknown 구분, 초기 판단34.888배는 전체 가속률 아님. Jev실제수리1회·투영감축0B·추가문맥첨부0B. 기본Codex경로D090 manifest/gatewayv6, 역사계약·결과55178파일보존, 소스427불변. 추가자동실행/commit/push없음. 아래는각당시기록이다.

D089 현재(2026-10-16): 수리 근거/작업자 입력 투영/공개 docstring 지침을 공통 적용한 새 비교·감사를 종료했다. [결과](docs/orchestration/D089_CODEX_RESULTS.md) · [기록](docs/decisions/D089.md). Codex 공개60/93(미실행10)·독립55/63, Jev90/93·59/63으로 제품 완료0/2. Jev는 D088보다 시간18.02%·전체 토큰29.89%·참고액13.63% 증가했고 실제 입력 축소0B다. 기존 T.R10.03은 두 조건 통과. 기본 Codex 실행은 D089 manifest/gateway v5이며 옛 계약은 보존했다. 남은 enum 동일성·상위 생산자 담당·수리 입력 구성 문제를 먼저 읽는다. 종료 원본을 재개하지 않는다. 아래는 각 당시 기록이다.

D088 현재: 입력 검사v5와native정산을 하나의 모델 정본으로 연결한 새 Codex 비교를 종료했다. [결과](docs/orchestration/D088_CODEX_RESULTS.md): Codex공개81/93·독립57/63, Jev92/93·59/63으로 완료0/2. Jev종료시간16.46%↓·참고단가환산4.36%↓·전체토큰27.22%↑. 기본Codex실행기는pointsman-codex-d088.json/gatewayv4이며 역사적 계약은 보존했다. 새 결과를 자동 재개하지 않는다. 아래는 각 당시 기록이다.

R20261014-CODEX-MAC 결과: Mac 실제 비교1쌍 종료, 두 조건 모두 제품 미완료. [전체 결과](docs/orchestration/CODEX_MAC_RESULTS.md). Codex23분1.64초/1,084,007토큰/독립57of63; Jev6분42.41초/300,500토큰/독립0of63. Jev는 부분실행 수리binding 오류로 조기종료했으므로 완료절감률 없음. 초기동일210질문 호출구간만243.81초 대9.26초. 스킬환경 변동 한계 포함. 기존결과 보존, 자동재실행 없음. 아래는 각 당시 기록이다.

R20261014-CODEX-MAC: 사용자가 “이번 Codex 비교는 Mac에서 실행”으로 승인했다. 새 codex-e2e 실행기에만 `--execution-host mac` 예외를 적용한다. Codex 판단→Jev 판단 순차 각1회, 동일 Codex 작업자, 기존 결과 보존, 공유 장부 복원 금지. 실제 결과는 `benchmark-runs/codex-e2e-mac-20261014-01/`에 기록한다. 아래 내용은 각 시점의 기록이다.

R20261014-CODEX-E2E: [Codex 판단 vs Jev 판단 전체 개발 비교](docs/orchestration/CODEX_E2E.md)를 먼저 읽는다. 새 `bin/codex-e2e.mjs`는 공통 Codex 작업자·D083 분해/수리·공개/독립 검사 연결이다. 실제 A/B 모델 실행은 아직 없고 유료 실행 호스트를 확인 중이다. 기존 cloud-only 정책 유지. 공유 장부는 다른 승인된 모의 서비스와 함께 사용되므로 복원하지 않는다. 아래 지침은 각각 당시 기록이다.

R20261014: [D083 스킬 실행 연결과 검증](docs/orchestration/POINTSMAN_D083_GATEWAY.md)을 먼저 읽는다. 새 opt-in은 `pointsman-d083.json`(v13), 필수 gateway와 기록을 거친다. 실제 Codex 호스트 검증 통과; Claude는 인증 성공이나 주간 한도로 미완료. 기존 파일 보존 감사는 장부 1개 차이로 미해결이며 전체 보존 성공으로 보고하지 않는다. 과거 manifest/정책은 재현용이다.

D083: [클라우드 실패 2건 원인과 수정](docs/orchestration/D083_REPAIR_DIRECTION.md)을 먼저 읽는다. `d083-repair-fixes.json`(D082 + repair-budget-v3 + scope_expansion worker-mentioned-v1)이 opt-in이며 전송 정책 기본은 v10이다(v1–v9는 재현용). 반복 측정은 조건당 3회만 한다. D082-08은 사용자 중단이며 재실행하지 않는다. 클라우드는 `scripts/cloud-env-up.sh`로 준비하고 완료 arm은 `scripts/grade-adaptive-arm.mjs`로 채점한다.

D082: [클라우드 실행 준비](docs/orchestration/D082_CLOUD_RUNS.md)를 먼저 읽는다. 클라우드 세션 유료 실행은 `d082-cloud-defaults.json`(D081 기본 + Claude `oauth_token` 인증 허용)을 쓰고, Docker `containerd-snapshotter:false`·`NODE_USE_ENV_PROXY=1`·`/Users/lee/workspace/plugins/jev-router` bind mount에서 실행한다. 원장은 클라우드 한 곳에서만 쓰며 Mac은 유료 실행을 멈춘다.

D081: [수리 경로 보강과 실측](docs/orchestration/D081_REPAIR_PATH_AND_RESULTS.md)을 먼저 읽는다. 현재 전송 정책 기본은 v9(prompt policy v3)이며 과거 v1–v8 파일은 재현용이다. v12에서 check_error 질문은 `adaptive-inferred-repair.v3.json`+`public-inferred-owner-v3`, 큰 owner 요청은 `repair-budget-v2`로 opt-in한다(`d081-defaults.json`). 전체 개발은 순차로만 실행하고 불확실 종료(D081-05)는 재실행하지 않는다.

D080: [기본 설정 실측](docs/orchestration/D080_DEFAULTS.md)을 먼저 읽는다. v12 기본 manifest는 `d080-defaults.json`(보류 끔·임계 경로 우선·공개 명세 검토)이다. 명세 검토는 공개 검사 통과 뒤에만 실행되고 숨김 검사 경로를 거부한다. 병렬 시작은 다른 실행의 Jev 호출이 없을 때만 한다.

D079: [평가 결과](docs/orchestration/D079_EVALUATION.md)를 먼저 읽는다. 전체 개발은 preflight 원장 잠금 수정 전까지 순차로만 실행한다. 보류 없는 `d079-no-deferral.json`이 공개93/93·독립63/63을 1회 달성했고, 공개 명세 검토 수리는 후보 3/3에서 독립 실패를 고쳤다. 숨김 검사 내용을 계획·수리·검토에 넣지 않는다.

D078: [직렬 의존 수리·통합 결과](docs/orchestration/D078_LAYERED_INTEGRATION.md)를 먼저 읽는다. manifest `d078-layered.json`(v12)은 layered-v2 분해·owner 설명 v2·수리 범위 코드·보류와 D076 수리 옵션을 묶는다. 통합 1회는 공개93/93·독립60/63으로 미완료다. 종료 원본을 자동 재개하지 않는다.

D077: [역할별 질문 유형 재설계·보류·통합 결과](docs/orchestration/D077_QUESTION_FORMS.md)와 [STATE](docs/agents/STATE.md)를 먼저 읽는다. manifest v12는 새 계약(cohesion·owner criteria·profile v3·inferred scope·confidence deferral)을 묶으며 과거 계약은 재현용이다. v12는 D075 transmission gate를 쓰지 않는다. 통합 1회는 공개84/93·독립63/63으로 미완료다. 실패 owner POST 예약은 공급자 무과금 근거로 정산했으며 종료 원본을 자동 재개하지 않는다.

현재 D075는 [전송 전 강제 검사와 근거 기반 복구](docs/orchestration/D075_FORCED_PREFLIGHT_AND_RECOVERY.md)의 병렬 구현·두 실제 수리·독립 채점을 종료했다. [결과](docs/orchestration/D075_RESULTS.md)·[STATE](docs/agents/STATE.md)를 먼저 읽는다. 제품은 공개88/93·독립60/63으로 미완료다. 새 보존 수리 기본 경로는 v10 manifest와 prompt policy v2를 사용하며, 과거 manifest·정책·결과는 재현용으로 보존한다. 실제 전송 gate 통과는 모델 문맥 수락을 보장하지 않는다. 최종 owner HTTP400 뒤 CANONICAL_INPUT_ALREADY_APPLIED로 멈췄고 profile 자동 입력 재구성도 미지원이다. 종료 원본을 자동 재개하지 않는다. 현행 수동 고정 검사는 `--policy v2`를 명시한다. 기본 v1은 역사적 소스 핀을 검사하므로 변경된 소스에서 SOURCE_DRIFT가 나올 수 있다.

D073 당시 [실패별 기존 담당 추론 구현과 실측](docs/orchestration/D073_RESULTS.md)을 종료했다. opt-in manifest v8/v9는 v4 입력 관측과 inferred-v1/v2를 사용하며 로컬 토큰/수리·프로필 바이트 추정치는 비차단이다. 공식 256000B·질문 schema·기존 쓰기 권한·불확실 결과 처리는 유지한다. 해당 보존 수리는 공개79→91/93·독립60→61/63으로 개선됐으나 round2 owner의 HTTP400 model_input_limit로 미완료다. 아래 당시 기본 경로·미연결 설명은 D075 현행 상태로 확대하지 않는다.

현재 입력 검증 진입점은 [D072 사용법과 원인](docs/orchestration/D072_INPUT_VALIDATION.md)이다. 전송할 JSON과 실행기 stage를 `node scripts/validate-jev-input.mjs --request <json> --stage <stage>`로 오프라인 검사한다. 공식 바이트·토큰 추정·내부 수리 한도를 구분하며, exit2는 입력 차단이다. 실제 전송 직전 v3 검사도 유지한다. 검증 통과를 모델 수락이나 제품 완료로 승격하지 않는다.

# Jev Router 작업 지침

## D074 — 질문 작성과 공식 호출 규칙 사전 검사 당시 기록

새 Jev 질문·판단 입력을 만들거나 고칠 때 먼저 저장소 정본 [jev-prompting](skills/jev-prompting/SKILL.md)을 읽는다. 고정 문구는 contract에서 그대로 읽고 대상·근거·후보 변수만 채운다. projected `repair_owners` / `inferred-v2`는 실제 요청 파일에 `node scripts/validate-jev-prompt.mjs --request <json> --stage repair_owners --template inferred-v2`를 실행해 결과를 남긴다. 다른 stage는 이 고정 검사 미지원이며 기존 `validate-jev-input.mjs --policy v4`의 일반 구조 검사만 가능하다. 그 통과를 의미·정답률 검사로 승격하지 않는다.

`--connection-only`는 가짜 키와 mock transport 검사다. 실제 인증·GET/POST는 수행하지 않는다. 새 검사기는 에이전트가 명시 실행하는 진입점이며 기존 runner의 전송 gate에 자동 연결되지 않았다. [D074 실패 루프](docs/orchestration/D074_PROMPTING_AND_FAILURE_LOOP.md)는 설계이며 자동 복구·재시도는 미구현이다. 새로운 로컬 토큰 상한 없이 공식 제한·기존 권한·불확실 정산 처리를 유지한다. 직전 유료 실험 결과는 D073이며 원본을 자동 재개하지 않는다.

이 지침은 `jev-router/`에만 적용한다. 상위 EDA 프로젝트와 목적·결정 기록을 섞지 않는다.

최신 실행 상태는 [D073 결과](docs/orchestration/D073_RESULTS.md)와 [STATE](docs/agents/STATE.md)를 먼저 확인한다. 회귀1225/1225와 실제 선택2worker 수리를 확인했으나 제품은 미완료다. 사후 입력 감사기는 known HTTP400을 분류하지 못하고 실패 목적지/model 정보도 미기록이다. 단일 요청 검사 통과를 전체 감사나 provider 수락으로 확대하지 않는다. 별도 Opus 모니터는 숫자 검토만 수행했다. 아래 오래된 상한·미구현·완료 문구는 각 당시 기록이다.

## 진입점

1. [기술 명세](docs/TECHNICAL_SPEC.md)를 읽는다.
2. [결정 기록](docs/DECISIONS.md)에서 확정 사항과 제안·가설·미결정을 확인한다.
3. [작업 기록](docs/WORK_LOG.md)과 [검증 기록](VERIFICATION.md)에서 실제 구현·검증 수준을 확인한다.
4. 평가 조사·지표 구현이면 [평가 방법 조사](docs/EVALUATION_RESEARCH.md)의 출처·산식·제외 조건을 확인한다.
5. 분업 개발/문맥 인계는 [개발 에이전트 운영](docs/agents/README.md), 본인 역할, [현재 상태](docs/agents/STATE.md)를 읽는다.

## 유지할 경계

- 메인 세션이 작업을 진행한다. Jev Router는 모델 선택과 작업 중 판단을 지원한다.
- 제품의 판단 흐름은 현재 한 세션에서 다룬다. 개발 작업은 D-012에 따라 역할별 에이전트로 분업하고 문맥 한계 시 인계한다.
- 판단 후 handoff/새 세션 전환은 문맥 보존 효과를 확인할 가설이다. 자동 전환 확정으로 해석하지 않는다.
- Jev 질문과 평가 기준은 영어를 기본으로 한다. 원문 근거·고유명사·코드·식별자의 의미를 임의로 바꾸지 않는다.
- Jev 호출은 자동 모드를 기본으로 한다. 구체적인 판단 지점·임계값·호출 빈도는 성능 평가로 조정한다. 모든 턴에서 무조건 호출하는 정책으로 확대하지 않는다.
- 정답이 하나인 과제만 가정하지 않는다. 반환 형식, 선택 기준, 평가 방법을 구분하고 판단 불가를 보존한다.
- 후보 생성 방식은 상황별로 설계할 수 있지만, 사용자의 미정 우선순위를 임의로 확정하지 않는다.
- 정확도·속도·토큰·비용 개선은 실측 전까지 목표/가설이다. Jev의 확률을 작업 성공률로 단정하지 않는다.
- 런타임 상태·근거가 있는 결과와 문서의 제안을 구분한다. 의미 있는 작업 후 결정·작업·검증 기록을 갱신한다.
- 키와 Authorization 헤더를 출력하거나 커밋하지 않는다. 결과 불확실한 유료 POST를 자동 재전송하지 않는다.
- Superpowers는 현재 작업에 대한 사용자 명시 요청이 있을 때만 사용한다.

현재 소스는 연결 모듈·오프라인 평가기와 D-014의 격리 benchmark runner/gate다.
실제 질문/후보 생성은 Opus가 담당한다. D-020에서 실제 Opus/Jev 판단 후 격리 명령 실행과
독립 Opus monitor 응답을 확인했다. 전체 과제 완성·독립 채점·비교 성능은 최신 STATE를 확인한다.
현재 사용자는 D067에서 조건별 상한과 누적 장부 토큰 한도를 해제하고 병렬 실행을 승인했다. [D067 프로토콜](docs/orchestration/D067_EXPERIMENT.md)을 따른다. v3 정책은 명시적인 null=무상한이며 기존 장부의 ID·사용량·정산 이력을 보존해 이관한다. D042의10M/v2와 USD1은 과거 정책이다. 새 장부로 초기화하지 않으며 실제 잔액·불확실 정산·서비스 제한 검사는 유지한다.
시작 시 `benchmarks/README.md`와 최신 STATE를 읽는다. 평가 단위/결측은 기존 계약을 유지한다.

## D-025 판단·측정 문서 관리

Jev 라우팅/규칙 변경, 실험 재측정, 비용 분석을 수행할 때 [jev-decision-records](skills/jev-decision-records/SKILL.md)를 읽고 적용한다. 물리적 원본은 이 저장소이며 Codex 사용자 스킬 디렉터리에 설치 사본이 있다. 개발 서브에이전트는 역할 소유권에 따라 근거를 기록하고 문서 담당자가 docs/decisions/<ID>.md를 갱신한다. 실제 측정·추정·가설·정정·미확인을 구분하고, 기존 원본을 덮어쓰지 않는다. 이 규칙은 새 유료 실행이나 권한 확대의 승인이 아니다. 최신 사용자 지시가 우선한다.

## D028 질문·프로필·작업 지시 정본

새 문서 기반 라우팅을 작업할 때 먼저 `docs/orchestration/contracts/README.md`를 읽는다.
질문은 `questions.v1.json`, 모델+추론 프로필은 `profiles.v1.json`, 작업자 고정 지시는
`worker-task.v1.json`에서 읽어 사용한다. 경로는 위 README와 같은 디렉터리다.
반복 판단마다 LLM이 질문을 다시 쓰게 하지 않는다. 실행 시 자연어는 그대로 붙이고
문서화된 변수/후보만 채운다. src/orchestration/document-contracts.mjs의 로더를 사용한다.
기존 D027 하네스는 역사적 비교 경로이며 새 정본 경로로 자동 교체됐다고 간주하지 않는다.

## D029 현재 문서 버전과 호스트 연결

새 E2E 실험의 모델 목록은 `docs/orchestration/contracts/models.v2.json`, 작업자 지시는
`worker-task.v2.json`이며 같은 폴더의 `questions.v1.json`을 사용한다. 과거 v1은 재현용이다.
Claude는 CLAUDE.md의 @AGENTS.md import, Codex는 이 파일을 진입점으로 사용한다.
격리 worker에는 자동 발견을 가정하지 말고 controller가 내용과 경로/해시를 명시 전달한다.
`node bin/show-routing-contracts.mjs`로 현재 문서·모델·effort·질문을 무과금 열람할 수 있다.
문서상 지원, 계정에서의 실제 호출, 실측 성능을 별개로 기록한다.

## D031 입력 투영·판단기 비교

새 pilot 기본 입력은 projected/v3 (`docs/orchestration/contracts/worker-task.v3.json`). 질문 v1/모델 v2는 유지한다. legacy 옵션은 D029 재현용. `docs/orchestration/D031_IMPLEMENTATION.md`에서 옵션·실험 경계를 읽는다. 기본 forced는 평가용이며 온라인 Jev 선택을 의미하지 않는다. Claude/Jev 모드는 명시 임계값 필요. 작업자 모델 Opus medium 고정. 의미 매핑 없는 요구사항 삭제 금지; 원문은 한 번 유지. 문서·모의·실제 측정 구별.

## D036 자동 checkpoint 기본값

현재 tree-e2e-pilot 기본 routing mode는 auto이며 명시 split threshold가 필요하다. 과거 forced 양쪽 평가를 재현하려면 명시 옵션을 사용한다. force_jev는 한 선택만 실행한다. [D036](docs/orchestration/D036_IMPLEMENTATION.md)에서 process-local cache, latest 재사용 금지, 단일 plan_ready 연결과 무과금 검증 경계를 확인한다. 기존 D031 기본값 설명은 역사적 상태다.


## D043 — confidence 기준 (2026-10-10)

현재 pilot 기본 판단 기준은 confidence다. `split-confidence.v1.json`의 execution choice(split/single/defer)에 붙은 confidence를 명시 `--confidence-threshold`와 비교한다. 낮으면 needs_evidence, 충분하면 선택된 실행으로 직접 연결한다. `--decision-basis probability --split-threshold`는 과거 재현용이다. 정본 설명: `docs/orchestration/D043_CONFIDENCE.md`. 회귀 419/419, 유료 호출 없음. D042 산출물 JSON 실패는 아직 미수정. 임계값은 미보정이며 확정 최적값 없음.


## D045 — 1~5 작업 개수 (2026-10-10)

현재 pilot 기본은 count. task-count.v1.json에서 실제 후보1..N(최대5)을 선택하고 confidence는 기록만 한다. 1은 유지, 2~5는 해당 개수로 역할·작업 묶음 실행. 동시 실행 수와 별개다. 단일 후보는 Choice API 최소2개 제한 때문에 force_jev 포함 무호출로 진행한다. 과거 confidence/probability 정책은 명시 옵션으로 유지. 문서: docs/orchestration/D045_TASK_COUNT.md. 전체424/424 검증, 유료 호출 없음. D042 출력 실패는 미수정.


## D047 — 전체 작업 효율 우선 (2026-10-10)

사용자 정정: 현재 Jev 입력량은 허용 가능하며 전체 작업 효율을 우선한다. 입력 축소를 우선 과제로 삼지 말고 충분한 판단 근거를 유지한다. 기존 예산은 유지. 현재 D046은 초기 task_count만 Jev1회 호출하며 작업 중 실패·재분할·모델/effort·요구사항 판단은 미연결이다. D044 실패 근거도 D046 state에 전달되지 않았다. 감사: docs/orchestration/D047_DECISION_COVERAGE.md. 후속 연결 순서는 제안이며 이번에는 구현·유료 호출 없음.

## D053 — Jev가 작업 배정을 만드는 현재 진단 경로

현재 새 분할 경로는 `scripts/decomposition-e2e-anchored.mjs`와
`docs/orchestration/contracts/decomposition.v2.json`을 사용한다. 구조·지시·한계는
`docs/orchestration/D053_DESIGN.md`, 요구사항 정본은
`benchmarks/e2e-swe/manifests/d052-requirements.json`이다. Jev가 작업 수·기준 파일·나머지 파일
소유권·요구사항 책임자를 선택한다. 실행 의존 관계는 알려진 파일 의존 정보로 코드가 생성한다.
기존 D045 후보 그룹 선택은 비교 기준으로 유지한다. 재귀 분할·새 파일 구조 발명은 미구현이다.
현재 결과는 STATE와 최신 실험 기록에서 확인한다. 과거 실행 원본은 수정하지 않는다.

## D055 recursive task/test proposal

Latest design direction is documented in `docs/orchestration/D055_RECURSIVE_TASK_TESTS.md`; English questions are in `docs/orchestration/contracts/recursive-task-tests.v1.json`. These are drafts and are not connected to the existing runners. Preserve original requirements and test expectations; do not present illustrative child tasks as actual Jev decisions.

## D056 recursive planning runtime

D055 is now implemented as a separate planning-only path: `scripts/recursive-task-tests-pilot.mjs`,
`src/orchestration/recursive-task-tests.mjs`, and `recursive-task-tests.v2.json` under the contracts directory.
Read `docs/orchestration/D056_IMPLEMENTATION.md`, `docs/decisions/D056.md` and the latest STATE before use.
Tasks/tests are specifications; no implementation worker dispatch or product test execution is enabled.
Keep original source clauses and expected results, explicit unknown dependencies and shared-write ordering.
Provider failures and changed representation experiments have separate immutable run directories.
Existing cumulative10M ledger persists; do not automatically replay a failed/uncertain request or reset history.

## D063 — DAG 개발 계획 진입점

현재 후속 개발 계획은 [D063_DAG_PLAN](docs/orchestration/D063_DAG_PLAN.md)이다. 사이드 설계를 검토해 작업 트리·산출물 DAG·충돌 자원을 분리하고, 검사/산출물 계약부터 준비하는 순서를 반영했다. 새 DAG 런타임은 미구현이며 기존 runner 기본값을 변경하지 않는다. 질문 초안은 [ARCHITECTURE §4.2](docs/orchestration/jev-dag-design/ARCHITECTURE.md#42-고정-영어-질문과-선택값--처리-함수), 운영 JSON은 아직 예정 경로다. 최대 작업자30과 task/검증 노드 수를 혼동하지 않는다. 과거 본문의 임계값 정책은 역사적 경로이며 새 DAG 계획에 적용하지 않는다. 현재 목표·미완료·실제 실행 상태는 STATE와 D063을 먼저 확인한다.

## D064 — 스킬 관리와 DAG 로컬 기반

스킬 개선·갱신·신규 추가는 [jev-skill-maintenance](skills/jev-skill-maintenance/SKILL.md)를 사용하고 [목록·대기 작업](docs/skills/MAINTENANCE.md)에 근거와 결과를 기록한다. D064의 skills 역할 1명이 원본을 소유한다. 기존 담당에게 이어 맡기며 파일별 작성자를 중복 생성하지 않는다. 스킬 관리 규칙을 읽는 것만으로 전역 설치나 추가 유료 호출을 실행하지 않는다. 정본은 이 저장소이며 설치 사본과 호스트 적용 여부를 별도 확인한다.

[D064 구현 상태](docs/orchestration/D064_IMPLEMENTATION.md)와 [역할/계약](docs/agents/D064_PARALLEL.md)을 먼저 확인한다. 새 DAG callback 실행기·영어 질문 계약·소유자 배정·검증·관측은 opt-in 경로다. 실제 Jev/Claude 제품 연결, 자동 재귀/관계 변경 handler, durable restart와 전체 공개 검사 mapping은 완료 여부를 별도 확인한다. 기존 runner 기본값을 새 경로로 오해하지 않는다.

## D065 — 실제 실행 연결과 테스트 정리

현재 후속 작업은 [D065 구현·검증 상태](docs/orchestration/D065_IMPLEMENTATION.md), [실측 결과와 정정](docs/orchestration/D065_RESULTS.md), [역할과 파일 소유권](docs/agents/D065_PARALLEL.md), [결정 기록](docs/decisions/D065.md)을 먼저 읽는다. D064의 미연결 설명은 그 시점 기록이다. 공개 검사의 정상/결함 대조, 실제 후보 검사, 독립 제품 채점을 구별한다. 의미 핸들러 정본은 별도 v2이며 v1을 소급 교체하지 않는다. 관계 변경은 산출물과 실제 파일 binding을 함께 요구한다. source 삭제 전 snapshot과 삭제 지도에서 고유 결함/assertion 보존을 확인한다. 단일 스킬 담당을 유지한다.

새 runner는 `node scripts/dag-e2e.mjs`로 추론 없는 상태 확인, `--probe`로 실제 환경 확인, `--mock <새 실행 경로>`로 로컬 fixture 실행을 제공한다. `--spend <새 실행 경로>`는 유료 호출을 포함하므로 최신 D065 실행 기록과 이미 승인된 단일 시도 상태를 먼저 확인한다. 미완료·불확실 시도를 자동 반복하거나 누적10M 장부를 초기화하지 않는다. 실제 완료시간과 반복 비교가 없는 효율 개선을 추정해 보고하지 않는다.

## D066 — 재귀 분해·관계·공개 수리의 비교 경로

최신 사용자는 기존 OpenAPI client generator로 4조건 비교를 실제 진행하도록 요청했다. [프로토콜](docs/orchestration/D066_EXPERIMENT.md), [구현](docs/orchestration/D066_IMPLEMENTATION.md), [역할](docs/agents/D066_PARALLEL.md), [현재 STATE](docs/agents/STATE.md)를 먼저 읽는다. `adaptive-dag.v1.json`의 영어 질문과 `d066-adaptive.json` manifest를 쓰며, 새 후보 목록 안의 재귀 작업 분해와 실제 관계·수리 실행을 비교한다. 이전 16개 파일 배정은 이 경로의 고정 설계가 아니다. 공통 후보 준비 비용, 실제 구현·수리, 공개 검사, 독립 채점, 별도 모니터를 구분한다. 기본 CLI는 `node scripts/adaptive-dag-comparison.mjs`이며 추론이 없다. 기록된 terminal 실행을 자동 재개하거나 원본 후보/장부를 초기화하지 않는다. 유료 실행과 제품 완료 상태는 문서 존재가 아닌 최신 원시 결과로 확인한다.

D066의 네 시도는 종료됐다. [실측 결과](docs/orchestration/D066_RESULTS.md): Claude만 공개85/85·독립63/63 완료, Jev 세 조건은 각각33POST 뒤 조건별 예약 상한에서 분해 중단이다. downstream 관계·수리·완료 속도 비교는 미측정이다. callback34를 POST34로 세지 말고, 짧은 실패 시도시간을 성공 가속률로 보고하지 않는다. 종료 장부잔여415,445/10M과 source/후보 원본을 보존한다.
