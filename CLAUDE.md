D094 종료(2026-10-17): [잠정 선택·blocked 복구 결과](docs/orchestration/D094_CLAUDE_PROVISIONAL_RESULTS.md). 새v4질문/v14계약에서실측0의모델·노력도잠정선택7회가실제Claude로연결됐다. 공개93/93·독립59/63으로미완료,수리2회차/작업자2회·22분22.232초·950634캐시포함토큰·참고6.8788884USD/실청구unknown. 실제unknown/복구발동0,복구흐름은79검사에서검증했다. 기존완료Claude보다소모는낮지만동일완료품질효율우위없음. source162/이전9941불변,컨테이너기존5동일·자체0. 추가실행/commit/push없음. 아래는각당시기록이다.

D093 실제 비교 종료(2026-10-17): [결과](docs/orchestration/D093_FULL_PROVIDER_RESULTS.md) · [기록](docs/decisions/D093.md). 모델·노력도·공개 성과를 연결해 네 조건을 측정했다. Codex 판단과 Claude 판단은 공개93/93·독립63/63 완료, Jev+Codex는91/93 미완료, Jev+Claude는 unknown2로 작업자0·검사미실행이다. 전체 완료 가속 우위는 입증되지 않았다. Claude 최종 새 opt-in은 bin/claude-classifier-cohort.mjs + v13이며, 기존 기본 route/v9와 원래 v10 Codex 조건은 당시 source snapshot으로 재현해야 한다. 역사 source pin을 현재 코드에 재고정하거나 종료 출력을 재개하지 않는다. 다음 유료 실행은 시작하지 않았다. 아래는 각 당시 기록이다.

D092 최신 경로는 [모델·노력도·실측 공개 성과](docs/orchestration/D092_MODEL_EFFORT_HISTORY.md)를 읽는다. v9/프로필 v2에서 Jev가 제공 모델과 노력도를 함께 선택하고 기록·전송 3단계·실행 binding을 유지한다. 표본 0은 unknown이며 독립·숨김 결과를 학습 입력에 넣지 않는다. 현재 전체 개발 개선 효과는 미측정이다. 이전 high 고정 기록은 당시 조건이다.

D091 최신 결과는 [전체 보고서](docs/orchestration/D091_CODEX_RESULTS.md)와 [D091 기록](docs/decisions/D091.md)을 읽는다. 실제Codex 비교3조건중고정Codex만공개93/93·독립63/63완료. Jev고정독립60/63, 모델선택공개82/93·독립57/63미완료이며완료절감률은없다. 모델선택은v8/adaptive명시실험경로, 기본작업자6.1-sol/high고정. 원실행439소스와결과를보존한뒤소계집계만사후수정했다. 아래역사지침과혼용하지않는다.

D090 현재(2026-10-16): 앱 실제 CLI0.162.0-alpha.17.2·gpt-6.1-sol/high 기본 연결과 모델별 참고 정산으로 새 순차1쌍을 종료했다. [결과](docs/orchestration/D090_CODEX_RESULTS.md) · [기록](docs/decisions/D090.md). 두 조건 모두 공개93/93·독립63/63으로 제품 완료2/2. Codex24분42.255초·478030토큰·참고$1.749668, Jev22분37.343초·503013토큰·참고$1.5037936: 전체시간8.4272%↓·토큰5.2262%↑·참고액14.0526%↓(Codex분모). 단가 가정/실청구unknown 구분, 초기 판단34.888배는 전체 가속률 아님. Jev실제수리1회·투영감축0B·추가문맥첨부0B. 기본Codex경로D090 manifest/gatewayv6, 역사계약·결과55178파일보존, 소스427불변. 추가자동실행/commit/push없음. 아래는각당시기록이다.

D089 최신 결과(2026-10-16): [수리 효율 재측정](docs/orchestration/D089_CODEX_RESULTS.md)과 [결정 기록](docs/decisions/D089.md)을 먼저 읽는다. 이번은 동일 Codex 작업자의 판단 주체 비교이며 Claude 호출0이다. 제품 완료0/2·실제 입력 축소0B, Jev 전체 토큰/시간/참고액 증가로 효율 목표 미달이다. 새 원시 결과·과거52530파일 보존, 종료 결과 재개/자동 재실행 금지. 아래는 당시 기록이다.

R20261014-CODEX-MAC 결과: Mac 실제 비교1쌍 종료, 두 조건 모두 제품 미완료. [전체 결과](docs/orchestration/CODEX_MAC_RESULTS.md). Codex23분1.64초/1,084,007토큰/독립57of63; Jev6분42.41초/300,500토큰/독립0of63. Jev는 부분실행 수리binding 오류로 조기종료했으므로 완료절감률 없음. 초기동일210질문 호출구간만243.81초 대9.26초. 스킬환경 변동 한계 포함. 기존결과 보존, 자동재실행 없음. 아래는 각 당시 기록이다.

