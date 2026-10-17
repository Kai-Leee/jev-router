# D087 — Codex 판단/Jev 판단 비교 종료 결과

2026-10-16(KST). 기존 Codex 실행기(D083 + 부분 준비 상태 수리 + 공개 담당 소스 근거)의 순차1쌍을 새 폴더에서 실행했다. 양쪽 작업자 요청은 gpt-5.6-sol/high이며 계획 질문/선택값 정규화/검사 환경을 맞췄다. D085의 복수 담당 확률·평평한 답 재질문·생성 오류 직접 수리는 포함하지 않았다. 실제 served model identity는 CLI에서 받지 못했다.

**두 조건 종료, 제품 완료0/2. 성공 완료 시간·단가 절감률을 계산하지 않는다.**

| 항목 | Codex 판단 | Jev 판단 |
|---|---:|---:|
| 최종 공개 검사 | 82/93 통과,11실패 | 미실행 |
| 독립 검사 | 59/63 통과,4실패 | 미실행 |
| 총 실패 시도 시간 | 20분56.301초 | 9.611초 |
| 입력 토큰 | 547,858 | 74,665 |
| 출력 토큰 | 80,156 | 9,000 |
| 입력에 포함된 캐시 읽기 | 9,728 | 미보고 |
| 전체 토큰(input+output) | 628,014 | 83,665 |
| 실제 외부 호출 | Codex CLI16회(판단8·작업8) | Jev POST2회·작업자0회 |
| 비용 참고값 | 요청 프로필·짧은 문맥·standard 가정 약$3.7595312 | Jev 토큰팩 환산$0.044799 |
| 실제 월정액 배분·청구 | 미확인 | 미확인 |

Codex는 구현6회·수리2회, 수리 라운드2회를 마쳤다. 총시간에는 독립 채점22.352초와 마지막 정리·검증을 포함한다. 두 조건 전환과 공통 환경 초기화를 포함한 pair 경과는21분08.638초다. 두 조건 전체 토큰은입력622,523+출력89,156=711,679다. 캐시 읽기9,728은이미입력에포함되어더하지않는다. 과거 D066 catalog 생성 시간·비용은 재사용 참고값이며 이번에 재과금/재합산하지 않았다.

## 실패 지점

Codex의 최종 공개 실패11개는 schema-models3개와 description-provenance8개다. 앞의3개는 본문 타입명, Google docstring 문단 구분, nullable 참조 enum 타입명이다. 나머지8개는4종 sync/async 인터페이스에서 requestBody.description을 본문 설명으로 전달하지 못한 경우다. 공개93개는고유caseID93개와동일artifact revision연결을확인했고, 독립63개는동일최종후보·불변candidate/checker에서실행됐다. 숨김실패세부는다음개발입력에전달하지않았다.

Jev는 첫2개split POST가HTTP200으로완료됐다. 두번째반환모델은typesafe/jev-1.14-20261014였다. 세번째질문전token-admission은model_context_assumption=jev-1.13.0에해당모델을인식하지못해 JEV_TOKEN_ADMISSION_MODEL_UNVERIFIED로차단했다. 본문107,729B는공식256,000B한도내이며 로컬토큰한도는null이다. 따라서토큰양초과나제공업체거부가아닌**내부모델허용목록불일치**다. 정산쪽1.14지원만갱신하고입력검증쪽과동기화하지않은통합누락이다. 세번째는예약/POST전실패이며실제POST2회와혼동하지않는다. 작업자·공개·독립검사0이므로9.611초는개발속도비교근거가아니다.

## 비용 계산과 집계 정정

[실행전저장한공식단가](../../benchmark-runs/d087-codex-20261016-01/captured-rates.json), [OpenAI공식가격](https://developers.openai.com/api/docs/pricing)을 기준으로 Codex short-standard 요청프로필가정값은 `((547858-9728)*4 + 9728*0.4 + 80156*20)/1000000 = 3.7595312`다. 실제모델정체·서비스tier·요청별문맥가격대·별도cache-write과금을확인하지못했으므로검증된총API비용이아니며, 해당값과실제월정액배분값은null로남긴다. long-standard가정은$6.7175024이고이두수치를실제비용범위로해석하지않는다.

Jev참고값은실제전송2회입력74,665 × 기존manifest환산정책$0.60/M = $0.044799다. native result는이값을기록했으나원래자동postprocessor는전송전차단된세번째receipt까지usage를요구해Jev비용을null로표시했다. **집계기결함**으로기록하고기존final-analysis.json은덮지않았다. 이번 [대조집계](../../benchmark-runs/d087-codex-20261016-01/result-audit.json)에서실제전송경계를기준으로정정했다. 비용단위를바꾸거나실제구독청구로승격하지않는다.

## 근거와 재현

- [대조집계](../../benchmark-runs/d087-codex-20261016-01/result-audit.json): 결과파일SHA·공개caseID·revision·독립후보연결,POST/차단구분,비용산술.
- [Codex원본결과](../../benchmark-runs/d087-codex-20261016-01/pair/codex/result.json), [공개실행원문](../../benchmark-runs/d087-codex-20261016-01/pair/codex/execution.json), [독립검사](../../benchmark-runs/d087-codex-20261016-01/pair/codex/grade-summary.json).
- [Jev차단원문](../../benchmark-runs/d087-codex-20261016-01/pair/jev/calls/jev-0003.token-admission.json), [Jev원본결과](../../benchmark-runs/d087-codex-20261016-01/pair/jev/result.json).
- 집계재현: `node benchmark-runs/d087-codex-20261016-01/audit-results.mjs --out result-audit-new.json` (새결과파일만허용하므로이미존재하면덮어쓰기를거부한다). 원시집계재조회: `node bin/codex-e2e.mjs compare --left benchmark-runs/d087-codex-20261016-01/pair/codex --right benchmark-runs/d087-codex-20261016-01/pair/jev`.

원래결과파일과종료상태는보존했다. 장부pending0/blockednull을확인했으며이번조회에서추가모델호출·재실행은없다. 실행직후 [보존검사](../../benchmark-runs/d087-codex-20261016-01/preservation-after-final-v2.json)는명시제외한liveledger·.DS_Store이외기존45,022파일변경0이다. [collector](../../benchmark-runs/d087-codex-20261016-01/collector-result.json)는동결source변경0과임시CLI HOME제거를확인했다. 독립검사용컨테이너제거도확인됐다. 새소스·문서와원시실행기록은로컬에남아있으며미커밋이다. 다음재측정전에는Jev입력허용모델정본과정산모델정본을같이검증해야한다.
