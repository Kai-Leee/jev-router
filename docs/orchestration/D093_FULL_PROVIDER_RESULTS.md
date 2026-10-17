# D093 결과 — 모델·노력도·공개 성과를 사용한 실제 개발 비교

2026-10-17. 실행과 공개·독립 검사를 종료했다. Codex 판단과 Claude 판단 경로는 완료했고, Jev 경로의 전체 완료 우위는 입증되지 않았다. 각 조건 1회이며 새로운 DAG와 코드를 생성하는 전체 경로 비교다. 같은 모델만의 인과 실험이나 여러 과제의 평균 성능이 아니다.

| 판단 → 작업자 | 전체 완료 | 최종 공개 / 독립 | 수리 회차 / 작업자 재호출 | 종료 총 시간 | 캐시 포함 총 토큰 | 참고 환산 USD |
|---|---|---|---:|---:|---:|---:|
| Codex → Codex | 완료 | 93/93 · 63/63 | 2 / 3 | 2,062.226초 | 981,674 | 2.7855016 |
| Jev → Codex | 미완료 | 91/93 · 63/63 | 2 / 7 | 1,880.303초 | 1,302,521 | 2.7598444 |
| Claude → Claude | 완료 | 93/93 · 63/63 | 2 / 3 | 1,829.325초 | 1,245,707 | 11.3186074 |
| Jev → Claude | 실행 전 판단 불가 | 공개 93개 미실행 · 독립 미실행 | 0 / 0 | 19.367초 | 200,860 | 0.1094046 |

원문 재집계는 [세 단계 최종 집계](../../benchmark-runs/d093-full-provider-20261017-01/metrics-three-phase-summary.json), [Codex 독립 감사](../../benchmark-runs/d093-full-provider-20261017-01/metrics-independent-audit.json), [Claude 독립 감사](../../benchmark-runs/d093-full-provider-20261017-01/claude-classifier-recovery/metrics-classifier-audit.json)를 사용한다. 시간은 계획·판단·작업자·수리·검사·독립 채점이 들어간 arm wall time이다. 병렬 호출 시간의 합이 아니다. 공통 환경 준비·모델 연결 probe와 잘못된 이전 실행은 별도 집계한다.

## 모델·노력도와 실측 이력

Codex는 앱 제공 23개 모델·노력도 조합을 전달했다. 두 경로 실제 작업자 21회는 모두 gpt-6.1-sol/high였다. 이번 표본에서 작은 모델·낮은 노력도 선택을 통한 절감은 관측되지 않았다. Claude는 4모델×5노력도=20후보를 전달했다. Claude 판단 경로 작업자 9회는 Opus5.5/medium7, Sonnet5.5/medium1, Sonnet5.5/high1로 실제 호출됐다. 따라서 high 고정은 아니며 모델과 노력도 선택이 실제 실행까지 연결됐다. Sonnet/high의 최초 범위는 수리 때 Opus/medium으로 다시 배정됐다. 이 재호출을 비용에서 빼지 않았다.

고정 공개 이력 전체 pool은85건이고 현재 후보와 exact model+effort가 일치하는 관측은 Codex38건(6.1/high34·Luna/high4), Claude0건이다. 5.6/high47건을 현재 후보 성과로 전이하지 않았다. 분모0의 성공률은 null이다. 과거 공개 성과·실패·no-op·시간·캐시 포함 토큰을 질문에 넣었지만, 모델이 내부적으로 어느 신호 때문에 선택했는지는 응답에 없어 확정하지 않는다. 독립/숨김 검사 상세는 모델 입력에 넣지 않았다. 조건 사이 이력을 온라인 갱신하지 않았다.

Jev+Claude 최종6POST는 모두 사용량이 있는 정상 응답이었으며, worker_profile 두 답이 unknown이었다. 등록 선택·worker factory·Claude CLI dispatch는0회다. 구형 오류명 CODEX_WORKER_PROFILE_V2_UNKNOWN을 실제 adapter 미지원으로 해석한 초기 설명은 철회한다. DAG의 원시 상태는 generic WORKER_UNCERTAIN이지만, 별도 원문/코드 경계 대조로 알려진 전송 전 중단임을 확인했다. 원래 status와 journal은 수정하지 않았다. unknown을 임의 모델로 치환하거나 자동 재시도하지 않았다. 19.367초는 개발 완료 속도가 아니다.

## 재수리와 효율

