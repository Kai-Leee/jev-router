# D061 — 최대 작업자 수30

사용자가30개는 작업자당 의무가 아니라 최대 작업자 수라고 확인했다. 새 v3기본 선택지는2..30명이며, 현재 의무 개수를 초과하는 후보는 제외한다. **30명을 항상 생성하거나 동시에30명 실행하는 설정은 아니다.** workflow의 기본 동시성은2다. 명시 callback API의maxConcurrency override는 기존처럼 가능하지만 이번 검증은2로 실행했다.

질문 정본: [sequential-allocation.v3.json](contracts/sequential-allocation.v3.json). [allocator](../../src/orchestration/sequential-allocation-v3.mjs), [30명 envelope](../../src/orchestration/sequential-envelope-v3.mjs), [workflow](../../src/orchestration/bounded-verified-workflow-v3.mjs). 기존 v2/D059실행기를 수정하지 않고 새경로를 만들었다. D060기록의8개근거 해시검사도 통과했다.

작업자당 임시 상한은 기존 `ceil(1.25*N/count)`를 유지한다.80개/30명이면4개,80개/3명이면34개다. 최소배정/최종잔여상한/최대3회명시재배정/검증후후속해제를 유지한다. 숫자 개수만으로 독립성·난이도 균형을 주장하지 않는다.

재현: `node scripts/bounded-verified-preflight-v3.mjs`. [원본결과](../../benchmark-runs/d061-preflight/result.json). **모의 응답이30명을 선택하도록 한 경계 실험**이며 실제Jev결과가 아니다. 초기65개배정 거부 후20명×3개+10명×2개=80개,85고유테스트연결 유지. 전체state codec왕복일치. 모의요청85회,최대127187wirebytes. 이 경로는 이전 유료실행기의40회한도를 넘으므로 실제연결전에 요청/입력토큰한도와기존장부잔여를 검사해야 한다. 이 문서가 한도자동확대나 장부초기화를 승인하지 않는다.

작은독립fixture에서30개작업의gate/scheduler실행을 검증했고 관측최대동시성2였다. 실제제품80/85입력은 실행registry85개가누락되어 계획·작업자콜백0회로차단했다. 제품개발·독립63채점·실제모델호출은 하지 않았다. 공유검사준비조건/실행mapping 미완료라는 D060경계는그대로다.

`node --test test/sequential-allocation-v3.test.mjs`:12/12통과.31명거부·작은입력후보제한·30명envelope통과 포함. 최종 `npm test`:811/811통과,0skip,15950.101709ms. [전체로그](../../benchmark-runs/d061-preflight/regression.log). 실제속도·토큰·비용절감 미측정. [리뷰](../agents/D061_REVIEW.md).

새코드/계약/테스트/문서/무과금실험기록은 미커밋으로남겼다. 유료호출·장부변경·기존PersonalOS수정·컨테이너생성·커밋·푸시는없다.
