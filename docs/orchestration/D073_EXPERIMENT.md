# D073 — 추론한 기존 담당으로 수리 실행

상태: 구현·사전 검증 후 실제 두 조건 실행 중. 보존 후보의 첫 담당 추론은 서버 입력 한도로 실패했다. 새 개발의 최종 품질·개선 효과는 아직 미측정이다.

사용자는 실패별 담당 연결을 기존 담당 추론으로 구현하고 로컬 토큰 한도 없이 실제 진행하도록 요청했다. D072는 형식/공식 바이트108통과, 기존 v3추정107통과/수리1차단을 재현했다. D071 profile 실패26개 중18개 담당 fallback이75요구/86809B를 만들어 수리 전에 중단된 것이 출발점이다.

이번 가설은 Jev가 공개 실패와 현재 작업자·산출물·원문 요구를 보고 책임 범위를 추론하면, 광범위 fallback을 실제 기존 담당과 연결해 필요한 수리를 실행할 수 있다는 것이다. 추론은 검증할 가설이며 실제 수리 성공이나 단가 개선으로 간주하지 않는다.

## 실행과 비교

1. 기존 D071 실패 요청과 실패 후보에서 질문/답 형식·담당 allowlist·실행 권한·입력 조건을 오프라인 검증한다.
2. D071 jev_profile의 종료 후보를 새 디렉터리로 상속해 공개 실패를 재현하고 Jev 담당 추론→수리 선택→Claude 작업자→공개/독립 검사를 실행한다. 원본 후보/terminal 결과를 수정하지 않는다.
3. 새 전체 Jev profile 개발을 한 번 실행해 분해/관계/모델·effort/담당 추론/수리와 총시간·토큰·환산비용을 기록한다. 기존 D071 Claude/Jev 결과는 과거 비교로만 두며 동시 실행 경합 차이와 각1회 한계를 명시한다.

실제 실행 전 공개93·독립63, 같은 source/catalog/image, 최대30 작업자·실행슬롯2, 공개 수리2회와 기존 장부를 고정한다. 보존 수리와 새 개발은 별도 시작점과 비용으로 비교하며 품질 실패를 성공 가속률로 계산하지 않는다. 실제 실패/서비스 한도/불확실 응답이 나오면 해당 원본은 종료·보존하고 자동 재전송하지 않는다.

## 변경 경계

새 버전에서 로컬 토큰 추정 상한과 이를 대신하던 repair/profile 바이트 운영 상한은 차단 조건에서 해제한다. 모델/질문 형식, 공식 body256000B, 현재 stage/요청/정책 hash, 실제 잔액과 불확실 정산 처리는 유지한다. 기존 v1/v2/v3 정책과 과거 실행은 변경하지 않는다. 새 v4 admission은 크기/추정치를 관측값으로 남긴다.

Jev 담당 추론은 숨김 검사 없이 공개 실패·현재 산출물 계약/소유권/경로·요구사항을 사용한다. 출력은 기존 식별자로 제한한다. 수리 쓰기 범위와 읽기 snapshot/revision은 controller가 검증한다. 원문 실패와 추론 불가 항목을 지우지 않는다. 동일 실패의 반복·복수원인·실행되지 않은 assertion을 구분한다.

모델·effort의 실제 인자/identity와 판단 호출 수·추론 시점·담당 선택·시행된 수리 범위를 남긴다. 정확한 토큰 수락을 보장하는 tokenizer를 새로 얻었다고 주장하지 않는다. 월 구독 청구 배분은 미상으로 유지한다. 코드·문서·과거 증거는 snapshot/hash 뒤 source freeze한다.

[역할과 파일 소유권](../agents/D073_PARALLEL.md). 현재 승인 범위 안에서 구현·실제 실행까지 진행하며 추가 확인을 기다리는 단계가 아니다.

## 실행 전 확인 (2026-10-12)

