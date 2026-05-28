# Deploy API 本地测试报告

**最后更新**: 2026-05-28
**接口**: `POST /api/deploy`
**范围**: 本文只记录本地 dev 环境下的 `/api/deploy` 测试流程、结果和当前卡点；线上部署环境暂不纳入本文。

---

## 一、最新结论

本地 dev 流程已经验证到很后面：

1. 本地 `/api/deploy` 可以进入 SSE。
2. Devbox runtime 可以创建并进入 `Running`。
3. workspace bootstrap 可以完成。
4. Codex Gateway session 可以创建。
5. AI turn 可以执行。
6. BuildKit Job / Pod / Service 可以创建。
7. Next.js production build 可以完成。
8. `.sealos/deployment-output.json` 和 `.sealos/crossplane/ap.yaml` 可以生成。

本轮没有返回 `complete`，直接原因是：

```text
GHCR push failed with 403 Forbidden
```

更准确地说：

> 这次测试使用的是 `labring/ShipRepo`，目标镜像也被生成到了 `ghcr.io/labring/shiprepo:...`。当前 token 虽然能访问并 push GitHub repo，但没有向 `labring` 这个 GHCR namespace 发布 package 的权限，所以镜像 push 失败。

因此，如果目标镜像改到当前 token principal 有权限写入的 GHCR namespace，例如自己的 GitHub 用户或自己有 package 写权限的 org，应该可以越过这个 GHCR `403 Forbidden` 卡点。前提是 token 具备 `write:packages`，并且目标 package namespace 的 org / SSO / package policy 允许写入。

另一个本地 API 层问题是：

> runtime 内已经生成了 `.sealos` 产物，但 `lib/deploy-api/result-parser.ts` 没有查 `/home/devbox/workspace`，导致 API 最终把真实失败误报成 `result_missing`。

---

## 二、请求格式

当前 `/api/deploy` 请求体只需要：

```json
{
  "githubToken": "<GitHub PAT>",
  "repoUrl": "https://github.com/owner/repo",
  "branch": "main"
}
```

字段说明：

- `githubToken`: 必填，建议具备仓库读取权限和目标 GHCR namespace 的 package 写入权限。
- `repoUrl`: 必填，必须是 GitHub HTTPS 仓库地址。
- `branch`: 可选，默认 `main`。

本轮本地测试使用：

```json
{
  "repoUrl": "https://github.com/labring/ShipRepo",
  "branch": "main"
}
```

GitHub API 验证结果：

- token 可以访问 `labring/ShipRepo`
- default branch: `main`
- repo permissions: `pull=true`, `push=true`

注意：

- GitHub repo `push` 权限不等价于 GHCR package `push` 权限。
- 本轮失败点正是 GHCR package 写入权限，而不是 GitHub repo 访问权限。

---

## 三、本地前置依赖

本地请求进入 SSE 之前，服务端依赖以下配置。

### 3.1 AI Gateway 配置

服务端会先调用 `resolveCodexGatewayFromApiKeys()`。

可用配置为：

- `AIPROXY_API_KEY`，或
- `AI_GATEWAY_API_KEY`

可选补充：

- `AIPROXY_BASE_URL`

如果这些都没有，请求会直接返回：

```json
{"error":"AI gateway configuration is required"}
```

HTTP 500。

### 3.2 Devbox 配置

运行时创建阶段依赖：

- `DEVBOX_TOKEN`，或
- `DEVBOX_JWT_SIGNING_KEY`

以及相关 Devbox / Sealos 基础地址配置。

本地配置中没有显式 `DEVBOX_NAMESPACE`，因此源码默认 namespace 是：

```text
ns-test
```

---

## 四、本地真实执行流程

本地主链路如下：

