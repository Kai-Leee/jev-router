# D031 — 중복 제거·근거 선별과 판단기 비교

2026-10-09. 사용자 승인: D030 제안의 1) 중복 제거 2) 작업별 근거 선별 구현. Claude 계획/Jev 사용 차이는 지표로 비교. 작업자 모델은 기존 Opus5.5 medium 유지. 서브에이전트 역할 조사와 구조 세분화. 이번에는 새 유료 호출 없이 구현·오프라인 검증을 수행한다.

## 흐름과 소유권

1. **원문 저장**: 기존 명세·계획·결과를 수정하지 않고 원본 해시 보존.
2. **계획 생성/재사용**: Claude가 새 구조를 생성. 동일 판단기 비교에는 `--plan-source`로 고정 계획을 재사용하며 명세 hash와 계획 hash 검사. 재사용의 실제 새 planner 호출0과 최초 준비 비용을 구별한다.
3. **입력 구성**: 실행기가 worker-inputs.mjs로 동일 본문을 하나로 통합하고 전이 의존 파일을 선택. 원본 요구사항은 한 번 온전히 유지. 검증된 요구사항 ID 매핑이 없으므로 요구사항 문장별 삭제는 하지 않는다.
4. **판단기**: 동일 split 질문/상태를 Claude 또는 Jev에 전달하거나 사전 의존 그래프 휴리스틱을 적용.
5. **정책→실행**: 명시 임계값과 충분근거 검사 후 single/split handler. insufficient는 needs_evidence로 종료; 무단 fallback 호출 없음.
6. **worker**: Opus medium 고정, maxConcurrency1 또는2. 결과 파일 검증/소유권 검사 후 기록.
7. **독립 grade**: 원본 후보를 Docker verifier로 검사. 생성 성공과 품질 성공 구별.
8. **비교**: source/plan/question/worker contract/모델/effort/concurrency/grade task·image 일치 검사 후 지표 작성.

## 구현한 옵션

`scripts/tree-e2e-pilot.mjs config.json new-output --spend`에 붙이는 옵션:

| 옵션 | 값 | 의미 |
|---|---|---|
| --input-mode | legacy / deduplicated / projected | 기본 projected. legacy는 D029 request 구조 보존; 신규 계약은 worker-task.v3.json |
| --routing-mode | forced / claude / jev / script | 기본 forced는 평가용 Jev 관측 후 양쪽 강제 실행. 온라인 라우팅은 claude/jev를 명시 |
| --split-threshold | 0~1 | claude/jev 모드 필수. 운영 최적값 자동 선택 없음 |
| --plan-source | frozen-plan.json 경로 | 인접 inputs.json 명세 hash 일치 후 재사용. planner 생성 절감 성능으로 오인 금지 |
| --concurrency | 1 / 2 | 분할 직렬·병렬 비교 가능. 기본2 |

예시(준비된 사용법이며 이번에 유료 실행하지 않음):

```sh
node scripts/tree-e2e-pilot.mjs CONFIG NEW_RUN --spend --input-mode projected --routing-mode jev --split-threshold 0.65 --plan-source FROZEN_PLAN
node scripts/compare-routing-runs.mjs CLAUDE_RUN CLAUDE_GRADE JEV_RUN JEV_GRADE NEW_REPORT
```

forced는 decision_used:false, script는 dependency_width_heuristic_v1로 기록. 스크립트의 의존 그래프 계산은 결정적이지만 너비만 보고 split을 고르는 정책이 최적이라는 보장은 없다. concurrency1에서는 split도 직렬이다. routing-mode가 planner를 대체하지 않는다. planner+decision 통합 Claude baseline 및 template 경로는 아직 제안이다.

## 입력 구현과 오프라인 재생

`worker-inputs.mjs`는 `{request,manifest}` 반환. manifest의 선택/제외 파일, 원본/요청 hash, bytes는 로컬에 남고 모델에게 중복 전달하지 않는다. 실행 event에 input_preparation_ms 기록.

