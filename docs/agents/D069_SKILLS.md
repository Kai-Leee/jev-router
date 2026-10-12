# D069 — assertion·산출물 수리·토큰 사전검사의 기록 적용

2026-10-11 KST. [D069 역할 계약](D069_PARALLEL.md)의 기존 단일 `skills` 담당이 이어 맡는다. [D068 종료 기록](D068_SKILLS.md)과 [유지보수 목록](../skills/MAINTENANCE.md)을 보존한다. 아래 사전 기록에 이어 **21:12 KST 종료 근거 적용**을 추가했다. 새 개발은 공개 85/85·독립 63/63으로 완료됐지만 수리 판단·작업자는 0이므로 실제 산출물 수리·재호출 절감은 미측정이다.

## 목적·승인·소유권

최신 역할 계약은 assertion 단위 책임 연결, 산출물 단위 수리 입력, 모델 입력 한도 사전검사를 병렬 개발한 뒤 새 `jev_all` 한 조건을 실행하도록 정한다. 기존 D067/D068 원본은 바꾸지 않는다. root가 실제 공급자·장부·Docker·채점·모니터·결과를 소유한다. 이 역할의 쓰기 범위는 D069 역할 기록, 기존 MAINTENANCE와 record-contract reference이며 D068 역할 기록은 필요할 때만 이력을 보존해 보완한다.

[jev-skill-maintenance](../../skills/jev-skill-maintenance/SKILL.md)와 [jev-decision-records](../../skills/jev-decision-records/SKILL.md)를 계속 적용한다. 새 스킬·helper·schema·테스트·전역 설치를 추가하지 않는다. 생산 소스와 질문/실행 API는 각 구현 담당의 문서가 정본이다.

## 기존 지침과 확인할 공백

- **Assertion 책임:** D068은 요구사항 coverage 소유자와 실패 assertion의 원인 소유자를 구분한다. D069에서는 실제 assertion→산출물/revision→담당자 연결 근거와 mapping 버전, 누락·오래된 근거·미도달 상태의 fallback까지 기록할 수 있는지 확인한다. 소유권 자체를 결함 원인의 증명으로 취급하지 않는다.
- **실제 수리 범위:** 현재 지침은 후보·선택·실제 작업자와 전체 공개 재검사를 구분한다. 산출물 단위 수리에서는 선택 산출물·허용 쓰기·실제 변경·변경 없이 상속한 바이트/해시가 연결돼야 한다. 작은 후보나 선택 작업자 수만으로 재호출·시간·비용 절감을 주장하지 않는다.
- **토큰 사전검사:** 기존 bytes/tokens 분리와 미확인 usage 보존은 충분하다. 정확 계수 여부는 공식 근거와 모델/버전·토크나이저·framing·계수 범위가 맞는지에 달려 있다. 공식 정확 counter의 존재를 가정하지 않으며 추정치·정당화된 상한·공급자 사용량·과금 입력을 같은 수치로 취급하지 않는다. 로컬 admit은 실제 공급자 수락과 별도다.

위 세 항목을 초기 검토 후보로 두었다. 구체 필드와 한도를 이 문서가 발명하지 않는다. 이미 다루는 완료 조건, 실패/정산, 동시성, 모니터 입력 경계는 중복 규칙으로 늘리지 않는다.

## 진행·검증 계획

assertion, artifact-repair, token-admission 담당에게 실제 계약·검증 근거 경로를 요청했다. 최종 API와 공식 출처의 확인 수준이 도착하면 기존 reference의 수리 범위·입력 크기 항목 안에서 필요한 문장만 보완한다. 저장된 D068 실패 사례에 적용해 판단 차이를 확인하되 재전송·후보 수정·숨김 검사 열람은 하지 않는다.

reference를 바꾸면 기존 `quick_validate.py`, read-only inventory와 지정 파일 `git diff --check`만 실행한다. 스킬 구조 검사는 host discovery/invocation, 구현 성공, 실제 수리 효과를 입증하지 않는다. 설치 사본은 자동으로 갱신하지 않으며 최종 inventory로 차이와 미검증 범위를 다시 기록한다.

