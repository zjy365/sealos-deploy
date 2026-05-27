'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAtomValue, useSetAtom } from 'jotai'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SharedHeader } from '@/components/shared-header'
import { RepoSelector } from '@/components/repo-selector'
import { TaskForm } from '@/components/task-form'
import { GitHubIcon } from '@/components/icons/github-icon'
import { useTasks } from '@/components/app-layout'
import { setSelectedOwner, setSelectedRepo } from '@/lib/utils/cookies'
import { taskPromptAtom } from '@/lib/atoms/task'
import { sessionAtom } from '@/lib/atoms/session'
import { githubConnectionAtom, githubConnectionInitializedAtom } from '@/lib/atoms/github-connection'
import type { Session } from '@/lib/session/types'
import { GitHubPopupAuthError, startGitHubPopupAuth } from '@/lib/auth/github-popup'
import { ensureAiProxyProvisioned } from '@/lib/aiproxy/client-provisioning'

interface SealosHomePageContentProps {
  initialSelectedOwner?: string
  initialSelectedRepo?: string
  initialInstallDependencies?: boolean
  initialMaxDuration?: number
  initialKeepAlive?: boolean
  initialEnableBrowser?: boolean
  maxSandboxDuration?: number
  user?: Session['user'] | null
  initialStars?: number
}

