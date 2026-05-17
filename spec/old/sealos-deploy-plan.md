# Sealos Deploy 实施方案

这份文档用于明确当前项目的二开方向、目标架构、实施顺序和任务边界。

如果需要查看当前阶段哪些旧模块应继续保留、隐藏或下线，可配合阅读 [sealos-deploy-module-pruning.md](./sealos-deploy-module-pruning.md)。

它回答的是下面这些实际问题：

- 我们这次二开的产品目标到底是什么
- 当前项目哪些能力可以复用，哪些能力应该下线或弱化
- `Devbox`、`Codex Gateway`、`Build Service`、`Sealos Service` 各自负责什么
- 前后端、sandbox、gateway 之间应该如何通信
- 第一阶段应该先做什么，哪些事情可以后置

## 1. 一句话目标

把当前项目二开成一个 `Sealos Deploy 控制台`：

- 用户选择一个 GitHub 仓库
- 用户输入 `deploy on sealos`
- 系统创建 Devbox
- Devbox 默认自带并自动启动 `codex-gateway`，同时挂载预置 `skills`
- Codex 分析仓库、补齐参数、触发构建、获取镜像地址、请求部署
- 最终把部署地址、镜像地址、日志和构建产物展示给用户

## 2. 产品定位

### 2.1 当前项目的原始定位

当前仓库本质上是一个 `AI Coding Agent 控制台`：

- 前端提供任务创建、日志查看、文件浏览、PR 操作等界面
- 后端创建 Vercel Sandbox
- Agent CLI 在 sandbox 内执行编码任务
- 最终推送分支、创建 PR、展示变更

### 2.2 二开后的目标定位

二开后，这个项目不再是“在线 IDE + 通用 coding sandbox”。

它应该变成：

1. `任务控制台`
2. `Devbox 生命周期管理器`
3. `Codex 会话代理层`
4. `Build / Deploy 结果展示层`

换句话说，当前项目负责：

- 接收用户意图
- 维护任务状态
- 管理 Devbox / runtime 生命周期
- 代理 Codex 会话与事件流
- 展示分析过程和最终结果

而真正的分析、构建、部署执行，应下沉到：

- `Devbox Runtime`
- `Codex Gateway`
- `Skills`
- `Build Service`
- `Sealos Service`

## 3. 核心用户链路

目标链路如下：

1. 用户登录 GitHub，并选择一个仓库
2. 用户输入 `deploy on sealos`
3. Web 后端创建一个 `task`
4. 后端调用 Devbox API 创建 Devbox
5. Devbox Runtime 就绪，使用 Devbox 内默认自带并自动启动的 `codex-gateway`
6. 后端为该任务创建 Codex session
7. 后端发送首轮 prompt，让 Codex 分析仓库和部署需求
8. 后端订阅 gateway 事件流，并落库到 `task_messages` / `logs`
9. 如果缺少参数或环境变量，Codex 向用户追问
10. 用户补充参数后，后端继续原 session
11. Codex 通过 skill 触发构建流程，提交 build job
12. Build Service 返回 `imageRef`
13. Codex 生成 Sealos 模板并调用部署服务
14. Sealos Service 返回部署结果
15. 后端更新任务结果并向前端展示：
    - 部署地址
    - 镜像地址
    - 日志
    - 构建产物

## 4. 当前项目哪些能力可以复用

以下能力建议保留并继续复用。

### 4.1 用户与仓库入口

- GitHub 登录
- GitHub OAuth Token 获取
- Repo 选择与仓库输入

这些能力已经是整个产品链路的前置条件，不需要推倒重来。

### 4.2 任务模型

当前 `tasks` 表可以继续作为任务主表使用，见 [lib/db/schema.ts](/Users/jingyang/work/sealos-deploy-demo/lib/db/schema.ts:76)。

当前可复用字段包括：

- `id`
- `userId`
- `prompt`
- `repoUrl`
- `status`
- `logs`
- `error`
- `createdAt`
- `updatedAt`

### 4.3 会话消息模型

当前 `task_messages` 表可以继续承载用户与 agent 的会话内容，见 [lib/db/schema.ts](/Users/jingyang/work/sealos-deploy-demo/lib/db/schema.ts:359)。

这意味着：

