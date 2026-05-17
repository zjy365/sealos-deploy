# 二开快速上手与代码库深度解析

这份文档面向准备在当前项目上做二次开发的人。

目标不是重复 README，而是回答这几个更实际的问题：

- 这个项目的真正主干是什么
- 一个任务从前端提交到 sandbox 执行完成，中间经过了哪些关键节点
- GitHub、会话、数据库、sandbox、agent 各自负责什么
- 如果你准备裁剪功能、替换鉴权方式、增加新能力，应该优先看哪些文件
- 当前代码里有哪些结构性风险，二开前最好先有心理预期

## 1. 项目定位

当前仓库本质上是一个 `AI Coding Agent 控制台`：

- 前端用 Next.js App Router 提供任务创建、任务列表、日志查看、仓库浏览、PR 操作等界面
- 后端 API 接收任务后，把任务持久化到 PostgreSQL
- 然后通过 Vercel Sandbox 创建隔离运行环境
- 将目标仓库克隆进 sandbox
- 调用不同的 agent CLI 在仓库里执行编码任务
- 最后生成 commit，推送到 GitHub 分支，并可进一步创建/合并 PR

从架构角度看，这不是一个单纯的聊天产品，也不是一个纯 GitHub 工具，而是：

1. `任务编排系统`
2. `代码执行系统`
3. `GitHub 集成系统`
4. `多 agent 适配层`

## 2. 技术栈与运行时角色

核心依赖见 `package.json`：

- `next` + `react`：前端与 API 路由承载
- `drizzle-orm` + `postgres` + `@neondatabase/serverless`：数据层
- `@vercel/sandbox`：隔离执行环境
- `@octokit/rest`：GitHub REST API 调用
- `jose`：JWE 会话加解密
- `jotai`：前端轻量状态
- `zod`：输入校验与 schema 辅助

这个项目同时有三类“运行环境”：

### 2.1 Next.js Server Runtime

负责：

- 登录态读取
- 任务 API
- GitHub API 转发
- 数据库读写
- 触发后台 `after()` 任务

### 2.2 浏览器前端

负责：

- 提交任务
- 轮询任务状态
- 展示日志、差异、文件、PR 状态
- 浏览仓库的 commits/issues/pull requests

### 2.3 Vercel Sandbox

负责：

- 克隆目标仓库
- 安装依赖
- 调用 agent CLI
- 在仓库内执行 git add / commit / push

这三层的边界很重要。二开时最常见的问题，就是把本应发生在 sandbox 的事写到了 Next.js 服务器里，或者把本应在服务端保密的数据泄漏到了浏览器。

## 3. 先读哪些文件

如果你只想快速建立全局心智模型，建议按下面顺序读：

1. `lib/db/schema.ts`
2. `app/api/tasks/route.ts`
3. `lib/sandbox/creation.ts`
4. `lib/sandbox/agents/index.ts`
5. `lib/sandbox/git.ts`
6. `lib/github/client.ts`
7. `components/home-page-content.tsx`
8. `components/task-form.tsx`
9. `components/app-layout.tsx`
10. `components/repo-layout.tsx`

原因很简单：

- `schema.ts` 告诉你系统存什么
- `tasks/route.ts` 告诉你系统怎么跑
- `sandbox/*` 告诉你代码在哪执行
- `github/*` 告诉你仓库权限从哪来
- `components/*` 告诉你用户操作如何进入后端链路

## 4. 顶层页面与布局结构

### 4.1 根布局

入口是 `app/layout.tsx`。

这里挂了几个全局能力：

- `JotaiProvider`
- `ThemeProvider`
- `SessionProvider`
- `AppLayoutWrapper`
- `Toaster`
- Vercel Analytics / SpeedInsights

说明这个项目把“页面骨架”和“业务内容”分开了。绝大多数业务页最终都包在 `AppLayoutWrapper -> AppLayout` 里面。

### 4.2 应用级布局

`components/app-layout-wrapper.tsx` 主要做两件事：

- 从 cookie 读取 sidebar 状态
- 用 user-agent 粗略判断移动端

`components/app-layout.tsx` 才是实际的应用外壳：

