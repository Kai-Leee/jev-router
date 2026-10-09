# D-020 실제 실패 분석 — 2026-10-09

확인 범위: `e2eswe-d020-01`–`04`의 보존된 실행·MCP·Jev·gate 기록, 실행기 소스, 원본 산출물과 독립 채점 영수증. 감사자는 새 모델 호출, Docker 실행, 인증 조회, 원본 기록 수정 없이 읽기와 순수 함수 재현만 수행했다. 별도 진단 채점은 main이 수행했으며 감사자는 결과와 파일 차이를 확인했다. 현재 소스의 수정 사항을 과거 실행 당시 동작으로 소급하지 않는다.

## 결론

네 번째 실행은 **구현 산출물을 만들었지만 완료 합의를 얻지 못한 실행**이다. Jev의 실제 판단 23회 중 18회는 명령 선택, 5회는 완료 판단이었다. 완료 판단은 모두 정상 응답 `continue`였고 Claude는 추가로 할 일을 구체적으로 찾지 못했다고 보고 종료했다. gate는 정상 `ready` 상태이나 `completion_claimed:false`였으므로 실행기가 `GATE_COMPLETION_UNCONFIRMED`를 기록했다. 시간 초과·추론 횟수 한도·USD1 예산 소진·응답 유실이 이 종료의 원인이라는 증거는 없다.

독립 채점에서는 **설치 인계 계약의 공백**을 추가로 확인했다. 원본은 `setup.sh`가 없어 패키지를 설치하지 못하고 테스트 0개 수집, reward 0이었다. 별도 복사본에 설치 스크립트 하나만 추가한 진단 채점은 30/30, reward 1이다. 원본 코드의 동작은 이 설치 개입 조건에서 검증됐지만, 원본 실행의 완료 실패와 원본 점수 0은 그대로 유지한다. `src/` 배치 자체가 잘못됐다는 결론은 근거가 없다.

## 시도별 원인과 실제 횟수

시각은 UTC이며 KST는 9시간을 더한다. `act/finish/status`는 실제 stream의 `tool_use` 블록 수, Jev 횟수는 `inference_started` 기록 수다. Claude HTTP 요청 수는 이 기록으로 확정하지 않는다.

| 시도 | 시작–종료 UTC / 실행 시간 | 실제 도구 호출 act / finish / status | Jev 추론 / 실행 명령 | 보존된 종료와 직접 근거 |
|---|---|---:|---:|---|
| 01 | 07:06:48–07:06:52 / 4.134초 | 0 / 0 / 0 | 0 / 0 | `failed / PROVIDER_FAILED`, CLI exit 1. 최종 결과 `Not logged in · Please run /login`. MCP 초기 연결은 성공했으나 구현 도구 사용 없음. |
| 02 | 07:09:59–07:10:21 / 22.517초 | 0 / 0 / 0 | 0 / 0 | `uncertain / GATE_COMPLETION_UNCONFIRMED`, CLI exit 0. 초기 `tools:[]`, MCP `failed`, gate 상태 파일 없음. |
| 03 | 07:15:04–07:17:20 / 135.611초 | 2 / 0 / 1 | 2 / 1 | `uncertain / GATE_STOPPED`. 두 번째 응답의 `typesafe-ai/jev` 식별자가 당시 정산 허용 목록에 없어 `BUDGET_MODEL_UNSUPPORTED`; 첫 번째 `/app` 조회만 실행. |
| 04 | 07:21:46–07:33:03 / 677.362초 | 19 / 5 / 1 | 23 / 18 | `uncertain / GATE_COMPLETION_UNCONFIRMED`. act 1회는 입력 검증 거절로 추론 전 종료. 나머지 act 18회와 finish 5회는 응답·정산 완료. |

모든 시도의 결과 영수증에는 `artifact_frozen:true`, cleanup `stopped:true`, `automatic_retries:0`가 있다. 이는 당시 정지 확인이며 현재 컨테이너 존재 여부를 다시 검사한 것은 아니다. main은 04 원본 컨테이너를 정지 상태로 보존했다고 보고했다.

