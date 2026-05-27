import { pgTable, text, timestamp, integer, jsonb, boolean, uniqueIndex } from 'drizzle-orm/pg-core'
import { z } from 'zod'

// Log entry types
export const logEntrySchema = z.object({
  type: z.enum(['info', 'command', 'error', 'success']),
  message: z.string(),
  timestamp: z.date().optional(),
})

export type LogEntry = z.infer<typeof logEntrySchema>

// Users table - user profile and primary OAuth account
export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey(), // Internal user ID (we generate this)
    // Primary OAuth account info (how they signed in)
    provider: text('provider', {
      enum: ['github', 'vercel'],
    }).notNull(), // Primary auth provider
    externalId: text('external_id').notNull(), // External ID from OAuth provider
    accessToken: text('access_token').notNull(), // Encrypted OAuth access token
    refreshToken: text('refresh_token'), // Encrypted OAuth refresh token
    scope: text('scope'), // OAuth scope
    // Profile info
    username: text('username').notNull(),
    email: text('email'),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastLoginAt: timestamp('last_login_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: prevent duplicate signups from same provider + external ID
    providerExternalIdUnique: uniqueIndex('users_provider_external_id_idx').on(table.provider, table.externalId),
  }),
)

export const insertUserSchema = z.object({
  id: z.string().optional(), // Auto-generated if not provided
  provider: z.enum(['github', 'vercel']),
  externalId: z.string().min(1, 'External ID is required'),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  scope: z.string().optional(),
  username: z.string().min(1, 'Username is required'),
  email: z.string().email().optional(),
  name: z.string().optional(),
  avatarUrl: z.string().url().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  lastLoginAt: z.date().optional(),
})

export const selectUserSchema = z.object({
  id: z.string(),
  provider: z.enum(['github', 'vercel']),
  externalId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  scope: z.string().nullable(),
  username: z.string(),
  email: z.string().nullable(),
  name: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  lastLoginAt: z.date(),
})

export type User = z.infer<typeof selectUserSchema>
export type InsertUser = z.infer<typeof insertUserSchema>

export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
  prompt: text('prompt').notNull(),
  title: text('title'),
  repoUrl: text('repo_url'),
  selectedAgent: text('selected_agent').default('codex'),
  selectedModel: text('selected_model'),
  installDependencies: boolean('install_dependencies').default(false),
  maxDuration: integer('max_duration').default(parseInt(process.env.MAX_SANDBOX_DURATION || '300', 10)),
  keepAlive: boolean('keep_alive').default(false),
  enableBrowser: boolean('enable_browser').default(false),
  status: text('status', {
    enum: ['pending', 'processing', 'completed', 'error', 'stopped'],
  })
    .notNull()
    .default('pending'),
  progress: integer('progress').default(0),
  logs: jsonb('logs').$type<LogEntry[]>(),
  error: text('error'),
  branchName: text('branch_name'),
  runtimeProvider: text('runtime_provider'),
  runtimeName: text('runtime_name'),
  runtimeNamespace: text('runtime_namespace'),
  runtimeState: text('runtime_state'),
  workspacePreparedAt: timestamp('workspace_prepared_at'),
  workspaceFingerprint: text('workspace_fingerprint'),
  runtimeCheckedAt: timestamp('runtime_checked_at'),
  gatewayReadyAt: timestamp('gateway_ready_at'),
  gatewayUrl: text('gateway_url'),
  gatewaySessionId: text('gateway_session_id'),
  activeTurnSessionId: text('active_turn_session_id'),
  activeTurnStartedAt: timestamp('active_turn_started_at'),
  activeTurnTranscriptCursor: integer('active_turn_transcript_cursor'),
  turnCompletionState: text('turn_completion_state', {
    enum: ['pending', 'running', 'completed', 'failed'],
  }),
  turnCompletionCheckedAt: timestamp('turn_completion_checked_at'),
  sandboxId: text('sandbox_id'),
  agentSessionId: text('agent_session_id'),
  sandboxUrl: text('sandbox_url'),
  previewUrl: text('preview_url'),
  prUrl: text('pr_url'),
  prNumber: integer('pr_number'),
  prStatus: text('pr_status', {
    enum: ['open', 'closed', 'merged'],
  }),
  prMergeCommitSha: text('pr_merge_commit_sha'),
  mcpServerIds: jsonb('mcp_server_ids').$type<string[]>(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  completedAt: timestamp('completed_at'),
  deletedAt: timestamp('deleted_at'),
})

