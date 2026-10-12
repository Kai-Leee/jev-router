# D036 — 자동 checkpoint 구조 구현과 무과금 검증

2026-10-10. 사용자 요청: D035 방식으로 생성하고 구조를 확인한 뒤 진행. 이번 범위는 plan_ready의 실제 실행기 연결까지다. template planner, 실패 분류, 실제 자료 수집, 다른 모델 선택은 후속 범위다. 작업자 Opus medium 유지. 문서 스킬 jev-decision-records 적용. [역할](../agents/D036_AUTO_DISPATCH.md).

## 현재 구조

```text
tree-e2e-pilot
  → 계획 생성 또는 검증된 frozen plan 읽기
  → plan_ready event
  → checkpoint-router
      → 단일 작업이면 script
      → 동일 결정 key와 고정 모델 버전이면 cache
      → 나머지는 기존 budget/telemetry Jev decider
  → 질문 응답/현재 근거 검사
  → execute_single / execute_split / collect_evidence
  → runFileArm / needs_evidence
  → checkpoint.json + events.jsonl + 기존 결과
```

- 정본: [checkpoints.v1.json](contracts/checkpoints.v1.json). 영어 질문은 기존 questions.v1.json의 split을 직접 읽는다.
- core: [checkpoint-router](../../src/orchestration/checkpoint-router.mjs). JSON 정규 hash, 실행 중복 방지, exact decision cache, 이벤트·실행 기록.
- adapter: [split-checkpoint](../../src/orchestration/split-checkpoint.mjs). 계획/근거/임계값 검증, 고정 질문 materialization, 반환값→handler 변환.
- 실행 연결: [tree-e2e-pilot](../../scripts/tree-e2e-pilot.mjs). 실제 Jev transport와 기존 공유 예산을 주입한다. 새 장부는 만들지 않는다.

기본 routing mode는 이제 auto다. 명시 split threshold가 없으면 **계획 생성이나 지출 전에 거절**한다. 운영 임계값이 선정됐다는 의미는 아니다. 기존 양쪽 평가를 재현하려면 `--routing-mode forced`를 명시해야 한다. jev/claude/script 기존 옵션은 유지한다.

```sh
# 실제 실행 명령의 형식; 이 작업에서 아래 유료 명령을 실행한 것은 아니다.
node scripts/tree-e2e-pilot.mjs CONFIG NEW_OUTPUT --spend --routing-mode auto --split-threshold 0.65
# Jev 답을 반드시 받되 선택된 경로 하나만 실행하는 비교 모드:
node scripts/tree-e2e-pilot.mjs CONFIG NEW_OUTPUT --spend --routing-mode force_jev --split-threshold 0.65
```

0.65는 사용법 예시이며 채택된 운영값이 아니다. auto/force_jev 계획 생성 프롬프트만 1–4 작업을 허용한다. 기존 평가 모드는 2–4 조건을 유지한다. 새 프롬프트로 만든 계획과 과거 계획의 실행을 동일 조건으로 주장하지 않는다.

## 호출 생략과 실행 제한

단일 검증 작업은 분할할 자식 후보가 없으므로 single로 직접 실행한다. 여러 작업은 DAG 폭만으로 유리하다고 단정하지 않고 Jev에 보낸다. force_jev는 규칙과 결정 캐시를 우회하지만 단일 작업을 존재하지 않는 분할로 실행하지 않으며 중복 실행 방지는 유지한다.

캐시 key는 scope, 근거 revision, adapter version, 실제 request(질문·목표·계획·worker capability), 정책(임계값 포함), 고정 modelIdentity를 포함한다. 고정 Jev 버전과 응답 model이 일치할 때만 재사용한다. latest/불일치는 캐시하지 않는다. 원래 usage를 cache hit의 새 지출로 복제하지 않는다.

현재 pilot은 `jev-latest`와 modelIdentity=null, 실행당 checkpoint 하나이므로 **pilot의 cache hit 절감을 주장할 수 없다**. core의 반복 checkpoint/pinned model 캐시는 합성 검증이다. D029 응답 model은 typesafe-ai/jev라는 alias여서 고정 버전으로 임의 치환하지 않았다.

