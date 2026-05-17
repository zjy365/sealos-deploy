# 云端 Sealos Deploy Agent 重构架构设计

## 1. 背景

当前 ShipRepo 是一个 Next.js 前后端一体应用。用户在 Web 页面选择 GitHub 仓库并提交任务，Next.js 后端创建 Devbox 沙盒，沙盒中内置 Codex app server 和 Sealos deploy skill，再由沙盒内的 Codex 完成分析、修复、构建和部署。

这个设计能跑通早期 demo，但产品和架构职责存在明显错位：

- 产品后端只是任务状态和网关转发层，不是真正的 AI 后端。
- 主 Agent 的生命周期绑定在 Devbox 沙盒上，沙盒销毁后 Agent 会话和执行上下文也随之消失。
- Devbox 同时承担执行环境、Codex app server、部署 skill 宿主三类职责。
- 用户以为自己在和产品里的 AI Agent 交互，但实际智能主体在一个临时沙盒内部。
- 长期任务状态、失败经验、部署策略、用户隔离和审计难以沉淀到中心产品层。

本设计将产品在当前仓库内完整重做为 Web-first 的云端 Sealos Deploy Agent：前端、后端、中心 Agent、Worker、沙盒执行环境彻底分离。重构不考虑向后兼容，旧代码只作为参考材料和可迁移资产，随时可以删除。

## 2. 产品定位

新产品不是通用 AI Coding Chat，也不是本地 IDE 的替代品。

它的定位是：

> 帮用户把 GitHub 仓库分析、修复、构建并部署成可运行的 Sealos 应用的云端 Agent 工作台。

核心用户路径：

```text
GitHub repo -> Analyze -> Fix -> Build -> Preview -> Ship -> Operate
```

产品应该回答这些问题：

- 这个仓库能不能部署到 Sealos？
- 当前缺少 Dockerfile、启动命令、端口、环境变量还是 Sealos 模板？
- 构建失败的原因是什么，能否自动修复？
- 能否生成可验证的 Sealos 预览 URL？
- 预览通过后，能否发布成正式应用？
- 上线后能否继续查看日志、调整配置、重部署和回滚？

## 3. Web 与 Electron 取舍

主产品应选择 Web，而不是 Electron。

### 3.1 Web 适合当前产品

Web 更适合作为主产品，因为本产品的关键能力都在云端：

- GitHub OAuth 登录和仓库授权。
- 多租户用户隔离。
- 中心 Agent 会话和任务状态。
- Devbox 沙盒调度。
- 镜像构建、日志收集和 artifact 保存。
- Sealos 部署、预览、资源管理。
- 任务分享、团队协作、计费和审计。

用户不应该安装一个桌面客户端才能完成云端部署。Web 能让用户从 GitHub repo 直接进入 Sealos 生命周期任务。

### 3.2 Electron 适合另一类产品

Electron 的价值在于本地权限：

- 读取本地 repo。
- 使用本机 SSH key。
- 调用本机 Docker。
- 访问本地文件系统。
- 和本地 IDE、终端、系统后台进程集成。

这更接近 Flowmote/Codeck 的产品方向：本机是执行权威，移动端或桌面端是控制面。

本产品的执行权威应该在云端中心 Agent 和 Devbox 沙盒中，因此 Electron 不应作为主线架构。未来如果需要支持本地仓库，可以增加一个 Desktop Connector，但它只是可选连接器，不是主产品形态。

## 4. 目标架构

重构后的系统分为五层：

```text
apps/web  (Vite + React)
  |
  v
apps/api  (Hono)
  |
  v
apps/agent
  |
  +--> apps/worker
  |      |
  |      +--> Devbox Sandbox
  |      +--> Build Job
  |      +--> Artifact Storage
  |
  +--> GitHub Adapter
  +--> Sealos Adapter
  +--> Registry Adapter
```

更完整的数据流：