// Manual Zod schemas for validation
export const insertTaskSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  prompt: z.string().min(1, 'Prompt is required'),
  title: z.string().optional(),
  repoUrl: z.string().url('Must be a valid URL').optional(),
  selectedAgent: z.enum(['claude', 'codex', 'copilot', 'cursor', 'gemini', 'opencode']).default('codex'),
  selectedModel: z.string().optional(),
  installDependencies: z.boolean().default(false),
  maxDuration: z.number().default(parseInt(process.env.MAX_SANDBOX_DURATION || '300', 10)),
  keepAlive: z.boolean().default(false),
  enableBrowser: z.boolean().default(false),
  status: z.enum(['pending', 'processing', 'completed', 'error', 'stopped']).default('pending'),
  progress: z.number().min(0).max(100).default(0),
  logs: z.array(logEntrySchema).optional(),
  error: z.string().optional(),
  branchName: z.string().optional(),
  runtimeProvider: z.string().optional(),
  runtimeName: z.string().optional(),
  runtimeNamespace: z.string().optional(),
  runtimeState: z.string().optional(),
  workspacePreparedAt: z.date().optional(),
  workspaceFingerprint: z.string().optional(),
  runtimeCheckedAt: z.date().optional(),
  gatewayReadyAt: z.date().optional(),
  gatewayUrl: z.string().optional(),
  gatewaySessionId: z.string().optional(),
  activeTurnSessionId: z.string().optional(),
  activeTurnStartedAt: z.date().optional(),
  activeTurnTranscriptCursor: z.number().optional(),
  turnCompletionState: z.enum(['pending', 'running', 'completed', 'failed']).optional(),
  turnCompletionCheckedAt: z.date().optional(),
  sandboxId: z.string().optional(),
  agentSessionId: z.string().optional(),
  sandboxUrl: z.string().optional(),
  previewUrl: z.string().optional(),
  prUrl: z.string().optional(),
  prNumber: z.number().optional(),
  prStatus: z.enum(['open', 'closed', 'merged']).optional(),
  prMergeCommitSha: z.string().optional(),
  mcpServerIds: z.array(z.string()).optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
  completedAt: z.date().optional(),
  deletedAt: z.date().optional(),
})

