import 'server-only'

import { execDevbox } from '@/lib/devbox/client'

export interface DeployResult {
  image: string
  yaml: string
}

const FIND_WORKSPACE_CMD = [
  'home_dir="${HOME:-/root}"',
  'if [ -d "$home_dir/workspace" ]; then',
  '  workspace_dir="$home_dir/workspace"',
  'elif [ -d /workspace ]; then',
  '  workspace_dir="/workspace"',
  'else',
  '  workspace_dir="$home_dir"',
  'fi',
].join('\n')

export async function extractDeployResult(runtimeName: string): Promise<DeployResult> {
  const readOutputCmd = [
    FIND_WORKSPACE_CMD,
    'cat "$workspace_dir/.sealos/deployment-output.json" 2>/dev/null || true',
  ].join('\n')

  const readYamlCmd = [FIND_WORKSPACE_CMD, 'cat "$workspace_dir/.sealos/crossplane/ap.yaml" 2>/dev/null || true'].join(
    '\n',
  )

  const [outputExec, yamlExec] = await Promise.all([
    execDevbox(runtimeName, { command: ['sh', '-lc', readOutputCmd], timeoutSeconds: 30 }),
    execDevbox(runtimeName, { command: ['sh', '-lc', readYamlCmd], timeoutSeconds: 30 }),
  ])

  const outputText = outputExec.data.stdout?.trim()
  if (!outputText) {
    throw new Error('No deployment output found')
  }

  let deploymentOutput: { status: string; image: string | null; error?: string | null }
  try {
    deploymentOutput = JSON.parse(outputText)
  } catch {
    throw new Error('Invalid deployment output JSON')
  }

  if (deploymentOutput.status !== 'succeeded') {
    throw new Error(deploymentOutput.error || 'Deployment did not succeed')
  }

  if (!deploymentOutput.image) {
    throw new Error('Deployment output missing image reference')
  }

  const yamlText = yamlExec.data.stdout?.trim()
  if (!yamlText) {
    throw new Error('No Crossplane AP YAML found')
  }

  return {
    image: deploymentOutput.image,
    yaml: yamlText,
  }
}
