# D088 — 모델 정본 통합과 Codex/Jev 재측정

사용자2026-10-16: Jev 입력 검증과 정산의 허용 모델을 같은 정본으로 맞춘 뒤 Codex 판단과 Jev 판단의 공개·독립 검사/총 시간/캐시 포함 토큰/비용을 다시 비교. 기존결과보존. Mac고정gpt-5.6-sol/high1쌍순차(Codex→Jev), 기존 D087 scope(D083+부분수리+공개담당근거)그대로. D085추가3기능도입/작업자변경/이전보류채점재개없음. 새로운worktree만수정한다.

소유권:
- root: 환경/보존/실행/독립채점/집계/결정·상태·결과문서. 유료호출은root만시작.
- model_registry: 새모델정본JSON+loader, budget에서읽기, 신규admission v5에서읽기, v1-v4원문불변, 실제1.14허용·unknown미래모델차단·요청SHA/한도검사불변의집중검증. 원본ledger변경/네트워크/유료호출금지.
- runner_pair: 새pointsmanv4+새D088manifest와정본모듈/정책source핀, v5검사실제전송연결, gateway·CodexCLI/단계회귀. v1-v3registry·기존manifest/pins원문불변. 모델정본/budget/v5파일은model_registry담당만수정. 네트워크/유료호출금지.

기존 ledger절대정본 /Users/lee/workspace/plugins/jev-router/benchmark-runs/jev-usd1-budget.json 를그대로쓴다. 복사/별칭/초기화금지. 예산무상한정책은기존대로, 실제잔액/예약·과금배율/불확실성차단유지. 무차별prefix/future모델허용금지; 기존관측4개정확한응답label과문서기반요청alias를정본으로관리. 일반provider alias는정확한revision증거가아니다.

질문과검증기본은영어/같은catalog/choice-only 양쪽동일/공개93·독립63/동시작업2·max30/수리2회. 통합전기록된D087차단request를이용해1.14입력허용+native정산을같은정본으로관통하는무과금회귀와미지모델·source변조차단을검증한다. 이후source동결후새결과폴더에서각1회. 실패/미실행을0점 또는가속으로바꾸지않는다. 추정가격/실제월구독청구분리,캐시는input에포함되어재가산않음.
