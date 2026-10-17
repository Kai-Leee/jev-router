# Mac Codex 판단 대 Jev 판단 — 실제 실행 결과

2026-10-14. 사용자 승인: “이번 Codex 비교는 Mac에서 실행”. 새 브랜치 `feat/d083-skill-gateway`에서 실제 순차 1쌍을 실행했다. **실험 실행은 종료됐고 두 조건의 제품은 모두 미완료다. 완료 속도나 비용 절감은 입증하지 못했다.**

## 조건과 재현

동일 OpenAPI Python client generator 공개 명세·D066 catalog·Codex 작업자 `gpt-5.6-sol/high` 요청·동시 작업자2·최대30·수리2회·고정 Docker 검사 환경. Codex 판단→Jev 판단 순서 각1회. 자동 재시도0. 양쪽 선택값만 planner에 전달하며 Jev 원본 확률은 보존한다. 전체10분 제한 없음.

```sh
node bin/codex-e2e.mjs pair --spend --execution-host mac --out benchmark-runs/codex-e2e-mac-20261014-02/pair --model gpt-5.6-sol --effort high
node benchmark-runs/codex-e2e-mac-20261014-02/summarize.mjs
node bin/codex-e2e.mjs compare --left benchmark-runs/codex-e2e-mac-20261014-02/pair/codex --right benchmark-runs/codex-e2e-mac-20261014-02/pair/jev
```

실행 명령의 출력 경로는 이미 존재하므로 재실행하지 않는다. 집계 명령은 모델 호출이 없다. [원시 비교](../../benchmark-runs/codex-e2e-mac-20261014-02/pair/result.json), [별도 집계](../../benchmark-runs/codex-e2e-mac-20261014-02/comparison-summary.json).

## 측정

| 항목 | Codex 판단 + Codex 작업자 | Jev 판단 + Codex 작업자 |
|---|---:|---:|
| 결과 | 미완료 | 미완료 |
| 종료까지 시간(독립 채점 포함) | 1,381.638초 / 23분1.64초 | 402.413초 / 6분42.41초 |
| 입력 토큰 | 1,004,373 | 248,677 |
| 출력 토큰 | 79,634 | 51,823 |
| 합계 토큰 | 1,084,007 | 300,500 |
| 계획된 작업자 | 6 | 5 |
| 실제 초기 구현 호출 | 6 | 3 |
| 수리 작업자 호출 | 3 | 0 |
| 판단 호출 | 15(분해4+담당11) | 4(분해만) |
| 최종 공개 검사 | 16통과·10실패·67미실행 /93 | 93개 모두 미실행 |
| 독립 검사 | 57/63 통과 | 0/63 통과 |
| 실제 청구액/월정액 배분 | 알 수 없음 | 알 수 없음 |

Jev 조건은 전체 작업을 덜 수행한 채 중단됐다. 두 종료시간·토큰의 차이를 완료 효율 개선으로 환산하지 않는다. 비교기 `both_completed=false`, `completed_speed_ratio=null`을 유지한다. 캐시는 Codex 기준군0으로 보고됐으며 Jev는 cache 필드 미제공으로 총 cache 합계null이다. 캐시를 입력에 이중 가산하지 않는다.

초기 관계 판단은 같은 canonical 요청 SHA4개, 질문210개다. Codex 호출 wall 합계243.814661초, Jev9.263180초: Codex/Jev = **26.3208**. 이 구간은 Codex CLI 프로세스 대 Jev adapter(GET/장부 포함) 관측이며 전체 개발 가속률이 아니다. 초기 판단 토큰은 각각212,421 /167,723이며 provider별 토크나이저와 CLI 문맥 차이를 포함한다. HTTP만의 시간이 아니다.

Jev4회 input149,852 / output17,871, billing `mode=tokens`, paidInputTokensUsed합149,852, creditsCharged합0이다. 기존 역사적 토큰팩 단가0.6USD/백만input 환산은 **$0.0899112**. 현재 월정액 청구액이 아니며 Codex 공식환산단가를 확인하지 못해 합산 비용 및 비용 절감률은null이다. 공유 장부 증감은 다른 서비스 호출이 섞이므로 사용하지 않았다.

## 실패 원인

