# 移除 Vercel OAuth 登录实施计划

> 给执行者：按任务逐项执行。不要开 dev server。改到 TypeScript 或 TSX 文件后，在任务 8 统一运行 `pnpm format`、`pnpm type-check`、`pnpm lint`。本计划只清理 Vercel 登录，不清理和登录无关的 Vercel 功能引用。

## 目标

把项目的登录能力收敛为只支持 GitHub 登录。删除 Vercel 登录入口、OAuth 路由、Vercel token/session 逻辑和 Vercel SDK，同时保留当前产品仍需要的非登录 Vercel 引用。

## 核心原则

如无必要，勿增实体。

本次不要新增 `lib/session/save.ts`。删除 Vercel 专用 session 代码后，直接复用 `lib/session/create-github.ts` 里已有的 `saveSession()`。

## 执行方式

本计划会在中间阶段短暂出现 import 指向待删除文件的状态，所以不要在每个任务后要求 `type-check` 通过。按任务顺序完成所有代码和文档修改后，再执行任务 7 的静态搜索和任务 8 的格式、类型、lint 验证。

如果执行者想降低中间红线，可以在同一个工作批次内先改 call site，再删对应文件：

- 先清理所有 `getEnabledAuthProviders` import，再删除 `lib/auth/providers.ts`
- 先把 `saveSession` import 改到 `@/lib/session/create-github`，再删除 `lib/session/create.ts`
- 先清理 GitHub callback 的 connect 分支，再删除 `app/api/auth/github/signin`

## 必须保留的内容

下面这些内容虽然包含 `vercel`，但不是 Vercel 登录代码，不能因为关键词匹配就删除：

- `app/api/tasks/[taskId]/deployment/route.ts` 里的 Vercel Preview 部署检测
- `components/icons/vercel-icon.tsx`，如果部署预览 UI 仍在使用它
- `@vercel/analytics`
- `@vercel/speed-insights`
- AI Gateway 相关引用，例如 `ai-gateway.vercel.sh`
- 旧 runtime 路径兼容，例如 `/home/vercel-sandbox` 和 `/vercel/sandbox`
- `lib/db/migrations/meta/` 里的历史迁移元数据

## 必须移除的内容

本次要移除这些 Vercel 登录相关能力：

- Vercel 登录按钮和 loading 状态
- Vercel OAuth sign-in route
- Vercel OAuth callback route
- sign-out 时撤销 Vercel token 的分支
- Vercel session 创建和刷新逻辑
- Vercel teams API route
- Vercel API client helper
- Vercel auth 环境变量
- `@vercel/sdk`

## 数据决策

第一轮清理不加数据库迁移。

原因：`users.provider` 是 text 字段，生产库可能已有 `provider = 'vercel'` 的历史用户。删除 Vercel 登录不应该顺手删除用户，也不应该破坏历史 task 的 user ownership。

清理后的预期行为：

- 旧的 Vercel-only 浏览器 session 会失效，用户需要重新用 GitHub 登录。
- 以前用 Vercel 登录、并且已经连接过 GitHub 的用户，可以通过 `accounts` 表映射回原来的内部 user id；本次 GitHub 登录拿到的新 token 必须刷新回 `accounts` 表。
- 以前用 Vercel 登录、但没有连接过 GitHub 的用户，清理后不能直接登录。是否迁移这些用户，需要单独设计一次数据迁移或账号恢复方案。

部署前，先在目标数据库执行：

```sql
select provider, count(*) from users group by provider;

select count(*) as legacy_vercel_with_github
from users u
join accounts a on a.user_id = u.id
where u.provider = 'vercel'
  and a.provider = 'github';

select count(*) as legacy_vercel_without_github
from users u
left join accounts a on a.user_id = u.id and a.provider = 'github'
where u.provider = 'vercel'
  and a.id is null;

select provider, external_user_id, count(*) as duplicate_count
from accounts
where provider = 'github'
group by provider, external_user_id
having count(*) > 1;
```

如果 `legacy_vercel_without_github` 大于 0，产品侧必须确认可以接受这些用户失去登录入口，或者先写独立迁移方案。

