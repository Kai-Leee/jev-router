# D092 — 제공 모델·노력도와 실측 공개 성과 기반 라우팅

2026-10-17 KST. high 고정을 제거하고 앱이 실제 제공하는 모델×노력도를 Jev의 한 Choice 선택지로 연결했다. 과거 공개 검사 성과와 수리 비용을 함께 입력한다. D091 및 과거 결과·프로필 v1·gateway v7/v8은 보존한다. [실행 역할](../agents/D092_EFFORT_HISTORY.md), [기록](../decisions/D092.md), [과거 실패·해결 분석](D092_FAILURE_HISTORY.md).

새 정책은 로컬 실험용이다. 구현·로컬 검사와 실제 Jev 선택을 구분하고, 새 정책의 전체 개발 완료율·시간·비용·재호출 감소는 아직 미측정이다. 기존 실험을 성공 사례로 다시 표기하지 않는다.

## 무엇을 선택하는가

추론 없는 앱 `model/list`를 내장 CLI 0.162.0-alpha.17.2에서 조회했다. 등록 모델 4개와 어댑터 지원 노력도를 실제 목록과 교차해 23개 조합을 얻었다.

| 모델 | 실제 제공 노력도 | 선택지 수 |
|---|---|---:|
| gpt-6.1-sol | low, medium, high, xhigh, max, ultra | 6 |
| gpt-6-sol | low, medium, high, xhigh, max, ultra | 6 |
| gpt-6-astra | low, medium, high, xhigh, max, ultra | 6 |
| gpt-6-luna | low, medium, high, xhigh, max | 5 |

[실제 앱 목록](../../benchmark-runs/d092-effort-history-20261017-01/app-discovery.json), [임시 환경 정리](../../benchmark-runs/d092-effort-history-20261017-01/app-discovery-cleanup.json). 파라미터 수와 실제 내부 노력도는 미확인이다. `ultra`의 앱 제공과 날짜가 고정된 공식 가격 문서의 노력도 목록 차이를 그대로 기록한다. 앱 목록이 이용 가능 노력도의 근거이며 문서 목록만으로 실제 제공 노력을 제거하지 않는다. 공식 Markdown 문서 재조회는 웹 도구의 content-type 오류로 실패했고, 이를 새로운 문서 확인으로 세지 않았다. 가격 계약 v2는 변경하지 않았으며 실제 구독 청구액과 다르다.

질문과 답변의 정본은 [codex-worker-profiles.v2.json](contracts/codex-worker-profiles.v2.json)이다. `state.task`, 원래 요구사항·인터페이스·공개 실패, `state.models`의 역량·참고 가격, `state.empirical_evidence`를 보고 **성공한 전체 완료까지의 시간·토큰·수리 호출·참고 비용**을 줄일 모델과 노력도를 함께 고른다. 답은 `gpt-6.1-sol-medium` 같은 등록 ID 또는 `unknown`이다. 후보 외 답·변조·근거 불일치는 차단하고 고정 high로 돌아가지 않는다. 새로운 임계값은 넣지 않았다.

## 어떤 성공률을 전달하는가

명시한 D087–D091 실행 경로에서 작업자 85회와 원문·후보·공개 검사 근거 710개를 연결했다. 요청 본문의 작업 ID·파일 범위·요구사항·작업 유형, 출력 파일 SHA와 공개 검사 revision은 85/85 일치했다. [집계·분모 정의](../../benchmark-runs/d092-effort-history-20261017-01/README.md), [고정 스냅샷](../../benchmark-runs/d092-effort-history-20261017-01/snapshot.final.v2.json).

| 요청 프로필 | 관측 | 관련 공개 검사 모두 통과 | 명시적 실패 | 미확인 | 알려진 결과 중 통과율 |
|---|---:|---:|---:|---:|---:|
| gpt-5.6-sol/high, 역사 자료 | 47 | 14 | 28 | 5 | 14/42 = 33.33% |
| gpt-6.1-sol/high | 34 | 22 | 12 | 0 | 22/34 = 64.71% |
| gpt-6-luna/high | 4 | 0 | 4 | 0 | 0/4 = 0% |

이는 작업자의 요구사항과 연관된 **공유 공개 검사 관측**이다. 모델 자체의 인과적 정확도·독립 제품 완료율이 아니다. 서로 다른 작업 난도·정책·분할·환경이 섞이며 한 사례가 여러 작업자와 연관될 수 있다. Luna 4개는 다른 작업자와 함께 부분 실행된 회차여서 Luna가 실패 원인이라고 단정하지 않는다. 실제 served identity는 85/85 미확인이다.

