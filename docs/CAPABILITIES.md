# 배포 기능·연구 기능과 스킬 분해

[English](CAPABILITIES.en.md) · [실측 시간·토큰](MEASURED_ROUTING.md) · [README](../README.ko.md)

확인일: 2026-10-15. 배포 기준은 main `7310cc4`, 공개 연구 기준은 research `5f9b668`이다.
이 문서는 해당 두 Git 트리와 별도 로컬 개발본을 구분한다. 문서에 소개된 설계가 모두 main에 설치된 기능은 아니다.

## main에서 사용할 수 있는 범위

| 기능 | 실제 진입점 | 사용할 수 있는 범위·전제 |
|---|---|---|
| Jev 설정·로그인·모델 조회·결정 호출 | `npm run config`, `login`, `models`, `demo -- --spend`; `src/client.mjs` | 서버용 Jev 키 필요. `choice`·`score`·`noul`; 자동 재시도 없음. 설정 열람과 유료 POST는 별개다. |
| MCP 연결 | `npm run mcp:fetch`, `mcp`, `mcp:tools` | 체크섬으로 고정한 외부 MCP 바이너리 사용. native MCP 호출에 연구 manifest의 전송 정책이나 로컬 Pointsman gateway가 자동 적용되지 않는다. |
| 저장된 기록 평가 | `npm run eval:demo`, `npm run eval -- ...` | 오프라인 지표 계산. 합성 예제는 실제 모델 정확도 측정이 아니다. |
| 사용량·실패 대시보드 | `npm run dashboard` | 지원하는 실행 기록의 토큰·비용·상태를 투영한다. 임의의 외부 CLI 세션 전체를 자동 수집하지 않는다. |
| 영어 질문·모델·작업자 계약 | `node bin/show-routing-contracts.mjs`; `docs/orchestration/contracts/` | 고정 문서를 읽고 변수·후보를 채운다. 카탈로그 존재가 모든 모델의 계정 가용성을 뜻하지 않는다. |
| 문서 기반 작업 트리·실행 선택 API | `src/orchestration/document-router.mjs`, `document-contracts.mjs`; `node bin/check-document-link.mjs NEW.json` | 미리 제공된 트리·분할 초안, 소유권·의존성 검증과 등록 handler 연결. 기본 연결 예제는 모의 응답으로 작업자 지시 객체를 생성하며 작업자는 실행하지 않는다. |
| 초기 파일 생성 pilot | `scripts/tree-e2e-pilot.mjs` | 고정 계획 재사용 또는 Claude의 2–4작업 계획, forced/Claude/Jev/script 분할 선택. Opus 고정·도구 없는 파일 생성 실험이며 결과는 `generated_ungraded`다. |
| 격리 benchmark와 개발/모니터 실행 | `bin/benchmark-run.mjs`, `bin/paired-run.mjs`, `bin/benchmark-monitor.mjs` | 별도 설정·Docker·Claude 인증·Jev 장부 필요. 기존 manifest의 정책을 따른다. 아래 고급 DAG/Codex 전체 비교와는 다른 초기 실행기다. |
| 근거·판단 기록 스킬 | `skills/jev-decision-records/SKILL.md` | 질문·실행·비용·결정을 기록하고 출처 hash를 검사한다. 자동 개발 라우터는 아니다. |

연결 절차·비밀 설정은 [사용 안내](USAGE.md), benchmark 전제는 [benchmarks/README](../benchmarks/README.md)를 따른다. 유료 명령은 사용자의 실행 지출 허용이 필요하다. 위 표의 소스 존재·로컬 검증과 외부 사용자의 실제 환경에서의 성공은 구분한다.

## research와 로컬 개발본

| 기능 | 공개 research | 별도 로컬 개발본 |
|---|---|---|
| 산출물 기반 재귀 분해·의존성 DAG·준비 큐·임계 경로 우선 | 구현됨. adaptive planner/runner와 실험별 manifest 사용 | 기존 연구 실행기를 재사용 |
| 공개 검사·산출물 revision 연결·실패 담당 추론·한정 범위 수리 | 구현됨. D083 이후 D085 다중 담당·직접 수리 등 실험별 opt-in 정책 포함 | 부분 실행 수리와 추가 담당 소스 근거 보강 |
| 전송 직전 검사·사용량 장부·요청/응답 기록 | 연구 실행기의 해당 manifest에서 적용 | Pointsman mandatory gateway로 연결 보강 |
| prompting·스킬 유지보수 역할 | `jev-prompting`, `jev-skill-maintenance`, `jev-decision-records` | 같은 역할 재사용 |
| `pointsman-routing` 스킬·doctor/smoke·설치 bundle | 공개 research에는 없음 | 구현·호스트 smoke 검증. 모의 전송 smoke를 실제 개발 성공으로 해석하지 않음 |
| 동일 Codex 작업자로 Codex 판단 vs Jev 판단 전체 개발 비교 | 공개 research에는 없음 | 구현·실행 기록 있음. 최신 Jev 최종 채점은 사용자 보류 |
| 임의의 설치 스킬 자동 분류·선택·배포 | 범용 완제품으로 제공되지 않음 | 등록 checkpoint 중심; 범용 skill classifier는 별도 설계 |

로컬 개발본은 사용자의 작업공간 `feat/d083-skill-gateway`에 남은 변경이다. main 또는 공개 research에서 clone하면 해당 로컬 모듈이 자동으로 생기지 않는다.
[공개 연구 상태](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md)를 먼저 확인하고, 실험별 manifest·현재 source pin·인증을 맞춰 사용한다. 이번 기능 감사에서는 Docker나 유료 모델을 실행하지 않았다.

## 스킬 책임을 나누는 방법

