# 실시간 전달과 실패 확인 화면 조사

조회일: **2026-10-09, Asia/Seoul**. 담당: `dashboard_ui`, [조사 역할](../agents/REALTIME_TRANSPORT_RESEARCH.md).
범위: 현재 코드 읽기와 공식 문서 조사. 아래 적용안은 **제안**이며 제품 코드·서버·실행 설정을 변경하지 않았다.
실제 전달 지연, 실패 감지 정확도, 브라우저별 백그라운드 동작은 이번에 측정하지 않았다.

## 결론과 적용 순서

현재의 로컬 읽기 전용 대시보드에는 **SSE로 정제된 전체 상태를 보내고, 기존 snapshot GET을 복구 경로로 유지**하는 방식이 맞는다.
서버가 사용자 브라우저에 상태를 전달하는 단방향 요구이므로, 이번 단계에서 양방향 WebSocket이나 별도 메시지 브로커까지 도입할 근거는 없다.
이는 요구와 구현 복잡도를 대조한 설계 판단이며, 이 프로젝트에서의 성능 비교 실측 결과가 아니다.

먼저 **실행기가 어떤 단계에 있고 무엇 때문에 멈췄는지** 기록해야 한다. SSE 연결만 추가하면 과거 로그를 더 빨리 전달할 뿐,
모델이 추론 중인지, 명령이 진행 중인지, 기록기가 멈췄는지 새로 알 수 없다.
작업 실패, 실행 결과 불확실, 기록 읽기 실패, 브라우저 연결 끊김을 서로 다른 상태로 보여주는 것이 전달 방식 교체보다 우선이다.

제안 순서는 다음과 같다.

1. 실행 단계·종료 이유·관측 시각·runner heartbeat와 부분 기록 상태를 정제 계약에 추가한다.
2. 기존 polling 화면에서 실패가 사용자의 첫 화면에 드러나는지 검증한다.
3. 공용 수집기와 snapshot revision을 만든 후 SSE를 붙인다. GET 복구 경로와 동일 집계 함수를 사용한다.
4. 연결 끊김, 재연결, 서버 재시작, 느린 클라이언트, 숨겨진 탭을 합성 기록으로 검증하고 지연을 측정한다.

## 현재 구현에서 직접 확인한 사실

확인 파일: [브라우저 로직](../../dashboard/app.js), [HTTP 서버](../../src/dashboard/server.mjs),
[파일 reader](../../src/dashboard/reader.mjs), [집계 로직](../../src/dashboard/metrics.mjs),
[현행 계약](../DASHBOARD_CONTRACT.md), [benchmark runner](../../bin/benchmark-run.mjs),
[MCP journal writer](../../bin/benchmark-mcp.mjs).

재현용 읽기 명령:

```sh
rg -n 'setInterval|AbortController|generated_at|connection-status' dashboard/app.js
rg -n 'snapshot|readFileSync|no-store|Content-Security' src/dashboard/server.mjs
rg -n 'readSnapshot|MAX_|pending_line|readRegular|generatedAt' src/dashboard/reader.mjs
rg -n 'hasDeadlineEvidence|stale|status =|activity|slice\(-100\)' src/dashboard/metrics.mjs
rg -n 'fsyncSync|onStdout|process_exit|outcome_uncertain' bin/benchmark-run.mjs bin/benchmark-mcp.mjs
```

- 브라우저는 `setInterval(refresh, 3000)`으로 조회한다. 진행 중 요청이 있으면 다음 조회를 건너뛰며,
  요청에는 `10000 ms` 취소 제한이 있다. 이는 **코드 설정값**이며 3초 이내 표시 보장이 아니다.
- `/api/snapshot` 요청마다 동기 파일 읽기와 집계를 수행한다. 탭이 늘면 같은 파일을 여러 번 읽게 되는 구조다.
  HTTP 응답 시각 `generated_at`은 매번 새로 생성되며 **원천 실행이 진전한 시각이 아니다**.
- reader 제한은 파일당 `24,000,000 bytes`, 실행 `200개`, JSONL 파일당 `30,000줄`이다. 이는 현재 코드 상한이다.
  불완전한 마지막 줄은 pending, 형식이 잘못된 완결 줄은 오류로 남긴다. SSE 도입 시 이 경계를 제거하지 않는다.
