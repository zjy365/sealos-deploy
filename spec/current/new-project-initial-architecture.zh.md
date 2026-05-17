# ShipRepo 当前仓库内重构初始架构设计

## 1. 目标

这个文档描述 ShipRepo 在当前仓库内彻底重构后的新产品架构。它不是渐进式兼容重构，也不是新建空仓库。旧代码只作为参考材料和可迁移资产，随时可以删除。

新产品目标是：

> 做一个 Web-first 的云端 Sealos Deploy Agent。用户选择 GitHub 仓库并描述目标后，中心 Agent 负责分析、修复、构建镜像、创建 Sealos 预览、发布正式部署，并承接后续运维动作。

核心判断：

- 主产品做 Web，不做 Electron 主产品。
- 前后端彻底分离。
- 中心 Agent 是产品的智能后端。
- V1 选择 Codex app-server 作为 coding executor，不自研替代型 coding agent。
- Devbox 是临时执行环境，可以运行 Codex executor，但不承载主 Agent 和产品控制面。
- 所有用户状态、任务状态、事件、日志、产物和部署记录都中心化保存。

## 2. 产品边界

### 2.1 要做什么

产品主线：

```text
GitHub repo -> Analyze -> Fix -> Build -> Preview -> Ship -> Operate
```

用户可以：

- 登录并连接 GitHub。
- 选择 repo 和 branch。
- 创建一个部署任务。
- 让 Agent 分析项目能否部署到 Sealos。
- 让 Agent 自动修复部署阻塞。
- 查看构建日志、文件 diff、部署事件。
- 获得 Sealos preview URL。
- 确认 preview 后发布正式应用。
- 上线后继续查看日志、修改配置、重部署和回滚。

### 2.2 不做什么

新项目第一阶段不做：

- Electron 主产品。
- 本地 IDE 替代品。
- 通用 AI Coding Chat。
- 每个 Devbox 内置主产品后端或主 Agent。
- 前端直接访问 Agent runtime。
- 前端直接访问 Devbox、Sealos、registry、GitHub 明文凭证。
- 多 Agent marketplace。
- 复杂团队协作和组织权限。

## 3. 推荐技术栈

为了快速重做且保持工程一致性，使用 TypeScript monorepo。

### 3.1 Monorepo

- 包管理器：`pnpm`
- workspace：`pnpm-workspace.yaml`
- 语言：TypeScript
- 代码规范：ESLint + Prettier
- 共享类型：Zod schema + TypeScript types

### 3.2 前端

- `apps/web`
- Vite + React
- Tailwind CSS
- shadcn/ui
- TanStack Query
- SSE 或 WebSocket 用于任务事件流

前端固定使用 Vite + React。因为后端会独立拆出，Next.js 的 App Router 后端能力不再是主要价值。

### 3.3 后端 API

- `apps/api`
- Node.js + Hono
- OpenAPI 或 RPC-style typed client
- Zod request/response validation
- PostgreSQL + Drizzle ORM
- Redis + BullMQ 或同类队列

后端固定使用 Hono。Hono 适合做轻量 API 控制面，部署简单，也方便以后拆成独立服务。

### 3.4 Agent

- `apps/agent`
- Node.js + TypeScript
- 中心 Agent Orchestrator
- Codex app-server 作为 V1 coding executor
- gateway 作为 app-server 的 HTTP/SSE/session 包装层
- Agent 工具通过 typed interface 调用

### 3.4.1 Coding Executor 决策

V1 明确选择 Codex app-server 作为 coding executor。原因不是 transport 更方便，而是它已经包含 Codex 在代码仓库理解、文件分析、命令执行、patch、技能调用和上下文处理上的产品化能力。ShipRepo 不应该在 V1 重新实现一套 coding agent。

边界如下：

- ShipRepo 自己实现 control plane、Agent Orchestrator、权限、任务状态、事件存储、凭证管理和部署编排。
- Codex app-server 只负责 repo 内的软件工程执行：分析项目、使用 skills、生成或修复 Dockerfile、生成 Sealos template、运行命令、产出 diff 和诊断。
- Devbox 可以运行 Codex app-server 或承载包了一层的 gateway，但它不是 ShipRepo 的后端，也不是多租户控制面。
- GitHub token、registry token、Sealos token 不长期放进 Devbox；commit、PR、push image、deploy 这类高权限动作优先由 control plane adapter 或 worker 执行。
- OpenAI Agents SDK、Pi、CC 源码和其他开源框架只作为后续 benchmark 候选，不进入 V1 主链路。

