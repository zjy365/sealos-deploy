'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AlertCircle,
  ArrowUpRight,
  Bot,
  CheckCircle2,
  Circle,
  Clock3,
  Code2,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Loader2,
  MessageSquareText,
  Play,
  Rocket,
  Server,
  ShieldAlert,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { TaskChat } from '@/components/task-chat'
import type { Task, TaskEvent } from '@/lib/db/schema'
import { buildAgentActivityItemsFromTaskEvents, type TaskAgentActivityItem } from '@/lib/task-agent-events'
import { cn } from '@/lib/utils'

interface DeployRunWorkspaceProps {
  task: Task
}

interface TaskEventsResponse {
  events?: TaskEvent[]
  success?: boolean
}

type DeployStageId = 'queued' | 'runtime' | 'analyze' | 'configure' | 'build' | 'preview' | 'ship'
type StageState = 'waiting' | 'active' | 'complete' | 'blocked' | 'failed' | 'stopped'

interface DeployStage {
  description: string
  id: DeployStageId
  label: string
  state: StageState
}

function getTaskRuntime(task: Task): number {
  const startTime = new Date(task.createdAt).getTime()
  const endTime = task.completedAt ? new Date(task.completedAt).getTime() : Date.now()
  return Math.max(0, endTime - startTime)
}

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.floor(durationMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function isTaskActive(task: Task): boolean {
  return task.status === 'pending' || task.status === 'processing'
}

function isAgentActive(task: Task): boolean {
  return (
    Boolean(task.activeTurnSessionId) &&
    task.turnCompletionState !== 'completed' &&
    task.turnCompletionState !== 'failed' &&
    task.status !== 'stopped'
  )
}

function getStageIndex(task: Task, activityItems: TaskAgentActivityItem[]): number {
  if (task.prUrl || task.prNumber || task.prStatus === 'merged') {
    return 6
  }

  if (task.previewUrl) {
    return 5
  }

  const activityText = activityItems
    .slice(-8)
    .map((item) => `${item.label} ${item.detail}`)
    .join(' ')
    .toLowerCase()

  if (activityText.includes('command') || activityText.includes('files')) {
    return 4
  }

  if (activityText.includes('analysis') || activityText.includes('analyzing') || task.gatewayReadyAt) {
    return 2
  }

  if (task.runtimeName || task.runtimeState || task.gatewaySessionId || task.activeTurnSessionId) {
    return 1
  }

  return 0
}

function getStatusTone(task: Task): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (task.status === 'error') {
    return 'destructive'
  }

  if (task.status === 'completed') {
    return 'default'
  }

  if (task.status === 'stopped') {
    return 'outline'
  }

  return 'secondary'
}

function getStatusLabel(task: Task): string {
  if (task.status === 'pending') {
    return 'Queued'
  }

  if (task.status === 'processing') {
    return isAgentActive(task) ? 'Running' : 'Processing'
  }

  if (task.status === 'completed') {
    return 'Complete'
  }

  if (task.status === 'error') {
    return 'Failed'
  }

  return 'Stopped'
}

function buildDeployStages(task: Task, activityItems: TaskAgentActivityItem[]): DeployStage[] {
  const activeIndex = getStageIndex(task, activityItems)
  const hasFailure = task.status === 'error'
  const hasStopped = task.status === 'stopped'
  const hasConfigureSignal =
    activityItems.some((item) => {
      const text = `${item.label} ${item.detail}`.toLowerCase()
      return text.includes('env') || text.includes('environment') || text.includes('approval')
    }) && isTaskActive(task)

  const baseStages: Omit<DeployStage, 'state'>[] = [
    {
      id: 'queued',
      label: 'Queued',
      description: 'Task accepted',
    },
    {
      id: 'runtime',
      label: 'Runtime',
      description: 'Devbox and Codex session',
    },
    {
      id: 'analyze',
      label: 'Analyze',
      description: 'Repository shape and deploy path',
    },
    {
      id: 'configure',
      label: 'Configure',
      description: 'Environment and approvals',
    },
    {
      id: 'build',
      label: 'Build',
      description: 'Files, checks, and image prep',
    },
    {
      id: 'preview',
      label: 'Preview',
      description: 'Sealos app URL',
    },
    {
      id: 'ship',
      label: 'Ship',
      description: 'PR, merge, or publish',
    },
  ]

  return baseStages.map((stage, index) => {
    let state: StageState = index < activeIndex ? 'complete' : index === activeIndex ? 'active' : 'waiting'

    if (task.status === 'completed' && index <= activeIndex) {
      state = 'complete'
    }

    if (hasFailure && index === activeIndex) {
      state = 'failed'
    }

    if (hasStopped && index === activeIndex) {
      state = 'stopped'
    }

    if (stage.id === 'configure' && hasConfigureSignal && index >= activeIndex) {
      state = 'blocked'
    }

    return {
      ...stage,
      state,
    }
  })
}

