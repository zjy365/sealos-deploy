import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { buildForcedCodexConfigToml, FORCED_CODEX_HOME, FORCED_CODEX_MODEL } from '@/lib/codex/defaults'
import { db } from '@/lib/db/client'
import { Task, tasks } from '@/lib/db/schema'
import { getUserApiKeys, resolveCodexGatewayFromApiKeys, type GatewayConfig } from '@/lib/api-keys/user-keys'
import { getCodexGatewaySessionTtlMs, resolveCodexGatewayUrl } from '@/lib/codex-gateway/config'
import {
  createDevbox,
  DevboxApiError,
  execDevbox,
  getDevbox,
  listDevboxes,
  refreshDevboxPause,
  resumeDevbox,
} from '@/lib/devbox/client'
import { getDevboxArchiveAfterPauseTime, getDevboxDefaultImage, getDevboxNamespace } from '@/lib/devbox/config'
import { createTaskDevboxName, createTaskDevboxUpstreamId } from '@/lib/devbox/naming'
import type { DevboxInfo, DevboxSshInfo } from '@/lib/devbox/types'
import { getUserGitHubToken } from '@/lib/github/user-token'
import { redactSensitiveInfo } from '@/lib/utils/logging'
import type { TaskLogger } from '@/lib/utils/task-logger'
import { formatKeyTaskLogMessage, TASK_FLOW_LOGS } from '@/lib/utils/task-flow-logs'
import { createAuthenticatedRepoUrl } from '@/lib/sandbox/config'

export interface TaskRuntimeSummary {
  provider: 'devbox'
  name: string
  namespace: string | null
  gatewayUrl: string | null
  state: string | null
  creationTimestamp: string | null
  deletionTimestamp: string | null
  ssh: {
    user: string
    host: string
    port: number
    target?: string
    link?: string
    command?: string
  } | null
}

interface EnsureTaskDevboxRuntimeOptions {
  githubToken?: string | null
  gatewayConfig?: GatewayConfig | null
  logger?: TaskLogger
}

const DEVBOX_SEAKILLS_INSTALL_COMMAND = 'npx --yes skills add https://github.com/Che-Zhu/brain-sandbox-skills -y'
const DEVBOX_BOOTSTRAP_READY_TIMEOUT_MS = 60_000
const DEVBOX_BOOTSTRAP_READY_POLL_MS = 2_000
const DEVBOX_SKILL_INSTALL_MARKER = '__CODEX_SKILL_INSTALLED__:1'
const DEVBOX_RUNTIME_READY_TIMEOUT_MS = 60_000
const DEVBOX_RUNTIME_READY_POLL_MS = 2_000
const DEVBOX_SECRET_READY_MAX_RETRIES = 3
const DEVBOX_SECRET_READY_RETRY_DELAY_MS = 2_000
const DEVBOX_BOOTSTRAP_DEBUG_MAX_LINES = 20
const DEVBOX_BOOTSTRAP_DEBUG_MAX_CHARS = 2_000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
}

