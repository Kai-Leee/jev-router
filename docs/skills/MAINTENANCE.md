D092 유지보수: [모델·노력도·공개 성과](../orchestration/D092_MODEL_EFFORT_HISTORY.md)와 [실패 이력](../orchestration/D092_FAILURE_HISTORY.md)을 진입점으로 추가했다. 새 스킬을 만들거나 전역 사본을 설치하지 않았다. 고정 질문은 codex-worker-profiles.v2.json, 성과 정본은 snapshot.final.v2.json과 binding v1이다. 성공률은 공유 공개 검사 연관 관측이며 새 노력도의 표본 없음과 기존 실패를 구분한다. 근거 있는 선택과 실제 재호출 감소를 같은 완료 상태로 표시하지 않는다.

D091 유지보수 확인: [결과](../orchestration/D091_CODEX_RESULTS.md) · [스킬 감사](../agents/D091_SKILL_RUNTIME_STATUS.md). 실제 격리 CLI의 활성 스킬은 0개이며 규칙은 인라인 계약으로 전달했다. Jev 모델 선택의 질문 정본은 `docs/orchestration/contracts/codex-worker-profiles.v1.json`, 실행 모듈은 `src/benchmark/codex-worker-profiles.mjs`다. 기본 작업자는 6.1-sol/high로 유지하며 v8/adaptive 실험에서만 모델을 선택한다. 전역 설치·동기화는 하지 않았다. 분할 전 lossless 인코딩, 미도달 검사와 소스 불확실성의 구분, 실측 모델 프로필, no-op 이후 새 근거 확보는 후속 제안이다. 아래는 각 당시 기록이다.

D090 현재(2026-10-16): 앱 실제 CLI0.162.0-alpha.17.2·gpt-6.1-sol/high 기본 연결과 모델별 참고 정산으로 새 순차1쌍을 종료했다. [결과](../orchestration/D090_CODEX_RESULTS.md) · [기록](../decisions/D090.md). 두 조건 모두 공개93/93·독립63/63으로 제품 완료2/2. Codex24분42.255초·478030토큰·참고$1.749668, Jev22분37.343초·503013토큰·참고$1.5037936: 전체시간8.4272%↓·토큰5.2262%↑·참고액14.0526%↓(Codex분모). 단가 가정/실청구unknown 구분, 초기 판단34.888배는 전체 가속률 아님. Jev실제수리1회·투영감축0B·추가문맥첨부0B. 기본Codex경로D090 manifest/gatewayv6, 역사계약·결과55178파일보존, 소스427불변. 추가자동실행/commit/push없음. 아래는각당시기록이다.

D089(2026-10-16) 근거 갱신: [실제 결과](../orchestration/D089_CODEX_RESULTS.md), [담당 역할](../agents/D089_REPAIR_EFFICIENCY.md), [기록](../decisions/D089.md). 고정 지침/소스 근거/전송 투영을 gateway v5에서 공통 연결했으나, 이번 실제 수리7/7은 전체 문맥 유지라 축소0B·중복 차단0회였다. 스킬 설명을 자동 비용 절감 보장으로 바꾸지 않는다. 다음 스킬 설계에는 기대/실제 enum class·원래ref·TypeRef 전달과 상위 오류 선행 수리, 동적 template 의존 범위를 검증 가능한 형태로 넣는 것이 제안이다. 기존 스킬의 동결 본문과 핀은 재측정 뒤 수정하지 않았다.

# Jev 스킬 목록과 유지보수 대기 목록

확인일: 2026-10-12. 범위: 이 저장소의 `skills/` 원본과 이름이 같은 명시적 설치 사본.
담당: D064부터 이어지는 [D075 역할 계약](../agents/D075_PARALLEL.md)의 `skills` 담당 1명. 이후 작업도 이 역할의 기록을 이어 사용한다. 이 문서가 새 에이전트 생성·전역 설치·유료 실행을 지시하지 않는다.

진입점은 [jev-skill-maintenance](../../skills/jev-skill-maintenance/SKILL.md), 변경·검증 상세는 [D064_SKILLS](../agents/D064_SKILLS.md)다. 프로젝트 목적과 실행 계약은 AGENTS·현재 STATE·결정 문서를 따른다. 여기에는 스킬의 상태와 개선 근거를 둔다.

현재 후속은 [D075 스킬 관리](../agents/D075_SKILLS.md)다. 아래 D064부터 D074까지의 관측·정정은 당시 상태로 보존하며 최신 적용 판단과 설치 상태는 문서 끝의 D075 절에 이어 기록한다.

## D064 완료 시점 목록

| 스킬 | 원본의 책임 | 현재 소스 상태 | 확인한 설치 사본 |
|---|---|---|---|
| [jev-decision-records](../../skills/jev-decision-records/SKILL.md) | 판단·실험·비용·인계 기록의 근거 연결 | 기존 스킬. D064에서 DAG 검사/산출물 버전 근거 안내만 보완; 기존 JSON 계약·검사기 유지 | `/Users/lee/.codex/skills/jev-decision-records` 존재. 보완 전 `diff -rq` 일치. 보완 후 `SKILL.md`, `references/record-contract.md` 2개 경로 차이. `/Users/lee/.agents/skills`에는 같은 이름 없음 |
| [jev-skill-maintenance](../../skills/jev-skill-maintenance/SKILL.md) | 스킬 원본·사본 비교, 근거에 따른 수정/신규 분리, 검증 수준과 대기 작업 관리 | 새 저장소 로컬 스킬. 구조 검사와 목록 도구 검증 완료 | 확인한 위 두 설치 루트에 같은 이름 없음 |

원본 파일 존재, 설치 사본 존재, 호스트 발견, 실제 호출, 작업 효과는 서로 다른 상태다. 이번 확인은 파일 및 로컬 도구 검증이다. 새 스킬의 호스트 발견·호스트 자동 선택·실제 작업 효과는 미검증이다. 기존 스킬의 과거 적용 기록은 [D025](../decisions/D025.md)에 있으며 이번 검증으로 재측정한 것이 아니다.

목록 재현 명령(저장소 루트):

```sh
python3 skills/jev-skill-maintenance/scripts/inventory_skills.py \
  --source-root skills \
  --installed-root /Users/lee/.codex/skills \
  --installed-root /Users/lee/.agents/skills
```

실제 실행 exit 0. 원본 스킬 2개, `host_discovery_verified:false`, `host_invocation_verified:false`. 비교는 이 두 설치 루트의 같은 이름만 대상으로 했으며 다른 플러그인 캐시·호스트 목록 전체를 감사한 결과가 아니다. 도구는 읽기 전용이며 원본이나 설치 사본을 동기화하지 않는다.

도구의 tree SHA-256은 상대 경로·항목 종류·내용 해시를 정렬한 JSON의 해시다. 숨김 파일과 캐시도 포함하며, 내부 symlink는 링크 문자열만 해시한다. 외부 대상 내용·파일 모드·호스트 로딩 의미는 검사하지 않는다. 기존 스킬의 5개 파일에는 기존 `scripts/__pycache__/check_record.cpython-310.pyc` 1개가 포함된다. 이를 유지보수 원본 파일 5개라고 해석하지 않는다.

2026-10-10 검사 시점의 내용:

| 대상 | 파일 수 | tree SHA-256 |
|---|---:|---|
| decision-records 원본 | 5 | `408858b63b004ad7e74d90f4617825f54b74aef033d0a4cadcd1ea49aab55c37` |
| decision-records Codex 사본 | 5 | `93710658c36fcb02895e66e98e8724842c9e9dffcc2bdd152ccf4bffbf966979` |
| skill-maintenance 원본 | 4 | `0d0e3f8ee7219adf10629b1706755642ad55df4a18b23092130132d0bfa38c48` |

### 2026-10-10 23:15:17 KST — 해시 관측 이력 정정

초안 목록을 만든 뒤 설치 사본에서도 프로젝트 문서를 저장소 루트 기준으로 찾도록 안내를 보완했다. 이후 위 표를 최신 값으로 바꾸면서 이전 관측을 별도 보존하지 않았다. 독립 검토의 해시 차이 지적에 따라 초기 값과 변경 원인을 아래에 복원한다. 초기 값은 당시 이 세션의 실제 inventory 출력이며 새로운 현재 관측값으로 소급 표시하지 않는다.

| 대상 | 초기 표의 관측값 | 재확인한 현재 값 | 값이 달라진 원인 |
|---|---|---|---|
| decision-records 원본 | `3628c414d3c8df6e9f5f9af26b06b0aaead64db8b61cf64538b23148af1b6e36` | `408858b63b004ad7e74d90f4617825f54b74aef033d0a4cadcd1ea49aab55c37` | `references/record-contract.md`의 프로젝트 경로 안내 변경 |
| skill-maintenance 원본 | `b0f6f0a78c8e7f544436d30860e45c95988db7700bc9fae1d7f099116f2dae85` | `0d0e3f8ee7219adf10629b1706755642ad55df4a18b23092130132d0bfa38c48` | `SKILL.md`의 프로젝트 루트 기준 안내 변경 |

재확인 방법은 위 inventory 명령이며 exit 0, 원본 2개 및 설치 상태도 동일했다. 시각은 UTC `2026-10-10 14:15:17`에 확인했다. 기존 decision-records Codex 사본은 `93710658c36fcb02895e66e98e8724842c9e9dffcc2bdd152ccf4bffbf966979`로 유지됐고, 원본·설치 사본의 기존 `.pyc` 해시는 모두 `260b3435e87b44410aa21ac784bbd77401597a1effb28f98a78b9a8f927cd959`로 초기 관측과 같다. 이번 차이는 캐시 갱신 때문이 아니다.

캐시를 제외한 별도 기능 소스 해시는 이번에 추가하지 않았다. 현재 `tree_sha256`은 파일 목록 전체의 관측값이라는 의미를 유지하고, 이미 출력하는 파일별 해시와 경로로 원인을 설명한다. 향후 캐시만 바뀌는 실제 오탐 사례가 생기면 별도 필드로 분리할지 평가하며 기존 필드의 의미를 조용히 바꾸지 않는다.

## 유지보수와 다음 작업

완료는 해당 원본 변경·명시된 로컬 검증의 완료다. 설치 또는 사용자 효과까지 뜻하지 않는다. 상태 변경 때 근거·검증 명령·다음 행동을 같은 항목에 남긴다.