- 左侧任务侧栏
- 主内容区
- `TasksContext`
- `ConnectorsProvider`

这里的 `TasksContext` 很关键，它给前端很多页面提供了几个基础能力：

- `refreshTasks`
- `toggleSidebar`
- `addTaskOptimistically`

如果你以后新增“从任意页面发起任务”的能力，基本都会复用这里的 optimistic task 机制。

### 4.3 首页

首页入口是 `app/page.tsx`，真正渲染逻辑在 `components/home-page-content.tsx`。

首页会读取一批 cookie 初始化用户选择：

- 选中的 owner/repo
- 是否安装依赖
- 最大运行时长
- keepAlive
- 是否启用浏览器

这说明首页不是无状态表单，而是“任务配置工作台”。

`HomePageContent` 负责：

- repo selector
- GitHub 连接状态提示
- 新建 repo
- 通过 repo URL 打开仓库
- 提交任务

如果你准备把首页改造成“场景化任务入口”，这是最先需要动的页面。

## 5. 数据模型总览

核心 schema 在 `lib/db/schema.ts`。

### 5.1 users

`users` 表表示系统用户以及其主登录方式。

字段重点：

- `provider`: `github | vercel`
- `externalId`
- `accessToken`
- `refreshToken`
- `username/email/name/avatarUrl`

注意：这里不是“纯用户资料表”，而是把“用户身份”和“主 OAuth 账户”绑在一起了。

### 5.2 accounts

`accounts` 表表示额外连接的账户，目前只支持 GitHub。

这张表的语义是：

- 用户主登录方式可能是 Vercel
- 但仍然可以额外连接一个 GitHub 账户供仓库操作使用

这也是当前项目为什么会区分：

- `users.provider === github`
- `accounts.provider === github`

### 5.3 tasks

`tasks` 是整个系统的主表。

它存了任务完整生命周期需要的大部分状态：

- 基本输入：`prompt`, `repoUrl`, `selectedAgent`, `selectedModel`
- 运行配置：`installDependencies`, `maxDuration`, `keepAlive`, `enableBrowser`
- 运行状态：`status`, `progress`, `error`
- 运行产物：`branchName`, `sandboxId`, `sandboxUrl`, `previewUrl`
- PR 产物：`prUrl`, `prNumber`, `prStatus`, `prMergeCommitSha`
- 连接器：`mcpServerIds`
- 日志：`logs`

如果你要做新的任务能力，比如：

- 多阶段工作流
- 人工审批节点
- 多仓库任务
- 回滚/重试策略

第一步通常是重新审视 `tasks` 表结构是否够用。

### 5.4 task_messages

`task_messages` 用来存任务上下文消息，只分两种角色：

- `user`
- `agent`

它不是完整聊天系统，更像“任务会话摘要记录”。

### 5.5 connectors

`connectors` 表示可用的 MCP 连接配置。

支持：

- `remote`
- `local`

还会加密保存：

- `oauthClientSecret`
- `env`

这部分是 Claude/MCP 扩展能力的入口。

### 5.6 keys

`keys` 存用户私有 API key：

- `anthropic`
- `openai`
- `cursor`
- `gemini`
- `aigateway`

这些 key 在任务启动前会被取出，再注入到 agent 执行环境。

## 6. 认证与会话模型

### 6.1 当前项目的实际做法

当前项目不是 GitHub App 架构，而是：

- 用户通过 GitHub OAuth 或 Vercel OAuth 登录
- 系统把 OAuth token 加密后存入数据库
- 服务端按当前登录用户取 token
- 用用户 token 调 GitHub REST API

所以当前 GitHub 能力是“以用户身份操作 GitHub”，不是“以 installation 身份操作 GitHub”。

### 6.2 会话是怎么存的

会话类型在 `lib/session/types.ts`。

核心结构：

- `Session.authProvider`
- `Session.user`

服务端读取会话主要走：

- `lib/session/server.ts`
- `lib/session/get-server-session.ts`

它本质上是：

- 从 cookie 取 JWE
- 解密后得到 session

### 6.3 GitHub 登录流程

GitHub 登录相关文件：

