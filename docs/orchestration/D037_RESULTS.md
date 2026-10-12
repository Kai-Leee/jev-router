# D037 — 실제 Claude / Jev 강제 / 자동 비교 결과

2026-10-10. [사전 조건](D037_EXPERIMENT.md), [역할](../agents/D037_LIVE_COMPARISON.md). 같은 pytest-check 과제·고정 계획·질문·projected/v3 입력·Opus5.5 medium·동시성2·임계값0.65·독립 Docker grader로 조건별 1회. 계획 생성은 모두 재사용했다. 실제 호출은 Claude10회, Jev2회이며 자동 재시도 없음.

## 결과

| 항목 | Claude 판단 | Jev 강제 판단 | 자동 판단 |
|---|---:|---:|---:|
| 분할 이득 확률 | 0.30 | 0.65 | 0.66 |
| 선택 | single | split | split |
| 판단 단계 초 | 7.002293 | 2.403598 | 1.976117 |
| worker 실행 초 | 150.521425 | 106.368824 | 105.318321 |
| run wall 초 (독립 채점 제외) | 157.594936 | 108.900480 | 107.378731 |
| 독립 채점 | 30/30 | 30/30 | 30/30 |
| Claude 호출: 판단+작업자 | 1+1 | 0+4 | 0+4 |
| Jev 호출 | 0 | 1 | 1 |
| Claude API 환산 USD | 0.5265176 | 0.5622144 | 0.5705064 |
| Jev 보수적 환산 USD | 0 | 0.0036144 | 0.0036144 |
| 비교용 환산합계 USD | 0.5265176 | 0.5658288 | 0.5741208 |

시간은 실제 영수증/실행 clock 값이다. 비용은 API 상당액/보수적 토큰 환산이며 실제 구독 추가 청구액이 아니다. 분모를 Claude 기준값으로 두면 강제군 run wall30.8985% 감소·비용7.4663% 증가, 자동군 run wall31.8641% 감소·비용9.0411% 증가다. 산식: 시간감소=(157594.935542−비교군wall_ms)/157594.935542×100; 비용증가=(비교군합계−0.5265176)/0.5265176×100.

판단 단계만 보면 Claude/Jev 시간비는 강제군2.9133배, 자동군3.5435배다. 이는 HTTP latency만이 아니라 provider lookup/프로세스·파싱 등을 포함한 각각의 판단 경계다. 실제 Jev HTTP 시간은 해당 events.jsonl의 inference_finished.receipt.durationMs에 별도로 남아 있다. 전체 시간 차이에는 선택된 single/split의 실행 차이도 포함되므로 순수 Jev 판단 대체 효과로 모두 귀속하지 않는다.

독립 채점시간은 Claude16.3074초, 강제3.9930초, 자동3.8872초였다. 이 차이의 원인은 측정하지 않았고 라우팅 속도 개선으로 주장하지 않는다. 분석JSON은 decision+worker+grade 단계합도 제공하지만 주 비교는 채점 제외 run wall로 제시했다. 수동 대기시간을 합쳐 E2E 개선으로 부르지 않는다.

## 토큰과 비용 증가 원인

Claude input_tokens는 비캐시 입력만이므로 캐시 생성·읽기와 합산한 총 입력도 함께 본다.

| Claude 토큰 유형 | Claude 판단 | Jev 강제 | 자동 |
|---|---:|---:|---:|
| 일반 입력 | 4 | 8 | 8 |
| 1시간 캐시 생성 | 18,431 | 34,086 | 34,525 |
| 캐시 읽기 | 1,368 | 5,472 | 5,472 |
| 합산 입력 | 19,803 | 39,566 | 40,005 |
| 출력 | 18,939 | 14,420 | 14,659 |
| 별도 Jev 입력 / 출력 | 0 / 0 | 6,024 / 59 | 6,024 / 59 |

