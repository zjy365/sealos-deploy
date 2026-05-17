# Sealos Agent Chat V2 重构方案

这份文档是新的方案，不延续 [sealos-chat-runtime-refactor-plan.md](./sealos-chat-runtime-refactor-plan.md) 当前的 `state-only chat` 思路。

目标不是把现有 chat 再修一轮，而是把它重构成一条真正适合 `agent` 的链路：

- 实时层以 `events` 为主，而不是只盯 `state.transcript`
- 持久化层以 append-only `task_events` 为主，而不是多路补偿写 `task_messages`
- 前端主链路回到 `codex-gateway` 原生的 `session + turn + events` 模型
- `AI SDK UI` 只作为可选增强层，不再作为主抽象
- `Devbox`、`Codex Gateway`、`Task` 这套后端域模型继续保留

## 1. 核心结论

当前问题不是“某个 stream bug 还没补完”，而是产品被错误实现成了“普通 chat + 一些补丁”，而它实际是一个 `agent runtime`。

当前最明显的三个问题：

1. 为什么保存用户和 AI 回复这么不稳定
2. 为什么 AI 回复速度这么慢，卡点到底在哪里
3. 为什么 `codex-gateway` 自带 HTML 明显更快

这三个问题的共同根因是：

- 当前实时链路、任务编排链路、数据库持久化链路被耦合在一起
- 前端主要消费的是 `state`，没有把 `Codex Gateway events` 当一等公民
- assistant message 没有单一真相源
- 上层引入的抽象已经比 `codex-gateway` 自身的原生交互模型更重

## 2. 为什么旧方案不够

旧方案解决过这些问题：

- `turn` 返回时必须已经真正发出
- `session polling` 要删掉
- 长任务 completion 不能继续只依赖 request-bound `after(...)`

这些方向没有错，但它把核心问题定义成了：

- warm path 不够 warm
- completion 不够 durable
- stream 断开后要补偿

这仍然是在“chat 思维”里改造系统。

而 `Codex Gateway` 实际暴露的是事件流，不是单纯文本流。根据 gateway API：

- `session`
- `state`
- `notification`
- `server-request`
- `warning`
- `raw`
- `session-closed`

都是合法 SSE 事件。

参考：

- [Codex Gateway API](../codex-gateway/docs/api.md)
- [Codex Gateway Integration Guide](../codex-gateway/docs/integration-guide.md)

但当前 Sealos chat 主链路里，真正被业务处理的几乎只有：

- `state`
- `session-closed`
- `onerror`

这导致当前实现从一开始就把 agent runtime 降级成了 transcript chat。

## 3. 现状问题拆解

## 3.1 保存为什么不稳定

当前 `user` 消息相对稳定，因为它在 turn 启动前同步写库。

真正不稳定的是 `assistant`：

- SSE 代理里会增量写 `task_messages`
- turn 完成后又会在 finalize 里写一次
- 页面刷新或读消息时还会 reconcile 再补一次

也就是说，assistant 的当前架构不是：

- `event log -> projector -> messages`

而是：

- `streaming state`
- `stream proxy side-effect`
- `completion finalize`
- `reconcile fallback`

四套逻辑共同维护数据库投影。

这会产生三个后果：

1. 页面看到的实时内容和数据库不是同一来源
2. 某一条补偿链路中断时，刷新后就可能“刚才看见的内容没了”
3. 不同路径用的内容提取规则不同，容易重复、丢失、乱序

一句话说透：

当前 `task_messages` 不是系统主记录，只是一个多路补偿后的副本。

## 3.2 为什么速度慢

慢主要不在模型，而在模型前后的编排。

当前发送一条消息后，主路径里还会做：

- 鉴权、限流、查 task
- 写 user message
- 更新 task 状态
- `ensureTaskDevboxRuntime`
- gateway session preflight
- session 404 时 recreate
- 再真正发 turn

这意味着用户点发送以后，并不是马上把输入打给 Codex。

然后流式阶段又不是浏览器直接处理 gateway events，而是：

- 浏览器连 Next `/chat/stream`
- Next 再连 gateway `/events`
- Next 一边透传，一边解析 `state`
- Next 一边决定要不要写数据库

这让 stream 热路径里混入了持久化副作用。

所以当前延迟主要来自三段：

1. runtime warm path 仍然过重
2. send turn 前的 session 链路过长
3. stream 热路径里混入 DB 持久化和 snapshot 解析

## 3.3 为什么原始 HTML 快

`codex-gateway` 自带 HTML 的职责极薄：

- 创建 session
- 连接 session 的 SSE
- 发 turn
- 渲染 transcript
- 渲染 recent events
- 渲染 warning / server-request

它没有：

- task 状态机
- prewarm 状态桥接
- stream ticket
- retained streaming message
- persisted message 对齐逻辑
- SSE 热路径写数据库

