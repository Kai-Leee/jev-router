# D031 — 입력을 줄이는 실행기와 Jev 역할의 경계

확인일 2026-10-09 (Asia/Seoul). 담당 role_research. 이 문서는 조사 및 제안이며 라이브 성능 검증이 아니다. 사용자 확정: 동일 본문 제거·작업별 근거 선별 진행, Claude 분할 계획과 Jev 사용의 차이를 지표로 비교, 작업자 기본 Opus medium 유지. 강제 실행·script 활용은 비교 방법으로 허용됐다. 운영 분할 임계값은 여전히 미정이다.

## 현 코드에서 출발할 점

- `scripts/tree-e2e-pilot.mjs`: Claude가 2–4개 task 계획 생성 → Jev가 split 판단 → single/split 모두 강제 실행. 분할 후보를 만든 Claude 호출은 Jev로 대체되지 않았다. 기존 결과로 판단 호출 절감을 주장할 수 없다.
- `docs/orchestration/contracts/questions.v1.json`: split/task/worker/requirement 질문은 이미 영어 정본이다. 반복 호출에서 질문 재생성 없이 붙일 수 있다. v1을 과거 실험과 함께 보존하고 신규 질문은 새 버전으로 확장한다.
- `src/orchestration/document-router.mjs`: 선택 ID→handler dispatch, 버전·hash 검증 경로가 있다. 모의 실행 경로이며 모든 제안이 live에 연결됐다는 뜻은 아니다.
- D030에서 본문 중복은 확인됐지만 바이트 감소가 모델 토큰·가격 감소와 같지는 않다. [이전 감사](D030_INPUT_AUDIT.md).

## 세분화한 실행 구조 — 제안

1. **원문 등록(script)**: 요청·명세·규칙·검사 기준을 ID/버전/hash로 보존한다. 식별자 생성은 의미 요약이 아니다.
2. **요구사항 연결(최초 Claude 또는 작성자, 이후 script)**: 각 task가 참조할 요구사항·공통 제약·근거 ID를 연결한다. 연결되지 않은 요구사항은 삭제하지 않고 공통 원문으로 유지한다.
3. **후보 구성(template/script 또는 Claude)**: 이미 검증된 task template이면 변수만 채운다. 새로운 구조이면 Claude가 경계·파일 소유권·의존·인터페이스를 만든다. 이 생성 비용을 planner로 별도 기록한다.
4. **실행 가능성 검사(script)**: 경로·순환 의존·담당 중복·예산·입력 한도·ready 상태를 검사한다. 선택 가능 후보가 하나면 해당 작업으로 직행하고 `decision_skipped_reason=single_eligible_candidate`를 남긴다.
5. **판단용 입력 구성(script)**: 판단 종류에 필요한 근거만 붙인다. 파일 전체가 필요 없는 분할 판단에는 경계·의존·검증·오버헤드가 우선이다. 원문 접근이 필요한 질문에는 정확한 해당 본문을 붙인다.
6. **판단(Claude/Jev/사전 고정 script 정책 중 실험 arm)**: 동일 후보·질문·상태를 받고 typed 답을 낸다. worker 모델 선택은 현재 실험에서 생략하고 Opus medium 고정.
7. **답 검증·실행 선택(script)**: 반환 형식/선택 ID/상태 버전/후보 유효성을 검사하고 허용된 함수에 직접 연결한다. 선택 뒤 같은 질문을 Claude에게 다시 승인받지 않는다. unknown은 미리 정의한 자료 수집 또는 planner 경로로 보낸다.
8. **작업 입력 구성(script)**: 확정 task + 공통 규칙 + 매핑된 요구사항 + 필요한 의존 artifact를 한 번씩 materialize한다. 도구 없는 worker에 로컬 경로만 전달하지 않는다.
9. **실행(Claude Opus medium)**: 선택된 작업의 구현만 진행한다. 계획 전체를 다시 판단하거나 모델 선택을 반복하지 않는다.
10. **결과 수집·검사(script)**: 실제 파일/exit code/test 결과를 기록한다. 테스트 성공을 Jev 의견으로 대체하지 않는다.
11. **불명확한 잔여 의미 판단(Jev 후보)**: 요구사항 근거 상태, 오류 담당, 다음 자료 수집 유형처럼 script로 확정할 수 없는 부분만 평가한다. 완료는 finish 단일 값으로 축약하지 않는다.

## 무엇을 어디로 이전하는가

아래 handler 이름은 구현 제안이다. 기존 함수와 연결 여부를 별도 기록해야 한다.

