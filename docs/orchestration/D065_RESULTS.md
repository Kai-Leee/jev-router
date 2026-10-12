# D065 — 실제 DAG 실행과 테스트 정리 결과

2026-10-11 (Asia/Seoul). [실행 전 프로토콜](D065_EXPERIMENT.md), [구현](D065_IMPLEMENTATION.md), [역할 계약](../agents/D065_PARALLEL.md), [독립 검토](../agents/D065_REVIEW.md).

실제 Jev 선택에서 계획 저장·파일별 Claude 실행·버전 고정·의존 작업 해제·Docker 공개 검사까지 연결했다. 생성 파일16개와 준비 검사16개는 완료됐다. 제품 완료는 실패했다. 원본 실행은 공개 실패 보고서를 실행기가 거부해 `uncertain / DAG_PUBLIC_EVIDENCE_INVALID`로 끝났고, 독립 제품 채점은63개 중62개 통과·1개 실패였다. 성공 완료시간은 `null`이다. 원본 후보를 고치거나 같은 유료 실행을 반복하지 않았다.

## 삭제한 테스트와 추가한 검증의 분모

| 대상 | 변경 전 | 변경 후 |
|---|---:|---:|
| 정리 대상4개 파일의 테스트 정의 | 74 | 58 |
| 같은4개 파일의 최종 줄 수 | 1,186 | 987 |
| 같은4개 파일의 최종 바이트 | 68,689 | 58,618 |
| 공개 ID의 실행 가능한 mapping | 36/85 | 85/85 |
| 전체 Node 회귀 정의 | 993 | 1,009 |

정리 대상은 `test/d056-review.test.mjs`, `test/planning-state-codec.test.mjs`, `test/recursive-task-tests.test.mjs`, `test/dag-public-checks.test.mjs`다. 처음 세 파일에서12개, 공개 검사 파일에서4개 정의를 통합했다. 런타임16개·의미 핸들러8개·러너8개를 추가했으므로 전체 정의 수는 늘었다. 삭제와 전체 수의 분모를 섞지 않는다.

명령은 `sg --lang javascript --pattern 'test($NAME, $$$ARGS)' --json=compact`와 실제 파일 바이트 집계다. 정리 직후에는982줄·58,088바이트였고, 실제 설치 위치 오탐의 회귀 증거를 기존 공개 검사 안에5줄·530바이트 추가했다. 따라서 최종 감소는16개 정의·199줄·10,071바이트다. [최종 집계](../../benchmark-runs/d065-local/test-trim-final.json), [정리 직후 집계](../../benchmark-runs/d065-local/test-trim-combined.json), [삭제 지도](../../benchmark-runs/d065-test-trim/removal-map.json), [공개 통합 지도](../../benchmark-runs/d065-preflight/public-test-consolidation.json). 시간 측정은 병렬 부하가 달라 삭제의 속도 개선 증거로 쓰지 않는다.

초기 삭제에서 같은 형식의 oracle 의미 변조·일부 의무 누락 반례가 빠졌고, 공개 mapping의 고유 오류 대조도 부족했다. 독립 검토 후 남은 정의 안에 복원했다. 실험 전 `npm test`는1,009/1,009 통과, 실패·skip0,21,591.247917ms였다([명령·요약](../../benchmark-runs/d065-local/regression-summary.json), [원본 로그](../../benchmark-runs/d065-local/regression.log)). 이 통과가 이후 실제 후보에서 발견한 보고서 처리 문제까지 검증했다는 뜻은 아니다.

## 공개 검사, 실제 후보, 독립 채점

고정 환경의 작성 대조군은7개 suite, 정상85/85·assertion2,216개·의도한 결함81/81 검출이다. 전체 배치342.3666초, 컨테이너 제거 확인. 검사 소스31개와 전체 공개 디렉터리42개 파일을 동결했다([원본](../../benchmarks/e2e-swe/public-checks/results/d065-local-controls.json), [최종 요약](../../benchmark-runs/d065-preflight/public-final-summary.json)). 초기 tmpfs 실행 권한·재사용 출력 경로 실패와 첫 성공 배치도 별도로 보존했다.

