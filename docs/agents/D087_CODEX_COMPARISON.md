# D087 — Codex 작업자와 판단기 비교

사용자: 2026-10-16 Claude 대신 Codex로 지금 실제 비교 시작. Mac 실행은 이번 지시 및 기존 Codex 예외로 승인됨. 계정 조회에서 지원이 확인된 고정 gpt-5.6-sol/high 작업자(6.1은 현재CLI목록미포함), Codex 판단→Jev 판단 각1회 순차 실행. 공개93/독립63, 캐시 포함 토큰·시간·확인 가능한 비용을 기록하고 기존 결과 보존. Claude 호출·이전 보류 채점·원본 Personal OS 변경 없음.

첫 비교 범위는 기존 Codex 실행기의 D083+local-readiness-v1+public-source-v1이다. D085의 복수 owner 확률 확장/평평한 owner 재질문/생성오류 직접수리 3개와 확률 보존은 아직 Codex gateway에 미연결이므로 이 결과를 D085 동등 비교로 부르지 않는다. 양쪽 choice-only·동일 scaffold·동일 작업자. D085 전체 병합은 별도 설계/검증 과제다.

소유권:
- root: 새worktree/원본상태보존, 환경조회, 실행승인기록, source동결, 한쌍의실제호출·채점, 집계·결정/상태/결과문서.
- runner_pair: 이 worktree의 새 opt-in gatewayv3/새manifest, source고정, catalog realpath identity, 기존sharedledger절대path 연결, 정확한dated1.14 정산지원, 최소오프라인검사. 기존v1/v2소스핀/원본결과덮기금지. 모델호출/Docker금지.

공통 ledger는 /Users/lee/workspace/plugins/jev-router/benchmark-runs/jev-usd1-budget.json이며 복사·symlink·초기화하지 않는다. canonical catalog/read-only 평가원본만 연결한다. 계정·모델·도구 실패는 코드를 수리해 우회하지 않고 기록한다. 전송 gate·질문 문구 검사·receipt·independent grade binding은 유지한다. SDK/CLI이름만으로실제모델을가정하지않고관측identity를남긴다. 정산한도/가격unknown을0으로바꾸지않는다. root만유료호출시작한다.