Codex 판단 공개 결과는82→84→93통과, Jev 판단은15통과·11실패·67미실행→90→91통과였다. Jev의 수리 작업자7회 중5회가 입력과 같은 파일을 반환한 no-op이며347,502토큰·참고0.8839USD를 사용했다. 초기 템플릿 SyntaxError 하나가 여러 실패에 전파되면서5명 전체를 불렀고, 마지막 enum 정체성 실패에서는 producer인 models.py가 수리 입력과 쓰기 범위에서 빠졌다. [원문·파일·담당 분석](../../benchmark-runs/d093-full-provider-20261017-01/codex-outcome-analysis.md).

Jev→Codex는 Codex→Codex보다 종료 wall이8.8217% 짧지만 미완료다. 캐시 포함 토큰은32.6837% 증가했고, 참고 환산액만0.9211% 낮다(각각 Codex 기준 분모). 두 제품이 모두 완료되지 않았으므로 완료 가속비는 null이다. Claude 수리3회 중1회도 no-op으로121,722토큰·참고1.072276USD를 사용했다. Claude 판단 경로는78통과·7실패·8미실행→92→93통과 후 독립63/63을 통과했다. 가족과 source phase가 다른 Codex/Claude 사이 차이를 모델 하나의 효율 개선으로 해석하지 않는다.

## 가격·캐시·누락 경계

표의 USD는 공식 표준·단기 요율 환산과 Jev 과거 token-pack 입력100만당0.6USD 환산을 합친 참고값이다. 실제 청구액·월정액 배분은 모두 null이다. Jev→Codex의 참고액은 Codex2.43616 + Jev0.3236844다. [Codex 가격 계약](contracts/codex-pricing.v2.json), [Claude 공식 문서 보존·계약](contracts/claude-pricing.v1.json)에 근거와 가정을 보존했다. Codex의 미보고 cache-write, 서비스 tier, 실제 내부 노력도 같은 미확인 값은 확정하지 않는다.

캐시 read는 Codex input의 부분집계다. Claude는 원시 ordinary input+cache read+cache creation을 각각 한 번 합쳐 input을 만들고 output을 더한다. thinking은 output의 부분집계라 다시 더하지 않는다. Claude 완료 경로는 ordinary input50 + cache read227,957 + cache creation721,712 + output295,988 = 총1,245,707토큰이다. 캐시 토큰을 빼거나 다시 더하지 않았다. 제공업체별 토크나이저가 다르므로 합계는 영수증의 사용량 합이며 동일 정보량 단위라는 주장은 아니다. 네 경로의 판단·개발·수리 호출을 포함하지만 메인 개발 대화와 개발용 서브에이전트 자체 사용량은 별도 미계측이다. CLI invocation 수와 native 내부 API iteration 수도 구분한다.

선택한 네 조건 합계는3,730,762토큰·참고16.973358USD다. 앞선 v12 실패 회복629,892토큰·참고4.996720USD와 원래 연결 probe4회5,120토큰·참고0.0436676USD를 보존·별도 합산하면 실제 관측 모델 호출 전체는4,365,774토큰·참고22.0137456USD다. 세 실행창과 원래 연결 probe 창의 합은6,560.319초이며 조사·빌드·사전검사·실행 사이 공백을 제외한다. 이 합계도 실청구액은 아니다. 실패 준비 비용을 성공 실행에서 숨기거나 probe를 중복 집계하지 않았다.

## 실패한 검증 장치와 수정

1. 원래 Claude는 빈 macOS 임시 경로의 /var와 /private 별칭 검사 때문에 전송 전에 거부됐다. v12는 검증된 OS별칭만 허용하며 다른 symlink·비어 있지 않은 workspace는 계속 거부한다.
2. v12에서는 성공 응답의 생성 코드 안 오류 문구를 정규식이 스캔해 MODEL_UNAVAILABLE로 잘못 표시했다. 두 작업자 native success·스키마 유효·155,791토큰을 오프라인 재검증했고 실패 원문은 유지했다. v13은 실제 terminal 실패 metadata에서만 오류를 분류한다. 관련29/29 및 새 gateway4/4 검사 통과, 후보20개 실행 연결 검사는 가짜 프로세스이므로 실제 계정20조합 지원 증거가 아니다. 실제 연결 probe는4모델 medium만 검사했다.
3. v12 빈 후보의 공개 담당 수집 ENOENT도 오프라인 재현해 남겼다. 이번 수정에 포함하지 않았고 새 v13 완료 경로에서는 발생하지 않았다.
4. Docker 비권한 빈 출력으로 잘못 만든 v12 컨테이너 보고와, root 보존 감사가 절대 경로 앞에 root를 다시 붙여4파일을 변경으로 오인한 보고도 원문을 보존했다. 권한 있는 실제 목록과 정규화한 직접 SHA 비교로 별도 정정했다. 독립 감사의 delta 파일 경로 첫 시도 오류도 수정 이력에 남긴다.

