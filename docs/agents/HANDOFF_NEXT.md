# 다음 세션 인계 (임시 — 이어받은 뒤 이 커밋은 삭제)

이 파일은 다음 세션이 이어받기 위한 임시 메모다. 내용을 이어받은 뒤에는 이 파일을 추가한 커밋을 되돌려 삭제한다(사용자 지시). 결정·측정의 정본은 D084/D085 문서, `docs/decisions/D085.md`, `docs/agents/STATE.md`다.

## 현재 상태 (2026-10-14)

- `research`에 D084(구조 분석)와 D085(복수 owner C, 평평한 답 재질문 `flat-reask-v2`, import·문법 오류 직접 수리)가 들어갔다(PR #13).
- D085 유료 3회로 조건 한도를 소진했다. 제품 성공은 2/3이다(01: 공개 93 · 독립 62, 02·03: 63/63).
- 원장(클라우드에서만 사용): charged 24,661,912 · settled 1,223 · pending 0. Mac은 유료 실행을 하지 않는다.
- 전송 정책 기본은 v11이다. 회귀는 1366/1370이다(실패 1: root 전용 refund 테스트).

## 이어받을 일 (백로그, 미결정)

1. **d085-cloud-01 공개↔독립 차이**(D085 문서 §10)
   - A06 `naming.py` 정규식 `[0-9]+`가 숫자+소문자를 나눈다(`3value` → `field_3_value`).
   - 공개 검사 `verify_config_models`는 접두사 시작과 식별자 여부만 본다.
   - 한 줄 규모다. **아직 고치지 않았다.**
   - 후보: (a) 공개 검사에 정확한 attribute 이름 assertion 추가(검사 버전 변경), (b) snake_case를 한 artifact로 모으기.
2. D084 남은 후보: A(통합 artifact 배치 — R10.02 반복 실패), B(막힌 검사를 owner 질문에 넣기). C는 D085에서 구현했다.
3. D085 미측정: C와 tie-break가 회차를 줄이는지(3회 동안 직접 증거 없음), 추가 작업자의 회귀 위험.
4. 정적 생성 smoke(`scripts/static-generation-smoke.py`)는 분석용으로만 남아 있다. 런타임에는 넣지 않기로 했다.

## 사용자 쪽 남은 일

- `v0.3.2` 태그(`8b2da35`)를 Mac이나 GitHub 웹에서 만들어야 한다. 세션 git proxy는 태그 push에서 403이 났다.
- 클라우드 `/root/jev-home`의 쓰이지 않는 인증 사본 삭제 여부가 아직 답을 받지 못했다.

## 클라우드 실행 메모

- 컨테이너가 재시작되면 Docker daemon과 bind mount가 사라진다. `bash scripts/cloud-env-up.sh`로 다시 준비한다.
- 유료 실행: `NODE_USE_ENV_PROXY=1 node scripts/adaptive-dag-comparison.mjs --manifest <manifest> --spend benchmark-runs/<new> --catalog-preparation benchmark-runs/d066-catalog-01`을 `/Users/lee/workspace/plugins/jev-router`에서 실행한다.
- 채점: `node scripts/grade-adaptive-arm.mjs benchmark-runs/<run>/jev_profile --grade-manifest benchmarks/e2e-swe/manifests/openapi_python_client.cloud-4cpu.json`.
- 반복 측정은 조건당 3회까지, 순차로만 한다. 불확실한 유료 POST는 재전송하지 않는다.
