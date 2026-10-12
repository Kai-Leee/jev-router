# D065 — 같은 스킬 관리 역할의 후속 적용

2026-10-10. 담당: 기존 `d064_skills` 1명. 상태: **할당된 스킬 원본 보완·사례 적용 기록 완료, 쓰기 종료**.
역할: [D065_PARALLEL](D065_PARALLEL.md). 정본 스킬: [maintenance](../../skills/jev-skill-maintenance/SKILL.md), [decision-records](../../skills/jev-decision-records/SKILL.md).

## 적용한 요청과 최소 변경

사용자는 과도한 테스트 정리와 공개 검사·실제 런타임·의미적 handler·runner의 병렬 완성을 요청했다. 스킬 관리 역할은 실행 계약이나 테스트 파일 소유권을 가져오지 않고, 기존 두 스킬이 이 작업의 기록 책임을 포괄하는지 확인했다. 새 스킬은 만들지 않았다.

- maintenance 지침에 기존 snapshot/삭제 목록과 살아 있는 동작·사고 재현 근거를 연결하고, 중복 guard 테스트를 줄이면서 별개의 실패 증거를 보존하는 단락 1개를 추가했다. 적은 테스트 수를 속도·품질 개선으로 보고하지 않고 영향받는 범위부터 검증하도록 했다.
- decision-records의 기존 DAG 참고 절에 mock 응답·제안 행동·적용된 계획 revision·실제 런타임 시도를 구분하는 항목 1개를 추가했다. semantic 변경의 전후 revision과 실제 실행의 attempt/영수증·candidate/checker/fixture/environment 근거를 연결한다. JSON 필드·검사기·프로젝트 실행 계약은 복제하거나 바꾸지 않았다.
- D064의 독립 검토가 이미 기존 기록 스킬의 책임 범위를 확인했다. D065에서도 같은 책임을 이어 사용하며 별도 DAG 운영 스킬 후보는 실제로 구별되는 반복 업무가 있을 때만 다시 평가한다.

## 변경 전 보존

사용자가 지정한 위치 `benchmark-runs/d065-preflight/skills-before/`에 변경 전 문서 7개를 배타적 생성으로 복사하고 원본/사본 SHA-256 일치를 확인했다. `manifest.json`의 시각은 `2026-10-10T14:40:57.356485+00:00`이다.

- 두 스킬의 SKILL과 UI YAML, 기존 decision-records reference, 당시 MAINTENANCE, D064_SKILLS.
- 같은 폴더의 `inventory-before.json`: 실제 helper 실행 exit 0. 원본 2개, Codex decision-records 사본은 2개 문서 경로 차이, 새 maintenance 스킬은 명시적 설치 루트 2곳에 없음. discovery/invocation은 false.
- 기존 D064 해시·정정·독립 적용 기록은 snapshot과 원 문서에 보존했다. 설치 사본을 변경 전 소스로 간주하거나 갱신하지 않았다.

## 테스트 정리 담당과 연결

초기에 `d065_test_trim`으로부터 `benchmark-runs/d065-test-trim/removal-map.json`에 삭제 파일·사유·생존 동작 근거를 담고 before/after 수·줄 수·focused 출력을 제공한다는 기록 계획을 전달받았다. 실제 결과의 스키마는 `removals[].file/name/reason/surviving_witnesses`이며 별도 스키마를 강요하거나 중복 지도를 만들지 않고 이 자료를 사용했다.

알려진 사고·비밀 경계 검사는 남긴다는 담당의 작업 범위와 D065 계약을 확인했다. 본 역할은 기존 테스트나 `package.json`을 수정하지 않았고 다른 담당의 회귀를 중복 실행하지 않았다.

실제 읽은 근거:

- `removal-map.json`, `metrics.json`, `preserved-incident-witnesses.json`, `focused-after-review.tap` 및 [담당 결과](D065_TEST_TRIM.md).
- snapshot의 `a ready leaf cannot be forged...`와 현재 `ready status cannot be retained...`의 실제 코드를 대조했다. 빈 review와 변경 choice 거부가 그대로 남고 추가 provenance/request-hash 검사가 있는 것을 확인했다.
- 현재 workflow revision race와 client의 불확실 전송/재시도·비밀 노출 방지 테스트를 읽었다. 전체 사고 목록을 별도로 재실행하거나 모든 삭제가 안전하다고 독립 인증하지는 않았다.
- 첫 통합 55/55 통과 후 검토자가 지적한 **동일 타입의 다른 string oracle**과 **일부만 빠진 nonempty child** 조건이 기존 테스트 안에 복원된 실제 source를 확인했다. 이 사례에 근거해 maintenance 지침의 같은 단락에 fault 조건·assertion을 실제로 비교하도록 보완했다. 조건 복원은 테스트 담당의 변경이며 이 역할이 테스트를 추가한 것이 아니다.

