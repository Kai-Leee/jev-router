# D068 scope — 공개 근거에 따른 수리 범위

2026-10-11 KST. 담당: d067_runner. [역할](D068_PARALLEL.md), [실험](../orchestration/D068_EXPERIMENT.md)을 따른다. 생산 소스 중 `adaptive-repair-scope.mjs`, `adaptive-dag-execution.mjs`와 focused tests만 소유한다. 모델·Docker·실제 장부·키·숨김 검사·기존 후보 수정은 수행하지 않는다.

## 설계와 인터페이스

`buildAdaptiveRepairScope({plan, failure, publicChecks, testRequirements, artifactBindings, sourceFiles})`는 `{candidates, analysis}`를 반환한다. observed failed case ID만 requirement owner로 연결하며 unexecuted ID는 별도 유지한다. 알 수 없는 실패 범위는 명시적인 fallback 후보로 남긴다. 기존 정책은 기본값으로 보존하고 D068은 `runAdaptiveDagExecution({repairScopePolicy:'minimal-public-v1', ...})`로 연결한다.

입증 가능한 fixture blocker 후보를 먼저 제공하되, 관측 실패의 소유자 후보와 미해결 검사를 삭제하지 않는다. 어떤 후보를 선택하더라도 다음 라운드 전체 공개 검사를 다시 실행한다. 새 최소 후보가 실제 최적이라는 주장은 하지 않는다.

현재 지원할 좁은 진단은 Python `re.error`다. 공개 D067 traceback에는 후보 파일 프레임이 잘려 있으므로 오류 문자열만으로 `naming.py`를 지정하지 않는다. 실행기가 산출물 manifest/revision과 실제 파일 bytes를 대조한 뒤 sourceFiles를 만든다. AST로 정적 문자열과 제한된 정적 f-string의 regex만 추출하고 Python 표준 `re.compile`에서 동일한 오류가 재현되는 경우에만 실제 파일 경로·산출물·작업자에 연결한다. 후보 모듈 import, 후보 실행, eval은 하지 않는다. 동적 표현식·불일치·환경 사용 불가는 unknown으로 남긴다.

failure 담당 helper 계약: `adaptiveOutcomeUncertain(value,{fallback})`, `adaptiveTerminalCause(value,{stage,fallbackCode,outcome_uncertain})`. 수리 종료는 `terminal_cause`, `stop_code`, `prior_public_failure`로 전달한다. 알려진 실패와 전송 불확실성, 예약 정산 상태를 구분한다.

## 진행 상태

구현과 focused 검증 완료. 아래 구현·replay·동결 기록은 실제 실행 전 인계 상태다. 당시 유료 실행·제품 개선·완료 효율은 미측정이었다. 후속 실제 D068 종료 분석은 문서 마지막 절에 추가하며 이전 실행과 원본은 보존한다.

## root 통합 인계 예정

- D068 runner에서 `repairScopePolicy:'minimal-public-v1'` 전달.
- 수리 작업자 context의 기존 `failed_public_reports`도 같은 검증된 projection을 사용할 수 있도록 별도 선택적 변환 지점 검토. 이번 역할이 planner/runner를 직접 수정하지 않는다.
- 종료 시 실제 명령·결과, D067 공개 replay 후보 범위, 미지원 진단/명시 fallback과 변경 파일을 기록한다.


## 구현 결과와 검증

- 새 scope helper는 manifest/revision/SHA-256에 연결한 `.py`만 정적 AST로 검사한다. 동일 regex 오류를 재현한 **파일이 하나**인 경우에만 blocker owner를 별도 후보로 만든다. 여러 파일/지원 밖 표현식/환경 실패는 unknown fallback이다. 함수·모듈 import나 후보 실행은 없다. `AugAssign`, `NamedExpr`, alias 변경, 모듈 attribute/subscript 변경, 동적 namespace/eval/exec 사용은 제외한다. 정적 probe는 호스트 Python 3.10.13이며 당시 공개 검사 Python 3.11과 다르다. 동일 런타임 실행 재현이 아닌 제한된 문법 오류 증거다.
- `minimal-public-v1`에는 무조건 모든 leaf를 호출하는 후보가 없다. 입증 blocker, 관측 실패 owner, 실제 downstream closure, 명시 unknown fallback을 구분한다. Jev의 stop은 planner에서 유지된다.
- 실행기 결과는 `terminal_cause`, `stop_code`, `prior_public_failure`를 함께 보존한다. 알려진 HTTP 400과 정보 없는 callback throw를 각각 failed/uncertain으로 구별하고 수리 worker 0을 검증했다.
- `projectRepairFailure(previousFailure) -> {failure,report}`는 이전 실패가 있는 라운드에서 한 번만 호출한다. 작업자 context에 전체 inline `failure`와 `projected_report`를 넣고 기존 `failed_public_reports`/`failed_task_ids` 중복 필드는 보내지 않는다. 최초 라운드와 callback 없는 legacy는 유지한다.
- `node --test test/adaptive-dag-execution.test.mjs test/adaptive-repair-scope.test.mjs`: 25/25 pass, fail/skip 0, 17,970.794333ms. 마지막 지원 밖 write 반례 2개 추가 후 `node --test test/adaptive-repair-scope.test.mjs`: 16/16 pass, 1,904.804417ms. 실제 local failure에 projection callback을 연결한 targeted execution 검사: 1/1 pass, 1,983.388125ms. root가 동결 소스로 전체 회귀를 수행한다.
- 새 blocker 통합 fixture는 실제 파일 manifest/revision을 읽어 owner 1명 repair와 2명 carry를 수행했다. 공개 7개를 두 라운드 모두 실행(14회)해 후속 consumer 실패가 남으면 실패로 보고했다. 전체 성공을 강제로 만들지 않는다. 이 fixture 준비 중 공유 배열에 경로를 두 번 추가해 DAG_DUPLICATE_VALUE가 났고, 배열 복사로 고친 뒤 해당 검사 및 focused 전체를 통과했다.