| ID / 상태 | 문제와 근거 | 수행한 변경 또는 다음 행동 | 담당·다음 시점 |
|---|---|---|---|
| SKM-001 / 원본 완료 | 사용자 D064 요청: 기존 스킬 개선·갱신·신규 생성을 담당할 역할 1명. 기존 저장소에는 기록 스킬만 존재했고 스킬 상태를 추적하는 문서·원본/사본 비교 도구가 없었음 | 유지보수 스킬, 이 목록, 읽기 전용 `fd`/SHA-256 도구. 도구 6개 검증 통과; 호스트 실행 효과는 미확인 | skills. 실제 다음 유지보수 요청에서 적용 결과를 추가 |
| SKM-002 / 원본 완료 | [D063 §2–3](../orchestration/D063_DAG_PLAN.md)의 mapping/실행 검사 구분과 revision 벡터 요구. 기존 기록 스킬은 일반 근거·비용만 다뤄 DAG claim의 필수 식별자를 안내하지 않았음 | 기록 스킬에 조건부 안내 1개와 reference 절 추가. 기존 구조화 계약을 유지. D063 기록 13개 source·6개 claim 형식/해시 검사 통과 | skills. 첫 DAG 실제 기록에서 claim별 근거 연결을 수동 검토 |
| SKM-003 / 설치 대기 | 현재 원본과 Codex 설치 사본의 2개 경로 차이. 새 스킬은 확인한 설치 루트에 없음 | 이번 범위는 저장소 원본이다. 설치 작업이 요청되면 타깃의 현재 변경부터 다시 비교하고 승인된 설치 범위에서 처리 | 설치 요청을 받는 담당. 설치 요청 또는 호스트 배포 작업이 있을 때 |
| SKM-004 / 후보 | D063의 DAG 운영 절차는 D064에서 개발 중이다. 반복된 실제 운영 요청·안정된 실행 진입점 근거가 아직 없음 | 별도 DAG 운영 스킬을 미리 만들지 않는다. 반복 작업이 확인되면 기존 기록/유지보수 역할과 다른 책임인지 평가하고 최소 사례로 검증 | skills. 안정된 runner의 실제 반복 운영에서 불편이 확인될 때 |
| SKM-005 / 부분 검증 | 최초 상태는 미검증. 아래 23:17:26 KST 기록에서 독립 검토자가 D064 사례에 원본 지침을 수동 적용하고 helper 6/6을 재실행한 근거 추가 | 기존 기록 스킬에 맡길 책임과 신규 스킬 후보를 구분하고 설치 사본을 자동 덮어쓰지 않는 행동을 확인. 호스트 자동 발견/선택과 사용자 효율은 미검증 | skills와 main. 다음 실제 작업에서 실패·효과를 기록하고 호스트 검증이 필요할 때 별도 수행 |

## 검증 기준과 완료 경계

