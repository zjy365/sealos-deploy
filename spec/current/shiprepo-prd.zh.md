# ShipRepo 产品需求文档（PRD）

## 1. Executive Summary

ShipRepo 是一个面向开发者的云端 Sealos Deploy Agent。用户连接 GitHub 仓库后，不需要先理解 Dockerfile、构建命令、启动端口、环境变量、镜像构建、Sealos 模板和云端资源配置，就可以让 ShipRepo 分析项目、修复部署阻塞、构建镜像、创建 Sealos 预览环境，并在确认后发布为正式 Sealos 应用。

ShipRepo 的核心不是“再做一个聊天机器人”，也不是“给 Sealos 做一个部署按钮”。它要解决的是 GitHub 项目到云端可运行应用之间的长链路问题：项目能不能部署、为什么失败、缺什么配置、怎么修、能不能预览、如何上线、上线后如何继续运维。产品主线是：

```text
GitHub repo -> Analyze -> Fix -> Build -> Preview -> Ship -> Operate
```

本 PRD 面向在当前仓库内彻底重构的新 ShipRepo。重构不考虑向后兼容，旧代码只作为参考材料和可迁移资产，随时可以删除。技术架构细节单独维护在架构文档中，本 PRD 只定义产品目标、用户、范围、需求、验收标准和成功指标。

相关参考文档：

- [ShipRepo 清晰 PRD](./shiprepo-clear-prd.zh.md)
- [ShipRepo Design Brief](./shiprepo-design-brief.zh.md)
- [ShipRepo 产品说明](./reference/product-overview.zh.md)
- [ShipRepo 彻底重构架构设计](./shiprepo-full-rewrite-architecture.zh.md)
- [云端 Sealos Deploy Agent 重构架构设计](./cloud-sealos-deploy-agent-architecture.zh.md)
- [新项目初始架构设计](./new-project-initial-architecture.zh.md)
- [ShipRepo 设计规范](./shiprepo-design.zh.md)

## 2. Problem Statement

开发者已经有一个 GitHub 仓库，但从“代码存在”到“应用稳定跑在 Sealos 上”之间存在大量隐性工作：

- 不确定项目技术栈和包管理器。
- 不确定 build/start 命令。
- 不确定服务端口和监听地址。
- 缺少 Dockerfile 或 Dockerfile 不适合云端部署。
- 缺少 Sealos 模板或部署参数。
- 不知道需要哪些环境变量。
- 不知道是否依赖数据库、Redis、对象存储或外部服务。
- 构建失败时只看到日志，不知道下一步该怎么修。
- 本地能跑，但不能证明云端镜像构建、网络、端口、资源和平台配置都可用。
- 预览通过后，还需要把结果转换成正式部署并继续运维。

如果产品只是提供一个“部署”按钮，失败时用户仍然要自己读日志、补文件、改配置、重试、上线和排障。ShipRepo 要把这些步骤收敛到一个 Agent 工作台中，让 AI 帮用户完成部署生命周期，而不是只触发最后一步。

## 3. Goals & Objectives

### 3.1 Product Goals

- 让用户从 GitHub 仓库出发，完成一次可验证的 Sealos 云端预览。
- 让用户在预览通过后，可以发布为正式 Sealos 应用。
- 让部署失败可以回到同一个任务中继续分析和修复。
- 让部署相关修改可解释、可审查、可生成 PR。
- 让上线后的日志、环境变量、重部署、回滚等操作继续留在同一个工作台。

### 3.2 Business Goals

- 降低 Sealos 新用户从 GitHub 项目到云端运行应用的门槛。
- 提升 Sealos Devbox、AIProxy、模板、镜像构建和应用部署能力的串联价值。
- 把 Sealos 从“用户需要自己理解平台概念”推进到“Agent 帮用户完成平台操作”。
- 为后续团队协作、用量计费、资源运维和应用生命周期管理建立入口。

### 3.3 Product Principles