如果最后一个重复 GitHub account 查询有结果，必须先确认归属并清理重复行；否则 GitHub 登录通过 `accounts` 映射 legacy 用户时可能无法确定唯一内部用户。

---

## 任务 1：移除可配置的登录 provider 切换

**涉及文件：**

- 删除：`lib/auth/providers.ts`
- 修改：`components/auth/sign-in.tsx`
- 修改：`components/sealos-home-page-content.tsx`

### 步骤

- [ ] 删除 `lib/auth/providers.ts`。

- [ ] 在 `components/auth/sign-in.tsx` 删除这些内容：
  - `redirectToSignIn` import
  - `getEnabledAuthProviders` import
  - `loadingVercel` state
  - `hasGitHub` / `hasVercel` 判断
  - `handleVercelSignIn()`
  - Vercel 登录按钮
  - Vercel 图标 SVG
  - Vercel 相关弹窗文案分支

- [ ] 在 `components/auth/sign-in.tsx` 只保留 GitHub popup 登录逻辑：

```tsx
const [loadingGitHub, setLoadingGitHub] = useState(false)

const handleGitHubSignIn = async () => {
  setLoadingGitHub(true)
  try {
    await startGitHubPopupAuth('/api/auth/signin/github')
    window.location.reload()
  } catch (error) {
    if (error instanceof GitHubPopupAuthError && error.code === 'popup_blocked') {
      toast.error('Please allow popups and try again.')
    } else {
      toast.error('GitHub authentication failed. Please try again.')
    }
    setLoadingGitHub(false)
  }
}
```

- [ ] `components/auth/sign-in.tsx` 的弹窗描述固定为 GitHub：

```tsx
<DialogDescription>Sign in with GitHub to continue.</DialogDescription>
```

- [ ] 在 `components/sealos-home-page-content.tsx` 删除这些内容：
  - `redirectToSignIn` import
  - `getEnabledAuthProviders` import
  - `loadingVercel` state
  - `hasGitHub` / `hasVercel` 判断
  - `handleVercelSignIn()`
  - Vercel 登录按钮
  - Vercel 相关文案分支
  - `handleConnectGitHub()`，如果它只用于 Vercel 登录用户再连接 GitHub 的场景

- [ ] 在 `components/sealos-home-page-content.tsx` 的未登录弹窗中，只保留一个 GitHub 登录按钮，点击后调用 `handleGitHubSignIn`。

- [ ] `components/sealos-home-page-content.tsx` 的未登录弹窗描述固定为：

```tsx
<DialogDescription>You need to sign in with GitHub to create tasks.</DialogDescription>
```

- [ ] 仓库选择区域保留 GitHub-only 的判断：

```tsx
const canSelectRepository =
  isAuthenticated && (githubConnection.connected || isGitHubAuthUser || Boolean(selectedOwner) || Boolean(selectedRepo))
```

- [ ] 如果用户已登录但 GitHub 状态不可用，不要再展示 `Connect GitHub`。展示静态 helper：

```tsx
<div className="sealos-helper">GitHub session unavailable. Sign out and sign in again.</div>
```

- [ ] 不要为了这个状态新增 route、组件或抽象。

---

## 任务 2：删除 Vercel OAuth route 和 client 代码

**涉及文件：**

- 删除：`app/api/auth/signin/vercel/route.ts`
- 删除：`app/api/auth/callback/vercel/route.ts`
- 删除：`app/api/vercel/teams/route.ts`
- 删除：`lib/vercel-client/user.ts`
- 删除：`lib/vercel-client/teams.ts`
- 删除：`lib/vercel-client/projects.ts`
- 删除：`lib/vercel-client/types.ts`
- 删除：`lib/session/redirect-to-sign-in.ts`
- 删除：`lib/session/create.ts`

### 步骤

- [ ] 删除 Vercel OAuth route 目录：

```bash
rm -rf app/api/auth/signin/vercel app/api/auth/callback/vercel app/api/vercel
```

- [ ] 删除 Vercel client 和 Vercel session helper：