### 3.4.2 app-server 接入方式

`codex app-server` 本身支持 `stdio://`、`unix://` 和 `ws://IP:PORT`。这说明它可以直接通过 WebSocket 对接，但 ShipRepo V1 不建议让产品后端或浏览器直接裸连 app-server。

推荐接入方式：

```text
Web
  -> ShipRepo API / Agent Orchestrator
  -> Codex Gateway
  -> codex app-server
  -> repo workspace / shell / skills
```

保留 gateway 的原因：

- app-server 是底层 protocol runtime，不是多租户产品 API。
- ShipRepo 需要 task/session/thread 映射、TTL、事件归一化、SSE 输出、鉴权、限流和审计。
- WebSocket 只解决传输问题，不解决多 session 生命周期、事件持久化、用户隔离、恢复和资源清理。
- 当前 `codex-gateway` 已经验证了 `session -> turn -> events` 模型，更贴近 Web 产品需要。

因此，V1 采用 `gateway + app-server`。后续只有在 app-server 的官方 WebSocket 协议足够稳定，并且我们已经能完整覆盖 session 管理、鉴权、事件投影和恢复后，才考虑去掉 gateway。

### 3.5 Worker

- `apps/worker`
- Node.js + TypeScript
- 消费队列任务
- 调用 Devbox、registry、Sealos、GitHub adapter
- 写入 run events 和 artifacts

### 3.6 存储

- PostgreSQL：业务状态、任务、事件索引、部署记录。
- Redis：队列、短期锁、stream fanout。
- Object Storage：长日志、构建产物、artifact、截图。

## 4. 新项目目录结构

建议目录：

```text
sealos-agent/
  apps/
    web/
    api/
    agent/
    worker/
  packages/
    protocol/
    db/
    auth/
    agent-core/
    sandbox/
    sealos/
    github/
    registry/
    events/
    config/
    logger/
    ui/
  spec/
  docs/
  scripts/
  docker/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  eslint.config.mjs
  prettier.config.mjs
```

### 4.1 apps/web

只负责用户界面：

- 登录页。
- repo picker。
- task workspace。
- run timeline。
- chat panel。
- logs panel。
- file diff panel。
- preview/deployment panel。
- credential/settings 页面。

### 4.2 apps/api

产品控制面：

- auth/session。
- user/project/repository/task CRUD。
- message API。
- event stream API。
- deployment API。
- artifact download URL。
- credential 管理。
- quota 和 rate limit。

### 4.3 apps/agent

中心 Agent 服务：

- 创建和恢复 Agent session。
- 读取 task context。
- 生成执行计划。
- 调用工具。
- 记录 agent events。
- 生成用户可读回复。

### 4.4 apps/worker

后台执行：

- 创建 Devbox。
- clone repo。
- 执行命令。
- 构建镜像。
- 推送镜像。
- 调用 Sealos 部署。
- 上传日志和 artifact。

### 4.5 packages/protocol

所有跨服务共享协议：

- `Task`
- `Run`
- `Message`
- `RunEvent`
- `Sandbox`
- `Job`
- `Artifact`
- `Deployment`
- API schemas
- event schemas
- error codes

### 4.6 packages/db

数据库 schema 和 query helpers：

- Drizzle schema。
- migrations。
- transaction helpers。
- repository functions。

### 4.7 packages/agent-core

Agent 抽象：

- Agent session。
- plan/run loop。
- tool registry。
- tool permission check。
- model adapter。

### 4.8 packages/sandbox

Devbox 适配器：

- create。
- destroy。
- exec。
- read file。
- write file。
- upload artifact。
- health check。

### 4.9 packages/sealos

Sealos 适配器：

- create preview。
- promote to production。
- query deployment。
- logs。
- env update。
- restart。
- rollback。

### 4.10 packages/events

