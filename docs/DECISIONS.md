연구 마무리(2026-10-17): 사용자 요청으로 D095까지를 `research-d095-final-20261017`에 보관한다. [보관 범위·공개 요약·검증과 남긴 일](research/D095_CLOSEOUT.md). 기존 원격 research의 별도 D085 변경과 측정 소스 결속을 보존하기 위해 독립 연구 브랜치를 사용한다. 추가 개발·유료 실행·자동 재개는 시작하지 않는다. 아래 commit/push 미수행 문구는 각 실험 종료 당시 기록이다.

D095 종료(2026-10-17): 공개 v5 검사와 실제 담당 연결·v16 회차 결속 수정 후 공개 93/93·독립 63/63 완료. 수리 2회차/작업자 7회, 34분 16.680초, 캐시 포함 2,101,095토큰, 참고 비용 추정 $14.8056879. 과거 Claude 단독 대비 시간·토큰·비용 절감은 미달했다. 첫 실행기 실패 643,247토큰/추정 $4.1821504도 보존했다. [상세 결과](orchestration/D095_PUBLIC_BOUNDARIES_RESULTS.md). 기존 결과 12,817파일 변경 0, 실제 청구 미확인, commit/push 없음.

D092: [모델·노력도·실측 공개 성과](orchestration/D092_MODEL_EFFORT_HISTORY.md) · [구조화 기록](decisions/D092.md). 실제 제공 23조합, 공개 worker 85관측/710원문을 연결했다. 역사 관련 성공률은 task/phase/버전 차이를 보존하며 모델 인과 능력과 구분한다. [실패·해결 이력](orchestration/D092_FAILURE_HISTORY.md)을 함께 읽는다. 새 전체 개발 성능·재호출 감소는 미측정이다.

D091 종료: [결과](orchestration/D091_CODEX_RESULTS.md) · [구조화 기록](decisions/D091.md). 수리입력실측Codex127B/Jev고정69331B감소, 모델선택8수리는0Bfallback. Jev모델13선택실제연결검증, 제품완료1/3으로새효율우위미입증. 복잡raw-v1의분할전인코딩/실측프로필보정/no-op경로는제안. 기존결과보존,추가유료자동실행/commit/push없음.

D090 현재(2026-10-16): 앱 실제 CLI0.162.0-alpha.17.2·gpt-6.1-sol/high 기본 연결과 모델별 참고 정산으로 새 순차1쌍을 종료했다. [결과](orchestration/D090_CODEX_RESULTS.md) · [기록](decisions/D090.md). 두 조건 모두 공개93/93·독립63/63으로 제품 완료2/2. Codex24분42.255초·478030토큰·참고$1.749668, Jev22분37.343초·503013토큰·참고$1.5037936: 전체시간8.4272%↓·토큰5.2262%↑·참고액14.0526%↓(Codex분모). 단가 가정/실청구unknown 구분, 초기 판단34.888배는 전체 가속률 아님. Jev실제수리1회·투영감축0B·추가문맥첨부0B. 기본Codex경로D090 manifest/gatewayv6, 역사계약·결과55178파일보존, 소스427불변. 추가자동실행/commit/push없음. 아래는각당시기록이다.

# D089 — 수리 효율 개선 구현·재측정 종료, 목표 미달

[결과](orchestration/D089_CODEX_RESULTS.md) · [구조화 기록](decisions/D089.md). Codex60/93·55/63, Jev90/93·59/63으로 완료0/2. T.R10.03은 해결됐지만 실제 수리 입력 축소0B·Jev 수리7회/무변경1회가 남았다. D088 대비 Jev 시간18.02%·토큰29.89%·참고액13.63% 증가를 보존하며 완료 효율 성과로 승격하지 않는다. 아래는 역사 기록이다.

# D087 — Codex 판단과 Jev 판단 최신 비교 종료

[결과](orchestration/D087_CODEX_RESULTS.md) · [구조화기록](decisions/D087.md). 공개82/93·독립59/63인Codex와개발전내부모델검증에서멈춘Jev의실패시도시간을성공효율로비교하지않는다. 628,014/83,665토큰과가격가정·실청구unknown을구분해기록하고원본자동집계의전송전차단비용null오류는별도정정했다.

R20261014-CODEX-MAC 결과: Mac 실제 비교1쌍 종료, 두 조건 모두 제품 미완료. [전체 결과](orchestration/CODEX_MAC_RESULTS.md). Codex23분1.64초/1,084,007토큰/독립57of63; Jev6분42.41초/300,500토큰/독립0of63. Jev는 부분실행 수리binding 오류로 조기종료했으므로 완료절감률 없음. 초기동일210질문 호출구간만243.81초 대9.26초. 스킬환경 변동 한계 포함. 기존결과 보존, 자동재실행 없음. 아래는 각 당시 기록이다.

R20261014-CODEX-MAC: 사용자가 “이번 Codex 비교는 Mac에서 실행”으로 승인했다. 새 codex-e2e 실행기에만 `--execution-host mac` 예외를 적용한다. Codex 판단→Jev 판단 순차 각1회, 동일 Codex 작업자, 기존 결과 보존, 공유 장부 복원 금지. 실제 결과는 `benchmark-runs/codex-e2e-mac-20261014-01/`에 기록한다. 아래 내용은 각 시점의 기록이다.

## R20261014-CODEX-E2E — 전체 개발 비교 범위 확정

[프로토콜·구현](orchestration/CODEX_E2E.md) · [근거 기록](decisions/R20261014_CODEX_E2E.md). Codex 판단/Codex 작업자와 Jev 판단/같은 Codex 작업자를 비교한다. 양쪽 choice-only projection·동일 공개/독립 검사·기존 catalog로 고정한다. 기존 D083 runtime/manifest는 유지하고 별도 실행기를 추가했다. 실제 성능 비교는 실행 호스트 확인 뒤 진행하며 현재 실측으로 주장하지 않는다.

## R20261014-SKILL-ROUTING — 설계 위임 결과, 런타임 미적용

[설계안](skills/POINTSMAN_ROUTING_DESIGN.md) · [근거 기록](decisions/R20261014_SKILL_ROUTING.md). 스킬 발견과 실제 호출 강제를 분리하고, 등록 후보/모델/실행 범위/공개 검사 조건을 제안했다. 저장소 초안만 추가했으며 D083 기본값과 실행 상태는 유지한다.

2026-10-14 조사 [R20261014-JEV-REFERENCES](decisions/R20261014_JEV_REFERENCES.md)·[Jev 활용/평가 참고 비교](research/JEV_REFERENCE_BENCHMARKS_2026-10-14.md): 사용자가 구현 참고·수치 평가 모두로 확정하고 최신 코드 확인을 추가 요청했다. research를2b3c9ac/D083, main참조를8b2da35/v0.3.2로 갱신한 뒤31/31 관련 오프라인 검사를 통과했다. 조사용 임시 D082는 원격 클라우드 D082와 충돌해 날짜 기반 ID로 옮기고 원문을 보존했다. 외부 참고 기능 도입이나 유료실험은 없다. 현재 실행 정본은 [STATE](agents/STATE.md)의 D083을 따르며, 기존범위선택/분할/프로필 경계에 JevBench·ReflexBench 및 구현참고를 연결하는 계획은 제안이다. 아래 최신 표기는 각각 당시의 역사 기록이다.

