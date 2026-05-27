import 'server-only'

import { db } from '@/lib/db/client'
import { keys } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getServerSession } from '@/lib/session/get-server-session'
import { decrypt } from '@/lib/crypto'
import { AIPROXY_MODEL_BASE_URL } from '@/lib/aiproxy/constants'

export type Provider = 'openai' | 'gemini' | 'cursor' | 'anthropic' | 'aigateway' | 'aiproxy'
export type GatewayProvider = 'aigateway' | 'aiproxy'

export const GATEWAY_BASE_URLS: Record<GatewayProvider, string> = {
  aigateway: 'https://ai-gateway.vercel.sh',
  aiproxy: AIPROXY_MODEL_BASE_URL,
}

export const GATEWAY_ENV_KEYS: Record<GatewayProvider, 'AI_GATEWAY_API_KEY' | 'AIPROXY_API_KEY'> = {
  aigateway: 'AI_GATEWAY_API_KEY',
  aiproxy: 'AIPROXY_API_KEY',
}

export interface GatewayConfig {
  provider: GatewayProvider
  apiKey: string
  baseUrl: string
  envKey: 'AI_GATEWAY_API_KEY' | 'AIPROXY_API_KEY'
}

export function resolveGatewayFromApiKeys(apiKeys?: {
  AI_GATEWAY_API_KEY?: string
  AIPROXY_API_KEY?: string
  AIPROXY_BASE_URL?: string
}) {
  const aiGatewayKey = apiKeys?.AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY
  if (aiGatewayKey) {
    return {
      provider: 'aigateway' as const,
      apiKey: aiGatewayKey,
      baseUrl: GATEWAY_BASE_URLS.aigateway,
      envKey: GATEWAY_ENV_KEYS.aigateway,
    }
  }

  const aiProxyKey = apiKeys?.AIPROXY_API_KEY || process.env.AIPROXY_API_KEY
  if (aiProxyKey) {
    return {
      provider: 'aiproxy' as const,
      apiKey: aiProxyKey,
      baseUrl: apiKeys?.AIPROXY_BASE_URL || process.env.AIPROXY_BASE_URL || GATEWAY_BASE_URLS.aiproxy,
      envKey: GATEWAY_ENV_KEYS.aiproxy,
    }
  }

  return null
}

export function resolveCodexGatewayFromApiKeys(apiKeys?: {
  AI_GATEWAY_API_KEY?: string
  AIPROXY_API_KEY?: string
  AIPROXY_BASE_URL?: string
}): GatewayConfig | null {
  const aiProxyKey = apiKeys?.AIPROXY_API_KEY || process.env.AIPROXY_API_KEY
  if (aiProxyKey) {
    return {
      provider: 'aiproxy',
      apiKey: aiProxyKey,
      baseUrl: apiKeys?.AIPROXY_BASE_URL || process.env.AIPROXY_BASE_URL || GATEWAY_BASE_URLS.aiproxy,
      envKey: GATEWAY_ENV_KEYS.aiproxy,
    }
  }

  const aiGatewayKey = apiKeys?.AI_GATEWAY_API_KEY || process.env.AI_GATEWAY_API_KEY
  if (aiGatewayKey) {
    return {
      provider: 'aigateway',
      apiKey: aiGatewayKey,
      baseUrl: GATEWAY_BASE_URLS.aigateway,
      envKey: GATEWAY_ENV_KEYS.aigateway,
    }
  }

  return null
}

/**
 * Get API keys for the currently authenticated user
 * Returns user's keys if available, otherwise falls back to system env vars
 */
export async function getUserApiKeys(): Promise<{
  OPENAI_API_KEY: string | undefined
  GEMINI_API_KEY: string | undefined
  CURSOR_API_KEY: string | undefined
  ANTHROPIC_API_KEY: string | undefined
  AI_GATEWAY_API_KEY: string | undefined
  AIPROXY_API_KEY: string | undefined
  AIPROXY_BASE_URL: string | undefined
}> {
  const session = await getServerSession()

  // Default to system keys
  const apiKeys = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    CURSOR_API_KEY: process.env.CURSOR_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
    AIPROXY_API_KEY: process.env.AIPROXY_API_KEY,
    AIPROXY_BASE_URL: process.env.AIPROXY_BASE_URL || GATEWAY_BASE_URLS.aiproxy,
  }

  if (!session?.user?.id) {
    return apiKeys
  }

  try {
    const userKeys = await db.select().from(keys).where(eq(keys.userId, session.user.id))

    userKeys.forEach((key) => {
      const decryptedValue = decrypt(key.value)

      switch (key.provider) {
        case 'openai':
          apiKeys.OPENAI_API_KEY = decryptedValue
          break
        case 'gemini':
          apiKeys.GEMINI_API_KEY = decryptedValue
          break
        case 'cursor':
          apiKeys.CURSOR_API_KEY = decryptedValue
          break
        case 'anthropic':
          apiKeys.ANTHROPIC_API_KEY = decryptedValue
          break
        case 'aigateway':
          apiKeys.AI_GATEWAY_API_KEY = decryptedValue
          break
        case 'aiproxy':
          apiKeys.AIPROXY_API_KEY = decryptedValue
          apiKeys.AIPROXY_BASE_URL = key.baseUrl || process.env.AIPROXY_BASE_URL || GATEWAY_BASE_URLS.aiproxy
          break
      }
    })
  } catch (error) {
    console.error('Error fetching user API keys:', error)
    // Fall back to system keys on error
  }

  return apiKeys
}

/**
 * Get a specific API key for a provider
 * Returns user's key if available, otherwise falls back to system env var
 */
export async function getUserApiKey(provider: Provider): Promise<string | undefined> {
  const session = await getServerSession()

  // Default to system key
  const systemKeys = {
    openai: process.env.OPENAI_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
    cursor: process.env.CURSOR_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    aigateway: process.env.AI_GATEWAY_API_KEY,
    aiproxy: process.env.AIPROXY_API_KEY,
  }

  if (!session?.user?.id) {
    return systemKeys[provider]
  }

  try {
    const userKey = await db
      .select({ value: keys.value })
      .from(keys)
      .where(and(eq(keys.userId, session.user.id), eq(keys.provider, provider)))
      .limit(1)

    if (userKey[0]?.value) {
      return decrypt(userKey[0].value)
    }
  } catch (error) {
    console.error('Error fetching user API key:', error)
  }

  return systemKeys[provider]
}

export async function getUserAiProxyConfig(): Promise<{ apiKey?: string; baseUrl?: string }> {
  const session = await getServerSession()

  const fallback = {
    apiKey: process.env.AIPROXY_API_KEY,
    baseUrl: process.env.AIPROXY_BASE_URL || GATEWAY_BASE_URLS.aiproxy,
  }

  if (!session?.user?.id) {
    return fallback
  }

  try {
    const userKey = await db
      .select({ baseUrl: keys.baseUrl, value: keys.value })
      .from(keys)
      .where(and(eq(keys.userId, session.user.id), eq(keys.provider, 'aiproxy')))
      .limit(1)

    if (userKey[0]?.value) {
      return {
        apiKey: decrypt(userKey[0].value),
        baseUrl: userKey[0].baseUrl || process.env.AIPROXY_BASE_URL || GATEWAY_BASE_URLS.aiproxy,
      }
    }
  } catch (error) {
    console.error('Error fetching user AIProxy config:', error)
  }

  return fallback
}