function getStageIcon(stage: DeployStage) {
  if (stage.state === 'complete') {
    return <CheckCircle2 className="h-4 w-4 text-green-600" />
  }

  if (stage.state === 'failed') {
    return <AlertCircle className="h-4 w-4 text-red-500" />
  }

  if (stage.state === 'blocked') {
    return <ShieldAlert className="h-4 w-4 text-amber-500" />
  }

  if (stage.state === 'active') {
    return <Loader2 className="h-4 w-4 animate-spin text-primary" />
  }

  if (stage.state === 'stopped') {
    return <Circle className="h-4 w-4 text-muted-foreground" />
  }

  return <Circle className="h-4 w-4 text-muted-foreground/45" />
}

function getPrimaryActivity(
  task: Task,
  activityItems: TaskAgentActivityItem[],
): {
  detail: string
  label: string
  tone: TaskAgentActivityItem['tone']
} {
  const latest = activityItems.at(-1)

  if (latest) {
    return {
      label: latest.label,
      detail: latest.detail,
      tone: latest.tone,
    }
  }

  if (task.status === 'pending') {
    return {
      label: 'Waiting to start',
      detail: 'The deployment run has been created',
      tone: 'default',
    }
  }

  if (task.status === 'processing') {
    return {
      label: 'Preparing deployment',
      detail: 'ShipRepo is setting up the run',
      tone: 'default',
    }
  }

  if (task.status === 'completed') {
    return {
      label: 'Run completed',
      detail: 'The latest deployment run is complete',
      tone: 'success',
    }
  }

  if (task.status === 'stopped') {
    return {
      label: 'Run stopped',
      detail: 'The deployment run is no longer active',
      tone: 'warning',
    }
  }

  return {
    label: 'Run failed',
    detail: task.error || 'ShipRepo could not complete the deployment run',
    tone: 'error',
  }
}

function getActivityIcon(tone: TaskAgentActivityItem['tone']) {
  if (tone === 'success') {
    return <CheckCircle2 className="h-4 w-4 text-green-600" />
  }

  if (tone === 'error') {
    return <AlertCircle className="h-4 w-4 text-red-500" />
  }

  if (tone === 'warning') {
    return <ShieldAlert className="h-4 w-4 text-amber-500" />
  }

  return <Bot className="h-4 w-4 text-primary" />
}

function useTaskEvents(task: Task) {
  const [events, setEvents] = useState<TaskEvent[]>([])
  const [pollTick, setPollTick] = useState(0)

  const fetchEvents = useCallback(async () => {
    try {
      const response = await fetch(`/api/tasks/${task.id}/events?limit=80`, {
        cache: 'no-store',
      })
      const data = (await response.json()) as TaskEventsResponse

      if (!response.ok || !data.success) {
        return
      }

      setEvents(data.events || [])
    } catch {
      setEvents((previousEvents) => previousEvents)
    }
  }, [task.id])

  useEffect(() => {
    if (!isTaskActive(task)) {
      return
    }

    const interval = window.setInterval(() => {
      setPollTick((currentTick) => currentTick + 1)
    }, 5000)

    return () => window.clearInterval(interval)
  }, [task])

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetchEvents()
    }, 0)

    return () => window.clearTimeout(timeout)
  }, [fetchEvents, pollTick, task.updatedAt, task.activeTurnSessionId, task.turnCompletionState])

  return events
}

