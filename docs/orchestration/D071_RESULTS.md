# D071 — 담당 연결 수리와 Jev 모델·노력도 선택의 실제 비교

2026-10-12 KST. 요청한 병렬 수정, 세 개발 조건 실행, 보존 후보 수리, 독립 채점과 별도 Opus 모니터 호출을 완료했다. **기존 설명 누락 후보는 실제 수리에 성공했다. 새 개발에서는 Claude 조건만 완료했고, Jev의 동일 품질·시간·비용 개선 목표는 달성하지 못했다.** 실패한 조건도 시간·사용량·원본을 보존한다.

조건·소스 정본은 [실험 계약](D071_EXPERIMENT.md), [구현](D071_IMPLEMENTATION.md), [역할](../agents/D071_PARALLEL.md)이다. 주 결과는 [동결 분석](../../benchmark-runs/d071-analysis-01/analysis.json), [실제 호출 범위의 보조 집계](../../benchmark-runs/d071-invoked-usage-01/invoked-usage.json), [최종 숫자 투영](../../benchmark-runs/d071-preflight/final-report-data-01.json)에 있다. 숫자는 아래 재현 명령으로 저장 영수증에서 계산했다.

## 무엇을 바꾸었나

- 공개 검사를 원래 85개에서 93개로 버전 분리했다. 추가 8개는 `requestBody.description`과 schema 설명이 다르거나 schema 설명이 없는 입력을 사용해 설명의 출처 혼동을 검출한다. D070의 기존 결과를 새 기준으로 소급 변경하지 않았다.
- 설명 누락의 producer → IR → renderer를 수리 후보와 실제 담당 task에 연결했다. 선택된 artifact만 쓰기 가능하며, 추가 원인 파일은 실패 당시 해시가 검증된 읽기 전용 snapshot으로 제공한다. 후보에 포함된 것과 실제 결함 위치·실제 변경을 구분한다.
- 수리 판단은 읽을 수 있는 JSON을 사용한다. 전체 실패·변경된 이력을 보존하고 정확히 같은 관측만 참조로 묶는다. 초기 dictionary/fragment 시도는 실제 전송에서 제외하고 과거 근거로 남겼다. v3의 48,000B는 내부 운영 기준이고 문항 32k/전체 64k는 모델 토큰 **추정** 기준이다.
- [모델·노력도 후보](contracts/adaptive-profiles.v1.json)와 [고정 영어 질문](contracts/adaptive-profile-selection.v1.json)을 연결했다. 각 문항 본문에 실제 task·worker·artifact·경로를 넣는다. 질문 키만 달랐던 초기 결함을 수정했으며 키가 모델에게 작업 의미를 전달한다고 가정하지 않는다.
- Jev 선택 → 허용 profile 해석 → 실제 Claude CLI `--model`/`--effort` → 응답 모델 identity를 연결했다. 조용한 모델 대체는 허용하지 않는다. 초기 요청은 최대 2개 작업, 수리 요청은 1개 작업이며 모든 배치 검증 후 선택을 원자적으로 적용한다.

## 새 개발 세 조건

각 조건 1회, 같은 원본 요구·catalog·실행 이미지·공개93 기준·조건당 실행 슬롯2개다. Claude 단독은 **같은 실행기에서 판단과 작업자를 Claude로 구성한 여러 세션**이며 무제약 단일 Claude 세션과 같지 않다. 세 조건과 보존 후보 수리를 같은 호스트에서 병렬 실행했다.

| 조건 | 공개 / 독립 | 최종 완료 | 실행기 시간 | 시작 → 독립 채점 종료 | 캐시 포함 토큰 | 공식 API 환산 USD |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Claude 판단 + 고정 Opus medium | 93/93 · 63/63 | 완료 | 38분 41.021초 | **39분 05.048초** | **4,589,913** | **16.6926398** |
| Jev 판단 + 고정 Opus medium | 93/93 · 60/63 | 미완료 | 30분 29.630초 | **30분 52.044초** | **3,648,801** | **12.6353014** |
| Jev 판단 + Jev 모델·노력도 선택 | 67/93 · 49/63 | 미완료 | 22분 33.779초 | **22분 54.804초** | **2,874,640** | **6.8848420** |

