# 검증 기록

작업 위치: `/Users/lee/workspace/plugins/jev-router`.

최신 D-014 Docker 채점·실행기 검증은 [두 벤치마크 실행 안내](benchmarks/README.md)에 있다.
마지막 문서/정적 검사 명령은
`node /private/tmp/jev-router-handoff.bTYebC/check-benchmark-docs.mjs`이며,
파일95개/Markdown52개/로컬 링크128건, issues=[]/exit0이다. 아래 이전 단계 기록과 구분한다.

## 2026-10-08 역할 분업 후 오프라인 평가 구현

런타임: Node.js v26.4.0. 검증은 로컬/합성 입력이며 실제 Jev 추론이나 모델 성능 측정이 아니다.

- `npm test`: tests 82, pass 82, fail 0, skipped 0, cancelled 0, exit 0.
  기존 연결/MCP 22 + 평가 계약 26 + 지표 20 + CLI 13 + 통합 손계산 1.
  MCP 테스트는 로컬 모의 서버 실행을 허용한 환경에서 수행했다.
- `node --test test/evaluation-integration.test.mjs`: 합성 예제의 manifest 분모·부분 비용과
  binary/categorical Brier를 독립 상수로 대조해 1/1 통과. 최초 인라인 검산은 binary 그룹을
  마지막 배열 원소라고 가정해 실패했으며, 종류로 선택하도록 검산기를 수정한 뒤 통과했다.
- 실제 명령:

  ```sh
  npm run --silent eval -- --manifest examples/evaluation/manifest.json --records examples/evaluation/records.jsonl --output /private/tmp/jev-router-handoff.bTYebC/final-report.json
  ```

  exit 0. `jev-eval-report/v1`, `synthetic`, manifest cases 7 / recorded 6, trials 4, requests 6을
  생성 파일 재파싱으로 확인했다. USD total은 null, 관측 부분합은 합성 입력의 0.006이며
  예상 요청 수가 미상인 trial 때문에 전체 비용 관측률도 null이다. 실제 청구액이 아니다.
- 독립 review는 구현 파일을 수정하지 않고 재현했다. 발견한 CLI 오류 코드 불일치와 비용 관측률
  분모 문제를 담당자가 수정했으며, [review 상태](docs/agents/review-STATUS.md)에 검산/재검증 근거가 있다.
- CLI는 잘못된 입력을 exit 3으로 처리하고 입력 내용을 오류에 반사하지 않는다. 기존 출력 파일/
  symlink 보존, 0600 신규 파일, 빈 입력, 잘못된 UTF-8, 일반 네트워크/dotenv 경로 차단 테스트 포함.
- 문서 검증: fd 목록 기반 Node 검사에서 Markdown 20개, 로컬 링크 85건, 결정 참조 43건,
  코드 블록 구분자 40줄의 짝 확인. 문서/소스/테스트/예제 31개 no-index whitespace check 오류 0건.
  최초 역할 문서 5개의 EOF 공백 경고를 수정한 후 재검증한 결과다.

구현 범위: 저장된 manifest/JSONL의 검증·집계·보고서 생성. 미구현: 실제 응답 수집/자동 질문 생성,
모델 비교 실행, 순위·Oracle regret·신뢰구간·작업군 가중 비교. 실제 성능/비용절감/handoff 효과는 미검증.
문맥 한계로 실제 담당자를 교체하지는 않았다. 역할 문서·상태 기록과 OS 임시 재개 문서를 준비했다.
소스/문서는 미커밋이며 원격 push 없음. 위 임시 폴더에 main 인계 준비 문서와 합성 보고서가 남는다.

## 2026-10-08 상태 확인 — 최신 실행 기록

아래는 이 채팅의 상태 조회 때 실제 실행한 결과다. 기술 명세 작성 중 재실행한 것으로 표시하지 않는다.