- 前端聊天 UI 可以保留
- 后端只需要替换消息来源
- 不必重做消息存储结构

### 4.4 前端任务页

下面这些前端能力都可以继续作为外壳使用：

- 任务详情页
- 聊天页
- 日志展示
- 任务列表

尤其是聊天页 [components/task-chat.tsx](/Users/jingyang/work/sealos-deploy-demo/components/task-chat.tsx:1)，它本质上依赖的是任务消息接口，而不是特定的 agent 实现。

## 5. 当前项目哪些能力应该下线或弱化

为了让 v1 更快落地，建议主动放弃一部分“IDE 向”能力。

### 5.1 建议下线

- 文件浏览器
- 在线编辑
- 终端
- LSP
- 本地 diff / sync-changes
- Vercel Preview 检测逻辑

### 5.2 原因

这些能力都属于“在线开发环境”的一部分，而不是“自动部署控制台”的核心能力。

如果第一阶段还想保留它们，会带来下面这些额外复杂度：

- 继续依赖 Vercel Sandbox 对等能力
- 需要解决 Devbox 文件系统、终端、LSP 的完整替代
- 会把大量精力花在非主链路功能上

第一阶段我们的重点应该是：

- 让任务跑通
- 让 Codex 会话跑通
- 让构建跑通
- 让部署结果回来

## 6. 目标架构

建议采用下面的分层。

### 6.1 Web Frontend

负责：

- 用户选择仓库
- 输入部署指令
- 展示日志和消息
- 补充参数
- 展示部署结果

不负责：

- 直接连 Codex Gateway
- 直接调用 Devbox API
- 直接持有 Devbox JWT

### 6.2 Backend API

负责：

- 创建和更新任务
- 调用 Devbox API 管理生命周期
- 代理 `codex-gateway` 的 session API
- 消费 SSE 并写入数据库
- 汇总 build / deploy 结果给前端

Backend API 是整个系统的控制面。

### 6.3 Devbox Manager

即 `devbox server`。

负责：

- 创建 Devbox
- 查询 Devbox 状态
- 暂停 / 恢复 / 删除 Devbox
- 提供一次性 `exec`
- 提供文件上传 / 下载
- 提供 SSH 信息

Devbox 本身只负责运行环境，不负责业务编排。

### 6.4 Devbox Runtime

它是一个定制镜像，负责提供统一运行环境。

这里有一个重要前提：

- `codex-gateway` 由 Devbox 默认内置并自动启动

也就是说，当前项目不负责“在容器里手动拉起 gateway 进程”，而是负责：

- 确保 Devbox 创建成功
- 确认 gateway 可访问
- 使用 gateway 提供的 session API
- 注入 Codex 所需环境变量和 skills

Runtime 仍需内置或具备以下能力：

- `git`
- `node`
- `python`
- `kubectl`
- `gh`
- `curl`
- `jq`
- `skills`
- `buildkit` 所需依赖

运行约定建议如下：

- `codex-gateway` 由 Devbox 默认自动启动
- `codex-gateway` 默认监听 `1317`
- 支持注入 `CODEX_GATEWAY_OPENAI_BASE_URL`
- 支持注入 `CODEX_GATEWAY_OPENAI_API_KEY`
- 支持在用户保存了 `aiproxy` key 时优先将其注入 Devbox
- 支持 skills 挂载

### 6.5 Codex Gateway

运行在 Devbox 内部，由 Devbox 默认提供并自动启动。

负责：

- 创建 session
- 接收用户输入
- 转发 Codex 输出
- 通过 SSE 输出事件流

当前本地原型位于：

- [/Users/jingyang/work/codex-gateway](/Users/jingyang/work/codex-gateway)

当前具备的能力包括：

- `POST /api/sessions`
- `GET /api/sessions/:id/state`
- `GET /api/sessions/:id/events`
- `POST /api/sessions/:id/turn`
- `POST /api/sessions/:id/thread/new`
- `DELETE /api/sessions/:id`

### 6.6 Build Service

负责：

- 接收构建请求
- 在集群内触发 buildkit job
- 产出并返回 `imageRef`

Build Service 不应该被 Web 前端直接调用。

### 6.7 Sealos Service

负责：

- 接收部署请求
- 执行部署
- 回传部署结果

