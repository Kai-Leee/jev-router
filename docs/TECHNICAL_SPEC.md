# 현재 추가 경로 — D073 (2026-10-12)

[결과·제한](orchestration/D073_RESULTS.md) · [결정](decisions/D073.md). manifest v8/v9는 공개 실패마다 기존 artifact 또는 unknown을 묻고 controller가 기존 담당·쓰기경로를 파생한다. 질문 정본은 `adaptive-inferred-repair.v1.json`/`.v2.json`, 구현은 `adaptive-inferred-repair.mjs`와 `adaptive-inferred-repair-projection.mjs`다. 실패·revision·질문·답·권한 proof를 검사하고 수리 범위·모델/effort·실제 작업자를 연결한다. 담당 추론은 결함 위치의 확정 증명이 아니다.

입력v4는 로컬32k/64k추정과 repair/profile proxy byte 정책을 비차단관측으로 바꾸며 공식256,000B·schema·모델제한은 유지한다.64초과질문은 명시중단하고 자동분할은 미구현이다. CLI기본v3/과거버전은 유지한다. 최신 실제수리는 공개91/93·독립61/63으로 미완료이며 round2 ownerHTTP400과 A10무변경수리가 남았다.

단일입력은 `node scripts/validate-jev-input.mjs --request <json> --stage repair_owners --policy v4 --out <새파일>`로 검사한다. 사후 전체실행 감사는 knownHTTP400 분류와 실패 destination/model 기록이 누락돼 별도진단이 필요하다. 입력통과·서버수락·제품완료를 구분한다.

# 이전 추가 검사 — D072 (2026-10-12)

[입력 검사 CLI](../scripts/validate-jev-input.mjs) · [사용법과 근거](orchestration/D072_INPUT_VALIDATION.md). 기존 adapter/v3 전송 직전 admission을 별도 오프라인 명령으로 재사용한다. 필수 controller stage, 실제 JSON 바이트, 추정 토큰, 내부 repair48,000B, 요청/정책 해시와 과거 목적지 영수증을 분리한다. API/장부 접근 없이 검사하며, 정확토큰/의미충분성/제품완료를 보장하지 않는다. 종료코드0추정통과/2입력차단/1불완전감사, 결과파일덮어쓰기금지다. D071실제실행정책과 상한은 변경하지 않았다.

# 현재 추가 경로 — D071 (2026-10-12)

[구현](orchestration/D071_IMPLEMENTATION.md) · [실측](orchestration/D071_RESULTS.md) · [결정](decisions/D071.md). manifest v7의 opt-in 경로는 공개93 gate, producer→IR→renderer 수리 후보와 해시가 고정된 읽기 참조, 읽을 수 있는 수리 JSON/v3 입력 추정, Jev의 작업별 모델·effort 선택을 연결한다. 선택 ID→실제 CLI 인자→응답 identity까지 기록한다. 20개 허용 profile과 실제 실행된 Opus4/Sonnet6 medium을 구분한다.

새 세 조건 중 Claude만93/93·63/63 완료이며 Jev 고정은 독립60/63, Jev 프로필은 공개67/93·독립49/63 및 수리 입력 사전 차단이다. 보존 후보의 producer1파일 수리는93/93·63/63으로 성공했다. 미지원18개 assertion의 광범위 fallback, 전체 후보 문맥 합집합, 같은 DAG에서의 effort 효율 비교는 남은 일이다. 소스 동결/원본 감사 뒤 문서만 종료 갱신했다. 아래 미구현/효율 문구는 각 과거 실험 당시의 기록이다.

# 이전 추가 경로 — D070 (2026-10-11)

[구현](orchestration/D070_IMPLEMENTATION.md) · [실측](orchestration/D070_RESULTS.md) · [품질 회귀](orchestration/D070_QUALITY_REVIEW.md) · [결정](decisions/D070.md). manifest v6의 opt-in balanced-v2가 부담 상한·균형 membership·과대leaf 추가 분해를 실행한다. 별도 preserved-artifact-repair runner는 원본을 보존하고 실패 재현 뒤 선택 산출물만 실제 수리한다. 기존 adaptive execution loop는 유지했다.

A는기존148개검사에서시간·비용개선이나추가설명문진단0/8로동일품질목표미달, B실제1worker수리는성공이다. 원인값의producer→IR→renderer를수리후보·읽기범위에포함하는후속정책은미구현이다. 아래는과거설계와관측을보존한기록이다.

# 현재 추가 경로 — D069 (2026-10-11)

[구현과 구조](orchestration/D069_IMPLEMENTATION.md), [결과](orchestration/D069_RESULTS.md), [결정](decisions/D069.md)이 최신 진입점이다. assertion→산출물→현재담당 연결, 선택 write scope와 revision 상속, v2 압축 수리 입력, stage/요청SHA/24,000B repair 전송량 사전검사를 manifest v5로 연결했다. 지원 assertion은4개이며 미매핑 fallback을 유지한다. exact tokenizer가 없어 모델문맥 수락은 보장하지 않는다.

