# 현재 실시간 진행·실패 탐지 감사

확인일: 2026-10-09 (Asia/Seoul). 담당: `benchmark_runner_review`.
범위: [감사 역할](../agents/REALTIME_FAILURE_AUDIT.md). 제품 수정 제안과 현재 구현 사실을 구분한다.
이번 작업은 읽기 전용 소스 감사, OS 임시 디렉터리의 합성 장애 재현, 기존 localhost 집계 API의
단일 GET이다. 모델 호출·키/인증 조회·Docker 명령·제품 코드·기존 기록 변경은 없다.

## 결론

현재 대시보드는 **저장된 사용량·일부 결과를 3초 간격으로 읽는 화면**이다. 서버 연결 건강,
실행 프로세스 생존, 작업 진행, 도구 오류, 판단 gate 중단, 모델 응답, 평가 결과를 각각 실시간으로
관측하는 운영 감시기는 아직 아니다. API가 응답하고 갱신 시각이 바뀌어도 실행 프로세스가 살아
있거나 목표에 가까워지고 있다는 근거는 생기지 않는다.

이번에 실제 재현한 중요한 공백은 다음과 같다.

1. 도구의 관측된 비정상 종료는 gate가 복구를 허용하지만 화면에는 실패 자체가 나타나지 않는다.
2. gate가 더 이상 행동을 허용하지 않아도 상단은 `running`일 수 있다. 판단 한도 소진과 일부 기록
   실패는 중단 이벤트도 남기지 못해 즉시 식별할 수 없다.
3. Claude의 최종 응답만 있고 runner의 정리·결과 저장이 끝나지 않은 경우에도 `completed`가 된다.
   반대로 CLI exit 0이지만 최종 응답이 없어 launcher는 exit 1을 선택하는 경우, 화면 전체 상태는
   `completed`, Claude 공급자 상태는 `uncertain`로 갈린다.
4. 프로세스가 일찍 죽거나 멈춘 상태와 정상적으로 오래 작업하는 상태를 현재 파일만으로 구분하지
   못한다. 종료 기록이 없는 경우 선언된 전체 시간 제한 + 30초가 지나야 불확실로 전환한다.
5. 평가기의 `model_calls:0`은 평가기 자신이 모델을 호출하지 않았다는 뜻이다. 현재는 이것으로
   대조군을 추론하므로, 향후 실제 모델이 만든 제출물의 평가도 `control`로 표시될 수 있다.
   실행·제출물·평가를 연결하는 명시적 ID/해시 계약이 없다.

위 항목을 이번에 수정하지 않았다. 최근 대시보드 검토에서 해결한 부분합·UTF-8·정리 실패 처리와
이번 **진행/실패 탐지 범위 감사**는 다른 완료 조건이다.

## 이번 확인의 근거와 재현물

- 합성 재현 스크립트: `/private/tmp/jev-realtime-audit.CRhMrJ/audit.mjs`
- 결과와 읽은 소스 SHA256: `/private/tmp/jev-realtime-audit.CRhMrJ/results.json`
- 명령: `node /private/tmp/jev-realtime-audit.CRhMrJ/audit.mjs`
- 실행 시각: `2026-10-09T05:42:58.548Z` (KST 14:42:58).
- **20개 시나리오의 현재 동작을 assertions로 확인**했다. 이는 결함 0건 또는 20개 제품 요구사항
  통과라는 뜻이 아니다. 기대한 취약한 상태를 재현한 assertion도 포함한다. 과거 167/167 결과를
  이번 실행 결과로 재사용하지 않았다.
- 스크립트는 실제 gate/telemetry/metrics/reader 함수를 가져오되 공급자와 명령 실행은 모의 콜백을
  사용한다. `processResult`의 시간 초과·기록 실패만 새 로컬 Node 자식 프로세스로 주입했다.
  임시 파일은 이 감사 디렉터리 안에만 생성했다. 재현물은 OS 임시 파일이므로 영구 보존을 보장하지 않는다.
- 기존 `http://127.0.0.1:8787/api/snapshot`을 읽기만 한 결과: HTTP 200,
  `jev-dashboard/v1`, `generated_at=2026-10-09T05:43:20.293Z`, 7개 run 모두 `control`,
  최상위 경고 0개. 원문 로그·명령·사용자 콘텐츠는 조회하거나 출력하지 않았다.
  이 확인은 현재 모델 실행 또는 진행 감지 성공의 증거가 아니다.

