# D066 — 기존 두 스킬의 재귀 실행 비교 적용

2026-10-11. 담당: D064부터 이어지는 `d064_skills` 1명.
상태: **종료 근거 적용·기록 스킬 참고 절 보완 완료. Jev 관계·수리·성공 완료 비교는 미측정**.
역할 정본: [D066_PARALLEL](D066_PARALLEL.md). 적용 스킬: [maintenance](../../skills/jev-skill-maintenance/SKILL.md), [decision-records](../../skills/jev-decision-records/SKILL.md)와 [기록 계약](../../skills/jev-decision-records/references/record-contract.md).

아래 사전 적용 기록은 01:37:51 KST 시점의 관측으로 보존한다. 당시의 원본 변경 0·결과 미측정은 그 시점에 한정하며, 실제 종료 후의 변경과 검증은 마지막 절에 추가했다.

## 사전 적용 판단과 변경 범위

현재 역할 계약, D065 종료 STATE·[결과](../orchestration/D065_RESULTS.md)·[결정](../decisions/D065.md), 기존 두 스킬과 유지보수 목록을 읽었다. D066은 실제 재귀 분해·관계 판단·공개 실패 후 수리·Claude 단독과의 비교를 요청한다. 각 단계의 권한·조건·실행 근거·비용·한계를 기록하는 책임은 기존 decision-records에 포함된다. maintenance는 이 책임이 이미 있다는 판단과 원본/사본 상태를 기록하는 데 적용했다.

관찰한 별도 지침 누락이 없어 스킬 원본·reference·helper·checker·테스트를 바꾸지 않았다. 새 스킬도 만들지 않았다. 이 역할의 변경은 이 문서와 [MAINTENANCE](../skills/MAINTENANCE.md)의 후속 기록뿐이다. 실행 계약은 역할·프로토콜·runner 정본에 두고 스킬 본문에 반복하지 않는다.

## 사전 D066 기록에 적용한 기존 책임

