# D089 — 수리 입력·담당 근거 개선과 Codex/Jev 재측정

**구현·실제 비교·감사는 끝났지만 시간·단가 절감 목표는 달성하지 못했다.** 기존 공개 실패 T.R10.03은 새 두 조건에서 통과했다. Jev는 다른 공개 실패3개·독립 실패4개가 남았고, D088보다 시간18.02%·토큰29.89%·참고 환산액13.63%가 증가했다. Codex는 수리 입력 구성에서 조기 중단해 두 조건의 완료 속도비를 계산할 수 없다.

[조건](../../benchmark-runs/d089-codex-20261016-01/protocol.json) · [역할](../agents/D089_REPAIR_EFFICIENCY.md) · [결정 기록](../decisions/D089.md) · [원시 집계](../../benchmark-runs/d089-codex-20261016-01/result-audit.json) · [확인된 비교·보존](../../benchmark-runs/d089-codex-20261016-01/comparison-summary-confirmed.json) · [별도 감사](../../benchmark-runs/d089-codex-20261016-01/independent-metrics-report.md).

## 원인과 구현

D088의 Jev 작업자 토큰 증가는 최초 구현보다 수리에 집중됐다. 최초 구현은 Codex218,989/Jev207,523토큰, 수리는171,945/400,356토큰이었다. 같은 작업자를 다시 불렀어도 산출물 revision과 실패가 달랐으므로 단순 task ID 중복 제거는 안전하지 않았다. 전체 입력·현재 실패·권한까지 같은 재호출 signature는 양쪽0건이었다. 다만 Jev의 A13 수리 한 건은 바이트를 바꾸지 못하고68,423토큰·호출90.933초를 사용한 뒤, 다음 판단이 A18로 바뀌었다. [단계별 원본 집계](../../benchmark-runs/d089-codex-20261016-01/baseline-worker-categories.json), [담당·변경 감사](../../benchmark-runs/d089-codex-20261016-01/d088-repair-routing-audit.final.json).

이 원인에 맞춰 새 공통 정책 세 가지를 두 조건에 동일하게 연결했다.

- [검증된 수리 문맥](../../src/orchestration/adaptive-verified-repair-context.mjs): 최초 담당 질문부터 현재 소스 SHA·정확한 줄/열·산출물 revision·이전 변경/무변경과 검사 범위를 전달한다. 긴 줄에서도 실제로 일치한 줄을 보존한다. 전체 감사 문맥을 다시 붙이지 않고 기존 필드를 참조하는 작은 투영을 사용한다. 담당 강제 추가나 작업자 자동 생략은 하지 않는다.
- [작업자 입력 투영](../../src/benchmark/codex-worker-input-projection.mjs): 실제 전송하는 available_files를 쓰기 범위·필수 읽기·실패 경로·인터페이스·정적 import/template 의존 관계로 좁힌다. 전달한 원문 본문·요구사항·실패·권한·완전한 파일 출력은 유지하고, 생략 파일은 경로·바이트·SHA만 기록한다. 불완전/미실행 근거와 해석하지 못한 동적 참조는 전체 문맥을 유지한다. 최초 구현 입력은 축소하지 않는다.
- [공개 docstring 지침](../../src/orchestration/public-docstring-guidance.mjs): 기존 반환형을 보존하며 `ActualType: Meaningful description.`을 출력하도록 초기·수리 작업자 양쪽에 고정 영어 규칙을 전달한다. 파일 자동 수정이나 검사 완화는 없다.

연결은 [D089 manifest](../../benchmarks/e2e-swe/manifests/pointsman-codex-d089.json)의 repair_efficiency 세 설정과 [gateway v5](contracts/pointsman-routing.v5.json)에 고정했다. 기존 모델 정본·입력 v5·정산과 초기/예약/POST 직전 검사·기록을 유지했다. 역사적 gateway v1–v4·입력 v1–v5·모델 정본 원문은 변경하지 않았다.

