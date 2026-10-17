# D095 연구 마무리 — 2026-10-17

사용자 요청으로 D095까지의 구현·측정·분석을 `research-d095-final-20261017`에 보관하고 여기서 작업을 종료한다. 추가 실험과 자동 재실행은 시작하지 않는다.

## 보관 범위와 브랜치

- D087~D095의 Codex/Claude 실행 어댑터, Jev 모델·노력도 선택, 잠정 선택과 blocked 복구, 공개 검사 v5, 실패 assertion과 실제 담당 연결, v16 실행 결속 수정, 관련 검사와 결과 문서를 포함한다.
- 기존 `origin/research`에는 별도로 진행된 D084/D085 변경이 있다. 현재 측정 소스의 SHA 결속을 유지하려고 이번 결과는 별도 연구 브랜치에 기록한다. `main`과 기존 `research`를 교체하거나 병합하지 않는다.
- [공개 수치 요약](evidence/d095/summary.json)은 로컬 원본에서 선택한 측정 필드와 원본 SHA를 담는다. 키, 원시 프롬프트·응답, CLI 스트림, 생성 후보, 대용량 `benchmark-runs/`는 공개하지 않고 로컬에 보존한다.
- 과거 문서의 `benchmark-runs/` 링크와 결정 기록 해시 검사는 원본이 있는 로컬 환경용이다. 공개 요약은 원본 전체나 독립적인 재현 자료가 아니다.

커밋 묶음 검사에서 v16 계약의 159개 참조 중 155개는 Git index의 bytes와 SHA가 일치했고, 아래 4개는 `.gitignore`에 따른 로컬 근거여서 index에서 찾지 못했다. 별도 로컬 SHA 대조는 통과했다. 이 누락을 숨기거나 계약을 다시 고정하지 않는다. 새 clone에서 실제 실행하려면 승인된 과거 근거를 별도로 준비하거나 새 근거와 새 계약을 만들어야 한다.

```text
benchmark-runs/d092-effort-history-20261017-01/snapshot.final.v2.json
benchmark-runs/d093-full-provider-20261017-01/claude-account-models.json
benchmark-runs/d093-full-provider-20261017-01/claude-cli-preflight.json
benchmark-runs/d095-public-boundaries-20261017-01/public-controls-v5.json
```

## 종료 결과

| 조건 — 각 1회 | 공개 / 독립 검사 | 전체 시간 | 캐시 포함 토큰 | 수리 회차 / 작업자 재호출 | 참고 비용 추정 USD |
|---|---|---:|---:|---:|---:|
| D093 Claude 단독 | 93/93 · 63/63 | 30분 29.325초 | 1,245,707 | 2 / 3 | $11.3186074 |
| D094 Jev+Claude | 93/93 · 59/63 | 22분 22.232초 | 950,634 | 2 / 2 | $6.8788884 |
| D095 Jev+Claude v16 | 93/93 · 63/63 | 34분 16.680초 | 2,101,095 | 2 / 7 | $14.8056879 |

D095는 완료했지만 과거 Claude 단독 대비 시간·토큰·참고 비용 절감은 달성하지 못했다. 공개 검사의 판정 조건·소스·DAG·선택 모델이 달라 인과적 비교로 해석하지 않는다. 독립 검사는 이전 실패를 확인한 후의 회귀 검증이다. 비용은 공식 Claude Standard 단가와 과거 Jev 입력팩 환산율에 따른 추정이며 실제 월 구독 청구액은 미확인이다.

첫 v15 실행은 추가한 실행기 결속 검사 오류로 수리 전에 중단됐다. 이 실패도 643,247토큰·17분 40.652초·참고 비용 추정 $4.1821504로 보존한다. 두 신규 실행의 합계는 2,744,342토큰·활성 실행시간 51분 57.333초·참고 비용 추정 $18.9878383이다. [원인·반증·정정·전체 결과](../orchestration/D095_PUBLIC_BOUNDARIES_RESULTS.md).

## 검증과 재현 경계

공개 요약의 산술을 추론 없이 확인한다:

```sh
node scripts/export-d095-research-summary.mjs --check
```

로컬 원본을 보유한 환경에서는 공개 요약 전체와 원본 해시를 대조한다:

```sh
node scripts/export-d095-research-summary.mjs --verify-local
python3 skills/jev-decision-records/scripts/check_record.py docs/decisions/D095.md --root .
node bin/claude-boundary-runtime-cohort.mjs check
```

유료 실행 시점 관련 검사는 64개 통과·skip 0개였으며 원본 SHA와 집계가 공개 요약에 들어 있다. 과거 동결 소스 계약을 대상으로 하는 검사 11개의 drift 실패도 보존했다. 전체 `npm test` 통과나 깨끗한 clone의 전체 실행 준비 완료를 주장하지 않는다. 일부 통합 검사는 로컬의 D091/D092/D095 자료가 필요하며 없으면 skip한다. 계정·앱 CLI·Docker·과거 공개 성과·장부 준비가 필요한 실제 벤치마크를 이번 보관 작업으로 재실행하지 않는다.

보관 직전 재검증은 아래 관련 검사 **22개 통과, 실패 0개, skip 0개**였다. `--verify-local`은 원본 6개와 공개 요약의 일치를 확인했고, D095 기록 검사는 근거 14개·주장 9개의 구조와 해시를 통과했다. CLI `check`는 `inspected_no_inference`, provider/paid 호출 0회였다. 이는 소스 검사이며 `live_ready: false`로 계정·실제 실행환경 준비 완료를 주장하지 않는다. `git diff --check`도 통과했다.

```sh
node --test test/d095-runtime-binding.test.mjs \
  test/d095-runtime-profile-gateway.test.mjs \
  test/d095-public-boundaries.test.mjs \
  test/d094-worker-profiles.test.mjs \
  test/d094-blocked-runtime.test.mjs \
  test/adaptive-public-owner-evidence.test.mjs
git diff --check
```

## 남긴 일과 부수 효과

효율 개선, 변경 없는 수리 재호출 제거, CLI 내부 도구 호출 보정 원인 축소, 반복 실험과 새로운 과제 검증은 미완료다. 사용자가 다시 요청하기 전까지 진행하지 않는다.

기존 실행 원본과 진단 복사본은 그대로 남긴다. 이전 벤치마크가 시작한 Docker Desktop과 기존 서비스는 이 보관 작업에서 종료하거나 변경하지 않는다. 전역 스킬 설치·배포·추가 모델 호출은 수행하지 않는다. 이번 브랜치는 연구 소스와 결과 문서 보관이며 제품 릴리스가 아니다.
