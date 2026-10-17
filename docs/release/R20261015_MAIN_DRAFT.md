# Main publication draft — Jev + DAG routing

Prepared 2026-10-15. Draft only; root owns publication. Inspected `origin/main` at `8b2da35b419ecb568ca52a44c04c5bd9921aeafd`. No README, branch or remote mutation performed by this author.

## Recommended positioning

Replace the three taglines consistently:

- English: **Fast task routing with Jev and dependency DAGs.**
- Korean: **Jev와 의존성 DAG로 빠르게 연결하는 작업 라우팅.**
- Chinese: **通过 Jev 与依赖 DAG 实现快速任务路由。**

English introduction:

> Pointsman is a Jev-powered task routing project for coding agents. It turns structured decisions into dependency DAGs: divide work, connect prerequisites, and dispatch ready tasks to coding workers. Its research runner connects routing decisions to scoped artifacts, public checks and recorded execution outcomes. This repository provides the Jev client, evaluation tools, run contracts and usage dashboard; the advanced DAG experiments are documented on the research branch.

Korean introduction:

> Pointsman은 Jev와 의존성 DAG를 활용하는 코딩 에이전트 작업 라우팅 프로젝트입니다. 구조화된 판단을 작업 분해·선행 관계·실행 순서에 연결하고, 준비된 작업을 코딩 작업자에게 배정합니다. 연구 실행기는 라우팅 결과를 담당 산출물, 공개 검사, 실행 기록까지 연결합니다. 이 저장소는 Jev 클라이언트·평가 도구·실행 계약·사용량 대시보드를 제공하며, 고급 DAG 실험은 research 브랜치에서 확인할 수 있습니다.

Chinese introduction:

> Pointsman 是一个结合 Jev 与依赖 DAG 的编码智能体任务路由项目。它把结构化判断连接到任务拆分、前置依赖和执行顺序，并将就绪任务分派给编码工作智能体。研究运行器将路由结果与产物范围、公开检查和执行记录相连接。本仓库提供 Jev 客户端、评估工具、运行契约和用量仪表盘；高级 DAG 实验记录位于 research 分支。

## README-ready measured highlight

### English

**Measured DAG routing result: 21.84% less development-stage time and 58.52% lower API-rate-equivalent cost in one completed benchmark observation.**

On the OpenAPI Python client generator task, moving decomposition and dependency decisions to Jev produced the following D067 result. Both conditions used Opus 5.5 medium coding workers with two worker slots per condition and passed all 85 public checks and 63 independent checks.

| D067 condition | Development-stage time | Historical API-rate-equivalent cost | Public / independent checks |
|---|---:|---:|---:|
| Claude structured decisions + Claude workers | 36m 20.704s | $21.135172 | 85/85 · 63/63 |
| Jev decomposition + dependency decisions, Claude workers | 28m 24.540s | $8.766580 | 85/85 · 63/63 |

One run per condition, executed in a concurrent cohort. Time includes decisions, implementation, repairs and public validation; it excludes shared preparation and independent grading. Cost is calculated from recorded usage at the prices captured for that experiment, not a subscription invoice. Reductions use the Claude row as the denominator. [Method and complete experiment record](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_RESULTS.md).

### Korean

**DAG 라우팅 실측: 완료된 벤치마크 1회 관측에서 개발 단계 시간 21.84%, API 단가 환산 비용 58.52% 감소.**

OpenAPI Python client generator 과제의 D067 실험에서 분해·의존 관계 판단을 Jev로 이전한 결과입니다. 두 조건 모두 Opus 5.5 medium 작업자와 조건당 동시 작업자 2개를 사용했고, 공개 85/85와 독립 63/63 검사를 통과했습니다.

| D067 조건 | 개발 단계 시간 | 당시 API 단가 환산 비용 | 공개 / 독립 검사 |
|---|---:|---:|---:|
| Claude 구조화 판단 + Claude 작업자 | 36분 20.704초 | $21.135172 | 85/85 · 63/63 |
| Jev 분해·의존 관계 판단 + Claude 작업자 | 28분 24.540초 | $8.766580 | 85/85 · 63/63 |

조건별 1회이며 같은 비교군에서 동시에 실행했습니다. 시간은 판단·구현·수리·공개 검사를 포함하고 공통 준비와 독립 채점은 제외합니다. 비용은 당시 기록한 단가와 호출 사용량으로 계산한 환산액이며 월 구독 청구액이 아닙니다. 감소율의 분모는 Claude 기준선입니다. [측정 방법과 전체 실험 기록](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_RESULTS.md).