- deduplicated: brief1회, plan1회, task, model/effort, completedFiles1회, 출력 계약.
- projected split: 전체 plan 대신 담당 task+공통 integrationInstructions. 완료 파일은 선언된 직접·전이 의존만 포함.
- projected single: 모든 작업 설명이 필요하므로 전체 plan 유지.
- 누락 의존 본문, 중복 파일, 변조 task, 잘못된 경로/그래프는 호출 전 거절.
- task ID single과 합성 단일 작업이 충돌하던 결함을 검토에서 발견해 explicit executionMode로 구분하고 회귀 테스트 추가.

실제 D029 저장 요청에 새 함수 적용:

```sh
node scripts/replay-worker-projection.mjs benchmark-runs/d029-tree-01/events.jsonl benchmark-runs/d031-projection-replay.json
```

| 분할4회 요청 본문 | UTF-8 bytes | 감소율(legacy285625 분모) |
|---|---:|---:|
| legacy | 285625 | 0% |
| deduplicated v3 | 122511 | 57.108% |
| projected v3 | 81753 | 71.378% |

[D031 재생](../../benchmark-runs/d031-projection-replay.json). D030의52.071%는 단순4필드 삭제 복사본이고 이번57.108%는 v3 요청 전체 계약으로 재구성한 값이므로 다른 변환이다. system 제외/토큰·캐시·가격 아님. 후속 check-api/plugin에는 무관한 packaging3파일을 제외했다. 실제 품질 보존·토큰 절감 미측정. legacy(v2)↔v3는 지시문도 달라지므로 순수 필드 제거의 인과 효과라고 부르지 않는다. deduplicated↔projected는 같은 v3 지시문으로 비교할 수 있다.

## 지표와 아직 남은 비교

구현된 `routing` 기록: authority, selected_modes, decision_used, decision_elapsed_ms, Claude/Jev 판단 호출 수, p/threshold, planning_replaced:false. 단일 실행의 eliminated_claude_calls_vs_paired_baseline은 null.

`compare-routing-runs.mjs`: 동일 계획의 완료된 단일 arm+grade 한 쌍만 분석. 계획 시간/비용, 판단 시간, worker 시간, grade 시간, post-plan 단계 합계, cache creation/read/input/output, 작업자 호출, Jev 입력량, 독립 품질, 실제 Claude 판단 호출 차이를 분리한다. Claude 환산 비용을 planner/post-plan/전체로 나눈다. 비교 grade의 workspace/task/upstream/image 검사. 파일의 채점 이후 변조를 해시로 검증하는 기능은 아직 없다. unknown 토큰/비용은 null.

실패·abstention은 각 run result에 보존하지만 이 성공쌍 비교기에 들어가지 않는다. 전체 성공률/보류율을 보고할 때 전체 시도 장부에서 별도 집계해야 한다. serial/parallel은 concurrency가 다르므로 이 판단기 비교기가 거절하며 별도 분할 실험 집계가 필요하다.

[역할 연구](D031_ROLE_RESEARCH.md): deterministic script / 사전 휴리스틱 / replay / 사후 oracle을 구별한다. 사후 승자 script는 운영 비교에 사용하지 않는다. 추가 Jev 역할 후보: 검증된 template 선택, 실패 담당, 부족 근거 수집 수단 선택. template이 없는 새 과제의 planner 생성은 Claude에 남는다. 모델 선택은 이번 실행에서 고정.

## 검증·정정·부수 효과

개발 검토에서 새 telemetry role routing이 지원되지 않아 Jev 호출 전에 실패하는 문제를 발견, implementation으로 수정하고 무과금 생성 검사를 추가했다. 실제 유료 실패는 없었다. single 작업 ID 충돌도 수정했다. 구조화 기록과 VERIFICATION에 최종 회귀 결과를 남긴다.

새 유료호출/컨테이너/서비스/PersonalOS 변경 없음. 로컬 변경·새 문서·비공개 재생 JSON/테스트 로그 유지. 자동 commit/push하지 않음. 실제 Claude/Jev 새 비교 수치는 아직 없음.