01의 직접 원인은 실제 자식 프로세스에서 인증을 사용할 수 없었다는 것이다. main의 [작업 기록](../WORK_LOG.md)은 사전 인증 조회와 실행 환경의 `USER/LOGNAME` 차이를 원인으로 기록하고 공통 환경으로 수정했다. 감사자는 인증을 재호출하지 않았으므로 그 구체적 환경 진단은 main의 기록, 인증 실패 자체는 원본 stream 근거로 구분한다.

02의 직접 증거는 MCP 초기화 실패다. main의 작업 기록과 `benchmark-runs/d020-orphan-lock-recovery.json`은 01 종료 후 남은 소유자 없는 예산 잠금을 원인으로 기록한다. 복구 영수증은 pending 없음·기존 348토큰 보존·새 추론 없음이며, 후속 `diagnostics/d020-mcp-probe/receipt.json`은 3개 도구 발견·0추론·잠금 해제를 확인한다. **02의 Claude 최종 서술에 있는 “act를 세 번 시도했고 alternatives 형식 오류”는 실제 도구 이벤트나 gate 기록으로 뒷받침되지 않는다.** 이를 3회 호출이나 직렬화 오류로 집계하면 안 된다.

03은 두 번째 유료 응답까지 받은 뒤 정산 guard에서 멈췄다. 이 결정의 `decision/action_started/outcome`은 없고, 후보 산출물에도 `instruction.md`만 남았다. 따라서 두 번째 쓰기 명령이 실행됐다는 증거는 없다. 뒤의 별칭 허용 및 저장 응답 정산은 새 POST가 아니며, 기존 실패 실행을 성공으로 바꾸지 않는다. 공급 경로 별칭 확인과 모델 가중치의 완전한 동일성 확인도 구별한다.

## 04 완료 판정이 멈춘 정확한 경로

| decision ID | 응답 시각 UTC | finish | continue | abstain | 반환 confidence |
|---:|---|---:|---:|---:|---:|
| 13 | 07:30:06.998 | 0.33 | 0.65 | 0.02 | 0.48 |
| 16 | 07:30:58.111 | 0.22 | 0.75 | 0.03 | 0.62 |
| 19 | 07:31:42.668 | 0.15 | 0.76 | 0.09 | 0.64 |
| 21 | 07:32:17.386 | 0.05 | 0.93 | 0.02 | 0.89 |
| 23 | 07:32:46.415 | 0.05 | 0.90 | 0.05 | 0.85 |

출처는 `benchmark-runs/e2eswe-d020-04/decisions.jsonl`의 decision 13/16/19/21/23이다. 이것은 선택 확률과 confidence의 원본 값이며 정답률·검증된 품질·실패 이유가 아니다. 다섯 번 모두 `finish` MCP 호출은 받아들여졌고 정상 응답 `continue`를 반환했다. 다섯 번의 API 오류라고 부르면 안 된다.

마지막 gate 상태는 `state:ready`, `decisions_used:23`, `actions_executed:18`, `rejections:1`, `completion_claimed:false`, `stop_code:null`, `journal_healthy:true`, `outcome_uncertain:false`였다. provider는 07:33:02.187에 정상 종료, 산출물 정지는 07:33:03.450, runner terminal은 07:33:03.480에 기록됐다. 제한은 `max_decisions:null`, wall timeout 14,400초였고 실제 실행은 약 11분 17초였다.

현재 [decision-gate.mjs](../../src/benchmark/decision-gate.mjs)는 `kind === 'finish' && choice === 'finish'`일 때만 완료 상태로 바꾼다(280–285행). [runner.mjs](../../src/benchmark/runner.mjs)는 provider가 정상 종료해도 이 완료 상태가 없으면 `GATE_COMPLETION_UNCONFIRMED`로 남긴다(157–164행). 따라서 runner는 저장된 gate 상태를 일관되게 반영했다. Claude가 CLI exit 0을 반환한 것은 작업 완료 판정의 대체 증거가 아니다.

확인된 프로토콜 한계는 다음과 같다.

