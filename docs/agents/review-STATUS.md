# review 상태

갱신: 2026-10-08 (Asia/Seoul). 상태: 독립 검토 및 수정 재검증 완료. 확인한 미해결 결함 없음.

## 목적과 범위

- D-012 / REVIEW.md에 따른 오프라인 평가 독립 검토.
- 기본 read-only이며 이 상태 파일만 프로젝트 안에서 작성한다.
- 구현자 테스트와 별도로 분모, 결측 비용, 중복·미등록 요청, 다중 질문 단일 청구,
  unknown/abstain, 확률, prototype-like label, CLI 오류의 입력 노출을 확인한다.
- 네트워크·키·실제 모델 호출과 모델 품질 검증은 범위 밖이다.

## 읽은 정본

- AGENTS.md, docs/TECHNICAL_SPEC.md, docs/DECISIONS.md, docs/WORK_LOG.md,
  VERIFICATION.md, docs/agents/README.md, docs/agents/REVIEW.md,
  docs/agents/STATE.md, docs/EVALUATION_CONTRACT.md, docs/EVALUATION_RESEARCH.md.
- contract.mjs, metrics.mjs, index.mjs, bin/evaluate.mjs, examples/evaluation 입력,
  docs/EVALUATION_USAGE.md를 직접 읽었다. 작성 중인 metrics 부재는 제품 버그로 세지 않았다.

## 실제 검증

2026-10-08 프로젝트 루트에서 `node --input-type=module` 인라인 검증, exit 0:

- import: `node:assert/strict`, `./src/evaluation/contract.mjs`의 `validateEvaluation`.
- synthetic manifest: trial 1개/expected requests 1, categorical case 1개,
  labels `__proto__`, `constructor`; decision 및 request 각 1개.
- 거부 검증 18개: 중복 request/decision, 미등록 trial/case, 예상 요청 수 초과,
  미허용 answer, 확률 합 오류/음수/누락, decision의 추가 reference 필드,
  request의 추가 state 필드, 답이 있는 abstention, unknown 상태 decided,
  비채택 constraint, 응답 없는 completed request, Infinity 비용,
  unsafe integer token, 공백 dataset version.
- 수용·불변 검증 4개: prototype-like label 확률 map, records 없음,
  expected request count null, gold 확률 0. JSON.stringify 전후 일치 확인.
- 결과: independent_contract_checks 22, pass 22, fail 0.

통합 준비 후 `node --input-type=module`로 독립 손계산 fixture 실행, exit 0:

- manifest trials 3개(같은 task의 반복 trial 포함), cases 7개. 정답/오답/보류/누락/참조 없음/
  복수 허용 답/binary 0확률을 포함했다. 여러 decision과 request 3개의 비용을 별개로 기록했다.
- 독립 예상값: coverage 5/7, scorable coverage 4/6, accuracy 3/4, risk 1/4,
  verified yield 3/6, 성공률 1/3, 조건부 성공률 1/2.
- 비용 예상값: 전체 10, 운영 5(성공 요청 2 + 실패 요청 3), 평가 5, 성공당 운영 비용 5.
  categorical confusion matrix `[[1,0],[1,0]]`, macro-F1 1/3, Brier 0.625,
  log loss `(-log(0.75)-log(0.25))/2`. binary Brier 1, log loss null/infinite_loss.
- 요청/금액 누락과 overflow를 각각 변형해 total null 및 관측 부분합·사유를 확인했다.
  빈 manifest의 0분모 null/확정 0 비용과 입력 불변도 검사했다.
- 결과: independent_metric_checks 39, pass 39, fail 0.

CLI는 OS 임시 디렉터리에 직접 작성한 파일과 `spawnSync(process.execPath, ['bin/evaluate.mjs', ...])`로
검증했다. fixture 디렉터리는 finally에서 삭제했다.

- invalid manifest contract, 깨진 manifest JSON, 기록의 추가 비허용 필드, 깨진 JSONL,
  invalid UTF-8, 빈 JSONL, output 충돌 및 기존 내용 보존, 입력 경로 읽기 실패, unknown flag.
