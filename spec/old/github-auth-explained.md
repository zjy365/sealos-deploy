# GitHub 登录、GitHub OAuth、GitHub App 的区别

这份文档专门解释一个很容易混淆的问题：

- GitHub 作为登录方式，到底是什么意思
- GitHub OAuth 和 GitHub App 有什么区别
- 为什么当前项目在“GitHub 登录”之后，可以直接看到和操作用户的 GitHub 仓库
- 这件事为什么不等于 GitHub App

## 1. 先说结论

当前项目里，GitHub 不只是“登录方式”，而是：

1. 用 GitHub OAuth 识别用户身份
2. 同时申请更高的 GitHub scope
3. 拿到一个代表用户本人的 access token
4. 后续再用这个 token 调 GitHub API、访问仓库、创建 PR、push 分支

所以当前项目的实际模式是：

- `GitHub 登录`
- `GitHub OAuth 资源授权`
- `以用户身份操作 GitHub`

它不是：

- 纯粹的“只拿 GitHub 用户资料做登录”
- 也不是 GitHub App

## 2. 三个概念必须分开看

这三个概念经常被混在一起，但它们不是同一层的东西。

### 2.1 GitHub 作为登录方式

这件事只表示：

- 用户用 GitHub 证明“我是谁”

最小能力通常只有：

- 获取 GitHub 用户 ID
- 获取用户名
- 获取头像
- 获取邮箱

这种情况下，GitHub 的角色是：

- `身份提供商`

类似：

- Google 登录
- Apple 登录
- GitHub 登录

在这个层面上，系统只知道用户是谁，不代表系统就一定有权限访问用户仓库。

### 2.2 GitHub OAuth

GitHub OAuth 的本质是：

- `用户把自己的 GitHub 权限授权给你的应用`

你拿到的是：

- `user access token`

这个 token 代表的是：

- `这个用户本人`

系统之后可以拿这个 token 去请求 GitHub API。能做哪些事，取决于授权 scope。

### 2.3 GitHub App

GitHub App 的本质是：

- `某个 app 被安装到某些仓库或组织，然后按安装权限工作`

你拿到的是：

- `installation access token`

这个 token 代表的是：

- `某个 GitHub App 在某次 installation 下的身份`

它不是用户本人。

## 3. OAuth 和 GitHub App 的核心区别

## 3.1 授权主体不同

### OAuth

授权主体是：

- `用户`

意思是：

- 用户把自己的权限借给应用

### GitHub App

授权主体是：

- `installation`

意思是：

- 某个 app 被装到了某个组织/仓库，并被授予一组权限

## 3.2 token 代表的身份不同

### OAuth token

代表：

- 用户本人

所以应用是在“代替用户”操作 GitHub。

### GitHub App installation token

代表：

- 某个安装后的 app

所以应用是在“以 app 身份”操作 GitHub。

## 3.3 权限范围来源不同

### OAuth

权限来自：

- scope

例如：

- `read:user`
- `user:email`
- `repo`

如果用户本人能访问一个 repo，且 scope 足够，那么应用通常也能跟着访问。

### GitHub App

权限来自：

- app 配置的权限
- installation 安装到哪些仓库

例如：

- Contents: read/write
- Pull requests: read/write
- Issues: read-only

即使安装者本人能访问更多仓库，app 也不一定能访问那些仓库。

## 3.4 仓库可见范围不同

### OAuth

更接近：

- `用户能看到什么，应用就能跟着看到什么`

### GitHub App

更接近：

- `app 被安装到哪里，就只能看到哪里`

## 4. 当前项目为什么“GitHub 登录后就能看到仓库”

因为当前项目申请的不是纯登录 scope，而是更高权限的 OAuth scope。

在当前代码里，GitHub 登录发起时使用的是：

- `repo`
- `read:user`
- `user:email`

也就是说，系统做的不是：

- “只让用户用 GitHub 登录”

而是：

- “让用户用 GitHub 登录，并顺便授权仓库访问权限”

所以用户登录成功后，系统拿到的 token 不只是身份 token，而是：

- 一个可以访问用户 GitHub 资源的 OAuth access token

这就是为什么系统后续可以：

- 拉取用户 repo 列表
- 读取 commits
- 读取 issues
- 读取 pull requests
- 创建 PR
- merge PR
- clone 私有仓库
- push 分支

## 5. 当前仓库里的具体实现方式

## 5.1 登录时申请 scope

GitHub 登录入口在：

- `app/api/auth/signin/github/route.ts`

这里构造 GitHub authorize URL 时，scope 写的是：

- `repo,read:user,user:email`

这一步很关键。

如果这里只申请：

- `read:user,user:email`

那系统通常只能拿来做登录识别，不足以操作仓库。

## 5.2 callback 中换取 token

回调在：

- `app/api/auth/github/callback/route.ts`

这里会：

1. 用 `code` 换 `access_token`
2. 拉取 GitHub 用户资料
3. 把 token 加密后存入数据库

