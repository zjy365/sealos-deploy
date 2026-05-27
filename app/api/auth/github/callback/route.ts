import { type NextRequest } from 'next/server'
import { cookies } from 'next/headers'
import { getAppBaseUrl, getGitHubClientId } from '@/lib/auth/oauth'
import { createGitHubSession, saveSession } from '@/lib/session/create-github'
import { getAuthCookiePolicyFromRequest } from '@/lib/auth/cookie-policy'
import {
  GITHUB_AUTH_BROADCAST_CHANNEL,
  GITHUB_AUTH_ERROR_MESSAGE_TYPE,
  GITHUB_AUTH_POPUP_COOKIE,
  GITHUB_AUTH_POPUP_VALUE,
  GITHUB_AUTH_SUCCESS_MESSAGE_TYPE,
} from '@/lib/auth/github-popup-contract'

const GITHUB_AUTH_COOKIES = [
  GITHUB_AUTH_POPUP_COOKIE,
  'github_auth_state',
  'github_auth_redirect_to',
  'github_auth_mode',
  'github_oauth_state',
  'github_oauth_redirect_to',
  'github_oauth_user_id',
] as const

type CookieStore = Awaited<ReturnType<typeof cookies>>
type PopupStatus = 'success' | 'error'

function cleanupGitHubAuthCookies(cookieStore: CookieStore): void {
  for (const cookieName of GITHUB_AUTH_COOKIES) {
    cookieStore.delete(cookieName)
  }
}

function createGitHubPopupResponse(req: NextRequest, status: PopupStatus, responseInit?: ResponseInit): Response {
  const origin = new URL(getAppBaseUrl(req)).origin
  const messageType = status === 'success' ? GITHUB_AUTH_SUCCESS_MESSAGE_TYPE : GITHUB_AUTH_ERROR_MESSAGE_TYPE
  const closeDelayMs = 250
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GitHub Authentication</title>
  </head>
  <body>
    <script>
      const githubAuthMessage = { type: ${JSON.stringify(messageType)}, status: ${JSON.stringify(status)} };
      const githubAuthOrigin = ${JSON.stringify(origin)};

      function postGitHubAuthMessage(target) {
        try {
          target?.postMessage(githubAuthMessage, githubAuthOrigin);
        } catch {}
      }

      postGitHubAuthMessage(window.opener);

      try {
        if (window.opener?.frames) {
          for (let index = 0; index < window.opener.frames.length; index += 1) {
            postGitHubAuthMessage(window.opener.frames[index]);
          }
        }
      } catch {}

      try {
        const channel = new BroadcastChannel(${JSON.stringify(GITHUB_AUTH_BROADCAST_CHANNEL)});
        channel.postMessage(githubAuthMessage);
        channel.close();
      } catch {}

      window.setTimeout(() => window.close(), ${closeDelayMs});
    </script>
  </body>
</html>`

  return new Response(html, {
    status: responseInit?.status ?? 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      ...responseInit?.headers,
    },
  })
}

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const cookieStore = await cookies()
  const authCookiePolicy = getAuthCookiePolicyFromRequest(req)

  const popupCookie = cookieStore.get(GITHUB_AUTH_POPUP_COOKIE)?.value ?? null
  if (popupCookie !== GITHUB_AUTH_POPUP_VALUE) {
    cleanupGitHubAuthCookies(cookieStore)
    return createGitHubPopupResponse(req, 'error', { status: 400 })
  }

  const authMode = cookieStore.get('github_auth_mode')?.value ?? null
  const storedState = cookieStore.get('github_auth_state')?.value ?? null
  const storedRedirectTo = cookieStore.get('github_auth_redirect_to')?.value ?? null

  if (code === null || state === null || storedState !== state || storedRedirectTo === null) {
    cleanupGitHubAuthCookies(cookieStore)
    return createGitHubPopupResponse(req, 'error', { status: 400 })
  }

  if (authMode !== 'signin') {
    cleanupGitHubAuthCookies(cookieStore)
    return createGitHubPopupResponse(req, 'error', { status: 400 })
  }

  const clientId = getGitHubClientId()
  const clientSecret = process.env.GITHUB_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    cleanupGitHubAuthCookies(cookieStore)
    return createGitHubPopupResponse(req, 'error', { status: 500 })
  }

  try {
    console.info('GitHub OAuth callback started')

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
      }),
    })

    if (!tokenResponse.ok) {
      console.error('GitHub OAuth token exchange failed')
      cleanupGitHubAuthCookies(cookieStore)
      return createGitHubPopupResponse(req, 'error', { status: 400 })
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token?: string
      scope?: string
      token_type?: string
      error?: string
      error_description?: string
    }

    if (!tokenData.access_token) {
      console.error('GitHub OAuth access token missing')
      cleanupGitHubAuthCookies(cookieStore)
      return createGitHubPopupResponse(req, 'error', { status: 400 })
    }

    const session = await createGitHubSession(tokenData.access_token, tokenData.scope)

    if (!session) {
      console.error('GitHub OAuth session creation failed')
      cleanupGitHubAuthCookies(cookieStore)
      return createGitHubPopupResponse(req, 'error', { status: 500 })
    }

    const response = createGitHubPopupResponse(req, 'success')
    await saveSession(response, session, authCookiePolicy)
    cleanupGitHubAuthCookies(cookieStore)

    return response
  } catch {
    console.error('GitHub OAuth callback failed')
    cleanupGitHubAuthCookies(cookieStore)
    return createGitHubPopupResponse(req, 'error', { status: 500 })
  }
}
