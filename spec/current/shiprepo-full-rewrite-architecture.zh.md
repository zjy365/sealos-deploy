# ShipRepo 彻底重构架构设计

## 1. 结论

ShipRepo 在当前仓库内彻底重构，不新建空仓库。

这个重构不考虑向后兼容。旧代码只作为参考材料和可迁移资产，任何旧页面、旧 API、旧表结构、旧 gateway 抽象、旧组件，只要阻碍新架构，都可以删除。

重构前置条件：先确认新的前端 UI 原型。当前 UI、旧 Next.js 页面、`shiprepo-prototype.html`、`shiprepo-console.html` 和 `shiprepo-workbench-v2.html` 不作为最终设计参考。新的视觉和信息架构基准是 [ShipRepo workbench v3 prototype](./shiprepo-workbench-v3.html)。

技术栈固定为：

- 前端：Vite + React。
- 后端 API：Hono + Node.js。
- 后台任务：Node.js worker。
- 数据库：PostgreSQL + Drizzle。
- 队列：Redis + BullMQ。
- 类型协议：Zod + TypeScript。
- 执行环境：Devbox 或等价隔离 executor runtime。
- Coding executor：Codex app-server。
- Gateway：ShipRepo 自己维护的 executor gateway，负责包装 Codex app-server 并投影事件。

核心判断：

- 中心化的是 ShipRepo control plane，不是 Codex app-server。
- Codex app-server 不作为全局多租户后端。
- Codex app-server 运行在隔离 executor 内，跟随 task/run 生命周期。
- Devbox 不再是产品后端，也不再是业务状态中心。
- gateway 不再只是 transcript proxy，而是 Codex event projection layer。
- GitHub、registry、Sealos 等高权限动作由 ShipRepo API/worker 控制，不交给 sandbox 内 skill 全权处理。

## 2. 为什么不是新建空项目

新建空项目的优势是干净，但当前阶段不是最优。

当前仓库已经验证过：

- GitHub OAuth。
- 用户 session。
- Devbox 创建、续租、状态同步。
- Devbox 内 gateway/app-server 链路。
- task 页面、chat 页面、timeline 和 event stream 的初版体验。
- Sealos 相关运行环境和配置经验。
- 日志脱敏规则。
- shadcn/ui、Tailwind、React 组件基础。

这些能力从零重写会重新踩很多工程坑。真正需要抛弃的是旧结构，不是整个仓库。

因此新策略是：

```text
保留 repo
  -> 新建清晰目录结构
  -> 新建数据模型
  -> 新建 API / worker / gateway 边界
  -> 迁移或重写可复用代码
  -> 删除旧 App Router / 旧任务模型 / 旧 gateway proxy
```

这叫当前仓库内重构，不叫渐进兼容重构。

## 3. 旧架构的问题

当前架构大致是：

```text
Next.js Web + Route Handlers
  -> Devbox
  -> Devbox 内 codex-gateway
  -> codex app-server
  -> sandbox 内 skill 分析、修复、构建、部署
```

主要问题：

1. 产品后端不是真正的控制面。
   Next route handler 同时承担页面后端、任务创建、gateway 代理、AI title/branch generation、runtime 状态同步等职责，边界混乱。

2. Devbox 承担过多产品职责。
   Devbox 既是执行环境，又承载 gateway/app-server，又通过 skill 参与部署决策。它不应该成为半个后端。

3. 数据模型过度集中。
   一个 `tasks` 表承载 prompt、runtime、gateway、PR、preview、logs、turn 状态、sandbox 状态等多类概念，后续扩展会越来越困难。

4. gateway 事件太薄。
   当前对外主要提供 `state`、`notification`、`server-request`、`warning`，前端再从 `state.transcript` 投影 UI。这会丢失 Codex 官方 app 的细粒度过程感。

5. 高权限动作边界不清。
   GitHub token、registry token、Sealos deploy 权限如果进入 sandbox，风险会放大，也难以审计。

6. 前端被后端形态牵着走。
   前端本质需要的是 task/run/event/deployment 工作台，但现在很多 UI 状态来自 gateway snapshot，而不是产品自己的事件模型。

## 4. 新架构目标

新架构要把 ShipRepo 变成一个真正的 Sealos Deploy Agent 产品：