- `npm run config`, `npm run mcp:config`: `keyConfigured=true`, `keySource=env-file`.
- `npm run models`: `GET https://jev-ai.pro/api/v1/models`, HTTP 200, `jev-latest` 포함.
- `npm run mcp:models`: 같은 모델 목록을 MCP 경로로 조회, exit 0.
- `npm run mcp:tools`: classify, decide, list_models, rerank, verify 도구 목록 반환. 추론 호출 없음.
- `npm test`: tests 22, pass 22, fail 0, skipped 0. 가짜 키와 로컬 모의 API를 포함한 검사.
- 공개 GitHub 저장소 생성 후 `gh repo view`는 PUBLIC, ADMIN, isEmpty=true를 반환했다.
  로컬 main과 origin은 생성됐으며 소스 커밋/push는 하지 않았다.

이 기록은 초기 문서의 '키 미설정/인증 미완료' 상태를 대체한다. 실제 Jev 추론·성능 평가,
네이티브 호스트 로딩, handoff 효과는 여전히 미검증이다.

## 2026-10-07 초기 기록 — 당시 상태 보존

이하의 19개 테스트, 키 미설정, Git 미구성 설명은 최초 작업 당시의 기록이다.
현재 상태로 읽지 않는다.

## 기존 상태

- `fd -H -d 6 -E .git -E node_modules -t f '^(AGENTS\.md|package\.json|pyproject\.toml|.*lock.*|.*server.*)$' /Users/lee/workspace/plugins`: 해당 파일 없음.
- `reference/README.md`: Node 패키지/빌드 없는 정적 자료실로 확인.
- 관련 코드의 `typesafe`, `JEV_AI`, `baseURL`, `fetch`, `process.env` 검색에서 기존 Jev 클라이언트 없음.
- `git -C /Users/lee/workspace/plugins/hell-data status --short --branch`: `No commits yet on main`.
- 사용자가 새 `jev-router` 폴더에 분리 작성을 선택함. 기존 `reference/`, `hell-data/` 변경 없음.

## 실행 결과

`node --version`:

```text
v26.4.0
```

`npm test`:

```text
tests 19
pass 19
fail 0
cancelled 0
skipped 0
```

테스트는 가짜 키/모의 전송을 사용합니다. 서버의 모델 품질, 실제 청구 또는 인증 성공의 근거가 아닙니다.

`npm run config`:

```json
{
  "baseURL": "https://jev-ai.pro/api",
  "modelsURL": "https://jev-ai.pro/api/v1/models",
  "decisionURL": "https://jev-ai.pro/api/v1/systemone",
  "defaultModel": "jev-latest",
  "transport": "Node.js fetch (no SDK)",
  "automaticRetries": 0,
  "redirects": "blocked",
  "envFile": "/Users/lee/workspace/.env",
  "keyConfigured": false,
  "keySource": "missing"
}
```

`npm run models`: exit 1, `MISSING_KEY`. HTTP 요청 전에 종료했습니다.
프로세스 환경변수와 로컬 파일에 실제 키가 없어 인증한 모델 목록 조회는 미완료입니다.

## 실제 네트워크 확인

처음 웹 도구의 API URL 열기는 접근 오류, 제한된 셸에서의 GET은 네트워크 오류였습니다.
이 실패들은 인증 결과로 해석하지 않았습니다.
네트워크 허용 환경에서 아래와 같은 **키 없는 GET**을 다시 실행했습니다.

```js
const response = await fetch('https://jev-ai.pro/api/v1/models', {
  redirect: 'error',
  signal: AbortSignal.timeout(15000),
});
// 출력한 항목은 URL과 상태뿐이며 키/Authorization 헤더를 사용하지 않았습니다.
```

실측 결과:

```json
{
  "method": "GET",
  "destination": "https://jev-ai.pro/api/v1/models",
  "status": 401,
  "inference": false,
  "authenticated": false
}
```

