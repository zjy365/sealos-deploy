# Sealos Deploy 模块裁剪清单

这份文档是基于 `docs/sealos-deploy-plan.md` 和当前代码实现做的一次“现阶段收缩”清点。

这里说的“当前阶段”，不是最终的 `Web -> Devbox -> Codex Gateway -> Build -> Deploy` 全链路，而是更小的一步：

1. 首页选择 GitHub 仓库
2. 输入 `deploy on sealos`
3. 创建一个 `codex` 任务
4. 任务详情页直接进入聊天界面
5. 当前项目通过后端代理，和 Devbox 内 `codex-gateway` 对话

如果当前阶段只做这条链路，那么下面很多模块都属于“当前无用”。

## 1. 当前阶段必须保留的最小链路

这些模块不应该删，它们组成当前最小可用产品。

### 1.1 首页入口

- `app/page.tsx`
- `app/[owner]/[repo]/page.tsx`
- `app/new/[owner]/[repo]/page.tsx`
- `components/sealos-home-page-content.tsx`
- `components/task-form.tsx`
- `components/repo-selector.tsx`

### 1.2 任务列表与任务页壳子

- `components/app-layout.tsx`
- `components/task-sidebar.tsx`
- `components/tasks-list-client.tsx`
- `app/tasks/page.tsx`
- `app/tasks/[taskId]/page.tsx`
- `components/sealos-task-page-client.tsx`

### 1.3 聊天主链路

- `components/task-chat.tsx`
- `app/api/tasks/route.ts`
- `app/api/tasks/[taskId]/route.ts`
- `app/api/tasks/[taskId]/continue/route.ts`
- `app/api/tasks/[taskId]/messages/route.ts`
- `app/api/tasks/[taskId]/gateway/session/route.ts`
- `app/api/tasks/[taskId]/gateway/turn/route.ts`
- `app/api/tasks/[taskId]/gateway/events/route.ts`
- `lib/codex-gateway/config.ts`
- `lib/codex-gateway/client.ts`
- `lib/codex-gateway/task.ts`
- `lib/codex-gateway/runner.ts`

### 1.4 基础数据与认证

- `lib/db/schema.ts`
- `lib/db/client.ts`
- `components/api-keys-dialog.tsx`
- GitHub 登录和仓库读取相关路由
- `app/api/github/user/route.ts`
- `app/api/github/orgs/route.ts`
- `app/api/github/repos/route.ts`

补充说明：

- `components/api-keys-dialog.tsx` 当前不再是“多 provider API key 管理台”，但它仍然是当前阶段用户配置 `AIProxy Base URL + API Key` 的唯一界面入口，因此不能和旧的多 provider 配置能力一起裁掉

## 2. 当前可以立即从界面拿掉的模块

这一类模块会干扰当前产品形态，而且不属于“首页输入 -> 直接聊天”的主链路。

### 2.1 首页输入区里的非必要能力

当前阶段建议首页输入框只保留：

- prompt 输入
- 单仓库选择
- 提交按钮

下面这些能力当前都可以隐藏：

- `components/task-form.tsx`
  - `multi-agent` 比较模式
  - `claude` / `copilot` / `cursor` / `gemini` / `opencode` 入口
  - model 下拉
  - `Skip Install`
  - `Maximum Duration`
  - `Keep Alive`
  - `Agent Browser`
  - `MCP Servers`
  - `Task Options`
- `app/api/api-keys/check/route.ts`
  - 当前主链已经走 Devbox 内 `codex-gateway`，不应该再用旧的多 provider 检查逻辑卡住任务创建
- `components/connectors-provider.tsx`
- `components/connectors/manage-connectors.tsx`
- `app/api/connectors/route.ts`

### 2.2 首页顶部和仓库入口里的扩展能力

这些不是当前主链路必需。

- `components/home-page-content.tsx`
  - `OpenRepoUrlDialog`
  - `MultiRepoDialog`
  - `New Repo`
  - `Refresh Owners`
  - `Refresh Repos`
  - `Manage Access`
  - 多仓库批量创建任务逻辑
  - 多模型批量创建任务逻辑
- `components/open-repo-url-dialog.tsx`
- `components/multi-repo-dialog.tsx`
- `lib/atoms/multi-repo.ts`
- `components/home-page-mobile-footer.tsx`

