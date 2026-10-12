# D073 — 실패별 기존 담당 추론과 실제 수리

2026-10-12 KST. 사용자 지시: 실패별 담당을 기존 담당 계약에서 Jev가 추론하게 연결하고, 로컬 토큰 상한 없이 진행한다. [첫 실험](D073_EXPERIMENT.md), [변경 입력 후속](D073_FOCUSED_OWNER_EXPERIMENT.md), [역할](../agents/D073_PARALLEL.md)을 따른다. 구현·실제 실행·채점은 종료됐다. 최신 보존 수리에서 공개79/93→91/93·독립60/63→61/63으로 개선됐으나 제품은 미완료다. 아래 첫 실패·병렬 미전송·후속 실행을 각각 보존한다.

## 구현과 질문

공개 실패가 발생하면 [영어 질문 v2](contracts/adaptive-inferred-repair.v2.json)의 문장을 그대로 사용한다. 각 질문은 정확한 check/test/assertion을 지정하고 “먼저 점검·수리할 기존 산출물” 하나 또는 `unknown`을 선택하게 한다. 실패 원문, 연결된 원문 요구, 모든 기존 산출물·작업자의 인터페이스·의존 관계를 inline으로 제공한다. 추론은 결함 위치의 확정 증명이 아니다.

실제 순서는 공개 실패 재현 → 실패별 담당 추론 → 기존 산출물 ID를 담당·쓰기 경로에 연결 → 수리 범위 선택 → 선택된 작업자의 모델·노력도 선택 → 제한된 쓰기 → 전체 공개 검사 → 독립 채점이다. 실패·불확실 응답과 부분 답은 적용하지 않으며 기존 담당·경로 권한을 넓히지 않는다. 비선택 산출물의 바이트·실행 권한을 보존한다. 검사하지 못한 assertion은 관측 실패나 성공으로 바꾸지 않는다.

