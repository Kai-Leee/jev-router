<p align="center"><img src="docs/brand/pointsman-256.png" width="160" height="160" alt="Pointsman 吉祥物：用舌头拉动道岔扳手的青蛙"></p>
<p align="center"><a href="https://m8ven.ai/mcp/kai-leee-jev-router-1k0heh?s=readme"><img src="https://m8ven.ai/badge/mcp/kai-leee-jev-router-1k0heh?v=048f027e982892c5acfd612cc732a9bb" alt="M8ven Score"></a></p>

<h1 align="center">Pointsman</h1>

<p align="center"><em>通过 Jev 与依赖 DAG 实现快速任务路由。</em><br><sub>原名 Jev Router</sub></p>

[English](README.md) | [한국어](README.ko.md) | **简体中文**

Pointsman 是一个结合 Jev 与依赖 DAG 的编码智能体任务路由项目。
它把结构化判断连接到任务拆分、前置依赖和执行顺序，并将就绪任务分派给编码工作智能体。
研究运行器将路由结果与产物范围、公开检查和执行记录相连接。

本次发布提供 Jev 客户端、评估工具、运行契约和用量仪表盘。
请参阅 [main、research、本地功能与技能拆分（英文）](docs/CAPABILITIES.en.md)。
高级 DAG 实验记录位于 [research 分支](https://github.com/Kai-Leee/pointsman/tree/research)。

[实测结果](#实测结果) · [路由流程](#路由流程) · [快速开始](#快速开始) ·
[文档](#文档) · [安全](#安全)

## 实测结果

在完成的 D067 对比中，Jev 拆分与依赖判断条件相对 Claude 基线的**开发阶段耗时减少 21.84%，报告 token 合计减少 46.50%**。仅使用 Jev 拆分判断的条件**耗时减少 28.74%，token 减少 41.42%**。以下三组均通过全部 **85 项公开检查和 63 项独立检查**。

| OpenAPI Python 客户端生成器条件 | 开发阶段耗时 | 报告 token 合计 | 实验时 API 费率折算成本 |
|---|---:|---:|---:|
| Claude 结构化判断 + Claude 工作智能体 | 36分 20.704秒 | 6,772,666 | $21.135172 |
| Jev 拆分判断 + Claude 工作智能体 | 25分 54.036秒 | 3,967,289 | $9.864863 |
| Jev 拆分与依赖判断 + Claude 工作智能体 | 28分 24.540秒 | 3,623,150 | $8.766580 |

每个条件运行一次，在同一批次并发执行。均使用 Opus 5.5 medium，每组两个并发工作槽。
耗时包括判断、实现、修复和公开验证，不包括共享准备和独立评分。
Token 合计包含 Claude 输入、输出、缓存创建、缓存读取，以及 Jev 输入和输出；提供商的分词器不同。
三组外部调用总数均为 57 次。降幅以 Claude 基线为分母。
拆分与依赖条件的历史 API 费率折算成本减少 58.52%，并非订阅账单。
[测量方法、token 明细与独立判断阶段（英文）](docs/MEASURED_ROUTING.en.md) ·
[公开汇总 JSON](docs/evidence/measured-results-20261015.json) ·
[完整实验记录](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D067_RESULTS.md)。

[D068–D085 后续结果、实际修复与重复运行（英文）](docs/POST_D067_RESULTS.en.md)。

## 路由流程

主智能体提供目标、公开规格和产物契约。Jev 通过固定英文问题判断任务拆分与依赖关系。
研究运行器将验证后的答案连接到可执行 DAG，并在每个工作智能体允许的文件范围内执行就绪任务。

```text
目标 + 规格 + 产物契约
→ 结构化 Jev 问题与输入验证
→ 拆分与依赖判断
→ 依赖 DAG 与就绪任务队列
→ 限定文件范围的编码工作智能体
→ 与产物版本绑定的公开检查
→ 结果记录与基于失败证据的修复路由
```

- **按依赖关系调度。** 就绪任务可并行执行，下游任务接收经验证的上游产物。
- **判断连接到执行。** 结构化答案连接到工作范围与执行处理程序。
- **每个判断保留证据。** 问题、答案、用量、产物版本与检查结果保持关联。

控制器实施权限与验证，Jev 在契约范围内选择。测试确认产物是否满足任务要求。
参见[技术规格](docs/TECHNICAL_SPEC.en.md)与[研究状态](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md)。

## 快速开始

需要 Node.js 22 或更高版本。没有外部依赖包。

```sh
git clone https://github.com/Kai-Leee/pointsman.git
cd pointsman
npm run mcp:fetch   # 为 MCP 测试安装固定版本的 jev-mcp 二进制文件，校验 SHA-256
npm test            # 仅使用假密钥和模拟 HTTP；不推理，不消耗余额
npm run check:links # 检查相对链接、标题锚点和 research 分支链接
npm run eval:demo   # 对合成记录进行离线评估
```

`mcp:fetch` 支持 macOS ARM64、Linux x64 和 Linux arm64（[SOURCE.json](vendor/jev-mcp/SOURCE.json)）。
缺少该二进制文件时，3 个 MCP 测试会失败。CI 在 macOS（Node 22）和 Docker（Node 24、26）中运行测试。

连接 Jev 需要 Jev AI 账户和密钥，并须同意 Jev AI 使用条款（[登录](docs/USAGE.en.md#sign-in)）：

```sh
npm run login            # 同意条款，在密钥页面登录，隐藏输入密钥
npm run config           # 仅输出配置和密钥是否存在；不访问网络
npm run models           # 1 次已认证的 GET
npm run demo -- --spend  # 1 次付费 POST；消耗 Jev 余额
```

更多：[完整使用、失败处理和部署说明](docs/USAGE.en.md) ·
[MCP 启动器](MCP.md) · [仪表盘](docs/DASHBOARD.en.md)（`npm run dashboard`）·
[基准测试](benchmarks/README.md)。

## 文档

`main` 保存代码、运行契约和使用文档。实验、决策和工作记录位于
[`research` 分支](https://github.com/Kai-Leee/pointsman/tree/research)。

- **入门：** [技术规格](docs/TECHNICAL_SPEC.en.md) · [运行契约](docs/orchestration/contracts/README.en.md)
- **使用：** [使用说明](docs/USAGE.en.md) · [评估 CLI](docs/EVALUATION_USAGE.en.md) 和
  [输入契约](docs/EVALUATION_CONTRACT.en.md) · [仪表盘](docs/DASHBOARD.en.md) ·
  [开发联动与独立 Opus 监控](docs/PAIRED_RUN.md) · [基准测试](benchmarks/README.md) ·
  [MCP](MCP.md)
- **research 分支（韩语）：** [当前状态](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md) ·
  [文档索引](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/README.md) · [决策记录](https://github.com/Kai-Leee/pointsman/blob/research/docs/DECISIONS.md) ·
  [工作记录](https://github.com/Kai-Leee/pointsman/blob/research/docs/WORK_LOG.md) · [验证记录](https://github.com/Kai-Leee/pointsman/blob/research/VERIFICATION.md) ·
  [评估方法](https://github.com/Kai-Leee/pointsman/blob/research/docs/EVALUATION_RESEARCH.md) ·
  [实际实验可行性](https://github.com/Kai-Leee/pointsman/blob/research/docs/LIVE_EXPERIMENT_FEASIBILITY.md) ·
  [实时失败报告](https://github.com/Kai-Leee/pointsman/blob/research/docs/REALTIME_FAILURE_RESEARCH.md)
- **发布：** [变更日志](CHANGELOG.md)
- **贡献者与智能体：** [AGENTS.md](AGENTS.md)（Codex 入口）·
  [CLAUDE.md](CLAUDE.md)（Claude 入口，导入 AGENTS.md）·
  [开发智能体角色与交接](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/README.md)

## 安全

- `JEV_AI_API_KEY` 只保存在服务端：进程环境变量或 `~/workspace/.env`。
  可用 `JEV_AI_ENV_FILE` 指定其他文件路径。
- 不要把密钥放入聊天、浏览器代码、Git、命令行参数或日志。不要使用 `NEXT_PUBLIC_`、`VITE_`、
  `PUBLIC_` 等公开前缀。
- 目标 URL 固定在 [src/config.mjs](src/config.mjs) 中。拒绝重定向。
  诊断输出从不打印密钥或 Authorization 头。

## 许可证

[Apache License 2.0](LICENSE)。

该许可证仅适用于本仓库的代码，不授予任何 Jev AI 服务的使用权。使用实际 Jev 功能需要您自己的
Jev AI 账户和密钥，并须同意 Jev AI 的[使用条款](https://jev-ai.pro/terms)和[隐私政策](https://jev-ai.pro/privacy)。

复用的 `jev-mcp` v0.3.1 二进制文件采用 Apache-2.0 许可，且未提交到仓库。其来源和校验和见
[vendor/jev-mcp/SOURCE.json](vendor/jev-mcp/SOURCE.json)。
