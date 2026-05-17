# ShipRepo 设计规范

## 1. 设计目标

ShipRepo 是一个 Web-first 的 Sealos Deploy Agent 工作台。它帮助用户把 GitHub repo 推进到可分析、可修复、可构建、可预览、可发布和可运维的 Sealos 应用生命周期。

当前设计基准是：

- [ShipRepo Design Brief](./shiprepo-design-brief.zh.md)

旧的 `shiprepo-prototype.html`、`shiprepo-console.html`、`shiprepo-workbench-v2.html` 和 `shiprepo-workbench-v3.html` 只作为探索痕迹，不作为最终 UI 参考。重构前必须先基于 Design Brief 重新出图，不能围绕旧原型做代码重构。

界面要表达的不是“AI 正在写代码”，而是：

> 这个 repo 当前能不能在 Sealos 上跑起来；如果不能，缺什么；如果可以，下一步如何预览或发布。

## 2. 产品气质

- 可靠：用户愿意把真实仓库和部署动作交给它。
- 方便：不要求用户先理解 Devbox、registry、Dockerfile、Sealos 模板和资源配置。
- 冷静：失败时给出清楚结论和下一步，不用戏剧化视觉制造紧张感。
- 克制：用结构和层级传达能力，不用装饰堆叠传达“技术感”。

参考方向：接近 Vercel 级别的精炼、稀疏、明确，但不能复制 Vercel。差异点应来自 Sealos repo-to-preview/ship 的结果对象：部署就绪度、阻塞项、Preview URL、资源需求、发布确认、运维动作。

## 3. 核心体验原则

1. 当前阶段结果优先于 Agent 活动过程。
2. 下一步动作优先于完整工具面板。
3. 结构化结论优先于原始日志。
4. Preview URL 是核心成果，必须显眼。
5. 日志、diff、timeline、artifact 是证据层，默认渐进披露。
6. 聊天是 follow-up 入口，不是页面主角。
7. 每个状态只保留一个明显主动作。

## 4. 信息架构

推荐页面模型：

```text
App shell
  Header
    repo / branch
    task status
    primary action

  Main workspace
    Result panel
      lifecycle stage
      readiness / blocker / preview / deploy result
      next action

    Context panel
      short Agent explanation
      lifecycle stepper
      latest relevant event

    Details drawer or tabs
      timeline
      logs
      diff
      artifacts
      deployment records

    Follow-up composer
      ask / retry / adjust deployment intent
```

不要把 `chat / timeline / logs / diff / artifacts / deployment info` 做成首屏等权重多栏 cockpit。用户不应该先理解工具布局，才能知道部署结果。

## 5. 首页

首页只做一件事：让用户选择 GitHub repo 并创建 Sealos 部署生命周期任务。

必须包含：

- GitHub 登录或当前用户。
- repo / branch 选择。
- 一个自然语言目标输入。
- 一个主动作：开始分析或开始部署准备。

不应包含：

- 大段产品解释。
- 多个竞争 CTA。
- 大面积营销 hero。
- 装饰性背景。
- Agent 能力清单堆叠。

## 6. Task Workspace

任务页的第一屏必须回答：

- 当前 repo 是什么？
- 当前处于 Analyze、Fix、Build、Preview、Ship、Operate 哪个阶段？
- 当前结论是什么？
- 用户下一步点什么？

### 6.1 Analyze 状态

主区域展示：

- 部署就绪判断。
- 技术栈和包管理器。
- build/start/port/env 的判断结果。
- 阻塞项列表。
- 下一步：自动修复、补充信息、重试或取消。

日志只作为展开项。

### 6.2 Fix 状态

主区域展示：

- 修复目标。
- 将改动的文件摘要。
- 风险说明。
- 主动作：批准修复或修改计划。

Diff 可以展示，但不应该把完整 diff 作为页面默认中心。

### 6.3 Build 状态

主区域展示：

- 构建状态。
- 当前步骤。
- 成功产物或失败摘要。

原始 build output 默认折叠。

### 6.4 Preview 状态

主区域展示：

- Sealos preview URL。
- 运行状态。
- 最近健康检查或访问结果。
- 主动作：打开预览、确认发布、继续调整。

Preview URL 是该阶段最重要对象。

### 6.5 Ship 状态

主区域展示：

