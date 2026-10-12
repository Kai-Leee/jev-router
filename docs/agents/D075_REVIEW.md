# D075 독립 검토

2026-10-12. 담당: `/root/d071_review`. 상태: 최종 동결 소스의 독립 경계 검토 완료. 실제 provider 수락·수리·비용은 root 실행 결과의 별도 감사 대상이다.

## 목적과 소유 범위

[공통 역할](D075_PARALLEL.md), [실행 명세](../orchestration/D075_FORCED_PREFLIGHT_AND_RECOVERY.md), [D074 독립 검토](../../benchmark-runs/d074-forward-review-01/result.json)를 기준으로 강제 전송 검사와 근거 기반 복구를 구현 담당과 독립적으로 검토한다. `jev-prompting`과 `jev-decision-records` 정본을 읽었다. 목표는 반복 판단과 수리를 개선하는 것이며 검사 통과를 provider 문맥 적합성·판단 품질·완료 속도 개선으로 바꾸지 않는다.

작성 범위는 이 역할 문서와 새 private `benchmark-runs/d075-review-01/`의 mock·재현·검토 증거뿐이다. 생산 파일·다른 역할 파일·과거 증거를 수정하지 않는다. 유료 호출, 키/.env, Docker, 실제 장부, 후보 소스 본문과 hidden grader 접근은 하지 않는다. 실제 실행은 root가 담당한다. 예약·POST 증명은 모의 callback 카운터와 동결 코드의 제어 흐름으로 확인하고 이후 root가 제공하는 실행 영수증과 구분한다.

## 독립 검토 항목

| 경계 | 필수 확인 | 반례와 필요한 증거 |
| --- | --- | --- |
| v10 강제 gate | 모든 Jev stage가 올바른 stage/model/destination/policy/source 핀과 정확한 직렬화 요청을 검사 | gate 누락·비활성화·지원하지 않는 stage·오래된 정책·다른 목적지·수정된 요청의 예약/POST 차단 |
| 예약 전후 drift | 예약 직전과 전송 직전의 현재 요청·소스가 검사한 바이트와 동일 | 예약 전 차단은 예약0/POST0, 예약 후 차단은 실제 예약 횟수·해제/미정산 상태와 POST0을 따로 기록 |
| 고정 질문과 입력 projector | build→infer→apply→validate→실제 전송이 같은 request SHA를 공유 | 실패 원문·unknown·미실행 상태·기존 후보/owner/권한 누락과 변조 거절; controller 복원 proof를 모델-visible 의미 근거로 오해하지 않음 |
| 정책과 역사 경로 | D074 prompt policy v1·과거 manifest/요청 바이트를 보존하고 새 policy v2만 새 소스를 고정 | 현 소스의 역사 v1 SOURCE_DRIFT를 새 정책 통과나 과거 요청 실패로 재기록하지 않음 |
| evidence-loop-v1 | uncertain/accounting, 환경/오래된 검사, 입력 한도, 일부 개선, 무진전의 우선순위와 행동 분리 | 과거 실패가 현재 실패를 덮지 않음; profile/effort/attempt/round/새 문장만 바꿔 동일 worker를 재호출하지 않음 |
| 새 근거와 callback 입력 | 관련 원문·파일 revision/SHA·line range·실패 identity를 검증한 새 근거만 사용 | 동일 바이트·무관한 소스·잘못된 범위·소유권 변경·callback 간 입력 오염 거절; 새 근거 없음은 needs_evidence |
| 보존 후보 실행 | baseline의 현재 실패와 원본/비선택 산출물의 bytes·mode·revision 연결 후 판단·worker 호출 | baseline 불일치 때 owner/profile/worker0; 현재 수리 이력과 역사 이력 분리; 다른 출발 후보는 별도 조건 |
| 측정과 완료 | callback/예약/POST/Claude CLI·복사/실제 worker·known subtotal/raw null 분리 | 무과금 mock을 실제 수리로, 공개93 통과를 독립63 완료로, 실패 종료시간을 성공 속도로 보고하지 않음 |