2026-10-10 [Anthropic 공식 가격](https://platform.claude.com/docs/en/about-claude/pricing) 확인: Opus5.5 백만 토큰당 입력$4, 출력$20, 1시간 cache write$8, cache read$0.20. 실제 모든 영수증의 cache_creation은 1시간이고 이 요율의 재계산 합계가 CLI 비용과 일치한다.

자동군에서 별도 Claude 판단$0.080964를 Jev 보수적$0.0036144로 바꿔 판단비용 환산$0.0773496를 줄였다. 반면 작업자는 1회$0.4455536에서 4회$0.5705064로 $0.1249528 증가했다. 둘을 합하면 순증가$0.0476032다. 자동군의 캐시 생성 환산은 $0.276200으로 기준군$0.147448보다 높다. 출력 환산은 $0.293180으로 기준군$0.378780보다 낮지만 캐시 생성 증가를 상쇄하지 못했다. 캐시 읽기 증가 자체가 실패 증거는 아니다.

Jev는 두 요청 모두 input6,024를 token balance에서 정산했고 output59는 무료다. [Jev 공식 가격](https://jev-ai.pro/pricing)의 $0.60/M token pack 기준은 기존 USD1 보수적 장부와 같다. 월정액 사용자의 추가 청구로 해석하지 않는다. 현재 공개 페이지에서 과거 월$29/60M 조건을 재확인하지 못해 그 값으로 이번 월배분액을 확정하지 않았다.

공유 장부는 47→49 settled requests,72,739→84,787 charged input tokens, 보수적누적$0.0436434→$0.0508722. 이번 증가2요청/12,048토큰/$0.0072288이며 pending=null. USD1 한도 이내다. 전체 Claude 환산합계$1.6592384, Jev 보수적 포함 비교환산$1.6664672. 실제 총 추가청구액 unknown.

## 자동 호출 확인과 해석 한계

두 신규 checkpoint 모두 authority=jev, skip_reason=null, jev_attempts=1, decision_used=true, handler=execute_split였다. 자동 모드가 실제 API를 호출하고 그 답을 실행에 사용했다. 이 다중 작업에서는 bypass/cache가 발생하지 않았다. 따라서 자동이 강제보다 호출을 줄였다고 할 수 없다.

중요한 추가 발견: 요청 model은 양쪽 jev-latest지만 응답 model은 강제 `typesafe-ai/jev`, 자동 `typesafe/jev-1.13-20260917`이었다. 별칭 차이인지 내부 버전 차이인지 확인되지 않았다. 동일 concrete model 통제 실험이 아니며 자동/강제의 작은 시간·비용 차이를 자동 모드 최적화 효과로 해석하지 않는다. 이번 두 답의0.65/0.66도 calibration 근거가 아니다. 강제군은 threshold와 정확히 같아 >= 규칙으로 split했다.

3개 원본 산출물 모두 동일 독립검사30/30에 통과했지만 하나의 과제, 각조건1회뿐이다. 순서가 고정됐고 provider cache 상태도 공유돼 일반적 성능/비용 우위를 주장하지 않는다. 고정 계획을 재사용했으므로 planner 생략은 Jev 성과가 아니다. Claude 계획+선택 통합 baseline과 실제 template planner는 미측정이다. 현재 결과로는 반복 판단 대체의 지연 개선은 관측됐지만 전체 비용 절감 목표는 달성하지 못했다.

## 재현·근거·검증

집계: `python3 scripts/analyze-checkpoint-comparison.py d037`. 출력은 새로만 생성하므로 재검산 시 기존 결과를 덮어쓰지 말고 새 prefix/출력으로 보존한다. 원본 [분석](../../benchmark-runs/d037-analysis.json), [조건](../../benchmark-runs/d037-protocol.json). private 파일은 공개 Git에 넣지 않는다.

- 실행: benchmark-runs/d037-claude-01, d037-force_jev-01, d037-auto-01의 result/split-decision/receipts/events.
- 채점: benchmark-runs/d037-grade-claude-single, d037-grade-force_jev-split, d037-grade-auto-split/result.json.
- 입력/계획/질문/threshold/동시성/worker SHA, 실행 소스 SHA, grade workspace/image/task/upstream 일치 검사 통과.
- 독립 reviewer가 Claude10개 raw stdout terminal result와 영수증 usage/cost의 일치를 확인했다. 후보 파일 hash는 채점 후 수집했으므로 채점 전 immutable snapshot 증거라고 하지 않는다.
- 분석기 검토에서 기존 비교기의 신규 authority 미지원, 실패 후 사용량 누락 위험, grade provenance 검사 부족을 발견했다. 신규 분석기는 mode 전체 및 실패행을 보존하고 event usage fallback과 task/upstream/status 검사를 추가했다. 원본 응답이나 산출물은 수정하지 않았다.

실행 실패·재시도·repair는 없었다. verifier3개 제거 확인. 새 서비스/운영 배포 없음, PersonalOS 미변경. private 후보·로그·분석과 미커밋 문서/분석 스크립트가 남으며 commit/push하지 않았다. 다음 검증에서는 시간 이득 확률과 별도로 분할 비용 제한을 두고, 현재와 같은 worker 모델을 유지한 채 분할 입력 비용 또는 planner 반복 생략을 다뤄야 한다. 이번 결과만으로 임계값을 변경하지 않았다.