```bash
rm -rf lib/vercel-client
rm -f lib/session/redirect-to-sign-in.ts lib/session/create.ts
```

- [ ] 不要创建 `lib/session/save.ts`。

- [ ] 删除后检查是否还有 import 指向已删除文件：

```bash
rg -n "redirect-to-sign-in|lib/session/create|vercel-client|/api/vercel" app components lib
```

预期：无结果。

---

## 任务 3：把 session 运行时收敛为 GitHub-only

**涉及文件：**

- 修改：`lib/session/types.ts`
- 修改：`lib/session/server.ts`
- 修改：`app/api/auth/info/route.ts`
- 修改：`app/api/auth/signout/route.ts`
- 修改：`lib/session/get-oauth-token.ts`
- 修改：`components/auth/user.tsx`

### 步骤

- [ ] 在 `lib/session/types.ts` 中，把 auth provider 类型改成只允许 GitHub：

```ts
export interface SessionUserInfo {
  user: User | undefined
  authProvider?: 'github'
}

export interface Session {
  created: number
  authProvider: 'github'
  user: User
}
```

- [ ] 删除 `lib/session/types.ts` 里的 `Tokens` interface，前提是删除 `lib/session/create.ts` 后已经没有 import 使用它。

- [ ] 在 `lib/session/server.ts` 中拒绝旧 Vercel session。保留函数名和文件位置：

```ts
export async function getSessionFromCookie(cookieValue?: string): Promise<Session | undefined> {
  if (!cookieValue) {
    return undefined
  }

  const decrypted = await decryptJWE<Session>(cookieValue)
  if (!decrypted || decrypted.authProvider !== 'github') {
    return undefined
  }

  return {
    created: decrypted.created,
    authProvider: 'github',
    user: decrypted.user,
  }
}
```

- [ ] 在 `app/api/auth/info/route.ts` 删除这些内容：
  - `Tokens` import
  - `createSession` import
  - `saveSession as saveGitHubSession` alias
  - `getOAuthToken` import
  - Vercel session refresh 分支
  - 按 provider 分支选择 `saveSession` 的逻辑

- [ ] 在 `app/api/auth/info/route.ts` 中，从 `@/lib/session/create-github` import `saveSession`，只使用当前 session：

```ts
const session = await getSessionFromReq(req)

const response = new Response(JSON.stringify(await getData(session)), {
  headers: { 'Content-Type': 'application/json' },
})

await saveSession(response, session, authCookiePolicy)
return response
```

- [ ] 在 `app/api/auth/signout/route.ts` 中，把 `saveSession` import 从 `@/lib/session/create` 改为：

```ts
import { saveSession } from '@/lib/session/create-github'
```

- [ ] 在 `app/api/auth/signout/route.ts` 删除 Vercel token revoke 分支。保留 GitHub session 存在时撤销 GitHub token 的逻辑。

- [ ] 在 `lib/session/get-oauth-token.ts` 中，把 provider 类型改为 GitHub-only：

```ts
type OAuthProvider = 'github'
```

- [ ] 在 `lib/session/get-oauth-token.ts` 中删除 Vercel 分支，并更新注释。新注释只描述 GitHub：
  - 先查 `accounts` 表里的 connected GitHub account
  - 再 fallback 到 `users` 表里的 GitHub primary account

- [ ] 保持 `getOAuthToken(userId, 'github')` 行为不变。

- [ ] 在 `components/auth/user.tsx` 中删除 Vercel fallback。不要再使用：

```ts
session.authProvider ?? 'vercel'
props.authProvider ?? 'vercel'
```

- [ ] 在 `components/auth/user.tsx` 中，用户存在时只传 GitHub provider：

```tsx
const authProvider = useMemo(
  () => (initialized ? session.authProvider : props.authProvider) ?? 'github',
  [initialized, session.authProvider, props.authProvider],
)
```

或者更直接地，如果 `SignOut` 不再需要 provider 分支，可以把 `SignOut` props 收窄为只接收 `user`，并删除 `authProvider` 传递。优先选择改动更小、和当前组件结构更一致的做法。

---

## 任务 4：删除仅服务于 Vercel 登录的 GitHub connect/disconnect 流程