D074에서 처음 놓친 다섯 입력(검사 환경 blocked, public 집계 모순, 미실행 sibling, public harness error, 별도 미실행 검사)을 회귀 경계로 유지한다. 구조적으로 정상인 무진전 이력은 prompt 검사 통과가 가능하므로 executor의 재호출 허가와 분리해 검토한다.

## 담당 인터페이스와 진행

- transport 담당에게 gate/session API, 모든 stage 경유, 예약 전후 이벤트와 v10 필수 조건을 요청했다.
- recovery 담당의 구현은 실패 관측·선택 read/write·관련 revision·새 근거를 worker identity에 포함하고 profile/effort/round/attempt를 제외한다. 소스 근거는 controller의 artifact/path/revision/SHA와 exact line ranges로 검증한다. 최종 동결 후 아래 독립 반례 및 담당의 실행기 회귀 근거를 연결했다.
- 입력 담당에게 projector 옵션·실제 wire hash·의미 근거·unknown·기존 후보와 조사 callback 계약을 요청했다.
- 보존 담당은 v10 필수 gate/recovery와 exact baseline 검증 뒤 callback 연결을 준비 중이다. primary79/93과 terminal91/93의 출발점 구분을 검토한다.

검토 중 발견한 구체적 결함은 담당과 root에 전달했으며 직접 생산 코드를 고치지 않았다. 초기 실패 재현은 보존하고 동결 후 별도 결과로 수정 여부를 확인했다.

## 검증 상태

- 이번 역할의 D075 실제 provider·worker·Docker·장부 작업: 0.
- 초안 synthetic 근거 mock: 정상 동일 근거 차단·실제 새 줄 허용은 맞았지만, 같은 줄 역순·범위 합치기 두 경우를 새 근거로 인정했다. [초기 재현](../../benchmark-runs/d075-review-01/draft-evidence-probe-01.json)은 과거 결과로 보존한다. 동결 recovery 모듈 `78093470…`에서 [새 재검증](../../benchmark-runs/d075-review-01/recovery-evidence-review-02.json) 4/4 기대 일치·소스 drift0을 확인했다. 재배열·합병은 새 근거0, 실제 새 줄만 허용한다.
- 초안의 실제 gate 오류 3종은 현재 공개 실패로 분류되어 동일 owner 호출을 재시도할 위험이 있었다. [초기 재현](../../benchmark-runs/d075-review-01/draft-recovery-cause-probe-01.json)을 보존하고, 같은 동결 recovery 모듈의 [새 분류 재검증](../../benchmark-runs/d075-review-01/recovery-cause-review-02.json) 5/5 기대 일치를 확인했다. 이 pure probe는 executor 반복 횟수를 직접 측정하지 않는다.
- 측정 helper 초안은 예약 event 누락 또는 phase 예약값 모순을 검증 완료로 인정했다. [독립 반례](../../benchmark-runs/d075-review-01/draft-accounting-phase-probe-01.json)를 보존하고, [수정 후 재검증](../../benchmark-runs/d075-review-01/accounting-phase-review-02.json) 정상1개·오류 거부3개 모두 기대 일치를 확인했다. 이후 담당의 policy snapshot/path 고정 보강도 최종 소스 검토에 포함한다.
- 복구 callback에 controller 검증용 `sourceFiles` 배열을 그대로 넘기는 공유 참조를 발견했다. [초기 증거](../../benchmark-runs/d075-review-01/source-callback-isolation-finding-01.json)를 보존한다. executor `de7cc524…`의 전체 입력 사본 전달과 controller 원문 후검증을 [최종 컴포넌트 검토](../../benchmark-runs/d075-review-01/source-callback-isolation-review-02.json)에서 확인했다. 담당의 red/green mock은 가짜 text/SHA 차단과 정상 근거 복구를 모두 검증했고 3/3 통과했다. 담당의 전체34 테스트와 중복되는 항목이며 독립 재실행 수로 합산하지 않는다.
- 통합 확인: rebuild report의 원문 복원/정책 재생, action 명칭, `callback_allowed:false`, 작업자별 semantic identity와 callback 입력 사본 경계를 최종 소스에서 확인했다. 이력의 다른 작업자 진전과 모델/노력도 변경은 동일 worker identity의 새 근거가 아니다.
- D075 provider 수락·제품 완료·효율: 아직 측정하지 않음.
- 본 문서 및 local mock 통과는 실제 provider 수락·제품 완료·효율 개선의 증거가 아니다.