### Chinese

**DAG 路由实测：在一次完成的基准测试观测中，开发阶段耗时减少 21.84%，按 API 费率折算的成本减少 58.52%。**

在 OpenAPI Python 客户端生成器任务的 D067 实验中，任务拆分与依赖判断由 Jev 执行。两组均使用 Opus 5.5 medium 编码工作智能体，每组两个并发工作槽，并通过全部 85 项公开检查与 63 项独立检查。

| D067 条件 | 开发阶段耗时 | 实验时 API 费率折算成本 | 公开 / 独立检查 |
|---|---:|---:|---:|
| Claude 结构化判断 + Claude 工作智能体 | 36分 20.704秒 | $21.135172 | 85/85 · 63/63 |
| Jev 拆分与依赖判断 + Claude 工作智能体 | 28分 24.540秒 | $8.766580 | 85/85 · 63/63 |

每个条件运行一次，各条件在同一批次并发执行。耗时包括判断、实现、修复和公开验证，不包括共享准备和独立评分。成本根据实验时记录的费率和调用用量折算，并非订阅账单。降幅以 Claude 基线为分母。[测量方法与完整实验记录](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_RESULTS.md)。

## Routing explanation replacement

```text
Goal + public specification + artifact contracts
→ fixed structured Jev questions
→ validated decomposition and dependency decisions
→ dependency DAG + ready-task queue
→ scoped coding workers
→ public checks tied to artifact revisions
→ recorded results and evidence-driven repair routing
```

Suggested feature bullets, explicitly labeled “research runner” unless corresponding runtime has also been promoted to main:

- **Dependencies guide dispatch.** Ready tasks can run concurrently; downstream tasks consume validated upstream artifacts.
- **Decisions reach execution.** Structured answers connect to worker scopes and executable handlers.
- **Evidence follows each decision.** Record questions, accepted answers, provider usage, artifact revisions and public checks.

The first numeric highlight deliberately uses one successful condition for both time and cost; do not combine the best time from `jev_split` with the best cost from `jev_split_relations` as one outcome.

## Additional decision-latency observation — use only with explicit scope

2026-10-14 initial-routing measurement: four identical canonical requests containing 210 questions. Provider-attempt wall sums were Codex 243.814661083s and Jev 9.263180124s; the Codex/Jev ratio is 26.32083775. This measures initial decision latency (Codex CLI versus Jev adapter including preflight/ledger), not complete development time. Effective global CLI skill context was not fixed in that run. Do not turn it into “26× faster coding” or use it as the primary full-development headline.

The ongoing repaired/frozen-environment comparison must be reported from its own finished receipts before adding any new performance claim. No expected improvement has been inserted into this draft.

## Publication evidence and integration notes

- Source evidence: `benchmark-runs/d067-analysis-02.json`, successful `claude_all` and `jev_split_relations` rows; `docs/orchestration/D067_RESULTS.md` supplies method and original commands.
- Recomputed values: baseline 2,180,703.6033750004ms / $21.135171600000003; Jev 1,704,539.9688330002ms / $8.76658019999998; `(baseline − Jev) / baseline × 100` yields time 21.835321123194277%, cost 58.52136729280221%.
- Both rows have `product_success=true`, public status `passed`, independent `tests=63`, `passed=63`, `skipped=0`, `candidate_unchanged=true` and `container_removed=true`.
- Reproduction: `node benchmark-runs/d067-preflight/analyze.mjs <NEW_OUTPUT_JSON>` recalculates saved evidence without inference. Do not rerun paid scripts into old output directories.
- Initial latency evidence: `benchmark-runs/codex-e2e-mac-20261014-02/comparison-summary.json`, field `initial_split`; canonical request equality is true. Its full-run success metrics remain separate.
- `origin/research` contains `docs/orchestration/D067_RESULTS.md`; it does not yet contain `CODEX_MAC_RESULTS.md`. A publication must not link to the latter as though already published.
- The user requested positive highlights on main. Use the scoped highlight above; keep complete research records intact. Retain necessary setup/security guidance. Avoid repeating old main claims such as “D029 is the only live comparison” after this update.
- Update all three README taglines and intros together. Replace stale status rows with this measured snapshot and links; preserve current quick-start commands until the released code is separately validated.
- No new model inference, ledger mutation, main README edit, commit or push performed for this draft.