로컬 장부의 토큰 상한은 `null`, v4의 문항/전체 토큰 추정과 repair/profile 바이트 추정은 비차단 관측이다. [Jev 공식 문서](https://jev-ai.pro/docs)의 body/schema/서비스 제한은 남는다. v1~v3 및 이전 실행은 재현용으로 보존한다. 64개를 넘는 질문의 자동 분할은 미구현이며 명시 중단한다.

## 첫 두 실행에서 뒤집힌 예상

입력 차단 해제와 담당 추론 연결을 구현했지만, 첫 두 조건은 실제 담당 답을 받기 전에 Jev 서버의 HTTP400 `model_input_limit`으로 종료됐다. 로컬 허용은 provider 수락을 보장하지 않았다. 두 실패를 종료 상태로 보존하고 새 입력 표현으로만 후속을 진행한다.

| 첫 조건 | 공개 / 독립 | 실행기 시간 | 시작→독립 채점 종료 | 실제 Jev POST / Claude CLI | 담당 답 / 실제 수리 |
| --- | --- | ---: | ---: | ---: | ---: |
| 새 Jev 프로필 개발 | 79/93 · 60/63 | 1,005,127.450417 ms | 1,023,082 ms | 57 / 15 | 0 / 0 |
| D071 종료 후보 보존 수리 | 67/93 · 49/63 | 208,200.192792 ms | 226,069 ms | 1 / 0 | 0 / 0 |

근거: [첫 분석](../../benchmark-runs/d073-analysis-01/analysis.json), 각 원시 [새 개발](../../benchmark-runs/d073-comparison-01/jev_profile/result.json)·[보존 수리](../../benchmark-runs/d073-preserved-repair-01/result.json). 새 개발의 초기 작업자15명은 완료했지만 14문항·158,187B owner 요청이 거절됐다. D071 보존 후보는 26문항·187,728B 요청이 거절됐다. 짧은 실패 종료시간을 성공 개발의 가속률로 계산하지 않는다.

새 개발의 보고된 토큰 소계는 2,916,478이다. 거절된 owner 요청의 사용량은 없으므로 전체 추론 토큰은 `null`이다. 최초 공식 환산 소계 $7.1160285에는 Haiku의 tier 미확인분이 빠졌다. [별도 Haiku 증거](../../benchmark-runs/d073-haiku-tier-evidence-01/evidence.json)는 중복 제거한 두 실제 prompt가21,352·22,538토큰임을 확인했고 해당 비용 $0.0053031을 추가해 **파생 공식 환산 $7.1213316**을 얻었다. CLI+Jev 보고액 $7.1490973은 별도로 남는다. 원시 분석의 결측값은 고치지 않았다.

두 owner 실패는 저장 HTTP400의 무과금 문구, 인증된 사용 내역의 `Refunded · no charge`, 새 잔액 관측을 대조해 정산했다. [기존 후보 r930](../../benchmark-runs/d073-refund-01/)·[새 개발 r931](../../benchmark-runs/d073-refund-02/)과 [별도 환불 집계](../../benchmark-runs/d073-refund-analysis-01/refund-accounting.json)를 남겼다. 확인된 청구0과 알 수 없는 실제 추론 토큰을 구분한다. UI가 provider UUID를 표시하지 않은 대조 한계도 증거에 적었다.

## 입력 v2와 후속 측정

처음 검토한 “질문만 여러 요청으로 나누기”는 공통 state를 반복하므로 최대 문맥을 해결하지 못했다. 후속은 기존 실패 원문과 후보 계약을 한 번 남기고 중복 설명·확인된 성공 세부 metadata를 줄이는 v2를 사용한다. 로컬 파일/hash는 모델이 읽을 수 있는 의미 근거로 세지 않는다.

| 보존 입력 | 질문 | 기존 전송 body | v2 전송 body | 유지한 공개 case / 기존 artifact / unit |
| --- | ---: | ---: | ---: | ---: |
| D071 후보 | 26 | 187,728 B | 91,569 B | 93 / 22 / 21 |
| D073 후보 | 14 | 158,187 B | 76,748 B | 93 / 22 / 21 |

이는 [실제 입력 재생](../../benchmark-runs/d073-input-v2-preflight/replay-01/result.json)의 직렬화 바이트 측정이며 토큰 수가 아니다. prototype의91,155B와 생산 계약/provenance가 포함된91,569B를 구분한다. 기존 v1의 전송 바이트와 metadata는 정확히 재현했다. 각 입력의 미도달 assertion4개와 관련 원문 요구28/80·12/80은 의미 경계를 유지했다. 모든 원문 요구가 Jev에게 전달된 것은 아니며 생략한 정보가 판단에 필요하면 `unknown`을 반환하도록 했다. worker에는 원문 구현 요구가 유지된다.

후속 경로는 [기존 D071 후보 수리](../../benchmark-runs/d073-focused-old-01/)와 [이번 D073 후보 수리](../../benchmark-runs/d073-focused-new-01/)다. 두 조건은 생성된 후보를 복사한 보존 수리이며 초기 분해·개발을 다시 실행하지 않는다. 원래 개발시간과 후속 수리시간의 합은 중간 분석·코드 수정·대기시간을 제외한 단계 합계일 뿐, 자동 E2E 완료시간이 아니다.

## 검증 장치와 보존 경계

첫 전체 회귀1,217개 중 localhost 권한 오류12개는 원시 실패를 남기고 허용 환경에서 해당 검사만 확인했다. 후속 전체 회귀는 `node benchmark-runs/d073-focused-preflight/run-regression.mjs`로 **1,225/1,225 통과**, 실패·skip·취소0, 검사 소스 변경0이다. [회귀 결과](../../benchmark-runs/d073-focused-preflight/regression-summary.json), [독립 검토](../../benchmark-runs/d073-review-01/prelaunch-focused-final.json), [실행 gate](../../benchmark-runs/d073-focused-preflight/launch-gate.json)를 보존했다.

검토 도중 prototype 답변 적용기에서 실패 envelope와 마지막 batch가 누락된 부분 답을 받아들이는 검증 누락을 발견했다. 두 반례를 포함한12개 검사로 수정했다. prototype은 실제 실행 경로가 아니며, 생산 경로의 실패·불확실·부분답 거절을 별도로 검증했다. 첫 launch helper의 `pins`/`files` 키 오류는 전송 전에 중단됐고 수정 원본을 보존했다. 이런 검증 도구의 결함을 제품 수리 성공으로 덮지 않는다.

첫 종료 감사는 기존4,439파일·실행270핀 변경0이었다. 후속 시작 시 첫 실패 원본을 포함한5,988파일 변경0과 실행376핀을 다시 확인했다. 최신 종료 감사는 기존7,219파일·실행376핀 변경0이다. 호출·수리·독립 채점·별도 Opus 숫자 검토는 각기 다른 근거로 기록한다.

가격은 [고정 공식 단가](../../benchmark-runs/d073-preflight/official-rates.json)로 환산한다. [Claude 공식 단가](https://platform.claude.com/docs/en/about-claude/pricing)와 [Jev 가격](https://jev-ai.pro/pricing)을2026-10-12 확인했다. Jev 입력 $0.60/백만은 토큰팩 상당액이며 월정액의 실청구 배분은 미상이다. 기존 공통 catalog 재사용에는 새 추론 비용이 없다.

## v2 병렬 두 시도와 공유 장부 중단

[후속 분석01](../../benchmark-runs/d073-focused-analysis-01/analysis.json)에서 D071 후보의 owner 요청은 HTTP200으로 수락됐다. 26/26 실패에 대해 A14(9개)·A10(1개)·A19(16개)를 선택했고 기존 담당 n8·n10·n14에 적용했다. 원문 증상은 각각 body 설명 누락, NullableProbe 부재, client 인자 누락이다. 선택의 정확성을 확인한 수리 결과는 아직 없다. 사용량은 입력38,605·출력6,224=44,829토큰, 공식 환산 $0.023163이다.

다음 repair 단일문항은91,861B에서 HTTP400 `model_input_limit`으로 거절됐다. failure가60,365B이며 repair_scope 내부의 관측·배정·과거 관측이 반복된다. owner 입력을 줄여도 다음 chooser 입력이 자동으로 줄어드는 것은 아니었다. 실제 수리 worker0, 공개67/93·독립49/63으로 그대로다. 실행기164,718.674125ms, 채점까지183,756ms다. 실패 요청 사용량은null이고, [환불03](../../benchmark-runs/d073-refund-03/evidence.json)의 확인된 청구0을 별도 합산한다.

동시에 시작한 D073 후보는 공유 장부에 위 실패의 예약이 남아 있어 `BUDGET_OUTSTANDING`으로 전송 전에 중단됐다. callback1·실제POST0·ClaudeCLI0이다. 공개79/93·독립60/63, 실행기191,646.027ms·채점까지207,880ms다. 기존 회계 도구는 token-admission 차단만 명시 제외하므로 이 건은 `NONINVOCATION_NOT_PROVEN`과 원시null로 보존한다. 별도 종료 감사는 실제 시작 여부를 대조했다.

[후속 종료 감사](../../benchmark-runs/d073-focused-preflight/closeout-integrity.json)는 원본5,988·실행376핀 변경0, 장부입력+38,605·정산+2가 실제2POST와 일치하며 pending/blocked null임을 확인했다. 컨테이너22개/실행3개는 추가·삭제·상태변경0이다. [새 단독 시도](../../benchmark-runs/d073-focused-new-02/)는 이 정산 이후 같은 source/입력을 처음 전송하기 위해 만든 별도 경로다. 이전 미전송 실패를 삭제하거나 성공 시도로 교체하지 않는다.

분석기 검토 중 v9 원본 manifest와 로더가 더한 path/SHA를 deepEqual하던 오류가 발견됐다. path/SHA는 따로 검증하고 의미 본문을 비교하도록 수정했다. 알려진 filename discovery 문제 세 가지 외의 오류는 완료 판정에서 유지한다. [분석기 독립 검토](../../benchmark-runs/d073-review-01/focused-analysis-review-01.json)는 이 수정과 집중3/3을 확인했다. 생산 실행 소스는 변경하지 않았다.

## 최신 실제 수리: new-02

[후속 분석02](../../benchmark-runs/d073-focused-analysis-02/analysis.json)와 [원시 결과](../../benchmark-runs/d073-focused-new-02/result.json)를 대조했다. 공유 장부 정산 뒤 동일한 동결 소스·보존 후보를 새 디렉토리에서 실행했다. 앞선new-01은POST0이었으며 이 시도는 해당 입력의 첫 실제 전송이다. 중간 정산·개입이 있어 두 시도를 동일 시작 조건의 속도 대조로 보지 않는다.

| 항목 | 수리 전 D073 보존 후보 | new-02 수리 후 |
| --- | ---: | ---: |
| 공개 검사 | 79/93 | 91/93 |
| 독립 검사 | 60/63 | 61/63 |
| 최종 완료 | false | false |
| 공개 실패 | 14 | 2: 해결12, 새 실패0 |
| 실제 수리 작업자 | 0 | 2 |

실행기 시간은 **339,993.346167ms(5분39.993초)**, 시작→독립 채점 종료는 **355,366ms(5분55.366초)**다. Jev5POST(성공4·실패1), Claude수리CLI2다. 보고된 캐시 포함 토큰 소계는 **803,431**이고, 마지막 실패POST의 추론 사용량은 미보고여서 전체 토큰은null이다. 확인된 환불0을 별도 반영한 공식 환산액은 **$0.7062281**이다. CLI·Jev 보고 소계$0.7614788과 혼합하지 않는다. 이는 월정액 실청구 배분액이 아니다.

실제 연결은 owner14문항→기존 담당2명/산출물3개→`repair-inferred-owners` 선택→담당별 모델·effort2문항→작업자2회였다. n9에는 Sonnet5.5/high와 A14·A15(operations.py·diagnostics.py)를 전달했고 두 파일의 실제 쓰기를 확인했다. n14에는 Sonnet5.5/medium과 A10(enums.py)을 전달했지만 쓰기0·revision동일이었다. 비선택13작업자는 재호출하지 않았다. 모델 identity와 CLI effort 인자는 일치하며 내부 추론 노력도가 실제 적용됐는지는 별도 미확인이다. [독립 수리 연결 감사](../../benchmark-runs/d073-review-01/focused-terminal-review-02.json)는 선택·쓰기 권한·변경·검사 결과 SHA 연결을 확인했다. 추론 담당이 실제 결함 위치였다는 보증으로 확대하지 않는다.

남은 공개 실패2개를 다시 묻는 round2 owner는 **76,562B**로 로컬 v4를 통과했으나 Jev HTTP400 `model_input_limit`으로 종료됐다. 질문이14→2로 줄어도 state는67,409→75,273B로 커졌다. 수리 이력17,072B와 추가 관측case12,018B 등이 들어갔다. 전체 wire bytes와 모델 문맥은 다른 단위다. 제공자가 정확한 tokenizer별 초과량을 반환하지 않아 문서의 세부 문맥 제한 중 어느 수치를 몇 토큰 넘었는지는 확정할 수 없다. 실제 두 번째 수리 선택·worker는 실행되지 않았다.

공개 검사16개 실행 span 합은182,405.178ms로 arm339,993.346167ms의53.6496%다. 수리 worker별 span 합90,687.108ms와 겹침을 반영한 전체 구간69,682.805ms를 구분한다. 검증 비용과 병렬 span을 모두 단순 합해 elapsed time으로 보고하지 않는다. 단계별 근거는 [모니터용 관측](../../benchmark-runs/d073-focused-monitor-input-02/observation.json)의 `later_standalone_phase_observations`에 있다.

## 비교 범위와 아직 달성하지 못한 목표

| 실행 범위 | 공개 / 독립 | 시작→독립 채점 종료 | 알려진 토큰 소계 | 공식 환산액 | 완료 |
| --- | --- | ---: | ---: | ---: | --- |
| 기존 D071 Claude 전체 개발 | 93/93 · 63/63 | 39분05.048초 | 4,589,913(전체) | $16.6926398 | true |
| 첫 D073 Jev 프로필 전체 개발 | 79/93 · 60/63 | 17분03.082초 | 2,916,478 | $7.1213316 | false |
| D071 후보 v2 보존 수리 old-01 | 67/93 · 49/63 | 3분03.756초 | 44,829 | $0.023163 | false |
| D073 후보 v2 보존 수리 new-02 | 91/93 · 61/63 | 5분55.366초 | 803,431 | $0.7062281 | false |

Claude 기준선은 같은 harness의 구조화된 다중 세션 개발이다. 한 세션·한 호출의 실행으로 부르지 않는다. Jev 행은 실패POST 사용량을 제외한 토큰 소계이며, 환불·Haiku tier 검증을 반영한 비용의 파생 뷰다. 실행 범위가 다른 보존 수리를 전체 개발과 직접 나누어 가속률을 계산하지 않는다. 첫 개발+나중 수리의 단계 합계도 코드 수정·대기·사람 개입을 빠뜨리므로 자동 개발 완료시간이 아니다. **동일 품질로 Claude보다 빠르고 저렴하게 완료한다는 목표는 아직 입증되지 않았다.**

현재 다음 구현 후보는 repair-choice의 반복 담당 기록과 round2 owner의 이력/관측 중복을 줄이는 것이다. [전송하지 않은 chooser 시안](../../benchmark-runs/d073-repair-choice-packet-analysis-01/README.md)은91,861→78,238B(13,623B/91,861B=14.830% 감소), 원문 복원과7검증을 통과했다. 생산 코드·실제 요청에 적용하지 않았고 제공자 수락·의미 해석·개발 효율은 미측정이다. A10의 쓰기 없는 종료와 남은 공개 실패의 실제 담당도 추가 검증 대상이다.

A10 담당n14의 쓰기 없는 호출은21,011.792ms·272,208토큰·공식환산$0.2327256였다. 비선택 작업자의 재호출0을 달성했지만, 선택한 작업자의 무변경 수리 비용까지 제거된 것은 아니다. 최신 실행의 CLI보고액과 공식환산 차이$0.0552507은 cache-read552,507×$0.10/백만과 수치상 일치한다. CLI 내부 가격 계산 구현은 확인하지 않았으므로 차이의 원인을 확정하지 않는다.

## 입력 감사 도구와 회계 정정

다음 명령은 기존 두 실행의 요청7개를 사후 검증했다. adapter·공식body검사7/7, v4관측허용7/7·경고5·로컬차단0이었다. 하지만 exit1·issue4로 종료됐으므로 전체 감사를 통과했다고 하지 않는다.

```sh
node scripts/validate-jev-input.mjs \
  --run benchmark-runs/d073-focused-old-01 \
  --run benchmark-runs/d073-focused-new-02 \
  --policy v4 \
  --out benchmark-runs/d073-focused-new02-preflight/input-validation.json
```

[감사 원본](../../benchmark-runs/d073-focused-new02-preflight/input-validation.json)과 [읽기 전용 진단](../../benchmark-runs/d073-input-audit-diagnostic-01/diagnosis.md)을 보존했다. 감사기는200 응답과 전송 전 거절만 인식하고, 시작된 모든 요청에 응답 모델을 요구한다. 실제 명확한HTTP400 두 건을 `MISSING_POST_OR_LOCAL_REFUSAL_EVIDENCE`/`RESPONSE_MODEL_UNVERIFIED`로 분류했다. events와receipt를 attempt/stage/decision/round로 연결하면 POST7=HTTP200 5+HTTP400 2다. 실패 영수증에 직접 기록하지 않은 목적지·method·response model·retry수는unknown이다. 진단만 완료했으며 생산 감사기/telemetry 수정은 미실행이다.

환불03의 최초 UI 관측 파일에는 API로 읽은 잔액이 UI값처럼 적혔다. [추가 정정](../../benchmark-runs/d073-refund-03/ui-observation-correction.json)에서 출처를 authenticated credits GET으로 바로잡고 원본을 남겼다. 환불04에서는 UI잔액을관측하지않아null로 기록했다. 이전 helper는 UI잔액과API값 동일을 필수로 가정해 [검증 실패 사본](../../benchmark-runs/d073-focused-new-refund-analysis-02/refund-accounting.json)을 남겼다. 새 [old 보정](../../benchmark-runs/d073-focused-old-refund-analysis-02/refund-accounting.json)·[new 보정](../../benchmark-runs/d073-focused-new-refund-analysis-03/refund-accounting.json)은 실제 UI의refunded/no-charge, 같은 계정의새credits GET, 마지막 성공billing, 요청·실패UUID/hash를 대조한다. 없는 UI값을 채우거나 원시 사용량null을0으로 바꾸지 않았다.

[최신 보존·장부 감사](../../benchmark-runs/d073-focused-new02-preflight/closeout-integrity.json)는 원본7,219파일·실행376핀 변경0, 입력118,279·정산5증가가 영수증5POST와 일치함을 확인했다. 장부는동일ID·누적17,190,366입력·938정산·상한/pending/blocked null이다. 새 실행 컨테이너는 정리했으며 기존22개/실행3개는 추가·삭제·상태변경0이다. 원본 Personal OS/Vault·전역설치·commit/push 변경은없고 소스·문서·후보·로그는미커밋으로남는다. 기존D070 HTML snapshot은갱신하지않았다.

## 별도 모니터와 이번 요청 전체 지출 범위

[Opus5.5/medium 모니터](../../benchmark-runs/d073-monitor-01/result.json)는 수치만 담긴 [패킷](../../benchmark-runs/d073-focused-monitor-input-02/observation.json)을 한 번 읽고 `attention`을 반환했다. 경로·해시·비밀키·실패 원문·독립 검사 내용은 보내지 않았다. identity확인,37,188.948375ms·33,290토큰·공식환산$0.31238이다. 숫자 검토이며 원시감사나 제품채점을 대신하지 않는다. 재호출하지 않았다. 모니터가 일반화한 “모든 실청구 미상”은 전체 구독 배분액에 해당한다. 네 실패의 확인된 환불0은 별도 근거가 있다.

중복된 분석뷰·과거기준선·catalog 재사용을 빼고 실제 시도5개를 한 번씩 합산한 [집계](../../benchmark-runs/d073-final-analysis-01/aggregate.json)는 다음과 같다. 집계 생성 때 실행한 명령은 `node benchmark-runs/d073-final-analysis-01/aggregate.mjs`다. 이미 출력이 있으므로 동일 경로 재실행은 `EEXIST`로 거절한다. 원본을 덮어쓰지 않는 보존 정책이다.

- 벤치마크: Jev65POST(성공61·환불실패4), Claude17CLI. 알려진 토큰소계3,764,738, 파생공식환산$7.8507227.
- 별도모니터까지: 알려진 토큰소계3,798,028, 파생공식환산$8.1631027. 네 실패의 실제 추론 사용량은미보고이므로 전체 토큰은null이다.
- Jev장부의 실제추가차감 입력986,555는 토큰팩환산$0.591933이다. 월정액의 실제 청구 배분액은null이다.
- root/개발에이전트 작업·분석·대기·채점 컴퓨팅 비용은 이 provider합계에 포함하지 않는다. 여러 시도의시간합을 자동 E2E시간으로 보고하지 않는다.

실행 명령은 [첫 driver](../../benchmark-runs/d073-preflight/run-experiment.mjs), [변경 입력 병렬 driver](../../benchmark-runs/d073-focused-preflight/run-experiment.mjs), [미전송 후 단독 driver](../../benchmark-runs/d073-focused-new02-preflight/run.mjs), [독립 채점기](../../benchmark-runs/d073-preflight/grade-condition.mjs), [모니터 driver](../../benchmark-runs/d073-focused-preflight/run-monitor.mjs)에 남아 있다. 이들은 이번 완료된 시도의 재현 근거다. 동일 경로로 자동 재실행하지 않는다.

실행 후 문서 정리에서 `contracts/README.md` 앞에 D073 안내를 추가했다. 이 파일도 launch376핀에 들어 있어 첫 문서 검증은 의도한 안내 변경1개를 소스 차이로 보고 exit1을 반환했다. [첫 검사](../../benchmark-runs/d073-final-analysis-01/document-validation-01.json)를 보존하고, 추가된 안내를 뺀 기존 본문의SHA가 launch SHA와 같음을 별도로 확인했다. 나머지375핀과 실행 시점의376핀 불변은 서로 다른 관측 시점이다. 당시 종료 감사나 동결본을 갱신하지 않는다.