최종 현재 metrics는 영향받은 3개 파일에서 테스트 67→55, 줄 1076→904, 바이트 63224→53502다. 수정 후 담당 TAP는 55/55·실패/생략 0·7393.651125ms이다. 빈 줄 1개 정리 이후 최종 904줄이며 실행 내용은 같다는 담당 기록을 확인했다. 최초 map/metrics와 최초 55/55 출력도 보존돼 있다. before 5606.708208ms와 after-review 값은 동시 개발 중 별개 실행이므로 속도 개선을 주장하지 않는다.

이 적용 기록은 **실제 담당 실행 출력과 코드의 수동 대조**다. 테스트 내부 provider callback은 local double이며 D065 실제 provider 실행이나 제품 성공과 다르다. 전체 삭제 검토의 최종 판정과 새 런타임 검증은 [D065_REVIEW](D065_REVIEW.md) 및 root의 통합 기록을 따른다.

## 검증과 현재 경계

스킬 본문·참고 문서만 수정했다. helper와 checker 코드 및 테스트는 변경하지 않았으므로 동일한 helper 테스트를 추가하거나 반복할 이유는 없다. 현재 고정한 두 스킬 문서에 대해 다음을 실제 수행했다.

| 명령/방법 | 결과 | 한계 |
|---|---|---|
| `python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/jev-skill-maintenance` | exit 0, `Skill is valid!` | 구조 검사 |
| 같은 validator의 대상 `skills/jev-decision-records` | exit 0, `Skill is valid!` | 구조 검사 |
| `python3 skills/jev-decision-records/scripts/check_record.py docs/decisions/D064.md --root .` | exit 0, sources 21 / claims 10, semantic_support_checked false | 기존 D064의 고정 근거와 형식 확인 |
| 실제 `inventory_skills.py --source-root skills --installed-root /Users/lee/.codex/skills --installed-root /Users/lee/.agents/skills` | exit 0, 원본 2개, 기존 사본의 문서 2개 경로 차이, 새 스킬 설치 사본 없음 | 명시적 루트의 파일 비교, host discovery/invocation false |
| snapshot 원본과 현재 source의 `diff -u` | maintenance 단락 1개와 record reference 항목 1개만 차이 | diff exit 1은 이 의도된 차이를 뜻하며 테스트 실패가 아님 |

새 tree hash와 설치 상태는 [MAINTENANCE의 D065 절](../skills/MAINTENANCE.md#d065--테스트-정리와-실제-실행-근거의-구분)에 기록했다. 이전 D064 값을 교체하지 않았다.

구체 삭제 사례가 도착한 뒤 fault/assertion 비교 구절만 추가한 maintenance에 한해 구조 검사를 다시 실행해 통과했다. 실제 inventory도 재실행하여 최종 maintenance tree `7445e650fff623c91b8a56bcaeb3756ef6de03293ce3303b43fcb06047dd73cd`, decision-records tree `05c19e728c3ad5008df663e369f12cf392307730b69cc13bbe7cdf39a15cfa55`, 기존 Codex 사본 `93710658c36fcb02895e66e98e8724842c9e9dffcc2bdd152ccf4bffbf966979`를 확인했다. 초기 D065 값도 MAINTENANCE에 보존했다. 이 후속은 새 검토 지적으로 변경된 지침만 재확인했으며 helper·프로젝트 테스트를 다시 실행하지 않았다.

아직 D065 실제 provider 요청·제품 결과·최종 런타임 통과를 확인하지 않았다. mock/제안/로컬 실행/실제 provider 시도를 각각 관측 근거로 기록하며, root의 실제 실행 권한과 본 역할의 무과금 범위를 혼동하지 않는다. 전역 설치·추가 에이전트·유료 호출·커밋·푸시 없음.

본 역할 최종 확인: 2026-10-10 23:48:40 KST. 변경한 원본은 maintenance SKILL의 단락 1개와 record reference의 항목 1개뿐이며 나머지는 스킬 관리 문서·변경 전 snapshot이다. 스킬은 기존 2개, 전역 설치 상태는 그대로다. 새 테스트 수 0, 테스트 삭제 수 0이며 테스트 정리 성과를 스킬 담당이 구현한 것으로 보고하지 않는다.
