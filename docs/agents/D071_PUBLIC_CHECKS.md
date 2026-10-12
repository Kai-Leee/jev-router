# D071 공개 description 출처 검사

담당: `/root/d067_review`. 상태: 구현·집중 검증 완료, 소스 동결 준비. 실제 후보·Docker 재검사는 root 담당이다.

## 목적·범위

D070의 requestBody 설명과 모델 설명 혼동을 공개 실행 gate에서 검출한다. 과거 공개85개·독립63개 결과와 후보는 변경하지 않는다. 새 v4 gate는 기존85개와 추가8개를 구분해 합93개로 실행한다. 검사를 통과한 사실과 일반적인 품질 보장은 구분한다.

소유 파일은 `benchmarks/e2e-swe/public-checks/`의 새 runner/registry/assertion/description 검사·대조 구현, 관련 focused tests, 이 문서다. shared runner/planner/execution, 후보, 숨김 검사, 장부는 수정하지 않는다. API/Docker 실행은 root가 맡는다. 기존 파일을 수정해야 하면 먼저 `benchmark-runs/d071-preflight/source-before/`의 동일 경로에 덮어쓰지 않는 사본을 보존한다.

## 구현 인터페이스

- 새 `run_public_checks_v4.py`, `registry.v4.json`, `assertions.v2.json`을 opt-in한다. 기존 v3 파일은 보존한다.
- 추가 suite: `public.description-provenance`, version `4`.
- 사례: `distinct` / `request-only` 각각 `sync`, `sync_detailed`, `asyncio`, `asyncio_detailed` 함수의 body Args 설명을 확인한다.
- 안정 test ID: `T.R10.02.body-description.<scenario>.<function>`. assertion ID는 같은 접미사의 `A.R10.02.body-description...`다.
- 요구사항은 기존 `R10.02`다. 직접 출력 후보 `artifact_paths`는 endpoint template이며, producer/IR/renderer의 `causal_paths`는 원인 후보이지 결함의 증명이 아니다.
- 관측 evidence는 입력 request/schema 설명·포인터·해시, runtime/source body lines, 생성 파일 해시를 담는다. 검사가 끝나지 않은 assertion은 `not_reached`로 보존한다.
- `description-provenance.v1.json`은 추가8개의 요구사항·시나리오·입력·기대값·공개 source refs를 선언한다. `inventory.v4.json`의 첫85개 원래 mapping은 runner 참조 외 동일하고 추가8개를 뒤에 붙였다.
- 기존 `run_public_checks.py`, `registry.json`, `assertions.json`, `run_control_batch.py`, 원래 fixture/후보를 수정하지 않았다. 새 파일만 추가했으므로 기존 파일 사전 사본을 필요로 하는 수정은 없었다.

## 관측 실패와 원인 후보 경계

D070의 보존된 `round-2/runtime/candidate`를 읽기 전용으로 확인했다. `schema/operations.py:180`의 `_build_body`는 requestBody를 읽지만 `:212`에서 `BodyIR`에 `media_type/type`만 전달한다. `ir.py:234`의 `BodyIR.description`은 `None` 기본값이다. `generator.py:664`는 endpoint template를 렌더링하고 `:684` 이하에서 실패 시 내장 renderer로 대체할 수 있다. 저장된 영수증만으로 실제 fallback 분기를 단정하지 않는다. endpoint template는 모델 설명을 찾고 `:601` 이하에서 import 후 함수 docstring에 복사하는 경로를 추가했다.

그 결과를 담은 [D070 수리 감사](../../benchmark-runs/d070-review/development-repair-review-01.json)와 [동일 공개 진단 비교](../../benchmark-runs/d070-description-comparison-01/result.json)를 근거로 연결했다. 새 checker는 소스값의 잘못된 출력만 관측하며, 선언된 `causal_paths`는 현재 원본·revision·산출물 소유권을 대조한 뒤에만 수리 후보로 해석한다. 파일 역할은 producer/representation/renderer이며 원인 확정 라벨이 아니다. 기존 fixture의 두 설명이 같던 한계를 두 개의 상이한 입력으로 구별한다.

## 수행한 검증

`node --test test/public-description-provenance.test.mjs test/public-assertion-evidence.test.mjs`: **15/15 통과**, 실패/skip/cancel0, 2,483.463875 ms. 원시 로그: [focused-01.tap](../../benchmark-runs/d071-public-checks-01/focused-01.tap). 새 focused test는3개다. 기존 assertion의 stale/missing/ambiguous 근거 반례도 함께 실행했다.

새 독립 authored control은 checker나 과거 후보를 import하지 않는다. 정상은8/8 통과, schema 설명 대체는8개 모두 실패, `asyncio_detailed`의 import 후 설명 변경은 각 시나리오1개씩 총2개 실패했다. 생성 source doc와 runtime doc를 구분해 기록했다. 검사 전 예외는 안정 assertion을 `not_reached`로 남기므로 원인 담당을 잘못 확정하지 않는다. Python 소스4개 syntax와 `git diff --check`도 통과했다. 이는 checker control 검증이며 제품 성공 측정이 아니다.

## Root 검증 명령·다음 행동

root는 기존 고정 image, `--network none`, read-only repository/candidate mount, 새 scratch/output, 컨테이너 cleanup·전후 후보 SHA 확인을 유지한다. `/checker`에 저장소를 read-only mount한 기존 controls 환경에서 다음을 실행할 수 있다.

```sh
python3 /checker/benchmarks/e2e-swe/public-checks/run_control_batch_v4.py
```

예상 분모는 **8 normal suites / 83 negative controls**(기존81+새2)다. 새 검사만 확인하려면 `--suite description-provenance`를 붙이며 이 부분 검증을 전체 controls 완료로 보고하지 않는다. 후보 실행은 v4 entry에 `--suite description-provenance --binding <controller-generated binding>`을 연결한다. version4·assertions.v2 SHA·registry/protocol/source pins·실제 revision binding이 모두 필요하다.

새 public gate의 93개 전부와 독립63개를 만족해야 D071 제품 완료다. catalog 생성 입력은 원래대로 두고 새 public registry를 실행 경계에 연결한다. API/Docker/장부 접근, 후보 수동 수리, 유료 모델 호출은 이 담당이 수행하지 않았다. 실제 후보 결과·총 시간·비용은 아직 미측정이다. root의 실제 controls 결과나 독립 리뷰에서 구체 결함이 오면 해당 범위만 수정한다.