```text
GitHub repo -> Analyze -> Fix -> Build -> Preview -> Ship -> Operate
```

用户视角：

- 连接 GitHub。
- 选择 repo 和 branch。
- 创建部署任务。
- Agent 分析项目。
- Agent 修复部署阻塞。
- 构建镜像。
- 创建 Sealos preview。
- 用户确认后正式发布。
- 后续可以查看日志、改环境变量、重部署、回滚。

系统视角：

- API 是控制面。
- Worker 是编排执行者。
- Gateway 是 Codex executor 的事件投影层。
- Devbox 是隔离运行环境。
- Codex app-server 是 coding executor。
- PostgreSQL 是业务事实来源。
- Object Storage 保存长日志和 artifacts。

## 5. 总体架构

```text
apps/web
  |
  | HTTP / SSE
  v
apps/api
  |
  +--> packages/db
  +--> packages/auth
  +--> packages/events
  +--> packages/credentials
  |
  +--> Redis / BullMQ
          |
          v
      apps/worker
          |
          +--> Devbox / Executor Runtime
          |       |
          |       v
          |   apps/executor-gateway
          |       |
          |       v
          |   codex app-server
          |
          +--> packages/github
          +--> packages/registry
          +--> packages/sealos
          +--> Object Storage
```

数据不允许从 executor 反向成为产品事实来源。executor 只能产出事件、文件变更、命令结果、诊断和 artifact。最终状态由 API/worker 写入 PostgreSQL。

## 6. 新目录结构

目标目录：

```text
apps/
  web/
  api/
  worker/
  executor-gateway/

packages/
  protocol/
  db/
  auth/
  config/
  logger/
  events/
  credentials/
  github/
  devbox/
  sealos/
  registry/
  artifacts/
  agent-core/
  ui/

spec/
  current/

scripts/
docker/
```

旧目录迁移原则：

- `app/`：旧 Next.js 页面和 route handler，迁移完成后删除。
- `components/`：可迁移 UI 组件进入 `packages/ui` 或 `apps/web/src/components`。
- `lib/db`：schema 重写后进入 `packages/db`。
- `lib/devbox`：重整后进入 `packages/devbox`。
- `lib/github`：重整后进入 `packages/github`。
- `lib/sealos`：重整后进入 `packages/sealos`。
- `lib/codex-gateway`：不直接迁移为主链路，作为 executor-gateway 参考。
- `codex-gateway/`：保留实现经验，可以重写为 `apps/executor-gateway`。

## 7. 应用边界

### 7.1 apps/web

职责：

- 登录入口。
- repo picker。
- task 创建。
- task workspace。
- chat composer。
- run timeline。
- command output view。
- file diff view。
- deployment panel。
- preview result。
- settings/credentials 页面。

不做：

- 不访问 Devbox。
- 不访问 Codex app-server。
- 不保存 token。
- 不拼接 gateway 原始事件。
- 不自己推断 task 权限。

前端只消费 ShipRepo API 暴露的稳定协议。

### 7.2 apps/api

职责：

- auth/session。
- owner check。
- repositories。
- tasks。
- runs。
- messages。
- events。
- credentials。
- deployments。
- artifacts。
- event stream。
- rate limit / quota。

API 是产品控制面。所有用户请求先经过 API，再由 API 决定是否入队、是否读取状态、是否发起高权限动作。

### 7.3 apps/worker

职责：

- 消费队列。
- 创建 executor runtime。
- 订阅 executor-gateway events。
- 写入 run events。
- 触发 GitHub/registry/Sealos adapter。
- 上传 artifact。
- 清理 executor。
- 失败恢复。

Worker 是业务编排执行者，但不直接承载用户 HTTP 请求。

### 7.4 apps/executor-gateway

职责：

- 在 executor runtime 内启动和管理 Codex app-server。
- 给每个 run 建立 Codex session/thread。
- 接收 turn。
- 订阅 Codex app-server JSON-RPC 通知。
- 保留 raw events。
- 投影 ShipRepo executor events。
- 管理 TTL、interrupt、cleanup。

它不是 SaaS 多租户后端。它只服务当前 executor runtime 内的 task/run。

## 8. Codex app-server 定位

Codex app-server 是 coding executor，不是 ShipRepo 后端。

它负责：