새 Jev전체는공개85/85·독립63/63완료,39분24.671초/5,809,782캐시포함토큰/환산$12.3604662다. 실제수리0회이므로수리호출절감은미측정이다. 아래D067은과거설계·결과이며현재미구현상태를규정하지않는다.

# 현재 추가 경로 — D067 (2026-10-11)

[D067 프로토콜](orchestration/D067_EXPERIMENT.md), [역할](agents/D067_PARALLEL.md), [결정](decisions/D067.md)이 현재 진입점이다. 최신 사용자 승인으로 조건별·누적 입력 토큰 상한을 명시적 null의 v3 정책으로 해제하고 새 네 조건을 병렬 실행한다. 기존 장부 ID/이력과 D066 원본은 보존한다. 검증된 공통 catalog 재사용의 신규 지출은 0이며 과거 준비비 귀속은 별도다. 구현·검증·실제 실행 상태는 [STATE](agents/STATE.md)에서 갱신한다. 아래 D066은 이전 순차 실험의 기록이다.

[D067 실측](orchestration/D067_RESULTS.md): 네 조건 종료, 결합완료3/4다. Jev 분해와 분해·관계는 동일Claude기준선보다시간28.7369%/21.8353%,환산비용53.3249%/58.5214%감소했다(각1회). 전체Jev는공개83/85뒤수리요청HTTP400입력한도실패,답변/수리작업0이다. 독립63/63만으로제품완료를선언하지않는다. 다음수정은수리상태투영과실패/사용량/정산상태분리, 미실행검사기반과도한수리범위다. 이 미완료항목은 구현된 것으로 취급하지 않는다.

# 이전 추가 경로 — D066 (2026-10-11)

[D066 실측 결과](orchestration/D066_RESULTS.md), [프로토콜](orchestration/D066_EXPERIMENT.md), [실행 연결](orchestration/D066_IMPLEMENTATION.md), [역할](agents/D066_PARALLEL.md)이 최신 진입점이다. 공통 후보 21단위·22산출물·38파일에서 4조건을 실제 실행했다. Claude 조건은 6개 잎·실제 관계·공개 수리 1회 뒤 공개 85/85·독립 63/63을 통과했다. Jev 3조건은 각각 입력 650,271과 다음 예약 65,536이 조건별 700,000을 넘어서 분해 중단됐다. 누적 장부에는 415,445토큰이 남으며 실제 Jev 관계·수리 효과와 완료 속도 절감은 미측정이다. 아래 D065는 보존된 과거 단일 조건이다.

# 현재 구현과 개발 계획 — D065 (2026-10-11)

[D065 실제 연결 구현](orchestration/D065_IMPLEMENTATION.md)과 [실측 결과·정정](orchestration/D065_RESULTS.md)이 현재 진입점이다. 공개85개 검사, 파일/환경/버전 런타임, 분할·관계·프로필·수리의 제한된 의미 핸들러와 실제 Jev/Claude 실행기를 연결했다. 단일 시도의 Jev17회·Claude16회는16개 파일을 만들었지만 공개 생성 코드 문법 오류로 제품 완료에 실패했고, 별도 독립 채점은62/63 통과다. 검증기 자체의 실패 처리와 설치 위치 검사 결함은 원본을 보존한 뒤 별도 수정·검증했다. 실제 관계 판단 호출·자유 재귀 분해·성공 조건을 맞춘 효율 비교는 미측정이다. 현재 상태는 [STATE](agents/STATE.md), 스킬은 [단일 관리 역할과 목록](skills/MAINTENANCE.md)을 따른다. 아래 D064와 초기 명세의 미연결 문구는 해당 작성 시점의 기록이다.

# Jev Router 기술 명세 초안

버전: 0.1-draft · 갱신일: 2026-10-09 (Asia/Seoul).
상태: 사용자 합의를 반영한 설계 문서. 연결 모듈과 오프라인 평가 계산/CLI를 구현했다.
질문 생성·실제 모델 비교 실행은 미검증이다. D-014의 후보 선택→격리 실행 gate/runner와
두 benchmark 준비·무과금 검증은 [현재 구현](../benchmarks/README.md)에 기록한다.
요구 근거는 [결정 기록](DECISIONS.md), 실행 근거는 [검증 기록](../VERIFICATION.md)에 둔다.

D-017 구현: [사용량 대시보드](DASHBOARD.md)와 [표시 계약](DASHBOARD_CONTRACT.md).
Jev 전송 경계, Claude 스트림·최종 토큰, 단위별 비용과 관측 완전성을 표시한다.
화면 검증은 합성/무모델 대조 기록으로 수행했으며 실제 모델 비교 실험은 미실행이다.

D-019: [개발 연결과 독립 Opus 모니터](PAIRED_RUN.md)를 구현했다. D-018의 도구/gate/runner 종료
기록 보완, heartbeat, SSE snapshot을 로컬 검증했다. OTel·독립 supervisor는 미구현이다.
사용자가 호출 횟수 상한을 해제했으므로 명시적 null을 무제한으로 처리한다. 실제 호출은 자동 승인
심사가 Jev 금액 지출 승인을 별도로 요구해 아직 시작되지 않았다. 화면 연결은 실행 정상의 증거가 아니다.