function redactPathLikeInfo(value: string): string {
  return value
    .replace(/https?:\/\/[^\s'"]+/gi, '[REDACTED_URL]')
    .replace(/\b(?:\/[^/\s'"]+)+\/?/g, '[REDACTED_PATH]')
    .replace(/\b(?:[A-Za-z]:\\(?:[^\\\s'"]+\\)*[^\\\s'"]*)/g, '[REDACTED_PATH]')
}

function summarizeBootstrapDebugOutput(value: string): string {
  const normalized = stripAnsi(value).replace(/\r\n/g, '\n').trim()

  if (!normalized) {
    return '[empty]'
  }

  const lines = redactPathLikeInfo(redactSensitiveInfo(normalized))
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0)

  if (lines.length === 0) {
    return '[empty]'
  }

  const summary = lines.slice(-DEVBOX_BOOTSTRAP_DEBUG_MAX_LINES).join('\n')
  if (summary.length <= DEVBOX_BOOTSTRAP_DEBUG_MAX_CHARS) {
    return summary
  }

  return summary.slice(-DEVBOX_BOOTSTRAP_DEBUG_MAX_CHARS)
}

function logBootstrapDebugOutput(stdout: string, stderr: string): void {
  const stdoutSummary = summarizeBootstrapDebugOutput(stdout)
  const stderrSummary = summarizeBootstrapDebugOutput(stderr)

  console.error('Devbox workspace bootstrap stdout summary:', stdoutSummary)
  console.error('Devbox workspace bootstrap stderr summary:', stderrSummary)
}

function isDevboxSecretPendingError(error: unknown): error is DevboxApiError {
  return (
    error instanceof DevboxApiError &&
    error.status >= 500 &&
    error.message.includes('get devbox private key failed') &&
    error.message.includes('not found')
  )
}

async function getDevboxWithSecretRetry(name: string): Promise<{ data: DevboxInfo }> {
  let attempt = 0

  while (true) {
    try {
      return await getDevbox(name)
    } catch (error) {
      if (!isDevboxSecretPendingError(error) || attempt >= DEVBOX_SECRET_READY_MAX_RETRIES) {
        throw error
      }

      attempt += 1
      await sleep(DEVBOX_SECRET_READY_RETRY_DELAY_MS)
    }
  }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function getPauseAt(maxDurationMinutes: number | null): string {
  const durationMinutes = maxDurationMinutes || 300
  return new Date(Date.now() + durationMinutes * 60 * 1000).toISOString()
}

export function buildTaskWorkspaceFingerprint(task: Pick<Task, 'repoUrl' | 'branchName'>, runtimeName: string): string {
  return createHash('sha256')
    .update([runtimeName, task.repoUrl?.trim() || '', task.branchName?.trim() || ''].join('|'))
    .digest('hex')
}

function sanitizeSshInfo(ssh?: DevboxSshInfo) {
  if (!ssh) {
    return null
  }

  return {
    user: ssh.user,
    host: ssh.host,
    port: ssh.port,
    target: ssh.target,
    link: ssh.link,
    command: ssh.command,
  }
}

function buildTaskRuntimeSummary(
  runtimeName: string,
  runtimeNamespace: string | null,
  gatewayUrl?: string | null,
  info?: DevboxInfo,
): TaskRuntimeSummary {
  return {
    provider: 'devbox',
    name: runtimeName,
    namespace: runtimeNamespace,
    gatewayUrl: gatewayUrl || null,
    state: info?.state.phase || null,
    creationTimestamp: info?.creationTimestamp || null,
    deletionTimestamp: info?.deletionTimestamp || null,
    ssh: sanitizeSshInfo(info?.ssh),
  }
}

export async function clearMissingTaskRuntime(taskId: string) {
  await db
    .update(tasks)
    .set({
      runtimeProvider: null,
      runtimeName: null,
      runtimeNamespace: null,
      runtimeState: null,
      workspacePreparedAt: null,
      workspaceFingerprint: null,
      runtimeCheckedAt: null,
      gatewayReadyAt: null,
      gatewayUrl: null,
      gatewaySessionId: null,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId))
}

async function refreshRuntimeLease(task: Pick<Task, 'id' | 'maxDuration' | 'runtimeName'>): Promise<void> {
  if (!task.runtimeName) {
    return
  }

  try {
    await refreshDevboxPause(task.runtimeName, {
      pauseAt: getPauseAt(task.maxDuration),
    })
  } catch (error) {
    if (!(error instanceof DevboxApiError && error.status === 404)) {
      throw error
    }

    await clearMissingTaskRuntime(task.id)
  }
}

async function waitForRunningDevbox(runtimeName: string): Promise<DevboxInfo> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < DEVBOX_RUNTIME_READY_TIMEOUT_MS) {
    const response = await getDevboxWithSecretRetry(runtimeName)

    if (response.data.state.phase === 'Running') {
      return response.data
    }

    await sleep(DEVBOX_RUNTIME_READY_POLL_MS)
  }

  throw new Error('Timed out waiting for Devbox runtime')
}

async function ensureRunningDevbox(task: Task, runtimeName: string): Promise<DevboxInfo> {
  const response = await getDevboxWithSecretRetry(runtimeName)

  if (response.data.state.phase === 'Running') {
    return response.data
  }

  try {
    await resumeDevbox(runtimeName)
  } catch (error) {
    if (!(error instanceof DevboxApiError && error.status === 409)) {
      throw error
    }
  }

  const runtime = await waitForRunningDevbox(runtimeName)
  await refreshRuntimeLease({
    id: task.id,
    runtimeName,
    maxDuration: task.maxDuration,
  })

  return runtime
}

async function syncTaskRuntimeState(
  task: Task,
  runtimeName: string,
  runtimeNamespace: string | null,
  gatewayUrl: string | null,
  runtimeInfo: DevboxInfo,
  workspacePrepared: boolean,
): Promise<void> {
  const nextWorkspaceFingerprint = buildTaskWorkspaceFingerprint(task, runtimeName)

  await db
    .update(tasks)
    .set({
      runtimeProvider: 'devbox',
      runtimeName,
      runtimeNamespace,
      runtimeState: runtimeInfo.state.phase,
      workspacePreparedAt: workspacePrepared ? new Date() : task.workspacePreparedAt,
      workspaceFingerprint: workspacePrepared ? nextWorkspaceFingerprint : task.workspaceFingerprint,
      runtimeCheckedAt: new Date(),
      gatewayUrl,
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, task.id))
}

function shouldBootstrapWorkspace(task: Task, runtimeName: string): boolean {
  if (!task.workspacePreparedAt) {
    return true
  }

  return task.workspaceFingerprint !== buildTaskWorkspaceFingerprint(task, runtimeName)
}

async function ensureTaskWorkspaceBootstrapped(
  task: Task,
  runtimeName: string,
  githubToken: string | null,
  logger?: TaskLogger,
): Promise<{ installedSkill: boolean }> {
  const authenticatedRepoUrl = task.repoUrl ? createAuthenticatedRepoUrl(task.repoUrl, githubToken) : null
  const branchName = task.branchName?.trim() || ''
  const managedCodexConfigToml = buildForcedCodexConfigToml()
  const bootstrapScript = [
    'set -e',
    'home_dir="${HOME:-/root}"',
    'workspace_dir=""',
    'installed_codex_skill=0',
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
    'mkdir -p "$workspace_dir"',
    `codex_home_dir="\${CODEX_GATEWAY_CODEX_HOME:-${FORCED_CODEX_HOME}}"`,
    'mkdir -p "$codex_home_dir"',
    `cat > "$codex_home_dir/config.toml" <<'EOF'
${managedCodexConfigToml}EOF`,
    'user_codex_home="$home_dir/.codex"',
    'mkdir -p "$user_codex_home"',
    `cat > "$user_codex_home/config.toml" <<'EOF'
${managedCodexConfigToml}EOF`,
  ]

  if (authenticatedRepoUrl) {
    bootstrapScript.push(
      'cd "$workspace_dir"',
      'if [ ! -d .git ]; then',
      '  tmpdir="$(mktemp -d)"',
      '  cleanup() { rm -rf "$tmpdir"; }',
      '  trap cleanup EXIT',
      branchName
        ? `  git clone --depth 1 --branch ${shellEscape(branchName)} ${shellEscape(authenticatedRepoUrl)} "$tmpdir/repo"`
        : `  git clone --depth 1 ${shellEscape(authenticatedRepoUrl)} "$tmpdir/repo"`,
      '  cp -a "$tmpdir/repo"/. .',
      'fi',
    )

    if (branchName) {
      bootstrapScript.push(
        'if [ -d .git ]; then',
        `  target_branch=${shellEscape(branchName)}`,
        '  current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"',
        '  if [ "$current_branch" != "$target_branch" ]; then',
        '    if git show-ref --verify --quiet "refs/heads/$target_branch"; then',
        '      git checkout "$target_branch"',
        '    elif git ls-remote --exit-code --heads origin "$target_branch" >/dev/null 2>&1; then',
        '      git fetch --depth 1 origin "$target_branch:$target_branch"',
        '      git checkout "$target_branch"',
        '    else',
        '      git checkout -B "$target_branch"',
        '    fi',
        '  fi',
        'fi',
      )
    }
  }

  bootstrapScript.push(
    'agent_skill_marker="$workspace_dir/.agents/skills/brain-github-deploy/SKILL.md"',
    'codex_skill_marker="$workspace_dir/.codex/skills/brain-github-deploy/SKILL.md"',
    'if [ ! -f "$agent_skill_marker" ] && [ ! -f "$codex_skill_marker" ]; then',
    '  cd "$workspace_dir"',
    `  ${DEVBOX_SEAKILLS_INSTALL_COMMAND}`,
    '  installed_codex_skill=1',
    'fi',
    '# Verify that the required skill was successfully installed',
    'if [ ! -f "$agent_skill_marker" ] && [ ! -f "$codex_skill_marker" ]; then',
    "  printf 'ERROR: brain-github-deploy skill not found after install\\n' >&2",
    '  exit 1',
    'fi',
    'printf \'%s\\n\' "__CODEX_SKILL_INSTALLED__:$installed_codex_skill"',
  )

  const workspaceBootstrappingLog = formatKeyTaskLogMessage(TASK_FLOW_LOGS.DEVBOX_WORKSPACE_BOOTSTRAPPING, {
    runtimeName,
  })
  await logger?.info(workspaceBootstrappingLog)
  console.info(workspaceBootstrappingLog)
  console.info('Devbox workspace bootstrap started')

  const startedAt = Date.now()
  let lastPendingError = false

  while (true) {
    try {
      const runtime = await getDevboxWithSecretRetry(runtimeName)
      if (runtime.data.state.phase !== 'Running') {
        console.info('Devbox workspace bootstrap waiting for runtime')
        lastPendingError = true
        if (Date.now() - startedAt >= DEVBOX_BOOTSTRAP_READY_TIMEOUT_MS) {
          break
        }
        await sleep(DEVBOX_BOOTSTRAP_READY_POLL_MS)
        continue
      }

      console.info('Devbox workspace bootstrap exec started')
      const execResponse = await execDevbox(runtimeName, {
        command: ['sh', '-lc', bootstrapScript.join('\n')],
        timeoutSeconds: 300,
      })
      console.info('Devbox workspace bootstrap exec finished')

      if (execResponse.data.exitCode !== 0) {
        await logger?.error('Devbox workspace bootstrap failed')
        console.error('Devbox workspace bootstrap failed')
        logBootstrapDebugOutput(execResponse.data.stdout, execResponse.data.stderr)
        throw new Error('Failed to bootstrap Devbox workspace')
      }

      const installedSkill = execResponse.data.stdout.includes(DEVBOX_SKILL_INSTALL_MARKER)
      const workspaceReadyLog = formatKeyTaskLogMessage(TASK_FLOW_LOGS.DEVBOX_WORKSPACE_READY, {
        runtimeName,
        installedSkill,
      })
      await logger?.success(workspaceReadyLog)
      console.info(workspaceReadyLog)
      return {
        installedSkill,
      }
    } catch (error) {
      if (
        error instanceof DevboxApiError &&
        error.status === 409 &&
        error.message.includes('devbox pod is not running')
      ) {
        console.info('Devbox workspace bootstrap waiting for pod')
        lastPendingError = true
        if (Date.now() - startedAt >= DEVBOX_BOOTSTRAP_READY_TIMEOUT_MS) {
          break
        }
        await sleep(DEVBOX_BOOTSTRAP_READY_POLL_MS)
        continue
      }

      console.error('Devbox workspace bootstrap failed:', error)
      throw error
    }
  }

  if (lastPendingError) {
    console.error('Devbox workspace bootstrap timed out')
    throw new Error('Timed out waiting for Devbox workspace bootstrap')
  }

  console.error('Devbox workspace bootstrap did not complete')
  throw new Error('Devbox workspace bootstrap did not complete')
}

export async function ensureTaskDevboxRuntime(
  task: Task,
  options: EnsureTaskDevboxRuntimeOptions = {},
): Promise<TaskRuntimeSummary> {
  const logger = options.logger
  const githubToken = options.githubToken ?? (await getUserGitHubToken())

  if (task.runtimeName) {
    try {
      const existingRuntime = await ensureRunningDevbox(task, task.runtimeName)
      const runtimeNamespace = task.runtimeNamespace || getDevboxNamespace()
      const gatewayUrl = resolveCodexGatewayUrl(task.runtimeName, task.gatewayUrl, existingRuntime)
      const needsWorkspaceBootstrap = shouldBootstrapWorkspace(task, task.runtimeName)

      if (needsWorkspaceBootstrap) {
        await ensureTaskWorkspaceBootstrapped(task, task.runtimeName, githubToken, logger)
      }

      await refreshRuntimeLease(task)
      await syncTaskRuntimeState(
        task,
        task.runtimeName,
        runtimeNamespace,
        gatewayUrl,
        existingRuntime,
        needsWorkspaceBootstrap,
      )

      const runtimeSummary = buildTaskRuntimeSummary(task.runtimeName, runtimeNamespace, gatewayUrl, existingRuntime)
      if (needsWorkspaceBootstrap) {
        await logger?.success(
          formatKeyTaskLogMessage(TASK_FLOW_LOGS.DEVBOX_RUNTIME_READY, {
            mode: 'existing',
            runtimeName: task.runtimeName,
            runtimeState: existingRuntime.state.phase,
          }),
        )
      }
      console.info(
        formatKeyTaskLogMessage(TASK_FLOW_LOGS.DEVBOX_RUNTIME_READY, {
          mode: 'existing',
          runtimeName: task.runtimeName,
          runtimeState: existingRuntime.state.phase,
        }),
      )

      return runtimeSummary
    } catch (error) {
      if (!(error instanceof DevboxApiError && error.status === 404)) {
        throw error
      }

      await clearMissingTaskRuntime(task.id)
    }
  }

  const upstreamId = createTaskDevboxUpstreamId(task.id)
  const existingDevboxes = await listDevboxes(upstreamId)
  const existingDevbox = existingDevboxes.data.items[0]

  if (existingDevbox) {
    const runtimeNamespace = getDevboxNamespace()
    const runtimeInfo = await ensureRunningDevbox(task, existingDevbox.name)
    const gatewayUrl = resolveCodexGatewayUrl(existingDevbox.name, task.gatewayUrl, runtimeInfo)
    const needsWorkspaceBootstrap = shouldBootstrapWorkspace(task, existingDevbox.name)

    if (needsWorkspaceBootstrap) {
      await ensureTaskWorkspaceBootstrapped(task, existingDevbox.name, githubToken, logger)
    }

    await refreshRuntimeLease({
      id: task.id,
      runtimeName: existingDevbox.name,
      maxDuration: task.maxDuration,
    })
    await syncTaskRuntimeState(
      task,
      existingDevbox.name,
      runtimeNamespace,
      gatewayUrl,
      runtimeInfo,
      needsWorkspaceBootstrap,
    )

    const runtimeReusedLog = formatKeyTaskLogMessage(TASK_FLOW_LOGS.DEVBOX_RUNTIME_REUSED, {
      mode: 'linked',
      runtimeName: existingDevbox.name,
      runtimeState: runtimeInfo.state.phase,
    })
    const runtimeReadyLog = formatKeyTaskLogMessage(TASK_FLOW_LOGS.DEVBOX_RUNTIME_READY, {
      mode: 'linked',
      runtimeName: existingDevbox.name,
      runtimeState: runtimeInfo.state.phase,
    })
    await logger?.info(runtimeReusedLog)
    await logger?.success(runtimeReadyLog)
    console.info(runtimeReusedLog)
    console.info(runtimeReadyLog)

    const runtimeSummary: TaskRuntimeSummary = {
      provider: 'devbox',
      name: existingDevbox.name,
      namespace: runtimeNamespace,
      gatewayUrl,
      state: runtimeInfo.state.phase,
      creationTimestamp: runtimeInfo.creationTimestamp,
      deletionTimestamp: runtimeInfo.deletionTimestamp,
      ssh: sanitizeSshInfo(runtimeInfo.ssh),
    }
    return runtimeSummary
  }

  const gatewayConfig =
    options.gatewayConfig === undefined ? resolveCodexGatewayFromApiKeys(await getUserApiKeys()) : options.gatewayConfig

  const runtimeName = createTaskDevboxName(task.id)
  const runtimeEnv: Record<string, string> = {
    TASK_ID: task.id,
    CODEX_GATEWAY_HOST: '0.0.0.0',
    CODEX_GATEWAY_PORT: '1317',
    CODEX_GATEWAY_MODEL: FORCED_CODEX_MODEL,
    CODEX_GATEWAY_CODEX_HOME: FORCED_CODEX_HOME,
    CODEX_GATEWAY_SESSION_TTL_MS: getCodexGatewaySessionTtlMs(),
  }

  if (task.repoUrl) {
    runtimeEnv.REPO_URL = task.repoUrl
  }

  if (githubToken) {
    runtimeEnv.GITHUB_TOKEN = githubToken
  }

  if (gatewayConfig) {
    runtimeEnv.CODEX_GATEWAY_OPENAI_BASE_URL = gatewayConfig.baseUrl
    runtimeEnv.CODEX_GATEWAY_OPENAI_API_KEY = gatewayConfig.apiKey
  }

  if (process.env.CODEX_GATEWAY_JWT_SECRET) {
    runtimeEnv.CODEX_GATEWAY_JWT_SECRET = process.env.CODEX_GATEWAY_JWT_SECRET
  }

  const runtimeProvisioningLog = formatKeyTaskLogMessage(TASK_FLOW_LOGS.DEVBOX_RUNTIME_PROVISIONING, {
    mode: 'create',
    runtimeName,
  })
  await logger?.info(runtimeProvisioningLog)
  console.info(runtimeProvisioningLog)

  const createResponse = await createDevbox({
    name: runtimeName,
    image: getDevboxDefaultImage(),
    upstreamID: upstreamId,
    kubeAccess: {
      enabled: true,
      roleTemplate: 'edit',
    },
    env: runtimeEnv,
    pauseAt: getPauseAt(task.maxDuration),
    archiveAfterPauseTime: getDevboxArchiveAfterPauseTime(),
    labels: [
      { key: 'app.kubernetes.io/component', value: 'runtime' },
      { key: 'app.kubernetes.io/managed-by', value: 'shiprepo' },
    ],
  })

  const infoResponse = await getDevboxWithSecretRetry(runtimeName)
  const runtimeInfo =
    infoResponse.data.state.phase === 'Running' ? infoResponse.data : await ensureRunningDevbox(task, runtimeName)
  const gatewayUrl = resolveCodexGatewayUrl(runtimeName, task.gatewayUrl, runtimeInfo)

  await ensureTaskWorkspaceBootstrapped(task, runtimeName, githubToken, logger)
  await refreshRuntimeLease({
    id: task.id,
    runtimeName,
    maxDuration: task.maxDuration,
  })
  await syncTaskRuntimeState(task, runtimeName, createResponse.data.namespace, gatewayUrl, runtimeInfo, true)

  const runtimeReadyLog = formatKeyTaskLogMessage(TASK_FLOW_LOGS.DEVBOX_RUNTIME_READY, {
    mode: 'created',
    runtimeName,
    runtimeState: runtimeInfo.state.phase,
  })
  await logger?.success(runtimeReadyLog)
  console.info(runtimeReadyLog)

  const runtimeSummary = buildTaskRuntimeSummary(runtimeName, createResponse.data.namespace, gatewayUrl, runtimeInfo)

  return runtimeSummary
}

export async function refreshTaskDevboxLease(task: Pick<Task, 'id' | 'maxDuration' | 'runtimeName'>): Promise<void> {
  await refreshRuntimeLease(task)
}