部署返回值至少要包含：

- `deploymentStatus`
- `deploymentUrl`
- 错误信息

### 6.8 模型调用链路说明

这一层非常容易在实现时被做乱，所以这里单独说明。

在本次二开方案下，用户的“对话请求”应该只进入 `Codex Gateway`，而不应该由当前 Web 项目直接请求不同模型厂商的官方 API。

推荐链路如下：

1. 用户在前端输入内容
2. 前端请求当前项目的 Backend API
3. Backend API 代理请求到 Devbox 内的 `codex-gateway`
4. `codex-gateway` 驱动 `codex app-server`
5. `codex app-server` 通过统一上游配置访问模型能力

这里的关键原则是：

- 当前 Web 项目不直接调用 Claude 官方 API
- 当前 Web 项目不直接调用 Gemini 官方 API
- 当前 Web 项目不直接调用 OpenAI 官方 API
- 当前 Web 项目也不负责自行选择多家模型供应商

模型访问应该统一收敛到 `codex-gateway` 背后。

根据现有约定，`codex-gateway` 所需环境变量包括：

- `CODEX_GATEWAY_OPENAI_BASE_URL`
- `CODEX_GATEWAY_OPENAI_API_KEY`

因此更合理的职责划分是：

- `Frontend / Backend API`
  - 负责任务、会话代理、日志、结果展示
- `Codex Gateway`
  - 负责会话执行、技能调用、任务推进
- `AI Proxy`
  - 作为 Codex 的统一模型上游

也就是说：

- Web 项目对接的是 `codex-gateway`
- `codex-gateway` 再通过 `CODEX_GATEWAY_OPENAI_BASE_URL` 和 `CODEX_GATEWAY_OPENAI_API_KEY` 访问 `AI Proxy`
- `AI Proxy` 再转发到实际模型供应商

在 key 选择策略上，当前二开方案优先使用用户保存的 `aiproxy` key 注入 Devbox；如果用户没有保存 `aiproxy` key，再回退到系统或用户侧可用的其他 OpenAI-compatible gateway key。

这个设计的价值在于：

1. 模型调用入口统一
2. 前端和后端不用感知 Claude / Gemini / OpenAI 的差异
3. 后续替换上游模型供应商时，不需要改当前项目的对话链路
4. 更符合“Web 控制台”和“执行引擎”分层

因此，当前项目后续应逐步移除“直接请求多家模型”的职责，避免重新回到：

- Web 后端自己装 CLI
- Web 后端自己注入多家 API key
- Web 后端自己执行 agent

这种模式不再是本次二开的目标架构。

## 7. 为什么 Gateway 必须由后端代理

`codex-gateway` 当前更适合作为 Devbox 内的执行组件，而不是直接暴露给浏览器。

原因包括：

1. 当前 gateway 没有独立鉴权层
2. session 存储在内存中
3. 每个 session 占用一个 `codex app-server` 子进程
4. 浏览器直接连接会增加任务归属和安全控制难度

因此建议采用下面的模式：

- 浏览器只调用当前项目的 Backend API
- Backend API 再代理到 Devbox 内的 `codex-gateway`
- Backend API 消费 SSE，并把内容写入 `task_messages` / `logs`
- 前端继续按任务维度读取消息和日志

这样有几个明显好处：

- 统一鉴权
- 统一限流
- 统一任务归属
- 统一审计
- 前端无需知道 Devbox 内部细节

## 8. 数据模型建议

第一阶段可以保留现有表结构主体，但建议新增一批 provider-neutral 字段。

### 8.1 建议新增到 `tasks`

- `runtimeProvider`
- `runtimeName`
- `runtimeNamespace`
- `runtimeState`
- `gatewaySessionId`
- `deploymentProvider`
- `deploymentStatus`
- `deploymentUrl`
- `imageRef`
- `artifacts`

### 8.2 字段语义建议

- `runtimeProvider`: 固定写 `devbox`
- `runtimeName`: Devbox 名称
- `runtimeNamespace`: 从 JWT claim 提取出的 namespace
- `runtimeState`: 例如 `Pending` / `Running` / `Paused` / `Shutdown`
- `gatewaySessionId`: Codex Gateway session id
- `deploymentProvider`: 固定写 `sealos`
- `deploymentStatus`: 例如 `pending` / `running` / `succeeded` / `failed`
- `deploymentUrl`: 最终应用地址
- `imageRef`: 镜像地址
- `artifacts`: 构建和部署过程的结构化产物

