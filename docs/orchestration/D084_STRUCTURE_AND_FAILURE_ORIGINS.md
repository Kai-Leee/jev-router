# D084 — 전체 개발 구조와 문제 발생 위치 (분석만, 유료 호출 없음)

사용자는 D083 수정이 쓰이는 조건, 문제가 어디서 생기는지, 구조를 자세히 보도록 지시했다. 범위는 `d083-repair-fixes.json`(v12) 경로와 실행 D080-01..03, D081-01..03, D082-cloud-01..08, D083-cloud-01..03이다. 근거는 각 실행의 `result.json`, `planning.json`, `adaptive-execution/{journal.jsonl,result.json}`과 저장소 코드다. 숨김 검사는 개수만 썼다(분석 중 `d081-prereview-grade-02/evaluation.json`의 숨김 검사 이름 하나가 노출됐으나 사용하지 않았다).

## 1. 구조 (실행 순서)

| # | 단계 | 결정 주체 | 주요 출력 | 멈춤 코드 예 |
|---|---|---|---|---|
| 1 | catalog 재사용 | 코드 (D066 Claude 1회 생성물 고정) | 21 unit · 22 artifact · 38 path | `ADAPTIVE_PREPARATION_*` |
| 2 | preflight | 코드 | `preflight.json` | `ADAPTIVE_PREFLIGHT_BLOCKED` |
| 3a | unit 쌍 관계 | **Jev** choice, 210쌍 / 4요청 | 관계 | `ADAPTIVE_LAYERED_ANSWER_INVALID` |
| 3b | 묶음 | 코드 (깊이 2, 목표 leaf 4, merge 0.5) | cluster | `_CAPACITY_INFEASIBLE` |
| 3c | leaf·DAG | 코드 | leaf별 write scope, read scope = **직접 생산자 파일만** | `ADAPTIVE_LEAF_CONSERVATION` |
| 4 | 스케줄 | 코드 (요구사항 수 × 상수) | 우선순위 | `ADAPTIVE_COMMIT_FAILED` |
| 5 | 프로필 | **Jev** choice (모델×effort) | `profiled-planning.json` | `_PROFILE_SELECTION_STOPPED` |
| 6 | 회차0 구현 | **Claude 작업자** leaf별, 동시 2 | artifact | 첫 실패 뒤 새 작업 미투입 |
| 7 | 준비 검사 | 코드 (ast/tomllib/bash -n) | envelope | `ARTIFACT_CHECK_NOT_PASSED` |
| 8 | 공개 검사 | 코드 8검사·93사례 | failure 객체 | — |
| 9a | 수리 범위 | 코드 (assertion contract → causal chain, 봉인) | `repair_scope` | `ADAPTIVE_CAUSAL_*` |
| 9b | owner 추론 | **Jev** choice, 실패 사례마다 1개 artifact | owner 배정 (projected, 오류 시 raw), 진단 첨부, 예산 packing·split | `ADAPTIVE_REPAIR_BUDGET_EXCEEDED` |
| 9c | 범위 규칙 | **코드** union (+ worker-mentioned 확장) | 선택 후보 | `_NO_INFERRED_OWNER` |
| 9d | 수리 프로필 | **Jev** | 프로필 | — |
| 9e | 수리 작업자 | **Claude**, 선택 artifact만 쓰기, 실패 후보 전체 읽기 | 새 revision, worker report | `_CARRY_DRIFT` |
| 9f | 반복 | 코드, 최대 2회 | — | — |
| 10 | 명세 검토 | **Claude** 1회, 공개 93/93 뒤만 | 공개 93 재통과 시 채택 | 실행 실패로 만들지 않음 |
| 12 | 독립 채점 | root 별도 스크립트 | 63 숨김 검사 | `ARM_NOT_GRADABLE` |

```
catalog(고정) ─► [Jev] unit 관계 ─► 코드 묶음 ─► DAG(read=직접 생산자) ─► 코드 스케줄 ─► [Jev] 프로필
 ─► 회차0 [Claude] leaf ─► 준비검사 ─► 공개 93 ──통과──► [Claude] 명세검토 ─► 공개 재검 ─► 결과 ─► (root) 숨김 63
                                         │실패                                                   ✗ 되돌아가지 않음
                                         ▼
          코드 causal 범위 ─► [Jev] 실패별 owner 1개 ─► 코드 union(+확장) ─► [Jev] 수리 프로필 ─► [Claude] 수리 ─┐
          ▲─────────────────────────────── 최대 2회 ◄─────────────────────────────────────────────────────┘
```