## 최종 독립 경계 결과

- [전송·예약 검사](../../benchmark-runs/d075-review-01/gate-boundaries-01/result.json): 7/7, 실제 production client에 fake fetch와 메모리 예산을 주입했다. 5개 stage를 모두 통과시켰고 초기 차단, 예약 전후 소스 변경, 예약 함수의 생성 여부 불명 오류, 호출자 요청 변경을 구분했다. 실제 POST·장부 접근은 0이다.
- [전송 제어 흐름 proof](../../benchmark-runs/d075-review-01/control-flow-evidence.json): 동결 17개 소스 SHA를 기록했다. `inference_started` 이벤트는 dispatch intent이며 receipt의 `provider_decide_called`는 실제 client 진입이다. 예약 후 차단은 예약1·POST0·미정산 유지, 예약 함수 오류의 `reservation_created:null`은 불명으로 남는다.
- [단계별 가시성과 worker adapter](../../benchmark-runs/d075-review-01/stage-visibility-01/result.json): owner에는 signature·import 경계만, chooser와 worker에는 선택한 전체 source ranges가 전달된다. production 작업자 프롬프트에 합성 본문 표식이 1회 포함되고 write scope는 그대로였다. 실제 Claude CLI 실행은 0이다.
- [입력 선별 반례](../../benchmark-runs/d075-review-01/projection-adversarial-01.json): 7/7. bound 실패의 fake passed는 거부하며 wrong history revision, unknown source relation, 누락된 assertion mapping, 새 관련 source, 알 수 없는 이력 필드는 진단 생략0이다. 정상적인 같은 revision의 resolved/unrelated 대조군만 2개 진단 필드를 선별한다. 실제 visible 실패·not_reached·질문·coverage와 controller 원문 복원을 모두 확인했다.
- [최종 회계 경계](../../benchmark-runs/d075-review-01/accounting-phase-review-03.json): 현재 동결 helper에서 정상 예약/미전송1개와 모순5개가 모두 기대대로 판정됐다. 누락된 예약 이벤트, report/event 예약 상태 모순, 정책 경로 불일치는 실제 추론 분모 제외를 허용하지 않는다.
- root 전체 회귀는 원래 1,270개 중 1,258 통과·localhost EPERM12였다. 실패가 속한 3개 파일의 24개 검사가 허용된 환경에서 모두 통과해 고유 1,270개를 결합 검증했다. 무제한 환경에서 전체 suite를 다시 실행한 결과로 표현하지 않는다. 담당 집중 검사와 독립 mock 수를 여기에 더하지 않는다.

현재 미해결 correctness finding은 없다. [최종 검토](../../benchmark-runs/d075-review-01/prelaunch-final.json)는 소스와 증거 SHA를 고정하며, root 실제 재실행의 성공을 선승인하지 않는다.

## 실제 실행 후 발견한 검사 공백과 후속 검토

위 최초 검토의 통과 상태와 42개 핀은 당시 범위의 과거 결과로 보존한다. 실제 `same-source-01`에서는 `inferred_ownership.repair_input_context`가 profile 입력으로 전달되어 88,334 B의 controller 전용 문맥이 포함됐다. 요청은 149,079 B였고 HTTP400 `model_input_limit`로 종료했으며 실제 수리 worker는 0이었다. 초기 owner/chooser/worker 가시성 mock과 5개 stage 전송 mock은 **owner inference → 현재 failure → profile preparer → 실제 session body**의 결합된 입력 형태를 검증하지 않았다. 따라서 그 통과로 이 전달 경로까지 확인됐다고 볼 수 없었다.

최소 수정은 알려진 `evidence-v1` controller context만 profile model view에서 빼고 원래 failure와 pointer/SHA/byte proof를 유지한다. 현재 실패, unknown 의미, 새 source, 모델 선택지, task/write scope는 유지한다. 준비 실패는 runtime 시작 전 `preparation_failure`로 기록하고 실제 수리 횟수와 이력에 추가하지 않는다. 이전 검사가 연결된 export/public evidence는 `candidate_basis`로 출처 round를 명시해 보존한다. HTTP400 원인 자체는 유지하며 profile 재구성/자동 재전송은 아직 지원하지 않는다.