당시 [D075](decisions/D075.md)·[결과](orchestration/D075_RESULTS.md)는 v10 실제 전송 강제검사와 근거 기반 복구의 지원 경로를 구현하고 보존 후보를 두 번 실측했다. 최종 공개88/93·독립60/63으로 미완료다. 이전 동일출발 수리91/93·61/63 대비 알려진 토큰/공식환산 소계는 감소했지만 채점까지369093ms로355366ms보다 늘었다. 실제 새 근거9개를 수집한 뒤 owner HTTP400·CANONICAL_INPUT_ALREADY_APPLIED로 중단했다. 첫 profile 전달/후보보존 결함과 모니터 형식 실패를 보존하고 수정했다. 원본1380파일 변경0, source125핀 drift0, pending/잔여컨테이너0이다. 아래는 각 시점의 과거 결정이다.

당시 [D074](decisions/D074.md)·[사용법과 실패 루프](orchestration/D074_PROMPTING_AND_FAILURE_LOOP.md)는 저장소 프롬프팅 스킬과 고정 무과금 검사 구현, 실패 복구 설계를 완료했다. 관련 회귀63/63·독립 입력17/17이다. 질문 ID 오탐과 잘못된 입력5개 통과를 수정하면서 원본을 보존했다. 고정 검사 범위는 projected repair_owners/inferred-v2이며 자동 전송 gate·복구·실제 성능은 미검증이었다. 아래 D073이 그 시점 직전 유료 제품 실행 결과다.

최신 [D073](decisions/D073.md)·[결과](orchestration/D073_RESULTS.md)는 기존 담당 추론과 로컬 토큰 상한 해제를 구현하고 실행했다. 실제 선택2worker 수리로 공개79→91/93·독립60→61/63이나 round2 ownerHTTP400으로 미완료다. 입력v2 이후의 실제 수리와 처음 실패·미전송 시도를 모두 보존했다. 동일품질의 Claude 대비 효율개선은 미입증이다. complete는 이번 구현·실험·기록의 종료이며 제품 성공을 뜻하지 않는다.

이전 입력 검증은 [D072](decisions/D072.md)·[사용법/원인](orchestration/D072_INPUT_VALIDATION.md)을 따른다. D071 저장108요청 중 형식108통과·현재추정107통과/수리1차단, 실제과거POST107목적지/200, 읽은440파일변경0, 집중9/9를 확인했다. 새추론0이며 새개발/수리는 실행하지 않았다. 고정Jev는 독립3실패, 프로필Jev는 넓은수리입력의로컬차단으로미완료다.

현재 [D071](decisions/D071.md)·[최종 결과](orchestration/D071_RESULTS.md)는 병렬 수정·실제 세 조건·보존 수리·독립 채점·감사까지 종료했다. 기존 설명 누락 후보는 실제 producer1파일 수리로93/93·63/63완료다. 새 개발은 Claude만93/93·63/63, Jev 고정93/93·60/63, Jev 프로필67/93·49/63이어서 동일 품질의 효율 목표는 미달이다. 프로필 선택과 실제 모델 연결10/10은 확인했지만 effort 최적성은 미측정이다. D070 이하 기록은 당시 기준으로 보존한다.

# Jev Router 결정 기록

최신 [D070](decisions/D070.md)·[결과](orchestration/D070_RESULTS.md)는 분석·병렬 수정·실제 개발/보존 수리·채점·품질 진단까지 종료했다. 원래148개 검사 범위에서 Claude 대비 시간5.318%·환산비용42.364% 감소다. 그러나 [추가 진단](orchestration/D070_QUALITY_REVIEW.md)은 새A0/8·기준선각8/8이므로 동일 품질의 최종 목표는 미달이다. 실제 선택 산출물1worker 수리는 별도 성공했다. `complete`는 이번 요청의 실험과 기록 완료이며 가설 확인을 뜻하지 않는다. 아래는 당시 상태를 보존한 과거 기록이다.

최신 [D069](decisions/D069.md)·[결과](orchestration/D069_RESULTS.md)는 병렬 수정과 실제 재실행·독립 채점까지 종료했다. 공개85/85·독립63/63으로완료,39분24.671초/5,809,782캐시포함토큰/환산$12.3604662다. 실제수리0회여서수리절감은미측정이다. v1추정의실제오판·v2정확요청수락·실패추론량null을구분한다. 아래D068은보존된과거기록이다.

최신 수정·재실행은 [D068](decisions/D068.md), [결과](orchestration/D068_RESULTS.md)다. 사용자 요청으로 세 수정과 새 `jev_all` 조건을 수행했다. 공개84/85·독립63/63으로 제품 미완료이며 수리 입력 축소 후에도 모델 입력 한도에서 실패했다. 확정 실패 전파와 전원 수리 후보 제거는 관측했으나 실제 수리 호출 절감·완료 속도는 미측정이다. 기존 D067 결과는 보존했고 별도 후속 정산을 통해 현재 장부는12,994,396입력/666정산/pending0이다. 아래 D067은 상한 정책과 과거 비교 기록이다.

최신 실행 정책은 [D067](decisions/D067.md)이다. 2026-10-11 사용자는 조건별·장부 토큰 한도를 해제하고 병렬 실행을 승인했다. 아래 D042/D066 등의 상한·추가 실행 금지는 해당 과거 실행 기록으로 보존하며 새 승인에 우선하지 않는다.

실행·분석은 종료됐다. [D067 결과](orchestration/D067_RESULTS.md): 공개85+독립63 결합완료3/4, Jev수리1요청은모델입력한도실패다. 성공두조건의탐색적절감과실패/무과금/추론미상/원본상태를구분한다. 장부는12,096,997입력·618정산·pending0이며한도null이다. 변경된수리구성의새실험은이원본에이어붙이지않는다.

기록일: 2026-10-08 (Asia/Seoul). 근거: 이 프로젝트의 사용자 대화.
문서 상태 표기는 `확정`, `설계 위임`, `제안`, `가설`, `미결정`을 구분한다.
확정은 사용자 의사를 뜻하며 구현 완료를 뜻하지 않는다.

## D-001 — 목적과 판단 범위 / 확정

- 사용자 정의: 작업·동작에 사용할 모델을 선택하고, 진행 중 후보 선택·완성도·역할 분배·다음 단계·판단·예측을 지원한다.
- 반복 판단의 정확도·속도를 개선하고 전체 토큰·비용을 줄이는 것이 목표다.
- 기존 범용 에이전트 대비 개선 폭은 미측정이다. 지표 간 우선순위와 허용 품질 저하는 미결정이다.
- API와 에이전트/CLI 모두를 장기 적용 대상으로 둔 기존 합의를 유지한다.

## D-002 — 메인 세션과 판단 역할 분리 / 확정

- 사용자 설명: 판단할 내용을 준비해 Jev를 호출하고 결과를 문서로 남긴 뒤, 메인 세션이 읽고 다음 작업을 진행한다.
- 메인 세션은 작업 진행의 주체다. Jev 반환값만으로 작업을 실행하는 별도 중앙 실행기를 확정하지 않았다.
- 이전 assistant의 '선택·배분·실행·검증을 전부 맡는 조정 계층'은 제안이었다. 사용자의 새 설명을 기준으로 역할을 좁혀 해석한다.
- Jev는 초기 판단 대상이며 Claude/Codex 직접 판단은 비교 기준이다. 판단자 교체 제품 기능은 아직 확정하지 않았다.

## D-003 — 질문 생성 중심, 현재는 한 세션 / 확정 + 가설