이 결과는 목적지의 응답 확인입니다. 사용자 계정 인증, 모델 목록, 잔액 또는 결정 성공을
확인한 결과가 아닙니다. 실제 추론 POST는 실행하지 않았습니다.

## 남은 작업과 부수 효과

- 로컬 키 입력 후 `npm run models`로 인증 확인.
- 사용자가 실행할 `npm run demo -- --spend`는 GET 확인 후 작은 결정 POST를 한 번 보냄.
- 실제 모델 품질 비교, 라우팅 정책, 부하 분산, Claude/Codex 실행 어댑터, 플러그인 등록은 미구현.
- 생성: `jev-router/` 코드·예제·문서·테스트, `/Users/lee/workspace/.env` 빈 키 템플릿(권한 0600).
- `.env`는 기존 파일이 없는 경우에만 생성. 실제 키는 생성하거나 출력하지 않음.
- 새 Git 저장소/커밋/원격 연결, 패키지 설치, 배포, 상주 서비스 실행 없음.
- 단위 테스트의 임시 디렉터리는 테스트 종료 시 삭제함.
# 2026-10-08 — Goal/specification-only live experiment feasibility

Research and read-only readiness checks only; no live model benchmark was run.
See [experiment feasibility](docs/LIVE_EXPERIMENT_FEASIBILITY.md) for sources, commands, failure history,
and the documented-but-untested architecture. `claude --version` returned 2.1.280;
sanitized `claude auth status --json` returned exit 1 and loggedIn=false in this environment.
`npm run --silent models` first failed in restricted networking; with network access it returned
exit 0 / HTTP 200 at https://jev-ai.pro/api/v1/models, including jev-latest. This was GET, not inference.
`docker info --format '{{.ServerVersion}}'` first hit socket permissions; permitted read access
then returned exit 1 / daemon unavailable. No daemon/container was started.
Harbor and Inspect commands were not found on current PATH; other environments were not inventoried.
Existing MCP binary is macOS ARM64; Linux sandbox integration remains untested.

Runtime code was unchanged. Earlier test results below are retained as historical evidence,
not represented as rerun for this documentation-only investigation. Current document validation
is recorded in [WORK_LOG](docs/WORK_LOG.md).
# 2026-10-08 — Real benchmark preparation, no paid inference

Latest entry: [benchmarks/README.md](benchmarks/README.md). D-014 now authorizes both workloads.
Main executed `npm test`: 118/118 pass, fail/skip/cancel 0; Python E2E adapter unittest:16/16;
Personal OS grader selftest:10/10. Exact commands and ignored local receipts are in that entry.
Final Docker reference control passed30/30/reward1, empty control failed during collection/reward0.
Real protocol/shell/journal smoke passed in both isolated environments without models.
Four implementation/review findings were fixed and rechecked; preserve their history in review STATUS.
All created benchmark containers were removed. Images/clones/local receipts and uncommitted sources remain.
Claude authentication/paid limits are pending; no live Opus/Jev comparison or rebuilt app exists yet.

# 2026-10-09 — Dashboard and benchmark telemetry

Current authentication history is D-016 (user completed OAuth); not rechecked this turn.
No real model inference was run. All new numeric UI examples are synthetic.

Commands from repository root:

```sh
npm test > /private/tmp/jev-dashboard-npm-test.log 2>&1
node --test test/benchmark-telemetry.test.mjs test/dashboard-metrics.test.mjs test/dashboard-server.test.mjs
```

Final main full suite: **167/167 pass**, fail/cancel/skip0, exit0. Independent review focused suite:
**49/49 pass** (telemetry7, metrics32, reader/HTTP10), exit0. No provider network requests;
the existing client/MCP tests use local mocks. Source syntax checks also passed in review.

Actual browser verification used the bundled Playwright package and installed Google Chrome:

```sh
node bin/dashboard.mjs --port 0 --runs-root examples/dashboard
JEV_PLAYWRIGHT_PACKAGE='/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json' \
JEV_CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
node scripts/check-dashboard-browser.mjs http://127.0.0.1:50933
```