- 현재 진행 상태는 종료 기록과 선언된 실행 제한을 사용한다. 제한 뒤 `30초` 유예가 지났는데 종료 기록이 없으면
  `uncertain`으로 바뀐다. 별도 runner heartbeat나 현재 단계의 직접적인 생존 확인은 없다.
  제한 이내 `running`은 해당 코드의 추론 상태이며, 프로세스가 현재 살아 있다는 측정이 아니다.
- 활동은 정제된 최근 `100건`이다. 현재 화면은 이 중 최근 `8건`을 먼저 보인다. 전체 원천 감사 로그와 같지 않다.
- 활동에는 명령 원문이나 오류 원문이 없다. `outcome`, `stopped` 등 일부 이벤트는 현재 정제 과정에서 이유 코드가
  빠져 있어, 사용자가 중단 원인을 바로 판단하기 어렵다.
- 브라우저는 조회 실패 시 이전 값을 유지하고 연결 오류를 보여준다. 조회가 성공하지만 원천 기록이 멈춘 경우를
  독립적으로 설명할 `source_last_seen_at`, `last_progress_at`, `heartbeat_at` 필드는 아직 없다.

## 전달 방식 비교

| 방식 | 현재 요구에 적용할 때의 장점 | 별도로 구현해야 하는 책임·한계 | 이번 제안 |
|---|---|---|---|
| 주기적 GET polling | 기존 코드와 테스트를 유지하며 마지막 전체 상태 복구가 단순함 | 변경이 없어도 요청·집계 발생, 주기만큼 대기 가능, 숨겨진 탭의 timer 지연 | 초기 상태·수동 새로고침·SSE 불가 시 복구에 유지 |
| Long polling | 변경 또는 timeout까지 응답을 보류하여 빈 응답 반복을 줄일 수 있음 | 응답 직후 다음 요청 사이 틈, 중복·누락 방지 cursor, 요청별 timeout/취소/연결 자원 관리 필요 | SSE와 동시에 별도 구현하지 않음 |
| SSE / EventSource | HTTP 기반 단방향 이벤트, 브라우저 재연결과 event ID 지원, 현재 읽기 전용 구조에 맞음 | 데이터 replay 보관·cursor 해석·느린 수신자·proxy·출처 생존은 애플리케이션 책임 | 정제된 전체 snapshot + heartbeat를 보내는 우선 후보 |
| WebSocket | 양방향 상호작용과 binary 메시지가 필요한 경우 적합 | 현행 WebSocket API는 수신 backpressure를 자동 제공하지 않음. 재연결·replay·응용 heartbeat도 별도 설계 | 현재는 도입하지 않음. 원격 조작 요구가 생기면 새로 검토 |