시간은 실측이다. 실행기 시간은 monotonic clock, 독립 채점까지는 기록된 UTC 시작/종료 구간이다. 두 경계를 합치거나 병렬 작업자의 시간을 더해 전체 경과시간으로 쓰지 않는다. 실패 조건의 짧은 종료시간·낮은 지출을 성공 개발의 절감률로 계산하지 않았으며, 세 쌍 모두 `successful_comparison_eligible=false`다. 독립 검사 skip은 모두 0이다. 공개 결과에는 변경되지 않은 artifact의 version/revision/hash가 일치하는 검사 근거 재사용이 포함된다.

실행기의 Jev 고정 조건 `status:completed`는 공개 검사를 마쳤다는 상태다. 독립 3개 실패를 결합한 최종 제품 완료는 false다. 숨김 검사 내용은 계획·수리 작업자·모니터에 전달하지 않았다. 이번 기록은 독립 실패 3개의 구체 결함 위치를 밝혔다는 주장을 하지 않는다.

| 실제 호출 | Claude 조건 | Jev 고정 조건 | Jev 프로필 조건 |
| --- | ---: | ---: | ---: |
| 초기 구현 task / worker CLI | 6 / 6 | 12 / 12 | 10 / 10 |
| 초기 분해·관계 판단 | Claude CLI 30 | Jev POST 52 | Jev POST 48 |
| 모델·노력도 판단 | 0 | 0 | Jev POST 5 |
| 수리 판단 | Claude CLI 1 | Jev POST 1 | 로컬 차단 1, POST 0 |
| 실제 수리 worker CLI | 3 | 4 | 0 |
| 실제 Claude CLI 총계 | 40 | 16 | 10 |
| 실제 Jev POST 총계 | 0 | 53 | 53 |

처음 공개 결과는 Claude 89/93 → 수리 후 93/93, Jev 고정 84/93 → 93/93이다. 프로필 조건은 67/93에서 수리 입력 사전 검사로 중단됐다. CLI 수는 내부 Claude HTTP 요청 수가 아니며 내부 HTTP 시도 총계는 unknown이다.

## 판단 대체에서 실제 줄어든 부분과 전체 한계

분해·관계 **계획 단계만** 보면 Claude 231.700626초·$5.7102654에서 Jev 고정 72.617987초·$0.4399800으로 바뀌었다. Claude 계획 시간을 분모로 한 감소는 68.6587%, Claude 계획 환산액을 분모로 한 감소는 92.2949%다. 이 단계의 토큰은 734,110 → 739,463으로 줄지 않았다. Jev의 역할을 전체 입력 토큰 감소만으로 평가하면 이 차이를 놓친다.

| 단계별 공식 환산 USD | Claude 조건 | Jev 고정 조건 | Jev 프로필 조건 |
| --- | ---: | ---: | ---: |
| 분해·관계 판단 | 5.7102654 | 0.4399800 | 0.4314708 |
| 모델·노력도 판단 | 0 | 0 | 0.0392298 |
| 초기 구현 | 9.3247764 | 10.1179450 | 6.4141414 |
| 수리 판단 | 0.1755040 | 0.0106248 | 전송 없음 |
| 실제 수리 작업자 | 1.4820940 | 2.0667516 | 실행 없음 |

Jev 고정 조건은 반복 판단 비용을 낮췄지만 초기 구현과 수리 비용은 각각 더 컸다. 실제 DAG가 6/12/10개 작업으로 달라 프로필 선택만의 인과 효과를 분리할 수 없다. 공유 호스트·계정·캐시·장부 lock의 경합과 조건당 1회라는 한계도 남는다. 단계 절감이 전체 품질을 충족한 절감으로 이어졌다는 증거는 없다.

## 모델·노력도 선택은 어디까지 실행됐나

Opus·Sonnet·Haiku·Fable × low/medium/high/xhigh/max의 허용 20개 조합에서 **Jev 5 POST로 10개 작업을 선택**했다. 실제 선택은 Opus 5.5 medium 4개, Sonnet 5.5 medium 6개였다. 선택·적용·CLI 인자·응답 identity가 **10/10** 연결됐으며 모델 mismatch는 0이다. [실제 프로필 감사](../../benchmark-runs/d071-review-01/live-profile-review-01.json).

