# D075 — 강제 사전 검사·복구 구현과 보존 후보 재실행

2026-10-12. 병렬 구현·두 번의 실제 수리·독립 채점·별도 Opus 검토를 마쳤다. 제품은 미완료다. 동일 출발점의 이전 수리보다 알려진 토큰·공식 환산 소계는 낮지만 통과 수와 종료 시간이 악화됐다. 첫 실패와 구현 결함을 아래에 보존한다.

## 비교 경계

이전 `d073-focused-new-02`와 새 `d075-same-source-*`는 원본 `d073-comparison-01/jev_profile`의 동일한 38파일·22산출물·79/93 공개 통과 후보에서 시작한다. 후보 snapshot은 `b2d02f39d7f97a994a9645419395354d5d615efdc9171848d4bbe0dbdca5bba2`다. 이전 수리로 개선된91/93 후보에서 이어 달린 조건이 아니다.

이 비교는 **보존 후보의 수리**다. 공개93·독립63 검사를 모두 통과해야 완료다. 성공하지 못한 시도시간 감소를 완료 속도 향상으로 계산하지 않는다. 토큰은 알려진 입력·출력·캐시 쓰기·캐시 읽기 합계를 포함하며, 누락된 사용량이 있으면 전체 총량은 unknown이다. 공식 요금 API 환산액과 월정액 실제 청구액은 별도다. 모니터·개발 도중 Codex 작업·수동 분석 시간은 제품 실행 지표에서 분리한다.

## 첫 실제 실행 — 그대로 보존

`node benchmark-runs/d075-root-01/run-condition.mjs --spend benchmark-runs/d075-same-source-01`

- runner196615.423791ms, Jev POST3(성공2·HTTP400실패1), Claude 수리0.
- owner14질문은 A10/A14/A15를 담당 가설로 선택했고 수리 chooser는 기존 담당2명을 선택했다. 첫 profile 요청의 문맥 초과로 프로필 확정·작업자 실행 전에 중단됐다.
- 마지막 확인된 후보는 공개79/93, 독립60/63이다. 초기 결과의 candidate 포인터가 빠졌으므로 [별도 export 감사](../../benchmark-runs/d075-export-observation-01/result.json)로 원본·revision·검사 연결을 확인한 뒤 독립 채점했다. 원래 `result.json`은 수정하지 않았다.
- 독립 채점19340.123ms, runner+grade 측정 단계 합215955.546791ms. 실제 시작→grade 종료668249ms에는 원인 분석·채점 연결 대기452286ms가 포함된다. 이를 자동 수리 시간으로 혼합하지 않는다.
- 알려진 입력57491·출력3537=61028토큰. 실패 요청 추론 토큰은 unknown. 공식 입력 환산 알려진 소계USD0.0344946. 공급자 계정 화면·HTTP응답·credits GET로 실패1건은 환불·무과금 확인 후 로컬 예약을 정산했다. 성공2건의 월 구독 배분액·전체 실제 청구액은 unknown이다.
- 실제3POST 모두 initial/before_reservation/before_post 검사영수증과 같은 wire SHA를 보유했다. 구조 검사는 모델의 실제 문맥 수락을 보장하지 않는다.

근거: [원결과](../../benchmark-runs/d075-same-source-01/result.json), [채점](../../benchmark-runs/d075-same-source-01/independent-evaluation.json), [환불 근거](../../benchmark-runs/d075-refund-01/evidence.json), [정산](../../benchmark-runs/d075-refund-01/reconciliation.json). 최초 분석은 [analysis01](../../benchmark-runs/d075-analysis-01/analysis.json)에 남겼다. 이 최초 분석은 candidate 포인터 누락과 별도 채점 이전 상태여서 원시 run의 마지막 round를 판정하며, 위 별도 감사·채점으로 소급 덮어쓰지 않는다.

## 실제 실행이 드러낸 구현·검증 결함

1. Owner 검증용 controller context가 profile model 입력으로 유출됐다. 이전 같은 profile 성공60491B 대비 첫 실제 입력149079B. 값 자체88334B, 필드/framing을 포함하면88358B로 증가88588B의99.7404%를 차지했다. 작업·선택지 증가가 원인이 아니다. 기존 profile projector에서 해당 controller 필드 하나를 제외하고 원문 해시·참조를 보존했다. 재생 수정값60721B이며 context를 복원하면 실패 wire SHA와 같다. [필드별 분석](../../benchmark-runs/d075-profile-failure-analysis-01/result.json).
2. Runtime 이전 profile 실패를 repair round/history로 세고 마지막 정상 export를 놓쳤다. 첫 실행의 repair_rounds_used1은 실제 작업자0과 다르다. 후속 코드는 preparation_failure를 분리하고 현재 실패 원인을 유지하면서 마지막 export의 근거 round를 명시한다. [수정 재생](../../benchmark-runs/d075-recovery-01/d075-profile-preparation-replay-03.json).
3. 최초 독립 검토는 worker 입력 전달을 확인했지만 owner→profile preparer의 실제 packet 경로를 보지 못했다. 후속 검사는 실제 controller 경로와 stub session으로 그 경계를 직접 확인했다. 앞선 통과·초기 fixture 오류·수정 후 증거를 각각 보존한다.