Polling/long polling의 요청 주기·보류 응답·자원 trade-off는 [RFC 6202 §2](https://www.rfc-editor.org/rfc/rfc6202.html#section-2),
SSE의 단방향 전송과 브라우저 사용법은 [MDN SSE](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events),
WebSocket의 양방향 연결과 backpressure 한계는 [MDN WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)를 확인했다.
RFC 6202는 2011년의 Informational 문서이므로 현재 브라우저 지원률이나 이 프로젝트의 성능 수치 근거로 사용하지 않는다.

## SSE를 적용할 경우의 계약 제안

### 데이터 경로

`실행기 내구 기록 → 공용 reader/집계 → 비밀 없는 snapshot → SSE/GET → 브라우저`

- `/api/snapshot`을 유지하고 `/api/events`를 추가한다. 둘 다 기존 loopback Host/Origin 검사와 읽기 전용 정책을 적용한다.
  브라우저로 키, 원문 prompt, shell command, stderr, 절대 경로를 전송하지 않는다. query string에 인증 키를 넣지 않는다.
- 초기 연결에는 최신 전체 snapshot을 보낸다. 이후 값이 바뀔 때만 새 revision을 보낸다.
  `generated_at`만 바뀌었다는 이유로 모든 기록을 매번 재전송하지 않도록 상태 내용과 수집 시각을 분리한다.
- `snapshot`은 상태 전체를 **교체**한다. 브라우저가 스트림 재수신 때 호출 수나 토큰을 더하는 방식은 사용하지 않는다.
  최종 usage와 중간 usage의 중복 합산 금지 등 기존 집계 계약은 그대로 유지한다.
- server가 관측 가능한 표준 상태/숫자만 내보낸다. 오류 메시지도 고정 code와 검토한 한국어 설명으로 제한한다.

다음은 **제안 형식**이며 실제 발생 이벤트가 아니다. 괄호 자리표시자는 구현에서 검증된 값으로 바꾼다.

```text
id: <server-epoch>:<revision>
event: snapshot
data: {"schema_version":"jev-dashboard/v2","revision":"<server-epoch>:<revision>","snapshot":{...}}

event: heartbeat
data: {"server_observed_at":"<ISO>","collector_status":"ok|degraded"}

```

SSE는 UTF-8 `text/event-stream`이고, 이벤트 경계에는 빈 줄이 필요하다. `id`와 `Last-Event-ID`는 브라우저 재연결 시
마지막 ID 전달을 지원한다. `retry`는 재연결 대기값을 지정하지만 서버의 과거 데이터 보관이나 exactly-once 실행을 제공하지 않는다.
댓글 줄은 이벤트로 전달되지 않는다. 근거: [WHATWG HTML §9.2](https://html.spec.whatwg.org/multipage/server-sent-events.html).
따라서 브라우저의 생존 표시에는 named heartbeat를 사용하며, 전송용 댓글만 보내면서 JS가 수신했다고 가정하지 않는다.

### 재연결·replay·cursor

**전체 상태 관측과 모든 사건 감사의 보장을 구분**한다. 현재 요구는 최신 상태·비용·실패를 복구하는 것이고,
완전한 감사 로그는 원천 journal이 담당한다.

- 같은 EventSource 인스턴스의 재연결에는 `Last-Event-ID`가 사용된다. 서버는 ID 길이·문법과 epoch를 검사한다.
- 초기 버전은 bounded memory에 최신 snapshot만 보관해도 된다. 그보다 오래된 cursor나 서버 재시작에는
  `reset` 이벤트와 최신 전체 snapshot을 보낸다. 이것은 **현재 상태 복구**이며 빠진 모든 중간 이벤트 replay가 아니다.
- 추후 모든 중간 이벤트 보기를 요구하면 내구 `event_seq`와 보관 범위, `after` cursor 페이지 API를 따로 추가한다.
  보관 범위를 벗어나면 `gap`과 `oldest_available_seq`를 명시하고 조용히 누락하지 않는다.
- 페이지 새로고침으로 새 EventSource를 만든 경우까지 이전 cursor가 자동 보존된다고 가정하지 않는다.
  이 경우 최신 snapshot 재수신으로 복구한다. 별도 저장 cursor를 도입한다면 비밀 없는 revision만 저장한다.
- 새 서버 epoch에서는 이전 epoch의 revision 크기를 비교하지 않는다. 같은 epoch의 중복·역순 snapshot은 무시한다.
- named heartbeat에는 새 데이터 revision을 부여하지 않아도 된다. heartbeat를 비용·호출 횟수나 데이터 진전으로 세지 않는다.
- 오류 배너는 사용자에게 중요한 실패 상태가 현재 snapshot 안에 유지되도록 한다. 짧게 나타났다 사라지는 transient
  전송 메시지만으로 실패 이력을 표현하면 연결 끊김 중 실패를 놓친다.

### heartbeat·stale·disconnect의 구분

서로 다른 관측이다.

| 관측 | 알 수 있는 것 | 알 수 없는 것 |
|---|---|---|
| SSE heartbeat 수신 | 이 시각까지 dashboard server → browser 경로가 메시지를 전달함 | 모델 추론·Docker 명령·runner가 진행 중인지 |
| reader 수집 성공 | 정해진 파일을 읽고 해석했다는 사실 | 같은 과거 내용을 읽었다면 실제 작업 진전 |
| runner heartbeat | runner가 자기 상태를 기록할 수 있었다는 사실 | 자식 모델 요청의 내부 계산 진전·유효한 결과 |
| 명령·추론 종료 receipt | 해당 작업의 관측 결과 또는 불확실 종료 | 전체 제품 완성·평가 통과 |
| 독립 평가 결과 | 수행한 검사 범위의 통과·실패 | 수행하지 않은 브라우저/native 검사 |

`event_at`, `observed_at`을 나누자는 제안은 OpenTelemetry의 발생 시각과 수집 시각 분리 원칙을 참조한다.
미제공 발생 시각을 수집 시각으로 위장하지 않는다. [OpenTelemetry Logs Data Model](https://opentelemetry.io/docs/specs/otel/logs/data-model/)

초기 실험용 **제안 설정**은 dashboard heartbeat `15초`, 연결 관측 경고 `45초`, fallback GET `3초`다.
이는 제품 설정 후보이며 감지 성능 실측치나 모델 timeout이 아니다. WHATWG의 저빈도 댓글 keepalive 설명도 참고했지만,
특정 proxy·OS sleep·브라우저 timer에서 이 주기를 보장하지는 않는다.
실제 실패는 명시적인 종료·오류 근거로 표시하고, silence는 우선 `관측 지연` 또는 `결과 불확실`로 표시한다.
작업별 긴 추론/빌드 시간은 runner deadline과 별도 정책으로 다루며 45초 무응답만으로 자동 실패 처리하지 않는다.

### backpressure·자원 한도·수집기

Node의 `response.write()`가 `false`를 반환하면 일부 데이터가 사용자 공간에 queue되었고 `drain`을 기다릴 수 있다.
`write()` 성공은 사용자 화면 반영 acknowledgement가 아니다. [Node HTTP response.write](https://nodejs.org/api/http.html#responsewritechunk-encoding-callback)

구체 제안:

- 클라이언트마다 무제한 snapshot queue를 두지 않는다. 전송 중이면 **미전송 최신 전체 상태 하나**로 합친다.
  이는 전체 snapshot일 때 가능한 정책이며 감사용 개별 이벤트를 임의로 버리라는 뜻은 아니다.
- `write(false)` 이후 추가 write를 멈추고 `drain`/`close`를 처리한다. 정한 byte/time 한도에 도달하면 연결을 종료하여
  최신 snapshot으로 복구시킨다. heartbeat도 막힌 연결에 무제한 누적하지 않는다.
- 연결 종료 시 타이머·리스너·구독을 해제한다. 동시에 접속한 클라이언트 수, queue bytes, 재연결 수를 별도 내부 지표로 남긴다.
- subscriber마다 전체 파일을 다시 읽지 않고 공용 수집 결과를 재사용한다. 원천 record 확정 후 publish한다.
  파일마다 최대 크기·형식·symlink 금지 등 reader 검사를 유지한다.
- 현재 동기 전체 재독해가 실제로 병목인지 먼저 측정한다. 필요하면 파일별 변경 감지/append offset cache를 적용하되,
  회전·truncate·새 inode·불완전 UTF-8·불완전 JSONL과 실패 복구를 검증한다.
- `fs.watch`는 빠른 재수집 **힌트**로만 사용하고 주기적 reconciliation을 남긴다. Node 문서는 플랫폼·가상화 파일 시스템의
  차이, 삭제 후 재생성 시 inode 변경, 파일명 누락 가능성을 명시한다. [Node fs.watch caveats](https://nodejs.org/api/fs.html#caveats)

### proxy·숨겨진 탭

로컬 직접 접속에는 현재 reverse proxy가 없다. 향후 proxy 뒤에서 서비스할 때에는 buffering과 read timeout을 별도로 검증한다.
NGINX는 응답 buffering이 켜져 있을 수 있고 `proxy_buffering off` 또는 `X-Accel-Buffering: no`로 제어할 수 있으나,
헤더를 무시하는 설정도 가능하다. 코드에 헤더만 넣고 모든 중간 장비가 실시간으로 전달한다고 주장하지 않는다.
[NGINX proxy_buffering](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering)

브라우저의 숨겨진 탭은 timer가 지연되고 화면 업데이트가 멈출 수 있다. `setInterval(3000)`은 시간 보장이 아니다.
`visibilitychange`로 복귀할 때 최신 snapshot을 재조회하고 절대 시각 기반으로 freshness를 다시 계산하도록 제안한다.
SSE를 사용해도 OS sleep 중 UI 표시와 기록 수집이 계속됐다는 보장은 없다.
[MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

SSE는 HTTP/1.x 환경에서 같은 도메인에 여러 연결을 만들 때 브라우저 연결 수 제한의 영향을 받을 수 있다.
탭마다 여러 EventSource를 만들기보다 dashboard당 연결 하나를 유지하는 방안을 우선한다.
[MDN SSE 연결 한계](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events#listening_for_custom_events)

## 실패를 먼저 확인하는 화면 정보 구조 제안

현재 첫 지표는 호출·응답 단계·경과 시간이다. 실패 조사에서는 이를 보되 **현재 작업 상태와 다음 판단**을 앞에 둔다.
Google SRE의 증상과 원인 구분, 단순하고 조치 가능한 경고 원칙을 적용한 프로젝트 제안이다.
[Google SRE: Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/)

### 첫 화면

1. **진행 상태:** `실행 중 / 복구 진행 / 중단 / 결과 불확실 / 실행 종료 / 평가 실패`를 근거와 함께 표시한다.
   실행 종료와 평가 통과를 한 개의 녹색 성공 상태로 합치지 않는다.
2. **마지막 단계와 시간:** `Jev 판단 응답 대기`, `선택 명령 실행`, `검증`, `종료 정리` 등 계측된 단계만 표시한다.
   완료 작업 수의 분모가 없으면 임의 진행률·예상 완료 시간을 만들지 않는다.
3. **사용자의 다음 판단:** 예를 들어 `인증 필요`, `설정한 한도 소진`, `결과 확인 후 재실행 판단`, `평가 오류 확인`.
   readonly 화면에서 자동 재시도·추론 시작 버튼을 추가하지 않는다.
4. **관측 상태:** 브라우저 연결 / 원천 기록 수집 / runner 생존을 나눠 표시한다. 최근 UI 수신 시간만으로 `정상 실행 중`이라 하지 않는다.
5. **사용량:** 중단 시점까지 관측된 부분합, 미확인 요청 수, 청구 불확실 범위를 위 상태 바로 아래에 둔다.

### 상세 원인 패널

제안 필드: `phase`, `code`, `reason_category`, `observed_at`, `last_progress_at`, `pending_request_count`,
`result_certainty`, `recovery_hint`, `cleanup_status`. 코드·범주·힌트는 allowlist로 정제한다.
원천 세션을 조사할 때 쓰는 안전한 상대 evidence ID를 제공하되 원문 로그·명령을 브라우저에서 그대로 열지는 않는다.

| 상황 | 우선 표시 | 사용자에게 안내할 다음 확인 |
|---|---|---|
| snapshot/SSE 연결만 끊김 | `대시보드 연결 끊김 · 마지막 기록 유지` | 서버 연결 확인; 작업 실패로 단정하지 않음 |
| reader 실패/일부 JSONL 미완결 | `기록 집계 미완료` | 다음 수집 확인 또는 정제된 reader 오류 확인; 0으로 채우지 않음 |
| auth/모델 지원/요청 형식 오류로 명시 중단 | `실행 중단 · 확인된 이유 범주` | 인증/모델/설정 수정 후 새 실행 판단 |
| 모델 POST 전송 후 timeout·연결 유실 | `결과 불확실 · 청구 확인 필요` | receipt·사용량 확인; 자동 재전송하지 않음 |
| 명령 nonzero, 이후 복구 단계 관측 | `명령 실패 · 복구 진행 중` | 실패 단계와 후속 진행 확인; 전체 run 실패로 성급하게 승격하지 않음 |
| 프로세스 종료 없이 runner 관측이 오래됨 | `실행 상태 확인 필요` | deadline·외부 supervisor 관측 확인; silence만으로 확정 실패라 하지 않음 |
| 에이전트 종료 성공, 독립 평가 실패 | `실행 종료 · 평가 실패` | 실패 검사항목과 평가기 상태 확인 |
| 작업은 끝났지만 container 정지가 미확인 | `종료 정리 불확실` | 결과 고정·정리 상태 확인; 이미 관측된 usage는 보존 |

실패·불확실 상태는 색상뿐 아니라 텍스트/아이콘으로 표시한다. 일반 변경은 `role=status` 수준으로 알리고,
새로 생긴 조치 필요 오류만 선택적으로 alert한다. 모든 heartbeat·토큰 변경을 screen reader에 읽히지 않는다.
이는 W3C가 설명하는 status message 접근성과 과도한 live announcement 주의에 따른 적용안이다.
[W3C WCAG 4.1.3 Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)

## 실행 없이 검증할 다음 시험안

아래는 아직 수행하지 않은 **시험 설계**다. 원천 타임스탬프·서버 관측·화면 반영 시각을 각각 수집해 지연을 계산하고,
전경·백그라운드/복귀·연결 실패를 나눠 보고한다. p50/p95를 보고할 때 시나리오별 표본 수를 함께 적는다.

- 합성 JSONL을 append할 때 UI revision과 값이 변하며, 중복 replay로 호출·토큰이 증가하지 않는지 확인한다.
- POST started만 남긴 채 writer를 끝낸 경우와, 정상적으로 긴 요청이 진행 중인 경우를 서로 구별한다.
- 연결 차단 뒤 복구, dashboard server 재시작, stale cursor를 주어 reset/gap과 최신 상태 복구를 확인한다.
- bytes가 느리게 읽히는 클라이언트로 backpressure를 주고 queue/memory 상한 및 연결 정리를 확인한다.
- JSONL 마지막 줄을 중간 UTF-8에서 나누어 쓰고, complete malformed line도 넣어 pending/invalid 구별을 확인한다.
- source 기록이 멈추어도 dashboard heartbeat만 도착하는 경우 UI가 작업 진행으로 오해하지 않는지 확인한다.
- 실패 후 repair 성공, 성공 exit 후 평가 실패, cleanup 실패를 각각 넣어 실패 원인·현재 상태·평가를 분리하는지 확인한다.
- 숨겨진 탭/OS suspend 복귀 시 업데이트가 누적되어 화면이 멈추지 않고 전체 snapshot으로 복구되는지 확인한다.
- secret 형태 문자열·원문 command가 source에 있어도 snapshot/SSE payload로 유출되지 않는지 기존 redaction 검사를 적용한다.

## 출처와 조사 수준

조회 방법: 브라우징 도구로 다음 공식 문서 본문을 열고 관련 절을 읽었다. 이번 조사에서 아래 URL의 접근 실패는 없었다.
원문을 저장하거나 대량 인용하지 않았다. 문서 열람은 구현·실제 장비 시험·부하 시험의 증거와 구분한다.

- WHATWG HTML Living Standard, Server-sent events: `EventSource`, 처리 모델, Last-Event-ID, 파싱, authoring notes.
  <https://html.spec.whatwg.org/multipage/server-sent-events.html>
- Mozilla MDN, Using server-sent events: 단방향 연결, event 형식, 연결 제한.
  <https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events>
- Mozilla MDN, WebSocket API: 양방향, WebSocket/WebSocketStream의 backpressure와 지원 차이.
  <https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API>
- RFC Editor, RFC 6202: short/long polling 정의, HTTP streaming과 중간 장비·자원 이슈.
  <https://www.rfc-editor.org/rfc/rfc6202> (도구는 `https://www.rfc-editor.org/info/rfc6202/`로 redirect한 본문을 읽음)
- Node.js HTTP, `response.write`: buffer 반환값과 drain 의미.
  <https://nodejs.org/api/http.html#responsewritechunk-encoding-callback>
- Node.js File system, `fs.watch` caveats: 플랫폼·가상화·inode·filename 차이.
  <https://nodejs.org/api/fs.html#caveats>
- NGINX proxy module, `proxy_buffering`: buffering/헤더/무시 설정.
  <https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_buffering>
- Mozilla MDN, Page Visibility API: 가시성 이벤트·숨겨진 탭 timer 제한.
  <https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API>
- OpenTelemetry Logs Data Model: Timestamp/ObservedTimestamp, 구조화 필드.
  <https://opentelemetry.io/docs/specs/otel/logs/data-model/>
- Google SRE, Monitoring Distributed Systems: 증상/원인, 단순한 조치 가능 경고, 성공/실패 지연 구분.
  <https://sre.google/sre-book/monitoring-distributed-systems/>
- W3C WAI, Understanding WCAG 4.1.3: 상태 메시지와 과도한 live region 주의.
  <https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html>

Node 공식 페이지는 열람 시 v26.11.1을 표시했고, 로컬 `node --version`은 v26.4.0이었다.
이 문서는 오래된 기본 API 의미만 사용했으며 현재 문서의 신규 option을 로컬 지원으로 가정하지 않았다.
SSE/WS를 새로 실행한 것은 아니므로 이 환경의 protocol 동작은 후속 무과금 시험 대상이다.

남은 일: 원천 실행 lifecycle 계약 합의·계측, failure-first UI, transport 구현과 위 시험.
이번 부수 효과는 **이 조사 문서 생성뿐**이다. 제품 코드·서버 설정·키·유료 API·기존 Personal OS는 변경하지 않았다.