存储位置有两种：

- GitHub 作为主登录账户时，写入 `users`
- GitHub 作为额外连接账户时，写入 `accounts`

## 5.3 后续统一取用户 GitHub token

取 token 的入口在：

- `lib/github/user-token.ts`

逻辑是：

1. 先找 `accounts`
2. 再找 `users`

这样就能支持：

- GitHub 直接登录
- Vercel 登录后额外绑定 GitHub

## 5.4 用用户 token 构造 Octokit

封装在：

- `lib/github/client.ts`

这里本质上就是：

- `new Octokit({ auth: userToken })`

这说明后续所有 GitHub REST API 调用，都是在“以用户身份”执行。

## 5.5 这个 token 被用在了哪些地方

当前项目里，这个用户 OAuth token 会被用于：

- 获取用户仓库列表
- 获取 commits / issues / pull requests
- 创建 PR
- merge PR
- 获取 PR 状态
- 访问私有仓库内容
- 在 sandbox 中 clone 私有仓库
- 最后 push 代码回 GitHub

所以当前系统不是“登录后顺便显示一下头像”，而是真正把 OAuth token 当作仓库操作凭证。

## 6. 为什么这不等于 GitHub App

虽然当前项目能操作用户仓库，但这件事依然不等于 GitHub App。

原因是权限模型完全不同。

### 当前项目的语义

是：

- `用户本人有权限`
- `用户授权给了应用`
- `应用代替用户执行操作`

### GitHub App 的语义

是：

- `某个 app 被安装到了某些仓库`
- `app 拿到 installation token`
- `app 以自己的 installation 身份执行操作`

两者的权限边界完全不同。

## 7. 为什么你会直觉上觉得“登录”和“仓库访问”应该分开

因为从产品设计角度，它们通常确实是两个独立层面。

## 7.1 纯登录场景

只需要：

- `read:user`
- `user:email`

系统通常只能：

- 识别用户身份
- 做账号体系
- 同步头像和昵称

不能自然获得 repo 访问能力。

## 7.2 登录 + 资源授权场景

如果系统在登录时顺便申请：

- `repo`

那就变成：

- 登录和资源授权合并到一次 OAuth 流程里

当前项目就是这种设计。

所以你的感觉没有错：

- 当前项目表面上是“GitHub 登录”
- 但实际上它做的是“GitHub 登录 + GitHub OAuth 授权”

## 8. 一个简单的判断方法

以后你看到别的系统时，可以用下面三个问题快速判断它到底是哪种模型。

### 问题 1：token 代表谁

- 代表用户本人：OAuth
- 代表 app installation：GitHub App

### 问题 2：权限从哪里来

- 来自 scope：OAuth
- 来自 app 权限配置和安装范围：GitHub App

### 问题 3：能访问哪些仓库

- 用户自己能访问且 scope 允许的仓库：OAuth
- app 被安装到的仓库：GitHub App

## 9. 用一个例子对比

假设用户 Alice：

- 能访问 `alice/blog`
- 能访问 `acme/web`
- 能访问 `acme/api`

### 情况 A：OAuth + repo scope

如果 Alice 登录并授权了 `repo` scope，那么应用通常能代表 Alice：

- 看到 `alice/blog`
- 看到 `acme/web`
- 看到 `acme/api`

前提是 Alice 本人本来就有权限。

### 情况 B：GitHub App 只安装到 `acme/web`

那 app 拿到 installation token 后，通常只能：

- 看到 `acme/web`

即使 Alice 本人还能访问 `alice/blog` 和 `acme/api`，app 也不一定能访问。

## 10. 当前项目最准确的描述

如果要用一句不含糊的话描述当前项目的 GitHub 集成方式，最准确的说法是：

当前项目把 GitHub 既当作登录提供商，也当作资源授权来源；系统通过 GitHub OAuth 获取代表用户本人的 access token，再用这个 token 去访问和操作用户可访问的 GitHub 仓库。

它不是：

- 只把 GitHub 当登录 provider

也不是：

- 基于 GitHub App installation 的仓库权限模型

## 11. 对二开的意义

理解这件事对二开很重要，因为它决定了你后面很多设计选择。

### 如果你继续沿用当前模式

你得到的是：

- 实现简单
- 直接以用户身份操作仓库
- 适合个人用户或轻量产品

但代价是：

- 权限边界较粗
- 用户 token 是核心依赖

### 如果未来改成 GitHub App

你得到的是：

- 更细粒度权限控制
- 更适合组织级产品
- 更清晰的安装与仓库边界

但代价是：

- 实现更复杂
- 需要 installation 管理和 webhook 体系

## 12. 一句话总结

一句话总结当前现状：

这个项目之所以能在用户登录后直接看见并操作 GitHub 仓库，不是因为“GitHub 只是登录方式”，而是因为它在登录时同时申请了 GitHub OAuth 的仓库访问权限，并在后续一直使用这个代表用户本人的 OAuth token。
