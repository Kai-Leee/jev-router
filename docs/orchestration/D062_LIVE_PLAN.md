# D062 actual Jev bounded planning

User explicitly requests actual Jev-selected experiment using D061maximum30workers. Root runs actual count2..30, bounded sequential membership/refinement and per-worker profile selection on public80obligations/85testspecifications. Count is not forced30. Source snapshots and raw sanitized requests/answers/receipts retained.

Fresh separate planning-only runner uses existing cumulative10Mledger, noreset, noautomaticretry. Initial remaining3046490inputtokens. Newphase ceiling3Minput and120requests, chosen to accommodateD061mock85requests; cumulativeledger stillgoverns reservations. Unknown paid outcome stops. Newrun output only; HTTP400modelcontextlimit is possible despite localwirevalidation and mustremainfailure,not automaticreplay.

Actual development remainsblocked by85executablepubliccheckmappings, so implementationworkers/executabletests remain0. Measure actual Jev planning success/failure, choices, time, tokens and equivalentcost without claiming productcompletion orspeedgain. Nohiddenfeedback,originalPOSchanges,commit/push.

Command: node scripts/live-bounded-planning.mjs benchmark-runs/d062-live-01 --spend. Do not repeat this paid command merely to inspect results.

## 실제 결과

[result.json](../../benchmark-runs/d062-live-01/result.json), [집계](../../benchmark-runs/d062-live-01/analysis.json), [질문과 답](../../benchmark-runs/d062-live-01/calls/001.response.json). Jev는2..30중 **2명**을선택했다.30명을강제한모의실험과다른실제결과다. 첫작업자 허용범위30..50개에대해 최초73개,재배정79/78/77개를선택했다. 세번재배정후`ALLOCATION_REFINEMENT_EXHAUSTED`로중단했다. 임의절삭·추가자동재실행은없다.

13/13API응답성공, provider오류0. 개수선택1회+최초배정3회+재배정9회,프로필0회. 계획완료실패,실행작업자0,제품테스트0. API정상응답과실행가능한배정생성은다르다.

전체계획시도19782.650208ms. 입력450692/출력10077토큰,토큰팩환산450692/1M×0.60=USD0.2704152. 월정액실제청구와구독배분은null이다. 장부누적7404202/10000000,잔여2595798,미정산0. 영수증합계와장부증분450692일치. 모의테스트에서범위안선택을반환한사실은실제모델의제약준수를입증하지못했다.

구조적으로각include/exclude질문은멤버십을따로선택하고,30..50전체개수는자연어질문과사후검증에맡겨져있다. 최대작업자수를높여도실제선택2명은가능하며,동일한전체후보재질문이부하균형을회복하지못했다. 왜개별답을선택했는지내부근거는제공되지않았다. 공유파일회피와개수제약사이의충돌은가능한설명이며원인확정이아니다.

다음설계후보는개수예산이남은slot마다후보중하나를직접선택하게하거나,정해진용량을가진작업자중담당자를선택하게하여선택지자체로용량을보장하는것이다. 모델선택후몰래상위몇개만남기는절삭과다르다. 이새정책은이번에구현·유료재실행하지않았다. 공개검사85매핑문제도여전히남아있다.

실행소스11개와보관사본해시가종료후모두일치했고run중drift0. **별도계측결함:** 이전nestedplanning경로가정으로event run_id/attempt_id가`benchmark-runs`로기록됐다. 원본디렉터리/개별요청/영수증/group_id는남아있지만자동대시보드run별집계에이식별자를그대로쓰면안된다. 종료후미래실행기만basename(dir)로수정했으며과거이벤트를덮지않았다. `node --check`와관련12개테스트통과;수정후유료호출없다.

새코드·문서·실제질문/답/사용량자료는미커밋으로남겼다. 비밀키출력,기존PersonalOS변경,제품컨테이너생성,커밋·푸시는없다.

## 별도 모니터와 정정

`node scripts/monitor-d062.mjs --spend` 실행 완료. [Opus 원문](../../benchmark-runs/d062-monitor-01/result.json): Opus5.5 medium, 21876.290958ms, 입력2/캐시생성2021/출력1629토큰, API환산 USD0.048756, 실제청구 null. Jev 시간·비용과 별도다. 집계만 읽은 검토이며 원본 요청 재생은 [독립 검토](../agents/D062_REVIEW.md)가 담당했다.

모니터 원문의 “every round overshot the maximum by 27 to 29”는 계산 오류다. 정정: 73/79/78/77에서50을 빼면23/29/28/27이다. 원문은 보존했다. 모니터의 top-k 절삭 제안은 채택하지 않았다. 다음 정책은 Jev의 선택 단계 자체에 용량을 반영하는 설계 후보이며 미구현이다. [구조화 기록](../decisions/D062.md). 유료 프로세스는 모두 종료됐다.