초기 개발 중에는 소스 줄 재정렬을 새 근거로 오인하는 문제, callback 공유 참조 변조, 회계 검사에서 실제 예약 event를 누락해도 POST0을 확인된 것으로 분류하는 문제도 발견해 수정했다. 모델 결과의 성공 여부와 검증 장치 자체의 결함을 구분한다.

## 구현 범위와 미지원

- v10 보존 수리 기본 경로에 실제 전송 전 강제검사를 연결했다. 모든 단계의 목적지·모델·형식·바이트·request/policy/source SHA를 검사하며, owner inferred-v2는 고정 질문과 실패 근거 연결까지 검사한다. 다른 단계의 의미를 모두 검증했다고 주장하지 않는다.
- 남은 실패는 담당 추론→수리 선택→모델/노력도→작업자→재검사로 진행한다. 무진전이면 관련 소스의 실제 새 근거를 요구한다. 표현·모델·노력도만 바꾼 반복은 허용 근거가 아니다.
- **프로필 단계의 자동 입력 재구성·재전송은 미지원**이며 `PROFILE_INPUT_REBUILD_UNSUPPORTED`로 명시한다. 불확실 요청·미정산·계정·외부 환경 문제는 무조건 재시도하지 않고 관측 가능한 중단 상태로 남긴다.
- 실제 provider tokenizer/framing 전체를 재현하지 못하므로 정확 문맥 적합성은 사전확정하지 않는다. 바이트 감소·오프라인 통과와 공급자 수락은 구분한다.
- 최종91/93 후보의 이력 승계 지원은 이번 동일 출발 조건에 포함하지 않았다. 과거 실패 시도를 지워 fresh 상태로 보지 않는다.

## 검증과 보존

`npm test` 최초1270개 중1258통과·localhost listen EPERM12. 해당3파일을 localhost 허용 환경에서 재검사해24/24 통과했다. 합쳐서 미해결 실패0이며 unrestricted 전체 재실행이라고 하지 않는다. 첫 live 이후 두 생산 파일 수정에는 관련43+executor38=81개 검사를 적용했다.

[전체 검사 기록](../../benchmark-runs/d075-root-01/verification.json), [후속 검사](../../benchmark-runs/d075-root-01/verification-02.json), [전송 독립 반례7개](../../benchmark-runs/d075-review-01/control-flow-evidence.json), [단일 스킬 관리자 기록](../agents/D075_SKILLS.md).

첫 실행 종료 감사에서 실행 중 source drift0, 후보 원본 보존, run 컨테이너 잔여0·추가 컨테이너0을 확인했다. 이후 current source2개 변경은 위 수정이며 실패 실행의 저장 snapshot을 바꾼 것이 아니다. 새 private 실험·증거 파일 및 미커밋 코드·문서 변경이 남아 있다. 기존 결과 삭제·Personal OS 변경·전역 스킬 설치·커밋·푸시는 하지 않았다.

## 동일 출발 후보 재측정

`node benchmark-runs/d075-root-01/run-condition-02.mjs --spend benchmark-runs/d075-same-source-02`

| 지표 | 이전 D073 수리 | 수정 후 D075 두 번째 실행 |
| --- | ---: | ---: |
| 출발 공개 통과 | 79/93 | 79/93 |
| 최종 공개 통과 | 91/93 | 88/93 |
| 독립 통과 | 61/63 | 60/63 |
| 완료 | 아니오 | 아니오 |
| runner 종료까지 | 339.993346167초 | 352.150628292초 |
| 시작→독립 채점 종료 관측 | 355.366초 | 369.093초 |
| runner+grade 단조 시계 단계 합 | 354.984616750초 | 368.729581292초 |
| Jev 실제 POST / Claude 작업자 CLI | 5 / 2 | 5 / 2 |
| 알려진 입력+출력+캐시 토큰 | 803,431 | 709,276 |
| 공식 요금 환산 알려진 소계 | USD0.7062281 | USD0.6804039 |
| 원시 CLI/API 보고 환산 소계 | USD0.7614788 | USD0.7271624 |