## D067 공개 원본 replay

공개 execution/journal/catalog, manifest의 공개 test→requirement mapping과 당시 후보 파일만 읽었다. 매 artifact의 실제 파일 manifest digest를 원래 revision과 대조한 뒤 sourceFiles를 구성했다. 두 조건 합계 84개 입력의 전후 SHA-256 동일, 모델 호출 0, Docker 0, 숨김 검사 열람 0, 원본 변경 0이다.

```json
{
  "input_files": 84,
  "input_hash_drift": 0,
  "results": [
    {
      "arm": "claude_all",
      "old_candidate_counts": [
        7
      ],
      "candidates": [
        {
          "id": "repair-fixture-blocker-owners",
          "task_ids": [
            "adaptive-leaf-n2"
          ]
        },
        {
          "id": "repair-failure-owners",
          "task_ids": [
            "adaptive-leaf-n1",
            "adaptive-leaf-n2",
            "adaptive-leaf-n5",
            "adaptive-leaf-n6",
            "adaptive-leaf-n8",
            "adaptive-leaf-n9",
            "adaptive-leaf-n10"
          ]
        }
      ],
      "blocker_witness": {
        "path": "pyclientgen/naming.py",
        "line": 52,
        "error": "bad character range _-\\s at position 5",
        "pattern_sha256": "9b0fb96173799388ce55bea301bf95fdbe1ffb6473230cd095718bf5c6069da9",
        "artifact_id": "A06",
        "owner_task_id": "adaptive-leaf-n2",
        "source_sha256": "a6ca7fcf1afe372fed80de776ceaa003dae747d36a69bf382bc5c19d9350ed70",
        "artifact_revision": "cbf4dbab67fb27079adaf68d0f0b2966b7a129d167df1127663ba828f4594faf"
      },
      "blocker_check_count": 4,
      "observed_failed_cases": 24,
      "unexecuted_cases": 59,
      "fallback_required": false,
      "artifact_revisions_verified": 22,
      "source_files_verified": 19,
      "static_probe": {
        "status": "completed",
        "reason": null,
        "script_sha256": "0cf70ebf78b016cff6fc06fd1e0fa27b3bb4a009090e69d93b520d0c05f50f72",
        "python_version": "3.10.13"
      }
    },
    {
      "arm": "jev_all",
      "old_candidate_counts": [
        1,
        2,
        13
      ],
      "candidates": [
        {
          "id": "repair-failure-owners",
          "task_ids": [
            "adaptive-leaf-n2"
          ]
        },
        {
          "id": "repair-failure-owners-and-consumers",
          "task_ids": [
            "adaptive-leaf-n2",
            "adaptive-leaf-n4"
          ]
        }
      ],
      "blocker_witness": null,
      "blocker_check_count": 0,
      "observed_failed_cases": 2,
      "unexecuted_cases": 0,
      "fallback_required": false,
      "artifact_revisions_verified": 22,
      "source_files_verified": 19,
      "static_probe": {
        "status": "not_needed",
        "reason": null,
        "script_sha256": null,
        "python_version": null
      }
    }
  ]
}
```

Claude의 관측 실패 `T.integration.config-layout` 자체가 모든 7 leaf에 연결된다. 따라서 59 미실행 ID를 제거하는 것만으로 observed-owner 후보가 줄었다고 하지 않는다. 새로 생긴 절감 기회는 입증된 blocker owner 1명부터 수리하는 **선택지**이며 나머지 24 관측 실패를 같은 원인으로 확정하지 않았다. Jev의 두 docstring 실패는 기존 1/2/13에서 1/2 후보로 줄었다. 새 후보로 실제 선택·수리·비용 절감은 root의 후속 실행 전까지 미측정이다.