- `app/api/auth/signin/github/route.ts`
- `app/api/auth/github/callback/route.ts`
- `lib/session/create-github.ts`

流程是：

1. 生成 state
2. 重定向到 GitHub authorize
3. callback 中用 `code` 换 `access_token`
4. 拉 GitHub user 信息
5. 写入 `users` 或 `accounts`
6. 生成 JWE session cookie

### 6.4 Vercel 登录流程

Vercel 登录是另一套平行机制，相关逻辑主要在：

- `lib/session/create.ts`
- `app/api/auth/info/route.ts`
- `lib/session/get-oauth-token.ts`

### 6.5 如果你不需要 GitHub OAuth App

如果你的二开方向是不再依赖“GitHub OAuth 登录”，这件事要分两层理解：

#### 可以先不关注的部分

- GitHub 作为主登录 provider 的整套 UI 与 callback

#### 不能直接忽略的部分

- 当前任务执行链默认要求有 GitHub token
- 私有仓库 clone 依赖 GitHub token 注入 URL
- 仓库浏览 API 也依赖 GitHub token

也就是说，`不需要 GitHub OAuth 登录` 不等于 `GitHub 相关逻辑都可以删掉`。

如果你准备换成：

- GitHub App
- PAT
- 只支持公开仓库

那就要改的是 token 来源，而不是只删登录按钮。

## 7. GitHub 集成是怎么工作的

### 7.1 统一的 token 读取逻辑

GitHub token 获取入口是 `lib/github/user-token.ts`。

查询顺序：

1. 当前用户在 `accounts` 表里的 GitHub token
2. 当前用户在 `users` 表里的主 GitHub token

这让系统可以支持两种情况：

- 用户本来就是 GitHub 登录
- 用户是 Vercel 登录，但额外连接 GitHub

### 7.2 Octokit 客户端

`lib/github/client.ts` 负责：

- 生成带用户 token 的 Octokit
- 解析 repo URL
- 创建 PR
- merge PR
- 查询 PR 状态

这个文件的定位很重要：

- 它不是 GitHub API 全量封装
- 它是当前业务确实用到的一层薄封装

如果你准备扩 GitHub 功能，建议继续沿用这里的集中封装，而不是在 API route 里到处手写 `new Octokit(...)`。

### 7.3 仓库浏览 API

相关路由：

- `app/api/github/user-repos/route.ts`
- `app/api/repos/[owner]/[repo]/commits/route.ts`
- `app/api/repos/[owner]/[repo]/issues/route.ts`
- `app/api/repos/[owner]/[repo]/pull-requests/route.ts`

这些路由几乎都是：

1. 检查当前用户 session
2. 取 GitHub token
3. 调 GitHub REST API
4. 把结果透传给前端

属于很典型的 BFF 风格。

### 7.4 创建仓库

`app/api/github/repos/create/route.ts` 支持：

- 给个人账户创建仓库
- 给组织创建仓库
- 从模板仓库复制文件

这个路由可以看作一个独立功能模块。它和任务执行链无强耦合，但在产品体验上与首页 repo selector 联动。

## 8. 任务执行主链路

这是整个项目最重要的一部分。

核心入口：`app/api/tasks/route.ts`

### 8.1 创建任务时发生了什么

`POST /api/tasks` 流程：

1. 校验 session
2. 检查 rate limit
3. 校验入参并写入 `tasks`
4. 用 `after()` 异步生成 title 和 branchName
5. 提前获取用户 GitHub token、GitHub 用户信息、API keys
6. 再用 `after()` 异步进入真正的任务执行

注意这里的设计选择：

- HTTP 请求先快速返回
- 真正重活在响应后继续执行

这是整个系统能在 serverless 环境里跑起来的关键技巧之一。

### 8.2 超时控制

`processTaskWithTimeout()` 负责总超时与超时前预警。

它会：

- 在快超时前打一条 warning log
- 用 `Promise.race` 包住真正任务
- 超时后把任务标记为 `error`

这层是任务编排器，不做业务细节，只做生命周期控制。

### 8.3 真正执行任务

真正业务在 `processTask()`。