### 8.3 对现有字段的处理建议

短期兼容可以继续保留：

- `sandboxId`
- `sandboxUrl`

但长期不建议继续沿用这两个名字表示 Devbox 资源。

更清晰的做法是逐步切换到 `runtime*` 命名。

## 9. 接口分组建议

建议把新的后端接口拆成三组。

### 9.1 任务控制接口

- `POST /api/tasks`
- `POST /api/tasks/[taskId]/continue`
- `GET /api/tasks/[taskId]`
- `GET /api/tasks/[taskId]/messages`

职责：

- 维护用户任务与对话生命周期

### 9.2 Runtime 生命周期接口

- `POST /api/tasks/[taskId]/runtime/create`
- `POST /api/tasks/[taskId]/runtime/pause`
- `POST /api/tasks/[taskId]/runtime/resume`
- `DELETE /api/tasks/[taskId]/runtime`
- `GET /api/tasks/[taskId]/runtime`

职责：

- 由后端去调用 Devbox API

### 9.3 Gateway 会话接口

- `POST /api/tasks/[taskId]/session`
- `POST /api/tasks/[taskId]/session/input`
- `GET /api/tasks/[taskId]/session/state`
- `GET /api/tasks/[taskId]/session/events`
- `DELETE /api/tasks/[taskId]/session`

职责：

- 由后端去代理 Devbox 内的 `codex-gateway`

## 10. Runtime Image 设计建议

Runtime Image 是整个系统成败的关键。

建议使用当前 Devbox runtime 镜像作为基础镜像，并逐步加入下面这些能力。

### 10.1 基础运行依赖

- `git`
- `node`
- `python`
- `kubectl`
- `gh`
- `curl`
- `jq`

### 10.2 Codex 相关依赖

- `codex-gateway`
- `codex app-server`
- `CODEX_GATEWAY_OPENAI_BASE_URL`
- `CODEX_GATEWAY_OPENAI_API_KEY`

### 10.3 Build 能力

- BuildKit 运行所需依赖
- 使用 `kubectl` 提交 build job 的能力
- 可访问镜像仓库的认证环境

### 10.4 Skills 挂载

建议统一约定一个 skills 路径，例如：

- `/opt/skills`
- 或 `$CODEX_HOME/skills`

这样后续 runtime、gateway、prompt 都可以围绕同一个技能目录工作。

## 11. Skills 改造方向

### 11.1 删除的内容

- 本地 docker 构建模块
- 本地 sealos 认证模块
- sealos 可用区切换模块
- namespace 切换模块

### 11.2 新增的内容

建议拆成几类更明确的 skill：

- `assess-repo-for-sealos`
- `request-buildkit-build`
- `generate-sealos-template`
- `request-sealos-deploy`
- `persist-artifacts-to-github`

### 11.3 新的输出契约

每个 skill 的输出建议结构化，至少包含以下信息中的一部分：

- `buildContext`
- `dockerfilePath`
- `imageRef`
- `deploymentManifest`
- `deploymentUrl`
- `artifacts`

这样后端和前端就不需要从自然语言里“猜测结果”。

## 12. 分阶段实施建议

建议分四个里程碑推进。

### 里程碑 1：跑通 Runtime 与 Gateway

目标：

- Runtime image 构建成功
- Devbox 创建成功
- Devbox 内默认自带的 `codex-gateway` 可访问
- 后端可访问 gateway

完成标准：

- 用户能在页面里发一句简单 prompt
- 页面能收到 Devbox 内 gateway 返回的完整输出

当前进度修正：

- Devbox 创建已经打通，当前项目创建 `codex` task 时会同步创建或绑定 Devbox runtime
- Devbox 内真实 `codex-gateway` 链路已经打通，当前项目已经能完成 `session -> turn -> SSE -> chat`
- 因此这一里程碑可以视为“已完成”

### 里程碑 2：把当前项目改成任务控制台

目标：

