# D068 — 수리 경로 수정의 스킬 기록 적용

2026-10-11 KST. [D068 역할 계약](D068_PARALLEL.md)의 기존 단일 `skills` 담당이 [실험 계약](../orchestration/D068_EXPERIMENT.md)을 읽고 이어 맡는다. 정본·기존 관측은 [MAINTENANCE](../skills/MAINTENANCE.md)와 [D067_SKILLS](D067_SKILLS.md)에 보존한다. 처음에는 사전 적용 기록으로 작성했으며, 문서 끝의 **19:15 KST 종료 적용**에 실제 실패·후속 정산 근거를 추가했다. 새 `jev_all`은 공개84/85·독립63/63으로 미완료이며 실제 수리 성공·재호출 절감은 검증되지 않았다.

## 현재 승인과 범위

역할·실험 계약에 기록된 최신 사용자 요청은 수리 입력 축소, 실패 원인 전달, 불필요한 작업자 재호출 수정의 병렬 개발과 **새 Jev 전체 판단 한 조건 실행**이다. D067 종료 원본에 이어 쓰지 않는다. root가 실제 유료 실행·현재 장부·채점·모니터·결과 산식을 소유하며 이 역할은 기존 기록 스킬 reference와 자체 상태 문서만 수정한다.

기존 [jev-skill-maintenance](../../skills/jev-skill-maintenance/SKILL.md)와 [jev-decision-records](../../skills/jev-decision-records/SKILL.md)를 적용한다. skill-creator 지침의 최소 변경·책임 보존 원칙도 유지한다. 새 운영 스킬·helper·테스트·전역 설치는 필요하지 않다.

## 확인한 공백과 최소 변경

[D067 실제 수리 실패 분석](../../benchmark-runs/d067-review/repair-failure-analysis-01.md)은 Claude의 최초 공개 검사 **통과 2 / 실패 24 / 미실행 59**, 소유자 후보·수리 작업자 **7/7**을 기록한다. 미실행 검사가 실패 소유자 매핑에 포함돼 수리 범위가 모든 잎으로 확대된 구체 사례다. 원인으로 식별된 fixture 생성 blocker와 그 밖의 관측 실패가 모두 같은 원인이라는 증거는 없으므로 구분해야 한다. 이 기록은 기존 D067 관측이며 D068의 결과로 재표시하지 않는다.

