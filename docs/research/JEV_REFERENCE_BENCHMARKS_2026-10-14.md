# Jev 활용 프로젝트와 평가 도구 비교

확인일: 2026-10-14, Asia/Seoul. 사용자 요청: “pg-jev와 같이 조금 더 좋은 벤치마킹용” 조사. 처음에는 구현 참고와 성능 평가의 우선순위를 질문했고 두 범위를 함께 조사했다. 이후 사용자가 **두 가지 모두**로 확정했고, **우리 최신 버전을 가져와 확인**하도록 추가 지시했다. 아래 제안은 이 두 범위를 모두 포함한다.

검증 수준은 작성자 저장소·공식 문서·논문 및 일부 공개 소스의 열람이다. 여기의 성능 수치는 작성자 보고이며 로컬 재현 결과가 아니다. 변경 가능한 main 문서에 대한 조사이고 특정 commit의 실행 감사를 수행하지 않았다. 별점이나 홍보 문구로 순위를 정하지 않았다.

최초 조사 때 로컬 최신은 [D081](../orchestration/D081_REPAIR_PATH_AND_RESULTS.md)이었다. 후속 원격 확인에서 10커밋 뒤임을 발견해 research를 `0fda933`에서 `2b3c9ac`로 fast-forward했고 현재 정본은 [D083](../orchestration/D083_REPAIR_DIRECTION.md)과 [STATE](../agents/STATE.md)다. 공개 배포 main은 `8b2da35`/`v0.3.2`, 프로젝트 이름은 Pointsman이다. 개발 research와 배포 main은 서로 다른 이력을 갖고 있어 합쳐 쓰지 않는다. 이번 검토 대상 runtime은 갱신한 research이며 main은 배포 문서·버전 정보를 Git 객체로 확인했다.

조사 기록에 처음 사용한 D082 번호는 원격의 클라우드 실행 기록과 충돌했다. 조사 기록을 [R20261014-JEV-REFERENCES](../decisions/R20261014_JEV_REFERENCES.md)로 옮겼고, 원래 로컬 문서 네 개의 바이트는 private `benchmark-runs/reference-research-sync-20261014-01/`에 보존했다. 원격 D082/D083 기록은 그대로 반영했다. 이 갱신은 제안한 벤치마크나 정책을 runtime에 채택하는 결정은 아니다.

## 비교 결과

