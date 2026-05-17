# ShipRepo 清晰 PRD

## 1. 产品一句话

ShipRepo 是一个面向开发者的 GitHub repo 到 Sealos 云端可运行应用的部署工作台。用户选择仓库后，ShipRepo 帮他判断项目能否部署、准备必要部署改动、创建可打开的预览环境，并在用户确认后发布为正式 Sealos 应用。

## 2. 产品不是什么

ShipRepo 不是：

- 通用 AI 聊天机器人。
- IDE 或 AI coding cockpit。
- CI/CD 流水线可视化工具。
- 日志大屏。
- Dockerfile 生成器。
- Sealos 控制台的普通部署按钮。

ShipRepo 的核心是：**让用户从一个 GitHub repo 得到一个可信的 Sealos preview，并知道下一步能不能安全发布。**

## 3. 用户真正关心什么

用户不关心内部是否经历了 Analyze、Fix、Build、Preview、Ship、Operate。

用户关心：

1. 我的项目现在能不能打开？
2. 如果不能，卡在哪里？
3. 你为了让我能部署改了什么？
4. 这些改动会不会影响业务代码？
5. 我下一步该点什么？
6. 发布到生产之前还有什么风险？
7. 出错时我该补什么信息，还是让系统自动修？

所以产品界面必须使用用户语言，不使用内部流水线语言作为主结构。

## 4. 目标用户

### 4.1 独立开发者和小团队

他们有 GitHub 项目，但不想先理解 Dockerfile、镜像、端口、环境变量、Sealos 模板和资源配置。

核心任务：

- 快速得到一个可打开的 preview URL。
- 知道失败原因。
- 审查 AI 准备的部署改动。
- 确认后发布正式应用。

### 4.2 Sealos 新用户

他们愿意尝试 Sealos，但不熟悉平台概念。

核心任务：

- 不学习平台细节也能先跑起自己的项目。
- 通过一次成功 preview 理解 Sealos 价值。

### 4.3 Sealos 支持和运营人员

他们需要帮助用户把项目迁移到 Sealos。

核心任务：

- 快速看懂用户项目为什么部署失败。
- 复用常见项目的部署经验。
- 用结构化结果替代只看原始日志。

## 5. 核心用户旅程

### 5.1 创建任务

用户连接 GitHub，选择 repo 和 branch，输入自然语言目标，例如：

```text
把这个项目部署到 Sealos，先创建一个 preview。
```

系统创建 deployment task。

用户看到：

- repo 名称。
- branch。
- 当前任务目标。
- 当前状态。

### 5.2 查看当前结果

系统完成一次处理后，页面优先显示结果，而不是过程。

成功时：

- Preview is ready。
- Preview URL。
- 健康检查结果。
- 使用的镜像。
- 发布生产前需要确认的事项。
- 主操作：Open preview / Publish。

失败时：

- Preview is not ready。
- 失败原因。
- 需要用户补充的信息。
- 系统可以自动修复的建议。
- 主操作：Retry / Provide env vars / Review fix。

### 5.3 审查部署改动

如果 ShipRepo 修改了仓库文件，用户必须能看到：

- 改了哪些文件。
- 为什么改。
- 是否只影响部署。
- 是否建议创建 PR。

默认不展示完整 diff。完整 diff 放在详情层。

### 5.4 发布生产

Preview 成功后，用户可以选择发布生产。

发布前必须展示：

- 生产应用名称。
- 资源配置。
- 环境变量确认状态。
- 镜像。
- 域名或正式 URL。
- 高风险提示。

生产发布必须显式确认。

### 5.5 后续操作

发布后用户可以：

- 查看 deployment 状态。
- 查看日志摘要。
- 修改环境变量。
- 重部署。
- 回滚。
- 创建 GitHub PR。

## 6. V1 范围

### 6.1 In Scope

V1 必须支持：

- GitHub 登录。
- 选择 GitHub repo 和 branch。
- 创建部署任务。
- 判断项目是否可部署。
- 识别必要部署改动。
- 生成或修改 Dockerfile、Sealos template、dockerignore 等部署相关文件。
- 构建镜像。
- 推送镜像。
- 创建 Sealos preview。
- 展示 Preview URL。
- 展示发布生产前的检查项。
- 用户确认后发布生产。
- 展示本次改动摘要。
- 展示事件记录、日志和 diff 作为证据层。
- 失败原因解释。
- 用户补充环境变量或必要输入。
- 取消任务和清理资源。

### 6.2 Out of Scope

V1 不做：

- Electron 主产品。
- 本地 repo 直接部署。
- 通用聊天。
- 复杂组织权限。
- 多云部署。
- 团队协作审批流。
- 完整 Sealos 控制台替代品。
- 监控告警平台。
- 让用户自由操控 sandbox terminal 作为主流程。

## 7. 核心页面

### 7.1 Repo Picker

目标：让用户快速开始一次部署任务。

必须包含：

- GitHub 连接状态。
- repo 搜索。
- branch 选择。
- 部署目标输入。
- 主按钮：Create preview。

不应包含：

- 大面积营销文案。
- Agent 能力列表。
- 技术流程解释。

### 7.2 Task Detail

这是核心页面。

首屏必须回答：