**되돌아가는 정보**: 공개 실패 → 같은 회차 owner 요청. 수리 작업자 보고 → 다음 owner 요청 1회만(회차마다 초기화, 이후엔 `repair_history`만 남음). 회차0 구현 작업자는 진단을 남기지 않는다.
**되돌아가지 않는 정보**: 공개 실패가 catalog·unit 관계·묶음·leaf 경계·read scope를 다시 열지 않는다. 명세 검토 결과, 독립 채점 결과도 어디에도 들어가지 않는다.

## 2. 문제가 생긴 위치 (실행 15개)

| 실행 | 회차0 실패 | 수리 | 공개 / 독립 | 원인 분류 |
|---|---|---|---|---|
| d080-01 | R10.02·provenance 8·diagnostics | A14+A21, 10→0 | 93 / 63 | 통합, 작업자 |
| d080-02 | 시작 전 `BUDGET_OUTSTANDING` | — | — | 인프라 |
| d080-03 | 생성 endpoint SyntaxError(http-client 17 미실행) 외 | owner 요청 예산 초과 | 실패 / 60 | 작업자, 통합, 예산 |
| d081-01 | 없음 | — | 93 / 63 | — |
| d081-02 | 없음 | — | 93 / **62** | 공개↔독립 차이 |
| d081-03 | enum·nullable·Swagger | owner HTTP 502 | 실패 / 60 | 작업자, 공급자 |
| d082-01 | ModuleNotFoundError(api 패키지 0) | 6 artifact 선택, A21만 변경, 11→0 | 93 / 63 | 통합, owner 과대 |
| d082-02 | 생성 `__init__.py` SyntaxError, 5검사 미실행 | r0 A02(오지정)·A03 변경 없음; r1 raw 예산 초과 | 실패 / — | 통합, **owner 오지정**, **예산** |
| d082-03 | 없음 | — | 93 / 63 | — |
| d082-04 | R10.02 9 | r0 A14 9→9; r1 A14+A19 9→0 | 93 / 63 | 통합, 범위 |
| d082-05 | R10.02 9 | A14 9→0 | 93 / 63 | 통합 |
| d082-06 | R10.02 9 + multipart 2 | r0 A14+A19 11→9; r1 A07 9→9 | 실패 / — | 통합, **범위**, owner |
| d082-07 | 없음 (ir·operations·template가 한 leaf) | — | 93 / 63 | — |
| d082-08 | 사용자 중단 | — | — | — |
| d083-01 | 없음 | — | 93 / 63 | — |
| d083-02 | R10.02 9 | A14 9→0 | 93 / **61** | 통합, 공개↔독립 차이 |
| d083-03 | R10.02 9 + R15.01 | r0 A14+A17 10→9; r1 A19 9→0 | 93 / 63 | 통합, 범위 |

공개+독립 모두 통과는 시작된 15개 중 9개. 회차0에서 모든 공개 검사를 통과한 실행은 13개 중 5개.

**원인 빈도** (중복 포함): artifact 간 통합 9, 회차0 작업자 품질 6, 수리 범위·예산 5(종료 3), owner 추론 4(명백한 오지정 1), 공개↔독립 차이 2, 인프라·공급자 2, 분해 자체 0(아래 상관은 가설).

**반복 실패 지점**
- 요청 본문 설명(R10.02, `schema-models`·`description-provenance`)이 회차0에서 13개 중 7개 실행에서 실패했다. owner는 6번 모두 A14(`schema/operations.py`)를 골랐다. A14만으로 고친 것은 3회, A19(`endpoint_module.py.jinja`)까지 한 회차 더 필요한 것 2회, 끝내 못 고친 것 1회(d082-06, 필요 파일 A07·A21·A19).
- 가설: A07(`ir.py`)과 A14가 다른 leaf에 있으면 R10.02가 7회 중 5회 실패, 같은 leaf면 6회 중 2회. ir·operations·template을 한 leaf에 둔 d082-07은 깨끗했다(n이 작다).
- 생성 코드의 SyntaxError/ImportError는 검사 하나를 통째로 막고, 막힌 검사는 owner 질문에 사례로 들어가지 않는다(미실행 목록만 남음).

