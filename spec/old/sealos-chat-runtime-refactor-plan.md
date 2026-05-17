# Sealos Chat Runtime 重构方案

这份文档只讨论当前正在使用的 `Sealos` 外壳，不考虑 `legacy` 页面壳。

目标不是“再做一套 chat”，而是把现有 Sealos chat 改造成一条真正可控、可预热、可恢复、可直连 gateway 的链路。

## 1. 问题定义

当前聊天体验差，已经不是单纯的“第一次冷启动慢”，而是：

- 首次进入任务页时，runtime、workspace、gateway readiness 没有被系统性预热
- 后续 follow-up 仍然偏慢，warm turn 没有走成真正的 warm path
- 前端发送成功和后端真正开始 turn 之间存在断层
- 前端为了等待 session 建立，还保留了额外轮询和桥接逻辑
- SSE 已经存在，但控制面和数据面没有拆开，导致链路过长
- 长任务的最终收尾仍绑定在 request 生命周期上，存在“stream 断了且最终结果未落盘”的风险

这会带来两个直接问题：

- 用户看到“消息已发送”，但首 token 很晚才出现
- 用户感觉后续对话仍像在反复冷启动，而不是复用已就绪的 runtime 与 session
- 在长任务或链路抖动场景下，用户刷新页面后也可能看不到最终完整 assistant message，因为完成收尾没有可靠跑完

## 2. 现状诊断

当前 follow-up 的关键链路是：

1. 前端调用 `/api/tasks/[taskId]/continue`
2. 接口先返回成功
3. 后端在 `after(...)` 中执行 `ensureTaskDevboxRuntime`
4. 后端再执行 `startCodexGatewayTaskTurn`
5. 后端继续在 `after(...)` 中等待 turn 完成并尝试最终落盘
6. 前端轮询 `/gateway/session`
7. 前端拿到 session 后再连接 `/gateway/events`

这个路径有四个核心问题。

### 2.1 turn 启动与请求返回脱钩

当前 `continue` 路由并不是“收到消息后立刻启动 turn”，而是：

- 先落 user message
- 先把 task 标成 `processing`
- 然后把 runtime 准备和 turn 发起放进 `after(...)`

这意味着前端收到成功响应时，turn 实际上还没有真正开始。

### 2.2 warm turn 反复做昂贵校验

当前 `ensureTaskDevboxRuntime` 的职责过重。

即使 `task.runtimeName` 已存在，它仍然会：

- 查询 Devbox 状态
- 重新执行 workspace bootstrap 检查
- 通过 `exec` 进入 runtime 跑检查脚本

这一步对首次冷启动是合理的，但对后续 follow-up 并不合理。它把“确保存在”做成了“每轮重检”。

### 2.3 gateway session 的热路径过长

当前 `startCodexGatewayTaskTurn` 在热路径里还会继续做：

- 重新查询 gateway context
- 对已有 `gatewaySessionId` 先做一次 state preflight
- session 不存在时再做 readiness 检查和 session 创建

这意味着 warm turn 并不是“直接发 prompt”，而是“先补一轮状态检查，再发 prompt”。

### 2.4 turn 完成收尾仍然依赖 `after(...)`

当前链路里，`after(...)` 不只负责“异步收尾”，而是同时承担：

- runtime 准备
- turn 启动
- turn 完成等待
- assistant 最终落库

这对短任务有时还能工作，但对长任务不可靠。

一旦 request 生命周期先结束，或平台对 `after(...)` 的后台执行窗口不足，最终收尾就可能中断，表现为：

- 前端 stream 中途断开
- task 长时间停留在 `processing`
- assistant 最终消息没有持久化到数据库

这说明当前问题不只是“首 token 慢”，而是“turn completion 缺少 durable execution”。

## 3. 设计目标

Sealos chat 的目标应该是：

1. 首次进入任务页时，系统尽量在用户发送消息前完成预热。
2. follow-up 默认走 warm path，不重复做 workspace bootstrap。
3. 用户点击发送后，请求返回时 turn 已经真正发出。
4. 前端不再依赖 session 轮询来等待 turn 启动。
5. 流式数据尽量直达 gateway，Next 只保留控制面。
6. session、runtime、gateway readiness 的失败恢复由后端统一处理，而不是把复杂性压给前端。
7. 长任务在请求结束后仍能可靠完成最终收尾与落盘。

## 4. 架构原则

### 4.1 控制面与数据面分离

建议明确分层：

- `Next Backend` 负责控制面
- `Devbox` 负责 runtime 生命周期
- `Codex Gateway` 负责 turn 与 stream
- `Sealos Chat UI` 只负责交互和渲染

控制面负责：