- 发布确认。
- 应用名称。
- 资源规格。
- 域名或正式 URL。
- 发布状态。

正式发布必须显式确认。

### 6.6 Operate 状态

主区域展示：

- 当前 deployment 状态。
- 日志摘要。
- 最近错误解释。
- 可执行动作：改 env、重部署、回滚、绑定域名。

高风险动作必须确认。

## 7. 视觉方向

整体视觉应是 calm、restrained、premium、minimal 的 Web 产品工作台。

应使用：

- 大量留白。
- 清晰内容层级。
- 少量高价值 accent。
- 稳定的圆角和边框。
- 低噪声 shadow。
- 结构化状态表达。

避免：

- AI coding cockpit。
- 暗色 IDE 复制品。
- cyber dashboard。
- terminal-first 页面。
- glow、霓虹、蓝紫渐变。
- 密集边框分割。
- 过多 mono 标签。
- 装饰性图标和无意义 activity feed。

## 8. Theme Token

本产品采用 `Porcelain Cloud / Sealos Slate` 主题方向。浅色模式应像干净、可信的部署工作台；深色模式应稳重但不进入 IDE 蓝光风。主色是低噪声海盐绿，只用于阶段状态、主动作和关键成功结果。

实现必须使用以下 Tailwind v4 / shadcn 风格 theme。设计稿和前端实现都应围绕这些 token 建立视觉语言，不要另起一套颜色体系。