모두 medium을 선택했으므로 effort별 우열이나 최적값은 측정하지 못했다. CLI에 요청한 effort와 모델 내부에서 사용한 추론량은 다르며 내부 effort 확인값은 null이다. 네 모델의 별도 계정 probe는 low에서만 4/4 성공했다. 이 probe가 20개 조합의 성능이나 계정 가용성을 모두 검증한 것은 아니다.

## 프로필 조건이 멈춘 원인

[원인 분석](../../benchmark-runs/d071-profile-failure-analysis-01/README.md)과 [필드별 근거](../../benchmark-runs/d071-profile-failure-analysis-01/evidence.json)는 실제 요청 SHA와 입장 검사를 대조한다. 최초 수리 wire는 **86,809B**, 문항 추정치는 **35,206 > 32,000**이었다. 전체 요청 추정 35,236은 64k 미만이지만 문항 한도와 내부 48KB 기준을 넘었다. 공급자 HTTP 오류가 아니라 전송 전의 확정 로컬 차단이다.

공개 실패 26개 중 18개는 세부 assertion 담당이 연결되지 않았다(17 unsupported + 1 unmapped). 기존 case의 요구사항 담당 전체 output으로 fallback하면서 8 worker·19 artifact가 포함되고, 모든 후보 합집합은 9 worker·20 artifact·35파일이 됐다. 미해결 연결 하나라도 있으면 요구사항 투영이 전역 `kept_all`로 바뀌어 75개 요구가 들어갔다.

사전 설명8개 실패 preview와 비교하면 요구사항 본문은 444 → 27,192B다. 증가 26,748B는 전체 증가 47,943B의 **55.8%**다. 현재 수리 이력은 0개였으므로 이력 누적이 원인이 아니다. 같은 `client` 인자 누락 관측 16개, NullableProbe 부재 1개, 설명 누락 9개를 기록했지만 같은 메시지가 하나의 결함이라는 증명은 아니다.

사전 58/58 요청의 로컬 추정 통과는 실제 새 실패 26개를 포괄하지 못했다. 기존 설명 오류에 맞춘 preview를 일반 수리 입력의 수락 보장으로 확장하면 안 된다. 이번 로컬 차단은 **POST 0·예약 0·선택 0·수리 worker 0**이고 원시 사용량/비용 null을 유지한다. 비용 보조 집계에서만 전송 여부의 분모를 구분했다.

## 기존 실패 후보의 실제 수리

[보존 후보 결과](../../benchmark-runs/d071-preserved-repair-01/result.json)는 새 개발과 별도다. D070 후보를 복사하고 공개85 통과·추가8 실패를 재현한 후, Jev가 producer A14의 실제 담당 n8을 선택했다. Opus medium 수리 1회로 **`pyclientgen/schema/operations.py` 한 파일**에서 requestBody 설명을 BodyIR로 전달했다. 원본 후보 및 비선택 산출물은 보존했다.

공개 **93/93**, 독립 **63/63**, skip 0으로 수리에 성공했다. 실행기 600,240.233ms, 시작부터 독립 채점 종료 638,073ms(**10분 38.073초**), 205,689토큰, 환산 **$0.6454572**다. Jev 1 POST의 $0.0091668과 Claude repair 1 CLI의 $0.6362904를 합한 값이다. 실제 수리 CLI 시간은 46,877.952ms이며 나머지 전 과정을 수리 모델 응답시간으로 부르면 안 된다.

[검사 시간 관측](../../benchmark-runs/d071-preserved-observation-01/README.md): CLI suite는 두 round 모두 CLI 61회였으나 50.197 → 131.710초로 늘었다. 새 수리 코드의 반복문 때문이라는 증거는 없으며 파일 변경은 설명 전달 1곳이다. 개별 CLI/설치 단계의 시간은 수집되지 않아 상세 원인은 unknown이다. 공유 호스트 경합은 가설로 남긴다. 이 수리 시작 비용을 새 개발 전체 시간의 비교 분모로 사용하지 않는다.

## 토큰·가격·정산

