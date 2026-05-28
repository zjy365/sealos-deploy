import { ensureTaskDevboxRuntime } from '@/lib/devbox/runtime'
import { resolveCodexGatewayFromApiKeys } from '@/lib/api-keys/user-keys'
import { FORCED_CODEX_MODEL } from '@/lib/codex/defaults'
import type { Task } from '@/lib/db/schema'
import { execDevbox, getDevbox, deleteDevbox } from '@/lib/devbox/client'
import { getCodexGatewayAuthToken } from '@/lib/codex-gateway/config'
import {
  createCodexGatewaySession,
  getCodexGatewaySessionState,
  sendCodexGatewayTurn,
  waitForCodexGatewayReady,
} from '@/lib/codex-gateway/client'
import { buildDeployPrompt } from '@/lib/deploy-api/prompt'
import { getAssistantContentAfterLastUser } from '@/lib/codex-gateway/transcript'

const now = new Date()
const DEBUG_TURN_TIMEOUT_MS = 12 * 60 * 1000
const DEBUG_TURN_POLL_MS = 5_000

const fakeTask: Task = {
  id: 'debugruntime1',
  userId: 'deploy-api',
  prompt: 'deploy',
  title: null,
  repoUrl: 'https://github.com/vercel/vercel',
  selectedAgent: 'codex',
  selectedModel: FORCED_CODEX_MODEL,
  installDependencies: false,
  maxDuration: 60,
  keepAlive: false,
  enableBrowser: false,
  status: 'pending',
  progress: 0,
  logs: null,
  error: null,
  branchName: 'main',
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
  activeTurnSessionId: null,
  activeTurnStartedAt: null,
  activeTurnTranscriptCursor: null,
  turnCompletionState: null,
  turnCompletionCheckedAt: null,
  sandboxId: null,
  agentSessionId: null,
  sandboxUrl: null,
  previewUrl: null,
  prUrl: null,
  prNumber: null,
  prStatus: null,
  prMergeCommitSha: null,
  mcpServerIds: null,
  createdAt: now,
  updatedAt: now,
  completedAt: null,
  deletedAt: null,
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function readArtifacts(runtimeName: string) {
  const workspaceScript = [
    'home_dir="${HOME:-/root}"',
    'if [ -d "$home_dir/workspace" ]; then',
    '  workspace_dir="$home_dir/workspace"',
    'elif [ -d /workspace ]; then',
    '  workspace_dir="/workspace"',
    'else',
    '  workspace_dir="$home_dir"',
    'fi',
  ].join('\n')

  const outputCommand = [
    workspaceScript,
    'cat "$workspace_dir/.sealos/deployment-output.json" 2>/dev/null || true',
  ].join('\n')

  const yamlCommand = [workspaceScript, 'cat "$workspace_dir/.sealos/crossplane/ap.yaml" 2>/dev/null || true'].join(
    '\n',
  )

  const [outputResult, yamlResult] = await Promise.all([
    execDevbox(runtimeName, { command: ['sh', '-lc', outputCommand], timeoutSeconds: 30 }),
    execDevbox(runtimeName, { command: ['sh', '-lc', yamlCommand], timeoutSeconds: 30 }),
  ])

  return {
    deploymentOutput: outputResult.data.stdout?.trim() || null,
    yaml: yamlResult.data.stdout?.trim() || null,
  }
}

async function main() {
  let runtimeName: string | null = null
  const gatewayConfig = resolveCodexGatewayFromApiKeys()
  if (!gatewayConfig) {
    console.log(
      JSON.stringify(
        {
          stage: 'preflight',
          error: 'missing_gateway_config',
        },
        null,
        2,
      ),
    )
    return
  }

  try {
    const runtime = await ensureTaskDevboxRuntime(fakeTask, {
      githubToken: process.env.TEST_GITHUB_TOKEN || null,
      gatewayConfig,
    })
    runtimeName = runtime.name

    const devboxInfo = await getDevbox(runtime.name)
    const gatewayAuthToken = await getCodexGatewayAuthToken(devboxInfo.data)
    if (!runtime.gatewayUrl) {
      throw new Error('Gateway URL missing after runtime provisioning')
    }

    await waitForCodexGatewayReady(runtime.gatewayUrl)
    const session = runtime.gatewayUrl
      ? await createCodexGatewaySession(runtime.gatewayUrl, { model: FORCED_CODEX_MODEL }, gatewayAuthToken)
      : null
    const prompt = buildDeployPrompt(runtime.namespace)

    if (runtime.gatewayUrl && session) {
      await sendCodexGatewayTurn(runtime.gatewayUrl, session.sessionId, { prompt }, gatewayAuthToken)
    }

    const deadline = Date.now() + DEBUG_TURN_TIMEOUT_MS
    let sessionState =
      runtime.gatewayUrl && session
        ? await getCodexGatewaySessionState(runtime.gatewayUrl, session.sessionId, gatewayAuthToken)
        : null

    while (sessionState?.state.activeTurn && Date.now() < deadline) {
      await sleep(DEBUG_TURN_POLL_MS)
      if (!runtime.gatewayUrl || !session) {
        break
      }
      sessionState = await getCodexGatewaySessionState(runtime.gatewayUrl, session.sessionId, gatewayAuthToken)
    }

    const artifacts = runtimeName ? await readArtifacts(runtimeName) : null

    console.log(
      JSON.stringify(
        {
          stage: 'ok',
          runtime,
          gatewayAuthTokenPresent: Boolean(gatewayAuthToken),
          sessionIdPresent: Boolean(session?.sessionId),
          activeTurn: sessionState?.state.activeTurn ?? null,
          lastTurnStatus: sessionState?.state.lastTurnStatus ?? null,
          timedOutWaitingForTurn: Boolean(sessionState?.state.activeTurn),
          recentEvents: sessionState?.state.recentEvents?.slice(-10) ?? null,
          assistantMessage: sessionState ? getAssistantContentAfterLastUser(sessionState.state.transcript) : null,
          deploymentOutput: artifacts?.deploymentOutput ?? null,
          yamlPresent: Boolean(artifacts?.yaml),
        },
        null,
        2,
      ),
    )
  } catch (error) {
    const err = error as Error & { status?: number; stack?: string }

    console.log(
      JSON.stringify(
        {
          stage: 'ensureTaskDevboxRuntime',
          name: err.name || null,
          message: err.message || null,
          status: err.status ?? null,
          stack: err.stack ? String(err.stack).split('\n').slice(0, 12) : null,
        },
        null,
        2,
      ),
    )
  } finally {
    if (runtimeName) {
      try {
        await deleteDevbox(runtimeName)
      } catch {
        // best-effort cleanup for debug script
      }
    }
  }
}

void main()
