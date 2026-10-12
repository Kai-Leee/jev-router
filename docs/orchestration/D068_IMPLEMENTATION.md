# D068 — 수리 입력·원인·호출 범위 연결

[실험 계약](D068_EXPERIMENT.md), [병렬 역할](../agents/D068_PARALLEL.md), [실행 전 동결](../../benchmark-runs/d068-preflight/launch-gate.json). 새 실제 실행과 독립 채점은 종료했다. **공개84/85·독립63/63, 제품 미완료**다. 아래 실행 전 바이트·후보 결과는 저장된 D067 공개 실패 재생이며, 실제 새 실패와 구분한다. [실측 결과](D068_RESULTS.md).

- `adaptive-repair-projection.mjs`: 반복 revision/runtime/check 정보를 inline 참조로 묶는다. 정확히 복원할 수 있는 leaf 인터페이스를 중복 전달하지 않는다. 정상 설치 진행 stdout만 해시·바이트·근거 연결을 남겨 생략하며, 실패 로그·stderr·traceback·공개 case·미실행·원문 요구사항은 유지한다. 전체 투영은 `lossless_roundtrip:false`다. 정상 stdout 원본을 제공하면 전체 상태의 정확한 복원이 검증된다.
- `adaptive-failure.mjs`: 확정 HTTP400을 응답 부재 때문에 uncertain으로 바꾸지 않는다. 정제한 `terminal_cause`를 영수증→판단기→실행기→최종 결과로 연결하고 앞선 공개 실패 및 정산 상태를 분리한다. 실패 POST를 자동 재전송하지 않는다.
- `adaptive-repair-scope.mjs`: 관측 실패 소유자와 미실행을 구분한다. 공개 오류와 해시가 고정된 파일에서 정적 정규식 문법 오류가 확인되면 담당자 먼저 수리 후보를 제공한다. 미지원 동적 값·변경·불명확한 연결은 근거로 채택하지 않는다. host Python의 부분적 정적 진단이며 실제 공개 환경 검사를 대신하지 않는다.
- 실행기는 선택된 작업자만 재호출하고 나머지 산출물 바이트를 이어 받는다. 모든 공개 검사를 다시 실행한다. `projectRepairFailure`는 라운드당 한 번 적용하며 작업자에게 참조 dictionary를 포함한 `failure`를 전달한다. Jev 수리 판단도 같은 문서화 투영을 사용한다.

새 `adaptive-dag-comparison/v3` manifest의 `jev_all` 한 조건에만 opt-in 한다. 생성 prompt/schema가 일치한 D066 catalog를 재사용하며 새 준비 호출은0이다. planner/executor 소스는 변경됐으므로 생성 소스 전체가 동일하다고 주장하지 않는다. runtime source pins와 변경 허용 목록을 검증했다.

## 실행 전 측정과 발견

`node benchmark-runs/d068-preflight/combined-repair-replay.mjs benchmark-runs/d068-preflight/combined-repair-02`는 원래 Jev 요청188240B→80448B, 감소107792/188240B=57.2631%를 확인했다. 공개85case는 일치하며 수리 후보 작업자 수는1·2·13명에서1·2명이다. 이는 토큰 절감·모델 수락·제품 완료 측정이 아니다.

`npm test` 최종1072/1072 통과,27.940초. 처음에는 sandbox localhost12개와 기존 실제 장부에 의존하는 mock2개가 실패했고, 권한이 허용된 실행에서도 mock2개 실패가 남았다. 두 테스트를 독립 임시 장부로 바꾼 뒤 모두 통과했다. 실제 장부는 불변이다. [세 회귀 로그와 해석](../../benchmark-runs/d068-preflight/regression-summary.json).

독립 검토 중 새 정적 진단이 `AugAssign`을 무시해 잘못된 담당자를 만들던 결함을 발견·수정했다. 또한 실패 arm의 수집 완료를 cohort 성공으로 반환하던 오류를 수정했다. 현재는 known failure가 cohort failed/CLI exit2이며 `terminal_collection_complete`와 제품 완료는 별도다. [검토 기록](../agents/D068_REVIEW.md).

## 실제 적용 결과와 남은 문제

새 실행의 수리 wire는172,019→97,071B로43.5696% 줄었지만 다시HTTP400 model_input_limit로 실패했다. 상태투영170,395→95,447B와 최종 직렬화 본문을 구분한다. 정상 stdout7개·27,692B를 생략했고 공개85case는 보존했다. [재구성 측정](../../benchmark-runs/d068-projection-live-failure-01.json).

최종 오류 전파는실제로 `repair/HTTP_ERROR/400/model_input_limit/false`를 보존했다. 원본 pending정산을 바꾸지 않고 이후환불 r666만정산해 분석02에 연결했다. 확정실패·추론량미상·실패청구0·장부정산완료는 별도다.

관측실패owner3명/consumer포함4명 후보에 전원10명은 없었다. 다만 통합case9요구사항 및12unit묶음의50요구사항으로범위가넓어졌다. case내부미도달 assertion은 현재 unexecuted목록에보이지않는다. 고정 assertion ID와산출물단위수리계약은미구현제안이다. Jev수리답변0/worker0이므로 실제수리호출절감은미측정이다. [범위분석](../../benchmark-runs/d068-scope-live-failure-01.json).

추가 유료 재실행·과거 후보수정 없이 원본과 실측을 보존했다. 시간30분43.397초, 관측토큰4,350,647/환산$10.569204; 실패usage가없어 전체추론량과환산총액은null이다. 소스·문서·새 로컬 증거는 미커밋이다.