**涉及文件：**

- 删除：`app/api/auth/github/signin/route.ts`
- 删除：`app/api/auth/github/disconnect/route.ts`
- 修改：`app/api/auth/github/callback/route.ts`
- 修改：`components/auth/sign-out.tsx`
- 修改：`components/repo-selector.tsx`
- 修改：`components/sealos-home-page-content.tsx`
- 修改：`components/auth/session-provider.tsx`
- 修改：`components/task-sidebar.tsx`
- 修改：`components/task-form.tsx`

### 步骤

- [ ] 删除 GitHub connect account route：

```bash
rm -rf app/api/auth/github/signin
```

- [ ] 删除 GitHub disconnect route：

```bash
rm -rf app/api/auth/github/disconnect
```

- [ ] 在 `app/api/auth/github/callback/route.ts` 中删除 connect flow。删除内容包括：
  - `isConnectFlow`
  - `github_auth_user_id` cookie 读取和清理
  - `connect` 模式校验
  - connect 分支的账号写入、账号合并事务、`accounts` 写入、`tasks`/`connectors`/`keys` 迁移逻辑
  - 只服务 connect flow 的 imports，例如 `accounts`、`tasks`、`connectors`、`keys`、`eq`、`and`、`inArray`、`encrypt`、`generateId`、`planUserKeyMerge`

- [ ] `app/api/auth/github/callback/route.ts` 收敛为只接受 sign-in flow。保留 GitHub 登录所需逻辑：
  - 校验 popup cookie
  - 校验 `github_auth_mode === 'signin'`
  - 校验 state
  - 用 GitHub code 换 token
  - 调用 `createGitHubSession(tokenData.access_token, tokenData.scope)`
  - 调用 `saveSession(response, session, authCookiePolicy)`
  - 清理 GitHub auth cookies

- [ ] `app/api/auth/github/callback/route.ts` 中的 `GITHUB_AUTH_COOKIES` 不再包含 `github_auth_user_id`。

- [ ] 在 `components/auth/sign-out.tsx` 删除这些内容：
  - `githubConnectionAtom` import 和相关 state
  - `setGitHubConnection`
  - `loadingGitHub`
  - `getEnabledAuthProviders`
  - `GitHubPopupAuthError`
  - `startGitHubPopupAuth`
  - `handleGitHubDisconnect()`
  - `handleGitHubConnect()`
  - `authProvider === 'vercel'` 时展示的 GitHub connect/disconnect 下拉菜单
  - Vercel logout icon 分支

- [ ] 在 `components/auth/sign-out.tsx` 中，把 logout 菜单固定为 GitHub 图标：

```tsx
<DropdownMenuItem onClick={handleSignOut} className="cursor-pointer">
  <GitHubIcon className="h-4 w-4 mr-2" />
  Log Out
</DropdownMenuItem>
```

- [ ] 在 `components/repo-selector.tsx` 中，删除所有对 `/api/auth/github/disconnect` 的请求。

- [ ] 在 `components/repo-selector.tsx` 中，如果 GitHub API 返回 `401` 或 `403`，只做本地状态处理：
  - 清空 owners cache
  - 清空当前 repos cache
  - `setGitHubConnection({ connected: false })`
  - 停止 loading
  - 不调用 disconnect API

- [ ] 在 `components/repo-selector.tsx` 的本次改动 catch block 中，把动态 console log 改成静态字符串，符合 `AGENTS.md`：

```ts
console.error('Error loading owners')
console.error('Error loading repos')
console.error('Error verifying external repo')
```

- [ ] 保留 `components/auth/session-provider.tsx` 对 `/api/auth/github/status` 的请求。这个 route 会在任务 5 改成真实校验 GitHub token 是否可用，所以这里不要删除该请求。

- [ ] 在 `components/auth/session-provider.tsx` 的 catch block 中，把动态 console log 改成静态字符串：

```ts
console.error('Failed to fetch session')
console.error('Failed to fetch GitHub connection')
```

- [ ] 在 `components/task-sidebar.tsx` 中，把 `Connect GitHub to view your repositories` 改成不会暗示还存在 connect flow 的文案：