[후속 독립 통합 검증](../../benchmark-runs/d075-review-01/profile-preparation-boundary-03/result.json)은 production executor·owner inference/apply·profile preparer를 합성 파일과 `session.decide` stub으로 연결해 4/4 통과했다. 생성된 profile 요청 5개 모두 controller 전용 문맥/표식이 없고 실패 원문·새 source·unknown 의미·쓰기 범위가 유지됐다. 첫 준비 HTTP400은 repair/history0, 실제 합성 수리 1회 뒤 다음 준비 HTTP400은 repair/history1과 round1 export를 유지했다. uncertain/outstanding은 recovery callback0이며 reconcile에서 종료했다. 준비 오류 round의 공개 근거를 새 검사 결과로 만들지 않았다.

독립 fixture 초기 시도 01의 `cwd:'.'` 계약 오류와 02의 표준 local evidence와 다른 입력 형태도 그대로 보존한다. 두 시도는 목표 profile 경계에 도달하지 못했으므로 성공 검증 수에 넣지 않는다. 표준 입력 형태로 수정한 03 결과가 위 독립 증거이며, 범용적인 모든 입력 형태의 지원을 주장하지 않는다.

[후속 최종 검토](../../benchmark-runs/d075-review-01/postlive-fix-review.json)는 executor `0733c46b…`, profile projector `a48afa73…`와 새 증거를 고정한다. root의 관련 81개 검사와 최초 1,270개 결과는 별개로 기록하며 합산하거나 전체 재실행으로 표시하지 않는다. 기존 prelaunch/control-flow proof와 원래 실패 run 결과는 변경하지 않았다. 수정 후 provider 수락과 실제 수리 성공은 root의 새 실행 결과로 확인해야 한다.

## 승인된 relevance projection의 추가 경계

Root는 2026-10-12에 과거 관측의 명시적 선별 요약을 추가했다. 현재 실패·unknown·미실행·현재 관련 또는 관계 불명인 이력은 원문을 유지한다. 같은 현재 revision에서 실제 passed+resolved이고 현재 요구/causal closure와 무관함을 증명한 옛 관측만 ID·이전 오류/message·현재 status로 요약한다. 전체 공개 coverage/counts는 유지하고 제거 필드·선별 근거·원문 해시를 controller proof에 남긴다.

이 모드는 의도적 정보 선별이다. 원문 복원 가능한 중복 참조와 구분하고 lossless 또는 의미 품질 보장으로 승인하지 않는다. fake passed, 다른 revision, 불명 관계는 선별을 허용하지 않아야 한다. 새 source 관계로 관련성이 생기면 full 원문을 다시 넣어야 한다. 실제 모델-visible 요청과 보고서의 제거 필드를 함께 비교한다.

Root는 이후 owner 단계에는 실제 import·공개 signature·선택 artifact 및 dependency 경계만, chooser/worker에는 관련 전체 source ranges를 전달하는 마지막 조정을 승인했다. stage별 visible bytes/hash·범위와 controller 원문 proof를 구분하며, owner가 전체 source body를 읽었다고 표시하지 않는다. 작업자 실제 prompt까지 연결되어야 하며 이 조정의 모델 수락·판단 품질은 실측 전 미확인이다.

입력 담당의 실제 과거 요청 재생에서는 round2 owner가 76,562 B에서 exact 공유 68,416 B, 관련 없는 resolved 진단 선별만 적용하면 63,449 B였다. 새 source의 requirement 관계가 불명인 최종 source 포함 요청은 진단을 다시 전부 유지해 86,580 B였다. owner-visible source는 18,136 B이고 선택한 전체 범위 30,015 B 중 196줄을 생략하므로 `lossless_model_input:false`다. 이는 source가 추가되어도 항상 입력이 감소한다는 증거가 아니다. 로컬 pass·원문 복원과 provider 문맥 적합성·의미 품질은 분리한다.