실제 실행에서는 정상 대조85개를 재검사한 뒤 추론을 시작했다. 실제 후보의 원본 workflow 결과는 다음과 같다.

- 파일 생성과 구문/존재 준비 검사:16/16 완료.
- 유효한 공개 증거로 수락된4개 suite:36/36 사례 통과, assertion290개.
- 다섯 번째 `public.schema-models` 원시 보고서:17개 중15개 통과·2개 실패, assertion233개. `T.R04.06`과 `T.R10.03`이 `SyntaxError: named arguments must follow bare * (read_status.py, line 17)`로 실패했다. 후자는 import 단계에서 실패해 assertion0개였다.
- 실행기는 모든 case가 assertion1개 이상이어야 한다고 검사해 이 명확한 실패를 `DAG_PUBLIC_EVIDENCE_INVALID`로 거부했다. 컨테이너는 실제 제거됐고 원시 보고서는 `outcome_uncertain:false`였다. 제품 결함과 실행기 분류 결함이 함께 발견된 것이다.
- 원본 실행은 이후 HTTP17개·CLI/설정/환경15개를 실행하지 않았다. 후속 진단은 별도 기록이며 원본 workflow 성공으로 합치지 않는다.
- 독립 채점:63개 중62개 통과·1개 실패, skip/pending0, reward0, resolved=false. 후보 전후 해시가 같고, 독립 Docker 컨테이너 제거를 확인했다. 실패한 숨김 항목의 내용을 읽어 수정에 사용하지 않았다. 공개 SyntaxError와 같은 실패라고 단정하지 않는다.

원본 [실행 결과](../../benchmark-runs/d065-live-01/result.json), [공개 실패 원시 process](../../benchmark-runs/d065-live-01/calls/check-9d41616a-b908-4b25-8306-a88bebf8fc8a.process.json), [독립 채점](../../benchmark-runs/d065-live-01/grade/result.json), [후보 동결·채점 경계](../../benchmark-runs/d065-live-01/independent-evaluation.json).

원본 종료 후 두 누락 suite만 같은 후보·같은 고정 checker로 실행했다. 합계90.924초, 모델 호출0, 후보16개·검사 snapshot43개·공개 디렉터리42개·선택한 원본 기록7개의 전후 해시 동일, 두 컨테이너 제거 확인이다. [명령과 진단 결과](../../benchmark-runs/d065-postcheck/result.json), [담당 기록](../agents/D065_PUBLIC_CHECKS.md).

- HTTP: 생성된 `list_records.py:17`의 같은 문법 오류로 초기화 중단. 사례0개·assertion0개,17개 모두 미실행이다. 17개 실패 사례로 계산하지 않는다.
- CLI/설정/환경:15개 중8개 통과·7개 실패, assertion1,073개. 5개는 생성 코드 문법 오류,2개는 설치 원본 위치 assertion 실패다. 뒤의2개는 별도 검사기 결함 조사 대상으로 분리했다. 최종 정정은 아래 기록을 따른다.

이 진단을 원본 실행의 정상 재개나 전체 공개 검사 완료로 합치지 않는다. 독립63개 채점과 공개85개 검사는 서로 다른 분모다.

## Jev가 실제로 결정하고 실행한 것

Jev는 첫 choice에서 작업자2명을 선택하고, 이어16회 choice로 고정된16개 파일의 담당자를 골랐다. 각 담당자에게8개씩 배정됐다. 모든 요청의 model은 `jev-latest`, 실제 목적지는 `https://jev-ai.pro/api/v1/systemone`이다. 응답 model 표기는 `typesafe-ai/jev`10회, `jev-1.13.0`7회였다. 둘이 동일 backend 버전인지 확인되지 않아 표기를 그대로 보존한다.

각 선택은 배정→실행 plan의 worker와 일치했다. 분할 핸들러는 `d065-prepared-v1`을 `d065-prepared-v1.semantic-1`로 바꾸며 준비된 배정을 저장했다. 이는 로컬 분할 적용이고 별도의 Jev 자유 분해 응답은 아니다. 관계·프로필·수리 핸들러의 로컬 검증은 했지만 이번 유료 조건에서 추가 호출하지 않았다. 실제 작업자 모델은16/16회 `claude-opus-5-5`, effort medium, 동시 실행 최대2였다.