- 이전 사용자 구상: 새 세션이 목표·목적·판단 질문을 구성하고 Jev를 호출한 뒤 메인이 기다렸다가 결과를 읽는다.
- 최신 사용자 설명: '새 세션의 문맥 처리 보다는 질문 생성을 진행하는게 맞겠다.'
- 최신 사용자 설명: '완료 여부는 현재 한 세션에서 진행하니 괜찮다고 판단하는 것으로 가자.'
- 현재 설계는 한 세션에서 질문 생성과 결과 확인을 진행한다. 별도 작업 큐·완료 이벤트·세션 오케스트레이터를 이번 명세의 선행 요건으로 만들지 않는다.
- 사용자는 판단 후 handoff를 통한 새 세션 진행을 추천했지만 '확인을 해야한다'고 명시했다. 문맥 보존 효과는 H-001로 검증하며 자동 전환은 미확정이다.
- 재사용할 질문 형식의 단위, handoff 시점, 전환할 모델/호스트는 미결정이다.

## D-004 — 상황별 후보 구성 / 설계 위임

- 사용자 설명: '경우에 따라서 다를 것 같네. 이거는 너가 고안을 해보고 진행해보는 것으로 하자.'
- assistant가 제공 후보·등록 목록·새 후보 제안·혼합의 분기를 설계한다.
- 구체 분기와 데이터 필드는 기술 명세의 제안이며, 전부 사용자가 확정한 세부 요구로 표현하지 않는다.
- 사용자 우선순위 생성, 근거 없는 후보 성능 수치 작성, 허용되지 않은 실행자를 후보로 추가하는 것은 이 위임에 포함되지 않는다.

## D-005 — 단일 정답을 강제하지 않고 판단 불가 포함 / 확정

- 사용자 설명: 선택값·분류·근거 판정·순위에서는 '무엇을 답으로 보는가'를 일률적으로 적용하기 어려울 수 있다.
- 사용자 설명: '답변에서는 ... 판단 불가 조건까지 있는게 맞다.'
- 반환 형태·선택 기준·평가 방법을 분리한다. 단일 정답이 없는 작업도 범위에 남긴다.
- 판단 불가는 통신 실패와 다르며, 결정을 억지로 하나 고르게 만들지 않는다.
- 어떤 상황에서 메인이 결과를 바로 채택하는지, 품질 임계값과 재질문 조건은 미결정이다.

## D-006 — 영어 기본 / 확정

- 사용자 설명: '영어 사용을 기본으로 하고 간다.'
- Jev 질문·선택지 설명·판단 지침은 영어를 기본으로 한다.
- 원문 증거·코드·경로·식별자를 보존하고 필요한 영어 설명을 별도로 붙이는 방식은 설계 제안이다.
- 영어가 이 프로젝트의 모든 판단 유형에서 최선이라는 성능 주장은 아직 검증하지 않았다.

## D-007 — 대화와 기술 명세의 지속 기록 / 확정

- 사용자 요청: 필요한 내용·애매한 내용·분석할 부분을 알리고 계속 기록하면서 기술 명세를 진행한다.
- 기술 명세, 결정 기록, 작업 기록을 이 저장소의 `docs/`에 둔다.
- 이전 제안과 변경 이유를 지우지 않는다. 미결정 질문의 답이 오면 관련 결정과 명세를 함께 갱신한다.

## D-008 — 연결 대상과 비밀 관리 / 기존 확정 유지

- Jev AI 호환 API `https://jev-ai.pro/api`, 기본 모델 `jev-latest`를 사용한다.
- 키는 서버의 `JEV_AI_API_KEY` 또는 로컬 `~/workspace/.env`에서 읽는다.
- 질문/결과 기록에 키와 인증 헤더를 넣지 않는다. 결과가 불확실한 POST는 자동 재시도하지 않는다.
- 응답의 실제 모델 버전과 사용량을 기록하며, 미제공 비용은 0으로 채우지 않는다.

## D-009 — 별도 공개 저장소 / 기존 확정 유지

- 사용자 요청에 따라 `Kai-Leee/jev-router` 공개 저장소와 로컬 `main`을 생성하고 `origin`을 연결했다.
- 생성 당시 `gh repo view`로 PUBLIC 및 빈 저장소임을 확인했다. 소스 커밋/push는 아직 수행하지 않았다.
- `reference/`, `research-workbench/` 및 EDA 문서는 별도 범위로 유지한다.

## D-010 — 자동 호출 기본, 세부 정책은 평가로 조정 / 확정

- 질문: 지정한 판단 지점의 자동 호출, 메인 에이전트의 필요 판단, 사용자 명시 호출 중 어떤 방식으로 시작하는가.
- 사용자 답변: '자동 호출 모드로 기본적으로 진행할거야. 성능 평가 과정에서 조금 씩 구체적인 디테일을 잡아볼거야.'
- 자동 호출을 기본으로 한다. O-001은 해결됐으며 사용자 명시 호출을 기본 경로로 되돌리지 않는다.
- 호출 지점, 빈도, 추가 질문 조건, 판단 불가·채택 임계값의 세부 사항은 성능 평가에서 조정한다.
- 자동 호출이 모든 턴에서의 무조건 호출, 무제한 재질문, 불확실한 POST의 자동 재전송을 뜻하지는 않는다.
- 평가에 따른 세부 조정은 위임된 설계 범위에서 진행할 수 있다. 목표·범위 변경과 새로운 지출 한도는 별도로 다룬다.

## D-011 — 평가 지표 구현에 앞서 기존 방법 조사 / 확정

- 사용자 답변: '해당 과정도 괜찮은 것 같아.' 기존 명세의 진행 방향을 수용했다.
- 추가 요청: '평가 지표를 구현을 해 두어야할 것 같아. 사람들은 어떻게 하는지 먼저 조사를 진행할 것.'
- 이번 단계는 기존 논문·공식 도구의 평가 방법 조사와 프로젝트 적용안 기록이다.
- [평가 조사](EVALUATION_RESEARCH.md)의 지표별 산식·분모·구현 순서는 P-004 제안으로 둔다.
  개별 임계값, 외부 도구 채택, 유료 평가 예산까지 사용자 합의로 승격하지 않는다.

## D-012 — 역할 문서 기반 개발 분업과 문맥 인계 / 확정

- 사용자 요청: 영역별 규칙·목적·역할을 문서로 남긴 후 해당 문서에 따라 에이전트를 생성한다.
- 문맥이 거의 차면 handoff 문서와 역할을 새 에이전트에 전달해 계속 진행한다.
  메인도 압축 후 목적·목표를 재확인해 방향을 유지한다.
- 이 지시는 개발 방식에 적용한다. 제품의 매 판단 후 세션 전환 H-001이 검증됐다는 뜻은 아니다.
- 평가 조사 후 첫 오프라인 평가 구현을 contract/metrics/cli/review로 나누어 진행한다.
  역할·소유권·인계 절차는 [운영 문서](agents/README.md)에 둔다.
- 정확한 문맥 잔량 계측은 현재 도구로 불가하므로 수동 체크포인트와 한계 징후 기반으로 운영한다.

## D-013 — 목표·명세 기반 실제 구현 평가 조사 / 확정 + 실행 조건 미결정

- 사용자 요청: 이 상황을 실제로 테스트할 기존 방법을 먼저 조사한다. 없으면 기존 Personal OS를
  재구현하는 실험을 고려하며, 사람이 나눈 구현 task 대신 구현된 목표와 명세만 전달한다.
- 메인 에이전트는 Claude Opus 5.5, 진행 중 구조화 판단은 Jev가 담당하는 구성을 검토한다.
  후보 구성·코드 작성·도구 실행을 Jev가 생성한다는 기능 확정으로 해석하지 않는다.
- 목표만 전달한다는 것은 성공 조건을 없애는 뜻이 아니다. 관찰 가능한 수용 기준과 격리 환경은
  평가자가 미리 정의하고, 구현 순서·파일별 task·해법·기존 앱 코드는 실험 에이전트에 주지 않는다.
