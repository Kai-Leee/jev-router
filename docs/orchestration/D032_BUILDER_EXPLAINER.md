# D032 — 더 줄일 입력과 작업자 생성 설명 영상

2026-10-10. 사용자 요청: 반복 명세의 축소 지점을 스킬로 조사하고 생성자 구현을 영상으로 설명. ‘생성자’는 현재 request builder와 CLI worker launcher로 해석. 런타임 수정/새 추론은 수행하지 않는다.

## 적용한 스킬과 방법

`/Users/lee/.agents/skills/codebase-design/SKILL.md`를 읽고 적용했다. 작은 Interface 뒤에 중복 제거·의존 선별·검증을 모으는 deep module 원칙, 부작용 없는 결과 반환, 동일 Interface를 통한 테스트가 이 작업에 맞는다. `design-an-interface`도 읽었으나 여러 대안 설계 과제는 아니므로 해당 workflow는 적용하지 않았다. 영상 관련 로컬 전용 skill은 발견하지 못해 설치된 Pillow/ffmpeg/macOS TTS로 제작했다. Superpowers 미사용.

## 축소 대상: 완료와 제안 구분

| 대상 | 현재 | 권장 | 상태/보존조건 |
|---|---|---|---|
| brief/goal/requirements/originalBrief | brief 한 번 | 현재 구조 유지 | D031 완료, 원문 보존 |
| evidence/completedFiles | completedFiles 한 번 | 현재 구조 유지 | D031 완료 |
| 전체 plan | projected split에서 task+integrationInstructions | 현재 구조 유지 | single은 전체plan 필요 |
| 완료된 모든 파일 | 직접·전이 의존 파일만 | 누락 의존은 실패 | D031 완료, 의미적 의존 누락은 미검증 |
| workerContract 전체 JSON | system에 JSON.stringify로 첨부 | 지시문+필수 실행/출력 규칙만 추출 | 새 제안 |
| system 출력 예시 / outputContract / requiredOutput / outputDescriptions | 여러 위치에 설명 | 고정 출력 규칙을 한 위치에 정의 | 새 제안, validator 유지 |
| applicationNotes / research / 필드 설명 | 모델도 전달받음 | 로컬 manifest/문서로 이동 | 새 제안, 실행에 필요한 의미는 instructions에 유지 |
| no-tools 지시와 tools-available 지시 | 같은 계약에 모두 포함 | 실행 능력별 사전 template 선택 | 새 제안, 모델 재작성 없이 script 선택 |
| 원문 요구사항 | 전체가 매 worker에 한 번 | requirement IDs가 검증되면 공통+담당 요구사항으로 선별 | 미구현, 지금 임의 요약/삭제 금지 |
| planner의 workerContract | 전체 작업자 운영지시 전달 | 계획 작성에 필요한 인터페이스/소유권/출력제약만 | 새 제안, 분할 품질 비교 필요 |

현재 worker-task.v3.json을 `Buffer.byteLength(JSON.stringify(contract))`로 재면3631bytes. instructions 본문은1779bytes다. 차이를 전부 지워도 된다는 뜻이 아니다. 출력 설명 등에 필수 의미가 있으므로 필수 규칙을 모은 별도 runtime template의 실제 크기는 아직 미측정. 이는 사용자요청 body 바이트 감소71.38%와 별도인 system 최적화 후보.

원문·범위·의존·출력 규칙은 한 번은 있어야 한다. 도구 없는 worker에게 path/hash만 주면 본문을 읽을 수 없으므로 모든 내용을 reference로 바꾸지 않는다. 실제 API가 받는 입력의 불변 prefix는 캐시 재사용에 유리하지만 이 CLI에서의 cache breakpoint를 임의 제어했다고 가정하지 않는다. 공식 출처(2026-10-10 열람): https://platform.claude.com/docs/en/build-with-claude/prompt-caching

## 현재 구현에서 생성이 뜻하는 것

1. tree-e2e-pilot: 명세/모델/effort/계약 로드, Claude 계획 생성 또는 검증된 frozen plan 재사용.
2. routing-policy: Claude/Jev/script/forced 중 선택. default forced는 Jev 답으로 운영 arm을 정하지 않고 양쪽 실행.
3. runFileArm: 준비 작업과 동시성(1/2)을 계산. 현재 batch 전체 완료를 기다리는 방식.
4. buildWorkerInput: 요청 본문과 로컬manifest 분리 반환. 이 함수는 모델 호출을 하지 않음.
5. call → processResult('claude',args): 요청 JSON을 stdin으로 전달, --system-prompt로 지시 전달. 현재 Opus5.5/medium, --tools '', no-session-persistence. 별도 프로세스이며 native Agent 도구 아님.
6. 모델이 JSON 파일내용 반환. validateFiles 후 실행기가 소유 경로에 저장. 독립 grade는 별도.

영상은 위 구현을 설명한 제작물이다. 라이브 유료 실행/CLI 화면 녹화/새 성능 검증을 보여주는 것이 아니다. 코드 출처: worker-inputs.mjs, live-file-workers.mjs, routing-policy.mjs, tree-e2e-pilot.mjs.

## 영상 제작

소스: video/d032-scenes.json, video/render_d032.py. 실행: `python3 docs/orchestration/video/render_d032.py`.
결과: private `benchmark-runs/d032-video/jev-worker-builder-ko.mp4`. 한국어 macOS Yuna 합성 음성,1280×720,12fps,8장면. 길이와 codec은 렌더 후 ffprobe로 검증. 로컬 음성 합성 최초 sandbox 시도는 duration N/A로 실패했고 접근 가능한 환경에서 재시도. 외부 모델 호출0.

부수 효과: 설명 문서, 영상 제작 소스, private MP4/음성/미리보기. 런타임 변경·새 유료 inference·commit/push 없음.

최종 검증: ffprobe duration105.161723초,1922375bytes,H.264/AAC,1280×720,12fps. `ffmpeg -v error -i ...mp4 -f null -` 전체 디코딩 exit0. preview-4.png를 직접 열어 글자/레이아웃 확인. 영상은 8장면·한국어 합성 음성으로 완성.