담당자 ID는 스케줄 자원이다. 모든 파일이 새로운 CLI 세션이므로 담당자2명 선택이16개 호출 수를 줄이거나 세션 문맥을 공유하게 하지 않는다. 소유권 잠금이 실제 실행 순서를 바꾼 사례와 선행 공개 후 소비를 [중간 감사](../../benchmark-runs/d065-review/live-provisional-01.json), [종료 감사](../../benchmark-runs/d065-review/live-terminal-01.json)에 남겼다.

## 시간과 비용

| 구간 | 실측 | 경계 |
|---|---:|---|
| 전체 원본 시도 | 1,196.515초 | 사전 검사부터 terminal·정리까지; 실패한 시도 |
| 사전 검사·소스 준비 | 93.275초 | run 시작부터 첫 Jev 호출 기록 |
| Jev 배정·계획 저장 | 28.866초 | count·owner 선택과 semantic commit 준비 |
| Jev HTTP 응답 시간 합 | 14.002초 | 응답 receipt의 durationMs17개 합 |
| Jev 호출 wrapper 시간 합 | 27.092초 | budget·계측 등을 포함한 call receipt 합 |
| Claude 생성 관측 구간 | 910.471초 | 첫 시작부터 마지막 종료까지 |
| Claude 호출 시간 합 | 1,591.594초 | 병렬16회 합; elapsed와 다름 |
| 원본 공개 검증 구간 | 156.189초 | verify-public 시작부터 실패까지 |
| 별도 독립 채점 | 48.615초 | 채점 subprocess 호출; 대기 간격91.104초 별도 |
| 별도 Opus 모니터 | 38.277초 | 도구 없는1회 검토 |

겹치는 구간을 합산하지 않는다. 고정 Docker 이미지 identity 재확인75회의 합25.266초는 위 전체 시간에 이미 포함된다. 이는 `docker image inspect` 구간이며 파일/검사 소스 해시 감사 시간은 별도로 분리 계측하지 않았다. 모든 task duration 추정이 미정이므로 예상 임계 경로 시간은 `null`이다. 성공 완료가 아니고 조건도 하나이므로 Claude 단독 대비 속도 개선율을 계산하지 않는다. controller 개발·로컬 검증 시간도 위 runtime 수치 밖이다. [기계 집계](../../benchmark-runs/d065-live-01/terminal-analysis.json), [시각 경계](../../benchmark-runs/d065-live-01/phase-boundaries.json).

| 역할 | 호출 | 일반 입력 | 캐시 생성 | 캐시 읽기 | 출력 | USD 환산 |
|---|---:|---:|---:|---:|---:|---:|
| Jev 판단 | 17 | 229,540 | 해당 없음 | 해당 없음 | 823 | 0.137724 |
| Claude 구현 | 16 CLI | 112 | 704,414 | 1,641,564 | 183,530 | 9.6346728 |
| 별도 Opus 모니터 | 1 CLI | 2 | 70,239 | 0 | 3,753 | 0.636980 |