| 입력 | 고정 영어 질문 요지 | 답 형태 | handler | 생략할 Claude 작업 | 효과/품질 지표 |
|---|---|---|---|---|---|
| 계획 경계·의존·공유 파일·검사·조정 비용 | Does splitting reduce elapsed time while preserving quality? | noul + sufficient/insufficient | expand_task / execute_leaf / collect_evidence | 같은 계획의 분할 타당성 재검토 | 판단 지연, 실제 생략 호출, quality-conditioned regret |
| script가 검증한 ready task 후보·목표 | Which eligible task should run next? | choice task ID + unknown | dispatch_task | 준비 작업 우선순위 비교 | idle time, makespan, 잘못된 dispatch 수 |
| 실제 오류·변경 범위·담당 역할 | Which owner should investigate this observed failure? | choice role ID + unknown | assign_failure / collect_diagnostics | 반복 오류의 분류·담당 배정 | 재배정 비율, 복구 시간, 잘못된 담당 비용 |
| 요구사항 원문·관측 근거 | What does this evidence establish about this requirement? | choice supported / contradicted / partial / not_observed / ambiguous | run_check / revise_task / collect_evidence / record_supported | 요구사항별 증거 대조 | 독립 라벨 대비 confusion matrix, false-supported rate |
| 알려진 구현 경로/template 후보·제약 | Which documented template fits this task? | choice template ID + new_plan_required | instantiate_template / invoke_planner | 재사용 가능한 구조의 계획 생성 | planner 호출 생략 수, template misroute, 독립 품질 |
| 자료 수집 후보·부족한 정보 | Which evidence collection action resolves the current uncertainty? | choice collector ID + unknown | collect_named_evidence | 반복적인 다음 확인 수단 비교 | 자료 수집 호출 수, 해결률, 불필요한 수집 비용 |

추가 역할 중 **template 선택**은 planner 생성 자체를 줄일 가능성이 있지만 검증된 template이 없는 새로운 과제에서는 감소하지 않는다. 오류 분류는 근본 원인 증명이 아니며 Jev가 코드 수정안을 생성한다고 가정하지 않는다. 기존 반복 테스트 선택은 dependency map으로 정확히 구할 수 있으면 script가 먼저 처리한다. semantic relevance로 테스트를 생략하는 정책은 별도 품질 검증 전 기본값으로 두지 않는다.

## script로 과정을 줄이는 네 가지 경우

| 방식 | 허용 입력 | 줄일 수 있는 일 | 성능 결과의 의미 |
|---|---|---|---|
| 결정적 검사·조회 | 현재 관측·정본 규칙 | 후보 필터, 중복 제거, 의존 조회, 동일 요청 재사용 | 동등성/부정 테스트로 검증 가능; 모델 지능 효과 아님 |
| 고정 휴리스틱 | 실행 전에 보이는 특징만 | 예: 충돌 없는 ready 작업을 정해진 순서로 배치 | 배포 가능한 script baseline; 항상 정답인 규칙으로 표현하지 않음 |
| 과거 답 replay | 과거 요청 hash와 그 응답 | dispatch/직렬화/계측 회귀, 추가 API 비용 | 오프라인 재생 검증; 새 입력 판단 지연·정확도 증거 아님 |
| 사후 oracle/강제 arm | 평가 후 알려진 각 후보의 결과 | 달성 가능한 상한·정책 오류 비용 분석 | 분석 전용. 운영 입력/threshold 조정의 평가 세트에 주입하면 누출 |

선택 결과를 미리 아는 script는 하네스 회귀에 유용하다. 그러나 숨은 테스트 결과나 같은 평가 사례의 사후 승자를 script에 넣은 뒤 Jev/Claude보다 효율적이라고 보고할 수 없다. template·휴리스틱·threshold는 개발 자료에서 동결하고 과제/저장소 단위로 분리한 평가 자료에서 확인한다. 동일 semantic 내용이어도 상태·규칙·후보·model 버전이 바뀌면 cached decision을 자동 재사용하지 않는다. TTL보다 명시적인 evidence version 및 hash가 우선이며 동적인 외부 상태는 재관측한다.

## Claude 계획과 Jev 사용 차이의 비교 설계

한 비교에 모든 변수를 바꾸지 않는다. 다음 비교들은 각각 다른 질문을 답한다.

**A. 판단기 비교:** 동일한 frozen plan을 한 번 생성하고 동일한 상태·typed 질문·후보를 Claude decision, Jev decision, 사전에 고정한 script policy에 제공한다. worker는 모두 Opus medium. planner 비용은 공통 준비 비용과 arm별 할당 비용 둘 다 표시한다. Claude 판단을 Jev로 바꾸면서 planner 비용까지 절감했다고 세지 않는다. 결정 이후 선택한 arm을 실제 실행해야 자동 dispatch 효과를 측정할 수 있다.

**B. 전체 계획 경로 비교:** (Claude 계획+Claude 선택) 대 (Claude 계획+Jev 선택)부터 시작한다. 이후 별도 조건으로 (문서 template+script 후보+Jev 선택)을 비교한다. 후자는 template 준비 비용/실패 시 Claude planner fallback 비용을 포함한다. 후보 생성 방식이 바뀐 결과는 Jev 판단기 단독 인과효과로 표현하지 않는다.

**C. 분할 실행 비교:** 같은 frozen plan의 single, split-serial, split-parallel을 실행해 분해 자체와 병렬화 효과를 나눈다. 강제 실행을 통해 모든 후보 결과를 얻되 그 비용은 실험 수집 비용이다. 실제 배포에서는 선택된 하나만 실행하므로 가상 배포 비용과 분리한다. 각 task 순서·컨텍스트 투영 방식·동시성·검사 환경을 고정한다.