## 1. 목적과 현재 실행 범위

Jev Router는 메인 에이전트가 수행하는 작업의 모델 선택과 중간 판단을 지원한다 [D-001, D-002].
메인 세션이 목표를 유지하고 다음 행동을 수행한다. 질문 생성 역할은 목표·상태·근거를 Jev가
판단할 수 있는 요청으로 변환하고 결과를 기록한다. 반환값은 실행 권한이나 테스트 통과의 증거가 아니다.

현재는 한 세션에서 처리한다 [D-003]. 새 세션을 판단마다 생성하거나, 고정 시간 대기 후
결과 파일을 읽는 장치를 구현하지 않는다. API/CLI가 종료되면 응답·실패 여부를 확인한다.
같은 세션이어도 통신 실패와 판단 불가는 구분한다.

```text
메인 작업의 판단 지점
→ 목표·근거·필요한 출력 확인
→ 후보 구성(필요한 경우)
→ 영어 질문 구성 및 API 입력 검증
→ Jev 호출
→ 응답 검증·판단 상태·사용량 기록
→ 메인 세션의 후속 행동
→ [검증 전 제안] 필요한 시점에 handoff 후 새 세션
```

로드 밸런싱은 원래 구상의 확장 대상이다. 실제 다중 실행자 스케줄링·부하 정책은 아직
설계하지 않았으며, 현재 질문 생성·판단 검증을 위한 필수 전제로 만들지 않는다.

## 2. 책임 경계

- 사용자/메인 세션: 작업 목표, 지켜야 할 제약, 사용할 수 있는 근거·도구, 후속 행동을 관리한다.
- 질문 생성 역할: 판단 종류 확인, 후보 구성, 영어 질문·기준·판단 불가 조건 작성, 누락 발견을 담당한다.
- 결정론적 코드: 형식·한도·허용 후보 확인, 요청 전송, 결과 검증, 기록을 담당한다.
- Jev: 전달된 상태와 질문에 대해 typed decision을 반환한다.
- 평가 절차: 이후 확보한 정답·루브릭·실행 결과로 판단의 유용성을 별도로 평가한다.

질문 생성 역할을 현재 세션의 스킬로 둘지, 특정 모델로 실행할지, 별도 프로세스로 둘지는
현재 세션 정책을 바꾸지 않는 범위에서 추후 결정한다. 질문 생성도 모델 판단 비용에 포함한다.

## 3. 답의 형태, 선택 기준, 평가 방법

서로 다른 계약이다 [D-005]. 답을 명확히 한다는 이유로 모든 작업에 정답 하나를 만들지 않는다.

| 판단 종류 | 필요한 출력 | 선택/판정 기준 | 평가 근거와 한계 |
|---|---|---|---|
| 모델 선택 | 후보 ID 또는 보류 | 필요한 능력·도구·제약·정해진 우선순위 | 동일 작업의 실행 결과; 관측 안 한 후보의 성능은 미확인 |
| 분류 | 단일/복수 라벨 또는 미분류 | 라벨 정의·중복 허용 여부 | 라벨이 있으면 분류 지표; 단일 choice가 복수 라벨을 대체하지 않음 |
| 근거 판정 | 지지/반박/근거 부족 | 지정된 주장과 근거 범위 | 원문 대조; 근거 내 지지와 외부 세계의 참은 별개 |
| 순위 | 전체/부분 순위·동률·비교 불가 | 공통 비교 축과 알려진 선호 | 쌍별 선호·과업 효용·순위 지표; 유일한 정답을 전제하지 않음 |
| 완성도/다음 단계 | 충족 상태·후보 행동·보류 | 요구사항·검증 결과·선행 조건 | 실제 검사와 이후 결과; 모델의 점수가 테스트 실행을 대체하지 않음 |
| 예측 | 사건 확률 또는 판단 불가 | 사건 정의·기간·사용 가능한 관측 | 나중에 관측한 결과와 보정 평가; 원천 데이터 없는 예측은 검증 곤란 |

단순 계산이나 명시 규칙으로 답이 정해지는 경우에는 코드를 사용할 수 있다. 어느 판단을
Jev에 보낼지 자동으로 연결하는 모드를 기본으로 한다 [D-010]. 구체적인 판단 지점과 빈도는
평가로 조정한다. 모든 동작에 모델 호출을 추가하는 정책을 확정하지 않는다.

### 자동 호출의 초기 실험 정책 / 제안

- 모델 선택이 필요하거나, 작업 진행 중 명시적인 선택·분류·근거 판정·순위·완성도/다음 단계·예측
  결과가 필요할 때 질문 생성 흐름으로 연결한다. 실제 트리거의 탐지 방식은 프로토타입에서 검증한다.
- 같은 작업 상태·질문 형식·후보 집합에서 동일 판단을 반복 요청하지 않도록 입력 버전을 기록한다.
  이는 로컬 중복 방지 제안이며 공급자 API의 idempotency 지원이나 장애 시 정확히 한 번 실행을 보장하지 않는다.