## 동결 파일

```json
[
  {
    "path": "src/orchestration/adaptive-repair-scope.mjs",
    "sha256": "b90c2a53606b8a1e149cafa1a15a86554fb71df5ccdcf0d4ffaf1c65d0329004"
  },
  {
    "path": "src/orchestration/adaptive-dag-execution.mjs",
    "sha256": "4f81a29f6498913c50f73facd6a3ac1dfdf6f21e6db17293285948aab73dad62"
  },
  {
    "path": "test/adaptive-repair-scope.test.mjs",
    "sha256": "80c7406b73b55aa9c55891594c6f20e2a1368a5cb2ff3b3561a998651f4c7888"
  },
  {
    "path": "test/adaptive-dag-execution.test.mjs",
    "sha256": "14efe5daff74d9c3a83aef3a66ef6ee2e00cae925757a762681f643423051c00"
  }
]
```

다음 행동: 독립 reviewer의 현재 소스 반례 점검 → root 통합/전체 회귀 → 명시 D068 새 실행. 역할 범위에서 추가 생산 수정은 중단한다.

## 실제 D068 종료 후 공개 실패 분석

2026-10-11 KST. 근거는 [별도 분석 JSON](../../benchmark-runs/d068-scope-live-failure-01.json), [D068 execution](../../benchmark-runs/d068-comparison-01/jev_all/execution.json), [당시 plan](../../benchmark-runs/d068-comparison-01/jev_all/plan-commit.json), [Jev 0058 요청](../../benchmark-runs/d068-comparison-01/jev_all/calls/jev-0058.request.json)이다. 이 절은 실제 결과를 읽은 진단이며 추가 실행이나 후보 수정 결과가 아니다.

공개 검사는 **84/85 통과, 1 실패, case 단위 미실행 0**이었다. 로컬 검사는 22/22 통과했다. 유일한 실패는 `public.cli-config-environment`의 `T.integration.diagnostics`, `AssertionError: existing output refused`다. 이후 Jev 수리 요청 0058은 `HTTP_ERROR / 400 / model_input_limit`로 거부되어 선택 응답과 수리 작업자가 없었다. 실행기와 receipt 모두 `outcome_uncertain:false`, `terminal_cause.stage:repair`를 보존했다. 원인 전달 수정은 이 실제 경로에서 확인됐지만 자동 수리 성공이나 제품 완료를 뜻하지 않는다.

**전원 수리 후보는 재등장하지 않았다.** 전체 leaf는 10개이고 실제 질문에는 owner 3명, owner와 consumer 4명, `stop`만 있었다. `fallback_required:false`, fixture blocker 0, 범위 연결 `unresolved` 0이다. `rounds[0].repair_scope`, `prior_public_failure.repair_scope`, 요청의 `state.failure.repair_scope`는 같았다.

| 후보에 들어간 작업자 | 연결 근거 | 소유 산출물/경로 | 이번 실패와의 관계 |
|---|---|---|---|
| `adaptive-leaf-n9` | 통합 case의 R03.04·R03.05·R03.06·R19.02~05 | U01~12 / A01~13 / CLI·loader·config·schema 등 16개 경로 | 관측된 출력 디렉터리 거부 조건 R03.04의 담당자 |
| `adaptive-leaf-n4` | 통합 case의 R17.01 | A22 / `pyclientgen/hooks.py` | 실패 뒤에 놓인 hook 내부 단계는 이번 case에서 실행되지 않았음 |
| `adaptive-leaf-n11` | 통합 case의 R19.01 | A15 / `pyclientgen/diagnostics.py` | 경고 관련 앞선 내부 단계는 실패 지점 이전에 반환했으며 별도 관측 실패가 없음 |
| `adaptive-leaf-n3` | n9의 A01~13 및 n4의 A22를 입력받는 실제 consumer | A21 / `pyclientgen/generator.py` | owner+consumer 후보에서만 추가 |

따라서 3명 후보는 **9개 요구사항을 가진 통합 case의 범위**로 연결된 결과다. 3개 구현이 실제로 잘못됐다는 증거가 아니다. n4와 n11을 무조건 불필요하다고 단정할 수도 없다. 현재 계약에는 더 작은 assertion 단위의 책임 연결이 없으므로 보수적으로 확장되었다.