```text
User Browser
  |
  | HTTPS / SSE / WebSocket
  v
Web Frontend
  |
  | REST / RPC
  v
Product API
  |        \
  |         -> Postgres
  |         -> Redis / Queue
  |         -> Object Storage
  v
Central Agent
  |
  +-> Sandbox Manager -> Devbox
  +-> Job Worker      -> build / test / push image
  +-> Sealos Adapter  -> preview / deploy / logs / rollback
  +-> GitHub Adapter  -> clone / diff / commit / PR
```

## 5. 核心原则

### 5.1 中心 Agent 是脑子

中心 Agent 负责理解用户问题、规划任务、调用工具、解释失败、决定下一步。

它拥有：

- 用户会话。
- 任务上下文。
- 仓库分析结果。
- 失败历史。
- 部署策略。
- 工具调用记录。
- 后续追问和操作状态。

Agent 生命周期必须长于沙盒生命周期。

### 5.2 Devbox 是手

Devbox 只是临时执行环境，负责执行中心 Agent 派发的动作：

- clone repo。
- checkout branch。
- read/write files。
- run install/build/test commands。
- build image。
- 收集日志和文件产物。

Devbox 不再承载主 Agent，也不再内置主 Codex app server。

### 5.3 后端是产品控制面

API 后端负责产品级能力：

- auth。
- 用户、项目、仓库、任务管理。
- 权限校验。
- 多租户隔离。
- 任务状态机。
- 事件流。
- credential 管理。
- quota 和计费。
- audit log。

前端不能直接访问 Devbox token、Sealos token、Codex app server 或内部 worker。

### 5.4 所有状态中心化

所有用户可见状态都写入中心数据库或对象存储：

- chat messages。
- agent events。
- run events。
- sandbox lifecycle。
- job logs。
- build artifacts。
- deployment records。
- PR 和 commit 信息。

沙盒可以销毁，但任务状态不能丢。

## 6. 服务拆分

### 6.1 apps/web

纯前端应用。

职责：

- 登录和项目入口。
- 选择 GitHub repo。
- 创建部署任务。
- 展示 Agent 对话。
- 展示分析结果、日志、构建状态、文件 diff。
- 展示预览 URL 和部署状态。
- 发起用户确认、重试、发布、回滚等操作。

它只调用 `apps/api`，不直接调用 Agent、Worker 或 Devbox。

### 6.2 apps/api

产品 API 和控制面。

职责：

- 用户认证和 session。
- GitHub OAuth 绑定。
- 项目和仓库管理。
- task/run/deployment 查询与创建。
- SSE 或 WebSocket 事件订阅。
- credential 加密存储。
- 权限和配额检查。
- 调用 Agent 创建或继续任务。

API 是所有外部请求的唯一入口。

### 6.3 apps/agent

中心 Agent 服务。

职责：

- 管理 Agent session。
- 接收用户任务和 follow-up。
- 生成任务计划。
- 调用 GitHub、Sandbox、Job、Sealos 工具。
- 将过程事件写入中心事件表。
- 根据失败日志解释原因并决定下一步。
- 产出用户可读的结论、修复建议、部署结果。

Codex app server 如果可用，可以作为 Agent 内部引擎，但不应直接暴露给前端。

### 6.4 apps/worker

后台执行器。

职责：

- 消费 queue 中的长任务。
- 创建和销毁 Devbox。
- 在 Devbox 内执行命令。
- 构建镜像并推送 registry。
- 收集 stdout/stderr。
- 上传 artifact。
- 调用 Sealos 部署。
- 将执行结果写回数据库。

Worker 不负责理解用户意图，只执行中心 Agent 已经决定的 job。

### 6.5 packages/protocol

前后端共享协议和类型。

包含：

- API request/response schema。
- Task、Run、Event、Message、Artifact、Deployment 类型。
- Agent tool call event 类型。
- 错误码和状态枚举。

### 6.6 packages/sandbox

Devbox 适配层。

对上提供稳定接口：

- `createSandbox`
- `destroySandbox`
- `execCommand`
- `readFile`
- `writeFile`
- `uploadArtifact`
- `getSandboxStatus`

对下隐藏 Devbox API、命名、token、namespace、lease、超时、重试等细节。

### 6.7 packages/sealos

Sealos 适配层。

能力：