다음 trigger는 세 구현 담당의 API/근거 확정이다. 실제 실행 결과가 도착하면 root의 별도 요청에 따라 같은 기록을 이어 갱신한다. 지금은 새 유료 실행·Docker·원장·전역 설치·커밋/푸시를 수행하지 않았다.

## 2026-10-11 19:39 KST — 사전 지침 최소 보완

[assertion 담당](D069_ASSERTIONS.md)과 [산출물 수리 담당](D069_REPAIR.md)의 초기 API 문서를 읽었다. assertion 계약은 고정 ID·계약 hash·runtime/artifact binding, passed/failed/not_reached와 명시적 case fallback을 계획한다. `artifact_paths`는 공개 인터페이스·책임에 따른 후보이며 원인 확정이 아니다. 수리 계약은 선택 output 쓰기와 이전 snapshot의 나머지 바이트 상속, 전체 공개 재검사를 계획한다. 두 문서는 이 시점에 구현·검증 전/중이며 완료 근거로 취급하지 않았다.

토큰 담당은 조사한 공식 문서/SDK에서 정확 counter·tokenizer/framing 근거를 발견하지 못했다고 전달했다. 이는 그 조사 범위의 미발견이며 서비스 전체에서 절대 제공하지 않는다는 증명은 아니다. 현재 제안의 byte 기반 휴리스틱·여유는 설계 추정치이고 정확 계수나 입증된 상한이 아니다. 공식 조사·최종 API·실제 검증 기록은 [토큰 담당 문서](D069_TOKENS.md)가 정본이며 이 역할이 외부 문서를 독립 재조사한 것으로 쓰지 않는다.

