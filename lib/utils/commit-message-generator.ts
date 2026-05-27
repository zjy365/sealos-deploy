export interface CommitMessageOptions {
  description: string
  repoName?: string
  context?: string
}

export async function generateCommitMessage(options: CommitMessageOptions): Promise<string> {
  return createFallbackCommitMessage(options.description)
}

export function createFallbackCommitMessage(description: string): string {
  // If description is short enough, use it as the commit message
  if (description.length <= 72) {
    return description
  }

  // Otherwise, truncate and add ellipsis
  return description.substring(0, 69) + '...'
}