export const selectTaskSchema = z.object({
  id: z.string(),
  userId: z.string(),
  prompt: z.string(),
  title: z.string().nullable(),
  repoUrl: z.string().nullable(),
  selectedAgent: z.string().nullable(),
  selectedModel: z.string().nullable(),
  installDependencies: z.boolean().nullable(),
  maxDuration: z.number().nullable(),
  keepAlive: z.boolean().nullable(),
  enableBrowser: z.boolean().nullable(),
  status: z.enum(['pending', 'processing', 'completed', 'error', 'stopped']),
  progress: z.number().nullable(),
  logs: z.array(logEntrySchema).nullable(),
  error: z.string().nullable(),
  branchName: z.string().nullable(),
  runtimeProvider: z.string().nullable(),
  runtimeName: z.string().nullable(),
  runtimeNamespace: z.string().nullable(),
  runtimeState: z.string().nullable(),
  workspacePreparedAt: z.date().nullable(),
  workspaceFingerprint: z.string().nullable(),
  runtimeCheckedAt: z.date().nullable(),
  gatewayReadyAt: z.date().nullable(),
  gatewayUrl: z.string().nullable(),
  gatewaySessionId: z.string().nullable(),
  activeTurnSessionId: z.string().nullable(),
  activeTurnStartedAt: z.date().nullable(),
  activeTurnTranscriptCursor: z.number().nullable(),
  turnCompletionState: z.enum(['pending', 'running', 'completed', 'failed']).nullable(),
  turnCompletionCheckedAt: z.date().nullable(),
  sandboxId: z.string().nullable(),
  agentSessionId: z.string().nullable(),
  sandboxUrl: z.string().nullable(),
  previewUrl: z.string().nullable(),
  prUrl: z.string().nullable(),
  prNumber: z.number().nullable(),
  prStatus: z.enum(['open', 'closed', 'merged']).nullable(),
  prMergeCommitSha: z.string().nullable(),
  mcpServerIds: z.array(z.string()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
  deletedAt: z.date().nullable(),
})

export type Task = z.infer<typeof selectTaskSchema>
export type InsertTask = z.infer<typeof insertTaskSchema>

export const connectors = pgTable('connectors', {
  id: text('id').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
  name: text('name').notNull(),
  description: text('description'),
  type: text('type', {
    enum: ['local', 'remote'],
  })
    .notNull()
    .default('remote'),
  // For remote MCP servers
  baseUrl: text('base_url'),
  oauthClientId: text('oauth_client_id'),
  oauthClientSecret: text('oauth_client_secret'),
  // For local MCP servers
  command: text('command'),
  // Environment variables (for both local and remote) - stored encrypted
  env: text('env'),
  status: text('status', {
    enum: ['connected', 'disconnected'],
  })
    .notNull()
    .default('disconnected'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const insertConnectorSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  type: z.enum(['local', 'remote']).default('remote'),
  // For remote MCP servers
  baseUrl: z.string().url('Must be a valid URL').optional(),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
  // For local MCP servers
  command: z.string().optional(),
  // Environment variables (for both local and remote) - will be encrypted
  env: z.record(z.string(), z.string()).optional(),
  status: z.enum(['connected', 'disconnected']).default('disconnected'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectConnectorSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(['local', 'remote']),
  // For remote MCP servers
  baseUrl: z.string().nullable(),
  oauthClientId: z.string().nullable(),
  oauthClientSecret: z.string().nullable(),
  // For local MCP servers
  command: z.string().nullable(),
  // Environment variables (for both local and remote) - stored encrypted as string
  env: z.string().nullable(),
  status: z.enum(['connected', 'disconnected']),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Connector = z.infer<typeof selectConnectorSchema>
export type InsertConnector = z.infer<typeof insertConnectorSchema>

// Accounts table - additional OAuth accounts linked to users.
// Kept for legacy users who connected GitHub before GitHub-only sign-in.
export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
    provider: text('provider', {
      enum: ['github'],
    })
      .notNull()
      .default('github'), // Only GitHub for now
    externalUserId: text('external_user_id').notNull(), // GitHub user ID
    accessToken: text('access_token').notNull(), // Encrypted OAuth access token
    refreshToken: text('refresh_token'), // Encrypted OAuth refresh token
    expiresAt: timestamp('expires_at'),
    scope: text('scope'),
    username: text('username').notNull(), // GitHub username
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: a user can only have one account per provider
    userIdProviderUnique: uniqueIndex('accounts_user_id_provider_idx').on(table.userId, table.provider),
  }),
)

export const insertAccountSchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  provider: z.enum(['github']).default('github'),
  externalUserId: z.string().min(1, 'External user ID is required'),
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresAt: z.date().optional(),
  scope: z.string().optional(),
  username: z.string().min(1, 'Username is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectAccountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.enum(['github']),
  externalUserId: z.string(),
  accessToken: z.string(),
  refreshToken: z.string().nullable(),
  expiresAt: z.date().nullable(),
  scope: z.string().nullable(),
  username: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Account = z.infer<typeof selectAccountSchema>
export type InsertAccount = z.infer<typeof insertAccountSchema>

// Keys table - user's API keys for various services
// Each row represents one API key for one provider for one user
export const keys = pgTable(
  'keys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Foreign key to users table
    provider: text('provider', {
      enum: ['anthropic', 'openai', 'cursor', 'gemini', 'aigateway', 'aiproxy'],
    }).notNull(),
    value: text('value').notNull(), // Encrypted API key value
    baseUrl: text('base_url'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: a user can only have one key per provider
    userIdProviderUnique: uniqueIndex('keys_user_id_provider_idx').on(table.userId, table.provider),
  }),
)

export const insertKeySchema = z.object({
  id: z.string().optional(),
  userId: z.string(),
  provider: z.enum(['anthropic', 'openai', 'cursor', 'gemini', 'aigateway', 'aiproxy']),
  value: z.string().min(1, 'API key value is required'),
  baseUrl: z.string().url().optional(),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectKeySchema = z.object({
  id: z.string(),
  userId: z.string(),
  provider: z.enum(['anthropic', 'openai', 'cursor', 'gemini', 'aigateway', 'aiproxy']),
  value: z.string(),
  baseUrl: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Key = z.infer<typeof selectKeySchema>
export type InsertKey = z.infer<typeof insertKeySchema>

export const taskEventKindValues = [
  'user_message.created',
  'gateway.session.opened',
  'gateway.state.snapshot',
  'gateway.notification',
  'gateway.server_request',
  'gateway.warning',
  'gateway.session.closed',
  'turn.started',
  'turn.interrupted',
  'turn.completed',
  'turn.failed',
  'assistant.message.projected',
] as const

export const taskEventKindSchema = z.enum(taskEventKindValues)
export type TaskEventKind = z.infer<typeof taskEventKindSchema>

export const taskEvents = pgTable(
  'task_events',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    kind: text('kind').notNull().$type<TaskEventKind>(),
    streamId: text('stream_id'),
    sessionId: text('session_id'),
    threadId: text('thread_id'),
    turnId: text('turn_id'),
    clientMessageId: text('client_message_id'),
    payload: jsonb('payload').$type<Record<string, unknown> | null>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskSeqUnique: uniqueIndex('task_events_task_id_seq_idx').on(table.taskId, table.seq),
    taskClientMessageUnique: uniqueIndex('task_events_task_id_client_message_id_idx').on(
      table.taskId,
      table.clientMessageId,
    ),
  }),
)

export const insertTaskEventSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  seq: z.number().int().nonnegative().optional(),
  kind: taskEventKindSchema,
  streamId: z.string().optional(),
  sessionId: z.string().optional(),
  threadId: z.string().optional(),
  turnId: z.string().optional(),
  clientMessageId: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  createdAt: z.date().optional(),
})

export const selectTaskEventSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  seq: z.number().int(),
  kind: taskEventKindSchema,
  streamId: z.string().nullable(),
  sessionId: z.string().nullable(),
  threadId: z.string().nullable(),
  turnId: z.string().nullable(),
  clientMessageId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()).nullable(),
  createdAt: z.date(),
})

