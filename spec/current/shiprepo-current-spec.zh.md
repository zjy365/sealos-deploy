# ShipRepo 当前产品与技术规格

本文件是 ShipRepo 当前唯一权威规格。旧的彻底重构、Vite/Hono、原型 HTML、历史 PRD 和历史架构文档不再作为参考源。

## 1. 产品判断

ShipRepo 当前不做全盘重构。现有 Next.js 应用已经具备 GitHub repo 到 Devbox / Codex / Sealos 部署链路的基础能力，当前上线瓶颈不是换技术栈，而是真实用户体验。

核心产品只做一件事：

```text
选择 GitHub 仓库 -> 生成部署运行任务 -> 补齐阻塞信息 -> 得到 Sealos preview / 上线结果
```

Chat 不是产品主体。Chat 只是用户给部署任务补充信息、确认决策、要求修复的交互入口。

## 2. 当前非目标

- 不迁移到 Vite + React。
- 不迁移到 Hono API。
- 不引入 Go API 作为主后端。
- 不做新的长期 control plane 重构。
- 不维护旧页面、旧原型、旧 PRD 的向后兼容。
- 不把 ShipRepo 做成通用 IDE、通用 agent dashboard 或多用途 coding sandbox。
- 不要求用户在 40 分钟任务中一直停留在 chat 页面。

## 3. 核心用户体验

长任务必须是异步部署运行体验，而不是等待式聊天体验。

任务页的主界面是 Deploy Run：

- 顶部展示仓库、任务标题、当前状态、运行时长和可用结果。
- 中间展示部署阶段 timeline。
- 明确展示是否需要用户补充环境变量或其他阻塞信息。
- 展示当前 agent 正在做什么，以及最近关键事件。
- 有 preview、pull request、runtime 等结果入口。
- Chat 输入框保留，用于继续指令、补充信息、让 agent 修复问题。

用户可以离开页面后回来。回来时看到的应该是任务运行态和结果，而不是只能翻 transcript。

## 4. 部署阶段模型

当前 UI 先从现有 task 字段、task events、task streams 投影，不先做数据库大迁移。

阶段定义：

1. `Queued`：任务已创建，等待运行。
2. `Runtime`：Devbox / Codex gateway 准备中。
3. `Analyze`：分析仓库结构、包管理器、启动方式和部署风险。
4. `Configure`：识别并等待环境变量、外部服务或用户确认。
5. `Build`：生成或修改部署相关文件，执行构建检查。
6. `Preview`：创建或发现 Sealos preview。
7. `Ship`：准备发布、PR、合并或上线结果。

当前字段映射：

- `tasks.status` 决定全局任务状态。
- `tasks.progress` 用作粗粒度进度。
- `tasks.runtimeName` / `runtimeState` / `gatewayReadyAt` 表示 Runtime 阶段。
- `tasks.activeTurnSessionId` / `turnCompletionState` / task stream 表示 agent 是否仍在工作。
- `tasks.previewUrl` 表示 Preview 阶段结果。
- `tasks.prUrl` / `prStatus` 表示 Ship 阶段结果。
- `tasks.error` 表示失败摘要。
- `task_events` 表示最近关键活动。

## 5. 当前技术方向

保留 Next.js 主体：

- Next.js App Router 继续承载页面和 API routes。
- PostgreSQL + Drizzle 继续作为产品状态存储。
- Devbox 继续作为临时执行环境。
- Codex app-server 继续作为部署任务的 coding executor。
- 当前 Rust Codex Gateway 暂时保留为执行通道和 fallback。

AI SDK 方向：

- 升级 `ai` 到 v6。
- 增加 `@ai-sdk/react`，为后续 `useChat` / UIMessage 流式协议收敛做准备。
- 升级 `streamdown`，让 Markdown 流式渲染更稳定。
- 评估 `ai-sdk-provider-codex-app-server` 是否可以在 Next.js route 中直接控制 Devbox 内的 Codex app-server。
- 如果 provider 不能稳定跨 Devbox 网络或进程边界工作，则保留 gateway，并在 Next.js route 层适配 AI SDK UI stream。

本轮不强制一次性替换 gateway 主链。先改善用户可见体验，再逐步收敛流协议。

## 6. 页面结构

任务页结构：

```text
SharedHeader
DeployRunHeader
DeployRunStageTimeline
DeployRunBlockingPanel / ResultPanel
RecentActivity
TaskChat
```

Chat 在任务页中降级为部署运行的交互区。它仍然可以流式输出 Markdown，但不再承担整页信息架构。

## 7. 信息安全

用户可见日志必须使用静态消息或经过允许的 task-flow 日志格式。不得把以下内容写入用户可见日志：

- tokens、API keys、passwords、secrets
- repository URL
- file paths
- raw prompt
- branch names 和 commit messages
- Devbox runtime credentials

新增日志必须遵守仓库 `AGENTS.md` 的静态日志规则。

## 8. 验收标准

当前 MVP 到可上线状态需要满足：

- 用户选择 GitHub repo 后能进入部署运行页。
- 任务运行 40 分钟时，页面仍能清楚展示当前阶段、最近活动和是否需要用户操作。
- 用户不需要一直盯着 chat，也能看懂任务是否仍在推进。
- 有 preview 或 PR 时，结果入口在主界面直接可见。
- 失败时展示可执行的下一步，而不是只展示 transcript 尾部错误。
- Markdown 流式输出不会破坏布局。
- `pnpm format`、`pnpm type-check`、`pnpm lint` 通过。

## 9. 后续演进顺序

1. 文档源收敛为本文件。
2. 任务页改成 Deploy Run 主界面。
3. 升级 AI SDK / Streamdown 依赖并修兼容。
4. 引入 AI SDK UI stream adapter。
5. POC `ai-sdk-provider-codex-app-server` 直连 Devbox 内 Codex app-server。
6. 只有当现有数据模型无法表达部署状态时，再做最小 schema 调整。