- 이번은 조사·연결 상태 확인·실험 설계다. 기존 Personal OS 변경, 장기 유료 실행, 예산 확정,
  평가 도구 설치나 모델 접근 성공을 완료로 간주하지 않는다.
- 기존 방법이 발견되면 그 결과를 보존한다. Personal OS 실험의 사용자 적합성은 별도로 제안하며
  '없으면'이라는 조건이 충족됐다고 꾸미지 않는다.

## D-014 — 공개 벤치마크 클론과 Personal OS 병행 평가 / 확정

- 사용자: E2E-SWE 방식에 맞는 공개 벤치마크를 조사·클론해 진행하고, 자신의 Personal OS도 함께 진행한다.
  Docker는 사용자가 시작했다. D-013의 조건부 Personal OS 구상을 병행 준비/평가 요청으로 확장한다.
- 메인 Opus 5.5와 Jev 판단, 목표·명세만 전달하는 원칙을 유지한다. 기존 앱/개인 Vault를 수정하는 실험이 아니다.
- 공개 task와 정답 대조 자료는 격리 evaluator 영역에 고정한다. 실험 에이전트에는 명세만 제공한다.
- 코드·실행기·평가기·Docker 준비와 무과금 대조 검증을 진행한다. 실제 인증과 유료 한도는 확인 중이다.
- 초기 실행기는 공식 과제를 사용하는 자체 어댑터로 시작할 수 있다. 공식 leaderboard 재현으로 주장하지 않는다.

## D-015 — Personal OS 새 디렉터리에서 별도 재구현 / 확정

- 사용자는 기존 Personal OS를 변경하지 않고 새 디렉터리에서 실제 구현하는 조건을 명확히 했다.
- 새 실험 루트는 `../personal-os-jev-lab/`이다. 목표·명세·합성 입력, 조건별 결과, 실행 기록을 분리한다.
  기존 앱 소스·개인 Vault는 복사하거나 마운트하지 않는다. 목표만 주고 에이전트가 구현을 진행하는
  D-013/D-014의 원칙과 공개 E2E-SWE 병행 범위는 유지한다.
- 실제 도구 실행은 조건별 새 Docker 컨테이너에서 하고 생성 결과를 새 디렉터리로 내보낸다.
  새 디렉터리 생성만으로 실제 Opus/Jev 실행이나 앱 구현 완료를 주장하지 않는다.
- 첫 문장 '뉴로츠로는 진행'의 의미는 확인 중이다. 특정 유료 금액/횟수 선택으로 추정하지 않는다.
  이번 Claude 인증 재조회에서도 loggedIn=false이며, 인증/유료 한도는 별도 미해결 상태다.

## D-016 — 앱 관리 Claude CLI 사용과 npm 중복 설치 제거 / 확정

- 사용자는 앱 관리 CLI의 OAuth 로그인을 완료했고 `/opt/homebrew`의 기존 설치 삭제를 요청했다.
- 실제 소유자는 Homebrew formula/cask가 아닌 전역 npm 패키지였다. npm으로 해당 CLI를 제거하고
  `claude` 명령은 Desktop 관리 CLI에 심볼릭 링크로 연결했다. 앱과 로그인 저장소는 유지한다.
- 인증 재조회는 loggedIn=true/authMethod=claude.ai다. 이 인증은 API 키 과금과 구분하며,
  최초 실험 시간·횟수·Jev 한도 또는 API 예산이 자동 승인됐다는 뜻으로 해석하지 않는다.

## D-017 — 호출·토큰·비용 대시보드 구현과 테스트 / 확정

- 사용자 요청: Jev 호출 횟수·비용, 모델 토큰·호출·비용을 함께 볼 대시보드를 구현한 뒤 테스트한다.
  필요한 스킬 조사도 서브에이전트에 맡긴다. D-012 역할 문서·소유권 원칙을 유지한다.
- 실제 기록과 합성 fixture, Claude 추정 USD와 실제 청구, Jev credits와 잔액 토큰을 구분한다.
  관측하지 못한 내부 HTTP 호출 수·비용을 0 또는 전체 합계로 꾸미지 않는다.
- 로컬 읽기 전용 화면과 benchmark 계측을 구현한다. 구현 평가 및 모델 성능 비교와 대시보드 검증은 별개다.
- 최초 유료 실험 한도 질문은 아직 답변 대기다. 이번 테스트 지시를 무제한 추론이나 예제 한도의 승인으로 해석하지 않는다.
- 사용법·범위는 [대시보드](DASHBOARD.md), 원천 의미는 [조사](DASHBOARD_RESEARCH.md)에 기록한다.

## D-018 — 실시간 연동과 진행 실패 확인 조사 / 확정, 구현안은 제안

- 사용자: 실시간 업데이트 연동 방식을 폭넓게 조사하고 현재 진행 실패를 확인할 필요가 있다.
- 전송 방식만이 아니라 실행 생존, 실제 진행, 요청/도구 실패, 결과 불확실, 독립 평가와 수집 장애를 조사한다.
- D-012 방식으로 전송·화면, 관측 도구, 현재 코드의 실패 공백 감사 역할을 먼저 기록하고 분업했다.
- 이번은 공식 문서·현재 소스·합성 재현 기반 조사다. SSE/OTel/watchdog 도입, 외부 전송, 전역 hook,
  자동 재시도 또는 새 유료 호출을 승인된 구현으로 승격하지 않는다.
- 조사 결론/현 구현 한계/우선순위는 [통합 보고서](REALTIME_FAILURE_RESEARCH.md)에 기록한다.
  benchmark 실행과 현재 개발 에이전트 중 연동 우선 범위는 질문 대기이며 두 범위를 조사했다.

## 아직 확정하지 않은 설계 (D-018 이후)

- P-001: 재사용 질문 형식 + 현재 상태를 채우는 질문 생성 방식.
- P-002: 상황별 후보 구성과 후보 출처 기록.
- P-003: 판단 결과의 구조화 기록 + 사람이 읽는 요약.
- P-004: 질문 준비·판단 품질·후속 작업·전체 비용/시간을 분리하는 평가 계약과 지표 계산기.
- P-005: 기존 harness와 목표·명세 기반 workload를 활용한 Opus 5.5 + Jev 실험.
- H-001: 판단 후 handoff가 중요한 문맥 보존에 유리한가.
- H-002: 같은 루브릭의 개별 점수와 후보 간 비교 중 어떤 순위 방식이 더 적합한가.
- O-001: 해결됨 → D-010, 자동 호출 기본.
- O-002: 결과의 자동 채택 조건과 검토·추가 정보 요청으로 돌리는 조건. 세부 조건은 평가로 조정.
- O-003: 최초 평가 작업군·성공 기준·시간/비용 예산과 우선순위.

세부 설계와 검증 계획: [기술 명세](TECHNICAL_SPEC.md). 작업 이력: [작업 기록](WORK_LOG.md).

## D-019 — Jev/Claude 개발 호출 연결 및 별도 Opus 모니터 / 확정 (2026-10-09)

- 사용자: Jev/Claude 두 호출 단위를 묶어 개발 연결, 현재 호출 횟수 제한 없이 확인.
- 이전 D-017의 20/60회 한도 답변 대기를 해소한다. `max_decisions:null`을 명시적 무제한으로 구현한다.
- 같은 실행 ID로 연결하면서 각 제공자의 호출·토큰·청구 단위와 관측 한계는 보존한다.
- 벤치마크 모니터링은 별도 Opus 5.5 에이전트로 수행한다. Codex 에이전트를 Opus로 표시하지 않는다.
- D-018 기록/실패/종료 보완을 먼저 적용하고 실제 연결을 검증한다. 결과 불확실 요청의 자동 재시도는 하지 않는다.
- 횟수 제한 해제는 무한 반복·자동 재실행 명령이 아니다. 목표 완료·실패·불확실 상태에 따라 종료하며
  프로세스/도구 시간 제한은 유지한다. OAuth 구독에는 임의 USD 상한을 넣지 않는다.
