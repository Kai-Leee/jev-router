# D039 — 더 큰 실험 과제 조사

2026-10-10. 사용자 요청: 현재 과제가 단순하므로 더 큰 과제로 확장할 수 있는지 확인. 조사만 수행했으며 채택·구현·유료 실행은 하지 않았다. [역할](../agents/D039_LARGER_TASKS.md), [측정 목록](D039_TASK_INVENTORY.json). jev-decision-records 스킬 적용.

## 결론과 선택 근거

가능하다. 다음 공개 과제의 첫 후보는 **openapi_python_client (구현 대상 이름 pyclientgen)**, 다른 구조의 비교 후보는 **diskcache**, 강한 의존성의 스트레스 후보는 **graphql-core**다. 기존 pytest-check는 회귀용으로 유지한다. Python을 유지하면 언어·도구체계 변경을 줄일 수 있다. 명세의 기능 결합과 통합 경계를 기준으로 추천했으며 모델 성공률이나 정답 코드는 사용하지 않았다. 이 후보들이 실제로 얼마나 오래 걸리고 비싼지는 미측정이다.

공식 E2E-SWE는 빈 작업공간에서 명세에 맞는 전체 저장소를 만들고 새 환경의 독립 검사로 평가한다. [공식 README](https://github.com/facebookresearch/E2E-SWE), 2026-10-10 웹 확인. 이번 후보의 구체 내용은 이미 복제된 commit `b11ac067b1dfe8ce8b6db245d88756f426007797`의 공개 instruction.md와 task.toml로 확인했다. GitHub 개별 명세 웹 열기는 cache miss로 실패했으므로 실시간 웹 확인으로 표현하지 않는다. 숨겨진 test body와 solution은 읽지 않았다.

## 후보 비교

| 과제 | 명세에서 확인한 범위 | 분할 실험에서 보는 특성 | 명세 bytes / 선언 검사수 |
|---|---|---|---|
| pytest-check (기존) | soft assertion, pytest 연동·보고·패키징 | 작은 회귀 기준 | 8648 / 30 |
| openapi_python_client | OpenAPI JSON/YAML 해석, 타입·enum·union 모델 생성, client/endpoint 생성, 설정·진단·패키징 | 공통 타입/이름 계약과 생성 산출물의 통합; 첫 확대 추천 | 19656 / 63 |
| diskcache | SQLite/파일 저장, 만료·축출, 트랜잭션, FanoutCache, Deque/Index, Django backend, lock 등 | 공통 저장 계층 위 기능군; 상태·동시성·영속성 | 17340 / 60 |
| graphql-core | lexer/parser/AST, 타입 체계, validation, execution, schema utilities | 공유 AST·타입에 의존한 통합; 무리한 분할의 실패 측정 | 24404 / 22 |
| apscheduler | trigger, async scheduler, store, event, serialization | 비동기 상태·시간·backend 연동; 명세가 길지 않아도 어려운 후보 | 7774 / 21 |
| mongita | 메모리/디스크 DB, query/update/cursor/index API | 저장·질의·변경의 일관성; 예비 후보 | 16459 / 24 |

bytes는 UTF-8 원본 파일 바이트이며 토큰·구현 LOC·실제 난이도가 아니다. 검사수는 task.toml의 선언값으로 실행 통과수가 아니다. GraphQL의 검사수가 pytest-check보다 적어도 이를 더 쉬운 과제로 판정할 근거는 없다. 서로 다른 과제의 부분 통과율을 합쳐 동일한 난이도 점수로 쓰지 않는다.

재현: 저장소 루트에서 `wc -c .benchmarks/E2E-SWE/tasks/{pytest-check,openapi_python_client,diskcache,graphql-core,apscheduler,mongita}/instruction.md` 및 `rg -n 'test_case_count|cpus|memory_mb|timeout_sec' .benchmarks/E2E-SWE/tasks/{pytest-check,openapi_python_client,diskcache,graphql-core,apscheduler,mongita}/task.toml`. 목록 JSON은 Python3.14 pathlib.read_bytes/hashlib/tomllib로 생성했다. 첫 시스템 python3 실행은 tomllib 미설치로 실패했고 기존 `/opt/homebrew/bin/python3.14`로 재실행했다. 추가 설치 없음.

공개 원문:
- [OpenAPI task](https://github.com/facebookresearch/E2E-SWE/blob/b11ac067b1dfe8ce8b6db245d88756f426007797/tasks/openapi_python_client/instruction.md)
- [DiskCache task](https://github.com/facebookresearch/E2E-SWE/blob/b11ac067b1dfe8ce8b6db245d88756f426007797/tasks/diskcache/instruction.md)
- [GraphQL task](https://github.com/facebookresearch/E2E-SWE/blob/b11ac067b1dfe8ce8b6db245d88756f426007797/tasks/graphql-core/instruction.md)
- [APScheduler task](https://github.com/facebookresearch/E2E-SWE/blob/b11ac067b1dfe8ce8b6db245d88756f426007797/tasks/apscheduler/instruction.md)

## 규모보다 실행 구조: 현재 한계

현재 source 확인:
- `src/orchestration/live-file-workers.mjs:validatePlan`: 작업 수 최대4, 의존성은 DAG지만 재귀적 하위 계획 생성 없음.
- 같은 파일 `runFileArm`: concurrency1/2, batch barrier, 지정 파일을 한 번 생성. 작업자는 테스트·명령 실행 불가, `observed_checks`는 비어야 한다. 재작업/통합 수리 loop 없음.
- `scripts/tree-e2e-pilot.mjs`: 초기 plan_ready 하나, 현재 기본 자동은 이 지점에만 연결. 모든 작업 단계가 자동 Jev 평가되는 것은 아님.
- `benchmarks/e2e-swe/manifest.json`과 adapter: pytest-check 전용 task/image/count/source 고정. 새 task 이름만 입력하면 즉시 정확하게 채점되는 구조가 아님.

단순히 큰 명세를 넣는 첫 비교는 이 동일 scaffold에서 가능한 범위로 표시해야 한다. 본격 큰 과제 실험은 다음을 공통 조건으로 마련하는 별도 harness revision이다: task별 이미지/명세/채점 manifest, 빈 제출·참조 제출로 검사기 검증, 실제 격리 build/test/edit loop, 파일 소유권과 변경된 인터페이스 전달, 의존 작업 완료 시 다음 작업 실행, 통합/수리 후 독립 최종 검사. 참조/숨겨진 검사는 evaluator만 접근하고 구현 agent에는 공개 명세·자체 개발 검사만 준다.

계획을 더 깊게 쪼갤 수 있어야 하지만 작업 수를 무조건 늘리지는 않는다. split/no-split을 Jev가 고를 후보와 근거를 제공하고 작업 수·트리 깊이·실제 병렬도·통합 실패·재작업을 측정한다. 후보 생성/확장에 쓰인 Claude 비용도 기록한다. 공유 시간·비용·동시성 자원은 조건 사이 동일하게 고정하되 값은 새 실행 계획에서 정한다. 기존 USD1 Jev 공유 한도는 유지한다.

## Personal OS는 이미 큰 과제

`benchmarks/personal-os/agent/GOAL.md`는 캘린더/Backlog, 상태와 일정 변경, 반복, category/context, Focus/time, 앱 재시작, notes/review, 폴더 온보딩, macOS 메뉴, 데이터 보존까지 포함한다. 기능 추가보다 기존 전체 목표를 실제로 생성·검증하는 것이 먼저다.

다음은 evaluator 관측 단계 제안이며 agent에게 강제하는 작업 목록이나 최종 범위 축소가 아니다:
1. Markdown 데이터 무결성과 재실행: 저장·변경·반복·동일 동작 중복·외부 변경 충돌.
2. 실제 앱 사용: 날짜 탐색→생성→이동→Focus→기록→재시작의 연결된 시나리오. UI와 디스크 결과를 각각 확인.
3. 전체 macOS: 폴더 선택·취소·온보딩, 창 재실행, 메뉴바 상태/명령, 중단 복구와 산출물 검사.

독립 검토자는 rubric의 기준 그룹을 deterministic/browser/native/artifact로 확인했다. 고정된 동일 예산 안에서 검증 완료·실패·미실행 기준을 따로 보고하며, 가중치 없는 임의 총점을 만들지 않는다. 실제 앱 adapter 없이 evaluate.py가 exit 0이어도 완료가 아니다. `overall_status`, `full_product_verified`와 기준별 실행 상태를 확인한다.

부분 검사 통과를 전체 앱 완성으로 승격하지 않는다. Linux/browser 통과만으로 native 통과를 주지 않는다. README상 실제 app adapter와 전체 앱 검증은 아직 준비되지 않았다. evaluator selftest는 생성 앱의 품질 증거가 아니다. 원본 앱/Vault는 사용하지 않고 별도 빈 디렉터리와 synthetic-vault만 사용한다.

목표·기록 형식·외부에서 관찰 가능한 acceptance만 agent에 제공한다. 위 기능군을 고정 task tree로 제공하지 않는다. 작업 분해·역할·순서를 누가 어떻게 선택했는지가 측정 대상이다.

## D038 비교 설계의 확장

- 분할 진단: 같은 공개 과제·frozen plan에서 single/serial split/parallel split 비교. 모델·도구·입력 계약 동일. 큰 과제에서는 실제 생성 task 수가 달라지므로 이전의 36호출 제안을 그대로 적용하지 않는다.
- 계획 대체: 별도 cohort에서 Claude 통합 계획+선택 / Claude 계획+Jev / generic template+Jev를 같은 최종 목표로 시작. tree를 미리 정해주지 않는다. template에 없는 과제의 fallback 비용 포함.
- 장기 workflow: 계획 준비뿐 아니라 실제 공개 개발 검사 실패/인터페이스 변경/근거 부족 뒤 checkpoint. 미구현 handler는 연결 완료 후 평가하고 모의 분류 통과를 실제 복구로 세지 않는다.
- 여러 과제의 결과는 개별 성공/실패·시간·토큰·환산비용을 우선 보고하고 성공률 분모는 독립 과제수/시도수를 구분한다. 가장 유리한 과제만 남기거나 어려운 실패를 제외하지 않는다.
- 선언 자원은 선정 과제들에 CPU6, memory8192MiB, agent timeout14400초로 같다. 이는 metadata 한도이지 실제 걸릴 시간/메모리·미래 지출액이 아니다. 이미지 가용성·host resource를 새로 검증하기 전 실행 준비 완료라고 하지 않는다.

**추천:** 공개 비교 첫 확대는 OpenAPI, 다른 결합 구조 검증은 DiskCache, 분할에 불리할 수 있는 스트레스는 GraphQL. Personal OS는 병행하는 실제 제품 track으로 유지. 전체 후보를 한꺼번에 반복 실행하지 말고 새 grader/harness 무과금 검증 후 선택된 큰 과제에서 비교한다. 구체 runtime/cost는 측정 전 unknown이다.

부수효과: D039 역할/조사/목록/기록과 index만 추가·갱신. 새 API 추론·이미지 pull·benchmark 실행·실제품 수정 없음. 기존 미커밋 소스 보존, commit/push 없음.
