# D029 — 사전 등록: 문서/모델 목록 및 실제 분할 대조

2026-10-09 KST. 사용자 지시: 모델/effort 목록과 worker 문서를 조사·보강하고 Claude/Codex 진입점, 문서 확인 기능을 마련한 다음 생성 커밋 후 E2E 효율·분할 확률 검증을 진행한다. 기존 USD1 Jev 장부 재사용; Opus 구독 인증 유지; 원 PersonalOS 변경 금지.

## 조건

- 공개 E2E-SWE pytest-check 원문 목표와 기존 artifact-contract만 planner에 제공. evaluator 테스트·기존 산출물·오류 내용은 제공하지 않는다.
- Claude Opus5.5 medium planner가 2~4개 작업/소유 파일/의존성과 공통 인터페이스 계약을 생성한다. 사람이 구현 태스크를 정하지 않는다.
- 생성 계획을 고정하고 Jev에 정본 split 질문을 한 번 전달. 충분한 근거 여부와 분할의 품질 유지+전체 시간 개선 가능성 기록. finish 없음.
- 같은 목표/계획/Opus5.5 medium을 단일 작업자와 최대2개 병렬 프로세스 작업자로 비교. 작업자는 no-tools JSON 파일 생성 방식이며 기존 D025의 셸·테스트·수정 에이전트와 다른 scaffold다. 기존 결과와 단순 속도비교 금지.
- 결과 파일은 서로 다른 candidate 디렉터리에 저장하고 원본 그대로 독립 Docker grade. 부모/평가자는 코드를 고치지 않으며 숨은 grading 피드백을 구현자에게 넘기지 않는다.
- 확률 임계값 .5/.65/.8 정책 결과를 같은 확률로 계산한다. 실제 실행은 single/split counterfactual 두 개이므로 임계값마다 독립3회 실행했다고 하지 않는다.
- 이 파일의 생성 시점에서는 모든 새 성능/확률/채점 결과가 미측정이다. 작업 모델 고정은 분할효과 분리 목적이다. Fable/Sonnet/Haiku를 목록에 추가한 것과 그 모델의 성능 검증은 다르다.

## 측정

계획 생성, Jev 질문 HTTP/예산 포함 지연, worker별 생성·queue·artifact write, arm 전체시간, 독립 grade 시간을 분리한다. 계획은 공통 비용으로 두 arm에 동일하게 표시하되 실제 지출 합계에는 한 번만 센다. 사용자 목적 전체비용에는 실패/모니터링도 포함하고 modelUsage/CLI API-equivalent와 Jev 월배분/보수적 장부를 분리한다.

분할 사건 판정: split의 독립 품질이 single보다 낮지 않고 split 전체시간이 짧은가. 둘 다 실패하면 '품질을 유지한 성공적인 효율 개선'으로 해석하지 않는다. 정답확률 보정(Brier/ECE)은 여러 독립 작업과 반복 관측이 필요하므로 n=1은 예측 대조 사례이며 검증된 calibration 아님. p 높고 실제 나빠지면 반증 사례로 그대로 남긴다.

## 실행 경계와 보존

실제 공급자 호출은 main만 실행하고 코드는 먼저 commit한다. 요청 결과 불확실시 재전송하지 않는다. 유효하지 않은 계획/파일 출력은 별도 실패 기록으로 종료하며 같은 요청을 자동 반복하지 않는다. 원본 JSON/사용량/비용/모델 ID/commit SHA/문서 해시 기록. 새로운 실험은 새 디렉터리.

기존 USD1 장부 시작 관측: 46회/66715 input/보수적USD0.040029, pending 및 blocked 없음. 실행 직전에 다시 확인한다. CLI2.1.293 경로는 /opt/homebrew/bin/claude지만 대상은 Claude Desktop 내부 실행파일 symlink다. Homebrew 패키지를 다시 설치하지 않는다.

부수 효과 예상: 소스/문서 커밋, private 실험 결과/후보 디렉터리, grader가 생성·제거하는 verifier. 원격 push는 요청하지 않았으므로 수행하지 않는다. 실제 프로필 가용성 및 native Agent tool 방식과 no-tools subprocess worker의 차이는 결과에 명시한다.