- 鉴权
- task ownership
- rate limit
- user message 持久化
- runtime 预热
- workspace 准备
- gateway session 创建或恢复
- turn 发起
- assistant 最终落库
- turn completion 的恢复与补偿

数据面负责：

- 真实 token stream
- turn 内部状态变化

### 4.2 冷路径与热路径必须显式区分

系统需要明确区分：

- `Cold Path`
  - runtime 不存在或已冷
  - workspace 未准备好
  - gateway 未 ready
  - session 不存在
- `Warm Path`
  - runtime 已运行
  - workspace 已准备好
  - gateway 可用
  - session 可复用

当前问题的本质，就是 warm turn 仍在走半条 cold path。

### 4.3 失败恢复应放在后端，不放在前端

前端不应该负责：

- 猜 runtime 是否 ready
- 猜 session 是否有效
- 反复轮询等待后端“真正开始”

前端应该只做：

- submit
- connect stream
- display
- recover UI state

## 5. 目标架构

### 5.1 页面加载阶段

任务页加载后，前端只拉：

- task 基础信息
- persisted messages
- 一个轻量级 chat runtime snapshot

当满足任一条件时，后台自动触发 `prewarm`：

- `runtimeName` 不存在
- `runtimeState` 不是 `Running`
- workspace 尚未标记为已准备
- gateway session 缺失

### 5.2 prewarm 阶段

新增 Sealos 专用接口：

- `POST /api/tasks/[taskId]/chat/prewarm`

职责：

- 确保 runtime 存在并可用
- 恢复或创建 Devbox
- 检查 gateway 基础可达性
- 准备 workspace
- 创建或恢复 gateway session
- 返回一个 chat runtime snapshot

这一步的目标不是发送 turn，而是把系统状态推入“可立即聊天”的状态。

### 5.3 发送消息阶段

新增 Sealos 专用接口：

- `POST /api/tasks/[taskId]/chat/turn`

职责：

- 持久化 user message
- 确保 warm prerequisites 满足
- 直接发送 turn 到 gateway
- 返回：
  - `sessionId`
  - `stream descriptor`
  - `transcriptCursor`
  - `turnStartedAt`

关键要求：

- 请求返回时，turn 必须已经真正发出
- 不允许继续使用“响应先返回，turn 在 after 里再启动”的做法

### 5.4 流式阶段

长期建议改成：

- 前端直连 `Codex Gateway`

但这里需要安全边界：

- 当前 `gatewayAuthToken` 更像 runtime 级 bearer token，不应直接暴露给浏览器

因此推荐两种方式之一：

1. `Next` 签发短时效 `stream ticket`
2. `Next` 返回带签名参数的短时效 `stream URL`

不建议把现有 runtime token 直接透给前端。

### 5.5 收尾阶段

turn 发出后，后端异步做：

- 等待 turn 完成
- 提取 assistant 最终内容
- 持久化 agent message
- 更新 task 状态
- 必要时更新 `gatewaySessionId`

这一部分可以继续异步化，但必须改成 durable completion 机制，不能继续依赖 request 绑定的 `after(...)` 长时间存活。

要求是：

- turn 发起前就把 completion 所需 checkpoint 持久化
- 后台收尾可以被重试、补跑、恢复
- 即使前端断流或页面刷新，最终 assistant message 仍应补落盘

这一部分只负责“完成后处理”，不能再负责“启动 turn”。

### 5.6 Durable Completion

建议新增一个独立的 `turn completion reconciler`，由它负责处理所有尚未完成收尾的 turn。

职责：

- 扫描仍处于 `processing` 且存在 active turn checkpoint 的任务
- 拉取 gateway state，判断 turn 是否完成
- 提取 assistant 内容并持久化
- 更新 task 状态为 `completed` / `error`
- 在必要时补偿前一次中断的收尾

实现形式可以是：

1. 持久队列 worker
2. 定时轮询 reconciler
3. 独立后台 job runner

第一阶段不要求一步到位上消息队列，但至少要做到：

- 最终落盘不再只依赖请求内的 `after(...)`
- 同一个 turn 的收尾逻辑必须幂等

## 6. 需要拆分的后端职责

当前 `ensureTaskDevboxRuntime` 职责过大，建议拆成以下几层。

### 6.1 Runtime 层

- `ensureRuntimeExists`
- `ensureRuntimeRunning`
- `refreshRuntimeLease`

职责仅限于：

- Devbox 创建
- Devbox 恢复
- pause 时间刷新
- runtime 元信息更新

### 6.2 Workspace 层

- `ensureWorkspacePrepared`

职责仅限于：

- clone repo
- 切 branch
- 安装 seakills
- 必要初始化

这一步不应该每轮都执行。

### 6.3 Gateway 层

