# Jev + Claude 실행 실패를 관측하기 위한 도구 비교

확인일: 2026-10-09 (Asia/Seoul). 담당: `dashboard_research`.
확인 방법: 공식 문서의 본문 조회, 현재 runner/MCP/dashboard 코드 읽기.
검증 수준: 문서상 기능과 설계 적합성 조사. 아래 도구를 설치하거나 실행해 성능·지연·복구를
측정하지 않았다. 사용자 기록·프롬프트·코드를 외부 서비스로 보내지 않았다.

## 이번 문제에 대한 결론

현재 단일 Mac 호스트와 Docker 실험에는 **로컬 JSONL 기록을 정본으로 유지하고,
실행 프로세스의 생존·마지막 진전·기한 초과·결과 불확실을 별도로 표시하는 방식**을 먼저
적용한다. trace viewer를 붙이는 것만으로 종료 신호를 남기지 못한 프로세스나 멈춘 수집기를
정확히 식별할 수 있다고 가정하지 않는다. 아래 선택은 조사자의 권고이며 도입 확정이 아니다.

- **당장:** runner 상태 기록과 화면 갱신 경로를 연결하고, collector/브라우저 연결과 agent
  진행 상태를 분리한다. 새로운 플랫폼 없이 현재 실패의 위치를 먼저 확인할 수 있다.
- **다음 선택적 연결:** Claude의 native OTel logs/metrics를 로컬 collector로 수집하여
  stream JSONL에서 보이지 않는 API 오류·재시도 정보를 보완한다. 실제 설치 CLI 버전과
  restricted 실행 설정에서 수집되는지는 작은 별도 실험으로 검증한다.
- **trace 탐색이 필요할 때:** Phoenix 로컬 배포를 우선 비교한다. 단일 사용자 SQLite 구성과
  수동 OTLP span이 현재 실험에 맞는다. 이는 운영 구성에 따른 판단이며 속도 우위 실측이 아니다.
- **팀 공용 prompt/eval/관측 플랫폼이 필요할 때:** Langfuse를 다시 검토한다. LangSmith는
  이미 계약·배포·LangGraph 자산이 있는 경우 가치가 커진다. 현재는 그런 전제가 없다.
- **여러 머신의 지속 실행·스케줄·재개가 필요할 때:** Temporal/Prefect를 검토한다. 지금
  화면의 실시간 상태를 고치기 위해 실행 엔진부터 바꾸지는 않는다.

## 실패를 서로 다른 층으로 나눠야 하는 이유

이 프로젝트가 구분할 질문은 다음과 같다. 이는 외부 도구의 자동 보장 기능 목록이 아니라
현재 관측 계약에 추가할 설계 제안이다.

1. **화면 갱신:** 브라우저가 새 snapshot/event를 받았는가. SSE 연결이 살아 있다는 사실은
   Claude/Jev가 진행 중이라는 증거가 아니다.
2. **수집 경로:** runner 기록이 저장되었는가, reader가 읽었는가, exporter가 전달했는가.
   마지막 데이터 시각과 조회 시각이 다르면 `수집 지연/미확인`으로 표현한다.
3. **실행 생존:** owner 프로세스와 예상 컨테이너가 살아 있는가. heartbeat는 생존 신호이며
   실제 작업 진전은 마지막 응답·도구 시작/종료·artifact 변화와 구분한다.
4. **개별 작업:** API 오류, 제한 초과, 도구 비정상 종료, 유료 POST 결과 불확실이 있는가.
   shell exit가 관측된 실패와 timeout 이후 서버 처리가 불확실한 상태를 합치지 않는다.
5. **과제 결과:** 완성 주장 뒤 독립 grader가 통과했는가. 모든 span이 OK여도 요구 기능을
   구현하지 않았거나 테스트에 실패할 수 있다.

## 도구별 비교

