# D033 — 2026-10-10 시스템 지시문 축소 20회 실험

사용자가 기존+후보4종 각각4회=20 Claude 호출을 명시 승인했다. Jev호출0,작업자Opus5.5 medium 고정. 원래 D029의 packaging3파일 작업을 고정하여 system prompt만 바꾼다. user request12522bytes,원문명세·plan·모델·effort·도구설정 동일.

조건: baseline4203bytes,compact_contract2370,output_dedup3216,local_metadata3578,no_tools_template3968. 각 변형은 baseline에서 독립 변경. compact는 instructions만 남기되 외부출력envelope 보존; output은 출력스키마중복 제거 후 request.outputContract 참조; metadata는applicationNotes/research만제거; no-tools는사용가능도구분기만제거. 변경본문은 private protocol에 보존.

실행순서는5조건을round별rotate,총4round순차실행. provider캐시reset없음/순서완전균형아님. cache carryover는조건 효과와분리 불가할수있어 입력토큰전체·cache-write/read 각각기록. 정답을미리보내지않고 숨은검사feedback없음. 유효하지않은응답도사용량/비용보존,불확실한provider실패면새호출중단/재시도없음.

품질: 모든출력은형식/파일소유권검사. 생성된packaging3파일을freshcandidate에넣고 나머지8파일은D029성공본으로고정하여동일Dockergrader로검사. 따라서조건부packaging통합시험이지전체프로젝트20개생성아님. setup.sh는호스트에서실행하지않고격리Docker에서만평가. template누락/차이가관측되면baseline대비기록.

지표: 요청+systembytes,실제input/cache-write/cache-read/output토큰,CLIwall/APIreportedtime,CLIAPI환산비용,출력유효성,독립grade,반복별값/평균/범위. 토큰은iterations/modelUsage를다시더하지않는다. 비용은추가청구액아님. reduction비율은baseline조건평균분모. n4는동일과제반복이며일반화/calibration아님.

실행소스는추가된실험script SHA로protocol에핀고정. 기존commit은기반코드표시. 새실험값은추론종료후별도결과에기록.추가유료호출을자동확대하지않는다.

사전 검토 정정: 전체 루프중단 label,고정8파일의메모리스냅샷/해시,파일저장후valid_output설정을보완한후유료실행. provider실패메타데이터의상세필드는현재raw로그외row에모두담기지않는한계가남아있다. 실제실패가발생하면원시로그를보존하고재전송하지않는다. baseline본문은기존D031실행기의system문자열과동일하게고정했다.
