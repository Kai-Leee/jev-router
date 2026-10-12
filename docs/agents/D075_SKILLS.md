# D075 — 강제 검사·복구 연결의 스킬 유지관리

2026-10-12. [D075 역할 계약](D075_PARALLEL.md)의 역할6을 기존 단일 스킬 담당이 이어 맡는다. `jev-prompting`, `jev-decision-records`, `jev-skill-maintenance`를 읽고 새 실행 경로와 기록에 필요한 최소 변경을 검토한다. 새 스킬·전역 설치는 추가하지 않는다. 공통 AGENTS/STATE/index와 실제 Jev/Claude/Docker/장부·독립 채점은 root 소유다.

현재 스킬 갱신·구조·오프라인 명령 검증과 root의 실제 결과 반영을 완료했다. D075 제품은 공개88/93·독립60/63으로 미완료이며, 이 역할의 기록 종료와 제품 완료를 구분한다. 아래 사전 기록은 각 당시 상태로 보존한다.

## 요청과 현재 단계

사용자는 D074 검사를 실제 전송 전에 강제 연결하고 실패 복구를 구현하며, 보존 후보를 새 실행 경로에서 비교하도록 요청했다. D074의 검사·독립 사용 검토 완료와 D075의 실행 강제성·복구·제품 완료는 별도 상태다. 사전 단계에는 실제 결과가 없었으며, 아래 종료 절은 root가 전달한 두 실제 실행·독립 채점·모니터의 근거를 확인한 후 추가했다.

gate 담당 `d071_transport`, recovery 담당 `d067_runner`, preserved runner 담당 `d067_review`에게 확정 경로·옵션·API·영수증 필드를 요청했다. 안정된 인터페이스를 확인하기 전에는 예정 경로나 설계를 현재 실행 기능으로 기록하지 않는다. 이 역할은 코드·테스트·원본 후보·과거 실패·장부를 변경하거나 키/API/hidden 검사에 접근하지 않는다.

## 사전 최소 변경 검토

| 기존 스킬 | 필요한 검토 | 현재 판단 |
| --- | --- | --- |
| `jev-prompting` | D074 standalone/offline과 D075 opt-in 강제 gate·runtime 복구의 사용 경로 및 검증 경계 | 안정된 인터페이스 수신 후 현재 경로 안내를 갱신. 오래된 D074 결과는 보존 |
| `jev-decision-records` | 전송할 정확한 본문/정책·gate·예약/POST0, 새 근거/무진전 차단·실제 복구 행동·완료 분모 기록 | 기존 reference의 실행/입력/실패/비용/수리 경계로 대부분 충족. 실제 새 규칙의 빈틈이 있을 때만 최소 문장 보완 |
| `jev-skill-maintenance` | 역할 연속성·원본 보존·지원 범위·검증 수준·설치 구분 | 기존 지침으로 충분. 본체 변경 예정 없음 |

구조 검사 통과는 worker 재호출 권한이나 실제 provider 수락이 아니다. 동일 실패·무진전 반복에서는 새 attempt ID나 profile 변경만으로 새 원인 근거를 주장하지 않는다. 실행된 분기와 아직 준비만 된 분기를 분리하며, 초기 실패·정정·사후 성공이 있더라도 각각 원본을 유지한다.

동일 출발 후보의 증분 수리와 최신 개선 후보 수리를 다른 조건으로 기록한다. 실패까지의 시간은 완료 가속률이 아니며 보존 수리를 처음부터의 전체 개발 시간으로 바꾸지 않는다. actual POST/CLI, callback·로컬 전이·예약, 사용량 null·환불0·공식 환산·실제 구독 청구는 기존 기록 규칙을 유지한다.

## 변경 전 보존과 검증 계획

스킬 수정 전에 [source-before.json](../../benchmark-runs/d075-skills-preflight/source-before.json)에 예정 대상과 유지보수 문서6파일의 정확한 bytes/SHA 및 private 사본 위치를 남겼다. 사본은 `source-before/`에 처음 한 번 기록했고 원본을 덮어쓰지 않았다. 스킬 helper/cache/메타데이터는 변경 대상이 아니다.

사전 read-only inventory exit0·원본3개다. records tree `c13f55a91accdb284c04b97f2f5350f6a1694bbb41cefc0389e6b5cfbb434b6c`, prompting `0375959a927866ea6037ff9033754f34f0b33a8089ec7b8a013de4cadb845244`, maintenance `7445e650fff623c91b8a56bcaeb3756ef6de03293ce3303b43fcb06047dd73cd`로 D074 종료와 같다. Codex records 사본의 기존2경로 차이, agents records 부재, prompting/maintenance 양쪽 설치 부재를 유지한다. 호스트 발견·호출은 미검증이다.

