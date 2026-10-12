# D070 — 통과한 검사와 추가 품질 회귀

새 개발 A는 미리 고정한 공개 85/85·독립 63/63을 통과했다. 그러나 실행 후 발견한 설명문 출처 문제를 같은 추가 입력으로 비교하니 **새 A는 0/8, 기존 Claude와 D069 Jev는 각각 8/8**이었다. 고정 검사의 시간·비용 결과는 보존하되, 더 넓은 동일 품질에서 Claude보다 낫다는 결론은 보류한다.

## 새로 확인한 검사 한계

기존 공개 fixture의 `requestBody.description`과 그 안의 schema `description`은 같은 문장이었다. `schema_models.py`는 생성된 함수를 import한 뒤 `inspect.getdoc`으로 검사한다. 따라서 두 설명의 출처를 혼동하거나 import 시점에 모델 설명으로 채워도 이 fixture에서는 구별할 수 없다.

새 후보의 첫 수리는 template의 description 별칭을 늘렸지만 공개 R10.02 실패가 남았다. 두 번째 수리는 모델 IR의 설명과 생성 모델 class docstring 첫 문단을 사용해 함수의 body 설명을 채웠다. 특정 기대 문장의 하드코딩은 발견되지 않았다. 다만 이 보완은 원래 requestBody의 별도 설명을 복원하지 않는다.

[실제 수리 감사](../../benchmark-runs/d070-review/development-repair-review-01.json)는 원시 요청·응답·작업자 결과·수정 파일을 연결한다. `schema/operations.py`가 BodyIR를 만들 때 requestBody 설명을 전달하지 않고, BodyIR의 description은 기본 None이다. generator의 내장 docstring 경로에도 body 설명 누락이 있다. 저장된 로그만으로 모든 생성 분기의 실행을 증명한 것은 아니며, 그 한계와 실제 출력 진단을 구분한다.

## 동일 추가 진단

공개 원문 R10.02의 body 설명 요구와 [OpenAPI 3.1.0 Request Body Object](https://spec.openapis.org/oas/v3.1.0.html#request-body-object)의 description 의미를 기준으로, 원래 공개 fixture의 두 description 위치만 바꿨다. OpenAPI는 requestBody description을 요청 본문의 설명으로 정의한다. 이 진단에서는 그 설명을 endpoint의 body 인자 설명으로 보존하도록 기대한다. 원래 고정 148개 검사에 이 조건을 사후 합산하지 않는다.

| 추가 조건 | 확인 함수 수 | 기존 Claude | 직전 D069 Jev | 새 D070 A |
|---|---:|---:|---:|---:|
| requestBody 설명과 schema/model 설명이 다름 | 4 | 4/4 | 4/4 | 0/4 |
| requestBody 설명만 있고 schema 설명은 없음 | 4 | 4/4 | 4/4 | 0/4 |
| 합계 | 8 | **8/8** | **8/8** | **0/8** |

각 경우 `sync`, `sync_detailed`, `asyncio`, `asyncio_detailed`를 확인했다. 첫 경우 새 후보는 requestBody 문장 대신 모델 문장을 출력했고, 둘째 경우 body 설명이 비었다. 모든 setup과 실제 CLI 생성은 exit 0이어서 설치·실행 실패를 설명문 assertion 실패로 섞지 않았다.

- [새 후보 진단](../../benchmark-runs/d070-public-description-probe-01/report.json), [실행·보존 영수증](../../benchmark-runs/d070-public-description-probe-01/run.json)
- [동일 스크립트의 두 기준선 실행](../../benchmark-runs/d070-description-comparison-01/result.json)
- [Claude 진단](../../benchmark-runs/d070-description-comparison-01/claude-baseline/report.json), [D069 진단](../../benchmark-runs/d070-description-comparison-01/jev-previous/report.json)

세 후보는 읽기 전용 마운트, 동일 고정 Docker image, network none, 원래 공개 Harness를 사용했다. 후보 전후 snapshot은 같고 진단 컨테이너는 제거됐다. 모델 호출과 숨김 검사 읽기는 0이다. 추가 진단의 실행 시간은 새 후보 12.192초, 두 기준선의 병렬 구간 9.720초이며 기존 개발 완료 시간에 합산하지 않는다.

```sh
node benchmark-runs/d070-public-description-probe-01/run.mjs
node benchmark-runs/d070-description-comparison-01/run.mjs
```

명령은 새 출력 디렉터리만 허용한다. 원본을 덮어서 재실행하면 안 된다.

## 수리 라우팅의 의미

두 수리 판단에서 Jev가 실제로 받은 선택지는 A19 endpoint template의 n14 작업자 수리와 중단뿐이었다. 앞단 operations/IR/generator 담당자는 수리 후보에 없었다. 따라서 이 결과를 Jev가 모든 가능한 원인 중에서 template을 선택한 것으로 해석하면 안 된다.

각 수리에서 template 한 파일만 바뀌고 나머지 37파일·21산출물은 보존됐다. 권한 범위는 정확히 지켰지만, 그 범위 안의 보완만으로는 별도 requestBody 설명을 복원하지 못했다. 첫 작업자도 필요한 IR 파일에 읽기 권한이 없다고 보고했다. 제한된 읽기·쓰기 범위와 좁은 선택 후보를 함께 고쳐야 한다.

다음 실험에서는 실패 assertion의 명세상 담당뿐 아니라 **해당 값을 만드는 producer → IR → 출력 renderer의 실제 연결**을 수리 후보와 읽기 범위에 포함해야 한다. 같은 실패가 반복되면 이전 수정 파일·검사 변화·빠진 upstream 후보를 질문에 넣어야 한다. 모든 작업자를 재호출하는 확장은 필요하지 않다. 이 후속 정책과 새 유료 실험은 이번 결과에 포함되지 않는다.