1. 当前结果是什么？
2. Preview URL 是否可打开？
3. 发布前需要用户做什么？
4. 本次改了什么？
5. 下一步主操作是什么？

首屏不应该展示：

- 内部六阶段大导航。
- 大面积 agent activity。
- 原始日志。
- terminal。

推荐信息结构：

```text
Header:
  repo / branch / run number / status / primary action

Main:
  Current result
  Required before publish
  Changed files summary
  Detail tabs

Side:
  What changed
  Production target
  Follow-up input
  Recent important events
```

### 7.3 Details Tabs

详情 tabs 包括：

- Summary。
- Changes。
- Logs。
- Events。
- Deployment。

这些是证据层，不是首屏主角。

### 7.4 Credentials / Settings

用户管理：

- GitHub connection。
- Sealos connection。
- Registry connection。
- AI gateway key, 如果需要。

凭证值永远不明文展示。

## 8. 核心状态

### 8.1 Preview Ready

主文案：

```text
Preview is ready
```

展示：

- Preview URL。
- Health check。
- Runtime。
- Image。
- Production needs confirmation。

主操作：

- Open preview。
- Publish。

### 8.2 Needs Input

主文案：

```text
Action needed before preview
```

展示：

- 需要什么信息。
- 为什么需要。
- 输入表单。

主操作：

- Save and continue。

### 8.3 Build Failed

主文案：

```text
Preview could not be created
```

展示：

- 失败原因。
- 可自动修复项。
- 需要用户判断的项。

主操作：

- Retry with fix。
- View logs。

### 8.4 Waiting For Publish

主文案：

```text
Production is ready to publish
```

展示：

- Preview 状态。
- 生产资源配置。
- 环境变量确认状态。
- 发布风险。

主操作：

- Publish production。

## 9. 功能需求

### FR1: 创建部署任务

用户选择 repo、branch 和目标后，系统创建 task。

验收：

- 未登录用户必须先登录。
- 私有 repo 需要授权。
- 创建成功后进入 task detail。
- 创建失败时展示可理解原因。

### FR2: 展示当前结果

系统必须把运行结果投影为用户可理解状态。

验收：

- 成功 preview 时 URL 明显可见。
- 失败时先展示结构化原因，再展示日志入口。
- 用户不需要理解内部 pipeline。

### FR3: 展示部署改动

系统必须展示本次为了部署改了什么。

验收：

- 文件列表清晰。
- 每个文件有修改原因。
- 完整 diff 可展开。
- 能创建 PR, 如果 V1 启用该能力。

### FR4: 处理用户输入

系统必须支持用户补充环境变量、端口、启动命令等信息。

验收：

- 输入字段有解释。
- Secret 类型输入不回显。
- 保存后任务继续运行。

### FR5: 发布生产

系统必须在 preview 成功后支持用户确认发布。

验收：

- 发布前展示资源和风险。
- 必须显式确认。
- 发布中有状态。
- 发布成功后展示正式 URL 或应用状态。

### FR6: 失败恢复

系统必须支持失败后的解释和重试。

验收：

- 失败原因结构化。
- 能区分系统错误、构建错误、缺少用户输入、部署平台错误。
- 可重试动作清楚。

## 10. 非功能需求

### 10.1 安全

- 用户只能访问自己的 task、run、events、artifacts。
- 用户可见日志必须脱敏。
- token、secret、环境变量值不能出现在 UI 日志中。
- 高风险动作必须确认。

### 10.2 可恢复

- SSE 断开后可以按 last event sequence 恢复。
- Worker 崩溃后 run 可以失败、重试或恢复。
- Executor 丢失时必须有明确状态。

### 10.3 性能

- Task detail 首屏在已有数据下 1 秒内可用。
- Event stream 不阻塞主界面。
- 长日志分页或懒加载。

### 10.4 可解释

- 每个失败状态必须有用户可理解解释。
- 每个 AI 改动必须能说明部署目的。

## 11. 成功指标

### North Star

成功创建并打开 Sealos preview 的 repo 数量。

### Activation

- 新用户完成 GitHub 连接比例。
- 新用户创建第一个 deployment task 比例。
- 第一个 task 得到 preview URL 的比例。

### Task Success

- repo 到 preview 成功率。
- preview 创建平均耗时。
- 失败后重试成功率。
- 用户补充信息后继续成功率。

### Trust

- 用户点击查看 changed files 的比例。
- 用户确认发布生产的比例。
- 用户创建 PR 的比例。

## 12. 技术约束

技术方向引用：

- [ShipRepo 彻底重构架构设计](./shiprepo-full-rewrite-architecture.zh.md)

固定约束：

- 当前 repo 内彻底重构。
- 不考虑向后兼容。
- 前端使用 Vite + React。
- 后端 API 使用 Hono。
- Worker 负责任务编排。
- Codex app-server 只作为隔离 executor 内的 coding executor。
- 不做全局共享 Codex app-server。
- Gateway 负责 Codex event projection。

## 13. 设计约束

设计方向引用：

- [ShipRepo Design Brief](./shiprepo-design-brief.zh.md)

核心约束：

- 结果优先。
- 用户语言优先。
- 内部流水线隐藏到证据层。
- Chat 不是主导航。
- Logs、events、diff 是证据层。
- 不做 AI dashboard。
- 不做 marketing hero。