기존 reference는 바이트/토큰, HTTP 실패/추론 사용량/정산, 공개·독립 완료 조건을 이미 구분한다. 이 부분을 새 스킬이나 별도 규칙으로 복제하지 않는다. [record-contract DAG 참고 절](../../skills/jev-decision-records/references/record-contract.md#artifact-dag-evidence)에 다음 최소 변경만 한다.

- 수리 범위·귀속 항목 1개: 실패 assertion, 미실행 검사, 근거가 연결된 fixture/prerequisite blocker, 원인 미확인을 구분한다. 제안한 후보·선택한 범위·실제 호출한 작업자와 전체 공개 재검사 결과를 각각 기록한다. 미실행 자체로 담당자의 결함을 단정하지 않는다.
- 기존 동시성 문구 일반화: 과거 순차/현재 병렬뿐 아니라 **서로 다른 cohort 동시성**의 비교 한계를 기록한다. 이번 D067 네 조건 병렬과 D068 한 조건은 실행 경합이 다르다.
- 같은 수리 항목에 검증 경계 명시: 오프라인 사고 재생이나 수리 없이 통과한 새 생성은 실제 수리 성공·작업자 절감 실측이 아니다.

런타임 투영 보존 계약·원인 전달 스키마·범위 생성 규칙은 projection/scope/failure 담당 문서와 root 실험 문서가 정본이다. 스킬 reference는 그 사양을 재정의하지 않는다.

## 사전 적용 사례와 검증 수준

1. 저장된 D067 요청에서 바이트가 줄었다는 재생 결과는 전송 바이트 절감으로만 기록한다. 원래 실패 요청의 모델 입력 토큰은 미확인이므로 그 비율을 실제 토큰 절감률로 쓰지 않는다. D068 모델의 입력 수락·정답·수리 동작은 별도 실행 근거가 필요하다.
2. 실행하지 못한 검사를 실패 assertion으로 합치지 않는다. 소유자 후보에서 제외했다고 해당 요구사항 검사를 없애지 않으며 수정 후 공개 검사 전체를 재실행한 증거를 확인한다. fixture blocker가 식별됐어도 나머지 실패가 모두 그 원인이라는 가정을 자동 확정하지 않는다.
3. 확정 HTTP 오류를 최상위에 전달해도 그 사실만으로 사용량이나 장부 정산이 확인되지는 않는다. 기존 원본 D067의 `uncertain`을 수정하지 않고 D068의 새 결과 구조로 검증한다.
4. D068 새 생성이 공개 85/85·독립 63/63을 수리 없이 통과하면 제품 완료는 보고할 수 있다. 그 실행의 실제 수리 판단·수리 작업자 호출은 0이며 수정된 수리 경로의 실제 성공은 미측정이다. 과거 사고 replay 검증과 자연 발생 수리 실측을 분리한다.
5. D067의 네 조건 병렬과 D068의 단일 조건을 비교할 때 캐시·공급자·호스트 경합·배정·생성의 차이를 함께 명시한다. 성공 후보끼리 완료시간을 비교하고 이전 실패 조건은 실패까지 걸린 시간으로 표기한다. 한 번의 새 실행으로 수정의 인과 효과를 단정하지 않는다.

위 적용은 담당자의 저장 문서·사례 대조다. 새로운 유료 호출·오프라인 replay 실행·제품 채점·독립 에이전트 효과 측정이 아니다. 각 구현 담당의 실제 replay와 검증 결과가 오면 필요한 근거만 추가한다.

## 검사와 설치 상태

변경 전 실제 inventory exit 0을 확인했다. records 원본 tree는 `fb6258276891dc332afa74a79f0d2cdbbe4c687f6ec6d9abddd327f398525f2d`, reference SHA-256은 `6e951a759c0c868ba85a25428d7b03053abb0f37fdb4ed60790c1b52988fc3ed`로 D067 종료 관측과 같다. maintenance 원본 tree는 `7445e650fff623c91b8a56bcaeb3756ef6de03293ce3303b43fcb06047dd73cd`다.

Codex records 설치 사본 `93710658c36fcb02895e66e98e8724842c9e9dffcc2bdd152ccf4bffbf966979`와 원본은 `SKILL.md`·`references/record-contract.md` 두 경로가 다르다. maintenance는 확인한 Codex/agents 두 루트에 없고 records도 agents 루트에는 없다. discovery/invocation verified는 false이며 사본을 덮어쓰거나 설치하지 않는다.

저장소 루트의 실제 검증 명령:

```sh
python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/jev-decision-records
python3 skills/jev-skill-maintenance/scripts/inventory_skills.py \
  --source-root skills \
  --installed-root /Users/lee/.codex/skills \
  --installed-root /Users/lee/.agents/skills
git diff --check -- docs/agents/D068_SKILLS.md docs/skills/MAINTENANCE.md skills/jev-decision-records/references/record-contract.md
```

2026-10-11 18:10 KST 변경 후 실제 구조 검사는 `Skill is valid!`, inventory와 `git diff --check`도 exit 0이었다. records 원본 tree는 `d825db9ebc67ff9869fd564d5354657b83e2edbde35d50e636b48666a5721267`, reference SHA-256은 `6ed051e9ece699b68af8c6c2be58fe56ee20c4ba1285ce15b2090823fa1477a3`다. 위 D067 최종값은 변경 전 관측으로 보존한다. 원본 스킬 2개, 설치 사본의 상태·해시와 maintenance 원본·cache·검사기는 그대로다. discovery/invocation verified는 여전히 false다.

이 검사는 구조·파일 비교 및 위 저장 사례의 수동 지침 적용이다. 구현 replay·제품 실행·스킬 효과는 검증하지 않았다. helper·검사기·schema·생산 코드가 바뀌지 않았으므로 이 역할에서 프로젝트 회귀나 helper 테스트를 반복하지 않았다.

## 사전 상태와 인계 기록

- D068 사전 지침 적용 단계다. 실제 투영·원인 전파·범위 제한 replay 결과와 제품·수리·시간·토큰·비용 결과는 아직 이 문서에서 검증하지 않았다.
- 다음 trigger는 구현 담당 replay/독립 검토와 root의 실제 실행 근거 전달이다. 스킬 규칙 추가가 필요한 관측된 누락이 있는지 검토하되 이미 다루는 의미를 다시 늘리지 않는다.
- 변경 파일은 D068_SKILLS, MAINTENANCE, 기존 records reference다. D067 실행 원본·후보·원장·키·숨김 검사·생산 코드·컨테이너·전역 설치는 이 역할에서 변경하거나 실행하지 않았다. 새 유료 호출·Git 커밋/푸시도 없다.

## 2026-10-11 19:15 KST — 실제 종료 실패와 후보 범위 근거 적용

root가 지정한 [분석 02](../../benchmark-runs/d068-analysis-02.json), [실제 실패 요청 투영 감사](../../benchmark-runs/d068-projection-live-failure-01.json), [실제 실패 수리 범위 감사](../../benchmark-runs/d068-scope-live-failure-01.json), [별도 모니터 결과](../../benchmark-runs/d068-monitor-01/result.json)를 읽었다. 저장된 JSON의 해당 집계 필드만 대조했으며 새 replay·제품 검사·공급자 요청·계정 조회를 실행하지 않았다. 아래 판단은 이 저장 근거에 대한 스킬 적용이다.

### 확인한 사실과 기존 지침의 적용

- **완료와 수리 실행:** 분석의 `rows[0]`은 `status:failed`, `stop_code:HTTP_ERROR`, 결합 완료 false다. 공개 검사84/85·실패1·미실행0, 독립63/63·skip0이므로 완료가 아니다. 수리 판단 POST는 1회 전송됐지만 HTTP400 `model_input_limit`으로 답이 없었다. `selected_candidate_id:null`, 선택 작업자0, 실제 수리 작업자0이며 이 값을 재호출 절감으로 해석하지 않는다. 실제 전달된 오류는 stage=repair/HTTP400/model_input_limit/outcome_uncertain=false로 보존됐지만 문맥 초과 문제는 남았다.
- **입력 축소와 수락 실패:** 투영 감사의 `wire_measurements`는 재구성한 축소 전 직렬화172,019B, 실제 전송 직렬화97,071B, 차이74,948B다. **43.5696% = 74,948 / 172,019 × 100**이며 분모는 같은 요청의 재구성한 축소 전 바이트다. 원시 증거 파일145,358B와도 구분한다. 공개 case 객체85개, 실패1개, 미실행0개와 질문·후보가 보존됐다는 감사 결과를 읽었다. 바이트 절감에도 실제 모델은 입력 한도로 거절했다. 모델 입력·출력 토큰 및 숫자 문맥 한도는 미확인이며 바이트 비율을 토큰 절감률이나 유효한 문맥 한도로 바꾸지 않는다. 투영 생성 보고서의 사전 `provider_acceptance:unmeasured`와 실제 HTTP 거절 관측도 구분한다.
- **거친 검사 매핑과 후보 확대:** 범위 감사의 실패 case는 `T.integration.diagnostics` 1개이며 registry가 요구사항9개에 연결한다. owner 후보는3명, consumer를 포함한 후보는4명이다. 이는 전체 구현 작업자10명 중 제시한 두 후보의 크기이며 선택·실행 인원이 아니다. 후보에 큰 잎1개가 포함돼 해당 잎의 단위12개·요구사항50개를 함께 전달했다. 후보 합집합에는 단위15개·산출물16개·요구사항55개가 포함됐다. case 전체가 다루는 요구사항과 실제 실패 assertion의 원인 소유자는 같은 의미가 아니다. 후보가 전원 호출보다 작아졌다는 구조 사실과 실제 호출을 줄였다는 성과를 분리한다.
- **실패와 정산의 시간 순서:** 분석 02의 `post_run_reconciliation`은 `confirmed_refund_settled`다. 실패 요청의 실제 청구액은 확인된0이지만 추론 입력·출력은 null이다. 후속 장부 누적 입력12,994,396·정산666·pending null은 저장된 정산 결과이며 원본 실패 결과의 당시 `settlement_status:pending`을 덮어쓰지 않는다. UI가 공급자 run UUID를 제공하지 않아 실패 행 시각·인접 성공 기록과 바인딩된 HTTP를 연결했다는 한계도 유지한다. 이 역할은 원장을 읽어 재정산하거나 실제 UI 확인을 반복하지 않았다.
- **비교와 모니터 범위:** 과거 D067 네 조건 병렬과 현재 D068 한 조건은 경합 조건이 다르고 현재 후보가 미완료이므로 성공 완료 속도 개선값을 만들지 않는다. 별도 Opus 모니터는 수치 패킷만 받아 `assessment:failed`를 반환했다. 패킷에 없는 wait/POST/worker overlap은 모니터에게 미확인으로 남았으며 해당 모델이 원시 로그·제품을 감사했다고 쓰지 않는다. 모니터의 새 실행 제안은 추가 실행 승인이나 이 역할의 실행 지시로 취급하지 않는다.

### 실제 드러난 공백과 최소 보완

기존 지침이 byte/token·실패/정산·공개/독립 완료 경계를 이미 다루므로 같은 규칙을 늘리지 않는다. 이번에 새로 구체화된 문제는 **여러 요구사항을 함께 다루는 case의 coverage 소유자와 실패 assertion의 원인 소유자를 혼동하는 것**이다. 기존 reference의 수리 범위 항목 안에서 두 소유자 의미와 후보의 leaf/unit/requirement 확대를 구분하도록 문장만 보완했다. 새 항목·스킬·helper·schema·생산 동작은 추가하지 않았다.

`d068-scope-live-failure-01.json`의 분석 검증은 입력 파일17개·source pin drift0·input hash drift0을 보고한다. 초기 오프라인 guard가 `verify-public`을 구현 소유자로 포함한 분석 오류를 포착했고, `kind=implementation`으로 제한한 뒤 기록했다고 명시한다. 이는 분석 절차의 오류·정정이며 실제 제품 실패나 실행기의 새 결함으로 바꾸지 않는다. 이 담당은 해당 검증을 재실행하지 않았다.

### 최종 검사·미검증·인계

기존 skill 구조 검사 결과는 `Skill is valid!`, inventory와 지정한 3파일의 `git diff --check`는 exit 0이었다. 최종 records 원본 tree는 `9087a2325448f5ed72ddfbc9db83abb37315d896002ff722e067f433db0d73eb`, reference SHA-256은 `7dd4cb5e8594b3d152bdcb373181b1138076fe2976143f5d129cdc1adbe53000`이다. 위 18:10의 `d825db9e…`/`6ed051e9…`는 사전 관측으로 보존한다. maintenance 원본 `7445e650…`, Codex 설치 사본 `93710658…`, 원본 2개·기존 cache·검사기·schema와 설치 부재 상태는 그대로다. 호스트 discovery/invocation verified는 여전히 false이며 구조 검사로 실제 호출이나 효과가 검증된 것은 아니다.

검증은 위 기존 명령만 수행했다. 실패한 수리 요청의 재전송·추가 과금·후보 수정·원장·Docker·숨김 검사·전역 설치는 하지 않았다. 동결 생산 소스와 실험 원본을 보존했다.

남은 검증은 모델이 수리 질문을 실제 수락·선택하고 필요한 작업자만 실행해 공개/독립 완료에 도달하는지, 후보 세분화가 그 실행에서 호출·시간·비용을 줄이는지다. 바이트 축소·후보 크기·오류 전파가 확인돼도 이 후속 결과를 대신하지 않는다. 다음 trigger는 root가 별도로 진행하는 새 입력/검사 매핑 실험의 근거 도착이며, 이번 스킬 기록 작업을 이유로 추가 실행을 만들지 않는다. 이 역할의 변경은 지정한3파일의 미커밋 문서 보완이다.