- 结果优先：用户最终需要的是可打开的预览 URL 和可上线的应用。
- 解释清楚：失败时必须解释原因和下一步，不只展示原始日志。
- 聚焦部署：Agent 可以修改代码和配置，但只围绕部署可运行性。
- 用户确认：正式发布、回滚、删除资源等高风险动作必须显式确认。
- 安全默认：凭证、私有仓库 URL、环境变量值不能出现在用户可见日志中。
- 结果居中：界面第一优先级是当前 repo 的部署结论、阻塞项、预览 URL 和下一步动作，不是展示 Agent 活动过程。
- 渐进披露：日志、diff、timeline、terminal 是辅助证据，默认不能压过用户决策。
- 克制可信：产品应表现为 Sealos 应用生命周期工作台，不应表现为 IDE、AI coding cockpit 或 DevOps 监控大屏。

## 4. Target Users

### 4.1 Primary Persona: 独立开发者 / 小团队开发者

特征：

- 有 GitHub 项目。
- 希望快速上线或给别人一个可访问预览。
- 不熟悉完整 Sealos 部署配置。
- 不想手写 Dockerfile、模板、端口和环境变量配置。

核心诉求：

- “我的项目能不能跑起来？”
- “帮我修到可以部署。”
- “给我一个能打开的云端预览。”

### 4.2 Secondary Persona: Sealos 新用户

特征：

- 对 Sealos 平台能力感兴趣。
- 可能不熟悉 Devbox、模板、镜像、资源配置。
- 希望通过自己的项目理解平台价值。

核心诉求：

- “不要先让我学一堆概念，先帮我把 repo 跑起来。”
- “如果失败，告诉我缺什么。”

### 4.3 Secondary Persona: Sealos 平台运营 / 支持人员

特征：

- 需要帮助用户从项目迁移到 Sealos。
- 需要定位部署失败原因。
- 需要沉淀常见项目的部署经验。

核心诉求：

- “把用户部署过程变得可追踪。”
- “失败时有结构化原因，而不是只有一段日志。”

## 5. Scope

### 5.1 In Scope

V1 必须覆盖：

- GitHub 登录和仓库选择。
- 创建部署任务。
- Agent 分析仓库部署就绪度。
- Agent 识别部署阻塞。
- Agent 生成或修改部署相关文件。
- 构建镜像。
- 创建 Sealos 预览环境。
- 展示预览 URL。
- 用户确认后发布正式部署。
- 任务对话和生命周期状态。
- 构建、部署和 Agent 工具调用日志，但作为可展开辅助信息。
- 文件 diff 展示，但作为修复确认和审查的辅助信息。
- 失败解释和重试。
- 用户补充环境变量或必要输入。
- 基础任务取消和资源清理。

### 5.2 Out of Scope

V1 不做：

- Electron 主产品。
- 本地 IDE 替代品。
- 通用 AI Coding Chat。
- 多云部署平台。
- Agent marketplace。
- 复杂团队/组织权限。
- 完整计费系统。
- 本地文件夹直接导入。
- 对所有语言和框架做手工规则全覆盖。
- 自动购买或创建所有云资源。
- 无用户确认的正式发布、回滚、删除。
- 从旧 ShipRepo 迁移历史任务执行状态。

## 6. User Journey

### 6.1 First-Time Flow

1. 用户打开 ShipRepo。
2. 用户使用 GitHub 登录。
3. 用户授权 ShipRepo 访问仓库。
4. 用户选择 repo 和 branch。
5. 用户输入目标，例如“帮我部署到 Sealos”。
6. ShipRepo 创建任务并进入任务工作台。
7. Agent 开始分析仓库。
8. 用户在任务工作台看到 Analyze 当前阶段、部署就绪判断和正在检查的关键项。
9. Agent 输出结构化部署结论和阻塞项。
10. 如可自动修复，Agent 进入 Fix。
11. 如需用户补充环境变量或选择，Agent 暂停并提问。
12. Agent 完成修复后执行 Build。
13. 构建成功后创建 Preview。
14. 用户打开 preview URL 验证。
15. 用户确认发布。
16. ShipRepo 创建正式部署。
17. 用户在同一工作台继续查看日志、配置和后续操作。

