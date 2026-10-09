# Jev Router 작업 지침

이 지침은 `jev-router/`에만 적용한다. 상위 EDA 프로젝트와 목적·결정 기록을 섞지 않는다.

## 진입점

1. [기술 명세](docs/TECHNICAL_SPEC.md)를 읽는다.
2. [결정 기록](docs/DECISIONS.md)에서 확정 사항과 제안·가설·미결정을 확인한다.
3. [작업 기록](docs/WORK_LOG.md)과 [검증 기록](VERIFICATION.md)에서 실제 구현·검증 수준을 확인한다.
4. 평가 조사·지표 구현이면 [평가 방법 조사](docs/EVALUATION_RESEARCH.md)의 출처·산식·제외 조건을 확인한다.
5. 분업 개발/문맥 인계는 [개발 에이전트 운영](docs/agents/README.md), 본인 역할, [현재 상태](docs/agents/STATE.md)를 읽는다.

## 유지할 경계

- 메인 세션이 작업을 진행한다. Jev Router는 모델 선택과 작업 중 판단을 지원한다.
- 제품의 판단 흐름은 현재 한 세션에서 다룬다. 개발 작업은 D-012에 따라 역할별 에이전트로 분업하고 문맥 한계 시 인계한다.
- 판단 후 handoff/새 세션 전환은 문맥 보존 효과를 확인할 가설이다. 자동 전환 확정으로 해석하지 않는다.
- Jev 질문과 평가 기준은 영어를 기본으로 한다. 원문 근거·고유명사·코드·식별자의 의미를 임의로 바꾸지 않는다.
- Jev 호출은 자동 모드를 기본으로 한다. 구체적인 판단 지점·임계값·호출 빈도는 성능 평가로 조정한다. 모든 턴에서 무조건 호출하는 정책으로 확대하지 않는다.
- 정답이 하나인 과제만 가정하지 않는다. 반환 형식, 선택 기준, 평가 방법을 구분하고 판단 불가를 보존한다.
- 후보 생성 방식은 상황별로 설계할 수 있지만, 사용자의 미정 우선순위를 임의로 확정하지 않는다.
- 정확도·속도·토큰·비용 개선은 실측 전까지 목표/가설이다. Jev의 확률을 작업 성공률로 단정하지 않는다.
- 런타임 상태·근거가 있는 결과와 문서의 제안을 구분한다. 의미 있는 작업 후 결정·작업·검증 기록을 갱신한다.
- 키와 Authorization 헤더를 출력하거나 커밋하지 않는다. 결과 불확실한 유료 POST를 자동 재전송하지 않는다.
- Superpowers는 현재 작업에 대한 사용자 명시 요청이 있을 때만 사용한다.

현재 소스는 연결 모듈·오프라인 평가기와 D-014의 격리 benchmark runner/gate다.
실제 질문/후보 생성은 Opus가 담당한다. D-020에서 실제 Opus/Jev 판단 후 격리 명령 실행과
독립 Opus monitor 응답을 확인했다. 전체 과제 완성·독립 채점·비교 성능은 최신 STATE를 확인한다.
현재 Jev 예산은 모든 실험이 공유하는 USD1 보수적 토큰 환산 장부다. 새 장부로 초기화하지 않는다.
시작 시 `benchmarks/README.md`와 최신 STATE를 읽는다. 평가 단위/결측은 기존 계약을 유지한다.

## D-025 판단·측정 문서 관리

Jev 라우팅/규칙 변경, 실험 재측정, 비용 분석을 수행할 때 [jev-decision-records](skills/jev-decision-records/SKILL.md)를 읽고 적용한다. 물리적 원본은 이 저장소이며 Codex 사용자 스킬 디렉터리에 설치 사본이 있다. 개발 서브에이전트는 역할 소유권에 따라 근거를 기록하고 문서 담당자가 docs/decisions/<ID>.md를 갱신한다. 실제 측정·추정·가설·정정·미확인을 구분하고, 기존 원본을 덮어쓰지 않는다. 이 규칙은 새 유료 실행이나 권한 확대의 승인이 아니다. 최신 사용자 지시가 우선한다.

## D028 질문·프로필·작업 지시 정본

새 문서 기반 라우팅을 작업할 때 먼저 `docs/orchestration/contracts/README.md`를 읽는다.
질문은 `questions.v1.json`, 모델+추론 프로필은 `profiles.v1.json`, 작업자 고정 지시는
`worker-task.v1.json`에서 읽어 사용한다. 경로는 위 README와 같은 디렉터리다.
반복 판단마다 LLM이 질문을 다시 쓰게 하지 않는다. 실행 시 자연어는 그대로 붙이고
문서화된 변수/후보만 채운다. src/orchestration/document-contracts.mjs의 로더를 사용한다.
기존 D027 하네스는 역사적 비교 경로이며 새 정본 경로로 자동 교체됐다고 간주하지 않는다.

## D029 현재 문서 버전과 호스트 연결

새 E2E 실험의 모델 목록은 `docs/orchestration/contracts/models.v2.json`, 작업자 지시는
`worker-task.v2.json`이며 같은 폴더의 `questions.v1.json`을 사용한다. 과거 v1은 재현용이다.
Claude는 CLAUDE.md의 @AGENTS.md import, Codex는 이 파일을 진입점으로 사용한다.
격리 worker에는 자동 발견을 가정하지 말고 controller가 내용과 경로/해시를 명시 전달한다.
`node bin/show-routing-contracts.mjs`로 현재 문서·모델·effort·질문을 무과금 열람할 수 있다.
문서상 지원, 계정에서의 실제 호출, 실측 성능을 별개로 기록한다.

## D031 입력 투영·판단기 비교

새 pilot 기본 입력은 projected/v3 (`docs/orchestration/contracts/worker-task.v3.json`). 질문 v1/모델 v2는 유지한다. legacy 옵션은 D029 재현용. `docs/orchestration/D031_IMPLEMENTATION.md`에서 옵션·실험 경계를 읽는다. 기본 forced는 평가용이며 온라인 Jev 선택을 의미하지 않는다. Claude/Jev 모드는 명시 임계값 필요. 작업자 모델 Opus medium 고정. 의미 매핑 없는 요구사항 삭제 금지; 원문은 한 번 유지. 문서·모의·실제 측정 구별.
