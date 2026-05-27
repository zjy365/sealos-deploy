# Stateless Deploy API

`POST /api/deploy` 是一个零持久化的 HTTP 接口，调用方传入 kubeconfig、GitHub token 和仓库信息，接口自动完成从代码到 Crossplane YAML 的完整部署链路，通过 SSE 实时返回进度和最终结果。

---

## 快速开始

```bash
curl -N -X POST http://localhost:3000/api/deploy \
  -H "Content-Type: application/json" \
  -H "Accept: text/event-stream" \
  -d '{
    "kubeconfig": "<kubeconfig YAML string>",
    "githubToken": "<GitHub PAT with repo + write:packages scope>",
    "repoUrl": "https://github.com/owner/repo",
    "branch": "main"
  }'
```

---

## 接口规范

### 请求

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `kubeconfig` | string | ✅ | Sealos kubeconfig（YAML 格式），用于 AIProxy 认证 |
| `githubToken` | string | ✅ | GitHub PAT，需要 `repo` + `write:packages` scope |
| `repoUrl` | string | ✅ | GitHub 仓库完整 URL，如 `https://github.com/owner/repo` |
| `branch` | string | ❌ | 目标分支，默认 `main` |

### 响应：SSE 流（`text/event-stream`）

接口立即返回 SSE 流，持续推送进度事件，最终以 `complete` 或 `error` 事件结束。

#### 进度事件

```
event: progress
data: {"phase":"provisioning","message":"Creating runtime"}
```

#### 完成事件

```
event: complete
data: {
  "image": "ghcr.io/owner/repo:prepare-abc1234",
  "yaml": "apiVersion: example.crossplane.io/v1\nkind: AP\nmetadata:\n  name: my-app\n..."
}
```

#### 失败事件

```
event: error
data: {"message":"Deployment failed"}
```

#### Phase 枚举

| Phase | 说明 |
|-------|------|
| `provisioning` | 创建 Devbox 运行时 |
| `bootstrapping` | 克隆仓库，安装 Skills |
| `starting_ai` | 建立 Codex Gateway 会话 |
| `analyzing` | AI 分析仓库，生成 Dockerfile |
| `building` | BuildKit 构建镜像并推送到 GHCR |
| `generating_yaml` | 生成 Crossplane AP YAML |

### 错误响应（非 SSE）

kubeconfig 验证失败或请求参数错误时，在建立 SSE 流之前直接返回 JSON：

| 状态码 | 场景 |
|--------|------|
| `400` | 缺少必填字段，或 `repoUrl` 格式不合法 |
| `401` | kubeconfig 无效，AIProxy 验证失败 |

---

## 认证设计

该接口**完全绕过** GitHub OAuth / Cookie Session，使用 Sealos kubeconfig 作为唯一身份凭证。

```
kubeconfig
    │
    ▼
lib/aiproxy/token-management.ts
getOrCreateAiProxyToken(kubeconfig)
    │  Authorization: encodeURIComponent(kubeconfig)
    ▼
AIProxy Token Management API
(https://aiproxy-web.usw-1.sealos.io/api/v2alpha)
    │
    ▼
AiProxyTokenInfo { key: "sk-..." }
    │
    ▼  构建 GatewayConfig
{ provider: 'aiproxy', apiKey: key, baseUrl: '...' }
    │
    ▼  注入 Devbox 环境变量
CODEX_GATEWAY_OPENAI_BASE_URL
CODEX_GATEWAY_OPENAI_API_KEY
```

kubeconfig 验证在 SSE 流建立**之前**同步执行（约 100ms），验证失败直接返回 401，不会创建任何资源。

GitHub token 通过 `GITHUB_TOKEN` 环境变量注入到 Devbox，用于 `git clone`（私有仓库）和 GHCR 镜像推送。

---

## 系统架构

### 零持久化策略

现有任务系统的所有状态均持久化到 PostgreSQL（`tasks` 表）。为了避免数据库依赖，本接口采用**内存伪 Task** 策略：

```typescript
// 仅存在于内存，从不插入数据库
const fakeTask: Task = {
  id: generateId(12),      // 随机 ID，不对应 DB 中任何行
  userId: 'deploy-api',
  repoUrl: input.repoUrl,
  branchName: input.branch,
  runtimeName: null,       // 强制创建新 Devbox
  // ...所有其他字段为 null/默认值
}
```