- 질문 생성 중의 판단이 다시 같은 자동 호출을 유발하는 재귀를 막는 범위를 둔다.
- 질문·근거 준비가 안 됐으면 준비 부족을 기록한다. 부족을 숨기기 위해 자동 재질문을 계속하지 않는다.
- 호출당 결과와 사용량을 기록하고, 생략한 호출의 사유도 평가 자료에 남긴다.
- D-019는 호출 횟수 제한 없음을 확정했다. 구체적인 호출 빈도는 평가로 조정한다.
  운영 deadline과 불확실성 정지는 유지하며, 현재 실제 실행의 금액 승인은 자동 심사에서 별도로 요구됐다.

## 4. 질문 생성 입력 계약 / 제안 P-001

아래 항목은 내부 작업 명세다. Jev HTTP 최상위 필드에 그대로 추가하지 않는다.

- `decision_id`, `input_revision`: 판단과 입력 버전 식별.
- `purpose`: 이 판단이 필요한 이유와 결과 사용 위치.
- `decision_kind`: 모델 선택·분류·근거 판정·순위·완성도·다음 단계·예측.
- `state`: 관련 사실과 현재 작업 상태. 추측·선호를 확인 사실과 분리.
- `evidence_refs`: 원본 파일/문서 위치, 필요한 발췌, 가능한 버전/해시.
- `constraints`: 실행 가능 범위·필수 요건·이미 정해진 예산. 미정인 값을 만들어 채우지 않음.
- `candidates`: 제공 후보가 있는 경우의 ID·설명·출처·능력 근거.
- `answer_contract`: 단일/복수 선택, 점수, 부분 순위 등 필요한 출력 형태.
- `selection_policy`: 알려진 비교 기준·우선순위. 정해지지 않은 가중치는 `null`.
- `abstain_conditions`: 정보 부족, 적합한 후보 없음, 기준 충돌, 비교 불가 등의 조건.
- `template_ref`: 재사용 질문의 ID·버전 또는 신규 설계임을 표시.

API payload는 현재 클라이언트가 지원하는 `model`, `state`, `questions`로 변환한다.
원본 경로만 Jev에 보내면 그 파일을 읽었다고 가정하지 않는다. 판단에 필요한 근거의 실제
내용을 state에 포함하고, 로컬 참조는 추적용으로 함께 보존한다.

영어 질문·기준·선택지 설명을 기본으로 한다 [D-006]. 고유명사·원문 인용·코드·수치는
원형을 유지하고 영어 설명을 덧붙이는 방식을 제안한다. 원문과 번역/요약은 구분한다.

질문 생성 시 한 번의 판단 목적을 좁힌다. 목적·제약이 모자라면 질문을 멋지게 만들어
감추지 않고 누락을 반환한다. 이미 답을 유도하는 후보 설명, 근거 없는 성능 수치,
후보 이름만으로 능력을 추정하는 질문은 평가 대상으로 표시한다.

질문 형식의 재사용과 판단 결과의 재사용은 다르다. 같은 형식을 쓰더라도 현재 상태와
근거를 새로 반영한다. 결과 캐시는 이번 초안의 확정 범위가 아니다.

## 5. 상황별 후보 구성 / 설계 위임 D-004, 제안 P-002

1. **제공 후보가 있음:** 의미와 출처를 유지하고 중복·제약 위반·정보 누락을 확인한다.
2. **모델·도구 선택인데 후보가 없음:** 등록된 실제 사용 가능 목록에서 후보를 가져온다.
   등록 목록에는 모델/도구 ID, 실행 방식, 지원 능력, 사용 가능 여부, 측정된 근거를 둔다.
   소개 문구와 실제 측정값을 구분하며 미측정 능력 점수를 지어내지 않는다.
3. **새 접근법을 찾아야 함:** 질문 생성 역할이 목표·근거를 바탕으로 후보 초안을 만든다.
   충분한 후보를 만들 수 없으면 자료 수집이나 사용자 확인이 필요하다고 반환한다.
4. **일부 후보만 있음:** 제공 후보를 보존하면서 추가 후보를 구별해 제안한다.

후보마다 `origin`을 `provided`, `catalog`, `proposed`로 기록한다. 후보 생성 시간·토큰도
비용에 포함한다. 후보 수의 임의 상한은 아직 정하지 않았다. API 한도에 걸리면 재구성한다.

명시적 필수 조건으로 배제한 사유를 남긴다. 후보가 없으면 `no_eligible_candidate`,
한 후보만 남아 형식적 분기만 필요하면 코드 처리 후보로 기록한다. 후보 하나의 적합성
검사가 필요한 경우는 별도 판단이다. 선택지가 없다고 목표나 제약을 임의 완화하지 않는다.

제공 후보 집합과 최종 평가 후보 집합이 달라진 경우 따로 기록한다. 후보 생성을 잘한 효과와
Jev가 선택을 잘한 효과를 분리해 평가할 수 있어야 한다.

## 6. Jev 질문으로 변환 / 제안