- Web 后端不再直接驱动 Vercel Sandbox agent CLI
- 改为代理 `codex-gateway` session
- 事件流正常写入 `task_messages` / `logs`

完成标准：

- 用户对任意 repo 发起分析请求
- 页面能显示首轮分析和追问

### 里程碑 3：接入 BuildKit

目标：

- Skill 能提交 buildkit job
- Job 能产出 `imageRef`
- 后端能记录构建结果

完成标准：

- 针对示例仓库，系统可以从源码生成镜像地址

### 里程碑 4：接入 Sealos Deploy

目标：

- Skill 能生成 Sealos 模板
- Sealos Service 能完成部署
- 结果能回到任务页

完成标准：

- 页面能展示最终部署地址、镜像地址、日志、产物

### 当前已完成模块

当前项目已经不止完成 Devbox 基础层，也已经完成了 Devbox 内真实 gateway 联调链路和轻量任务页面收口。

已完成内容如下：

1. Devbox 服务端接入层
   - 已新增独立的 Devbox client、配置、命名和类型封装
   - 已支持：
     - `healthz`
     - 创建 Devbox
     - 列表查询 Devbox
     - 查询单个 Devbox
     - 暂停、恢复、删除 Devbox
     - 在 Devbox 内执行一次命令
   - 对应代码：
     - `lib/devbox/client.ts`
     - `lib/devbox/config.ts`
     - `lib/devbox/naming.ts`
     - `lib/devbox/types.ts`

2. Task 级 runtime 生命周期接口
   - 已新增后端接口：
     - `GET /api/devbox/health`
     - `GET /api/tasks/[taskId]/runtime`
     - `POST /api/tasks/[taskId]/runtime`
     - `DELETE /api/tasks/[taskId]/runtime`
     - `POST /api/tasks/[taskId]/runtime/exec`
   - 当前已经可以为某个 task：
     - 创建并绑定一个 Devbox
     - 查询当前 runtime 状态
     - 删除绑定的 runtime
     - 在 runtime 内执行一次命令

3. Task 与 runtime 的数据绑定
   - `tasks` 表已新增 runtime 相关字段，用于保存：
     - `runtimeProvider`
     - `runtimeName`
     - `runtimeNamespace`
     - `runtimeState`
     - `gatewayUrl`
     - `gatewaySessionId`
   - 这意味着任务已经可以开始具备“绑定外部运行时”的能力，而不再只依赖原来的 Vercel Sandbox 语义

4. Devbox 环境变量注入能力
   - 当前创建 Devbox 时，已经会注入以下 gateway 相关环境变量：
     - `CODEX_GATEWAY_HOST=0.0.0.0`
     - `CODEX_GATEWAY_PORT=1317`
     - `CODEX_GATEWAY_OPENAI_BASE_URL`
     - `CODEX_GATEWAY_OPENAI_API_KEY`
     - 可选的 `CODEX_GATEWAY_JWT_SECRET`
   - 同时也会继续注入任务上下文相关环境变量，例如：
     - `TASK_ID`
     - `REPO_URL`
     - `GITHUB_TOKEN`

5. AI Proxy key 注入策略
   - 已按当前二开需求调整为：
     - 优先使用用户保存的 `aiproxy` key
     - 若用户没有保存 `aiproxy` key，再回退到其他可用的 OpenAI-compatible gateway key
   - 这样 Devbox 内默认启动的 `codex-gateway` 会优先使用用户自己的 `aiproxy` 凭据

6. 二开方案文档
   - 文档已经同步到当前实现认知，包括：
     - Devbox 默认自带并自动启动 `codex-gateway`
     - 模型请求链路由 `codex-gateway -> AI Proxy` 统一承接
     - 当前阶段先打通 Devbox，再进入 gateway session 代理和对话链路

7. 当前项目到 `codex-gateway` 的 session client 与代理链路
   - 已实现 `codex-gateway` client、task 级 session / turn / events 代理
   - 已支持：
     - 创建 session
     - 发送 turn
     - 订阅 SSE 事件流
     - 查询 session 状态
     - 删除 session
   - 当前聊天页面已经能通过当前项目后端代理，稳定对接 Devbox 内真实 `codex-gateway`

