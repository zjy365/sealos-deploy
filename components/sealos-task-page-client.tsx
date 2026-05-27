'use client'

import { useMemo } from 'react'
import { useTask } from '@/lib/hooks/use-task'
import { SharedHeader } from '@/components/shared-header'
import { TaskActions } from '@/components/task-actions'
import { DeployRunWorkspace } from '@/components/deploy-run-workspace'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2 } from 'lucide-react'

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
      <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">
        <div className="flex-shrink-0 border-b px-3 py-2">
          <SharedHeader
            leftActions={
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">Deploy run</h1>
              </div>
            }
            initialStars={initialStars}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mx-auto grid min-h-full max-w-7xl gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
            <Card className="min-h-[480px] gap-0 overflow-hidden py-0">
              <CardHeader className="border-b px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-sm">Loading deploy run</CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">Preparing the latest task state.</p>
                  </div>
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="space-y-4 px-5 py-5">
                <div className="space-y-2">
                  <div className="h-2 w-2/3 animate-pulse rounded bg-muted" />
                  <div className="h-2 w-full animate-pulse rounded bg-muted" />
                  <div className="h-2 w-5/6 animate-pulse rounded bg-muted" />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="h-24 animate-pulse rounded-md border bg-muted/30" />
                  <div className="h-24 animate-pulse rounded-md border bg-muted/30" />
                  <div className="h-24 animate-pulse rounded-md border bg-muted/30" />
                </div>
                <div className="space-y-3 pt-2">
                  {['Runtime', 'Analyze', 'Configure', 'Build', 'Preview'].map((stage) => (
                    <div key={stage} className="flex items-center gap-3">
                      <div className="h-7 w-7 animate-pulse rounded-full bg-muted" />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-2 w-28 animate-pulse rounded bg-muted" />
                        <div className="h-2 w-full animate-pulse rounded bg-muted/70" />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="min-h-[360px] gap-0 overflow-hidden py-0">
              <CardHeader className="border-b px-5 py-4">
                <CardTitle className="text-sm">Chat with the run</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-5 py-5">
                <div className="h-20 animate-pulse rounded-md bg-muted/60" />
                <div className="h-20 animate-pulse rounded-md bg-muted/40" />
                <div className="mt-6 h-10 animate-pulse rounded-md bg-muted/70" />
              </CardContent>
            </Card>
          </div>
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

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div className="mx-auto min-h-full max-w-7xl">
          <DeployRunWorkspace task={task} />
        </div>
      </div>
    </div>
  )
}
