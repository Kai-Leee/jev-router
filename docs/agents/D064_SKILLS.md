# D064 — 스킬 관리 담당 결과

2026-10-10. 담당: `skills` 1명. 상태: **할당된 저장소 원본 작업 완료, 쓰기 종료**.
역할 범위는 [D064_PARALLEL](D064_PARALLEL.md), 운영 목록은 [MAINTENANCE](../skills/MAINTENANCE.md).

## 수행 내용

1. `/Users/lee/.codex/skills/.system/skill-creator/SKILL.md`와 `references/openai_yaml.md`를 읽고 적용했다. 저장소의 AGENTS·D063·STATE·기록 스킬과 설치 사본을 확인했다. 새 스킬은 제공된 `init_skill.py`로 원본 위치에 생성했고 기본 발견 정책을 유지했다.
2. [jev-skill-maintenance](../../skills/jev-skill-maintenance/SKILL.md)를 만들었다. 기존 스킬 수정과 신규 스킬의 책임 분리, 관찰 근거에 따른 변경, 원본/설치 사본 구분, 실제 검증 범위, 역할 소유권과 후속 기록을 안내한다.
3. [inventory_skills.py](../../skills/jev-skill-maintenance/scripts/inventory_skills.py)는 `fd`로 직접 하위 스킬을 찾고 파일·symlink 문자열 해시를 비교한다. stdout JSON만 출력하며 설치를 수행하지 않는다. 설치 사본 없음, 루트 없음, 내용 차이, 같은 실제 경로, 검사 오류를 구분한다. `fd`의 오류 stderr는 exit 0이어도 성공으로 취급하지 않는다.
4. [기록 스킬](../../skills/jev-decision-records/SKILL.md)과 [reference](../../skills/jev-decision-records/references/record-contract.md)에 DAG claim의 revision/check identity, mapping·실제 검사·제품 완료 구분, 지역/통합 검사와 추정/관측 시간 경계를 조건부로 보완했다. `check_record.py`와 구조화 JSON 필수 필드는 변경하지 않았다.
5. 원본 2개와 명시적 설치 루트 2곳의 비교 및 5개 유지보수 항목을 [MAINTENANCE](../skills/MAINTENANCE.md)에 기록했다. 기존 기록 스킬은 변경 전 설치 사본과 일치했고 변경 후 2개 문서 경로가 다르다. 새 스킬은 확인한 설치 루트에 없다.

## 실제 검증

모든 명령 cwd: `/Users/lee/workspace/plugins/jev-router`.

| 명령 | 실제 결과 | 입증하는 범위 |
|---|---|---|
| `diff -rq skills/jev-decision-records /Users/lee/.codex/skills/jev-decision-records` — 수정 전 | exit 0, 출력 없음 | 당시 원본과 사본의 파일 내용 일치 |
| `python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/jev-skill-maintenance` | exit 0, `Skill is valid!` | 새 스킬 구조·frontmatter·scaffold |
| `python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/jev-decision-records` | exit 0, `Skill is valid!` | 기존 스킬 변경 후 구조 |
| `python3 skills/jev-skill-maintenance/scripts/test_inventory_skills.py` | exit 0, 6 tests / OK, skipped 0 | 실제 `fd`를 이용한 정상·차이·누락·symlink·범위·불변 fixture와 오류 stderr 반례 |
| `python3 skills/jev-skill-maintenance/scripts/inventory_skills.py --source-root skills --installed-root /Users/lee/.codex/skills --installed-root /Users/lee/.agents/skills` | exit 0, 원본 2개; 기존 Codex 사본 `different`, 나머지 해당 사본 `absent` | 명시적 로컬 경로의 현재 파일 비교; host discovery/invocation 모두 false |
| `python3 skills/jev-decision-records/scripts/check_record.py docs/decisions/D063.md --root .` | exit 0, sources_checked 13, claims_checked 6, semantic_support_checked false | 기존 기록의 필수 필드·참조·해시 호환 |
| `git diff --check -- skills/jev-decision-records skills/jev-skill-maintenance` | exit 0 | 추적 중인 변경의 whitespace 검사; 신규 미추적 파일은 이 명령의 검증 범위 밖 |