- `ensureGatewayReachable`
- `ensureGatewaySession`
- `sendTurnWithRecovery`

职责仅限于：

- readiness 检查
- session 创建或恢复
- turn 发送
- 404/401/410 等场景下的一次恢复重试

### 6.4 Completion 层

- `recordTurnCheckpoint`
- `resumeTurnCompletion`
- `reconcileIncompleteTurns`

职责仅限于：

- 持久化 turn completion checkpoint
- 恢复未完成的 turn 收尾
- 做最终 assistant message 落库
- 保证重复执行时结果一致

## 7. 状态模型建议

当前 `tasks` 已有：

- `runtimeName`
- `runtimeState`
- `gatewayUrl`
- `gatewaySessionId`

但这些字段还不足以支撑真正的 warm path。

建议新增最小状态字段。

### 7.1 workspace 状态

- `workspacePreparedAt`
- `workspaceFingerprint`

用途：

- 避免每轮都执行 workspace bootstrap
- 当 `repoUrl`、`branchName`、`runtimeName` 变化时，重新准备 workspace

`workspaceFingerprint` 建议由以下信息组合：

- `runtimeName`
- `repoUrl`
- `branchName`

### 7.2 readiness 状态

- `runtimeCheckedAt`
- `gatewayReadyAt`

用途：

- 减少热路径重复探测
- 给后端一个可配置 TTL，用于决定何时允许直接走 fast path

### 7.3 turn completion 状态

- `activeTurnStartedAt`
- `activeTurnTranscriptCursor`
- `turnCompletionState`
- `turnCompletionCheckedAt`

用途：

- 让后台 reconciler 知道从哪里提取当前 turn 的 assistant 内容
- 把“turn 已启动”和“turn 已完成收尾”明确区分
- 支持请求结束后的恢复与补跑

其中：

- `activeTurnTranscriptCursor` 是第一阶段的关键字段，因为没有它，就无法可靠提取本轮新增 assistant 内容
- `turnCompletionState` 建议最小支持 `pending` / `running` / `completed` / `failed`

### 7.4 可选字段

如果后续需要更明确的可观测性，可以再加：

- `lastTurnStartedAt`
- `lastTurnCompletedAt`
- `lastTurnErrorCode`

这些不是第一阶段必须字段。

## 8. 核心执行策略

### 8.1 首次预热策略

首次进入任务页时：

- 如果 runtime 未存在，走完整 cold path
- 如果 runtime 存在但 workspace 未准备，补 workspace
- 如果 session 缺失，提前创建 session

这样用户点击发送时，尽量直接进入 warm turn。

### 8.2 warm turn 策略

warm turn 的 happy path 应该只做：

1. 写 user message
2. 直接 send turn
3. 返回 sessionId / stream descriptor
4. 前端立即开始消费 stream

不应再默认执行：

- workspace bootstrap exec
- gateway readiness 探测
- session state preflight

### 8.3 失败恢复策略

warm turn 失败时，后端再走 recover path：

1. 如果 send turn 返回 session 不存在
2. 重新获取 gateway context
3. 必要时 wait gateway ready
4. 重新创建 session
5. retry send once

原则是：

- 先 optimistic fast path
- 失败后 recover
- recover 只重试一次

### 8.4 runtime 保温策略

当前聊天链路里没有看到对 devbox pause 时间的主动刷新。

建议在这些时机调用 `refreshDevboxPause`：

- 页面 prewarm 成功后
- 用户发送 turn 前
- assistant turn 成功完成后

这样可以显著减少“用户停一会儿再问，又重新冷启动”的问题。

### 8.5 收尾恢复策略

turn 一旦发出，系统就必须把它视为“需要最终结算”的后台任务。

建议策略：

1. `/chat/turn` 在返回前持久化 turn checkpoint
2. 同步触发一次 completion runner
3. 如果 runner 正常完成，则直接落盘并清理 checkpoint
4. 如果 runner 中断，reconciler 后续继续接管

原则是：

- 启动 turn 和完成 turn 分离
- 收尾逻辑必须可重入
- 前端 stream 是否成功，不影响最终落盘

## 9. 接口改造建议

### 9.1 新接口

- `POST /api/tasks/[taskId]/chat/prewarm`
- `POST /api/tasks/[taskId]/chat/turn`
- `GET /api/tasks/[taskId]/chat/runtime`
- `POST /api/tasks/[taskId]/chat/stream-ticket`

### 9.2 旧接口处理

以下接口不建议继续作为 Sealos chat 主路径：

- `/api/tasks/[taskId]/continue`
- `/api/tasks/[taskId]/gateway/session`
- `/api/tasks/[taskId]/gateway/events`

它们可以暂时保留兼容，但应从 Sealos chat 主链路移除。

