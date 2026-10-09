# D025 — checkpoint 재측정과 비용 분석

2026-10-09. 동일 E2E-SWE pytest-check 목표·설치 계약, 이미지, CLI2.1.293, Opus5.5 medium에서 새 checkpoint baseline/Jev 각1회 순차 실행했다. 모든 일치 항목은 실제 preflight로 대조했다. **이번에는 호출 수를 줄였지만 전체 시간·비용·독립 성공률 개선을 확인하지 못했다.**

## 실측

| 항목 | Claude checkpoint baseline | Jev checkpoint |
|---|---:|---:|
| Runner 전체 시간 |251.640초|287.182초|
| 독립 원본 채점 |30/30, reward1|29/30, reward0|
| 역할 선택 / 명령 / 완료 요청 |2 / 9 / 1|2 / 9 / 1|
| 입력 거절 후 재작성 |1|1|
| Jev POST |0|3|
| Claude 입력 토큰 |30|28|
| Claude 출력 토큰 (thinking 포함) |28,688|32,540|
| Claude cache write (1h) |51,868|57,325|
| Claude cache read |383,682|424,381|
| Jev 입력 / 출력 |0 / 0|20,210 / 126|
| 구현 Claude API 환산 USD |1.0655604|1.1943882|
| Jev 월 구독 배분 USD |0|0.0097681667|
| 구현+Jev 환산합계 USD |1.0655604|1.2041563667|
| 별도 Opus monitor 세션 |8|7|
| monitor API 환산 USD |0.633424|0.605926|
| monitor 포함 환산합계 USD |1.6989844|1.8100823667|

Jev 시간 증가=(287.182−251.640)/251.640=14.1241%, 분모 baseline.
모니터 제외 환산 비용 증가=(1.2041563667−1.0655604)/1.0655604=13.0069%.
모니터 포함 환산 비용 증가는6.5391%. 서로 다른 비용 기준의 분석용 합계이며 현금 추가 청구액이 아니다.

Runner 시간은 preflight/Claude 실행/정지까지이며 초기 컨테이너 준비·사후 채점·모니터 종료대기는 제외한다. 채점은4.215초/3.977초로 분리된다. Claude CLI 세션은각1회, 네트워크 실제HTTP시도수는미확인. assistant message수는HTTP호출수와같지않다.

## 호출 감소와 전체 효율이 달랐던 이유

이전 Jev 성공본 D022는11POST/13,314입력토큰/250.725초였다. 이번은3POST로72.73%줄었지만, 전체목표와실제명령근거를보내입력은20,210으로51.80%늘었다. 월배분 비용도USD0.0064351→0.0097682로늘었다. 호출 수만 비용 지표로 쓰면 안 된다. 과거와새구조가다르므로이차이를Jev단독인과효과로해석하지않는다.

이번 Jev HTTP합계는1.964초, 예산조회/기록을포함한판단전달구간은4.047초다. baseline대응구간은0.053초이지만Claude가이미선택한뒤이므로순수판단시간이아니다. 명령실행합계는13.354초/14.918초다. 전체차35.542초에서전달차3.994초와명령차1.564초를빼면29.984초가남는다. 이잔여는Claude생성/제공자대기/기타처리가섞여있어추론시간으로단정하지않는다.

양쪽모두명령UTF8한도16,384bytes를넘겨거절됐다(baseline18,665/Jev20,798bytes). 이후파일을나누어다시생성했다. 이재생성도원시stream과전체시간에포함한다. 새schema에한도가명시되지않아생성전에알기어려웠던실행기계약문제다. 이번실험중한쪽만수정하지않았다. 고정프롬프트조건확인과별개로생성코드/내부추론/서비스상태는동일하지않다.

역할을선택한뒤명령마다Jev를부르지않는경로는실제로작동했다. 그러나현재checkpoint역할은같은Claude세션의범위이며별도native subagent를매번생성하지않는다. 역할선택만옮겨도코드설계·테스트작성의Claude판단은남는다. 그부분의감소는이번측정으로입증되지않았다.

## 독립 채점 실패와 완료 판단 한계

