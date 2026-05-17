# Architecture

This document explains how ShipRepo is organized, how a repository moves through the app lifecycle, and where to look when changing core behavior.

## System Overview

The app is a Next.js App Router application with three main responsibilities:

1. Present a Sealos app lifecycle UI for authenticated users.
2. Persist task, auth, runtime, preview, and connector state in Postgres through Drizzle ORM.
3. Orchestrate a fixed `codex` + `gpt-5.4` execution path that runs inside a Devbox runtime and is driven through the Codex Gateway.

At a high level:

- The home page is the entry point for choosing a GitHub repository and starting a lifecycle task.
- Task API routes create and manage task state.
- Devbox code provisions or resumes the cloud runtime that hosts the task workspace.
- Codex Gateway code opens sessions, sends turns, proxies streams, and finalizes task completion.
- Task pages surface analysis, fixes, preview state, runtime state, and follow-up operations back to the user.

## Product Lifecycle

ShipRepo should keep the user on one path:

```text
GitHub repo -> Analyze -> Fix deploy blockers -> Preview -> Ship -> Operate
```

- `Analyze`: inspect framework, package manager, build command, start command, port, env vars, and resource needs.
- `Fix`: generate or correct Dockerfile, Sealos template, runtime config, and deployment-specific code changes.
- `Preview`: create a reproducible Sealos cloud preview that can be shared and verified.
- `Ship`: turn a verified preview into a Sealos deployment.
- `Operate`: continue with logs, env vars, redeploys, domains, database/object-storage binding, rollback, and follow-up changes.

This boundary matters: the product is not a generic AI coding console. Codex is used as a Sealos deployment engineer.

## Main User Surfaces

### Home page

- Route: `app/page.tsx`
- Main UI: `components/sealos-home-page-content.tsx`
- Input form: `components/task-form.tsx`

This flow is optimized for a single repo-to-Sealos path:

- the user signs in
- chooses a GitHub repository
- starts deployment analysis or describes the desired Sealos outcome
- is redirected into the task workspace

### Task workspace

- Route: `app/tasks/[taskId]/page.tsx`
- Main UI: `components/sealos-task-page-client.tsx`
- Chat UI: `components/task-chat.tsx`

The task workspace is the main operational screen. It shows:

- current lifecycle task title or prompt
- chat and follow-up turns
- task actions
- runtime and task status
- preview links and deployment-related outputs

Other supporting task UI lives in components such as `components/task-details.tsx`, `components/file-browser.tsx`, and related dialogs.

### Repository views

- Layout route: `app/repos/[owner]/[repo]/layout.tsx`
- Shared UI: `components/repo-layout.tsx`

These pages expose repository context outside the task flow:

- commits
- issues
- pull requests

Repository views are supporting surfaces. The main product path remains repo lifecycle execution.

## Execution Flow

### 1. Task submission

The client submits a task through `POST /api/tasks` in `app/api/tasks/route.ts`.

That route:

- validates input against the Drizzle-backed Zod schema
- forces the execution path to `codex`
- forces the model to `gpt-5.4`
- inserts the task row
- starts the first task turn
- kicks off asynchronous title and branch-name generation

This keeps the request responsive while still recording task metadata early.

### 2. Runtime preparation

Before a turn is sent to Codex Gateway, the app ensures a Devbox runtime exists for the task.

Primary code:

- `lib/devbox/runtime.ts`
- `lib/devbox/client.ts`
- `lib/devbox/config.ts`

The runtime layer is responsible for:

- creating or reusing a runtime
- restoring paused runtimes
- refreshing the runtime lease
- preparing the workspace for the task repository
- resolving gateway connection details from runtime metadata

### 3. Gateway turn execution

Primary code:

- `lib/codex-gateway/chat-v2-service.ts`
- `lib/codex-gateway/runner.ts`
- `lib/codex-gateway/session.ts`
- `lib/codex-gateway/completion.ts`

The gateway layer:

- ensures a gateway session exists
- prepends Sealos deployment context on the first turn
- sends the user prompt to Codex Gateway
- records turn checkpoints and message events
- waits for completion or terminal failure
- updates task state in the database

### 4. Task state projection

Task state is persisted in the `tasks` table and related message or event tables in `lib/db/schema.ts`.

The frontend reads from task APIs and hooks such as:

- `lib/hooks/use-task.ts`
- `lib/hooks/use-task-agent-chat-v2.ts`

This keeps the task workspace live while long-running runtime and gateway work is in progress.

## Core Data Model

The most important persisted entities are:

- `users`: signed-in users and their primary auth provider state
- `tasks`: lifecycle prompt, runtime state, gateway state, preview/PR metadata, logs, and timestamps
- `connectors`: user-level connector definitions

The `tasks` table acts as the operational center of the app. It stores:

- prompt and title
- selected agent and selected model
- runtime provider, runtime name, and runtime namespace
- gateway URL and gateway session identifiers
- task status and progress
- PR and preview metadata
- timestamps for lifecycle checkpoints

## Runtime and Gateway Boundary

The app intentionally separates runtime concerns from gateway concerns:

- Devbox owns the execution environment and workspace lifecycle.
- Codex Gateway owns session and turn orchestration.

The boundary is joined by runtime-derived gateway metadata such as:

- gateway URL
- gateway auth token
- runtime namespace

This separation makes it easier to evolve runtime handling and prompt/session handling independently.

## Routing and Module Boundaries

### App Router

Use `app/` for:

- pages
- layouts
- route handlers
- metadata generation

### Components

Use `components/` for:

- page-level client UI
- task workspace UI
- dialogs and controls
- reusable primitives and `components/ui/`

### Library code

Use `lib/` for:

- database access
- runtime orchestration
- gateway orchestration
- auth and session logic
- utilities and state helpers

## Logging and Task Flow Messages

The codebase distinguishes between:

- task-facing logs persisted on the task
- server-side console logging for diagnostics

For task-facing flow logs, use the helpers in:

- `lib/utils/task-logger.ts`
- `lib/utils/task-flow-logs.ts`

This is important because the project has explicit restrictions on dynamic values in logs.

## Where To Start When Changing Something

### Change the submission flow

Start with:

- `components/task-form.tsx`
- `components/sealos-home-page-content.tsx`
- `app/api/tasks/route.ts`

### Change runtime behavior

Start with:

- `lib/devbox/runtime.ts`
- `lib/devbox/config.ts`
- `lib/sealos/config.ts`

### Change Codex execution behavior

Start with:

- `lib/codex-gateway/chat-v2-service.ts`
- `lib/codex-gateway/runner.ts`
- `lib/sealos-deploy-context.ts`

### Change task UI

Start with:

- `components/sealos-task-page-client.tsx`
- `components/task-chat.tsx`
- `components/task-details.tsx`

### Change repository pages

Start with:

- `components/repo-layout.tsx`
- `components/repo-commits.tsx`
- `components/repo-issues.tsx`
- `components/repo-pull-requests.tsx`