export function SealosHomePageContent({
  initialSelectedOwner = '',
  initialSelectedRepo = '',
  initialMaxDuration = 300,
  maxSandboxDuration = 300,
  user = null,
  initialStars = 1200,
}: SealosHomePageContentProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedOwner, setSelectedOwnerState] = useState(initialSelectedOwner)
  const [selectedRepo, setSelectedRepoState] = useState(initialSelectedRepo)
  const [showSignInDialog, setShowSignInDialog] = useState(false)
  const [loadingGitHub, setLoadingGitHub] = useState(false)
  const router = useRouter()
  const { refreshTasks, addTaskOptimistically } = useTasks()
  const setTaskPrompt = useSetAtom(taskPromptAtom)
  const session = useAtomValue(sessionAtom)
  const githubConnection = useAtomValue(githubConnectionAtom)
  const githubConnectionInitialized = useAtomValue(githubConnectionInitializedAtom)
  const isGitHubAuthUser = session.authProvider === 'github'
  const isAuthenticated = Boolean(user)
  const visibleSelectedOwner = isAuthenticated ? selectedOwner : ''
  const visibleSelectedRepo = isAuthenticated ? selectedRepo : ''
  const hasSelectedRepo = Boolean(visibleSelectedOwner && visibleSelectedRepo)
  const canSelectRepository =
    isAuthenticated &&
    (githubConnection.connected || isGitHubAuthUser || Boolean(selectedOwner) || Boolean(selectedRepo))

  const handleOwnerChange = (owner: string) => {
    setSelectedOwnerState(owner)
    setSelectedOwner(owner)
    if (selectedRepo) {
      setSelectedRepoState('')
      setSelectedRepo('')
    }
  }

  const handleRepoChange = (repo: string) => {
    setSelectedRepoState(repo)
    setSelectedRepo(repo)
  }

  const handleTaskSubmit = async (data: {
    prompt: string
    repoUrl: string
    selectedAgent: string
    selectedModel: string
    selectedModels?: string[]
    installDependencies: boolean
    maxDuration: number
    keepAlive: boolean
    enableBrowser: boolean
  }) => {
    if (!user) {
      setShowSignInDialog(true)
      return
    }

    if (!data.repoUrl) {
      toast.error('Please select a repository', {
        description: 'Choose a GitHub repository before starting the task.',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const isAiProxyProvisioned = await ensureAiProxyProvisioned()

      if (!isAiProxyProvisioned) {
        toast.error('Failed to prepare AIProxy configuration')
        return
      }

      setTaskPrompt('')

      const { id } = addTaskOptimistically(data)
      router.push(`/tasks/${id}`)

      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...data, id }),
      })

      if (response.ok) {
        toast.success('Task created successfully')
      } else {
        const error = await response.json()
        toast.error(error.message || error.error || 'Failed to create task')
      }

      await refreshTasks()
    } catch {
      console.error('Error creating task')
      toast.error('Failed to create task')
      await refreshTasks()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleGitHubSignIn = async () => {
    setLoadingGitHub(true)
    try {
      await startGitHubPopupAuth('/api/auth/signin/github')
      window.location.reload()
    } catch (error) {
      if (error instanceof GitHubPopupAuthError && error.code === 'popup_blocked') {
        toast.error('Please allow popups and try again.')
      } else {
        toast.error('GitHub authentication failed. Please try again.')
      }
      setLoadingGitHub(false)
    }
  }

  const openSignIn = () => {
    setShowSignInDialog(true)
  }

  const commandDisabled = !isAuthenticated || !hasSelectedRepo
  const pageDescription = !isAuthenticated
    ? 'Sign in, choose a repository, then let Sealos inspect what it needs before anything ships.'
    : 'Choose a GitHub repository. Sealos will analyze it, fix deploy blockers, create a preview, then ship it.'

  const commandPlaceholder = !isAuthenticated
    ? 'Sign in to choose a repository and start deployment analysis.'
    : hasSelectedRepo
      ? 'Analyze this repo, fix deploy blockers, and create a Sealos preview.'
      : 'Choose a repository above to start deployment analysis.'

  const commandHelperText = !isAuthenticated
    ? 'Sign in to choose a repository and start deployment analysis.'
    : hasSelectedRepo
      ? ''
      : canSelectRepository
        ? 'Select a repository above to continue.'
        : 'GitHub session unavailable. Sign out and sign in again.'

  const commandHeader = (
    <div className="flex flex-col gap-3 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <div className="sealos-meta-label">Repository</div>

        <div className="mt-3 min-w-0">
          {!isAuthenticated ? (
            <div className="sealos-helper">Sign in to choose a GitHub repository.</div>
          ) : !githubConnectionInitialized ? (
            <div className="sealos-helper">Checking your GitHub connection...</div>
          ) : canSelectRepository ? (
            <div className="inline-flex max-w-full items-center rounded-full border border-border/70 bg-muted/20 px-2.5 py-1.5">
              <RepoSelector
                selectedOwner={selectedOwner}
                selectedRepo={selectedRepo}
                onOwnerChange={handleOwnerChange}
                onRepoChange={handleRepoChange}
              />
            </div>
          ) : (
            <div className="sealos-helper">GitHub session unavailable. Sign out and sign in again.</div>
          )}
        </div>
      </div>

      {!isAuthenticated ? (
        <Button
          type="button"
          onClick={openSignIn}
          className="sealos-action-text h-10 rounded-full px-4 sm:flex-shrink-0"
        >
          Sign in
        </Button>
      ) : null}
    </div>
  )
  const lifecycleSteps = ['Analyze', 'Fix', 'Preview', 'Ship', 'Operate']

  return (
    <div className="flex flex-1 flex-col bg-background">
      <div className="p-3">
        <SharedHeader initialStars={initialStars} hideUserAction={!user} />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-8">
        <div className="w-full max-w-3xl">
          <div className="mb-7 text-center">
            <div className="sealos-eyebrow">Repo to Sealos App</div>
            <h1 className="sealos-section-title mt-4 text-foreground sm:text-[2.5rem]">Analyze, preview, ship</h1>
            <p className="sealos-body mx-auto mt-3">{pageDescription}</p>
          </div>

          <TaskForm
            onSubmit={handleTaskSubmit}
            isSubmitting={isSubmitting}
            isAuthenticated={isAuthenticated}
            selectedOwner={visibleSelectedOwner}
            selectedRepo={visibleSelectedRepo}
            variant="command"
            commandDisabled={commandDisabled}
            commandPlaceholder={commandPlaceholder}
            commandHelperText={commandHelperText}
            alwaysShowCommandHelper={commandDisabled}
            commandHeader={commandHeader}
            initialMaxDuration={initialMaxDuration}
            maxSandboxDuration={maxSandboxDuration}
          />

          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {lifecycleSteps.map((step, index) => (
              <div key={step} className="sealos-helper rounded-full border border-border/70 bg-muted/20 px-3 py-1.5">
                {index + 1}. {step}
              </div>
            ))}
          </div>
        </div>
      </div>

      <Dialog open={showSignInDialog} onOpenChange={setShowSignInDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign in to continue</DialogTitle>
            <DialogDescription>
              You need to sign in with GitHub to prepare Sealos app lifecycle tasks.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-4">
            <Button
              onClick={handleGitHubSignIn}
              disabled={loadingGitHub}
              variant="outline"
              size="lg"
              className="w-full"
            >
              {loadingGitHub ? (
                <>
                  <svg
                    className="mr-2 -ml-1 h-4 w-4 animate-spin"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4Z" />
                  </svg>
                  Signing in with GitHub...
                </>
              ) : (
                <>
                  <GitHubIcon className="mr-2 h-4 w-4" />
                  Sign in with GitHub
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