所以它快，不是因为 UI 写得更高级，而是因为链路短、状态少、事件模型原生。

## 4. 重新评估 AI SDK 6 的角色

重新评估 [codex-three-project-deep-analysis.md](./codex-three-project-deep-analysis.md) 后，这次必须收紧一个判断：

- `codex app-server`
- `ai-sdk-provider-codex-app-server`
- `codex-gateway`

不是上下游替代关系，而是三层不同的适配器 / 运行时：

- `codex app-server` 是官方底座
- `ai-sdk-provider-codex-app-server` 是 AI SDK 的 Node/TS provider
- `codex-gateway` 是 HTTP/SSE 暴露层

这意味着：

- `AI SDK` 不适合做当前 `codex-gateway` 主链路的核心抽象
- `AI SDK UI` 可以作为前端可选增强层
- 当前系统真正应该围绕的主模型，仍然是 `gateway session + thread + turn + events`

### 4.1 为什么 `ai-sdk-provider-codex-app-server` 不适合作为主链路

社区 provider `ai-sdk-provider-codex-app-server` 很值得参考，因为它支持：

- persistent threads
- mid-execution injection
- interrupt
- tool streaming

参考：

- <https://ai-sdk.dev/providers/community-providers/codex-app-server>

但当前 Sealos 架构里，真正运行 Codex 的地方是：

- Devbox 内的 `codex-gateway`
- gateway 内再管理 `codex app-server`

不是 Next.js 进程本地直接拉起 `codex app-server`。

所以：

- provider 的交互模型值得学习
- 但不应该让 provider 反过来主导 `gateway` 的接口设计
- 当前如果硬把 AI SDK provider 套在 gateway 外面，本质上是在“适配器外面再套一层适配器”

### 4.2 AI SDK 的合适位置

AI SDK 并不是完全不适合这里，它更适合放在：

- 浏览器侧 UI message 抽象
- 自定义 transport
- 自定义 data parts
- 某些纯前端 agent timeline 组件

也就是说：

- `AI SDK UI` 是可选增强层
- 不是这次重构的基础依赖
- 即使完全不用 AI SDK，这次架构重构也应该成立

### 4.3 不使用 text-only chat 思维

这次不能再把产品当普通文本聊天处理。

不管最终前端是否接 AI SDK，都不建议继续走：

- 只拼接文本 delta 的 transport
- 只围绕 assistant text 的消息模型
- 把 `state.transcript` 当作唯一渲染源的做法

因为这类方案不能完整表达：

- tool / notification streaming
- server requests
- warnings
- lifecycle events
- session / thread 切换
- interrupt / inject 语义

### 4.4 可选参考

如果后续要在浏览器层统一消息协议，下面这些 AI SDK 能力仍然值得参考：

- `UIMessage` stream
- `createUIMessageStreamResponse`
- `createAgentUIStreamResponse`
- 自定义 transport
- streaming data parts

参考：

- <https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat>
- <https://ai-sdk.dev/docs/reference/ai-sdk-ui/create-ui-message-stream-response>
- <https://ai-sdk.dev/docs/reference/ai-sdk-core/create-agent-ui-stream-response>
- <https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data>

## 5. 新架构原则

## 5.1 单一真相源

这次必须明确：

- 实时真相源：`gateway events`
- 持久化真相源：`task_events`
- 页面快照真相源：`task_events` 投影出的最新 UI state
- `task_messages` 不再是主记录，而是投影结果

## 5.2 控制面与数据面彻底分离

- `Next Backend` 负责控制面
- `Devbox` 负责 runtime 生命周期
- `Codex Gateway` 负责 session / thread / turn / event streaming
- `Gateway-native thin UI layer` 负责浏览器侧 agent 渲染
- `AI SDK UI layer` 只是可选增强，不是必选组件
- `Projector / Reconciler` 负责把 event log 投影成 message 和 task status

## 5.3 event-first，而不是 state-first

`state` 的职责应该收缩成：

- 重连时恢复 snapshot
- 判断 active turn
- 获取 transcript 最终快照

不再把 `state` 当作唯一的实时渲染输入。

实时渲染主来源改成：

- `session`
- `notification`
- `server-request`
- `warning`
- `state`
- `session-closed`

## 6. 目标架构

```text
Browser
  -> gateway-native chat-v2 client
  -> /api/tasks/:id/chat/v2
  -> Next control plane
  -> Devbox runtime + Codex Gateway
  -> gateway SSE events
  -> thin event adapter
  -> browser event timeline / transcript UI

Async side:
gateway events / state snapshots
  -> task_events (append-only)
  -> projector
  -> task_messages / task status / task summaries

Optional side:
gateway events
  -> AI SDK UI adapter
  -> UIMessage stream
```

