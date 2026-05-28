import 'server-only'

import { execDevbox } from '@/lib/devbox/client'
import { DeployError } from './types'
import { buildFindWorkspaceCommand } from './workspace'

export interface DeployResult {
  image: string
  yaml: string
}

export async function extractDeployResult(runtimeName: string): Promise<DeployResult> {
  const readOutputCmd = [
    buildFindWorkspaceCommand(),
    'cat "$workspace_dir/.sealos/deployment-output.json" 2>/dev/null || true',
  ].join('\n')

  const readYamlCmd = [
    buildFindWorkspaceCommand(),
    'cat "$workspace_dir/.sealos/crossplane/ap.yaml" 2>/dev/null || true',
  ].join('\n')

  const [outputExec, yamlExec] = await Promise.all([
    execDevbox(runtimeName, { command: ['sh', '-lc', readOutputCmd], timeoutSeconds: 30 }),
    execDevbox(runtimeName, { command: ['sh', '-lc', readYamlCmd], timeoutSeconds: 30 }),
  ])

  const outputText = outputExec.data.stdout?.trim()
  if (!outputText) {
    throw new DeployError('result_missing', 'generating_yaml', 'No deployment output found')
  }

  let deploymentOutput: { status: string; image: string | null; error?: string | null }
  try {
    deploymentOutput = JSON.parse(outputText)
  } catch {
    throw new DeployError('result_missing', 'generating_yaml', 'Invalid deployment output JSON')
  }

  if (deploymentOutput.status !== 'succeeded') {
    throw new DeployError('build_failed', 'building', deploymentOutput.error || 'Deployment did not succeed')
  }

  if (!deploymentOutput.image) {
    throw new DeployError('result_missing', 'generating_yaml', 'Deployment output missing image reference')
  }

  const yamlText = yamlExec.data.stdout?.trim()
  if (!yamlText) {
    throw new DeployError('result_missing', 'generating_yaml', 'No Crossplane AP YAML found')
  }

  return {
    image: deploymentOutput.image,
    yaml: yamlText,
  }
}