안정된 API 수신 후 변경 스킬의 구조 검사와 실제 허용된 오프라인 명령·관련 실패 사례 검토만 수행한다. 다른 담당의 회귀·독립 감사와 root의 실제 실행 결과는 출처를 명시하고 이 역할의 재실행으로 표시하지 않는다. 변경 없는 helper 검사나 새 유료 실행을 검증 목적으로 추가하지 않는다.

사전 단계에서는 역할·보존 기록만 작성하고 인터페이스를 기다렸다. 당시 소유 스킬 본체·reference는 변경하지 않았으며 아래 안정된 명세 수신 뒤의 갱신과 구분한다.

## root가 확정한 정책 연결 — 구현 검증 대기

root가 현행 정본을 `docs/orchestration/D075_FORCED_PREFLIGHT_AND_RECOVERY.md`로 정했다. 새 preserved CLI 기본은 v10이며 명시적인 legacy manifest는 재현용으로 유지한다. D074 prompt policy v1 원문을 보존하고 checker/CLI에는 v1/v2 선택을 추가한다는 확정 구성이다. 수동 CLI 기본 v1은 역사 재현용, D075 현행 수동 검사는 `--policy v2`, v10 전송 gate는 v2를 강제한다. 현재 handler가 바뀌면 v1의 `SOURCE_DRIFT`는 오래된 pin 불일치의 정상 차단이며 과거 통과 기록을 고칠 이유가 아니다.

이 내용은 root의 구현 결정이다. 각 담당의 최종 source/인터페이스·검증 근거 수신 전 새 스킬 검사 통과나 실제 강제 실행을 주장하지 않는다. gate의 `initial`/`before_reservation`/`before_post` 단계와 예약 후 drift는 실제 영수증 필드가 확정된 뒤 연결한다.

## 2026-10-12 15:01 KST — 안정된 인터페이스 반영, 최종 pin 검증 대기

각 담당이 안정됐다고 통보한 API를 받아 소유 스킬3파일만 갱신했다. prompting 본체의 현행 정책/명령/전송·복구 안내와 공식 근거 참조의 D074/D075 시점을 갱신했다. records reference는 기존 두 항목에 무진전 재호출 근거·복구 평가/실행 구분, gate phase/정확한 본문/정책·예약/POST 증거 경계만 보완했다. records SKILL 본체, maintenance SKILL, JSON schema/helper/cache/metadata와 설치 사본은 변경하지 않았다.

- Gate: D075 수동 `--policy v2`, v10 필수 transmission 정책, covered stage의 adapter/v4/hash 검사와 projected owner의 고정 질문 검사 구분. `evidence-v1` wire validator도 의미 보존 인증과 구분했다. `calls/<id>.transmission-preflight.initial|before_reservation|before_post.json` 및 `receipt.transmission_preflight`의 `required/request_sha256/policy_sha256/blocked_phase/reservation_called/reservation_created/provider_decide_called/no_post_verified/checks/recovery`가 실제 근거 위치다. `inference_started`는 전송 의도다.
- Recovery: `failureRecoveryPolicy: evidence-loop-v1`, `repairInputPolicy: evidence-v1`, `recoverFailure(context, meta)`, 별도 `historicalRepairHistory`. `adaptive_failure_recovery_assessed/requested/completed/blocked`, `adaptive_worker_input_committed/duplicate_blocked`, `result.failure_recovery`로 분기와 실행을 구분한다. 새로운 current revision/SHA/range 관측을 요구하며 같은 범위 재정렬·합병·profile 변경은 새 근거가 아니다. 일부 개선 후 남은 산출물이 그대로인 경우도 조사 대상이다.
- Preserved: [D075_PRESERVED](D075_PRESERVED.md)의 안정된 v10 기본/명시 source-run과 원본79/93·14실패의 primary 조건을 연결했다. 담당의 모의29/29는 원본/비선택 보존과 새 근거 없는 재호출 차단·새 관측 후 실행을 검증한 결과이며 이 역할이 재실행하거나 실제 provider 성공으로 바꾸지 않았다. 최신91/93 후보는 `PRESERVED_TERMINAL_REPAIR_HISTORY_REQUIRED`로 아직 차단된다.

