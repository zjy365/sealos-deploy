# Configuration

This document collects the configuration and operational details that are useful when setting up, running, or extending the project locally.

## Required Environment Variables

### Core app infrastructure

These values are required for the app to boot and run its main task flow:

- `POSTGRES_URL`: Postgres connection string used by the app and Drizzle commands
- `SEALOS_HOST`: Sealos region host, for example `staging-usw-1.sealos.io`
- `DEVBOX_TOKEN`: static Devbox API token
- `JWE_SECRET`: secret for session encryption
- `ENCRYPTION_KEY`: symmetric key used to encrypt stored tokens and user API keys
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth client secret

### Codex execution

- `AI_GATEWAY_API_KEY`: required for the current Codex execution path unless users are expected to supply their own key through the UI

## Optional Environment Variables

- `APP_BASE_URL`: explicit public base URL for OAuth callbacks in self-hosted deployments
- `NPM_TOKEN`: used when runtimes need to install private npm dependencies
- `MAX_SANDBOX_DURATION`: default runtime lifetime in minutes
- `MAX_MESSAGES_PER_DAY`: per-user daily limit for tasks and follow-up turns
- `DEVBOX_NAMESPACE`: override the default Devbox namespace
- `DEVBOX_RUNTIME_IMAGE`: override the runtime image
- `DEVBOX_ARCHIVE_AFTER_PAUSE_TIME`: archive timing after runtime pause
- `DEVBOX_JWT_SIGNING_KEY`: required when `DEVBOX_TOKEN` is not set and JWT auth is used instead
- `DEVBOX_JWT_TTL_SECONDS`: token lifetime for JWT-based Devbox auth
- `CODEX_GATEWAY_SESSION_TTL_MS`: session TTL for Codex Gateway

## Derived Sealos Values

The app derives several URLs from `SEALOS_HOST` in `lib/sealos/config.ts`.

For a host such as `staging-usw-1.sealos.io`, the app derives:

- region: `staging-usw-1`
- region URL: `https://staging-usw-1.sealos.io`
- template API: `https://template.staging-usw-1.sealos.io/api/v2alpha/templates/raw`
- Devbox base URL: `https://devbox-server.staging-usw-1.sealos.io`

## Authentication Setup

### GitHub OAuth

The only supported sign-in flow is GitHub OAuth.

Required OAuth scopes are defined in `lib/auth/oauth.ts`:

- `repo`
- `read:user`
- `user:email`
- `read:packages`
- `write:packages`

The GitHub callback route is:

- `/api/auth/github/callback`

For local development, a typical OAuth app setup uses:

- homepage URL: `http://localhost:3000`
- callback URL: `http://localhost:3000/api/auth/github/callback`

### App base URL behavior

If `APP_BASE_URL` is set, it is used for callback resolution. Otherwise, the app falls back to forwarded headers and finally to `req.nextUrl.origin`.

## Devbox Authentication Modes

The app supports two ways to authenticate to Devbox:

### Static token

If `DEVBOX_TOKEN` is present, it is used directly.

### JWT signing mode

If `DEVBOX_TOKEN` is absent, the app expects:

- `DEVBOX_JWT_SIGNING_KEY`
- optionally `DEVBOX_JWT_TTL_SECONDS`

In this mode the app signs short-lived JWTs scoped to the configured namespace.

## Runtime Behavior

The main task flow runs inside a Devbox runtime.

Key behaviors:

- runtimes can be created, resumed, and refreshed
- runtime namespace defaults to `ns-test` unless overridden
- runtime lifetime is bounded by `MAX_SANDBOX_DURATION` or a task-specific duration
- if task retention is enabled, the runtime remains available for follow-up work until timeout

The code that governs this behavior lives mainly in:

- `lib/devbox/runtime.ts`
- `lib/devbox/config.ts`
- `lib/sealos/config.ts`

## Codex Gateway Configuration

The project is intentionally pinned to a fixed execution path:

- agent: `codex`
- model: `gpt-5.4`

Relevant code:

- `lib/codex/defaults.ts`
- `lib/codex-gateway/config.ts`
- `app/api/tasks/route.ts`

Gateway URL and auth token are primarily resolved from Devbox runtime metadata. Existing stored task values are used as fallback when necessary.

## Database and Migrations

The project uses Drizzle ORM and checked-in SQL migrations under:

- `lib/db/migrations/`

Drizzle configuration lives in:

- `drizzle.config.ts`

Important behavior:

- `.env.local` is loaded first
- `.env` is used as fallback
- Drizzle commands fail fast if `POSTGRES_URL` is missing

Typical commands:

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:studio
```

## Local Development Checklist

1. Create `.env.local` with required values.
2. Run `pnpm install`.
3. Run `pnpm db:migrate`.
4. Run `pnpm dev`.
5. Sign in with GitHub.
6. Choose a repository and create a task.

## Operational Notes

### User-scoped API keys

Users can provide their own API keys through the application. Those values can override global configuration for supported flows.

### Connector encryption

Connector secrets and user API keys depend on `ENCRYPTION_KEY`. If that key is missing, encrypted storage paths will not work correctly.

### Logging restrictions

The repository has strict logging rules:

- default to static log messages
- only allow dynamic runtime identifiers through the task-flow logging utility
- avoid sensitive values in logs and user-facing errors

Read `AGENTS.md` before changing logging, auth, or task execution code.