### 6.2 Failure Flow

1. Agent 或 Worker 在 clone、install、build、push image、deploy 任一步失败。
2. ShipRepo 保留原始日志摘要和结构化失败原因。
3. Agent 用自然语言解释失败原因。
4. 产品展示下一步选项：自动修复、用户补充信息、重试、取消。
5. 用户选择继续后，任务在同一上下文中恢复。

### 6.3 Follow-Up Flow

1. 用户回到已完成或失败的任务。
2. 用户继续提问，例如“帮我加环境变量再重部署”。
3. Agent 读取历史 task、run、deployment、artifact 上下文。
4. Agent 创建新的 run。
5. 新 run 继续使用中心任务状态，而不是依赖旧 sandbox 是否存在。

## 7. Functional Requirements

### 7.1 Authentication & Repository Access

需求：

- 用户可以使用 GitHub 登录。
- 用户可以看到自己有权限访问的仓库。
- 用户可以选择仓库和分支。
- 系统必须校验用户对仓库的访问权限。
- 系统必须保存仓库与任务的关系。

验收标准：

- 未登录用户不能创建任务。
- 用户不能访问其他用户导入的仓库记录。
- 选择 repo 后，任务能显示 owner、repo、branch。

### 7.2 Task Creation

需求：

- 用户可以基于 repo 创建部署任务。
- 用户可以输入自然语言目标。
- 任务创建后进入 task workspace。
- 任务必须有清晰状态。

验收标准：

- 创建任务后能看到 Agent 初始消息或 Analyze 状态。
- 刷新页面后任务仍然存在。
- 任务状态能区分 queued、running、waiting_for_user、preview_ready、deployed、failed、cancelled。

### 7.3 Analyze

需求：

- Agent 能分析技术栈、包管理器、构建命令、启动命令、端口、Dockerfile、环境变量、外部依赖。
- 分析结果必须结构化展示。
- 分析必须给出部署就绪判断。

验收标准：

- 用户能看到“可直接预览 / 需要修复 / 需要补充信息 / 当前无法部署”之一。
- 用户能看到主要阻塞项。
- 用户能看到 Agent 对阻塞项的解释。

### 7.4 Fix

需求：

- Agent 可以生成或修改部署相关文件。
- Agent 可以修复 build/start 命令、端口、健康检查、Dockerfile、Sealos 模板。
- Agent 必须展示 diff。
- 用户可决定是否创建 PR 或只用于预览构建。

验收标准：

- 每次文件修改都有 diff。
- 修改范围能说明和部署目标的关系。
- Agent 不应主动做无关功能开发或大规模重构。

### 7.5 Build

需求：

- 系统可以在云端执行构建。
- 系统可以构建镜像。
- 系统可以推送镜像到配置的 registry。
- 构建日志可实时查看。

验收标准：

- 用户能看到 build started、build output、build completed 或 build failed。
- 构建失败时能看到失败摘要。
- 构建成功后能看到 image tag 或 artifact 摘要。

### 7.6 Preview

需求：

- 系统可以创建 Sealos 预览部署。
- 预览部署必须返回 URL 或明确失败原因。
- 用户可以打开预览 URL 验证。
- 预览状态可查询。

验收标准：

- preview 创建成功后显示 URL。
- preview 失败时显示失败原因和下一步建议。
- 用户可以从任务工作台进入 preview。

### 7.7 Ship

需求：

- 用户确认 preview 后，可以发布正式部署。
- 正式发布前必须有确认动作。
- 发布结果需要保存为 deployment 记录。

验收标准：

- 未确认时不能自动发布正式部署。
- 发布成功后任务状态变为 deployed。
- 用户能看到正式部署 URL 和状态。

### 7.8 Operate

需求：

- 用户可以查看部署日志。
- 用户可以请求 Agent 解释运行错误。
- 用户可以修改环境变量并重部署。
- 用户可以回滚部署。

