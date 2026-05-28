import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildFindWorkspaceCommand } from './workspace'

test('workspace discovery checks the devbox workspace path before falling back to home', () => {
  const command = buildFindWorkspaceCommand()

  assert.match(command, /\/home\/devbox\/workspace/)
  assert.ok(
    command.indexOf('/home/devbox/workspace') < command.indexOf('workspace_dir="$home_dir"'),
    'devbox workspace should be checked before falling back to $HOME',
  )
})