초기 helper 5개 검증 후 `Path.exists()`가 접근 오류를 감출 수 있는 경우를 피하도록 `lstat()` 존재 확인을 적용했고, 오류 stderr 반례 1개를 추가한 최종 6개 검증을 다시 수행했다. 프로젝트 문서는 설치 사본에서도 저장소 루트 기준으로 찾도록 안내한 뒤 두 스킬 구조 검사와 실제 inventory를 다시 통과했다. 기존 검사기의 단순 구조 통과를 의미 검증으로 확대하지 않았다.

수동 사례 검토: D063의 공개 mapping 미완료 상태에는 제품 완료를 붙일 수 없음, artifact revision이 달라지면 이전 check 통과를 완료 증거로 재사용할 수 없음, 일반 기록은 기존 JSON 계약대로 유지됨. 작성자 대조이며 독립 행동 실험·호스트 호출 검증은 수행하지 않았다.

## 인계와 미검증

- main 연결 대상: 새 유지보수 SKILL과 `docs/skills/MAINTENANCE.md`. AGENTS/CLAUDE/전체 STATE·WORK_LOG·DECISIONS·VERIFICATION 연결은 main 소유로 남겼다.
- root의 D064 통합 회귀와 별개로 Python helper 테스트 명령을 위에 제공했다. `npm test`가 이 테스트를 실행한다고 주장하지 않는다.
- 후속: 실제 다음 스킬 유지보수 요청의 결과를 기존 역할·목록에 이어 기록. 설치 요청이 오면 당시 설치 사본을 재비교. 새 DAG 운영 스킬은 안정된 실행 경로와 반복 필요가 확인될 때 평가한다.
- 기존 전역 설치 사본, 다른 역할 파일, 과거 실험·결정 기록, 누적 장부는 수정하지 않았다. 에이전트 추가 생성, 유료 호출, 제품 실행, 커밋·푸시 없음. 스킬의 자동 발견·실제 호출·사용자 시간 절감은 미검증이다.

소유 파일: `skills/jev-skill-maintenance/**`, `skills/jev-decision-records/SKILL.md`, `skills/jev-decision-records/references/record-contract.md`, `docs/skills/MAINTENANCE.md`, 이 문서.

## 2026-10-10 23:15:17 KST — 독립 검토 후 해시 이력 보완

main이 전달한 초기 표와 독립 관측의 해시 차이를 실제 inventory 명령으로 재확인했다. exit 0이며 현재 값은 decision-records `408858b6…`, skill-maintenance `0d0e3f8e…`로 현재 표와 일치했다. 차이의 원인은 초기 스냅샷 이후 설치 위치와 무관하게 저장소 루트를 찾도록 수정한 두 안내 문서다. 초기 값 `3628c414…`/`b0f6f0a7…`와 정확한 전체 해시는 [MAINTENANCE의 정정 기록](../skills/MAINTENANCE.md#2026-10-10-231517-kst--해시-관측-이력-정정)에 보존했다.

기존 설치 사본과 캐시 파일의 해시는 유지됐다. 캐시가 이번 차이를 만들었다는 근거가 없어 helper API·해시 의미·테스트를 변경하지 않았다. 이 후속은 문서 수정과 읽기 전용 재관측이며 새 설치나 실행 경로 변경이 아니다. 독립 스킬 적용 결과는 검토 담당 문서에 기록되는 대로 그 범위와 한계를 별도로 연결한다.

## 2026-10-10 23:17:26 KST — 독립 적용 결과 연결

[D064_REVIEW의 독립 스킬 적용 절](D064_REVIEW.md#independent-maintenance-skill-application)을 실제 확인했다. 기존 검토 담당자가 D064의 DAG 근거 책임과 설치 사본 차이에 새 유지보수 지침을 수동 적용했다. 기존 기록 스킬이 책임을 포괄하므로 중복 DAG 스킬을 만들지 않고, 원본/사본 차이만으로 설치하지 않는 결과를 남겼다. 독립 inventory와 helper 6/6 검사도 exit 0이었다.

이를 [MAINTENANCE](../skills/MAINTENANCE.md)의 SKM-005에 최초 미검증 상태와 함께 `부분 검증`으로 기록했다. 이 근거는 작성자 자체 검토와 분리한 독립 수동 적용이며, 호스트 자동 발견/자동 선택이나 시간 절감 측정은 아니다. 검토 문서의 core freeze 전 상태를 D064 전체 최종 승인으로 확대하지 않는다. 후속 수정은 소유한 문서 2개뿐이며 도구 API·소스·설치 사본은 변경하지 않았다. 이 후속도 쓰기 종료했다.