执行顺序大致是：

1. 把任务状态改成 `processing`
2. 保存用户消息到 `task_messages`
3. 等待 AI 生成 branch name
4. 检测项目端口
5. 创建 sandbox
6. 记录 sandbox 信息到任务表
7. 拉取已连接的 MCP connectors
8. 调用 agent CLI
9. 保存 agent 回复
10. 生成 commit message
11. 提交并推送 git
12. 更新任务状态为 `completed` 或 `error`

如果你要插入新的执行节点，比如：

- 任务预处理
- 上下文聚合
- 代码审计
- 自动测试门禁
- PR 描述生成

最合适的位置通常就是在 `processTask()` 这条顺序链里扩展。

## 9. Sandbox 层怎么工作

### 9.1 为什么 sandbox 是核心

很多人第一次读这个仓库，会以为 agent 是核心；其实不是。

真正把整个系统串起来的是 sandbox 层，因为：

- 代码操作发生在 sandbox
- git 操作发生在 sandbox
- agent CLI 发生在 sandbox
- 依赖安装也发生在 sandbox

没有这层，系统就只是个任务面板。

### 9.2 sandbox 创建流程

关键文件：

- `lib/sandbox/creation.ts`
- `lib/sandbox/config.ts`
- `lib/sandbox/commands.ts`

`createSandbox()` 做的事情：

1. 校验环境变量与 token
2. 构造带 GitHub 认证的仓库 URL
3. 创建 Vercel Sandbox
4. 在 sandbox 中创建项目目录
5. `git clone` 目标仓库
6. 按项目类型尝试安装依赖

### 9.3 仓库认证方式

`lib/sandbox/config.ts` 里的 `createAuthenticatedRepoUrl()` 会把 GitHub token 写进 URL：

- `https://<token>:x-oauth-basic@github.com/...`

这意味着当前 clone 私有仓库的能力完全依赖 GitHub token。

如果你未来想改成：

- GitHub App installation token
- deploy key
- 只支持公开仓库

这里是必改点。

### 9.4 sandbox 命令执行抽象

`lib/sandbox/commands.ts` 提供三层命令抽象：

- `runCommandInSandbox`
- `runInProject`
- `runStreamingCommandInSandbox`

这是二开时非常值得复用的一层。不要在别处重复写 `sandbox.runCommand` 包装。

## 10. Agent 适配层

入口在 `lib/sandbox/agents/index.ts`。

这个文件的角色是：

- 按 agent 类型分发到不同执行器
- 临时把 API key 和 GitHub token 注入 `process.env`
- 执行结束后恢复原环境变量

当前支持：

- `claude`
- `codex`
- `copilot`
- `cursor`
- `gemini`
- `opencode`

这里的设计是典型的“策略分发器”。

如果你准备新增 agent，最合适的做法是：

1. 新增 `lib/sandbox/agents/<agent>.ts`
2. 在 `index.ts` 中扩展 `AgentType`
3. 在前端 `TaskForm` 增加 agent 与模型配置
4. 在 `validateEnvironmentVariables()` 增加该 agent 的 key 校验

## 11. Git 提交与推送

`lib/sandbox/git.ts` 负责提交与推送：

1. `git status --porcelain`
2. `git add .`
3. `git commit -m ...`
4. `git push origin <branch>`

这个模块目前很薄，但职责很集中。以后如果你要加：

- 更细粒度的暂存策略
- 自动 squash
- 推送失败后重试
- push 前测试

都应该先从这个文件切入。

## 12. 仓库页结构

仓库页走的是你在 `AGENTS.md` 里描述的嵌套路由模式：

- `app/repos/[owner]/[repo]/layout.tsx`
- `app/repos/[owner]/[repo]/page.tsx`
- `app/repos/[owner]/[repo]/commits/page.tsx`
- `app/repos/[owner]/[repo]/issues/page.tsx`
- `app/repos/[owner]/[repo]/pull-requests/page.tsx`

对应布局组件在 `components/repo-layout.tsx`。

目前它的职责很单纯：

- 渲染 tab
- 提供 “New Task with this repo”
- 承载子页面