## 기존 공개 실패 설명 정정과 사전 검증

D088 보고서는 T.R10.03 메시지를 근거로 빈 줄 부족이라고 설명했다. 실제 공개 `_sections`는 들여쓰기를 지운 뒤 알파벳만 있는 `ThingA:`도 새 섹션 제목으로 읽는다. 충분한 빈 줄이 있어도 이 반환형 라벨을 오인하는 것이 재현됐다. 기존 두 수리는 빈 줄을 바꿨지만 이 라벨은 남겼다. [정정 감사](../../benchmark-runs/d089-codex-20261016-01/public-failure-audit.md).

기존 후보의 새 복사본에서 템플릿 문서 줄4개만 바꾸고, 검사 원문을 변경하지 않은 Docker 재생으로 **공개93/93**을 확인했다. 모델 호출0·독립 검사0이며 신규 개발 성능으로 합산하지 않는다. 원본 후보도 변경하지 않았다. [재생 영수증](../../benchmark-runs/d089-codex-20261016-01/public-fix-replay/summary.json).

실제 전송 전 [회귀111/111·실패/건너뛰기0](../../benchmark-runs/d089-codex-20261016-01/root-focused-final-tests.tap), [무추론 환경 점검](../../benchmark-runs/d089-codex-20261016-01/environment-preflight-final.json), [422개 소스 동결](../../benchmark-runs/d089-codex-20261016-01/launch-ready.json)을 마쳤다. 첫 회귀는 과거 manifest를 현재 런타임에 연결한 테스트5건이 실패했다. 일반 현재 파이프라인 검사는 새 정본을 읽게 하고 역사 검사는 보존된 D088 런타임을 명시했다. 운영의 낡은 소스 핀 차단은 완화하지 않았다. [첫 결과105/110](../../benchmark-runs/d089-codex-20261016-01/root-focused-tests.tap)도 보존했다.

D088 수리9건을 같은 바이트로 재생한 입력 축소 실험에서는 다음을 얻었다. 이는 모델 토큰 실측이 아니다.

| 기존 수리 입력 | 원본 packet | 투영만 | 새 공개 지침+투영 |
|---|---:|---:|---:|
| Codex3건 | 457,639B | 457,639B | 468,244B |
| Jev6건 | 1,117,968B | 1,045,735B | 1,057,093B |

Jev 투영만72,233/1,117,968B=6.4611%, 지침까지 포함한 순감소60,875/1,117,968B=5.4451%였다. 초기 탐색의10.79%는 직접 참조하는 Jinja 본문을 빠뜨린 결과라 보수적인 의존 확장 후6.46%로 정정했다. Codex는 미실행/미해결 근거로3건 모두 전체 문맥을 유지했다. [최종 오프라인 재생·소스 SHA](../../benchmark-runs/d089-codex-20261016-01/worker-payload-audit-import-fix.json).

## 동일 조건 실제 비교

Mac에서 Codex→Jev 순서로 각1회 실행했다. 양쪽 작업자와 Codex 판단 모델은 gpt-5.6-sol/high, 동시 작업2·최대 작업자30·수리2회, 같은 catalog·choice-only·격리 CLI0.144.1·공개93/독립63이다. 새로운 catalog나 Claude 호출은0이다. 새로운 공통 정책은 양쪽에 적용했지만 D088→D089는 제어기 조건과 생성 결과가 달라 단일 정책의 인과 실험은 아니다.

실제 실행 명령(종료 디렉터리를 재개하지 않는다):

```sh
node bin/codex-e2e.mjs pair --spend --execution-host mac \
  --out benchmark-runs/d089-codex-20261016-01/pair \
  --model gpt-5.6-sol --effort high
```