공개 checker의 정확한 경계도 확인했다. [통합 검사](../../benchmarks/e2e-swe/public-checks/extensions/cli_config.py#L418)는 `combined_overwrite` 디렉터리를 `mkdir()`로 비어 있는 상태로 만든 뒤 `--overwrite` 없이 호출한다. 421행의 `refused.returncode != 0` assertion이 실패했다. 그러므로 종료 코드 0이라는 결론은 이 고정 checker의 조건식에서 도출되며 후보 내부 코드의 원인을 확인한 것은 아니다. 공개 R03.04 명세는 기존 디렉터리 자체를 오류로 요구하므로 빈 디렉터리도 그 범위에 든다.

별도 [T.R03.04 검사](../../benchmarks/e2e-swe/public-checks/run_public_checks.py#L492)는 `existing.txt`가 있는 디렉터리를 사용했고 3/3 assertion을 통과했다. 두 검사의 입력 OpenAPI fixture도 다르므로 빈 디렉터리 여부만 통제한 인과 실험은 아니다. 함수의 `installed` 인자 표기는 달라도 candidate v2에서는 두 검사 모두 설치된 CLI를 사용한다. 실행 경로 차이를 원인으로 주장하지 않는다.

37개 assertion이라는 기록에는 실패한 마지막 assertion이 포함된다. 이전 36개는 반환했고, 그 이후의 같은 fixture `--overwrite` 허용 검사·생성 코드 검증·누락 hook 명령 검사는 이 통합 case 안에서 도달하지 못했다. 하지만 case 자체는 실행됐으므로 `unexecuted_test_ids:[]`다. 현재 보고 형식은 **case 내부의 미도달 단계**를 별도로 나타내지 못한다. 이는 fixture 전체 준비 실패나 D067의 59개 case 미실행과 다르다.

남은 입력 폭도 단순한 전원 후보 문제가 아니다. 3/4명 후보의 합집합은 15 units, 16 artifacts, 19 paths, 55 requirements다. 이 중 n9 하나가 **12 units, 13 artifacts, 16 paths, 50 requirements**를 소유한다. 요청에는 후보 합집합에 해당하는 15 units·16 artifacts·55 requirement descriptions와 전체 graph의 10 leaf 요약이 있었다. 작업자 수 감소만으로 수리 입력·토큰·비용이 충분히 줄었다고 할 수 없고 bytes나 개수로 모델 토큰을 추정하지 않았다.

다음 구체화는 **제안이며 미구현·미실행**이다.

1. 공개 checker에 고정 assertion/subcase ID와 `requirement_refs`를 넣고 checker hash·원래 parent case·실제 실행 근거에 묶는다. 임의 오류 문자열을 담당자 선택 규칙으로 하드코딩하지 않는다.
2. parent case 안의 passed/failed/not-reached를 별도 기록한다. 이번 출력 거부 assertion을 R03.04에 연결하는 오프라인 대입은 owner n9 **1명**, 선언된 consumer n3까지 **2명**을 만든다. 이는 Jev가 선택한 결과도 성공할 최소 수정 범위가 검증된 결과도 아니다. 실제 수정 파일은 미확인이고 generator의 참여 가능성도 남는다.
3. 어떤 후보든 수리 뒤 전체 공개 검사를 다시 실행한다. 세부 case가 늘어나는 경우 역사적 85개 분모와 새 세부 검사 분모를 분리한다. 소유자가 입증되지 않으면 unknown/fallback을 유지한다.
4. n9처럼 큰 leaf는 별도 버전의 산출물 단위 수리 계약을 검토한다. 이를 도입하려면 파일 소유권·입출력 인터페이스·carry-forward 검증을 먼저 정의해야 한다. 현재 whole-worker 계약을 조용히 축소하지 않는다.

D067 실제 Jev 실패는 `T.R10.02`, `T.R10.03`의 docstring 빈 줄 2건이었다. 당시 13 leaf에서 실제 후보가 1/2/13명이었고 D068 정책의 **그 실패에 대한 오프라인 replay**는 1/2명이었다. 이번 D068은 다른 구현 분할 10 leaf와 출력 경로 실패다. 1/2에서 3/4로 바뀐 수치만으로 범위 개선이 회귀했다고 비교하지 않는다.

검증: 분석 스크립트는 읽은 입력 17개의 전후 SHA-256 동일, 공개 checker·명세·scope/executor의 실행 당시 source pin 일치를 확인했다. 생산 수정 0, 원본 결과 수정 0, 후보 소스 내용 열람 0, 모델 호출 0, 실제 장부 접근 0, Docker 0, 숨김 세부 열람 0이다. 첫 오프라인 분석의 assertion이 검증 노드 `verify-public`을 owner로 잘못 세려는 분석 코드 오류를 잡았으며 출력 파일 생성 전에 멈췄다. 고정 scope helper와 같이 implementation task만 필터링한 뒤 위 수치를 확인했다. 이 분석을 근거로 유료 재실행은 하지 않는다. 다음 실행 여부와 구현 범위는 root가 별도 계약·증거를 정리한다.