export type TaskEvent = z.infer<typeof selectTaskEventSchema>
export type InsertTaskEvent = z.infer<typeof insertTaskEventSchema>

export const taskStreamStatusValues = ['active', 'closed', 'errored'] as const
export const taskStreamStatusSchema = z.enum(taskStreamStatusValues)
export type TaskStreamStatus = z.infer<typeof taskStreamStatusSchema>

export const taskStreams = pgTable('task_streams', {
  id: text('id').primaryKey(),
  taskId: text('task_id')
    .notNull()
    .references(() => tasks.id, { onDelete: 'cascade' }),
  sessionId: text('session_id').notNull(),
  threadId: text('thread_id'),
  turnId: text('turn_id'),
  status: text('status').notNull().$type<TaskStreamStatus>().default('active'),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  lastEventAt: timestamp('last_event_at').defaultNow().notNull(),
  endedAt: timestamp('ended_at'),
})

export const insertTaskStreamSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
  threadId: z.string().optional(),
  turnId: z.string().optional(),
  status: taskStreamStatusSchema.optional(),
  startedAt: z.date().optional(),
  lastEventAt: z.date().optional(),
  endedAt: z.date().optional(),
})

export const selectTaskStreamSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  sessionId: z.string(),
  threadId: z.string().nullable(),
  turnId: z.string().nullable(),
  status: taskStreamStatusSchema,
  startedAt: z.date(),
  lastEventAt: z.date(),
  endedAt: z.date().nullable(),
})

export type TaskStream = z.infer<typeof selectTaskStreamSchema>
export type InsertTaskStream = z.infer<typeof insertTaskStreamSchema>

// Task messages table - stores user and agent messages for each task
export const taskMessages = pgTable(
  'task_messages',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }), // Foreign key to tasks table
    role: text('role', {
      enum: ['user', 'agent'],
    }).notNull(), // Who sent the message
    content: text('content').notNull(), // The message content
    clientMessageId: text('client_message_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    taskClientMessageUnique: uniqueIndex('task_messages_task_id_client_message_id_idx').on(
      table.taskId,
      table.clientMessageId,
    ),
  }),
)

export const insertTaskMessageSchema = z.object({
  id: z.string().optional(),
  taskId: z.string().min(1, 'Task ID is required'),
  role: z.enum(['user', 'agent']),
  content: z.string().min(1, 'Content is required'),
  clientMessageId: z.string().optional(),
  createdAt: z.date().optional(),
})

export const selectTaskMessageSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  role: z.enum(['user', 'agent']),
  content: z.string(),
  clientMessageId: z.string().nullable(),
  createdAt: z.date(),
})

export type TaskMessage = z.infer<typeof selectTaskMessageSchema>
export type InsertTaskMessage = z.infer<typeof insertTaskMessageSchema>

// Settings table - key-value pairs for overriding environment variables per user
export const settings = pgTable(
  'settings',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }), // Required user reference
    key: text('key').notNull(), // Setting key (e.g., 'maxMessagesPerDay')
    value: text('value').notNull(), // Setting value (stored as text)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: prevent duplicate keys per user
    userIdKeyUnique: uniqueIndex('settings_user_id_key_idx').on(table.userId, table.key),
  }),
)

export const insertSettingSchema = z.object({
  id: z.string().optional(),
  userId: z.string().min(1, 'User ID is required'),
  key: z.string().min(1, 'Key is required'),
  value: z.string().min(1, 'Value is required'),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
})

export const selectSettingSchema = z.object({
  id: z.string(),
  userId: z.string(),
  key: z.string(),
  value: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type Setting = z.infer<typeof selectSettingSchema>
export type InsertSetting = z.infer<typeof insertSettingSchema>

// Keep legacy export for backwards compatibility during migration
export const userConnections = accounts
export type UserConnection = Account
export type InsertUserConnection = InsertAccount
