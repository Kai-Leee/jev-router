# D026 — 공개 Jev 사용 패턴 조사

확인일 2026-10-09. 공식 자료 조사와 커뮤니티 원본 조사를 두 서브에이전트로 병렬 수행. 웹 문서/README/명시한 소스 읽기만 수행했다. 설치·실제 host 실행·유료 추론·성능 재현은 하지 않았다. 아래는 사용자 운영 실적이 아니라 공개 구현/예제 확인이다. TypeSafe SDK/기본 서비스와 독립 호환 서비스 jev-ai.pro의 endpoint·key·billing은 별개다.

| 출처 | 확인한 질문→답→행동 | 근거 수준 및 제한 |
| --- | --- | --- |
| [TypeSafe Function calling](https://docs.typesafe.ai/cookbooks/function_calling) | LLM이 초기 spec 작성 가능; Dispatcher가 질문을 구성해 재사용; 함수/닫힌 인수 선택을 등록 함수 호출로 연결 | 공식 cookbook 코드 및 기록 출력. jev-1.12 예제이며 현재 서비스 호환 실행/고객 효과 검증 아님 |
| [TypeSafe Skill suggestion](https://docs.typesafe.ai/cookbooks/skill_suggestion) | 후보 축소 후 상세 적합성 확인; 추천을 시스템 프롬프트에 추가 | 공식 작성자 합성 평가. 에이전트 자체 선택 유지하므로 판단 제거와 다름 |
| [Jev AI Rules Checker](https://jev-ai.pro/claude-code-rules-checker) | 규칙 ID마다 complies/violates/insufficient_evidence; 코드/검토 workflow에서 소비 | 가상 diff와 2026-09-26 기록 응답. 실제 고객 배포나 독립 정확도 근거 아님 |
| [Jev AI MCP Tool Router](https://jev-ai.pro/mcp-tool-router) | 다음 도구 Choice와 정보 부족/승인 필요 Noul; host가 실제 도구 실행 | fictional task/tool 데모. 모델이 권한을 부여하지 않음 |
| [eran-broder/jev-skills](https://github.com/eran-broder/jev-skills) | hook가 context와 스킬별 질문 구성→결과 선택→스킬 본문 주입 | [observe.ts](https://github.com/eran-broder/jev-skills/blob/main/src/observer/observe.ts), [hook.ts](https://github.com/eran-broder/jev-skills/blob/main/src/hook.ts) 소스 확인. 자체 임계값/성능은 미재현 |
| [leepokai/jev-guard](https://github.com/leepokai/jev-guard/blob/main/src/guard.js) | 고정 Score/Noul→decide 정책 함수→allow/ask/deny; 읽기 도구는 코드로 우회 | 질문 및 정책 소스 확인. 위험 판단을 완전한 권한 검증으로 취급하면 안 됨; 임계값 전용 미검증 |
| [minhgv/jev-mcp](https://github.com/minhgv/jev-mcp/blob/main/docs/tools.md) | coding loop/requirement별 typed answer→auto/review/escalate 계약 | README/도구 계약 확인; 자체 파일/셸 실행 없음. 운영 비용 절감 주장 아님 |
| [its-panzer/jev-model-router](https://github.com/its-panzer/jev-model-router/blob/main/src/model_router/policy.py) | Choice/Noul/Score→코드 정책→모델 ID | 정책 소스/README 확인. 후속 모델 직접 호출 없음; 저자 라벨 평가와 비용 모델링을 실제 작업 성과로 읽지 않음 |
| [n23eos/jev-skills](https://github.com/n23eos/jev-skills) | 파일·테스트·스킬 후보 선택→추천 반환 | README 확인. 자동 실행/세션 모델 변경 증거 아님 |
| [jev-browser-wingman](https://github.com/coderexpert123/jev-browser-wingman) | agent가 목표/단계 전달→Jev 요소 선택→host 조작 | README 확인. 저자 E2E 보고 있으나 원 실행 파일 비공개; 독립 재현 아님 |

## 우리 설계에 적용하는 추론

1. 매번 Claude가 질문·후보를 새로 만드는 대신 초기 명세에서 만든 질문과 실행 registry를 재사용한다.
2. 자유문 추천이 아니라 허용된 handler ID를 반환받고, 코드가 상태/권한/근거 버전을 확인해 적용한다.
3. 요구사항별 의미 판정과 테스트 실행 사실을 분리한다. 알려진 체크는 코드, 의미적 적합성은 Jev.
4. [Jev 1.13 한계](https://docs.typesafe.ai/model-jaggedness/jev-1.13)가 지적하는 간접 추론·관련 없는 큰 state·복합 질문·후보 순서 문제를 평가에 반영한다. 좁은 질문과 관련 근거가 정확도를 개선한다는 주장은 우리 과제에서 아직 미측정이다.
5. [fan-out](https://docs.typesafe.ai/patterns/fan-out)은 독립 질문 묶기에, [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring)은 차원별 판단과 코드 조합의 분리에 참고한다. 종속 질문을 같은 응답에서 앞 답을 읽는 것처럼 설계하지 않는다.
6. [Jev AI docs](https://jev-ai.pro/docs)의 현재 endpoint를 유지한다. 공개 plugin을 바로 설치하거나 TypeSafe 키/기본 URL로 대체하지 않는다.

조사 범위에서 Jev가 Claude SWE 전 과정 판단을 대체해 운영 속도·비용·완성도를 함께 개선했다는 독립 고객 검증을 찾지 못했다. 이는 사례 부재의 증명이 아니다. branch main 링크는 변할 수 있으며 소스 commit을 고정한 재현 연구는 수행하지 않았다.
