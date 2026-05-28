export interface DeployApiRequest {
  githubToken: string
  repoUrl: string
  branch?: string
}

export type DeployPhase =
  | 'provisioning'
  | 'bootstrapping'
  | 'starting_ai'
  | 'analyzing'
  | 'building'
  | 'generating_yaml'
  | 'done'
  | 'failed'

export type DeployErrorCode =
  | 'runtime_failed'
  | 'ai_failed'
  | 'build_failed'
  | 'result_missing'
  | 'timeout'
  | 'aborted'
  | 'internal_error'

export class DeployError extends Error {
  constructor(
    public readonly code: DeployErrorCode,
    public readonly phase: DeployPhase | undefined,
    message: string,
  ) {
    super(message)
    this.name = 'DeployError'
  }
}

export interface DeployProgressEvent {
  phase: DeployPhase
  message: string
}

export interface DeployCompleteEvent {
  image: string
  yaml: string
}

export interface DeployErrorEvent {
  code: DeployErrorCode
  phase: DeployPhase | undefined
  message: string
}

export type SendEventFn = (event: string, data: unknown) => void