- 创建预览部署。
- 创建正式部署。
- 查询部署状态。
- 获取日志。
- 管理环境变量。
- 绑定域名。
- 回滚版本。
- 生成或提交 Sealos template。

### 6.8 packages/github

GitHub 适配层。

能力：

- 获取用户仓库。
- clone URL 和 scoped token 生成。
- 分支和 commit 查询。
- 创建 commit。
- 创建和更新 PR。
- 读取 checks。

### 6.9 packages/registry

镜像仓库适配层。

能力：

- 生成 image tag。
- 推送镜像。
- 查询镜像 manifest。
- 清理过期临时镜像。

## 7. 核心数据模型

### 7.1 users

用户基础信息。

关键字段：

- `id`
- `provider`
- `externalId`
- `email`
- `name`
- `createdAt`
- `updatedAt`

### 7.2 projects

用户在产品中的项目。

关键字段：

- `id`
- `userId`
- `name`
- `defaultRepositoryId`
- `createdAt`
- `updatedAt`

### 7.3 repositories

GitHub 仓库绑定记录。

关键字段：

- `id`
- `userId`
- `provider`
- `owner`
- `repo`
- `defaultBranch`
- `cloneUrl`
- `installationId`
- `createdAt`

### 7.4 tasks

用户意图层对象。

任务表达用户想解决的问题，不直接承载所有执行细节。

关键字段：

- `id`
- `userId`
- `projectId`
- `repositoryId`
- `title`
- `prompt`
- `status`
- `currentRunId`
- `createdAt`
- `updatedAt`

### 7.5 agent_sessions

中心 Agent 会话。

关键字段：

- `id`
- `taskId`
- `userId`
- `model`
- `status`
- `lastMessageAt`
- `createdAt`

### 7.6 messages

用户和 Agent 的对话消息。

关键字段：

- `id`
- `taskId`
- `sessionId`
- `role`
- `content`
- `createdAt`

### 7.7 runs

一次 Agent 执行轮次。

关键字段：

- `id`
- `taskId`
- `sessionId`
- `status`
- `goal`
- `startedAt`
- `completedAt`
- `error`

### 7.8 run_events

执行事件流。

关键字段：

- `id`
- `runId`
- `taskId`
- `seq`
- `kind`
- `payload`
- `createdAt`

事件类型包括：

- `agent.plan.created`
- `tool.call.started`
- `tool.call.completed`
- `sandbox.created`
- `sandbox.command.started`
- `sandbox.command.output`
- `sandbox.command.completed`
- `build.started`
- `build.completed`
- `deployment.preview.created`
- `deployment.failed`
- `deployment.completed`

### 7.9 sandboxes

Devbox 沙盒记录。

关键字段：

- `id`
- `taskId`
- `runId`
- `provider`
- `providerSandboxId`
- `namespace`
- `status`
- `workspacePath`
- `createdAt`
- `expiresAt`
- `destroyedAt`

### 7.10 jobs

后台长任务。

关键字段：

- `id`
- `runId`
- `type`
- `status`
- `workerId`
- `attempt`
- `startedAt`
- `completedAt`
- `error`

### 7.11 artifacts

构建或执行产物。

关键字段：

- `id`
- `taskId`
- `runId`
- `type`
- `storageKey`
- `size`
- `metadata`
- `createdAt`

### 7.12 deployments

Sealos 部署记录。

关键字段：

- `id`
- `taskId`
- `runId`
- `environment`
- `status`
- `appName`
- `image`
- `url`
- `resourceSpec`
- `createdAt`
- `updatedAt`

### 7.13 credentials

加密凭证。

关键字段：

- `id`
- `userId`
- `scope`
- `provider`
- `encryptedValue`
- `expiresAt`
- `createdAt`

凭证只能由 API/Agent/Worker 在授权路径中读取，前端不能直接访问。

## 8. 核心流程

### 8.1 创建任务

```text
Web -> API -> DB -> Agent
```

步骤：

1. 用户选择 GitHub repo 和分支。
2. 用户输入目标，例如“帮我部署到 Sealos”。
3. Web 调用 API 创建 task。
4. API 校验用户、仓库权限和 quota。
5. API 创建 task、agent_session、初始 message。
6. API 请求 Agent 开始第一轮 run。
7. Web 订阅 task event stream。