- repo 分析。
- 读取文件。
- 修改文件。
- 运行命令。
- 使用 skills。
- 生成 Dockerfile。
- 生成 Sealos template。
- 解释 build failure。
- 产出 diff 和诊断。

它不负责：

- 用户鉴权。
- owner check。
- billing/quota。
- task 状态持久化。
- GitHub token 管理。
- registry token 管理。
- Sealos deploy 权限。
- 多租户隔离。

隔离模型：

```text
一个 run
  = 一个 executor runtime
  = 一个 workspace
  = 一个 CODEX_HOME
  = 一个 executor-gateway
  = 一个或多个 codex app-server child process
```

严禁：

```text
所有用户共享一个全局 codex app-server
```

## 9. Gateway 重写目标

当前 gateway 最大问题不是“有 gateway”，而是 gateway 的产品抽象太弱。

新 gateway 必须支持三层事件：

### 9.1 Raw Codex Events

完整保存 Codex app-server 原始事件，用于 debug、审计和以后升级。

示例：

- `thread/started`
- `thread/status/changed`
- `turn/started`
- `turn/completed`
- `turn/diff/updated`
- `turn/plan/updated`
- `item/started`
- `item/agentMessage/delta`
- `item/commandExecution/outputDelta`
- `item/completed`
- `error`

### 9.2 Executor Events

gateway 投影出的执行事件，worker 消费。

示例：

- `executor.ready`
- `executor.session.started`
- `executor.turn.started`
- `executor.agent_message.delta`
- `executor.reasoning.updated`
- `executor.plan.updated`
- `executor.command.started`
- `executor.command.output`
- `executor.command.completed`
- `executor.file_change.started`
- `executor.file_change.completed`
- `executor.diff.updated`
- `executor.turn.completed`
- `executor.failed`
- `executor.closed`

### 9.3 Product Run Events

worker 写入数据库、前端消费的产品事件。

示例：

- `run.created`
- `run.started`
- `analysis.started`
- `analysis.completed`
- `fix.started`
- `fix.completed`
- `build.started`
- `build.output`
- `build.failed`
- `build.completed`
- `image.pushed`
- `preview.creating`
- `preview.ready`
- `deploy.confirmation_required`
- `deploy.started`
- `deploy.completed`
- `run.failed`
- `run.completed`

前端只消费 Product Run Events。它不直接理解 Codex 原始协议。

## 10. 数据模型

旧 `tasks` 大表需要拆掉。

### 10.1 users

用户身份。

字段：

- `id`
- `provider`
- `external_id`
- `username`
- `email`
- `avatar_url`
- `created_at`
- `updated_at`

OAuth token 不直接放 users 表，进入 credentials。

### 10.2 credentials

加密凭证。

字段：

- `id`
- `user_id`
- `provider`
- `scope`
- `encrypted_payload`
- `expires_at`
- `created_at`
- `updated_at`

用途：

- GitHub OAuth token。
- GitHub App installation token metadata。
- registry 凭证。
- Sealos token。
- AI gateway key。

### 10.3 repositories

用户导入的仓库。

字段：

- `id`
- `user_id`
- `provider`
- `owner`
- `name`
- `clone_url`
- `default_branch`
- `visibility`
- `installation_id`
- `created_at`
- `updated_at`

### 10.4 tasks

产品任务，不保存执行细节。

字段：

- `id`
- `user_id`
- `repository_id`
- `title`
- `goal`
- `target_environment`
- `status`
- `created_at`
- `updated_at`
- `archived_at`

状态：

- `draft`
- `queued`
- `running`
- `waiting_for_user`
- `succeeded`
- `failed`
- `cancelled`

### 10.5 runs

一次 task 的执行尝试。

字段：

- `id`
- `task_id`
- `user_id`
- `status`
- `phase`
- `started_at`
- `completed_at`
- `failure_code`
- `failure_message`
- `created_at`
- `updated_at`

phase：

- `planning`
- `analyzing`
- `fixing`
- `building`
- `previewing`
- `shipping`
- `operating`

### 10.6 run_events

append-only 事件流。

字段：

- `id`
- `run_id`
- `task_id`
- `user_id`
- `seq`
- `type`
- `visibility`
- `payload`
- `created_at`

规则：