기존 v10/v11·v12 계약과 실행은 고치거나 재개하지 않았다. Codex 쌍은 원래 고정 소스, Claude 최종 쌍은 새 v13의 동일 고정 소스를 쓴다. paid 중 새153소스와 snapshot 변화0·이전7,691파일 직접 해시 변화0을 root와 별도 감사가 확인했다. 실행 전후 기존 컨테이너5개가 동일하고 이번 실험 잔여0이다. 로컬 미커밋 변경과 비공개 원문·스냅샷이 남았으며 커밋·푸시·전역 스킬 설치는 하지 않았다. native CLI의 HOME 내부 cache/OAuth refresh 부수효과는 미검증이다.

재현 진입점은 bin/provider-cohort.mjs(원래 Codex 쌍), bin/claude-classifier-cohort.mjs(최종 Claude 쌍)이다. 실제 호출에는 run --spend --execution-host mac --out <새 빈 경로>를 사용했고, check는 사전 무추론 검사다. 원래 Codex 조건을 재현하려면 원래 동결 source snapshot과 v10 계약을 함께 사용해야 한다. 현재 작업트리에서 원래 진입점을 그대로 실행하면 source drift로 거부되며, 이 거부를 피하려고 역사 계약을 재고정하지 않는다. 현재 Claude 새 opt-in은 v13이다. 이전 출력 디렉터리를 다시 사용하지 않는다. 집계 검증기는 각 phase의 감사 스크립트와 metrics-three-phase-summary.mjs --authorized-terminal이며 원문/동결 snapshot을 입력으로 쓴다. 이미 생성된 wx 감사 파일을 덮기 위한 재실행은 하지 않는다.

남은 문제는 Jev 수리의 중복 담당 확장·producer 문맥 누락과, Claude 프로필의 unknown 중단 정책이다. 이번에는 정책을 몰래 바꾸거나 성공률을 지어내지 않았다. 추가 유료 재실행은 시작하지 않았다. 문서 전역 링크485개 검사에서는 과거 STATE/WORK_LOG의18개 경로가 이 작업트리에 없었다. 해당 과거 연혁은 복원·조작하지 않았고 이번 D093 결과·기록 링크는 별도 범위 검사에서 확인한다. 원래 전역 실패 보고도 보존한다.

---

## 초기 준비 상태 원문 보존

# D093 — 모델·노력도·공개 성과를 사용한 전체 개발 비교

2026-10-17 진행 중. 개발 완료 속도·비용 개선은 아직 미측정이다. 역할과 범위는 [D093 역할 문서](../agents/D093_FULL_PROVIDER_COMPARISON.md), 입력·출력·영수증은 `benchmark-runs/d093-full-provider-20261017-01/`에 보존한다.

네 조건을 각 1회 순차 실행한다: Codex 판단/Codex 작업자, Jev 판단/Codex 작업자, Claude 판단/Claude 작업자, Jev 판단/Claude 작업자. 가족별 같은 모델·노력도 후보, 실행 전 동결된 D092 공개 성과, 동일 공개 명세·93검사·독립63검사·동시 작업자2·최대30·수리2회를 사용한다. 네 실행은 매번 새 DAG와 코드를 생성하므로 전체 경로 비교이며 모델 선택만의 인과 실험은 아니다. Claude의 이번 구조화 파일 반환 프로토콜과 동등한 과거 관측은 없어 Claude 후보의 성과 분모0/성공률null을 유지한다.

연결 확인은 개발 실행과 분리한다. 첫 Opus tiny 요청은 JSON 성공·캐시 포함1278토큰·참고$0.01084를 반환했으나, controller가 기본 builtin 플러그인3개를 외부 확장으로 분류하여 격리 검사 실패로 기록했다. 원래 실패 영수증은 수정하지 않는다. 실제 초기화 원문·기본 항목·허용 규칙을 대조해 오프라인 재검증하고, 외부 도구/스킬 비활성화와 builtin 의미 미검증을 분리한다. 이 예비 요청은 전체 개발 완료나 모델 라우팅 성능 근거가 아니다.

월 구독 실제 청구액과 API 공식 단가에 따른 참고 환산을 구분한다. cache read는 Codex input의 부분집계, Claude 원시 input은 uncached/read/creation의 별도 항목이며 정규화 전체 입력에 각각 한 번만 더한다. 추론 출력은 output의 부분집계다. 미정산·불확실 호출은 자동 재시도하지 않는다. 종료 후 원본 보존·소스 동결·장부·컨테이너·환경 정리를 감사한다.