### 8.2 Agent 规划

```text
Agent -> GitHub Adapter -> Sandbox Manager -> DB events
```

步骤：

1. Agent 读取 task、repo、用户目标。
2. Agent 判断需要创建沙盒。
3. Agent 生成执行计划。
4. Agent 写入 `agent.plan.created` 事件。
5. Agent 调用 Sandbox Manager 创建 Devbox。

### 8.3 沙盒准备

```text
Worker -> Devbox -> GitHub
```

步骤：

1. Worker 创建 Devbox。
2. Worker 注入最小权限的 scoped token。
3. Worker clone repo。
4. Worker checkout 目标分支。
5. Worker 上报 workspace ready。

### 8.4 Analyze

步骤：

1. Agent 调用 sandbox 工具读取关键文件。
2. Worker 执行安全的探测命令，例如列目录、读取 package/config、检测 Dockerfile。
3. Agent 生成结构化分析结果。
4. 写入分析事件和用户可读消息。

分析输出应包含：

- 技术栈。
- 包管理器。
- 构建命令。
- 启动命令。
- 端口。
- Dockerfile 状态。
- Sealos 配置状态。
- 环境变量需求。
- 外部依赖。
- 是否可直接构建。

### 8.5 Fix

步骤：

1. Agent 根据分析结果决定修复范围。
2. 通过 sandbox 写入或修改文件。
3. 运行格式化、构建或最小验证命令。
4. 记录 diff。
5. 如需用户信息，暂停并向用户提问。

Fix 的原则：

- 只改部署相关内容。
- 不做无关重构。
- 不隐藏失败。
- 每次修改都可生成 diff 或 PR。

### 8.6 Build

步骤：

1. Worker 执行构建命令或 Docker build。
2. 将日志写入 run_events。
3. 构建成功后推送镜像。
4. 写入 artifact 和 image metadata。

### 8.7 Preview

步骤：

1. Agent 调用 Sealos Adapter 创建预览部署。
2. Sealos Adapter 返回 URL 和资源状态。
3. API 将 deployment 记录写入数据库。
4. Web 展示 preview URL、日志、状态和确认按钮。

### 8.8 Ship

步骤：

1. 用户确认预览可用。
2. Agent 将 preview 配置转为正式部署。
3. Sealos Adapter 创建或更新正式应用。
4. 记录正式 deployment。
5. 可选：创建 GitHub PR 保存部署文件变更。

### 8.9 Operate

后续能力：

- 查看日志。
- 解释报错。
- 修改环境变量。
- 重启应用。
- 重部署。
- 回滚。
- 绑定域名。
- 调整资源。
- 创建数据库、Redis、对象存储绑定。

Operate 仍然由中心 Agent 规划，由 Worker 和 Adapter 执行。

## 9. 多租户隔离

隔离必须在 API、Agent、Worker 三层同时成立。

### 9.1 API 层

- 所有资源查询必须带 `userId` 或 project membership。
- 前端只能访问当前用户有权访问的 task、run、artifact、deployment。
- 所有写操作必须检查 task ownership。

### 9.2 Agent 层

- 每个 Agent session 绑定 `userId`、`taskId`、`repositoryId`。
- Agent 工具调用必须携带 scoped context。
- Agent 不能跨任务读取 message、event、artifact。

### 9.3 Worker 层

- 每个 job 只能拿到当前 task 的临时凭证。
- Devbox token、GitHub token、registry token 都必须是短期或 scoped。
- 沙盒销毁后 token 应失效或被撤销。

### 9.4 Storage 层

- artifact storage key 应包含 user/task/run 前缀。
- 下载 artifact 必须通过 API 签发短期 URL。
- 不允许前端直接拼 object storage 地址。

## 10. 安全和日志

### 10.1 日志原则

用户可见日志必须避免敏感信息：

- 不输出 token。
- 不输出完整私有 repo URL。
- 不输出用户密钥。
- 不输出原始环境变量值。
- 不输出包含 secret 的构建命令。

