# D027 — 오프라인 실행 실험 결과

2026-10-09. 실험 목적은 선택값→실행 함수, 문서 전달, 재귀 분할 정책, 의존성/소유권 스케줄링을 검증하는 것이다. **실제 Jev/Claude 성능 실험이 아니다.** 사용자 확정: 여러 분할 임계값 비교 후 운영값 결정. 운영값은 null.

## 재현 및 실측 범위

저장소 루트에서 실행했다:

```sh
node bin/document-routing-experiment.mjs benchmark-runs/d027-offline-02
node --test test/document-router.test.mjs > benchmark-runs/d027-targeted-tests.log
npm test > benchmark-runs/d027-full-tests.log 2>&1
# 위 전체 회귀는 sandbox localhost bind EPERM으로 실패. 제한 밖에서 같은 명령 재실행:
npm test > benchmark-runs/d027-full-tests-unrestricted.log 2>&1
```

기존 결과 폴더는 덮어쓰지 못한다. 재현할 때 새 폴더명을 사용한다. [최종 보고 JSON](../../benchmark-runs/d027-offline-02/report.json), [요청/응답/함수 결과](../../benchmark-runs/d027-offline-02/requests-responses.jsonl).

입력 확률은 root=0.72, backend=0.6으로 **사람이 작성한 합성값**이다. 아래는 이 값의 정책 적용 및 in-process 함수 실행 관측이다.

| 분할 임계값 | 실제 구성한 노드 수 | leaf 수 | 최대 깊이(root=0) | 동시에 실행된 모의 worker 최대수 |
| --- | ---: | ---: | ---: | ---: |
| 0.5 | 7 | 5 | 2 | 2 |
| 0.65 | 5 | 4 | 1 | 2 |
| 0.8 | 1 | 1 | 0 | 1 |

분모 없는 count 측정이며, JSON runs의 nodeCount/leafCount/maxDepth/peakSimulatedWorkers 필드에서 얻었다. 요구사항 답 5개, 오류 범주 3개+unknown, ready task 선택 1개 = 10개 직접 분기 예제도 실행했다. 전체 판단 요청/응답은 JSONL에 보존했다. 예제의 task ready 목록은 caller가 선언한 값이며 이 선택을 실제 scheduler 우선순위로 통합한 것은 아니다.

모의 worker는 5ms 지연 뒤 구조화 영수증을 반환한다. 코드 생성/모델 사고/실제 파일 변경이 없으므로 report의 syntheticHarnessMs를 모델 속도나 절약 시간으로 해석할 수 없다. 실제 공급자 호출은 CLI에 transport가 없으므로 0. 공급자 billing은 측정하지 않아 null이다.

## 검증

- 신규 단위/실행 테스트: 18/18 pass. [로그](../../benchmark-runs/d027-targeted-tests.log).
- 전체 회귀 첫 실행: 361개 중 349 pass/12 fail. 실패는 로컬 포트 bind `EPERM`; 숨기지 않고 [원본](../../benchmark-runs/d027-full-tests.log) 보존.
- 동일 코드로 제한 밖 전체 회귀: 361/361 pass, exit0. [로그](../../benchmark-runs/d027-full-tests-unrestricted.log). 외부 모델을 호출하는 테스트가 아니라 로컬 모의 서버 포함.
- 독립 검토자가 sketch 일치·쓰기 범위·크기 제한 수정 후 18/18 재검증.

## 발견한 결함과 수정

1. 최초 fixture의 sketch 표현과 검사 조건이 달라 높은 확률도 근거 부족으로 처리될 수 있었다. 자식 dependsOn을 정본으로 고정하고 fixture 계약을 맞췄다.
2. 초기 expansion은 선택 sketch와 별도의 전체 tree 자식 목록을 사용해 둘이 달라도 진행할 수 있었다. `expandDocumentedTask`가 개수/ID/설명/의존성/쓰기 범위 일치를 확인하고 그 반환 자식만 실행하도록 수정했다.
3. 초기 쓰기 영역 검사에 부모 범위 포함 검증이 없었다. 자식의 범위 초과를 거절하는 검사와 반례 테스트 추가.
4. 초기 요청은 길이 제한이 없었다. JSON UTF-8 256000 bytes 초과 시 거절하며 자동 자르지 않도록 수정.
5. 초기 hash는 문서만 보호했다. 전체 question/kind/task/ready 후보 변경도 decisionHash로 거절. 이것은 로컬 불변성 검사이며 적대적 호출자의 위조 방지 서명은 아니다.

초기 offline-01도 삭제하지 않았고 최종 hardening 버전은 offline-02다. 이 수정들을 실제 Jev 모델 오류 수정으로 기록하지 않는다.

## 구현/설계 차이와 다음 단계

- 구현은 전체 작은 fixture 문서를 materialize한다. 관련 조상/노드/근거만 선별하는 production packet compiler는 미구현.
- 모델+effort 선택값 전달은 검증했지만 프로필은 `fixture-model`이다. 설치/가용 모델/지원 effort/도구 권한 자동 확인은 미구현.
- 질문은 사전 고정 템플릿+문서로 구성한다. Claude가 새로운 요구사항의 영어 질문을 자체 생성하는 live 준비 단계는 미구현.
- 분할 자식은 미리 작성된 fixture에서 가져온다. Jev 승인 후 Claude가 상세 자식을 새로 생성하고 다시 검증하는 live 연결은 미구현.
- 스케줄러는 선언된 경로 소유권만 검사한다. 실제 OS 파일 쓰기 격리, 비파일 공유자원, 취소/영속 재개/중복 실행 방지는 운영 연결 전에 필요하다.
- 선택된 요구사항 상태는 handler로 연결되지만 임의 worker의 ok=true를 독립 검증으로 믿지 않는다. goalVerified는 항상 false다.
- 실패 카탈로그 상한 넘으면 거절한다. 2단계 분류 자동 구현은 없음. 임계값은 합성 비교로 최적화할 수 없고 실답·독립 품질/시간 실험이 남는다.
- 기존 D025 runner/dashboard를 교체하지 않았다. 향후 native worker adapter와 USD1 공유 예산 client를 연결한 뒤 고정질문·E2E 단계를 수행한다. 새 스킬 자료는 [D027_SKILL_INPUTS](D027_SKILL_INPUTS.md)에 준비했다.

부수 효과: 새 소스/테스트/fixture/실험 CLI/문서와 private 합성 로그 두 폴더가 남는다. 신규 서비스/컨테이너/외부 모델 호출/전역 스킬 설치/commit/push 없음. 기존 Personal OS와 과거 benchmark 원본 미변경.
