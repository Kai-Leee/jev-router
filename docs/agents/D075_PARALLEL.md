# D075 — 강제 전송 검사·실패 복구·보존 후보 실측

2026-10-12 사용자 요청: D074 사전 검사를 실제 전송 전에 강제 연결하고 실패 복구 루프를 병렬 구현한다. 기존 실패 후보를 새 경로에서 실행하고 완료·총시간·토큰·비용을 비교한다. 기존 결과는 보존한다.

## 공통 범위

- 관련 스킬 `jev-prompting`, `jev-decision-records`와 D074 문서/계약을 읽는다. 영어 고정 질문과 typed 선택→검증된 기존 handler를 유지한다. Superpowers는 쓰지 않는다.
- 실제 Jev/Claude/Docker/장부 접근 및 실행은 root만 수행한다. 개발·검토 에이전트는 소유 코드와 새 private offline 증거만 쓴다. 키/.env/hidden grader를 읽거나 출력하지 않는다.
- 로컬 토큰/장부 상한은 기존 null을 유지한다. 공식 body/schema/context 제한, 기존 쓰기 권한, 결과 불확실·미정산 처리도 유지한다. 자동 SDK 재시도는 0이다.
- 기존 D073/D074 원본·후보·manifest·검증 결과를 덮어쓰지 않는다. D075 v10 명세/새 run을 보존 수리 CLI 기본으로 연결한다. 명시한 과거 manifest는 재현 경로로 보존하며 신규 pin 정책은 과거 정책을 소급 수정하지 않는다.
- 동일 입력/동일 근거의 무진전 worker 재호출을 차단한다. 후보/근거 재구성이나 원인 조사를 새 action과 input hash로 기록한다. 형식 통과를 실제 수락/제품 완료로 승격하지 않는다.
- 비교는 D073 마지막 보존 수리와 동일한 출발 후보를 기본으로 한다. 최신 개선 후보 수리는 출발 상태가 다르므로 별도 조건이다. 완료 시간과 실패까지의 시간, 증분 수리와 전체 개발 시간을 구분한다.

## 소유권과 먼저 맞출 인터페이스

1. **d071_transport — 실제 전송 gate**: `src/benchmark/adaptive-dag-runner.mjs`의 manifest/session/gate/source pin 연결과 새 `src/orchestration/jev-transmission-preflight.mjs`, 새 gate 정책, 해당 테스트/역할 기록. 모든 D075 Jev POST에서 정확한 직렬화/정책 SHA를 전송 직전에 다시 확인한다. 예약 전 차단은 예약0/POST0, 예약 후 차단은 실제 예약 상태와 POST0을 구별한다. Stage별 일반/고정 검증 범위를 분리한다. D074 정책 v1 보존, 새 정책 v2와 명시 옵션을 checker/CLI에 추가한다. 다른 담당이 이 runner를 수정하지 않는다.
2. **d067_runner — 복구 실행 제어**: `src/orchestration/adaptive-dag-execution.mjs`, 새 failure recovery 모듈/실행 정책과 해당 집중 테스트/역할 기록. D074 분기를 실제 executor에 연결한다. 입력 재구성/소스 근거 callback과 owner/profile callbacks 인터페이스를 먼저 root·다른 담당에게 보낸다. 불확실 결과는 reconcile 상태에서 멈추며 알고 있는 실패와 구분한다.
3. **d067_budget — 수리 입력·새 근거**: 새 D075 입력 재구성 모듈/질문 계약/검증. D073 큰 chooser·round2 owner, A10 무변경 수리의 공개 근거를 읽고 기존 의미·선택/권한을 유지한 새로운 packet과 원인 근거 수집 방식을 구현한다. 기존 producer/handler는 다른 담당과 합의 없이 수정하지 않는다. Private old request 재생과 실제 모델-visible 근거/바이트를 기록한다. 숨김 검사 금지, 기존 benchmark를 직접 수리하거나 정답을 입력으로 주지 않는다.
4. **d067_review — 보존 후보 실행 연결**: `src/benchmark/preserved-artifact-repair-runner.mjs`, `scripts/preserved-artifact-repair.mjs`, 새 D075 manifest, 해당 테스트/역할 기록. 동일 출발 후보와 필요시 terminal preserved candidate 연결을 검증한다. 복구 callback·입력 모듈을 연결하고 원본·비선택 산출물을 보존한다. Loader/schema 변경은 transport 담당에게 전달한다.
5. **d068_failure — 측정·보존 감사**: baseline와 D075 preflight source/candidate 목록, 결과 집계 helper/비교 문서의 private 근거. 기존 가격 근거를 공식 문서와 대조한다. 실제 호출/회계/후보 검사 증거와 조건 차이를 분리한다. API/장부/Docker/hidden 접근 금지. Root가 나중에 새 결과를 제공한다.
6. **d067_skills — 단일 스킬 관리자**: 현재 스킬들의 문서 갱신, 새 gate/복구 사용법과 유지보수 항목/역할 기록. 새 스킬을 추가하지 않는다. runtime 실제 연결/오프라인/실측 수준을 분리하며 담당의 안정된 인터페이스를 기다린다. 공통 AGENTS/STATE/index는 root가 소유한다.
7. **d071_review — 독립 검토**: 구현 준비 후 별도 역할로 pre-send 강제성·우회·정산·무진전·원본보존을 독립 확인한다. 생산 코드 수정 없이 private 검증/보고만 한다.
8. **root**: 통합 명세·공통 기록·실제 실행·원본 동결·공개/독립 채점·Opus 숫자 모니터 및 결과 보고. 작업 간 인터페이스 충돌을 해결한다.

## 완료 기준

강제 gate 차단의 실제 POST/예약0 대조, 복구 branch의 행동·원본 보존, 실제 새 수리 run·동일 공개93/독립63 채점, 총 wall/time/tokens/USD basis·결측·실패·잔여 항목을 재현 가능한 명령과 파일로 남긴다. 제품 미완료면 실패 지점과 후속을 분명히 보고하며 성능 개선으로 바꾸지 않는다.