## 관측 계층을 분리한 현재 구조

| 계층 | 현재 관측하는 것 | 관측하지 않는 것 / 해석 경계 |
| --- | --- | --- |
| 브라우저 ↔ 집계 서버 | GET 성공/실패, 10초 요청 중단, 마지막 성공 snapshot 유지 | runner/MCP/컨테이너 생존과 무관. snapshot 생성 시각은 원본 이벤트 신선도가 아님 |
| runner 프로세스 | `processResult` 반환 후 exit/signal/timeout/output 오류, 정리 결과 | PID/생존 lease/heartbeat 없음. runner 자체가 사라지면 정상 종료 기록이 보장되지 않음 |
| 컨테이너 | 행동 직전 inspect, 명령 결과, 불확실 실행 및 runner 종료 시 정리 시도 | 지속 health probe 없음. 행동 사이의 종료/정지는 즉시 관측되지 않음 |
| 명령·작업 진행 | action 시작/종료 기록, 원본 exit code와 duration | 화면은 exit code와 중첩 duration을 투영하지 않음. 산출물 진척·목표 충족률·반복 정체를 판단하지 않음 |
| Jev | POST dispatch 시작/종료, 완료/실패/불확실, 부분 사용량 | GET 전 실패는 POST 실패 수가 아님. 응답 완료와 판단 gate 승인/정답은 다름 |
| Claude | 고유 assistant ID, 최종 result/modelUsage, 종료 후 프로세스 결과 | 현재 stream만으로 내부 HTTP attempt/retry·보조 요청 총수 없음. assistant 내용은 진행 의미로 분석하지 않음 |
| 평가 | 독립 result.json의 최종 평가 상태 | 평가 중 단계·진행률 없음. 모델 run과 제출물·평가 연결이 없음 |
| 비용 | 관측 부분합과 coverage, unknown/null, 서로 다른 단위 | 실패 시 미제공 사용량과 실제 청구의 자동 정산 없음. 추정 USD가 비용 청구의 완결 증거가 아님 |

근거: [reader](../../src/dashboard/reader.mjs) 51–79줄,
[UI polling](../../dashboard/app.js) 291–332줄,
[runtime](../../src/benchmark/docker.mjs) 19–45·48–70줄,
[metrics](../../src/dashboard/metrics.mjs) 62–121·125–189·193–226·252–292줄.

## 실패가 드러나는 시점과 누락 경로

### 1. 연결 건강과 원본 기록 신선도가 섞인다

UI는 매 3초 `refresh()`를 예약하고 이미 요청 중이면 중복 요청을 생략한다. 요청은 10초에
AbortController로 중단한다. 성공할 때마다 `연결됨 · 3초마다 갱신`, snapshot의 `generated_at`을
표시한다. reader는 원본 파일이 그대로여도 `generated_at`을 새로 만든다.

따라서 정상적인 foreground 상태에서 **파일 기록 → 다음 성공 polling**은 대략 0–3초 + 읽기/렌더
시간이다. 이것은 실제 측정한 지연 보장이나 SLA가 아니다. 서버 I/O 지연, 이벤트 루프 정체,
백그라운드 탭의 타이머 제한이 있으면 길어진다. 연결 오류는 다음 요청의 거절/중단 때 드러나며,
timeout 경로는 이상적인 foreground에서도 예약 대기와 10초를 합해 약 13초가 될 수 있다.

현재 run별 `last_event_at`, `last_progress_at`, `last_heartbeat_at`, `source_age`, `collector_lag`가
분리되어 있지 않다. 최신 API 응답과 오래된 실행 파일을 동시에 받는 경우 별도의 정체 알림은 없다.
근거: [UI](../../dashboard/app.js) 291–320·331–332줄,
[reader](../../src/dashboard/reader.mjs) 51–66·79줄.

### 2. 복구 가능한 도구 오류와 gate 중단이 화면에서 충분히 분리되지 않는다

