export interface TitleGenerationOptions {
  prompt: string
  repoName?: string
  context?: string
}

export async function generateTaskTitle(options: TitleGenerationOptions): Promise<string> {
  return createFallbackTitle(options.prompt)
}

export function createFallbackTitle(prompt: string): string {
  // If prompt is short enough, use it as the title
  if (prompt.length <= 60) {
    return prompt
  }

  // Otherwise, truncate and add ellipsis
  return prompt.substring(0, 57) + '...'
}