- 구현 역할/계약: [paired runtime](agents/PAIRED_RUNTIME.md), [Opus monitor](agents/OPUS_BENCHMARK_MONITOR.md).

## D-020 — Jev USD 1 사용 한도 및 모듈 경계 확인 / 확정 (2026-10-09)

- 사용자: 현재 Jev 비용은 USD 1 안에서 실행한다. D-019의 금액 승인 대기는 이 지시로 해소된다.
  호출 횟수는 임의로 제한하지 않지만 금액 예산이 다음 호출을 감당하지 못하면 중지한다.
- 실제 달러 청구액이 API에 없으므로 공개 최고 토큰팩 가격 USD 0.60/M를 적용한 보수적 사용량
  환산 장부를 구현한다. 공급자 발급 달러 hard cap은 아니다. 조사상 서버가 과금 토큰을 문맥
  상한 이하로 보장하는 별도 문구는 미확인이다. 이 한계를 숨기지 않는다.
- TypeSafe 문서의 64k 전체 문맥보다 넉넉한 65,536 입력 토큰을 POST 전에 예약한다.
  성공 응답의 차감 토큰·1배율·tokens 과금·모델·목적지를 검증한 뒤 실제 차감량으로 정산한다.
  credits 과금, 누락, 모델 변경, 불확실 결과는 예약 유지 및 다음 호출 중지다. 자동 재전송하지 않는다.
- E2E-SWE, 소규모 연결 확인, 이후 Personal OS는 같은 영속 장부를 공유한다. 새로운 실행 디렉터리는
  예산 초기화가 아니다. 동시 writer를 배제하고 손상·남은 lock은 자동으로 지우지 않는다.
- 현재 모듈 구조: paired 부모 → 개발 runner / Opus monitor의 별도 프로세스;
  개발 runner → Claude CLI → MCP gate → Jev HTTP client → 격리 명령 실행 → Claude.
  Claude 설정·인증과 Jev 설정·인증은 분리된다. 범용 provider 교체 인터페이스나 판단마다
  새 세션으로 handoff하는 제품 기능이 완성됐다는 뜻은 아니다.
- 근거: [예산 조사](research/JEV_BUDGET_FEASIBILITY.md), [실행 안내](PAIRED_RUN.md).

## D-021 — 토큰 옆 공식 가격 환산 및 실패 원인 기록 / 확정 (2026-10-09)

- 사용자: 토큰 옆에 공식 단가 비율로 가격을 표시하고, 현재 Jev 월 구독을 반영하며 실패 원인을 분석·기록한다.
- 현재 Creator 월29USD/60M 제공량을 공식 가격 UI와 활성 계정에서 확인했다. 표시 가격은 잔액 차감 토큰에 월 구독료를 배분한 추정이며 추가 청구가 아니다.
- Claude는 관측한 정확한 모델과 입력/출력/캐시 읽기/캐시 생성 TTL별 공식 API 단가를 사용한다. 모르는 단가·TTL은 미확인, thinking 중복 합산 금지.
- D-020의 공유 USD1 보수적 장부(USD0.60/M)는 그대로 유지한다. 표시 단가 변경은 예산 초기화·증액이 아니다.
- 실패 원본과 진단 개입 후 결과를 별도로 보존한다. 기존 Personal OS와 새 유료 추론은 이번 표시·분석 변경 범위에 포함하지 않는다.
- [가격 산식](DASHBOARD_PRICING.md), [실패 분석](research/D020_FAILURE_ANALYSIS.md).

## D-022 — 실제 재실행으로 막힌 단계 확인 / 확정 (2026-10-09)

사용자가 다시 실행해 어디까지 안 됐는지 확인하도록 요청했다. 새 attempt05/새 offline 컨테이너를
사용하고 D-020 USD1 공유장부를 재사용한다. 별도 Opus5.5 monitor도 기존 paired로 연결한다.
알려진 설치 인계 문제를 재현하지 않도록 원 목표에 artifact-contract.md만 추가했다. setup.sh와
fresh-container 설치 요구만 명시하며 구현계획/정답/숨은테스트는 주지 않는다. 완료판정 알고리즘은
변경하지 않는다. 이전attempt와입력조건이다름을기록하고, 원본산출물 그대로독립채점한다.

## D-023 — 성공 실행 기준 Claude 직접 판단 속도 비교 (2026-10-09)

사용자가 Claude판단과Jev사용시속도차이를요청했다. D-022 성공본과동일목표/설치계약/Opus5.5 medium/이미지/도구제약으로새baseline1회를측정한다. baseline은Claude가후보와selected_id를내는구조화조건이며무제한nativeClaude도구와같지않다. Jev판단요청은없음. 별도Opusmonitor는양쪽유지하되비용/시간분리. 전체실행시간/독립채점/행동수와Jev HTTP왕복지연을구분한다. 각조건1회인비동시실험으로인과효과나반복안정성을주장하지않는다.

## D-024 — 판단 비용 대체, 고정 질문 분리 측정, Claude 역할 규칙/Jev 갱신 (2026-10-09)

사용자는 기존 에이전트 판단 단계를 낮추는 것이 목적임을 재확인했다. 이미 Claude가 계획/코드를 만든 뒤 모든 명령을 Jev가 승인하는 D-014 실험 구조는 비교용으로 보존하고, 개선 목표로 삼지 않는다. Claude는 역할/규칙과 필요한 구현을 생성하고, Jev는 명시된 근거에 따라 규칙 검증·유지·갱신 필요성을 선택한다. 갱신 필요할 때만 Claude를 재호출한다. 도구 권한·증거 버전·테스트 실행 사실은 프로그램 검증 대상이다. Jev 승인이 독립 테스트 통과를 대체하지 않는다.

고정 입력 전달시간과 전체 E2E는 분리한다. 이번 3문항은 전달시간 단축을 보였지만 1문항 판단 불일치가 있어 품질 우위를 주장하지 않는다. USD1 공유장부 유지. 실제 Personal OS 변경 없음. 개발 분업 역할은 agents/D024_EFFICIENCY.md, 측정은 research/D024_DECISION_LATENCY.md.

## D-025 — 새 checkpoint 구조 재측정 및 판단 기록 스킬 / 확정 (2026-10-09)

사용자는 재측정·비용 분석과 서브에이전트를 통한 판단 과정 문서화 스킬 제작·적용을 요청했다. 기존 USD1 장부를 유지하고 같은 목표/이미지/Opus5.5 medium 조건에서 새 checkpoint baseline/Jev를 각1회 순차 측정한다. 역할 선택을 코드 생성 앞으로 옮기고 정상 명령은 추가 Jev 호출 없이 실행한다. 완료 요청에는 서버의 전체 목표/실제 관측 결과를 넣고 같은 action version 재요청은 거절한다. 이 구조는 native Claude 서브에이전트 자동 생성과 동일한 기능이 아니며 기존 역할 규칙 모듈과 별도 계측 조건이다.

문서 정본은 [D025 판단 기록](decisions/D025.md). skills/jev-decision-records를 생성하고 Codex 사용자 스킬 경로에 설치했다. 형식검사와 독립 행동검증을 구분한다. 과거 구조와의 차이는 전체 구조 변경 효과이며 Jev만의 인과효과로 보고하지 않는다.

