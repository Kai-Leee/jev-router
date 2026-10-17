# D091 — 수리 입력 축소·스킬 적용 감사·Jev 모델 등급 선택

2026-10-16 최신 사용자 요청: D090 Jev 수리 입력 증가와 투영0B 원인을 분석해 중복 입력을 줄이고, 기존 결과를 보존한 채 동일 조건 비교를 다시 실행한다. 실제 사용 스킬이 우리 스킬뿐인지 확인한다. 추가 지시로 Jev가 작업자 모델 크기/역량 등급도 판단하게 연결한다. Mac·유료 실행·원장 무상한의 기존 승인을 유지한다. 추가 확인 요청 없이 승인 범위의 구현·검증·실행을 진행한다.

새 worktree `/Users/lee/workspace/plugins/jev-router-codex-d091-20261016`, branch `feat/d091-repair-projection-sizing-20261016`. D090 코드 overlay를 복사했으며 원본 코드/후보/결과/계약은 변경하지 않는다. 이전 결과 전체와 원래 공유 장부 ID·정산을 보존한다. 숨김 검사 본문·실패 상세는 어떤 개발/모델 입력에도 사용하지 않는다. 모델/계정/GET/Docker/장부 호출은 root만 수행한다. 단 pricing 담당은 공식 공개문서 GET만 가능하다.

## 조건과 경계

1. 새 입력 정책을 양쪽 공통 적용한 Codex 판단·작업자6.1-sol/high 고정.
2. 같은 입력 정책의 Jev 판단·작업자6.1-sol/high 고정.
3. 같은 입력 정책의 Jev 판단·Jev 작업자 모델 프로필 선택. 노력도는 high를 유지해 크기 선택을 분리한다.

각1회 순차로 실행한다. 공통 과제/catalog·공개93/독립63·동시2/최대30/수리2회·최신 앱 실제 바이너리/환경·출력 권한/불확실 종료·전송검사는 유지한다. 조건3은 모델 선택을 추가한 별도 실험이며 조건1/2와 동일 작업자 조건이라고 부르지 않는다. 제브가 파라미터 수를 추정하는 것이 아니라 앱 discovery와 공식 가격에서 확인 가능한 모델의 역량/비용 프로필을 고른다. 새 고정 영어 질문/선택값은 검증 후 실행 함수에 직접 연결하고 같은 판단을 Codex에 재질문하지 않는다. 단순 provider-call 가속과 전체 완료 시간은 구분한다. 실제 청구·캐시 쓰기·served identity/tier 미확인은 null 유지한다.

## 역할·파일 소유권

- root: 새 manifest/gateway/runner/bin·모듈 연결·소스 핀·실제 preflight·모델/검사/장부 호출·3조건 실행·기록/보고. 역할 담당의 파일을 동시 수정하지 않는다. 유료 실행 전 전체 기능 소스를 동결한다.
- worker_payload (기존 skill_audit): `src/benchmark/codex-worker-input-projection.mjs`, `codex-artifact-worker.mjs`, 새 worker projection 계약/관련 테스트. D090 repair packet211268B를 필드/중복/동적 의존별로 실측한다. 전체 문맥 fallback을 단순 끄지 말고 정적으로 검증 가능한 동적 참조 후보군을 산출물 단위로 보존하고 관련 없는 입력만 제거한다. 요구/실패/쓰기 권한/필수 파일 원문 보존. 새 정책만 opt-in으로 연결하고 과거v1 의미/계약은 보존한다. 모델 라우터 모듈과 연결은 root와 합의한다. 유료 실행/hidden 접근 금지.
- owner_payload (기존 capability_audit): 실제 Jev 실패 담당 질문의 state/criteria/원문을 필드별 분석하고 중복을 제거하는 새 계약/모듈/집중 테스트. `adaptive-question-forms.mjs`와 담당 projection builder의 필요한 부분만 소유하며 파일 변경 전 root에게 정확한 소유 목록 전달. worker/model/gateway/runner 파일 금지. 현재 artifact/owner allowlist·실패 원문·요구사항·판단 불가·응답 handler binding·필수 검사 유지. 단순 hash/path를 모델이 읽을 수 있는 원문으로 오인하지 않는다.
- model_routing (기존 d086_runner_pair): 새 `codex-worker-profiles` 계약/새 모델 선택 모듈/집중 테스트, 필요시 `codex-environment.mjs`의 명시적 허용 프로필 지원만 소유. runner/gateway/artifact-worker/provider는 root/다른 담당 소유. 모델 후보는 앱 discovery의 실제 이용 가능 모델과 가격 정본에 연결한다. 고정 영어 Choice→등록 프로필→실제 실행 인자 검증, 후보 외/불완전 답 차단, 실패·현재 작업·역량/가격 근거, 수리 재선택 이력 기록. 선택 후 대체 모델로 조용히 fallback하지 않는다. 기존 frozen 환경/API 계약의 역사 동작 보존. 실제 앱/계정/GET/모델 호출 금지.
- pricing (기존 d086_accounting): 새 가격v2 계약·`codex-pricing.mjs`·provider/decisions의 명시적 v2 연결·집중 테스트. 앱 가능한6.1-sol/6-sol/6-luna/6-astra 후보의 공식 가격/한계/effort 근거를 조사하고 불명은 null/제외로 구분한다. official OpenAI Docs skill에 따라 공개 공식문서만 조회, snapshot/SHA 보존. v1 및 D090 정산 결과 불변. root에게 새 API/정확 모델 목록 전달.
- skill_runtime (기존 d086_environment): 읽기 전용 실제 스킬 감사. D090 runtime frozen HOME config·모델 전송 prompt/argv·스킬 활성 목록·격리 방식과 저장소 스킬 본문 전달 여부를 확인한다. 우리 스킬 설치/발견/로드/본문 인라인/실제 호출과 메인 개발 세션/작업자/판단자 경계를 분리한다. 인증 파일·키/환경 전체·숨김 검사 접근 금지. 현행 및 설치 사본 비교는 로컬 inventory 도구 범위만 사용. 새 private 감사와 이 역할 상태 문서만 소유, 생산 소스/전역 설치 수정 금지.
- metrics_audit: 새 private 감사 스크립트·보존/원시 사용량·가격/모델별/스킬 증거 비교 준비. root 최종 통지 뒤에만 실제 결과 감사. 코드 변경·모델/GET/Docker/계정/장부 호출·hidden 상세 금지. 실제 파일/후보 revision·공개93/독립63·입력 원문/투영 byte·대상 모델/effort 인자·캐시 부분량·전체 vs 호출시간·실제 발동/정책존재 차이를 독립 계산한다.

모든 담당은 근거/산식/초기 실패/한계/파일 SHA를 `benchmark-runs/d091-codex-20261016-01/`에 남기고 root에게 완료 및 동결 가능 여부를 알린다. 운영 소스 동결 뒤 생산 파일 수정 금지. 문맥 한계가 오면 역할/목적/원본/현재 상태/다음 행동의 handoff를 남긴다. 새 계측 가정이 틀리면 첫 출력 보존 후 정정한다.
