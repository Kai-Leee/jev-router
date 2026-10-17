# Pointsman D083 스킬 → 실행기 연결

2026-10-14. 브랜치 `feat/d083-skill-gateway`, 기반 `2b3c9acbef2c789b243350355c986cf4f8f70fed`. 사용자 승인 범위: D083 분해·모델 선택·실패 담당 판단의 스킬/실행기 연결, 우회 방지, 실제 Claude/Codex 검증, 새 브랜치, 기존 결과 보존.

구현과 Codex 호스트 검증은 완료. **Claude 실제 스킬 실행은 주간 한도로 미완료**, 전체 원본 보존 확인은 장부 1건 차이로 미완료다. 새 유료 Jev 제품 실험이나 성능 향상을 주장하지 않는다.

## 연결과 강제 검사

```text
Claude .claude/skills/pointsman-routing 또는 Codex .agents/skills/pointsman-routing
  → scripts/pointsman.mjs (doctor / smoke / run만 허용)
  → bin/pointsman.mjs (고정 pointsman-d083.json, manifest/provider override 없음)
  → v13 manifest와 D083 정책 동등성 검사
  → 기존 D083 builder (분해 / 프로필 / 실패 assertion 담당)
  → gateway: initial 기록 → 예약 직전 검사 → POST 직전 검사
  → 기존 측정·정산 → 응답의 질문 ID·후보·형식 검사 → 수락 기록
  → 기존 DAG / profile / owner-scope handler → 공개 검사 → 필요한 작업자만 수리
```

정본은 [스킬](../../skills/pointsman-routing/SKILL.md), [등록 계약](contracts/pointsman-routing.v1.json), [gateway](../../src/orchestration/pointsman-gateway.mjs), [manifest](../../benchmarks/e2e-swe/manifests/pointsman-d083.json)다. 고정 영어 질문은 기존 D083 계약에서 읽는다. 소스/질문 계약/스킬 SHA가 달라지면 차단한다. 실제 전송 body와 검사 body 일치를 다시 확인한다. 응답은 허용 후보에 속해야 하며 수락 기록이 실패하면 실행기에 반환하지 않는다. confidence 실행 임계값은 도입하지 않았다.

기록 저장은 exclusive 생성과 fsync를 사용한다. 초기·예약 직전·POST 직전 영수증, 응답 수락/실패, 모델·사용량 정산은 실행 디렉터리에 남는다. 정산 후 기록 실패도 후속 실행을 멈춘다. 전송 전 차단이 예약 이후라면 미정산 상태를 임의로 환불 처리하지 않는다. 소스 pin은 개발 중 명시적으로 갱신하며 실행 중 자동 갱신하지 않는다.

v13은 D083 정책과 일치해야 한다. 별도 후퇴 backend, 재시도, 다른 arms/질문 계약 삽입을 거부한다. 과거 v12 manifest는 재현용으로 그대로 존재한다. 일반 프로그램이 파일을 수정하거나 다른 CLI를 직접 실행하는 것까지 막는 보안 sandbox는 아니다. 통제 범위는 새 Pointsman 진입점과 해당 provider session이다. 후보 근거의 의미적 타당성은 기존 builder·공개 검사 책임이며 gateway 통과만으로 정답을 보증하지 않는다.

기존 전송 정책 v1–v10은 그대로 남겼다. runner 변경으로 역사적 소스 pin이 달라지므로 새 v11을 생성하고 기존 전송 모듈의 기본값만 v11로 옮겼다. D083 v13은 별도 Pointsman 계약으로 강제한다. 과거 manifest에 박힌 v10 pin은 현재 소스에서 drift로 막힐 수 있으며 당시 checkout에서 재현해야 한다.

## 설치와 실행

Node >=22, 소스 checkout, 기존 D083 자료/계약이 필요하다. 아래는 아직 존재하지 않는 새 폴더에 두 호스트용 스킬을 만든다. 전역 설치나 기존 프로젝트 덮어쓰기는 하지 않는다.

```sh
node scripts/install-pointsman-skill.mjs --target /absolute/new-project --host both
cd /absolute/new-project
node .agents/skills/pointsman-routing/scripts/pointsman.mjs doctor
node .agents/skills/pointsman-routing/scripts/pointsman.mjs smoke --out ./new-smoke
# Claude는 .agents 대신 .claude
```

설치 사본은 원본 checkout을 참조한다. 소스 디렉터리를 이동하면 binding을 새로 만들어야 한다. 커밋 SHA만으로 미커밋 구현을 식별하지 않고 registry와 파일 해시를 함께 보관한다.

`run --out NEW_DIRECTORY --spend`는 고정 v13 경로다. Mac에서는 유료 개발을 차단한다. 클라우드에서는 기존 Docker/이미지·프로필 계정 probe·공유 장부·preflight가 추가로 필요하다. 기존 클라우드 원장과 중단 실험을 초기화하거나 자동 재개하지 않는다. 키는 서버 환경 `JEV_AI_API_KEY`로 유지하며 스킬·로그에 복사하지 않는다.

