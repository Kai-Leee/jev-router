# 최신 개발 — D075

[강제 전송 검사·근거 기반 복구](D075_FORCED_PREFLIGHT_AND_RECOVERY.md) · [실측 결과](D075_RESULTS.md) · [결정](../decisions/D075.md) · [병렬 역할](../agents/D075_PARALLEL.md) · [현재 상태](../agents/STATE.md). 보존 수리 CLI 기본 v10, prompt policy v2, evidence-loop-v1을 연결하고 같은 실패 후보에서 실제 두 시도를 마쳤다. 최종 공개88/93·독립60/63으로 미완료이며, 과거91/93·61/63보다 품질/시간이 악화됐다. 모델 context 초과 뒤 이미 canonical인 입력을 더 재구성하지 못했다. 원본과 첫 profile 전달 결함·수정 증거를 보존했다. 아래 D074는 이전 시점 기록이다.

# 이전 구현·설계 — D074

[스킬·검사 사용법과 실패 루프](D074_PROMPTING_AND_FAILURE_LOOP.md) · [결정·검증](../decisions/D074.md). 새 `jev-prompting` 저장소 스킬과 무과금 고정 검사 CLI를 제공한다. 현재 고정 검사 범위는 projected `repair_owners` / `inferred-v2`이며 다른 stage의 의미 검사는 미지원이다. 복구 루프는 설계 상태다. 기존 runner의 자동 재시도나 유료 실험을 추가하지 않았다. 직전 실제 제품 결과는 아래 D073이다.

# 최신 유료 실행 결과 — D073

[실측 결과·재현 근거](D073_RESULTS.md) · [첫 실험](D073_EXPERIMENT.md) · [입력v2후속](D073_FOCUSED_OWNER_EXPERIMENT.md) · [결정](../decisions/D073.md). 기존담당추론과 로컬토큰상한해제를 실행해14실패를2담당에 연결하고 실제수리2회를 수행했다. 공개79→91/93·독립60→61/63으로 개선됐으나 round2 ownerHTTP400으로 미완료다. 채점까지5분55.366초·알려진803,431토큰·공식$0.7062281은 보존수리 범위다. 전체개발 가속률은 미확인이다. 아래HTML은 기존D070 snapshot이다.

# 이전 결과 — D071

[실측 결과와 재현 명령](D071_RESULTS.md) · [구현](D071_IMPLEMENTATION.md) · [결정](../decisions/D071.md). 원인 담당 연결과 모델·effort 선택을 병렬 수정해 세 조건을 실행했다. Claude만 공개93/93·독립63/63완료, Jev 고정은93/93·60/63, Jev 프로필은67/93·49/63이어서 동일 품질의 속도·비용 개선은 미확인이다. 기존 실패 후보의 producer1파일 수리는 성공했다. 아래 인터랙티브 HTML은 D070 snapshot이며 D071 실시간 결과가 아니다.

# 이전 결과 — D070

[인터랙티브 DAG 가이드](../visualizations/jev-dag-explorer/index.html) · [사용법·검증](../visualizations/jev-dag-explorer/README.md): 현재 분해 트리→의존 DAG 변환, 실제 Jev 질문·선택→실행, 모델 호출 구간과 공개 실패 수리를 로컬 HTML에서 따라간다. 저장된 D070 기록이며 새 모델 호출은 없다.

[실측 결과](D070_RESULTS.md) · [품질 회귀](D070_QUALITY_REVIEW.md) · [실제 보존 수리](D070_PRESERVED_REPAIR_RESULTS.md) · [구현·구조](D070_IMPLEMENTATION.md) · [결정](../decisions/D070.md). n9의 최대12unit을3으로 줄인 새 개발과 기존 실패 후보 수리를 병렬 실행했다. 새 A는 원래 공개85/85·독립63/63,34분24.735초/4,267,230토큰/환산$12.1814126이다. Claude 대비 시간5.318%·비용42.364% 감소지만 추가 진단A0/8·기준선각8/8의 품질 회귀로 동일 품질의 최종 목표는 미달이다. B의 실제1worker 수리는 별도8분53.347초/$0.2762162로 완료했다. 원본·실패·검증 장치의 한계를 보존했다.

# 이전 결과 — D069