- `node benchmark-runs/d073-preflight/run-regression.mjs`: 1217개 중1205통과, 로컬 listen 권한 EPERM12실패. 원본 TAP과 summary를 보존했다. `run-network-regression.mjs`를 허용된 localhost 환경에서 실행해 해당3파일을 재검사했고, 같은12실패 이름의 통과를 확인했다. 중복 통과를 더하지 않은 최종 증거는 `regression-reconciliation.json`과 `regression-verified.json`이다.
- OAuth `claude.ai` 로그인, CLI2.1.293, pinned Docker image와 의존성, 공개93 mapping 및 정상 control, authenticated Jev GET models가 통과했다. 이 사전 점검의 유료 추론은0회다.
- `validate-jev-input.mjs --policy v4 --request …/owner.request.json --stage repair_owners --out …/owner-cli-validation.json` 및 repair 입력 검사는 공식 형식/바이트를 통과했다. 저장된 JSON은 `benchmark-runs/d073-preflight/`에 있다. 첫 CLI 실행은 잘못된 `--output` 옵션으로 exit1이었으며 API/장부 작업0이었다. 올바른 옵션은 `--out`이다.
- 실제 D071의93case·26실패·4미도달 assertion으로 모의 답을 재생했다. 담당 질문187715B/26개, 모의 선택 후 수리91369B이며 이전86809B보다 크다. 상세 요구75→37, 후보 산출물 축소를 실제 입력 토큰·수리 성공·효율 절감으로 해석하지 않는다. provider 수락과 실제 선택은 아직 미측정이다.
- 새로운 `repair_owners` 오류가 일반 `execution`으로 분류되는 누락을 통합 중 발견해 단계 allowlist를 수정했다. 신규 실패 분류 테스트로 확인했다.
- Root의 launch 검사기가 원본 보존 목록의 키를 `pins`로 잘못 읽어 전송 전에 TypeError로 멈췄다. 실제 `files` 키로 교정하고 초기 스크립트를 `freeze-launch-initial.mjs`에 보존했다. 생산 소스 변경 없이 launch 스크립트만 재검토한다. 이 실패 시점의 모델 호출은0이다.
- 이번 owner v1은 공식64질문을 넘는 실패 집합에 대해 전송 전 명시적으로 멈춘다. 질문을 조용히 버리거나 부분 결과를 적용하지 않는다. 다중 요청 batching은 미구현이다. 이는 사용자 토큰 상한과 별개인 공식 요청 형식 한계다.

## 중간 관측 — 첫 서버 거절 보존

`benchmark-runs/d073-preflight/run-experiment.mjs --spend`로 새 전체 개발과 D071 profile 보존 후보 수리를 별도 디렉터리에서 병렬 실행했다. 보존 수리는 공개93검사에서 기존26실패를 재현했지만 `repair_owners`의 실제187728B/26질문 요청이 HTTP400 `model_input_limit`으로 종료됐다. 로컬 v4 검사는 통과했고, 담당 답·수리 작업자는0이다. 독립 채점49/63은 원래 후보의 성적이며 새 수리 성과가 아니다. 원시 요청·응답 오류·receipt는 `benchmark-runs/d073-preserved-repair-01/`에 보존한다.

서버 오류의 `No charge was made.`, 인증된 사용내역의 Oct12 03:04AM 실패26질문 `Refunded · no charge`, fresh GET credits를 대조해 root가 예약r930만 명시 정산했다. 증거는 `benchmark-runs/d073-refund-01/`이며 기존 장부 ID·누적사용량을 유지했다. 원시 추론 사용량/환산가격null을0으로 덮어쓰지 않는다. 이 확인은 유료 재시도가 아니다.

실행 중인 생산 소스270개는 동결한다. 담당 입력의 중복·근거 투영 prototype은 `benchmark-runs/d073-owner-packet-analysis-01/`에서만 검토하며 실제 실행 연결·provider 수락으로 보고하지 않는다. 원문 실패, 현재 모든 후보의 계약/소유권/의존성과 판단불가를 보존해야 한다. 공개 검사93개 결과 inventory/hash는 controller 출처이며, Jev가 로컬 경로를 직접 열 수 있는 것으로 취급하지 않는다.