8. SSE 对话链路与消息写回
   - 当前项目已经能消费 gateway 事件流并驱动聊天页实时输出
   - 最终 assistant 消息已经能继续写回 `task_messages`
   - 这意味着“用户输入一句话 -> gateway 返回流式结果”这条链路，在 Devbox 内真实 gateway 模式下已经成立

9. 轻量前端壳子
   - 主路由已经切到当前阶段的轻量 Sealos 页面壳：
     - 首页只保留 repo + prompt + submit
     - 任务页默认进入 chat-only 模式
   - 旧的重型 workspace 页面仍保留在仓库中作为 legacy 参考实现，但已不再作为主路由入口

10. `codex` task 创建时同步创建 Devbox

- 当前 `POST /api/tasks` 在创建 `codex` task 时，已经会先尝试创建或绑定 Devbox runtime
- runtime 信息会回写到 `tasks`，包括：
  - `runtimeProvider`
  - `runtimeName`
  - `runtimeNamespace`
  - `runtimeState`
  - `gatewayUrl`
- `gatewayUrl` 已优先使用 Devbox info 返回的真实 gateway 地址
- 本地 mock 地址仅保留为开发调试时的回退选项

当前仍未完成的部分也需要明确：

1. 还没有进入 BuildKit 与 Sealos Deploy 的执行链路
2. 还没有完成 Devbox 文件系统、终端、上传下载等旧 sandbox 能力的系统性替换
3. 还没有把当前任务控制面继续推进到 build / deploy 产物编排阶段

因此，当前阶段可以认为已经完成的是：

- Devbox 创建与管理基础层
- Devbox 与 task 的数据绑定
- `codex-gateway` 运行环境注入
- 当前项目到 Devbox 内真实 `codex-gateway` 的 session / turn / SSE / chat 代理链路
- 轻量 Sealos 页面壳与 chat-only 任务页
- `codex` task 创建时同步创建 Devbox runtime

而下一阶段要做的是：

- 在真实 Devbox gateway 链路上推进 BuildKit 与 Sealos Deploy
- 逐步替换旧 Vercel sandbox 相关能力
- 让任务控制面承接构建、部署、产物和状态编排

## 13. 实施顺序与拆解建议

上面的里程碑更偏“阶段目标”，这一节补充更具体的实施顺序。

建议按下面的顺序推进，而不是多个方向同时平推。

### 13.1 第一阶段：先确认基础设施前置条件

这一阶段先不急着改当前 Web 项目，先把真正会卡住主链路的前提条件确认清楚。

必须先确认的事项：

1. Devbox 是否默认自带并自动启动 `codex-gateway`
2. Devbox 是否能稳定暴露 `1317` 端口给后端访问
3. Runtime 是否已具备以下依赖：
   - `git`
   - `node`
   - `python`
   - `kubectl`
   - `gh`
   - `curl`
   - `jq`
4. Runtime 是否支持挂载 skills
5. Runtime 是否支持注入：
   - `CODEX_GATEWAY_OPENAI_BASE_URL`
   - `CODEX_GATEWAY_OPENAI_API_KEY`
6. Devbox 是否支持挂载 ServiceAccount
7. BuildKit job 所需权限、镜像仓库认证、推送路径是否已明确

这一阶段的目标不是写代码，而是避免后面做到一半发现最核心的基础设施能力缺失。

### 13.2 第二阶段：先打通 Devbox 与 Gateway 联通链路

这一阶段建议优先验证“最短闭环”，不要一开始就接 build 和 deploy。

目标：

- 创建 Devbox
- 确认其中的 `codex-gateway` 可访问
- 通过后端创建 session
- 发送一条简单 prompt
- 收到 SSE 事件和最终输出

建议先验证的最小链路：

1. 后端调用 Devbox API 创建一个 devbox
2. 后端拿到可访问的 gateway 地址
3. 后端请求 `POST /api/sessions`
4. 后端请求 `POST /api/sessions/:id/turn`
5. 后端订阅 `GET /api/sessions/:id/events`
6. 后端把事件打印或临时落库

完成标准：

- 不经过前端页面，也能在后端层面证明“任务输入 -> gateway 输出”已经跑通

这是整个方案的第一个真正阻塞点，必须先打通。

当前进度修正：