export function DeployRunWorkspace({ task }: DeployRunWorkspaceProps) {
  const events = useTaskEvents(task)
  const activityItems = useMemo(() => buildAgentActivityItemsFromTaskEvents(events), [events])
  const stages = useMemo(() => buildDeployStages(task, activityItems), [activityItems, task])
  const [clockTick, setClockTick] = useState(0)

  useEffect(() => {
    if (!isTaskActive(task)) {
      return
    }

    const interval = window.setInterval(() => {
      setClockTick((currentTick) => currentTick + 1)
    }, 1000)

    return () => window.clearInterval(interval)
  }, [task])

  const primaryActivity = getPrimaryActivity(task, activityItems)
  const progressValue = Math.max(0, Math.min(task.progress || getStageIndex(task, activityItems) * 15, 100))
  const runtimeMs = clockTick >= 0 ? getTaskRuntime(task) : 0
  const recentActivities = [...activityItems].slice(-5).toReversed()
  const hasResult = Boolean(task.previewUrl || task.prUrl || task.sandboxUrl)
  const needsAttention = task.status === 'error' || stages.some((stage) => stage.state === 'blocked')

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-lg py-0 shadow-none">
          <CardHeader className="gap-4 px-5 py-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge variant={getStatusTone(task)}>{getStatusLabel(task)}</Badge>
                  {isAgentActive(task) ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Agent active
                    </span>
                  ) : null}
                </div>
                <CardTitle className="break-words text-2xl leading-tight">{task.title || task.prompt}</CardTitle>
                <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{task.prompt}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm md:min-w-48">
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock3 className="h-3.5 w-3.5" />
                    Runtime
                  </div>
                  <div className="mt-1 font-mono text-base">{formatDuration(runtimeMs)}</div>
                </div>
                <div className="rounded-md border bg-muted/20 px-3 py-2">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Rocket className="h-3.5 w-3.5" />
                    Progress
                  </div>
                  <div className="mt-1 font-mono text-base">{progressValue}%</div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Progress value={progressValue} className="h-1.5 rounded" />
              <div className="flex items-center gap-2 text-sm">
                {getActivityIcon(primaryActivity.tone)}
                <span className="font-medium">{primaryActivity.label}</span>
                <span className="min-w-0 truncate text-muted-foreground">{primaryActivity.detail}</span>
              </div>
            </div>
          </CardHeader>
        </Card>

        <Card className="rounded-lg py-0 shadow-none">
          <CardHeader className="px-4 py-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              {needsAttention ? <ShieldAlert className="h-4 w-4 text-amber-500" /> : <Play className="h-4 w-4" />}
              {needsAttention ? 'Needs attention' : 'Run summary'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-4">
            {task.status === 'error' ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/20 dark:text-red-300">
                {task.error || 'Deployment run failed'}
              </div>
            ) : null}

            <div className="grid gap-2 text-sm">
              {task.previewUrl ? (
                <Button asChild variant="default" size="sm" className="justify-between">
                  <Link href={task.previewUrl} target="_blank" rel="noopener noreferrer">
                    Open preview
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              {task.prUrl ? (
                <Button asChild variant="outline" size="sm" className="justify-between">
                  <Link href={task.prUrl} target="_blank" rel="noopener noreferrer">
                    View pull request
                    <GitPullRequest className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
              {task.sandboxUrl && !task.previewUrl ? (
                <Button asChild variant="outline" size="sm" className="justify-between">
                  <Link href={task.sandboxUrl} target="_blank" rel="noopener noreferrer">
                    Open runtime preview
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>

            {!hasResult ? (
              <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                Results will appear here when the run produces a preview or pull request.
              </div>
            ) : null}

            <dl className="grid gap-2 text-xs text-muted-foreground">
              {task.runtimeState || task.runtimeName ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5">
                    <Server className="h-3.5 w-3.5" />
                    Runtime
                  </dt>
                  <dd className="max-w-36 truncate text-foreground">{task.runtimeState || 'Ready'}</dd>
                </div>
              ) : null}
              {task.branchName ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5">
                    <GitBranch className="h-3.5 w-3.5" />
                    Branch
                  </dt>
                  <dd className="max-w-36 truncate text-foreground">{task.branchName}</dd>
                </div>
              ) : null}
              {task.selectedModel ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="inline-flex items-center gap-1.5">
                    <Code2 className="h-3.5 w-3.5" />
                    Model
                  </dt>
                  <dd className="max-w-36 truncate text-foreground">{task.selectedModel}</dd>
                </div>
              ) : null}
            </dl>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="rounded-lg py-0 shadow-none">
          <CardHeader className="px-5 py-4">
            <CardTitle className="text-sm">Deployment stages</CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <div className="grid gap-3 md:grid-cols-7">
              {stages.map((stage, index) => (
                <div key={stage.id} className="relative min-w-0">
                  {index < stages.length - 1 ? (
                    <div
                      className={cn(
                        'absolute left-6 top-5 hidden h-px w-[calc(100%_-_1rem)] md:block',
                        stage.state === 'complete' ? 'bg-primary/50' : 'bg-border',
                      )}
                    />
                  ) : null}
                  <div className="relative flex gap-3 md:block">
                    <div
                      className={cn(
                        'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border bg-background',
                        stage.state === 'active' && 'border-primary bg-primary/5',
                        stage.state === 'complete' &&
                          'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/20',
                        stage.state === 'failed' && 'border-red-200 bg-red-50 dark:border-red-950 dark:bg-red-950/20',
                        stage.state === 'blocked' &&
                          'border-amber-200 bg-amber-50 dark:border-amber-950 dark:bg-amber-950/20',
                      )}
                    >
                      {getStageIcon(stage)}
                    </div>
                    <div className="min-w-0 pt-1 md:mt-2 md:pt-0">
                      <div className="truncate text-sm font-medium">{stage.label}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{stage.description}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg py-0 shadow-none">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {recentActivities.length > 0 ? (
              <div className="space-y-3">
                {recentActivities.map((item) => (
                  <div key={item.id} className="flex gap-2 text-sm">
                    <div className="mt-0.5 flex-shrink-0">{getActivityIcon(item.tone)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{item.label}</span>
                        <span className="text-[11px] text-muted-foreground">
                          {new Date(item.occurredAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{item.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-md border bg-muted/20 px-3 py-3 text-sm text-muted-foreground">
                Activity will appear as the run starts.
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <Card className="min-h-[420px] flex-1 rounded-lg py-0 shadow-none">
        <CardHeader className="border-b px-5 py-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <MessageSquareText className="h-4 w-4" />
              Chat with the run
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs">
              Details
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex min-h-0 flex-1 px-0 pb-0">
          <TaskChat taskId={task.id} task={task} chatOnly />
        </CardContent>
      </Card>
    </div>
  )
}
