# R20261015 — 부분 실행 수리·담당 근거·CLI 고정 비교

새 Mac 비교 각1회는 종료됐다. Codex는 제품 미완료, Jev는 마지막 검사 중 Docker 연결 상실로 `uncertain`이다. 원본 종료 결과는 유지하며, 마지막 산출물의 별도 무추론 재채점도 Docker 재중단으로 막혔다. 아래 초기 계획·실패·보강 증거를 보존한다. [실행 프로토콜](../../benchmark-runs/codex-repair-20261015-01/PROTOCOL.md), [병렬 역할](../agents/R20261015_PARALLEL_REPAIR.md).

## 수정한 실행 연결

- `partialRepairPolicy: local-readiness-v1`: 로컬 readiness 검사로 실패 작업자와 산출물이 이미 확정되면 추가 모델 판단 없이 해당 산출물만 수리한다. stage 파일·manifest·revision·task attempt·환경을 대조한다. 성공 작업을 carry-forward하고 아직 실행하지 않은 작업은 구현으로 이어간다. 기존 inferred validator는 완전 후보용으로 유지한다.
- `publicOwnerEvidencePolicy: public-source-v1`: 공개 traceback·missing module 관측을 실제 소유 소스/템플릿 줄과 연결한다. 원본 해시·줄·담당 연결을 보존하고 두 판단기 입력에 같은 근거를 붙인다. 모델 담당 선택에 명시적인 소스 후보 범위를 합친다. 이 연결은 수리 후보 가설이며 확정 원인 판정이 아니다.
- CLI: 한 쌍에 전용 HOME/CODEX_HOME 하나를 공유한다. 임시 인증 복사본만 사용하며 키·인증 내용은 기록하지 않는다. 기본 스킬5개 비활성화, plugins/apps/hooks/memories/multi_agent 비활성화, 자동 프로젝트 문서0바이트. 실제 호출 cwd의 스킬과 binary/config를 호출 전후 검증하고 종료 시 임시 인증을 제거한다.
- 두 경로 모두 고정 영어 질문·v2 mandatory gateway·입력 검사·전송 직전 검사·응답 검사·기록을 거친다. v1 registry와 이전 실험은 과거 근거로 남긴다.

## 실행 전 근거

관련 통합62/62 통과. 실제 이전 Jev 실패 bytes 재구성은 n3/A06만 선택했고 미실행 작업 revision은0개였다. 실제 이전 Codex 공개 실패에서는 A16/A19가 추가 후보로 연결됐다. 첫 전체 근거 첨부는 입력 예산을 초과했으며 실패를 보존했다. 이후 동일 근거를 참조형으로 중복 제거한2949바이트 문맥을6개 요청 모두에 유지해 입력 검사를 통과했다. 이는 실제 모델 수리 성공 증거가 아니다.

실제 cwd에 새 스킬을 넣는 무추론 대조는 `CODEX_ENV_SKILLS_NOT_FROZEN`으로 차단됐다. 최초 source pin 이후 CLI가 보강되던 시점의 probe는 `POINTSMAN_SOURCE_CHANGED`로 차단됐으며 모델 호출0이었다. 최종 source pin 재고정 후 Docker·인증 probe ready를 확인했다.

실행 전 기존43,920파일의 hash 일치. 공유 Jev 장부는 다른 승인된 서비스와 공유하므로 보존 대상의 불변 파일에서 제외하고, 이 실험의 비용은 호출 영수증으로 집계한다.

## 메인 공개