[실측 결과](D069_RESULTS.md), [구현·구조](D069_IMPLEMENTATION.md), [동결 계약](D069_EXPERIMENT.md), [결정](../decisions/D069.md). assertion 담당·산출물 수리 입력·모델 입력 사전 검사를 병렬 수정하고 새 Jev전체를 실행했다. 공개85/85·독립63/63완료,39분24.671초/5,809,782토큰/환산$12.3604662다. 첫 후보 통과로 실제수리0회이며 수리효율은미측정이다. 기존 실패와 입력 추정의 실제 오판도 보존했다. 아래 기록은 각 실험 당시의 상태다.

# Jev Router 문서 찾아보기

1. [현재 질문·모델·작업자 지시 위치](contracts/README.md): 실행기가 실제 읽는 파일과 열람 명령.
2. [모델/노력도·Claude/Codex 공식 조사](D029_MODEL_HOST_RESEARCH.md): 지원과 실제 계정 가용성의 차이.
3. [현재 실제 E2E 결과](D029_RESULTS.md): 단일/분할 품질, 단계시간, 비용, 확률 한계와 원본 연결.
4. [작업 카드·질문·답·실행 계약](D027_CONTRACT.md): 전체 설계와 문서 필드.
5. [스킬 생성에 필요한 자료](D027_SKILL_INPUTS.md): 무엇을 왜 어떻게, 검증·예외·인계.

`node bin/show-routing-contracts.mjs`는 실제 정본 JSON 내용과 절대 경로를 출력하며 API를 호출하지 않는다. v1 과거 실험과 v2 현재 worker/model 문서를 혼동하지 않는다. 결정 기록은 ../decisions/D029.md.

6. [입력 중복 감사와 Jev 역할 이전 제안](D030_INPUT_AUDIT.md): 실제 필드/바이트 측정과 미구현 경계.
7. [D031 구현·입력 모드·판단기 비교](D031_IMPLEMENTATION.md): 현재 v3, 무과금 재생 결과, 실제 미측정 경계.
8. [서브에이전트 역할 조사](D031_ROLE_RESEARCH.md): script/Jev/Claude 책임과 template·replay·oracle 비교.
9. [현재 실제 감소·미검증 절감 요약](D031_SAVINGS_STATUS.md): 작업자별 바이트, 과거 유료실험, 비용절감 미확인 경계.
10. [작업자 생성 흐름 영상·추가 축소 후보](D032_BUILDER_EXPLAINER.md): 스킬 적용 근거, 입력 구성기와 CLI 실행기의 차이.
11. [D033 실제 20회 축소 실험 결과](D033_RESULTS.md): 후보별4회,토큰·시간·비용·독립품질·캐시한계.

12. [D034 자동/강제 호출 감사](D034_ROUTING_AUDIT.md): 호출과 선택 사용 구분.
13. [D035 자동 라우팅 업그레이드 조사](D035_UPGRADE_RESEARCH.md): 공개 근거, 제안 실행 구조, 검증 설계와 미구현 경계.

14. [D036 자동 checkpoint 구현](D036_IMPLEMENTATION.md): 현재 auto 기본값, 직접 실행 연결, 무과금 검증과 미구현 경계.

15. [D037 실제 비교 결과](D037_RESULTS.md): Claude/강제Jev/자동의 독립 채점·시간·토큰·비용 증가와 모델 식별자 한계.

16. [D038 다음 실험 조사](D038_NEXT_EXPERIMENTS.md): 원저자 근거, 분할/병렬화 분리, 전체 입력 축소, 반복 판단·계획 생략 검증 제안.

17. [D039 큰 과제 조사](D039_LARGER_TASKS.md): 공개 과제 명세 비교, 현재 실행기 제약, Personal OS 전체 목표와 채점 준비.

18. [D040 OpenAPI 첫 실행 결과](D040_RESULTS.md): 독립채점기 대조완료, 계획·판단영수증, 단일구현10분timeout과미확정비용/미실행비교.

19. [D041 호출 제한 변경](D041_TIMEOUT_POLICY.md): 10분cap 제거와 D040 Jev 미실행 원인.


## D042 — 2026-10-10

