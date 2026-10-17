# D091 — 실제 스킬 적용 범위 감사

역할: skill_runtime. 읽기 전용 감사이며 생산 코드, D090 결과, 인증, 장부, 전역 설치를 변경하지 않았다. 실제 CLI·계정·GET·추론·Docker 호출은 하지 않았다.

## 핵심 결과

**D090 벤치마크는 “우리 스킬만 활성화”한 조건이 아니라 활성 스킬이 0개인 격리 조건이다.** 우리 스킬의 전체 본문을 작업자나 판단자에게 자동으로 로드한 것이 아니다. controller가 고정 질문 계약과 공개 명세·파일을 입력에 직접 넣고, gateway와 실행 핸들러를 코드로 호출했다.

`benchmark-runs/d091-codex-20261016-01/skill-runtime-audit-verified.json`이 정본이다. D090의 실제 요청 21개와 native 영수증을 검사했고 연결된 근거 85개의 SHA를 남겼다. 초기 감사 두 출력은 보존했다.

| 실제 호출 범위 | 호출 수 | CLI 스킬 활성 | 모델에 전달한 것 |
|---|---:|---:|---|
| Codex 판단 조건의 판단자 | 4 | 0 | typed questions·state·criteria JSON과 도구/파일/스킬 호출 금지 지시 |
| Codex 판단 조건의 작업자 | 6 | 0 | 공개 명세·요구사항·담당 범위·제공 파일·고정된 출력 지시 |
| Jev 판단 조건의 판단자 | 5 POST | CLI 스킬 기능 대상 아님 | 고정 영어 typed questions·state·criteria HTTP body |
| Jev 판단 조건의 Codex 작업자 | 6 | 0 | 위와 같은 작업자 입력 형식; 최초5명+수리1명 |

native Codex 16/16 요청은 `--strict-config`, `--ephemeral`, read-only adapter, 같은 CLI 환경 지문을 사용하고 영수증의 도구 사용은 0개다. 작업자도 source body를 구조화 응답으로 돌려주며 controller가 쓰기를 수행하므로 adapter role이 `decision`인 것은 의도된 구현이다. 이 표는 실제 논리 역할을 따로 구분했다.

## 발견·로드·본문·실행을 구분한 근거

- **발견:** 격리된 CLI가 발견한 system skill은 imagegen, openai-docs, review-agent, skill-creator, skill-installer의 5개다. 모두 `enabled:false`, `enabled_skills:0`이다. 프로젝트/전역 HOME 상속은 껐고 `project_doc_max_bytes=0`; plugins/apps/hooks/memories도 false로 기록됐다.
- **본문 전송:** 저장소 스킬 4개의 전체 SKILL 본문·frontmatter 제외 본문을 실제 요청 21/21개에 대조했다. 전체 본문 전송은 0건이며 저장소 SKILL 경로를 모델에 읽으라고 전달한 경우도 0건이다. 외부 openai-docs 본문도 0/21개에 들어 있다. 비교한 로컬 openai-docs SHA는 기록된 비활성 system skill SHA와 일치한다.
- **계약 인라인:** 고정 질문 gateway 보고 27/27개가 `fixed_wording:true`, passed였다. 판단 요청 9개 × initial/before_reservation/before_post 3단계다. 이것은 계약 문구·입력 검증 근거이며 질문의 의미적 정확도를 인증하는 것은 아니다.
- **controller 무결성 검사:** pointsman-routing SKILL·reference·script 3개는 source pin에 들어 있다. controller가 해시 검증을 위해 이 바이트를 읽는 것과 모델이 스킬 본문을 지시로 로드하는 것은 다른 동작이다. gateway 실행·accepted 보고는 실제로 존재하지만 SKILL 전체 본문을 전송하지 않는다. jev-prompting 전체 본문도 전송하지 않는다.
- **실제 모델 행동:** native 영수증의 도구 사용 0건 및 성공한 응답 검증을 확인했다. 다만 CLI 내부의 비공개 기본 system prompt 전체를 덤프하지 않았으므로 “모델의 모든 내부 지시가 우리 것뿐”이라고 주장하지 않는다. Jev 서비스 내부 지시도 이 감사 범위 밖이다.
- **효과:** 스킬 활성/비활성 A/B 실험은 하지 않았다. 기존 시간·토큰 결과를 스킬 설치·본문 로드의 효과로 귀속할 수 없다.