**10/10 browser checks passed**, no page errors, exit0. Report:
`output/playwright/browser-check.json`; desktop/mobile PNGs and accessibility snapshots in the same directory.
Checks cover rendered synthetic totals, search/selection, evidence filter/empty state, unknown prepared usage,
manual/automatic refresh, HTTP503 stale-data notice/recovery, 390px viewport without page overflow.
The synthetic completed run has Jev2 attempts/205 raw tokens, Claude2 unique observed response steps/420 tokens,
Jev2 credits/400 balance tokens across separate synthetic settlement modes, Claude estimatedUSD0.1234.
These values test display and aggregation only; they are not real consumption or price measurements.

Failure history: initial sandbox HTTP tests failed with loopback listen EPERM; rerun with authorized loopback
access passed. A new reader deadline test initially failed39/40 because its wall limit was wrongly nested in
the fixture; corrected to the launcher's top-level schema and reran40/40. Review then added two further metrics
regressions, included in final167. The Playwright wrapper lacked executable permission; bash invocation via
npx did not complete and was cancelled, and offline npx confirmed ENOTCACHED. No package was installed;
the existing library/browser fallback provided actual UI evidence. A docs patch with a mismatched heading
was rejected without edits and reapplied with the actual heading.

Four implementation defects were found and fixed before final checks: failed-result positive tokens disappeared
(including conflicting zero modelUsage), stale incomplete runs appeared permanently running, cleanup failure
was hidden, and a partial UTF-8 tail erased previous valid JSONL observations. Reproductions and fixes are in
[independent review](docs/agents/dashboard-review-STATUS.md).

The default reader reported7 existing control runs, no live model runs and no root warnings. Those controls
explicitly use no models; their zero usage is separate from unknown missing receipts. Runtime output and
provider billing still need a bounded live test after the pending first-run limit is resolved.
The default dashboard server remains at localhost8787; synthetic server and disposable Chrome were stopped.
No new Docker containers, installation, credentials changes, existing Personal OS edits, commit or push.
Ignored screenshots/reports, local sources/fixtures/docs, and the temp full-test log remain.

Final default-server GET checks: `/`200 and `/api/snapshot`200, schema `jev-dashboard/v1`,
runs7/control7/live0, no root warnings. A Node checker using `fd` for paths inspected44 Markdown
files/140 local links and ran `git diff --no-index --check /dev/null <file>` across122 text files:
errors0, exit0. `git status --short` confirms local untracked sources; no commit/push was made.

# 2026-10-09 — Realtime failure-observation research and read-only audit

This is a new verification scope. Prior167 regression and10 UI passes do not establish sufficient
live process, gate, or finalization failure detection. Product code and the running dashboard were not changed.
Main GET at `2026-10-09T05:40:29.049Z`: HTTP200, control7/live0, evaluation failed2/passed2/not_run3.
The two failures are earlier no-op controls, not new model-run failures.

Reviewer executed `node /private/tmp/jev-realtime-audit.CRhMrJ/audit.mjs`:
20 scenarios /20 verified observations, including assertions of known deficient behavior. This is not
a20/20 product-success score. Output is `results.json` in the same temporary directory. The source digest
set contains7 files. Findings include tool failures hidden by projection, missing budget/recording stop
signals, premature run completion, deadline-only liveness, and ambiguous generation/evaluation linkage.
Full commands, evidence and20-row matrix: [failure audit](docs/research/CURRENT_FAILURE_AUDIT.md).

Official docs research covers four delivery approaches and six observability/orchestration choices;
read-only local `codex exec --help` and `codex --version` confirm JSONL support and version0.144.1.
Both CLI commands emitted a PATH alias permission warning but exited0; no prompt/auth was executed.
Native Claude OTel, Codex adapters, SSE, supervisor/heartbeat, real browser failure latency and live billing
are proposed or unverified. No full runtime regression rerun was needed for document-only changes.
Entry point: [realtime research](docs/REALTIME_FAILURE_RESEARCH.md). No installs, runtime config changes,
container operations, model inference, external trace upload, commit or push. Existing8787 server remains;
research docs and the OS-temp audit artifacts remain.

