# D-023 Claude 직접 판단 vs Jev 사용 — 첫 속도 비교

2026-10-09. 사용자 요청에 따라 D-022 성공실행과 새 structured baseline을 비교했다. 각조건1회, 순차/비동시, 다른생성물이다. 인과효과·통계적유의성·일반성능주장이아니다.

## 측정 결과

| 항목 | Claude 직접 판단 | Claude + Jev |
|---|---:|---:|
| 실행 | e2eswe-d023-baseline-01 | e2eswe-d022-05 |
| runner duration |197.515초|250.725초|
| provider 구간 |195.183초|248.062초|
| 독립채점 |30/30, reward1|30/30, reward1|
| 실행명령 |7|7|
| 완료요청 |1|4 (continue3→finish1)|
| Claude출력토큰 |20883|26017|
| Claude보고API환산USD |0.7803908|0.9822906|

시간차53.210초. Jev쪽시간/Claude쪽시간=250.725/197.515=1.269397.
Jev추가시간비율=(250.725−197.515)/197.515=26.94% (분모Claude).
반대로Claude시간감소율=53.210/250.725=21.22% (분모Jev). 두비율을같은분모로오해하지않는다.
가격은API환산이며구독추가청구가아니다. Jev 및 별도monitor비용을위Claude행에합치지않았다.

## 무엇을 맞췄는가

같은원명세+artifact-contract, brief SHA256 c44fd75df1f62dd58f6ed8d24d6d546752270f59dde2ad472b958ffc1afe8b8e.
Opus5.5/effortmedium/CLI2.1.293/인증방식/도구제약/이미지digest가실제preflight기록에서일치한다.
baseline은같은후보구조에서Claude가selected_id를반환한다. 자유로운nativeClaudeCLI와동일하지않다.
완료는baseline에서Claude의finish호출자체를완료주장으로수락하고Jev조건은별도Jev승인을요구한다.
따라서현재제품workflow비교이며완전히동일한개별질문의순수모델반응시간비교는아니다.
별도Opusmonitor는양쪽실행했으나별도프로세스의종료대기는runner시간에포함하지않는다.

runner시간은사전확인/Claude작업/산출물정지까지이며Docker최초생성·사후독립grade는제외한다.
독립grade는baseline7.122초/Jev3.559초였고각각verifier제거확인. 설치/테스트모두성공.

## Jev 응답 지연과 판단 전달 구간

11개의 저장된 receipt.durationMs: 평균645.091ms, 중앙606ms, 최소418ms, 최대1127ms, 합계7096ms.
전송HTTP왕복지연이며서비스내부추론시간만의측정이아니다. 질문생성/잔액조회/사전예약은제외된다.
input이gate에기록된시점부터decision확정기록까지합계13710ms(평균1246.36ms)로잔액조회·예산·기록도포함한다.
Claudebaseline동일gate구간합계165ms는이미Claude가selected_id를생성한뒤의처리시간이므로
Claude의판단속도로비교하면안된다. Claude내부선택시간은코드·질문생성과분리계측되지않았다.

관측상Jev조건은완료요청이더많고Claude출력도더길었다. 원명령실행합계는Jev12.264초,
baseline16.676초로오히려baseline쪽이길었다. 53.210초차이를API지연7.096초만으로설명할수없다.
질문준비/생성길이/완료반복/모델서비스및호스트상태가섞여있고각원인의효과는분리측정하지않았다.
전체시간은Jev쪽이더길었지만이를항상더느리다는결론으로일반화하지않는다.

## 근거와 재현

- [계산스크립트](../../benchmark-runs/diagnostics/d023-compare.mjs): repo에서 `node benchmark-runs/diagnostics/d023-compare.mjs` 실행. 읽기전용원본에서비교JSON생성,추론없음.
- [비교JSON](../../benchmark-runs/diagnostics/d023-comparison.json), [Jev판단별시간](../../benchmark-runs/diagnostics/d023-jev-timing.json).
- [baseline실행](../../benchmark-runs/e2eswe-d023-baseline-01/result.json), [baseline채점](../../benchmark-runs/grade-d023-baseline-01/result.json).
- [Jev실행](../../benchmark-runs/e2eswe-d022-05/result.json), [Jev채점](../../benchmark-runs/grade-d022-05/result.json).

계산초안에서manifest의actual_image_id가둘다null인데같다고판정하는검증오류를발견했다.
최종계산은preflight의실제imageID를사용하고문자열존재까지검사한다. 최종brief/image/CLI/model/effort일치확인.
새구현소스변경없음. 설정validate/실행/원본export/독립grade모두exit0. 전체npm회귀는재실행하지않음.

다음측정은동일판단자료를두모델에주는고정질문실험(순수결정반응시간), 여러과제/반복의전체workflow실험을분리해야한다. 이번에는추가반복하지않았다. baselineJevPOST0, 기존USD1장부미변경, 기존PersonalOS미변경. 구현컨테이너정지보존/verifier제거/대시보드유지/로컬미커밋.