## D-026 — 판단 소유권 설계와 공개 패턴 조사 / 제안 (2026-10-09)

사용자가 대신 결정할 내용·생략할 판단·실행 규칙을 함께 고안하고 공개 사용을 병렬 조사하도록 요청했다. [D026](decisions/D026.md)에 근거와 제안을 기록했다. 재사용 질문과 handler 직접 dispatch, 실패 담당 분류·요구사항별 의미 검토 우선 실험을 제안한다. 정책 합의·구현·새 유료 실행은 아직 진행하지 않았다.

## D-027 — 문서 기반 task tree와 실행 함수 연결 / 방향 확정 (2026-10-09)

사용자는 작업 후보·실패 범주를 문서로 전달, 사전 질문 생성, 모델+추론 조합으로 서브에이전트 생성, Jev 확률 기반 재귀 분할과 직접 dispatch, finish 제거를 지시했다. D026 규칙 적합도 중심 제안을 수정한다. 여러 임계값 비교 후 결정에 동의했으며 운영값 null이다. [D027](decisions/D027.md)에 offline 하네스 검증과 live 미구현 경계를 기록했다. 실서비스/E2E 개선 확정 아님.

## D028 — 질문·프로필 정본 문서 직접 사용 / 확정 (2026-10-09)

사용자 요청에 따라 사전 질문 원문·type·답과 프로필·작업자 고정지시의 위치를 docs/orchestration/contracts에 명시한다. 실행 시 로더로 읽고 변수/문서 후보만 붙인다. 새 경로는 모의 연결 검증 완료이며 기존 live benchmark runner를 교체한 것은 아니다. contracts/README.md 참조.

## 2026-10-09 D029 — 모델/문서 연결과 실제 분할 E2E

Opus5.5/Fable5.1/Sonnet5.5/Haiku5.5와 effort 5단계 정본, worker v2, CLAUDE.md→AGENTS.md 연결 추가. 소스 최초 커밋887d360 후 Opus medium 단일/분할 각1회와 Jev1회 실행. 양쪽 원본30/30. 측정 단계 합계303.980→234.584초(단일 분모22.829% 감소), 워크플로 비용 추정USD0.905536→1.4860908(64.112% 증가). 문맥 중복 원인 기록. p=.66에 .5/.65는 split, .8은 single; 강제 대조이며 자동라우팅 효능/확률 calibration 미검증. 상세 [D029 결과](orchestration/D029_RESULTS.md), [구조화 기록](decisions/D029.md). 추가 유료 재실행 없음, 원격 push/PersonalOS 변경 없음.

## D030 — 2026-10-09 입력 필드 감사

[조사](orchestration/D030_INPUT_AUDIT.md), [기록](decisions/D030.md). 기존 request 동일값 중복 제거 복사본은 split bytes 52.071% 감소(원본285625분모, system제외). 토큰/비용 감소 아님. Jev 판단 대체와 코드의 projection을 분리 제안. 런타임/계약 변경·새 유료호출 없음.

## D031 — 2026-10-09 입력 개선·판단기 비교 구현

[구현](orchestration/D031_IMPLEMENTATION.md), [역할 조사](orchestration/D031_ROLE_RESEARCH.md), [기록](decisions/D031.md). 중복 제거+직접/전이 의존 선별, v3, Claude/Jev/script/forced 분리, 고정계획 재사용·지표 비교 추가. offline split bytes71.378%감소(원본분모), 토큰/품질 미측정. 전체390/390 통과. telemetry역할/single ID충돌 수정. 작업자Opus medium 유지. 미커밋,paid0,push없음.

## D033 — 2026-10-10 20회 실험 완료

[결과](orchestration/D033_RESULTS.md). 기본+4후보각4회,Opusmedium,패키징3파일/나머지8고정.20/20원본30/30통과. output_dedup평균입력5.099%/비용환산4.873%/시간6.735%감소(각baseline평균분모).compact는입력감소최대이나시간3.278%증가. CLI환산총USD1.5133082,Jev0.20verifier제거,미커밋소스·private결과유지.운영채택미수행.

## D035 — 2026-10-10 업그레이드 조사 (제안)

[기록](decisions/D035.md), [조사](orchestration/D035_UPGRADE_RESEARCH.md). 자동 checkpoint, script bypass, exact decision cache, template 선택, 근거 수집 fallback 순서를 제안. 운영 기본값·작업자 모델·임계값 변경 확정 아님.

## D036 — 자동 판단 구조 생성·검증

사용자 지시에 따라 D035의 첫 plan_ready 연결을 구현했다. [D036](decisions/D036.md). 기본 auto, 명시 threshold, 고정worker, 프로세스내 exact cache와 실행 중복방지. 실제 근거수집/template planner는 후속이다. 무과금407개 회귀검증은 유료 E2E 성능 개선 증거가 아니다.

## D037 — 실제 고정 계획 비교 결과

[기록](decisions/D037.md),[결과](orchestration/D037_RESULTS.md). 판단지연과전체생성시간은감소했지만분할작업자의입력/cache비용증가로총환산비용은증가. 비용절감성공으로채택하지않음. n1/조건,동일concreteJev모델미확인. 임계값변경없음.

## D038 — 후속 실험 조사 (제안)

[기록](decisions/D038.md), [설계](orchestration/D038_NEXT_EXPERIMENTS.md). 기존 D037 조건 반복만으로 판단기 효과를 확정하지 않는다. 분할 비용 진단과 Claude 계획 생략 실험을 구분하고, Claude 계획+선택 통합 baseline을 포함한다. 운영 임계값·새 유료 실험 횟수는 확정하지 않았다.

## D039 — 큰 과제 후보 (제안)

[조사](orchestration/D039_LARGER_TASKS.md). 첫 후보 OpenAPI, 대조 DiskCache, 강결합 GraphQL 및 전체 Personal OS를 제안. 사용자가 후보·새 실행 규모를 확정한 것으로 해석하지 않음. native 포함 기존 제품 범위 유지.

## D040 — 큰 과제 첫 실행 중단

[기록](decisions/D040.md). OpenAPI evaluator 준비완료, 실제Claude단일구현timeout으로 비교중단. 생성물채점/절감효과미검증. 과금불확실상태에서 자동재시도하지 않음. 같은no-tools조건을확대했을때 드러난 한계를 문서화했고 iterative harness 채택/구현완료로 해석하지 않음.

## D041 — 10분 호출 제한 제거

사용자 지시에 따라 고정10분 cap 제거. 전체 phase30분은 유지. D040 Jev는 API실패가 아니라 실험정책에 따른 미실행이었다. [정책](orchestration/D041_TIMEOUT_POLICY.md). 별도 독립조건 실행과 불확실 요청 재시도를 구분한다.


## D043 — confidence 기준 (2026-10-10)

현재 pilot 기본 판단 기준은 confidence다. `split-confidence.v1.json`의 execution choice(split/single/defer)에 붙은 confidence를 명시 `--confidence-threshold`와 비교한다. 낮으면 needs_evidence, 충분하면 선택된 실행으로 직접 연결한다. `--decision-basis probability --split-threshold`는 과거 재현용이다. 정본 설명: `docs/orchestration/D043_CONFIDENCE.md`. 회귀 419/419, 유료 호출 없음. D042 산출물 JSON 실패는 아직 미수정. 임계값은 미보정이며 확정 최적값 없음.


## D044 — 2026-10-10

Choice audit and 25/25 local checks completed. split-confidence.v2.json clarifies actual artifact transport and defer blockers. Live diagnostic process was rejected by automatic approval review pending concrete payload egress approval; no new API request. See docs/orchestration/D044_CHOICE_AUDIT.md.


### D044 live result after explicit approval — 2026-10-10

