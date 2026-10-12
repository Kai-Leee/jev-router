# D073 — 상한 없는 로컬 입력 관측과 버전별 검사

2026-10-12. 담당 `d071_transport`. [역할](D073_PARALLEL.md)·[실험](../orchestration/D073_EXPERIMENT.md)에 따른 후속 구현이다.

## 목적과 경계

최신 사용자는 로컬 토큰 한도 없이 기존 담당을 추론해 수리를 진행하도록 승인했다. 새 v4에서만 로컬32k/64k 추정 한도와 repair48,000B를 비차단 관측으로 바꾼다. 기존 v1/v2/v3와 D071/D072 원본은 보존한다. 공식256,000B/schema, trusted stage, 모델·요청·policy SHA, 불확실성·재시도0은 유지한다. 관측 통과는 provider 문맥 수락이나 정확한 token count를 보장하지 않는다.

소유: 새 `jev-token-admission-v4.mjs`와 계약·집중 테스트, 기존 `scripts/validate-jev-input.mjs`의 명시 `--policy v3|v4` 연결과 관련 테스트. Runner·manifest·실제 API/장부/Docker는 root 소유다. 구현·로컬 검증을 완료했고 실제 수리 성능은 root 실행으로 확인한다.

## 보존과 계획

수정 전 validator와 기존 테스트를 `benchmark-runs/d073-preflight/source-before/`에 배타적으로 보존했다. 여섯 v1/v2/v3 source/contract hash와 변경 전 사본 hash는 `benchmark-runs/d073-admission-01/before.json`에 있다.

1. 동일 `assessJevTokenAdmission`/`jevTokenAdmissionPolicy` API로 v4를 추가한다. `repair_owners`를 trusted stage에 등록한다.
2. 로컬 크기/추정 초과는 `warning_codes`로 기록하고 caps는null로 둔다. 검증 실패는 기존처럼 차단한다.
3. CLI 기본v3를 유지한다. 선택한 정책으로 현재 입력을 검사하되, 과거 run은 저장된 버전으로 별도 재생하여 과거 거절을 새 실행으로 바꾸지 않는다.
4. 실제86,809B/70,510B 원본을 로컬 평가하고 invalid schema/stage/model/hash/공식 초과 반례를 검사한다. 새 결과와 source pin을 별도 경로에 남긴다.

실제 호출·장부·컨테이너 변경은 이 역할에서 수행하지 않는다.

## 인계 API와 실행 의미

새 모듈은 `src/orchestration/jev-token-admission-v4.mjs`, 계약은 `docs/orchestration/contracts/jev-token-admission.v4.json`이다. 기존 함수 호출 형태를 유지한다.

```js
import {
  assessJevTokenAdmission,
  jevTokenAdmissionPolicy,
} from './src/orchestration/jev-token-admission-v4.mjs';

const policy = jevTokenAdmissionPolicy();
const admission = assessJevTokenAdmission(request, {
  stage: 'repair_owners', // trusted controller stage
  observedModel: null, // initial request; later use the prior observed response model
  expectedRequestSha256: exactPreparedRequestSha256,
  expectedPolicySha256: policy.source.sha256,
});
```

`schema_version`은 `jev-token-admission-result/v4`, 통과 결과는 `admit_observed`다. `inference_allowed`는 공식 body/schema·trusted stage·허용 모델·제공한 SHA가 맞는지 나타낸다. `split`, `relations`, `repair`, `profiles`, `repair_owners`를 허용하며 stage는 요청 내용에서 추론하지 않는다. `repair_owners` 등록은 담당이나 쓰기 경로 확대 권한을 부여하지 않는다.

`limits.request_tokens`, `limits.state_plus_longest_question_tokens`와 네 `local_caps`는 모두 null이다. 기존 추정값·wire 측정값·exact request SHA는 보존한다. 과거 추정 32k/64k와 repair 48,000B 초과는 `warning_codes`/`warnings`로 기록하며 `enforced:false`다. `operating_limit.max_wire_bytes`는 null, `applied:false`다. 과거 수치는 `reference_thresholds`와 `historical_reference_policy`에서만 참조한다. 불완전 schema·256,000B 초과·미등록 stage·미확인 모델·잘못된 request/policy SHA는 계속 차단한다.

v4는 기존 순수 v1 측정기의 **로컬 추정 한도 코드 두 개만** 비차단 경고로 전환한다. 다른 검증 실패는 보존한다. v3 모듈·계약 SHA를 고정하여 v1/v2까지 전이되는 기존 pin을 검증한다. 반환 객체를 호출자가 변경해도 내부 정책은 바뀌지 않는다. 정확한 모델 토큰은 null, 추정치는 heuristic, provider 수락 보장은 false, 실제 usage는 null, 자체 추론·retry는 0이다.

