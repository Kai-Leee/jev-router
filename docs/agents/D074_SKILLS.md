# D074 — Jev 프롬프팅 스킬 담당

2026-10-12. [역할 계약](D074_PARALLEL.md)의 기존 단일 스킬 담당이 `skill-creator`와 `jev-skill-maintenance`를 적용했다. 이번 범위는 저장소 전용 질문 작성·근거 구성·고정 검사 연결 스킬이다. 기존 판단 기록 스킬은 결과 근거 관리, 유지보수 스킬은 스킬 변경 관리이므로 서로 다른 반복 업무다. 새 질문을 매 턴 생성하거나 스킬 수를 계속 늘리는 설계가 아니다.

소유 경로는 [새 jev-prompting](../../skills/jev-prompting/SKILL.md), 그 [공식 근거 참조](../../skills/jev-prompting/references/official-guidance.md), 이 역할 문서와 [MAINTENANCE의 SKM-017](../skills/MAINTENANCE.md)이다. 생산 CLI/정책/검사는 `d071_transport`, 실패 루프 설계와 공통 문서는 root가 소유한다. 기존 스킬·설치 사본·장부·실행 원본은 변경하지 않는다.

## 조사와 적용

확인일은 2026-10-12 KST이며 공식 웹 문서를 직접 읽었다. Jev AI는 이 프로젝트가 사용하는 서비스의 연결/오류/본문 규칙, TypeSafe는 모델·프리미티브의 제조사 권장 근거로 구분했다. 출처별 URL·확인 방법·검증 수준·한계는 새 스킬 참조 한 곳에 둔다. 호스팅의 모델 안내를 제조사 원문보다 우선하지 않는다.

질문 ID 대신 본문에 대상과 판단을 명시하고, 독립 질문은 공유 state에 묶으며, 실제 앞선 답이 필요한 경우에만 다음 요청으로 나누도록 연결했다. typed 답→기존 handler와 현재 권한 연결, 최소 충분 원문 근거, 담당 가설/결함 확정 및 unknown/미도달 구분은 프로젝트 규칙이다. 제조사의 영어 권장과 사용자의 영어 기본 정책은 맞닿지만 프로젝트 정확도 최적성이 실측된 것은 아니다.

TypeSafe의 구조화 instruction 예시는 현재 string-only adapter에 그대로 적용하지 않는다. manufacturer SDK 기본 재시도와 Jev hosting의 설정도 분리했다. 별도 임계값이나 로컬 토큰/예산 상한, 자동 재시도, 계정/API 호출은 추가하지 않는다.

## 고정 검사 연결과 한계

담당자가 확정한 진입점은 `node scripts/validate-jev-prompt.mjs --request REQUEST.json --stage repair_owners --template inferred-v2`이며 `--connection-only`는 모의 transport 검사다. 선택적인 `--out NEW.json`은 새 보고서다. exit0/2/1은 각각 지원된 검사 통과/차단/CLI·I/O 오류다.

현재 검사는 projected inferred-v2 담당 추론만 지원한다. `raw_request_fallback`과 다른 stage는 미지원이며 일반 프롬프팅 전체를 자동 검증하지 않는다. 고정 문구·원문 요구 연결·기존 artifact/task/worker/handler 등 구조 검사와 영어 의미·근거 충분성·실제 문맥 수락·정확도·개발 효율은 다른 검증 수준이다. 모델 가용성·인증·배포·실제 GET/POST도 이번 확인에 포함하지 않는다.

실패 후 다음 행동은 root의 [D074 설계](../orchestration/D074_PROMPTING_AND_FAILURE_LOOP.md)에 연결한다. 이번에는 고정 정책/공개 시나리오를 통한 설계이며 recovery CLI나 자동 실행기·재시도는 연결하지 않는다. 같은 실패/무변경 근거를 동일 작업자 재시작의 근거로 삼지 않는다.

## 변경 전 목록

read-only inventory exit0: 원본 스킬2개, records tree `c13f55a91accdb284c04b97f2f5350f6a1694bbb41cefc0389e6b5cfbb434b6c`, maintenance tree `7445e650fff623c91b8a56bcaeb3756ef6de03293ce3303b43fcb06047dd73cd`. Codex records 사본은 `93710658c36fcb02895e66e98e8724842c9e9dffcc2bdd152ccf4bffbf966979`이며 기존 `SKILL.md`/reference 차이를 유지한다. agents 루트에는 records가 없고 maintenance는 두 설치 루트에 없다. 이 관측은 파일 목록이며 호스트 발견·호출의 검증이 아니다.