Concurrent trial finished. Both provider responses succeeded but artifact JSON parsing failed; zero files and no independent grade. Jev settled1 request/11,205 input; cumulative95,992 of10M. Separate Opus monitor completed. See `docs/orchestration/D042_RESULTS.md`. Output contract repair remains pending; no push.
# D056 current recursive planning path

[Implementation and commands](D056_IMPLEMENTATION.md), [public inputs](D056_INPUTS.md),
[decision and measurement record](../decisions/D056.md). This is the accepted D055 planning direction:
recursive typed choices with separate task/test lists, not product execution. Historical run status remains
in the decision record and latest agent STATE.
# D056 result — recursive planning

[Measured result and remaining issues](D056_RESULTS.md): actual Jev recursion produced separate task/test lists but stopped partial at the planning-decision cap. Provider acceptance, structural preservation, plan adequacy and product efficiency are separate outcomes.


## D057 — 실제 개발 완료 비교 (2026-10-10)

[실제 개발 완료 비교 결과](D057_RESULTS.md): A완료63/63, B미완료62/63; realized1leaf0split, 개선율미산출. [프로토콜](D057_EXPERIMENT.md).

## D059 — 순차 멀티 선택과 프로필 선택

[실험](D059_EXPERIMENT.md), [실제배정](D059_ALLOCATION.md), [결과](D059_RESULTS.md). Jev가3명·65/13/2·모델/노력도를선택하여실제개발실행. 57/63미완료,효율개선미입증.

## D060 — 작업량 상한과 검증 연결

[새 v2구조와 남은 제품 연결](D060_BOUNDED_VERIFICATION.md). 기본1.25배균등량상한,의존·공유경로질문,실제검사근거후 후속실행. 현재로컬검증,실제제품매핑미완료.

## D063 — 다음 개발 계획

[산출물 DAG·임계 경로 통합 계획](D063_DAG_PLAN.md). 사이드 설계를 검토해 P0 검사/산출물 계약부터 P1 판단·P2 스케줄·P3 검증·P4 관측을 준비하고 P5 통합 비교로 연결한다. 설계 반영 완료, 런타임 구현/유료 실행은 미진행.

## D064 — 병렬 구현과 스킬 관리

[구현·검증 상태](D064_IMPLEMENTATION.md), [역할 계약](../agents/D064_PARALLEL.md). D063의 첫 로컬 기반을 별도 모듈로 구현하고 공개 검사 mapping을 준비한다. 실제 Jev 선택·제품 개발 완료나 성능 이득과 로컬 fixture 통과를 구별한다.

## D065 — 공개 검사·파일 런타임·의미 핸들러·실제 실행기

[현재 구현](D065_IMPLEMENTATION.md), [실측 결과·검증기 정정](D065_RESULTS.md), [역할 계약](../agents/D065_PARALLEL.md), [결정](../decisions/D065.md). 공개85개 검사와 실제 candidate/checker/environment/revision을 연결했다. typed 선택은 v2 의미 핸들러를 통해 검증된 계획과 읽기 범위에 반영된다. 중복 테스트는 고유 반례를 보존하며74→58개로 정리했다. 실제 단일 조건에서16개 파일을 생성했지만 제품 완료는 실패했고, 독립 채점62/63 통과다. 원본 실패와 후속 검사기 수정·진단을 구별하며 유료 실행을 자동 반복하지 않는다.

## D067 — 상한 해제와 네 조건 병렬 비교

[실측 결과](D067_RESULTS.md), [프로토콜](D067_EXPERIMENT.md), [실제 작업 배정](D067_TASK_ASSIGNMENTS.md), [구현](D067_IMPLEMENTATION.md), [결정](../decisions/D067.md). 동일 catalog와 Opus 5.5 medium 작업자로 네 조건을 병렬 실행했다. 공개·독립 결합 완료는 3/4다. Jev 분해와 분해·관계는 Claude 기준선보다 각각 시간 28.7369%/21.8353%, 공식 단가 환산 비용 53.3249%/58.5214% 감소했다(각 조건 1회). Jev 전체 판단은 공개 83/85 뒤 수리 요청이 모델 입력 한도로 거절됐다. 기존 장부 이력을 보존해 한도만 해제했으며 실패 요청은 별도 근거로 무과금 정산했다.