권장 로그 한 건: task/spec/plan/policy/question/evidence hash, decision source, candidate IDs, typed answer, handler, requested/observed model, worker effort, stage time, usage, cost kind, final independent grade, failure/exclusion. `decision_source`는 claude/jev/deterministic/heuristic/replay/oracle을 구별한다. `claude_decision_calls_avoided`는 matched baseline에서 실제 있었고 대체 경로에는 없는 호출만 센다. planner+decision을 한 호출로 수행하는 별도 baseline도 두면 인위적으로 분리한 Claude CLI 기동 비용이 유리한 비교를 만드는지 확인할 수 있다.

지표와 분모:

- 품질: 성공 과제 수 / 시도 과제 수, 검사 통과 수 / 전체 검사 수를 따로 표시. timeout·형식 실패·unknown·fallback을 숨기지 않는다.
- 판단: answered / 전체 판단, 오판 / answered, false-supported / supported 판정. 같은 명세로 파생된 판단들을 독립 과제 수로 부풀리지 않는다.
- 분할 확률: 독립 실행으로 두 후보의 품질·시간을 모두 관측한 경우만 `beneficial = split quality >= single quality AND split time < single time` 라벨. Brier는 sum((p-y)^2)/라벨 수. 반복 시행으로 잡음 확인 후 calibration plot; 한 사례의 p=.66은 보정 증거 아님.
- 후회(regret): 품질 조건을 통과한 후보 중 최저 시간 대비 선택 시간 차이. 품질 실패는 임의 초 단위 벌점으로 감추지 않고 failure rate를 별도 보고. 관측하지 않은 후보의 후회는 null.
- 지연: 입력 구성, planner, decision HTTP, CLI/process, dispatch, worker critical path, grade, 전체 연속 wall-clock을 분리. 단계 합산은 재구성 합계라고 명명.
- 비용: planner/decision/worker/monitor/grader/실패·fallback별 토큰과 비용. input/cache-write/cache-read/output을 나눔. 실제 청구·API 환산·월 구독 배분·예산 장부 별도.
- 호출: Claude planner/decision/worker, Jev, deterministic bypass, fallback 횟수. 실제 제거한 판단 호출과 새로 추가한 Jev 호출을 같이 표시.

실행 순서는 교차/무작위화하고 같은 과제를 반복한다. 비교 표에 n·원자료·모델 반환 버전·문서 hash·cache 조건을 명시한다. 개발 자료에서 선택한 .5/.65/.8 임계값은 held-out 비교 전까지 후보이며 운영 최적값으로 고정하지 않는다.

## 공식 자료에서 확인한 것과 적용 한계

모두 2026-10-09 웹 문서 열람. 아래는 공급자 기능 확인이며 우리 파이프라인의 성능 측정이 아니다.

- [Jev API reference](https://jev-ai.pro/docs): 동일 state의 named questions, choice/noul/score, 최대64질문·본문256000bytes, saved judge ID/revision, 불확실한 POST 재전송 주의가 문서화돼 있다. 저장된 질문은 관리 편의이며 청구 토큰 절감 보장은 없다. `usage.cost` 누락은 무료가 아니다.
- [Jev LLM Router](https://jev-ai.pro/llm-router): 의미가 있는 route 설명을 주고 typed 선택을 받아 실제 호출은 앱이 수행한다. 독립 질문을 묶을 수 있으며 low-confidence fallback과 현장 평가를 강조한다. 공개 예제 수치는 우리 속도·정확도 근거로 재사용하지 않았다.
- [Jev MCP Tool Router](https://jev-ai.pro/mcp-tool-router): next-tool/none, 누락 입력, 정책 판단을 분리한 예제다. 이를 collector 선택에 참고할 수 있지만 우리 실행 권한은 모델 확률이 바꿀 수 없다.
- [Jev Agent Evaluation](https://jev-ai.pro/ai-agent-evaluation): 요구사항과 실제 도구 근거를 대조하는 활용 예제가 있다. 우리 설계에서는 독립 채점을 유지하며 완료/finish 단일 gate로 도입하지 않는다.

**batch 제한:** 같은 state에서 독립적으로 답할 질문만 묶는다. 앞 질문이 선택한 task를 뒷 질문이 읽는 순차 추론을 한 요청에 가정하지 않는다. task별 후보가 고정돼 있으면 각 task 질문을 미리 만들 수 있으나 사용하지 않은 답·추가 입력 비용까지 계측한다. dispatch 직전 stale state 검사와 ready/ownership 재검사는 script가 수행한다. 단일 요청이 각 질문의 입력 처리량을 공짜로 공유한다는 보장은 없으므로 실제 usage로 확인한다.

## 인계

이번 수정은 이 문서 하나다. 실행기·질문 정본·모델 목록·예산·서비스를 변경하지 않았다. API 유료 호출0, commit/push 없음. parent가 입력 투영 구현 및 측정 계약과 연결해 implemented/proposed 경계를 최종 기록한다. 다음 우선순위는 중복 제거 검증, 근거 투영의 누락 부정 검사, frozen plan의 판단기 비교, 이후 template 선택 실험이다.
