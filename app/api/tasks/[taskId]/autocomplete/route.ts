import { NextRequest, NextResponse } from 'next/server'
import { execInTaskWorkspace, getOwnedTask } from '@/lib/devbox/task-compat'
import { getServerSession } from '@/lib/session/get-server-session'

export async function POST(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const { partial, cwd } = await request.json()

    if (typeof partial !== 'string') {
      return NextResponse.json({ success: false, error: 'Partial text is required' }, { status: 400 })
    }

    const task = await getOwnedTask(taskId, session.user.id)
    if (!task) {
      return NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
    }

    const parts = partial.split(/\s+/)
    const lastPart = parts[parts.length - 1] || ''

    let dir = cwd || '.'
    let prefix = ''

    if (lastPart.includes('/')) {
      const lastSlash = lastPart.lastIndexOf('/')
      const pathPart = lastPart.substring(0, lastSlash + 1)
      prefix = lastPart.substring(lastSlash + 1)

      if (pathPart.startsWith('/')) {
        dir = pathPart
      } else if (pathPart.startsWith('~/')) {
        dir = `/home/vercel-sandbox/${pathPart.substring(2)}`
      } else {
        dir = `${cwd || '.'}/${pathPart}`
      }
    } else {
      prefix = lastPart
    }

    const { result } = await execInTaskWorkspace(task, 'ls -1ap 2>/dev/null || true', {
      cwd: dir,
      timeoutSeconds: 20,
    })

    const completions = result.stdout
      .trim()
      .split('\n')
      .filter((entry: string) => entry && entry.toLowerCase().startsWith(prefix.toLowerCase()))
      .map((entry: string) => ({
        name: entry,
        isDirectory: entry.endsWith('/'),
      }))

    return NextResponse.json({
      success: true,
      data: {
        completions,
        prefix,
      },
    })
  } catch (error) {
    console.error('Error in autocomplete endpoint:', error)
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 })
  }
}