```tsx
GitHub session unavailable. Sign out and sign in again.
```

- [ ] 在 `components/task-form.tsx` 中，把 `Connect GitHub if needed, choose a repository...` 改成 GitHub-only 登录语义：

```tsx
Sign in with GitHub, choose a repository, then describe how Sealos should analyze, build, and deploy it.
```

---

## 任务 5：保留 legacy account mapping，并修正 GitHub token 状态

**涉及文件：**

- 修改：`lib/db/users.ts`
- 修改：`lib/db/schema.ts`
- 修改：`app/api/auth/github/status/route.ts`
- 修改：`lib/session/get-oauth-token.ts`

### 步骤

- [ ] 保留 `upsertUser()` 里第二段检查：如果 GitHub OAuth 身份已经存在于 `accounts` 表，则返回对应 user id。这个逻辑用于兼容历史 Vercel 用户。

- [ ] 在 `lib/db/users.ts` 的 legacy `accounts` 命中分支中，除了更新 `users.updatedAt/lastLoginAt`，还必须刷新 `accounts` 表里的 GitHub token 和 profile 字段。否则删除 GitHub connect callback 后，legacy 用户重新 GitHub 登录只能找回 user id，但后续 GitHub API 仍会使用旧 token。

实现时使用 `userData.accessToken`。它在 `createGitHubSession()` 调用 `upsertUser()` 前已经被 `encrypt(accessToken)` 加密，不要在 `upsertUser()` 里重复加密。

推荐改法：

```ts
if (existingAccount.length > 0) {
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({
        accessToken,
        scope,
        username: userData.username,
        updatedAt: now,
      })
      .where(and(eq(accounts.provider, 'github'), eq(accounts.externalUserId, externalId)))

    await tx
      .update(users)
      .set({
        updatedAt: now,
        lastLoginAt: now,
      })
      .where(eq(users.id, existingAccount[0].userId))
  })

  return existingAccount[0].userId
}
```

不要新增 helper 或 service。这个逻辑属于现有 `upsertUser()` 的 legacy mapping 分支。

- [ ] 在 `lib/db/users.ts` 中，把提到 Vercel sign-in 的注释改成 legacy 映射语义：

```ts
// This preserves legacy users who connected GitHub as a secondary account
// before GitHub became the only supported sign-in method.
```

- [ ] 如果没有剩余 caller 需要 Vercel，在 `lib/db/users.ts` 中把 `getUserByExternalId()` 的 provider 类型改成 GitHub-only：

```ts
export async function getUserByExternalId(provider: 'github', externalId: string) {
```

- [ ] 在 `lib/db/schema.ts` 中，第一轮清理先保留 `users.provider` 的 DB enum 范围：

```ts
enum: ['github', 'vercel']
```

原因：生产库可能已有 `provider = 'vercel'` 的历史行。先删登录能力，不在同一轮做 schema 收窄。

- [ ] 在 `lib/db/schema.ts` 中，更新 `accounts` 表附近注释，不再描述“Vercel 用户连接 GitHub”的新流程。改成：

```ts
// Accounts table - additional OAuth accounts linked to users.
// Kept for legacy users who connected GitHub before GitHub-only sign-in.
```

- [ ] 本轮不要增加迁移来移除 `users.provider` 里的 `vercel`。

- [ ] 修改 `app/api/auth/github/status/route.ts`。它仍然支持：
  - GitHub primary 用户，通过 `users` 表判断
  - legacy 用户，通过 `accounts` 表判断

- [ ] `app/api/auth/github/status/route.ts` 不能只查 DB 记录是否存在。它必须在返回 `connected: true` 前校验当前 token 能访问 GitHub。推荐做法：

```ts
const tokenData = await getOAuthToken(session.user.id, 'github')
if (!tokenData) {
  return Response.json({ connected: false })
}

const githubResponse = await fetch('https://api.github.com/user', {
  headers: {
    Authorization: `Bearer ${tokenData.accessToken}`,
    Accept: 'application/vnd.github.v3+json',
  },
  cache: 'no-store',
})

if (!githubResponse.ok) {
  return Response.json({ connected: false })
}
```

