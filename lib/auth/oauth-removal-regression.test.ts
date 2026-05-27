import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

function readRepoFile(path: string): string {
  return readFileSync(join(repoRoot, path), 'utf8')
}

test('legacy GitHub account refresh updates the selected account row by id', () => {
  const source = readRepoFile('lib/db/users.ts')

  assert.match(source, /select\(\{\s*id: accounts\.id,\s*userId: accounts\.userId,?\s*\}\)/)
  assert.match(source, /\.where\(eq\(accounts\.id, existingAccount\[0\]\.id\)\)/)
  assert.doesNotMatch(
    source,
    /update\(accounts\)[\s\S]*?\.where\(and\(eq\(accounts\.provider, 'github'\), eq\(accounts\.externalUserId, externalId\)\)\)/,
  )
})