- Jev 요청에는 매번 Claude가 작성한 현재 `state`만 전송된다. 원래 과제 전체, 이전 결정·출력, 누적 검증표를 호스트가 자동으로 붙이지 않는다(`decision-gate.mjs:91–103`). 마지막 state의 “Earlier evidence still applies”는 이전 state 전체를 자동 전달하지 않는다. 실제 요청의 일부분은 재요약돼 있지만 전체 누적 근거와 동일하지 않다.
- 완료 응답 계약은 `finish/continue/abstain`, 확률, confidence이며 구체적으로 부족한 요구사항이나 다음 검증 항목을 요구하지 않는다. Claude는 `continue`를 받았으나 무엇이 부족한지 공급자로부터 받지 못했다.
- 완료 판정에 실패했을 때의 명시적 `blocked/deferred` 종료 절차가 없다. 실제 Claude는 추가 자체 검증 뒤 최종 서술로 중단했고, wrapper는 이를 일반적인 `uncertain`으로 표현했다.

이 구조가 반복 판단을 비효율적으로 만들 수 있다는 것은 소스로 확인되지만, **Jev가 정확히 무엇 때문에 다섯 번 `continue`를 골랐는지는 모른다.** 응답에는 이유가 없다. 뒤의 설치 문제를 Jev가 알아챘다고 추정하거나, 진단 30/30을 근거로 다섯 판단 모두 오답이라고 단정하지 않는다. 특히 첫 continue 뒤 실제 설치 결함을 발견·수정했으므로 모든 후속 검증이 무의미했던 것도 아니다.

## 실행 중 오류와 관측의 구별

1. **입력 크기 거절:** 07:26:25.861의 `INVALID_INPUT`은 23,503바이트 command가 gate의 16,384바이트 제한을 넘은 요청이다. 실제 입력을 pure gate에 넣고 decide/execute를 가짜 함수로 바꿔 재현한 결과, 동일 오류·decision 0·model callback 0이었다. 그 긴 command만 `true`로 교체한 baseline 합성 입력은 통과했다. 실제 paid retry는 없었다. 현재 [protocol.mjs](../../src/benchmark/protocol.mjs)의 도구 schema는 이 command 바이트 제한을 설명하지 않으므로 생성 전에 제한을 알기 어렵다.
2. **자체 테스트 초기 실패:** decision 8 stdout은 `3 failed, 4 passed`이지만 명령 전체는 exit 0이다. 마지막 명령이 `pytest ... | tail -40`이고 `pipefail`이 없으므로 shell exit는 테스트의 결과를 보장하지 않는다. 이후 자체 검증은 8 passed까지 도달했다. decision 17/22의 의도적으로 실패하는 soft-assert 예제 출력은 제품 회귀 실패와 구별해야 한다.
3. **오프라인 설치 실패 및 회복:** decision 14는 plain editable install의 격리 빌드가 실패하고 import도 실패해 최종 exit 1이었다. 중간 `EXIT=0` 출력은 파이프라인 마지막 명령의 값이다. decision 15는 `setup.py`로 바꾸고 설치·자체 테스트를 회복했으며, decision 20은 두 설치 방식과 자체 8개 검증을 확인했다. 이는 살아 있는 agent 환경의 확인이고 새 verifier의 설치 인계 증거는 아니었다.

04의 명령 18개 중 17개는 shell exit 0, 1개는 exit 1이다. 이 숫자를 “테스트 17개 성공/1개 실패”로 바꾸면 안 된다. 자체 테스트 8개와 독립 평가 30개도 다른 집합이다.

## 원본 채점 실패와 설치 개입 진단

| 구분 | 입력 산출물 | 수집 / 통과 | reward / resolved | 의미 |
|---|---|---:|---|---|
| 원본 | `benchmark-runs/candidate-d020-04` | 0 / 0 | 0 / false | `setup.sh` 없음 → 설치 미실행 → `ModuleNotFoundError: pytest_check`. 30개 assertion 실패가 아니라 수집 전 설치 실패. |
| 별도 진단 | `benchmark-runs/diagnostics/candidate-d020-04-install` | 30 / 30 | 1 / true | 설치 스크립트 추가 조건에서 원본 구현 동작이 독립 평가를 통과함. 원본 제출이나 완료 상태를 교체하지 않음. |