Jev는 [공식 토큰팩 가격](https://jev-ai.pro/pricing)15M/$9, 즉 $0.60/M 입력으로 환산했다. Claude는 각 최종 CLI receipt의 API 환산을 합산했다. 구현 환산 합계$9.7723968, 모니터 포함$10.4093768이며 월 구독의 실제 청구액은 모두 `null`이다. 이 값은 계측한 실험·모니터 호출의 합이며, 현재 대화와 개발 서브에이전트의 비용은 계측되지 않아 포함하지 않는다. 캐시 토큰을 일반 입력이나 출력에 다시 더해 청구하지 않는다. CLI 호출 수는 내부 HTTP 요청 수와 다르다.

누적 Jev 장부는7,404,202→7,633,742/10,000,000 입력 토큰으로 증가했다. 차이229,540이 이번17회 사용량과 일치하며 남은 입력2,366,258, pending0이다. 예산을 초기화하지 않았다.

## 후속 정정과 해석 한계

실행기 담당은 실패 case의 assertion0을 허용하되 통과 case의 assertion≥1·전체 ID 일치·상태/exit·불확실성 검사를 유지하도록 수정했다. 같은 원시 보고서를 실제 파일 런타임/gate에 주입한 별도 무모델 재생은 `failed / ARTIFACT_CHECK_NOT_PASSED`, journal unresolved0으로 끝났다. 원본 실행·후보는 그대로다. [정정 재생](../../benchmark-runs/d065-report-fix/replay-result.json), [독립 검토](../../benchmark-runs/d065-review/report-correction-final-audit.json). 이 첫 수정 뒤 `npm test`는1,009/1,009·실패/skip0·17,493.228958ms였다([로그·해시 요약](../../benchmark-runs/d065-local/regression-after-report-fix-summary.json)).

HTTP 후속 진단은 다른 실패 형태도 드러냈다. suite 초기화 오류의 완전한 보고서에는 cases0·assertion0·명시적 미실행17개와 구조화된 오류가 있었지만 실행기가 이를 다시 malformed로 거부했다. 두 번째 수정은 정확한 검사 ID/버전/환경·exit1·명확한 failed·오류·전체 미실행 목록이 일치하는 초기화 실패만 알려진 실패로 반환한다. 일반적인 누락/부분 보고서를 허용한 것이 아니다. [보존 보고서 재생](../../benchmark-runs/d065-init-report-fix/replay-result.json)은42개 journal·미확정0·검사 실패로 끝났고, [독립 검토](../../benchmark-runs/d065-review/init-report-correction-audit.json)는 실제 보고서의6개 변형 검사와16개 동일 revision을 확인했다. 모델·후보 실행·새 컨테이너는0이며 주입한 프로세스 응답을 새 Docker 실행으로 표현하지 않는다.

설치 원본 위치 검사2건도 검사기 오탐이었다. 같은 설치된 venv와 callable을 조회할 때 상속된 `/candidate` 작업 폴더에서는 그 폴더의 소스가 먼저 import되고, 비어 있는 중립 폴더에서는 실제 editable 설치본의 소스가 확인됐다. 기존 v2는 두 정상 사례를7/15 assertions 지점에서 잘못 거부했다. 중립 폴더에서 metadata를 조회하도록 고친 v3는 같은 원본 후보의 두 사례를 통과시켰다. 반대로 disposable 설치 정보가 실제 foreign callable을 가리키는 결함은 두 사례에서 계속 거부됐다. 설치 출처 조건을 삭제하거나 후보를 고친 것이 아니다. 담당의 실제 컨테이너 재현과 독립 검토는 [공개 검사 기록](../agents/D065_PUBLIC_CHECKS.md), [검토 기록](../agents/D065_REVIEW.md)에 있다.

수정 전 재현15.067초, 수정 후 정상/foreign-origin 재현35.440초이며 모두 컨테이너 제거를 확인했다. 처음 일회성 진단 launcher가 `python3` 실행 인자를 빠뜨려 exit255로 실패한 기록도 남겼다. 이는 후보 실패가 아닌 측정 도구 오류다. 이후 정상 재현과 섞지 않는다. 기존 v2 전체 대조가 통과했어도 이런 실제 작업 폴더 차이를 잡지 못했다는 점이 별도 발견이다. v3의 기존 CLI 대조군을 실제 패키지가 있는 폴더에서 실행하도록 바꾸어 같은 반례를 기존 검사 안에 넣었다.

최종 v3의 필요한 전체 대조를 한 번 갱신했다. 정상85/85·assertion2,216개·의도한 결함81/81 검출,297.635555초, 컨테이너 제거 확인이다. [v3 원본 영수증](../../benchmarks/e2e-swe/public-checks/results/d065-local-controls-v3.json), [명령·검증 요약](../../benchmark-runs/d065-postcheck/entrypoint-origin-v3-final-summary.json), [독립 최종 감사](../../benchmark-runs/d065-review/public-v3-final-audit.json). 소스31개·공개 디렉터리43개가 최종 고정본과 일치하며, 원본 실행의69개 snapshot과 v2 영수증도 그대로다. 현재 소스의8개 차이는 종료 후 수정으로 구분된다. 전체 실제 후보를 v3로 다시 실행한 결과가 아니다.

마지막 `npm test`는 **1,009/1,009 통과·실패/skip0·18,133.867375ms**였다([명령·소스 단계·해시](../../benchmark-runs/d065-local/regression-final-summary.json), [로그](../../benchmark-runs/d065-local/regression-final-authorized.log)). 첫 최종 실행은 샌드박스에서127.0.0.1 서버를 열지 못해997/1,009 통과·12개 `listen EPERM` 실패였다([보존 로그](../../benchmark-runs/d065-local/regression-final.log)). 소스 변경 없이 로컬 listener 권한을 확보해 동일 suite를 재실행했다. 이는 유료 모델 재시도나 실패 테스트 삭제가 아니다.

첫 종료 분석은 `DAG_EVENT_ORDER`로 실패했다. 병렬 runtime이 감사·게시를 기다리는 동안 이벤트 저장 순서와 scheduler의 발생 시각이4곳에서 뒤바뀌었기 때문이다. 실패 로그와 초기 분석기를 보존하고, 파생 화면에만 `at_ms` 정렬을 적용했다. 원본 인덱스·해시·역전 쌍을 [순서 기록](../../benchmark-runs/d065-live-01/dag-projection-order.json)에 남겼다. 정렬한 task 완료 시각만으로 durable publication을 증명하지 않으며, 실제 공개·소비 순서는 runtime journal과 provider receipts로 확인한다. [DAG 화면](../../benchmark-runs/d065-live-01/dag-observation.html)은 종료 스냅샷이고 기존8787 화면의 실시간 연결은 아니다.

별도 [Opus 모니터](../../benchmark-runs/d065-monitor-01/result.json)는 실패 판정과 주요 사용량을 확인했다. 중첩된 status 범위, controller가 붙이는 revision 형식, host bytecode 파일명에 관한 일부 해석은 root가 원본과 대조해 정정했다([모니터 대조](../../benchmark-runs/d065-live-01/monitor-review.json)). 모니터의 설명 자체를 독립된 사실 증거로 승격하지 않는다.

관측한 제품 결함은 매개변수가 없는 엔드포인트의 생성 구문이다. 후보의 `pyclientgen/gen_endpoints.py`에서 `_signature_lines`가 항상 `*,`부터 만들고 `_get_kwargs_lines`는 client를 제외하므로, 인자가 없는 endpoint에서 `def _get_kwargs(*,):`에 해당하는 잘못된 구문이 생성된다. 생성기 소스 자체의 Python 구문 검사는 통과할 수 있으므로, 파일 준비 검사 통과와 실제 생성 결과의 import 검사는 구별해야 한다. 독립 채점의 다른 실패 원인까지 모두 확인했다는 뜻은 아니다.

자유 재귀 분해·관계 판단의 실제 호출, 동적 모델/노력도 선택, public 실패 후 자동 수리, 성공 조건을 맞춘 성능 비교는 이번에 측정하지 않았다. 다음 구현의 초점은 생성 결과의 import/공개 경계 검사를 해당 생산 작업의 완료 조건에 연결하는 것이다. 생성기 소스 구문만 통과한 파일을 의미 검증 완료로 취급하지 않는다. 새 유료 조건과 원본 후보 수리는 자동 시작하지 않았다.

기존 원본 Personal OS/Vault·전역 스킬·Git 원격은 변경하지 않았다. [종료 보존 검사](../../benchmark-runs/d065-local/final-preservation.json)는 기존 핵심 소스10개가 그대로이고 누적 장부를 초기화하지 않았음을 기록한다. [컨테이너 목록](../../benchmark-runs/d065-local/containers-final.json)에 이번 D065/DAG 컨테이너는 없으며 기존 실행 중3개는 유지됐다. 이전 실험의 종료 컨테이너 등 다른22개 목록은 삭제하지 않았다. 소스·문서·후보·실행 원본과 진단 자료는 로컬 미커밋으로 보존한다.
