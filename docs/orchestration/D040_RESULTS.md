# D040 — OpenAPI 첫 실행: 채점 준비 완료, 단일 구현 timeout

2026-10-10. [사전 조건](D040_EXPERIMENT.md), [역할](../agents/D040_OPENAPI.md), [평가기 검증](../agents/D040_EVALUATOR_STATUS.md). 사용자가 첫 큰 과제 진행을 요청했다. **첫 실행을 실제로 수행했으나 Claude 구현 timeout으로 사전 중단 조건이 발동했다. Claude/Jev 성능 비교는 완료하지 못했다.**

## 무엇을 실행했는가

OpenAPI task manifest를 추가하고 evaluator에 명시 `--manifest`를 연결했다. 기존 pytest-check 기본 경로를 유지했다. 새 offline verifier의 빈 대조는 reward0, 정상 참조는63/63 reward1. 두 컨테이너 제거 확인. 이 결과는 채점기 검증이지 생성 모델의 성공이 아니다.

Claude Desktop CLI2.1.293 / claude-opus-5-5 medium / projectedv3 / concurrency2 / threshold0.65. 새 public instruction과 공통 artifact contract만 제공했다. 계획은 Claude가 생성했으며 사람이 task list를 지정하지 않았다. 4개 작업/16개 파일 계획: 공통 해석 → 모델·endpoint 생성 → CLI/패키징. 계획 검증 후 Claude 판단은 beneficial=.30, single을 선택했다. 모델이 반환한 확률이지 실측 성공률이 아니다.

| 호출 | 결과 | CLI wall | regular / cache-write / cache-read / output tokens | API-equivalent USD |
|---|---|---:|---|---:|
| 계획 생성 | completed |121.778789초|2 /10120 /0 /13267|0.346308|
| Claude 판단 | completed |5.616430초|2 /17375 /0 /218|0.143368|
| 단일 구현 | uncertain, TIMEOUT |600.037774초|unknown /unknown /unknown /unknown|unknown|
| Jev 자동 조건 | not_started |NA|NA|새 호출0|
| 별도 Opus monitor | not_started |NA|NA|새 호출0|

계획·판단의 **확인된 부분 합계만 USD0.489676** (=.346308+.143368). 구현 포함 전체비용은 null, 실제 구독 추가 청구도 unknown이다. 출력 token의 thinking breakdown은 이미 포함된 하위값이므로 다시 더하지 않는다. cache-write는 두 완료 호출 모두1h이다. CLI가 제공한 환산값이며 새 공식 가격 조사/실제 청구 조회는 아니다.

최초 전체 run wall727.555533초, decision+worker 단계합605.702575초. 둘은 시간 경계가 다르며 비교군이 없으므로 절감률 없음. 본문 반올림 값의 원본은 receipts/analysis에 보존했다.

## 직접 확인한 실패 원인과 한계

- 로컬 runner의10분 per-call timeout으로 구현 CLI 종료. receipt: interrupted=TIMEOUT, outcome_uncertain=true, exitCode=null, usage=null. 오류 출력은0 bytes.
- stdout98121bytes, system 이벤트491개. 최종 assistant/result 없음. 마지막 thinking_tokens 이벤트의 estimated_tokens=64250. 이는 CLI 추정 진행 지표이며 **청구/실제 token으로 변환하지 않는다**. provider API 처리시간도 최종 receipt가 없어 unknown.
- 출력은4MiB 제한 미만이며 출력량 초과로 중단된 것이 아니다. 사고 이벤트가 도착했으므로 관측 구간을 단순 무응답 연결 장애로 설명하지 않는다. 완성 응답 없는 이유가 과제 난이도·프롬프트·모델 reasoning 중 어느 요인의 얼마 때문인지는 분리 측정하지 않았다.
- 현재 scaffold는 전체 지정 파일을 한 응답으로 받고 검증한 후 저장한다. 도중 사고 이벤트만으로는 파일을 구성할 수 없다. 후보 파일0개, 생성 산출물의 독립 검사는 not_run이다. 빈 대조의0/63을 이 모델의 채점 결과로 옮기지 않는다.
- 구현 프로세스 그룹은 timeout으로 종료됐고 `lsof -a -c claude -d cwd -Fn`의 활성 cwd에 해당 fresh jev-tree-lx078x가 없음을 확인했다. 다른 작업 프로세스는 변경하지 않았다. 서버 과금/완료 상태는 별도 미확인이다.

