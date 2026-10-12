# D073 — 추론한 담당과 실제 수리 권한의 스킬 기록

2026-10-12 KST. [역할 계약](D073_PARALLEL.md)과 [실험 계획](../orchestration/D073_EXPERIMENT.md)에 따라 기존 단일 스킬 담당을 이어 맡는다. 아래 사전·중간 기록은 당시 관측으로 보존한다. 최종 `d073-focused-new-02`는 Jev 선택을 실제 수리 작업자2명으로 연결해 공개79→91/93·독립60→61/63으로 개선했지만 두 번째 담당 추론 HTTP400과 남은 실패로 미완료다. 비용 보정·별도 모니터 종료는 root의 후속 근거로 남긴다.

## 목적과 최소 변경

사용자는 공개 실패별로 기존 담당을 Jev가 추론하고 로컬 토큰 한도 없이 진행하도록 승인했다. 목표는 광범위 fallback을 실제 기존 담당과 연결해 수리 실행으로 이어가는 것이다. 승인된 구현·실행을 다시 승인 대기로 바꾸지 않는다. 허용 ID와 실제 쓰기 범위의 코드 검증을 문서상 승인 gate로 대체하지 않는다.

[jev-skill-maintenance](../../skills/jev-skill-maintenance/SKILL.md)와 [jev-decision-records](../../skills/jev-decision-records/SKILL.md)를 적용했다. 기존 [record-contract](../../skills/jev-decision-records/references/record-contract.md#artifact-dag-evidence)가 필요한 경계를 이미 다루므로 새 스킬이나 중복 규칙을 만들지 않는다. 이번 쓰기는 이 역할 문서와 [MAINTENANCE의 SKM-016](../skills/MAINTENANCE.md#d073--기존-담당-추론과-로컬-상한-해제의-규칙-재사용) 두 파일이다. 런타임 질문·API·정책의 정본은 각 구현 담당과 root가 소유한다.

| 기존 규칙 | D073에서 연결할 근거 | 성과로 확대하지 않을 것 |
|---|---|---|
| Repair scope / Causal candidate | 공개 실패 원문·질문 revision·기존 worker/artifact 허용 목록 → Jev 추론 선택 → controller 검증 → 허용 read/write scope·revision → 실제 변경·공개 재검사 | 추론된 담당은 후보 가설이다. 소유권이나 선택 성공만으로 확정 결함 위치·수리 성공이 되지 않는다. |
| 실패·미실행·미확인 구분 | 판단 불가·복수 후보/원인·같은 실패의 반복 이력·`not_reached`를 각각 보존하고 실제 전달된 후보/제외를 연결 | 미도달 검사를 실패 owner로 승격하거나 모호한 원인을 근거 없이 한 담당으로 확정하지 않는다. 새로운 반환 필드는 이 문서가 발명하지 않는다. |
| Limit-policy / Input-size | 최신 승인과 새 v4 정책·실제 직렬화 바이트·추정치·전송 여부·응답을 연결; null은 해당 계약이 무상한으로 정한 필드에서만 사용 | 로컬 추정/운영 상한 해제는 provider 문맥·공식 body 제한 해제가 아니다. 정확 모델 토큰·수락 보장·미확인 usage를 알게 된 것도 아니다. |
| Counts / Model-effort / Duration | 실패별 문항 수·판단 callback·실제 POST·선택·CLI/identity·수리 worker·검사와 비용을 구분; 보존 수리와 새 개발은 별도 시작점 | 추론이나 수리의 짧은 실패 시간을 완료 가속률로, 공식 환산을 월 구독 청구로, 요청 effort를 내부 추론량으로 쓰지 않는다. |

기존 v1/v2/v3와 D071/D072 실패·차단 원본은 당시 정책의 결과로 보존한다. 새 조건에서 상한을 해제해도 이전의 전송 전 차단을 provider 실패나 성공으로 고쳐 쓰지 않는다. 기존 장부와 불확실 정산 처리·자동 재전송 0의 경계는 현재 실험 계약을 따른다.

## 사전 적용과 검증 수준

[D071 수리 차단 분석](../../benchmark-runs/d071-profile-failure-analysis-01/README.md)의 실패26·fallback18·75요구·86,809B와 수리 POST/worker0을 적용 사례로 사용했다. 이 관측은 기존 담당 추론을 구현할 필요의 근거이며 추론 정확도나 실제 재호출 절감의 증거가 아니다. D072 재생의 형식/공식 바이트108통과·기존 v3추정107통과/1차단은 [D073 실험 계획](../orchestration/D073_EXPERIMENT.md)에 인용된 과거 관측이다. 이를 v4의 실제 provider 수락 검증으로 바꾸지 않는다.

위 작업은 기존 문서와 저장 사례에 규칙을 대조한 수동 검토다. D073 런타임 코드 검증·독립 에이전트 행동 실험·호스트 스킬 호출·제품 검증이 아니다. 구현 담당의 실제 allowlist/권한 거부·선택 연결 검사와 root의 실측을 별도 근거로 기다린다.

읽기 전용 inventory 명령은 저장소 루트에서 다음과 같이 실행했고 exit 0이었다.

```sh
python3 skills/jev-skill-maintenance/scripts/inventory_skills.py \
  --source-root skills \
  --installed-root /Users/lee/.codex/skills \
  --installed-root /Users/lee/.agents/skills
```

records 원본 tree는 `c13f55a91accdb284c04b97f2f5350f6a1694bbb41cefc0389e6b5cfbb434b6c`, reference는 `2b091811881f31aee5f53b1a6184fdc6d0a7e196014406302d5b266a5b67cab7`로 D071 종료 관측과 같다. maintenance 원본 tree `7445e650…`, Codex records 사본 `93710658…`와 `SKILL.md`/reference 두 경로 차이, agents records·두 루트 maintenance 설치 부재도 유지됐다. 설치 사본을 갱신하지 않았으며 host discovery/invocation은 미검증이다.

스킬 본체·reference·helper·schema를 수정하지 않아 구조 검사와 helper/프로젝트 테스트를 반복하지 않는다. 문서 공백·차이 검사와 변경 후 읽기 전용 inventory 결과는 아래에 기록한다. 유료 호출·Docker·장부·숨김 검사·생산 코드·과거 실행 원본은 이 역할에서 접근/변경하지 않는다.

사전 문서 작성 후 같은 inventory 명령은 exit 0이고 변경 전 출력과 전체 동일했다. 두 미추적 소유 문서의 `git diff --no-index --check /dev/null <문서>`는 신규 내용 차이에 따른 exit 1·공백 오류 출력 없음이었다. 이 검증은 문서와 원본/설치 사본 상태만 다루며 D073 실행 성공을 검증하지 않는다.

## 인계

단일 소유자는 `d067_skills`다. 다음 trigger는 구현 API/검사 근거 확정과 root의 D073 실측 전달이다. 실제 질문·선택·검증된 권한·변경 파일·공개/독립 결과와 호출/비용 분모를 확인한 뒤 이 문서와 SKM-016을 이어 갱신한다. 새로운 반복 누락이 발견되지 않으면 기존 스킬 규칙을 그대로 재사용한다. root가 공유 STATE·결정·결과 문서를 갱신한다.

현재 사전 쓰기는 종료한다. 실측 근거가 도착하기 전 미측정을 유지하며 추가 모델 호출이나 설치 작업을 진행하지 않는다.

## 2026-10-12 03:18 KST — 첫 보존 수리의 서버 거절과 후속 정산

[보존 수리 원본 결과](../../benchmark-runs/d073-preserved-repair-01/result.json), [실제 전송 전 관측](../../benchmark-runs/d073-preserved-repair-01/calls/jev-0001.token-admission.json), [저장된 HTTP 실패](../../benchmark-runs/d073-refund-01/failure-evidence.json)를 읽었다. `repair_owners`는 **실제 POST 1회·26문항·187,728B**였고 v4 `admit_observed` 뒤 HTTP400 `model_input_limit`으로 종료됐다. 담당 답·수리 선택·실제 수리 작업자는0, Claude 호출0·자동 재전송0이다. 답이 없으므로 기존 담당 추론의 정확도나 실제 수리 효율은 이 시도에서 측정되지 않았다. 로컬 상한 해제는 제공업체의 문맥 제한 해제가 아니라는 기존 규칙의 실제 사례다.

원시 결과의 Jev `usage_complete:false`, `api_equivalent_usd:null`과 추론 사용량 미확인을 유지한다. known subtotal0은 실제 사용량0의 근거가 아니다. 원본 결과의 `settlement_status:pending`도 당시 상태이며 후속 정산으로 덮어쓰지 않는다.

[환불 근거](../../benchmark-runs/d073-refund-01/evidence.json)·[UI 관측](../../benchmark-runs/d073-refund-01/ui-observation.json)·[credits GET 사본](../../benchmark-runs/d073-refund-01/account.json)·[정산 사본](../../benchmark-runs/d073-refund-01/reconciliation.json)은 root가 예약 r930만 명시 정산한 후속 근거다. 해당 요청의 charged input0·확인된 actual billing USD0과 **inference input null·월 구독 배분 unknown**을 구분한다. UI에는 provider UUID가 보이지 않아 날짜·시각·26문항 실패 행·인접 성공 행과 저장된 HTTP의 provider/local run 연결로 대조했다는 한계도 남긴다. 환불은 답변·수리 성공이나 재실행 근거가 아니다. 이 역할은 저장 사본만 읽었으며 계정 조회·정산을 실행하지 않았다.

root 통보 시점 새 전체 실행은 구현 작업자15개 중13개 완료의 중간 관측이었다. 이 문서 작성은 그 통보와 저장 근거를 기록한 것이며 현재 프로세스를 재측정한 결과가 아니다. 최종 공개/독립 검사·총시간·토큰·비용·동일 품질 효율은 root 종료 근거 전까지 미정으로 둔다. 보존 수리의 실패 분모를 새 전체 개발과 합치지 않는다.

[담당 추론 구현 계약](D073_REPAIR.md)과 [현재 실험의 prototype 경계](../orchestration/D073_EXPERIMENT.md#중간-관측--첫-서버-거절-보존)를 연결한다. `benchmark-runs/d073-owner-packet-analysis-01/`의 별도 입력 prototype은 의미 근거 보존을 검토하는 단계이며 실제 연결·수락·효율 성과가 아니다. hash/path는 controller 출처 식별 정보다. Jev에 본문을 제공하지 않았다면 로컬 경로를 열었거나 해당 의미 근거를 읽었다고 세지 않는 기존 model-visible/controller-only 구분을 적용한다.

기존 failure/billing·input-size·causal evidence 규칙으로 충분하므로 새 스킬·추가 규칙·설치가 필요하지 않다. 후속 쓰기는 이 문서와 SKM-016에만 한정한다. 생산·스킬 정본·동결 소스·과거 실행 원본은 변경하지 않으며 최종 전체 실행 결과가 다음 갱신 trigger다.

후속 문서 2개의 no-index 공백 검사는 내용 차이 exit1·오류 출력 없음, read-only inventory는 exit0·사전 관측과 전체 동일이었다. 변경 없는 스킬 구조/helper/프로젝트 테스트는 반복하지 않았다. 설치 사본 미갱신·host discovery/invocation 미검증을 유지한다. 이번 쓰기를 종료하며 저장된 실패/정산 근거의 문서 적용을 실제 수리 성공으로 확대하지 않는다.

## 2026-10-12 03:40 KST — 첫 두 조건 종료와 변경 입력의 보존 수리

[첫 종료 분석](../../benchmark-runs/d073-analysis-01/analysis.json)과 [결과 초안](../orchestration/D073_RESULTS.md)을 읽어 위 13/15 중간 관측 뒤의 종료를 구분했다. 독립 검사는 controller의 수치 요약과 candidate binding만 확인했으며 숨김 검사 상세는 읽지 않았다.

| 첫 조건 | 공개 / 독립 | 실제 Jev POST / Claude CLI | owner 실패 요청 | 담당 답 / 수리 worker |
|---|---|---:|---|---:|
| 새 `jev_profile` 개발 | 79/93 · 60/63 | 57 / 15 | 14문항·158,187B, HTTP400 model_input_limit | 0 / 0 |
| D071 후보 보존 수리 | 67/93 · 49/63 | 1 / 0 | 26문항·187,728B, HTTP400 model_input_limit | 0 / 0 |

두 조건 모두 결합 완료가 아니므로 짧은 종료시간·낮은 소계를 성공 가속률이나 완료 비용 절감으로 쓰지 않는다. 실패 owner 요청의 원시 usage/API 환산null은 보존한다. [r930 환불](../../benchmark-runs/d073-refund-01/evidence.json)과 [r931 환불](../../benchmark-runs/d073-refund-02/evidence.json)은 각 실패 요청의 확인된 무과금 근거이며 전체 개발 비용0이나 추론 토큰0을 뜻하지 않는다. 계정/정산은 root가 수행했고 이 역할은 저장된 후속 근거를 연결했다.

[v2 재생](../../benchmark-runs/d073-input-v2-preflight/replay-01/result.json)은 D071 후보 187,728→91,569B, D073 후보 158,187→76,748B를 각각 측정했다. 두 수치를 같은 후보의 전후로 혼합하지 않는다. 각 입력은 공개93 case의 식별자·상태와 실패 원문, 미도달 assertion4개, 기존22 artifact·21 unit의 계약/인터페이스·의존성을 유지했다. Jev에 inline으로 제공한 원문 요구는 각각28/80·12/80이며 controller 원문 복원을 모델의 전체 요구 열람으로 세지 않는다. 정확 모델 토큰·수락·담당 추론 정확도·수리 효과는 이 오프라인 바이트 관측으로 확정되지 않는다.

[전체 회귀](../../benchmark-runs/d073-focused-preflight/regression-summary.json) 1,225/1,225·실패/skip0, [독립 사전 검토](../../benchmark-runs/d073-review-01/prelaunch-focused-final.json) passed, [실행 gate](../../benchmark-runs/d073-focused-preflight/launch-gate.json) passed는 root/검토 담당의 저장된 사전 검증 근거다. 이 역할에서 다시 실행하지 않았다. [첫 종료 보존 감사](../../benchmark-runs/d073-preflight/closeout-integrity.json)는 과거4,439파일·실행270핀 drift0, 후속 gate는 과거5,988파일 보존·실행376핀 동결을 확인한다. 이 값은 해당 감사 시점의 보존이며 이후 수리 성공을 입증하지 않는다.

[prototype 독립 검토](../../benchmark-runs/d073-review-01/owner-prototype-review-02.json)는 실패/불확실 envelope와 누락된 마지막 batch를 포함한 부분 답 검증 누락을 발견·수정한 뒤 12개 거부 사례를 확인했다. 이는 입력 분석 prototype의 검증 장치 개선이며 실제 제품 수리 성과가 아니다. 추가로 03:41 KST의 [분석기 비교 정정](../../benchmark-runs/d073-analysis-tools/focused-real-manifest-compatibility-01.json)은 runtime loader가 더한 `manifest_path`·`manifest_sha256`을 원본 manifest와 전체 객체로 비교하던 결함을 분리했다. 두 metadata를 정본 경로·원본 SHA와 각각 대조하고 나머지 payload를 비교한 결과 실제 두 protocol 모두 일치했다. [측정 담당](D073_FOCUSED_MEASUREMENT.md)이 보고한 집중3/3과 이 metadata 검증은 제품 수리·provider 수락의 근거가 아니며 기존 실패 분석·생산 코드는 보존했다.

root 통보 시점 [D071 보존 수리](../../benchmark-runs/d073-focused-old-01/)와 [D073 보존 수리](../../benchmark-runs/d073-focused-new-01/)가 별도로 실행 중이었다. [후속 실험](../orchestration/D073_FOCUSED_OWNER_EXPERIMENT.md)은 초기 분해·구현 재실행이 아니며 두 시작 후보가 다르다. 원래 개발과 후속 수리 시간의 합도 중간 진단·수정·대기를 제외한 단계 합계이므로 자동 E2E 완료시간으로 쓰지 않는다. 실제 후속 수리 결과는 root 통보 전까지 미측정으로 유지한다.

기존 record-contract의 입력·실행·검증 수준·정정·분모 구분으로 충분하다. 이번에도 역할 문서와 SKM-016만 갱신하며 새 스킬·규칙·설치·생산 변경은 하지 않는다. 최종 두 보존 수리 결과와 회계/검증 정정 근거가 다음 갱신 trigger다.

이번 소유 문서 2개는 no-index 공백 오류 없음(내용 차이 exit1), read-only inventory exit0·직전 관측과 전체 동일을 확인했다. 구조/helper/프로젝트 검사는 반복하지 않았으며 설치 사본 미갱신·호스트 미검증 상태를 유지한다. 중간 쓰기를 종료하고 후속 실측 종료 근거를 기다린다.

## 2026-10-12 03:58 KST — 실제 수리 연결과 미완료 종료의 기록

[후속 분석02](../../benchmark-runs/d073-focused-analysis-02/analysis.json), [독립 종료 근거 검토](../../benchmark-runs/d073-review-01/focused-terminal-review-02.json), [마지막 보존 감사](../../benchmark-runs/d073-focused-new02-preflight/closeout-integrity.json)를 읽었다. [결과 정본](../orchestration/D073_RESULTS.md)의 초안·진행 중 문구는 root가 후속 갱신하며, 여기서는 위 종료 근거의 범위만 적용한다.

| 보존 수리 시도 | 확인된 진행 | 종료·품질 경계 |
|---|---|---|
| `d073-focused-old-01` | owner26문항 답변 수락·기존 담당 연결 후 다음 chooser가 HTTP400 model_input_limit; Jev 집계2POST·수리 CLI0 | 공개67/93·독립49/63 유지. 담당 추론 수락을 수리 성공으로 쓰지 않는다. |
| `d073-focused-new-01` | 공유 장부의 미정산 예약으로 BUDGET_OUTSTANDING, callback1·실제 전송0·수리 CLI0 | 입력을 provider가 거절한 것이 아니다. 원본 null과 분석기의 NONINVOCATION_NOT_PROVEN을 보존하며 별도 전송 여부 감사와 구분한다. |
| `d073-focused-new-02` | 별도 새 경로에서 owner14문항→수리 범위→프로필→Claude2명을 실제 실행. 실행기 집계 Jev5POST(성공4·HTTP4001) | 공개79→91/93·독립60→61/63, 독립 skip0. 남은 공개2실패를 위한 owner2문항·76,562B가 HTTP400 model_input_limit로 종료해 결합 완료false. |

`new-02`는 이전 미전송 원본을 성공으로 교체한 기록이 아니며 새 초기 개발도 아니다. 서로 다른 시작 후보·중간 운영 개입 때문에 원래 개발과 수리의 단계 합을 자동 E2E 완료시간, 동일 품질 가속률 또는 모델/effort 정책의 인과 효과로 계산하지 않는다.

실제 작업자·허용 범위·변경을 구분했다. n9는 Sonnet5.5에 요청 effort high로 실행돼 A14/A15의 `pyclientgen/schema/operations.py`·`pyclientgen/diagnostics.py`에 썼다. n14는 Sonnet5.5에 요청 medium으로 실행돼 A10의 `pyclientgen/schema/enums.py`가 허용됐으나 실제 쓰기는0이었다. 선택·CLI·관측 모델 identity는 연결됐고 내부 effort 확인은null이다. 허용 산출물3개·실행 작업자2명·쓰기가 기록된 고유 경로2개를 같은 수로 세지 않는다.

독립 검토의 `passed_evidence_audit_product_incomplete`는 controller/영수증·read/write metadata·현재 결과 binding 감사다. 검토자가 후보 파일 본문을 열어 결함 위치를 독립 증명한 것이 아니다. A10 미변경과 공개2실패의 동시 관측만으로 해당 작업자의 확정 결함 책임이나 Jev의 최적 배정을 단정하지 않는다. 공개 개선과 실제 쓰기는 관측했지만 전체 수리 완료·동일 품질 효율 우위는 입증되지 않았다.

### 입력 감사기의 알려진 실패 분류 누락

[읽기 전용 진단](../../benchmark-runs/d073-input-audit-diagnostic-01/diagnosis.md)은 old chooser와 new-02의 두 번째 owner 요청을 포함한 입력7건의 schema/body/v4 통과, 실제 성공 HTTP200 5건·known HTTP400 2건을 구분한다. 기존 감사기는 성공 response와 특정 로컬 거절만 분류해 실패2건에 모델 미확인·POST 근거 누락을 표시했다. 이는 새 provider 실패나 입력 형식 실패를 만든 결과가 아니라 **감사기의 실패 분류 미지원과 실패 transport metadata 미보존**이다.

두 HTTP400은 같은 run/attempt의 시작→실패 종료→terminal 영수증으로 연결된다. 다만 실패 영수증에 직접 남지 않은 목적지·method·응답 모델·자동 재전송 수는 unknown으로 유지한다. 실행기의 POST 집계와 코드상 목적지/재전송 정책은 개별 실패의 transport 직접 관측과 다른 근거다. 직전 HTTP200 모델·models GET·현재 설정으로 빈 값을 채우거나 `request_id`만으로 서로 다른 run을 합치지 않는다. 입력/해시 검증, 실행 결과 분류, transport 출처 완전성은 각각 기록하며 기존 `audit_complete:false`를 성공으로 덮어쓰지 않는다. 진단의 최소 수정안은 아직 구현 근거가 없고 이 역할도 생산 코드를 수정하지 않는다.

저장된 전체 회귀1,225/1,225·실패/skip0은 유지하고 재실행하지 않았다. 마지막 보존 감사는 과거7,219파일·실행376핀 변경0을 기록한다. 이는 root의 실행 보존 감사이며 이 역할이 전체 파일을 독립 재해시한 결과로 바꾸지 않는다. 실패 추론의 원시 usage/API 환산null은 유지하며 환불 보정 비용 view와 별도 Opus 숫자 모니터는 root/측정 담당이 진행 중이므로 이번 최종 역할 갱신에 비용 숫자를 추가하지 않는다.

기존 record-contract의 선택/실행/변경·공개/독립 완료·unknown·정정·분모 구분으로 모두 기록할 수 있다. 새 스킬·추가 규칙·설치는 불필요하다. SKM-016의 현재 실제 결과 적용은 완료하며, 남은 제품 실패·입력 감사기 수정안·비용/모니터 보정의 전체 판단은 root에게 인계한다. 후속 근거에서 새로운 기록 누락이 확인될 때만 같은 단일 담당이 최소 갱신한다.

종료 문서 2개의 no-index 공백 오류는 없었고(내용 차이 exit1), read-only inventory는 exit0·직전 관측과 전체 동일이었다. 스킬 구조/helper/프로젝트 검사를 반복하지 않았다. 스킬 원본·reference·설치 사본의 해시/부재 상태와 host discovery/invocation 미검증을 유지한다. 생산·원본 증거·장부 수정과 새 호출 없이 소유 문서 2개 쓰기를 종료한다.
