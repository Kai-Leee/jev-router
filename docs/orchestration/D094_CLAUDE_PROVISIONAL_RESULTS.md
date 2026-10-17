# D094 — 잠정 모델·노력도 선택과 blocked 복구 재실행

2026-10-17. 사용자가 실측 없이 잠정 선택하도록 질문 수정, unknown→blocked 구분과 복구, 기존 결과 보존 후 실제 Jev+Claude 재실행을 요청했다. 구현과 단일 실제 실행·정산을 종료했다. **공개93/93 통과·독립59/63으로 제품은 미완료다.** 배정 중단은 해소됐지만 전체 완료 효율 우위는 아직 입증되지 않았다.

| 조건 | 완료 | 공개 / 독립 | 수리 회차 / 작업자 재호출 | 종료 총 시간 | 캐시 포함 총 토큰 | 참고 환산 USD |
|---|---|---|---:|---:|---:|---:|
| 기존 Claude 판단 D093v13 | 완료 | 93/93 · 63/63 | 2 / 3 | 1,829.325초 | 1,245,707 | 11.3186074 |
| 기존 Jev+Claude D093v13 | unknown 전송 전 중단 | 공개93개·독립미실행 | 0 / 0 | 19.367초 | 200,860 | 0.1094046 |
| 새 Jev+Claude D094v14 | 미완료 | 93/93 · 59/63 | 2 / 2 | 1,342.232초 | 950,634 | 6.8788884 |

기존 완료 Claude 실행을 분모로 새 종료 wall−26.6269%, 토큰−23.6872%, 참고 환산−39.2250%다. 새 결과가 독립 검사4개 실패이므로 완료 속도비는 null이다. 과거19초는 개발을 하지 못한 중단값으로 속도/비용 효율의 기준으로 해석하지 않는다. 각조건1회·새DAG/코드·다른고정소스단계·실행시점차이의 역사적 비교다. 새 질문을 Claude 판단자에도 준 동시 A/B는 실행하지 않았으므로 질문만의 인과효과나 일반모델순위는 주장하지 않는다.

[최종 비교 JSON](../../benchmark-runs/d094-claude-provisional-20261017-01/comparison.json) · [원시 재집계](../../benchmark-runs/d094-claude-provisional-20261017-01/native-audit.json) · [원래 D093 전체 결과](D093_FULL_PROVIDER_RESULTS.md).

## 변경과 실제 발동

- [질문 계약v4](contracts/worker-profiles.v4.json)는 실측이0이면 성공률은null로 유지하되 주어진 요구사항·쓰기범위·모델특성·공식참고가격으로 잠정 선택하도록 명시한다. 데이터 없음과 실행가능후보 없음을 구분한다. 모델/노력도20조합과원래D092공개이력은같고Claude호환관측은0이다.
- [라우터v4](../../src/benchmark/worker-profiles-v4.mjs)는 원래 unknown 응답을 blocked.json으로 보존한 뒤, 작업자 전송 전에 고정 근거 재확인 질문1회를 허용한다. 동일후보·동일사실·동일실측null을 유지하고 이전응답해시로연결한다. 임의모델대체나HTTP재시도가 아니다. 계속unknown이면 status:blocked/dispatch_started:false/outcome_uncertain:false로끝난다. 이미전송한결과불확실은여전히uncertain이고재호출하지않는다. 종료한과거실행을재개하지않는다.
- 실행기와scheduler는 이 정확한 전송전 block을 일반 실행불확실로 바꾸지 않고 journal의 worker/task 작업을 blocked로 닫는다. 진짜 전송불확실을 block으로낮추는상태는거부한다.
- 이번 실제 선택7회는 전부 samples0/cold_start_provisional이다. 초기5명Opus5.5/medium, 첫수리1명Sonnet5.5/high, 마지막수리1명Opus5.5/medium으로실제호출됐다. unknown0·blocked0·복구재질문0·자동대체0이다. 따라서 잠정선택→실제개발은 live 검증됐고, blocked→재질문→정확히1회dispatch 및 blocked고갈은 오프라인통합검사로 검증했다. 이번live에서 복구가발동했다고표현하지않는다.

## 개발과 수리 결과