| 도구 | 실패 확인에 유용한 공식 기능 | 현재 CLI/Docker 연결 방식 | 현재 도입 판단과 남는 한계 |
|---|---|---|---|
| Langfuse | observation level/status, trace 내부 오류 필터; OTel 기반 수동 span | runner → Jev 요청 → Docker 명령을 부모/자식 span으로 추가 | 공용 LLM 관측·평가로 확장할 때 적합. 기본 span 필터 때문에 일반 process/tool 계측이 빠질 수 있어 scope 검증 필요. 자체 실행 생존 감시를 대신하지 않음 |
| Phoenix | OpenInference의 agent/tool/evaluator span, exception/status, OTLP 수집 | JSONL adapter 또는 Node 수동 span; 로컬 Phoenix에 전송 | 단일 사용자용 trace viewer의 우선 검토 후보. Jev decision provider 완전 지원은 문서상 아직 없음. Jev 청구 단위는 custom attributes로 보존 |
| LangSmith | traceable/RunTree 및 OTLP tracing, 명시적 start/end/patch, 오류·trace 탐색 | Node wrapper 또는 JSONL → RunTree 변환 | LangChain이 필수는 아님. 현재 프로젝트를 LangChain으로 바꿀 이유는 없음. self-host는 Enterprise add-on 조건이며 현재 계약 여부 미확인 |
| OTel Collector + Grafana 계열 | logs/metrics/traces 수신, export queue·실패 지표, No Data/Error/MissingSeries 알림 | native Claude telemetry와 runner event를 수집; 로그·지표·trace 저장소를 각각 연결 | 호스트·프로세스·수집기 장애와 모델 오류를 함께 볼 때 가장 범용적. Collector나 Grafana 화면만 설치해도 저장·알림이 완성되는 것은 아님 |
| Temporal | Activity heartbeat·시작/전체 기한·attempt 이력, durable workflow | Claude/컨테이너 실행을 Activity로 감싸고 결과·불확실을 명시 | 분산 장기 실행·재개 문제에 적합. retry 정책이 Jev POST를 다시 실행하지 않게 별도 설계 필요. 현재 관측만을 위해 옮길 비용이 큼 |
| Prefect | run 상태 이력, worker health, run heartbeat 기반 zombie 감지, 이벤트 부재 trigger | Python flow/task가 현재 CLI runner를 호출하거나 custom event를 제출 | 반복 벤치마크 orchestration 후보. worker polling 건강과 실제 flow 진전은 다름. 실패를 삼킨 wrapper가 Completed로 끝나지 않도록 결과 검사 필요 |

표의 기능 근거와 조건은 아래 항목에서 각각 확인한다. 위 판단의 운영 부담은 문서에 명시된
필수 구성과 기존 소스의 차이를 비교한 추론이며 메모리 사용량·설치 시간 측정값이 아니다.

## Langfuse: 오류 탐색과 수집 실패를 구별