선택 입력은 후보 프로필별 전체 관측, 같은 쓰기 경로·요구사항·작업 단계, 같은 단계의 요구사항 교집합으로 나눠 전달한다. 같은 scope도 같은 원문·환경이라는 뜻은 아니다. 예를 들어 6.1/high는 구현 19/23, 수리 3/11로 관측되므로 전체 22/34만 보고 같은 능력으로 일반화하지 않게 한다. 표본이 없는 다른 노력도는 분모 0·비율 `null`이다. 독립 검사 점수·숨김 상세·원문 소스는 이 성과 요약에 포함하지 않는다.

공개 사례 관측 슬롯은 1,313개이며 실행 후 상태 확인 1,102·미확인 211이다. 확인 가능한 수리 29회 중 무변경 반환은 5회(관련 공개 실패 3·통과 1·미확인 1), 겹치는 경로에 이후 수리 발생은 25/85 작업자다. 같은 전체 수리 입력 서명의 반복은 0/85였다. 따라서 단순 동일 입력 캐시만으로 과거 no-op 5건을 없앨 수 있다고 말할 수 없다.

## 전송·실행 연결과 중복 입력

`codex-worker-profiles-v2.mjs`의 선택 → 필수 v9 gateway의 initial / before_reservation / before_post → Jev 응답 기록 → 등록 모델·노력도와 task/근거 binding 검증 → `createCodexE2EWorkerExecutor` → CLI 인자로 연결했다. 실제 앱과의 교집합으로 허용 목록을 동결하며 Luna/ultra 같은 미제공 조합은 실행하지 않는다. [실행 모듈](../../src/benchmark/codex-worker-profiles-v2.mjs), [성과 바인딩](contracts/codex-worker-outcomes-binding.v1.json), [새 manifest](../../benchmarks/e2e-swe/manifests/pointsman-codex-d092-adaptive.json).

가격·역량은 모델별 한 번, 같은 통계 객체는 완전한 인라인 풀로 한 번 전달한다. 후보 23개는 모두 유지하며 모델이 읽을 수 없는 파일 경로·해시로 내용을 대체하지 않는다. 전송본에서 원본 통계를 복원한 뒤 신뢰된 스냅샷으로 재계산해 검증한다. 같은 실제 과제·23개 후보·85개 과거 관측을 단순 복제한 가상 표현 114,498B 대비 34,273B다. 80,225/114,498 = **70.0667% 표현 중복 감소**이며 새 개발 토큰·시간·비용 절감이 아니다. [동일 내용 오프라인 비교](../../benchmark-runs/d092-effort-history-20261017-01/model-effort-trusted-history-replay.json).

스냅샷은 실행 시작 시 고정한다. 현재 실행 도중 성공률을 온라인 재학습하거나, 선택 캐시·작업자 재호출 강제 차단을 적용하지 않았다. 이는 실측 근거를 선택에 반영한 구현이며 실제 재호출 감소는 다음 전체 개발 측정에서 확인해야 한다. 상태가 같아 보인다는 이유만으로 새 검증 근거가 있는 수리를 차단하지 않는다.

## 사용과 검증

현재 새 경로는 다음과 같다. `check`는 추론하지 않는다. `route`는 새 출력 경로에서 실제 전체 개발을 수행하므로 승인된 유료 실행에서만 사용한다.

```sh
node bin/codex-e2e.mjs check
node bin/codex-e2e.mjs route --spend --execution-host mac --out NEW_PRIVATE_DIRECTORY
```

작업자 모델·노력도는 각각의 Jev 선택값으로 전달된다. manifest의 controller reference profile은 작업자 fallback이 아니다. 과거 run/pair/cohort 계약은 역사 소스와 짝지어 재현해야 하며 현재 변경된 소스에 맞춰 v7/v8을 다시 고정하지 않았다. 새 전체 개발 E2E는 이번에 실행하지 않았다.

모델·역사·실제 게이트/실행 연결 검사 17/17, 환경 검사 14/14가 통과했다(환경 검사 중 한 항목은 앞 집합과 중복). 로컬 생성 응답을 사용하는 연결 검사는 실제 유료 모델 호출이나 생성 품질 측정이 아니다. [라우팅 검사](../../benchmark-runs/d092-effort-history-20261017-01/routing-tests-02.tap), [환경 검사](../../benchmark-runs/d092-effort-history-20261017-01/environment-tests.tap), [추론 없는 전체 입력 점검](../../benchmark-runs/d092-effort-history-20261017-01/source-preflight-final.json).

