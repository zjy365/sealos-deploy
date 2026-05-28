import { DeployError, type DeployErrorCode, type DeployErrorEvent, type DeployPhase } from './types'

export function deployErrorEventFromUnknown(
  error: unknown,
  { currentPhase }: { currentPhase: DeployPhase },
): DeployErrorEvent {
  const code: DeployErrorCode = error instanceof DeployError ? error.code : 'internal_error'
  const phase: DeployPhase | undefined = error instanceof DeployError ? error.phase : currentPhase
  const message = error instanceof Error ? error.message : 'Deployment failed'

  return { code, phase, message }
}
