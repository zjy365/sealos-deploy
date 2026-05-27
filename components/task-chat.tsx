'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import type { Task } from '@/lib/db/schema'
import { Button } from '@/components/ui/button'
import { useAtom } from 'jotai'
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  MessageSquare,
  MoreVertical,
  RefreshCw,
  Square,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { taskChatInputAtomFamily } from '@/lib/atoms/task'
import { TaskChatComposer } from '@/components/task-chat-composer'
import { TaskChatMarkdown } from '@/components/task-chat-markdown'
import { TaskChatTranscript } from '@/components/task-chat-transcript'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useTaskAgentChatV2 } from '@/lib/hooks/use-task-agent-chat-v2'

interface TaskChatProps {
  taskId: string
  task: Task
  chatOnly?: boolean
}

interface PRComment {
  id: number
  user: {
    login: string
    avatar_url: string
  }
  body: string
  created_at: string
  html_url: string
}

interface CheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
  html_url: string
  started_at: string
  completed_at: string | null
}

interface DeploymentInfo {
  hasDeployment: boolean
  previewUrl?: string
  message?: string
  createdAt?: string
}

export function TaskChat({ taskId, task, chatOnly = false }: TaskChatProps) {
  const [activeTab, setActiveTab] = useState<'chat' | 'comments' | 'actions' | 'deployments'>('chat')
  const [newMessage, setNewMessage] = useAtom(taskChatInputAtomFamily(taskId))
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [prComments, setPrComments] = useState<PRComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [commentsError, setCommentsError] = useState<string | null>(null)
  const [checkRuns, setCheckRuns] = useState<CheckRun[]>([])
  const [loadingActions, setLoadingActions] = useState(false)
  const [actionsError, setActionsError] = useState<string | null>(null)
  const [deployment, setDeployment] = useState<DeploymentInfo | null>(null)
  const [loadingDeployment, setLoadingDeployment] = useState(false)
  const [deploymentError, setDeploymentError] = useState<string | null>(null)
  const commentsLoadedRef = useRef(false)
  const actionsLoadedRef = useRef(false)
  const deploymentLoadedRef = useRef(false)

  const {
    activityItems,
    error: chatError,
    isGatewayTask,
    isLoading,
    isSending,
    isStopping,
    isStreaming,
    messages,
    refreshMessages,
    retryMessage,
    sendMessage,
    stopTask,
  } = useTaskAgentChatV2(taskId, task)

  const fetchPRComments = useCallback(
    async (showLoading = true) => {
      if (!task.prNumber || !task.repoUrl) {
        return
      }

      if (commentsLoadedRef.current && showLoading) {
        return
      }

      if (showLoading) {
        setLoadingComments(true)
      }

      setCommentsError(null)

      try {
        const response = await fetch(`/api/tasks/${taskId}/pr-comments`, {
          cache: 'no-store',
        })
        const data = (await response.json()) as {
          success?: boolean
          comments?: PRComment[]
          error?: string
        }

        if (!response.ok || !data.success) {
          setCommentsError(data.error || 'Failed to fetch comments')
          return
        }

        setPrComments(data.comments || [])
        commentsLoadedRef.current = true
      } catch {
        setCommentsError('Failed to fetch comments')
      } finally {
        if (showLoading) {
          setLoadingComments(false)
        }
      }
    },
    [task.prNumber, task.repoUrl, taskId],
  )

  const fetchCheckRuns = useCallback(
    async (showLoading = true) => {
      if (!task.branchName || !task.repoUrl) {
        return
      }

      if (actionsLoadedRef.current && showLoading) {
        return
      }

      if (showLoading) {
        setLoadingActions(true)
      }

      setActionsError(null)

      try {
        const response = await fetch(`/api/tasks/${taskId}/check-runs`, {
          cache: 'no-store',
        })
        const data = (await response.json()) as {
          success?: boolean
          checkRuns?: CheckRun[]
          error?: string
        }

        if (!response.ok || !data.success) {
          setActionsError(data.error || 'Failed to fetch check runs')
          return
        }

        setCheckRuns(data.checkRuns || [])
        actionsLoadedRef.current = true
      } catch {
        setActionsError('Failed to fetch check runs')
      } finally {
        if (showLoading) {
          setLoadingActions(false)
        }
      }
    },
    [task.branchName, task.repoUrl, taskId],
  )

  const fetchDeployment = useCallback(
    async (showLoading = true) => {
      if (deploymentLoadedRef.current && showLoading) {
        return
      }

      if (showLoading) {
        setLoadingDeployment(true)
      }

      setDeploymentError(null)

      try {
        const response = await fetch(`/api/tasks/${taskId}/deployment`, {
          cache: 'no-store',
        })
        const data = (await response.json()) as {
          success?: boolean
          data?: DeploymentInfo
          error?: string
        }

        if (!response.ok || !data.success) {
          setDeploymentError(data.error || 'Failed to fetch deployment')
          return
        }

        setDeployment(data.data || null)
        deploymentLoadedRef.current = true
      } catch {
        setDeploymentError('Failed to fetch deployment')
      } finally {
        if (showLoading) {
          setLoadingDeployment(false)
        }
      }
    },
    [taskId],
  )

  const handleSendMessage = useCallback(async () => {
    const messageToSend = newMessage.trim()
    if (!messageToSend || isSending) {
      return
    }

    setNewMessage('')
    const result = await sendMessage(messageToSend)

    if (!result.success) {
      setNewMessage(messageToSend)
      toast.error(result.error || 'Failed to send message')
    }
  }, [isSending, newMessage, sendMessage, setNewMessage])

  const handleRetryMessage = useCallback(
    async (content: string) => {
      const result = await retryMessage(content)
      if (!result.success) {
        toast.error(result.error || 'Failed to resend message')
      }
    },
    [retryMessage],
  )

  const handleStopTask = useCallback(async () => {
    const result = await stopTask()
    if (result.success) {
      toast.success('Generation stopped')
      return
    }

    toast.error(result.error || 'Failed to stop generation')
  }, [stopTask])

  const handleCopyMessage = useCallback(async (messageId: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedMessageId(messageId)
      window.setTimeout(() => setCopiedMessageId(null), 2000)
    } catch {
      toast.error('Failed to copy message')
    }
  }, [])

  const handleSendCommentAsFollowUp = useCallback(
    (comment: PRComment) => {
      const formattedMessage = `**PR Comment from @${comment.user.login}:**\n\n${comment.body}\n\n---\n\nPlease address the above PR comment and make the necessary changes to ensure the feedback is accurately addressed.`
      setNewMessage(formattedMessage)
      setActiveTab('chat')
      toast.success('Comment added to chat input')
    },
    [setNewMessage],
  )

  const handleRefresh = useCallback(() => {
    switch (activeTab) {
      case 'chat':
        void refreshMessages(true)
        break
      case 'comments':
        commentsLoadedRef.current = false
        void fetchPRComments(true)
        break
      case 'actions':
        actionsLoadedRef.current = false
        void fetchCheckRuns(true)
        break
      case 'deployments':
        deploymentLoadedRef.current = false
        void fetchDeployment(true)
        break
    }
  }, [activeTab, fetchCheckRuns, fetchDeployment, fetchPRComments, refreshMessages])

  useEffect(() => {
    if (activeTab === 'comments' && task.prNumber) {
      void fetchPRComments(true)
    }
  }, [activeTab, fetchPRComments, task.prNumber])

  useEffect(() => {
    if (activeTab === 'actions' && task.branchName) {
      void fetchCheckRuns(true)
    }
  }, [activeTab, fetchCheckRuns, task.branchName])

  useEffect(() => {
    if (activeTab === 'deployments') {
      void fetchDeployment(true)
    }
  }, [activeTab, fetchDeployment])

  useEffect(() => {
    if (task.prNumber) {
      commentsLoadedRef.current = false
      if (activeTab === 'comments') {
        void fetchPRComments(false)
      }
    }
  }, [activeTab, fetchPRComments, task.prNumber])

  useEffect(() => {
    if (task.branchName) {
      actionsLoadedRef.current = false
      if (activeTab === 'actions') {
        void fetchCheckRuns(false)
      }
    }
  }, [activeTab, fetchCheckRuns, task.branchName])

  useEffect(() => {
    if (activeTab === 'chat') {
      return
    }

    const interval = window.setInterval(() => {
      switch (activeTab) {
        case 'comments':
          commentsLoadedRef.current = false
          void fetchPRComments(false)
          break
        case 'actions':
          actionsLoadedRef.current = false
          void fetchCheckRuns(false)
          break
        case 'deployments':
          deploymentLoadedRef.current = false
          void fetchDeployment(false)
          break
      }
    }, 30_000)

    return () => {
      window.clearInterval(interval)
    }
  }, [activeTab, fetchCheckRuns, fetchDeployment, fetchPRComments])

  const renderDeployments = () => {
    if (loadingDeployment) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (deploymentError) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-center text-sm text-destructive">{deploymentError}</p>
        </div>
      )
    }

    if (!deployment?.hasDeployment) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground">
          <div className="text-sm md:text-base">{deployment?.message || 'No deployment found'}</div>
        </div>
      )
    }

    return (
      <div className="space-y-2 px-2">
        <a
          href={deployment.previewUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50"
        >
          <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 76 65" fill="currentColor">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
          </svg>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">Sealos Preview</div>
            <div className="text-xs text-muted-foreground">
              {deployment.createdAt
                ? `Deployed ${new Date(deployment.createdAt).toLocaleString()}`
                : 'Preview deployment'}
            </div>
          </div>
        </a>
      </div>
    )
  }

  const renderActions = () => {
    const getStatusIcon = (statusValue: string, conclusion: string | null) => {
      if (statusValue === 'completed') {
        if (conclusion === 'success') {
          return <CheckCircle className="h-4 w-4 flex-shrink-0 text-green-500" />
        }

        if (conclusion === 'failure') {
          return <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-500" />
        }

        if (conclusion === 'cancelled') {
          return <XCircle className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
        }
      }

      if (statusValue === 'in_progress') {
        return <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-blue-500" />
      }

      return <Square className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
    }

    if (!task.branchName) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground">
          <div className="text-sm md:text-base">
            No branch yet. GitHub Checks will appear here once a branch is created.
          </div>
        </div>
      )
    }

    if (loadingActions) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (actionsError) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-center text-sm text-destructive">{actionsError}</p>
        </div>
      )
    }

    if (checkRuns.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-center text-muted-foreground">
          <div className="text-sm md:text-base">No checks running</div>
        </div>
      )
    }

    return (
      <div className="space-y-2 px-2">
        {checkRuns.map((check) => (
          <a
            key={check.id}
            href={check.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-muted/50"
          >
            {getStatusIcon(check.status, check.conclusion)}
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{check.name}</div>
              <div className="text-xs text-muted-foreground">
                {check.status === 'completed' && check.completed_at
                  ? `Completed ${new Date(check.completed_at).toLocaleString()}`
                  : check.status === 'in_progress'
                    ? 'In progress...'
                    : 'Queued'}
              </div>
            </div>
          </a>
        ))}
      </div>
    )
  }

  const renderComments = () => {
    if (!task.prNumber) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-center text-muted-foreground">
          <div className="text-sm md:text-base">No pull request yet. Create a PR to see comments here.</div>
        </div>
      )
    }

    if (loadingComments) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (commentsError) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-center text-sm text-destructive">{commentsError}</p>
        </div>
      )
    }

    if (prComments.length === 0) {
      return (
        <div className="flex h-full items-center justify-center text-center text-muted-foreground">
          <div className="text-sm md:text-base">No comments yet</div>
        </div>
      )
    }

    return (
      <div className="space-y-4">
        {prComments.map((comment) => (
          <div key={comment.id} className="rounded-2xl border p-3">
            <div className="mb-3 flex items-start gap-3">
              <Image
                src={comment.user.avatar_url}
                alt={comment.user.login}
                width={32}
                height={32}
                className="h-8 w-8 rounded-full"
              />
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-sm font-semibold">{comment.user.login}</span>
                  <span className="text-xs text-muted-foreground">{new Date(comment.created_at).toLocaleString()}</span>
                </div>
                <TaskChatMarkdown content={comment.body} size="xs" />
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-muted"
                  >
                    <MoreVertical className="h-4 w-4 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleSendCommentAsFollowUp(comment)}>
                    <MessageSquare className="mr-2 h-4 w-4" />
                    Send as Follow-Up
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        ))}
      </div>
    )
  }

  const renderChat = () => {
    if (isLoading) {
      return (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )
    }

    if (chatError) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-center text-sm text-destructive">{chatError}</p>
        </div>
      )
    }

    return (
      <TaskChatTranscript
        activityItems={activityItems}
        copiedMessageId={copiedMessageId}
        isGatewayTask={isGatewayTask}
        isStreaming={isStreaming}
        logs={task.logs || []}
        messages={messages}
        onCopyMessage={handleCopyMessage}
        onRetryMessage={handleRetryMessage}
        status={task.status}
      />
    )
  }

  return (
    <div className="flex h-full flex-col">
      {!chatOnly ? (
        <div className="flex h-[46px] flex-shrink-0 items-center justify-between gap-1 overflow-x-auto border-b px-3 py-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <div className="flex items-center gap-1">
            {(['chat', 'comments', 'actions', 'deployments'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap rounded px-2 py-1 text-sm font-semibold transition-colors ${
                  activeTab === tab ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'actions' ? 'Checks' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" onClick={handleRefresh} className="h-6 w-6 p-0" title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden px-3 ${chatOnly ? 'py-3' : 'pt-3'}`}>
        {activeTab === 'chat' ? renderChat() : null}
        {activeTab === 'comments' ? <div className="flex-1 overflow-y-auto pb-4">{renderComments()}</div> : null}
        {activeTab === 'actions' ? <div className="flex-1 overflow-y-auto pb-4">{renderActions()}</div> : null}
        {activeTab === 'deployments' ? <div className="flex-1 overflow-y-auto pb-4">{renderDeployments()}</div> : null}
      </div>

      {activeTab === 'chat' ? (
        <TaskChatComposer
          value={newMessage}
          setValue={setNewMessage}
          isProcessing={isStreaming}
          isSending={isSending}
          isStopping={isStopping}
          onSend={handleSendMessage}
          onStop={handleStopTask}
        />
      ) : null}
    </div>
  )
}
