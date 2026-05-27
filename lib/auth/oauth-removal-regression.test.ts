import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Session } from '@/lib/session/types'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

test('legacy Vercel session cookies are rejected', async () => {
  const previousSecret = process.env.JWE_SECRET
  process.env.JWE_SECRET = Buffer.from('0123456789abcdef0123456789abcdef').toString('base64url')

  try {
    const { encryptJWE } = await import('@/lib/jwe/encrypt')
    const { getSessionFromCookie } = await import('@/lib/session/server')
    const legacySession = {
      created: Date.now(),
      authProvider: 'vercel',
      user: {
        id: 'legacy-user',
        username: 'legacy',
        email: undefined,
        avatar: 'https://example.com/avatar.png',
      },
    } as unknown as Session

    const cookieValue = await encryptJWE(legacySession, '1h')

    assert.equal(await getSessionFromCookie(cookieValue), undefined)
  } finally {
    if (previousSecret === undefined) {
      delete process.env.JWE_SECRET
    } else {
      process.env.JWE_SECRET = previousSecret
    }
  }
})

test('legacy GitHub account refresh updates the selected account row by id', () => {
  const source = readRepoFile('lib/db/users.ts')

  assert.match(source, /select\(\{\s*id: accounts\.id,\s*userId: accounts\.userId,?\s*\}\)/)
  assert.match(source, /\.where\(eq\(accounts\.id, existingAccount\[0\]\.id\)\)/)
  assert.doesNotMatch(
    source,
    /update\(accounts\)[\s\S]*?\.where\(and\(eq\(accounts\.provider, 'github'\), eq\(accounts\.externalUserId, externalId\)\)\)/,
  )
})