- `seq` 在 run 内单调递增。
- 前端 SSE 通过 `last_seq` 恢复。
- user-visible payload 必须脱敏。
- internal payload 可以保存更多诊断，但不能直接返回前端。

### 10.7 messages

用户和 Agent 的对话。

字段：

- `id`
- `task_id`
- `run_id`
- `user_id`
- `role`
- `content`
- `status`
- `client_message_id`
- `created_at`

### 10.8 executors

执行环境记录。

字段：

- `id`
- `run_id`
- `task_id`
- `user_id`
- `provider`
- `runtime_name`
- `runtime_namespace`
- `gateway_url`
- `status`
- `created_at`
- `ready_at`
- `closed_at`

### 10.9 artifacts

产物。

字段：

- `id`
- `run_id`
- `task_id`
- `user_id`
- `type`
- `storage_key`
- `content_type`
- `size_bytes`
- `created_at`

类型：

- log。
- diff。
- generated Dockerfile。
- Sealos template。
- build report。
- screenshot。

### 10.10 deployments

Sealos 资源记录。

字段：

- `id`
- `task_id`
- `run_id`
- `user_id`
- `environment`
- `status`
- `preview_url`
- `resource_name`
- `image`
- `created_at`
- `updated_at`

## 11. API 设计

API 使用 Hono。

基础路径：

```text
/api/auth/*
/api/repositories/*
/api/tasks/*
/api/runs/*
/api/events/*
/api/messages/*
/api/deployments/*
/api/credentials/*
/api/artifacts/*
```

关键接口：

```text
POST   /api/tasks
GET    /api/tasks
GET    /api/tasks/:taskId
POST   /api/tasks/:taskId/runs
GET    /api/tasks/:taskId/runs
GET    /api/runs/:runId
GET    /api/runs/:runId/events
POST   /api/runs/:runId/messages
POST   /api/runs/:runId/cancel
POST   /api/runs/:runId/confirm
GET    /api/runs/:runId/artifacts
GET    /api/tasks/:taskId/deployments
POST   /api/deployments/:deploymentId/promote
POST   /api/deployments/:deploymentId/rollback
```

所有接口必须做 owner check。

## 12. Queue 设计

队列：

- `run-orchestration`
- `executor-control`
- `build-jobs`
- `deployment-jobs`
- `cleanup-jobs`

job 必须幂等。

并发限制：

- 每个用户最多 2 个 active runs。
- 每个 task 同时最多 1 个 active run。
- 全局 executor runtime 数量设上限。
- build job 有独立上限。
- cleanup job 不受普通用户 quota 影响。

## 13. 凭证边界

原则：

- token 存在 control plane。
- token 加密存储。
- executor 只拿短期、最小权限、task-scoped 的凭证。
- 能由 worker 完成的高权限动作，不交给 executor。

动作归属：

| 动作 | 执行方 |
| --- | --- |
| clone public repo | executor |
| clone private repo | executor 使用短期 clone token |
| read/write workspace file | Codex app-server |
| generate Dockerfile/template | Codex app-server |
| build image | worker 或独立 build job |
| push image | worker registry adapter |
| create preview | worker Sealos adapter |
| promote production | worker Sealos adapter |
| create PR | worker GitHub adapter |

## 14. 前端产品结构

前端不是 IDE。它是部署生命周期工作台。

主要页面：

```text
/login
/repositories
/tasks
/tasks/:taskId
/settings/credentials
```

Task workspace：

```text
Header: repo / branch / status / primary action

Left:
  Chat

Center:
  Current result
  Preview URL
  Blocking issues
  Required user confirmations

Right tabs:
  Timeline
  Logs
  Diff
  Artifacts
  Deployment
```

前端原则：

- Preview URL 和当前阻塞原因优先于日志。
- Agent activity 是证据，不是主内容。
- command output 默认折叠。
- diff 默认按部署相关文件聚合。
- 高风险动作使用确认对话框。

## 15. 日志和事件安全

用户可见日志：

- 禁止 token。
- 禁止完整私有 repo URL。
- 禁止环境变量值。
- 禁止绝对路径。
- 禁止原始错误堆栈。

允许显示：

- 阶段名称。
- 命令类别。
- 脱敏后的失败原因。
- 文件 basename。
- Docker build step 概要。
- Sealos resource status。

