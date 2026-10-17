# D093 Claude 실행기 회복 — 성공 분류와 joint profile 전달

이전 phase 원문과 비용을 보존한다. v12에서는 성공 응답의 생성 코드에 있는 오류 문구를 provider 오류로 오인했다. Jev 두 worker_profile 응답은 실제로 unknown을 선택해 전송 전에 차단됐다. CODEX_WORKER_PROFILE_V2_UNKNOWN이라는 계승 오류명을 구형 adapter 등록 실패로 해석한 설명은 원시 응답 대조로 철회한다. 이를 제품 품질 실패와 분리한다. 기존 결과나 계약을 고쳐 쓰지 않는다.

새 v13 계약으로 Claude native 및 Jev+Claude를 새로 각1회 순차 실행한다. task/catalog/공개93/독립63/동시2/최대30/수리2/20개 모델-노력도 후보/고정 D092 공개 이력과 기존 월정액 인증을 유지한다. Claude 호환 실측 이력은0/null이며 성공률을 만들어 넣지 않는다. 변경은 terminal metadata 기반 오류 분류 및 버전 등록이다. joint v3 후보와 unknown 중단 정책은 유지한다. 후보20개 전체가 실제 실행기 경계를 통과하는지 오프라인 검증하고 실행한다. Jev가 다시 unknown을 선택하면 유효한 판단 불가 중단으로 기록하고 임의 fallback 하지 않는다.

root가 실제 CLI·모델·장부·Docker를 담당한다. d086_runner_pair는 provider/worker adapter와 회귀검사를 담당하며 실제 호출은 하지 않는다. metrics_audit는 각 phase 원문을 별도로 감사하고, 실패 준비 비용도 전체 관측 비용에 포함한다. paid 실행 중 source 편집 금지. 실패·불확실 호출 자동 재시도와 fallback 없음. 숨김 검사 상세를 모델에 전달하지 않는다. 이전 uncertain journal은 전송 영수증/파일·코드 경계로 전송 여부를 별도 확인하기 전 재실행하지 않는다.

전체 완료는 공개와 독립 검사를 모두 통과해야 한다. 조기 실패 시간을 완료 속도 개선으로 계산하지 않는다. 각 가족 내 판단 방식 비교이며 다른 source phase의 Codex와 Claude를 모델만의 인과 비교로 해석하지 않는다. 실제 청구와 월정액 배분은 unknown, 공식 요율 환산과 Jev 과거 token-pack 환산은 추정으로 구분한다.