```text
POST http://localhost:3000/api/deploy
  -> 解析 JSON body
  -> 校验 githubToken / repoUrl / branch
  -> 校验 repoUrl 必须是 GitHub HTTPS URL
  -> resolveCodexGatewayFromApiKeys()
  -> 返回 SSE
  -> ensureTaskDevboxRuntime(...)
  -> workspace bootstrap
  -> 获取 gatewayUrl / gateway auth token
  -> createCodexGatewaySession(...)
  -> sendCodexGatewayTurn(...)
  -> 轮询 getCodexGatewaySessionState(...)
  -> AI 在 runtime 内分析仓库
  -> 生成 .sealos/config.json
  -> 生成 .sealos/build-request.json
  -> 创建 BuildKit Job / Pod / Service
  -> buildctl 执行 Next.js production build
  -> buildctl push GHCR image
  -> AI 写入 .sealos/deployment-output.json
  -> AI 写入 .sealos/crossplane/ap.yaml
  -> API 读取产物
  -> 返回 complete / error
```

---

## 五、SSE phase 含义

本地 SSE 中主要出现的 phase：

- `provisioning`: 创建和准备 Devbox runtime
- `starting_ai`: 建立 Codex Gateway session
- `analyzing`: AI 分析仓库并开始执行部署任务
- `building`: AI 已进入镜像构建/推送相关阶段
- `generating_yaml`: AI 或 API 正在处理 `.sealos` / Crossplane 产物

首个事件：

```text
event: progress
data: {"phase":"provisioning","message":"Creating runtime"}
```

如果已经收到它，说明：

- 请求体校验已经通过
- AI Gateway 配置检查已经通过
- 问题已经进入 runtime 创建或后续阶段

注意：`building` / `generating_yaml` 目前是从 Gateway recentEvents 文本推断出来的，不是严格状态机，所以可能来回变化。

---

## 六、本地测试结果

本地请求：

```text
POST http://localhost:3000/api/deploy
```

最终 SSE：

```text
provisioning
starting_ai
analyzing
building
generating_yaml
error {"code":"result_missing","phase":"generating_yaml","message":"Deployment failed"}
```

总耗时：

```text
约 963 秒
```

关键 runtime 信息：

| 字段 | 值 |
|------|----|
| Devbox namespace | `ns-test` |
| runtimeName | `xzletstwwaoy` |
| workspace | `/home/devbox/workspace` |
| target image | `ghcr.io/labring/shiprepo:prepare-457e56299290` |
| commit ref | `457e5629929048c9463eaee3e7859737ed31b2e2` |

关键 BuildKit 信息：

| 字段 | 值 |
|------|----|
| BuildKit job | `bsb-shiprepo-457e562-05281007` |
| BuildKit pod | `bsb-shiprepo-457e562-05281007-kslvk` |
| BuildKit service | `bsb-shiprepo-457e562-05281007-svc` |
| BuildKit endpoint | `10.0.1.163:1234` |
| BuildKit image | `moby/buildkit:master` |
| GHCR secret | `bsb-ghcr-05281007` |

BuildKit pod 状态：

```text
Running / Ready
```

Next.js production build 状态：

```text
build completed
```

镜像 push 结果：

```text
failed to push ghcr.io/labring/shiprepo:prepare-457e56299290:
unexpected status from HEAD request ... 403 Forbidden
```

AI 写出的失败产物：

```json
{
  "status": "failed",
  "mode": "build_failed",
  "message": "Deployment image was not pushed to GHCR",
  "error": "GHCR push failed with 403 Forbidden; use a GITHUB_TOKEN that can publish ghcr.io/labring/shiprepo or set .sealos/config.json.target_image to a GHCR repository owned by the token principal"
}
```

本地结论：

- `ensureTaskDevboxRuntime(...)` 本身可以成功跑通。
- workspace bootstrap 可以成功跑通。
- Gateway session 和 AI turn 可以成功跑通。
- BuildKit 可以成功创建并完成 Next.js production build。
- 当前构建链路卡在 GHCR push 权限。
- 产物已经在 runtime 内生成，但 API 读取产物时路径查找失败。

---

## 七、GHCR 权限结论

本轮 GHCR 失败可以这样理解：

```text
repoUrl = https://github.com/labring/ShipRepo
target image = ghcr.io/labring/shiprepo:prepare-...
```

AI / skill 根据仓库 owner/name 生成了 `ghcr.io/labring/shiprepo` 作为目标镜像。当前 token 对 repo 有读写权限，但对 `labring` 这个 GHCR package namespace 没有发布权限，因此 push 被拒绝。

如果改为：

```text
target image = ghcr.io/<token-owner-or-writable-org>/<image-name>:prepare-...
```