`execute`가 정상적으로 exit code 7을 관측하면 gate는 그 결과를 저장하고 `ready`로 돌아간다.
실패한 테스트 뒤 수정할 수 있어야 하므로 이 동작 자체는 타당하다. 하지만 activity는 모든 `outcome`을
`observed`로 표시하고 `outcome.exit_code`·`outcome.duration_ms`·오류 단계를 버린다.
도구 오류를 실행 전체 실패로 과장하지 않으면서도 `tool_failed / recovery_allowed`로 보여줄 정보가 없다.

`DECISION_FAILED`, `INVALID_DECISION`, `EXECUTION_UNCERTAIN`은 gate를 멈추고 `stopped`를
기록한다. activity에서 `stopped`는 보이지만 allowlist가 원인 `code`를 버린다. 상단 run 상태는
gate 사건을 읽지 않으므로 여전히 `running`일 수 있다. Jev 전송 실패/불확실은 공급자 표에 따로
보인다. 이때 `running`이 반드시 프로세스 생존의 거짓말인 것은 아니지만 **더 이상 구현 행동을
진행할 수 없다는 사실**을 요약하지 못한다.

두 경로는 더 약하다.

- `BUDGET_EXHAUSTED`: gate state만 `stopped`로 바꾸고 throw한다. 새 journal 행은 없다.
- `RECORD_FAILED`: 기록 콜백 실패 시 state를 멈추고 throw한다. 같은 경로로 실패 이유를 내구
  기록할 수 있다는 보장은 없다. 첫 input 기록 실패라면 이전 관측도 없다.

MCP 호출자는 `isError:true`와 `gate.status()`를 받지만, 현재 dashboard는 그 응답이나 Claude의
도구 결과를 gate 상태 스트림으로 읽지 않는다. 입력 validation 거절도 소비 0·기록 0으로 돌아가며,
반복 validation 오류 루프를 화면에서 식별할 계측은 없다.

근거: [gate](../../src/benchmark/decision-gate.mjs) 157–180·202–224줄,
[MCP dispatcher](../../src/benchmark/protocol.mjs) 39–44줄,
[activity projection](../../src/dashboard/metrics.mjs) 216–226줄,
[run status](../../src/dashboard/metrics.mjs) 252–285줄.
재현: F01–F07, F17, F20.

### 3. provider·runner의 여러 종료 상태가 하나의 완료 상태로 합쳐진다

Claude 최종 `result`는 stdout stream에 먼저 기록된다. runner는 그 뒤 프로세스 반환, 컨테이너
정리, stderr/최종 응답 저장, `result.json` 저장을 순서대로 수행한다. 이 모든 단계가 같은 원자적
트랜잭션은 아니다.

현재 metrics는 stream의 마지막 `type:'result'`만 있어도 `terminal=true`이며, `is_error:false`이면
`completed`가 된다. runner 최종 receipt가 없는 상태에서 정리나 저장 단계가 중단돼도 stale
deadline 규칙은 적용되지 않는다. F09는 전체 제한 + 30초 이후에도 `completed`를 재현했다.
`provider_finished`, `runner_finalizing`, `artifact_frozen`, `runner_terminal`의 구분이 필요하다.

F10은 반대 충돌이다. CLI가 exit 0으로 종료했지만 유효한 Claude final이 없다면 현재 launcher는
`completion?.is_error === false` 조건을 만족하지 못해 exit 1을 선택한다. 저장된 `process_exit`은
CLI의 0이므로 run 표시는 `completed`, Claude 표시는 `uncertain:1`이다. 최상위 wrapper 결과와
하위 CLI 결과를 따로 기록해야 같은 상태를 재구성할 수 있다.

`cleanup.stopped:false`가 최종 JSON에 들어간 경우에는 run을 `uncertain`으로 바꾸고 Claude의
완료 사용량을 보존한다. 이 경로는 F11에서 확인됐다. 하지만 catch/finally가 stderr에만 기록한
예외나 cleanup 정보는 reader 입력 목록에 없고, result 파일 쓰기가 실패하면 같은 효과를 얻지 못한다.
또한 auth/sandbox/model GET 같은 사전 실패는 출력 디렉터리·manifest 생성 전일 수 있어 목록에
전혀 나타나지 않는다. 이번에 실제 인증 실패를 일으키거나 조회하지는 않았다.

근거: [runner](../../bin/benchmark-run.mjs) 37–46·55–71·72–100줄,
[Claude status](../../src/dashboard/metrics.mjs) 142–153줄,
[run status](../../src/dashboard/metrics.mjs) 252–280줄,
[reader input allowlist](../../src/dashboard/reader.mjs) 46–66줄.