- “任务输入 -> gateway 输出”已经在 Devbox 内真实 gateway 模式下跑通
- `gatewayUrl` 已可由 Devbox info 返回并被当前项目消费
- 因此，这一阶段已经完成，后续应收口为：
  - 保持现有 task 级 gateway 代理接口不变
  - 在真实 Devbox gateway 链路上继续推进 build / deploy

### 13.3 第三阶段：改造当前项目后端为控制面

当 Devbox 和 gateway 链路跑通以后，再回头改当前项目的后端。

这一阶段的重点是“替换执行模型”，不是改 UI。

要做的事情：

1. 保留 `tasks`、`task_messages`、`logs` 这套任务壳
2. 新增 runtime 相关字段
3. 新增 gateway session 相关字段
4. 把当前 `POST /api/tasks` 的内部执行逻辑，从“直接执行 sandbox agent”改成：
   - 创建 task
   - 创建 devbox
   - 创建 gateway session
   - 发送首轮 prompt
   - 消费 SSE 并写入数据库
5. 把当前 `POST /api/tasks/[taskId]/continue` 改成：
   - 查找已有 task
   - 读取 `gatewaySessionId`
   - 把 follow-up 输入继续发给原 session
   - 继续消费 SSE 并更新数据库

同时建议新增三组接口：

- runtime 生命周期接口
- gateway session 接口

当前进度修正：

- 这一阶段已经大部分完成
- 当前项目已经不再只依赖旧的 sandbox agent 执行链
- `codex` task 已经能通过 task 级 gateway 接口进入 Devbox 内真实 `codex-gateway`
- 当前尚未完成的是任务状态 / 结果接口，以及 build / deploy 编排层

这一阶段完成后，当前项目在架构上就已经从“执行器”转成“控制面”。

### 13.4 第四阶段：前端接入新链路

后端控制面改造完成后，再改前端。

前端这一步不应该先做，因为没有稳定接口时，前端很容易反复返工。

建议顺序：

1. 保留现有任务页、聊天页、日志页
2. 让聊天页继续从 `task_messages` 读取消息
3. 让日志页继续从 `logs` 读取日志
4. 把“任务发起”和“继续输入”改成调用新的后端接口
5. 增加部署结果区域，展示：
   - `deploymentStatus`
   - `deploymentUrl`
   - `imageRef`
   - `artifacts`

第一阶段前端不建议保留的能力：

- 文件树
- 在线编辑
- 终端
- LSP
- diff
- preview iframe

建议优先做成一个清晰的“任务流页面”，而不是继续维持 IDE 型界面。

### 13.5 第五阶段：接入 Skills、BuildKit 和部署链路

当用户输入 -> Codex 输出这条链稳定以后，再开始接入真正的业务动作。

建议顺序如下：

1. 先让 Codex 完成 repo assess
2. 再让 Codex 通过 skill 输出“需要哪些参数/env”
3. 再接 BuildKit job 提交能力
4. Build 成功后，返回 `imageRef`
5. 再接 Sealos 模板生成
6. 最后接 Sealos 部署服务

不要一开始就把 assess、build、deploy 三件事绑成一个黑盒。

建议每一阶段都让 Codex 或技能产出结构化结果，例如：

- assess result
- missing inputs
- build request
- build result
- deploy request
- deploy result

这样任务状态和错误定位会清楚很多。

### 13.6 第六阶段：收尾和下线旧能力

当新主链路稳定后，再做收尾工作。

包括：

1. 下线 `@vercel/sandbox` 强绑定的执行逻辑
2. 下线在线文件编辑相关后端接口
3. 下线终端、LSP、文件操作等前端入口
4. 清理旧的多 agent 直连逻辑
5. 清理不再使用的 provider 配置入口
6. 更新 README 与二开文档

这一阶段不要提前做。

原因是：

- 旧能力在迁移过程中仍然可以作为参考实现
- 过早删除会让联调期间失去对照物

### 13.7 推荐的实际拆工顺序

如果按工程执行来拆，我建议任务顺序如下：

1. `Infra`
   - 确认 Devbox / gateway / SA / BuildKit / 镜像仓库前置条件
2. `Runtime`
   - 验证 runtime image、skills、gateway、环境变量注入
3. `Backend`
   - 打通 devbox 创建、session 创建、SSE 消费、任务落库
