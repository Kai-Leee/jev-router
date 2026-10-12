# D071 — 공개 gate 사전 검증 담당

상태: 2026-10-11 오프라인 구현·집중 검증 완료. 실제 Docker controls와 유료 실행은 root 담당이며 이 역할은 실행하지 않았다.

## 목적과 소유권

기존 공개 v3 85개 검사를 보존하면서 opt-in v4의 추가 description 8개까지 실제 runtime·사전 검증·동결 근거가 같은 경로를 사용하도록 연결한다. 새 매핑은 제품 완료나 결함 검출 충분성의 증거가 아니다.

소유 파일은 `scripts/audit-dag-public-checks.mjs`, `src/benchmark/dag-runner.mjs`의 public preflight 연결, 새 `src/orchestration/public-audit-v4.mjs`, `test/public-audit-v4.test.mjs`, 필요한 `test/dag-public-checks.test.mjs` 변경과 이 문서다. 공개 Python 검사·registry는 `d067_review`, adaptive runner·manifest는 root가 소유한다. 모든 질문·수리·숨김 검사·provider 호출·장부 변경은 이 역할의 범위 밖이다.

변경 전 사본은 `benchmark-runs/d071-preflight/source-before/`에서 기존 사본을 재사용했고 없던 테스트만 추가했다. 기존 root snapshot은 덮어쓰지 않았다. 소유 파일3개 사본의 SHA 보존 결과는 `benchmark-runs/d071-preflight/preflight-source-before.json`과 `public-audit-offline-01.json`에 있다.

## 연결 API

```js
const publicOptions = {
  registryPath: manifest.public_registry,
  runnerPath: manifest.public_runner,
};
const publicData = loadPublicAuditInputs(rootDir, publicOptions);
const audit = auditPublicChecks({root: rootDir, ...publicOptions});
```

v4 manifest 필드는 다음 경로를 사용한다.

```json
{
  "public_registry": "benchmarks/e2e-swe/public-checks/registry.v4.json",
  "public_runner": "benchmarks/e2e-swe/public-checks/run_public_checks_v4.py",
  "public_controls_evidence": "benchmark-runs/d071-preflight/public-controls-v4.json"
}
```

`preflightDagRun`은 위 경로를 매핑, 동결 영수증, 실제 정상 대조에 동일하게 전달한다. `public_controls_evidence`는 저장소 상대 경로만 허용한다. `loadPublicAuditInputs`와 `auditPublicChecks` 기본 호출은 기존 v3를 유지한다. registry/runner 버전을 섞거나 미등록 경로를 주면 거절한다. 새 v4 source-only audit manifest는 메모리에서만 85+8로 합치며 원래 D056 manifest와 작업 생성 catalog를 변경하지 않는다.

추가8개는 원문 R10.02의 source path/hash/줄 범위, 고정 함수4개와 scenario2개, assertion ID 및 요구사항 연결을 검증한다. 기존7 registry와85 inventory 연결은 version/runner/case 경로 이외의 변화가 없어야 한다. `publicSourceHashes`는 public-checks 아래 Python·JSON·fixture·binding 전체를 포함하되 `results/`는 제외하고, audit helper와 `dag-contracts.mjs`도 고정한다. 이 기록 시점에는47개 source pin이다.

## 실제 controls 실행: root가 소스 고정 후 수행

기존 `results/d069-local-controls-v3.json`은 보존하며 현재 source에 대한 인증으로 재사용하지 않는다. 새 Python/JSON/helper/audit 변경 때문에 `PUBLIC_CONTROL_FROZEN_SOURCE_DRIFT`로 거절되는 것이 정상이다. 정상8묶음과 기존81+추가2=83개 결함 대조 전체를 새 영수증에 기록해야 한다.

```sh
node --input-type=module <<'NODE'
import fs from 'node:fs';
import {auditPublicChecks} from './scripts/audit-dag-public-checks.mjs';
const audit = auditPublicChecks({
  registryPath: 'benchmarks/e2e-swe/public-checks/registry.v4.json',
  controls: true,
});
fs.writeFileSync('benchmark-runs/d071-preflight/public-controls-v4.json',
  JSON.stringify(audit.controls, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify({status: audit.controls.status,
  normal: audit.controls.normal_count, negative: audit.controls.defective_count}));
if (audit.controls.status !== 'passed') process.exitCode = 1;
NODE
node scripts/audit-dag-public-checks.mjs --v4 --verify-frozen \
  --frozen-evidence benchmark-runs/d071-preflight/public-controls-v4.json
```

첫 명령은 고정 image, network none, readonly source mount, tmpfs를 쓰는 실제 Docker control 실행이다. `flag: 'wx'`는 이미 존재하는 결과를 덮어쓰지 못하게 한다. 재실행이 필요하면 새 파일명을 사용하고 manifest도 명시 갱신한다. 제어검사 소스가 바뀌면 다시 고정·실행해야 하며 검사 통과 여부나 소스 해시를 수동 고쳐 통과시키지 않는다. 두 번째 명령은 source hash·컨테이너 격리/정리·8normal/83negative·assertion hash를 다시 검증한다.

## 수행한 검증과 발견

- `node --test test/public-audit-v4.test.mjs test/dag-public-checks.test.mjs test/dag-runner.test.mjs`:15/15, 실패0, 생략0,2,717.563584ms. 로그는 `benchmark-runs/d071-preflight/public-audit-tests-01.log`이며 결과/해시는 `public-audit-offline-01.json`이다.
- v3 85개/7묶음, v4 93개/8묶음 모두 source-backed mapped이고 요구사항 누락0이다. v4에 v3 runner 혼용, source span 변조, assertion hash 변조, 추가 결함 대조 생략, 결함의 false pass를 거절하거나 실패로 판정했다.
- 읽기 전용 runtime preflight가 manifest 선택 v4를 따르는지 임시 장부로 검증했다. 추론0, 인증·모델 GET·Docker probe0이며 live_ready=false다. synthetic receipt-shape fixture는 validator 거절 검증에만 사용했고 실제 Docker control 근거로 저장하거나 제시하지 않았다.
- 기존 v3 frozen receipt의 현재 source 인증 검사는 이제 drift 거절을 확인한다. 과거 영수증 내부의 정상7/결함81 coverage 검증은 유지했다. 과거 결과를 새 결과로 바꾸지 않았다.
- 첫 v4 audit는 `PUBLIC_INVENTORY_SOURCE_DRIFT`였다. inventory의 사람이 읽는 scenario와 protocol의 짧은 fixture key를 직접 비교한 새 연결 결함이었다. 원본 파일을 바꾸지 않고 in-memory audit projection에서 `protocol.input`을 scenario로 연결해 수정했다.
- `git diff --check`는 소유 파일 범위에서 exit0이었다. 신규 파일은 Git 미추적 상태이므로 이것만으로 전체 신규 소스의 품질을 인증하지 않는다.

## 미완료·다음 행동·부수 효과

root가 final source freeze 이후 정상8+결함83 Docker 대조를 실제 실행하고 새 영수증으로 launch preflight를 통과시켜야 한다. 새로운 후보 개발·수리·독립 채점·모델 선택/효율 결과는 이 역할에서 측정하지 않았다. 기존 결과·D056 원문·장부·키는 변경하지 않았다. 새 helper·테스트·역할 문서·private validation evidence와 기존 소스 수정은 미커밋으로 남아 있다.