## 7. 新数据模型

## 7.1 task_events

新增 append-only 表：

- `id`
- `taskId`
- `seq`
- `kind`
- `sessionId`
- `threadId`
- `turnId`
- `payloadJson`
- `createdAt`

建议的 `kind`：

- `user_message.created`
- `gateway.session.opened`
- `gateway.state.snapshot`
- `gateway.notification`
- `gateway.server_request`
- `gateway.warning`
- `gateway.session.closed`
- `turn.started`
- `turn.interrupted`
- `turn.completed`
- `turn.failed`
- `assistant.message.projected`

规则：

- 先落 `task_events`
- 后投影 `task_messages`
- 不在 stream 热路径直接把 assistant 最终文本当主记录写到 `task_messages`

## 7.2 task_streams

新增流恢复表：

- `taskId`
- `streamId`
- `sessionId`
- `threadId`
- `turnId`
- `status`
- `startedAt`
- `endedAt`

作用：

- 页面刷新时恢复活动流
- 为浏览器恢复活动 turn 提供稳定索引
- 如果后续接 AI SDK resumable streams，可以复用这层元数据

## 7.3 tasks 表保留但收缩职责

继续保留：

- `runtimeName`
- `runtimeState`
- `gatewayUrl`
- `gatewaySessionId`
- `activeTurnSessionId`
- `activeTurnTranscriptCursor`
- `turnCompletionState`

但这些字段不再直接驱动聊天 UI，而是：

- runtime / session 恢复信息
- completion checkpoint
- 控制面诊断信息

## 8. 新接口设计

## 8.1 保留接口

- `POST /api/tasks/[taskId]/chat/prewarm`
- `GET /api/tasks/[taskId]/chat/runtime`

它们继续用于：

- runtime 预热
- gateway session 可用性检查
- 页面首屏恢复

## 8.2 新主接口

### `POST /api/tasks/[taskId]/chat/v2`

职责：

- 校验权限和限流
- 同步写入 `user_message.created` event
- 确保 runtime / workspace / gateway prerequisites 满足
- 发送 turn 到 gateway
- 创建 stream descriptor
- 返回：
  - `streamId`
  - `sessionId`
  - `threadId`
  - `turnStartedAt`
  - 可恢复 stream descriptor

要求：

- 请求返回时，turn 已经真正发出
- 不在这个请求里承担最终 assistant 完整落盘

### `GET /api/tasks/[taskId]/chat/v2/stream`

职责：

- 返回 gateway-native 的事件流，或一层极薄的归一化 event stream
- 支持 resume
- 浏览器端刷新后可以继续恢复活动 turn

### `POST /api/tasks/[taskId]/chat/interrupt`

职责：

- 调 gateway turn interrupt
- 记录 `turn.interrupted` event

### `POST /api/tasks/[taskId]/chat/inject`

职责：

- 向活跃 turn 注入额外指令
- 记录 `user_message.created` event，标注 `source=inject`

这是 agent 场景必需能力，不是普通 chat 才有的“重发”。

## 8.3 调试和诊断接口

新增：

- `GET /api/tasks/[taskId]/events`

职责：

- 调试 UI
- 回放 agent 轨迹
- 排查 session / thread 变化

## 9. 前端与传输层设计

## 9.1 主方案：gateway-native chat client

新增 hook：

- `useTaskAgentChatV2`

职责：

- 拉取 persisted projected messages
- 建立 task 级 event stream
- 恢复活动流
- 渲染 agent timeline / transcript / warnings / requests
- 发 turn / inject / interrupt

不再负责：

- 自己维护 retained streaming message
- 自己拼装 gateway transcript
- 自己判断什么时候把 assistant 内容塞回数据库

它的交互模型应该尽量贴近 [codex-gateway/public/app.js](../codex-gateway/public/app.js) 的原生链路，而不是继续叠厚前端状态机。

## 9.2 服务端 event adapter

Next 的 stream route 只做一件事：

- 把 gateway SSE events 透传，或做极薄的归一化

例如：

- `state` -> progress snapshot
- `notification` -> event item
- `server-request` -> approval item
- `warning` -> warning item
- `session-closed` -> lifecycle item

也就是说，Next stream route 的职责是：

- `gateway event` -> normalized event

不是：

- `gateway event` -> `db write + local message cache + transcript merge`

## 9.3 可选增强：AI SDK UI adapter

如果后续需要统一浏览器侧消息协议，可以在主方案稳定后再补：

- `useChat`
- 自定义 transport
- `UIMessage` data parts

但这一层应该是：

- 可插拔适配层
- 不是主链路前提
- 不应反过来约束 `gateway` 的协议设计

## 10. 持久化与投影

## 10.1 写路径

所有关键交互先写 `task_events`。