관측치에 ERROR/WARNING과 상태 설명을 붙이고 trace 안에서 수준별로 필터링할 수 있다.
OTel span의 ERROR 상태도 오류 수준으로 매핑한다.
[Log Levels](https://langfuse.com/docs/observability/features/log-levels)

최신 SDK의 기본 export 필터는 Langfuse·GenAI·알려진 LLM instrumentation scope를 중심으로
동작한다. 일반 Docker/process span은 자동으로 보인다고 가정할 수 없고, 부모 span이 빠지면
자식이 고립되어 보일 수 있다. 수동 span은 종료해야 하며 짧은 프로세스는 flush/shutdown이
필요하다. 마스킹은 전송 전에 적용할 수 있다.
[Advanced Features](https://langfuse.com/docs/observability/sdk/advanced-features),
[Troubleshooting](https://langfuse.com/docs/observability/sdk/troubleshooting-and-faq)

self-host 구성은 Web/Worker와 Postgres, ClickHouse, Redis/Valkey, S3/Blob 저장소를 포함한다.
수집은 비동기 worker를 거치므로 SDK flush가 화면 반영 완료를 뜻하지 않는다. Docker Compose는
로컬 시험용으로 안내하며 HA·backup을 제공하는 배포와 구별한다.
[Self-hosting architecture](https://langfuse.com/self-hosting),
[Docker Compose](https://langfuse.com/self-hosting/deployment/docker-compose)

**적용 판단:** trace/평가/프롬프트를 팀이 함께 쓰게 되면 도입 가치가 있다. 현재 작은 단일
호스트 실험에서는 새 수집 시스템 장애와 저장소 운영까지 추가되므로 우선순위를 낮춘다.
Jev credits를 Langfuse의 일반 LLM USD 비용으로 강제 매핑하지 않는다.

## Phoenix: 로컬 trace viewer 후보

Phoenix는 UI·collector·SQL backend 구성이다. SQLite는 로컬·단일 사용자용 기본 선택이고
PostgreSQL은 운영·다중 사용자 배포에 권장한다.
[Architecture](https://arize.com/docs/phoenix/self-hosting/deployment)

수동 계측은 agent/tool/LLM/evaluator 등 종류와 exception/status를 표현한다. 문서에
`DECISION` kind도 있지만 experimental이며 decision-model provider 완전 지원이 아직 없다고
명시한다. 따라서 Jev endpoint가 자동 계측된다고 주장하지 않고 runner에서 직접 span을 만든다.
[Tracing Helpers](https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/instrument)

Node SDK의 batch 설정은 종료 전 shutdown으로 미전송 큐를 비워야 한다. batch를 끄면 즉시
export하도록 설정할 수 있지만 모델 호출 지연과 수집 지연의 영향은 실측해야 한다.
[Setup OTEL](https://arize.com/docs/phoenix/tracing/how-to-tracing/setup-tracing/setup-using-phoenix-otel)

**적용 판단:** trace viewer를 붙인다면 로컬 첫 후보다. 원본 JSONL은 계속 정본으로 보존하고
초기에는 prompt/command 원문 없이 ID·상태·기간·사용량만 전송한다. native Claude logs와
metrics가 trace endpoint에 그대로 저장된다고 가정하지 않는다. 신호별 지원과 매핑을 검증해야 한다.

## LangSmith: 외부 CLI를 감쌀 수 있으나 현재 배포 전제가 다름

LangChain을 쓰지 않아도 함수 wrapper 또는 RunTree로 부모/자식 실행을 만들 수 있다.
명시적인 시작 제출 후 end/patch로 완료를 기록하며 background 전송은 종료 전 flush가 필요하다.
[Custom instrumentation](https://docs.langchain.com/langsmith/annotate-code)

OpenTelemetry trace 수집 경로도 제공한다. self-hosted LangSmith는 Enterprise add-on으로
안내되어 있고 trial도 license key 절차가 있다. SaaS 사용은 외부 trace 전송을 의미하므로 이번
조사에서 연결하지 않았다.
[OpenTelemetry](https://docs.langchain.com/langsmith/trace-with-opentelemetry),
[Self-hosted LangSmith](https://docs.langchain.com/langsmith/self-hosted)

**적용 판단:** 이미 팀에서 LangSmith를 운영한다면 기존 CLI를 유지한 wrapper로 비교할 수 있다.
지금은 자체 dashboard의 실패 상태를 고치는 데 이 플랫폼이나 LangChain 도입이 필수는 아니다.
어떤 wrapper든 CLI 내부 요청 수·청구액이 자동으로 드러나는 것은 아니다.

## OTel + Grafana: 실행 장애와 계측 장애를 함께 다룰 때

Collector는 logs/metrics/traces의 수신·처리·전송 계층이다. queue 크기·enqueue 실패·send 실패·
accepted/sent 지표로 수집 경로 자체를 볼 수 있다. send 실패 증가만으로 데이터가 영구 유실됐다고
단정하지 않는다. retry가 진행 중일 수 있다.
[Collector](https://opentelemetry.io/docs/collector/),
[Internal telemetry](https://opentelemetry.io/docs/collector/internal-telemetry/)

내보내기 queue를 persistent storage로 보강할 수 있지만 queue 포화·보존 기한·디스크 장애 시
여전히 손실될 수 있다. telemetry 재전송과 실제 유료 모델 요청 재실행은 다른 동작이다.
[Collector resiliency](https://opentelemetry.io/docs/collector/resiliency/)

Grafana는 query 실패, 결과 전체 없음, 일부 series 소실을 구분한다. 일부 series가 사라지면
stale 처리 후 resolved/Normal로 보일 수 있다. 따라서 오래된 run이 화면에서 사라졌거나 초록으로
보인다고 완료됐다고 판단하지 않는다.
[Missing data](https://grafana.com/docs/grafana/latest/alerting/guides/missing-data/),
[Stale alert instances](https://grafana.com/docs/grafana-cloud/observe-and-act/alert-and-measure-reliability/alerting/fundamentals/alert-rule-evaluation/stale-alert-instances/)

**적용 판단:** 여러 호스트에서 실행·container·collector 상태를 지속 운영하게 될 때 유리하다.
현재는 로컬 상태 이벤트를 OTel로 변환할 수 있도록 ID와 상태 의미를 먼저 고정한다. Grafana
alert를 구현하더라도 관측이 멈춘 상태를 성공으로 바꾸는 규칙은 사용하지 않는다.

## Temporal와 Prefect: 실행 엔진의 실패 처리

Temporal은 Activity별/전체 기한과 heartbeat로 worker 소실을 다룬다. heartbeat 누락 뒤 retry가
설정돼 있으면 다음 attempt가 실행될 수 있고, 취소도 heartbeat 전달에 영향을 받는다.
자체 호스팅에는 Service와 persistence 운영이 있으며 local development server와 지속 운영을
구별한다.
[Activity failures](https://docs.temporal.io/encyclopedia/detecting-activity-failures),
[Deployment](https://docs.temporal.io/self-hosted-guide/deployment)

**적용 판단:** 여러 머신에 분산된 장기 과제의 재개·취소가 제품 요구가 될 때 검토한다. 현재
Jev 결과 불확실 상태를 retry 가능한 일반 실패로 감싸면 중복 청구·중복 실행 위험이 생긴다.
도입하더라도 외부 side effect의 idempotency/결과 조회 없이 exactly-once를 주장할 수 없다.

Prefect는 Failed/TimedOut/Crashed와 상태 이력을 제공한다. flow가 예외 없이 반환하면 내부
task 실패를 삼킨 경우에도 Completed가 될 수 있어 최상위 반환 계약을 명확히 해야 한다.
worker healthcheck는 polling 확인이며 성공적인 flow 실행 확인은 아니다.
[States](https://docs.prefect.io/v3/concepts/states),
[Worker healthchecks](https://docs.prefect.io/v3/advanced/worker-healthchecks)

run heartbeat가 끊겨 Running에 남은 zombie를 찾는 기능은 Cloud 관리 automation 또는
self-hosted의 명시적 automation으로 구성한다. 예상 event의 부재도 trigger로 정의할 수 있다.
server는 SQLite로 가볍게 시작하거나 PostgreSQL로 운영할 수 있다.
[Zombie flows](https://docs.prefect.io/v3/advanced/detect-zombie-flows),
[Automations](https://docs.prefect.io/v3/concepts/automations),
[Server](https://docs.prefect.io/v3/concepts/server)

**적용 판단:** Python 기반 반복 벤치마크 배치·스케줄링에는 후보지만 현재 Node runner를
flow로 감싸는 변경과 서버 운용이 필요하다. 시간 경과를 근거로 유료 작업을 자동 재시작하지
않으며, 우선 현행 runner의 실패 기록을 완전하게 만드는 편이 직접적이다.

## Claude native telemetry와 현행 코드의 연결 경계

공식 Claude 문서에는 OTel metrics/events와 선택적 traces가 있다. API request/error/retries
exhausted, tool result, process 내 event 순서·request correlation 등이 포함된다. exporter는
환경·관리 설정으로 제어하며, CLI는 OTel 환경을 Bash/MCP 등 하위 프로세스에 그대로 전달하지
않는다. 따라서 Claude와 Jev MCP의 계측을 각각 구성해야 한다.
[Claude monitoring](https://code.claude.com/docs/en/monitoring-usage)

조사 시점의 [runner](../../bin/benchmark-run.mjs)는 stdout를 JSONL로 저장하고 최종 CLI 결과를
요약하며, 하위 CLI 환경변수를 allowlist로 구성한다. 이 목록에는 OTel 환경변수가 없었다.
따라서 shell에서 OTel 변수를 설정한 것만으로 이 runner의 실제 수집을 확인했다고 할 수 없다.
이 관찰은 조사 중 코드 snapshot에 한정되며 동시 구현에서 변경될 수 있다.

선택적 native 계측을 실제로 켜더라도 기록되는 API event 범위·중복·flush·CLI 버전을 검증해야
한다. tracing 도구가 OAuth 구독의 실제 청구액을 제공한다고 가정하지 않는다. 호출·토큰·비용의
출처 계약은 [기존 대시보드 조사](../DASHBOARD_RESEARCH.md)를 유지한다.

## 현재 구현에 권고하는 관측 이벤트와 검증

다음은 새 구현 담당자가 채택할 수 있는 계약 제안이다. 이 조사 역할에서 구현하지 않았다.

- 공통 ID: `run_id`, `execution_id`, `event_id`, `sequence`, `source`와 관측 시각.
  재개·교체 프로세스는 새 execution ID를 갖게 한다. PID만으로 재사용된 프로세스를 동일 실행으로
  단정하지 않는다.
- 수명 주기: 시작, heartbeat, 종료 시도, 종료 확인, 결과 기록, cleanup 성공/실패.
  `last_heartbeat_at`와 `last_progress_at`는 따로 둔다.
- 개별 동작: 시작과 관측된 종료, 오류 code, timeout/transport의 outcome_uncertain, 호출/도구 ID.
  종료가 없으면 duration을 확정값으로 쓰지 않고 아직 열린 동작임을 표시한다.
- 데이터 경로: source 마지막 시각, reader 마지막 성공 시각, browser 마지막 수신 시각,
  parse 오류/미완성 줄, stream 재접속·gap·중복 이벤트 수.
- 실패 분류: 프로세스 종료 확인, 기한 초과, 생존 미확인, 진행 정체 의심, 수집 오류, 과제 채점 실패.
  `의심/미확인`을 실제 실패나 성공으로 몰래 승격하지 않는다.

회귀 시나리오는 살아 있으나 출력 없는 child, 명시적 nonzero exit, child SIGKILL로 최종 result
누락, MCP 종료, Jev timeout, 마지막 JSONL 미완성 줄, SSE 단절 후 재연결, exporter 장애,
독립 grader 실패를 포함한다. 유료 모델 없이 mock child와 임시 JSONL로 대부분 확인할 수 있다.
실시간 지연은 event 기록 시각→API snapshot→브라우저 반영 시각을 따로 재고, 이 조사에서는
어떤 도구의 지연 수치도 측정하지 않았다.

## 접근 실패와 조사 한계

다음 URL은 이번 웹 도구에서 실패하거나 목적과 다른 페이지로 이동했다. 해당 실패를 기능
부재의 근거로 쓰지 않았으며 위에서 실제 읽은 정식 페이지로 확인 범위를 한정했다.

- Phoenix의 `.../tracing/how-to-tracing/manual-instrumentation`,
  `.../setup-tracing/manual-instrumentation`, `.../setup-tracing/tracing-helpers`: 도구 Internal Error.
  공식 Setup OTEL 링크를 따라 `.../setup-tracing/instrument`를 읽었다.
- LangSmith의 `.../trace-without-langchain`, 옛 JS Client reference 경로: Internal Error.
  공식 quickstart 링크의 `.../annotate-code`와 OTLP 문서를 읽었다.
- LangSmith Python Client/flush reference: 웹 도구가 markdown content-type을 처리하지 못함.
  `annotate-code`의 종료 전 flush 절차를 근거로 사용했다.
- Prefect `.../concepts/workers`는 fetch 오류, `.md`는 content-type 오류. 공식
  `advanced/worker-healthchecks`, `advanced/detect-zombie-flows`를 읽었다.
  옛 `.../manage/self-host`는 introduction으로 이동하여 `concepts/server`를 별도로 확인했다.

가격·성능 우열·실시간 SLA는 조사하지 않았다. 실제 도입 시 버전과 endpoint, 개인정보 export
allowlist, 폐쇄 네트워크 여부, 의도한 실패의 표시를 재검증해야 한다. 이 문서의 결과는 선택
근거이며 설치·실행 성공 증거가 아니다.

부수 효과: 이 문서만 추가했다. 소스 변경·설치·컨테이너·모델 호출·외부 trace 전송·commit/push 없음.