원본 [결과 영수증](../../benchmark-runs/grade-d020-04/result.json)은 `expected_test_count:30`, `observed_test_records:0`, `expected_test_count_observed:false`이며 stdout에는 import 수집 오류, stderr에는 `bash: ./setup.sh: No such file or directory`가 있다. verifier shell이 최종 reward 파일을 쓰므로 process returncode 0이어도 채점 통과를 의미하지 않는다.

별도 [진단 영수증](../../benchmark-runs/diagnostics/grade-d020-04-install/result.json)은 같은 pinned image/source의 새 offline verifier에서 30/30을 확인한다. 두 영수증 모두 `model_calls:0`, `container_removed:true`다. 여기의 model_calls는 **채점 작업의 추론 수**이며 후보가 모델로 생성되지 않았다는 뜻이 아니다.

읽기 전용 `diff -qr` 결과 두 산출물의 유일한 차이는 진단본의 아래 `setup.sh`다. 기존 코드·테스트·패키징 파일 변경은 없었다.

```sh
#!/bin/sh
set -eu
python -m pip install --no-build-isolation --no-deps -e .
```

설치 계약을 대조하면 다음 공백이 확인된다.

- **실제로 전달된 명세:** 04 `manifest.instructions`는 upstream `instruction.md` 한 파일이다. 보존 `brief.txt`와 그 파일의 SHA256은 모두 `712095a7fe9bfb56d2a8c40a168f1df80c72f11bdf89374a5229a3b339442b7f`이다. 명세는 `setup.sh`로 설치되며 구현자는 유효하게 설치 가능한 `pyproject.toml / setup.py`만 제공하면 된다고 표현한다. public import가 맞으면 내부 배치는 자유라고 한다. 명시적으로 agent가 `setup.sh`를 작성하라는 문장이나 root package 배치 요구는 없다.
- **verifier의 실제 가정:** pinned `tests/test.sh:15–17`은 setup.sh를 agent/solve.sh가 작성했다고 가정하며 `bash ./setup.sh`를 실행한다. adapter는 `/app`와 테스트를 복사한 뒤 이 script를 실행할 뿐 설치 script를 제공하지 않는다.
- **대조군의 차이:** `adapter.py`의 `prepare_control`은 oracle과 noop 모두에 setup.sh를 직접 써 준다. 따라서 기존 oracle 30/30은 설치 script가 없는 실제 agent handoff까지 검증한 것이 아니었다. 원인을 oracle의 root layout과 후보의 src layout 차이만으로 설명하면 이 차이를 놓친다.
- 현재 README에 추가된 명시적 setup.sh/fresh verifier 규칙은 개선된 문서 계약이다. 이미 보존된 04 brief에 그런 요구가 전달됐다고 소급할 수 없다.

## 토큰·비용·예산 경계

| 범위 | Jev 실제 추론 | 응답 input / output | 설명 |
|---|---:|---:|---|
| 작은 초기 연결 확인 | 1 | 348 input | 시도 01–04 바깥의 별도 호출. dated model ID로 막힌 저장 응답을 나중에 정산. |
| 시도 01–02 | 0 | 0 / 0 | Jev 추론 시작 기록 없음. |
| 시도 03 | 2 | 2,237 / 80 | 그중 1,735 input 응답은 종료 후 저장 응답 정산. |
| 시도 04 | 23 | 21,975 / 980 | 추론 23회 모두 응답·정산 완료. |
| 공유 장부 관측 합계 | 26 | charged input 24,560 | `settled_requests:26`, `pending:null`, `blocked_code:null`. |

저장 응답 정산이나 모델 목록 조회를 inference POST에 더하지 않는다. 장부의 USD0.60/M 보수적 환산은 `24560 / 1e6 * 0.60 = USD0.014736`이며 예산 예약 통제를 위한 값이다. main의 현재 월 구독 USD29/60M 표시 방식으로 같은 입력량을 배분하면 `24560 / 60e6 * 29 = USD0.0118706667`이다. 이 두 계산은 실제 추가 청구액이나 invoice가 아니다. 공식 단가·플랜 출처와 UI 가격 계산은 별도 pricing 작업의 책임이며 이 문서는 새 가격 조사를 수행하지 않았다.

