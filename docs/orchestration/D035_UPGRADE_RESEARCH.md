# D035 — 반복 판단을 실제로 없애는 자동 라우팅 업그레이드 조사

확인일: 2026-10-10. 범위: 공식 문서·원저자 저장소·논문 초록 확인과 현재 코드 대조. 사용자 요청은 추가 조사다. 아래는 **제안**이며 운영 정책 채택·구현·신규 유료 실험을 뜻하지 않는다. 담당: main. 문서 규칙: jev-decision-records.

## 먼저 확인한 현재 한계

[D034 감사](D034_ROUTING_AUDIT.md), `src/orchestration/routing-policy.mjs` 기준으로 기본 forced는 Jev의 선택을 실행에 반영하지 않고 두 arm을 비교한다. jev 모드에서는 선택이 실행되지만 계획 생성은 남는다. MCP 등록 자체는 매 턴 자동 호출 증거가 아니다. 질문/실패/작업자 선택의 모의 경로와 실제 pilot 연결을 구분한다.

[D033 결과](D033_RESULTS.md)의 입력 축소는 Jev 효과가 아니다. 해당 실험은 작업자 입력 구성의 효과를 측정했다. 입력 축소와 라우터 변경을 동시에 적용해서 Jev 절감으로 보고하면 원인을 구분할 수 없다.

## 공개 근거와 전이 한계