Main document validation used `fd`, Node local-link/fence checks, and `git diff --no-index --check`:
51 Markdown files,189 local links, errors0, exit0. SHA256 comparison against the audit receipt confirmed
7/7 audited product source files unchanged. These are document/integrity checks, not a runtime or SSE test.

## 2026-10-09 — D-019 paired runtime and separate Opus monitor

The user explicitly removed call-count limits. New runtime accepts `max_decisions:null`, links Jev and Claude
by run/attempt/group IDs and adds a separate no-tool `claude-opus-5-5` custom-agent monitoring CLI.
SSE whole snapshots, GET fallback, gate independent state, runner finalization and monitor interpretation are implemented.
Actual Opus/Jev inference remains unexecuted: automatic approval review rejected the live paired command because
uncapped call count was authorized but uncapped Jev monetary spend was not separately explicit. An exact
current-balance spending question is pending. This is an execution approval block, not an observed model failure.

Executed validation:

- `npm test` (stdout saved `/private/tmp/jev-d019-tests.log`):244 tests,244 pass,0 fail/skip/cancel.
- After final monitor-code allowlist/import cleanup:
  `node --test test/dashboard-metrics.test.mjs test/benchmark-monitor.test.mjs test/paired-cancellation.test.mjs`:58/58 pass.
- `JEV_PLAYWRIGHT_PACKAGE='/Users/lee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/package.json' JEV_CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node scripts/check-paired-dashboard-browser.mjs`:8/8 synthetic browser checks.
  Report `output/playwright/paired-browser-check.json`, desktop/mobile images alongside. These are synthetic display checks,
  not actual model performance. Test browser and temporary server closed.
- `node bin/paired-run.mjs --config benchmark-runs/d019-e2eswe-run.json`: prepared_not_executed,
  paid_requests0, null call/USD ceiling, upstream14400-second task deadline.
- `python3.14 benchmarks/e2e-swe/adapter.py preflight`: pinned commit and8/8 source hashes verified; model_calls0.
- `node bin/jev.mjs models`: authenticated GET at fixed `https://jev-ai.pro/api/v1/models`, HTTP200,
  `jev-latest` present. This GET is not inference. OAuth auth status in sandbox was false; permitted host
  keychain read returned loggedIn:true/authMethod claude.ai. No new login/credential change.
- Existing localhost8787 server was restarted with the new code (exec session17672); user IAB tab reloaded.
  AX state shows '실시간 연결됨' and new execution-state panel. Historical grader provenance is now unknown
  without explicit generation evidence; old fixtures are not rewritten to create provenance.

Independent review exposed4 defects in the newly written monitor/controller and all were fixed:
post-cancel monitor spawn, treating stale heartbeat as terminal, conflicting/malformed provider final acceptance,
and completed receipt surviving a terminal journal write failure. Persistent tests plus VM fault injection
verified the fixes. The initial VM reproduction command omitted `--experimental-vm-modules` and failed before
executing; rerunning with that flag first showed the old defective expectation failing after the fix, then the
reviewer supplied positive regression tests. Details: [review](docs/agents/paired-review-STATUS.md).

A fresh offline container `jev-e2eswe-d019-01` was prepared, containing only the public specification.
No benchmark model run or independent candidate grading was performed. Existing Personal OS/Vault is unchanged.
No package installs, commits or pushes. Project sources remain local/uncommitted; temporary audit artifacts and
ignored configs/browser outputs remain. Final container disposition is recorded in STATE/work log.

