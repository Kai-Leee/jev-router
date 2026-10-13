# D082 — 클라우드 세션에서 유료 실행 준비

사용자는 Mac 대신 Claude Code 클라우드 세션에서 유료 실행을 하도록 지시했다. 이 기록은 무과금 점검, 실행 조건, 클라우드 유료 실행 결과다.

## 코드 변경

- `src/benchmark/dag-runner.mjs`: preflight의 Claude 인증 확인이 manifest의 `claude_auth_methods`를 읽는다. 값이 없으면 과거와 같이 `claude.ai`만 허용한다. 허용 값은 `claude.ai`, `oauth_token`뿐이며 잘못된 값은 `DAG_INVALID_RUN_MANIFEST`다. probe 결과의 `auth.accepted_methods`에 허용 목록을 남긴다.
- `benchmarks/e2e-swe/manifests/d082-cloud-defaults.json`: `d081-defaults.json`과 같고 `claude_auth_methods: ["claude.ai", "oauth_token"]`와 `session_semantics`만 다르다.
- 전송 정책 v9의 고정 소스 17개는 바뀌지 않았다(`dag-runner.mjs`는 v9 pin 대상이 아니다). D081/D082 manifest는 D075 전송 gate를 쓰지 않는다. `dag-runner.mjs`는 D066 catalog 재사용 허용 변경 목록에 있다. 새 고정 정책 파일은 만들지 않았다.

## 왜 `oauth_token`인가

클라우드의 Claude CLI(2.1.296)는 호스트가 넣은 세션 토큰 파일을 저장된 claude.ai 로그인보다 먼저 쓴다. 환경변수를 비우거나 HOME을 바꿔도 `claude auth status`는 `authMethod: "oauth_token"`이다. 별도 HOME에 Max 구독으로 로그인해도 같았다. `claude --print`는 실행기의 제한된 환경에서 동작했다.

## 실행 조건 (Mac 대비 차이)

| 항목 | 클라우드 |
|---|---|
| Claude 인증 | 호스트 세션 토큰(`oauth_token`). 사용량 한도가 제어 세션과 공유될 수 있다(미확인). |
| Claude CLI | 2.1.296 (manifest `profile_policy.cli_version` 2.1.293은 기록값이며 실행기가 강제하지 않는다) |
| 저장소 경로 | `/Users/lee/workspace/plugins/jev-router`에 bind mount. catalog `result.json`의 절대경로 비교 때문이다. |
| Docker | `containerd-snapshotter: false`. 기본 설정은 image ID가 manifest digest로 나와 pin과 다르다. 고정 image ID `sha256:b47cc887…`과 일치. |
| Jev 연결 | `NODE_USE_ENV_PROXY=1`. 없으면 Node fetch가 프록시를 쓰지 않아 `TRANSPORT_ERROR`. |
| 원장 | Mac에서 이전. charged 20,566,398 · settled 1,067 · pending 0. 한 곳에서만 사용한다. |

daemon과 bind mount는 컨테이너 재시작 때 사라진다. 파일·이미지·원장은 재시작 뒤에도 남았다(1회 확인).

## 무과금 점검 결과

- `--manifest benchmarks/e2e-swe/manifests/d082-cloud-defaults.json --probe`: `ready`, 막힘 0, `live_ready: true`, paid_calls 0, 공개 대조 통과, 고정 대조 증거 확인, Jev `jev-latest` 조회(추론 0).
- 같은 probe를 `d081-defaults.json`으로 하면 `CLAUDE_AUTH_REQUIRED`다(과거 규칙 유지).
- 회귀: Mac 경로 mount에서 1351개 중 통과1346·실패2·건너뜀3. 신규 D082 테스트 3/3.
  - root 실행이라 읽기 전용 디렉터리 검사가 무효인 refund 테스트 1개.
  - `d079-runner-mock-arm`의 leaf 순서(n5/n6)가 실행마다 달라지는 비결정성. 단독 3회 중 2회 실패. 변경 전 전체 실행에서는 `d080-defaults-mock-arm`도 같은 이유로 1회 실패했다.

## 유료 실행 (순차, `d082-cloud-defaults.json`)

독립 채점은 runner가 맡기지 않는 root 단계다(`independent_grade: not_run_root_owned`). upstream 채점 자원은 CPU 6이지만 클라우드 컨테이너는 CPU 4라 `docker create`가 거부됐다. 그래서 `benchmark-runs/d082-grade-manifest-4cpu.json`(CPU만 4, 이미지·검사·제한 시간 동일)으로 채점했다. 실패한 6 CPU 시도는 `d082-cloud-01/jev_profile/grade-attempt-6cpu-error/`에 보존했다. 후보는 그대로이므로 Mac에서 6 CPU 재채점이 가능하다.

| 실행 | 결과 | 공개 | 독립(CPU4) | 수리 | 시간 | Claude 호출·API환산 | Jev 호출·입력 토큰 |
|---|---|---|---|---|---|---|---|
| 01 | 완료 | 93/93 (검토 채택) | 63/63 | 1 | 28분09초 | 11 · $9.68 | 15 · 409,768 |
| 02 | 실패 `ADAPTIVE_REPAIR_BUDGET_EXCEEDED` (2회차 owner 요청, 전송 전 차단, 불확실 아님) | 미통과 | 미실행 | 1 | 21분48초 | 7 · $7.48 | 13 · 342,735 |
| 03 | 완료 | 93/93 (검토 채택) | 63/63 | 0 | 21분44초 | 6 · $6.77 | 7 · 194,675 |
| 04 | 완료 | 93/93 (검토 채택) | 63/63 | 2 | 31분42초 | 10 · $9.82 | 12 · 345,591 |
| 05 | 완료 | 93/93 (검토 채택) | 63/63 | 1 | 27분19초 | 7 · $9.07 | 9 · 254,320 |
| 06 | 실패 `ARTIFACT_CHECK_NOT_PASSED` (수리 2회 소진, 불확실 아님) | 미통과 | 미실행 | 2 | 21분23초 | 9 · $7.35 | 12 · 352,096 |
| 07 | 완료 | 93/93 (검토 채택) | 63/63 | 0 | 31분23초 | 7 · $10.79 | 7 · 197,905 |

원장(07 뒤): charged 22,663,488 · settled 1,142 · pending 0. 각 실행 n=1이며 Mac 결과와의 차이를 분산 통제 비교로 해석하지 않는다.

## 미확인

- 클라우드 호스트 토큰의 사용량 한도와 과금 경로.
- 6 CPU 채점과 4 CPU 채점의 차이(클라우드 후보는 Mac에서 재채점 가능).