4. `Frontend`
   - 用现有任务页接入新的任务与消息链路
5. `Skills`
   - 重构成 assess / build / deploy 三段式
6. `Build / Deploy`
   - 分别接 BuildKit 与 Sealos Service
7. `Cleanup`
   - 下线旧 sandbox IDE 能力

### 13.8 哪些事情是阻塞项

下面这些事情建议视为阻塞项，优先级最高：

- Devbox 内默认 `codex-gateway` 的访问方式
- 后端能否稳定代理 gateway SSE
- Runtime 是否支持注入 AI Proxy 所需环境变量
- BuildKit job 权限是否就绪
- 镜像仓库推送凭据是否准备好

如果这些项没确认，就不建议大规模推进前端和技能侧改造。

## 14. 模块迁移建议

### 14.1 直接保留

- GitHub 登录与 token 获取
- Repo 选择流程
- `tasks` / `task_messages` / `logs`
- 任务页、聊天页、日志页

### 14.2 保留外壳，替换实现

- `POST /api/tasks`
- `POST /api/tasks/[taskId]/continue`
- 任务状态更新逻辑
- 部署结果展示逻辑

### 14.3 第一阶段建议下线

- 文件浏览器
- 文件编辑
- LSP
- 终端
- 本地 diff 相关 UI
- 依赖 Vercel Preview 的部署视图

## 15. 关键风险

### 15.1 Gateway 目前还是 PoC

已知特点：

- 无独立鉴权
- session 只存在内存
- 一个 session 占一个子进程

因此必须放在后端代理之后，不能让浏览器直接连。

### 15.2 Devbox 端口暴露能力待确认

当前方案依赖在 Devbox 内访问 `codex-gateway:1317`。

必须尽快确认：

- Devbox 是否能暴露该端口
- 是否有稳定的访问方式
- 是否支持后端长期访问

### 15.3 BuildKit 依赖基础设施改造

技能侧触发 build job 依赖：

- controller 支持挂载 SA
- runtime 有 `kubectl`
- 构建凭据已准备好

这是主链路里最容易被基础设施卡住的一环。

### 15.4 主链路过长

当前目标链路包含：

- repo 分析
- 参数追问
- 构建
- 推镜像
- 部署

如果没有结构化状态和事件，很容易导致前端难以展示、后端难以排查。

建议从一开始就把任务阶段明确化，例如：

- `created`
- `runtime_ready`
- `assessing`
- `waiting_for_input`
- `building`
- `deploying`
- `completed`
- `failed`

## 16. 当前最需要确认的事项

下面这些问题建议尽快和团队对齐。

1. Devbox 是否支持稳定暴露 `1317` 端口给后端访问
2. Devbox 是否支持挂载 SA，并允许 skill 通过 `kubectl` 提交 build job
3. BuildKit 构建产物最终推送到哪个镜像仓库
4. 镜像仓库认证由谁提供，在哪里注入
5. `codex-gateway` 是否要在进入联调前补一个最小鉴权层
6. 第一阶段页面里是否只展示部署结果卡片，而不是做 iframe 预览

## 17. v1 范围建议

为了尽快跑通，请把第一阶段范围控制在下面这些能力内：

- GitHub 选仓库
- 输入 `deploy on sealos`
- 创建 Devbox
- 接入 Devbox 内默认自带的 `codex-gateway`
- 创建 session
- 收到首轮分析
- 用户补参数
- 触发构建
- 返回镜像地址
- 返回部署地址
- 展示日志和产物

第一阶段不要追求：

- 在线文件树
- 在线改代码
- 多标签 IDE
- 沙盒终端
- LSP
- Preview iframe

## 18. 结论

这次二开不应该被定义成“替换 Vercel Sandbox”。

更准确的说法是：

> 把当前项目从一个 `AI Coding Sandbox 控制台`，重构成一个 `Sealos Deploy 任务控制台`。

当前项目继续扮演控制面：

- 用户入口
- 任务管理
- 会话代理
- 生命周期管理
- 日志与结果展示

真正的执行面应下沉到：

- Devbox Runtime
- Codex Gateway
- Skills
- Build Service
- Sealos Service

只要这个边界划清，后面的工程实现就会稳定很多，团队拆工也会更清晰。