| 쟁점 | 기존 지침을 적용한 기록 내용 | 현재 근거 수준과 담당 |
|---|---|---|
| 새 실행 승인 범위 | 최신 요청이 승인한 새 D066 비교와 종료한 D065의 추가 실행 금지를 별도 시점으로 기록. 스킬 호출 자체가 실행 권한을 만드는 것으로 쓰지 않음 | [역할 계약](D066_PARALLEL.md)에 새 요청의 의미가 기록돼 있음. root가 실제 프로토콜·예산·실행을 소유 |
| 공통 catalog 준비 | 원래 공개 명세 입력, 준비 요청/응답과 시간·usage, 공유한 정확한 catalog 바이트 해시를 연결. D065 파일 배치를 새 Jev 분해 산출물로 표현하지 않음 | [runner의 준비 제안](D066_RUNNER.md#intended-interface-and-shared-preparation)에 포함. 실제 catalog와 영수증은 아직 이 역할이 확인하지 않음 |
| 공통 준비 비용의 비교 | 준비를 독립 역할로 보존하고 전체 비교에서 실제 발생한 비용을 한 번 집계. 조건별 전체 준비비 포함 값과 분배 값의 계산 기준·분모를 사전 고정. 두 값을 같은 청구 항목으로 더하지 않음 | runner는 전체/명시적 분배 회계를 제안했음. 정확한 계산·시간 경계는 root의 실행 전 프로토콜을 따르며 현재 수치는 미측정 |
| 판단이 실제 행동을 바꿨는지 | 동일 typed 질문 입력·엔진·선택 응답, 검증, 적용된 계획 전후 revision, 실제 구현/수리 attempt와 후보·검사·환경 revision을 연결 | [실행 담당 제안](D066_EXECUTION.md)에 round·operation·영수증 경계가 있음. 제안 상태이며 로컬 double이나 handler 이름을 provider 실행으로 승격하지 않음 |
| 실패와 완료의 비교 | 실패·미확정·배제 시도의 시간과 비용도 보존하고 성공 완료시간은 독립 제품 성공이 확인될 때만 측정. 조건·캐시·순서·정보 차이를 밝히고 일치하지 않는 결과에 개선율을 붙이지 않음 | D066 역할 계약이 같은 경계를 명시. 실제 네 조건 비교는 미측정 |

공통 준비를 모든 조건에 포함해 비교하는 수치와 전체 실험에서 한 번 발생한 청구 추정은 분모가 다르다. root에게 두 계산의 의미를 명시하고, 실패한 준비/판단/수리 시도 및 미확인 usage도 버리지 않도록 전달했다. 이는 새 예산 한도나 실험 조건을 이 문서에서 결정한 것이 아니다.

D065 말의 누적 장부 잔액은 과거 관측이다. D066 실행 전 현재 장부를 다시 읽는 책임은 root/runner에 있고 이 문서가 잔액을 새로 보증하지 않는다. 알려진 후보 실패에 대한 새 조건 안의 수리와 결과가 불확실한 외부 요청의 재전송도 별도 행동으로 기록한다.

## D065 실제 실패에 기존 규칙을 적용한 사례

이번에 [원본 실행 결과](../../benchmark-runs/d065-live-01/result.json)의 필요한 최상위 필드를 `jq`로 읽고, 별도 [독립 grade 요약](../../benchmark-runs/d065-live-01/grade/result.json)과 [종료 분석의 독립 채점 절](../../benchmark-runs/d065-live-01/terminal-analysis.json)을 대조했다. 숨김 검사 구현이나 개별 실패 내용을 열어 수리 자료로 사용하지 않았다.

- 원본 `d065-live-01`은 `mode: live`, `status: uncertain`, `stop_code: DAG_PUBLIC_EVIDENCE_INVALID`다. 시도 시간은 `wall_ms: 1196514.8854999999`, 원본 성공 완료시간과 제품 성공은 `null`이다.
- 원본에 있는 `independent_grade: not_run_root_owned`는 runner 종료 시점의 상태다. 이후 별도 grade는 `grading_status: completed`, `resolved: false`, `reward: 0`, 63개 중 62개 통과·1개 실패다. 원본 필드를 덮어쓰지 않고 후속 근거로 제품 실패를 설명한다.
- 종료 분석은 `product_success: false`, `successful_completion_wall_ms: null`을 유지한다. 따라서 약 1,196.515초를 성공 완료시간으로 쓰거나 Claude 단독보다 빠르다고 비교하지 않는다.
- 실패한 시도의 실제 기록에는 Jev 17회와 Claude 구현 16회, 각각 API 환산 `$0.137724`, `$9.634672799999999`가 남아 있다. 이 값은 당시 receipt를 읽은 값이며 실제 청구나 D066 비용 재측정이 아니다. 별도 모니터·채점 등 역할의 전체 합산은 D065 결과 정본을 따른다.

D065 이후의 보고서 분류 정정·무모델 재생·v3 공개 대조 검사는 [D065_RESULTS](../orchestration/D065_RESULTS.md)의 후속 기록이다. 이를 원본 후보의 성공적인 재실행으로 바꾸지 않았다. 또한 D065_SKILLS에 있는 3개 파일 테스트 정리 수치는 당시 이 역할이 확인한 부분 범위다. 최종 D065 결과는 4개 파일 74→58 정의이며, 이전 3개 파일 수치를 전체 최종 성과로 재사용하지 않는다.

이 사례는 기존 실행/결과 기록의 수동 적용·대조다. 새 독립 실험, provider 재실행, 전체 비용 감사나 스킬 자동 선택 효과를 검증한 결과가 아니다.

## 사전 원본/설치 상태와 수행한 확인

2026-10-11 01:37:51 KST(UTC `2026-10-10 16:37:51`)에 다음 읽기 전용 명령을 실제 실행했다.

```sh
python3 skills/jev-skill-maintenance/scripts/inventory_skills.py \
  --source-root skills \
  --installed-root /Users/lee/.codex/skills \
  --installed-root /Users/lee/.agents/skills
```

결과는 exit 0, 원본 2개다. 모든 파일별 해시와 아래 tree는 D065 최종 관측과 같다.

| 대상 | 파일 수 | tree SHA-256 | 설치 구분 |
|---|---:|---|---|
| decision-records 원본 | 5 | `05c19e728c3ad5008df663e369f12cf392307730b69cc13bbe7cdf39a15cfa55` | Codex 사본과 문서 2개 경로 차이 |
| maintenance 원본 | 4 | `7445e650fff623c91b8a56bcaeb3756ef6de03293ce3303b43fcb06047dd73cd` | 확인한 두 설치 루트에 없음 |
| decision-records Codex 사본 | 5 | `93710658c36fcb02895e66e98e8724842c9e9dffcc2bdd152ccf4bffbf966979` | 갱신하지 않음 |

차이가 있는 경로는 `SKILL.md`, `references/record-contract.md`이며 agents 루트에는 records 사본도 없다. tree는 기존 캐시를 포함한다. 원본과 사본의 `check_record.cpython-310.pyc` 해시도 이전과 같은 `260b3435e87b44410aa21ac784bbd77401597a1effb28f98a78b9a8f927cd959`다. `host_discovery_verified`와 `host_invocation_verified`는 모두 `false`다.

스킬 소스·도구·테스트를 변경하지 않았으므로 구조 검사·helper 6개 테스트·전체 프로젝트 회귀를 중복 실행하지 않았다. D065 결정 기록은 당시 mutable 문서를 `benchmark-runs/d065-local/record-sources/`에 동결해 참조하고 있음을 읽었다. 이번 유지보수 문서 갱신을 위해 D065 원본 증거를 바꾸지 않았다.

다음 trigger는 root의 D066 실행 전 프로토콜 고정과 실제 영수증·독립 grade 도착이다. 그때 공통 준비의 비용/시간 계산, 조건 일치, 실패 포함 여부와 주장 수준을 기존 records 지침으로 확인한다. 별도 스킬이 필요한 반복 업무가 관찰될 때만 SKM-004를 다시 검토한다. 이번 역할의 신규 스킬·테스트·에이전트·전역 설치·유료 호출·커밋·푸시는 모두 0이다.

## 2026-10-11 02:55:46 KST — 실제 네 조건 종료 후 적용

[고정 프로토콜](../orchestration/D066_EXPERIMENT.md), [분석 02](../../benchmark-runs/d066-analysis-02.json), Claude의 [독립 평가 요약](../../benchmark-runs/d066-comparison-01/claude_all/independent-evaluation.json), 세 Jev 조건의 `events.jsonl`, 실제 [모델 모니터 입력](../../benchmark-runs/d066-monitor-numeric-packet-01.json)과 [결과](../../benchmark-runs/d066-monitor-numeric-01/result.json)를 읽었다. 필요한 JSON 필드를 추출하고 사건 종류별 수·예산 산술·공통 준비 비용의 중복 집계를 직접 대조했다. 숨김 검사 구현이나 개별 숨김 실패를 읽지 않았다.

| 실제 사례 | 확인한 근거와 기록 판단 |
|---|---|
| Claude 조건의 실행과 성공 | 분석의 round 0은 구현 작업 6회·공개 84/85, round 1은 수리 작업 6회·공개 85/85다. 독립 평가 요약은 63/63, 실패·skip 0, 후보 불변·컨테이너 제거를 기록한다. 수리는 1라운드이며 changed artifact는 3개다. 재호출 6개와 내용이 바뀐 artifact 3개를 같은 수로 쓰지 않는다 |
| 세 Jev 조건의 중단 | 각 조건이 `ADAPTIVE_ARM_TOKEN_LIMIT`로 분해 중 멈췄다. 입력 650,271 + 다음 요청의 예정 예약 65,536 = 715,807 > 조건별 700,000이다. 마지막 cohort 장부 snapshot은 전역 잔여 415,445, 실제 reserved/pending 0이다. 전역 예산 고갈이나 65,536의 미정산 예약으로 표현하지 않는다 |
| callback과 실제 전송 | 각 planner 통계의 `provider_calls: 34`는 decision callback 수다. 각 원본 events는 `adaptive_decision_requested` 34, `inference_started`/`inference_finished`/`adaptive_provider_finished`/`budget_settled` 각각 33을 담고, 분석의 실제 receipt도 33개다. 마지막 callback은 응답 없음·불확실성 false의 로컬 한도 차단이다. POST 34회로 올려 세지 않는다 |
| 도달하지 않은 단계 | 세 Jev 조건의 usage stage는 `jev:split:`뿐이고 실행 결과는 없다. 관계·구현·수리·공개 검사·독립 채점에 도달하지 않았다. 조건 이름에 relations/repair가 있어도 실행 근거가 되지 않는다. 성공 완료시간·성공 감소율은 모두 `null`이다 |

짧게 끝난 실패 시도의 시간·비용은 보존한다. 이를 Claude 성공 결과보다 개발 완료가 빨라졌다는 주장으로 바꾸지 않는다. 한 조건당 1회·고정 순서·다른 실제 계획이라는 한계도 유지한다. Claude의 headline 성공 시간은 공통 준비를 포함한 2,574.749648042초이며, 독립 채점을 포함한 별도 시간 및 handoff gap과 구별된다. 이 역할은 root의 원본 요약과 분석을 대조했으며 후보를 다시 실행하거나 모든 실행 영수증을 독립 감사한 것은 아니다.

공통 준비 환산 `$0.481984`를 네 조건에 각각 포함한 headline 합은 `$24.7646628`이다. 실제 cohort 비용은 중복된 준비 3회분을 빼는 `$24.7646628 - 3 × $0.481984 = $23.3187108`로 분석과 일치한다(부동소수점 끝자리 차이 제외). 모니터 비용은 이 합 밖이며 실제 구독 청구는 `null`이다. 이 계산은 사전 지침의 적용 사례로 남기고 가격·예산 계약을 스킬에 복제하지 않았다.

### 시간 경계 정정과 모니터가 본 자료

세 Jev events에는 `adaptive_provider_started`가 없다. `inference_started`는 실제 33회 있으므로 모든 시작 계측이 없다고 표현하지 않는다. [분석 01](../../benchmark-runs/d066-analysis-01.json)의 이전 단계 시간은 그대로 보존돼 있다. 분석 02는 공통 경계를 **첫 decision request/selection부터 마지막 selection/failure까지**로 명시하고 로컬 전이도 포함한다. 실패한 계획의 완료 stopwatch는 `null`이며 관측 event span·provider receipt 시간 합·전체 시도 시간을 분리한다. 이를 새 provider 시작 이벤트나 HTTP 순수 지연으로 해석하지 않았다.

실제 `claude-opus-5-5` 모니터 결과는 `completed`, assessment는 `attention`이다. 입력의 `numeric-summary`는 운영자가 제공한 집계이며 원시 prompt·코드·파일 경로/해시·계정·숨김 검사를 포함하지 않는다. 모니터 자체도 원시 판단→선택→행동, revision binding과 누적 장부/예약 상태를 확인하지 못했다고 명시한다. 따라서 **집계 수치와 해석 한계의 모델 리뷰**이며 원시 receipt 감사·동일 소스 검증·제품 채점으로 보고하지 않는다. 우리에게 보이는 root 분석의 전역 잔액을 모니터도 직접 검증한 것처럼 쓰지 않는다.

### 실제 보완과 검증

기존 [record-contract](../../skills/jev-decision-records/references/record-contract.md)의 DAG 절에 요청 수/조건별·공유 한도 항목과 리뷰 입력 범위 항목을 추가했다. 기존 실행 항목에는 이름만으로 단계 도달을 판단하지 않는 문장, 시간 항목에는 실제 start/end 사건과 이전 분석 보존 문장을 보완했다. 이는 위에서 관측한 계수·시간·리뷰 경계만 다룬다. JSON 계약, checker, maintenance 스킬, 생산 코드와 테스트는 변경하지 않았다.

변경한 records 스킬만 `quick_validate.py`로 검사해 exit 0, `Skill is valid!`를 확인했다. 실제 inventory도 exit 0이다. 이 확인 시각은 UTC `2026-10-10 17:55:46`이며 새 records tree는 `1aef61f32fc261393ae9097e516cf662776b3a2f13785be12a33a5deb4524e90`, 변경한 reference 파일은 `18b86caa49840728b20e243e053d9e1b61ea0eb32da9cce2050895b9f9d6c2df`다. 사전 records tree `05c19e72…`는 위 관측으로 보존한다. maintenance tree `7445e650…`, Codex 설치 사본 `93710658…`, 기존 캐시와 helper/checker 해시는 그대로다. 설치 경로 차이와 discovery/invocation `false`도 유지한다.

추가 테스트나 helper 전체 재실행은 하지 않았다. 검증 수준은 **수정한 스킬의 구조 검사, 실제 파일 inventory, 저장된 실행·분석·집계 모니터 근거의 수동 대조**다. 스킬 자동 호출·사용자 생산성·Jev 관계/수리 효과·성공 제품끼리의 효율 우월성은 증명하지 않았다. 예산·예정 예약·질문 구조 변경은 새 조건의 기록 대상이며 이번 유지보수로 재실행을 허가하거나 장부를 수정하지 않는다. 다음 trigger는 실행 비교의 설계를 다시 변경하는 실제 요청 또는 새 근거 도착이다.