**Codex:** 공개 검사 round0/1/2 모두16통과·10실패·67미실행. 5개 묶음이 생성 패키지 import에서 중단됐다. 공개 기록과 후보 정적 대조상 패키지명과 출력 폴더명이 다를 때 A16의 package init 템플릿 절대import가 원인 후보다. 수리는 A03/A15/A21 또는 A21만 선택했고 A16/n5를 두 라운드 모두 재사용했다. 별도 패치 재현은 하지 않았으므로 정적 근거에 기반한 원인 가설이다. [감사](../../benchmark-runs/codex-e2e-mac-20261014-02/codex-arm-audit.json).

**Jev:** n3의 `pyclientgen/naming.py:72` f-string 내부 backslash가 고정 Python3.11 환경에서 SyntaxError를 냈다. Local readiness8개 중7통과·1실패 뒤 실행이 멈췄다. 작업자3회 출력은 완료됐지만 산출물 확정은2그룹이며 revision은7/22개뿐이었다. 수리 입력검사 `adaptive-inferred-repair.mjs:95`는 모든 산출물 revision을 요구해 첫 누락 A01에서 `ADAPTIVE_INFERRED_ARTIFACT_BINDING`을 발생시켰다. 102행 전체키 동등 조건도 충족할 수 없지만 실제로는95행에서 먼저 종료했다. Jev 담당 판단 호출 전에 차단됐고 수리는0회다. [감사](../../benchmark-runs/codex-e2e-mac-20261014-02/jev-arm-audit.json).

## 보존한 실패와 비교 한계

첫 시도01의 `gpt-6.1-sol`은 ChatGPT CLI에서 HTTP400 미지원으로 거절됐다. 로그인 성공을 모델 가용성으로 볼 수 없었다. 원시 실패를 보존한 뒤 무추론 `model/list`의 기본 모델 `gpt-5.6-sol/high`로 새 조건02를 실행했다. 첫 실패는02 성능 합계에서 제외하고 토큰·비용은unknown으로 보존했다. Codex의 실제 returned model/effort는 확인되지 않았고 요청 설정만 확인된다. Jev는 `jev-latest` 요청에 반환된 `typesafe-ai/jev`, `jev-1.13.0` 라벨을 원문 그대로 남겼다.

스킬 파일시스템 관측에서1추가·1삭제·3내용변경이 있었다. `--ignore-user-config`여도 전역 스킬 탐색 경고가 있었으며, 전후 목록은 실제 활성 스킬/완전한 system prompt 증거가 아니다. 변경 시점·주체·효과 미확인. 소스핀·모델설정·Docker 환경 동일만으로 전체 문맥이 통제됐다고 주장하지 않는다. 단일 순차쌍이므로 순서·부하·확률적 변동 효과를 분리하지 못했다.

## 남은 구현과 검증

1. 부분 실행 상태의 수리 입력을 완성 산출물 전용 경로와 구분한다. 이미 확정된revision, 실패한stage의 내용해시, 아직 실행하지 않은 항목을 분리해야 한다. 누락revision을 만들어내거나 기존 권한검사를 우회하는 수정은 금지한다.
2. import 오류의 호출·템플릿 근거를 담당 후보에 연결해 실제 A16 같은 관련 담당이 빠지는지 재현 검증한다.
3. 다음 비교 전에 CLI의 실제 스킬/지시문 환경을 고정하고 무추론 모델목록을 점검한다. 이번 결과로 완성도 동등·시간절감·가격절감 결론을 내리지 않는다.

이 세 항목은 이번 결과에서 도출한 후속 작업이며 아직 수정·재실행하지 않았다. 실제 Mac host 예외는 새 codex-e2e CLI/arm에만 구현했고 과거 cloud 정책은 보존했다.

## 검증과 부수 효과

`node --test test/codex-e2e-decisions.test.mjs test/codex-e2e-integration.test.mjs` →9/9 통과. Mac예외/플랫폼 불일치, gateway, 모의 파일수리와 불확실 결과를 검사했으며 제품 통과 증거와 구분한다. `git diff --check` 통과.

기존 불변42,050파일 SHA 동일. 공유 가변장부1개는 의도적으로 제외. Docker목록과 대조해 이번 environment/readiness/public 컨테이너100개 잔존0, 독립grader2개 제거영수증 확인. driver종료, active lock해제. 새 결과·진단·변경전 소스와 `/private/tmp/jev-codex-protocol-20261014` 프로토콜 자료를 보존했다. 브랜치 변경은 미커밋이며 push하지 않았다.
