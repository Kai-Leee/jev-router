# D027 — 문서 기반 작업 트리와 직접 실행 계약

2026-10-09. 사용자의 D026 수정 지시를 반영한다. 확정 방향은 문서 기반 후보, 사전 질문/규칙, 모델+추론 단계 선택, Jev 확률을 이용한 재귀 분할, 선택값→실행 함수 직접 연결, finish 제거다. 정확한 확률 사건·임계값·표본 규모·운영 모델 조합은 실험 설계 사항이다. 이번 산출물은 무과금 검증 하네스이며 실제 Claude/Jev 병렬 개발 실행을 대체하지 않는다.

## 이전 제안의 수정

- D026의 서브에이전트 규칙 keep/revise 중심에서 **생성할 작업자 역할·모델·추론 단계의 선택**으로 중심을 바꾼다. 계약 변경 감시는 향후 보조 기능이지 이번 목표가 아니다.
- `finish`/전역 완료 승인 Jev 질문을 새 흐름에서 사용하지 않는다. 과거 D025 로그와 구현은 비교 원본으로 보존하며 현재 runner를 조용히 교체하지 않는다.
- 선택값은 해석용 설명이 아니라 등록 실행 함수 또는 실행 프로필의 ID다. 메인 Claude의 같은 선택 재승인을 넣지 않는다.

## 앞단에서 만들 문서

사람은 목표와 원래 명세를 제공한다. 초기 Claude가 아래 문서 초안을 만들고 원문 추적 및 정적 검사 뒤 고정한다. 이 초기 생성의 호출/토큰/시간도 실험 비용에 포함한다. 모델의 보유 지식만으로 후보를 채우지 않는다.

| 문서 | 반드시 포함할 정보 | 왜 필요한가 |
| --- | --- | --- |
| Goal/requirements | 원문 목표, 비목표, 제약, 요구사항 ID별 원문/출처, 승인 기준, 해석 미정점 | 압축·분할 과정의 목표 유실 방지 |
| Task card | ID/부모/목적/범위, 입력 근거 ID, 출력 계약, 요구사항 참조, 선행 작업, 소유 파일/영역, 합칠 방식 | 작업 후보를 비교하고 실제 위임하기 위해 |
| Split sketch | 자식 후보의 짧은 목적·출력·의존성, 예상 중복/공유상태/통합 부담, 왜 병렬 가능한지, 빠진 정보 | 구체적 분할안이 없는 막연한 확률 질문 방지 |
| Worker profiles | profile ID, 역할, adapter, 정확한 model ID+effort 조합, 도구·쓰기 범위·동시성, 검증 여부와 출처 | 선택값을 실제 worker로 변환; 지원 안 되는 조합 방지 |
| Failure catalog | 범주 ID, 오류 특징·양성/혼동 사례, 필요한 근거, 담당 역할, 전달할 자료, handler ID | 반복 오류에서 매번 후보를 새로 생성하지 않기 위해 |
| Question pack | 질문 ID/버전/트리거, 영어 문장, 유형, 선택지 정의, 근거 부족 기준, 답→함수 매핑 | 추론 전에 질문·규칙 확정 및 반복 재사용 |
| Evidence records | 실행 명령/도구, 실제 exit 및 구조화 테스트 결과, 실패 위치, stdout/stderr 관련 원문, 파일/리비전 hash, 시각, 잘림/누락 | 요약을 실행 사실로 오인하지 않기 위해 |

문서는 사람이 읽는 Markdown과 실행기가 읽는 JSON으로 관리하되 JSON 정본으로 Markdown을 렌더하는 것을 권한다. 두 사본을 독립 수정하지 않는다. Jev에 파일 경로만 보내지 않고 **해당 문서의 실제 내용**을 state에 넣는다. 원본 참조/해시는 감사용이고 모델이 경로를 읽었다는 뜻이 아니다. 입력은 루트 제약+현재 노드+관련 조상 제약+직접 관련 후보/근거만 묶으며 누락 범위를 표시한다. 필요한 내용이 예산을 넘으면 잘라 추론하지 않고 수집/분할 질문 설계로 반환한다.