代码层继续沿用当前 AGENTS.md 的规则：默认静态日志，动态值只能通过 allowlist 工具输出。

## 16. 迁移执行顺序

### Phase 0: 新骨架

目标：建立新目录和构建系统。

交付：

- `pnpm-workspace.yaml`
- `apps/web`
- `apps/api`
- `apps/worker`
- `apps/executor-gateway`
- `packages/protocol`
- `packages/db`
- `packages/config`
- `packages/logger`

验收：

- `pnpm type-check` 通过。
- `pnpm lint` 通过。
- API health check 可运行。
- Web 能请求 API health check。

### Phase 1: 新数据模型

目标：替代旧 `tasks` 大表。

交付：

- 新 Drizzle schema。
- 新 migrations。
- repository/task/run/event/message 基础 CRUD。
- owner check。
- run event SSE。

验收：

- 创建 task。
- 创建 run。
- 写入 run events。
- 前端能从 `last_seq` 恢复事件流。

### Phase 2: Executor Gateway

目标：重写 gateway 为事件投影层。

交付：

- 启动 Codex app-server。
- 创建 session/thread。
- 发送 turn。
- interrupt turn。
- raw Codex event 保存。
- executor event 投影。
- TTL cleanup。

验收：

- 一个真实 repo 能收到 agent message delta。
- 能看到 command started/output/completed。
- 能看到 file diff updated。
- 能中断 run。

### Phase 3: Devbox Executor

目标：把 executor 放入隔离 runtime。

交付：

- Devbox create/destroy。
- workspace bootstrap。
- gateway readiness。
- worker 订阅 executor events。
- run events 落库。

验收：

- 每个 run 有独立 executor。
- executor 丢失后 run 标记失败或重试。
- A 用户无法读取 B 用户 run events。

### Phase 4: Deploy MVP

目标：跑通 repo 到 Sealos preview。

交付：

- Analyze。
- Dockerfile/template generation。
- build job。
- push image。
- create preview。
- preview URL。

验收：

- 至少一个真实 GitHub repo 得到可打开 preview URL。
- 失败时有结构化原因。

### Phase 5: Ship & Operate

目标：从 preview 到正式运维。

交付：

- promote production。
- deployment logs。
- env update。
- redeploy。
- rollback。
- optional PR。

验收：

- 用户能在同一个 task 内完成 preview、ship、rollback。

## 17. 删除策略

允许删除：

- 旧 Next.js route handlers。
- 旧 `tasks` 表相关代码。
- 旧 task UI。
- 旧 `lib/codex-gateway` 主链路。
- 旧 sandbox 页面。
- 旧 connectors 页面。
- 与 Sealos Deploy Agent 无关的 AI coding console 功能。

保留为参考：

- `codex-gateway/rust-src/bridge.rs`
- `lib/devbox/runtime.ts`
- `lib/codex-gateway/client.ts`
- `lib/task-agent-events.ts`
- `components/task-*`
- `lib/utils/task-flow-logs.ts`

参考不等于兼容。迁移完成后可以删除。

## 18. 验证命令

每次 TypeScript/TSX 改动后必须运行：

```bash
pnpm format
pnpm type-check
pnpm lint
```

文档改动不需要运行上述命令。

生产构建只在明确需要时运行：

```bash
pnpm build
```

不运行 dev server。

## 19. 成功标准

架构成功的标准不是“旧页面还可以打开”，而是：

- 前端完全不依赖 Next route handler。
- API 通过 Hono 独立提供控制面。
- 任务状态来自新 run/event model。
- Codex app-server 不作为全局多租户后端。
- executor runtime 按 run 隔离。
- gateway 能投影 Codex 细粒度事件。
- GitHub/registry/Sealos 高权限动作由 worker adapter 执行。
- 用户能从 repo 得到可打开 Sealos preview URL。
- 失败能解释原因和下一步。

## 20. 最终架构口径

一句话版本：

> ShipRepo 是一个 Web-first 的 Sealos Deploy Agent。它用 Vite React 做前端，用 Hono 做控制面，用 worker 编排任务，用隔离 executor 运行 Codex app-server，并把 Codex 的软件工程能力收敛到可审计、可限权、可恢复的部署生命周期工作台中。
