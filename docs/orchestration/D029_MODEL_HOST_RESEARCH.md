# D029 모델·작업자 지시·호스트 문서 조사

확인일: 2026-10-09 (Asia/Seoul). 공식 웹 문서를 열어 확인했다. 계정별 가용성·실제 적용 effort·성능은 이 조사에서 호출하지 않았으며 미검증이다. 모델 카탈로그의 설명은 배정 가설이고 측정된 순위가 아니다.

## 모델과 노력도

정본은 [models.v2.json](contracts/models.v2.json)이다. Opus 5.5, Fable 5.1, Sonnet 5.5, Haiku 5.5를 명시 ID로 등록했다. 네 모델 모두 CLI에서 low/medium/high/xhigh/max를 지원한다. CLI 기본값은 Fable high, 나머지 medium이다. `--effort`로 명시하고 실제 사용 모델을 결과에서 확인해야 한다. 최소 CLI 버전은 각각 2.1.280/2.1.257/2.1.284/2.1.293이다. 설정·조직 cap·환경 변수와 모델 fallback이 실제 적용값을 바꿀 수 있다. max는 세션 flag로 전달하며 영구 effortLevel에 저장하지 않는다. ultracode는 별도 워크플로 설정이므로 후보에서 제외했다. Fable 비대화형 호출은 사용 크레딧이 청구될 수 있다. [Claude Code model configuration](https://code.claude.com/docs/en/model-config)

API 기본값은 CLI와 같다고 가정하지 않는다. Sonnet 5.5의 API 기본 effort는 high이며 CLI는 medium이다. API에서 Haiku 5.5의 thinking disabled 또는 Sonnet 5.5의 between_tools와 xhigh/max를 조합하면 오류가 난다. 현재 adapter는 Claude CLI이며 API thinking 설정을 임의로 전달하지 않는다. [API effort](https://platform.claude.com/docs/en/build-with-claude/effort)

20개 조합(4개 모델 × 5개 effort)을 목록으로 구성할 수 있으나, 등록은 계정의 20개 조합 성공을 뜻하지 않는다. 런별 allowlist와 adapter 사전 확인이 필요하다. 반복 실험에서 requested_model/observed_model, requested_effort/effective_effort evidence를 구분하고 실제 적용을 관측할 수 없으면 unknown을 유지한다.

## 작업자 계약에 반영한 사항

[worker-task.v2.json](contracts/worker-task.v2.json)은 목표·요구사항·입출력·작업 범위와 검사 근거를 받는 계약이다. Claude 공식 문서는 명확한 목표, 문맥, 출력 형식과 구체적 검증 기준을 권장한다. 이를 그대로 장황한 추론 요청으로 늘리지 않고, 수행 범위와 근거 반환으로 적용했다. [Prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices)

서브에이전트의 모델·effort·도구 권한은 각각 설정 대상이다. per-invocation effort는 CLI 2.1.292 이상에서 지원되며 환경 변수와 cap의 영향을 받는다. 별도 프로세스 `--model/--effort` 실행은 네이티브 Agent tool 자식과 같은 방식이라고 표기하지 않는다. [Custom subagents](https://code.claude.com/docs/en/sub-agents)

프로젝트 고유 추가 규칙: write scope와 의존 결과 확인, 다른 작업자 변경 보존, 실패한 파이프라인의 원래 exit status 보존, 검사 기대값을 통과 목적으로 완화하지 않음, 실제 파일·검사·근거 ID만 반환, 불확실한 유료 호출 자동 재시도 금지, handoff에 목표·버전·미해결·다음 행동 기록. 이 규칙들은 외부 문서의 실증 효과를 주장하는 것이 아니라 D025의 실패와 사용자 요구에 대한 설계다. 추가 지시가 시간·토큰을 늘릴 수 있으므로 baseline/split 모두 같은 문서를 사용한다.

## Claude와 Codex 진입점

Claude용 [CLAUDE.md](../../CLAUDE.md)는 `@AGENTS.md`를 import한다. 단순히 AGENTS를 읽으라고 적는 것보다 명시 import가 적합하다. 최신 Claude의 AGENTS 직접 로딩 지원과 별개로 호환 진입점을 유지한다. 격리 cwd에는 자동 발견을 가정하지 않는다. [Claude memory](https://code.claude.com/docs/en/memory)

Codex는 [AGENTS.md](../../AGENTS.md)를 프로젝트 진입점으로 사용한다. 공식 문서의 root-to-cwd 발견과 override 우선순위 때문에, 다른 cwd에서 실행된 worker가 같은 문서를 읽었다고 추정하면 안 된다. 공통 JSON 정본은 호스트별 복사본으로 분기하지 않고 실행기가 내용을 materialize하고 경로·버전·해시를 남긴다. [Codex AGENTS guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

문서 정본 → 런 manifest의 실제 로딩 경로/해시 → worker prompt 포함 → 실제 요청 모델/관측 모델 → 결과 근거 순서로 확인한다. 이 파일 작성 자체로 호스트 자동 발견이나 유료 실행을 검증한 것은 아니다.

## 남은 검증과 부수 효과

main 담당: 로더와 live runner 연결, source allowlist commit, 실제 격리 실행·채점·분할 임계값 비교. 본 조사 담당은 문서 네 개만 추가했고 전역 설정·키·CLI 설치·유료 호출·Git 상태를 변경하지 않았다. v1 정본은 수정하지 않았다.
