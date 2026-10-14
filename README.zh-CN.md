<p align="center"><img src="docs/brand/pointsman-256.png" width="160" height="160" alt="Pointsman 吉祥物：用舌头拉动道岔扳手的青蛙"></p>
<p align="center"><a href="https://m8ven.ai/mcp/kai-leee-jev-router-1k0heh?s=readme"><img src="https://m8ven.ai/badge/mcp/kai-leee-jev-router-1k0heh?v=048f027e982892c5acfd612cc732a9bb" alt="M8ven Score"></a></p>

<h1 align="center">Pointsman</h1>

<p align="center"><em>我会遵从 Jev 的判断。</em><br><sub>原名 Jev Router</sub></p>

[English](README.md) | [한국어](README.ko.md) | **简体中文**

Pointsman 通过向 [Jev AI](https://jev-ai.pro) 提出固定的结构化问题，辅助主编码智能体进行模型选择和
任务中的判断。本仓库包含服务端 Jev 客户端、离线评估 CLI、隔离的基准测试运行器和本地用量仪表盘。
这是一个研究项目。实测结果很少，每项结果都附有证据记录。

> 韩语文档附有英文版本（`*.en.md`）。研究与分析记录位于 [`research` 分支](https://github.com/Kai-Leee/pointsman/tree/research)，使用韩语编写。

[现状](#现状) · [为什么需要](#为什么需要) · [快速开始](#快速开始) · [局限](#局限) ·
[文档](#文档) · [安全](#安全) · [许可证](#许可证)

## 现状

| 项目 | 状态 | 证据 |
|---|---|---|
| Jev 连接（`GET /v1/models`、`POST /v1/systemone`） | 已实现。2026-10-08 确认密钥配置和已认证的模型列表查询 | [使用说明](docs/USAGE.en.md#local-key-setup) |
| 离线评估 CLI | 已实现。附带示例为合成数据 | [评估 CLI](docs/EVALUATION_USAGE.en.md) |
| 实际单任务/拆分 E2E 运行（D029） | 每个条件各 1 次。独立评分均为 30/30。拆分：各阶段耗时合计降低 22.829%，估算成本增加 64.112% | [D029 结果](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D029_RESULTS.md) |
| 输入投影 v3（D031） | 仅离线重放，无新的付费调用，回归测试 390/390 | [D031 实现](https://github.com/Kai-Leee/pointsman/blob/research/docs/orchestration/D031_IMPLEMENTATION.md) |
| 自动路由效果、产品完成度 | 未验证 | [STATE](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md) |

最新检查点始终以 [research 分支的 STATE](https://github.com/Kai-Leee/pointsman/blob/research/docs/agents/STATE.md) 为准。本表可能滞后于该文件。

## 为什么需要

主智能体在工作中要做许多小判断：使用哪个模型和 effort、是否拆分任务、证据是否充分。
Pointsman 验证这些重复判断能否以固定英文问题和结构化答案（`choice`、`score`、`noul`）
交给 Jev AI。

```text
主任务中的判断点
→ 确认目标、证据和所需输出
→ 构建候选项（如有需要）
→ 编写英文问题并校验 API 输入
→ 调用 Jev
→ 校验回答，记录判断状态和用量
→ 主会话执行后续行动
```

主会话保持目标并执行行动。Jev 的回答不是执行许可，也不是测试通过的证据。
准确率、速度、token 和成本的改进在实测之前都是假设。Jev 的概率不是任务成功率。
详见：[技术规格](docs/TECHNICAL_SPEC.en.md)。

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

## 局限

如果需要以下任何一项，请不要使用 Pointsman：

- **生产环境路由器。** 尚未进行任何部署。没有分布式限流器。
- **自动恢复。** 调用从不自动重试。结果不确定的付费 POST 不会重新发送，应先核对用量
  （[失败处理](docs/USAGE.en.md#failure-handling-and-limits)）。
- **强证据。** 唯一的实际拆分对比（D029）每个条件只运行 1 次。阈值未校准，运行阈值为 `null`。
- **宿主集成。** 宿主中的插件自动加载、Claude/Codex 执行者选择和负载均衡均未验证。
- **无付费密钥的实际判断。** 没有 Jev AI 密钥时，只有离线工具和测试可以运行。

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