One Jev POST completed: defer/confidence0.89, HTTP752ms, input11592/output40. Shared input ledger107584 of10M, pending0. No worker call or grader. All three options retained; transport repair remains pending. Supersedes earlier pending-approval status. Evidence: docs/orchestration/D044_CHOICE_AUDIT.md and benchmark-runs/d044-choice-audit-01/.


## D045 — 1~5 작업 개수 (2026-10-10)

현재 pilot 기본은 count. task-count.v1.json에서 실제 후보1..N(최대5)을 선택하고 confidence는 기록만 한다. 1은 유지, 2~5는 해당 개수로 역할·작업 묶음 실행. 동시 실행 수와 별개다. 단일 후보는 Choice API 최소2개 제한 때문에 force_jev 포함 무호출로 진행한다. 과거 confidence/probability 정책은 명시 옵션으로 유지. 문서: docs/orchestration/D045_TASK_COUNT.md. 전체424/424 검증, 유료 호출 없음. D042 출력 실패는 미수정.


## D046 — 2026-10-10

Actual numeric trial terminated failed after20min37sec: Jev selected2/confidence0.53, first8-file group hit output continuation and final JSON parse error; files0, group2 not started, grading not run. Opus monitor completed separately. Shared ledger139322/10M, pendingnull. See docs/orchestration/D046_COUNT_RUN.md. No commit/push.


## D047 — 전체 작업 효율 우선 (2026-10-10)

사용자 정정: 현재 Jev 입력량은 허용 가능하며 전체 작업 효율을 우선한다. 입력 축소를 우선 과제로 삼지 말고 충분한 판단 근거를 유지한다. 기존 예산은 유지. 현재 D046은 초기 task_count만 Jev1회 호출하며 작업 중 실패·재분할·모델/effort·요구사항 판단은 미연결이다. D044 실패 근거도 D046 state에 전달되지 않았다. 감사: docs/orchestration/D047_DECISION_COVERAGE.md. 후속 연결 순서는 제안이며 이번에는 구현·유료 호출 없음.

## D048–D050 — whole-task lifecycle comparison (2026-10-10)

[New lifecycle](decisions/D048.md), [verifier continuation](decisions/D049.md), [lossless payload and terminal comparison](decisions/D050.md). Real parallel execution and original grading completed, both tasks unresolved (Claude60/63,Jev0/63). Failure costs retained, unknown failed request cost not zeroed, no pure judge savings claim. Read [results](orchestration/D048_D050_LIFECYCLE_RESULTS.md) and current STATE before any continuation.

## D051 — corrected matched rerun (2026-10-10)

[Record](decisions/D051.md), [results](orchestration/D051_RESULTS.md). Provider-confirmed refund reconciled; new matched projection and public generated-output checks executed. Both conditions unresolved61/63 and0/63. Jev repair/stop on incomplete evidence remains a routing defect to investigate; exact internal rationale is unknown. No savings claim or additional rerun authorized by this record itself.

## D052–D054 — Jev-generated allocation and terminal continuation (2026-10-10)

[Initial attempt](decisions/D052.md), [anchored ownership](decisions/D053.md), [payload continuation](decisions/D054.md), [final results](orchestration/D052_D053_RESULTS.md). Jev chooses task count and file/requirement ownership; code derives declared dependency edges and assembles instructions. No prebuilt groups, but existing architecture catalog retained. Planning succeeds; execution incomplete62/63 versus0/63. HTTP400causeunknown, netrefundconfirmed, no automatic retry or efficiency claim. Final561/561tests passed; next compatibility diagnostics and accountable repair routing.

## D055 — recursive task/test planning proposal (2026-10-10)

[Record](decisions/D055.md), [design](orchestration/D055_RECURSIVE_TASK_TESTS.md). User direction: necessary Jev-guided splitting, separate task/test lists and a refining loop. Draft covers source-backed obligations, node-level 1..5 semantics, strict progress, retained integration tests and serialized shared-file writes. Detailed stop/limit policy remains proposed. Runtime and paid evaluation not started; D053/D054 outcomes unchanged.
## D056 — recursive task/test planning experiment (2026-10-10)

[기록](decisions/D056.md), [구현](orchestration/D056_IMPLEMENTATION.md), [결과](orchestration/D056_RESULTS.md). 원문 의무를 보존하는 재귀 분할과 별도 작업·테스트 목록을 구현했다. 표 형태 입력은 실제 API 240회에 성공했지만 계획은 `partial`이다. 개수 판단 10/10회가 분할을 선택했고 순차 배정 195회가 입력 비용 대부분을 차지했다. 유지 조건, 묶음 질문, 실제 의존 관계·수정 범위 보완은 후속 제안이다. 기존 10M 장부와 실패·환불 기록을 유지했으며 이 실험의 추가 호출은 없다.


## D057 — 실제 개발 완료 비교 (2026-10-10)

[결과](orchestration/D057_RESULTS.md), [결정](decisions/D057.md). 실제 A63/63완료29분28.518초, B62/63미완료(시도23분25.734초). Jev는 실제1회호출로1leaf/0split을 선택했다. 완료 속도 개선값은 null이며 병렬화 이득 미검증. API환산 A7.6330826/B8.4574292 USD, 실제 청구 unknown. 원본 후보/평가를 보존했고 유료 반복·커밋·푸시는 없다.


## D058 — Jev 유지1 제외 재판단

[기록](decisions/D058.md): D057 state 그대로,2~5 조건부 선택에서3채택. 실제1회/1765.3185ms/입력25015·출력46/환산USD0.015009. 작업배정·개발은 미실행. 최초 로컬 계측 역할명 검증 오류는 API 이전 실패로 보존.

## D059 — 순차 멀티 선택과 프로필 라우팅 (2026-10-10)

[기록](decisions/D059.md), [결과](orchestration/D059_RESULTS.md). 요청한 새구조의 실제연결 확인. 65/13/2배정은 유효하지만 파일중복으로직렬실행; 최종57/63미완료. 효율개선미입증. 일반화·자동재실행 승인으로해석하지않는다.

## D060 — 독립성 배정·상한·검증 게이트

[기록](decisions/D060.md), [구현](orchestration/D060_BOUNDED_VERIFICATION.md). 임시1.25균등량상한·명시재배정·실행증거게이트 구현. 모의65→27/27/26,799/799회귀. 실제85검사매핑/공유검사준비조건은 미완료이므로 제품 유료 재실행은 하지 않았다.

## D061 최대 작업자30

[기록](decisions/D061.md), [새v3경로](orchestration/D061_MAX_WORKERS.md). 사용자확인:2..30선택,동시성기본2. 모의80/85재배정과811회귀통과; 실제제품mapping미완료로유료미실행.

## D062 — 실제 Jev 선택 실험

[기록](decisions/D062.md). 실제2명선택,배정73/79/78/77로30..50범위불충족. API13/13성공이나 계획실패. 개발·속도개선 미검증.

## D063 — 사이드 DAG 설계의 메인 반영 (2026-10-10)

[계획](orchestration/D063_DAG_PLAN.md), [기록](decisions/D063.md), [독립 검토](agents/D063_REVIEW.md). 작업/산출물/충돌 분리와 용량 후보 제한을 후속 개발 방향으로 채택했다. P0 공개 검사·산출물 계약 후 어댑터/스케줄러/검증/관측을 분업한다. 현재 실행기에도 이벤트 해제가 있으므로 barrier 제거를 새 성과로 주장하지 않는다. 구체 파라미터·효율은 미확정/미측정이며 새 제품 실행 없음.

## D064 — 로컬 DAG 기반 구현과 스킬 관리 (2026-10-10)