실패는 `TestReportingControls::test_exitfirst_stops_on_first_failed_check` 하나다. 테스트는 `-x`에서즉시멈추는동작과 `Failed Checks: 1` 출력둘다요구했다. 실제출력은일반AssertionError만있었다.

생성본 `src/pytest_check/check_log.py`의 `log_failure`는 `_stop_on_fail`이면 `_num_failures += 1` 이전에raise한다. plugin의reporthook은num==0일때return하므로실패횟수보고가생략된다. 생성된자체 `tests/test_plugin.py`의 `-x` 확인은failed=1만assert했고보고문구를검사하지않았다. 따라서자체테스트통과와Jevfinish승인이원본30개검사완성을보장하지못했다. 원문은일반실패보고와`-x`중단을나누어설명하므로, 이교차조건을명확히한검증근거가필요하다.

Jev는전체목표/명령근거/자체테스트요약을받고finish를선택했다. 그확률·confidence는독립정답확률로간주하지않는다. benchmark reward는0이며29/30=96.67%를benchmark성공점수로바꾸지않는다. 원본은패치하거나재채점하지않았다.

## 가격과 예산

Opus5.5 공식USD/M: input4, output20, cache read0.20, 5m write5,1h write8. 이번write는관측된1h TTL만적용했다. 2026-10-09 [공식가격표](https://platform.claude.com/docs/en/about-claude/pricing)를재확인했고API환산과CLI보고액이일치한다.

Jev는이전에확인한현재Creator월29USD/60M잔액배분기준을유지한다: paidInputTokensUsed×29/60M. [공식가격페이지](https://jev-ai.pro/pricing)는출력무료·모델배율·토큰과금과보수적0.60USD/M팩단가를재확인했다. 이번크롤러의기본화면은token packs이며월요금계정플랜을새로조회한것은아니다.

이번 Jev3회/20,210잔액입력토큰의보수적예산사용은USD0.012126. 공유누적46회/66,715토큰/USD0.040029<1, pending/blocked없음. 월구독배분과예산환산을서로추가과금으로합산하지않는다. Docker로컬컴퓨팅·Codex개발작업비·D024규칙생성준비비는위반복실행비에포함하지않았고실제총청구액은미확인이다.

## 재현과 근거

저장소루트에서수행한명령:

```sh
node bin/paired-run.mjs --config benchmark-runs/d025-baseline-01.json --spend
node bin/paired-run.mjs --config benchmark-runs/d025-jev-01.json --spend
/opt/homebrew/bin/python3.14 benchmarks/e2e-swe/adapter.py grade --workspace benchmark-runs/candidate-d025-baseline-01 --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/grade-d025-baseline-01
/opt/homebrew/bin/python3.14 benchmarks/e2e-swe/adapter.py grade --workspace benchmark-runs/candidate-d025-jev-01 --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/grade-d025-jev-01
node scripts/compare-checkpoint-runs.mjs benchmark-runs/d025-comparison-v2.json
```

유료명령은이미수행했으므로재실행하지않는다. 읽기전용비교스크립트는새출력경로로재계산가능하다. [계산결과](../../benchmark-runs/d025-comparison-v2.json), [Jev질문·응답](../../benchmark-runs/e2eswe-d025-jev-01/decisions.jsonl), [실패로그](../../benchmark-runs/grade-d025-jev-01/verifier.stdout.log), [판단관리문서](../decisions/D025.md).

최종 npm test343/343. 개발검증중workflow알수없는값이거절되지않는연결누락을새테스트가발견했고유료실행전에수정했다. 비용검토에서는미종료요청을0으로합산하거나null credits를0으로변환할수있던검증결함을수정했다. 후속3개부정대조를포함한전체343개가통과했다. 형식검사/모의검사는생성산출물의30개독립검사를대체하지않는다.

다음개선후보(이번측정에미적용): 명령한도를생성전에표시, 요구사항별근거ID/교차조건검사, 전체명령본문을매판단에반복하지않는근거전달, 모니터의고비용해석호출조건조정. 새로운구조는재측정이필요하며추가유료반복은이번보고에포함하지않았다.