日志应分两类：

- user-facing events：给用户看，经过脱敏。
- internal diagnostics：内部排障，权限受控，仍需脱敏。

### 10.2 凭证管理

所有凭证加密存储：

- GitHub OAuth token。
- Sealos token。
- Devbox token。
- registry credential。
- AI gateway key。

Worker 获取凭证时应按 job scope 解密，执行完成后不持久保存明文。

### 10.3 沙盒权限

Devbox 内只注入任务所需凭证：

- 当前 repo 的 clone 权限。
- 当前 image tag 的 push 权限。
- 当前部署环境的 Sealos 操作权限。

禁止注入全局管理员 token。

## 11. 队列和恢复

系统需要队列，因为构建、部署、日志收集都是长任务。

推荐状态流：

```text
queued -> running -> waiting_for_user -> completed
                    -> failed
                    -> cancelled
```

恢复策略：

- Worker 崩溃：job 保持 running 超时后重试或标记 failed。
- Devbox 丢失：sandbox 标记 lost，Agent 判断是否重建。
- 构建失败：保存日志，Agent 解释失败并给下一步。
- Sealos 部署失败：保存平台错误、部署配置和建议。
- 用户中断：取消 run，清理活动 sandbox 和 job。

## 12. Agent 工具接口

中心 Agent 不应该直接散乱调用底层服务，而是通过受控工具。

建议工具：

### 12.1 Repository tools

- `getRepositoryInfo`
- `listRepositoryFiles`
- `createPullRequest`
- `commitChanges`

### 12.2 Sandbox tools

- `createSandbox`
- `destroySandbox`
- `execCommand`
- `readFile`
- `writeFile`
- `listFiles`

### 12.3 Build tools

- `detectBuildPlan`
- `buildImage`
- `pushImage`
- `collectBuildLogs`

### 12.4 Sealos tools

- `createPreviewDeployment`
- `promotePreviewToProduction`
- `getDeploymentStatus`
- `getDeploymentLogs`
- `updateEnvironmentVariables`
- `rollbackDeployment`

每个工具调用都必须产生 event，便于前端展示和后端审计。

## 13. API 设计

### 13.1 Task

- `POST /tasks`
- `GET /tasks`
- `GET /tasks/:taskId`
- `POST /tasks/:taskId/messages`
- `POST /tasks/:taskId/cancel`

### 13.2 Events

- `GET /tasks/:taskId/events`
- `GET /tasks/:taskId/events/stream`

### 13.3 Runs

- `GET /tasks/:taskId/runs`
- `GET /runs/:runId`
- `POST /runs/:runId/retry`

### 13.4 Deployments

- `GET /tasks/:taskId/deployments`
- `POST /deployments/:deploymentId/promote`
- `POST /deployments/:deploymentId/rollback`
- `GET /deployments/:deploymentId/logs`

### 13.5 Artifacts

- `GET /tasks/:taskId/artifacts`
- `GET /artifacts/:artifactId/download-url`

## 14. 前端信息架构

Web 应围绕任务工作台设计，而不是普通聊天框。

主要页面：

- Repository picker。
- Task workspace。
- Run timeline。
- Logs panel。
- File diff panel。
- Preview panel。
- Deployment panel。
- Settings / credentials。

Task workspace 推荐布局：

```text
+--------------------------------------------------+
| Header: repo / branch / task status              |
+---------------------+----------------------------+
| Agent conversation  | Lifecycle panel            |
|                     | - Analyze result           |
|                     | - Build status             |
|                     | - Preview URL              |
|                     | - Deployment actions       |
+---------------------+----------------------------+
| Logs / Diff / Artifacts tabs                     |
+--------------------------------------------------+
```

聊天不是唯一主界面。用户真正关心的是部署生命周期是否推进、失败在哪里、结果能不能打开。

## 15. 迁移策略

这是完整重构，不是最小改造，但仍可以分阶段交付。

### Phase 1: 新骨架

- 建立 `apps/web`、`apps/api`、`apps/agent`、`apps/worker`。
- 建立 `packages/protocol`。
- 建立新数据库 schema。
- 跑通创建 task 和事件流。