### 2.3 顶层视觉和营销型控件

不是当前交互闭环的必要组成。 已经改为 hidden

- `components/github-stars-button.tsx`
- `components/shared-header.tsx` 里的 star 展示
- `components/shared-header.tsx` 里的 `Deploy Your Own`

## 3. 当前任务详情页里的无用模块

如果当前阶段的目标是“任务创建后直接进入聊天页，并与 Devbox 内 `codex-gateway` 对话”，那么任务详情页里的 IDE / Sandbox 外壳基本都可以先下线。

### 3.1 任务详情页本身需要被大幅收缩

当前 `components/task-details.tsx` 太重，包含了很多当前不用的能力：

- Files pane
- Code pane
- Sandbox / Preview pane
- Chat / Code / Preview 移动端切换
- 文件 tabs
- 文件搜索
- PR 操作
- Try Again 里的一整套 agent / model / sandbox 配置
- Sandbox 启停和健康检查

当前阶段建议目标是：

1. 进入任务页后默认就是聊天
2. 页面主体只保留 `TaskChat`
3. 不再暴露 `Files / Code / Sandbox / Chat` 切换条

### 3.2 直接可视为当前无用的任务页组件

- `components/task-details.tsx`
  - 当前文件不应整个删除，但应该拆成“纯聊天版”
- `components/task-page-client.tsx`
  - 当前文件里的底部 `LogsPane` 挂载逻辑可以去掉
- `components/logs-pane.tsx`
- `components/terminal.tsx`
- `components/file-browser.tsx`
- `components/file-diff-viewer.tsx`
- `components/file-editor.tsx`
- `components/task-duration.tsx`
- `components/task-actions.tsx`

### 3.3 可以一起停掉的任务页 API

这些 API 都服务于在线 IDE / sandbox 文件系统，不属于当前阶段。

- `app/api/tasks/[taskId]/autocomplete/route.ts`
- `app/api/tasks/[taskId]/clear-logs/route.ts`
- `app/api/tasks/[taskId]/create-file/route.ts`
- `app/api/tasks/[taskId]/create-folder/route.ts`
- `app/api/tasks/[taskId]/delete-file/route.ts`
- `app/api/tasks/[taskId]/diff/route.ts`
- `app/api/tasks/[taskId]/discard-file-changes/route.ts`
- `app/api/tasks/[taskId]/file-content/route.ts`
- `app/api/tasks/[taskId]/file-operation/route.ts`
- `app/api/tasks/[taskId]/files/route.ts`
- `app/api/tasks/[taskId]/lsp/route.ts`
- `app/api/tasks/[taskId]/project-files/route.ts`
- `app/api/tasks/[taskId]/reset-changes/route.ts`
- `app/api/tasks/[taskId]/restart-dev/route.ts`
- `app/api/tasks/[taskId]/sandbox-health/route.ts`
- `app/api/tasks/[taskId]/save-file/route.ts`
- `app/api/tasks/[taskId]/start-sandbox/route.ts`
- `app/api/tasks/[taskId]/stop-sandbox/route.ts`
- `app/api/tasks/[taskId]/sync-changes/route.ts`
- `app/api/tasks/[taskId]/terminal/route.ts`

## 4. 当前无用的 PR / Repo Browser 模块

当前阶段不是“读 commits / issues / PR 并做 PR 协作”的产品。

### 4.1 Repo 浏览页

- `app/repos/[owner]/[repo]/layout.tsx`
- `app/repos/[owner]/[repo]/page.tsx`
- `app/repos/[owner]/[repo]/commits/page.tsx`
- `app/repos/[owner]/[repo]/issues/page.tsx`
- `app/repos/[owner]/[repo]/pull-requests/page.tsx`
- `components/repo-layout.tsx`
- `components/repo-page-client.tsx`
- `components/repo-commits.tsx`
- `components/repo-issues.tsx`
- `components/repo-pull-requests.tsx`

### 4.2 新建仓库相关页面

- `app/repos/new/page.tsx`
- `app/new/[owner]/[repo]/layout.tsx`
- `app/new/[owner]/[repo]/page.tsx`

### 4.3 PR 协作相关组件和 API

