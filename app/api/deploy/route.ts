import type { NextRequest } from 'next/server'
import { validateKubeconfig } from '@/lib/deploy-api/auth'
import { runDeployOrchestration } from '@/lib/deploy-api/orchestrator'
import type { SendEventFn } from '@/lib/deploy-api/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 1800

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

  // Validate URL format early
  try {
    new URL(repoUrl)
  } catch {
    return Response.json({ error: 'repoUrl must be a valid URL' }, { status: 400 })
  }

  // Authenticate via kubeconfig before establishing SSE stream
  const authResult = await validateKubeconfig(kubeconfig)

  if (!authResult.ok) {
    return Response.json({ error: 'Authentication failed', reason: authResult.reason }, { status: 401 })
  }

  const encoder = new TextEncoder()
  let streamController: ReadableStreamDefaultController<Uint8Array> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller
    },
    cancel() {
      console.info('Deploy API: SSE stream cancelled by client')
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
      repoUrl,
      branch: resolvedBranch,
      gatewayConfig: authResult.gatewayConfig,
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