| 지표 | Codex 판단 | Jev 판단 |
|---|---:|---:|
| 공개 통과 / 실패 / 미실행 | 60 / 23 / 10, 분모93 | 90 / 3 / 0, 분모93 |
| 독립 통과 / 실패 | 55 / 8, 분모63 | 59 / 4, 분모63 |
| 제품 완료 | 아니오 | 아니오 |
| 전체 실패 시도 시간, 독립 채점 포함 | 13분21.571초 | 22분38.564초 |
| 입력 토큰 | 329,872 | 982,655 |
| 입력에 포함된 보고 Codex 캐시 | 0 | 0 |
| 출력 토큰 | 64,033 | 112,102 |
| 캐시 포함 전체 input+output | **393,905** | **1,094,757** |
| 판단 호출 | Codex4 | Jev13POST |
| Codex 작업자 호출 | 초기6+수리0 | 초기5+수리7 |
| Codex 부분 짧은 문맥·표준 단가 참고액, 추정 | $2.600148 | $4.026080 |
| 과거 Jev 토큰팩 참고액 | $0 | $0.246033 |
| 합계 참고 환산액, 추정 | $2.600148 | $4.272113 |
| 실제 구독 청구/월배분액 | 미확인 | 미확인 |

원시 제공업체 영수증35건, 각8개 공개 suite의 최종22개 산출물 revision, 각38개 후보 파일의 현재 바이트·독립 채점 전후 SHA를 별도 감사로 대조했다. Codex는83개 관측+명시적 미실행10개, Jev는93개 관측을 고정 registry/inventory93개 ID와 중복·누락 없이 대조했다. 숨김 검사 상세는 개발·수리 입력으로 열람하지 않았다. [별도 감사 JSON](../../benchmark-runs/d089-codex-20261016-01/independent-metrics-audit.json).

Codex는 `ADAPTIVE_REPAIR_BUDGET_EXCEEDED`, Jev는 수리2회 뒤 `ARTIFACT_CHECK_NOT_PASSED`로 종료했다. 둘 다 확정 실패이고 uncertain은 아니다. 완료0/2이므로 완료 속도비는 null이다. pair 전체36분3.340초·1,488,662토큰이며 CLI 환경 준비2.419초가 pair 시간에 포함된다. 작업자 병렬 호출 시간의 합을 전체 경과시간에 다시 더하지 않는다.