验收标准：

- 日志和错误解释在同一任务工作台中展示。
- 修改环境变量不会暴露明文值到日志。
- 回滚前必须确认。

### 7.9 Timeline & Events

需求：

- 所有关键步骤都进入 timeline。
- 页面刷新后 timeline 可恢复。
- 事件流断开后可重连。

验收标准：

- 用户能按时间顺序看到 Agent plan、tool call、sandbox、build、deployment 事件。
- 断线重连后不会丢事件。
- 同一个任务中消息和生命周期状态一致。

### 7.10 Security & Isolation

需求：

- 所有用户资源必须做 ownership check。
- 所有凭证加密存储。
- 所有用户可见日志必须脱敏。
- artifact 下载必须经 API 授权。

验收标准：

- 用户 A 不能访问用户 B 的 task、event、artifact、deployment。
- token、私有 repo URL、环境变量值不会出现在用户可见日志中。
- 过期或无权限的 artifact URL 不能访问。

## 8. Non-Functional Requirements

### 8.1 Reliability

- 长任务必须通过 queue/worker 执行。
- Worker 崩溃后 job 可重试或标记失败。
- Sandbox 丢失后任务不能丢失。
- Agent 会话状态必须独立于 sandbox 生命周期。

### 8.2 Performance

- 任务创建接口应快速返回。
- 日志和事件应流式展示。
- 大日志应转存 object storage。
- 前端不应一次性拉取所有历史日志。

### 8.3 Security

- 所有 secret 必须加密存储。
- Worker 只拿当前 job 所需的 scoped credential。
- 生产发布、回滚和删除资源必须用户确认。
- 日志系统默认脱敏。

### 8.4 Usability

- 用户不需要理解 Devbox、registry、模板等底层概念才能完成第一条路径。
- UI 必须突出生命周期状态，而不是只有聊天窗口。
- 失败时必须给出可行动的下一步。

## 9. Success Metrics

### 9.1 North Star Metric

**成功创建 Sealos 预览的仓库任务数。**

这个指标代表 ShipRepo 的核心价值：把一个 GitHub repo 推进到可验证的 Sealos 云端运行状态。

### 9.2 Activation Metrics

- 新用户首次连接 GitHub 的完成率。
- 连接 GitHub 后首次创建任务的完成率。
- 创建任务后进入 Analyze 的成功率。
- 首次任务生成 preview URL 的成功率。

### 9.3 Task Success Metrics

- Analyze 完成率。
- 自动修复成功率。
- Build 成功率。
- Preview 创建成功率。
- Preview 到正式 Ship 的转化率。
- 失败任务中用户继续重试或补充信息的比例。

### 9.4 Quality Metrics

- Agent 失败解释被用户继续采用的比例。
- 用户因缺少环境变量进入 waiting_for_user 后恢复成功率。
- 生成 PR 的接受率。
- 用户手动取消任务比例。

### 9.5 Reliability Metrics

- Worker job 失败率。
- Sandbox 创建失败率。
- Event stream 重连成功率。
- 长任务超时率。
- 沙盒资源超时清理成功率。

## 10. MVP Definition

MVP 必须证明一件事：

> 用户可以选择一个 GitHub repo，让 ShipRepo 在云端分析、构建并创建一个可打开的 Sealos preview URL。

### 10.1 MVP Must Have

- GitHub 登录。
- Repo 和 branch 选择。
- Task workspace。
- 中心 Agent run。
- Analyze 输出。
- Devbox sandbox 创建。
- Repo clone。
- 构建命令或 Docker build。
- 构建日志。
- Sealos preview 创建。
- Preview URL 展示。
- 失败解释。
- 基础任务 timeline。
- 用户隔离和日志脱敏。

### 10.2 MVP Should Have

- 文件 diff 展示。
- 自动生成 Dockerfile。
- 用户补充环境变量。
- 重试失败步骤。
- artifact 保存。

