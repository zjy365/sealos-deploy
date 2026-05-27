export type AuthCookieSameSite = 'lax' | 'none'

interface AuthCookiePolicyOptions {
  isHttps?: boolean
  isLocalhost?: boolean
  nodeEnv?: string
}

interface AuthCookieRequest {
  headers: {
    get(name: string): string | null
  }
  nextUrl: {
    hostname?: string
    protocol: string
  }
}

export type AuthCookiePolicyInput = AuthCookiePolicyOptions | string | undefined

function normalizeAuthCookiePolicyInput(input?: AuthCookiePolicyInput): Required<AuthCookiePolicyOptions> {
  if (typeof input === 'string') {
    return {
      isHttps: false,
      isLocalhost: false,
      nodeEnv: input,
    }
  }

  return {
    isHttps: input?.isHttps ?? false,
    isLocalhost: input?.isLocalhost ?? false,
    nodeEnv: input?.nodeEnv ?? process.env.NODE_ENV,
  }
}

function getHostnameWithoutPort(host: string): string {
  const normalizedHost = host.trim().toLowerCase()

  if (normalizedHost.startsWith('[')) {
    return normalizedHost.slice(1, normalizedHost.indexOf(']'))
  }

  if (normalizedHost === '::1') {
    return normalizedHost
  }

  return normalizedHost.split(':')[0] ?? ''
}

function isLocalhost(hostname: string | undefined): boolean {
  if (!hostname) {
    return false
  }

  const host = getHostnameWithoutPort(hostname)
  return host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost')
}

export function getAuthCookiePolicyFromRequest(req: AuthCookieRequest): AuthCookiePolicyOptions {
  const forwardedProto = req.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase()
  const isHttps = forwardedProto ? forwardedProto === 'https' : req.nextUrl.protocol === 'https:'
  const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0]?.trim().toLowerCase()
  const requestHost = req.headers.get('host')?.split(',')[0]?.trim().toLowerCase()

  return {
    isHttps,
    isLocalhost: isLocalhost(forwardedHost) || isLocalhost(requestHost) || isLocalhost(req.nextUrl.hostname),
  }
}

export function getAuthCookieSecure(input?: AuthCookiePolicyInput): boolean {
  const options = normalizeAuthCookiePolicyInput(input)
  return options.nodeEnv === 'production' || options.isHttps || options.isLocalhost
}

export function getAuthCookieSameSite(input?: AuthCookiePolicyInput): AuthCookieSameSite {
  return getAuthCookieSecure(input) ? 'none' : 'lax'
}

export function getAuthCookieSameSiteHeader(input?: AuthCookiePolicyInput): 'Lax' | 'None' {
  return getAuthCookieSameSite(input) === 'none' ? 'None' : 'Lax'
}

export function getAuthCookieHeaderAttributes(input?: AuthCookiePolicyInput): string {
  const secure = getAuthCookieSecure(input) ? 'Secure; ' : ''
  return `${secure}SameSite=${getAuthCookieSameSiteHeader(input)}`
}