- 오류의 stdout이 비어 있고 고정 error code/종료코드가 맞으며 `REVIEW_PRIVATE_MARKER`가
  stderr에 반영되지 않는지 확인했다.
- 결과: independent_cli_checks 10, pass 10, fail 0.
- 별도 closed stdout pipe 재현: 도움말 출력 전에 수신 pipe를 닫자 exit 4 및
  고정 OUTPUT_WRITE_FAILED JSON을 반환했다. raw stack/입력 노출 없음.

수정 후 분모 및 추가 경계 검증, `node --input-type=module`, exit 0:

- expected 3/recorded 2/금액 관측 2이면 observation_rate 2/3, recorded_value_observation_rate 1.
- 누락 request의 phase를 모르거나 expected 수가 null이면 observation_rate null/unknown_denominator.
- 선택 답 정확도 1이어도 동률 argmax가 gold와 다르면 reliability accuracy 0;
  binary false 우선/categorical manifest 라벨 순서, confidence 0.5의 bin 5 및 0 support 제외 확인.
- 결과: independent_regression_and_boundary_checks 12, pass 12, fail 0.

최종 평가 테스트 재실행:

```sh
node --test test/evaluation-contract.test.mjs test/evaluation-metrics.test.mjs test/evaluation-cli.test.mjs test/evaluation-integration.test.mjs
```

- tests 60, pass 60, fail 0, skipped 0, exit 0.
- 위 60개는 프로젝트 회귀 테스트이며 독립 인라인 검증 83개(22+39+10+12)와 구분한다.
- AST import 확인: `sg run --lang javascript --pattern 'import $IMPORTS from $SOURCE' src/evaluation bin/evaluate.mjs`.
  평가 entrypoint의 로컬 contract/metrics와 CLI의 fs import를 확인했다. sg의 deprecation 경고가
  있었지만 명령은 정상 실행됐다. 실제 호스트 네트워크 격리의 전수 증거로 확대하지 않는다.

## 발견 사항

1. **P2, 해결 — 계약 오류의 잘못된 CLI 종료코드.** `bin/evaluate.mjs`가
   INVALID_EVALUATION_INPUT만 처리하고 contract가 INVALID_EVALUATION을 반환했다.
   임시 manifest `{}`와 빈 JSONL의 CLI 실행은 처음 exit 1/INTERNAL_ERROR였고,
   의도한 입력 오류 exit 3/INPUT_CONTRACT_INVALID와 달랐다. main/cli 담당에게 전달 후
   cli 담당이 수정했다. 현재 bin/evaluate.mjs:103과 독립 fixture에서 exit 3 확인.
2. **P2, 해결 — 누락 요청이 있는 비용 관측률의 분모.** 예상 3, 기록 2, 비용 관측 2인
   입력에서 amount().observation_rate가 처음 1(2/2)이었다. total 비용은 올바르게 null이었으나
   전체 비용발생 가능 건수 기준 관측률로는 2/3이어야 했다. main/metrics 담당에게 전달 후
   metrics 담당이 observation_rate를 예정 수 기준으로 수정하고 기록 수 기준 값은
   recorded_value_observation_rate로 분리했다. src/evaluation/metrics.mjs:95-96 및
   독립 fixture에서 2/3과 미상 분모 null 확인.

두 발견 모두 작성 중인 통합 소스에서 재현됐고 최종 검토 시 해결됐다. 구현 파일을 직접 수정하지 않았다.
현재 검토 범위에서 확인한 미해결 결함은 없다.

## 다음 행동

- main이 전체 검증/최상위 기록을 마치고 최종 완료를 판단한다.
- 합성·로컬 검증만 수행했다. 실제 Jev 추론·청구·모델 품질·절감 효과, 온라인 수집,
  라우팅 실행·host E2E·ranking/Oracle regret/신뢰구간은 검증하지 않았다.
- reference 정답이 실제 생성기/라우터에 유출되지 않는다는 end-to-end 증거는 없다.
  현재 평가는 호출 경로 자체가 없고 요청 기록의 추가 reference/state 필드를 거부하는 범위만 확인했다.
- 수정 파일: 이 상태 파일만. 인계 발생 없음.