- [ ] `app/api/auth/github/status/route.ts` 可以继续用现有 DB 查询返回 `username` 和 `connectedAt`，但只有 token 校验成功后才能返回 `connected: true`。

- [ ] `app/api/auth/github/status/route.ts` 不要调用已删除的 disconnect API，也不要新增替代 route。token 不可用时只返回 `{ connected: false }`，UI 会提示用户 sign out/sign in。

- [ ] 把 `app/api/auth/github/status/route.ts` 中的动态 console log 改成静态字符串：

```ts
console.error('Error checking GitHub connection status')
```

- [ ] 在 `lib/session/get-oauth-token.ts` 的 catch block 中，把动态 console log 改成静态字符串：

```ts
console.error('Error fetching OAuth token')
```

---

## 任务 6：删除 Vercel auth 环境变量和 SDK 依赖

**涉及文件：**

- 修改：`Dockerfile`
- 修改：`README.md`
- 修改：`reference/configuration.md`
- 修改：`AGENTS.md`
- 修改：`package.json`
- 修改：`pnpm-lock.yaml`

### 步骤

- [ ] 在 `Dockerfile` 中删除这些构建参数和环境变量：

```dockerfile
ARG NEXT_PUBLIC_AUTH_PROVIDERS=github
ARG NEXT_PUBLIC_VERCEL_CLIENT_ID=""
ENV NEXT_PUBLIC_AUTH_PROVIDERS=$NEXT_PUBLIC_AUTH_PROVIDERS
ENV NEXT_PUBLIC_VERCEL_CLIENT_ID=$NEXT_PUBLIC_VERCEL_CLIENT_ID
```

- [ ] 在 `README.md` 的 `.env.local` 示例中删除：

```bash
NEXT_PUBLIC_AUTH_PROVIDERS=github
```

- [ ] 在 `README.md` 中确认 auth setup 写的是 GitHub 登录。

- [ ] 在 `reference/configuration.md` 中，从 required variables 删除 `NEXT_PUBLIC_AUTH_PROVIDERS`。

- [ ] 在 `reference/configuration.md` 中写清楚：当前唯一支持的登录方式是 GitHub OAuth。

- [ ] 在 `AGENTS.md` 中更新运行时变量列表：
  - 删除 `NEXT_PUBLIC_AUTH_PROVIDERS`
  - 删除任何暗示 Vercel OAuth 仍是支持登录 provider 的描述
  - 保留 `GITHUB_CLIENT_ID`
  - 保留 `GITHUB_CLIENT_SECRET`

- [ ] 只移除 `@vercel/sdk`：

```bash
pnpm remove @vercel/sdk
```

- [ ] 确认 `package.json` 里仍保留：

```json
"@vercel/analytics": "^1.6.1",
"@vercel/speed-insights": "^1.3.1"
```

---

## 任务 7：静态搜索清理

**涉及文件：**

- 本计划前面改动过的 `app/`、`components/`、`lib/`、文档和配置文件

### 步骤

- [ ] 执行 Vercel auth 残留搜索：

```bash
rg -n "signin/vercel|callback/vercel|Sign in with Vercel|Signing in with Vercel|NEXT_PUBLIC_VERCEL_CLIENT_ID|VERCEL_CLIENT_SECRET|loadingVercel|hasVercel|redirect-to-sign-in|vercel-client|/api/vercel" app components lib README.md reference Dockerfile AGENTS.md package.json
```

预期：无结果。

- [ ] 执行 provider 分支残留搜索：

```bash
rg -n "authProvider === 'vercel'|authProvider !== 'vercel'|authProvider \\?\\? 'vercel'|provider === 'vercel'|provider: 'vercel'|getEnabledAuthProviders" app components lib
```

预期：无结果。注意，如果后续搜索范围扩大到 migration metadata 或历史 schema 快照，可能会看到历史记录，不在本次清理范围内。

- [ ] 执行 connect/disconnect 残留搜索：