事件模型和投影：

- append event。
- list events。
- stream events。
- project run status。
- project chat messages。
- project timeline。

## 5. 服务关系

```text
Browser
  |
  v
apps/web
  |
  v
apps/api
  |-----------------> PostgreSQL
  |-----------------> Redis / Queue
  |-----------------> Object Storage
  |
  v
apps/agent
  |
  +-----------------> packages/github
  +-----------------> packages/sandbox -> Devbox
  +-----------------> packages/sealos
  +-----------------> packages/registry
  |
  v
apps/worker
```

数据流方向必须单向：

- Web 只调 API。
- API 调 Agent 或写数据库。
- Agent 调工具，不直接暴露给 Web。
- Worker 执行长任务，不处理用户 HTTP 请求。
- Devbox 不主动成为产品后端。

避免形成这样的循环：

```text
Web -> Devbox appserver -> API -> Devbox
```

这个循环就是当前旧架构的问题来源之一。

## 6. 核心对象模型

### 6.1 Task

用户意图。

字段：

- `id`
- `userId`
- `projectId`
- `repositoryId`
- `title`
- `initialPrompt`
- `status`
- `currentRunId`
- `createdAt`
- `updatedAt`

Task 不保存所有运行细节。运行细节放到 run、job、sandbox、deployment。

### 6.2 AgentSession

中心 Agent 会话。

字段：

- `id`
- `taskId`
- `userId`
- `model`
- `status`
- `createdAt`
- `lastMessageAt`

### 6.3 Message

用户和 Agent 的消息。

字段：

- `id`
- `taskId`
- `sessionId`
- `role`
- `content`
- `createdAt`

### 6.4 Run

一次 Agent 执行轮次。

字段：

- `id`
- `taskId`
- `sessionId`
- `status`
- `goal`
- `startedAt`
- `completedAt`
- `error`

### 6.5 RunEvent

执行事件。

字段：

- `id`
- `runId`
- `taskId`
- `seq`
- `kind`
- `payload`
- `createdAt`

事件是前端 timeline、日志、activity 和恢复机制的基础。

### 6.6 Sandbox

临时 Devbox 执行环境。

字段：

- `id`
- `runId`
- `taskId`
- `provider`
- `providerSandboxId`
- `namespace`
- `status`
- `createdAt`
- `expiresAt`
- `destroyedAt`

### 6.7 Job

Worker 执行单元。

字段：

- `id`
- `runId`
- `type`
- `status`
- `attempt`
- `workerId`
- `startedAt`
- `completedAt`
- `error`

### 6.8 Deployment

Sealos 应用部署记录。

字段：

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

## 7. Agent 能力设计

中心 Agent 不直接拥有无限能力。它只能调用经过注册和授权的工具。

### 7.1 Repository tools

- `getRepositoryInfo`
- `listRepositoryFiles`
- `readRepositoryFile`
- `createCommit`
- `createPullRequest`

### 7.2 Sandbox tools

- `createSandbox`
- `destroySandbox`
- `execCommand`
- `readFile`
- `writeFile`
- `listFiles`

### 7.3 Build tools

- `detectBuildPlan`
- `installDependencies`
- `runBuild`
- `buildImage`
- `pushImage`

### 7.4 Sealos tools

- `createPreviewDeployment`
- `getDeploymentStatus`
- `getDeploymentLogs`
- `promotePreview`
- `updateEnv`
- `rollbackDeployment`

### 7.5 Artifact tools

- `uploadArtifact`
- `createDownloadUrl`
- `recordDiff`

每次 tool call 都必须写入 `RunEvent`：

```text
tool.call.started
tool.call.completed
tool.call.failed
```

## 8. 任务状态机

Task 状态：

```text
draft
queued
running
waiting_for_user
preview_ready
deployed
failed
cancelled
archived
```

Run 状态：

```text
queued
running
waiting_for_user
completed
failed
cancelled
```

Job 状态：

```text
queued
running
retrying
completed
failed
cancelled
```

状态转换只能通过 domain functions 完成，不能在 route 或 worker 中随手 update。

## 9. API 初始设计

### 9.1 Auth

