import { generateId } from '@/lib/utils/id'

export interface BranchNameOptions {
  description: string
  repoName?: string
  context?: string
}

export async function generateBranchName(options: BranchNameOptions): Promise<string> {
  return createFallbackBranchName(options.description)
}

export function createFallbackBranchName(taskIdOrDescription: string): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const slug = taskIdOrDescription
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
  return `agent/${timestamp}-${slug || taskIdOrDescription.slice(0, 8)}`
}