这是个很好的二开点，因为边界清晰，不容易牵一发动全身。

### 12.1 Commits 页的价值

`components/repo-commits.tsx` 不只是列表页，它还提供了一个很有代表性的模式：

- 从 GitHub API 拉 commits
- 用户在列表页上点 “Revert”
- 前端把 commit 信息翻译成自然语言 prompt
- 再走统一 `/api/tasks` 链路

这是当前仓库里非常值得复用的交互模式：

`任何仓库动作，都可以翻译成任务 prompt，再交给 agent 执行`

如果以后你要加：

- cherry-pick
- backport
- summarize issue
- resolve failing check

都可以沿用这个模式。

## 13. Connectors / MCP 扩展

相关文件：

- `components/connectors-provider.tsx`
- `app/api/connectors/route.ts`
- `lib/actions/connectors.ts`

这部分做了三件事：

1. 保存连接器配置到数据库
2. 对敏感字段加密存储
3. 在任务执行时把已连接的 connector 取出来注入 agent

当前实现说明一件事：

这个项目从一开始就不是封闭的，它预留了“让 agent 获得外部工具”的扩展方向。

如果你后续准备做更强的外部系统集成：

- Jira
- Linear
- 自定义知识库
- 内部 API

优先复用 connectors 这条链路，而不是另起一个平行配置系统。

## 14. API Keys 模型

`lib/api-keys/user-keys.ts` 会优先取用户私有 key，不存在时再回退到系统环境变量。

这带来了两个产品能力：

- 多租户
- 用户自带模型凭证

也带来一个技术含义：

很多 agent 行为不是“全局配置”，而是“用户级配置”。

如果你要做企业版、多组织版或按团队隔离配置，这里会是改造重点。

## 15. 日志与状态更新机制

日志主类在 `lib/utils/task-logger.ts`。

当前机制很简单：

- 从任务表读出已有 logs
- 在内存里拼接新数组
- 再写回任务表

优点：

- 容易理解
- 实现成本低

缺点也很明显：

- 高并发写日志时存在竞态覆盖风险
- `logs` 放在任务主表里，越跑越大
- 不适合真正高频流式日志

如果你要做更重的任务系统，建议尽早考虑把日志拆成单独表。

## 16. 当前代码的关键风险与二开建议

这一节很重要。下面这些点不是“代码风格建议”，而是实际会影响二开的结构性问题。

### 16.1 用户级 token 是强依赖

当前任务执行默认要求 `githubToken` 存在。

影响：

- 不接 GitHub 就跑不起来
- 只支持公开仓库时也会被拦住
- 想换 GitHub App 时改动面会比较大

建议：

- 尽早把 “token 来源” 抽成接口
- 不要继续把用户 OAuth token 深埋到 sandbox 层

### 16.2 agent 注入 key 的方式有并发风险

`lib/sandbox/agents/index.ts` 通过修改 `process.env` 注入用户 key。

这在单请求思维下能跑，但从隔离性角度不够稳。

建议：

- 中期改为按进程参数、临时 env 文件或 sandbox 内局部 env 注入
- 避免直接改宿主进程全局环境

### 16.3 日志实现偏原型化

`TaskLogger` 读改写数组的方式适合 MVP，不适合高并发和长任务。

建议：

- 如果要加强实时性，拆 `task_logs` 表
- 如果要支持 websocket/streaming，改为 append-only 模型

### 16.4 安全规范与实际实现不完全一致

仓库的 `AGENTS.md` 明确要求：

- 用户可见日志必须是静态字符串
- 不应记录动态敏感值

但当前实现里：

- sandbox 命令会把动态命令内容写入日志
- stdout/stderr 也会进入日志
- git 错误信息也可能被写入日志

虽然有 `redactSensitiveInfo()` 兜底，但这和“默认静态日志”的原则并不一致。

建议：

- 如果你准备长期维护这个项目，优先修这个问题
- 至少先区分“用户可见日志”和“服务端调试日志”

### 16.5 session 访问时机不统一

任务创建时会在进入 `after()` 前提前取 token，但后续又在任务链内部重新尝试读 session 取 connectors。