Final document validation used fd-discovered Markdown + local target existence and git diff --no-index --check:
57 documents,224 local links,0 errors. The fresh unused container was removed by exact ID; the rejected
run output directory does not exist. All implementation/review delegates finished writing. Only the read-only
localhost8787 dashboard remains running for this task.

## D-020 (2026-10-09): budget, live connection and failure recovery

- `npm test` → **297/297 passed**, fail/skip/cancel 0, exit 0.
  Full output: `/private/tmp/jev-d020-final-verification.log`.
- `node --test test/benchmark-budget.test.mjs` → **46/46**, including durable reservation, 65 small calls
  without an arbitrary count ceiling, exact integer bound, concurrent writer exclusion, damaged state,
  unknown POST retention, documented dated-model mapping and explicit offline receipt reconciliation.
- `node --test test/benchmark-budget-lifecycle.test.mjs` → **1/1**: an actual forked child owns the ledger,
  then ordinary parent exit gives it time to release the lock. The interrupted-request path retains reservations.
- `scripts/check-paired-dashboard-browser.mjs` with existing Playwright/Chrome → **9/9**, synthetic only,
  no model calls. Includes shared estimate/reservation versus unknown actual USD; SSE and failure updates.
  Report: `output/playwright/paired-browser-check.json`, screenshot: `output/playwright/budget-desktop.png`.
- Actual authenticated GET models/credits succeeded without inference. `scripts/check-budgeted-jev.mjs`
  sent exactly one small Jev request. Saved response: input348/output41/paid348/tokens mode/1×/credits0,
  fixed Jev endpoint, resolved `typesafe/jev-1.13-20260917`. Account balance delta GET independently matched348.
  Example-only model allowlist initially blocked settlement. Official Jev model guide identified it as the
  same version. Saved receipt reconciliation produced USD0.0002088 estimate without another POST.
- Actual attempt01 failed OAuth lookup because child USER/LOGNAME were omitted. Read-only comparison:
  complete environment loggedIn true; old allowlist false; identity-preserving allowlist true. Corrected
  implementation, monitor and preflight to use one helper. No user re-login was performed.
- Actual attempt02 authenticated and produced an Opus response, but MCP failed because attempt01 left an
  orphan budget lock. Claude's prose claims of attempted tools are not execution evidence: tools were empty
  and the MCP status was failed. No Jev POST or Docker implementation action was recorded for these attempts.
  Failed attempt containers were removed; all response/cost/failure evidence remains.
- lsof found no lock owner, ledger pending was null and paid usage stayed348. Recovery receipt
  `benchmark-runs/d020-orphan-lock-recovery.json` preserves the old lock hash and reason. No budget reset.
- Actual standalone MCP probe: initialize/tools/status = **3 replies**, listed act/finish/status, zero
  decisions and released budget lock. Receipt: `benchmark-runs/diagnostics/d020-mcp-probe/receipt.json`.
- Actual attempt03 confirmed `claude-opus-5-5`, Jev `jev-1.13.0`, first decision/action result and separate
  Opus monitor responses. At16:15 KST the shared settled input was850 and conservative estimate USD0.00051.
  Execution continues; read the ledger/current run. This is not an independent benchmark pass.

Limit: the budget is a conservative token valuation based on published model limits/pricing, not a provider
USD billing control. Real billed USD stays unknown. Partial live integration does not prove model quality,
latency improvement, savings, whole-task success, Personal OS completion or native app behavior.

### D-020 final update, 16:23 KST

The next live receipt exposed the documented Vercel ID `typesafe-ai/jev`. The guard stopped before executing
its proposed command. Jev's provider guide and Vercel's official32K catalog support the same conservative
reservation; only this exact ID was added. The saved1735-token receipt was reconciled offline, preserving
prior spend and the failed run's original status. No request was replayed. The model ID display now preserves
this provider alias without treating it as a dated version.