### 4. process/container 생존과 실제 진행의 직접 신호가 없다

현재 reader는 파일만 읽는다. PID 존재, 시작 시각을 포함한 process identity, MCP 접속 lease,
컨테이너 실행 상태를 조회하지 않는다. gate는 명령 직전에 inspect하므로 컨테이너가 행동 사이에
멈춰도 다음 행동 전까지 직접 알아내지 못한다.

종료 기록이 없을 때는 manifest 시작 시각 + 선언된 wall timeout + 30초를 지난 snapshot에서
`uncertain`으로 바뀐다. 그 전의 동일 파일 prefix는 정상 장기 작업과 이미 종료된 프로세스를
구별하지 못한다. 신뢰 가능한 시각/시간 제한이 없으면 `unknown`을 유지하는 점은 타당하다.
이 규칙은 heartbeat나 실제 crash 탐지가 아니라 **deadline 기반 추정**이다.

Jev client의 기본 request timeout은 30초, 명령 실행의 기본 timeout은 120초다. 다만 30초 provider
오류가 내구 기록돼도 run 배지는 별개이며, 명령 timeout 뒤에는 최대 15초 설정의 정리 프로세스가
추가된다. 저장·스케줄링 지연까지 포함한 보장 시간으로 단정할 수 없다. stdout 기록 실패는 자식
프로세스를 종료하고 `OUTPUT_WRITE_FAILED`와 불확실을 반환하지만, 같은 저장 장치의 최종 receipt
쓰기까지 성공하리라는 보장은 없다.

근거: [client](../../src/client.mjs) 132–166줄,
[process/command](../../src/benchmark/docker.mjs) 19–45·48–66줄,
[deadline](../../src/dashboard/metrics.mjs) 253–272줄.
재현: F08, F18. 프로세스/컨테이너 실제 강제 종료는 수행하지 않았다.

### 5. 평가 단계의 진행과 제출물 출처가 아직 연결되지 않는다

E2E grader는 작업 시작 정보를 메모리의 `record`에만 두고, 최종 `finally`에서 `result.json`을
쓴다. 그 전의 새 평가 디렉터리는 reader가 알아보는 파일이 없으므로 목록에 나타나지 않는다.
최종 `resolved:false`와 `grading_status:error/invalid`는 구분할 수 있지만 평가 도중 정체·수집·
설치·검사 단계를 실시간으로 구분할 수 없다.

각 run 디렉터리는 독립 항목이다. runner 결과는 `evaluation:not_run`, 별도 grader 결과는
`model_calls:0`으로 `control`이 된다. 그 값은 '평가 중 모델을 호출하지 않음'을 뜻할 뿐,
제출물이 no-op/oracle 대조군인지 실제 모델 산출물인지 알려주지 않는다. 현재 보관된 대조 기록
7개가 잘못됐다고 주장하는 것은 아니다. **실제 candidate 평가를 추가할 때 해소해야 하는 입력
계약의 모호성**이며 F12/F13으로 재현했다.

근거: [grader](../../benchmarks/e2e-swe/adapter.py) 261–301줄,
[run discovery](../../src/dashboard/reader.mjs) 46–76줄,
[kind/condition](../../src/dashboard/metrics.mjs) 244–251줄,
[evaluation](../../src/dashboard/metrics.mjs) 193–212줄.

## 현재 계측의 확장 경계

`bin/benchmark-run.mjs:64`의 자식 환경 allowlist에는 `CLAUDE_CODE_ENABLE_TELEMETRY`와
`OTEL_*`가 없다. 현재 소스에는 OTLP collector 설정·consumer·span/attempt를 run에 연결하는
변환기도 없다. 따라서 부모 셸에 환경 변수를 추가하는 것만으로 현재 launcher가 전달한다고
가정하면 안 된다.

`src/benchmark/launch.mjs:29–35`는 인증 방식에 따라 `--bare` 또는 `--restricted`, 그리고
`--setting-sources ''`, strict MCP config, 지정 도구만 전달한다. hooks를 제안한다면 이 설정
경계에서 실제 로드되는지 별도로 확인해야 한다. 이번 감사는 hooks/OTel을 켜거나 실제 CLI의
계측 이벤트를 검증하지 않았다. **현재 기본 stream에 HTTP 수가 없다는 사실을 Claude CLI의
모든 선택적 계측이 불가능하다는 주장으로 확대하지 않는다.** 공식 기능 가능성은 별도 공식
문서 조사와 이 실행 경로의 통합 검증을 함께 봐야 한다.