### 10.3 MVP Could Have

- 创建 GitHub PR。
- 正式 Ship。
- 回滚。
- 域名绑定。
- 数据库/Redis/对象存储资源建议。

## 11. Design & UX Requirements

详细视觉规范、主题 token、页面布局和反例见 [ShipRepo 设计规范](./shiprepo-design.zh.md)。本 PRD 只固定产品级体验约束。

### 11.1 Product Experience Boundary

ShipRepo 的任务工作台不是通用 AI Coding Console、不是 IDE、不是 terminal-first 运维控制台，也不是多栏 DevOps cockpit。Codex、Devbox、worker、logs、diff、timeline 都是完成 Sealos 部署生命周期的手段，不是界面中心。

用户进入任意任务页时，第一眼必须能回答：

1. 这个 repo 当前处于哪个部署阶段？
2. 它现在能不能创建 Sealos preview？
3. 如果不能，卡在哪里？
4. 用户下一步应该做什么？

如果一个设计第一眼更像“看 Agent 干活”，而不是“确认 repo 到 Sealos 的结果”，则不符合本 PRD。

### 11.2 Core Workspace Model

Task workspace 必须以“当前阶段结果 + 下一步动作”为中心，而不是以聊天、日志、diff 或 timeline 为中心。

推荐信息层级：

```text
Header:
  repo / branch / task status / primary action

Primary result area:
  current lifecycle stage
  deployment readiness result
  blockers or missing inputs
  preview URL or failure summary
  next user action

Supporting context:
  short Agent explanation
  lifecycle stepper
  latest relevant event

Progressive details:
  timeline
  logs
  diff
  artifacts
  deployment records
```

这些模块可以在同一个页面出现，但不能以等权重多栏方式铺满屏幕。默认视图应让用户先看到结论，再按需展开证据。

### 11.3 Lifecycle Stage Display

每个阶段都有自己的主对象：

- `Analyze`：部署就绪度、技术栈判断、缺失配置、外部依赖、阻塞项。
- `Fix`：修复方案、影响文件、diff 摘要、是否需要用户确认。
- `Build`：构建状态、失败摘要、产物或镜像摘要。
- `Preview`：Sealos preview URL、运行状态、访问检查、用户验收动作。
- `Ship`：正式发布确认、资源规格、域名或正式 URL、发布状态。
- `Operate`：日志摘要、运行错误解释、env 变更、重部署、回滚。

当前阶段的主对象必须比聊天记录、原始日志和工具调用更突出。

### 11.4 Interaction Principles

- 默认显示当前最重要状态，不默认展开完整日志。
- 用户每个时刻只应该看到一个明显主动作。
- Agent 解释必须短、具体、可行动。
- Preview URL 是核心成果，应明显展示。
- 用户需要补充信息时，界面应进入明确的 waiting state，并只要求补当前阻塞所需的信息。
- 高风险动作必须通过明确确认触发，包括正式发布、回滚、删除资源、写入生产配置。
- 对话框和聊天输入是 follow-up 入口，不应抢占生命周期结果区域。

### 11.5 Required States

任务工作台至少要覆盖这些状态：

- `empty/repo selected`：用户已选 repo，但尚未创建任务。
- `queued`：任务已创建，等待执行。
- `analyzing`：正在分析 repo。
- `needs_fix`：发现部署阻塞，可自动修复或等待用户确认。
- `waiting_for_user`：缺少 env、资源选择或发布确认。
- `building`：正在构建镜像或产物。
- `preview_ready`：Sealos preview URL 可用。
- `deployed`：正式部署完成。
- `failed`：失败并提供原因、下一步和可重试入口。
- `cancelled/cleaned`：任务已取消或资源已清理。

### 11.6 Visual Direction

ShipRepo 应保持可靠、方便、冷静、克制的产品气质。视觉方向是偏极简的 Web 产品工作台，而不是深色科幻控制台。

硬性要求：