**구조적 의미:** 큰 과제를 한 번에 생성하게 하는 현재 실행 방식과10분 한도가 이번 수행을 막았다. Jev가 split을 선택했으면 해결됐을 것이라는 주장은 아직 실험하지 않았다. Jev의 속도·품질 우위나 Claude의 과제 수행 불가능을 결론내리지 않는다.

## 사전 중단 규칙 적용

불확실한 유료 호출 뒤 follow-up을 정산 전 진행하지 않기로 기록했다. 따라서 Jev 조건과 추가 유료 Opus 모니터를 시작하지 않았고 자동 재시도·시간 제한 상향·프롬프트 수정·후보 수리를 하지 않았다. 독립 읽기 전용 reviewer가 실패 원인/집계를 검토했다. Opus 모니터 대체 수행으로 표현하지 않는다.

Jev 장부는 시작과 동일49settlements/84787input, pending=null, 보수적누적USD.0508722(84787×.6/1e6). 이번 신규 Jev0. Claude 구현 사용량 미확정과 Jev 장부 pending 없음은 서로 다른 상태다.

## 실행·검증 근거

Private 원본: `benchmark-runs/d040-protocol.json`, `d040-config.json`, `d040-claude-01/{inputs,frozen-plan,result}.json`, `*.receipt.json`, `*.stdout.jsonl`, `d040-stop-evidence.json`, `d040-analysis.json`. 원시 로그는 public commit 대상이 아니다.

실제 실행:
```sh
node scripts/tree-e2e-pilot.mjs benchmark-runs/d040-config.json benchmark-runs/d040-claude-01 --spend --routing-mode claude --split-threshold 0.65 --concurrency 2
python3 scripts/analyze-larger-comparison.py
```
실제 채점기 대조의 재현은 evaluator status에 `--manifest` 명령과 결과 경로가 있다. 같은 output을 덮어써 재실행하지 않는다.

검증: adapter18/18, checkpoint17/17, 전체Node407/407. 분석기는 source hashes·실패 receipts·미실행 조건을 보존하고 comparisons=[]로 출력했다. 계획 생성과 재사용 조건 사이 post-plan 시간한도 불균형을 사전 리뷰에서 발견해 phase timer로 수정했다. 분석기의 초기 실패 시도 누락 위험도 유료 실행 전에 보완했다. GETmodels는 최초sandbox transport 오류 후 권한 있는 비추론GET200. 최초 ps는sandbox거부 후 read-only 권한 확인. 이들은 API POST 재시도가 아니다.

## 다음에 필요한 것

과제 준비는 완료됐지만 실제 비교는 남았다. 이번 불확실 호출의 과금/상태 확인과, 큰 작업을 중간 파일·빌드·검사·수정으로 진행할 공통 worker harness가 필요하다. 두 조건 모두 같은 도구·제한을 사용하고 새 revision으로 측정한다. 단순히 timeout을 늘린 재시도나 한쪽에만 유리한 split 강제 결과를 기존 비교와 합치지 않는다. 원래 목표인 Jev 판단이 실제로 줄이는 Claude 작업은 그 후 평가한다.

부수효과: 새 OpenAPI 이미지/평가용 reference clone/대조군/계획·실패 로그/임시 CLI 작업폴더 보존. 생성한 verifier2개 제거. 본 시도 활성 provider process 없음. adapter·분석기·모니터 스크립트와 문서는 미커밋이며 push 없음. 모니터 스크립트는 구문 검사만 했고 실제 provider 실행은 안 했다. 기존 Personal OS/Vault 변경 없음.