## 작업 트리와 의존성

작업 범위는 부모→자식 트리, 실행 순서는 별도의 선행 관계 그래프다. 형제라는 이유만으로 병렬 실행하지 않는다. root→API/UI→각 세부 역할 구조를 만들 수 있지만 공유 계약이 선행되면 그 뒤에 실행한다. 파일 소유권이 겹치거나 공용 자원이 있으면 직렬화/격리한다. 부모는 자식이 만든 결과를 모으는 통합 작업과 검증 작업을 반드시 가진다. 자식 결과가 모두 나왔다는 사실이 통합 성공은 아니다.

분할 전에 저비용 sketch만 만든다. Jev가 분할을 선택한 뒤 상세 자식 계약을 생성한다. 사전 sketch 생성에도 Claude 비용이 들며 이 비용을 숨기지 않는다. 각 자식에도 같은 판정을 재귀 적용할 수 있다. 낮은 확률이면 leaf로 진행한다. 분할 반복의 깊이/노드 수/시간/예산 제한은 명시 실행 정책이고 모델의 의미 판단을 대체하는 안전장치다.

## 분할 확률 질문 (실험 제안)

> Given this task, the proposed child scopes, their dependencies, available workers, and integration overhead, how likely is the proposed split to reduce total wall-clock time while preserving the stated acceptance criteria compared with executing this task as one unit?

`noul`로 p_split을 받고, 별도 choice로 `enough_evidence / insufficient_evidence`를 받는다. 분할 난이도나 Jev 자신의 confidence와 구별한다. 사건 정의는 "품질 기준을 유지하면서 분할하지 않은 실행보다 전체 시간이 짧다"이다. 실제 사건은 동일 조건의 비교 실행으로만 평가할 수 있다. p=0.8이 실제 성공률80%라는 뜻은 아니다.

- 근거 부족 → collect_evidence. 낮은 확률과 동일시하지 않는다.
- 근거 충분 + p_split < threshold → execute_leaf.
- 근거 충분 + p_split >= threshold + 코드상 구조/자원 조건 충족 → expand_task.
- 한계 초과/충돌 → 직렬 실행 또는 추가 계획. 이미 유효하지 않은 분할을 높은 확률이 허용하지 않는다.

사용자는 0.5/0.65/0.8 등 **여러 임계값 비교 후 결정**하는 방식에 동의했다. 현재 합성 민감도 실험은 이 세 값을 사용하며 운영 기본값은 아니다. 실제 운영 임계값은 아직 null이다.

## 작업자 생성 질문

> Which eligible execution profile best fits this task's scope, required capabilities, uncertainty, and acceptance criteria under the stated policy?

choice 후보는 모델과 effort의 유효한 조합을 묶은 profile ID다. 모델을 먼저 고르고 서로 지원되지 않는 effort를 따로 고르는 조합을 막는다. 역할(task card)과 profile을 합쳐 worker 생성 인자를 만든다. 프로필 하나뿐이면 모델을 물을 필요 없이 코드로 선택 가능하다. 미검증/미설치 프로필을 운영 후보에 올리지 않는다. fixture의 simulation adapter는 실제 model/effort 가용성 증거가 아니다.

## 실패를 문서 후보로 전달

오류를 담당 역할이 정해진 범주 안에서 분류하고 handler가 원문 로그/요구사항/파일을 바로 위임한다. 자동 문자열 규칙으로 확정되는 알려진 환경 오류는 코드로 처리한다. 의미가 모호할 때만 Jev를 호출한다. unknown/insufficient_evidence는 항상 보존한다. Jev 분류를 근본 원인 확정으로 쓰지 않는다.

서비스 choice 후보 상한은 255다. 최대 개수를 채우는 것을 목표로 하지 않는다. unknown 슬롯을 남겨 범주가 상한을 넘으면 명시적인 상위 범주→하위 범주의 순차 선택으로 나눈다. 실제 카탈로그를 몰래 앞부분만 잘라 선택하지 않는다. 첫 단계에서 잘못 분류되는 비율도 별도로 평가해야 한다.