- Final `npm test`: **298/298**, fail/skip/cancel0, exit0; `/private/tmp/jev-d020-final-all.log`.
- After alias/display change: budget+metrics **98/98**, `/private/tmp/jev-d020-provider-alias-tests.log`.
- Live attempt04 at16:23:06: runner provider/running, gate ready, one Jev decision and Docker action;
  separate Opus monitor responses completed. Shared ledger settled4requests/3110inputtokens across all
  attempts and the small check; valuation USD0.001866, no pending reservation at that observation.
- Attempt03 artifact exported to `benchmark-runs/candidate-d020-03`; stopped containers01–03 removed.
  Attempt04 container and foreground paired controller remain active. Personal OS has not started.

## 2026-10-09 D-021 official token prices and failure diagnosis

- `npm test > /private/tmp/jev-d021-all.log`: **311/311**, fail/skip/cancel0, exit0. Includes13 new pricing tests.
- Focused pricing/metrics/reader:73/73; final syntax check `node --check dashboard/app.js` exit0.
- First metrics-only run50/51 failed because the old PID privacy assertion searched any occurrence of333,
  including the new monthly rate0.483333… . Changed it to recursively reject `pid` keys. Rerun51/51 passed.
- Read-only official Jev Monthly pricing and active Creator account confirmed29USD/60M. Anthropic official
  Opus5.5 rates were checked against stored actual04 input/output/cache TTL and equal reportedUSD2.0264398.
- `adapter.py export --container jev-e2eswe-d020-04 --output benchmark-runs/candidate-d020-04` exit0.
- `adapter.py grade --workspace benchmark-runs/candidate-d020-04 --image-lock benchmark-runs/image-lock-pytest-check.json --output benchmark-runs/grade-d020-04`: process0 but reward0;0 tests collected of expected30 because setup.sh is missing and pytest_check uninstalled. Not30 failed assertions.
- Separate diagnostic copy adds only setup.sh running `python -m pip install --no-build-isolation --no-deps -e .`.
  Same grader/image:30/30, reward1 in `benchmark-runs/diagnostics/grade-d020-04-install/result.json`.
  This diagnostic intervention does not turn the original trial into a pass. Both verifier containers removed.
- Actual in-app browser saw8 beside-token price cells, JevUSD0.01062125 and ClaudeUSD2.0264398, source links,
  date and completion-failure label. Desktop width1233 and scrollWidth1233: no horizontal overflow.
  Evidence `benchmark-runs/diagnostics/d021-live-ui-check.json`; no mobile check this turn.
- Safe aggregate evidence: `benchmark-runs/diagnostics/d021-pricing-failure-report.json`.
- No new paid inference, budget reset, subscription setting changes, PersonalOS changes or push.

## 2026-10-09 D-022 authorized live rerun

Config validation exit0; paired implementation+independentmonitor exit0. New isolated attempt05 received
original goal plus artifact-only installation contract. Runtime250725ms,11completed JevPOSTs,7actions,
4finish decisions with finalfinishapproval. Original artifact exported unchanged and independentlygraded:
30expected/30collected/30passed, reward1, resolvedtrue, verifierremovedtrue. No after-the-fact source repair.
Receipts: benchmark-runs/e2eswe-d022-05/result.json, grade-d022-05/result.json,
diagnostics/d022-rerun-report.json. Preserved prior failures. SharedUSD1 ledger37settlements/37874tokens,
conservativeUSD0.0227244, no pending/block. Seven separateOpusmonitor runs completed. Product sourceunchanged;
no redundant npm rerun. Remaining UIgrade-link gap and noncomparative singletrial limitations in docs/research/D022_RERUN.md.

## 2026-10-09 D-023 matched structured baseline

