# D071 구현과 검증 경계

실험의 목표는 같은 공개 요구를 충족하는 개발 완료시간과 API 환산비용 감소다. 구현만으로 개선을 주장하지 않는다. 조건·예산·비교 경계는 [실험 계약](D071_EXPERIMENT.md), 담당 소유권은 [D071 역할](../agents/D071_PARALLEL.md), 진행 상태는 [STATE](../agents/STATE.md)를 따른다.

## 검사와 담당 연결

새 `registry.v4.json`은 원래85개 검사에 request-body 설명8개를 추가한다. 입력의 requestBody 설명과 schema 설명을 다르게 만들거나 schema 설명을 제거해, 잘못된 설명 대체와 누락을 구별한다. 기존 공개 검사는 원본을 보존한다. 신규 완료에는 공개93개와 독립63개가 모두 필요하다.

`assertions.v2.json`과 `adaptive-causal-repair.mjs`가 실패 assertion에서 공개 계약에 근거한 producer→representation→renderer 후보를 구성한다. 설명 손실 사례에서는 `schema/operations.py`, `ir.py`, `generator.py`, endpoint template의 artifact와 실제 담당 task를 연결한다. 이 경로는 검증할 수리 가설이며 실제 결함 위치의 확정 판정이 아니다. Jev/Claude의 선택은 검증된 후보 ID에서 실행 함수로 연결된다.

선택된 artifact만 쓰기 가능하다. 추가 causal 파일은 실패 당시의 불변 snapshot과 해시가 검증된 읽기 경로로 제공한다. 이를 작업 staging에 쓰기 가능한 파일로 복사하거나, 읽기 참조만으로 DAG 의존성을 새로 만들지 않는다. 실제 변경 파일·해시와 지속/해결된 공개 실패를 controller가 기록한다. 실행하지 못한 검사는 해결로 세지 않는다.

## 판단 입력과 작업자 입력

수리 범위 판단에는 실패 assertion·원인 경로의 요구 원문·법적 후보·현재 관측과 이전 수리 이력을 전달한다. 나머지 구현 요구와 전체 interface는 작업자 입력 및 보존된 controller 근거에 남긴다. 불명확한 요구 연결은 제거하지 않는다. 같은 check/test/assertion과 관측 전체가 정확히 같을 때만 history를 현재 관측 참조로 표시한다. 변경된 관측은 원문을 유지하며 원래 입력을 복원해 검증한다.

초기 dictionary/fragment 표현은 실험 기록으로만 남았다. 실제 D071 전송은 읽을 수 있는 JSON이다. `jev-token-admission.v3.json`의48,000B는 내부 운영 기준이며 provider의 공식 바이트 제한이 아니다. V1/V2 정책은 보존하고 문항32,000·전체64,000 토큰 **추정** 기준을 유지한다. 과거70,510B 요청이 추정 검사를 통과하고도 provider에서 거부된 사실 때문에, 추정 통과를 수락 보장으로 쓰지 않는다.

## 실제 모델과 추론 노력도

`adaptive-profile-selection.v1.json`은 모델 선택 질문 정본, `adaptive-profiles.v1.json`은 후보 정본이다. Opus·Sonnet·Haiku·Fable의 모델/effort20개 조합에서 선택한다. 각 질문 본문에 작업자·task·실제 수정 artifact와 경로를 명시한다. 코드용 질문 ID에 의미 전달을 의존하지 않는다.

초기 배치당 최대2개 작업, 수리 배치당1개 작업으로 요청을 구성한다. 초기2개 요청이 내부 바이트 기준을 넘으면 전송 전에1개씩 나눌 수 있다. 모든 배치의 입력 검사를 먼저 마치고, 모든 선택이 검증·저장되기 전에는 작업자를 실행하지 않는다. 모델 선택에는 해당 작업의 범위·관련 실제 영수증 요약·모델별 사용량을 넣으며 원본과 집계 분모를 보존한다. 누락 비용/시간은0으로 채우지 않는다.

선택한 profile은 pinned allowlist에서 다시 해석해 실제 CLI `--model`과 `--effort`로 전달한다. 선택 decision/choice/profile ID, 실행 인자와 응답 모델 identity를 묶어 기록한다. 응답 모델이 다르면 성공적인 최적화로 처리하지 않는다. CLI에 보낸 effort는 관측할 수 있으나 provider 내부의 실제 effort는 별도 신호가 없어 unknown이다.

## 실행과 보존

`d071-adaptive.json`의 세 조건은 동일 source/catalog/image/공개 기준과 조건당 실행 슬롯2개를 사용한다. `claude_all`은 판단·작업자 모두 Claude, `jev_all`은 판단 Jev와 고정 Opus medium 작업자, `jev_profile`은 판단과 작업자 profile을 Jev가 선택한다. Claude 조건은 구조화된 여러 세션이며 무제약 단일 세션과 같지 않다.

D070 실패 후보의 실제 수리는 별도 디렉터리에서 시작한다. 원래 후보를 수정하지 않고 현재 공개 실패를 재현한 다음 선택된 artifact만 수리한다. 이 비용과 시간은 처음부터 개발한 세 조건과 합쳐 속도 개선으로 계산하지 않는다. 수리 상한2회에서는 판단에 이력0/1회가 전달되며, 마지막2회 이력은 기록 후 종료한다.

Root가 source freeze·전체 회귀·독립 검토·입력 사전 검사·기존 결과14,576파일 해시 보존을 확인한 후 `benchmark-runs/d071-preflight/run-experiment.mjs --spend`를 실행한다. 각 후보의 독립 채점에는 결과 파일 해시와 후보 경로를 연결한다. 최종 측정은 캐시를 포함한4종 토큰, CLI 호출과 Jev POST, 단계별 비용, 실제 완료 여부를 함께 보고한다. 월 구독 실청구 배분은 확인할 수 없으면 null로 둔다.

이 문서는 구현 계약이며 실제 종료 결과는 [D071_RESULTS](D071_RESULTS.md)에 기록했다. 기존 후보의 설명 누락은 producer1파일 수리로 해결됐지만 새 Jev 두 조건은 공개93+독립63 결합 완료에 실패했다. 프로필 조건의 여러 suite 실패에서는 미연결18개 assertion이 광범위 fallback과75개 요구 보존을 유발해86,809B/문항 추정35,206으로 수리 전에 차단됐다. 사전58개 요청 통과가 이 새 입력의 수락을 보장하지 못한 반증을 보존했다. 입력 크기 감소와 오프라인 테스트 통과를 개발 속도·비용 절감으로 바꾸어 쓰지 않는다.