建议：

- 把任务执行所需的全部上下文在进入后台任务前准备好
- 不要在后台异步链路里再依赖 request/session 上下文

## 17. 二开时的推荐阅读顺序

如果你准备真正动手改，建议这样进入：

### 场景 A：改首页和任务创建体验

优先读：

- `components/home-page-content.tsx`
- `components/task-form.tsx`
- `components/repo-selector.tsx`
- `app/api/tasks/route.ts`

### 场景 B：改任务执行逻辑

优先读：

- `app/api/tasks/route.ts`
- `lib/sandbox/creation.ts`
- `lib/sandbox/agents/index.ts`
- `lib/sandbox/git.ts`

### 场景 C：改 GitHub 集成方式

优先读：

- `lib/github/user-token.ts`
- `lib/github/client.ts`
- `lib/sandbox/config.ts`
- `app/api/github/user-repos/route.ts`
- `app/api/github/repos/create/route.ts`

### 场景 D：加新的外部工具能力

优先读：

- `lib/actions/connectors.ts`
- `app/api/connectors/route.ts`
- `components/connectors-provider.tsx`
- `app/api/tasks/route.ts` 中读取 connector 的部分

## 18. 如果我是你，二开前会先做什么

如果目标是把这个项目变成长期可维护的内部产品，而不是一次性 demo，我会优先做下面几件事：

1. 明确 GitHub 权限模型
   先决定到底用用户 OAuth、PAT、GitHub App，还是只支持公开仓库。

2. 拆日志模型
   把任务日志从 `tasks.logs` 拆出去，避免后续所有功能都被日志写法拖累。

3. 收敛后台任务上下文
   把 `processTask()` 需要的上下文一次性准备好，减少异步阶段继续读 session 的行为。

4. 抽象 token provider
   不要再让 sandbox 层直接假设 token 一定来自用户 OAuth。

5. 重新审视安全边界
   特别是用户可见日志、stdout/stderr、命令回显、错误信息暴露。

## 19. 一句话总结

这个仓库最值得把握的核心，不是 UI，也不是某个 agent，而是这条主线：

`前端任务配置 -> tasks 表持久化 -> after() 异步编排 -> sandbox 创建 -> agent 执行 -> git 推送 -> 任务/PR 状态回写`

你只要把这条主线彻底看懂，后续无论是替换 GitHub 权限模型、接入新的 agent、做多仓库任务，还是把它产品化，改起来都会顺很多。

## 20. 附：关键文件索引

### 页面与布局

- `app/layout.tsx`
- `app/page.tsx`
- `components/app-layout.tsx`
- `components/app-layout-wrapper.tsx`
- `components/home-page-content.tsx`
- `components/task-page-client.tsx`
- `components/repo-layout.tsx`

### 任务链路

- `app/api/tasks/route.ts`
- `app/api/tasks/[taskId]/route.ts`
- `lib/utils/task-logger.ts`
- `lib/db/schema.ts`

### Sandbox 与执行

- `lib/sandbox/creation.ts`
- `lib/sandbox/config.ts`
- `lib/sandbox/commands.ts`
- `lib/sandbox/git.ts`
- `lib/sandbox/agents/index.ts`

### GitHub 集成

- `lib/github/user-token.ts`
- `lib/github/client.ts`
- `app/api/github/user-repos/route.ts`
- `app/api/github/repos/create/route.ts`
- `app/api/repos/[owner]/[repo]/commits/route.ts`
- `app/api/repos/[owner]/[repo]/issues/route.ts`
- `app/api/repos/[owner]/[repo]/pull-requests/route.ts`

### 认证与会话

- `lib/session/types.ts`
- `lib/session/server.ts`
- `lib/session/get-server-session.ts`
- `lib/session/create.ts`
- `lib/session/create-github.ts`
- `app/api/auth/info/route.ts`
- `app/api/auth/signin/github/route.ts`
- `app/api/auth/github/callback/route.ts`

### 扩展能力

- `components/connectors-provider.tsx`
- `app/api/connectors/route.ts`
- `lib/actions/connectors.ts`
- `lib/api-keys/user-keys.ts`