초기 점검 실패도 보존했다. v9의 기존 catalog same-file 재사용 분기 누락을 보강했다. 공개 사례 분모를 추가하는 동안 이전 스냅샷이 새 집계 검증에서 거절돼, 이전 파일을 보존하고 final.v2를 고정했다. 기존 세 검사는 역사 핀을 사용해 source drift로 실패했고 검증 내용은 유지한 채 현재 v9 fixture를 명시해 다시 통과했다. [교정 기록](../../benchmark-runs/d092-effort-history-20261017-01/preflight-corrections.json).

## 실제 Jev 선택 검증

승인한 정확한 JSON의 SHA를 대조하는 단일 요청 검증이다. 작업자 실행과 전체 개발 효율 측정은 하지 않는다. [전송 예정 JSON](../../benchmark-runs/d092-effort-history-20261017-01/profile-live-payload.json), [처음의 자동 승인 검토](../../benchmark-runs/d092-effort-history-20261017-01/live-approval-review.json). 최초 자동 승인 검토 거절 뒤 사용자가 정확한 JSON의 전송 1회를 명시 승인했다. 처음 실행은 검증 스크립트가 `calls`/`receipts` 하위 폴더를 만들지 않아 원문 저장 단계에서 실패했다. 당시 gateway 단계 기록 0·영수증 0·장부 바이트 불변으로 POST/예약 0임을 확인했다. 원본을 보존하고 폴더 생성만 고친 별도 시도에서 승인된 동일 JSON을 최초 1회 전송했다. [스크립트 교정](../../benchmark-runs/d092-effort-history-20261017-01/profile-smoke-harness-correction.json), [승인 해결 기록](../../benchmark-runs/d092-effort-history-20261017-01/live-approval-resolution.json).

**실제 결과:** 과거 D091 Codex 계획의 첫 구현 작업 `adaptive-leaf-n1`에 대해 Jev가 **gpt-6.1-sol / high**를 선택했다. 이는 고정 fallback이 아니라 23개 실제 후보 중 반환된 Choice다. 이번 호출이 다른 노력도를 선택한 사례라고 하지 않는다. 자연어 선택 이유는 응답으로 받지 않았다. 제공 effort와 요청 인자는 확인했지만 모델 내부의 실제 노력도·worker 수행 결과는 확인하지 않았다.

승인/실제 본문 SHA는 모두 `0dccbc444ef97ad057a81e99efaa6539d14864f21ac7126f54c977b7d684214b`, 직렬화 본문 31,617B다. 선택·controller binding 구간은 **3,338.117333ms**, provider/controller 영수증 구간은 **3,176.476791ms**다. 순수 HTTP 지연이나 개발 완료 시간으로 바꾸지 않는다. 실제 입력 **14,372**, 출력 **342**, 합 **14,714토큰**이다. Jev 과거 입력 단가 환산은 **$0.0086232**이며 실제 월 구독 청구액은 `null`이다.

실제 POST·완료 영수증 1개, 필수 3단계 통과, 원래 budget ID 유지·입력 증가 14,372·정산 +1·pending 0·blocked null을 확인했다. worker 호출 0, 자동 재시도 0이다. 실행 전후 소스 핀 78개와 역사 4,221파일은 모두 불변이다. [실제 선택 결과](../../benchmark-runs/d092-effort-history-20261017-01/profile-smoke-02/result.json), [최종 대조 감사](../../benchmark-runs/d092-effort-history-20261017-01/final-audit.json).

재검산 명령은 `node benchmark-runs/d092-effort-history-20261017-01/final-audit.mjs --out final-audit-recomputed.json`다. 원시 자료만 읽으며 모델을 호출하지 않지만 산출물 보호를 위해 기존 출력이 있으면 거절하므로, 재실행 시 `--out`에 아직 없는 새 파일명을 지정해야 한다. 실제 유료 검증 스크립트를 재실행하는 명령과 혼동하지 않는다.

## 남은 일과 부수 효과

과거 사례가 제시하는 후속은 raw-v1 분할 전 인코딩, 원인 producer와 읽기 범위의 연결, 소스 문맥 부족과 미도달 검사의 분리, no-op 이후 새 근거에 따른 수리다. 이번에는 모델·노력도·공개 성과 연결만 변경했으며 그 후속을 모두 구현했다고 하지 않는다.

D091 결과·계약 포함 4,221파일의 변경·누락 0을 확인했다. [보존 검사](../../benchmark-runs/d092-effort-history-20261017-01/preservation-after.json). 기존 브랜치에 미커밋 변경이 남고 commit/push·전역 스킬 설치는 하지 않았다. 이번 작업에서 Docker를 시작·종료하지 않았다. 과거 성과의 절대 경로 근거가 필요한 로컬 실험 구현이며, 다른 컴퓨터의 실행은 해당 환경의 과거 공개 근거를 새 스냅샷으로 구성해야 한다.
