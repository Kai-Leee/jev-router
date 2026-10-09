# D-024 Claude 규칙 작성 / Jev 검증·갱신 연결

2026-10-09. 사용자 목표는 Claude의 반복 판단 제거다. 새 모듈은 규칙 작성과 판단을 분리한다. 기존 E2E runner는 비교조건 보존을 위해 변경하지 않았다.

`src/benchmark/agent-rules.mjs`:
- Claude: 목표·근거에 기반해 역할/입력/출력/수락기준/에스컬레이션/갱신조건 작성.
- 프로그램: 도구/작업경로 확장, 재귀 agent 도구, 잘못된 역할이름, 변조된 버전/해시 검사.
- Jev: 최초 accept/revise/abstain, 이후 keep/revise/abstain. keep이면 Claude 생성 호출0. revise이면 한 번만 수정 생성·재검증.
- export 직전에도 근거 해시를 다시 검사. stale 승인은 폐기. 승인된 정의만 Claude에 전달.

실제 첫 pilot은 Claude 초안1회→Jev accept→출력 계약 변경 fixture→Jev revise→Claude 수정1회→Jev accept, version2까지 성공했다. 계약 변경 fixture는 새 evidence_revision 필드를 요구하는 의도적 검증 입력이며 실제 제품 장애로 꾸미지 않았다. Jev3회, 입력6875토큰. [요청·답변·생성물](../../benchmark-runs/d024-rules-01/events.jsonl).

## 발견한 연결 결함과 복구

초기 실제 dispatch에서는 main 호출부가 async exportClaudeAgent를 await하지 않았다. 실행 중 모듈 인터페이스 변경과 호출부 검증을 맞추지 못한 결함이다. Promise를 정의 객체처럼 처리해 worker=undefined, Agent(undefined)가 전달됐고 CLI가 subagent_type 누락으로 거절했다. [원본 실패](../../benchmark-runs/d024-rules-01/result.json)는 unverified로 보존했다. Claude 정상 프로세스 종료를 서브에이전트 성공으로 판정하지 않았다.

호출부에 await를 추가했다. 복구 CLI는 원래 요청3개와 완전히 같은 요청인지 deep equality 검사하고 저장된 승인응답만 재생한다. 실제 Jev HTTP 호출0. 규칙을 다시 생성하지 않고 서브에이전트 dispatch만 새로 호출한다. 알 수 없는 결과 재전송이 아니라, 명시적으로 거절된 도구 호출의 수정 검증이다.

```sh
node scripts/agent-rule-pilot.mjs benchmark-runs/d022-e2eswe-run-05.json benchmark-runs/d024-rules-01 --spend
node scripts/resume-rule-dispatch.mjs benchmark-runs/d024-rules-01 benchmark-runs/d024-dispatch-02 --spend
```

위는 이미 수행한 경로다. 새 실험에는 새 출력 디렉터리 필요. recovery는 이번 알려진 실패 형식 전용이며 범용 resumable runner가 아니다.

## 경계

실제 작업은 tools=[]의 근거 추출 역할이다. host shell/파일 수정 권한이 없다. 상위 Claude는 허용된 역할 하나에 전달하는 Agent 도구만 갖는다. 공식 문서의 `--agents` 현재 세션 정의와 `--agent` 부모 도구 allowlist를 이용했다: https://code.claude.com/docs/en/sub-agents (2026-10-09 확인). 전역 Claude 설정에 설치하지 않았다.

규칙은 계약 전체 단위 판단이며 개별 결함ID 기반 최소수정이나 지속 캐시가 아직 없다. static evidence hash는 snapshot만 확인하므로 실제 운영은 현재 근거에서 해시를 재계산해야 한다. workspace 문자열은 OS 격리가 아니다. arbitrary coding tools를 연결하려면 기존 sandbox에서 강제해야 한다.

새 구조를 전체 E2E 구현 runner에 적용한 속도/정확도 향상과 Personal OS 재구현은 미검증이다. 다음 E2E 조건에서는 코드 생성 전에 역할을 선택하고, 역할 안의 정형 작업은 매번 Claude→Jev 후보 생성 왕복 없이 실행하며, 검사 결과·목표 변경·불확실 상태에서만 재판단해야 한다. Jev의 완료 승인은 독립 테스트 결과를 대체하지 않는다.

## 최종 실측과 검증 정정

복구 실행에서 native Agent 호출1회/도구 응답1회/정확한 worker 유형 및 claude-opus-5-5 모델을 확인했다. 규칙v2에 따른 서브에이전트 실행 연결은 성공했다. 그러나 산출물 전체 성공은 아니다.

독립 검토에서 observed_facts[9]의 evidence_ids가 `caller-supplied revision field (no evidence ID)`로, 입력의 3개 ID 집합 밖임을 확인했다. 최초 출력 검증기는 revision+배열만 검사해 output_contract_valid:true로 과장했다. src/benchmark/evidence-output.mjs에 ID 집합 검사와 형식 검사를 추가하고 두 CLI에 연결했다. 저장 응답의 재검증은 false/UNKNOWN_OR_MISSING_EVIDENCE_ID다. [정정 기록](../../benchmark-runs/d024-dispatch-02/verification-correction.json)이 기존 result.json의 aggregate status/출력 계약 판정을 대체한다. 원본은 수정하지 않았다.

**최종: 실제 규칙 생성·Jev 검증·갱신·native 위임 성공 / 출력 근거 계약 실패 / 전체 코딩 E2E 개선 미검증.** 실패를 고친 응답이 나올 때까지 유료 반복하지 않았다. 새 Jev 호출은 고정 질문3+규칙3=6회,8631입력토큰. 누적43회46505입력토큰, 보수적USD0.027903<1, pending/blocked없음. 월29/60M배분 추정 누적USD0.0224774, 실제 추가 청구액은 미확인.