| 토큰 종류 | Claude 조건 | Jev 고정 조건 | Jev 프로필 조건 |
| --- | ---: | ---: | ---: |
| 일반 입력(Claude + Jev) | 184 | 751,148 | 784,595 |
| 출력 | 260,229 | 291,883 | 201,951 |
| 캐시 생성(한 번만 합산) | 1,361,721 | 762,967 | 475,398 |
| 캐시 읽기 | 2,967,779 | 1,842,803 | 1,412,696 |
| 합계 | 4,589,913 | 3,648,801 | 2,874,640 |

캐시 생성은 전부 1h로 보고됐다. 일반 입력이 작다고 전체 입력이 작은 것은 아니다. 비용은 [고정 단가표](../../benchmark-runs/d071-preflight/official-rates.json)로 계산했다. Claude 공식 단가 문서는 [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)이며 2026-10-11 UTC 확인값을 보존했다. Jev는 입력 $0.60/백만 토큰의 토큰팩 상당액이다. **월정액의 이번 실행 실청구 배분은 모두 null**이며 API 환산액을 실제 카드 청구액으로 표시하지 않는다.

프로필 조건은 원래 callback64개 중 로컬 차단 1개의 비용이 null이라 동결 분석 총액도 null이다. 원시 값을 고치지 않고 전송·예약 이전 제어 흐름, event와 영수증을 검증한 [보조 집계](../../benchmark-runs/d071-invoked-usage-01/invoked-usage.json)에서 실제 POST53 + CLI10의 사용량을 집계했다. 불확실하거나 실제 전송 후 사용량이 없는 호출이었다면 제외하지 않는다.

프로필 CLI 보고 기반 합계는 $6.9300858, 공식 재계산은 $6.8848420이다. [차이 분석](../../benchmark-runs/d071-analysis-tools/profile-cost-difference-01.json): Sonnet 6개 작업자의 캐시 읽기 452,438토큰 × ($0.20 − $0.10)/백만 = **$0.0452438**로 차이가 설명된다. 원시 modelUsage·usage·TTL은 일치했다. CLI 내부 가격표 구현을 읽지는 않았으므로 오래된 가격 매핑이 원인이라는 설명은 가설이다.

현재 요청의 세 개발 조건 + 보존 수리 + 모델 probe4회 + 모니터1회 총계는 **11,353,865토큰·환산 $37.1750816**이다(세 개발/수리는 공식 재계산, probe/모니터는 각각 $0.0194212/$0.2974200 영수증 상당액). CLI 보고액 기준 총계는 $37.2203254다. 이 중 **Jev 107 POST·입력1,550,787·환산 $0.9304722**이며 Claude는 probe/모니터 포함 CLI72회다. 과거 공통 catalog 준비비를 신규 지출로 더하지 않았다. 병렬 실험 driver의 실제 경과시간은 2,377,585.261ms이고 조건별 시간을 합산한 값이 아니다. 별도 probe와 종료 후 모니터 시간은 여기에 합성하지 않았다.

## 검증 장치·보존 감사와 남은 일

사전 전체 회귀는 `npm test` **1190/1190**, 독립 집중 검토 91/91, 공개 검사 controls 정상8/8·의도적 결함83/83이다. 회귀 집계 helper가 처음에는 TAP의 `#`를 예상해 Node의 `ℹ` 요약을 읽지 못했다. 원시 npm exit0/로그를 보존하고 [정정 summary02](../../benchmark-runs/d071-preflight/regression-summary-02.json)에서 파서를 수정해 확인했으며 테스트를 재실행한 것은 아니다. 실제 호출 집계 보조 helper는 별도 경계 검사3/3을 통과했다.

[별도 Opus 모니터](../../benchmark-runs/d071-monitor-01/result.json)는 identity 확인·32.720초·32,425토큰·$0.29742·`attention`이다. 숫자 packet02만 받았으며 source/후보/숨김 검사를 읽지 않았다. 모니터는 원래 null 집계의 미확인 예약 가능성을 다시 제기했고, 추가된 실제 호출 범위 보조 집계를 최종 권고에 반영하지 않았다. 원시 감사와 아래 장부 대조가 POST·예약 이전 차단을 확인하므로 이 권고를 미정산 발생의 증거로 채택하지 않았다. 유료 재검토는 하지 않았다.