## 3. D083 수정이 쓰이는 조건

| 수정 | 필요한 조건 | 과거 19개 owner 결정 중 |
|---|---|---|
| repair-budget-v3 raw 단계 | 공개 검사가 import 단계에서 깨져 raw 표현으로 전환(`PUBLIC_ERROR_OR_UNEXECUTED_EVIDENCE`) **그리고** 회차1 이상(진단·history 상세 존재) **그리고** 앞 raw 단계 뒤에도 목표 초과 | raw 전환 4회, 그중 v3가 결과를 바꾼 것 **1회**(d082-02 r1: 예산 초과 → 4 part 통과) |
| worker-mentioned 확장 | 회차1 이상 수리 작업자 보고 **그리고** 남은 실패 **그리고** 범위 밖 같은 artifact를 min(2, 작업자 수)명 이상이 지목 | 전제 충족 4회(모두 남은 실패 있음), 기준 충족 **2회**(d082-04 r1 → A07, d082-06 r1 → A21; 두 실행은 규칙이 꺼진 D082) |

D083-01..03에서는 owner 요청이 모두 projected였고, d083-03 r1은 범위 밖 지목이 1명뿐이라 두 수정이 쓰이지 않았다.

## 4. 구조적 약점 (코드 사실 → 가설 순)

1. **실패 하나당 owner 1개, 범위는 코드 union.** 여러 artifact를 같이 고쳐야 하는 결함(R10.02)은 확장 규칙이 아니면 회차를 나눠서만 고칠 수 있고, 회차는 2회뿐이다.
2. **leaf는 인터페이스 글만 보고 만든다.** read scope가 직접 생산자 파일뿐이라 d083-01은 leaf 5개 중 4개가 빈 read scope였다. 통합 결함이 공개 검사에서야 드러난다.
3. **공개 실패가 계획으로 돌아가지 않는다.** 같은 R10.02 실패가 실행마다 반복돼도 분해·leaf 경계는 바뀌지 않는다.
4. **막힌 검사는 owner 질문에서 빠진다.** import 오류로 미실행된 사례는 owner 후보 판단 대상이 아니고, raw 전환을 일으켜 요청을 크게 만든다.
5. **공개↔독립 차이를 잡는 장치가 없다.** 명세 검토는 실행 없이 Claude 1회, 채택 기준은 공개 93만이다. 독립 채점은 결과에 다시 들어가지 않는다.
6. **정보 축소**: worker report 1000자 절단, 지목은 정확한 경로 문자열 일치, Jev confidence는 검증만 하고 쓰지 않는다.
7. **고정값**: 수리 2회, 목표 leaf 4, 깊이 2, merge 0.5, 질문 64, 28,800 추정 토큰, 확장 최대 2·기준 min(2,n).

## 5. 다음 후보 (제안, 미결정)

- **A. R10.02 통합 결함을 계획 단계에서 막기**: ir(A07)·operations(A14)·endpoint template(A19)·generator(A21)처럼 같은 데이터 흐름을 다루는 artifact를 같은 leaf로 묶거나, 서로 파일을 읽게 한다. 오프라인으로 과거 planning에 적용해 leaf 배치만 먼저 비교할 수 있다.
- **B. 막힌 검사를 owner 질문에 넣기**: import 오류 사례를 "생성 파일 경로 → 생산 artifact"로 연결해 owner 질문에 포함하고 projected 표현을 유지한다(raw 전환 감소).
- **C. owner 질문을 복수 선택으로**: 실패 하나에 artifact 여러 개(v4 계약, v10 pin 영향 있음).
- **D. 공개↔독립 차이 조사**: 독립 실패는 개수만 볼 수 있으므로, 공개 검사 범위와 명세(요구사항) 대응표의 빈칸을 찾는 방식으로 본다.

각 후보는 먼저 기록된 실행 데이터로 오프라인 재현을 하고, 유료 측정은 조건당 3회로 제한한다.
