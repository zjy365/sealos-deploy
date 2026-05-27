import 'server-only'

import { AIPROXY_MODEL_BASE_URL } from '@/lib/aiproxy/constants'
import { getOrCreateAiProxyToken } from '@/lib/aiproxy/token-management'
import type { GatewayConfig } from '@/lib/api-keys/user-keys'

export type DeployAuthResult = { ok: true; gatewayConfig: GatewayConfig } | { ok: false; reason: string }

export async function validateKubeconfig(kubeconfig: string): Promise<DeployAuthResult> {
  const trimmed = kubeconfig?.trim()

  if (!trimmed) {
    return { ok: false, reason: 'missing_kubeconfig' }
  }

  const tokenResult = await getOrCreateAiProxyToken(trimmed)

  if (!tokenResult.ok) {
    return { ok: false, reason: tokenResult.reason }
  }

  const gatewayConfig: GatewayConfig = {
    provider: 'aiproxy',
    apiKey: tokenResult.token.key,
    baseUrl: AIPROXY_MODEL_BASE_URL,
    envKey: 'AIPROXY_API_KEY',
  }

  return { ok: true, gatewayConfig }
}