[종료 보존 감사](../../benchmark-runs/d071-preflight/closeout-integrity.json): 과거 14,576파일·실행269핀 변경0, 기존 장부 ID 유지, 정산 **766 → 873(+107)**, 입력 **14,653,024 → 16,203,811(+1,550,787)**로 실제 영수증과 일치한다. pending/blocked는 null, 한도는 기존 null이다. [최종 독립 감사](../../benchmark-runs/d071-review-01/final-independent-review-01.json)는 486개 근거 파일과 네 후보의 채점 전·후·현재 해시를 대조했고 issues 0이다. prelaunch300핀의 변경0도 문서 종료 갱신 전에 확인했다. Docker 기존22개/실행3개는 추가·삭제·상태 변경이 없고 이번 실험 컨테이너는 남지 않았다.

[시작 경합 관측](../../benchmark-runs/d071-analysis-tools/startup-observation-01.json)에서 프로필 조건 arm-start lock 대기는 **105.256초**였다. 3조건 dispatch는 9.319ms 안에 시작했지만 공유 배타 lock에서 기다렸다. 이 값을 전체 시간에서 임의 차감해 반사실적 속도를 주장하지 않는다.

다음 수정 후보는 아래와 같다. **이번 실행에 추가 적용하거나 자동 재시도하지 않았다.**

1. 기존 missing-client·nullable 및 선행 단계 실패의 공개 assertion/산출물 연결을 보완한다. 실행되지 않은 하위 assertion과 실제 실패를 구분한다.
2. 다음에 수리할 실패 묶음을 선택하는 질문과 선택된 범위의 상세 구현 문맥을 나눈다. 모든 후보의 전체 문맥 합집합을 먼저 보내는 구조를 바꾸고, 미해결 한 항목이 75개 요구 전체를 활성화하는 범위를 검토한다. 오류·요구사항을 임의로 잘라 입력을 맞추지 않는다.
3. 같은 DAG·작업 경계를 고정한 후 모델/effort 선택만 바꾸어 평가한다. 현재 모든 medium 선택만으로 effort 최적화 성과를 선언하지 않는다. 새로운 독립 실패를 숨김 정답으로 수리하지 않는다.
4. 공유 장부 lock의 시작 대기와 긴 provider lease를 분리할 수 있는지 검토하되 정산의 원자성을 유지한다. 추가 반복 이전에 실행 순서·동시성을 기록한다.

실험·모니터·채점 프로세스는 종료됐다. 소스·문서·private benchmark 증거는 미커밋이며 새 commit/push·전역 설치·Personal OS 변경은 없다. 기존 `127.0.0.1:56751` HTML은 D070 snapshot으로 남았고 이번 D071 결과로 갱신하지 않았다.

## 재현 명령

작업 디렉터리: `/Users/lee/workspace/plugins/jev-router`. 다음 분석 명령은 무과금이며 출력 경로는 새 디렉터리여야 한다. 이미 종료한 실행 디렉터리에 `--spend`를 다시 붙이지 않는다.

```sh
node benchmark-runs/d071-analysis-tools/analyze.mjs --cohort benchmark-runs/d071-comparison-01 --rates benchmark-runs/d071-preflight/official-rates.json --public-registry benchmarks/e2e-swe/public-checks/registry.v4.json --preserved-repair benchmark-runs/d071-preserved-repair-01 --output-dir benchmark-runs/NEW_D071_ANALYSIS
node benchmark-runs/d071-analysis-tools/invoked-usage.mjs --cohort benchmark-runs/d071-comparison-01 --preserved-repair benchmark-runs/d071-preserved-repair-01 --rates benchmark-runs/d071-preflight/official-rates.json --output-dir benchmark-runs/NEW_D071_INVOCATIONS
```

실제 실행 명령과 종료 코드는 [driver](../../benchmark-runs/d071-preflight/run-experiment.mjs), [종료 영수증](../../benchmark-runs/d071-preflight/experiment-terminal.json)에 있다. 개발 runner exit2는 실패 조건을 포함한 종료이며 불확실 중단이 아니다. 네 독립 채점 driver는 모두 exit0으로 결과를 기록했다.