```bash
rg -n "/api/auth/github/signin|/api/auth/github/disconnect|handleGitHubConnect|handleGitHubDisconnect|Disconnect GitHub|Connect GitHub|github_auth_user_id|isConnectFlow|github_auth_mode.*connect|planUserKeyMerge" app components lib
```

预期：无结果。

- [ ] 执行 broad Vercel 搜索：

```bash
rg -n "vercel" app components lib package.json Dockerfile README.md reference/configuration.md AGENTS.md
```

允许剩下的结果只能属于这些类别：

- Vercel Preview 部署检测
- Vercel preview UI label 或 icon
- `@vercel/analytics`
- `@vercel/speed-insights`
- AI Gateway URL
- legacy sandbox 路径兼容
- 有意保留的历史 package/repo 名称

- [ ] 如果 broad search 里还有 Vercel auth 或 Vercel login 相关结果，继续删除，不能进入验证阶段。

---

## 任务 8：格式、类型和 lint 验证

**涉及文件：**

- 所有修改过的 TypeScript 和 TSX 文件

### 步骤

- [ ] 运行格式化：

```bash
pnpm format
```

预期：exit code 为 0。

- [ ] 验证格式：

```bash
pnpm format:check
```

预期：exit code 为 0。

- [ ] 运行 TypeScript 检查：

```bash
pnpm type-check
```

预期：exit code 为 0。

- [ ] 运行 ESLint：

```bash
pnpm lint
```

预期：exit code 为 0。

- [ ] 不要运行这些长驻命令：
  - `pnpm dev`
  - `npm run dev`
  - `next dev`
  - `pnpm start`
  - 其他会启动 dev server 或长期占用 terminal 的命令

---

## 任务 9：人工验收

这些检查需要在用户或 reviewer 可以运行 app 的环境里执行。

- [ ] 打开登录弹窗。

预期：只出现 GitHub 登录。

- [ ] 直接请求已删除的 Vercel route：

```bash
curl -i http://localhost:3000/api/auth/signin/vercel
curl -i http://localhost:3000/api/auth/callback/vercel
```

预期：返回 `404`。

- [ ] 使用 GitHub 登录。

预期：

- 用户头像出现
- 仓库选择器能加载个人仓库和组织仓库
- task 创建仍然可用

- [ ] 用旧 Vercel session cookie 测试，或者在本地测试 harness 中构造一个解密后为 `authProvider: 'vercel'` 的旧 session。

预期：

- `/api/auth/info` 返回未登录状态
- session cookie 被清空，或被替换为空 session cookie
- UI 要求用户用 GitHub 登录

- [ ] 打开一个已完成且有部署预览的 task。

预期：

- 如果 GitHub checks/deployments 数据里有 Vercel preview URL，Vercel Preview 检测仍然工作
- 原有的 Vercel Preview UI label/icon 仍然正常渲染

---

## 完成标准

只有全部满足时，才算完成：

- Vercel 登录 UI 已删除。
- Vercel OAuth route 已删除。
- Vercel auth client code 已删除。
- Vercel session 创建和刷新逻辑已删除。
- 旧 Vercel session 不再能认证用户。
- GitHub 登录仍然可用。
- 已连接 GitHub 的 legacy 用户仍可映射到原内部 user id，并刷新 `accounts` 表里的 GitHub token。
- `/api/auth/github/status` 只有在当前 GitHub token 可用时才返回 `connected: true`。
- `@vercel/sdk` 已移除。
- Analytics、Speed Insights、AI Gateway、部署预览检测、legacy runtime path 兼容都保留。
- `pnpm format` 通过。
- `pnpm format:check` 通过。
- `pnpm type-check` 通过。
- `pnpm lint` 通过。
- 静态残留搜索没有发现 Vercel auth 或 login 代码。

## 回滚方案

如果清理后 GitHub 登录或仓库访问异常：

1. 只回滚本次清理提交。
2. 运行：

```bash
pnpm install --frozen-lockfile
```

3. 运行：

```bash
pnpm type-check
pnpm lint
```

4. 不要恢复 Vercel OAuth 环境变量，除非产品明确决定继续支持 Vercel 登录。