复用 `ensureTaskDevboxRuntime(fakeTask, options)` 时，其内部的 `db.update(tasks).set(...).where(eq(tasks.id, fakeTask.id))` 因 `fakeTask.id` 不存在于数据库，影响 0 行，静默 no-op，不产生任何错误。

对 Codex Gateway 的操作（建立会话、发送 Turn、轮询状态）使用 `lib/codex-gateway/client.ts` 中的**原始 HTTP 客户端函数**，这些函数完全不依赖数据库。

### 执行流程

```
POST /api/deploy
│
├─ [同步] 验证请求参数
├─ [同步] validateKubeconfig() → getOrCreateAiProxyToken()
│         ✗ 失败 → 返回 400/401 JSON
│
└─ [返回 SSE 流]
   │
   ├─ event: progress { phase: "provisioning" }
   │  └─ ensureTaskDevboxRuntime(fakeTask, { githubToken, gatewayConfig })
   │      ├─ createDevbox(runtimeName, envVars)          ← Devbox HTTP API
   │      ├─ 等待 Running (轮询 getDevbox, 最长 60s)
   │      └─ ensureTaskWorkspaceBootstrapped()
   │          ├─ git clone --branch {branch} {authenticatedRepoUrl}
   │          └─ npx --yes skills add brain-sandbox-skills -y
   │
   ├─ event: progress { phase: "starting_ai" }
   │  ├─ getDevbox(runtimeName) → 获取 Gateway auth token
   │  ├─ waitForCodexGatewayReady(gatewayUrl)            ← 轮询 /healthz + /readyz
   │  └─ createCodexGatewaySession({ model: "gpt-5.4" })
   │
   ├─ sendCodexGatewayTurn(sessionId, deployPrompt)
   │
   ├─ event: progress { phase: "analyzing" }
   │  └─ 轮询 getCodexGatewaySessionState() 每 3 秒
   │      ├─ activeTurn=true  → event: progress (phase 根据 recentEvents 推断)
   │      └─ activeTurn=false && lastTurnStatus → 退出轮询
   │          ├─ succeeded/completed → 继续
   │          └─ failed → 抛出异常 → event: error
   │
   ├─ event: progress { phase: "generating_yaml" }
   │  └─ execDevbox: 读取 .sealos/deployment-output.json + .sealos/crossplane/ap.yaml
   │
   ├─ event: complete { image, yaml }
   │
   └─ [finally 块，总是执行]
       ├─ deleteCodexGatewaySession(sessionId)
       └─ deleteDevbox(runtimeName)
```

### AI 部署链路（brain-github-deploy）

Codex Gateway 收到 prompt 后，Brain（gpt-5.4）读取 `brain-github-deploy` skill 并依次执行以下阶段：

| Phase | 内容 |
|-------|------|
| 0 — Preflight | 检查 git、kubectl、buildctl、GITHUB_TOKEN |
| 1 — Assess | 运行 `score-model.mjs` 对仓库进行云原生就绪度评分（0-12，确定性算法） |
| 2 — Dockerfile | 如仓库无 Dockerfile，AI 生成一个；否则复用 |
| 3 — Build Context | 验证本地构建输入可读 |
| 4 — Build & Push | 在 Kubernetes 上创建临时 BuildKit Job，`buildctl` 构建并推送到 GHCR |
| 5 — Crossplane | `write-brain-crossplane-ap.mjs` 生成 `ap.yaml` |
| 6 — Finish | 写入 `deployment-output.json`，写入 `delivery-manifest.json` |

最终产物：
- `.sealos/crossplane/ap.yaml` — Crossplane AP Claim
- `.sealos/deployment-output.json` — 状态 + 镜像引用

---

## 模块结构

```
app/api/deploy/
└── route.ts                  # SSE 端点入口

lib/deploy-api/
├── types.ts                  # DeployPhase, SendEventFn 等类型
├── auth.ts                   # kubeconfig → GatewayConfig
├── prompt.ts                 # 构造带 Sealos context 的部署 prompt
├── result-parser.ts          # 从 Devbox 读取 deployment-output.json + ap.yaml
└── orchestrator.ts           # 核心编排逻辑
```