```css
@import "tailwindcss";

@custom-variant dark (&:is(.dark *));

:root {
  --background: oklch(0.9860 0.0060 210.0000);
  --foreground: oklch(0.1760 0.0140 235.0000);
  --card: oklch(0.9970 0.0030 210.0000);
  --card-foreground: oklch(0.1760 0.0140 235.0000);
  --popover: oklch(0.9970 0.0030 210.0000);
  --popover-foreground: oklch(0.1760 0.0140 235.0000);
  --primary: oklch(0.5600 0.1050 176.0000);
  --primary-foreground: oklch(0.9850 0.0040 190.0000);
  --secondary: oklch(0.9440 0.0120 218.0000);
  --secondary-foreground: oklch(0.2450 0.0180 235.0000);
  --muted: oklch(0.9560 0.0080 220.0000);
  --muted-foreground: oklch(0.5020 0.0180 235.0000);
  --accent: oklch(0.9320 0.0280 176.0000);
  --accent-foreground: oklch(0.3420 0.0680 176.0000);
  --destructive: oklch(0.5700 0.1850 25.0000);
  --destructive-foreground: oklch(0.9850 0.0040 20.0000);
  --border: oklch(0.8950 0.0120 220.0000);
  --input: oklch(0.9100 0.0100 220.0000);
  --ring: oklch(0.5600 0.1050 176.0000);
  --chart-1: oklch(0.5600 0.1050 176.0000);
  --chart-2: oklch(0.6100 0.0950 218.0000);
  --chart-3: oklch(0.6800 0.1200 86.0000);
  --chart-4: oklch(0.6100 0.1500 34.0000);
  --chart-5: oklch(0.5400 0.1050 280.0000);
  --sidebar: oklch(0.9720 0.0070 215.0000);
  --sidebar-foreground: oklch(0.2160 0.0140 235.0000);
  --sidebar-primary: oklch(0.5600 0.1050 176.0000);
  --sidebar-primary-foreground: oklch(0.9850 0.0040 190.0000);
  --sidebar-accent: oklch(0.9300 0.0200 176.0000);
  --sidebar-accent-foreground: oklch(0.3000 0.0550 176.0000);
  --sidebar-border: oklch(0.8950 0.0120 220.0000);
  --sidebar-ring: oklch(0.5600 0.1050 176.0000);
  --font-sans: Geist, Inter, ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Source Serif 4", Georgia, serif;
  --font-mono: "Geist Mono", "SFMono-Regular", Consolas, monospace;
  --radius: 0.85rem;
  --shadow-x: 0;
  --shadow-y: 1px;
  --shadow-blur: 2px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.08;
  --shadow-color: oklch(0.1760 0.0140 235.0000);
  --shadow-2xs: 0 1px 2px 0px hsl(220 20% 18% / 0.04);
  --shadow-xs: 0 1px 2px 0px hsl(220 20% 18% / 0.05);
  --shadow-sm: 0 1px 2px 0px hsl(220 20% 18% / 0.06), 0 1px 3px -1px hsl(220 20% 18% / 0.08);
  --shadow: 0 1px 2px 0px hsl(220 20% 18% / 0.06), 0 2px 4px -2px hsl(220 20% 18% / 0.08);
  --shadow-md: 0 2px 4px -1px hsl(220 20% 18% / 0.07), 0 6px 12px -6px hsl(220 20% 18% / 0.10);
  --shadow-lg: 0 4px 8px -2px hsl(220 20% 18% / 0.08), 0 12px 24px -12px hsl(220 20% 18% / 0.12);
  --shadow-xl: 0 8px 16px -4px hsl(220 20% 18% / 0.10), 0 20px 36px -18px hsl(220 20% 18% / 0.14);
  --shadow-2xl: 0 16px 42px -22px hsl(220 20% 18% / 0.22);
  --tracking-normal: 0em;
  --spacing: 0.25rem;
}

.dark {
  --background: oklch(0.1450 0.0140 235.0000);
  --foreground: oklch(0.9480 0.0060 210.0000);
  --card: oklch(0.1880 0.0160 235.0000);
  --card-foreground: oklch(0.9480 0.0060 210.0000);
  --popover: oklch(0.2080 0.0180 235.0000);
  --popover-foreground: oklch(0.9480 0.0060 210.0000);
  --primary: oklch(0.7350 0.1120 176.0000);
  --primary-foreground: oklch(0.1300 0.0180 180.0000);
  --secondary: oklch(0.2650 0.0220 235.0000);
  --secondary-foreground: oklch(0.9150 0.0080 210.0000);
  --muted: oklch(0.2450 0.0180 235.0000);
  --muted-foreground: oklch(0.6900 0.0120 220.0000);
  --accent: oklch(0.2750 0.0440 176.0000);
  --accent-foreground: oklch(0.8150 0.1050 176.0000);
  --destructive: oklch(0.6900 0.1650 24.0000);
  --destructive-foreground: oklch(0.9850 0.0040 20.0000);
  --border: oklch(0.3000 0.0180 235.0000);
  --input: oklch(0.3200 0.0180 235.0000);
  --ring: oklch(0.7350 0.1120 176.0000);
  --chart-1: oklch(0.7350 0.1120 176.0000);
  --chart-2: oklch(0.7200 0.0920 218.0000);
  --chart-3: oklch(0.7600 0.1250 86.0000);
  --chart-4: oklch(0.7200 0.1400 34.0000);
  --chart-5: oklch(0.7100 0.1050 280.0000);
  --sidebar: oklch(0.1700 0.0150 235.0000);
  --sidebar-foreground: oklch(0.9250 0.0060 210.0000);
  --sidebar-primary: oklch(0.7350 0.1120 176.0000);
  --sidebar-primary-foreground: oklch(0.1300 0.0180 180.0000);
  --sidebar-accent: oklch(0.2500 0.0380 176.0000);
  --sidebar-accent-foreground: oklch(0.8150 0.1050 176.0000);
  --sidebar-border: oklch(0.2950 0.0180 235.0000);
  --sidebar-ring: oklch(0.7350 0.1120 176.0000);
  --font-sans: Geist, Inter, ui-sans-serif, system-ui, sans-serif;
  --font-serif: "Source Serif 4", Georgia, serif;
  --font-mono: "Geist Mono", "SFMono-Regular", Consolas, monospace;
  --radius: 0.85rem;
  --shadow-x: 0;
  --shadow-y: 1px;
  --shadow-blur: 2px;
  --shadow-spread: 0px;
  --shadow-opacity: 0.18;
  --shadow-color: oklch(0 0 0);
  --shadow-2xs: 0 1px 2px 0px hsl(0 0% 0% / 0.12);
  --shadow-xs: 0 1px 2px 0px hsl(0 0% 0% / 0.14);
  --shadow-sm: 0 1px 2px 0px hsl(0 0% 0% / 0.16), 0 1px 3px -1px hsl(0 0% 0% / 0.18);
  --shadow: 0 1px 2px 0px hsl(0 0% 0% / 0.16), 0 2px 4px -2px hsl(0 0% 0% / 0.22);
  --shadow-md: 0 2px 4px -1px hsl(0 0% 0% / 0.20), 0 6px 12px -6px hsl(0 0% 0% / 0.26);
  --shadow-lg: 0 4px 8px -2px hsl(0 0% 0% / 0.24), 0 12px 24px -12px hsl(0 0% 0% / 0.34);
  --shadow-xl: 0 8px 16px -4px hsl(0 0% 0% / 0.28), 0 20px 36px -18px hsl(0 0% 0% / 0.40);
  --shadow-2xl: 0 16px 42px -22px hsl(0 0% 0% / 0.55);
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);

  --font-sans: var(--font-sans);
  --font-mono: var(--font-mono);
  --font-serif: var(--font-serif);

  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);

  --shadow-2xs: var(--shadow-2xs);
  --shadow-xs: var(--shadow-xs);
  --shadow-sm: var(--shadow-sm);
  --shadow: var(--shadow);
  --shadow-md: var(--shadow-md);
  --shadow-lg: var(--shadow-lg);
  --shadow-xl: var(--shadow-xl);
  --shadow-2xl: var(--shadow-2xl);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

## 9. Token 使用规则

- `primary` 只用于主动作、当前阶段强调、关键成功结果。
- `accent` 用于轻量状态背景，不要做大面积装饰。
- `destructive` 只用于失败、危险动作和阻塞错误。
- `muted` 和 `border` 用于降低辅助信息权重。
- `card` 不代表所有内容都要卡片化；只用于真正需要聚合的结果块、确认块、详情块。
- `font-mono` 只用于短代码、命令、image tag、env key、commit hash 等结构化技术片段，不用于大段 UI 导航和标题。
- 圆角基准较大，页面应避免卡片套卡片，否则会显得松散和玩具化。
- shadow 应保持低噪声，不能用 glow 或彩色发光。

## 10. 组件层级

### 主结果块

用途：承载当前阶段结论。

内容：

- 阶段名。
- 结论。
- 阻塞项或 Preview URL。
- 下一步主动作。

视觉：

- 比其他区域更高层级。
- 可以使用 `card`、`border` 和轻量 shadow。
- 不使用彩色侧边条。
- 不堆叠多个同权重按钮。

### 生命周期 Stepper

用途：让用户知道当前处于哪一步。

阶段：

```text
Analyze -> Fix -> Build -> Preview -> Ship -> Operate
```

视觉：

- 当前阶段用 `primary`。
- 已完成阶段低调显示成功状态。
- 未来阶段保持 muted。
- 不做大型仪表盘。

### 详情区

用途：承载 evidence。

包括：

- Timeline。
- Logs。
- Diff。
- Artifacts。
- Deployment records。

规则：

- 默认折叠或放在次级 tab/drawer。
- 失败时可以自动打开相关摘要，但不要默认展示完整原始日志。
- 日志必须先展示摘要和下一步，再给 raw output。

### Follow-up Composer

用途：用户继续提出部署相关请求。

规则：

- 放在主结果之后或页面底部。
- 不应比当前部署结论更显眼。
- placeholder 聚焦部署语义，例如“补充环境变量、重试构建或调整部署目标”。

## 11. 文案规则

文案应短、具体、可行动。

推荐：

- `Preview is ready`
- `3 blockers found`
- `Missing start command`
- `Add required environment variables`
- `Open Sealos preview`
- `Approve production deploy`

避免：

- `Agent is thinking`
- `Workspace intelligence initialized`
- `Autonomous remediation pipeline`
- `Deploy orchestration cockpit`
- `Your AI engineer is working`

中文界面同理，优先说结果，不渲染 Agent 人设。

## 12. 设计验收清单

设计稿必须满足：

- 第一眼能看出当前 repo、branch 和阶段。
- 第一眼能看出当前结论：可预览、需修复、需补信息、失败或已部署。
- 第一眼能看出一个主动作。
- Preview URL 明显且易打开。
- 失败原因以摘要和下一步呈现，raw logs 不作为默认主体。
- Diff、logs、timeline 可访问，但不是首屏主角。
- Light 和 dark theme 都可读、克制、可信。
- 页面不像 IDE、terminal、DevOps cockpit 或 AI demo。
- 去掉 Agent avatar 和工具调用详情后，主流程仍然成立。
