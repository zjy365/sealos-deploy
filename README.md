# ShipRepo

ShipRepo is a Next.js app for turning a GitHub repository into a runnable Sealos application. A user selects a repo, asks Sealos to prepare it, and the app runs a fixed `codex` + `gpt-5.4` execution path inside a Devbox runtime to analyze the project, fix deployment blockers, create a preview, and prepare the app to ship.

![ShipRepo Screenshot](screenshot.png)

## Why This Project Exists

- Turn an existing GitHub repository into a Sealos app lifecycle task.
- Move users through one product path: analyze, fix, preview, ship, and operate.
- Keep the agent focused on Sealos deployment engineering instead of a generic AI coding console.
- Use Devbox as the cloud execution environment and Codex Gateway as the task orchestration layer.
- Support per-user GitHub authentication, AIProxy keys, runtime state, and follow-up deployment work.

## Product Scope

ShipRepo starts from the repo the user already owns. It should help answer:

- Can this project run on Sealos?
- What deployment blockers exist?
- Which Dockerfile, build command, start command, port, env vars, or Sealos template are missing?
- Can Sealos create a cloud preview that the user can verify without running the project locally?
- Can the verified preview be shipped and then operated from the same task workspace?

The product is not intended to replace a local IDE or local `localhost:3000` development loop. Local preview proves that code can run on one developer machine. Sealos preview proves that the repository can run in a reproducible cloud deployment environment.

## What Developers Get

- A GitHub repository entry point for Sealos deployment readiness checks.
- Task pages with chat, logs, runtime state, file changes, preview actions, and follow-up turns.
- Deployment-focused Codex execution inside a Devbox runtime.
- Persistent task state in Postgres through Drizzle ORM.
- A foundation for Sealos lifecycle operations such as previews, env var fixes, redeploys, logs, domains, databases, object storage, and rollback workflows.

## Core Workflow

1. A user signs in and connects GitHub.
2. The home page lets the user choose a repository and start a Sealos app lifecycle task.
3. The app creates a task, stores it in Postgres, and starts the fixed `codex` + `gpt-5.4` flow.
4. A Devbox runtime is provisioned or resumed for the task.
5. Codex analyzes the repo for Sealos readiness and fixes deployment blockers when possible.
6. The task produces a Sealos preview URL or a concrete blocker list.
7. The user verifies the preview, ships the app, and continues operational follow-up in the task workspace.

## Tech Stack

- Next.js 16
- React 19
- Tailwind CSS
- shadcn/ui
- PostgreSQL
- Drizzle ORM and drizzle-kit
- AI SDK 5
- Codex Gateway
- Devbox runtime infrastructure

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- A PostgreSQL database
- A GitHub OAuth app
- Access to the Sealos and Devbox environment this app targets
- An AI gateway key for Codex execution, unless users provide scoped keys in the app

### 1. Install dependencies

```bash
git clone <your-repository-url>
cd ShipRepo
pnpm install
```

### 2. Configure environment variables

Create `.env.local`:

```bash
POSTGRES_URL=
SEALOS_HOST=
DEVBOX_TOKEN=
JWE_SECRET=
ENCRYPTION_KEY=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
AI_GATEWAY_API_KEY=
```

Optional:

- `APP_BASE_URL` for self-hosted callback overrides
- `NPM_TOKEN` for private npm installs inside task runtimes
- `MAX_SANDBOX_DURATION` to change the default runtime timeout
- `MAX_MESSAGES_PER_DAY` to change the per-user daily message limit

### 3. Apply database migrations

```bash
pnpm db:migrate
```

`drizzle.config.ts` loads `.env.local` first and falls back to `.env`, so `POSTGRES_URL` must be available before running Drizzle commands.

### 4. Start the app

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), sign in with GitHub, choose a repository, and start a Sealos lifecycle task.

## Project Structure

- `app/`: Next.js App Router pages and API routes
- `components/`: UI for the home page, task workspace, repo views, auth, and dialogs
- `lib/codex-gateway/`: Codex Gateway sessions, turns, streaming, and completion handling
- `lib/devbox/`: runtime provisioning, reuse, health checks, and lease refresh
- `lib/db/`: schema, queries, settings, and checked-in migrations
- `lib/session/` and `lib/auth/`: authentication and session handling
- `app/repos/[owner]/[repo]/`: repository pages for commits, issues, and pull requests
- `app/tasks/[taskId]/`: task workspace entry point

## Further Reading

- [reference/product-overview.zh.md](reference/product-overview.zh.md): product positioning and lifecycle path
- [reference/architecture.md](reference/architecture.md): request flow, runtime lifecycle, and module boundaries
- [reference/configuration.md](reference/configuration.md): environment variables, auth setup, migrations, and runtime behavior

## Development

### Common commands

```bash
pnpm dev
pnpm build
pnpm type-check
pnpm lint
pnpm format
```

### Database commands

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Configuration Notes

- The current task execution path is intentionally pinned to `codex` + `gpt-5.4`.
- Authentication is GitHub OAuth-only; configure `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.
- Users can provide their own API keys in the app, which can override global key configuration.
- Connectors are managed from the application UI; if a connector stores OAuth credentials, `ENCRYPTION_KEY` must be set.

## License

Licensed under Apache 2.0. See [LICENSE](LICENSE).
