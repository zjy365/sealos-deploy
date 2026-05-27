import type { NextRequest } from 'next/server'
import { validateKubeconfig } from '@/lib/deploy-api/auth'
import { runDeployOrchestration } from '@/lib/deploy-api/orchestrator'
import type { SendEventFn } from '@/lib/deploy-api/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 1800

// Only GitHub HTTPS URLs are accepted: https://github.com/{owner}/{repo}[.git]
const GITHUB_REPO_URL_PATTERN = /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(\.git)?$/

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>

  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { kubeconfig, githubToken, repoUrl, branch } = body as {
    kubeconfig?: string
    githubToken?: string
    repoUrl?: string
    branch?: string
  }

  if (!kubeconfig || typeof kubeconfig !== 'string') {
    return Response.json({ error: 'kubeconfig is required' }, { status: 400 })
  }

  if (!githubToken || typeof githubToken !== 'string') {
    return Response.json({ error: 'githubToken is required' }, { status: 400 })
  }

  if (!repoUrl || typeof repoUrl !== 'string') {
    return Response.json({ error: 'repoUrl is required' }, { status: 400 })
  }

  // Restrict to GitHub HTTPS URLs only: other hosts would not be cloned with the provided token
  if (!GITHUB_REPO_URL_PATTERN.test(repoUrl.trim())) {
    return Response.json(
      { error: 'repoUrl must be a GitHub repository URL (https://github.com/{owner}/{repo})' },
      { status: 400 },
    )
  }

  // Authenticate via kubeconfig before establishing SSE stream
  const authResult = await validateKubeconfig(kubeconfig)

  if (!authResult.ok) {
    return Response.json({ error: 'Authentication failed', reason: authResult.reason }, { status: 401 })
  }

  const encoder = new TextEncoder()
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null

  // Single abort controller driven by both stream cancellation and request disconnection
  const abortController = new AbortController()

  // Propagate request-level disconnect signal
  req.signal.addEventListener('abort', () => abortController.abort(), { once: true })

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
    cancel() {
      console.info('Deploy API: SSE stream cancelled by client')
      abortController.abort()
    },
  })

  const sendEvent: SendEventFn = (event, data) => {
    if (!streamController) return
    try {
      streamController.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
    } catch {
      // Stream may already be closed
    }
  }

  const resolvedBranch = typeof branch === 'string' && branch.trim() ? branch.trim() : 'main'

  // Run orchestration in background; close stream when done
  runDeployOrchestration(
    {
      githubToken,
      repoUrl: repoUrl.trim(),
      branch: resolvedBranch,
      gatewayConfig: authResult.gatewayConfig,
      signal: abortController.signal,
    },
    sendEvent,
  ).finally(() => {
    try {
      streamController?.close()
    } catch {
      // Already closed
    }
  })

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
