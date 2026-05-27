import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

test('auth cookie policy uses iframe-compatible production attributes', async () => {
  const policy = await import('./cookie-policy').catch(() => null)

  assert.ok(policy, 'cookie policy helper should exist')
  assert.equal(policy.getAuthCookieSameSite('production'), 'none')
  assert.equal(policy.getAuthCookieSecure('production'), true)
  assert.equal(policy.getAuthCookieSameSite('development'), 'lax')
})

test('auth cookie policy supports HTTPS iframe development hosts', async () => {
  const policy = await import('./cookie-policy')

  assert.equal(policy.getAuthCookieSameSite({ isHttps: true, nodeEnv: 'development' }), 'none')
  assert.equal(policy.getAuthCookieSecure({ isHttps: true, nodeEnv: 'development' }), true)
  assert.equal(policy.getAuthCookieSameSiteHeader({ isHttps: true, nodeEnv: 'development' }), 'None')
})

test('auth cookie policy supports localhost iframe development hosts', async () => {
  const policy = await import('./cookie-policy')
  const requestPolicy = policy.getAuthCookiePolicyFromRequest({
    headers: {
      get(name: string) {
        return name === 'host' ? 'localhost:3000' : null
      },
    },
    nextUrl: {
      hostname: 'localhost',
      protocol: 'http:',
    },
  })

  assert.equal(policy.getAuthCookieSameSite(requestPolicy), 'none')
  assert.equal(policy.getAuthCookieSecure(requestPolicy), true)
  assert.equal(policy.getAuthCookieSameSiteHeader(requestPolicy), 'None')
})

test('public GitHub sign-in route preserves sign-in intent inside iframes', () => {
  const source = readRepoFile('app/api/auth/signin/github/route.ts')

  assert.doesNotMatch(source, /getSessionFromReq/)
  assert.match(source, /\['github_auth_mode', 'signin'\]/)
  assert.doesNotMatch(source, /authMode = isSignInFlow \? 'signin' : 'connect'/)
})

test('GitHub callback notifies embedded opener frames before closing popup', () => {
  const source = readRepoFile('app/api/auth/github/callback/route.ts')

  assert.match(source, /postGitHubAuthMessage\(window\.opener\)/)
  assert.match(source, /postGitHubAuthMessage\(window\.opener\.frames\[index\]\)/)
  assert.match(source, /window\.setTimeout\(\(\) => window\.close\(\),/)
})

test('GitHub popup verifies auth state if the iframe misses the callback message', () => {
  const source = readRepoFile('lib/auth/github-popup.ts')

  assert.match(source, /fetch\('\/api\/auth\/info'/)
  assert.match(source, /completeFromAuthStateOrError\('popup_closed'\)/)
  assert.doesNotMatch(source, /if \(popup\.closed\) {\s*complete\('popup_closed'\)/)
})