[PR #14](https://github.com/Kai-Leee/pointsman/pull/14)에서 Jev+DAG 기반 빠른 라우팅으로 소개를 바꾸고, 기존 완료 D067의21.84% 개발구간 시간·58.52% 역사적 API환산 비용 감소를 게시했다. 두 조건 모두 공개85/85·독립63/63, 조건별1회이며 실제 월정액 청구 절감이 아니다. 새 Codex 비교 결과로 표시하지 않았다.

메인 변경은 문서·버전8개 파일만 포함한다. 로컬394/394·링크241개 오류0 및 CI4개 통과 후 merge commit `7310cc4cdffbd905015e32cd54e6a4ca654d3e7c`로 병합했다. 초기 로컬 테스트는 sandbox localhost 제한, 다음 실행은 새 작업트리의 pinned MCP binary 부재로 실패했다. 해시 검증 설치 후 통과했고 유료 모델 호출은 없었다.


## 원본 실행 결과 — 완료 절감으로 해석하지 않음

[호출별 재집계](../../benchmark-runs/codex-repair-20261015-01/summary.json). `node benchmark-runs/codex-repair-20261015-01/summarize.mjs`는 네 조건의 terminal journal, 모든 receipt 합계, 초기 canonical request 동일성을 대조하고 결과를 새 파일로 저장했다. 각 세대의 조건별1회이며 이전 세대는 CLI 환경과 실행 소스가 달라 동일 통제 반복이 아니다.

| 조건 | 최종 상태 | 공개 검사 | 독립 검사 | 종료까지 총 시간 | 총 receipt 토큰 |
|---|---|---|---|---:|---:|
| 이전 Codex 판단 | 미완료 | 16/93, 미실행67 | 57/63 | 23분 1.638초 | 1,084,007 |
| 이전 Jev 판단 | 부분 실행 수리 차단 | 미실행93 | 미실행 | 6분 42.413초 | 300,500 |
| 새 Codex 판단 | 미완료 | 92/93 | 59/63 | 27분 57.019초 | 902,725 |
| 새 Jev 판단 | 환경 장애로 확정 불가 | 최종 후보 결과 없음 | 미실행 | 24분 1.260초 | 1,194,346 |

시간은 각 arm 시작→종료로 준비된 자료 재사용 이후 판단·작업자·수리·검사를 포함한다. 새 Codex에는 독립 채점이 포함됐고 Jev에는 포함되지 않았으므로 두 종료시간의 차이를 완료 속도로 비교하지 않는다. 공통 CLI 초기화 시간은 pair에 따로 기록됐다. 총 토큰은 제공자별 input+output 영수증 합계이며 토크나이저가 같다는 뜻이 아니다. Codex 요청 모델/노력도는 양쪽 `gpt-5.6-sol/high`; JSONL에서 실제 모델 identity를 받지 못해 requested profile 이상의 확인은 하지 않는다.

새 Codex는 판단10회+작업자11회(초기6·수리5), Jev는 판단9회+Codex 작업자14회(초기5·수리9)였다. Jev 공개 검사는 첫 후보63/93→수리1회84/93까지 확인했으며 이84를 마지막 후보 점수로 대체하지 않는다. 두 조건에서 성공 완료시간·완료 토큰 절감률·완료 비용 절감률은 미확정이다.

초기 분해의 **동일210질문·4호출**만 비교하면 Codex245.920초/Jev6.498초, Codex 시간을 Jev 시간으로 나눈 비율은 **37.847배**다. CLI와 Jev 전송 어댑터 구간의 합이며 전체 개발의 가속도가 아니다. 전체 판단 요청은 이후 실패 내용이 달라 공통 질문 비교가 아니다.

## 비용과 실제 발동 범위

새 Jev input308,851토큰 × 역사적 token-pack 단가 USD0.6/백만 = **USD0.1853106**. 이전 Jev는 USD0.0899112였다. 이는 현재 월정액 청구 배분이 아니다. Codex의 확인된 대응 단가가 없으므로 Codex 및 전체 dollar 비용은 `null`; 무과금이라는 뜻이 아니다. 공유 장부 차이로 이 실험 비용을 계산하지 않았다.

새 partial readiness 수리 commit은 양쪽0회였다. 해당 실패가 재발하지 않았으므로 보강 경로의 직접 검증은 이전 실패 bytes 재현/fixture에 한정한다. public source 근거 수집은 양쪽2회씩 실행됐으나 추가 artifact 후보가0개여서 범위 확장 실행도0회다. 이전 A16/A19 사건의 재현 성공을 이번 실제 모델 수리 성공으로 바꾸지 않는다.

## 실패 원인과 검증 장치 발견

- **Jev 담당 피드백:** 첫 수리에서 A13이 빠졌고, 작업자4명 중3명이 enum/model 메타데이터를 지적했다. 전체 manifest 경로만 인식하는 추출기는 축약 경로를 연결하지 못했지만 원문 summary는 두 다음 요청에 보존됐다. 다음 Jev 판단이 A13을 직접 선택했고 round2 실제 writable 입력·원본 hash·두 실패 메시지를 확인했다. 최초30개와 다음9개 실패 질문·답변·배정은 모두 보존됐다. 같은 enum 오류를 CLI/명명에도 배정한 중복 수리 가능성은 남는다. [담당 감사](../../benchmark-runs/codex-repair-20261015-01/jev-final-owner-audit.json).
- **Codex 공개 검사 진단:** 마지막 T.R10.03의 담당A19와 실패 메시지 전달은 정확했다. 작업자는 Args 들여쓰기만 변경해92/93에 머물렀다. 검사기의 `_sections`가 들여쓰기를 제거한 뒤 `ThingA:` 같은 반환형 항목을 새 제목으로 오인하는 최소 재현을 확인했다. 잘못된/모호한 오류 설명과 Google-style 계약의 해석 문제이며, 고정 점수를 뒤집거나 독립59/63을 성공으로 바꾸지 않는다. [감사](../../benchmark-runs/codex-repair-20261015-01/codex-final-repair-audit.json), [재현](../../benchmark-runs/codex-repair-20261015-01/public-sections-repro.json).
- **Jev 최종 환경 장애:** 공개 검사 컨테이너2개 정리를 확인하지 못했고 Docker socket이 사라졌다. 코드가 image-inspect 실패를 포괄적으로 `CODEX_CHECK_IMAGE_PIN_MISMATCH`로 분류해 원인이 가려졌다. Docker 재기동 뒤 동일 image ID 확인; 두 컨테이너 exit137/OOMKilled=false, 상태 보존 후 해당2개만 제거했다. Docker 종료의 근본 원인은 미확정이다. [환경 사건](../../benchmark-runs/codex-repair-20261015-01/environment-incident.json).

## 남은 일과 부수 효과

최종 후보 재채점은 원본 uncertain 결과와 별도로 기록한다. 다음 구현 후보는 구조화된 담당/범위 확장 보고, 동일 원인별 담당 통합, 공개 검사 오류 설명 보강, Docker 연결 실패와 실제 이미지 불일치의 분리다. 이번 실험 중 고정 소스를 바꾸거나 자동 추가 모델 재실행은 하지 않았다.

메인에는 역사적 D067 성공 범위만 게시했다. 새 연구 구현은 `feat/d083-skill-gateway`의 미커밋 변경으로 남아 있으며 메인에 포함하지 않았다. 원본/새 실험 산출물과 별도 release 작업트리를 유지한다. 임시 CLI HOME 삭제 receipt를 확인했다. Docker 앱을 한 번 다시 열었으나 이후 프로세스와 소켓이 다시 사라졌다. 사용자 직접 종료 여부는 확인 요청 중이다.


## 종료 감사와 재채점 차단

[파일 보존](../../benchmark-runs/codex-repair-20261015-01/preservation-final.json): 기존43,920파일 변경/누락0. [소스](../../benchmark-runs/codex-repair-20261015-01/source-final.json):119핀 변경0. `finalize-files-only.mjs`로 Docker와 독립 검사했다. 통합 보존/cleanup 검사는 Docker socket 부재로 두 번 실패했고 최초 실패 영수증을 보존했다. 파일 보존을 container cleanup 성공으로 바꾸지 않는다.

[임시 환경](../../benchmark-runs/codex-repair-20261015-01/cleanup-partial.json): 작업자25/25 임시 폴더 제거, 임시 CLI HOME 제거 확인. 최초 남은 종료컨테이너2개만 제거했다. 이후 Docker가 다시 종료되어 현재 모든 컨테이너의 부재는 미확인이다.

[별도 복구](../../benchmark-runs/codex-repair-20261015-01/recovery-final-jev/README.md): round2 최종 verify-public staging의22산출물/38파일 revision·hash를 확인하고 원본을 새 폴더에 복사했다. checker60개도 원래 manifest와 일치한다. 복구 스크립트의 첫 optional source 검사가 실제 필드명과 달라 생략된 자체 결함은 별도 명시 검사로 보완하고 기록했다. Docker가 다시 없어진 상태에서 첫 공개 검사가898.639ms에 실패해 공개·독립 채점 성공0이다. 후보·원본 result·checker 불변, 추가 모델 호출0. 원본24분1.260초에 이 복구 시간을 더해 성공 완료시간으로 만들지 않는다.

**미완료:** Jev 최종 공개93·독립63 재채점과 성공 완료시간 비교. 현재는 보존된 후보를 검증할 Docker가 유지되는 환경이 필요하다. 반복 재기동/새 모델 실행은 하지 않았다.