이번 source 갱신은 안정된 사용 계약을 반영한 것이다. 최종 source/policy SHA 동결 전이므로 새 offline 통과를 아직 기록하지 않는다. 이후 구조 검사·v2 예제/연결·v1 drift/비지원 분기를 확인하고 전후 source/사본 보존을 재확인한다. 실제 실행·제품 성공·효율은 root가 제공할 결과 전까지 미측정이다.

## 2026-10-12 15:15 KST — 최종 pin 이후 로컬 검증 완료

transport와 root의 최종 동결 통보 뒤 새 프로세스로 실행했다. [명령 영수증](../../benchmark-runs/d075-skills-preflight/validation-01.json)에 실제 명령·exit·출력과 원시 보고서 경로를 남겼다.

| 실제 검사 | 결과·원시 근거 | 해석 범위 |
| --- | --- | --- |
| `quick_validate.py skills/jev-prompting` 및 `skills/jev-decision-records` | 모두 exit0, `Skill is valid!` | 변경된2스킬의 구조. helper/schema와 변경 없는 maintenance 검사는 반복하지 않음 |
| 지원 예제 `--policy v2` | [example-v2-01.json](../../benchmark-runs/d075-skills-preflight/example-v2-01.json), exit0·10핀 일치·입력 불변 | 구조 및 mock 연결. handler 실행false·문맥fit unknown·의미 not_checked |
| `--connection-only --policy v2` | [connection-v2-01.json](../../benchmark-runs/d075-skills-preflight/connection-v2-01.json), exit0·5모의시나리오 | 모의 GET1/POST5, 실제 인증·배포가 아님 |
| 같은 예제, `--policy` 생략 | [default-v1-01.json](../../benchmark-runs/d075-skills-preflight/default-v1-01.json), exit2·`JEV_PROMPT_SOURCE_DRIFT` | 기본 v1의 옛8핀/현재소스 불일치. 정책·과거 성공을 수정하지 않음 |
| 같은 예제, stage=`repair`, `--policy v2` | [unsupported-v2-01.json](../../benchmark-runs/d075-skills-preflight/unsupported-v2-01.json), exit2·`JEV_PROMPT_TEMPLATE_UNSUPPORTED` | 현재 고정 prompt 지원 범위를 넘어서는 입력을 차단 |

현재 prompt v2 SHA는 `c491d1b9d8fa2838a1ec0a3fcca68fe5da5f38eddb2d40a76d861c7d3bc3f37d`이며 기본 v1은 D074의 `3c6cb90d56d8e8d433ed57d23548c977174056177348b7e315544f834d787ebc` 그대로다. root가 transmission `4f23d874e04338b3ff674b24481784fb64ee9b37257272f26fb84f40a83d4123`의 manifest 연결을 통보했으며 이 역할이 gate runtime를 실행한 것은 아니다.

위 모든 실제 GET/POST는0, 키 로드false이고 handler/worker/장부/Docker/hidden 접근은 없다. `--out`은 새 파일에만 썼다. 개발 에이전트 자체의 이용량·비용은 측정하지 않았다. source 안정성·형식 통과를 실제 전송 강제성, 복구 성공이나 비용/시간 개선으로 바꾸지 않는다.

[변경 전](../../benchmark-runs/d075-skills-preflight/inventory-before-01.json)과 [변경 후](../../benchmark-runs/d075-skills-preflight/inventory-after-01.json) 목록은 모두 exit0·원본3개다. prompting tree는 `263623e9a73d3d0c1ebd0b08b541d508eb12db19e830fcb3478171e64c346db7`, records는 `0c89bf8086fab8c8fc07dcff836004318626407fc73907d4ea13ac33da2c9487`다. maintenance tree와 모든 설치 비교 항목은 사전과 같으며 source-before6사본은 원래 해시를 유지했다. 호스트 발견/호출은 여전히 미검증이다.

이 역할의 쓰기를 종료한다. 소유 문서·source의 공백 검사 결과와 최종 사본 보존 근거는 같은 private 디렉터리의 `closeout-01.json`에 둔다. 다음 trigger는 root가 제공할 실제 D075 결과 또는 독립 검토의 구체적 결함이다. 실측 후에도 초기/실패 원본을 보존하고 실행된 복구와 미실행 분기, 동일 출발 후보 비교와 다른 시작 조건을 구분한다.

## 2026-10-12 — 실제 결과 반영·관리 종료

