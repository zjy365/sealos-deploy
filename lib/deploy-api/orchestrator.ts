import 'server-only'

import {
  createCodexGatewaySession,
  deleteCodexGatewaySession,
  getCodexGatewaySessionState,
  interruptCodexGatewayTurn,
  sendCodexGatewayTurn,
  waitForCodexGatewayReady,
} from '@/lib/codex-gateway/client'
import { getCodexGatewayAuthToken } from '@/lib/codex-gateway/config'
import { FORCED_CODEX_MODEL } from '@/lib/codex/defaults'
import type { Task } from '@/lib/db/schema'
import { deleteDevbox, getDevbox } from '@/lib/devbox/client'
import { createTaskDevboxName } from '@/lib/devbox/naming'
import { ensureTaskDevboxRuntime } from '@/lib/devbox/runtime'
import { generateId } from '@/lib/utils/id'
import type { GatewayConfig } from '@/lib/api-keys/user-keys'
import type { CodexGatewaySummaryEvent } from '@/lib/codex-gateway/types'
import { buildDeployPrompt } from './prompt'
import { extractDeployResult } from './result-parser'
import { DeployError, type DeployPhase, type SendEventFn } from './types'
import { deployErrorEventFromUnknown } from './error-event'

const DEPLOY_POLL_INTERVAL_MS = 3_000
const DEPLOY_TIMEOUT_MS = 30 * 60 * 1_000 // 30 minutes

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function buildFakeTask(repoUrl: string, branch: string): Task {
  const now = new Date()
  return {
    id: generateId(12),
    userId: 'deploy-api',
    prompt: 'deploy',
    title: null,
    repoUrl,
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
    branchName: branch,
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
}

function inferPhaseFromEvents(events: CodexGatewaySummaryEvent[]): DeployPhase {
  const combined = events.map((e) => (e.textPreview ?? '').toLowerCase()).join(' ')

  if (
    combined.includes('buildkit') ||
    combined.includes('ghcr.io') ||
    combined.includes('push') ||
    combined.includes('build')
  ) {
    return 'building'
  }

  if (combined.includes('crossplane') || combined.includes('ap.yaml') || combined.includes('deployment-output')) {
    return 'generating_yaml'
  }

  return 'analyzing'
}

export interface DeployOrchestrationInput {
  githubToken: string
  repoUrl: string
  branch: string
  gatewayConfig: GatewayConfig
  signal: AbortSignal
}

export async function runDeployOrchestration(input: DeployOrchestrationInput, sendEvent: SendEventFn): Promise<void> {
  const fakeTask = buildFakeTask(input.repoUrl, input.branch)
  const runtimeName = createTaskDevboxName(fakeTask.id)
  let gatewayUrl: string | null = null
  let sessionId: string | null = null
  let gatewayAuthToken: string | null = null
  let currentPhase: DeployPhase = 'provisioning'

  const throwIfAborted = (phase: DeployPhase) => {
    if (input.signal.aborted) {
      throw new DeployError('aborted', phase, 'Deployment aborted by client')
    }
  }

  try {
    // Phase 1: Provision Devbox runtime
    // Note: ensureTaskDevboxRuntime internally does db.update(tasks) which is a silent no-op
    // since fakeTask.id does not exist in the database.
    throwIfAborted('provisioning')
    sendEvent('progress', { phase: 'provisioning' as DeployPhase, message: 'Creating runtime' })
    const runtime = await ensureTaskDevboxRuntime(fakeTask, {
      githubToken: input.githubToken,
      gatewayConfig: input.gatewayConfig,
    })

    gatewayUrl = runtime.gatewayUrl
    if (!gatewayUrl) {
      throw new DeployError('runtime_failed', 'provisioning', 'Gateway URL not available after runtime creation')
    }

    // Phase 2: Start Codex Gateway session
    currentPhase = 'starting_ai'
    throwIfAborted('starting_ai')
    sendEvent('progress', { phase: 'starting_ai' as DeployPhase, message: 'Starting AI session' })

    const devboxInfo = await getDevbox(runtimeName)
    gatewayAuthToken = await getCodexGatewayAuthToken(devboxInfo.data)

    await waitForCodexGatewayReady(gatewayUrl)

    const session = await createCodexGatewaySession(gatewayUrl, { model: FORCED_CODEX_MODEL }, gatewayAuthToken)
    sessionId = session.sessionId

    // Phase 3: Send deploy prompt with Sealos context
    currentPhase = 'analyzing'
    throwIfAborted('analyzing')
    const prompt = buildDeployPrompt(runtime.namespace)
    await sendCodexGatewayTurn(gatewayUrl, sessionId, { prompt }, gatewayAuthToken)

    sendEvent('progress', { phase: 'analyzing' as DeployPhase, message: 'AI analyzing repository' })

    // Phase 4: Poll for turn completion
    const deadline = Date.now() + DEPLOY_TIMEOUT_MS

    while (Date.now() < deadline) {
      // Check abort before sleeping for fast response to client disconnect
      if (input.signal.aborted) {
        if (gatewayUrl && sessionId) {
          await interruptCodexGatewayTurn(gatewayUrl, sessionId, gatewayAuthToken).catch(() => {})
        }
        throw new DeployError('aborted', currentPhase, 'Deployment aborted by client')
      }

      await sleep(DEPLOY_POLL_INTERVAL_MS)

      const state = await getCodexGatewaySessionState(gatewayUrl, sessionId, gatewayAuthToken)

      if (!state.state.activeTurn && state.state.lastTurnStatus) {
        const succeeded =
          state.state.lastTurnStatus === 'completed' ||
          state.state.lastTurnStatus === 'succeeded' ||
          state.state.lastTurnStatus === 'interrupted'

        if (!succeeded) {
          throw new DeployError('ai_failed', currentPhase, 'AI deployment turn failed')
        }
        break
      }

      currentPhase = inferPhaseFromEvents(state.state.recentEvents)
      sendEvent('progress', { phase: currentPhase, message: 'AI working' })
    }

    if (Date.now() >= deadline) {
      throw new DeployError('timeout', currentPhase, 'Deployment timed out')
    }

    // Phase 5: Extract artifacts from Devbox filesystem
    currentPhase = 'generating_yaml'
    sendEvent('progress', { phase: 'generating_yaml' as DeployPhase, message: 'Extracting deployment artifacts' })
    const result = await extractDeployResult(runtimeName)

    sendEvent('complete', result)
  } catch (error) {
    console.error('Deploy orchestration error:', error)

    sendEvent('error', deployErrorEventFromUnknown(error, { currentPhase }))
  } finally {
    // Always clean up: session first, then Devbox
    // Both are awaited to ensure cleanup completes before the SSE stream closes
    if (gatewayUrl && sessionId) {
      try {
        // Re-fetch auth token in case it expired
        const devboxInfoForCleanup = await getDevbox(runtimeName).catch(() => null)
        const authTokenForCleanup = devboxInfoForCleanup
          ? await getCodexGatewayAuthToken(devboxInfoForCleanup.data)
          : gatewayAuthToken
        await deleteCodexGatewaySession(gatewayUrl, sessionId, authTokenForCleanup).catch(() => {})
      } catch {
        // ignore session cleanup errors
      }
    }

    await deleteDevbox(runtimeName).catch(() => {
      console.error('Deploy API: Devbox cleanup failed')
    })
  }
}