- **구조:** `quick_validate.py`가 두 스킬 모두 `Skill is valid!`, exit 0. frontmatter·이름·scaffold 검사다.
- **도구:** 실제 `fd 10.4.2`와 Python으로 목록 검사를 실행했다. 동일/차이/추가·누락 파일, 없는 루트와 오류, 설치 symlink, 내부 symlink 대상 미열람, 숨김·바이너리 파일, 직접 하위 스킬 범위, 입력 불변을 격리 fixture에서 확인했다. 발견 도구가 exit 0과 오류 stderr를 함께 내는 모의 반례도 오류로 처리한다. 총 6개 테스트 통과, 생략 없음.
- **기존 기록 호환:** D063 source 13개·claim 6개 형식/해시 검사 통과. 기록 내용의 의미적 참이나 DAG 실행기는 이 검사로 검증되지 않는다.
- **수동 시나리오:** 검사 mapping만 존재하는 D063 상태를 제품 통과로 쓰지 않고, 검사 중 revision이 바뀐 경우 이전 pass를 완료 근거로 재사용하지 않으며, 일반 기록에는 DAG 필드를 새 필수값으로 요구하지 않는 흐름을 안내와 대조했다. 이는 작성자의 수동 검토이며 독립 에이전트 실험이 아니다.
- **독립 적용:** 기존 독립 검토 담당자가 D064 책임 구분과 원본/설치 사본 차이에 새 지침을 직접 적용하고 helper 6/6을 재실행했다. 상세는 아래 후속 기록과 [독립 적용 근거](../agents/D064_REVIEW.md#independent-maintenance-skill-application)를 따른다.
- **이번 미수행:** 전역 설치, 새 유료 호출, 제품 실행, 호스트 발견/자동 호출 검증, 효율 비교. 상세 명령과 출력은 [D064_SKILLS](../agents/D064_SKILLS.md)에 둔다.

## 2026-10-10 23:17:26 KST — 독립 스킬 적용 근거 추가

[D064_REVIEW의 Independent maintenance-skill application](../agents/D064_REVIEW.md#independent-maintenance-skill-application)을 실제 읽고 SKM-005를 최초 `미검증`에서 `부분 검증`으로 갱신했다. 확인 시각 UTC `2026-10-10 14:17:26`이다. 기존에 배정된 독립 검토자가 수행했으며 유지보수 에이전트를 추가한 결과가 아니다.

검토자는 D064의 revision·mapping 근거가 별도 스킬을 요구하는지, 원본/사본 차이만으로 설치 사본을 덮어써도 되는지를 구체 사례로 다뤘다. 관측 결과는 기존 `jev-decision-records`와 D064 결정/검토 기록에 근거를 남기고, 별도 DAG 운영 스킬은 반복된 고유 책임이 확인될 때까지 후보로 유지하며, 설치 사본은 변경하지 않는 것이었다.

독립 inventory와 helper 검사 명령은 모두 exit 0, helper 6/6 통과·생략 0이었다. 원본 2개, 기존 Codex 사본의 차이 2개 경로, 새 스킬의 두 루트 부재와 discovery/invocation `false`를 확인했다. 이는 **독립 수동 지침 적용과 실행 가능한 도구의 검증**이다. 자동 호스트 발견·자동 스킬 선택·유료 에이전트 benchmark·생산성 개선의 증거는 아니다. D064 제품 전체의 최종 검토 상태와도 별개이며, 검토 문서는 이 확인 시점에 core freeze를 기다리고 있었다.

## D065 — 테스트 정리와 실제 실행 근거의 구분

2026-10-10. [역할 요청](../agents/D065_PARALLEL.md)에 따라 같은 유지보수 담당이 기존 스킬을 적용했다. 변경 전 문서 7개와 그 해시는 `benchmark-runs/d065-preflight/skills-before/manifest.json`, 원본/사본 목록은 같은 폴더의 `inventory-before.json`에 보존했다. 복사 시각은 UTC `2026-10-10T14:40:57.356485+00:00`; 7/7 바이트 해시 일치를 확인했다.

| ID / 상태 | 관찰한 필요 | 최소 변경과 검증 | 담당·다음 시점 |
|---|---|---|---|
| SKM-006 / 원본·사례 적용 완료 | 최초 상태는 원본 보완·적용 결과 대기. D065가 중복 테스트 정리를 요청했으나 기존 유지보수 지침에는 삭제 전후 근거와 생존 사고 재현 테스트의 연결 기준이 없었음 | maintenance 단락 1개 추가. 실제 삭제 지도·수정 전후 코드·담당 검증 출력을 대조했고, 별도 결함 조건 2개를 복원한 사례에 따라 생존 테스트의 실제 fault/assertion 비교를 같은 단락에 보완 | skills. 아래 23:48:40 KST 적용 기록 참조; 전체 삭제 안전성과 통합 회귀의 최종 판정은 해당 검토 담당/root 범위 |
| SKM-007 / 원본 보완, 실행 결과 미확인 | D064의 mock 판단·제안 handler와 D065에서 요청한 실제 runtime/action 근거를 기록에서 구분해야 함 | decision-records 기존 DAG 참고 절에 항목 1개 추가. mock/제안/적용 revision/실제 attempt 및 바인딩된 실행 근거를 구분. 실행 계약·JSON schema·도구 코드는 변경 없음 | skills와 기록 담당. D065 런타임·runner 관측 결과가 도착할 때 근거 수준별로 기록 |

새 스킬은 만들지 않았다. 두 기존 스킬의 구조 검사는 각각 `Skill is valid!`, exit 0이다. 변경 전후 diff는 위 단락 1개·항목 1개뿐이다. `check_record.py docs/decisions/D064.md --root .`도 sources 21개·claims 10개를 통과해 보존된 D064 근거를 확인했다. 의미적 참 검증은 false다. helper/checker 코드·테스트는 변경하지 않았으며 이번 문서 보완을 위해 helper 6개나 전체 프로젝트 회귀를 중복 실행하지 않았다.

D065 최초 보완 후 실제 inventory exit 0의 관측값:

| 대상 | tree SHA-256 | 설치 구분 |
|---|---|---|
| decision-records 원본 | `05c19e728c3ad5008df663e369f12cf392307730b69cc13bbe7cdf39a15cfa55` | Codex 설치 사본과 `SKILL.md`, `references/record-contract.md` 차이 |
| skill-maintenance 원본 | `0c3cdbec4f0bc09794072e3ce4b51096e01aad2941ec897aedfd63bf2da8fe93` | 확인한 Codex/agents 설치 루트에 없음 |
| decision-records Codex 사본 | `93710658c36fcb02895e66e98e8724842c9e9dffcc2bdd152ccf4bffbf966979` | 이전 관측과 동일, 갱신 안 함 |

이 표는 D064 표를 덮어쓰지 않는 새 관측이다. 원본 2개와 파일 수·캐시는 유지됐고 discovery/invocation은 여전히 false다. 실제 D065 적용 사례와 남은 한계는 [D065_SKILLS](../agents/D065_SKILLS.md)에 이어 기록한다.

### 2026-10-10 23:48:40 KST — 실제 삭제 사례 적용과 원본 확정

`d065_test_trim`의 [삭제 목록](../../benchmark-runs/d065-test-trim/removal-map.json), [수치](../../benchmark-runs/d065-test-trim/metrics.json), 전후 source와 수정 후 TAP를 읽었다. 기존 `ready leaf`의 빈 review/변경된 choice 거부가 생존 provenance 테스트에 남아 있음을 직접 대조했다. revision race와 불확실 전송의 현재 사고 재현 테스트도 읽었다. 이는 대표 사례의 수동 대조이며 모든 삭제 항목을 독립적으로 재검증했다는 뜻은 아니다.

담당과 검토자의 교환에서 처음 통합한 테스트가 동일 타입의 다른 문자열 oracle과 일부 항목만 빠진 비어 있지 않은 child를 명시적으로 재현하지 못한다는 문제가 나왔다. 해당 조건이 기존 테스트 안에 복원된 실제 source를 확인했다. 이 관측으로 maintenance 단락에 **살아 있는 테스트의 실제 fault 조건과 assertion을 비교한다**는 구절을 보완했다. 새 테스트나 스킬은 추가하지 않았다.

최종 담당 기록의 영향 범위는 3개 파일, 테스트 **67→55**, 줄 **1,076→904**, 바이트 **63,224→53,502**다. 수정 후 담당의 실제 TAP는 **55/55 통과, 실패·생략 0**, 7393.651125ms였다. 최초 55/55 통과 뒤에도 위 두 결함 조건 보존 문제가 발견되어 재검증한 이력을 유지한다. 마지막 줄 수 904는 실행 의미를 바꾸지 않는 빈 줄 1개 정리까지 포함한다. 초기 지도/수치/출력은 해당 evidence 폴더에 별도로 보존돼 있다.

before 5606.708208ms와 after-review 7393.651125ms는 다른 에이전트가 함께 작업하는 동안 실행한 별개 관측이다. 테스트 수 감소를 속도 개선으로 보고하지 않았다. 해당 테스트 프로세스 실행과 내부 provider callback의 local double도 구분했다. 이 결과가 D065 실제 provider 요청·새 runtime/handler 완성·제품 성공을 뜻하지 않는다. 전체 삭제 검토와 통합 회귀의 최신 상태는 [D065_TEST_TRIM](../agents/D065_TEST_TRIM.md)과 [독립 검토](../agents/D065_REVIEW.md)를 따른다.

추가 구절 이후 maintenance 구조 검사도 exit 0이었다. 최종 inventory exit 0에서 maintenance 원본은 `7445e650fff623c91b8a56bcaeb3756ef6de03293ce3303b43fcb06047dd73cd`로 바뀌었다. 직전 `0c3cdbec…` 값은 위 최초 관측으로 보존한다. decision-records 원본 `05c19e72…`, Codex 설치 사본 `93710658…`, 캐시·helper·테스트·설치 상태는 유지됐다. 이 확인 시각은 UTC `2026-10-10 14:48:40`이며 source 작업을 종료했다.

## D066 — 기존 지침으로 재귀 실행 비교의 기록 책임 적용

2026-10-11 01:37:51 KST에 실제 inventory를 다시 실행했다(UTC `2026-10-10 16:37:51`, exit 0). 원본 2개와 파일별 해시가 D065 최종 관측과 같았다. decision-records 원본 tree는 `05c19e728c3ad5008df663e369f12cf392307730b69cc13bbe7cdf39a15cfa55`, maintenance 원본은 `7445e650fff623c91b8a56bcaeb3756ef6de03293ce3303b43fcb06047dd73cd`다. Codex records 사본은 `93710658c36fcb02895e66e98e8724842c9e9dffcc2bdd152ccf4bffbf966979`이고 차이는 여전히 `SKILL.md`·`references/record-contract.md`다. agents 루트에는 두 스킬 모두 없고, maintenance는 Codex 루트에도 없다. 캐시를 포함한 전체 tree 의미와 discovery/invocation `false`를 유지한다.

| ID / 상태 | 현재 적용 근거 | 수행한 판단·다음 행동 | 담당·다음 시점 |
|---|---|---|---|
| SKM-007 / D065 종료 근거 후속 적용 완료 | 위 D065 절의 당시 상태는 실제 결과 미확인이었다. 이제 원본 live 결과·별도 독립 grade 요약·종료 분석을 읽어 시도 종료와 제품 성공이 다른 사례를 확인 | 원본 `uncertain`, 후속 독립 제품 실패, 성공 완료시간 `null`을 각각 유지했다. 후속 무모델 진단을 원본 성공이나 새 provider 호출로 합치지 않는 기록 적용. 과거 기록·후보 수정 없음 | skills. [D066_SKILLS의 실제 사례](../agents/D066_SKILLS.md#d065-실제-실패에-기존-규칙을-적용한-사례) 참조 |
| SKM-008 / 사전 적용 완료, D066 결과 미측정 | 새 요청의 실행 승인 범위, 공유 catalog 준비 비용, 같은 조건에서의 성공·실패 비교가 필요. 기존 records 지침이 사용자 권한·준비 역할·비용 기준·실패 시도·revision·완료시간을 이미 다룸 | 스킬 원본·코드·테스트 변경 0. 프로토콜과 runner 담당에게 공통 준비의 원문 입력·동일 바이트·실제 영수증·전체/분배 계산, 판단→revision→실행 연결의 기록 필요를 전달. 수치·실행 성공은 미측정으로 둠 | root가 실행 전 프로토콜을 고정하고 실제 영수증·독립 채점이 도착할 때 계산과 claim을 검토 |

SKM-003의 설치 상태와 SKM-004의 별도 운영 스킬 후보는 유지한다. D066 기능이 새롭다는 이유만으로 다른 스킬을 만들지 않았다. 기존 역할 계약·runner 제안에 이미 있는 비교 조건을 스킬에 복제하지 않았다. 적용 상세와 구체 기록 요구는 [D066_SKILLS](../agents/D066_SKILLS.md)에 둔다. 이번에는 실제 목록 도구와 문서/기존 실행 근거의 수동 대조만 수행했다. 변경 없는 스킬의 구조 검사·helper 테스트·프로젝트 회귀를 반복하지 않았다.

### 2026-10-11 02:55:46 KST — 종료 근거에 따른 최소 보완

위 SKM-008은 사전 상태다. 실제 네 조건의 [분석 02](../../benchmark-runs/d066-analysis-02.json), Claude 독립 평가 요약, 세 Jev events, 실제 numeric monitor 입력/결과가 도착한 뒤 같은 담당이 적용 기록을 이어 갱신했다. 상세 명령·수치·한계는 [D066_SKILLS의 종료 후 적용](../agents/D066_SKILLS.md#2026-10-11-025546-kst--실제-네-조건-종료-후-적용)을 따른다.

| ID / 상태 | 관측한 필요 | 최소 변경·다음 행동 |
|---|---|---|
| SKM-008 / 종료 근거 적용 완료, Jev 후속 단계 비교 미측정 | Claude는 구현 6회+수리 6회 후 공개 85/85·독립 63/63. 세 Jev 조건은 각각 입력 650,271+예정 예약 65,536>조건 한도 700,000으로 계획 중단. 전역 종료 잔여 415,445·실제 pending 0 | 공통 준비를 실제 cohort 비용에 한 번 집계하는 계산을 대조. 실패 시간·비용은 보존하고 관계·수리·성공 완료 비교는 미측정으로 유지. 새 한도/질문 설계는 기존 실험의 성공 정정으로 취급하지 않음 |
| SKM-009 / 원본 보완·사례 적용 완료 | 각 Jev planner callback 34와 실제 POST 33의 계수 차이, `adaptive_provider_started` 미발생으로 인한 분석 시간 경계 정정, aggregate만 받은 실제 모델 리뷰가 확인됨 | records의 기존 DAG reference에 계수/예산 및 리뷰 입력 항목을 추가하고 단계 도달·시간 사건 안내를 보완. 변경한 스킬 구조 검사와 실제 inventory exit 0. 생산 코드·검사기·테스트·전역 사본 변경 없음 |

새 records tree는 `1aef61f32fc261393ae9097e516cf662776b3a2f13785be12a33a5deb4524e90`, reference SHA-256은 `18b86caa49840728b20e243e053d9e1b61ea0eb32da9cce2050895b9f9d6c2df`다. 이전 `05c19e72…` tree 관측은 그대로 보존한다. maintenance `7445e650…`, Codex records 사본 `93710658…`, 캐시·도구·설치 상태는 유지됐고 discovery/invocation은 false다. 시각은 UTC `2026-10-10 17:55:46`이다.

실제 모델 모니터는 수치 패킷만 받았으므로 집계의 계산/한계 리뷰로 기록한다. 원시 receipt·소스 동일성·revision binding·독립 제품 채점을 모델이 감사한 근거는 아니다. 이번에는 저장된 실제 사례를 읽어 지침에 적용했으며 새 모델 호출·후보 실행·숨김 검사 열람·장부 변경·신규 스킬·신규 테스트는 없다. 다음 유지보수 trigger는 새 비교 설계 요청 또는 실제 기록 누락의 재발이다.

## D067 — 최신 상한 해제 승인과 병렬 조건 기록

2026-10-11. 사용자가 조건별 상한과 장부 토큰 한도를 현재 해제하고 즉시 병렬 실행하도록 요청했다. 이는 새 D067 조건의 승인이다. D066의 700,000/10,000,000 한도·중단 결과·장부 누적 이력은 당시 근거로 보존하며 종료된 시도를 소급 수정하지 않는다. [D067 역할 계약](../agents/D067_PARALLEL.md)에 따라 같은 단일 관리 역할을 이어 수행한다.

| ID / 상태 | 실제 필요와 근거 | 최소 변경·담당·다음 시점 |
|---|---|---|
| SKM-010 / 원본·실제 종료 근거 적용 완료 | 최신 무상한 승인과 동시 4조건 계획. 기존 reference는 한도별 stop을 다루지만 정책 버전에 따른 null 의미·원장 이력 보존·동시 조건과 직렬 정산·준비 재사용 비용 경계를 직접 안내하지 않았음 | 이관의 6개 이력 필드 보존·명시적 null과 실제 종료 분석을 적용했다. 재사용 준비 신규 호출/비용 0, 개별 조건 장부 구간에 형제 조건의 지출이 포함되는 점을 구분. 실행 중 원본 동결을 유지했고 과거 기록 보존 |
| SKM-011 / 원본·실제 사례 적용 완료 | `jev_all` 수리 요청은 직렬화 188,240바이트로 로컬 한도 안이었으나 모델 입력 한도 HTTP400으로 실패. 미확인 usage와 후속 환불 정산, 독립63/63·공개83/85가 서로 다른 결과라는 실제 사례 | 기존 reference의 입력 크기·실패/정산 항목 2개와 기존 검사 항목만 보완. 구조 검사·inventory·diff exit 0. 새 스킬·helper·테스트·생산 코드·유료 호출 없음. 향후 수리 payload 변경 실험 또는 같은 혼동의 재발 때 재적용 |

상세 적용·검사 명령·설치 상태·미수행 범위는 [D067_SKILLS](../agents/D067_SKILLS.md)에 둔다. 이번 역할은 런타임 한도나 승인 절차를 새로 만들지 않는다. 무상한의 실제 지원, 장부 이관, 안전한 동시 정산과 전체 개발 효율은 담당 구현·실행의 별도 근거가 필요하다. SKM-003 설치 대기와 SKM-004 운영 스킬 후보는 유지한다.

이번 변경 후 실제 inventory의 records 원본 tree는 `da1a397fbee8855ee9c7ef6c785f4c94fd14325a4747dc2dad172a5a246e0aeb`, reference는 `9598810d4fb02281eb97cbc287073825d902bd7ac56c094f56cb711ed0d8be5e`다. D066의 `1aef61f3…` 관측은 위 과거 기록으로 유지한다. maintenance 원본 `7445e650…`, Codex records 사본 `93710658…`, 변경 경로 2개와 설치 부재 상태는 그대로다. `host_discovery_verified`와 `host_invocation_verified`는 false이며 실제 효과를 확인했다는 뜻으로 바꾸지 않았다.

2026-10-11 14:52 KST 후속: root가 수행한 v2→v3 이관의 [실제 검증](../../benchmark-runs/d067-preflight/migration-validation.json)과 전후 사본을 읽어 9,584,555 입력·483 정산 및 ID/last/pending/blocked 보존을 직접 확인했다. 누적 한도 null과 비용 null의 의미를 분리했다. [launch-gate](../../benchmark-runs/d067-preflight/launch-gate.json)의 무추론 ready와 동결 사본을 확인했고 새 4조건은 root driver session70195에서 진행 중이다. 시작 시 기록된 장부 대기는 실제 공급자/작업자 중첩과 구분한다. 제품 결과·최종 효율은 아직 대기다. 이 단계에서는 상태 문서 2개만 수정했으며 원장·스킬 원본·생산 소스·설치·모델 호출은 변경/실행하지 않았다.

### 2026-10-11 15:50 KST — 실제 종료와 환불 근거 적용

위 14:52 기록은 진행 중 관측이다. 이제 [분석 02](../../benchmark-runs/d067-analysis-02.json)와 원본 실패 영수증·저장된 환불/장부 사본을 읽어 종료 사례를 적용했다. 공개·독립 검사 결합 완료는 3/4, `jev_all`은 독립63/63이어도 공개83/85라서 완료가 아니다. 수리 판단 HTTP400에 답이 없어 수리 작업자는 실행되지 않았다. 후속 환불 정산으로 pending이 해제된 것은 제품 실패의 정정이나 추론 입력 0의 근거가 아니다.

변경은 기존 reference의 항목 2개 추가와 검사 조건 항목 보완, 역할 문서·목록이다. 세부 수치·실제 재계산 명령·근거/한계는 [D067_SKILLS 종료 절](../agents/D067_SKILLS.md#2026-10-11-1550-kst--종료-근거-적용과-최소-보완)을 따른다. 실행 전 동결 사본과 runtime 원본을 보존했고 모델·장부·설치·생산 코드 변경은 이 역할에서 하지 않았다.

종료 후 최종 구조 검사 `Skill is valid!`, inventory·diff 검사 exit 0을 확인했다. 최종 records tree `fb6258276891dc332afa74a79f0d2cdbbe4c687f6ec6d9abddd327f398525f2d`, reference `6e951a759c0c868ba85a25428d7b03053abb0f37fdb4ed60790c1b52988fc3ed`를 새 관측으로 남긴다. 실행 전 `da1a397f…`/`9598810d…` 관측은 보존한다. maintenance·검사기·cache·설치 상태는 유지됐으며 호스트 발견/호출·스킬로 인한 사용자 효율은 검증하지 않았다.

## D068 — 수리 변경과 단일 새 조건의 증거 경계

2026-10-11. 최신 역할·실험 계약은 입력 투영, 실패 원인 전달, 불필요한 재호출 수정 뒤 새 `jev_all` 한 조건을 실행하도록 정한다. 기존 D067 원본과 종료 실패를 보존한다. [D068_SKILLS](../agents/D068_SKILLS.md)에 기존 두 스킬의 적용·변경·검증·인계를 기록한다.

| ID / 상태 | 실제 필요와 근거 | 최소 변경·담당·다음 시점 |
|---|---|---|
| SKM-012 / 원본·실제 종료 근거 적용 완료 | D067의 미실행59개와 실패24개가 전원 수리 후보로 확장된 사례 뒤 D068은 공개84/85·독립63/63으로 미완료. 축소된 수리 질문도 model_input_limit로 거절돼 선택/수리작업자0. 통합 case1개→요구사항9개→owner3명/consumer포함4명으로 후보가 확대되는 실제 관측 추가 | 기존 수리 범위 항목에 coverage 소유자와 실패 assertion 원인 소유자·후보 leaf/unit/requirement 확대 구분만 보완. 후보 축소와 실제 재호출 절감, 바이트 축소와 모델 수락, 실패와 후속 무과금 정산을 각각 기록. 새 스킬·실행·생산 코드 없음. 실제 수리 성공·효율은 미검증 유지 |

bytes와 tokens, 확정 HTTP 실패·미확인 사용량·정산, 공개+독립 완료 조건은 기존 SKM-011 규칙을 그대로 적용한다. 새 스킬·helper·검사 schema·생산 코드·테스트·전역 설치를 추가하지 않는다. SKM-003 설치 대기와 SKM-004 별도 운영 스킬 후보는 유지한다.

2026-10-11 18:10 KST 실제 구조 검사 `Skill is valid!`, inventory·diff 검사 exit 0. records 원본 tree `d825db9ebc67ff9869fd564d5354657b83e2edbde35d50e636b48666a5721267`, reference `6ed051e9ece699b68af8c6c2be58fe56ee20c4ba1285ce15b2090823fa1477a3`를 새 관측으로 남긴다. D067의 `fb625827…`/`6e951a75…` 관측은 보존한다. 기존 maintenance·검사기·cache·Codex records 사본과 설치 상태는 바뀌지 않았다. 자동 호스트 발견·호출·실제 작업 개선은 이 검사로 검증되지 않는다.

### 2026-10-11 19:15 KST — 실제 실패와 후보 확대의 종료 적용

[분석 02](../../benchmark-runs/d068-analysis-02.json), [투영 감사](../../benchmark-runs/d068-projection-live-failure-01.json), [범위 감사](../../benchmark-runs/d068-scope-live-failure-01.json), [수치 모니터](../../benchmark-runs/d068-monitor-01/result.json)를 읽고 적용했다. 수리 직렬화172,019→97,071B는74,948/172,019=43.5696% 감소지만 실제 HTTP400 model_input_limit로 거절됐다. 실패 usage는null이며 확인된0청구·후속 예약 정산은 별도다. 선택 수리0·실제 수리 작업자0을 호출 절감으로 계산하지 않는다.

통합 case의9개 요구사항 coverage가 owner3명·consumer포함4명 후보로 연결됐고, 큰12단위 잎을 포함하면서 후보 합집합 요구사항55개가 전달됐다. 실제 assertion의 원인 소유자와 coverage 매핑을 구분하도록 기존 reference의 수리 항목 문장만 보완했다. 사전 예상은 제품·수리 성공이었으나 실제 제품은 공개84/85·독립63/63으로 미완료다. 단일 현재 조건과 과거 네 조건 병렬의 차이, 숫자 패킷만 받은 모니터의 검토 범위도 보존했다. 상세 근거·명령·남은 검증은 [D068_SKILLS 종료 절](../agents/D068_SKILLS.md#2026-10-11-1915-kst--실제-종료-실패와-후보-범위-근거-적용)을 따른다.

종료 보완 후 기존 구조 검사 `Skill is valid!`, inventory·지정한 3파일의 diff 검사 exit 0을 확인했다. 최종 records tree `9087a2325448f5ed72ddfbc9db83abb37315d896002ff722e067f433db0d73eb`, reference `7dd4cb5e8594b3d152bdcb373181b1138076fe2976143f5d129cdc1adbe53000`를 새 관측으로 남긴다. 위 18:10 사전 해시는 보존한다. maintenance 원본·검사기·schema·cache·설치 사본과 설치 부재 상태는 바뀌지 않았고 호스트 발견/호출·실제 효율은 미검증이다. 지정한 문서 3파일 외 쓰기나 새 실행은 하지 않았다.

## D069 — assertion·산출물 수리·토큰 사전검사 기록

2026-10-11. [D069 역할 계약](../agents/D069_PARALLEL.md)에 따라 기존 단일 스킬 담당이 이어 맡는다. 현재 승인된 새 실험과 D067/D068 원본 보존을 구분하며, 구현 API 확정과 실제 실행 근거 전에는 사전 적용으로 기록한다. 상세 상태는 [D069_SKILLS](../agents/D069_SKILLS.md)를 따른다.

| ID / 상태 | 실제 필요와 근거 | 최소 변경·담당·다음 시점 |
|---|---|---|
| SKM-013 / 새 개발·모니터 종료 근거 적용, 실제 수리 효과 미측정 | v1 70,510B 오허용·실패의 고정 성공 문구를 보존한 뒤 진단 03의 23,715B 질문 수락을 확인. 새 개발은 공개 85/85·독립 63/63 완료이나 실제 수리 decision/worker/carry-forward 0 | 기존 수리·입력·실패/정산 규칙으로 진단 수락과 새 생성 완료·실제 수리 효과를 분리. 추가 규칙·스킬·설치 없이 역할 문서/목록만 갱신. 모니터의 계수 범위 불일치 주장은 기각 정정·원본 보존, 재호출 절감은 미측정 |

변경 전 read-only inventory는 exit 0이며 D068 최종 records tree `9087a232…`, reference `7dd4cb5e…`, maintenance tree `7445e650…`와 일치했다. Codex records 사본은 `93710658…`로 유지되고 `SKILL.md`·reference가 원본과 다르다. records의 agents 설치 부재, maintenance의 두 루트 설치 부재도 그대로다. 원본 스킬은 2개이며 host discovery/invocation은 미검증이다. 이번 사전 단계에서는 설치 사본·helper·검사기·schema·생산 소스를 변경하지 않았다.

19:39 KST 사전 적용: assertion/산출물 담당의 초기 API 문서와 토큰 담당의 조사 범위 내 정확 counter/framing 미발견 보고를 대조했다. 후자는 이 역할의 독립 외부 조사 결과가 아니며 byte 휴리스틱을 정확 계수·증명된 상한으로 바꾸지 않는다. 과거 aggregate usage와 개별 질문 문맥 한도, local admission과 provider 수락을 구분했다. 현재 보완은 재사용 증거 지침이며 최종 JSON 필드·한도·생산 정책을 발명하지 않는다. [D069_SKILLS의 사례 적용](../agents/D069_SKILLS.md#저장-사례에-대한-수동-적용)에 수동 검토와 비적용 경계를 남겼다.

보완 후 기존 구조 검사 `Skill is valid!`, inventory·지정한 3파일 diff 검사 exit 0. records tree는 `2b0f08febdb28bf0ed13171edea1aaaa7102b24402bdfd011aadd333adc4f3ae`, reference는 `ec61c8b47126e51f2f17586521f76e5f260289c7e1b4c4a34d839e7dec98d198`다. 위 변경 전 관측과 D068 원본은 보존했다. maintenance·cache·검사기·schema·설치 사본/부재 상태는 유지됐고 자동 호스트 발견·호출·실제 효율은 미검증이다. 사전 쓰기를 종료하며 구현 계약 확정과 실제 결과 전달이 다음 trigger다.

### 2026-10-11 20:13 KST — 실제 사전검사 반증과 잘못된 성공 문구의 정정

[보존 후보 재검사](../../benchmark-runs/d069-preserved-recheck-01/result.json), [진단 01](../../benchmark-runs/d069-admission-probe-01/result.json), [진단 02](../../benchmark-runs/d069-admission-probe-02/result.json)와 [그 사전 계수](../../benchmark-runs/d069-admission-probe-02/request-admission-before.json), [후속 환불 근거](../../benchmark-runs/d069-refund-01/evidence.json), [실험 계약의 정정](../orchestration/D069_EXPERIMENT.md#실제-사전-진단이-뒤집은-결과--2026-10-11-후속)을 읽어 적용했다. 이 역할은 저장된 결과를 대조했으며 재검사·모델 요청·계정 조회·정산을 다시 실행하지 않았다.

- 공개 재검사는 84/85이며 같은 `A.integration.diagnostics.existing-output-refused`가 실패했다. 뒤의 assertion 3개는 `not_reached`이고 원본 38파일·원래 공개 결과는 불변이다. 산출물 A03/담당 잎 n9 연결은 `public_interface_candidate_not_fault_proof` 수준이다. 이 단계의 provider/작업자 호출은 0이며 실제 수리 성공은 아니다.
- 진단 01은 소수 timeout을 전달한 helper 결함에 따른 `INVALID_CONFIG`로 **POST 0**, 진단 02는 수정 후 **POST 1**에서 HTTP400 `model_input_limit`이었다. 실제 wire는 70,510B, v1의 request 추정은 28,716, state-plus-question 추정은 **28,690**이었다. 두 추정의 범위도 구분한다. 32,000 아래라는 사전 허용이 실제 수락을 보장하지 않았으며 정확 모델 토큰·provider usage·답은 null, 작업자 0, 자동 재시도 0이다. 과거 47/47 aggregate coverage를 실제 수락 보장으로 일반화하지 않는 기존 지침의 구체 반증이다.
- 두 원본 result의 `acceptance_boundary`는 실패인데도 이 질문이 수락됐다는 고정 문자열을 기록했다. 이는 보고 구현 결함이며 실제 status·HTTP 원인·전송 횟수가 우선하는 근거다. 원본 문구를 지우지 않고 실험 계약에 정정했다는 사실을 연결한다. 새 helper의 조건부 문구 수정과 기존 실패 요청의 성공 여부는 별개다.
- 후속 환불 기록은 실패 요청 청구 0·추론 입력 null을 구분한다. 진단 02 원본의 `budget_settled:false`는 당시 상태로 보존한다. UI에 run UUID가 없어 고유 실패 행·인접 기록·바인딩된 HTTP를 연결했다는 정산 근거의 한계도 유지한다.

새 v2의 repair 24,000B 상한은 **운영 정책**이며 정확 토큰 한도·입증된 token bound·수락 보장이 아니다. [토큰 담당 문서](../agents/D069_TOKENS.md)의 v1 실패 보존과 v2 오프라인 검증을 구분한다. 새로 구성한 질문의 진단은 요청/정책 hash와 실제 전송 이력을 기준으로 이전 실패 요청의 재전송과 구분하고, 진단 시간·POST·비용을 전체 개발 조건과 따로 집계해야 한다. 진단 01의 전송 전 결함을 수정한 뒤 진단 02에서 처음 보낸 것과, 이미 전송한 질문을 다시 보내는 것도 같은 횟수로 세지 않는다. 이 관측 시점에 v2 통합·새 질문 진단·전체 개발 결과는 아직 전달되지 않았으며 실제 수리·완료·효율은 미측정이다.

기존 reference가 과거 적합/실제 수락과 일반 정정 원칙을 이미 다루므로 반복 항목을 만들지 않았다. 입력 크기 항목에 **반증 보존·실제 상태에 따른 acceptance 보고 정정** 한 문장, 실패/정산 항목에 **전송 전 결함·변경 질문 진단·재전송의 식별** 한 문장만 추가했다. 이번 후속 쓰기는 MAINTENANCE와 기존 reference 2파일에 한정하며 D069 역할 기록의 사전 시점, D067/D068 원본, production/manifest/helper/ledger/설치 사본은 바꾸지 않는다.

후속 보완의 기존 구조 검사는 `Skill is valid!`, inventory·지정한 2파일 `git diff --check`는 exit 0이었다. records tree `157d7f3f2aec6d3b7179a2c2db797bb0ff2dfbdbf32e65cbd22e1a025a90b371`, reference `5222b8c8a9923d0d97ef4dce8737bb00be070b6c14f240fdfe5895122c1dde9d`를 새 관측으로 남기며 19:39의 해시는 보존한다. maintenance 원본·검사기·schema·cache·Codex records 사본과 설치 부재 상태는 동일하다. host discovery/invocation·실제 수리 효과는 이 문서 검사로 검증하지 않았다. 이번 쓰기는 종료하며 새 D069 실행 근거 전달이 다음 trigger다.

### 2026-10-11 21:12 KST — 새 제품 완료, 진단 수락, 실제 수리 미측정

[분석 01](../../benchmark-runs/d069-analysis-01.json)에서 새 arm은 공개 85/85·독립 63/63·skip 0의 결합 완료다. Jev POST 47(분해 45·관계 2), Claude 구현 10, 수리 decision/worker/carry-forward/inheritance proof 0으로 **실제 산출물 수리·재호출 절감은 미측정**이다. arm 본체 2,364,670.661541ms·cache 포함 5,809,782토큰·공식 환산 USD12.3604662와 진단·채점·모니터·준비를 구분했다. 실제 청구/구독 배분은 null이다.

[진단 03](../../benchmark-runs/d069-admission-probe-03/result.json)은 해당 질문 23,715B를 수락해 input 10,891/output 69·환산 USD0.0065346을 기록했지만 worker는 0이다. 수락 관측을 실제 수리 완료나 향후 입력의 보장으로 바꾸지 않는다. D068과의 [계획 구조 일치](../../benchmark-runs/d069-preflight/plan-equivalence.json)는 새 생성 바이트·cache·시간 동일성을 뜻하지 않는다. v1 오허용·보고 결함·실패 usage null은 위 원본 관측으로 유지한다.

기존 reference가 이미 이 경계를 다루므로 추가 규칙·스킬·설치 없이 D069_SKILLS와 이 목록만 수정했다. 상세 산식·검증 범위는 [D069_SKILLS 종료 절](../agents/D069_SKILLS.md#2026-10-11-2112-kst--새-개발-완료와-수리-미측정의-분리)을 따른다. 분석 01은 모니터 종료 근거가 빠진 시점의 스냅샷이며 최종 모니터/전체 집계는 root가 이어 기록한다. 동결 프로토콜·역할/모니터 계약·생산 소스·실행 원본·장부는 이 역할에서 변경하지 않았다.

후속 [분석 02](../../benchmark-runs/d069-analysis-02.json)의 모니터는 attention·31,291.095583ms·8,674토큰·환산 USD0.106932다. [검토 정정](../../benchmark-runs/d069-preflight/monitor-review-01.json)은 per-question 추정 9,972와 request-total input 10,891의 “9.2%” 비교를 범위 불일치로 기각하고 원본을 보존한다. 두 planning.json은 직접 읽은 바이트 수 186,971과 SHA-256 `46d88084c6c77a6d4b2e5c9fff7e55bde5254e6777074c25fbf7f449f0c2d7d3`가 동일했다. 생성 출력·cache·시간 동일성이나 수정의 인과 효과로 확대하지 않는다.

이번 종료의 기존 구조 검사 `Skill is valid!`, inventory·소유 문서 diff 검사 exit 0. 미추적 문서 2개를 각각 `/dev/null`과 대조한 `git diff --no-index --check`는 신규 내용 차이로 exit 1이며 공백 오류 출력은 없었다. records tree `157d7f3f…`/reference `5222b8c8…`와 maintenance·cache·검사기·schema·설치 사본/부재 상태는 20:13 관측과 같다. 새 reference 수정 없이 소유 문서 2파일 갱신을 마쳤으며 쓰기를 종료한다. 호스트 호출·스킬 효율과 실제 수리 효과는 미검증이다.

## D070 — 균형 분해와 별도 수리의 사전 검토

2026-10-11. [역할 계약](../agents/D070_PARALLEL.md)·[실험 계획](../orchestration/D070_EXPERIMENT.md)에 따라 같은 단일 스킬 담당이 이어 맡는다. 새 개발 A와 보존 실패 후보의 실제 수리 B를 구분하며, 목표는 기존 Claude 단독 성공보다 완료시간과 공식 환산비용을 모두 낮추는 것이다. 공개 85/85·독립 63/63·생략 0의 조건을 유지한다. D069와 그 이전 문서/실험 원본은 바꾸지 않는다.

| ID / 상태 | 검토 근거와 판단 | 최소 제안·다음 시점 |
|---|---|---|
| SKM-014 / A·B 종료 근거 적용, 공개 품질 회귀로 전체 우위 미달 | A는 고정 공개 85/85·독립 63/63에서 과거 Claude 대비 시간 5.318%·환산비용 42.364% 감소. 그러나 별도 공개 설명 진단은 A 0/8·Claude/D069 각 8/8이며 Jev의 두 수리 후보는 A19 또는 중단으로 제한됨. B는 별도 실제 수리 성공 | 기존 규칙으로 고정 gate/후속 진단, A/B 분모, controller 후보 제약/Jev 선택을 구분. 원래 148개 결과 보존, 더 넓은 동일 품질 효율 달성으로 확대 금지. SKILL/source/reference/설치 수정 0. 남은 개선은 설명 전달·앞단 후보 범위·공개 경계 검사 |

[D070_SKILLS](../agents/D070_SKILLS.md)에 기존 규칙 적용표와 제안·검증 범위를 남겼다. 더 많은 잎이나 작은 payload를 효율 성과로, 기존 실패 후보의 수리 시간을 처음부터 개발한 Claude의 완료시간으로, 두 지표 중 하나의 개선을 동시 목표 달성으로 바꾸지 않는다. 사전 단계의 실제 분해 품질·수리·제품 완료·효율은 미측정이었으며 아래 시점별 관측을 이어 적용한다. 새 스킬·helper·schema·전역 설치 없이 역할 문서와 이 목록만 갱신한다.

사전 inventory exit 0에서 records tree `157d7f3f…`/reference `5222b8c8…`와 maintenance·cache·검사기·설치 사본/부재 상태는 D069 최종 관측과 같았다. 변경 없는 skill 구조/helper/프로젝트 테스트는 반복하지 않았다. 소유 미추적 문서 2개의 `git diff --no-index --check`는 신규 내용 차이로 exit 1, 공백 오류 출력 없음이다. 발견/호스트 호출·실제 스킬 효과는 미검증이며 사전 쓰기를 종료한다.

### 2026-10-11 22:18 KST — B 실제 수리 완료, A 중간 관측 적용

위 사전 미측정 상태에 이어 [B 실제 수리 결과](../orchestration/D070_PRESERVED_REPAIR_RESULTS.md), [원시 감사 62/62](../../benchmark-runs/d070-review/preserved-raw-01.json), [완료·보존 감사](../../benchmark-runs/d070-review/preserved-completion-01.json)를 읽었다. B는 D068 실패의 새 사본에서 새 Jev POST 1회로 A03을 고르고 Claude repair worker 1회를 실행한 뒤 공개 85/85·독립 63/63·생략 0을 통과했다. 허용 쓰기 2경로 중 `cli.py` 하나만 바뀌었고 비선택 21산출물/36파일과 원본 후보의 보존을 확인한 근거다. 나머지 9 worker는 carry-forward이며 provider 재호출은 0이다. 이는 실제 수리 성공 1건이고 대조 실험으로 입증한 “9회 절감”이나 모든 실패 유형의 성공률은 아니다.

B runner 533,346.788666ms와 새 provider 호출 2개·125,964토큰·공식 환산 USD0.2762162는 **이전 실패 후보를 시작점으로 받은 B의 분모**다. 독립 채점 18,743.91725ms는 별도이며 bootstrap/공개 재검사/수리 내부 시간을 중복 합산하지 않는다. 이 수리 시간을 처음부터 개발한 Claude나 A 전체 완료시간과 비교하지 않는다. A/B의 실제 동시 경합과 전체 목표 비교는 최종 측정에서 별도로 적용한다.

[동일 template 범위 중간 분석](../../benchmark-runs/d070-template-scope-analysis-01.json)은 U15/U16/U17의 unit·requirement·artifact·write path·interface·계획 원문·catalog 일치를 확인했다. worker 호출은 이전 3회에서 새 1회로 줄었지만 고정 공식 환산비용은 USD1.9401218→2.074378로 **6.919988% 증가**했다: `(2.074378 - 1.9401218) / 1.9401218 × 100`. 이 부분 범위의 한 관측은 unit 수 균등화·호출 수 감소가 runtime 효율을 보장하지 않음을 보여준다. adapter 시간 합·실제 겹친 구간·전체 개발 완료시간을 같은 지표로 읽지 않는다. controller가 제한한 후보와 실제 Jev 선택도 계속 분리한다.

이번 root 통보 시점 A는 구현 10/10 이후 공개검사 중이며 최종 A 완료·독립 채점·시간과 비용의 동시 비교는 미완료다. 이 역할은 저장된 공개 결과·감사 집계를 읽었고 별도 실행이나 숨김 검사 상세를 열지 않았다. 기존 규칙으로 충분하여 SKM-014와 이 상태 기록만 갱신했다. SKILL/source/reference/설치·과거 실험 원본은 변경하지 않았으며 root의 최종 A 수치 통보가 다음 trigger다.

### 2026-10-11 후속 — A 고정 gate 효율 개선과 추가 공개 품질 회귀

[분석 01](../../benchmark-runs/d070-analysis-01/analysis.json)에서 A는 공개 85/85·독립 63/63·생략 0으로 종료했다. arm 본체 2,064,734.652875ms(34분 24.735초)·cache 포함 4,267,230토큰·공식 환산 USD12.1814126이며 과거 성공 Claude 단독 대비 시간 5.317960%·비용 42.364260% 감소다. 독립 채점·B 수리·별도 진단·모니터는 별도 분모이며 실제 청구/구독 배분은 이 값으로 알 수 없다. 조건당 1회와 과거 동시성 차이, 관측된 A/B 경합은 정책의 인과 효과와 구분한다.

후속 [공개 설명 진단](../../benchmark-runs/d070-public-description-probe-01/report.json)과 [동일 진단 비교](../../benchmark-runs/d070-description-comparison-01/result.json)는 동일 2case×4함수에서 A 0/8, Claude 기준선 8/8, D069 8/8을 기록했다. 모델 호출·숨김 검사 읽기 없이 실행한 추가 진단이며 원래 148개 gate를 고쳐 쓰지 않는다. 고정 gate 안의 시간·비용 개선은 유지하되 더 넓은 공개 명세에서 동일 품질을 유지한 전체 우위는 미달로 기록한다.

[수리 감사](../../benchmark-runs/d070-review/development-repair-review-01.json)는 두 라운드의 Jev 후보가 A19/n14 또는 중단뿐이고 앞단 IR·operation builder·generator는 후보와 작업자 범위 밖이었다고 확인했다. 본문 설명을 전달하는 앞단은 바뀌지 않았고 모델 설명 대체가 들어갔으며 원래 fixture의 두 설명은 동일했다. 실제 Jev 선택·controller 후보 제약·후속 공개 실패를 연결하되 후보 밖 원인을 Jev가 검토했다고 하지 않는다. 남은 제안은 설명 전달 경로·앞단 수리 후보와 범위·서로 다른 설명/본문 설명만 있는 공개 경계 검사다. 구현·새 실측으로 승격하지 않는다.

B의 실제 수리 1건과 동일 template 범위 비용 증가 관측은 위 분모로 보존한다. 상세 검증 수준과 한계는 [D070_SKILLS 후속 절](../agents/D070_SKILLS.md#2026-10-11-후속--고정-검사-효율과-공개-품질-회귀의-분리)에 연결했다. 기존 규칙으로 충분하여 소유 문서 2개만 갱신했고 SKILL 본체·reference·설치·source·실험 원본은 변경하지 않았다. 별도 [Opus 수치 모니터](../../benchmark-runs/d070-monitor-01/result.json)는 identity 확인·attention으로 종료했으며 37,244.205833ms·17,278토큰·공식 환산 USD0.182832다. 숫자 패킷에서 생략된 phase/local counts의 미상과 root의 별도 원본 감사를 구분하며 결과 정본·비용 기록은 root 담당이다.

후속 소유 문서 2개의 `git diff --no-index --check`는 신규 내용 차이에 따른 exit 1·공백 오류 출력 없음이었다. reference SHA-256 `5222b8c8…`는 사전 관측과 같고 변경 없는 스킬 구조/helper/프로젝트 검사는 반복하지 않았다. 설치 사본 갱신·호스트 발견/호출 검증은 하지 않았다. 이번 문서 쓰기를 종료한다.

## D071 — 새 공개 gate·원인 연결·프로필 실행 근거의 사전 보완

2026-10-11. [역할 계약](../agents/D071_PARALLEL.md)·[실험 계획](../orchestration/D071_EXPERIMENT.md)에 따라 같은 단일 담당이 유지관리한다. D070 원본의 고정 148개 검사 통과와 별도 공개 0/8 실패를 보존하고, 새 공개 기준을 적용하는 D071의 결과와 구분한다. 당시 실제 가용성·선택·실행·품질·수리·효율은 미측정이었으며 아래 종료 관측을 이어 적용했다.

| ID / 상태 | 실제 필요와 근거 | 최소 변경·담당·다음 시점 |
|---|---|---|
| SKM-015 / 실제 종료 근거 적용, 선택 연결·별도 수리 성공과 새 개발 실패 분리 | 새 Claude만 공개93/독립63 완료, 고정 Jev는 독립60/63, 프로필 Jev는 공개67/93·독립49/63. 실제 profile 선택/identity 10개와 보존 후보 producer 1파일 수리 성공을 확인. 26실패·18 fallback·75요구의 86,809B 수리 입력은 전송 전 차단 | 동결 해제 후 질문 키/본문 의미와 controller 복원/모델 의미·수락을 구분하는 두 문장만 기존 reference에 추가. raw64/local1/실제53POST+10CLI 분모와 null 보존을 사례에 적용. 새 스킬·설치·생산/테스트 수정 없음. 같은 품질의 전체 효율 우위·최적 프로필은 미확정 |

기존 source는 수정 전에 [사본 manifest](../../benchmark-runs/d071-preflight/skills-maintenance-before.json)의 6파일로 보존했다. records tree `157d7f3f…`/reference `5222b8c8…`가 이전 관측과 일치했고 새 역할 기록은 당시 없었다. 상세 범위·현실 사례 수동 적용·검증·설치 상태는 [D071_SKILLS](../agents/D071_SKILLS.md)에 둔다.

새 스킬·질문·모델 지원표·runtime API·JSON 필수 필드를 만들지 않는다. SKILL 본체·메타데이터·helper·schema·설치 사본은 유지하며 생산 코드·공통 상태·실험 계약·유료 호출·장부·과거 원본을 이 역할에서 변경하지 않는다. 초기 inventory exit 0, 설치 차이/부재·호스트 발견/호출 미검증 상태는 D070과 같다. 변경된 스킬 구조·inventory·diff 검사와 저장 사례 수동 검토만 수행한다.

2026-10-11 23:40 KST 사전 검증: 기존 구조 검사 `Skill is valid!`와 inventory exit 0. records tree `14500d37cab1449e16ac3698f419391cc7dc10a72b63394a8a18f2088b910c52`, reference `7e1b2bf1711785809f773c1a0d03c2897535a82732b575ec55f123a06de97448`를 새 관측으로 남긴다. source-before 6/6은 보존됐고 본체·helper·cache·메타데이터·maintenance 원본·설치 상태는 불변이다. 소유 3파일의 no-index 공백 검사는 내용 차이 exit 1·오류 출력 없음이었다. 구조·수동 사례 적용을 실제 host/live 성공으로 확대하지 않는다. 사전 쓰기를 종료하며 API 확정과 root 실측 전달 전 새 성과는 미측정이다.

### 2026-10-12 종료 — 실제 결과와 두 문장 최소 보완

root가 모든 실행/grade/monitor 종료와 문서 동결 해제를 통보한 뒤 [종료 분석](../../benchmark-runs/d071-analysis-01/analysis.json)·[실제 호출 보정](../../benchmark-runs/d071-invoked-usage-01/invoked-usage.json)·[수리 차단 분석](../../benchmark-runs/d071-profile-failure-analysis-01/README.md)·[수정 전 보존 감사](../../benchmark-runs/d071-preflight/closeout-integrity.json)를 읽었다. 새 개발은 Claude93/93·63/63만 완료이고 고정 Jev93/93·60/63, 프로필 Jev67/93·49/63은 미완료다. 세 비교 모두 동일 품질의 완료 절감 평가 자격이 없다. 과거 gate와 실패 원본은 보존했다.

프로필 10선택이 실제 10 worker의 인자·identity에 연결됐으며 Opus4·Sonnet6·모두 요청 medium이다. 내부 effort와 최적성은 미확정이다. 별도 보존 후보는 producer `operations.py` 한 파일 수리 뒤 공개93/93·독립63/63을 통과했지만 이전 후보를 시작점으로 받은 수리 분모다. 새 개발이나 미실행 수리 성과로 합치지 않는다.

프로필 조건의 실제 26실패 중 18 fallback이 75개 요구사항·86,809B 입력으로 확대돼 수리 POST/worker는0이다. preview58의 로컬 통과는 이 실패 분포를 입증하지 않았다. 원시 receipt64 중 확인된 로컬 전송 전 차단1을 분리한 실제 Jev53POST+Claude10CLI는 cache 포함2,874,640토큰·공식 환산USD6.884842다. 원래 보고USD6.9300858·미호출 raw usage/cost null·실제 청구/구독 배분null을 보존한다. 숫자 모니터 attention은 이 보조 회계 보정을 검증한 raw 감사가 아니다.

[동결 중 후속안](../../benchmark-runs/d071-skills-followup-01.md)의 두 최소 문장만 기존 reference에 적용했다. 다른 경계는 기존 규칙에 사례를 연결했고 새 스킬·설치·생산 소스·테스트를 추가하지 않았다. 상세 검증 수준·한계·다음 trigger는 [D071_SKILLS 종료 절](../agents/D071_SKILLS.md#2026-10-12-종료--실제-선택개발-실패별도-수리의-분리)에 있다. 이번 기존 문서 수정 전 source269·과거14576의 drift0은 실행 보존 관측이며 종료 문서 변경을 소급 반영하지 않는다.

종료 검증은 기존 구조 검사 `Skill is valid!`, inventory·reference diff exit0, 미추적 소유 문서 2개의 no-index diff는 내용 차이 exit1·공백 오류 없음이었다. 새 records tree `c13f55a91accdb284c04b97f2f5350f6a1694bbb41cefc0389e6b5cfbb434b6c`, reference `2b091811881f31aee5f53b1a6184fdc6d0a7e196014406302d5b266a5b67cab7`를 남긴다. 본체·helper·cache·metadata·maintenance 원본·설치 상태는 불변이며 host discovery/invocation·스킬 자체의 효율은 미검증이다. 소유 3파일 쓰기를 종료한다.

## D073 — 기존 담당 추론과 로컬 상한 해제의 규칙 재사용

2026-10-12. [역할 계약](../agents/D073_PARALLEL.md)·[실험 계획](../orchestration/D073_EXPERIMENT.md)에 따라 같은 단일 스킬 담당이 이어 맡는다. 사용자는 실패별 기존 담당 추론과 로컬 토큰 한도 해제를 승인했다. 별도 승인 gate를 추가하지 않으며 실제 ID·revision·권한 검증과 수리 실행 근거를 문서만으로 대체하지 않는다.

| ID / 상태 | 실제 필요와 근거 | 최소 변경·담당·다음 시점 |
|---|---|---|
| SKM-016 / 현재 종료 근거 적용 완료, 제품 미완료·비용/모니터 후속 분리 | 첫 두 실패와 old chooser HTTP400·new01 전송 전 장부 중단을 보존. 최종 new02는 실제 수리2명으로 공개79→91/93·독립60→61/63 개선 후 두 번째 owner HTTP400으로 미완료 | 기존 선택/실행/변경·input-size·billing·검증 수준·unknown·정정·분모 규칙을 재사용. 알려진 HTTP400 분류 누락과 미보존 transport 정보도 구분. 새 스킬·정본 수정·설치 없이 문서 2개만 갱신. 비용/모니터 및 남은 제품 실패는 root 인계 |

상세 수동 적용·검증 수준·인계는 [D073_SKILLS](../agents/D073_SKILLS.md)에 둔다. 기존 계약이 이미 경계를 다루므로 중복 규칙이나 새 JSON 필드를 만들지 않는다. 이전 버전 정책·차단·실패 원본은 보존하고 새 조건의 입력 허용·추론 정확도·수리·동일 품질 효율은 미측정으로 유지한다. 보존 수리와 새 개발, 실제 POST와 로컬 전이·미전송, 공식 환산과 실제 구독 청구는 각각 다른 분모다.

사전 read-only inventory는 exit 0이다. records tree `c13f55a9…`/reference `2b091811…`와 maintenance tree `7445e650…`는 D071 종료 관측과 같고 Codex records 사본 `93710658…`의 두 경로 차이·설치 부재 상태도 유지됐다. 원본 스킬은2개이며 host discovery/invocation은 미검증이다. 새 스킬·전역 설치·유료 호출·Docker·장부·생산 소스·과거 증거를 변경하지 않고, 변경 없는 스킬 구조/helper/프로젝트 테스트는 반복하지 않는다.

작성 후 inventory exit 0·변경 전과 전체 동일을 확인했다. 미추적 소유 문서 2개의 `git diff --no-index --check`는 신규 내용 차이 exit 1·공백 오류 출력 없음이다. 문서 첫 진입점도 현재 D073으로 연결했으며 과거 절은 보존했다. 이번 사전 쓰기를 종료하고 구현 검증·실측 근거 전달을 기다린다.

### 2026-10-12 03:18 KST — 실제 첫 거절과 환불 적용

[보존 수리 결과](../../benchmark-runs/d073-preserved-repair-01/result.json)·[전송 크기](../../benchmark-runs/d073-preserved-repair-01/calls/jev-0001.token-admission.json)·[HTTP/UI/GET 환불 근거](../../benchmark-runs/d073-refund-01/evidence.json)·[정산 사본](../../benchmark-runs/d073-refund-01/reconciliation.json)을 읽었다. 로컬 v4는 허용했지만 실제 담당 추론 POST1회·26문항·187,728B는 provider 문맥 제한으로 거절됐다. 답0·수리0이며 원시 usage/API 환산null과 후속 charged input0·actual billing USD0을 분리했다. 원본 pending 상태를 보존하고 후속 r930 정산을 연결하며 추론 tokennull·월 구독 배분unknown은 유지한다. UI UUID 부재에 따른 대조 한계도 [D073_SKILLS 후속 절](../agents/D073_SKILLS.md#2026-10-12-0318-kst--첫-보존-수리의-서버-거절과-후속-정산)에 남겼다.

새 전체 실행은 root 통보 시점15작업자 중13완료의 중간 관측이며 최종 결과가 아니다. 별도 owner 입력 prototype은 의미 근거를 보존하는 검토 단계다. hash/path만 전달한 것을 Jev가 본문을 읽은 근거로 세지 않는 기존 규칙을 적용한다. 새 스킬·설치·정본 규칙 변경은 불필요하며 소유 문서 2개 외 생산·동결 소스·실행 원본·장부를 수정하지 않는다. 최종 결과는 root 전달 후 이어 기록한다.

후속 검증은 두 문서 no-index 공백 오류 없음(내용 차이 exit1), read-only inventory exit0·사전 관측과 전체 동일이다. 스킬 원본·설치 상태를 유지했고 변경 없는 구조/helper/프로젝트 테스트를 반복하지 않았다. 저장 근거 적용 후 쓰기를 종료한다.

### 2026-10-12 03:40 KST — 첫 종료와 보존 수리 후속의 분리

[첫 분석](../../benchmark-runs/d073-analysis-01/analysis.json)은 새 개발 공개79/93·독립60/63, Jev57POST/Claude15CLI와 기존 후보 공개67/93·독립49/63, Jev1POST/Claude0CLI를 기록했다. 두 owner 요청은 각각14문항158,187B·26문항187,728B에서 거절돼 담당 답/수리0이다. 원시 사용량/API 환산null을 유지하고 [r930](../../benchmark-runs/d073-refund-01/evidence.json)·[r931](../../benchmark-runs/d073-refund-02/evidence.json)의 무과금 정산을 별도 연결한다. 실패 종료시간을 완료 가속률로 쓰지 않는다.

[v2 재생](../../benchmark-runs/d073-input-v2-preflight/replay-01/result.json)의91,569B/76,748B는 서로 다른 보존 후보의 입력이다. 공개93목록/상태·실패 원문·22 artifact·21 unit을 유지했어도 모든 원문 요구가 모델에 전달된 것은 아니며, 바이트 감소가 토큰·수락·수리효율을 입증하지 않는다. 회귀1,225/1,225·독립 사전 검토/gate 통과와 첫4,439/270 drift0·후속5,988보존/376핀 동결은 [D073_SKILLS 후속 절](../agents/D073_SKILLS.md#2026-10-12-0340-kst--첫-두-조건-종료와-변경-입력의-보존-수리)에 근거를 연결했다. prototype의 실패 envelope/부분답 누락 수정과 [분석기 metadata 비교 정정](../../benchmark-runs/d073-analysis-tools/focused-real-manifest-compatibility-01.json)은 제품 성과와 분리한 검증 장치 관측이다. 두 protocol의 loader 경로/SHA를 별도 확인한 뒤 나머지 payload 일치를 검증했으며 실제 수리 성공을 검증한 것은 아니다.

root 통보 시점 진행 중인 `d073-focused-old-01`·`d073-focused-new-01`은 초기 개발 재실행이 아닌 별도 보존 수리다. 실제 수리 결과·완료 효율은 종료 근거 전까지 미측정이다. 기존 규칙으로 충분해 스킬 원본·설치를 변경하지 않고 최종 두 결과 전달 뒤 이 항목을 닫는다.

이번 문서 2개 no-index 공백 오류 없음(내용 차이 exit1), inventory exit0·직전 관측과 전체 동일이다. 새 구조/helper/프로젝트 검사를 추가하거나 반복하지 않았다. 중간 쓰기를 종료하며 SKM-016의 실측 결과 적용은 대기로 둔다.

### 2026-10-12 03:58 KST — 실제 수리와 미완료의 종료 적용

[후속 분석02](../../benchmark-runs/d073-focused-analysis-02/analysis.json)와 [독립 종료 검토](../../benchmark-runs/d073-review-01/focused-terminal-review-02.json)를 적용했다. old는 owner26답을 받은 뒤 chooser HTTP400으로 수리0, new01은 공유 장부 전송 전 중단으로 POST0이다. 별도 new02는 Jev 집계5POST·Claude 수리2명으로 공개79→91/93·독립60→61/63을 기록했지만 남은 공개2실패의 두 번째 owner 요청이 HTTP400으로 종료돼 미완료다. n9 Sonnet high의 A14/A15 두 파일 쓰기와 n14 Sonnet medium의 A10 허용/실제 쓰기0, 요청 effort/내부 확인null을 구분했다. 담당 추론·작업자 실행·파일 변경·품질 통과는 서로 다른 근거다.

[입력 감사 진단](../../benchmark-runs/d073-input-audit-diagnostic-01/diagnosis.md)의 입력7통과·HTTP200 5건·known HTTP400 2건과 감사기의 실패 분류 누락을 별도로 기록했다. 실패2건의 직접 목적지·method·응답 모델·자동 retry 정보는unknown이며 성공 응답이나 현재 설정으로 채우지 않는다. 기존 audit_complete:false·원시 사용량/API 환산null을 유지한다. 생산 수정안은 제안 단계다.

전체 회귀1,225/1,225와 [종료 보존 감사](../../benchmark-runs/d073-focused-new02-preflight/closeout-integrity.json)의 과거7,219·실행376핀 변경0은 저장된 다른 담당의 근거이며 이 역할에서 재실행하지 않았다. 비용 보정 view·Opus 모니터는 root/측정 담당의 별도 후속이므로 새 비용 숫자를 추가하지 않는다. 현재 종료 근거 적용은 완료했으며 제품 완료나 동일 품질 효율을 주장하지 않는다. [D073_SKILLS 종료 절](../agents/D073_SKILLS.md#2026-10-12-0358-kst--실제-수리-연결과-미완료-종료의-기록)에 한계·남은 일을 인계했다. 기존 규칙으로 충분해 스킬 원본·설치를 변경하지 않았다.

종료 확인은 문서 2개 no-index 공백 오류 없음(내용 차이 exit1), read-only inventory exit0·직전 관측과 전체 동일이다. 스킬 본체/reference·helper·설치 상태는 유지했고 변경 없는 검사나 새 실행을 추가하지 않았다. 소유 문서 쓰기를 종료한다.

## D074 — 질문 작성·고정 프롬프트 검사 스킬

2026-10-12. [역할 계약](../agents/D074_PARALLEL.md)에 따라 같은 담당이 `skill-creator`와 기존 유지보수 스킬을 적용한다. 사용자가 요청한 질문 작성·모델에 전달할 근거 구성·고정 검사 연결은 결과 기록과 별도의 재사용 업무이므로 저장소 정본 [jev-prompting](../../skills/jev-prompting/SKILL.md)을 추가한다. 기존 스킬과 전역 설치는 바꾸지 않는다.

| ID / 상태 | 실제 필요와 근거 | 최소 변경·담당·다음 시점 |
| --- | --- | --- |
| SKM-017 / 작성·로컬 검증·독립 사용 검토 완료 | 공식 문서에 맞는 질문 작성과 스크립트 검사 요청. 과거 질문키/의미 혼동·미도달/담당 가설·큰 실패 입력과 수락 한계를 재사용 가능한 작성 흐름에 연결 | 새 SKILL과 공식 근거 참조2파일 추가. 지원 예제·연결 mock 통과, 비지원 stage는 exit2. 독립 검토17/17, 검사기의 오통과5반례 수정 완료. 실패 루프는 설계이며 런타임 복구·자동 호출·성능 검증은 미연결 |

제조사 권장, hosting 서버 규칙, 프로젝트 정책과 성능 미측정을 분리한다. 일반 typed 질문 작성 지침을 current checker 전체 지원으로 과장하지 않으며 unknown/원문·실행 권한 경계는 기존 계약을 따른다. 새 상한·임계값·자동 재시도·유료 호출은 추가하지 않는다. 출처와 검증 상태는 [D074_SKILLS](../agents/D074_SKILLS.md), 자세한 공식 근거는 새 스킬의 참조 한 곳에 둔다.

사전 inventory exit0·원본2개와 기존 두 스킬 tree/설치 차이는 D073 종료와 같다. source 추가 후 목록·구조와 실제 offline 명령 결과는 후속에 기록한다. 호스트 설치/발견/자동 호출·실제 서비스 수락·제품 효율은 미검증이다.

2026-10-12 14:12 KST 후속: 새 스킬 구조 exit0, 실제 지원 예제 CLI exit0, 연결 모의5시나리오 통과, 비지원 `repair` stage exit2를 확인했다. 실제 GET/POST0·키 로드false·handler 실행false이며 문맥 수락/의미/근거 진실성/실행 권한/성능의 미확인을 유지한다. 명령·출력 범위는 [D074_SKILLS 검증 절](../agents/D074_SKILLS.md#검증-상태와-다음-인계)에 있다. 새 스킬은2파일/tree `0375959a927866ea6037ff9033754f34f0b33a8089ec7b8a013de4cadb845244`이며 inventory exit0·원본3개다. 기존 두 source/copy 항목은 사전과 정확히 같고 새 스킬은 두 설치 루트에 없다. 소유4파일 공백 오류 없음(신규 내용 diff exit1). 독립 에이전트 검토는 인계 단계이며 실제 사용자 효과로 확대하지 않는다.

2026-10-12 최종 root 통합: [독립 사용 검토](../../benchmark-runs/d074-forward-review-01/result.json)에서 초기17사례 중5개 오통과를 발견했다. 새 검사기만 보완한 후 같은 입력17/17 예상 일치, 관련 회귀63/63을 확인했다. 스킬2파일 자체는 변경하지 않았다. [D074 최종 기록](../decisions/D074.md)에 질문 ID 오탐, 누락 검사, 설계 명료화와 실제 미실행 경계를 보존했다. 위 14:12 기록은 독립 검토 전 시점이다.

## D075 — 강제 전송 검사·복구 실행·보존 비교의 후속

2026-10-12. [역할 계약](../agents/D075_PARALLEL.md)에 따라 기존 세 스킬의 필요 변경을 검토한다. 사용자는 실제 gate·복구 연결과 새 보존 후보 실측을 요청했으며, D074 오프라인 성공을 그 실행 결과로 승격하지 않는다. 새 스킬과 설치는 불필요하다.

| ID / 상태 | 실제 필요와 근거 | 최소 변경·담당·다음 시점 |
| --- | --- | --- |
| SKM-018 / 갱신·로컬 검증·실제 결과 기록 완료 | D074 지시/명시 CLI에서 D075 전송 강제·복구로 확장한 요청. 실제 gate5POST 연결·새 근거 수집 뒤 문맥 실패와 제품 미완료를 확인 | source 최소 갱신·기존 사전 검증을 보존. root 실측 공개88/93·독립60/63과 성공 효율 미달을 기록. 후속은 문서2개만 갱신하며 새 스킬·설치는 불필요 |

[D075_SKILLS](../agents/D075_SKILLS.md)에 적용 범위·비교 분모·다음 검증을 남겼다. 변경 전6파일은 [private 사본 manifest](../../benchmark-runs/d075-skills-preflight/source-before.json)로 보존했다. 사전 inventory exit0·원본3개, 기존 tree와 설치 상태는 D074 종료와 같다. 현재 스킬 source/reference는 변경 전이며 새 호출·장부·Docker·hidden 접근은 없다. 과거 실패와 초기 검사 결과를 보존하고 아직 실행되지 않은 복구를 완료로 기록하지 않는다.

2026-10-12 15:01 KST: 위 사전 보존 뒤 각 담당의 안정된 API를 받아 source3파일을 최소 갱신했다. records SKILL 본체와 maintenance SKILL·schema/helper/cache/설치는 유지한다. v1 옛 pin의 SOURCE_DRIFT를 현재 코드 결함이나 과거 통과 결과 수정으로 해석하지 않는다. gate/recovery 구현과 담당의 모의 검증, root의 실제 실행 결과는 다른 수준이며 최종 source/policy pin 검증은 대기 중이다. 소유 변경·필드·한계는 D075_SKILLS 후속 절에 있다.

2026-10-12 15:15 KST: 최종 재핀 뒤 [명령 영수증](../../benchmark-runs/d075-skills-preflight/validation-01.json)의6명령을 새 프로세스로 실행했다. 변경2스킬 구조와 v2 예제/모의연결은 exit0, 기본v1 source drift와 비지원stage는 예상대로 exit2다. 실제 GET/POST0·키 로드false·handler 실행false이며 의미/수락/실제 복구·효율은 미검증이다. [전후 inventory](../../benchmark-runs/d075-skills-preflight/inventory-after-01.json)의 기존 설치 비교 항목과 maintenance tree는 불변이다. source-before6사본은 보존됐고 새 prompting tree `263623e9…`, records `0c89bf80…`를 기록한다. 검증 수준·원시 보고서·인계는 [D075_SKILLS 완료 절](../agents/D075_SKILLS.md#2026-10-12-1515-kst--최종-pin-이후-로컬-검증-완료)에 있다. source·소유 문서 쓰기를 종료하며 실제 결과 또는 구체적 독립 검토 결함을 다음 trigger로 둔다.

2026-10-12 실제 결과 반영: [root 정본](../orchestration/D075_RESULTS.md)과 [최종 요약](../../benchmark-runs/d075-root-01/final-summary.json)을 확인해 SKM-018의 결과 대기를 닫았다. 첫 실행의 profile controller context 혼입·정상 후보 포인터 누락은 수정 후 재측정했으며 원본 실패는 보존했다. 두 번째 실제5POST는 세 전송 검사 단계 각각5/5, Claude 수리2회였다. 새 근거9개를 모은 뒤 owner5질문92,629B가 HTTP400 `model_input_limit`로 실패하고 `CANONICAL_INPUT_ALREADY_APPLIED`에서 멈췄다. 새 근거 수집·전송·중단의 실측을 입력 재구성 성공으로 바꾸지 않는다. profile 자동 재구성은 미지원이며 검사 통과는 정확 토큰 fit·의미·제공업체 수락 보장이 아니다.

같은79/93 출발점에서 이번88/93·60/63은 이전91/93·61/63보다 낮다. 시작→독립 채점 종료369,093ms, 알려진709,276토큰·공식 환산 소계USD0.6804039만 보고한다. 알려진 소계 감소는 전체 추론량·월 구독 청구·완료 효율의 절감이 아니다. 각1회·공유 호스트의 보존 수리 비교다. 첫 숫자 모니터의 root JSON 계약 누락 실패와 두 번째 `attention`, packet 밖의 후속 환불·검사 시간 보완을 각각 기록했다. [측정 보완](../../benchmark-runs/d075-analysis-02/terminal-measurement.json)과 [보존 감사](../../benchmark-runs/d075-analysis-02/preservation-audit-03.json)는 다른 담당의 관측이며 이 역할이 재실행하지 않았다.

기존 스킬 규칙으로 기록할 수 있어 소유 [D075_SKILLS](../agents/D075_SKILLS.md)와 이 문서만 후속 갱신했다. source SKILL/reference·정책·기존 evidence·설치는 유지한다. 사전 종료 영수증도 그때의 해시로 보존한다. 다음 스킬 개선 후보는 실제 구현 후 질문별 관련 근거 재구성·controller/모델 입력 경계·profile 준비 실패 복구의 지원 범위를 기존 prompting 안내에 연결하는 것이다. 이번 관리 역할은 종료하며 아직 구현되지 않은 복구나 성능을 완료로 표시하지 않는다.

## 2026-10-14 — Pointsman 분류·라우팅 초안

담당 root가 기존 단일 관리 역할의 기록을 이어 작성했다. 새 에이전트는 생성하지 않았다. 사용자 요청은 스킬 분류·라우팅과 사용 전제 설계다. 기존 prompting/records/maintenance와 다른 실행 입구이므로 [pointsman-routing](../../skills/pointsman-routing/SKILL.md) 초안을 추가했다. [설계](POINTSMAN_ROUTING_DESIGN.md)와 [검사 결과](routing-evidence-20261014/verification.json)를 따른다.

공식 quick_validate는 Python 두 환경에서 yaml 의존성 부재로 실패했다. 별도 Node YAML 형식검사와 상대 링크 검사는 성공했으며 공식 검사기 통과로 표현하지 않는다. 세 개인 설치 루트의 동명 스킬은 absent, 호스트 발견/호출은 미검증이다. 전역 설치·기존 사본 수정 없음. 다음은 registry/gateway 구현과 자기완결 배포본 검증이며, jev-prompting의 역사적 D075 안내는 해당 경로 작업 때 개정한다.

## R20261014 D083 스킬 실행 연결

[구현과 호스트 검증](../orchestration/POINTSMAN_D083_GATEWAY.md)