1. [Jev API 공식 문서](https://jev-ai.pro/docs): 같은 state의 여러 typed question, saved judge와 revision, 오류별 처리 제공. saved judge는 반복 질문의 버전 관리에 쓸 수 있으나 입력 토큰 할인이나 서버 결과 캐시를 보장하지 않는다. timeout 이후 결과 확인 전 POST 재전송을 피해야 한다. 문서 확인 수준이며 새 계정 호출 검증은 하지 않았다.
2. [RouteLLM 원저자 저장소](https://github.com/lm-sys/RouteLLM): 라우터와 임계값을 분리하고 실제 요청 분포에 가까운 자료로 임계값을 조정한다. 강한/약한 모델 선택 구조를 참고할 수 있으나 우리 작업 분할 확률의 정확도를 검증해 주지는 않는다. README의 특정 임계값 예시는 문단 사이 수치가 일치하지 않아 값을 복사하지 않는다.
3. [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents): 고정 workflow의 분류·분기와 동적 orchestrator의 계획 생성을 구별한다. 반복 가능한 분기는 코드/분류기로 처리하고 새 구조 생성만 생성 모델에 남기는 근거다. 병렬화가 언제나 저렴하다는 근거는 아니다.
4. [Rao·Callison-Burch, JEV vs. LLMs as Rubric Judges, v2](https://arxiv.org/abs/2609.29769v2): rubric 판정에서 Jev와 LLM 오류의 상관 때문에 cascade의 정확도 개선이 제한될 수 있다고 보고한다. 이번 확인은 초록/서지이며 전체 표·코드 재현은 하지 않았다. SWE나 Opus5.5 실험이 아니므로 성능 수치를 우리 시스템으로 옮기지 않는다.
5. [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents): 모델의 완료 선언과 실제 환경 outcome을 구분하고 반복 trial, 격리 환경, 가능한 경우 코드 grader를 권한다. 라우팅 성공과 결과물 성공을 별도 측정하는 근거다.

## 제안하는 실행 구조

```text
checkpoint event
  → 최신 상태/허용 후보를 코드로 검증
  → 선택이 유일하거나 정확한 규칙으로 정해지면 직접 실행
  → 동일 근거·후보·정책의 유효한 결정 캐시가 있으면 재사용
  → 고정 질문 + 필요한 근거만 Jev 호출
  → 타입·후보·근거 버전 재검사
  → 선택값에 연결된 handler 실행
  → 실제 결과 기록

근거 부족 → 근거 수집 handler → 상태 변경 후 재판정
정의되지 않은 새 작업 → Claude 계획 생성 → 다시 checkpoint
```

Claude가 Jev 답을 매번 다시 해석하거나 승인하지 않는다. 반면 stale evidence, 잘못된 타입/후보, 권한·쓰기 충돌 검사는 코드가 유지한다. Jev는 새 권한을 만들지 못한다. 확률은 코드 검증의 대체가 아니다.

### 우선순위별 변경

| 순서 | 현재에서 바꿀 부분 | 없애려는 작업 | 입증할 항목 |
|---|---|---|---|
| 1 | 자동 checkpoint dispatcher와 평가 전용 forced 명칭 분리 | 호출만 하고 답을 버리는 흐름, Claude 재승인 | event→request→decision→handler가 같은 ID로 연결되는가 |
| 2 | 결정 전 script bypass와 정확한 결정 캐시 | 정답이 기계적으로 정해진 판단, 동일 상태 재호출 | bypass/cache hit, stale 재사용 거절, 순 호출 감소 |
| 3 | 결정 종류별 state builder와 고정 질문 연결 | 반복 질문 작성, 관계없는 전체 문맥 전달 | 필수 근거 보존, 실제 입력 토큰·정확도 |
| 4 | 검증된 작업 template 선택 후 필요한 부분만 확장 | 매번 전체 계획 생성 | Claude planner 호출 감소와 독립 품질 |
| 5 | 근거 수집/실패 담당 선택을 실제 handler에 연결 | 실패마다 메인 Claude가 원인 분류·담당 재선정 | 잘못된 위임, 복구 성공, 추가 단계 비용 |
| 6 | 준비된 작업을 즉시 투입하는 scheduler | stage 전체 종료 대기 | 동일 작업·동시성에서 makespan과 충돌 |

우선순위는 제안이며 속도/비용 개선량은 미측정이다. scheduler의 DAG 준비 여부·자원 제한·파일 잠금은 코드가 처리한다. Jev는 준비된 후보 중 의미상 우선순위나 복구 담당이 모호할 때만 선택한다.

### 1. 자동 호출의 정확한 의미

대상 event는 `plan_ready`, `ready_set_changed`, `failure_observed`, `requirement_evidence_changed`로 시작한다. 시간 경과나 모든 토큰/턴을 trigger로 삼지 않는다. 동일 evidence hash의 반복 event는 중복 제거한다.

운영 제안 `auto`는 script→cache→Jev 순서, 평가용 `force_jev`는 script/cache를 우회하지만 실제 선택한 한 경로만 실행한다. 과거 `forced`는 `counterfactual_both`라는 별도 평가 의미로 유지/명시한다. 실제 옵션 변경은 이번에 하지 않았다. `auto`에서 Jev 호출이 없으면 사유가 반드시 남아야 한다.

대시보드 proposed fields: `event_id`, `decision_id`, `authority`, `skip_reason`, `request_hash`, `resolved_model`, `evidence_revision`, `choice`, `probability`, `handler`, `decision_used`, `outcome`, `latency_by_stage`, `usage`, `cost_basis`. `jev_called`와 `decision_used`를 별도 표시한다. 강제 shadow 판정은 실제 Claude 생략 건수에 넣지 않는다.

### 2. 결정 캐시와 Claude prompt cache를 분리

Claude prompt cache는 입력 재처리 비용을 바꾸지만 호출 자체를 없애지 않는다. 제안하는 결정 캐시는 이전 선택을 재사용해 Jev 호출을 생략한다. 최초 구현은 의미 유사도 캐시가 아닌 exact key로 제한한다.

key 구성: task/goal revision + 질문/정책 hash + projection schema + 근거 내용 hash + 허용 후보/권한/모델 capabilities + resolved Jev model. latest alias의 대상이 바뀌거나 대상 버전을 확인할 수 없으면 이전 결정 재사용을 보수적으로 무효화한다. 자원 상태처럼 변하는 정보는 dispatch 직전에 재검사한다.

성공적으로 검증된 결정만 저장한다. TTL만으로 코드/근거 변경을 감지했다고 간주하지 않는다. 외부 부수효과가 있는 handler의 중복 실행 방지는 별도 execution key로 관리한다. 결정 캐시 hit가 실행 완료를 뜻하지 않는다.

### 3. 질문·자료 연결

현재 정본 `docs/orchestration/contracts/questions.v1.json`을 유지하고 event→question ID→state schema→handler를 매핑하는 계약을 추가하는 방향이다. 경로를 알려주는 것만으로 Jev가 로컬 문서를 읽지는 않으므로 controller가 필요한 내용을 읽어 payload에 넣고 원본 경로/hash는 로컬 영수증에 남긴다.

- 분할 판단: 목표/제약, 작은 분할 sketch, 의존관계, 쓰기 범위, 예상 통합 부담, 가용 병렬도. 아직 측정하지 않은 시간 예측은 unknown.
- 실패 담당: 실패 명령·exit code·관련 로그 구간·영향 파일·역할 후보. 전체 대화 불필요.
- 요구사항 판정: 요구사항 원문·관련 산출물/검사 결과·판정 기준. 관련 없는 요구사항 제거는 검증된 매핑이 있을 때만.
- 작업자 선택: 작업 난도 근거·필요 도구·허용 모델/effort. 현재 작업자 고정 조건은 유지하고 동적 모델 실험은 후순위.

같은 state를 보는 독립 질문은 묶을 수 있지만 토큰 절감은 실제 usage로 확인한다. 앞 질문의 답이 다음 질문 후보를 바꾸면 별도 단계다. saved judge는 로컬 질문 hash와 원격 revision을 동기화하는 관리 수단으로 검토하되 비용 최적화로 선전하지 않는다.

### 4. 분할 전에 전체 분할 계획을 생성하는 비용

현재 상세 계획을 Claude가 모두 만든 뒤 Jev가 split/single을 고르면 계획 비용은 이미 지출됐다. 반복 유형은 검증된 template에서 작은 sketch를 꺼내 Jev로 선택한 뒤 선택된 branch만 확장하는 방식을 시험한다. 새로운 구조가 필요한 과제에서는 Claude의 생성 역할을 남긴다.

분할 질문의 목적은 기존 합의대로 품질을 유지하면서 전체 시간을 줄일 가능성이다. 비용 증가 허용 범위는 별도 제약으로 표시한다. 확률 하나에 시간·가격·정확도를 숨겨 합치지 않는다. 기존 비교 임계값을 개발 자료에서 비교하고, 선택에 쓰지 않은 과제로 확인한다. 성공한 single/split 짝이 없는 과제는 분할의 정답 확률 calibration 자료로 만들지 않는다.

### 5. 재판정보다 새 근거

낮은 확신→같은 정보로 Claude 재질문을 기본 fallback으로 정하지 않는다. 실패 로그 확보, targeted test, 누락된 파일 읽기처럼 판정 정보를 늘릴 수 있는 handler를 먼저 선택한다. API 장애는 실패 원인과 결과 불확실성을 구분한다. 무조건 재호출하거나 다른 provider로 몰래 바꾸지 않는다. 종료 선택값 `finish`는 추가하지 않는다. 완료에 관한 관측은 independent grade/outcome으로 기록한다.

## 검증 설계 — 아직 실행하지 않음

비교를 두 층으로 분리한다.

1. 같은 frozen plan에서 script / Claude 별도 선택 / Jev 강제 선택 / auto 비교: 순수 판단 비용과 실제 선택 경로 효과 측정.
2. 목표부터 시작해 Claude 계획+선택 통합 / template+auto / 필요 시 Claude 생성 비교: 전체 시스템 비용 측정. Claude에게 불필요한 별도 선택 호출을 강제한 baseline만으로 절감을 주장하지 않는다.

입력 template, 작업자 모델/effort, grader/image, 과제, 동시성을 고정한다. D033의 output_dedup 채택 실험은 별도 축으로 둔다. 독립 trial과 실행 순서를 섞고 cache 상태/creation/read를 기록한다. 한 과제의 반복만으로 일반화하지 않는다. 분할 필요/불필요, 새 실패/반복 실패, 근거 부족, stale cache를 모두 포함한다.

필수 지표와 분모:

- 호출률 = Jev 실제 요청 수 / 전체 eligible checkpoint 수. skip reason별 개수도 공개.
- 결정 사용률 = handler 선택에 사용된 유효 결정 수 / 유효 Jev 응답 수. 분모가 없으면 NA.
- Claude 판단 생략 = 같은 작업의 paired baseline 호출 수 − 비교군 호출 수. planner/decision/worker/repair 별도.
- 순 환산비용 차이 = baseline 전체 환산비용 − 비교군 전체 환산비용. 후보 생성·자료 준비·라우터·복구 포함. 월 구독 배분과 실제 청구 분리.
- 품질 = independent outcome 성공 trial 수 / 모든 시작 trial 수. 인프라 실패도 별도 사유로 공개하고 사라지게 제외하지 않음.
- 지연 = 목표 접수부터 검증 가능한 산출물까지, 준비/판단/대기/생성/채점 별도. HTTP 지연만으로 E2E 개선 주장 금지.
- 동일 과제에서 관측된 대안 대비 손실과 잘못된 분할률. 양쪽 outcome 없는 경우 반사실 결과 unknown.
- 확률 calibration은 정의된 label이 있는 held-out 짝만 사용. coverage와 Brier/reliability를 함께 보고, 자기평가 확신을 정답으로 사용하지 않음.

## 권장 다음 단위와 이번 경계

먼저 event 계약·자동 bypass·결정 영수증을 구현하고 저장된 응답/실패 fixture로 검증하는 작은 변경이 적합하다. 이어 exact cache와 state projection, 이후 template planner 절감과 실험 순서가 좋다. 동적 모델 변경·온라인 학습·의미 유사도 캐시는 초기 원인 분석을 복잡하게 하므로 뒤로 둔다.

이번에는 문서 조사만 완료했다. 새 Claude/Jev 추론·운영 설정 변경·컨테이너 생성·PersonalOS 변경·commit/push는 하지 않았다. 새 연구/결정 문서와 기존 미커밋 변경이 남는다. 공개 논문 재현과 이 제안의 실제 절감 검증은 미수행이다.
