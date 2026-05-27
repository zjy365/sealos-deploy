import path from 'node:path'
import { and, eq, isNull } from 'drizzle-orm'
import { resolveCodexGatewayUrl } from '@/lib/codex-gateway/config'
import { db } from '@/lib/db/client'
import { type Task, tasks } from '@/lib/db/schema'
import { DevboxApiError, execDevbox, getDevbox } from '@/lib/devbox/client'
import { ensureTaskDevboxRuntime } from '@/lib/devbox/runtime'
import { type DevboxExecResult, type DevboxInfo } from '@/lib/devbox/types'
import { createTaskLogger } from '@/lib/utils/task-logger'

const WORKSPACE_DIR_SCRIPT = [
  'home_dir="${HOME:-/root}"',
  'if [ -d "$home_dir/workspace" ]; then',
  '  workspace_dir="$home_dir/workspace"',
  'elif [ -d /workspace ]; then',
  '  workspace_dir="/workspace"',
  'elif [ -d /app ] && [ -f /app/package.json ]; then',
  '  workspace_dir="/app"',
  'elif [ -d "$home_dir/.git" ] || [ -f "$home_dir/package.json" ] || [ -d "$home_dir/src" ]; then',
  '  workspace_dir="$home_dir"',
  'else',
  '  workspace_dir="$PWD"',
  'fi',
  'printf "%s\\n" "$workspace_dir"',
].join('\n')

const LEGACY_PROJECT_DIR = '/vercel/sandbox/project'
const LEGACY_HOME_DIR = '/home/vercel-sandbox'

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function normalizeRelativePath(input: string): string {
  const normalized = path.posix.normalize(input.replace(/^\/+/, ''))

  if (!normalized || normalized === '.') {
    return ''
  }

  if (normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Path escapes workspace')
  }

  return normalized
}

function toWorkspacePath(workspaceDir: string, targetPath?: string | null): string {
  if (!targetPath) {
    return workspaceDir
  }

  const trimmed = targetPath.trim()
  if (!trimmed || trimmed === '.' || trimmed === './') {
    return workspaceDir
  }

  const normalizedWorkspace = path.posix.normalize(workspaceDir)

  if (trimmed.startsWith(normalizedWorkspace)) {
    const relative = normalizeRelativePath(trimmed.slice(normalizedWorkspace.length))
    return relative ? path.posix.join(normalizedWorkspace, relative) : normalizedWorkspace
  }

  if (trimmed.startsWith(LEGACY_PROJECT_DIR)) {
    const relative = normalizeRelativePath(trimmed.slice(LEGACY_PROJECT_DIR.length))
    return relative ? path.posix.join(normalizedWorkspace, relative) : normalizedWorkspace
  }

  if (trimmed.startsWith(LEGACY_HOME_DIR)) {
    const relative = normalizeRelativePath(trimmed.slice(LEGACY_HOME_DIR.length))
    return relative ? path.posix.join(normalizedWorkspace, relative) : normalizedWorkspace
  }

  if (trimmed.startsWith('/')) {
    const relative = normalizeRelativePath(trimmed)
    return relative ? path.posix.join(normalizedWorkspace, relative) : normalizedWorkspace
  }

  const relative = normalizeRelativePath(trimmed)
  return relative ? path.posix.join(normalizedWorkspace, relative) : normalizedWorkspace
}

export async function getOwnedTask(taskId: string, userId: string): Promise<Task | null> {
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId), isNull(tasks.deletedAt)))
    .limit(1)

  return task ?? null
}

export async function ensureOwnedTaskRuntime(task: Task): Promise<{ task: Task; runtimeName: string }> {
  const logger = createTaskLogger(task.id)
  const runtime = await ensureTaskDevboxRuntime(task, { logger })

  const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, task.id)).limit(1)

  return {
    task: updatedTask ?? task,
    runtimeName: runtime.name,
  }
}

export async function getTaskRuntimeInfo(task: Task): Promise<DevboxInfo> {
  if (!task.runtimeName) {
    throw new Error('Task does not have an active runtime')
  }

  const response = await getDevbox(task.runtimeName)

  await db
    .update(tasks)
    .set({
      runtimeState: response.data.state.phase,
      gatewayUrl: resolveCodexGatewayUrl(task.runtimeName, task.gatewayUrl, response.data),
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id))

  return response.data
}

export async function getTaskWorkspaceDir(runtimeName: string): Promise<string> {
  const result = await execDevbox(runtimeName, {
    command: ['sh', '-lc', WORKSPACE_DIR_SCRIPT],
    timeoutSeconds: 20,
  })

  if (result.data.exitCode !== 0) {
    throw new Error('Failed to resolve runtime workspace')
  }

  const workspaceDir = result.data.stdout.trim()
  if (!workspaceDir) {
    throw new Error('Runtime workspace is empty')
  }

  return workspaceDir
}

export async function execInTaskWorkspace(
  task: Task,
  command: string,
  options: {
    cwd?: string | null
    timeoutSeconds?: number
  } = {},
): Promise<{
  runtimeName: string
  workspaceDir: string
  cwd: string
  result: DevboxExecResult
}> {
  const { runtimeName } = await ensureOwnedTaskRuntime(task)
  const workspaceDir = await getTaskWorkspaceDir(runtimeName)
  const cwd = toWorkspacePath(workspaceDir, options.cwd)
  const script = ['set -e', `cd ${shellEscape(cwd)}`, command].join('\n')
  const response = await execDevbox(runtimeName, {
    command: ['sh', '-lc', script],
    timeoutSeconds: options.timeoutSeconds ?? 60,
  })

  return {
    runtimeName,
    workspaceDir,
    cwd,
    result: response.data,
  }
}

export function toTaskRelativePath(targetPath: string): string {
  return normalizeRelativePath(targetPath)
}

export function buildRuntimePortUrl(baseUrl: string | null | undefined, port: number): string | null {
  const resolvedBaseUrl = baseUrl?.trim()
  if (!resolvedBaseUrl) {
    return null
  }

  try {
    const url = new URL(resolvedBaseUrl)
    url.port = String(port)
    return url.toString()
  } catch {
    return null
  }
}

export function isDevboxNotRunningError(error: unknown): boolean {
  return error instanceof DevboxApiError && (error.status === 404 || error.status === 409)
}