## 설치 사본과 메인 개발 세션

저장소 maintenance 스킬의 read-only inventory helper를 실행했다.

```sh
python3 skills/jev-skill-maintenance/scripts/inventory_skills.py \
  --source-root skills \
  --installed-root /Users/lee/.codex/skills \
  --installed-root /Users/lee/.agents/skills
```

정본 스킬은 4개다. 명시한 설치 경로 중 `~/.codex/skills/jev-decision-records`만 존재하며 저장소와 다르다. 차이는 `SKILL.md`, `references/record-contract.md`, 설치 사본의 `scripts/__pycache__/check_record.cpython-310.pyc`다. 다른 세 스킬은 두 설치 경로에서 발견되지 않았다. 이 결과는 현재 명시 경로의 설치 inventory이며 과거 host 발견·전체 plugin cache 로드·실행·효과를 증명하지 않는다. 사본을 덮어쓰거나 설치하지 않았다.

메인 개발 세션과 벤치마크는 별도다. Root는 이번 D091 턴에 저장소의 jev-prompting, jev-decision-records, jev-skill-maintenance 본문을 읽었다고 직접 보고했다. 독립적인 read-tool trace 파일은 없으므로 이 감사에서는 **root-reported**로 표시했다. D090 pricing 역할 상태 문서에는 외부 OpenAI Docs 스킬을 적용했다고 명시돼 있고 공식 문서 snapshot도 남아 있다. 이것 역시 해당 역할의 적용 기록이며 이 감사가 원본 tool-read trace를 독립 재생한 것은 아니다. D090의 구조화 결정 기록 존재를 작업자 스킬 자동 로드로 해석하지 않는다.

## 감사 도구의 정정과 검증 한계

첫 후속 감사에서 초기 `CONFIG` 상수를 재구성한 SHA와 종료 환경의 config SHA가 같을 것이라고 가정했다. 실제로는 setup의 `skills/config/write`가 비활성 스킬 설정을 config에 추가한 다음 최종 SHA를 계산하므로 같지 않았다. `skill-runtime-audit-final.json`의 false 결과를 보존했다. 정본 `skill-runtime-audit-verified.json`은 이를 `config_base_vs_final`로 명명하고 가정을 정정한다. 이것은 runtime config drift의 증거가 아니다.

실행 종료 후 private HOME은 삭제됐으므로 종료 config 원문을 다시 열지 않았다. 양 arm의 동일한 최종 config SHA·환경 지문·비활성 스킬 목록과 고정 소스의 호출 전후 검증 동작을 대조한 것이다. 개별 문장의 일부가 겹칠 수 있다는 점도 전체 SKILL 본문 전송 0건과 구분한다.

## D091 적용 방향과 상태

Root가 D091의 세 조건 모두 **동일 격리·인라인 원칙 유지**를 확인했다. 자동 스킬 발견/로드 조건을 추가하지 않으며, 새 worker-model 고정 질문·계약은 controller가 인라인으로 전달한다. 이는 실행 전 설계 확정이다. D091 실제 결과의 환경·요청 검증은 새 실행을 마친 뒤 별도 감사해야 한다.

부수 효과는 새 private audit script/JSON, 설치 inventory JSON, 이 역할 상태 문서뿐이다. 실제 모델/계정/Docker/장부 호출, 인증 파일 열람, 숨김 검사 열람, 생산 코드·전역 설치 변경은 없다.
