# Jev Router

[English](README.md) | [한국어](README.ko.md) | **简体中文**

Jev Router 通过向 [Jev AI](https://jev-ai.pro) 提出固定的结构化问题，辅助主编码智能体进行模型选择和
任务中的判断。本仓库包含服务端 Jev 客户端、离线评估 CLI、隔离的基准测试运行器和本地用量仪表盘。
这是一个研究项目。实测结果很少，每项结果都附有证据记录。

> `docs/` 下的详细文档使用韩语编写。

[现状](#现状) · [为什么需要](#为什么需要) · [快速开始](#快速开始) · [局限](#局限) ·
[文档](#文档) · [安全](#安全) · [许可证](#许可证)

## 现状

| 项目 | 状态 | 证据 |
|---|---|---|
| Jev 连接（`GET /v1/models`、`POST /v1/systemone`） | 已实现。2026-10-08 确认密钥配置和已认证的模型列表查询 | [docs/USAGE.md](docs/USAGE.md#로컬-키-설정) |
| 离线评估 CLI | 已实现。附带示例为合成数据 | [docs/EVALUATION_USAGE.md](docs/EVALUATION_USAGE.md) |
| 实际单任务/拆分 E2E 运行（D029） | 每个条件各 1 次。独立评分均为 30/30。拆分：各阶段耗时合计降低 22.829%，估算成本增加 64.112% | [D029 结果](docs/orchestration/D029_RESULTS.md) |
| 输入投影 v3（D031） | 仅离线重放，无新的付费调用，回归测试 390/390 | [D031 实现](docs/orchestration/D031_IMPLEMENTATION.md) |
| 自动路由效果、产品完成度 | 未验证 | [STATE](docs/agents/STATE.md) |

最新检查点始终以 [docs/agents/STATE.md](docs/agents/STATE.md) 为准。本表可能滞后于该文件。

## 为什么需要

主智能体在工作中要做许多小判断：使用哪个模型和 effort、是否拆分任务、证据是否充分。
Jev Router 验证这些重复判断能否以固定英文问题和结构化答案（`choice`、`score`、`noul`）
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
详见：[技术规格](docs/TECHNICAL_SPEC.md)。

## 快速开始

需要 Node.js 22 或更高版本。没有外部依赖包。

```sh
git clone https://github.com/Kai-Leee/jev-router.git
cd jev-router
npm test            # 仅使用假密钥和模拟 HTTP；不推理，不消耗余额
npm run eval:demo   # 对合成记录进行离线评估
```

其中 3 个 MCP 测试需要位于 `vendor/jev-mcp/0.3.1/` 的固定版本 `jev-mcp` 二进制文件（macOS ARM64）。
该二进制文件未提交到仓库。请从 [vendor/jev-mcp/SOURCE.json](vendor/jev-mcp/SOURCE.json)
中的归档 URL 下载并核对 SHA-256。缺少该文件时，新克隆的仓库 390 个测试中通过 387 个。

连接 Jev 需要 Jev AI 密钥（[密钥配置](docs/USAGE.md#로컬-키-설정)）：

```sh
npm run config           # 仅输出配置和密钥是否存在；不访问网络
npm run models           # 1 次已认证的 GET
npm run demo -- --spend  # 1 次付费 POST；消耗 Jev 余额
```

更多：[完整使用、失败处理和部署说明](docs/USAGE.md) ·
[MCP 启动器](MCP.md) · [仪表盘](docs/DASHBOARD.md)（`npm run dashboard`）·
[基准测试](benchmarks/README.md)。

## 局限

如果需要以下任何一项，请不要使用 Jev Router：

- **生产环境路由器。** 尚未进行任何部署。没有分布式限流器。
- **自动恢复。** 调用从不自动重试。结果不确定的付费 POST 不会重新发送，应先核对用量
  （[失败处理](docs/USAGE.md#실패-처리와-제한)）。
- **强证据。** 唯一的实际拆分对比（D029）每个条件只运行 1 次。阈值未校准，运行阈值为 `null`。
- **宿主集成。** 宿主中的插件自动加载、Claude/Codex 执行者选择和负载均衡均未验证。
- **无付费密钥的实际判断。** 没有 Jev AI 密钥时，只有离线工具和测试可以运行。

## 文档

- **入门：** [技术规格](docs/TECHNICAL_SPEC.md) ·
  [契约与文档索引](docs/orchestration/README.md) · [当前状态](docs/agents/STATE.md)
- **使用：** [使用说明](docs/USAGE.md) · [评估 CLI](docs/EVALUATION_USAGE.md) 和
  [输入契约](docs/EVALUATION_CONTRACT.md) · [仪表盘](docs/DASHBOARD.md) ·
  [开发联动与独立 Opus 监控](docs/PAIRED_RUN.md) · [基准测试](benchmarks/README.md) ·
  [MCP](MCP.md)
- **证据：** [决策记录](docs/DECISIONS.md) · [工作记录](docs/WORK_LOG.md) ·
  [验证记录](VERIFICATION.md)
- **调研：** [评估方法](docs/EVALUATION_RESEARCH.md) ·
  [实际实验可行性](docs/LIVE_EXPERIMENT_FEASIBILITY.md) ·
  [实时失败报告](docs/REALTIME_FAILURE_RESEARCH.md)
- **贡献者与智能体：** [AGENTS.md](AGENTS.md)（Codex 入口）·
  [CLAUDE.md](CLAUDE.md)（Claude 入口，导入 AGENTS.md）·
  [开发智能体角色与交接](docs/agents/README.md)

## 安全

- `JEV_AI_API_KEY` 只保存在服务端：进程环境变量或 `~/workspace/.env`。
  可用 `JEV_AI_ENV_FILE` 指定其他文件路径。
- 不要把密钥放入聊天、浏览器代码、Git、命令行参数或日志。不要使用 `NEXT_PUBLIC_`、`VITE_`、
  `PUBLIC_` 等公开前缀。
- 目标 URL 固定在 [src/config.mjs](src/config.mjs) 中。拒绝重定向。
  诊断输出从不打印密钥或 Authorization 头。

## 许可证

尚未确定。没有 `LICENSE` 文件。

复用的 `jev-mcp` v0.3.1 二进制文件采用 Apache-2.0 许可，且未提交到仓库。其来源和校验和见
[vendor/jev-mcp/SOURCE.json](vendor/jev-mcp/SOURCE.json)。