분모를 이전 D073으로 두면 관측 종료 시간은 13.727/355.366초=3.8628% 증가, 알려진 토큰은 94,155/803,431=11.7191% 감소, 공식 환산 소계는 USD0.0258242/0.7062281=3.6566% 감소다. 각 조건1회이고 공유 호스트에서 실행했다. 실패 요청 하나씩의 추론량이 없으므로 **전체 추론 토큰 차이는 unknown, 완료 속도 향상은 null**이다. 환불 확인으로 무과금 실패를 별도 청구 환산에 반영해도 해당 추론량을0으로 채우지 않는다.

집계 명령은 아래와 같다. 분석은 원본을 덮어쓰지 않고 새 경로에 저장한다.

```sh
node benchmark-runs/d075-measurement-01/compare.mjs --new-run benchmark-runs/d075-same-source-02 --rates benchmark-runs/d075-measurement-01/official-rates.json --comparison same-source --control-flow-evidence benchmark-runs/d075-review-01/control-flow-evidence.json --output-dir benchmark-runs/d075-analysis-02
node benchmark-runs/d075-root-01/finalize-measurement.mjs
```

이미 생성된 출력 경로로 위 명령을 반복하면 보존 정책에 따라 거부한다. 재집계는 별도 출력 이름을 사용한다. [전체 분석](../../benchmark-runs/d075-analysis-02/analysis.json), [간결한 최종 숫자·원문 SHA](../../benchmark-runs/d075-root-01/final-summary.json), [환불 별도 보정](../../benchmark-runs/d075-analysis-02/refund-adjustment/refund-accounting.json)이 근거다. 가격 기준은 [공식 요금 스냅샷](../../benchmark-runs/d075-measurement-01/official-rates.json)이며 월정액 실제 청구·배분은 unknown이다.

## 실제 실행된 판단과 멈춘 경계

1. 원본 공개14실패 재현 → owner14질문 → 기존 담당2명 선택 → 두 profile 선택 → Sonnet5.5 high/medium 작업자2명 실행. 두 receipt의 실제 model identity가 선택과 일치했다. CLI 노력도 인자는 확인했으며 모델 내부 노력도는 관측하지 않았다. 비선택13개 원본 작업자의 새 호출은0이다.
2. A14 `pyclientgen/schema/operations.py`와 A15 `pyclientgen/diagnostics.py`가 바뀌었다. 설명 출처8검사와 기존 schema 설명1검사, 총9실패가 해소됐다. A10은 선택됐으나 변경되지 않았고 enum/default2·diagnostics3의5실패가 남았다. 신규 실패는0이다. 기존 수리가 해결했던 diagnostics3개가 이번 수리에서는 해결되지 않았다.
3. 복구가 `repair_remaining_scope_no_change → inspect_no_write_cause`를 실제 호출해 관련 소스 근거9개를 확보했다(58.279417ms). 이어 남은5실패의 owner 요청을 보냈다. 실패 수가 줄어도 무변경 담당을 그냥 반복 실행하지 않는 경로가 실제 동작했다.
4. 이 요청은 wire92629B, state89455B, state+최대질문90072B였다. schema/256000B/정책·소스·요청 해시 검사는 통과했지만 공급자가 HTTP400 `model_input_limit`로 거부했다. 로컬 추정36541토큰은 관측치일 뿐 정확 tokenizer 결과가 아니다. 공급자는 state+최대질문32k 제한을 두며 사용자 장부 상한null과 별개다. 추정값을 임의 운영 상한으로 다시 강제하지 않았다.
5. 자동 복구는 `rebuild_relevant_input`을 시도했지만 현재의 단일 canonical 표현을 이미 사용해 `CANONICAL_INPUT_ALREADY_APPLIED`로 중단됐다. 추가 표현 변환·자동 재전송·두 번째 수리 작업자는 실행되지 않았다. 따라서 이번 결과는 **원인 근거 수집·후속 담당 요청·반복 방지의 실측**, 입력 재구성으로 문맥 실패를 해결한 성공 증거는 아니다.

두 번째 실제5POST는 initial/before_reservation/before_post 각각5/5 영수증과 전송 연결이 확인됐다. [전송·복구 분석](../../benchmark-runs/d075-analysis-02/analysis.json)과 [최종 결과](../../benchmark-runs/d075-same-source-02/result.json)를 따른다. 독립 채점은 동일 후보를 유지한 채63개를 실행했고 건너뛴 검사는0이다. 숨김 실패 내용은 수리 입력으로 돌려주지 않았다.