- `GET /auth/session`
- `POST /auth/signout`
- `GET /auth/github/start`
- `GET /auth/github/callback`

### 9.2 Repository

- `GET /repositories`
- `POST /repositories/import`
- `GET /repositories/:repositoryId`

### 9.3 Task

- `POST /tasks`
- `GET /tasks`
- `GET /tasks/:taskId`
- `POST /tasks/:taskId/messages`
- `POST /tasks/:taskId/cancel`

### 9.4 Event

- `GET /tasks/:taskId/events`
- `GET /tasks/:taskId/events/stream`

### 9.5 Run

- `GET /tasks/:taskId/runs`
- `GET /runs/:runId`
- `POST /runs/:runId/retry`

### 9.6 Deployment

- `GET /tasks/:taskId/deployments`
- `GET /deployments/:deploymentId`
- `POST /deployments/:deploymentId/promote`
- `POST /deployments/:deploymentId/rollback`
- `GET /deployments/:deploymentId/logs`

### 9.7 Artifact

- `GET /tasks/:taskId/artifacts`
- `GET /artifacts/:artifactId/download-url`

## 10. Web 初始页面设计

### 10.1 页面

- `/login`
- `/repos`
- `/repos/:owner/:repo`
- `/tasks`
- `/tasks/:taskId`
- `/settings`

### 10.2 Task workspace

```text
+--------------------------------------------------------+
| Repo / Branch / Task Status / Primary Action           |
+----------------------------+---------------------------+
| Agent Conversation         | Lifecycle Summary         |
|                            | - Analyze                 |
|                            | - Fix                     |
|                            | - Build                   |
|                            | - Preview                 |
|                            | - Ship                    |
+----------------------------+---------------------------+
| Tabs: Timeline / Logs / Diff / Artifacts / Deployment |
+--------------------------------------------------------+
```

聊天是入口，但不是唯一主体。用户最终要看到的是部署生命周期是否完成。

## 11. 配置和环境变量

初始环境变量：

```text
DATABASE_URL
REDIS_URL
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_ACCESS_KEY
OBJECT_STORAGE_SECRET_KEY
OBJECT_STORAGE_BUCKET

GITHUB_CLIENT_ID
GITHUB_CLIENT_SECRET
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY

SEALOS_HOST
SEALOS_API_TOKEN

DEVBOX_TOKEN
DEVBOX_NAMESPACE
DEVBOX_RUNTIME_IMAGE

REGISTRY_URL
REGISTRY_USERNAME
REGISTRY_PASSWORD

AI_GATEWAY_API_KEY
AI_GATEWAY_BASE_URL

ENCRYPTION_KEY
SESSION_SECRET
```

注意：

- 前端只能使用 `PUBLIC_` 前缀变量。
- 所有 token 只能在 API、Agent、Worker 中读取。
- Worker 不应长期保存明文凭证。

## 12. 安全原则

- 所有用户资源查询必须带 owner check。
- 所有 artifact 下载必须由 API 签发短期 URL。
- 所有 tool call 必须带 task scoped context。
- 所有用户可见日志必须脱敏。
- 生产发布、回滚、删除资源必须要求用户确认。
- Devbox 注入的 token 必须最小权限。

## 13. 队列和并发

需要队列，不建议所有长任务都由 HTTP request 持有。

推荐队列：

- `agent-runs`
- `sandbox-jobs`
- `build-jobs`
- `deployment-jobs`
- `cleanup-jobs`

并发控制：

- 每个用户最大 active run 数。
- 每个 task 同时只允许一个 active run。
- 每个 sandbox 同时只允许一个 mutating command。
- 构建 job 有全局并发上限。

## 14. 恢复和清理

### 14.1 恢复

- Worker 崩溃：job 超时后重新入队。
- Agent 崩溃：run 保持 running，恢复后根据 event 继续或标记失败。
- Devbox 丢失：sandbox 标记 lost，Agent 决定重建。
- Event stream 断开：前端重新从 last seq 拉取。

### 14.2 清理

- sandbox TTL 到期自动销毁。
- failed run 的 sandbox 保留短时间用于排查。
- preview deployment 可设置过期时间。
- 临时镜像定期清理。
- 大日志转存 object storage。