assistant 最终内容也不直接由 UI 路径决定，而是：

1. events 持久化
2. projector 从 events 和必要 snapshot 提取最终 assistant message
3. projector 写 `task_messages`

## 10.2 projector

新增 projector / reconciler：

- 消费 `task_events`
- 在 turn 完成时，用最后一次 `state.snapshot` 或主动拉取一次 gateway state
- 生成稳定的 assistant message
- 更新：
  - `task_messages`
  - `tasks.status`
  - `tasks.error`
  - `tasks.progress`

要求：

- 幂等
- 可补跑
- 不依赖浏览器在线

## 10.3 为什么这能解决“刷新就没了”

因为刷新后页面看到的不是“浏览器曾经看到但还没落库的 partial assistant text”，而是：

- 活跃流可以 resume
- 历史结果来自 `task_events` 投影

只要事件和 checkpoint 在，最终消息就能恢复。

## 11. 性能优化策略

## 11.1 缩短首 token 路径

必须做：

- `prewarm` 只负责 warm prerequisites
- follow-up 默认不重新做 workspace bootstrap
- runtime lease refresh 和 stream 建立分离

尽量做到：

- 点击发送后，主路径只剩：
  - user event append
  - gateway send turn
  - stream connect

## 11.2 stream 热路径去副作用

必须删掉：

- SSE proxy 热路径里的 assistant message 写库
- 热路径 transcript merge 决策
- 热路径“数据库是否已追上”的判断

热路径只做：

- 转发 event
- 适配为轻量事件对象

## 11.3 保留 state 但降级它的职责

`state` 仍保留，用于：

- reconnect snapshot
- final transcript extraction
- debugging

但不再承担整个实时 UI 的唯一来源。

## 12. 迁移顺序

## 阶段一：事件化基础设施

- 新增 `task_events`
- 新增 `task_streams`
- 新增 event append helpers
- 保留旧 chat，不切流量

验收：

- 每次发消息后，`user_message.created` 一定存在
- 每次 turn 启动后，`turn.started` 一定存在

## 阶段二：Gateway-native V2 流链路

- 新增 `/chat/v2`
- 新增 `/chat/v2/stream`
- 新增 `useTaskAgentChatV2`
- gateway-native event adapter 落地

验收：

- 页面能看到 `notification`、`warning`、`session-closed`
- 刷新后能 resume 活跃 turn

## 阶段三：可选 AI SDK UI 适配层

- 仅在主链路稳定后评估
- 如有需要，再新增 `UIMessage` adapter
- 不影响 gateway-native 主链路

## 阶段四：投影器落地

- 新增 projector / reconciler
- `task_messages` 改成由 `task_events` 投影
- `tasks.status` 改成由 projector 统一更新

验收：

- assistant 最终消息不再依赖 stream 路径直接写库
- 同一 turn 最终只生成一份稳定 assistant message

## 阶段五：切主链路

- 任务页切到 `chat-v2`
- 旧 `use-task-chat-messages.ts` 下线
- 旧 `/chat/stream` 降级为兼容接口

## 13. 这次重构必须明确放弃的做法

- 不再继续把 `state` 当作唯一实时渲染源
- 不再继续把 assistant message 持久化放在 stream 热路径
- 不再继续在前端维护厚重的 retained streaming state
- 不再继续依赖 request-bound `after(...)` 作为唯一 completion 机制
- 不再继续把 agent runtime 当普通 chat 来设计

## 14. 成功标准

如果这次重构是成功的，必须同时满足：

1. 用户消息一发出，就稳定落成 `task_events`
2. assistant 最终结果由 event projection 生成，而不是多路补偿
3. 前端刷新后能恢复活跃 turn，而不是“流断了就只能等数据库”
4. UI 能看到 agent 过程事件，而不是只看到 transcript 文本
5. warm path 首响应时间明显接近 `codex-gateway` 自带 HTML
6. 同一个 turn 不再重复渲染、重复落库、或刷新后消失

## 15. 最终取舍

这次不建议：

- 继续在现有 `use-task-chat-messages.ts` 上补丁式修复
- 继续沿用旧版 `state-only` Sealos chat 数据层
- 直接切去一个通用 chatbot 模板
- 让 AI SDK 成为当前 `codex-gateway` 主链路的前提

这次建议：

- 保留 `Sealos + Devbox + Codex Gateway + Task` 这套后端资产
- 按 `event-first agent UI` 重做 chat 主链路
- 主实现优先贴近 `gateway-native` 的 `session + turn + events` 模型
- 用 `task_events + projector` 重建稳定持久化
- 把 `AI SDK UI` 降级为可选增强层，而不是核心依赖

这不是“又重写一遍 chat”。

这是把产品从“被错误实现成普通 chat 的 agent”纠正回真正的 `agent runtime UI`。