04 Claude 영수증은 input 52, cache creation 84,670, cache read 1,488,059, output 52,563이며 thinking 16,020은 output의 부분집합이다. CLI `costBasis:list`의 reported USD2.0264398은 Jev USD1 장부와 별개이며 실제 청구 증거가 아니다. 01–03의 CLI reported 값은 각각 USD0, USD0.07146, USD0.4461944다. 04의 고유 assistant message ID 26개도 Claude HTTP 호출 26회로 확정하지 않는다.

## 다음 실행 전 권고

1. **설치 인계부터 고정한다.** 빈 agent 환경에 표준 offline setup.sh를 일관되게 제공하거나, 작성 책임·실행 위치·fresh verifier 재설치를 실행 전 명시한다. oracle과 일반 제출을 같은 설치 계약으로 확인한다. 특정 hidden assertion을 prompt에 넣을 필요는 없다. 이 변경 뒤의 실행은 새 attempt로 기록한다.
2. **완료 판단 입력을 자기완결적으로 만든다.** 명세 식별자/요구사항, 완료 증거, 최근 실제 검증 결과, 설치 handoff 상태를 구조화한다. 과거 state에 대한 자연어 참조만으로 누적 근거가 전달됐다고 취급하지 않는다. 모델의 이진 완료 판단과 결정적 설치·수집 확인을 별도 단계로 둔다.
3. **continue의 회복 경로와 종료 유형을 정한다.** 지원되는 응답 계약 안에서 부족한 검증 항목을 식별할 수 있게 하거나, 구체적 다음 근거를 만들 수 없을 때 `completion_not_accepted/blocked`를 명시적으로 반환한다. 승인 없는 강제 finish나 무한 반복을 추가하지 않는다. 실제 응답 원인 미상은 그대로 보존한다.
4. **입력 제한을 사전에 공개한다.** command/state/전체 입력의 byte 제한을 schema 설명과 안전한 validation code로 알려 준다. 23KB 코드를 생성한 뒤 `INVALID_INPUT` 한 단어를 받는 비용을 줄인다.
5. **검증 결과를 shell exit와 분리한다.** pytest/pip 결과를 보존하고 pipeline이라면 각 실행 상태를 구조적으로 기록한다. 예상 실패 예제, 자체 테스트, 독립 채점, 원본과 개입 진단의 숫자를 혼합하지 않는다.

## 재현과 검증 기록

이번 감사에서 수행한 검증은 모델/컨테이너를 실행하지 않는 아래 작업이다.

- 원본 JSON/JSONL을 읽어 이벤트별 count와 실제 `tool_use`를 교차 집계. 04는 inference started/finished/settled 각 23, act 19/finish 5/status 1, 실행 명령 18, 거절 1로 일치.
- `createDecisionGate`에 실제 23,503바이트 입력을 전달하되 모든 record/decide/execute를 메모리 가짜 함수로 대체. 결과 `INVALID_INPUT`, decision 0, model callback 0. 해당 긴 command만 `true`로 바꾼 baseline 입력은 synthetic execute 1회로 통과. 실제 command는 실행하지 않음.
- `shasum -a 256 benchmark-runs/e2eswe-d020-04/brief.txt .benchmarks/E2E-SWE/tasks/pytest-check/instruction.md`: 해시 일치.
- `diff -qr benchmark-runs/candidate-d020-04 benchmark-runs/diagnostics/candidate-d020-04-install`: `Only in ...-install: setup.sh` 하나만 출력(exit 1은 그 파일 차이).
- 원본·진단 `result.json`, `verifier.stdout.log`, 원본 `verifier.stderr.log` 대조: 원본 수집 0/reward 0, 설치 개입 진단 30/30/reward 1. 감사자가 graded command를 재실행하지 않음.

보존해야 할 상태: 원본 04 실행은 완료 미확인, 원본 점수는 0, 설치 개입 진단은 30/30. 이는 단일 과제의 결과이며 Jev 사용의 생산성 향상이나 baseline 대비 효과를 입증하지 않는다.