root의 [D075 결과 정본](../orchestration/D075_RESULTS.md), [최종 요약](../../benchmark-runs/d075-root-01/final-summary.json), [종료 측정 보완](../../benchmark-runs/d075-analysis-02/terminal-measurement.json), [보존 감사](../../benchmark-runs/d075-analysis-02/preservation-audit-03.json)를 읽고 아래 사례를 기록했다. 이 역할이 API·작업자·Docker·독립 채점을 재실행한 결과가 아니다.

첫 실제 실행은 profile 입력에 owner 검증용 controller context가 포함되어 HTTP400 `model_input_limit`로 중단됐고 작업자 호출은0이었다. 마지막 정상 후보 포인터 누락도 별도 export 감사로 확인됐다. root는 두 결함을 수정하고 재측정했으며 첫 요청·응답·결과와 사전 통과 기록을 그대로 보존했다. controller가 보유한 근거와 모델에 실제 전송할 필드, 준비 실패와 실제 수리 round를 구분해야 한다는 사례다.

두 번째 실행의 실제 Jev5POST는 `initial`·`before_reservation`·`before_post` 각각5/5 영수증으로 연결됐다. 기존 담당2명을 선택해 Claude 작업자2명이 실행된 뒤, 남은 무변경 범위에 대해 `inspect_no_write_cause`가 새 소스 근거9개를 모았다. 그러나 이어진 owner5질문·wire92,629B는 다시 HTTP400 `model_input_limit`였다. `CANONICAL_INPUT_ALREADY_APPLIED`로 재구성이 멈춰 그 이후 성공 owner 응답이나 추가 작업자 호출은 없었다. 따라서 실제로 확인한 것은 전송 검사·새 근거 수집·후속 요청·중단 경로이며, 문맥 실패를 해결한 재구성 성공은 아니다. profile 자동 입력 재구성도 `PROFILE_INPUT_REBUILD_UNSUPPORTED` 상태다. 구조·해시·바이트 검사 통과는 정확 토큰 적합성이나 질문 의미 검증과 별개다.

동일한79/93 출발 후보를 사용한 이전 수리는 공개91/93·독립61/63, 이번 두 번째 실행은88/93·60/63이었다. 이번 시작→독립 채점 종료 관측은369,093ms, 알려진 캐시 포함709,276토큰·공식 환산 소계USD0.6804039다. 이전 대비 알려진 토큰−11.7191%·환산 소계−3.6566%지만 종료 시간+3.8628%이고 통과 수도 낮다. 실패 요청 추론량이null이라 전체 추론량 차이와 완료 가속률은 확정하지 않는다. 환불로 확인한 해당 실패의 무과금과 추론량 미상, 월 구독 배분·전체 실제 청구 미상은 분리한다. 이는 각1회·공유 호스트의 보존 수리 비교이며 새 전체 개발의 성공 효율이 아니다.

별도 숫자 모니터는 첫 root 지시의 필수 JSON 계약 누락으로 형식 검사에 실패했고, 수정 후 두 번째는 `attention`이었다. 원응답·실패를 보존했다. 모니터 packet에 없었던 새 환불 보정·자체 비용·이전 공개 검사 시간은 root의 후속 증거로 보완됐으며 모니터가 해당 근거를 검토한 것으로 기록하지 않는다. 검사 시간은 runner 안에 포함되어 합산하지 않는다.

기존 스킬의 실제 전송/구조·의미, 무진전 근거, 미상 사용량·환불, 완료 분모 규칙으로 이번 사례를 기록할 수 있어 source SKILL/reference 추가 변경이나 새 스킬·설치는 불필요하다. 다음 구현 뒤에만 기존 prompting 안내의 지원 범위를 보완할 후보는 질문별 관련 근거 재구성, controller 전용 필드와 모델 입력의 경계, profile 준비 실패 복구다. 재구성 입력이 달라졌다는 사실과 실제 수락·원인 담당 선택·허용 범위 변경·재검사 성공은 각각 연결된 영수증으로 확인해야 한다. 아직 그 구현이나 성능을 달성한 것으로 표시하지 않는다.

이번 후속은 소유 문서2개만 갱신했다. 사전 `closeout-01.json`은 그때의 문서 해시를 담은 역사 영수증으로 유지하며 새 상태로 덮어쓰지 않는다. root의 보존 감사는 과거1,380파일 변경/누락0, helper8개 및 검토17소스 snapshot 일치·원본 후보 보존을 확인했다. 그 결과를 이 역할의 독립 재검사로 바꾸지 않는다. source·정책·기존 evidence·설치 사본을 수정하지 않고 관리 기록을 닫는다.
