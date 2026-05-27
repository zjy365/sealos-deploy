export interface DeployApiRequest {
  kubeconfig: string
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

export interface DeployProgressEvent {
  phase: DeployPhase
  message: string
}

export interface DeployCompleteEvent {
  image: string
  yaml: string
}

export interface DeployErrorEvent {
  phase?: string
  message: string
}

export type SendEventFn = (event: string, data: unknown) => void
