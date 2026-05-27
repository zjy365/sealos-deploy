'use client'

import { useMemo } from 'react'
import { useTask } from '@/lib/hooks/use-task'
import { TaskChat } from '@/components/task-chat'
import { SharedHeader } from '@/components/shared-header'
import { TaskActions } from '@/components/task-actions'

interface SealosTaskPageClientProps {
  taskId: string
  initialStars?: number
  maxSandboxDuration?: number
}

function parseRepoFromUrl(repoUrl: string | null): { owner: string; repo: string } | null {
  if (!repoUrl) return null

  try {
    const url = new URL(repoUrl)
    const pathParts = url.pathname.split('/').filter(Boolean)

    if (pathParts.length >= 2) {
      return {
        owner: pathParts[0],
        repo: pathParts[1].replace(/\.git$/, ''),
      }
    }
  } catch {
    return null
  }

  return null
}

export function SealosTaskPageClient({ taskId, initialStars = 1200 }: SealosTaskPageClientProps) {
  const { task, isLoading, error } = useTask(taskId)
  const repoInfo = useMemo(() => parseRepoFromUrl(task?.repoUrl ?? null), [task?.repoUrl])

  const headerLeftActions = repoInfo ? (
    <div className="min-w-0">
      <h1 className="truncate text-lg font-semibold">
        {repoInfo.owner}/{repoInfo.repo}
      </h1>
    </div>
  ) : null

  if (isLoading) {
    return (
      <div className="flex-1 bg-background">
        <div className="p-3">
          <SharedHeader initialStars={initialStars} />
        </div>
      </div>
    )
  }

  if (error || !task) {
    return (
      <div className="flex-1 bg-background">
        <div className="p-3">
          <SharedHeader initialStars={initialStars} />
        </div>
        <div className="mx-auto p-6">
          <div className="flex h-64 items-center justify-center">
            <div className="text-center">
              <h2 className="mb-2 text-lg font-semibold">Task Not Found</h2>
              <p className="text-muted-foreground">{error || 'The requested task could not be found.'}</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">
      <div className="flex-shrink-0 border-b px-3 py-2">
        <SharedHeader
          leftActions={headerLeftActions}
          initialStars={initialStars}
          extraActions={<TaskActions task={task} />}
        />
      </div>

      <div className="flex-1 min-h-0 px-4 py-4">
        <div className="mx-auto flex h-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-background">
          <div className="px-5 py-4">
            <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">App Lifecycle Task</p>
            <h2 className="mt-2 text-xl font-semibold leading-tight">{task.title || task.prompt}</h2>
          </div>

          <div className="flex-1 min-h-0">
            <TaskChat taskId={task.id} task={task} chatOnly />
          </div>
        </div>
      </div>
    </div>
  )
}