## 요구사항 질문의 자체 생성과 다양한 답

초기 Claude가 각 원문 요구사항에 대해 영어 검증문장, 실제 확인 방법, 관련 근거 종류를 생성한다. 정적 형식 검증과 원문 대조 뒤 질문 pack에 버전 고정한다. 반복 평가에는 생성 호출이 없다. 새로운 요구사항에만 새 질문을 만든다. 이 자체 생성은 향후 모델 어댑터 작업이며 현재 fixture는 작성한 질문의 동작을 검증한다.

예시:
> For R17, does the current evidence demonstrate that a failed check is counted and reported under the required exit behavior? Distinguish missing execution, contradictory behavior, insufficient evidence, and an external blocker. Judge only the supplied revision.

답과 다음 동작:
- supported → record_requirement_evidence (전역 완료 아님)
- contradicted → dispatch_repair
- insufficient_evidence → collect_evidence
- needs_execution → run_verification
- blocked → record_blocker

운영 runtime은 정적 사실(검사 미실행/exit와 테스트 결과 불일치/필수 계약 미존재)을 먼저 적용한다. 완료를 강요하는 단일 finish는 없다. 사용자에게는 요구사항별 상태, 남은 작업/막힘, 통합 검사/독립 평가 결과를 보여준다. 평가기가 평가 종료를 기록하는 것과 Jev finish 선택은 별개다.

## 실행·감사·스킬 자료

매 판단에 input packet, 질문 버전, 실제 raw answer, 적용된 임계값/정책, handler/worker ID, 다음 관측을 연결한다. state hash 변경/unknown enum/누락/NaN을 거절하며 같은 선택에 메인 재승인을 넣지 않는다. 실패 API를 자동 replay하지 않는다. 모의 응답과 실응답은 서로 다른 evidence_mode로 저장한다.

스킬 생성용 자료는 목적/트리거/입력 문서/질문 원문/답 매핑/이유/예외/검증 명령/검증 결과/한계/인계 규칙으로 구성한다. 실제 성능 검증 전에는 "자동 개발 효율 향상 스킬"로 확정 배포하지 않는다. 기존 jev-decision-records 스킬로 이번 실험을 기록하고, 새 orchestration 스킬은 그 자료에서 후속 생성한다.

## 실험 단계와 반증

A. 무과금 계약 실험: 합성 답으로 임계값 아래/경계/위, 근거 부족, stale/잘못된 답, 실패 담당 위임, profile 전달, requirement별 handler, 충돌/선행/실패 전파를 검증한다. 이는 라우팅 코드 실험이지 Jev 품질·Claude 속도 측정이 아니다.
B. 고정 문서 실답 실험: 라벨된 다양한 작업에 Jev와 Claude 판단을 각각 기록. 질문 생성/근거 정리 비용 포함, 분할 예측 calibration·순서 민감도·보류율 측정. 공유 USD1 장부 재사용.
C. 동일 목표 구현 대조: 무분할/고정 분할/Jev 분할, 실행자 프로필 고정 비교와 Jev 프로필 선택 비교를 분리. 미관측 반대 실행의 시간은 추정으로 표기. 숨은 평가기 내용을 계획에 유출하지 않는다.
D. 기록 정리 후 스킬화: 반복 가능한 조건만 스킬 규칙에 반영. 임계값은 별도 정책 파일에 둔다.

주요 지표: 독립 품질 통과, 전체 wall time(계획+질문 준비+Jev+queue+spawn+작업+통합+재작업), 역할별 비용, task 수/깊이, 실제 동시 실행수, 충돌·재작업, 분할 확률 calibration, 선택 worker/model/effort, Claude 재판단 호출. 분할 횟수·합성 worker 중첩만으로 속도 개선을 주장하지 않는다.

공식 근거 확인 2026-10-09: https://jev-ai.pro/docs (typed formats/limits), https://docs.typesafe.ai/model-jaggedness/jev-1.13 (모델 한계). 공개 사례는 ../research/D026_PUBLIC_PATTERNS.md. 이번 하네스는 기존 운영 runner 및 대시보드와 자동 연결하지 않는다.
