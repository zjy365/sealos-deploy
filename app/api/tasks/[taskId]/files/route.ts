import { NextRequest, NextResponse } from 'next/server'
import { getOctokit } from '@/lib/github/client'
import { execInTaskWorkspace, getOwnedTask } from '@/lib/devbox/task-compat'
import { getServerSession } from '@/lib/session/get-server-session'

interface FileChange {
  filename: string
  status: 'added' | 'modified' | 'deleted' | 'renamed'
  additions: number
  deletions: number
  changes: number
}

interface FileTreeNode {
  type: 'file' | 'directory'
  filename?: string
  status?: string
  additions?: number
  deletions?: number
  changes?: number
  children?: { [key: string]: FileTreeNode }
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function getLocalChangedFiles(task: NonNullable<Awaited<ReturnType<typeof getOwnedTask>>>) {
  const branchName = task.branchName || 'main'
  const remoteRef = `origin/${branchName}`
  const compareRefResult = await execInTaskWorkspace(
    task,
    [
      `git fetch origin ${shellEscape(branchName)} >/dev/null 2>&1 || true`,
      `if git rev-parse --verify ${shellEscape(remoteRef)} >/dev/null 2>&1; then`,
      `  printf '%s\\n' ${shellEscape(remoteRef)}`,
      'else',
      `  printf '%s\\n' 'HEAD'`,
      'fi',
    ].join('\n'),
    { timeoutSeconds: 60 },
  )
  const compareRef = compareRefResult.result.stdout.trim() || 'HEAD'

  const statusResult = await execInTaskWorkspace(task, 'git status --porcelain', { timeoutSeconds: 30 })
  const statusLines = statusResult.result.stdout
    .trim()
    .split('\n')
    .filter((line: string) => line.trim())

  const numstatResult = await execInTaskWorkspace(task, `git diff --numstat ${shellEscape(compareRef)}`, {
    timeoutSeconds: 30,
  })
  const diffStats: Record<string, { additions: number; deletions: number }> = {}

  for (const line of numstatResult.result.stdout
    .trim()
    .split('\n')
    .filter((entry: string) => entry.trim())) {
    const parts = line.split('\t')
    if (parts.length >= 3) {
      diffStats[parts[2]] = {
        additions: parseInt(parts[0], 10) || 0,
        deletions: parseInt(parts[1], 10) || 0,
      }
    }
  }

  const files = await Promise.all(
    statusLines.map(async (line: string) => {
      const indexStatus = line.charAt(0)
      const worktreeStatus = line.charAt(1)
      let filename = line.substring(2).trim()

      if (indexStatus === 'R' || worktreeStatus === 'R') {
        const arrowIndex = filename.indexOf(' -> ')
        if (arrowIndex !== -1) {
          filename = filename.substring(arrowIndex + 4).trim()
        }
      }

      let status: FileChange['status'] = 'modified'
      if (indexStatus === 'R' || worktreeStatus === 'R') {
        status = 'renamed'
      } else if (indexStatus === 'A' || worktreeStatus === 'A' || (indexStatus === '?' && worktreeStatus === '?')) {
        status = 'added'
      } else if (indexStatus === 'D' || worktreeStatus === 'D') {
        status = 'deleted'
      }

      let stats = diffStats[filename] || { additions: 0, deletions: 0 }

      if (
        (indexStatus === '?' && worktreeStatus === '?') ||
        (status === 'added' && !stats.additions && !stats.deletions)
      ) {
        const wcResult = await execInTaskWorkspace(task, `wc -l ${shellEscape(filename)} || true`, {
          timeoutSeconds: 20,
        })
        const lineCount = parseInt(wcResult.result.stdout.trim().split(/\s+/)[0] || '0', 10) || 0
        stats = { additions: lineCount, deletions: 0 }
      }

      return {
        filename,
        status,
        additions: stats.additions,
        deletions: stats.deletions,
        changes: stats.additions + stats.deletions,
      } satisfies FileChange
    }),
  )

  return files
}

async function getAllLocalFiles(task: NonNullable<Awaited<ReturnType<typeof getOwnedTask>>>) {
  const findResult = await execInTaskWorkspace(
    task,
    [
      'find . -type f',
      "-not -path '*/.git/*'",
      "-not -path '*/node_modules/*'",
      "-not -path '*/.next/*'",
      "-not -path '*/dist/*'",
      "-not -path '*/build/*'",
      "-not -path '*/.vercel/*'",
    ].join(' '),
    { timeoutSeconds: 60 },
  )
  const fileLines = findResult.result.stdout
    .trim()
    .split('\n')
    .filter((line: string) => line.trim() && line !== '.')
    .map((line: string) => line.replace(/^\.\//, ''))

  const statusResult = await execInTaskWorkspace(task, 'git status --porcelain', { timeoutSeconds: 30 })
  const changedFilesMap: Record<string, FileChange['status']> = {}

  for (const line of statusResult.result.stdout
    .trim()
    .split('\n')
    .filter((entry: string) => entry.trim())) {
    const indexStatus = line.charAt(0)
    const worktreeStatus = line.charAt(1)
    let filename = line.substring(2).trim()

    if (indexStatus === 'R' || worktreeStatus === 'R') {
      const arrowIndex = filename.indexOf(' -> ')
      if (arrowIndex !== -1) {
        filename = filename.substring(arrowIndex + 4).trim()
      }
    }

    let status: FileChange['status'] = 'modified'
    if (indexStatus === 'R' || worktreeStatus === 'R') {
      status = 'renamed'
    } else if (indexStatus === 'A' || worktreeStatus === 'A' || (indexStatus === '?' && worktreeStatus === '?')) {
      status = 'added'
    } else if (indexStatus === 'D' || worktreeStatus === 'D') {
      status = 'deleted'
    }

    changedFilesMap[filename] = status
  }

  return fileLines.map((filename: string) => ({
    filename,
    status: changedFilesMap[filename] || ('renamed' as const),
    additions: 0,
    deletions: 0,
    changes: 0,
  }))
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const session = await getServerSession()
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const { taskId } = await params
    const searchParams = request.nextUrl.searchParams
    const mode = searchParams.get('mode') || 'remote'
    const task = await getOwnedTask(taskId, session.user.id)

    if (!task) {
      const response = NextResponse.json({ success: false, error: 'Task not found' }, { status: 404 })
      response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
      return response
    }

    if (!task.branchName) {
      return NextResponse.json({
        success: true,
        files: [],
        fileTree: {},
        branchName: null,
      })
    }

    if (!task.repoUrl) {
      return NextResponse.json({
        success: true,
        files: [],
        fileTree: {},
        branchName: task.branchName,
      })
    }

    let files: FileChange[] = []

    if (mode === 'local') {
      files = await getLocalChangedFiles(task)
    } else if (mode === 'all-local') {
      files = await getAllLocalFiles(task)
    } else {
      const octokit = await getOctokit()
      if (!octokit.auth) {
        return NextResponse.json(
          {
            success: false,
            error: 'GitHub authentication required. Please connect your GitHub account to view files.',
          },
          { status: 401 },
        )
      }

      const githubMatch = task.repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)/)
      if (!githubMatch) {
        return NextResponse.json({ success: false, error: 'Invalid repository URL format' }, { status: 400 })
      }

      const [, owner, repo] = githubMatch

      if (mode === 'all') {
        try {
          const treeResponse = await octokit.rest.git.getTree({
            owner,
            repo,
            tree_sha: task.branchName,
            recursive: 'true',
          })

          files = treeResponse.data.tree
            .filter((item) => item.type === 'blob' && item.path)
            .map((item) => ({
              filename: item.path!,
              status: 'modified' as const,
              additions: 0,
              deletions: 0,
              changes: 0,
            }))
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
            return NextResponse.json({
              success: true,
              files: [],
              fileTree: {},
              branchName: task.branchName,
              message: 'Branch not found or still being created',
            })
          }

          return NextResponse.json(
            {
              success: false,
              error: 'Failed to fetch repository tree from GitHub',
            },
            { status: 500 },
          )
        }
      } else {
        try {
          try {
            await octokit.rest.repos.getBranch({
              owner,
              repo,
              branch: task.branchName,
            })
          } catch (branchError: unknown) {
            if (
              branchError &&
              typeof branchError === 'object' &&
              'status' in branchError &&
              branchError.status === 404
            ) {
              return NextResponse.json({
                success: true,
                files: [],
                fileTree: {},
                branchName: task.branchName,
                message: 'Branch is being created...',
              })
            }

            throw branchError
          }

          let comparison
          try {
            comparison = await octokit.rest.repos.compareCommits({
              owner,
              repo,
              base: 'main',
              head: task.branchName,
            })
          } catch (mainError: unknown) {
            if (mainError && typeof mainError === 'object' && 'status' in mainError && mainError.status === 404) {
              comparison = await octokit.rest.repos.compareCommits({
                owner,
                repo,
                base: 'master',
                head: task.branchName,
              })
            } else {
              throw mainError
            }
          }

          files =
            comparison.data.files?.map((file) => ({
              filename: file.filename,
              status: file.status as FileChange['status'],
              additions: file.additions || 0,
              deletions: file.deletions || 0,
              changes: file.changes || 0,
            })) || []
        } catch (error: unknown) {
          if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
            return NextResponse.json({
              success: true,
              files: [],
              fileTree: {},
              branchName: task.branchName,
              message: 'Branch not found or still being created',
            })
          }

          return NextResponse.json(
            {
              success: false,
              error: 'Failed to fetch file changes from GitHub',
            },
            { status: 500 },
          )
        }
      }
    }

    const fileTree: { [key: string]: FileTreeNode } = {}
    for (const file of files) {
      addToFileTree(fileTree, file.filename, file)
    }

    const response = NextResponse.json({
      success: true,
      files,
      fileTree,
      branchName: task.branchName,
    })
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return response
  } catch (error) {
    console.error('Error fetching task files:', error)
    const response = NextResponse.json({ success: false, error: 'Failed to fetch task files' }, { status: 500 })
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate')
    return response
  }
}

function addToFileTree(tree: { [key: string]: FileTreeNode }, filename: string, fileObj: FileChange) {
  const parts = filename.split('/')
  let currentLevel = tree

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const isLastPart = i === parts.length - 1

    if (isLastPart) {
      currentLevel[part] = {
        type: 'file',
        filename: fileObj.filename,
        status: fileObj.status,
        additions: fileObj.additions,
        deletions: fileObj.deletions,
        changes: fileObj.changes,
      }
    } else {
      if (!currentLevel[part]) {
        currentLevel[part] = {
          type: 'directory',
          children: {},
        }
      }

      currentLevel = currentLevel[part].children!
    }
  }
}