## CLI와 과거 기록 재생

```sh
# 기본 v3: 기존 호출자는 동작이 바뀌지 않는다.
node scripts/validate-jev-input.mjs --request REQUEST.json --stage repair

# 새 D073 정책은 명시적으로 선택한다.
node scripts/validate-jev-input.mjs --request REQUEST.json --stage repair_owners --policy v4

# 과거 run 재생과 현재 v4 재평가를 분리하여 기록한다.
node scripts/validate-jev-input.mjs --run RUN_DIRECTORY --policy v4 --out NEW_REPORT.json
```

CLI는 저장된 `schema_version`과 policy path로 v3/v4를 식별하고 해당 버전·저장 SHA로 과거 admission을 재생한다. 별도로 선택한 정책으로 현재 입력을 재평가한다. `recorded_policy_version`, `selected_policy_version`, `reassessed_under_different_policy`, `admission_replay_matches`로 둘을 구분한다. 저장 해시 변경·지원하지 않는 버전·stage 불일치 등은 audit issue가 되며 과거 거절이 새 POST 성공으로 바뀌지 않는다. 기본 v3에서 v4의 새 owner stage를 재평가하면 현재 정책에서는 차단되지만 과거 v4 기록은 해당 버전으로 검증한다. v1/v2 기록 재생은 이 CLI 지원 범위 밖이다.

입력과 원본 run 내부의 output 덮어쓰기는 허용하지 않는다. API 키를 읽거나 네트워크·장부·재시도를 실행하지 않는다. `--out` 결과에는 크기·해시·고정 오류만 기록하고 질문·답·키를 재출력하지 않는다.

## 검증 결과

다음 집중 검사 23개가 모두 통과했다(실패·skip·cancel 0, `node:test` duration 729.31475ms).

```sh
node --test test/jev-token-admission.test.mjs test/jev-token-admission-v2.test.mjs test/jev-token-admission-v3.test.mjs test/jev-token-admission-v4.test.mjs test/jev-input-validation.test.mjs test/jev-input-validation-v4.test.mjs
```

새 검사는 합성 70,510/86,809/160,000/245,000/256,000B 입력을 5단계에서 허용하고 경고·null caps·입력 불변·usage 없음 확인, 256,001B와 invalid state/choice/stage/model/hash 차단, v3 불변, 기본 CLI/v4 opt-in/버전별 재생/저장 해시 불일치를 다룬다. 기존 D072 CLI 검사 5개도 포함한다. 비용·API 수락·실제 수리·시간 단축 검증으로 해석하지 않는다.

실제 원본 입력 오프라인 재생은 `benchmark-runs/d073-admission-01/`에 새 파일로 저장했다.

| 입력/범위 | v4 현재 판정 | 관측/과거 사실 | 결과 파일 |
| --- | --- | --- | --- |
| D071 profile `jev-0064`, 86,809B | `admit_observed` | request 추정 35,236, state+최장 질문 35,206; 추정 질문·wire 경고. 과거 로컬 거절은 유지 | `actual-86809-v4.json` |
| D069 probe 70,510B | `admit_observed` | 추정 28,716/28,690, wire 경고. 과거 실제 HTTP400 `model_input_limit`은 그대로이며 새 수락 결과가 아님 | `prior-70510-v4.json` |
| D072와 같은 과거 108요청, 기본 v3 | 107 허용·1 차단 | 과거 POST200 107건, 로컬 거절 1건. 종료코드 2는 예상된 차단 | `history-default-v3.json` |
| 같은 과거 108요청, 명시 v4 | 108 허용·경고 1건 | 과거 POST200 107건, 로컬 거절 1건을 동일하게 보존. 종료코드 0 | `history-v4-reassessment.json` |

과거 범위는 `d071-comparison-01/jev_all`, `d071-comparison-01/jev_profile`, `d071-preserved-repair-01`이다. 각 108건 audit는 442개 입력 파일의 전후 hash 변경 0, evidence issue 0이었다. 70,510B 원본이 과거 provider에서 거절된 사실은 새 로컬 정책이 수락 예측이나 실제 tokenizer 상한이 아님을 보여주는 반례로 유지한다. 새 provider GET/POST, worker, Docker, 장부 변경은 모두 0이다.

최종 소스·원본 보존 hash와 검사 영수증은 `benchmark-runs/d073-admission-01/source-handoff-01.json` 및 `verification-receipt.json`에 있다. root는 manifest v8에서 v4를 명시 선택하고 정확한 직렬화 request/policy SHA를 reservation 및 POST에 결합해야 한다. 이 역할의 구현 오류나 미통과 검사는 없으며, 실제 Jev 호출·수리 성공·새 arm 비교는 root 실행 결과로 남긴다.