executions와 decisions는 프로세스 메모리 안에 있다. 같은 scope+executionKey는 동일 promise/result를 재사용하고 입력/모드 변경은 충돌로 거절한다. 실패/불확실 실행도 자동 재시도하지 않는다. maxEntries에 도달하면 실행 이력을 버리지 않고 중단한다. 재시작/여러 프로세스의 exactly-once 보장은 없다.

coordinator는 handler 종료까지 직렬 처리한다. handler 내부에서 같은 router를 재진입하면 즉시 거절한다. 후속 근거 event는 기존 run이 반환된 뒤 외부 controller가 생성해야 한다. 이는 현재 plan 단위 직렬 판단 범위이며 runFileArm 내부 작업자 병렬 실행과 다르다.

collect_evidence는 현재 `needs_evidence` 상태 반환만 한다. 파일을 찾아 읽거나 테스트를 자동 실행하는 수집기는 아직 없다. finish 선택값은 추가하지 않았다. dispatched는 handler 호출 완료이고 독립 품질 성공이 아니다.

## 검증과 발견한 결함

재현 명령:

```sh
node --test test/checkpoint-router.test.mjs
node scripts/replay-checkpoints.mjs benchmark-runs/d029-tree-01 benchmark-runs/NEW_D036_OUTPUT
node --check scripts/tree-e2e-pilot.mjs
npm test
python3 skills/jev-decision-records/scripts/check_record.py docs/decisions/D036.md --root .
git diff --check
```

새 출력 경로가 필요하다. 재생 CLI에는 네트워크 client/키 로더가 없으며 저장 응답과 별도로 표시한 합성 응답만 쓴다. 고정 버전 합성 사례와 실제 과거 alias 응답을 섞어 실제 캐시 성과로 계산하지 않는다.

- targeted: 자동 호출, 단일 작업 bypass, exact reuse, 중복 동시 이벤트, stale 근거, 정책/모델/목표 변경, 잘못된 답, recorder 실패, 재진입, 요청 크기, 실패 단계 시간, 실제 파일 writer와 fake provider 연결 검증.
- replay: D029 저장 응답으로 split dispatch, 같은 실행의 중복 차단, force_jev 경로 확인. 고정 버전 cache는 별도 합성 사례다.
- 최초 전체 테스트는 sandbox localhost listen EPERM 때문에 12건 실패했다. 원본 로그를 남기고 로컬 모의 서버 권한에서 재실행했다. 유료 endpoint 호출 증거가 아니다.
- 독립 검토에서 provider/checkpoint decision ID 불일치, 단일 작업이 실행기에서 재거절되는 문제, 재진입 교착 가능성을 찾았다. 숫자 decisionId 전달, checkpoint 모드 single-task 허용, 명시 재진입 거절로 수정했다.
- 실패 시 decision/handler 시간이 0으로 남는 자체 계측 결함도 수정했다. 실패 경과 시간은 catch에서 기록하며 해당 검증을 추가했다.

최종 수치와 evidence hash는 [D036 기록](../decisions/D036.md)에 둔다. private 로그 위치: benchmark-runs/d036-tests.log(첫 실패), d036-tests-final.log(전체), d036-targeted-final.log, d036-replay-final/.

## 남은 범위와 부수 효과

새 유료 모델 호출·실제 E2E 효율 비교는 하지 않았다. 단일 작업의 호출 생략 구조와 로컬 파일 실행 연결은 검증했지만 실제 토큰/시간/금액 절감은 미측정이다. daemon/호스트 hook 자동 호출, 실시간 dashboard 새 필드 표시, persistent cache, template planner, 작업 중 실패/요구사항 event는 미구현이다.

다음은 같은 frozen plan에서 auto/force_jev/Claude 선택 비교와 목표부터 시작하는 Claude 통합 계획 baseline을 분리해 실험하는 단계다. 문서의 명령 예시 자체를 실행 승인이나 성능 결과로 해석하지 않는다.

새 코드·문서·private 재생/테스트 로그가 남는다. 단위 테스트 임시 산출물은 정리했다. PersonalOS, 전역 설정, 공유 예산 장부 미변경. 새 컨테이너/서비스 없음, commit/push 없음.