[기록](decisions/D064.md), [구현과 다음 순서](orchestration/D064_IMPLEMENTATION.md), [스킬 유지보수](skills/MAINTENANCE.md). 사용자 요청으로 스킬 담당1명을 추가하고 문서화한 계약/공개검사/어댑터/스케줄러/검증/관측을 병렬 개발했다. opt-in 로컬 workflow, 정확한 revision 검사, 용량 가능한 owner 예약, 이벤트 HTML을 연결했다. 회귀993/993 및 실제 로컬 subprocess fixture 통과는 제품/Jev 효율 검증과 별개다. 공개 검사36/85, 나머지49개와 실제 후보 환경/revision 연결은 제품 차단 조건이다. 의미적 질문 handler는 제안 상태, durable restart/유료 어댑터 연결도 남았다. 기존 소스·장부·실험은 유지하고 새 모델 호출/전역 설치/커밋/푸시는 하지 않았다.

## D065 — 실제 DAG 연결·공개 검사·중복 테스트 정리 (2026-10-11)

[기록](decisions/D065.md), [실측 결과와 정정](orchestration/D065_RESULTS.md), [역할](agents/D065_PARALLEL.md). 공개 검사·runtime·handler·runner·테스트 정리·단일 스킬 담당과 독립 검토를 병렬로 진행했다. 공개85개 검사를 연결하고 실제 파일/환경/revision을 실행 증거에 묶었다. 삭제 대상4개 파일의 테스트 정의는74→58이며 고유 실패 반례를 보존했다. 전체 회귀는새모듈검증32개추가로993→1009다.

단일 실제 조건은 Jev17회로 담당자2명·파일16개의 소유권을 선택하고 Claude16회로 생성했다. 19m56.51초는 실패한 시도시간이며 성공 완료시간이 아니다. 독립 채점62/63 통과·1개 실패. 생성 코드의 문법 오류와 검증기 자체의 실패 보고서 분류·설치 원본 경로 오탐을 구별하고 원본 후보/실행을 보존한 채 검사기만 정정했다. 실패 보고서 재생·공개 검사 버전 갱신과 실제 제품 성공을 혼동하지 않는다. 의미 핸들러는 연결됐지만 실제 자유 재귀 분해·관계/프로필/수리 호출과 성공 조건을 맞춘 효율 비교는 이번 범위 밖이다. 추가 유료 반복·예산 초기화·원본 Personal OS 변경·전역 설치·커밋·푸시는 하지 않는다.

## D066 — 재귀 분해·관계·공개 수리 4조건 실측 (2026-10-11)

[기록](decisions/D066.md), [결과](orchestration/D066_RESULTS.md), [사전 프로토콜](orchestration/D066_EXPERIMENT.md). 최신 사용자 요청으로 기존 OpenAPI client generator에서 공통 후보21단위·38파일을 새로 준비하고 Claude전체/Jev분해/Jev분해·관계/Jev전체판단의4조건을실행했다. Claude는6개잎·실제관계·공개수리1회뒤공개85/85·독립63/63을통과했다. 준비포함42분54.750초/API환산$22.148223이다.

Jev세조건은각각33POST·650,271입력뒤예정예약65,536이조건당700,000을초과해분해중단됐다. 이조건당상한은실험배분이며사용자누적10M장부의고갈이아니다. 잔여415,445/pending0을보존한다. 짧은실패시간이나낮은실패지출을개발완료효율개선으로보고하지않는다. Jev관계·수리·성공완료비교는미측정으로남고,호출성공과제품성공을구분한다. 질문묶음·소속집중·단계별예산은후속수정제안이다. 전역스킬설치·원본PersonalOS변경·커밋·푸시는없다.

## R20261014 D083 스킬 실행 연결

[구현·검증·미해결](orchestration/POINTSMAN_D083_GATEWAY.md). 새 브랜치 feat/d083-skill-gateway. 분해·모델·담당 판단 gateway, source/body/response/기록 강제. Codex 실제 호스트 통과; Claude429; 장부 보존1건 미해결. 기존 결과를 성공으로 다시 쓰지 않았다.

## R20261014 Codex 성능 벤치마크 준비

[실행 어댑터·동일 질문 비교·E2E 계획](orchestration/CODEX_BENCHMARK.md). 기존 branch 유지, source 신규 분리, mock9/9, 과거 실제 trace 오프라인 파싱. 새 유료 호출/전체 개발 비교 없음. 공유 장부는 별도 서비스 정산이 계속 기록되는 운영 상태로 확인하여 복원하지 않음.


## R20261015 부분 수리·담당 근거·CLI 고정과 새 비교

[결과·한계·부수 효과](orchestration/CODEX_REPAIR_RESULTS.md), [구조화 기록](decisions/R20261015_CODEX_REPAIR.md). 새 Codex 제품 미완료, Jev 최종 검사 Docker 장애로 uncertain. 초기 동일210질문 구간37.847배는 전체 개발 완료 가속도가 아니다. 기존43920파일·119소스핀 불변. 추가 추론 없는 후보 재채점도 Docker 부재로 막혀 보존 후보로 이어갈 수 있다. 메인 PR14/v0.3.3에는 역사적 D067 완료실험의 긍정적 수치와 DAG 라우팅 소개만 반영했다. 연구 구현은 미커밋 상태다.


## 2026-10-15 — 사용자 직접 Docker 종료·재채점 보류

사용자가 Docker 직접 종료와 재채점 보류를 확인했다. Docker 재시작/추가 모델 호출/자동 재채점 없이 후보와 원본 결과를 보존한다. [보류 기록](orchestration/CODEX_REPAIR_HOLD_20261015.md).


## 2026-10-15 — 기능 경계·스킬 분해·시간/토큰 공개

[구조화 감사](decisions/R20261015_CAPABILITY_PUBLICATION.md). main/research/로컬 기능·스킬을 구분하고 D067완료3조건의 시간·토큰과 별도Codex초기판단구간을 재검증해 PR15/main02ace1d/v0.3.4에 게시했다. 메인394검사·269링크·CI4통과. 토픽jev/jev-router/dag반영. 스킬분리 자체 절감은 미측정. 새모델호출/Docker재시작/보류채점없음. 연구코드·기존결과보존.


## 2026-10-16 — D067 이후 결과 연혁 누락 보완

[기록](decisions/R20261016_POST_D067_RESULTS.md). D069·D070보존수리·D076·D079·D082·D083·D085 성공을 포함한 D068–D085 연혁을 PR16/mainbaab3d1/v0.3.5로 게시했다. 기존메인요약 누락을 정정. 새실험·유료호출·Docker재기동·보류채점 없음.

## D088 — 모델 정본 통합과 새 Codex 비교

2026-10-16 사용자 요청으로 새 branch/worktree에서 admission v5와정산의exact-label정본을통합했다. [결정·측정](decisions/D088.md), [결과](orchestration/D088_CODEX_RESULTS.md). 동일Codex5.6-sol/high 각1회, 공개81/93→92/93·독립57/63→59/63이나완료0/2. 실패시도시간16.46%↓,참고환산4.36%↓,전체토큰27.22%↑. 과거49,220결과파일변경0. 새유료호출을자동반복하지않는다.

- [D093 실제 전체 개발 비교 종료](decisions/D093.md): 모델·노력도 선택/공개 성과 연결, Codex·Claude native완료2/4, Jev두조건미완료·unknown차단. 실패 준비·캐시·비용·소스phase와감사오류보존.

- [D094 잠정 모델 선택과 blocked 복구](decisions/D094.md): 구현/79검사/새실제실행종료,공개93/93·독립59/63미완료,원본보존.