- 支持 light/dark theme。
- 默认视觉应 calm、restrained、premium。
- 使用设计规范中的 OKLCH theme token。
- 主色只用于关键动作、状态和少量品牌识别。
- 避免装饰性背景、发光边框、霓虹蓝紫、过度网格线和过密 mono 标签。
- 不要把 monospace 当作“技术感”的主要视觉语言。
- 不要用大面积终端、代码块、工具调用列表作为首屏主体。

### 11.7 Explicit Anti-References

以下设计方向不符合本 PRD：

- 暗色 IDE 复制品。
- 左侧工具导航 + 中间 Agent chat + 右侧状态栏 + 底部 terminal/logs 的 cockpit。
- 以 timeline/logs/diff/artifacts 作为首屏等权重导航。
- 让用户感觉自己在操作一个 Agent 调试器，而不是推进 Sealos 部署。
- 大量 icon-only 工具栏、设置按钮、通知按钮、terminal 按钮堆叠。
- 蓝紫霓虹、glow、cyber dashboard、AI demo 页面。
- 把 Agent avatar、Agent 状态、工具调用细节做成页面主角。

### 11.8 UX Acceptance Criteria

设计稿或前端实现必须满足：

- 首屏能清楚显示 repo、branch、当前阶段和下一步动作。
- Analyze 完成后，用户能在不打开日志的情况下理解部署结论。
- Preview 成功后，preview URL 必须是页面中最容易找到的结果。
- 失败时必须先显示结构化原因和建议动作，再提供原始日志。
- Logs、diff、timeline、artifacts 可访问，但默认不应压过核心结果。
- 页面在 light 和 dark theme 下都应保持克制、可读和可信。
- 如果去掉所有日志和工具调用细节，用户仍然能完成主流程。

## 12. Technical Considerations

详细技术架构见：

- [云端 Sealos Deploy Agent 重构架构设计](./cloud-sealos-deploy-agent-architecture.zh.md)
- [新项目初始架构设计](./new-project-initial-architecture.zh.md)

本 PRD 只固定以下产品级技术决策：

- 在当前仓库内彻底重构，不新建空仓库。
- 不考虑向后兼容，旧代码只作为参考，随时可以删除。
- 使用 Web-first 产品形态。
- 前端使用 Vite + React。
- 后端 API 使用 Hono。
- 前后端彻底分离。
- 中心 Agent 独立于 Devbox 生命周期。
- Devbox 只作为临时执行环境。
- 长任务通过 queue/worker 执行。
- 所有任务事件中心化。
- 用户可见日志必须脱敏。

## 13. Timeline & Milestones

### Phase 1: Product Skeleton

目标：证明新产品的中心控制面成立。

交付：

- Web skeleton。
- API skeleton。
- Task 创建。
- Message 创建。
- Event stream。
- Agent mock run。
- Worker mock job。
- Task workspace 展示 timeline。

验收：

- 用户能创建 task。
- Agent 能写入 plan event。
- Web 能实时展示事件。

### Phase 2: Cloud Execution

目标：证明 Devbox 工具化执行成立。

交付：

- Devbox sandbox create/destroy。
- GitHub repo clone。
- exec command。
- logs streaming。
- basic Analyze。

验收：

- ShipRepo 能分析真实 repo 的技术栈、包管理器和构建入口。

### Phase 3: Preview MVP

目标：证明 repo-to-Sealos preview 的核心价值。

交付：

- Dockerfile 生成或修复。
- Build image。
- Push image。
- Create Sealos preview。
- Preview URL 展示。
- 失败解释和重试。

验收：

- 至少一个真实 GitHub repo 能通过 ShipRepo 得到可打开的 Sealos preview URL。

### Phase 4: Ship & Operate

目标：从预览走向应用生命周期工作台。

交付：

- Preview promote to production。
- Deployment logs。
- Env update。
- Redeploy。
- Rollback。
- Optional PR creation。

验收：

- 用户能从 preview 发布正式部署，并在同一任务中继续运维。

## 14. Risks & Mitigation

### 14.0 Coding Executor 决策

