import { NextRequest, NextResponse, after } from 'next/server'
import { and, desc, eq, isNull, or } from 'drizzle-orm'
import { startTaskChatV2Turn } from '@/lib/codex-gateway/chat-v2-service'
import { FORCED_CODEX_MODEL } from '@/lib/codex/defaults'
import { db } from '@/lib/db/client'
import { insertTaskSchema, tasks } from '@/lib/db/schema'
import { getServerSession } from '@/lib/session/get-server-session'
import { generateBranchName, createFallbackBranchName } from '@/lib/utils/branch-name-generator'
import { generateId } from '@/lib/utils/id'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { createTaskLogger } from '@/lib/utils/task-logger'
import { generateTaskTitle, createFallbackTitle } from '@/lib/utils/title-generator'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userTasks = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.userId, session.user.id), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.createdAt))

    return NextResponse.json({ tasks: userTasks })
  } catch (error) {
    console.error('Error fetching tasks:', error)
    return NextResponse.json({ error: 'Failed to fetch tasks' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const rateLimit = await checkRateLimit(session.user.id)
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Rate limit exceeded',
          message: `You have reached the daily limit of ${rateLimit.total} messages (tasks + follow-ups). Your limit will reset at ${rateLimit.resetAt.toISOString()}`,
          remaining: rateLimit.remaining,
          total: rateLimit.total,
          resetAt: rateLimit.resetAt.toISOString(),
        },
        { status: 429 },
      )
    }

    const body = await request.json()
    const taskId = body.id || generateId(12)
    const validatedData = insertTaskSchema.parse({
      ...body,
      id: taskId,
      userId: session.user.id,
      status: 'pending',
      progress: 0,
      logs: [],
    })

    if (validatedData.selectedAgent !== 'codex') {
      return NextResponse.json({ error: 'Unsupported agent' }, { status: 400 })
    }

    const selectedModel = FORCED_CODEX_MODEL
    const [newTask] = await db
      .insert(tasks)
      .values({
        ...validatedData,
        id: taskId,
        selectedModel,
      })
      .returning()

    after(async () => {
      try {
        if (!process.env.AI_GATEWAY_API_KEY) {
          return
        }

        const logger = createTaskLogger(taskId)
        await logger.info('Generating AI-powered branch name...')

        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore URL parsing errors
        }

        const aiBranchName = await generateBranchName({
          description: validatedData.prompt,
          repoName,
          context: `${validatedData.selectedAgent} agent task`,
        })

        await db
          .update(tasks)
          .set({
            branchName: aiBranchName,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))

        await logger.success('Generated AI branch name')
      } catch (error) {
        console.error('Error generating AI branch name:', error)

        const fallbackBranchName = createFallbackBranchName(taskId)

        try {
          await db
            .update(tasks)
            .set({
              branchName: fallbackBranchName,
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))

          const logger = createTaskLogger(taskId)
          await logger.info('Using fallback branch name')
        } catch (dbError) {
          console.error('Error updating task with fallback branch name:', dbError)
        }
      }
    })

    after(async () => {
      try {
        if (!process.env.AI_GATEWAY_API_KEY) {
          return
        }

        let repoName: string | undefined
        try {
          const url = new URL(validatedData.repoUrl || '')
          const pathParts = url.pathname.split('/')
          if (pathParts.length >= 3) {
            repoName = pathParts[pathParts.length - 1].replace(/\.git$/, '')
          }
        } catch {
          // Ignore URL parsing errors
        }

        const aiTitle = await generateTaskTitle({
          prompt: validatedData.prompt,
          repoName,
          context: `${validatedData.selectedAgent} agent task`,
        })

        await db
          .update(tasks)
          .set({
            title: aiTitle,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, taskId))
      } catch (error) {
        console.error('Error generating AI title:', error)

        const fallbackTitle = createFallbackTitle(validatedData.prompt)

        try {
          await db
            .update(tasks)
            .set({
              title: fallbackTitle,
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, taskId))
        } catch (dbError) {
          console.error('Error updating task with fallback title:', dbError)
        }
      }
    })

    try {
      await startTaskChatV2Turn({
        task: newTask,
        clientMessageId: `task-create:${taskId}`,
        prompt: validatedData.prompt,
        source: 'task-create',
      })
    } catch {
      console.error('Failed to start Codex task')

      await db
        .update(tasks)
        .set({
          status: 'error',
          error: 'Failed to start Codex gateway task',
          updatedAt: new Date(),
        })
        .where(eq(tasks.id, taskId))

      const logger = createTaskLogger(taskId)
      await logger.error('Failed to start Codex gateway task')
      return NextResponse.json({ error: 'Failed to start Codex gateway task' }, { status: 500 })
    }

    const [gatewayTask] = await db.select().from(tasks).where(eq(tasks.id, taskId)).limit(1)
    return NextResponse.json({ task: gatewayTask || newTask })
  } catch {
    console.error('Error creating task')
    return NextResponse.json({ error: 'Failed to create task' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const action = url.searchParams.get('action')

    if (!action) {
      return NextResponse.json({ error: 'Action parameter is required' }, { status: 400 })
    }

    const actions = action.split(',').map((entry) => entry.trim())
    const validActions = ['completed', 'failed', 'stopped']
    const invalidActions = actions.filter((entry) => !validActions.includes(entry))

    if (invalidActions.length > 0) {
      return NextResponse.json(
        {
          error: `Invalid action(s): ${invalidActions.join(', ')}. Valid actions: ${validActions.join(', ')}`,
        },
        { status: 400 },
      )
    }

    const statusConditions = []
    if (actions.includes('completed')) {
      statusConditions.push(eq(tasks.status, 'completed'))
    }
    if (actions.includes('failed')) {
      statusConditions.push(eq(tasks.status, 'error'))
    }
    if (actions.includes('stopped')) {
      statusConditions.push(eq(tasks.status, 'stopped'))
    }

    if (statusConditions.length === 0) {
      return NextResponse.json({ error: 'No valid actions specified' }, { status: 400 })
    }

    const statusClause = statusConditions.length === 1 ? statusConditions[0] : or(...statusConditions)
    const whereClause = and(statusClause, eq(tasks.userId, session.user.id))
    const deletedTasks = await db.delete(tasks).where(whereClause).returning()

    const actionMessages = []
    if (actions.includes('completed')) {
      const completedCount = deletedTasks.filter((task) => task.status === 'completed').length
      if (completedCount > 0) actionMessages.push(`${completedCount} completed`)
    }
    if (actions.includes('failed')) {
      const failedCount = deletedTasks.filter((task) => task.status === 'error').length
      if (failedCount > 0) actionMessages.push(`${failedCount} failed`)
    }
    if (actions.includes('stopped')) {
      const stoppedCount = deletedTasks.filter((task) => task.status === 'stopped').length
      if (stoppedCount > 0) actionMessages.push(`${stoppedCount} stopped`)
    }

    const message =
      actionMessages.length > 0
        ? `${actionMessages.join(' and ')} task(s) deleted successfully`
        : 'No tasks found to delete'

    return NextResponse.json({
      message,
      deletedCount: deletedTasks.length,
    })
  } catch (error) {
    console.error('Error deleting tasks:', error)
    return NextResponse.json({ error: 'Failed to delete tasks' }, { status: 500 })
  }
}