캐시와 reasoning은 각각 보고 input/output의 부분량이라 다시 더하지 않는다. Jev 제공자는 캐시를 별도 보고하지 않았다. 비용식은 Codex `((input−cached)×4+cached×0.4+output×20)/1e6`, Jev `paid_input×0.6/1e6`다. [OpenAI 공식 단가](https://developers.openai.com/api/docs/pricing)와 [Jev 규칙](https://jev-ai.pro/docs)을2026-10-16 확인했다. 요청 프로필·표준·짧은 문맥 가정이며 실제 모델 identity/tier/context/cache-write 별도 과금은 미확인이다. Jev0.6/M은 과거 토큰팩 참고 단가이고 현재 월정액 실배분액이 아니다. 긴 문맥·표준 시나리오는 Codex$4.559966, Jev$7.184320+$0.246033=$7.430353이며 오차 범위가 아닌 다른 가정이다. 엄격한 API 환산 실액과 실제 청구는 null이다.

초기4요청은 저장 바이트·canonical SHA가 동일했고53+53+53+51=210질문이다. 호출 영수증 시간 합은 Codex213.637922초/Jev9.795052초로21.8108배다. Codex CLI와 Jev wrapper 구간의 비교이며 전체 개발 완료 속도비가 아니다.

## D088 대비 실제 증가와 적용 범위

| Jev 조건 | D088 | D089 | D088을 분모로 한 변화 |
|---|---:|---:|---:|
| 공개 / 독립 통과 | 92/93 · 59/63 | 90/93 · 59/63 | 공개−2, 독립동일 |
| 전체 실패 시도 시간 | 19분11.165초 | 22분38.564초 | +207.399초, +18.0165% |
| 캐시 포함 전체 토큰 | 842,833 | 1,094,757 | +251,924, +29.8901% |
| 참고 환산액, 추정 | $3.7595538 | $4.272113 | +13.6335% |
| 판단 POST | 6 | 13 | 초기4는동일, 수리2→9 |
| 작업자 최초 / 수리 | 6 / 6 | 5 / 7 | 총12회로동일 |

새 Jev의 최초 공개 관측은42통과·16실패·35미실행이었다. 수리 입력은 검사 오류를 보존하는 전체 문맥 방식으로 바뀌고, 담당 판단이1차6·2차3요청으로 나뉘었다. 작업자 배정은1차5명 전원, 2차2명이며 각각 실제5/2회 실행됐다. 1차 뒤81/93, 2차 뒤90/93이었다. 큰 실패 범위를 여러 요청에 반복 전달하는 비용이 커졌다.

산술 분해는 판단234,954→435,373토큰(+200,419), 작업자607,879→659,384(+51,505), 합계+251,924다. 작업자 최초 구현207,523→184,453으로23,070 감소했지만 수리400,356→474,931으로74,575 늘었다. 소스 근거3909B 추가만으로 이 증가가 발생했다고 결론내리지 않는다. 새 생성 코드의 오류와 관측 범위·분할·배정도 달랐다.

**이번 실제 입력 투영 절감은0B다.** Jev 수리7건의 packet1,334,682B가 그대로 전송됐고, 최초 구현까지12건은1,662,352→1,662,352B다. 1차는 미실행/불확실 근거와 동적 템플릿, 2차는 metadata.py의 동적 `get_template` 참조가 전체 문맥 유지 조건이었다. 오프라인5.45%를 이번 실제 토큰 절감으로 바꾸어 보고하지 않는다. Codex는 수리 전 중단해 실제 수리 투영 기회가 없었다.

새 소스 문맥은 Codex1회2178B, Jev2회2056+1853B로 실제 첨부됐다. 자동 담당 추가·작업자 생략·동일 문맥 중복 차단은0회다. Jev의 CLI 담당 수리1건은2개 출력 파일이 모두 그대로였으며 **62,827토큰(61,830입력+997출력)·호출20.078초**를 사용했다. 병렬 전체 경과시간에서 이 시간을 그대로 빼는 절감은 측정하지 않았다. [실제 발동·무변경·전송 SHA 감사](../../benchmark-runs/d089-codex-20261016-01/independent-metrics-summary.v2.json).

Codex의 짧은 종료 시간·작은 토큰도 절감 성과가 아니다. 혼합된24개 담당 질문 중 요구사항19개와 연결된 `T.integration.config-layout` 한 질문이 기존 v3 입력 구성 목표28,800추정토큰을 넘었다. 새 문맥을 빼도29,689로 초과해 원래 압축기의 문제가 남았다. 이는 공식256,000B 한도를 넘긴 사례와 구분한다. [정확한 질문별 오프라인 재현](../../benchmark-runs/d089-codex-20261016-01/codex-owner-budget-diagnosis.md).

## 남은 실패와 다음 설계 대상

기존 T.R10.03은 두 조건 최종 공개 검사에서 통과했다. 새 Jev의 남은 공개3개는 두 의미 문제다.

- T.R14.04 / T.integration.defaults: allOf로 참조한 enum 기본값이 원래 enum 멤버가 되지 않음.
- T.R11.05: nullable 참조 enum의 이름 NullableState 대신 새 inline NullableProbeViaTypeList를 생성함.

공개 소스 추적에서는 두 실패 모두 참조한 enum의 정체성이 상위 해석 단계에서 사라졌다. allOf 기본값은 모델 해석 A13의 참조 이름 손실 뒤 inline enum을 만들지만, 다음 수리는 기본값 소비자 A12를 선택했다. nullable은 A09에서 참조 이름을 넘기지 않았고, 2차 A11의 enum 재검색도 None을 포함한 component를 제외해 원래 이름을 복구하지 못했다. 기대 class·실제 class·원래 $ref와 TypeRef의 전달 경로를 담당 질문에 연결하는 부분이 부족하다. 이는 공개 원문·소스·배정의 대조이며 추가 수리 성공을 뜻하지 않는다.

독립4실패의 상세는 읽지 않았고 같은 원인이라고 단정하지 않는다. [현재 공개 소스·담당 연결 분석](../../benchmark-runs/d089-codex-20261016-01/d089-remaining-public-audit.md)에서 실제 수정 위치와 증상 담당의 차이를 다룬다. 종료 후보는 추가 수정하거나 다시 채점하지 않았다.

다음 제어기 설계 대상은 제안이다. 상위 생성/가져오기 오류를 먼저 수리하고 미실행 검사를 재개한 다음 남은 관측만 배정하는 수리 순서, 혼합 오류에서도 단일 통합 질문을 안전하게 나누는 입력 구성, loader 경로가 검증된 동적 템플릿의 의존 범위 확정이 필요하다. 이번의 짧은 소스 힌트와 보수적인 입력 투영만으로는 시간·단가 절감이 검증되지 않았다.

## 감사 장치와 보존

감사 도구의 가정 오류도 원본과 함께 보존했다. 첫 감사는 모든 공개 case가93개 관측된다고 가정했고, 실행 전 고정93ID=관측∪명시미실행 검증으로 바꿨다. 실제 첫 감사는 존재하지 않는 top-level manifest.json을 가정해 ENOENT로 실패했고, 동결된 manifest 경로·SHA 확인으로 수정했다. 보조 요약 첫판은 중간 DTO의 dispatch_allowed=true만 세어 실제 수리를0건으로 만들었다. v2는 선택 후보→다음 round operation→원시 영수증을 연결해5/2건을 확인했다. 해당 DTO의 false는 하드코딩된 중간 표식이고 실제 최종 실행 gate가 아니다. 별도의 봉인·정확한 후보·현재 실패·권한 검증을 거치므로 guard 우회 증거는 아니다. [가정 수정](../../benchmark-runs/d089-codex-20261016-01/metrics-audit-precondition-correction.md), [첫 감사 실패](../../benchmark-runs/d089-codex-20261016-01/independent-metrics-audit-attempt-01.json), [중간 flag 분석](../../benchmark-runs/d089-codex-20261016-01/dispatch-flag-audit.md).

Root의 첫 컨테이너 비교도 전후 ID 표시 길이(`--no-trunc`)가 달라 false였다. [첫 비교](../../benchmark-runs/d089-codex-20261016-01/comparison-summary.json)를 보존하고 시작과 같은 형식으로 재조회한 [확인판](../../benchmark-runs/d089-codex-20261016-01/comparison-summary-confirmed.json)에서 기존5개 표시ID·이름·이미지 일치를 확인했다. 컨테이너를 변경해서 비교를 맞추지 않았다.

기존 장부 ID를 유지했고13POST·과금 입력410,055증가가 원시 영수증과 일치한다. pending0·blocked null이며 장부를 초기화/복원하지 않았다. live 장부와 Finder 메타데이터를 제외한 과거52,530파일 변경0, 실행 기능 소스422개 변경0이다. 임시 CLI HOME과 자체 검사 컨테이너는 제거됐고 기존5개 컨테이너·Docker 실행 상태를 유지했다.

부수 효과는 새 `feat/d089-repair-efficiency-20261016` worktree의 미커밋 소스·문서와 private 실행/검사/감사 파일, 실제 사용 장부 증가다. 기존 보류 채점은 재개하지 않았고 commit/push/공개 게시를 하지 않았다. 종료 원본을 자동 재개하지 않는다.

새 이름으로 원시 집계를 재현할 수 있다. 결과 파일은 덮어쓰지 않는다.

```sh
node benchmark-runs/d089-codex-20261016-01/audit-results.mjs --out fresh-audit.json
```
