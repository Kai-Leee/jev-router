# D027 역할 계약 — 2026-10-09

목적: 최신 사용자 지시를 문서 기반 task tree/모델+추론 프로필 선택/선택값→함수 직접 dispatch 계약과 무과금 실행 실험으로 구체화한다. finish를 Jev 선택에서 제거한다. 운영 임계값/실제 속도 개선은 미확정.

- main: 기술 계약·작업 문서·사전 질문/규칙 자료·실험 CLI·보고서·기록/최종 검증 소유.
- tree_dispatch: src/orchestration/document-router.mjs와 test/document-router.test.mjs 소유. 문서 JSON 검증/질문 구성/실행 enum 매핑, fixture 기반 함수 직접 실행을 구현. 실제 Claude/Jev/셸 호출 금지.
- tree_review: 구현 및 실험 산출물 읽기 전용 검토. 새 사용자 의미와 상충·거짓 병렬/거짓 모델 실행 주장·임계값 및 자료 유실 문제 보고. 파일 수정 금지.

공통: 프로젝트 AGENTS와 skills/jev-decision-records/SKILL.md 적용. USD1 장부/기존 benchmark/PersonalOS/외부 설정 변경 금지. 합성 응답/가짜 실행자 증거를 실제 모델 성능으로 보고하지 않는다. 문맥 소진 시 진행·실패·소유파일·재현명령을 이 역할 파일 또는 별도 D027 상태에 남긴다. 사용자 목표: 반복 판단 이전, 병렬 작업 단순화, 전체 효율 검증. 구현한 것과 향후 제안 분리.
