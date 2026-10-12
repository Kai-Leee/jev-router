# D034 — Jev 강제/자동 호출 감사

2026-10-10. 요청: Jev 강제사용의 추가감소와 자동호출여부 확인. 새 유료호출없이 현재소스/실제영수증/저장응답재생 확인.

- 최근 D033의20회는Claude만이며Jev0. 따라서그절감은입력구조변경효과이고Jev효과아님.
- tree-e2e-pilot기본authority는forced. 정상실행이판단지점까지도달하면Jev1회호출하지만답에상관없이single/split둘다실행. decisionUsed:false. 사용자일상어'Jev를반드시따름'과이옵션의의미가다름.
- --routing-mode jev: 같은질문으로Jev1회호출하고답과명시threshold로single/split하나실행,insufficient면needs_evidence로중단. 별도Claude선택호출없음. 계획생성은Claude유지(frozenplan재사용시만신규planner0).
- claude: Jev0,Claude판단1. script: 둘다0,의존그래프heuristic. 자동으로더좋다고판단된것아님.
- worker모델Opusmedium고정. 모든worker/요구사항/실패마다Jev를부르는전역자동dispatcher아님. 문서기반오프라인task/worker/failure/requirement선택함수와실제treepilot연결범위는다르다.
- .codex-plugin/plugin.json은MCP등록만보이며매턴자동호출hook없음. 현재host전체설정을감사한것은아니므로전역설정까지부재라고단정하지않는다.

검증: node --test test/routing-policy.test.mjs 4/4. d029저장답p=.66/충분근거를threshold.65로재생하면forced→둘다,jev→split,script→split. [재생](../../benchmark-runs/d034-routing-audit.json). script와Jev가같은선택을한이사례에서Jev만의추가실행감소는확인되지않았다. 새유료응답/실시간효율증거아님.

추가감소가능범위: Claude반복선택을Jev로대체해matched baseline의선택호출을생략,불필요한분할제외,반복template선택으로planner생략(미구현). 입력중복제거는스크립트업무이며Jev를강제호출한다고더줄지않는다. 강제평가양쪽실행을하나만실행하는것은실험수집비용감소이며Claude보다효율적이라는증거가아니다.

부수효과: 감사문서/무과금재생JSON. 런타임/기본모드/운영threshold/예산/PersonalOS미변경. 새API호출0,commit/push없음.