서비스가 제공하는 원시 질문 유형은 `choice`, `score`, `noul`이다. 내부 판단 종류와
동일한 개념이 아니며, 목적에 따라 조합한다. [Jev AI 문서](https://jev-ai.pro/docs)

- 단일 선택: 후보 ID와 영어 설명을 choice로 전달. 목적에 맞는 판단 불가 선택지를 포함할 수 있다.
- 복수 라벨: 라벨별 별도 판단을 구성하고 중복/상호배타 규칙을 코드로 검사하는 방식을 비교한다.
- 근거 판정: 같은 주장에 대한 지지/반박/불충분을 구분한다. 근거 불충분을 반박으로 처리하지 않는다.
- 점수: 각 단계의 의미를 정의한다. 점수와 confidence를 동일한 값으로 다루지 않는다.
- 순위: 같은 루브릭의 후보별 평가와 후보 간 직접 비교를 실험 후보로 둔다 [H-002].
  choice의 확률 순서를 곧바로 검증된 품질 순위로 사용하지 않는다. 동률·부분 순위와
  쌍별 비교의 순환을 표현하며, 비교 호출이 늘어나는 비용도 기록한다.
- noul/예측: 확률을 출력하더라도 근거 부족을 구별할 별도 질문 또는 입력 검사 정책이 필요하다.
  `0.5`나 낮은 confidence를 보편적인 판단 불가 값으로 고정하지 않는다.

여러 질문을 함께 보낼 때 뒤 질문이 앞 질문의 답을 읽는 것으로 가정하지 않는다.
후보의 유효성 판정 뒤에 남은 후보를 선택해야 하는 의존 관계는 코드 단계로 명시한다.
공통 확률 임계값, 공통 가중치, 자동 재질문 횟수는 미결정이다.

## 7. 결과와 기록 계약 / 제안 P-003

현재는 동기 실행이며 백그라운드 작업 큐는 필요하지 않다 [D-003]. 결과에서도 다음 축을 분리한다.

- `execution_status`: `not_called`, `completed`, `failed`, `unknown`.
- `decision_status`: `decided`, `abstained`, `not_evaluated`.
- `reason_code`: 정보 부족·후보 부재·기준 충돌·비교 불가·응답 오류 등의 사유, 해당 없으면 `null`.
- `answer`: 라벨/점수/순위/확률 등 answer_contract에 맞는 값. 없는 답은 `null`.
- `provider_answer`: 정규화 전 공급자 판단값을 보존할 필드. 인증 헤더는 저장하지 않음.
- `requested_model`, `resolved_model`, `template_ref`, `input_revision`: 실제 실행 재현에 필요한 식별자.
- `usage`, `billing`, `timing`: 사용량/청구 단위/질문 생성부터 기록까지의 단계별 측정. 모르는 값은 `null`.
- `main_session_disposition`: 채택/보류/수정/미결정 및 그 근거. 메인이 아직 읽지 않았으면 미결정.

`completed`는 전송과 응답 처리가 끝났다는 뜻이며 판단의 정답이나 작업 성공을 뜻하지 않는다.
`unknown`은 시간 초과·연결 단절 등 호출 결과가 불확실한 경우이며 자동 재전송하지 않는다.
판단 불가와 호출 실패는 서로 다른 후속 처리가 필요하다.

기록 위치 제안: 기존 ignore 대상인 `receipts/decisions/<decision_id>/` 아래에 요청·결과 JSON과
사람이 읽는 요약을 둔다. 이 디렉터리는 아직 생성하지 않았다. 구조화된 원본에서 요약을
만들고 질문/후보/확률을 설명문으로 바꾸며 덮어쓰지 않는다. 질문 작성자의 설명과 Jev가
직접 반환한 내용을 구분해 Jev가 하지 않은 설명을 붙이지 않는다.

현재 직접 클라이언트는 정규화된 응답과 일부 청구 헤더를 반환하고 원본 응답을 파일에 저장하지 않는다.
따라서 이 기록 계약은 기존 기능이 아니라 구현할 부분이다.

## 8. handoff와 문맥 보존 / 가설 H-001

사용자는 중요한 내용이 압축 중 빠지는 것을 우려하며, 판단 후 handoff와 새 세션 진행을
추천했다. 이는 검증을 전제로 한 제안이며 판단마다 자동 세션 전환을 하라는 확정 요구가 아니다.

handoff도 요약으로만 만들면 같은 손실이 생길 수 있다. 제안하는 인계 자료는 목표, 명시적 제약,
합의/기각 사유, 현재 파일·작업 상태, 남은 불확실성, 판단 요청·결과 참조, 다음 행동으로 구성한다.
짧은 설명과 별도로 원문 근거를 다시 읽을 수 있는 위치와 버전을 유지한다.

검증 조건:

- 같은 작업에서 현재 세션을 계속하는 조건과 인계 후 새 세션으로 진행하는 조건을 비교한다.
- 사전에 목록화한 필수 사실·제약의 보존, 모순·누락, 다음 행동의 적합성, 전체 시간·토큰을 측정한다.
- 인계 요약과 원문 다시 읽기의 효과를 구분한다. 새 세션이라는 사실만으로 우수하다고 판단하지 않는다.
- handoff를 제안할 시점과 실패 시 복원 방식, 호스트별 실행 방법은 미결정이다.

## 9. 평가 계획 / 오프라인 계산 구현, 실제 모델 평가 미실행

D-013의 목표·명세 기반 구현 실험은 [실행 가능성 조사](LIVE_EXPERIMENT_FEASIBILITY.md)에 기록한다.
Opus 5.5 구현 + Jev 구조화 판단, 기존 harness/benchmark, 독립 채점과 행동 연결 검증을
P-005로 제안했다. 이후 D-014에서 제한된 후보 선택 gate·Docker 실행·원시 journal·Claude
launch 코드를 구현하고 무과금 검증했다. 실제 Opus/Jev 유료 loop는 아직 실행하지 않았다.

기존 연구·실무의 방법과 지표별 분모·결측·비용 집계 제안은
[평가 방법 조사와 구현 제안](EVALUATION_RESEARCH.md)에 기록했다 [D-011].
조사 후 D-012에 따라 [입력 계약](EVALUATION_CONTRACT.md)과
[오프라인 평가 CLI](EVALUATION_USAGE.md)를 구현했다. 저장된 결과를 검증·재계산하며
실제 비교 모델을 실행하거나 원시 API 응답을 자동 수집하지는 않는다.

초기 비교는 같은 작업·근거·실행 후보·평가 기준을 사용한다.

- 기준: 메인 에이전트가 직접 판단.
- 조건 A: 같은 세션에서 정해진 형식으로 질문을 구성하고 에이전트가 직접 판단.
- 조건 B: 같은 질문을 Jev가 판단.
- 별도 실험: 후보 집합을 고정한 선택 평가와, 후보 생성부터 포함하는 전체 흐름 평가.
- 별도 실험: 신규 질문 작성과 검증된 형식 재사용의 비용·품질 비교.
- handoff 비교는 기본 판단 성능 비교와 분리한다.

질문 생성·후속 해석을 포함한 전체 벽시계 시간, 모든 모델의 입력/출력 토큰, 실제 제공되는
청구 단위, 재시도·실패·보류 비용을 기록한다. 서로 다른 모델의 토큰 수만으로 가격 우열을
주장하지 않는다. USD 비용이 없으면 미제공으로 유지한다.

답변된 건에서의 품질과 전체 요청 중 답변된 비율을 함께 보고한다. 판단 불가를 늘려
오답률만 낮춘 결과와 실제 유용성이 개선된 결과를 구별한다. 모델 선택은 이후 작업 성공률을,
근거 판정은 원문 대조를, 순위는 정해진 선호/효용을, 예측은 실제 관측과 보정을 평가한다.

임계값·질문을 조정한 데이터와 최종 평가 데이터를 분리한다. 반복 요청의 변동과 모델 버전도
기록한다. 첫 평가 작업군·표본·허용 품질 저하·예산은 O-003이며 수치를 임의로 정하지 않았다.

## 10. 남은 결정과 구현 순서

- O-001: 해결됨 → D-010. 자동 호출 기본; 구체 트리거와 빈도는 평가에서 조정.
- O-002: 결과 사용 정책. 형식·제약 검사 후 활용할 범위와 다시 확인할 조건. 매번 대형 모델이
  원래 판단을 반복하면 절감 효과가 사라질 수 있으므로 별도로 측정한다.
- O-003: 최초 평가 작업군과 품질·시간·비용의 우선순위.
- H-001: 판단 후 handoff의 실제 효과와 전환 시점.
- H-002: 목적별 순위 구성 방식과 비교 불가 처리.

제안 순서: 합의/계약 정리 → 대표 판단 예시와 질문 형식 작성 → 기존 CLI 연결 및 기록 확장 →
동일 조건 평가 → handoff 비교. 전체 적용 분야를 첫 실험 하나로 축소하는 결정은 아니다.
임계값 등 세부 정책이 미정이라는 이유만으로 명세·로컬 구현을 멈추거나 매번 사용자 승인을
요구하지 않는다. 다만 실제 사용자 작업의 우선순위와 지출 한도를 임의로 만들어 실행하지 않는다.

## 11. 기존 구현과의 차이

- 있음: Jev AI 직접 클라이언트, 요청/응답 검사, 비용 미제공 처리, MCP 실행 연결, 예제 CLI,
  오프라인 평가 입력 계약·상태/품질/비용/지연 계산·보고서 CLI. 상세 검증은 검증 기록 참조.
- 확인됨: 2026-10-08 이 채팅에서 직접/MCP 인증 모델 목록 조회, 모의 API를 포함한 22개 테스트 통과.
- 후속 구현됨: D-014의 제한된 후보 선택/보류 gate, 구조화 B/C 비교용 Claude/MCP/Docker runner,
  원시 입력·판단·행동 journal과 두 benchmark. 실제 paid loop는 아직 미검증이다.
- 미구현: 범용 판단 계약 수집, 후보 레지스트리, handoff 제품 기능, 다중 실행자 선택·로드 밸런싱.
- 평가 후속: 순위·Oracle regret·신뢰구간·작업군별 가중 비교·raw trace→평가 계약 변환.
- 미측정: Jev 추론 품질, 전체 비용·속도 개선, 영어 우위, 문맥 보존 개선.

외부 출처는 [Jev AI API 문서](https://jev-ai.pro/docs), 로컬 구현 근거는
[client.mjs](../src/client.mjs)이다.
API 문서는 2026-10-08 대화에서 읽은 요청/응답·오류 규칙을 사용했다. 로컬 설계 제안을
공급자 기능으로 표현하지 않는다.
# D-020 update: shared Jev monetary allowance

2026-10-09 user limit: Jev USD 1 for the current experiment; arbitrary decision count remains unlimited.
The provider returns token/credit units, not actual per-call USD. A shared durable token budget reserves
the maximum documented Jev context before dispatch, then verifies the receipt and settles paid tokens
at conservative USD 0.60/M. Unknown results retain reservations. Actual billed USD remains null.
The detailed policy, assumptions, process/module boundary and commands are in [PAIRED_RUN](PAIRED_RUN.md).
This update supersedes earlier unresolved monetary-approval status; it does not claim live execution success.

## D-021 현재 구현 보충 (2026-10-09)

D-019까지의 앞선 미실행 설명은 해당 시점 기록이다. 이후 실제 Opus/Jev 실행과 독립 모니터를
D-020에서 수행했다. 최신 실행 상태/실패 경계는 [STATE](agents/STATE.md),
[실패 분석](research/D020_FAILURE_ANALYSIS.md)을 따른다. 토큰별 공식 가격 환산은
[가격 계약](DASHBOARD_PRICING.md)과 독립 pricing 모듈로 구현하며 실행 예산 정책과 분리한다.

## D-024 판단 대체 구조

기존 benchmark act/finish 경로는 과거 비교조건으로 보존한다. 새로운 역할 규칙 생명주기는 `src/benchmark/agent-rules.mjs`에 분리한다:

1. Claude가 목표/근거/허용 도구를 받아 역할, 입력, 출력, 수락 기준, 에스컬레이션, 갱신 조건을 작성한다.
2. 프로그램이 형식·도구·작업경로·버전/해시를 검증한다.
3. Jev가 accept/revise/abstain을 결정한다. 승인만 현재 세션용 Claude 정의로 내보낼 수 있다.
4. 새로운 근거가 생기면 Jev가 keep/revise/abstain을 결정한다. keep이면 Claude 생성 호출은 없다. revise일 때 한 번 생성 후 다시 검증한다. 무한 자기수정 루프 없음.
5. 검증 중 또는 내보내기 전에 근거 해시가 바뀌면 이전 승인을 폐기한다. 독립 테스트의 성공은 Jev 판단과 별도다.

권한은 host가 실제 강제해야 한다. 규칙의 workspace 문구 자체는 샌드박스가 아니다. 초기 연결 검증은 tools=[] 역할로 제한한다. 전체 코딩 runner의 단계별 역할 라우팅과 E2E 효율 검증은 아직 별도 통합 단계다. 사용자 목표인 코드 생성 이전 선택/반복 Claude 판단 제거를 다음 E2E 조건으로 적용한다. 고정 질문 측정/실제 규칙 pilot의 재현 명령과 한계는 research/D024_DECISION_LATENCY.md 및 D024_AGENT_RULES.md를 참조한다.

## D-025 checkpoint-v1 선택형 실행

run config의 workflow='checkpoint-v1'에서 route(코드 없는 역할 후보)→act(선택 역할의 단일 명령, 추가모델없음)→finish를 사용한다. baseline/jev는 같은 schema와 완료 근거 수집을 공유하고 selected_id의 제공자만 다르다. 기존 workflow 생략 시 과거 gate 그대로다. 서버가 원 brief와 실제명령/출력/evidence_id를 판단에 전달한다. nonzero 명령은 role을해제한다. 동일 action_version 완료 재질문은 거부하지만 실제 artifact hash 기반 변경검사는 아니므로 아무 새 명령이든 version을 늘릴 수 있다. 역할 설명의 의미적 명령범위를 강제하는 보안정책이 아니며 Docker 경계가 권한을 강제한다.

이 pilot의 역할은 같은 Claude 세션의 작업범위이며 native subagent 생성과 동일하다고 표시하지 않는다. D024 실제 subagent 규칙 수명주기의 비용과 성능은 별도다. 측정과 판단 문서는 [D025](decisions/D025.md)와 jev-decision-records 스킬로 관리한다.


## D047 — 전체 작업 효율 우선 (2026-10-10)

사용자 정정: 현재 Jev 입력량은 허용 가능하며 전체 작업 효율을 우선한다. 입력 축소를 우선 과제로 삼지 말고 충분한 판단 근거를 유지한다. 기존 예산은 유지. 현재 D046은 초기 task_count만 Jev1회 호출하며 작업 중 실패·재분할·모델/effort·요구사항 판단은 미연결이다. D044 실패 근거도 D046 state에 전달되지 않았다. 감사: docs/orchestration/D047_DECISION_COVERAGE.md. 후속 연결 순서는 제안이며 이번에는 구현·유료 호출 없음.

## D048–D050 lifecycle runtime boundary

New comparison runner links initial numeric group selection, executable ready-batch selection, per-worker review and failure repair/stop. Scoped MCP writes persist artifacts independently from final text. Python/TOML preflight and continuation resume preserve confirmed provider outputs without paying to regenerate. Lossless string table preserves exact repeated decision text; byte cap remains256000 and never truncates unique evidence.

Actual run was exploratory: model/effort fixed, no recursive repartition. Claude unencoded continuation vs Jev encoded continuation is a transport confound. Both independent grades unresolved. Source AST success does not certify generated-client output. Historical HTTP status loss repaired only for future calls; outstanding budget reservation remains until reconciliation. Detailed measured results: docs/orchestration/D048_D050_LIFECYCLE_RESULTS.md.
## D056 current planning path — 2026-10-10

별도 재귀 계획 실행기, 영어 질문 v2, 작업·테스트 목록과 CLI는 [D056 구현](orchestration/D056_IMPLEMENTATION.md)을 따른다. [실제 결과](orchestration/D056_RESULTS.md)는 API 240회 성공과 계획 `partial`이다. 제품 작업자·테스트는 실행하지 않았다. Jev는 미리 준비한 출처 연결 단위를 선택·배정하며, 작업·테스트 문장을 자유 생성하지 않는다.

입력은 객체, JSON 문자열, 손실 없는 표 형태를 지원한다. 표 입력은 전송할 JSON을 실제로 복원해 원래 state와 비교한다. 미확정 의존 관계와 보수적인 수정 범위는 검증된 독립성을 뜻하지 않는다. 실행 이후 종료 코드와 모니터 지표 설명을 보완했으며 원래 실험 기록은 바꾸지 않았다.


## D057 — 실제 개발 완료 비교 (2026-10-10)

[결과](orchestration/D057_RESULTS.md), [결정](decisions/D057.md). 실제 A63/63완료29분28.518초, B62/63미완료(시도23분25.734초). Jev는 실제1회호출로1leaf/0split을 선택했다. 완료 속도 개선값은 null이며 병렬화 이득 미검증. API환산 A7.6330826/B8.4574292 USD, 실제 청구 unknown. 원본 후보/평가를 보존했고 유료 반복·커밋·푸시는 없다.

## D059 — 순차 멀티 선택 실행 경로

`src/orchestration/sequential-allocation.mjs`는2..5개수→잔여후보별include/exclude배치→마지막잔여→작업자별모델/노력도→의존DAG를구성한다. `src/benchmark/sequential-planning-runner.mjs`의손실없는codec/기존장부와 `scripts/sequential-e2e.mjs`의artifact전송/통합/공개검사/독립채점을연결했다. [실측과한계](orchestration/D059_RESULTS.md). 80/85특정fixture에서검증했으며singleton선택지edge·모니터상세근거전달은미해결이다.

## D060 — opt-in bounded verified workflow

[구조/계약/재현](orchestration/D060_BOUNDED_VERIFICATION.md). `runBoundedVerifiedWorkflow`는 공개검사 매핑사전검사→`allocateSequentialV2`→실행→revision-bound공개검증→후속해제를 연결한다. 기존 유료CLI자동교체 아님. 질문은contracts/sequential-allocation.v2.json, 실제85검사 구현·준비조건·유료adapter 연결 미완료.

## D061 최대작업자30

새v3allocator/envelope/workflow의선택상한30,동시성기본2. [진입점](orchestration/D061_MAX_WORKERS.md). 기존유료CLI는교체하지않았으며실제제품검사매핑이먼저필요하다.

## D065 실제 DAG 연결 경로

[현재 구현과 검증 수준](orchestration/D065_IMPLEMENTATION.md), [역할 계약](agents/D065_PARALLEL.md). 기존 DAG kernel에 실제 파일 staging/버전/환경/검사 binding을 추가하고 `dag-routing.v2.json` 선택을 보존 검사를 거친 계획 변경으로 연결한다. `src/benchmark/dag-runner.mjs`가 기존 Jev 계측·누적 예산과 제한된 Desktop Claude CLI/MCP 작업자를 연결한다. 역사적 runner 기본값은 교체하지 않는다.

현재 실험 경계는 출처가 있는16개 파일, 실제 Jev의 작업자 수/소유권 선택, 고정 Opus5.5 medium, 동시2다. 초기 파일 구문 준비 검사와 최종85개 의미 검사는 별개다. 관계 핸들러는 실제 artifact binding에 맞는 읽기 범위를 함께 갱신한다. 불확실 시도 자동 재개, 무제한 자유 작업 생성, 동일 조건 효율 비교 완료는 이 연결만으로 주장하지 않는다. 실제 상태는 D065 결과와 STATE를 따른다.