决策：V1 选择 Codex app server 作为 ShipRepo 的 coding executor。

原因：

- 当前已验证的 skills 在 Codex 里效果符合预期。
- ShipRepo 的核心风险不是“能不能调模型”，而是 coding agent 是否能稳定完成 repo 分析、文件判断、Dockerfile/template 生成、命令执行和失败修复。
- 自研 Agent、OpenAI Agents SDK、Pi、CC 源码或其他开源框架短期都需要重新证明 coding 效果，不应压到 V1 主链路。

产品边界：

- ShipRepo 自建 control plane 和 Agent Orchestrator。
- Codex app server 只作为内部 coding executor。
- gateway 负责把 app server 包装成更适合 Web 产品使用的 session、turn、events、SSE、TTL 和鉴权边界。
- GitHub push、registry push、Sealos deploy 等高权限动作优先放在 ShipRepo control plane / worker 中完成，而不是让 Devbox 长期持有高权限 token。

### 14.1 Agent 多租户风险

风险：Codex app server 不适合直接作为多租户中心 Agent。

缓解：

- 自建 Agent Orchestrator。
- Codex app server 只作为内部执行引擎。
- 通过 gateway 包装 app server，而不是让浏览器或产品后端直接裸连 app server WebSocket。
- session、权限、工具调用和事件写入由 Orchestrator 控制。

### 14.2 成本风险

风险：Devbox、构建和 Agent 调用成本不可控。

缓解：

- 用户 quota。
- task 并发限制。
- sandbox TTL。
- job timeout。
- cleanup jobs。

### 14.3 安全风险

风险：日志或 Agent 输出暴露 repo URL、token、环境变量。

缓解：

- 日志默认脱敏。
- 用户可见日志和内部诊断分离。
- 凭证只通过 scoped tool context 传递。

### 14.4 产品范围扩散

风险：产品被拉成通用 AI coding console。

缓解：

- V1 严格围绕 Sealos 部署生命周期。
- 所有 Agent 修改必须能解释和部署目标的关系。

## 15. Dependencies & Assumptions

### 15.1 Dependencies

- GitHub OAuth 或 GitHub App。
- Sealos API。
- Devbox API。
- 镜像 registry。
- AI Gateway 或模型服务。
- PostgreSQL。
- Redis 或可替代队列。
- Object Storage。

### 15.2 Assumptions

- 用户的主要入口是 GitHub repo。
- 用户愿意授权 ShipRepo 访问仓库。
- Sealos preview URL 是用户可验证的核心成果。
- 大部分早期目标项目可以通过 Dockerfile/image/deployment path 覆盖。
- 用户愿意在正式发布前做一次显式确认。

## 16. Open Questions

这些问题不阻塞 PRD 成立，但会影响实施方案：

1. 新项目名称是否继续叫 ShipRepo？
2. GitHub 权限模型优先用 OAuth App 还是 GitHub App？
3. V1 是否必须支持私有仓库？
4. V1 registry 使用 Sealos 内置 registry、Docker Hub，还是自建 registry？
5. Sealos preview 的具体资源模型是直接创建 app，还是先生成 template？
6. 是否要求 V1 支持创建 GitHub PR？
7. V1 是否需要正式 Ship，还是先只做到 Preview？
8. 队列优先使用 Redis/BullMQ，还是先用数据库队列表降低部署依赖？

## 17. Sign-Off Checklist

- [ ] 产品定位确认：ShipRepo 是 Sealos Deploy Agent，不是通用 AI Coding Chat。
- [ ] 主形态确认：Web-first，不做 Electron 主产品。
- [ ] MVP 确认：至少跑通 GitHub repo 到 Sealos preview URL。
- [ ] 高风险动作确认：Ship、rollback、delete 必须用户确认。
- [ ] 安全要求确认：日志脱敏、凭证加密、用户隔离。
- [ ] 技术方向确认：中心 Agent + Codex app server executor + gateway 包装层 + 临时 Devbox 执行环境。