## 장애 주입 검증 matrix

`관측 확인`은 현재 코드의 결과를 재현했다는 뜻이다. `제안` 열은 향후 개선의 수용 기준이며
이번에 구현·검증했다는 뜻이 아니다. 아래 지연은 기록이 정상 저장되고 foreground polling이
진행된다는 조건의 소스 기반 예상이다.

| ID / 주입 | 현재 관측 확인 | 현재 탐지 시점·공백 | 향후 복구/오탐·미탐 검증 제안 |
| --- | --- | --- | --- |
| F01 도구 exit 7 | gate ready, outcome observed | 도구 실패 표시 없음; 원문 trace에만 있음 | 도구 failed 표시 + run 계속 허용; 다음 exit 0 수리와 연결, 전체 실패로 오탐 금지 |
| F02 두 번째 판단에서 한도 소진 | gate stopped, 새 이벤트 0, run running | 다음 wrapper final 또는 전체 deadline; 원인 즉시 누락 | 동일 budget event 1회, gate blocked와 프로세스 alive 분리, 추가 호출 0 확인 |
| F03 action_started 기록 실패 | gate stopped, input/decision만 남음 | 실패 경로 내구 기록 불가, deadline fallback | 독립 supervisor의 recorder health; 실행 0 확인, 오류 진단 원문 노출 금지 |
| F04 모델 lookup 실패 | input/stopped, POST 수 unknown | activity stopped는 다음 poll; 구체 원인·상단 중단은 누락 | lookup failure stage, POST 시도 0을 별도 근거로 확인; 유료 실패와 혼동 금지 |
| F05 Jev 확인된 POST 오류 | attempted 1, failed 1, run running | provider 표는 다음 poll; 구현 중단 상태는 미반영 | provider 결과와 gate halted 모두 표시; 후속 paid call 0 확인 |
| F06 Jev 불확실 POST | uncertain 1, 비용 null, run running | provider 표는 다음 poll | 상태 확인 전 자동 재전송 없음; 늦은 응답·중복 ID 정산 테스트 |
| F07 명령 결과 불확실 | gate stopped, activity stopped, run running | 정리 시도 후 기록·다음 poll; 원인 미표시 | command uncertain + quarantine pending/confirmed 분리; 명령 재실행 금지 |
| F08 출력 없는 pending/idle | deadline 전 running, +30초 후 uncertain | 조기 crash/hang 직접 탐지 없음 | heartbeat-loss와 실제 무진척을 분리; 정상 긴 작업을 failed로 오탐하지 않음 |
| F09 Claude final 후 runner final 없음 | deadline 후에도 completed | 최종화 실패를 영구 놓칠 수 있음 | provider_finished와 runner_finalizing 분리; cleanup/receipt 단계 중단 주입 |
| F10 CLI exit 0, 유효 final 없음 | run completed, Claude uncertain 1 | wrapper exit 1과 화면 불일치 | wrapper outcome 별도 저장; zero/partial stdout 후 종료, 소비 부분합 보존 |
| F11 cleanup false | run uncertain, Claude completed 1 | 최종 result 저장·다음 poll | 성공 응답 사용량 유지, artifact frozen=false 경고; 정리 성공·실패 교대 검증 |
| F12 실제 candidate 형식의 grade | control로 추론, 평가 failed | 평가 출처가 모호 | attempt ID + artifact hash + evaluation ID 결합; oracle/no-op와 실제 제출물 분리 |
| F13 평가 디렉터리만 생성 | visible run 0 | 최종 result 이전에는 안 보임 | evaluation_started/phase/terminal 기록; 수집 오류와 테스트 실패 분리 |
| F14 UTF-8 마지막 줄 중단 | 앞선 input 100 유지, complete total null | 다음 poll에서 partial 경고 | 재접속/후속 바이트 도착 후 동일 행 정확히 1회 복구 확인 |
| F15 같은 ID 중복·충돌 | 동일 응답은 1회, 충돌은 uncertain | 다음 poll | event sequence/source instance 도입 시 재생·out-of-order에도 결과 안정성 검사 |
| F16 final 뒤 미종료 Jev start | run uncertain, pending 1 | 다음 poll | 늦은 종료 수신 시 원본 보존하며 상태 해소; 자동 새 호출 금지 |
| F17 입력 validation 반복 거절 | gate ready, event 0, 소비 0 | 반복 정체를 기록하지 않음 | non-billable validation error count/phase 표시, 호출 수에 합산 금지 |
| F18 process timeout/stream write fault | TIMEOUT / OUTPUT_WRITE_FAILED, uncertain | process 반환 후 최종 파일 저장이 성공해야 화면 반영 | writer/runner crash 간격별 fault; 최종 파일 불가 시 별도 관측 경로 확인 |
| F19 finish completion claim | gate completed, run running, evaluation not_run | gate 완료가 화면 요약에 없음 | completion claim, process 종료, evaluator pass 분리 유지 |
| F20 provider 완료 뒤 gate 검증 거절 | provider completed 1, gate INVALID_DECISION, run running | provider 결과와 실행 허용 여부가 따로 드러나지 않음 | 합법 응답 형식/잘못된 확률 합으로 gate rejection 단계 표시; 응답 완료를 정답으로 해석 금지 |