스킬 분리는 반복 절차를 재사용하기 위한 것이다. 스킬 수와 작업자 수·DAG 노드 수는 서로 다르다.

| 스킬 | 맡는 일 | 배포 위치 |
|---|---|---|
| `jev-decision-records` | 실험 조건·판단·토큰·비용·출처·인계 기록 | main·research |
| `jev-prompting` | 고정 영어 질문·입력·공식 호출 규칙의 사전 검사 | research |
| `jev-skill-maintenance` | 스킬 상태·개선 후보·개정 검증 관리 | research |
| `pointsman-routing` | 등록된 분해·프로필·실패 담당 checkpoint를 검증 gateway에 연결 | 로컬 개발본 |

같은 질문·절차를 매번 생성하지 않아도 될 때 스킬로 고정한다. 입력·출력·검증·실패 처리가 서로 다른 책임은 나누고, 한 번만 쓰는 작은 단계까지 모두 새 스킬로 만들지는 않는다. 스킬을 읽었다는 사실만으로 새 작업자나 권한이 만들어지지는 않는다. **스킬 책임을 이렇게 나눈 것 자체의 토큰·시간 절감 효과는 아직 측정하지 않았다.**

## 작업 목록을 분해하는 방법

분할 전에 목표, 요구 ID·원문, 공개 테스트, 산출물·파일·인터페이스와 소유권을 정리한다. Jev API는 로컬 파일 경로만으로 파일을 읽지 못하므로 판단에 필요한 발췌를 입력에 넣는다.

1. **분할 필요성:** 독립 산출물과 테스트 경계가 있고 병렬 실행 이득이 있는지 본다. 조정·통합·재검증 비용이 크거나 파일 충돌·직렬 의존이 강하면 한 묶음으로 유지한다.
2. **분해 목록:** 각 노드에 요구 ID, 산출물/파일, 담당 범위, 선행 입력, 인터페이스, 공개 테스트, 완료 관측을 붙인다. 모든 요구와 테스트가 어느 노드에 연결되는지 보존한다.
3. **Jev의 선택:** main 문서 라우터는 준비된 분할 초안을 선택한다. research 재귀 planner는 준비된 최소 단위·산출물을 묶고 나누며 관계를 선택한다. 무제한 자유 텍스트 작업 발명과는 구분한다.
4. **재귀와 DAG:** 선택된 자식만 다시 판단하고 불가분·최소 단위에서 멈춘다. 관계 병합 이후 최종 DAG의 순환·누락·쓰기 충돌을 검사하고 준비된 노드만 실행한다. 작업자 상한과 동시 슬롯은 별도 설정이다.
5. **실패 이후:** 실패 assertion·기대/실제 결과·현재 파일 revision·이전 수리 근거를 기존 담당과 연결한다. 미실행 테스트만으로 담당의 결함을 단정하지 않는다.

이 절차의 메인 부분은 미리 제공된 트리와 초안에 의존하며, research는 실험별 분해/관계 계약을 사용한다. 확률이나 점수를 보편적인 성공률로 읽거나, 하나의 예전 임계값을 모든 실행기에 적용하지 않는다. 최신 실행 선택은 실제 manifest·질문 계약·handler를 기준으로 확인한다.

최소 작업 카드 예:

```json
{
  "id": "models",
  "requirement_ids": ["R1"],
  "artifacts": ["src/models.py"],
  "depends_on": ["schema-contract"],
  "interface": "consume validated SchemaIR; emit model definitions",
  "public_tests": ["test_nullable_enum"],
  "done_when": "owned artifact revisions pass their public checks"
}
```

이는 설명용 논리 형식이다. 실제 실행 입력은 해당 버전의 JSON 계약에서 읽는다.


## 현재 분해 계약의 구체적인 차이

| 경로 | 분할 필요성·목록 구성 방식 |
|---|---|
| main 문서 라우터 | 준비된 `splitSketch`와 자식 목록을 보존한다. `beneficial.noul`과 호출자가 정한 임계값, 근거 충분 여부로 기존 single/split 계획을 선택한다. |
| research 재귀 planner | 준비된 단위 목록을 keep 또는 이산 분할 개수로 나누고 각 단위를 한 자식에 배정한다. 루트 최소 분할 등은 실험 정책이다. |
| D083 layered-v2 | 현재 비교는 D066 catalog를 고정 재사용한다. 단위 쌍마다 독립/기존 인터페이스 사용/완성 파일 필요/미확정을 Jev에 묻고 코드가 작업자 묶음·DAG로 구성한다. 인터페이스만 필요하면 병렬, 완성 파일이 필요하면 순서를 둔다. |
| 로컬 Codex 비교 | 양쪽 응답을 선택값만 남기는 형식으로 정규화한다. 원래 확률은 영수증에 보존하지만 planner 입력에는 선택값만 전달한다. 모델·effort도 공통으로 고정했다. |

일반 D083의 `merge_threshold=0.5`는 관계 확률 합계에 따른 묶음 병합 기준이며, 작업 성공률 또는 실행 승인 기준이 아니다. 미확정 관계·순환·용량 조건에 따른 병합도 별도로 있다. 최적 분할 임계값이 검증됐다는 주장은 하지 않는다.

고정 질문은 research의 [layered 계약](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/contracts/adaptive-layered-decomposition.v2.json), [DAG 계약](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/contracts/adaptive-dag.v1.json)에서 읽는다. 실제 연결은 `planLayeredDag` → `layeredClusters` → DAG 구성/실행이다. 범용 스킬 선택·임의 목표에서 새 catalog 자동 생성은 별도 범위다. D085와 D083의 전송 정책은 같지 않으므로 manifest를 섞지 않는다.