## 15. 从旧项目可复用的资产

虽然是在当前仓库内重构，但旧代码只作为素材库和迁移参考，不承担兼容约束。

可复用：

- GitHub OAuth 经验。
- Devbox client 调用经验。
- Sealos config 推导逻辑。
- Devbox 内运行 Codex executor 的经验。
- `codex-gateway` 的 session、turn、events、SSE、TTL 和 app-server bridge 设计。
- task event 和 chat projection 经验。
- 部分 UI 设计和 shadcn 组件。
- logging 脱敏规则。

不建议复用：

- 当前 `tasks` 大表。
- 直接复用 `lib/codex-gateway` 作为新项目主链路代码。
- Devbox 承载主 Agent 或产品后端的执行模型。
- Next.js route handler 承担所有后端逻辑的结构。

## 16. 第一阶段交付目标

第一阶段不是完整部署闭环，而是建立新架构骨架。

必须完成：

- 新 monorepo 初始化。
- `apps/web` 能登录并创建 task。
- `apps/api` 能持久化 task/message/event。
- `apps/agent` 能接收 task 并写入 plan event。
- `apps/worker` 能消费一个 mock job。
- Web 能展示 task timeline 和 agent message。
- 基础 owner check。
- 基础 event stream。

第一阶段不要求：

- 真实 Devbox 创建。
- 真实 Docker build。
- 真实 Sealos deployment。
- PR 创建。

## 17. 第二阶段交付目标

接入真实执行环境：

- Devbox sandbox create/destroy。
- repo clone。
- exec command。
- logs streaming。
- file diff。
- basic Analyze。

第二阶段完成后，产品应能回答：

> 这个 repo 是什么技术栈，能不能构建，缺什么部署文件。

## 18. 第三阶段交付目标

跑通部署闭环：

- 自动生成或修复 Dockerfile。
- build image。
- push image。
- create Sealos preview。
- preview URL 展示。
- 用户确认后 promote。

第三阶段完成后，产品应能完成最小可用的 repo-to-Sealos 路径。

## 19. 测试计划

### 19.1 单元测试

- protocol schema。
- task state transitions。
- event projection。
- tool permission check。
- adapter error normalization。

### 19.2 集成测试

- API auth owner check。
- task create -> event stream。
- agent run -> worker job。
- sandbox create -> exec -> cleanup。
- deployment create -> status polling。

### 19.3 手动验收

- 新用户登录。
- 导入 GitHub repo。
- 创建 task。
- 查看 Agent plan。
- 查看 timeline。
- 取消 run。
- 断线后恢复 event stream。

## 20. 需要确认的问题

下面这些会影响当前仓库内重构时的具体脚手架选择：

1. 队列是否用 Redis/BullMQ，还是优先用数据库队列表简化部署？
2. 第一阶段是否需要真实 GitHub OAuth，还是可以先用本地 mock user？
3. 镜像 registry 是 Sealos 内置 registry、Docker Hub，还是自建 registry？
4. executor gateway 是继续沿用 Rust 改深，还是改成 TypeScript 服务统一工程栈？

已决策：

- V1 coding executor 选择 Codex app-server。
- V1 不基于模型 API 自研替代 Codex 的 coding agent。
- V1 通过 gateway 包装 app-server，而不是让前端或产品后端裸连 app-server WebSocket。
- 前端固定使用 Vite + React。
- 后端 API 固定使用 Hono。
- 在当前仓库内重构，不新建空仓库，不考虑向后兼容。

## 21. 初始结论

建议在当前仓库内重构为 TypeScript monorepo：

```text
apps/web + apps/api + apps/agent + apps/worker
packages/protocol + packages/db + packages/sandbox + packages/sealos + packages/github
```

这个结构能避免旧项目的核心耦合：主 Agent 不再跟 Devbox 生命周期绑定，产品后端不再只是 gateway proxy，任务状态不再塞进一个大表，前端也不再需要理解沙盒内 Codex 会话细节。同时保留 Codex app-server 的 coding 效果，把它收敛为可替换、可审计、可限权的 executor。

Plan approved. To implement: say "implement this plan". After implementation, run `/check` to review before merging or release follow-through.