### Phase 2: 中心 Agent

- 接入中心 Agent session。
- 实现 message/run/event。
- Agent 能生成计划并调用 mock tools。

### Phase 3: Devbox 工具化

- 实现 Sandbox Adapter。
- Worker 创建 Devbox。
- Worker clone repo。
- Worker 执行命令并回传日志。

### Phase 4: Analyze/Fix/Build

- 实现仓库分析。
- 实现文件修改和 diff。
- 实现 Docker build 或构建 job。
- 实现镜像推送。

### Phase 5: Sealos Preview/Ship

- 实现 Sealos Adapter。
- 创建预览部署。
- 预览转正式部署。
- 展示部署状态和 URL。

### Phase 6: Operate

- 日志查看。
- env 修改。
- redeploy。
- rollback。
- 域名和资源配置。

## 16. 验证计划

### 16.1 Happy path

- 用户登录。
- 选择 GitHub repo。
- 创建任务。
- Agent 创建 sandbox。
- sandbox clone repo。
- Agent 分析技术栈。
- Worker 构建镜像。
- Sealos 创建 preview。
- 用户打开 preview URL。
- 用户确认发布。

### 16.2 失败路径

- GitHub 权限不足。
- clone 失败。
- package install 失败。
- build 失败。
- Dockerfile 不存在。
- image push 失败。
- Sealos 部署失败。
- 用户中途取消。

### 16.3 隔离路径

- 用户 A 不能访问用户 B 的 task。
- 用户 A 不能订阅用户 B 的 event stream。
- 用户 A 不能下载用户 B 的 artifact。
- Worker 不能拿到不属于当前 job 的 token。

### 16.4 恢复路径

- Worker 进程崩溃。
- Devbox 被外部删除。
- 队列消息重复投递。
- Agent run 超时。
- event stream 断线重连。

## 17. 回滚策略

因为这是新产品架构，推荐与旧系统并行开发，而不是原地替换。

策略：

- 旧系统保留为 `legacy`。
- 新系统使用新 schema 和新服务。
- 用户级灰度切换入口。
- 新系统失败时，用户可以回到旧 ShipRepo 任务入口。
- 不迁移旧任务执行状态，只迁移用户、仓库授权和必要配置。

## 18. 主要风险

### 18.1 Codex app server 多租户能力不足

如果 Codex app server 不适合中心化多租户托管，则不能裸用它作为产品后端。

应对方式：

- `apps/agent` 做自有 Orchestrator。
- Codex app server 只是内部模型/执行引擎。
- session、权限、工具调用、事件写入都由 Orchestrator 控制。

### 18.2 长任务成本失控

Devbox 和构建任务可能消耗大量资源。

应对方式：

- task quota。
- sandbox TTL。
- job timeout。
- idle cleanup。
- per-user cost tracking。

### 18.3 Agent 误操作

Agent 可能执行过宽的修改或部署动作。

应对方式：

- 工具权限最小化。
- 高风险操作需要用户确认。
- 所有文件修改生成 diff。
- 正式发布必须显式确认。

### 18.4 平台错误难解释

Sealos、registry、GitHub、Devbox 任一环节失败都可能影响体验。

应对方式：

- 每个 Adapter 统一错误模型。
- 保留原始错误摘要。
- Agent 生成用户可读解释。
- 提供重试和人工补充信息路径。

## 19. 不做什么

本次重构不做：

- Electron 主产品。
- 本地 IDE 替代品。
- 通用 AI coding console。
- 每个 Devbox 内置主 Codex app server。
- 前端直连 Agent runtime。
- 前端直连 Devbox、Sealos、registry 凭证。
- 沙盒内长期保存用户状态。

## 20. 最终结论

新架构的核心是把职责摆正：

- Web 是用户入口。
- API 是产品控制面。
- 中心 Agent 是脑子。
- Worker 是执行调度。
- Devbox 是临时执行环境。
- Sealos 是目标运行平台。

这会让产品从“一个网页触发一个沙盒里的 Codex”升级为“一个真正有中心智能、中心状态和中心运维能力的云端 Sealos Deploy Agent”。