Baseline configvalidate exit0; Claude runner67497 exit0, separateOpusmonitor92970 exit0.
Originalexport+fresh independentgrade30/30, reward1, resolvedtrue, verifierremovedtrue.
Runner197515ms vs savedJev250725ms; comparison53,210ms difference. Samebrief SHA/image/CLI/model/effort
verified using actualpreflight (not nullmanifestfields). Repro: node benchmark-runs/diagnostics/d023-compare.mjs.
JevreceiptHTTP latency11samples mean645.091ms; pureClaudechoice latency notavailable. One sequentialtrial each.
See docs/research/D023_SPEED_COMPARISON.md. No newJevinference/budgetreset/productsourcechanges.

## 2026-10-09 D-024 규칙 생명주기/분리 측정

- `node --test test/agent-rules.test.mjs`:12/12. stale approval, 권한 확장, 변조, abstain/keep/revise, 재시도 없음.
- `node --test test/evidence-output.test.mjs`:2/2. 실제발견한 가짜ID 유형과 stale revision 부정대조.
- `npm test > /private/tmp/jev-d024-final-tests.log 2>&1`:325/325,fail0/skip0. 첫 sandbox검사는localhost listen EPERM으로실패하여 허용된 host검사로실행했다. 중간323/323후ID검증추가최종325/325.
- 세 신규 scripts의 `node --check` 통과.
- 실제고정질문6provider호출완료. 규칙생성/갱신Jev3회완료. native초기연결은await누락으로실패;저장승인복원후native위임성공. 출력계약검증이ID누락을놓친결함발견/수정. 저장산출물재검증false,원본과정정기록보존. 전체E2E성능개선미측정.
- D024 신규Jev6회,누적USD1장부43회46505토큰/USD0.027903보수적. 실제청구액미확인. docs/research/D024_AGENT_RULES.md에실패/한계/재현명령.

## 2026-10-09 D-025 checkpoint 및 문서 스킬

- 최종 `npm test > /private/tmp/jev-d025-final-tests.log 2>&1`:343/343,fail0/skip0。영수증 benchmark-runs/d025-final-tests.log.
- 새checkpoint13개+runtime/launch2개+costcoverage3개검사포함. 최초알수없는workflow거절누락검사가실패했고유료실행전수정. callback결과변조방지와실패영수증0비용오인방지부정대조포함.
- 실제 paired baseline/Jev각1회:모델/CLI/brief/image/effort/workflow일치확인. baseline30/30/reward1, Jev29/30/reward0. 두runnerexit0와benchmarksuccess를혼동하지않음. 원본산출물수정없음.
- `node scripts/compare-checkpoint-runs.mjs benchmark-runs/d025-comparison-v2.json`:읽기전용재계산성공,호출/정산coverage확인. 모델HTTP시도수와Claudeassistant메시지수구분.
- 스킬quick_validate통과,4개파일설치해시일치. 독립agent의원시영수증적용자료 benchmark-runs/d025-skill-review,근거2개/주장8개구조검사통과. 의미·산술자동검사또는호스트자동선택검증아님.
- 비용/실패/미완료경계와실행명령은 docs/research/D025_REMEASUREMENT.md,문서스킬적용정본은 docs/decisions/D025.md.

## 2026-10-09 D027 문서 기반 오프라인 실행 실험

새 contract test18/18. npm test 최초361중349pass/12 localhost EPERM; 제한밖 동일회귀361/361pass. benchmark-runs/d027-offline-02에 threshold .5/.65/.8 합성 질문/답/함수결과 보존. docs/orchestration/D027_EXPERIMENT.md 참조. 실제 모델·native worker·E2E 품질/속도 미검증.

## 2026-10-09 D029

실행 전 npm test 375/375 통과(benchmark-runs/d029-full-tests.log). 고정 계획 단일/분할 원본 Docker grade 각각30/30, 두 verifier 제거. scripts/analyze-tree-e2e.mjs로 d029-analysis-v2.json 재계산; 수동 대기를 제외한 단계 합계임을 명시. 실행 중 산출물 패치 없음. 실패 arm exit0와 필수 worker 출력 검증 누락은 live 전 수정. 명령·경계는 [결과](docs/orchestration/D029_RESULTS.md).