[기존 reference](../../skills/jev-decision-records/references/record-contract.md#artifact-dag-evidence)의 **수리 범위**와 **입력 크기** 두 항목 안에서만 보완했다.

- assertion ID와 검사/mapping 버전·산출물 revision의 연결, 누락·stale 근거의 명시적 fallback, 허용 쓰기와 실제 변경, 그대로 상속한 바이트 pin을 기록한다.
- 한도와 계수 범위·모델/버전·토크나이저·framing·출처를 기록한다. 정확 preflight count, 추정, 증명된 상한, 관측/과금 사용량을 구분한다. 과거 aggregate usage에 추정값이 들어맞아도 개별 질문의 문맥 적합성이 입증되지 않는다. 로컬 통과는 provider 수락 보장이 아니며 전송 전 차단의 미관측 usage를 0으로 바꾸지 않는다.

이 문구는 공통 증거 규칙이다. 아직 정하지 않은 JSON 필드·임계값·실행 정책을 스킬에서 강제하지 않는다. 기존 top-level record schema·도구·invocation 정책과 설치 사본은 변경하지 않았다.

### 저장 사례에 대한 수동 적용

1. D068의 [범위 감사](../../benchmark-runs/d068-scope-live-failure-01.json)에서 case 1개→요구사항 9개→후보 3명/4명은 coverage와 후보 규모만 입증한다. 새 규칙에 따르면 더 작은 산출물이 원인과 연결됐다는 주장은 실제 assertion/mapping/revision 근거가 필요하다. 이 역할은 누락 정보를 임의로 보충하거나 기존 후보를 바꾸지 않았다.
2. 같은 실행의 선택 수리·수리 작업자 0은 이미 기존 지침으로 성과 주장이 배제된다. D069의 산출물 상속은 새 구현이 제출할 바이트/해시 검증이 있어야 하며 계획 문구만으로 확인하지 않는다.
3. [D068 투영 감사](../../benchmark-runs/d068-projection-live-failure-01.json)의 실제 97,071B 요청과 HTTP 입력 한도 실패에는 정확 모델 입력 토큰이 없다. byte 휴리스틱이나 과거 성공 요청의 aggregate usage를 붙여 그 빈 값을 정확 계수로 채우지 않는다. 로컬 사전검사 통과 후 실제 모델이 거절하는 경우도 별도 실패로 남겨야 한다.
4. 수리 없는 정상 완료와 일반 비용 기록은 새 수리 지침의 실측 사례가 아니다. 스킬 구조 통과·과거 사고 replay·새 생성 성공을 실제 수리 성공이나 스킬의 사용자 효율로 승격하지 않는다.

이는 기존 저장 근거와 설계 문서에 규칙을 적용한 수동 검토다. 새 제품 실행·오프라인 replay·독립 에이전트 행동·host 호출 검증을 수행하지 않았다.

### 검사·설치·다음 trigger

저장소 루트에서 다음 기존 명령만 사용한다. helper가 바뀌지 않아 helper 테스트·프로젝트 회귀를 반복하지 않는다.

```sh
python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/jev-decision-records
python3 skills/jev-skill-maintenance/scripts/inventory_skills.py \
  --source-root skills \
  --installed-root /Users/lee/.codex/skills \
  --installed-root /Users/lee/.agents/skills
git diff --check -- docs/agents/D069_SKILLS.md docs/skills/MAINTENANCE.md skills/jev-decision-records/references/record-contract.md
```

실제 구조 검사는 `Skill is valid!`, inventory와 지정한 3파일의 `git diff --check`는 exit 0이었다. records 원본 tree는 `2b0f08febdb28bf0ed13171edea1aaaa7102b24402bdfd011aadd333adc4f3ae`, reference SHA-256은 `ec61c8b47126e51f2f17586521f76e5f260289c7e1b4c4a34d839e7dec98d198`다. D068 최종 tree `9087a232…`/reference `7dd4cb5e…`는 이전 관측으로 보존한다. 원본 스킬 2개, maintenance tree `7445e650…`, Codex records 사본 `93710658…`, 기존 cache·검사기·schema·설치 부재 상태는 그대로다. Codex 사본과 원본은 `SKILL.md`·`references/record-contract.md`가 다르며 갱신하지 않았다. host discovery/invocation verified는 false로 남는다.

다음 trigger는 구현 계약·검증의 확정과 root의 실제 D069 근거 전달이다. 실제 제품·수리·효율 결과는 계속 미측정이며, 이 역할의 D069 수정은 D069_SKILLS·MAINTENANCE·기존 record-contract 3파일이다. D068 문서와 과거 실행 원본은 변경하지 않았다. 사전 문서 쓰기는 여기서 종료하고 새 근거가 오면 같은 담당이 이어 갱신한다.

## 2026-10-11 21:12 KST — 새 개발 완료와 수리 미측정의 분리

[분석 01](../../benchmark-runs/d069-analysis-01.json)의 새 개발·진단·독립 채점 집계와 [진단 03 결과](../../benchmark-runs/d069-admission-probe-03/result.json), [계획 구조 대조](../../benchmark-runs/d069-preflight/plan-equivalence.json)를 읽었다. 분석 01은 별도 모니터 종료 근거가 아직 포함되지 않은 시점의 저장 결과다. 모니터와 최종 전체 집계는 root가 별도로 기록한다. 이 역할은 기존 결과의 집계 필드를 대조했으며 새 모델/채점/원장/후보 실행이나 숨김 검사 상세 열람은 하지 않았다.

- **새 제품 완료:** `phases.fresh_development.arm`은 completed·completion=true이며 공개 85/85, 실패·미실행·unknown 0이다. 별도 독립 채점 요약은 63/63, failed/skip/pending/other 0으로 결합 완료 조건을 충족한다. 실제 Jev POST는 분해 45+관계 2=47, Claude 구현 호출은 10이다. 수리 decision·작업자·carry-forward·prepared worker·inheritance proof는 모두 0이다. 실제 산출물 수리나 재호출 감소가 검증됐다고 쓰지 않는다.
- **수치의 범위:** 새 arm 본체는 2,364,670.661541ms, cache 포함 5,809,782토큰, 공식 단가 환산 USD12.3604662다. 토큰 산식은 uncached input 897,513 + output 318,873 + cache creation 592,622 + cache read 4,000,774이며 cache의 5m/1h 분할을 다시 더하지 않는다. 사전 진단·보존 후보 재검사·독립 채점·모니터·공통 준비는 이 arm 수치와 구분한다. 실제 청구·월 구독 배분은 null이다.
- **진단 03:** 변경한 정확한 직렬화 질문 23,715B는 POST 1회로 수락됐고 보고 input 10,891/output 69, 공식 환산 USD0.0065346이었다. worker 0·자동 재시도 0이며 실제 수리 완료가 아니다. 이는 해당 요청의 수락 관측 1회다. 사전 exact model tokens는 null이고, 이후 질문·24,000B 운영 상한의 보편적 수락 보장으로 확대하지 않는다.
- **과거와의 비교:** 저장 대조의 plan·leaves·artifactBindings·catalog는 D068과 구조가 일치한다. 해당 근거는 `Exact structure equality only`라고 명시하며 새 작업자의 생성 바이트·cache·공급자 시간까지 같다고 하지 않는다. 기존 D068 실패를 이번 성공으로 덮지 않으며, D067 네 조건 병렬과 현재 단일 조건·조건당 1회·변경된 checker metadata와 수리 scaffolding 차이 때문에 수정의 인과적 효율 효과를 단정하지 않는다.

v1의 70,510B 오허용, 진단 01·02의 잘못된 고정 성공 문구, 진단 02의 미확인 usage와 별도 0청구 정산은 [MAINTENANCE의 20:13 기록](../skills/MAINTENANCE.md#2026-10-11-2013-kst--실제-사전검사-반증과-잘못된-성공-문구의-정정)에 그대로 보존한다. 분석 01의 전체 활동량은 실패 진단의 usage와 당시 모니터 근거가 미완결이므로 새 arm의 정확한 합계를 전체 개발 활동의 완결 합계로 바꾸지 않는다.

후속 [분석 02](../../benchmark-runs/d069-analysis-02.json)는 완료된 모니터를 포함하며 새 arm의 완료·시간·토큰·비용은 분석 01과 같다. 모니터는 31,291.095583ms·8,674토큰·공식 환산 USD0.106932, assessment=attention이다. [root의 모니터 검토](../../benchmark-runs/d069-preflight/monitor-review-01.json)는 질문 기준 추정 9,972와 요청 전체 보고 input 10,891을 비교한 “9.2% 과소계수” 주장을 **계수 범위 불일치**로 기각했다. 원본 응답은 보존했고 실제 사전 토큰은 null이다. 이 정정도 기존 입력 범위·리뷰 입력 지침으로 충분하며 별도 규칙이 필요하지 않다.

계획 파일은 root의 추가 확인 후 이 역할도 두 원본 `planning.json` 바이트를 읽어 해시를 대조했다. D068/D069 모두 186,971B, SHA-256 `46d88084c6c77a6d4b2e5c9fff7e55bde5254e6777074c25fbf7f449f0c2d7d3`였다. 따라서 **계획 파일 바이트 동일**까지 확인된다. 위 구조 대조만으로 한 최초 해석은 이 추가 바이트 근거와 구분하며 worker 출력·cache·공급자 시간의 동일성을 뜻하지 않는 한계는 유지한다.

이번 결과는 기존 record-contract의 완료 조건·수리 없는 생성·요청별 수락·비교/계수 경계로 충분히 설명된다. 새 규칙이나 스킬을 추가하지 않고 D069_SKILLS와 MAINTENANCE만 갱신했다. 동결된 D069_EXPERIMENT/PARALLEL/OPUS_MONITOR, 생산 소스·계약·후보·실행 원본·장부·설치 사본은 수정하지 않았다. 다음 trigger는 실제 수리 경로 실행 근거 또는 새 관측의 전달이며 모니터의 후속 실험 제안을 자동 실행하지 않는다.

기존 구조 검사 결과는 `Skill is valid!`, inventory와 소유 문서 `git diff --check`는 exit 0이다. 두 문서가 미추적 파일이므로 각각 `git diff --no-index --check /dev/null <문서>`도 확인했다. 각 exit 1은 신규 파일 내용 차이이며 공백 오류 진단 출력은 없었다. records tree `157d7f3f…`와 reference `5222b8c8…`는 20:13 관측과 그대로이며 새 reference 수정은 없다. 원본 스킬 2개, maintenance tree `7445e650…`, Codex records 사본 `93710658…`, cache·검사기·schema·설치 부재 상태도 같다. 실제 호스트 발견/호출과 스킬 효과는 미검증이다. 소유 문서의 마지막 diff 검사를 마쳤으며 쓰기를 종료한다.