### 依赖关系

```
route.ts
  ├── lib/deploy-api/auth.ts
  │     └── lib/aiproxy/token-management.ts
  └── lib/deploy-api/orchestrator.ts
        ├── lib/devbox/runtime.ts          (ensureTaskDevboxRuntime)
        ├── lib/devbox/client.ts           (getDevbox, deleteDevbox)
        ├── lib/codex-gateway/client.ts    (createSession, sendTurn, getState...)
        ├── lib/codex-gateway/config.ts    (getCodexGatewayAuthToken)
        ├── lib/deploy-api/prompt.ts
        └── lib/deploy-api/result-parser.ts
              └── lib/devbox/client.ts     (execDevbox)
```

---

## Crossplane AP YAML 格式

```yaml
apiVersion: example.crossplane.io/v1
kind: AP
metadata:
  name: my-app
  namespace: ns-default
spec:
  crossplane:
    compositionRef:
      name: aps-deployment-ingress-go-templating
  name: my-app
  input:
    image: ghcr.io/owner/repo:prepare-abc1234
    imagePullPolicy: Always
    network:
      privatePort: 3000
    env:
      - name: NODE_ENV
        value: production
    probes:
      startup:
        httpGet: { path: /, port: 3000 }
        failureThreshold: 30
      liveness:
        httpGet: { path: /, port: 3000 }
        initialDelaySeconds: 15
        failureThreshold: 3
      readiness:
        httpGet: { path: /, port: 3000 }
        initialDelaySeconds: 5
        failureThreshold: 3
  resource:
    replicaStrategy:
      type: fixed
      fixed:
        replicas: 1
    requests:
      cpu: "200m"
      memory: "204Mi"
    limits:
      cpu: "2000m"
      memory: "2048Mi"
```

---

## 日志安全

遵循项目 `AGENTS.md` 规范，所有日志使用**静态字符串**，不包含任何动态值：

```typescript
// ✅ 合规
console.error('Deploy orchestration error:', error)
sendEvent('progress', { phase: 'provisioning', message: 'Creating runtime' })

// ❌ 违规
console.info(`Creating devbox for ${repoUrl}`)
sendEvent('progress', { message: `Token: ${githubToken}` })
```

kubeconfig、githubToken、repoUrl、YAML 内容均不出现在任何日志中。

---

## 超时与资源管理

| 阶段 | 超时 |
|------|------|
| kubeconfig 验证 | 约 100ms（AIProxy HTTP 调用） |
| Devbox 启动等待 | 60 秒 |
| 工作区 bootstrap（clone + skill install） | 300 秒 |
| Codex Gateway 就绪等待 | 60 秒 |
| AI Turn 完成轮询 | 最长 30 分钟 |
| 结果文件读取 | 30 秒 |
| 整体请求 `maxDuration` | 1800 秒（自托管 Next.js 无实际限制） |

**资源清理保证**：无论成功还是失败，`finally` 块都会：
1. 删除 Codex Gateway 会话
2. 删除 Devbox 运行时

---

## 设计决策

### 为什么选择 SSE 而不是同步响应？

整个链路（AI 分析 + BuildKit 构建）需要 5-30 分钟。SSE 在自托管 Next.js 上可无限期保持连接，同时实时反馈进度，对 CLI 工具和 CI/CD 集成友好。

### 为什么用伪 Task 而不是新建数据库表？

现有 `ensureTaskDevboxRuntime`、`ensureCodexGatewaySession` 等核心函数已经高度封装且经过生产验证。复用它们只需提供一个符合 `Task` 类型的对象，而这些函数内部的数据库写入在 ID 不存在时静默 no-op。这避免了引入新的数据库 schema、迁移脚本和状态管理逻辑。

### 为什么认证用 kubeconfig 而不是新增 API Key 体系？

Sealos 平台已有完整的 kubeconfig 颁发和鉴权体系，AIProxy 直接接受 kubeconfig 作为认证凭证。复用这一机制无需在 ShipRepo 侧维护用户账户，接口对平台原生用户天然可用。