R20261014-CODEX-MAC: 사용자가 “이번 Codex 비교는 Mac에서 실행”으로 승인했다. 새 codex-e2e 실행기에만 `--execution-host mac` 예외를 적용한다. Codex 판단→Jev 판단 순차 각1회, 동일 Codex 작업자, 기존 결과 보존, 공유 장부 복원 금지. 실제 결과는 `benchmark-runs/codex-e2e-mac-20261014-01/`에 기록한다. 아래 내용은 각 시점의 기록이다.

R20261014-CODEX-E2E: [Codex 판단 vs Jev 판단 전체 개발 비교](docs/orchestration/CODEX_E2E.md)를 먼저 읽는다. 새 `bin/codex-e2e.mjs`는 공통 Codex 작업자·D083 분해/수리·공개/독립 검사 연결이다. 실제 A/B 모델 실행은 아직 없고 유료 실행 호스트를 확인 중이다. 기존 cloud-only 정책 유지. 공유 장부는 다른 승인된 모의 서비스와 함께 사용되므로 복원하지 않는다. 아래 지침은 각각 당시 기록이다.

R20261014: [D083 스킬 실행 연결과 검증](docs/orchestration/POINTSMAN_D083_GATEWAY.md)을 먼저 읽는다. 새 opt-in은 `pointsman-d083.json`(v13), 필수 gateway와 기록을 거친다. 실제 Codex 호스트 검증 통과; Claude는 인증 성공이나 주간 한도로 미완료. 기존 파일 보존 감사는 장부 1개 차이로 미해결이며 전체 보존 성공으로 보고하지 않는다. 과거 manifest/정책은 재현용이다.

# Jev Router — Claude entry point

@AGENTS.md

Current question-authoring entry: read the repository's [jev-prompting skill](skills/jev-prompting/SKILL.md)
and [D075 integration](docs/orchestration/D075_FORCED_PREFLIGHT_AND_RECOVERY.md).
The v10 preserved-repair path requires prompt policy v2 and the transmission/recovery policies.
For a standalone fixed-template check, explicitly use `--policy v2`; historical v1 retains its original source pins.
Read [STATE](docs/agents/STATE.md) for validation and actual-run status. Repository instructions alone do not prove
automatic skill activation, actual transmission or product completion. D074's design-only state is historical.
The [D075 measurements](docs/orchestration/D075_RESULTS.md) ended at public88/93 and independent60/63.
Required pre-send checks ran, but the later owner request exceeded model context after canonical projection.
Further canonical rebuilding and profile-stage automatic rebuilding are not supported. Preserve terminal results.

Shared rules live in the imported AGENTS.md. Read the canonical contract index at
[docs/orchestration/contracts/README.md](docs/orchestration/contracts/README.md)
before creating questions, selecting workers, or running orchestration experiments.
Do not copy contract wording into a second authority or rewrite fixed questions per call.

The D029 model catalog and worker instructions are
[models.v2.json](docs/orchestration/contracts/models.v2.json) and
[worker-task.v2.json](docs/orchestration/contracts/worker-task.v2.json).
Historical v1 files remain evidence for earlier experiments; the run manifest must identify
which version was actually loaded. A link here is not proof that a worker received its contents.
When workers run from an isolated directory, the dispatcher must materialize the relevant
instructions and document contents into their prompt or workspace, recording source hashes.

D063 future development plan: [task/artifact DAG integration](docs/orchestration/D063_DAG_PLAN.md). Read it with the imported AGENTS.md before new orchestration work. It is an adopted development direction, not a loaded runtime contract or a completed live experiment.

For repository skill maintenance, read [jev-skill-maintenance](skills/jev-skill-maintenance/SKILL.md) and [maintenance inventory](docs/skills/MAINTENANCE.md). Follow the single skills-owner role in D064; source updates do not imply installed-host updates. Current opt-in DAG implementation boundaries: [D064](docs/orchestration/D064_IMPLEMENTATION.md).

D065 continuation: read [current implementation](docs/orchestration/D065_IMPLEMENTATION.md), [actual results and corrections](docs/orchestration/D065_RESULTS.md), [parallel ownership](docs/agents/D065_PARALLEL.md), and [the decision record](docs/decisions/D065.md) before work. Real filesystem revision binding and semantic v2 actions are separate from historical v1. Keep authored public controls, actual candidate checks and independent product grade distinct. The one live condition terminated with product failure; preserve its candidate and original uncertain result. Check the terminal run state before any paid launch; no automatic replay or budget reset. The same single skills maintainer owns improvements. Test deletion requires preserved snapshots and actual surviving defect/assertion evidence.