## 검증과 관측

근거 디렉터리: [routing-20261014-01](../../benchmark-runs/routing-20261014-01/), 집계 [verification.json](../../benchmark-runs/routing-20261014-01/verification.json).

- `node --test test/pointsman-gateway.test.mjs test/pointsman-runner.test.mjs test/pointsman-skill-install.test.mjs test/jev-transmission-preflight.test.mjs`: 36/36, [focused-02.tap](../../benchmark-runs/routing-20261014-01/focused-02.tap). 이후 workflow 변경 차단 1개를 추가해 runner 8/8, [runner-final.tap](../../benchmark-runs/routing-20261014-01/runner-final.tap).
- `node --test test/*.test.mjs`: 1,385개 중 1,374 통과·11 실패. 11개는 모두 sandbox의 `listen EPERM`. 원본 [regression-01.tap](../../benchmark-runs/routing-20261014-01/regression-01.tap)을 보존했다.
- 권한 있는 호스트에서 해당 두 파일만 재실행: dashboard-server 10/10, dashboard-transport 11/11. 이는 전체 검사를 한 번에 전부 통과했다는 뜻이 아니다.
- 실제 Codex 0.144.1: `codex exec --ignore-user-config --ephemeral --skip-git-repo-check --sandbox workspace-write -C <host-project> --json ...`. 모델이 설치 스킬/참조를 읽고 wrapper의 doctor와 smoke를 실행했다. [실제 로그](../../benchmark-runs/routing-20261014-01/codex-host-02.jsonl), [smoke](../../benchmark-runs/routing-20261014-01/host-project/codex-smoke-01/summary.json).
- Codex smoke 내부 실측 2,952.832041ms. fixture 결정 5회(split1·profiles3·repair_owners1), 예약/정산 각각5, 구현3·수리1·carry-forward2, 검사8. 첫 공개 실패 후 담당 a0만 수리해 completed. 실제 로컬 planner/executor/filesystem이며 **Jev와 worker provider는 모의**다. 별도 relations/repair POST는 이 smoke에서 발생하지 않았다.
- 실제 Codex 호스트 사용량: input190,881 중 cached157,824, output1,610(reasoning138은 별도 보고 필드). 호스트 요금은 미확인이다. fixture 내부 model call0·비용0을 호스트 전체 비용0으로 확대하지 않는다.
- 실제 Claude Desktop CLI 2.1.295: 호스트 인증 성공. 그러나 실제 호출은 HTTP429 `usage_limit_reached`, 주간 제한, 표시된 reset 2026-10-16 23:00 KST. 모델 tool 실행 전 차단됐다. [호스트 로그](../../benchmark-runs/routing-20261014-01/claude-host-01.jsonl). 로그인 재요청은 필요 없다. 샌드박스에서 auth false였던 관측은 키체인 접근 차이로 정정한다.
- Claude wrapper 직접 실행은 passed, 2,916.143666ms. [결과](../../benchmark-runs/routing-20261014-01/claude-wrapper-smoke.json). 이는 Claude가 스킬을 선택·실행한 증거가 아니다.
- 첫 로컬 smoke는 mock resolved model을 jev-latest로 반환해 admission에서 실패했다. mock을 jev-1.13.0으로 수정했고 실패 디렉터리 smoke-01은 유지했다.
- 공식 Python skill validator는 yaml 모듈 부재로 검사 전 실패. 통과로 기록하지 않는다. installer 테스트는 구조·실행 경로를 별도로 확인한다.

## 원본 보존 발견과 남은 일

전후 SHA 검사 [preservation-after.json](../../benchmark-runs/routing-20261014-01/preservation-after.json): 기존 42,051개·1,308,175,717바이트 중 **42,050개 동일**, `benchmark-runs/jev-usd1-budget.json` 1개 변경. 실험 디렉터리/산출물은 동일하다. 장부 변경 주체·원인은 현재 미확인이다. 전후 파일 크기는 446바이트로 같지만 SHA가 다르며, 동일 JSON 값의 순서 차이만으로는 원래 SHA를 재현하지 못했다. 변경 전 원문이 없는 해시 목록만으로 값을 복원하면 추측이 되므로 수정하지 않았다. 현재 관측 사본과 [조사 기록](../../benchmark-runs/routing-20261014-01/preservation-investigation.json)을 남겼다. **전체 보존 성공을 주장하지 않는다.**

다음: Claude 사용량 회복 후 새 출력 경로로 동일 호스트 검증; 장부 원본/변경 출처 대조; 클라우드에서 별도 승인 범위에 맞춘 실제 Jev 개발 검증. 현재 구현으로 속도·비용 개선은 측정하지 않았다. 전역 설정 변경·Docker 시작·commit·push 없음. 새 스킬 번들/검증 파일과 미커밋 코드가 남는다. 실제 호스트 CLI가 자체 상태/세션 기록을 남겼다.