추가 제안 matrix(이번 미실행): 대시보드 HTTP 500/응답 정체와 파일 신선도 정체를 별도 주입;
runner SIGTERM/SIGKILL, MCP 단절, 컨테이너 종료, 무한 provider 요청/장기 정상 요청, 디스크
full/permission/I/O 오류, event producer 재시작과 sequence reset, 소스 mtime 갱신만 있는 무진척,
평가 중 프로세스 종료를 각각 새 격리 fixture에서 검증한다. 이미 돌아가는 서비스에 장애를
주입하거나 기존 run을 복구 대상으로 삼지 않는다.

## 제안하는 최소 후속 관측 계약과 측정법

이는 조사 결과에 따른 제안이며 채택된 제품 요구사항이나 구현 완료가 아니다.

1. `run_id / attempt_id / source_instance_id / event_seq / occurred_at / persisted_at / observed_at`
   로 source와 collector를 구분한다. seq gap·중복·역순을 검증하되 기록 부재를 사용량 0으로 만들지 않는다.
2. `process`, `container`, `gate`, `provider`, `artifact`, `evaluator`, `billing_coverage` 상태를 따로
   둔다. run 요약은 이 상태의 근거를 보여주고, 도구 오류를 무조건 run 실패로 올리지 않는다.
3. 명령/event 시작과 종료, 고정 오류 code, phase, safe duration·exit code를 브라우저 allowlist에
   추가할 수 있다. 원문 명령·도구 출력·프롬프트·HTTP 헤더·계정 ID는 계속 제외한다.
4. heartbeat는 실행 주체가 보낸 생존 신호이며 실제 진행의 증거는 아니다. 진행은 마지막 행동 완료,
   산출물 변경/검사 결과 같은 명시한 증거를 별도로 집계한다. 임계값은 정상 장기 단계 분포를 본 뒤
   정하고 초기에는 `stalled_suspected`/`unknown`으로 표현한다. 고정 임계값의 근거를 지어내지 않는다.
5. 감지 지연을 `fault_injected_at → producer_event_at → persisted_at → snapshot_observed_at →
   UI_visible_at`으로 나눠 측정한다. producer가 사라진 경우 heartbeat/lease 검출 시간을 따로 적고,
   누락/오탐/미탐/경계값·복구 후 중복률을 분모와 함께 기록한다. 이번 감사는 UI_visible_at을 측정하지 않았다.
6. 관측 재연결과 유료/명령 재실행은 다른 동작이다. reconnect는 기존 기록을 다시 읽는 데 한정하고,
   결과 불확실한 POST·명령은 자동 replay하지 않는다. recovery 확인은 의미적 작업 성공과 별도다.

이 문서 작성으로 감사를 완료한다. 해당 문서 외 저장소 파일은 수정하지 않았고, 기존 서버는 읽기만
했다. 실제 provider 오류·청구 지연·CLI 선택적 계측·브라우저 감지 지연·native 프로세스 crash에 대한
검증은 여전히 남아 있다. 완료 보고 후 이 역할의 쓰기를 종료한다.