## 검증 상태와 다음 인계

2026-10-12 14:12 KST 작성·로컬 검증을 완료하고 독립 검토에 인계했다. 새 helper를 복제하지 않고 별도 담당의 실제 CLI를 사용했다. 아래 명령은 이 역할이 저장소 루트에서 직접 실행했다.

```sh
python3 /Users/lee/.codex/skills/.system/skill-creator/scripts/quick_validate.py skills/jev-prompting
node scripts/validate-jev-prompt.mjs --request examples/jev-preflight/inferred-v2.request.json --stage repair_owners --template inferred-v2
node scripts/validate-jev-prompt.mjs --connection-only
node scripts/validate-jev-prompt.mjs --request examples/jev-preflight/inferred-v2.request.json --stage repair --template inferred-v2
```

| 검증 | 실제 결과 | 확인하지 않은 것 |
| --- | --- | --- |
| 새 스킬 구조 | exit0, `Skill is valid!` | 판단 품질·호스트 자동 발견 |
| 지원 예제 | exit0. 합성 실패1·기존 산출물2/담당2·unknown 포함3선택지, inline 요구1·근거2, 5,182B. 입력 전후 불변 | 근거 진실성·모델 의미 이해·실제 owner 답 |
| 연결 mock | exit0, 성공·429·503·전송오류·목적지불일치5시나리오 통과. 모의 GET1/POST5 | 실제 인증·가용 모델·SDK 전체 호환·배포 |
| 비지원 stage | exit2, `JEV_PROMPT_TEMPLATE_UNSUPPORTED`; 같은 입력의 stage만 `repair`로 지정 | 비지원 질문에 대한 자동 프롬프트 보증 |

예제 검사 정책 SHA는 `3c6cb90d56d8e8d433ed57d23548c977174056177348b7e315544f834d787ebc`이고 연결8핀은 검사 시점 모두 일치했다. 모든 명령의 실제 GET/POST는0, 키 로드false, handler 실행false다. `exact_context_fit: unknown`, 의미/근거 진실성/runtime revision 권한은 `not_checked`, 성능은 `not_measured`로 남았다. mock의 GET/POST를 실제 호출 수로 세지 않는다.

수동 사례 검토에서는 합성 packet의 unknown 선택지를 unresolved 처리와 연결하고, 미도달 assertion이나 본문 없는 로컬 경로를 실제 실패/모델 근거로 승격하지 않는 스킬 지시를 확인했다. 반환된 답을 실제 handler에 적용하거나 Claude 행동을 측정한 검사가 아니다. 독립 담당의 별도 입력 사용은 root가 배정하며 이 역할이 에이전트를 추가 생성하지 않는다.

후속 read-only inventory exit0: 원본3개, 새 prompting은2파일/tree `0375959a927866ea6037ff9033754f34f0b33a8089ec7b8a013de4cadb845244`다. 기존 두 스킬의 전체 목록·해시·설치 비교 항목은 사전 관측과 정확히 같다. 새 스킬은 Codex/agents 두 설치 루트 모두 없다. 소유4파일의 `git diff --no-index --check /dev/null <path>`는 신규 내용 차이에 따른 exit1이며 공백 오류 출력은 없었다.

이번 인계는 원본 작성·문서 조사·구조 검사·모의 CLI와 수동 범위 검토의 완료다. 독립 사용 검토, 호스트 발견/호출과 실제 provider 수락·수리 성공·총시간/비용 개선을 완료로 표시하지 않는다. 스킬/설치·생산 실행 경계를 유지하며 독립 검토에서 확인한 결함이 있을 때만 최소 보완한다.

## Root 통합 후속 — 독립 사용 검토 완료

동일 스킬2파일을 진입점으로 한 [독립 검토](../../benchmark-runs/d074-forward-review-01/result.json)가 완료됐다. 초기17사례 중5개 오통과는 새 검사기의 미실행/환경 오류 및 집계 일관성 누락이었다. 담당이 검사기만 보완한 후 같은 입력17/17을 확인했고 root 관련 회귀63/63도 통과했다. 스킬 본문과 전역 설치는 바꾸지 않았다. 실패 루프의 중복 독립 검사/무진전 재호출 설계도 명료화했다. 세부 명령·초기 실패·수정 후 근거는 [D074](../orchestration/D074_PROMPTING_AND_FAILURE_LOOP.md#7-실제-로컬-검증과-발견한-검사기-결함)에서 확인한다. 실제 복구·모델 성능·호스트 자동 활성화는 여전히 미검증이다.