현재 실행의 공개 검사16구간은 직렬로 총199.279436958초, runner352.150628292초의56.5893%다. 작업자2명은33.355217708초 겹쳤고 전체 작업자 구간은53.853794708초였다. 후속 이벤트 대조에서 이전 공개 검사 합182.4051775초 대비16.874259458초 증가, 작업자 구간69.682804709초 대비15.829010001초 감소를 확인했다. 두 구간은 runner 안에 있으므로 다시 더하지 않는다. [후속 구간 분석](../../benchmark-runs/d075-analysis-02/terminal-measurement.json). 모니터에 보낸 최초 packet의 이전 검사 합은null이었으며 이 후속 관측을 모니터가 봤다고 하지 않는다. 작업자 속도나 검사 한 구간만으로 전체 시간 차이의 원인을 확정하지 않는다.

## 전체 개발 비교와 모니터 경계

기존 Claude 단독 전체 개발은 공개93/93·독립63/63 완료, 시작→채점 종료2345.048초(39분05.048초),4,589,913토큰,공식 환산USD16.6926398이다. 이는 과거 전체 개발 결과이며 이번 보존 수리와 출발점이 다르다. D075에서 새 Claude 전체 개발을 재실행하지 않았다. 원본 Jev 개발과 새 수리를 더한 단계 산술도 미완료 경로이며 Claude보다 성공적으로 빨라졌다는 증거가 아니다. [과거 연결](../../benchmark-runs/d075-measurement-01/historical-reference.json)을 보존한다.

별도 Opus5.5 medium 숫자 모니터를 실행했다. 첫 호출은 root 지시문이 필수 JSON 필드를 제시하지 않아 `MONITOR_REPORT_INVALID`였다. 모델 응답은 보존하고 [원인 기록](../../benchmark-runs/d075-opus-monitor-01/format-failure-analysis.json) 후 기존 parser 계약을 명시했다. 두 번째 호출은 model identity 확인·보고 형식 통과, 판정은 `attention`이다. [원보고](../../benchmark-runs/d075-opus-monitor-02/result.json). 모니터는 숫자 packet만 읽었으며 소스/영수증/숨김 검사의 독립 감사를 수행하지 않았다. 전달 시점 packet에는 새 환불 보정과 모니터 자신의 비용이 없었고 root가 각각 후속 영수증으로 보완했다.

모니터1은67.885679042초·14,247토큰·USD0.206008, 모니터2는24.529373초·9,243토큰·USD0.103996이다. 합92.415052042초·23,490토큰·USD0.310004를 제품 수리와 분리한다. 이번 두 수리 시도와 두 모니터의 전체 알려진 사용량은 Jev8POST·Claude작업자2CLI·모니터2CLI,793,794토큰·공식환산USD1.0249025다. 원래 D073 개발/비교·Codex 구현 작업·수동 분석 비용은 포함하지 않는다.

## 종료 상태와 남은 구현

최종 root source125핀 변경0, 실행 중 소스 변경0, 원본 후보 보존, 실행 컨테이너 잔여0·추가0을 확인했다. [종료 감사](../../benchmark-runs/d075-same-source-02/root-closeout.json). [과거 보존 감사](../../benchmark-runs/d075-analysis-02/preservation-audit-03.json)는 이전 파일1380개 변경/누락0, helper8개 동일, 독립 검토17소스와 실행 snapshot 일치를 확인했다. 두 번째 실패 요청은 계정의15:45 실패5질문 환불 표시·저장HTTP 무과금 응답·fresh credits GET을 대조해 해당 예약만 정산했다. 누적 장부는17,359,776입력·946정산·pending/blocked null이며 상한null을 유지했다. 원장은 증거 없이 초기화하지 않았다.

남은 구현은 이미 정규화한 owner 입력을 **질문별 관련 근거로 다시 구성하는 다음 표현 단계**, 새 근거에서 실제 원인 담당/허용 쓰기 범위를 바꾸는 수리, profile 준비 실패의 자동 입력 재구성, 동일 품질을 만족하는 새 전체 개발 비교다. 검사 구간의 병렬화/동일 revision 결과 재사용도 시간 목표의 후보이나 아직 검증하지 않았다. 기존91/93 terminal 후보 이력 승계도 이번 조건에서 지원하지 않았다.

새 private 실행·환불·검토·분석 파일과 미커밋 코드/문서가 남는다. 완료하지 못한 후보를 자동 재개하지 않았고 커밋·푸시·Personal OS 변경·전역 스킬 설치는 수행하지 않았다.