| 대상 | 주된 용도 | 우리 프로젝트에 참고할 부분 | 평가 근거와 한계 |
| --- | --- | --- | --- |
| [jev-kit](https://github.com/jonathanavis96/jev-kit) | Claude Code의 도구 판단·작업자 등급·검증 유도 | 코드 사전 필터, 고정 질문, 작업자 등급 매핑, 연결 유지, 완료 뒤 검증 | 라벨 평가·A/B·측정 명령이 공개돼 가장 직접적인 구현 참고. 라벨 적합도가 전체 개발의 최적 모델 선택을 입증하지는 않음 |
| [jev-ultrafast](https://github.com/browser-use/jev-ultrafast) | 목표를 받아 브라우저 행동을 반복 실행 | 관측에서 실행 가능한 선택지 구성, 한 상태의 복수 질문, 선택된 행동만 실행, 실행 직전 상태 재검사 | loop/model 소스와 별도 결과 검증 경로를 열람. 제한된 브라우저 과제의 작성자 측정이며 SWE 성능으로 전이되지 않음 |
| [JevSpawn](https://github.com/Hoyant-Su/JevSpawn) | 행동 공간 구성·병렬 분기 탐색·되돌아가기 | 선언/실행 분리, 독립 상태 복사, 대안 유지, 관측으로 분기 선택 | 공개 api 소스와 논문. 주 runtime은 GPU 기반이며 TypeSafe API 변형을 구별해야 함. 퍼즐·탐색의 성능이 코드 작업 분할 효과를 보장하지 않음 |
| [pg-jev](https://github.com/realZachi/pg-jev) | SQL에서 자연어 행 분류·평가 | 독립 질문 묶음, 스트리밍, 지속 연결, 세션 캐시 | 호출 시스템 참고에 적합. 테이블 행 처리와 의존성 있는 개발 작업은 다름 |
| [jev-route](https://github.com/huzeyfe07/jev-route) | Python의 의도·도구 라우팅 | 등록된 선택값→실행 함수 연결, 미등록 답 처리, middleware 경계 | 현재 문서는 OpenRouter chat completions 경로. 우리 native systemone 연결에 바로 호환된다고 볼 수 없음. 범용 개발 E2E 비교는 확인하지 못함 |
| [JevBench](https://github.com/fstandhartinger/jevbench) | typed decision 모델의 정답·확률·지연·비용 평가 | 단계별 질문 평가, 패러프레이즈, 실패/미실행 구분, 원시 결과와 장부 보존 | systemone 및 일반 생성 모델 adapter 공개. 판단 단위 평가에 적합하지만 작업자·DAG·완성 소프트웨어를 평가하지 않음 |
| [ReflexBench](https://github.com/brida-ai/reflexbench) | typed engine과 실행 정책의 효과 분리 | 동일 응답을 재사용한 정책 비교, 선택지 순서·개수·언어 변화 | raw engine과 deterministic policy를 구별하므로 “추가 호출 없이 무엇을 코드로 처리할까”에 적합. 전체 SWE 벤치 대체는 아님 |

이는 종합 성능 순위가 아니라 우리 목표와의 적합도 판단이다. 직접 구현 참고는 jev-kit → jev-ultrafast, 분기 탐색 설계는 JevSpawn, 판단 평가 시작점은 JevBench와 ReflexBench를 제안한다.

## 작성자 수치를 해석할 때

### jev-kit: 모델 등급 선택과 실제 절감의 차이

[측정 문서](https://github.com/jonathanavis96/jev-kit/blob/main/docs/measurements.md)는 tier 평가에서 58개 중 모호한 1개를 제외한 57개를 채점해 56개 일치(56/57)를 보고한다. 그러나 guard 유무 30세션·5과제 A/B에서는 차단이 없었고, 저자도 절감의 증거로 해석하지 않는다. 등급 라벨 일치와 작업 완료 비용은 별도로 평가해야 한다.

### pg-jev: 크게 묶는 것과 정확도의 교환

[작동 원리](https://pgjev.com/docs/how-it-works)는 요청당 기본 20행을 사용한다. 작성자는 구조화 열에서 정답을 얻은 각 400행 조건에서 1–20행 묶음은 100%, 40행은 92–98%, 80행은 77–94% 정확도를 보고한다. 이를 우리 작업자 상한이나 질문 개수의 최적값으로 복사할 수는 없다. 서로 다른 도메인·행 구조이며 우리의 source/criteria 길이와 다르다. 독립 질문의 묶음 크기를 바꿔 답 연결 오류·전체 품질을 직접 재야 한다는 참고다.

### JevSpawn: 녹화 재생과 새 추론의 차이

저장소는 GPU 없이 녹화 trace를 재생하는 데모와 새 GPU 추론을 구분한다. 주 평가 모델은 Qwen3.8-27B이고 TypeSafe Jev API 변형은 별도다. 여덟 과제는 PPNL·Maze·Grid·LightsOut·RushHour·Sokoban·2048·Nullify이며 SWE는 포함되지 않는다. 종료 지연에는 실패와 timeout도 포함돼 성공률을 같이 읽어야 한다. [논문](https://arxiv.org/abs/2610.00437)

## 함께 읽을 비교 설계

[REFLEX with Jev](https://arxiv.org/html/2609.26532v1)는 위 ReflexBench나 동명의 다른 GitHub 프로젝트와 구별한다. 강한 모델 단독, Jev와 생성 모델의 협력, 저비용 생성 모델 cascade를 비교한다. 자체 통제 과제의 이점이 외부 BFCL/다회차 과제에서는 제한됐다는 결과를 보고하므로 우리에게 필요한 음성 대조 근거다. 이번 조사에서 해당 논문의 평가 하네스를 내려받아 실행할 수 있는 공개 배포 경로까지 확인하지는 못했다.

이 논문의 불확실도 기반 위임 정책은 우리 현재 기본 정책으로 채택하지 않는다. 참고할 것은 비교군 구성과 후보 행동 집합을 바꾸는 실험 방법이다. 구성만 비슷한 사례들의 성능 수치를 한 표의 속도 순위로 합치지 않는다.

## 우리 코드에서 검증할 제안 — 미실행

1. **판단 질문 평가.** 실패 담당·실행 묶음·관계·작업자 프로필 질문을 단계별로 고정한다. 선택지 순서·후보 개수·근거 길이를 바꾸고 정답/허용 답, 미등록 선택, 형식 실패, 답과 대상의 잘못된 연결을 검사한다. 프로필의 “최적 모델”은 실제 완료 품질과 비용 근거가 없으면 정답 라벨로 만들지 않는다.
2. **추가 판단 호출을 없앤 코드 효과.** 같은 저장 응답을 그대로 사용해 현재 handler와 새 검증/캐시/일정 정책을 비교한다. 관측 재생만으로 새 worker 성공이나 새로운 E2E 시간을 주장하지 않는다.
3. **생성 판단과 Jev 판단의 대조.** 동일 과제·도구·worker 모델/노력도·실행 슬롯·검사 조건에서 강한 모델 판단, 코드 필터+강한 판단, 같은 필터+저비용 생성 판단, 같은 필터+Jev를 비교한다. 모델·노력도 최적화는 이후 별도 요인으로 둔다. 필터와 연결 재사용을 Jev 조건에만 제공하면 효과가 섞인다.
4. **실제 완료 평가.** 공개 명세와 독립 채점을 유지하고, 모델 응답 p50/p95·계획 시간·작업자 구간·대기·검사·수리·최종 완료 시간을 함께 기록한다. 전체 토큰은 캐시 읽기/쓰기와 실패 요청을 포함한다. 가격은 같은 공식 요금 기준 환산과 실제 월정액 배분을 구별한다.

같은 관측의 독립 질문은 한 요청으로 묶을 후보지만 앞 질문의 답이 필요한 단계는 순차로 둔다. 브라우저의 speculative target head도 앞 질문 답을 입력으로 읽는 방식은 아니다. 캐시의 우리 쪽 키는 원본/후보 revision·질문 계약·선택지·모델 버전·정책을 포함하는 방식을 검토해야 한다. pg-jev의 세션 행 캐시를 그대로 개발 DAG에 붙이는 것은 제안하지 않는다.

## 최신 D083와 연결한 확인

| 외부 참고 | 현재 코드에서 확인한 연결점 | 추가로 검증할 것 |
| --- | --- | --- |
| jev-kit 작업자 등급 | `adaptive-profile-selection.mjs`의 profiles 요청·기존 프로필 선택 경로가 이미 있음 | 등급 라벨 일치와 별도로 선택 모델로 실제 완료한 품질·토큰·가격 평가 |
| jev-ultrafast 상태→선택→실행 | `adaptive-question-forms.mjs`의 질문 adapter, `adaptive-inferred-scope.mjs`의 기존 union 선택, executor의 scope/권한 검증 | 현재 단계의 후보만 제공했는지, 같은 revision에 선택이 적용됐는지, 잘못된 답이 실제 handler로 넘어가는지 |
| pg-jev 묶음·연결·캐시 | manifest의 `model_lookup: per_session`, owner 요청 분할/답 병합, 공개 검사 병렬2가 이미 있음 | 이미 있는 재사용과 새 효과를 분리. client 인스턴스 생성만으로 TLS를 매번 새로 맺는다고 단정하지 않고 실제 연결/대기 비용 계측 |
| JevSpawn 분기 탐색 | 현재 `layered-v2`와 작업 DAG가 있음 | 행동의 대안 상태를 유지하는 탐색이 현재 작업 분할과 어떤 차이를 만드는지 별도 설계·대조. 탐색 코드를 바로 대체 도입하지 않음 |
| JevBench 질문 평가 | 고정 질문·criteria와 `decide` 경계가 있음 | 우리 계약의 실제 질문/후보로 별도 corpus 구성, systemone adapter의 목적지·응답 형식 확인 후 평가 |
| ReflexBench 같은 응답 정책 비교 | `selectInferredOwnerScope`는 추가 모델 호출 없이 선택하며 D083은 worker 언급 기반 scope 후보를 더함 | 같은 owner 응답·진단·실패 이력에 기존 union/확장 후보 정책을 각각 적용하고 추가 범위의 효과·오확장 비교 |

### 최신 구현에서 이미 해결한 것과 아직 재야 할 것

- `repair-budget-v3`: raw worker 진술 발췌·수리 이력 축소, 요청이 커지는 단계 거부, 큰 owner 판단의 분할 경로. 코드 호출은 `adaptive-dag-execution.mjs`의 `planRepairOwnerRequest`에 연결돼 있다.
- `worker-mentioned-v1`: 남은 실패와 직전 작업자 지목을 기반으로 쓰기 범위 확장 후보를 만들고 기존 선택 규칙에 전달한다. 단순 문서상 후보가 아니라 executor 연결까지 확인했다. 작업자 지목은 원인 증명이 아니다.
- D083 원격 기록의 유료 3회는 공개+독립 성공 **2/3**다. 그러나 v3의 새 raw 축소 단계와 새 범위 확장 모두 **세 실행에서 발동하지 않았다**고 명시한다. 성공률을 두 수정의 효과로 쓰지 않는다. 클라우드 원시 `benchmark-runs/d083-*`는 이번 로컬에 없으므로 이 수치는 가져온 실행 기록의 보고이며 원시 영수증 재감사는 아니다.
- 따라서 다음 비교에는 D082의 **단일 실패 사례가 입력 목표를 초과한 경우**, **필요한 producer가 쓰기 범위 밖에 남은 경우**, **공개 통과 후 독립 실패한 경우**를 구분해 넣는다. 앞 두 경우는 기능이 발동하는 오프라인 재생을 먼저 확인하고, 이후 모델 호출·작업자 변경·완료를 별도로 측정한다. 숨김 실패 내용은 판단 입력으로 사용하지 않는다.
- 현재 후속 유료 실험 지시는 조건당 3회·순차 실행·원장은 클라우드 한 곳이다. 이 조사 갱신으로 Mac에서 새 유료 실행을 시작하지 않는다.

### 이번 최신 버전 검증

```sh
git fetch origin
git merge --ff-only origin/research
git fetch origin main:main
node --test test/d083-repair-fixes.test.mjs test/d082-cloud-auth.test.mjs test/adaptive-inferred-execution.test.mjs test/jev-transmission-preflight.test.mjs
```

실제 결과: HEAD와 origin/research 모두 `2b3c9acbef2c789b243350355c986cf4f8f70fed`. 관련 로컬 검사 **31/31 통과, 실패·취소·건너뜀0**, 16943.006291ms. 전체 회귀나 새 모델 E2E를 수행한 결과는 아니다. 호출 연결은 `sg` AST 검색으로 확인했고 첫 제한 경로의 미발견 결과와 범위를 넓혀 찾은 결과를 각각 보존했다. [동기화·소스·검사 근거](../../benchmark-runs/reference-research-sync-20261014-01/verification.json).

## 조사 경로와 미확인

- 2026-10-14 웹 검색: `"pg-jev" benchmark`, `Jev typesafe AI agent routing github projects benchmark`, `site:github.com "REFLEX" "Jev" benchmark`, `site:github.com "jev-ultrafast"`, `site:github.com "JevSpawn"`.
- 일차 자료: 위 프로젝트의 README/측정 문서, pgjev 공식 문서, JevSpawn `src/jev_spawn/api.py`, jev-ultrafast `agent.py`·`model.py`, REFLEX 논문.
- JevBench 문서의 버전별 항목 수·점수 가중치와 가격 예시는 역사적 조건이 섞여 있다. 도입한다면 tag/commit·공개 cohort·scorer를 고정하고 우리 Jev AI 요금과 endpoint를 다시 지정해야 한다. 공개 subset 결과를 운영자의 전체 sealed benchmark 성적으로 부르지 않는다.
- 최초 조사는 문서/소스 열람이었다. 후속으로 Git fetch·research fast-forward·오프라인 관련 검사를 실행했다. 새 clone·설치·자격증명 로드·Jev/Claude 추론·Docker 실행·벤치마크 재실행·commit/push는 하지 않았다. 로컬 runtime은 원격 개발 커밋으로 갱신됐으며 외부 참고 프로젝트의 기능을 새로 구현한 것은 아니다.
- 결과 파일은 이 조사 문서·연결 기록과 후속 Git/오프라인 검사 영수증이다. 외부 평가 도구를 실제 실행한 영수증은 없다. 두 조사 범위는 사용자 확정이며, 채택 순위와 실제 유료 비교 조건은 여전히 제안이다.