### 9.3 turn 接口响应建议

`/chat/turn` 成功响应建议至少包含：

- `sessionId`
- `streamUrl` 或 `streamTicket`
- `transcriptCursor`
- `turnAccepted`

前端收到响应后，不应再去轮询 session。

同时，后端必须在这个响应返回前已经持久化 turn completion checkpoint，确保后续即使请求结束，也能继续完成最终收尾。

## 10. 前端改造建议

### 10.1 Sealos-only hook

建议把 Sealos chat 数据层收敛成一个 hook，例如：

- `useSealosChatSession`

职责：

- 初始加载 persisted messages
- 页面挂载触发 prewarm
- 发送 turn
- 连接 stream
- 最终和 persisted messages 对齐

### 10.2 去掉 session polling

当前 follow-up 发送后还会去刷新 session。

目标是：

- turn 接口响应已经返回 sessionId
- 前端直接连 stream

这样可以删掉现有 session polling 逻辑。

### 10.3 保留 optimistic message，但收紧状态来源

前端仍然可以：

- 先插入 optimistic user message

但 assistant 的状态来源必须统一成：

- `streaming assistant snapshot`
- `persisted assistant message`

不能再混入额外的“等待 session”状态机。

## 11. 迁移顺序

### 阶段一：把 warm turn 做对

目标：

- follow-up 不再反复 workspace bootstrap
- turn 请求返回时，turn 已启动
- 删掉 session polling
- 长任务不会因为 request 结束而丢失最终落盘

具体动作：

- 拆分 `ensureTaskDevboxRuntime`
- 为 workspace 增加持久化准备状态
- 为 turn 增加 completion checkpoint
- 新增 completion reconciler
- 新增 `/chat/turn`
- Sealos chat 改为只调用 `/chat/turn`

### 阶段二：做预热和保温

目标：

- 用户进页面后，系统尽量提前进入可对话状态
- 降低 idle 后再提问的恢复成本

具体动作：

- 新增 `/chat/prewarm`
- 页面挂载自动预热
- turn 前后刷新 devbox lease

### 阶段三：切数据面直连 gateway

目标：

- 去掉 Next SSE proxy
- 缩短 token 到达路径

具体动作：

- 设计短时效 stream ticket
- 前端直连 gateway stream
- 下线 Sealos chat 对 `/gateway/events` 的依赖

### 阶段四：再考虑是否迁移到 AI SDK transport

这一步不是第一优先级。

原因是：

- 当前主要问题不在 markdown 或 message list
- 而在 runtime / gateway / turn 启动链路

只有当协议和状态机已经收敛后，再考虑 `useChat + custom transport`，才是低风险迁移。

## 12. 验收指标

建议明确以下指标。

### 12.1 体验指标

- warm turn 的“发送到开始流式显示”时间显著下降
- follow-up 不再出现明显的 session 等待空窗
- 用户 idle 一段时间后的首次 follow-up 恢复速度可控
- 长任务在前端断流、刷新页面后仍能最终看到完整持久化结果

### 12.2 架构指标

- warm turn 不再执行 workspace bootstrap exec
- warm turn 默认不再预先 `GET session state`
- Sealos chat 不再依赖 session polling
- turn 发起与 turn 完成收尾明确分离
- turn 完成收尾不再依赖 request 绑定的 `after(...)`

### 12.3 可观测性指标

建议记录并对比：

- `submit_to_turn_started_ms`
- `turn_started_to_first_stream_ms`
- `warm_turn_recovery_rate`
- `workspace_bootstrap_count_per_runtime`
- `turn_completion_recovery_rate`
- `missing_persisted_assistant_rate`

目标是让系统可以明确区分：

- 真正的模型耗时
- runtime/gateway 控制面耗时

## 13. 非目标

这份方案不包含：

- legacy 页面壳兼容改造
- 完整切换到 AI SDK `useChat`
- 任务页外围 comments/actions/deployments 的事件化改造
- 通用多 agent 抽象

当前只解决 Sealos + Codex Gateway 这条主链路。

## 14. 最终结论

当前问题的主因不是“前端没有 SSE”，也不是“第一次冷启动 unavoidable”，而是：

- 后续对话没有真正走 warm path
- runtime、workspace、gateway session 的职责没有拆开
- turn 启动被放到了请求返回之后
- turn 完成收尾仍然依赖 request 生命周期

正确方向不是继续在前端补轮询，而是：

1. 先把 warm turn 改成真正的 fast path
2. 再把 turn completion 改成 durable path
3. 然后做 prewarm 和 lease refresh
4. 最后把流切到 gateway 直连

如果这四步做对，Sealos chat 的主观速度和稳定性都会明显提升，而且不会破坏当前已经可用的数据持久化模型。
