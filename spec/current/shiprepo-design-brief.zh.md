# ShipRepo Design Brief

## 1. 设计结论

ShipRepo 的 UI 不能从现有原型继续改。现有 `shiprepo-prototype.html`、`shiprepo-console.html`、`shiprepo-workbench-v2.html`、`shiprepo-workbench-v3.html` 都只能作为探索痕迹，不作为最终设计基准。

最终设计应重新开始，但必须遵守本 brief。

一句话方向：

> ShipRepo 是一个真实、克制、可信的 deployment run detail workspace。它先告诉用户项目现在能不能打开，再告诉用户发布前要做什么，最后才展示日志、diff 和 agent 过程。

## 2. 设计要解决的问题

当前原型的问题不是局部不好看，而是产品信息架构错误。

错误点：

- 把内部 pipeline 当成用户主导航。
- 把 chat 当成主体验。
- 把日志、timeline、diff、agent activity 放得过重。
- 用 hero、渐变、网格背景、卡片拼图制造 AI dashboard 感。
- 用户看完首屏仍然要思考：我现在到底能不能部署？

新设计必须先解决信息架构，再解决视觉风格。

## 3. 用户语言

不要把这些词作为主结构：

- Analyze。
- Fix。
- Build。
- Preview。
- Ship。
- Operate。
- Agent activity。
- Tool call。
- Executor。
- Gateway。

这些可以存在于内部事件或开发文档，但不应成为首屏用户结构。

用户语言应该是：

- Preview is ready。
- Preview could not be created。
- Action needed before preview。
- Production is ready to publish。
- Review deployment changes。
- Confirm environment variables。
- Open preview。
- Publish production。
- Create pull request。
- Retry with fix。

## 4. 页面心智模型

用户打开任务页时，不是在看流水线，而是在看一个部署结果。

页面应该像：

- Vercel deployment detail 的结果清晰度。
- GitHub pull request 的变更审查感。
- GitHub Actions run 的证据层。
- Linear issue detail 的克制信息层级。

不能像：

- AI chatbot。
- IDE。
- DevOps 监控大屏。
- Landing page。
- 模板化 SaaS dashboard。

## 5. 核心页面结构

### 5.1 App Shell

左侧：

- ShipRepo brand。
- repo/task 列表。
- 用户和连接状态。

顶部：

- repo owner/name。
- branch。
- run number。
- 当前状态。
- 主操作。

主区域：

- 当前结果。
- 发布前待处理事项。
- 本次部署改动。
- 详情 tabs。

右侧或次级区域：

- 简短解释。
- production target。
- follow-up 输入。
- recent important events。

### 5.2 Task Detail 首屏

首屏必须回答：

1. 当前结果是什么？
2. Preview URL 是否可打开？
3. 发布前还需要用户做什么？
4. 系统改了什么？
5. 下一步最重要按钮是什么？

首屏不展示：

- 内部六阶段横条。
- 大 hero。
- 大段 agent 思考过程。
- 原始日志。
- terminal。
- 多个同权重面板。

## 6. 信息优先级

### Priority 1: Current Result

成功时：

- Preview is ready。
- URL。
- Health check。
- Image。
- Runtime。

失败时：

- Preview could not be created。
- 失败原因。
- 推荐动作。

### Priority 2: Required User Action

例如：

- Review deployment changes。
- Confirm environment variables。
- Approve production publish。
- Provide missing start command。

每个状态只允许一个主动作。

### Priority 3: Changed Files

展示：

- 文件名。
- 改动类型。
- 为什么改。
- 是否影响业务逻辑。

完整 diff 是展开详情，不是默认主视觉。

### Priority 4: Evidence

包括：

- Events。
- Logs。
- Build output。
- Deployment records。

证据层用于建立信任，不用于主导航。

### Priority 5: Follow-up Chat

Chat 是用户修正意图、追加问题、要求重试的入口。

Chat 不是页面主角。

## 7. 视觉方向

关键词：

- Real product。
- Deployment workspace。
- Calm。
- Precise。
- Low noise。
- Operational, not decorative。

视觉应该：

- 使用浅色产品工作台。
- 使用清晰边框和少量背景层级。
- 使用小半径或中半径，不使用夸张大圆角。
- 使用少量状态色。
- 让数据和结果成为视觉锚点。
- 让 primary action 清楚但不夸张。