초기 공개84통과/9실패/0미실행→첫수리뒤84/9→마지막수리뒤93/0이다. 수리 작업자2회 모두 실제파일변경이 있어 byte no-op은0이다. 첫 Sonnet/high는 endpoint_module.py.jinja를 바꿨으나 공개통과수가늘지않았고122,372토큰을사용했다. 마지막 Opus/medium은 schema/operations.py를 바꿨고126,490토큰을사용했다. 수리회차2·재호출2와이두비용을모두집계했다. 이후독립Docker채점은63개중59통과/4실패다. 독립실패상세를모델입력으로돌리지않았고추가수리·유료재실행을시작하지않았다. 독립4개실패의상세원인수정은남아있다.

## 사용량과 가격 경계

Jev13POST=입력328,814+출력24,556=353,370토큰, Claude7CLI=일반입력14+캐시읽기0+캐시생성393,037+출력204,213=597,264토큰이다. 합계입력721,865+출력228,769=950,634토큰이며 thinking은출력에이미포함돼다시더하지않는다. Claude native stream의최종usage와정규화영수증을직접대조했다. 실제20제출은JevPOST13·Claude프로세스7단위이며CLI내부HTTP요청수와같다는주장은아니다.

공식요율/보고된native캐시TTL/표준global API를가정한Claude참고6.6816USD + Jev과거입력100만토큰당0.6USD환산0.1972884USD = 참고6.8788884USD다. 실제구독청구액·월정액배분액은null이다. [가격 계약](contracts/claude-pricing.v1.json)의출처와가정은그대로유지했다. 새유료연결probe0이며이값은이번한조건의새소모다. 과거D093실패준비/probe비용은그결과에보존하고중복합산하지않는다. 기존카탈로그를같이재사용해새카탈로그모델호출0이다. 메인개발대화·개발용에이전트사용량은benchmark영수증범위밖이다.

공유장부ID는동일하고이번구간정산+13·입력+328,814·pending0·blockednull이다. 이번영수증13개와일치했다. 공유원장은복원하거나초기화하지않았다.

## 검증·보존과 자체 실패

관련검사79/79·skip0이며표본0잠정선택/null유지,unknown→blocked→선택후실제executor1회,재질문고갈시worker0,진짜통신불확실재시도0,실제gateway3단계와복구질문6개guard,예외상태와journal을검사했다. 실제계정20조합을모두새로호출한검사는아니다. 무추론CLI/인증/Docker사전검사도통과했다.

새검사작성초기에는helper의파일핸들정리를빠뜨린실패와helper반환객체를잘못사용한실패가있었고수정후79개통과했다. 첫카탈로그재사용사전검사는새runtime/scheduler 변경을거부했다. v14에서두파일만명시허용하고gateway정확일치검사를더했으며원래카탈로그prompt/schema/결과·과거allowlist는변경하지않았다. 첫등록스크립트는문자열패턴불일치로중간중단했고남은등록만별도스크립트로완료했다. 이실패들은유료실행전발생했고원래로그/스크립트를보존했다.

[v14계약](contracts/pointsman-routing.v14.json)/새manifest/새진입점 bin/claude-provisional-cohort.mjs로실행했다. 과거v3/v13질문/계약은다시pin하지않았다. 동결한162소스변경0·이전9,941파일SHA변경0, 실행전후기존컨테이너5개동일·이번계획이름잔여0이다. 원래D093의동결목록은전체간접의존성이라는주장을하지않는다. 새v14에는이번에수정한scheduler까지명시pin했다.

실제실행명령은 node bin/claude-provisional-cohort.mjs run --spend --execution-host mac --out benchmark-runs/d094-claude-provisional-20261017-01/cohort 였다. 새실행시출력은다른빈경로여야하며종료결과를재개하지않는다. 원시재집계는이번출력과동결snapshot을쓰는 audit-terminal.mjs로실행했고wx출력을덮기위해재실행하지않는다. 테스트로그 tests-final.tap,환경검사 environment-preflight.json,source-after/preservation-after/container-audit.json을같은실행폴더에보존했다.

로컬미커밋수정·비공개실행자료·검증보조파일이남았다. 커밋/푸시/전역설치는하지않았다. native CLI HOME의내부cache/OAuth refresh 부수효과는미검증이다. 새완료조건을모두통과시키기위한후속실험은아직시작하지않았다.
