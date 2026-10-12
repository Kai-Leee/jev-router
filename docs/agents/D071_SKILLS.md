# D071 — 공개 gate·원인 연결·실제 프로필 선택의 스킬 기록

2026-10-11 KST에 [역할 계약](D071_PARALLEL.md)과 [실험 계획](../orchestration/D071_EXPERIMENT.md)에 따라 기존 단일 스킬 관리 담당을 이어 맡았다. 2026-10-12 실제 종료 근거를 아래 후속 절에 적용했다. **새 개발은 Claude만 공개 93/93·독립 63/63 완료, 고정 Jev와 프로필 Jev는 미완료다. 프로필 선택 10개는 실제 모델 identity 10개와 연결됐고 별도 보존 후보 수리는 성공했지만 동일 품질 효율 우위는 입증되지 않았다.** 아래 사전 검토·미측정 표현과 D070의 고정 148개 통과·추가 공개 0/8은 당시 관측으로 보존한다.

## 목적·역할·사용 규칙

목표는 공개 description 실패를 새 실행의 필수 검사에 연결하고 실제 producer→IR→renderer 범위의 수리와 Jev 모델/노력도 선택을 검증한 뒤 동일 품질의 완료시간·공식 환산비용을 비교하는 것이다. 예정된 새 `claude_all`, `jev_all`, `jev_profile`과 보존 후보 수리는 서로 다른 분모다. 조건 정의·완료 기준·source freeze와 실제 실행은 root의 실험 계약을 정본으로 둔다.

[jev-skill-maintenance](../../skills/jev-skill-maintenance/SKILL.md)와 [jev-decision-records](../../skills/jev-decision-records/SKILL.md)를 적용하고, 사용 가능한 `skill-creator` 지침의 최소 변경·구조 검사 원칙을 확인했다. 소유 범위는 기존 records 스킬, 이 역할 기록과 [MAINTENANCE](../skills/MAINTENANCE.md)의 SKM-015다. 공유 STATE·DECISIONS·실험 계약은 root 소유다. 스킬 적용은 provider/Docker/장부 조작·설치·새 권한을 만들지 않으며 이 역할은 추가 유료 호출·전역 설치를 하지 않는다.

질문과 선택 후보의 영어 원문·경로·revision은 해당 구현 담당의 계약에서 읽는다. 스킬에서 질문, 모델 이름/effort 지원표, 생산 API나 수리 범위를 새로 정하지 않는다. 공식 지원 조사, 실제 계정 확인, 선택, 실행, 품질과 효율을 별도 근거로 기록하며 숨김 grader 내용은 판단·수리에 전달하지 않는다.

## 변경 전 보존과 최소 보완

기존 파일을 먼저 [source-before](../../benchmark-runs/d071-preflight/source-before/)에 경로 그대로 보존했다. [사본 manifest](../../benchmark-runs/d071-preflight/skills-maintenance-before.json)는 records의 5파일과 MAINTENANCE의 총 6파일·SHA-256 일치를 기록한다. 새 D071 역할 파일은 당시 없었다. 초기 inventory의 records tree는 `157d7f3f2aec6d3b7179a2c2db797bb0ff2dfbdbf32e65cbd22e1a025a90b371`, reference는 `5222b8c8a9923d0d97ef4dce8737bb00be070b6c14f240fdfe5895122c1dde9d`로 D070 종료 관측과 같다.