视觉不应该：

- 网格背景。
- 蓝紫渐变。
- 大 hero。
- 发光卡片。
- 三列 dashboard 拼图。
- 大量 emoji。
- 夸张 mono 标签。
- 把 console 当主视觉。
- 卡片套卡片。

## 8. 推荐布局

```text
┌──────────────────────────────────────────────────────────────┐
│ repo / branch / run #184                 Open preview Publish │
├──────────────┬───────────────────────────────────────────────┤
│ repo/task    │ Preview is ready                              │
│ list         │ acme-shop-pr-184.sealos.run                   │
│              │ Health 200 OK · Image sha-... · Runtime Node  │
│              │                                               │
│              │ Before publishing                             │
│              │ 1. Review deployment file changes             │
│              │ 2. Confirm production env vars                │
│              │                                               │
│              │ Changed files                                 │
│              │ Dockerfile · sealos.yaml · .dockerignore      │
│              │                                               │
│              │ Summary | Changes | Logs | Events | Deploy    │
└──────────────┴───────────────────────────────────────────────┘
```

## 9. 状态设计

### 9.1 Preview Ready

主标题：

```text
Preview is ready
```

主按钮：

```text
Open preview
Publish
```

次级内容：

- Before publishing。
- Changed files。
- Summary tabs。

### 9.2 Needs Input

主标题：

```text
Action needed before preview
```

主按钮：

```text
Save and continue
```

内容：

- 需要补什么。
- 为什么需要。
- 输入框。
- secret 不回显。

### 9.3 Preview Failed

主标题：

```text
Preview could not be created
```

主按钮：

```text
Retry with fix
```

内容：

- 失败原因。
- 系统建议。
- 日志入口。

### 9.4 Production Waiting

主标题：

```text
Production is ready to publish
```

主按钮：

```text
Publish production
```

内容：

- Preview 已验证。
- 生产配置。
- 风险提示。

## 10. 组件要求

### 10.1 Status Header

必须展示：

- repo。
- branch。
- run id。
- status。
- primary action。

状态文案使用用户语言，不使用内部阶段。

### 10.2 Current Result Panel

必须展示：

- 当前结果标题。
- URL 或失败原因。
- 关键元信息。
- 主操作。

这是页面视觉中心。

### 10.3 Required Action Panel

只展示用户需要处理的事项。

每项必须有：

- 标题。
- 原因。
- 操作。

### 10.4 Changed Files

每个文件展示：

- 文件名。
- 变更类型。
- 改动原因。
- 是否只影响部署。

### 10.5 Evidence Tabs

包含：

- Summary。
- Changes。
- Logs。
- Events。
- Deployment。

默认打开 Summary。

### 10.6 Follow-up Input

位置可以在右侧或底部。

占比不能超过主结果区。

Placeholder 示例：

```text
Ask to change the port, update env vars, reduce image size, or create a PR...
```

## 11. 文案规则

使用：

- Preview is ready。
- Needs your input。
- Review changes。
- Confirm env vars。
- Publish production。
- Retry with fix。
- View logs。

避免：

- Analyze completed。
- Fix phase。
- Build phase。
- Agent is thinking。
- Tool execution。
- Executor session。
- Gateway state。

错误文案不要写：

```text
Something went wrong
```

应该写：

```text
The image build failed because the app did not expose a production start command.
```

## 12. 设计验收标准

一个设计稿合格的标准：

- 用户 5 秒内知道当前项目能不能打开。
- Preview URL 成功时是首屏最容易找到的对象之一。
- 失败时结构化原因比日志更显眼。
- 页面没有内部六阶段主导航。
- Chat 不是视觉中心。
- Logs、events、diff 是证据层。
- 没有网格背景、渐变 hero、AI dashboard 卡片拼图。
- 每个状态只有一个主动作。
- Mobile 下仍能先看到结果和主动作。

## 13. 给设计师和前端的执行提示

请不要从现有 HTML 原型继续改。

请从本 brief 出发，先画这些状态：

1. Preview Ready。
2. Needs Input。
3. Preview Failed。
4. Production Waiting。

每个状态至少包含 desktop 和 mobile。

完成后再进入 Vite React 实现。