- `components/create-pr-dialog.tsx`
- `components/merge-pr-dialog.tsx`
- `components/pr-check-status.tsx`
- `components/pr-status-icon.tsx`
- `components/revert-commit-dialog.tsx`
- `app/api/tasks/[taskId]/check-runs/route.ts`
- `app/api/tasks/[taskId]/close-pr/route.ts`
- `app/api/tasks/[taskId]/merge-pr/route.ts`
- `app/api/tasks/[taskId]/pr-comments/route.ts`
- `app/api/tasks/[taskId]/pr/route.ts`
- `app/api/tasks/[taskId]/reopen-pr/route.ts`
- `app/api/tasks/[taskId]/sync-pr/route.ts`

## 5. 当前无用的 Sandbox / Vercel 实现

这些模块来自原始“AI coding sandbox”产品形态。当前阶段如果主链已经切到 Devbox 内 `codex-gateway`，这些都不是必要能力。

### 5.1 整个 sandbox 实现层

- `lib/sandbox/agents/claude.ts`
- `lib/sandbox/agents/codex.ts`
- `lib/sandbox/agents/copilot.ts`
- `lib/sandbox/agents/cursor.ts`
- `lib/sandbox/agents/gemini.ts`
- `lib/sandbox/agents/index.ts`
- `lib/sandbox/agents/opencode.ts`
- `lib/sandbox/commands.ts`
- `lib/sandbox/config.ts`
- `lib/sandbox/creation.ts`
- `lib/sandbox/git.ts`
- `lib/sandbox/package-manager.ts`
- `lib/sandbox/port-detection.ts`
- `lib/sandbox/sandbox-registry.ts`
- `lib/sandbox/types.ts`

### 5.2 sandbox 管理 UI 和路由

- `components/sandboxes-dialog.tsx`
- `app/api/sandboxes/route.ts`

### 5.3 Vercel Preview / Deployment 残留

- `app/api/tasks/[taskId]/deployment/route.ts`
- `app/api/vercel/teams/route.ts`

## 6. 当前阶段不用，但不建议删除的模块

这一类模块现在不用，但它们属于后续 `Devbox` 阶段，而不是原始 sandbox 负担。现在建议“保留但不激活”，不要误删。

### 6.1 Devbox 接入层

- `lib/devbox/config.ts`
- `lib/devbox/client.ts`
- `lib/devbox/naming.ts`
- `lib/devbox/types.ts`
- `app/api/devbox/health/route.ts`
- `app/api/tasks/[taskId]/runtime/route.ts`
- `app/api/tasks/[taskId]/runtime/exec/route.ts`

### 6.2 task 表里的 runtime / gateway 字段

这些字段当前阶段已经在启用，而且后面进入 build / deploy 阶段时还会继续用：

- `runtimeProvider`
- `runtimeName`
- `runtimeNamespace`
- `runtimeState`
- `gatewayUrl`
- `gatewaySessionId`

## 7. 建议的裁剪顺序

建议按下面顺序裁，不要一次动太多。

### 第一批：只做界面收缩

- 首页只保留单仓库 + prompt + submit
- agent 固定成 `codex`
- 任务页只保留聊天界面
- 去掉 Files / Code / Sandbox / Logs / Terminal UI

### 第二批：去掉无用交互入口

- 去掉 multi-repo
- 去掉 open repo URL
- 去掉 connectors
- 去掉 API key 管理入口
- 去掉 repo browser 页面入口

### 第三批：删除原始 sandbox 能力

- 停用 `lib/sandbox/*`
- 停用文件编辑和终端相关 API
- 停用 PR / preview / deployment 残留接口

### 第四批：保留并推进 Devbox 阶段

- 保留 `lib/devbox/*`
- 保留 task runtime 字段
- 继续沿着 Devbox runtime + Devbox gateway 主链推进 build / deploy

## 8. 一句话结论

如果当前目标只是：

`输入 deploy on sealos -> 创建 task -> 直接进入 chat -> 和 Devbox 内 codex-gateway 对话`

那么当前仓库里绝大多数 “IDE / Sandbox / PR / Repo Browser / 多 agent / 多 repo / connectors / Vercel preview” 模块都属于当前无用模块，可以从界面上先拿掉，后端上再分批下线。