기존 [record-contract](../../skills/jev-decision-records/references/record-contract.md#artifact-dag-evidence)의 세 부분만 보완한다. SKILL 본체·메타데이터·helper·schema는 변경하지 않는다.

| 관측된 누락·새 요청 | 기록 규칙 보완 | 적용 한계 |
|---|---|---|
| D070은 고정 gate 통과 후 추가 공개 description 진단 실패 | 새 공개 진단의 필수 gate 승격은 적용 run·검사 버전과 함께 기록하고 과거 점수는 당시 기준으로 보존 | D071 검사 등록·로컬 대조·실제 제품 통과는 별도다. 새 기준을 D070 완료 기록에 소급하지 않는다. |
| D070 Jev 후보는 A19/중단만 있어 앞단을 선택할 수 없었음 | 실제 질문에 전달된 원인 경로·후보/제외·read/write scope·반복 실패 signature·artifact revision을 연결 | 소유권·정적 소스 관측·실제 renderer 분기를 구분한다. 후보 확대 자체는 수리 성공이 아니다. |
| D071 작업별 모델/effort를 Jev가 골라 실제 CLI로 전달하도록 요청 | 생성 제안→지원 문서/CLI 버전→계정 가용성→허용 목록/질문 revision→typed 선택→실제 인자/모델 identity→품질·효율의 근거를 구분 | alias/문서/선택만으로 실행을 확정하지 않는다. 요청 effort와 runtime acknowledgment를 구분하며 내부 추론량을 token/시간으로 추정해 확정하지 않는다. |

새 스킬을 만들 정도로 역할이 달라지지 않았다. 새로운 필수 JSON 필드나 실행 중단 정책도 스킬이 정의하지 않는다. 프로필·원인 수리 API가 확정되면 담당 문서와 연결해 기록하되 실측 전 수락·성공·절감 수치를 채우지 않는다.

## 저장 사례에 적용한 사전 검토

- [D070 분석](../../benchmark-runs/d070-analysis-01/analysis.json)의 공개 85/85·독립 63/63과 [추가 진단](../../benchmark-runs/d070-public-description-probe-01/report.json)의 0/8을 같은 분모로 다시 쓰지 않는다. 추가 실패를 다음 실행 gate로 승격하는 정책 변경과 과거 결과 보존이 동시에 가능하다.
- [D070 수리 감사](../../benchmark-runs/d070-review/development-repair-review-01.json)에서 A19/중단 밖의 IR·operation builder·generator는 Jev가 선택할 수 없었다. 반복된 같은 공개 실패와 변경되지 않은 앞단은 새 질문에 제공할 이력 근거이고, 실제 renderer 분기는 미계측이므로 추정으로 채우지 않는다.
- D070의 고정 Opus5.5 medium 실행은 Jev가 작업별 프로필을 선택한 증거가 아니다. 반대로 D071의 지원 목록·모의 선택·CLI 인자 검증이 생겨도 실제 계정 가용성과 provider receipt가 확인되기 전에는 live 프로필 실행으로 쓰지 않는다. 이는 현재 미실행 상태에 적용한 비해당 사례이며 실제 D071 호출 검증은 아니다.

위 검토는 허용된 저장 문서·공개 진단/감사에 규칙을 수동 적용한 것이다. 독립 에이전트 행동·호스트 자동 발견/호출·사용자 효과 검증이나 D071 런타임 실행으로 바꾸지 않는다.

## 검증·미완료·다음 행동

기존 `quick_validate.py`로 변경된 records 스킬의 구조를 확인하고, 변경 후 read-only inventory로 source/설치 사본을 비교한다. 신규/변경 helper가 없으므로 helper 테스트나 프로젝트 전체 회귀를 반복하지 않는다. 소유 문서와 reference의 공백·diff를 확인한다. 검사 명령과 실제 결과는 이어 기록한다.

초기 inventory는 exit 0·원본 스킬 2개다. Codex records 사본은 `93710658…`로 원본과 `SKILL.md`·reference가 다르며 갱신하지 않는다. records의 agents 설치 부재, maintenance의 두 설치 루트 부재와 maintenance tree `7445e650…`는 기존과 같다. host discovery/invocation verified는 false다.

다음 trigger는 원인 수리/프로필 계약 확정과 root의 새 실행 근거 전달이다. 라이브 결과 전에 수리·프로필 선택·새 gate 완료·효율을 미측정으로 유지한다. 문맥 한계가 오면 적용 문서·사본·변경·검사·미완료를 이 역할 기록에 남기고 쓰기를 멈춘다. root가 공유 상태와 전체 판단을 갱신한다.

### 2026-10-11 23:40 KST — 사전 보완 검증 완료

`python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/jev-decision-records`는 exit 0·`Skill is valid!`였다. 기존 inventory helper도 exit 0이며 [변경 후 inventory](../../benchmark-runs/d071-preflight/skills-inventory-after.json)에 저장했다. records tree는 `14500d37cab1449e16ac3698f419391cc7dc10a72b63394a8a18f2088b910c52`, reference는 `7e1b2bf1711785809f773c1a0d03c2897535a82732b575ec55f123a06de97448`다. before 사본 6/6의 SHA는 그대로이며 본체·메타데이터·검사 helper·기존 cache의 현재 바이트도 before와 같다. 변경된 기존 파일은 reference와 MAINTENANCE이고 D071 역할 기록은 새 파일이다.

reference와 MAINTENANCE는 각각 before 사본, 새 역할 문서는 `/dev/null`과 `git diff --no-index --check`로 대조했다. 세 명령 모두 내용 차이에 따른 exit 1·공백 오류 출력 없음이었다. 이는 구조·파일 보존·문서 공백과 위 저장 사례 수동 적용 검증이며 live 실행/품질/효율 검증이 아니다. 설치 사본과 maintenance 원본은 기존 해시/부재 상태를 유지하고 host discovery/invocation은 미검증이다. 사전 쓰기를 종료하며 API 확정·root 실측이 다음 trigger다.

## 2026-10-12 종료 — 실제 선택·개발 실패·별도 수리의 분리

root가 실행·독립 채점·모니터 종료와 문서 동결 해제를 통보했다. 수정 전 [closeout integrity](../../benchmark-runs/d071-preflight/closeout-integrity.json)는 launch source 269개·과거 파일 14,576개 모두 변경 0을 기록했다. 이는 이번 종료 문서 수정 전 실행 보존 근거이며 이후 허용된 reference/기록 변경을 소급 숨기는 근거가 아니다. 동결 중 작성한 [읽기 전용 후속안](../../benchmark-runs/d071-skills-followup-01.md)도 당시 원본으로 둔다.

[종료 분석](../../benchmark-runs/d071-analysis-01/analysis.json)의 결과는 다음과 같다. 공개 결과와 독립 채점의 후보 binding이 확인된 수치 요약을 사용하며 숨김 검사 상세는 읽거나 질문에 넣지 않았다.

| 조건·분모 | 공개 검사 | 독립 검사 | 완료 판정 |
|---|---:|---:|---|
| 새 `claude_all` | 93/93 | 63/63, skip 0 | 완료 |
| 새 고정 `jev_all` | 93/93 | 60/63, skip 0 | 미완료; runner의 completed와 제품 완료를 구분 |
| 새 `jev_profile` | 67/93 | 49/63, skip 0 | 미완료; 첫 수리 요청 전 로컬 입장 검사에서 차단 |
| 보존 후보의 별도 수리 | 기존 85통과+추가 8실패 → 93/93 | 63/63, skip 0 | 해당 보존 후보 수리 완료 |

새 개발의 세 쌍 비교 모두 `successful_comparison_eligible:false`다. 실패까지의 짧은 시간·낮은 비용을 같은 품질의 완료 절감으로 보고하지 않는다. 관측된 초기 구현 task도 Claude 6·고정 Jev 12·프로필 Jev 10으로 달라, 같은 계획에서 모델 정책만 바꾼 대조가 아니다. 조건별 1회·공유 환경 경합 한계와 D070의 옛 gate를 유지한다.

프로필 조건은 typed 선택 10개·실제 worker 호출 10개·model/argv 연결 검증 10개, 미실행 선택 0·연결 issue 0이다. 실제 Opus 4·Sonnet 6, 모두 요청 effort medium이었다. 내부 effort의 provider acknowledgment는 0건이며 요청 인자와 구분한다. [계정 probe](../../benchmark-runs/d071-model-probes-01/result.json)의 4모델 low 관측, 문서상 20조합, 합성 mixed20 입력, 실제 선택/실행 10개와 최종 품질은 서로 다른 근거다. 이 결과로 모델 순위·최적 effort·모델별 실패 원인을 확정하지 않는다.

### 실제 첫 수리 입력의 차단과 사전 검증 한계

[실패 분석](../../benchmark-runs/d071-profile-failure-analysis-01/README.md)과 [원시 대조](../../benchmark-runs/d071-profile-failure-analysis-01/evidence.json)는 공개 26실패 중 18개가 세부 assertion 연결 fallback(17 unsupported·1 unmapped)으로 확대됐다고 확인했다. 요구사항 보존이 `kept_all`로 바뀌어 75개 요구사항과 후보 합집합의 문맥이 구성됐다. 요청은 86,809B, 문항 휴리스틱 추정 35,206으로 운영 48,000B·추정 32,000을 넘었다. **수리 POST 0·선택 후보 없음·수리 worker 0**, 해당 원본 usage는 null이다. 이는 HTTP 거절이 아니다. 미도달 assertion 4개도 실패/성공으로 다시 분류하지 않는다.

preview의 58개 로컬 admission 통과·최대 47,659B는 description 8실패와 합성 profile/history 범위를 확인했으며 이번 여러 suite의 26실패·18 fallback 확대를 검증하지 않았다. 입력 증가를 과거 수리 이력이나 codec 탓으로 쓰지 않는다: 실제 이력은 0이고 질문 JSON 크기는 동일했다. 다음 개선 검토는 공개 assertion 연결과 선택 전 후보 합집합 문맥의 확대를 다루는 것이며, 이 기록으로 guard를 올리거나 원문을 자르는 새 정책을 실행하지 않는다.

### 호출 분모와 보존 후보 수리

[실제 호출 회계 보정](../../benchmark-runs/d071-invoked-usage-01/invoked-usage.json)은 프로필 조건의 provider 형식 원시 receipt 64개에서 전송 전 로컬 차단 1개를 별도 분리했다. 실제 Jev POST 53+Claude CLI 10=63개·미해결 분모 0, cache 포함 2,874,640토큰이며 공식 단가 재계산 USD6.884842다. 원래 보고 환산 USD6.9300858과 실제 청구/월 구독 배분 null을 보존한다. 이 보정은 실제 호출 분모를 좁힌 것이며 제외한 raw receipt의 usage/cost null을 0으로 채운 것이 아니다. 이 값은 실패한 프로필 시도의 지출이며 완료 절감액이 아니다.

별도 보존 수리는 [관측 기록](../../benchmark-runs/d071-preserved-observation-01/result.json)에서 producer `operations.py` 한 파일이 requestBody 설명을 BodyIR로 전달하도록 바뀌었고, 원본 후보와 비선택 산출물 보존을 확인했다. 이후 새 공개 93/93·독립 63/63 통과는 실제 producer 수리 성공 1건이다. 그 실행기 600,240.232666ms는 이전 후보를 시작점으로 받은 수리 분모이며 새 개발 완료시간과 비교하지 않는다. 성공한 이 한 건으로 프로필 조건의 미실행 수리나 모든 실패 범위의 수리 성공을 대신하지 않는다.

[별도 숫자 모니터](../../benchmark-runs/d071-monitor-01/result.json)는 identity 확인·attention으로 끝났지만 원시 전체 receipt의 null을 열린 회계 항목으로 설명했고 위 호출 분모 보조 보정은 반영하지 못했다. 모니터 원문은 보존하고 실제 호출 보정은 별도 원본 감사에 근거한다. 숫자 패킷 검토를 raw receipt 감사로 승격하지 않는 기존 규칙의 사례다.

### 최소 규칙 적용과 남은 검증

기존 reference에만 두 문장을 추가했다. 질문 키가 transport mapping일 때 실제 본문이 task·worker·artifact·path를 식별해야 한다는 문장, controller 무손실 복원이 모델 이해/수락을 입증하지 않는다는 문장이다. 고정 gate·실제 호출 분모·null·모니터 범위는 기존 규칙으로 충분하여 중복 조항을 만들지 않았다. 새 스킬·전역 설치·생산 소스·helper·schema·테스트·실행은 추가하지 않는다.

남은 검증은 여러 suite 실패 시 수리 문맥의 확대를 수정한 새 조건, 같은 계획에서 profile만 달리하는 비교와 반복 관측이다. 공개 근거만 사용하며 기존 실패 원본을 이어 쓰거나 숨김 결과를 수리 질문에 넣지 않는다. 구조 검사·inventory·공백 검사만 수행하고 실제 스킬 호스트 호출·사용자 효율은 검증 수준 밖으로 남긴다.

종료 보완 후 기존 구조 검사 `Skill is valid!`, read-only inventory와 reference의 `git diff --check`는 exit 0이었다. 미추적 소유 문서 2개의 `git diff --no-index --check /dev/null <문서>`는 내용 차이에 따른 exit 1·공백 오류 출력 없음이었다. records tree는 `c13f55a91accdb284c04b97f2f5350f6a1694bbb41cefc0389e6b5cfbb434b6c`, reference는 `2b091811881f31aee5f53b1a6184fdc6d0a7e196014406302d5b266a5b67cab7`다. 이전 `14500d37…`/`7e1b2bf1…`은 실행 당시 관측으로 보존한다. 본체·메타데이터·helper·cache·maintenance 스킬 원본과 Codex 설치 사본/부재 상태는 유지됐으며 host discovery/invocation은 미검증이다. 허용된 reference와 소유 문서 2개 외 쓰기 없이 종료한다.