并满足：

- token 有 `write:packages`
- token principal 有目标 namespace 的 package 写权限
- 如果目标 namespace 是 org，org SSO / package policy 允许这个 token 写入

那么应能越过本轮的 GHCR `403 Forbidden`。

因此后续本地验证可以优先使用以下任一策略：

1. 使用当前 token 有 package 写权限的 GitHub repo / org。
2. 保持 repoUrl 不变，但把 target image 改到当前 token 有权限写入的 GHCR namespace。
3. 给当前 token 开通 `ghcr.io/labring/shiprepo` 的 package 写权限。

---

## 八、result-parser workspace 路径问题

当前 `lib/deploy-api/result-parser.ts` 里的 workspace 查找逻辑只检查：

```text
$HOME/workspace
/workspace
$HOME
```

但本地真实 workspace 是：

```text
/home/devbox/workspace
```

因此 runtime 内已经生成了：

```text
/home/devbox/workspace/.sealos/deployment-output.json
/home/devbox/workspace/.sealos/crossplane/ap.yaml
```

API 仍然可能读错到 `/root/.sealos/...`，最终返回：

```text
error {"code":"result_missing","phase":"generating_yaml","message":"Deployment failed"}
```

修复建议：

- 复用 runtime bootstrap 里的 workspace discovery 逻辑。
- 至少把 `/home/devbox/workspace` 加入 `FIND_WORKSPACE_CMD`。
- 如果 `deployment-output.json.status !== "succeeded"`，应该向 SSE 返回更准确的 `build_failed`，而不是被路径问题掩盖成 `result_missing`。

---

## 九、本地已验证通过的环节

本地已经验证通过：

- 请求体校验
- GitHub repo URL 校验
- AI Gateway 配置检查
- Devbox runtime 创建
- runtime 进入 `Running`
- workspace bootstrap
- repo clone
- skill install
- gatewayUrl / gateway auth token 获取
- Codex Gateway ready check
- Gateway session 创建
- Gateway turn 发送
- Gateway turn 轮询
- BuildKit Job / Pod / Service 创建
- BuildKit pod Ready
- buildctl 启动
- Next.js production build
- `.sealos/deployment-output.json` 生成
- `.sealos/crossplane/ap.yaml` 生成

这些环节已经不是本地流程的主阻塞点。

---

## 十、本地推荐排查顺序

### Step 1：先修 result-parser 路径

先让 API 能读到真实 runtime workspace：

```text
/home/devbox/workspace
```

这样下一次本地请求应该能从 `result_missing` 变成更准确的 `build_failed`，并暴露 GHCR 403 的真实错误。

### Step 2：解决 GHCR push 权限

继续使用本地 dev 跑验证，目标是让 target image 指向当前 token 有写权限的 GHCR namespace：

```text
ghcr.io/<writable-owner>/<image-name>:prepare-...
```

如果仍使用 `ghcr.io/labring/shiprepo:prepare-...`，需要给当前 token principal 开通对该 package namespace 的写入权限。

### Step 3：重新跑本地 `/api/deploy`

目标结果：

```text
complete {"image":"ghcr.io/<writable-owner>/<image-name>:prepare-...","yaml":"..."}
```

或至少在失败时返回准确的：

```text
error {"code":"build_failed","phase":"building","message":"Deployment failed"}
```

### Step 4：补成功样例

本地整条链路跑通后，再补：

- 成功请求样例
- 完整成功 SSE 流
- `complete` payload
- 最终 image
- 最终 Crossplane AP YAML

---

## 十一、关于 buildctl / BuildKit

当前链路里看到 `buildctl` 是正常的。

- **BuildKit** 是构建系统。
- **buildctl** 是驱动 BuildKit 的 CLI。

本地验证中，AI 创建了 Kubernetes BuildKit Job：

```text
job.batch/bsb-shiprepo-457e562-05281007
```

并通过：

```text
buildctl --addr tcp://bsb-shiprepo-457e562-05281007-svc.ns-test.svc.cluster.local:1234 build ...
```

执行镜像构建和 push。

因此日志里出现 `buildctl`，代表 AI 正在通过 BuildKit 构建和推送镜像，而不是说明“没用 BuildKit”。
